import { execFileSync, spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createPublicKey, randomUUID, verify, type KeyObject } from "node:crypto";
import { TextDecoder } from "node:util";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { chown, chmod, lstat, mkdir, open, readdir, rename, rm, type FileHandle } from "node:fs/promises";
import {
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  chmodSync,
  chownSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  writeFileSync,
  type Dirent,
  type Stats,
} from "node:fs";
import {
  AFFILIATE_AGENT_MAX_TERMINAL_RESULT_CANONICAL_BYTES,
  canonicalizeAffiliateAgentValue,
} from "../src/server/affiliateImports/agentGatewayContracts";
import {
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS,
} from "../src/server/affiliateImports/agentGateway";
import type {
  AffiliateAgentProcessEvent,
} from "../src/server/affiliateImports/agentGatewayAdapters";
import {
  AFFILIATE_AGENT_INVOCATION_ID_MAX_LENGTH,
  AFFILIATE_AGENT_TERMINAL_IDEMPOTENCY_KEY_MAX_LENGTH,
  AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH,
  AFFILIATE_AGENT_WORKSPACE_ID_MAX_LENGTH,
  type AffiliateAgentRunnerRequest,
  type AffiliateAgentRunnerResponse,
} from "../src/server/affiliateImports/affiliateAgentRunnerProtocol";


const RUNNER_CGROUP_RELATIVE_PATH_ENV =
  "AFFILIATE_AGENT_RUNNER_CGROUP_RELATIVE_PATH";
const RUNNER_CODEX_UID_ENV = "AFFILIATE_AGENT_RUNNER_CHILD_UID";
const RUNNER_CODEX_GID_ENV = "AFFILIATE_AGENT_RUNNER_CHILD_GID";
const RUNNER_SUPERVISOR_UID_ENV = "AFFILIATE_AGENT_UID";
const RUNNER_CGROUP_RELATIVE_PATH = "affiliate-agent-runner";
const RUNNER_CGROUP_MOUNT_PATH = "/sys/fs/cgroup";
const RUNNER_CGROUP_PATH_ENV = RUNNER_CGROUP_RELATIVE_PATH_ENV;
const DEFAULT_SOCKET_PATH = "/workspaces/.runner.sock";
const WORKSPACE_ROOT = "/workspaces";
export const AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS =
  30_000 as const;
export const AFFILIATE_AGENT_RUNNER_RESERVATION_LIFETIME_MILLISECONDS =
  AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS * 6;
export const AFFILIATE_AGENT_RUNNER_MAX_CONNECTIONS = 32 as const;
const AFFILIATE_AGENT_RUNNER_CONNECTION_CLEANUP_TIMEOUT_MILLISECONDS = 30_000;
const MAX_PROTOCOL_LINE_BYTES = 2 * 1024 * 1024;
type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}>;

const createDeferred = <T>(): Deferred<T> => {
  let resolveDeferred!: Deferred<T>["resolve"];
  let rejectDeferred!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolveDeferred = (value?: T | PromiseLike<T>): void => {
      resolvePromise(value as T | PromiseLike<T>);
    };
    rejectDeferred = rejectPromise;
  });
  return {
    promise,
    resolve: resolveDeferred,
    reject: rejectDeferred,
  };
};
const cgroupFilePath = (path: string, file: string): string => join(path, file);

const cgroupProcessIds = (path: string): readonly number[] => (
  readFileSync(cgroupFilePath(path, "cgroup.procs"), "utf8")
    .trim()
    .split(/\s+/)
    .filter((value) => /^\d+$/.test(value))
    .map(Number)
);
type RunnerCgroupMount = Readonly<{
  mountPoint: string;
  root: string;
}>;

const decodeMountInfoPath = (value: string): string => (
  value.replace(/\\([0-7]{3})/g, (_match, octal: string) => (
    String.fromCharCode(Number.parseInt(octal, 8))
  ))
);

const runnerCgroupMountFor = (rootPath: string): RunnerCgroupMount => {
  const root = resolve(rootPath);
  const mounts = readFileSync("/proc/self/mountinfo", "utf8")
    .split("\n")
    .map((line): RunnerCgroupMount | null => {
      const separator = line.indexOf(" - ");
      if (separator < 0) return null;
      const mountFields = line.slice(0, separator).split(" ");
      const filesystemFields = line.slice(separator + 3).split(" ");
      if (
        filesystemFields[0] !== "cgroup2"
        || mountFields.length < 5
      ) return null;
      return {
        root: decodeMountInfoPath(mountFields[3]),
        mountPoint: decodeMountInfoPath(mountFields[4]),
      };
    })
    .filter((entry): entry is RunnerCgroupMount => entry !== null)
    .filter((entry) => {
      const mountPoint = resolve(entry.mountPoint);
      const descendant = relative(mountPoint, root);
      return !descendant.startsWith("..")
        && resolve(mountPoint, descendant) === root;
    })
    .sort((left, right) => right.mountPoint.length - left.mountPoint.length);
  const mount = mounts[0];
  if (mount === undefined) {
    throw new Error(`${RUNNER_CGROUP_PATH_ENV} is not on a cgroup v2 mount.`);
  }
  const realMountPoint = realpathSync(mount.mountPoint);
  let realRoot: string;
  try {
    realRoot = realpathSync(rootPath);
  } catch (error) {
    if (
      !error
      || typeof error !== "object"
      || !("code" in error)
      || error.code !== "ENOENT"
    ) throw error;
    realRoot = realpathSync(dirname(rootPath));
  }
  const realDescendant = relative(realMountPoint, realRoot);
  if (
    realDescendant.startsWith("..")
    || resolve(realMountPoint, realDescendant) !== realRoot
  ) {
    throw new Error(`${RUNNER_CGROUP_PATH_ENV} escapes its cgroup v2 mount.`);
  }
  return mount;
};
const runnerCgroupRelativePath = (): string => {
  const entry = readFileSync("/proc/self/cgroup", "utf8")
    .split("\n")
    .find((line) => line.startsWith("0::"));
  const path = entry?.slice(3);
  if (!path || !path.startsWith("/")) {
    throw new Error("The runner cgroup v2 membership is not visible.");
  }
  return path;
};

const assertPrivateRunnerCgroupNamespace = (): void => {
  const mount = runnerCgroupMountFor(RUNNER_CGROUP_MOUNT_PATH);
  if (mount.root !== "/" || runnerCgroupRelativePath() !== "/") {
    throw new Error("The runner requires a private cgroup v2 namespace rooted at its own cgroup.");
  }
};

const assertCgroupDescendant = (rootPath: string): void => {
  const mount = runnerCgroupMountFor(rootPath);
  const root = resolve(rootPath);
  const mountPoint = resolve(mount.mountPoint);
  const localPath = relative(mountPoint, root);
  const delegatedPath = join(mount.root, localPath);
  const ownPath = runnerCgroupRelativePath();
  const descendant = relative(ownPath, delegatedPath);
  if (
    descendant.startsWith("..")
    || resolve(ownPath, descendant) !== delegatedPath
  ) {
    throw new Error(`${RUNNER_CGROUP_PATH_ENV} must remain beneath the runner cgroup.`);
  }
};

const runnerCgroupPathForRelative = (value: string): string => {
  if (value !== RUNNER_CGROUP_RELATIVE_PATH) {
    throw new Error(
      `${RUNNER_CGROUP_RELATIVE_PATH_ENV} must be ${RUNNER_CGROUP_RELATIVE_PATH}.`,
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(value)) {
    throw new Error(`${RUNNER_CGROUP_RELATIVE_PATH_ENV} must be a relative cgroup path.`);
  }
  const mount = runnerCgroupMountFor(RUNNER_CGROUP_MOUNT_PATH);
  const ownPath = runnerCgroupRelativePath();
  const basePath = mount.root === "/"
    ? ownPath
    : ownPath === "/" ? mount.root : ownPath;
  const delegatedPath = join(basePath, value);
  if (mount.root !== "/" && (
    delegatedPath !== mount.root
    && !delegatedPath.startsWith(`${mount.root}/`)
  )) {
    throw new Error(`${RUNNER_CGROUP_RELATIVE_PATH_ENV} escapes the cgroup mount.`);
  }
  const localPath = mount.root === "/"
    ? delegatedPath
    : delegatedPath.slice(mount.root.length) || "/";
  return join(mount.mountPoint, localPath);
};


const ensureRunnerCgroupRoot = (rootPath: string): Stats => {
  try {
    const existing = lstatSync(rootPath);
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new Error(`${RUNNER_CGROUP_PATH_ENV} must be a cgroup v2 directory.`);
    }
    return existing;
  } catch (error) {
    if (
      !error
      || typeof error !== "object"
      || !("code" in error)
      || error.code !== "ENOENT"
    ) throw error;
    mkdirSync(rootPath, { mode: 0o700 });
    const created = lstatSync(rootPath);
    if (created.isSymbolicLink() || !created.isDirectory()) {
      throw new Error(`${RUNNER_CGROUP_PATH_ENV} must be a cgroup v2 directory.`);
    }
    return created;
  }
};

const assertRunnerCgroupControlOwnership = (rootPath: string): void => {
  const root = lstatSync(rootPath);
  if (root.uid !== 0 || (root.mode & 0o022) !== 0) {
    throw new Error("The runner cgroup controls must be root-owned and not group-writable.");
  }
  for (const file of ["cgroup.procs", "cgroup.kill"] as const) {
    const entry = lstatSync(cgroupFilePath(rootPath, file));
    if (entry.uid !== 0 || (entry.mode & 0o022) !== 0) {
      throw new Error(`The runner cgroup ${file} is writable by the Codex child.`);
    }
  }
};

const assertRunnerCgroupV2 = (rootPath: string): void => {
  if (process.platform !== "linux") {
    throw new Error("The affiliate agent runner requires Linux cgroup v2 containment.");
  }
  if (!rootPath.startsWith("/")) {
    throw new Error(`${RUNNER_CGROUP_PATH_ENV} must be an absolute delegated cgroup path.`);
  }
  assertCgroupDescendant(rootPath);
  ensureRunnerCgroupRoot(rootPath);
  const controllers = readFileSync(
    cgroupFilePath(rootPath, "cgroup.controllers"),
    "utf8",
  ).trim().split(/\s+/);
  const parentControllers = readFileSync(
    cgroupFilePath(dirname(rootPath), "cgroup.controllers"),
    "utf8",
  ).trim().split(/\s+/);
  if (!controllers.includes("pids") && !parentControllers.includes("pids")) {
    throw new Error("The runner cgroup hierarchy must expose the pids controller.");
  }
  for (const file of ["cgroup.procs", "cgroup.kill"] as const) {
    if (!lstatSync(cgroupFilePath(rootPath, file)).isFile()) {
      throw new Error(`The delegated runner cgroup is missing ${file}.`);
    }
  }
  const probePath = cgroupFilePath(rootPath, `.probe-${randomUUID()}`);
  mkdirSync(probePath, { mode: 0o700 });
  assertRunnerCgroupControlOwnership(rootPath);
  try {
    execFileSync(
      "sh",
      [
        "-eu",
        "-c",
        'printf "%s\\n" "$$" > "$1"',
        "affiliate-agent-cgroup-probe",
        cgroupFilePath(probePath, "cgroup.procs"),
      ],
      { stdio: "ignore" },
    );
    writeFileSync(cgroupFilePath(probePath, "cgroup.kill"), "1\n", "utf8");
  } catch {
    throw new Error("The delegated runner cgroup does not permit process membership.");
  } finally {
    rmdirSync(probePath);
  }
};

const cgroupLimitValue = (rootPath: string, file: string): string => {
  let currentPath = rootPath;
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const value = readFileSync(cgroupFilePath(currentPath, file), "utf8").trim();
      if (value && value !== "max") return value;
    } catch {
      // Check the parent cgroup, where container resource limits may live.
    }
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) break;
    currentPath = parentPath;
  }
  return "unavailable";
};

const cgroupLimitEvidence = (rootPath: string): Readonly<Record<string, string>> => {
  const limits = ["cpu.max", "memory.max", "pids.max"];
  return Object.fromEntries(limits.map((file) => [file, cgroupLimitValue(rootPath, file)]));
};

const assertCgroupResourceLimits = (rootPath: string): void => {
  const limits = cgroupLimitEvidence(rootPath);
  if (
    !/^\d+ \d+$/.test(limits["cpu.max"])
    || !/^\d+$/.test(limits["memory.max"])
    || !/^\d+$/.test(limits["pids.max"])
  ) {
    throw new Error("The runner cgroup hierarchy must expose finite CPU, memory, and pids limits.");
  }
};

const waitForCgroupEmptySync = (path: string): boolean => {
  const deadline = Date.now() + AFFILIATE_AGENT_RUNNER_CHILD_EXIT_CONFIRMATION_TIMEOUT_MILLISECONDS;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    if (cgroupProcessIds(path).length === 0) return true;
    Atomics.wait(sleeper, 0, 0, 25);
  }
  return cgroupProcessIds(path).length === 0;
};

const cleanStaleInvocationCgroups = (rootPath: string): readonly string[] => {
  let entries: Dirent[];
  try {
    entries = readdirSync(rootPath, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    throw new Error(`The runner cgroup stale-subtree scan failed: ${String(error)}`);
  }
  const staleInvocationIds: string[] = [];
  for (const entry of entries) {
    if (!/^invocation-[0-9a-f-]+$/.test(entry.name)) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(`The runner cgroup stale entry is not a directory: ${entry.name}`);
    }
    const invocationPath = cgroupFilePath(rootPath, entry.name);
    const invocationEntry = lstatSync(invocationPath);
    if (invocationEntry.isSymbolicLink() || !invocationEntry.isDirectory()) {
      throw new Error(`The runner cgroup stale entry changed type: ${entry.name}`);
    }
    assertRunnerCgroupControlOwnership(invocationPath);
    staleInvocationIds.push(entry.name.slice("invocation-".length));
    writeFileSync(cgroupFilePath(invocationPath, "cgroup.kill"), "1\n", "utf8");
    if (!waitForCgroupEmptySync(invocationPath)) {
      throw new Error(`The runner cgroup stale entry did not empty: ${entry.name}`);
    }
    rmdirSync(invocationPath);
  }
  return staleInvocationIds;
};

const logRunnerCgroupEvidence = (
  rootPath: string,
  childUid: number,
  childGid: number,
  staleInvocationIds: readonly string[],
): void => {
  console.info(JSON.stringify({
    event: "affiliate-agent-runner-cgroup-containment",
    cgroupRoot: resolve(rootPath),
    selfRelativePath: runnerCgroupRelativePath(),
    invocationRoot: resolve(rootPath),
    effectiveLimits: cgroupLimitEvidence(rootPath),
    controlIdentity: {
      uid: typeof process.getuid === "function" ? process.getuid() : null,
      gid: typeof process.getgid === "function" ? process.getgid() : null,
    },
    codexSandbox: "distinct-child-uid",
    codexIdentity: { uid: childUid, gid: childGid },
    controlCapabilities: Object.keys(RUNNER_REQUIRED_CAPABILITIES).sort(),
    staleInvocationIds,
    staleInvocationCleanup: staleInvocationIds.map((id) => ({
      id,
      kill: "requested",
      empty: true,
    })),
    staleInvocationResidualIds: [],
    cleanupStatus: "clean",
  }));
};
const runnerContainmentFor = (
  rootPath: string,
  childUid: number,
  childGid: number,
): RunnerContainment => {
  assertRunnerCgroupV2(rootPath);
  assertCgroupResourceLimits(rootPath);
  const staleInvocationIds = cleanStaleInvocationCgroups(rootPath);
  logRunnerCgroupEvidence(rootPath, childUid, childGid, staleInvocationIds);
  return {
    createInvocationPath: () => {
      const path = cgroupFilePath(rootPath, `invocation-${randomUUID()}`);
      mkdirSync(path, { mode: 0o700 });
      assertRunnerCgroupControlOwnership(path);
      return path;
    },
    kill: (path, signal) => {
      for (const pid of cgroupProcessIds(path)) {
        try {
          process.kill(pid, signal);
        } catch (error) {
          if (
            !error
            || typeof error !== "object"
            || !("code" in error)
            || error.code !== "ESRCH"
          ) throw error;
        }
      }
      if (signal === "SIGKILL") {
        writeFileSync(cgroupFilePath(path, "cgroup.kill"), "1\n", "utf8");
      }
    },
    isEmpty: (path) => cgroupProcessIds(path).length === 0,
    destroy: (path) => {
      try {
        rmdirSync(path);
      } catch (error) {
        if (
          !error
          || typeof error !== "object"
          || !("code" in error)
          || error.code !== "ENOENT"
        ) throw error;
      }
    },
  };
};
const parseRunnerPublicKeys = (value: string): ReadonlyMap<string, KeyObject> => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed === null
      || typeof parsed !== "object"
      || Array.isArray(parsed)
      || Object.getPrototypeOf(parsed) !== Object.prototype
    ) throw new Error("invalid key map");
    const entries = Object.entries(parsed);
    if (entries.length === 0) throw new Error("empty key map");
    return new Map(entries.map(([workerId, encodedKey]) => {
      if (
        !boundedIdentifierFrom(workerId, AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH)
        || typeof encodedKey !== "string"
        || !encodedKey.trim()
      ) throw new Error("invalid key entry");
      return [workerId, parseRunnerPublicKey(encodedKey)] as const;
    }));
  } catch {
    throw new Error(
      "AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS must be a JSON worker-to-base64-SPKI-public-key map.",
    );
  }
};
const parseRunnerPublicKey = (value: string): KeyObject => {
  try {
    return createPublicKey({
      key: Buffer.from(value, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    throw new Error("AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS must contain base64 SPKI public keys.");
  }
};
export const AFFILIATE_AGENT_RUNNER_TERMINAL_SUBMISSION_FRAME_OVERHEAD_BYTES =
  Buffer.byteLength(JSON.stringify({
    kind: "TERMINAL_SUBMISSION",
    idempotencyKey: "\u0000".repeat(200),
    result: null,
  }), "utf8") - Buffer.byteLength("null", "utf8");
export const AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES =
  AFFILIATE_AGENT_MAX_TERMINAL_RESULT_CANONICAL_BYTES
  + AFFILIATE_AGENT_RUNNER_TERMINAL_SUBMISSION_FRAME_OVERHEAD_BYTES
  + 2;
const MAX_CHILD_OUTPUT_BYTES = AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES;
const AFFILIATE_AGENT_RUNNER_REQUEST_TTL_MILLISECONDS =
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS * 1_000;
const AFFILIATE_AGENT_MAX_SEEN_REQUEST_IDS = 1_024;
const CHILD_PATH = "/usr/local/bin:/usr/bin:/bin";
const CHILD_ENVIRONMENT_KEYS = new Set([
  "AFFILIATE_AGENT_GATEWAY_ADDRESS",
  "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX",
  "AFFILIATE_AGENT_CLAIM_TOKEN",
  "AFFILIATE_AGENT_CLAIM_ENVELOPE",
  "AFFILIATE_AGENT_PROMPT",
]);

type RunnerEnvironment = Readonly<Record<string, string>>;
type RunnerContainment = Readonly<{
  createInvocationPath(): string;
  kill(path: string, signal: NodeJS.Signals): void;
  isEmpty(path: string): boolean;
  destroy(path: string): void;
}>;
type ActiveInvocation = Readonly<{
  requestId: string;
  reservationId: string;
  workerId: string;
  prompt: string;
  environment: RunnerEnvironment;
  workspacePath: string;
  socket: Socket;
}> & {
  child: ChildProcess | null;
  containmentPath: string | null;
  childClose: Promise<void> | null;
  childPid: number | null;
  childSessionId: number | null;
  trackedProcessIds: Set<number>;
  processTracker: NodeJS.Timeout | null;
  invocationTimeout: NodeJS.Timeout | null;
  pendingExitReason: "TIMEOUT" | null;
  publishExit: ((reason?: "TIMEOUT") => void) | null;
  childGeneration: number;
  isCorrectionReady: boolean;
};
const clearInvocationTimeoutFor = (active: ActiveInvocation): void => {
  if (active.invocationTimeout === null) return;
  clearTimeout(active.invocationTimeout);
  active.invocationTimeout = null;
};
const clearInvocationProcessTracker = (active: ActiveInvocation): void => {
  if (active.processTracker === null) return;
  clearInterval(active.processTracker);
  active.processTracker = null;
};
type ActiveReservation = Readonly<{
  reservationId: string;
  workerId: string;
  invocationId: string;
  socket: Socket;
}>;

const requiredEnvironment = (name: string, fallback?: string): string => {
  const value = process.env[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const requiredChildId = (name: string): number => {
  const value = Number(requiredEnvironment(name));
  if (!Number.isInteger(value) || value < 1 || value > 65_534) {
    throw new Error(`${name} must be an unprivileged numeric id.`);
  }
  return value;
};
const RUNNER_REQUIRED_CAPABILITIES = {
  CAP_CHOWN: 0,
  CAP_DAC_OVERRIDE: 1,
  CAP_FOWNER: 3,
  CAP_KILL: 5,
  CAP_SETGID: 6,
  CAP_SETUID: 7,
} as const;

const assertRunnerCapabilities = (): void => {
  const status = readFileSync("/proc/self/status", "utf8");
  const capabilityValue = status.match(/^CapEff:\s*([0-9a-fA-F]+)$/m)?.[1];
  if (capabilityValue === undefined) {
    throw new Error("The runner effective capability set is not observable.");
  }
  const effective = BigInt(`0x${capabilityValue}`);
  const required = Object.values(RUNNER_REQUIRED_CAPABILITIES)
    .reduce((mask, bit) => mask | (BigInt(1) << BigInt(bit)), BigInt(0));
  if ((effective & required) !== required || (effective & ~required) !== BigInt(0)) {
    throw new Error("The runner effective capabilities are not the reviewed control set.");
  }
};

const send = (socket: Socket, response: AffiliateAgentRunnerResponse): void => {
  if (socket.destroyed || socket.writableEnded || !socket.writable) return;
  try {
    socket.write(`${JSON.stringify(response)}\n`);
  } catch {
    // The peer may close between the writable check and the write.
  }
};

const requestIdFrom = (value: unknown): string | null => {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  ) {
    return null;
  }
  return value;
};

const boundedIdentifierFrom = (
  value: unknown,
  maximumLength: number,
): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) return null;
  if (normalized.length > maximumLength) return null;
  return normalized;
};

const stringFrom = (value: unknown): string | null => (
  typeof value === "string" && value.trim() ? value : null
);

const workspacePathFrom = (value: unknown): string | null => {
  const path = stringFrom(value);
  if (!path) return null;
  const root = resolve(WORKSPACE_ROOT);
  const resolvedPath = resolve(path);
  const relativePath = relative(root, resolvedPath);
  if (
    !relativePath
    || relativePath === ".."
    || relativePath.startsWith(`..${resolve("/")}`)
  ) {
    return null;
  }
  return resolvedPath;
};

const environmentFrom = (value: unknown): RunnerEnvironment | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([name, item]) => (
    !CHILD_ENVIRONMENT_KEYS.has(name)
    || typeof item !== "string"
    || !item.trim()
  ))) {
    return null;
  }
  return Object.fromEntries(entries) as RunnerEnvironment;
};

const CODEX_ARGUMENTS = [
  "exec",
  "--ephemeral",
  "--skip-git-repo-check",
  "--sandbox",
  "workspace-write",
  "-c",
  "sandbox_workspace_write.network_access=true",
  "-",
] as const;


const childLaunchFor = (
  containmentPath: string | null,
): Readonly<{ command: string; args: readonly string[]; cgroupProcsPath?: string }> => {
  if (containmentPath === null) {
    return { command: "codex", args: CODEX_ARGUMENTS };
  }
  return {
    command: "sh",
    args: [
      "-eu",
      "-c",
      "IFS= read -r _; exec \"$@\"",
      "affiliate-agent-cgroup-wrapper",
      "codex",
      ...CODEX_ARGUMENTS,
    ],
    cgroupProcsPath: cgroupFilePath(containmentPath, "cgroup.procs"),
  };
};

const childEnvironmentFor = (
  environment: RunnerEnvironment,
  modelAddress: string,
  modelCredential: string,
  workspacePath: string,
): NodeJS.ProcessEnv => {
  const safeEnvironment = Object.fromEntries(
    Object.entries(environment).filter(([name]) => (
      name !== RUNNER_CGROUP_PATH_ENV
    )),
  );
  const codexHome = join(workspacePath, ".codex");
  const temporaryDirectory = join(workspacePath, ".tmp");
  return {
    NODE_ENV: "production",
    PATH: CHILD_PATH,
    HOME: codexHome,
    CODEX_HOME: codexHome,
    LANG: "C.UTF-8",
    OPENAI_BASE_URL: modelAddress,
    OPENAI_API_KEY: modelCredential,
    ...safeEnvironment,
    TMPDIR: temporaryDirectory,
    TMP: temporaryDirectory,
    TEMP: temporaryDirectory,
  };
};
const ensureChildCodexHome = (
  workspacePath: string,
  childGid: number,
  supervisorUid: number,
): void => {
  const codexHome = join(workspacePath, ".codex");
  const temporaryDirectory = join(workspacePath, ".tmp");
  mkdirSync(codexHome, { recursive: true, mode: 0o770 });
  const entry = lstatSync(codexHome);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error("The Codex home must be a workspace-owned directory.");
  }
  chmodSync(codexHome, 0o770);
  mkdirSync(temporaryDirectory, { recursive: true, mode: 0o770 });
  const temporaryEntry = lstatSync(temporaryDirectory);
  if (temporaryEntry.isSymbolicLink() || !temporaryEntry.isDirectory()) {
    throw new Error("The child temporary directory must be workspace-owned.");
  }
  chownSync(temporaryDirectory, supervisorUid, childGid);
  chmodSync(temporaryDirectory, 0o770);
};
const invocationDeadlineFor = (
  environment: RunnerEnvironment,
): number | null => {
  try {
    const claim = JSON.parse(environment.AFFILIATE_AGENT_CLAIM_ENVELOPE) as {
      expiresAt?: unknown;
    };
    if (typeof claim.expiresAt !== "string") return null;
    const deadline = Date.parse(claim.expiresAt);
    if (!Number.isFinite(deadline)) return null;
    return Math.min(
      deadline,
      Date.now() + AFFILIATE_AGENT_HARD_DEADLINE_SECONDS * 1_000,
    );
  } catch {
    return null;
  }
};
type TerminalSubmissionOutput = Readonly<{
  kind: "TERMINAL_SUBMISSION";
  idempotencyKey: string;
  result: Record<string, unknown>;
}>;

type TerminalSubmissionRecord = Readonly<Record<string, unknown>> & Readonly<{
  kind: "TERMINAL_SUBMISSION";
  idempotencyKey: string;
  result: Record<string, unknown>;
}>;

const isRecordValue = (
  value: unknown,
): value is Record<string, unknown> => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
);

const terminalSubmissionKeysAreValid = (
  record: Record<string, unknown>,
): boolean => {
  const keys = Object.keys(record);
  return (
    keys.length === 3
    && keys.every((key) => (
      key === "kind" || key === "idempotencyKey" || key === "result"
    ))
  );
};

const terminalSubmissionResultIsValid = (
  value: unknown,
): value is Record<string, unknown> => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
);

const terminalSubmissionRecordIsValid = (
  value: unknown,
): value is TerminalSubmissionRecord => {
  if (!isRecordValue(value)) return false;
  if (!terminalSubmissionKeysAreValid(value)) return false;
  if (value.kind !== "TERMINAL_SUBMISSION") return false;
  if (typeof value.idempotencyKey !== "string") return false;
  if (
    !value.idempotencyKey.trim()
    || value.idempotencyKey.length
      > AFFILIATE_AGENT_TERMINAL_IDEMPOTENCY_KEY_MAX_LENGTH
  ) return false;
  if (!terminalSubmissionResultIsValid(value.result)) return false;
  return true;
};

const terminalSubmissionFrom = (
  output: string,
): TerminalSubmissionOutput | null => {
  try {
    const parsed: unknown = JSON.parse(output.trim());
    if (!terminalSubmissionRecordIsValid(parsed)) return null;
    return {
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: parsed.idempotencyKey,
      result: parsed.result,
    };
  } catch {
    return null;
  }
};
type ChildRuntimeState = {
  active: ActiveInvocation;
  child: ChildProcess;
  containment: RunnerContainment | undefined;
  prompt: string;
  eventRequestId: string;
  startedRequestId: string;
  childClosed: Deferred<void>;
  childGeneration: number;
  decoder: TextDecoder;
  output: string;
  hasOutputOverflow: boolean;
  hasOutputDecodeError: boolean;
  hasPublishedExit: boolean;
  hasPublishedStartFailure: boolean;
  isFinalizing: boolean;
};

const isCurrentChild = (state: ChildRuntimeState): boolean => (
  state.active.child === state.child
  && state.active.childGeneration === state.childGeneration
);

const appendChildOutput = (
  state: ChildRuntimeState,
  text: string,
): void => {
  if (state.hasOutputOverflow || state.hasOutputDecodeError) return;
  const outputBytes = Buffer.byteLength(state.output, "utf8");
  const textBytes = Buffer.byteLength(text, "utf8");
  if (outputBytes + textBytes > MAX_CHILD_OUTPUT_BYTES) {
    state.hasOutputOverflow = true;
    killChildProcess(
      state.child,
      "SIGKILL",
      state.active.childPid,
      state.active.childSessionId,
      state.active.trackedProcessIds,
    );
    return;
  }
  state.output += text;
};

const publishChildExit = (
  state: ChildRuntimeState,
  event: AffiliateAgentProcessEvent,
): void => {
  if (!isCurrentChild(state) || state.hasPublishedExit) return;
  state.hasPublishedExit = true;
  const publishedEvent = event.kind === "EXIT"
    && event.reason === undefined
    && state.active.pendingExitReason !== null
    ? { ...event, reason: state.active.pendingExitReason }
    : event;
  state.active.publishExit = null;
  state.active.pendingExitReason = null;
  state.active.child = null;
  state.active.isCorrectionReady = false;
  send(state.active.socket, {
    kind: "EVENT",
    requestId: state.eventRequestId,
    event: publishedEvent,
  });
};

const finalizeContainedChildExit = async (
  state: ChildRuntimeState,
  event: AffiliateAgentProcessEvent,
): Promise<void> => {
  try {
    const childExited = await waitForContainedExit(
      state.containment,
      state.active,
      state.child,
      state.active.pendingExitReason === "TIMEOUT",
    );
    if (!childExited) {
      state.active.socket.destroy();
      return;
    }
    clearInvocationProcessTracker(state.active);
    state.active.childPid = null;
    state.active.childSessionId = null;
    destroyInvocationContainment(state.containment, state.active);
    publishChildExit(state, event);
  } catch {
    state.active.socket.destroy();
  }
};

const publishContainedChildExit = (
  state: ChildRuntimeState,
  event: AffiliateAgentProcessEvent,
): void => {
  if (
    !isCurrentChild(state)
    || state.hasPublishedExit
    || state.isFinalizing
  ) return;
  state.isFinalizing = true;
  void finalizeContainedChildExit(state, event);
};

const publishChildStartFailure = (
  state: ChildRuntimeState,
  message: string,
): void => {
  if (
    !isCurrentChild(state)
    || state.hasPublishedStartFailure
    || state.hasPublishedExit
  ) return;
  state.hasPublishedStartFailure = true;
  send(state.active.socket, {
    kind: "ERROR",
    requestId: state.startedRequestId,
    message,
  });
  if (state.child.exitCode === null) {
    killChildProcess(
      state.child,
      "SIGKILL",
      state.active.childPid,
      state.active.childSessionId,
      state.active.trackedProcessIds,
    );
    return;
  }
  publishContainedChildExit(state, {
    kind: "EXIT",
    exitCode: state.child.exitCode ?? 1,
  });
};

const handleChildSpawn = (state: ChildRuntimeState): void => {
  if (!isCurrentChild(state)) return;
  try {
    if (!state.child.stdin || state.child.stdin.destroyed) {
      throw new Error("The Codex child stdin is unavailable.");
    }
    state.child.stdin.write(state.prompt);
    state.child.stdin.end();
    send(state.active.socket, { kind: "STARTED", requestId: state.startedRequestId });
  } catch {
    publishChildStartFailure(state, "The Codex child could not receive its prompt.");
  }
};

const handleChildStdout = (
  state: ChildRuntimeState,
  chunk: Buffer | string,
): void => {
  if (
    !isCurrentChild(state)
    || state.hasOutputOverflow
    || state.hasOutputDecodeError
  ) return;
  if (typeof chunk === "string") {
    appendChildOutput(state, chunk);
    return;
  }
  try {
    appendChildOutput(state, state.decoder.decode(chunk, { stream: true }));
  } catch {
    state.hasOutputDecodeError = true;
    killChildProcess(
      state.child,
      "SIGKILL",
      state.active.childPid,
      state.active.childSessionId,
      state.active.trackedProcessIds,
    );
  }
};

const childExitEventFor = (
  exitCode: number | null,
  output: string,
  hasOutputOverflow: boolean,
): AffiliateAgentProcessEvent => {
  if (hasOutputOverflow || exitCode !== 0 || !output.trim()) {
    return { kind: "EXIT", exitCode: exitCode ?? 1 };
  }
  const submission = terminalSubmissionFrom(output);
  if (!submission) return { kind: "EXIT", exitCode: 1 };
  return {
    kind: "TERMINAL_SUBMISSION",
    idempotencyKey: submission.idempotencyKey,
    result: submission.result,
  };
};

const handleChildClose = (
  state: ChildRuntimeState,
  exitCode: number | null,
): void => {
  state.childClosed.resolve();
  if (!isCurrentChild(state)) return;
  if (state.active.pendingExitReason === "TIMEOUT") return;
  if (state.hasPublishedStartFailure || state.hasOutputDecodeError) {
    publishContainedChildExit(state, { kind: "EXIT", exitCode: 1 });
    return;
  }
  try {
    appendChildOutput(state, state.decoder.decode());
  } catch {
    state.hasOutputDecodeError = true;
    publishContainedChildExit(state, { kind: "EXIT", exitCode: 1 });
    return;
  }
  publishContainedChildExit(
    state,
    childExitEventFor(exitCode, state.output, state.hasOutputOverflow),
  );
};

const attachChildListeners = (state: ChildRuntimeState): void => {
  state.child.stdin?.once("error", () => {
    publishChildStartFailure(state, "The Codex child could not receive its prompt.");
  });
  state.child.once("spawn", () => handleChildSpawn(state));
  state.child.once("error", () => {
    publishChildStartFailure(state, "The Codex child could not be started.");
  });
  state.child.stderr?.resume();
  state.child.stdout?.on("data", (chunk: Buffer | string) => {
    handleChildStdout(state, chunk);
  });
  state.child.once("close", (exitCode: number | null) => {
    handleChildClose(state, exitCode);
  });
};

type SpawnedChild = Readonly<{
  child: ChildProcess;
  containmentPath: string | null;
}>;

const releaseChildCgroupGate = (
  launch: Readonly<{ cgroupProcsPath?: string }>,
  child: ChildProcess,
): void => {
  if (launch.cgroupProcsPath === undefined) return;
  if (child.pid === undefined) {
    throw new Error("The Codex child did not expose a pid for cgroup membership.");
  }
  writeFileSync(launch.cgroupProcsPath, `${child.pid}\n`, "utf8");
  if (!child.stdin || child.stdin.destroyed || !child.stdin.write("\n")) {
    throw new Error("The Codex child cgroup gate could not be released.");
  }
};

const childSpawnOptionsFor = (
  active: ActiveInvocation,
  modelAddress: string,
  modelCredential: string,
  childUid: number | undefined,
  childGid: number | undefined,
): SpawnOptions => ({
  cwd: active.workspacePath,
  env: childEnvironmentFor(
    active.environment,
    modelAddress,
    modelCredential,
    active.workspacePath,
  ),
  detached: process.platform !== "win32",
  ...(childUid === undefined ? {} : { uid: childUid }),
  ...(childGid === undefined ? {} : { gid: childGid }),
});

const cleanupFailedChildSpawn = (
  active: ActiveInvocation,
  child: ChildProcess | null,
  containment: RunnerContainment | undefined,
  containmentPath: string | null,
): void => {
  if (child !== null && child.pid !== undefined) child.kill("SIGKILL");
  if (containmentPath !== null) containment?.destroy(containmentPath);
  active.containmentPath = null;
};

const spawnChildProcess = (
  active: ActiveInvocation,
  modelAddress: string,
  modelCredential: string,
  spawnProcess: typeof spawn,
  containment: RunnerContainment | undefined,
  childUid: number | undefined,
  childGid: number | undefined,
  supervisorUid: number | undefined,
): SpawnedChild => {
  const containmentPath = containment?.createInvocationPath() ?? null;
  active.containmentPath = containmentPath;
  const launch = childLaunchFor(containmentPath);
  let child: ChildProcess | null = null;
  try {
    if (containment !== undefined) {
      ensureChildCodexHome(active.workspacePath, childGid!, supervisorUid!);
    }
    child = spawnProcess(
      launch.command,
      launch.args,
      childSpawnOptionsFor(
        active,
        modelAddress,
        modelCredential,
        childUid,
        childGid,
      ),
    );
    releaseChildCgroupGate(launch, child);
  } catch (error) {
    cleanupFailedChildSpawn(active, child, containment, containmentPath);
    throw error;
  }
  if (child === null) throw new Error("The Codex child was not created.");
  return { child, containmentPath };
};

const spawnChild = (
  active: ActiveInvocation,
  prompt: string,
  eventRequestId: string,
  modelAddress: string,
  modelCredential: string,
  spawnProcess: typeof spawn = spawn,
  startedRequestId = eventRequestId,
  containment?: RunnerContainment,
  childUid?: number,
  childGid?: number,
  supervisorUid?: number,
): void => {
  if (active.child !== null) {
    throw new Error("The affiliate agent runner already owns a Codex child.");
  }
  if (
    containment !== undefined
    && (childUid === undefined || childGid === undefined || supervisorUid === undefined)
  ) {
    throw new Error("The child and supervisor identities are required for cgroup containment.");
  }
  const childGeneration = active.childGeneration + 1;
  active.childGeneration = childGeneration;
  const childClosed = createDeferred<void>();
  active.childClose = childClosed.promise;
  const { child, containmentPath } = spawnChildProcess(
    active,
    modelAddress,
    modelCredential,
    spawnProcess,
    containment,
    childUid,
    childGid,
    supervisorUid,
  );
  active.child = child;
  active.childPid = child.pid ?? null;
  active.childSessionId = processSessionIdFor(active.childPid);
  active.trackedProcessIds.clear();
  active.processTracker = null;
  trackInvocationProcesses(active);
  const processTracker = setInterval(
    () => trackInvocationProcesses(active),
    100,
  );
  processTracker.unref?.();
  active.processTracker = processTracker;
  active.invocationTimeout = null;
  active.pendingExitReason = null;
  active.publishExit = null;
  const state: ChildRuntimeState = {
    active,
    child,
    containment,
    prompt,
    eventRequestId,
    startedRequestId,
    childClosed,
    childGeneration,
    decoder: new TextDecoder("utf-8", { fatal: true }),
    output: "",
    hasOutputOverflow: false,
    hasOutputDecodeError: false,
    hasPublishedExit: false,
    hasPublishedStartFailure: false,
    isFinalizing: false,
  };
  active.publishExit = (reason) => publishContainedChildExit(state, {
    kind: "EXIT",
    exitCode: 1,
    ...(reason === "TIMEOUT" ? { reason } : {}),
  });
  attachChildListeners(state);
};

type ParsedRequestMetadata = Readonly<{
  requestId: string;
  signature: string;
}>;

const parseRequestRecord = (line: string): Record<string, unknown> | null => {
  if (Buffer.byteLength(line, "utf8") > MAX_PROTOCOL_LINE_BYTES) return null;
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
};

const requestMetadataFrom = (
  record: Record<string, unknown>,
): ParsedRequestMetadata | null => {
  const requestId = requestIdFrom(record.requestId);
  const signature = stringFrom(record.signature);
  if (!requestId || !signature || typeof record.kind !== "string") return null;
  return { requestId, signature };
};

type LaunchRequestFields = Readonly<{
  reservationId: string;
  prompt: string;
  workerId: string;
  invocationId: string;
  workspaceId: string;
  workspaceMode: "READ_ONLY" | "READ_WRITE";
  environment: RunnerEnvironment;
  workspacePath: string;
}>;

const launchRequestFieldsFrom = (
  record: Record<string, unknown>,
): LaunchRequestFields | null => {
  const reservationId = requestIdFrom(record.reservationId);
  const prompt = stringFrom(record.prompt);
  const workerId = boundedIdentifierFrom(
    record.workerId,
    AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH,
  );
  const invocationId = boundedIdentifierFrom(
    record.invocationId,
    AFFILIATE_AGENT_INVOCATION_ID_MAX_LENGTH,
  );
  const workspaceId = boundedIdentifierFrom(
    record.workspaceId,
    AFFILIATE_AGENT_WORKSPACE_ID_MAX_LENGTH,
  );
  const workspaceMode = record.workspaceMode === "READ_ONLY"
    || record.workspaceMode === "READ_WRITE"
    ? record.workspaceMode
    : null;
  const environment = environmentFrom(record.environment);
  const workspacePath = workspacePathFrom(record.workspacePath);
  if (
    [
      reservationId,
      prompt,
      workerId,
      invocationId,
      workspaceId,
      workspaceMode,
      environment,
      workspacePath,
    ].some((value) => value === null)
  ) return null;
  return {
    reservationId,
    prompt,
    workerId,
    invocationId,
    workspaceId,
    workspaceMode,
    environment,
    workspacePath,
  } as LaunchRequestFields;
};

const launchRequestFrom = (
  record: Record<string, unknown>,
  metadata: ParsedRequestMetadata,
): AffiliateAgentRunnerRequest | null => {
  const fields = launchRequestFieldsFrom(record);
  if (fields === null) return null;
  return { kind: "LAUNCH", ...metadata, ...fields };
};

const hasExactKeys = (
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean => {
  const actualKeys = Object.keys(record);
  return (
    actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  );
};

const reserveRequestFrom = (
  record: Record<string, unknown>,
  metadata: ParsedRequestMetadata,
): AffiliateAgentRunnerRequest | null => {
  if (!hasExactKeys(record, [
    "kind",
    "requestId",
    "signature",
    "workerId",
    "invocationId",
  ])) return null;
  const workerId = boundedIdentifierFrom(
    record.workerId,
    AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH,
  );
  const invocationId = boundedIdentifierFrom(
    record.invocationId,
    AFFILIATE_AGENT_INVOCATION_ID_MAX_LENGTH,
  );
  if (!workerId || !invocationId) return null;
  return { kind: "RESERVE", ...metadata, workerId, invocationId };
};

const releaseRequestFrom = (
  record: Record<string, unknown>,
  metadata: ParsedRequestMetadata,
): AffiliateAgentRunnerRequest | null => {
  if (!hasExactKeys(record, [
    "kind",
    "requestId",
    "signature",
    "reservationId",
  ])) return null;
  const reservationId = requestIdFrom(record.reservationId);
  return reservationId
    ? { kind: "RELEASE", ...metadata, reservationId }
    : null;
};

const launchRequestWithExactKeysFrom = (
  record: Record<string, unknown>,
  metadata: ParsedRequestMetadata,
): AffiliateAgentRunnerRequest | null => {
  if (!hasExactKeys(record, [
    "kind",
    "requestId",
    "signature",
    "reservationId",
    "workerId",
    "invocationId",
    "workspaceId",
    "workspaceMode",
    "prompt",
    "environment",
    "workspacePath",
  ])) return null;
  return launchRequestFrom(record, metadata);
};

const correctionRequestFrom = (
  record: Record<string, unknown>,
  metadata: ParsedRequestMetadata,
): AffiliateAgentRunnerRequest | null => {
  if (!hasExactKeys(record, [
    "kind",
    "requestId",
    "signature",
    "correctionPrompt",
  ])) return null;
  const correctionPrompt = stringFrom(record.correctionPrompt);
  return correctionPrompt
    ? { kind: "CORRECTION", ...metadata, correctionPrompt }
    : null;
};

const terminationRequestFrom = (
  record: Record<string, unknown>,
  metadata: ParsedRequestMetadata,
): AffiliateAgentRunnerRequest | null => {
  if (!hasExactKeys(record, ["kind", "requestId", "signature"])) return null;
  if (record.kind !== "TERMINATE" && record.kind !== "FORCE_TERMINATE") {
    return null;
  }
  return { kind: record.kind, ...metadata };
};

const requestFromRecord = (
  record: Record<string, unknown>,
): AffiliateAgentRunnerRequest | null => {
  const metadata = requestMetadataFrom(record);
  if (!metadata) return null;
  switch (record.kind) {
    case "RESERVE":
      return reserveRequestFrom(record, metadata);
    case "RELEASE":
      return releaseRequestFrom(record, metadata);
    case "LAUNCH":
      return launchRequestWithExactKeysFrom(record, metadata);
    case "CORRECTION":
      return correctionRequestFrom(record, metadata);
    case "TERMINATE":
    case "FORCE_TERMINATE":
      return terminationRequestFrom(record, metadata);
    default:
      return null;
  }
};

const parseRequest = (line: string): AffiliateAgentRunnerRequest | null => {
  const record = parseRequestRecord(line);
  return record ? requestFromRecord(record) : null;
};
const launchWorkspaceIsBound = (
  request: Extract<AffiliateAgentRunnerRequest, { kind: "LAUNCH" }>,
): boolean => {
  try {
    const claim = JSON.parse(request.environment.AFFILIATE_AGENT_CLAIM_ENVELOPE) as Record<string, unknown>;
    if (invocationDeadlineFor(request.environment) === null) return false;
    const expectedMode = claim.role === "SUPPLY_REVIEWER" ? "READ_ONLY" : "READ_WRITE";
    const workspacePath = resolve(request.workspacePath);
    const workspaceRoot = resolve(WORKSPACE_ROOT);
    return (
      dirname(workspacePath) === workspaceRoot
      && claim.workerId === request.workerId
      && claim.invocationId === request.invocationId
      && claim.workspaceId === request.workspaceId
      && request.workspaceMode === expectedMode
      && basename(workspacePath).startsWith(`${request.workspaceId}-`)
    );
  } catch {
    return false;
  }
};
const runnerRequestIsAuthenticated = (
  request: AffiliateAgentRunnerRequest,
  publicKey: KeyObject | null,
): boolean => {
  if (publicKey === null) return false;
  const { signature, ...unsignedRequest } = request;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  try {
    return verify(
      null,
      Buffer.from(canonicalizeAffiliateAgentValue(unsignedRequest), "utf8"),
      publicKey,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
};

type RunnerProcessRecord = Readonly<{
  pid: number;
  parentPid: number;
  sessionId: number;
}>;

const runnerProcessRecords = (): readonly RunnerProcessRecord[] => {
  try {
    const output = execFileSync(
      "ps",
      ["-axo", "pid=,ppid=,pgid=,sess="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output
      .split("\n")
      .map((line): RunnerProcessRecord | null => {
        const fields = line.trim().split(/\s+/).map(Number);
        if (fields.length !== 4 || fields.some((value) => !Number.isInteger(value))) {
          return null;
        }
        return { pid: fields[0], parentPid: fields[1], sessionId: fields[3] };
      })
      .filter((record): record is RunnerProcessRecord => record !== null);
  } catch {
    return [];
  }
};

const processSessionIdFor = (pid: number | null): number | null => {
  if (process.platform === "win32" || pid === null) return null;
  return runnerProcessRecords().find((record) => record.pid === pid)?.sessionId ?? null;
};

const addSessionProcessIds = (
  records: readonly RunnerProcessRecord[],
  sessionId: number | null,
  processIds: Set<number>,
): void => {
  if (sessionId === null) return;
  for (const record of records) {
    if (record.sessionId === sessionId) processIds.add(record.pid);
  }
};

const addDescendantProcessIds = (
  records: readonly RunnerProcessRecord[],
  pending: number[],
  processIds: Set<number>,
): void => {
  while (pending.length > 0) {
    const parentPid = pending.pop();
    if (parentPid === undefined) continue;
    for (const record of records) {
      if (record.parentPid !== parentPid || processIds.has(record.pid)) continue;
      processIds.add(record.pid);
      pending.push(record.pid);
    }
  }
};

const processIdsForCleanup = (
  childPid: number | null,
  childSessionId: number | null,
  trackedProcessIds?: ReadonlySet<number>,
): readonly number[] => {
  if (process.platform === "win32") return [];
  const records = runnerProcessRecords();
  const processIds = new Set<number>();
  trackedProcessIds?.forEach((pid) => processIds.add(pid));
  addSessionProcessIds(records, childSessionId, processIds);
  const pending = childPid === null ? [] : [childPid];
  trackedProcessIds?.forEach((pid) => pending.push(pid));
  addDescendantProcessIds(records, pending, processIds);
  processIds.delete(process.pid);
  return [...processIds].sort((left, right) => right - left);
};
const processIdsStillAlive = (
  childPid: number | null,
  childSessionId: number | null,
  trackedProcessIds?: ReadonlySet<number>,
): readonly number[] => {
  const liveProcessIds = new Set(
    runnerProcessRecords().map((record) => record.pid),
  );
  return processIdsForCleanup(
    childPid,
    childSessionId,
    trackedProcessIds,
  ).filter((pid) => liveProcessIds.has(pid));
};
const killContainedInvocation = (
  containment: RunnerContainment | undefined,
  active: ActiveInvocation,
  signal: NodeJS.Signals,
): void => {
  if (containment === undefined || active.containmentPath === null) return;
  containment.kill(active.containmentPath, signal);
};

const containedInvocationIsEmpty = (
  containment: RunnerContainment | undefined,
  active: ActiveInvocation,
): boolean => (
  containment === undefined
  || active.containmentPath === null
  || containment.isEmpty(active.containmentPath)
);

const destroyInvocationContainment = (
  containment: RunnerContainment | undefined,
  active: ActiveInvocation,
): void => {
  if (containment === undefined || active.containmentPath === null) return;
  containment.destroy(active.containmentPath);
  active.containmentPath = null;
};
const killProcessGroup = (
  childPid: number,
  signal: NodeJS.Signals,
): void => {
  try {
    process.kill(-childPid, signal);
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code !== "ESRCH"
    ) {
      // Continue with the bounded session/tree sweep below.
    }
  }
};

const killProcessTree = (
  childPid: number,
  childSessionId: number | null,
  trackedProcessIds: ReadonlySet<number> | undefined,
  signal: NodeJS.Signals,
): void => {
  for (const pid of processIdsForCleanup(childPid, childSessionId, trackedProcessIds)) {
    try {
      process.kill(pid, signal);
    } catch {
      // Processes can exit between the bounded snapshot and the signal.
    }
  }
};

const killChildProcess = (
  child: ChildProcess | null,
  signal: NodeJS.Signals,
  childPid = child?.pid ?? null,
  childSessionId: number | null = null,
  trackedProcessIds?: ReadonlySet<number>,
): void => {
  if (process.platform === "win32" || childPid === null) {
    child?.kill(signal);
    return;
  }
  killProcessGroup(childPid, signal);
  killProcessTree(childPid, childSessionId, trackedProcessIds, signal);
};
const trackInvocationProcesses = (active: ActiveInvocation): void => {
  if (process.platform === "win32" || active.childPid === null) return;
  active.trackedProcessIds.add(active.childPid);
  for (const pid of processIdsForCleanup(
    active.childPid,
    active.childSessionId,
    active.trackedProcessIds,
  )) {
    active.trackedProcessIds.add(pid);
  }
};

const AFFILIATE_AGENT_RUNNER_CHILD_EXIT_CONFIRMATION_TIMEOUT_MILLISECONDS = 5_000;

const waitForExitConfirmation = async (
  exited: Promise<void>,
  childPid: number | null,
  childSessionId: number | null,
  trackedProcessIds?: ReadonlySet<number>,
): Promise<boolean> => {
  const deadline = Date.now()
    + AFFILIATE_AGENT_RUNNER_CHILD_EXIT_CONFIRMATION_TIMEOUT_MILLISECONDS;
  const timeout = createDeferred<void>();
  const timeoutHandle = setTimeout(
    timeout.resolve,
    AFFILIATE_AGENT_RUNNER_CHILD_EXIT_CONFIRMATION_TIMEOUT_MILLISECONDS,
  );
  let hasExited: boolean;
  try {
    hasExited = await Promise.race([
      exited.then(() => true, () => true),
      timeout.promise.then(() => false),
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }
  if (!hasExited) return false;
  while (processIdsStillAlive(
    childPid,
    childSessionId,
    trackedProcessIds,
  ).length > 0) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, Math.min(100, remaining));
    });
  }
  return true;
};

const exitPromiseFor = (
  child: ChildProcess | null,
  childClose: Promise<void> | null | undefined,
): Promise<void> => {
  if (childClose !== undefined && childClose !== null) return childClose;
  if (child === null) return Promise.resolve();
  const deferred = createDeferred<void>();
  child.once("close", () => deferred.resolve());
  return deferred.promise;
};

const waitForGracefulExit = async (
  child: ChildProcess | null,
  childPid: number | null,
  childSessionId: number | null,
  trackedProcessIds: ReadonlySet<number> | undefined,
  exited: Promise<void>,
): Promise<boolean> => {
  const exitedAfterGracefulSignal = await waitForExitConfirmation(
    exited,
    childPid,
    childSessionId,
    trackedProcessIds,
  );
  if (childPid === null && child?.exitCode !== null) {
    return exitedAfterGracefulSignal;
  }
  killChildProcess(child, "SIGKILL", childPid, childSessionId, trackedProcessIds);
  const exitedAfterKill = await waitForExitConfirmation(
    exited,
    childPid,
    childSessionId,
    trackedProcessIds,
  );
  return exitedAfterGracefulSignal || exitedAfterKill;
};

const childExitAlreadyConfirmed = (
  child: ChildProcess | null,
  childPid: number | null,
  childClose: Promise<void> | null | undefined,
): boolean => (
  child !== null
  && childPid === null
  && child.exitCode !== null
  && childClose === undefined
);

const noChildToWaitFor = (
  child: ChildProcess | null,
  childPid: number | null,
  childClose: Promise<void> | null | undefined,
): boolean => (
  child === null && childPid === null && childClose === undefined
);

const waitForExit = async (
  child: ChildProcess | null,
  isForce: boolean,
  childClose?: Promise<void> | null,
  childPid = child?.pid ?? null,
  childSessionId: number | null = null,
  trackedProcessIds?: ReadonlySet<number>,
): Promise<boolean> => {
  if (childExitAlreadyConfirmed(child, childPid, childClose)) return true;
  if (noChildToWaitFor(child, childPid, childClose)) return true;
  const exited = exitPromiseFor(child, childClose);
  killChildProcess(
    child,
    isForce ? "SIGKILL" : "SIGTERM",
    childPid,
    childSessionId,
    trackedProcessIds,
  );
  if (isForce) {
    return waitForExitConfirmation(
      exited,
      childPid,
      childSessionId,
      trackedProcessIds,
    );
  }
  return waitForGracefulExit(
    child,
    childPid,
    childSessionId,
    trackedProcessIds,
    exited,
  );
};

const waitForContainmentEmpty = async (
  containment: RunnerContainment | undefined,
  active: ActiveInvocation,
): Promise<boolean> => {
  if (containment === undefined || active.containmentPath === null) return true;
  const deadline = Date.now()
    + AFFILIATE_AGENT_RUNNER_CHILD_EXIT_CONFIRMATION_TIMEOUT_MILLISECONDS;
  while (true) {
    if (containment.isEmpty(active.containmentPath)) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, Math.min(100, remaining));
    });
  }
};
const waitForContainedExit = async (
  containment: RunnerContainment | undefined,
  active: ActiveInvocation,
  child: ChildProcess | null,
  isForce: boolean,
): Promise<boolean> => {
  const signal = isForce ? "SIGKILL" : "SIGTERM";
  try {
    killContainedInvocation(containment, active, signal);
    const exited = await waitForExit(
      child,
      isForce,
      active.childClose,
      active.childPid,
      active.childSessionId,
      active.trackedProcessIds,
    );
    if (exited && await waitForContainmentEmpty(containment, active)) return true;
    killContainedInvocation(containment, active, "SIGKILL");
    const forceExited = await waitForExit(
      child,
      true,
      active.childClose,
      active.childPid,
      active.childSessionId,
      active.trackedProcessIds,
    );
    return forceExited && await waitForContainmentEmpty(containment, active);
  } catch {
    return false;
  }
};
type WorkspacePath = string | Buffer;

const workspaceEntryPath = (
  parentPath: WorkspacePath,
  entryName: string | Buffer,
): WorkspacePath => {
  if (typeof parentPath === "string" && typeof entryName === "string") {
    return join(parentPath, entryName);
  }
  const parentBytes = Buffer.isBuffer(parentPath) ? parentPath : Buffer.from(parentPath);
  const entryBytes = Buffer.isBuffer(entryName) ? entryName : Buffer.from(entryName);
  return Buffer.concat([parentBytes, Buffer.from("/"), entryBytes]);
};

type WorkspaceCleanupContext = Readonly<{
  runnerUid: number | null;
  childUid: number | null;
  supervisorUid: number | null;
  noFollowFlag: number;
}>;

const workspaceEntryOwnedBy = (
  context: WorkspaceCleanupContext,
  uid: number,
): boolean => (
  (context.runnerUid !== null && uid === context.runnerUid)
  || (context.childUid !== null && uid === context.childUid)
  || (context.supervisorUid !== null && uid === context.supervisorUid)
);

const workspaceEntriesMatch = (expected: Stats, actual: Stats): boolean => (
  expected.dev === actual.dev
  && expected.ino === actual.ino
  && expected.isDirectory() === actual.isDirectory()
  && expected.isFile() === actual.isFile()
  && expected.isSymbolicLink() === actual.isSymbolicLink()
);

const assertWorkspacePathStable = async (
  path: WorkspacePath,
  handle: FileHandle,
  expected: Stats,
): Promise<void> => {
  const current = await lstat(path);
  const descriptorStats = await handle.stat();
  if (
    !workspaceEntriesMatch(expected, descriptorStats)
    || !workspaceEntriesMatch(expected, current)
  ) {
    throw new Error("The governed workspace changed during cleanup.");
  }
};

const openWorkspaceEntry = async (
  path: WorkspacePath,
  expected: Stats,
  noFollowFlag: number,
): Promise<{ handle: FileHandle; stats: Stats }> => {
  const flags = fsConstants.O_RDONLY
    | noFollowFlag
    | (expected.isDirectory() ? (fsConstants.O_DIRECTORY ?? 0) : 0);
  const handle = await open(path, flags);
  try {
    const stats = await handle.stat();
    if (!workspaceEntriesMatch(expected, stats)) {
      throw new Error("The governed workspace entry changed during cleanup.");
    }
    return { handle, stats };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
};

const workspaceDirectoryEntriesFor = async (
  path: WorkspacePath,
): Promise<Array<Dirent<Buffer>>> => {
  try {
    return await readdir(path, { withFileTypes: true, encoding: "buffer" });
  } catch (error) {
    if (runnerSocketHasErrorCode(error, "ENOENT")) {
      throw new Error("The governed workspace changed during cleanup.");
    }
    throw error;
  }
};

const workspaceEntryStatsFor = async (
  path: WorkspacePath,
): Promise<Stats | null> => {
  try {
    return await lstat(path);
  } catch (error) {
    if (runnerSocketHasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
};

const visitWorkspaceEntry = async (
  context: WorkspaceCleanupContext,
  directoryPath: WorkspacePath,
  directoryHandle: FileHandle,
  directoryStats: Stats,
  entry: Dirent<Buffer>,
): Promise<void> => {
  if (entry.isSymbolicLink()) return;
  await assertWorkspacePathStable(directoryPath, directoryHandle, directoryStats);
  const entryPath = workspaceEntryPath(directoryPath, entry.name);
  const expected = await workspaceEntryStatsFor(entryPath);
  if (
    expected === null
    || expected.isSymbolicLink()
    || (!expected.isDirectory() && !expected.isFile())
  ) return;
  const opened = await openWorkspaceEntry(entryPath, expected, context.noFollowFlag);
  try {
    await assertWorkspacePathStable(directoryPath, directoryHandle, directoryStats);
    if (!workspaceEntryOwnedBy(context, opened.stats.uid)) {
      if (context.runnerUid === 0) {
        throw new Error("The governed workspace has an unexpected owner.");
      }
      return;
    }
    await opened.handle.chmod(opened.stats.isDirectory() ? 0o770 : 0o660);
    if (opened.stats.isDirectory()) {
      await visitWorkspaceDirectory(context, entryPath, opened.handle, opened.stats);
    }
  } finally {
    await opened.handle.close().catch(() => undefined);
  }
};

const visitWorkspaceDirectory = async (
  context: WorkspaceCleanupContext,
  directoryPath: WorkspacePath,
  directoryHandle: FileHandle,
  directoryStats: Stats,
): Promise<void> => {
  await assertWorkspacePathStable(directoryPath, directoryHandle, directoryStats);
  const entries = await workspaceDirectoryEntriesFor(directoryPath);
  await assertWorkspacePathStable(directoryPath, directoryHandle, directoryStats);
  for (const entry of entries) {
    await visitWorkspaceEntry(
      context,
      directoryPath,
      directoryHandle,
      directoryStats,
      entry,
    );
  }
};

const prepareWorkspaceRoot = async (
  context: WorkspaceCleanupContext,
  workspacePath: WorkspacePath,
): Promise<void> => {
  const rootExpected = await workspaceEntryStatsFor(workspacePath);
  if (rootExpected === null) return;
  if (rootExpected.isSymbolicLink() || !rootExpected.isDirectory()) {
    throw new Error("The governed workspace changed type during cleanup.");
  }
  if (context.runnerUid === 0 && !workspaceEntryOwnedBy(context, rootExpected.uid)) {
    throw new Error("The governed workspace has an unexpected owner.");
  }
  const openedRoot = await openWorkspaceEntry(
    workspacePath,
    rootExpected,
    context.noFollowFlag,
  );
  try {
    if (workspaceEntryOwnedBy(context, openedRoot.stats.uid)) {
      await openedRoot.handle.chmod(0o770);
    }
    await visitWorkspaceDirectory(
      context,
      workspacePath,
      openedRoot.handle,
      openedRoot.stats,
    );
  } finally {
    await openedRoot.handle.close().catch(() => undefined);
  }
};

export const prepareWorkspaceForSupervisorCleanup = async (
  workspacePath: WorkspacePath,
  childUid: number | null = null,
  supervisorUid: number | null = null,
): Promise<void> => {
  const runnerUid = typeof process.getuid === "function" ? process.getuid() : null;
  const noFollowFlag = fsConstants.O_NOFOLLOW;
  if (typeof noFollowFlag !== "number") {
    throw new Error("The runner cannot safely clean up without no-follow filesystem support.");
  }
  await prepareWorkspaceRoot(
    { runnerUid, childUid, supervisorUid, noFollowFlag },
    workspacePath,
  );
};
const assertWorkspaceRootForRunner = async (supervisorUid: number): Promise<void> => {
  const entry = await lstat(WORKSPACE_ROOT);
  if (
    entry.isSymbolicLink()
    || !entry.isDirectory()
    || entry.uid !== supervisorUid
    || (entry.mode & 0o022) !== 0
  ) {
    throw new Error("The governed workspace root must be supervisor-owned and not group-writable.");
  }
};
const assertRunnerPrivateTemporaryMounts = (): void => {
  for (const mountPath of ["/tmp", "/dev/shm"]) {
    const entry = lstatSync(mountPath);
    if (
      entry.isSymbolicLink()
      || !entry.isDirectory()
      || entry.uid !== 0
      || (entry.mode & 0o022) !== 0
    ) {
      throw new Error(`${mountPath} must be a root-owned non-writable temporary mount.`);
    }
  }
};
const governedWorkspaceName = (name: string): boolean => (
  /^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9]{6}$/.test(name)
);

const removeStaleWorkspacesBeforeListen = async (
  childUid: number,
  supervisorUid: number,
): Promise<readonly string[]> => {
  const cleanup = async (): Promise<readonly string[]> => {
    const entries = await readdir(WORKSPACE_ROOT, {
      withFileTypes: true,
      encoding: "buffer",
    });
    const staleWorkspaceIds: string[] = [];
    for (const entry of entries) {
      const entryName = entry.name.toString("utf8");
      if (!governedWorkspaceName(entryName)) continue;
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new Error(`The governed workspace entry is not a directory: ${entryName}`);
      }
      const workspacePath = workspaceEntryPath(WORKSPACE_ROOT, entry.name);
      staleWorkspaceIds.push(entryName);
      await prepareWorkspaceForSupervisorCleanup(workspacePath, childUid, supervisorUid);
      await rm(workspacePath, { recursive: true, force: true });
    }
    const residualEntries = await readdir(WORKSPACE_ROOT, {
      withFileTypes: true,
      encoding: "buffer",
    });
    if (residualEntries.some((entry) => governedWorkspaceName(entry.name.toString("utf8")))) {
      throw new Error("The runner workspace sweep left a residual workspace.");
    }
    return staleWorkspaceIds;
  };
  const timeout = new Promise<never>((_, rejectPromise) => {
    const handle = setTimeout(
      () => rejectPromise(new Error("The runner workspace sweep timed out.")),
      AFFILIATE_AGENT_RUNNER_CONNECTION_CLEANUP_TIMEOUT_MILLISECONDS,
    );
    handle.unref?.();
  });
  return Promise.race([cleanup(), timeout]);
};

const cleanupWorkspaceWithinTimeout = async (
  context: RunnerServerContext,
  workspacePath: string,
): Promise<boolean> => {
  if (context.destroyWorkspace === undefined) return true;
  const cleanup = context.destroyWorkspace(workspacePath).then(
    () => true,
    () => false,
  );
  const timeout = createDeferred<boolean>();
  const timeoutHandle = setTimeout(
    () => timeout.resolve(false),
    AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS,
  );
  try {
    return await Promise.race([cleanup, timeout.promise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};
const scheduleInvocationDeadline = (
  active: ActiveInvocation,
  context: RunnerServerContext,
): void => {
  const deadline = invocationDeadlineFor(active.environment);
  if (deadline === null) return;
  const timeout = setTimeout(() => {
    active.invocationTimeout = null;
    active.pendingExitReason = "TIMEOUT";
    void waitForContainedExit(context.containment, active, active.child, true).then(async (childExited) => {
      if (!childExited) {
        context.onFatal?.(
          new Error("The Codex child did not exit before the invocation deadline."),
        );
        active.socket.destroy();
        return;
      }
      if (
        context.destroyWorkspace !== undefined
        && !(await cleanupWorkspaceWithinTimeout(context, active.workspacePath))
      ) {
        context.onFatal?.(
          new Error("The workspace could not be prepared before the invocation deadline."),
        );
        active.socket.destroy();
        return;
      }
      destroyInvocationContainment(context.containment, active);
      active.publishExit?.("TIMEOUT");
    });
  }, Math.max(0, deadline - Date.now()));
  timeout.unref?.();
  active.invocationTimeout = timeout;
};
const throwIfRunnerStartupAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new Error("The affiliate agent runner startup was aborted.");
  }
};

const runnerSocketHasErrorCode = (
  error: unknown,
  code: string,
): boolean => (
  error !== null
  && typeof error === "object"
  && "code" in error
  && error.code === code
);

const existingRunnerSocket = async (
  socketPath: string,
  signal: AbortSignal,
): Promise<Stats | null> => {
  try {
    const entry = await lstat(socketPath);
    throwIfRunnerStartupAborted(signal);
    if (!entry.isSocket()) {
      throw new Error("The affiliate agent runner socket path is not a Unix socket.");
    }
    return entry;
  } catch (error) {
    if (signal.aborted) throw new Error("The affiliate agent runner startup was aborted.");
    if (runnerSocketHasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
};

const runnerSocketIsLive = async (
  socketPath: string,
  signal: AbortSignal,
): Promise<boolean> => new Promise<boolean>((resolvePromise, rejectPromise) => {
  let settled = false;
  const probe = createConnection(socketPath);
  const finish = (value: boolean): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    resolvePromise(value);
  };
  const fail = (error: unknown): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    rejectPromise(error);
  };
  const abort = (): void => {
    probe.destroy();
    fail(new Error("The affiliate agent runner startup was aborted."));
  };
  const timeout = setTimeout(() => {
    probe.destroy();
    finish(true);
  }, 1_000);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    abort();
    return;
  }
  probe.once("connect", () => {
    probe.destroy();
    finish(true);
  });
  probe.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
      finish(false);
      return;
    }
    fail(error);
  });
});

const runnerSocketMatches = (
  currentSocket: Stats,
  expectedSocket: Stats,
): boolean => (
  currentSocket.isSocket()
  && currentSocket.dev === expectedSocket.dev
  && currentSocket.ino === expectedSocket.ino
);

const currentRunnerSocket = async (
  socketPath: string,
  signal?: AbortSignal,
): Promise<Stats | null> => {
  try {
    const currentSocket = await lstat(socketPath);
    if (signal !== undefined) throwIfRunnerStartupAborted(signal);
    return currentSocket;
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("The affiliate agent runner startup was aborted.");
    }
    if (runnerSocketHasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
};

const removeRunnerSocketPath = async (socketPath: string): Promise<void> => {
  try {
    await rm(socketPath);
  } catch (error) {
    if (!runnerSocketHasErrorCode(error, "ENOENT")) throw error;
  }
};

const removeOwnedRunnerSocket = async (
  socketPath: string,
  expectedSocket: Stats,
  signal?: AbortSignal,
): Promise<void> => {
  if (signal !== undefined) throwIfRunnerStartupAborted(signal);
  const currentSocket = await currentRunnerSocket(socketPath, signal);
  if (currentSocket === null) return;
  if (!runnerSocketMatches(currentSocket, expectedSocket)) {
    if (signal === undefined) return;
    throw new Error("The affiliate agent runner socket path changed during startup.");
  }
  const quarantinePath = `${socketPath}.stale-${randomUUID()}`;
  try {
    await rename(socketPath, quarantinePath);
  } catch (error) {
    if (runnerSocketHasErrorCode(error, "ENOENT")) return;
    throw error;
  }
  if (signal !== undefined) throwIfRunnerStartupAborted(signal);
  const movedSocket = await currentRunnerSocket(quarantinePath, signal);
  if (movedSocket === null || !runnerSocketMatches(movedSocket, expectedSocket)) {
    throw new Error("The affiliate agent runner socket path changed during cleanup.");
  }
  await removeRunnerSocketPath(quarantinePath);
};

const prepareRunnerSocket = async (
  socketPath: string,
  signal: AbortSignal,
): Promise<void> => {
  throwIfRunnerStartupAborted(signal);
  await mkdir(dirname(socketPath), { recursive: true });
  throwIfRunnerStartupAborted(signal);
  const staleSocket = await existingRunnerSocket(socketPath, signal);
  if (staleSocket === null) return;
  if (await runnerSocketIsLive(socketPath, signal)) {
    throw new Error("The affiliate agent runner socket is already in use.");
  }
  await removeOwnedRunnerSocket(socketPath, staleSocket, signal);
  throwIfRunnerStartupAborted(signal);
};

export type RunnerServerContext = Readonly<{
  activeInvocations: Set<ActiveInvocation>;
  activeReservations: Set<ActiveReservation>;
  connections: Set<Socket>;
  containment?: RunnerContainment;
  cleanupPromises?: Set<Promise<void>>;
  seenRequestIds: Map<string, number>;
  protocolPublicKeys: ReadonlyMap<string, KeyObject>;
  modelAddress: string;
  modelCredential: string;
  childUid?: number;
  childGid?: number;
  supervisorUid?: number;
  maxConcurrentInvocations: number;
  spawnProcess: typeof spawn;
  destroyWorkspace?: (workspacePath: string) => Promise<void>;
  onFatal?: (error: unknown) => void;
}>;
type RunnerConnectionState = {
  socket: Socket;
  active: ActiveInvocation | null;
  reservation: ActiveReservation | null;
  lineBuffer: string;
  isClosing: boolean;
  preReservationTimeout: NodeJS.Timeout | null;
  reservationTimeout: NodeJS.Timeout | null;
};
const clearPreReservationTimeout = (state: RunnerConnectionState): void => {
  if (state.preReservationTimeout === null) return;
  clearTimeout(state.preReservationTimeout);
  state.preReservationTimeout = null;
};
const clearReservationTimeout = (state: RunnerConnectionState): void => {
  if (state.reservationTimeout === null) return;
  clearTimeout(state.reservationTimeout);
  state.reservationTimeout = null;
};

const expirePreReservation = (state: RunnerConnectionState): void => {
  if (
    state.isClosing
    || state.active !== null
    || state.reservation !== null
  ) return;
  state.socket.destroy();
};
type RunnerRequestReplayDecision = "ACCEPTED" | "REPLAY" | "CAPACITY";

const rememberRunnerRequest = (
  context: RunnerServerContext,
  requestId: string,
  now = Date.now(),
): RunnerRequestReplayDecision => {
  const expiresBefore = now - AFFILIATE_AGENT_RUNNER_REQUEST_TTL_MILLISECONDS;
  for (const [seenRequestId, seenAt] of context.seenRequestIds) {
    if (seenAt <= expiresBefore) context.seenRequestIds.delete(seenRequestId);
  }
  if (context.seenRequestIds.has(requestId)) return "REPLAY";
  if (context.seenRequestIds.size >= AFFILIATE_AGENT_MAX_SEEN_REQUEST_IDS) {
    return "CAPACITY";
  }
  context.seenRequestIds.set(requestId, now);
  return "ACCEPTED";
};

type RunnerRequestValidation =
  | Readonly<{ request: AffiliateAgentRunnerRequest }>
  | Readonly<{ requestId: string; message: string }>;

const protocolPublicKeyForRequest = (
  request: AffiliateAgentRunnerRequest,
  state: RunnerConnectionState,
  protocolPublicKeys: ReadonlyMap<string, KeyObject>,
): KeyObject | null => {
  const workerId = request.kind === "RESERVE" || request.kind === "LAUNCH"
    ? request.workerId
    : state.active?.workerId ?? state.reservation?.workerId;
  return workerId === undefined ? null : protocolPublicKeys.get(workerId) ?? null;
};
const validateRunnerRequest = (
  line: string,
  state: RunnerConnectionState,
  protocolPublicKeys: ReadonlyMap<string, KeyObject>,
): RunnerRequestValidation => {
  const request = parseRequest(line);
  if (!request) {
    return {
      requestId: randomUUID(),
      message: "The affiliate agent runner request is invalid.",
    };
  }
  if (
    !runnerRequestIsAuthenticated(
      request,
      protocolPublicKeyForRequest(request, state, protocolPublicKeys),
    )
  ) {
    return {
      requestId: request.requestId,
      message: "The affiliate agent runner request is not authenticated.",
    };
  }
  if (request.kind === "LAUNCH" && !launchWorkspaceIsBound(request)) {
    return {
      requestId: request.requestId,
      message: "The affiliate agent runner workspace is not bound to the claim.",
    };
  }
  return { request };
};


const handleReserveRequest = (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  request: Extract<AffiliateAgentRunnerRequest, { kind: "RESERVE" }>,
): boolean => {
  if (
    state.isClosing
    || state.active !== null
    || state.reservation !== null
    || context.activeInvocations.size + context.activeReservations.size
      >= context.maxConcurrentInvocations
  ) {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner is busy.",
    });
    if (state.active === null && state.reservation === null) {
      clearPreReservationTimeout(state);
      state.socket.end();
      return false;
    }
    return true;
  }
  const reservation: ActiveReservation = {
    reservationId: randomUUID(),
    workerId: request.workerId,
    invocationId: request.invocationId,
    socket: state.socket,
  };
  state.reservation = reservation;
  context.activeReservations.add(reservation);
  clearPreReservationTimeout(state);
  state.reservationTimeout = setTimeout(() => {
    if (state.reservation !== reservation || state.isClosing) return;
    context.activeReservations.delete(reservation);
    state.reservation = null;
    state.reservationTimeout = null;
    state.socket.destroy();
  }, AFFILIATE_AGENT_RUNNER_RESERVATION_LIFETIME_MILLISECONDS);
  send(state.socket, {
    kind: "RESERVED",
    requestId: request.requestId,
    reservationId: reservation.reservationId,
  });
  return true;
};

const releaseActiveInvocation = async (
  context: RunnerServerContext,
  active: ActiveInvocation,
): Promise<boolean> => {
  try {
    if (active.child !== null) return false;
    if (active.childPid === null && active.containmentPath === null) return true;
    if (!(await waitForContainedExit(context.containment, active, null, true))) return false;
    clearInvocationProcessTracker(active);
    active.childPid = null;
    if (!containedInvocationIsEmpty(context.containment, active)) return false;
    destroyInvocationContainment(context.containment, active);
    return active.childPid === null && active.containmentPath === null;
  } catch {
    return false;
  }
};

const handleReleaseRequest = async (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  request: Extract<AffiliateAgentRunnerRequest, { kind: "RELEASE" }>,
): Promise<boolean> => {
  const active = state.active;
  if (active !== null) {
    if (active.reservationId !== request.reservationId || active.child !== null) {
      send(state.socket, {
        kind: "ERROR",
        requestId: request.requestId,
        message: "The affiliate agent runner reservation is invalid.",
      });
      return true;
    }
    if (!(await releaseActiveInvocation(context, active))) {
      send(state.socket, {
        kind: "ERROR",
        requestId: request.requestId,
        message: "The affiliate agent runner could not confirm invocation cleanup.",
      });
      context.onFatal?.(
        new Error("The affiliate agent runner could not confirm invocation cleanup."),
      );
      state.socket.destroy();
      return false;
    }
    context.activeInvocations.delete(active);
    state.active = null;
    send(state.socket, { kind: "RELEASED", requestId: request.requestId });
    state.socket.end();
    return true;
  }
  const reservation = state.reservation;
  if (reservation === null || reservation.reservationId !== request.reservationId) {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner reservation is invalid.",
    });
    return true;
  }
  context.activeReservations.delete(reservation);
  state.reservation = null;
  clearReservationTimeout(state);
  send(state.socket, { kind: "RELEASED", requestId: request.requestId });
  state.socket.end();
  return true;
};

const handleLaunchRequest = (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  request: Extract<AffiliateAgentRunnerRequest, { kind: "LAUNCH" }>,
): boolean => {
  const reservation = state.reservation;
  if (
    reservation === null
    || reservation.reservationId !== request.reservationId
    || reservation.workerId !== request.workerId
    || reservation.invocationId !== request.invocationId
  ) {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner launch requires a valid reservation.",
    });
    return true;
  }
  const isWorkerActive = [...context.activeInvocations].some((invocation) => (
    invocation.workerId === request.workerId
  ));
  if (
    state.isClosing
    || state.active !== null
    || isWorkerActive
  ) {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner is busy.",
    });
    return true;
  }
  context.activeReservations.delete(reservation);
  state.reservation = null;
  clearReservationTimeout(state);
  const active: ActiveInvocation = {
    ...request,
    socket: state.socket,
    containmentPath: null,
    child: null,
    childClose: null,
    childPid: null,
    childSessionId: null,
    trackedProcessIds: new Set(),
    processTracker: null,
    invocationTimeout: null,
    pendingExitReason: null,
    publishExit: null,
    childGeneration: 0,
    isCorrectionReady: false,
  };
  state.active = active;
  clearPreReservationTimeout(state);
  context.activeInvocations.add(active);
  try {
    spawnChild(
      active,
      request.prompt,
      request.requestId,
      context.modelAddress,
      context.modelCredential,
      context.spawnProcess,
      request.requestId,
      context.containment,
      context.childUid,
      context.childGid,
      context.supervisorUid,
    );
    scheduleInvocationDeadline(active, context);
  } catch {
    clearInvocationTimeoutFor(active);
    clearInvocationProcessTracker(active);
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The Codex child could not be started.",
    });
    // Keep the reservation and no-child invocation bound until the supervisor
    // receives TERMINATED and RELEASED, so cleanup remains authoritative.
  }
  return true;
};
const handleCorrectionRequest = (
  state: RunnerConnectionState,
  _context: RunnerServerContext,
  _active: ActiveInvocation,
  request: Extract<AffiliateAgentRunnerRequest, { kind: "CORRECTION" }>,
): boolean => {
  send(state.socket, {
    kind: "ERROR",
    requestId: request.requestId,
    message: "Schema corrections must be submitted by the Codex child through the gateway.",
  });
  return true;
};

const terminateInvocation = async (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  active: ActiveInvocation,
  request: Extract<
    AffiliateAgentRunnerRequest,
    { kind: "TERMINATE" | "FORCE_TERMINATE" }
  >,
): Promise<void> => {
  clearInvocationTimeoutFor(active);
  const child = active.child;
  if (child !== null || active.childPid !== null) {
    const childExited = await waitForContainedExit(
      context.containment,
      active,
      child,
      request.kind === "FORCE_TERMINATE",
    );
    if (!childExited) {
      throw new Error("The Codex child did not exit before the termination deadline.");
    }
  }
  clearInvocationProcessTracker(active);
  await prepareWorkspaceForSupervisorCleanup(
    active.workspacePath,
    context.childUid ?? null,
    context.supervisorUid ?? null,
  );
  destroyInvocationContainment(context.containment, active);
  active.childPid = null;
  send(state.socket, { kind: "TERMINATED", requestId: request.requestId });
};

const handleRunnerRequest = async (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  request: AffiliateAgentRunnerRequest,
): Promise<boolean> => {
  const replayDecision = rememberRunnerRequest(context, request.requestId);
  if (replayDecision === "REPLAY") {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner request has already been used.",
    });
    state.socket.destroy();
    return false;
  }
  if (replayDecision === "CAPACITY") {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner replay cache is full.",
    });
    state.socket.destroy();
    return false;
  }
  if (request.kind === "RESERVE") {
    return handleReserveRequest(state, context, request);
  }
  if (request.kind === "RELEASE") {
    return handleReleaseRequest(state, context, request);
  }
  if (request.kind === "LAUNCH") {
    return handleLaunchRequest(state, context, request);
  }
  const active = state.active;
  if (!active) {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner has no active invocation.",
    });
    return true;
  }
  if (request.kind === "CORRECTION") {
    return handleCorrectionRequest(state, context, active, request);
  }
  try {
    await terminateInvocation(state, context, active, request);
  } catch {
    send(state.socket, {
      kind: "ERROR",
      requestId: request.requestId,
      message: "The affiliate agent runner could not terminate the Codex child.",
    });
    state.socket.destroy();
    return false;
  }
  return true;
};

const handleRunnerSocketData = async (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  chunk: string | Buffer,
): Promise<void> => {
  if (state.isClosing) return;
  state.lineBuffer += chunk.toString();
  if (Buffer.byteLength(state.lineBuffer, "utf8") > MAX_PROTOCOL_LINE_BYTES) {
    send(state.socket, {
      kind: "ERROR",
      requestId: randomUUID(),
      message: "The affiliate agent runner request exceeds the protocol limit.",
    });
    state.socket.destroy();
    return;
  }
  while (true) {
    const newlineIndex = state.lineBuffer.indexOf("\n");
    if (newlineIndex < 0) break;
    const line = state.lineBuffer.slice(0, newlineIndex);
    state.lineBuffer = state.lineBuffer.slice(newlineIndex + 1);
    if (!line.trim()) continue;
    const validation = validateRunnerRequest(
      line,
      state,
      context.protocolPublicKeys,
    );
    if (!("request" in validation)) {
      send(state.socket, {
        kind: "ERROR",
        requestId: validation.requestId,
        message: validation.message,
      });
      state.socket.destroy();
      return;
    }
    if (!(await handleRunnerRequest(state, context, validation.request))) return;
  }
};
const releaseRunnerReservation = (
  state: RunnerConnectionState,
  context: RunnerServerContext,
): void => {
  const reservation = state.reservation;
  if (reservation === null) return;
  context.activeReservations.delete(reservation);
  state.reservation = null;
};

const reportRunnerCleanupFailure = (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  message: string,
): void => {
  state.socket.destroy();
  context.onFatal?.(new Error(message));
};

const childCleanupSucceeded = async (
  context: RunnerServerContext,
  active: ActiveInvocation,
): Promise<boolean> => {
  if (active.child === null && active.childPid === null) return true;
  return waitForContainedExit(context.containment, active, active.child, true);
};

const workspaceCleanupSucceeded = (
  context: RunnerServerContext,
  active: ActiveInvocation,
): Promise<boolean> => (
  context.destroyWorkspace === undefined
    ? Promise.resolve(true)
    : cleanupWorkspaceWithinTimeout(context, active.workspacePath)
);

const clearActiveInvocation = (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  active: ActiveInvocation,
): void => {
  if (state.active !== active) return;
  context.activeInvocations.delete(active);
  state.active = null;
};

const cleanupActiveRunnerConnection = async (
  state: RunnerConnectionState,
  context: RunnerServerContext,
  active: ActiveInvocation,
): Promise<boolean> => {
  clearInvocationTimeoutFor(active);
  if (!(await childCleanupSucceeded(context, active))) {
    reportRunnerCleanupFailure(
      state,
      context,
      "The Codex child could not be contained after runner disconnect.",
    );
    return false;
  }
  if (!containedInvocationIsEmpty(context.containment, active)) {
    reportRunnerCleanupFailure(
      state,
      context,
      "The Codex invocation containment remained non-empty after runner disconnect.",
    );
    return false;
  }
  if (!(await workspaceCleanupSucceeded(context, active))) {
    reportRunnerCleanupFailure(
      state,
      context,
      "The workspace could not be prepared after runner disconnect.",
    );
    return false;
  }
  destroyInvocationContainment(context.containment, active);
  clearInvocationProcessTracker(active);
  active.childPid = null;
  clearActiveInvocation(state, context, active);
  releaseRunnerReservation(state, context);
  return true;
};

const cleanupRunnerConnection = async (
  state: RunnerConnectionState,
  context: RunnerServerContext,
): Promise<void> => {
  state.isClosing = true;
  clearPreReservationTimeout(state);
  clearReservationTimeout(state);
  const active = state.active;
  if (active === null) {
    releaseRunnerReservation(state, context);
    return;
  }
  await cleanupActiveRunnerConnection(state, context, active);
};

export const configureRunnerConnection = (
  socket: Socket,
  context: RunnerServerContext,
): void => {
  if (context.connections.size >= AFFILIATE_AGENT_RUNNER_MAX_CONNECTIONS) {
    socket.destroy();
    return;
  }
  socket.setEncoding("utf8");
  const state: RunnerConnectionState = {
    socket,
    active: null,
    reservation: null,
    lineBuffer: "",
    isClosing: false,
    preReservationTimeout: null,
    reservationTimeout: null,
  };
  context.connections.add(socket);
  state.preReservationTimeout = setTimeout(
    () => expirePreReservation(state),
    AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS,
  );
  socket.on("data", (chunk: string | Buffer) => {
    void handleRunnerSocketData(state, context, chunk);
  });
  socket.once("close", () => {
    context.connections.delete(socket);
    const cleanup = cleanupRunnerConnection(state, context);
    if (context.cleanupPromises === undefined) {
      void cleanup;
      return;
    }
    void cleanup.then(
      () => context.cleanupPromises?.delete(cleanup),
      (error: unknown) => {
        context.cleanupPromises?.delete(cleanup);
        context.onFatal?.(error);
      },
    );
  });
  socket.on("error", () => undefined);
};


type RunnerStartupConfig = Readonly<{
  socketPath: string;
  protocolPublicKeys: ReadonlyMap<string, KeyObject>;
  modelAddress: string;
  modelCredential: string;
  maxConcurrentInvocations: number;
  childUid: number;
  childGid: number;
  supervisorUid: number;
  cgroupPath: string;
}>;

const runnerStartupConfig = (): RunnerStartupConfig => {
  const socketPath = requiredEnvironment(
    "AFFILIATE_AGENT_RUNNER_SOCKET",
    DEFAULT_SOCKET_PATH,
  );
  const protocolPublicKeys = parseRunnerPublicKeys(
    requiredEnvironment("AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEYS"),
  );
  const modelAddress = requiredEnvironment("AFFILIATE_AGENT_MODEL_ADDRESS");
  const modelCredential = requiredEnvironment("AFFILIATE_AGENT_MODEL_CREDENTIAL");
  const maxConcurrentInvocations = Number(
    process.env.AFFILIATE_AGENT_MAX_CONCURRENT_INVOCATIONS ?? "1",
  );
  if (maxConcurrentInvocations !== 1) {
    throw new Error("AFFILIATE_AGENT_MAX_CONCURRENT_INVOCATIONS must be exactly 1.");
  }
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    throw new Error("The governed runner must execute as the root control identity.");
  }
  assertRunnerCapabilities();
  assertRunnerPrivateTemporaryMounts();
  const childUid = requiredChildId(RUNNER_CODEX_UID_ENV);
  const childGid = requiredChildId(RUNNER_CODEX_GID_ENV);
  const supervisorUid = requiredChildId(RUNNER_SUPERVISOR_UID_ENV);
  if (childUid === supervisorUid) {
    throw new Error("The Codex child identity must differ from the supervisor workspace identity.");
  }
  const cgroupRelativePath = requiredEnvironment(RUNNER_CGROUP_RELATIVE_PATH_ENV);
  assertPrivateRunnerCgroupNamespace();
  return {
    socketPath,
    protocolPublicKeys,
    modelAddress,
    modelCredential,
    maxConcurrentInvocations,
    childUid,
    childGid,
    supervisorUid,
    cgroupPath: runnerCgroupPathForRelative(cgroupRelativePath),
  };
};

const run = async (): Promise<void> => {
  const {
    socketPath,
    protocolPublicKeys,
    modelAddress,
    modelCredential,
    maxConcurrentInvocations,
    childUid,
    childGid,
    supervisorUid,
    cgroupPath,
  } = runnerStartupConfig();
  let containment: RunnerContainment | null = null;

  const activeInvocations = new Set<ActiveInvocation>();
  const activeReservations = new Set<ActiveReservation>();
  const connections = new Set<Socket>();
  const seenRequestIds = new Map<string, number>();
  const cleanupPromises = new Set<Promise<void>>();
  const startupController = new AbortController();
  const shutdown = createDeferred<void>();
  let server: Server | null = null;
  const waitForConnectionCleanups = async (): Promise<void> => {
    const deadline = Date.now()
      + AFFILIATE_AGENT_RUNNER_CONNECTION_CLEANUP_TIMEOUT_MILLISECONDS;
    while (connections.size > 0 || cleanupPromises.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error("Runner connection cleanup did not settle during shutdown.");
      }
      await new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, Math.min(100, remaining));
      });
    }
  };
  let closePromise: Promise<void> | null = null;
  let stopped = false;
  let shutdownCleanupFailed = false;
  const stoppingChildren: Array<Promise<boolean>> = [];
  let ownedSocket: Stats | null = null;
  let context: RunnerServerContext | null = null;
  const closeServer = async (): Promise<void> => {
    if (!server || !server.listening) return;
    closePromise ??= new Promise<void>((resolvePromise) => {
      server?.close(() => resolvePromise());
    });
    await closePromise;
  };
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    for (const socket of connections) socket.destroy();
    startupController.abort();
    for (const reservation of activeReservations) reservation.socket.destroy();
    for (const invocation of activeInvocations) {
      clearInvocationTimeoutFor(invocation);
      const child = invocation.child;
      if (containment === null) {
        stoppingChildren.push(Promise.resolve(true));
      } else {
        stoppingChildren.push(
          waitForContainedExit(containment, invocation, child, false).then((childExited) => {
            if (!childExited) {
              throw new Error("The Codex child did not exit during runner shutdown.");
            }
            clearInvocationProcessTracker(invocation);
            destroyInvocationContainment(containment as RunnerContainment, invocation);
            return childExited;
          }),
        );
      }
      invocation.socket.destroy();
    }
    activeInvocations.clear();
    void closeServer();
    shutdown.resolve();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await prepareRunnerSocket(socketPath, startupController.signal);
    throwIfRunnerStartupAborted(startupController.signal);
    server = createServer((socket) => {
      if (context === null) {
        socket.destroy();
        return;
      }
      configureRunnerConnection(socket, context);
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;
      let errorListener: ((error: Error) => void) | null = null;
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        startupController.signal.removeEventListener("abort", abort);
        if (errorListener !== null) server?.removeListener("error", errorListener);
        if (error) {
          rejectPromise(error);
        } else {
          resolvePromise();
        }
      };
      const abort = (): void => {
        server?.close();
        finish(new Error("The affiliate agent runner startup was aborted."));
      };
      errorListener = (error): void => finish(error);
      startupController.signal.addEventListener("abort", abort, { once: true });
      if (startupController.signal.aborted) {
        abort();
        return;
      }
      server?.once("error", errorListener);
      server?.listen(socketPath, () => {
        void lstat(socketPath)
          .then((entry) => {
            if (!entry.isSocket()) {
              throw new Error("The affiliate agent runner socket path is not a Unix socket.");
            }
            return chown(socketPath, supervisorUid, 0);
          })
          .then(() => chmod(socketPath, 0o600))
          .then(() => lstat(socketPath))
          .then((entry) => {
            if (
              !entry.isSocket()
              || entry.uid !== supervisorUid
              || entry.gid !== 0
              || (entry.mode & 0o777) !== 0o600
            ) {
              throw new Error("The affiliate agent runner socket ownership is invalid.");
            }
            ownedSocket = entry;
          })
          .then(() => finish(), finish);
      });
    });
    throwIfRunnerStartupAborted(startupController.signal);
    await assertWorkspaceRootForRunner(supervisorUid);
    containment = runnerContainmentFor(cgroupPath, childUid, childGid);
    const staleWorkspaceIds = await removeStaleWorkspacesBeforeListen(childUid, supervisorUid);
    console.info(JSON.stringify({
      event: "affiliate-agent-runner-workspace-containment",
      workspaceRoot: WORKSPACE_ROOT,
      socketOwnership: { uid: supervisorUid, gid: 0, mode: "0600" },
      childTemporaryDirectory: "workspace/.tmp",
      staleWorkspaceIds,
      staleWorkspaceCleanup: staleWorkspaceIds.map((id) => ({
        id,
        removed: true,
      })),
      staleWorkspaceResidualIds: [],
      cleanupStatus: "clean",
    }));
    context = {
      activeInvocations,
      activeReservations,
      cleanupPromises,
      containment,
      connections,
      seenRequestIds,
      childUid,
      childGid,
      supervisorUid,
      protocolPublicKeys,
      modelAddress,
      modelCredential,
      maxConcurrentInvocations,
      spawnProcess: spawn,
      destroyWorkspace: async (workspacePath) => {
        await prepareWorkspaceForSupervisorCleanup(workspacePath, childUid, supervisorUid);
        await rm(workspacePath, { recursive: true, force: true });
      },
      onFatal: (error) => {
        console.error(
          "[affiliate-agent-runner] fail-closed:",
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      },
    };
    await shutdown.promise;
    await Promise.all(stoppingChildren);
    try {
      await waitForConnectionCleanups();
    } catch (error) {
      shutdownCleanupFailed = true;
      throw error;
    }
  } catch (error) {
    if (!startupController.signal.aborted || shutdownCleanupFailed) throw error;
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await closeServer();
    if (ownedSocket !== null) {
      await removeOwnedRunnerSocket(socketPath, ownedSocket);
    }
  }
};

const isMainModule = typeof require === "function"
  ? require.main === module
  : basename(process.argv[1] ?? "") === "run-affiliate-agent-runner.ts";

if (isMainModule) {
  run().catch((error) => {
    console.error(
      "[affiliate-agent-runner] fatal:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
