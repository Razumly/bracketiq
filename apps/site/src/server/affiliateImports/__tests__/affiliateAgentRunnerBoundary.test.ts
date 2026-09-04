/** @jest-environment node */

import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { createConnection, createServer, type Socket } from "node:net";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn as nodeSpawn } from "node:child_process";
type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}>;

const createDeferred = <T>(): Deferred<T> => {
  let resolveDeferred!: Deferred<T>["resolve"];
  let rejectDeferred!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = (value?: T | PromiseLike<T>): void => {
      resolve(value as T | PromiseLike<T>);
    };
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
};


import {
  configureRunnerConnection,
  prepareWorkspaceForSupervisorCleanup,
  seedCodexAuthForWorkspace,
  AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS,
  AFFILIATE_AGENT_RUNNER_RESERVATION_LIFETIME_MILLISECONDS,
  AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES,
  type RunnerServerContext,
} from "../../../../scripts/run-affiliate-agent-runner";
import {
  parseAffiliateAgentRunnerResponse,
  type AffiliateAgentRunnerRequest,
  type AffiliateAgentRunnerResponse,
} from "../affiliateAgentRunnerProtocol";
import { canonicalizeAffiliateAgentValue } from "../agentGatewayContracts";
import type { AffiliateAgentProcessEvent } from "../agentGatewayAdapters";

class FakeCodexChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = Object.assign(new EventEmitter(), {
    resume: jest.fn(),
  });
  exitCode: number | null = null;
  readonly stdin = Object.assign(new EventEmitter(), {
    destroyed: false,
    write: jest.fn(() => true),
    end: jest.fn(() => undefined),
  });
  readonly kill = jest.fn(() => true);
}
class FakeCodexChildWithProcessGroup extends FakeCodexChild {
  readonly pid = 12_345;
}

const signedRequest = (
  request: Omit<AffiliateAgentRunnerRequest, "signature">,
  privateKey: KeyObject,
): AffiliateAgentRunnerRequest => ({
  ...request,
  signature: sign(
    null,
    Buffer.from(canonicalizeAffiliateAgentValue(request), "utf8"),
    privateKey,
  ).toString("base64"),
});

const launchRequest = (
  privateKey: KeyObject,
  reservationId: string,
  environmentPatch: Readonly<Record<string, string>> = {},
): AffiliateAgentRunnerRequest => signedRequest({
  kind: "LAUNCH",
  requestId: "launch-request",
  reservationId,
  workerId: "worker-1",
  invocationId: "invocation-1",
  workspaceId: "workspace-1",
  workspaceMode: "READ_WRITE",
  prompt: "initial prompt",
  environment: {
    AFFILIATE_AGENT_CLAIM_ENVELOPE: JSON.stringify({
      role: "COVERAGE_PLANNER",
      workerId: "worker-1",
      invocationId: "invocation-1",
      workspaceId: "workspace-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
    }),
    ...environmentPatch,
  },
  workspacePath: "/workspaces/workspace-1-session",
}, privateKey);
const responseReader = (socket: Socket) => {
  let lineBuffer = "";
  const pending: AffiliateAgentRunnerResponse[] = [];
  const waiters: Array<(response: AffiliateAgentRunnerResponse) => void> = [];
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string | Buffer) => {
    lineBuffer += chunk.toString();
    while (true) {
      const newlineIndex = lineBuffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = lineBuffer.slice(0, newlineIndex);
      lineBuffer = lineBuffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      const response = parseAffiliateAgentRunnerResponse(JSON.parse(line));
      const waiter = waiters.shift();
      if (waiter) waiter(response);
      else pending.push(response);
    }
  });
  return async (): Promise<AffiliateAgentRunnerResponse> => {
    const response = pending.shift();
    if (response) return response;
    const deferred = createDeferred<AffiliateAgentRunnerResponse>();
    waiters.push(deferred.resolve);
    return deferred.promise;
  };
};

const runSingleChildScenario = async (
  output: string | Buffer,
  exitCode: number | null,
  triggerOnSpawn?: (child: FakeCodexChild) => void,
): Promise<{
  event: AffiliateAgentProcessEvent;
  child: FakeCodexChild;
  environment: NodeJS.ProcessEnv;
  args: readonly string[];
  responses: AffiliateAgentRunnerResponse[];
}> => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  let child: FakeCodexChild | null = null;
  const spawnProcessMock = jest.fn((..._args: unknown[]) => {
    child = new FakeCodexChild();
    queueMicrotask(() => {
      child?.emit("spawn");
      if (child) triggerOnSpawn?.(child);
      child?.stdout.emit("data", output);
      child?.exitCode = exitCode;
      child?.emit("close", exitCode);
    });
    return child;
  });
  const spawnProcess = spawnProcessMock as unknown as typeof nodeSpawn;
  const context: RunnerServerContext = {
    activeInvocations: new Set(),
    activeReservations: new Set(),
    connections: new Set(),
    seenRequestIds: new Map(),
    protocolPublicKeys: new Map([["worker-1", publicKey]]),
    maxConcurrentInvocations: 1,
    spawnProcess,
  };
  const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
  const socketPath = join(socketDirectory, "runner.sock");
  const server = createServer((socket) => configureRunnerConnection(socket, context));
  let client: Socket | null = null;

  try {
    const serverReady = createDeferred<void>();
    server.once("error", serverReady.reject);
    server.listen(socketPath, serverReady.resolve);
    await serverReady.promise;

    client = createConnection(socketPath);
    const nextResponse = responseReader(client);
    await once(client, "connect");
    const reserve = signedRequest({
      kind: "RESERVE",
      requestId: "reserve-request",
      workerId: "worker-1",
      invocationId: "invocation-1",
    }, privateKey);
    client.write(`${JSON.stringify(reserve)}\n`);
    const reserved = await nextResponse();
    if (reserved.kind !== "RESERVED") {
      throw new Error("Expected a RESERVED response.");
    }
    client.write(`${JSON.stringify(launchRequest(privateKey, reserved.reservationId))}\n`);
    const responses = [await nextResponse(), await nextResponse()];
    if (responses[1]?.kind !== "EVENT") {
      responses.push(await nextResponse());
    }
    const eventResponse = responses.find(
      (response): response is Extract<AffiliateAgentRunnerResponse, { kind: "EVENT" }> =>
        response.kind === "EVENT",
    );
    if (!eventResponse) {
      throw new Error("Expected an EVENT response.");
    }
    if (!child) throw new Error("The Codex child was not spawned.");
    const spawnArgs = spawnProcessMock.mock.calls[0]?.[1] as readonly string[] | undefined;
    if (!spawnArgs) throw new Error("The Codex child arguments were not captured.");
    const spawnOptions = spawnProcessMock.mock.calls[0]?.[2] as {
      env?: NodeJS.ProcessEnv;
    } | undefined;
    if (!spawnOptions?.env) throw new Error("The Codex child environment was not captured.");
    return {
      event: eventResponse.event,
      child,
      environment: spawnOptions.env,
      args: spawnArgs,
      responses,
    };
  } finally {
    client?.destroy();
    const serverClosed = createDeferred<void>();
    server.close(() => serverClosed.resolve());
    await serverClosed.promise;
    await rm(socketDirectory, { recursive: true, force: true });
  }
};
describe("executable affiliate agent runner boundary", () => {
  it("emits the pinned Codex model and enables child network access", async () => {
    const terminal = {
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: "child-terminal-key",
      result: { disposition: "APPROVED" },
    };
    const { event, child, environment, args } = await runSingleChildScenario(
      JSON.stringify(terminal),
      0,
    );
    expect(event).toEqual(terminal);
    expect(args).toEqual(expect.arrayContaining([
      "--model",
      "gpt-5.6-luna",
      "-c",
      "sandbox_workspace_write.network_access=true",
    ]));
    expect(environment.HOME).toBe("/workspaces/workspace-1-session/.codex");
    expect(environment.CODEX_HOME).toBe("/workspaces/workspace-1-session/.codex");
    expect(environment.TMPDIR).toBe("/workspaces/workspace-1-session/.tmp");
    expect(environment.TMP).toBe("/workspaces/workspace-1-session/.tmp");
    expect(environment.TEMP).toBe("/workspaces/workspace-1-session/.tmp");
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(child.stderr.resume).toHaveBeenCalledTimes(1);
  });
  it("copies only reviewed Codex auth into the workspace home", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-auth-"));
    const seedPath = join(temporaryDirectory, "auth.json");
    const workspacePath = join(temporaryDirectory, "workspace");
    const targetPath = join(workspacePath, ".codex", "auth.json");
    const seed = JSON.stringify({
      auth_mode: "chatgpt",
      access_token: "access-token",
      refresh_token: "refresh-token",
      account_id: "account-id",
    });
    try {
      await mkdir(join(workspacePath, ".codex"), { recursive: true });
      await writeFile(seedPath, seed, { mode: 0o600 });
      expect(seedCodexAuthForWorkspace(seedPath, workspacePath)).toBe(targetPath);
      expect(await readFile(targetPath, "utf8")).toBe(seed);
      expect((await stat(targetPath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
  it("rejects an auth seed without reviewed ChatGPT credentials", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-auth-"));
    const seedPath = join(temporaryDirectory, "auth.json");
    const workspacePath = join(temporaryDirectory, "workspace");
    try {
      await mkdir(join(workspacePath, ".codex"), { recursive: true });
      await writeFile(seedPath, JSON.stringify({ auth_mode: "api_key" }));
      expect(() => seedCodexAuthForWorkspace(seedPath, workspacePath)).toThrow(
        "reviewed ChatGPT credentials",
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
  it("fails closed for a workspace symlink and never changes its target", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-cleanup-"));
    const outsideDirectory = join(temporaryDirectory, "outside");
    const workspacePath = join(temporaryDirectory, "workspace");
    try {
      await mkdir(outsideDirectory);
      await symlink(outsideDirectory, workspacePath);
      const before = await stat(outsideDirectory);
      await expect(prepareWorkspaceForSupervisorCleanup(workspacePath)).rejects.toThrow(
        "changed type during cleanup",
      );
      expect((await stat(outsideDirectory)).mode & 0o777).toBe(before.mode & 0o777);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
  it("applies cleanup modes through checked descriptors", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-cleanup-"));
    const workspacePath = join(temporaryDirectory, "workspace");
    const filePath = join(workspacePath, "result.txt");
    try {
      await mkdir(workspacePath);
      await writeFile(filePath, "result");
      await prepareWorkspaceForSupervisorCleanup(workspacePath);
      expect((await stat(workspacePath)).mode & 0o777).toBe(0o770);
      expect((await stat(filePath)).mode & 0o777).toBe(0o660);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
  it("retains the active runner slot until workspace cleanup releases it", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const terminal = JSON.stringify({
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: "child-terminal-key",
      result: { disposition: "APPROVED" },
    });
    const spawnProcess = jest.fn(() => {
      const child = new FakeCodexChildWithProcessGroup();
      queueMicrotask(() => {
        child.emit("spawn");
        child.stdout.emit("data", terminal);
        child.exitCode = 0;
        child.emit("close", 0);
      });
      return child;
    }) as unknown as typeof nodeSpawn;
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([["worker-1", publicKey]]),
      maxConcurrentInvocations: 1,
      spawnProcess,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let client: Socket | null = null;
    const killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      client = createConnection(socketPath);
      const nextResponse = responseReader(client);
      await once(client, "connect");

      client.write(`${JSON.stringify(signedRequest({
        kind: "RESERVE",
        requestId: "reserve-request",
        workerId: "worker-1",
        invocationId: "invocation-1",
      }, privateKey))}\n`);
      const reserved = await nextResponse();
      if (reserved.kind !== "RESERVED") throw new Error("Expected RESERVED.");
      client.write(`${JSON.stringify(launchRequest(privateKey, reserved.reservationId))}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "STARTED",
        requestId: "launch-request",
      });
      await expect(nextResponse()).resolves.toMatchObject({
        kind: "EVENT",
        requestId: "launch-request",
      });

      client.write(`${JSON.stringify(signedRequest({
        kind: "TERMINATE",
        requestId: "terminate-request",
      }, privateKey))}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "TERMINATED",
        requestId: "terminate-request",
      });
      expect(killSpy.mock.calls).toEqual(expect.arrayContaining([
        [-12_345, "SIGTERM"],
        [-12_345, "SIGKILL"],
      ]));
      expect(context.activeInvocations.size).toBe(1);

      const clientClosed = once(client, "close");
      client.write(`${JSON.stringify(signedRequest({
        kind: "RELEASE",
        requestId: "release-request",
        reservationId: reserved.reservationId,
      }, privateKey))}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "RELEASED",
        requestId: "release-request",
      });
      await clientClosed;
      expect(context.activeInvocations.size).toBe(0);
    } finally {
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
      killSpy.mockRestore();
    }
  });
  it("bounds an asynchronous stdin failure to one ERROR and EXIT event", async () => {
    const { responses, child } = await runSingleChildScenario(
      "",
      0,
      (spawnedChild) => {
        spawnedChild.stdin.emit("error", new Error("EPIPE"));
      },
    );
    expect(responses.filter((response) => response.kind === "ERROR")).toHaveLength(1);
    expect(responses.filter((response) => response.kind === "EVENT")).toEqual([
      {
        kind: "EVENT",
        requestId: "launch-request",
        event: { kind: "EXIT", exitCode: 1 },
      },
    ]);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("fails closed on invalid UTF-8 child output", async () => {
    const { event, child } = await runSingleChildScenario(
      Buffer.from([0xc3, 0x28]),
      0,
    );

    expect(event).toEqual({ kind: "EXIT", exitCode: 1 });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });


  it("retains a reserved slot through workspace and claim retry windows", async () => {
    jest.useFakeTimers();
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const context = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([["worker-1", publicKey]]),
      maxConcurrentInvocations: 1,
      spawnProcess: jest.fn(),
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let client: Socket | null = null;
    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(socketPath, resolvePromise);
      });
      client = createConnection(socketPath);
      const nextResponse = responseReader(client);
      await once(client, "connect");
      client.write(`${JSON.stringify(signedRequest({
        kind: "RESERVE",
        requestId: "reserve-timeout-request",
        workerId: "worker-1",
        invocationId: "invocation-timeout",
      }, privateKey))}\n`);
      await expect(nextResponse()).resolves.toMatchObject({ kind: "RESERVED" });
      expect(context.activeReservations.size).toBe(1);
      const clientClosed = once(client, "close");
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS * 3,
      );
      expect(context.activeReservations.size).toBe(1);
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_RUNNER_RESERVATION_LIFETIME_MILLISECONDS
          - AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS * 3,
      );
      await clientClosed;
      expect(context.activeReservations.size).toBe(0);
    } finally {
      jest.useRealTimers();
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
    }
  });
  it("rejects runner correction without starting a second child", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const children: FakeCodexChild[] = [];
    const spawnProcess = jest.fn(() => {
      const child = new FakeCodexChild();
      children.push(child);
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }) as unknown as typeof nodeSpawn;
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([["worker-1", publicKey]]),
      maxConcurrentInvocations: 1,
      spawnProcess,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let client: Socket | null = null;
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      client = createConnection(socketPath);
      const nextResponse = responseReader(client);
      await once(client, "connect");
      const reserve = signedRequest({
        kind: "RESERVE",
        requestId: "reserve-request",
        workerId: "worker-1",
        invocationId: "invocation-1",
      }, privateKey);
      client.write(`${JSON.stringify(reserve)}\n`);
      const reserved = await nextResponse();
      if (reserved.kind !== "RESERVED") throw new Error("Expected RESERVED.");
      const launch = launchRequest(privateKey, reserved.reservationId);
      client.write(`${JSON.stringify(launch)}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "STARTED",
        requestId: launch.requestId,
      });
      const correction = signedRequest({
        kind: "CORRECTION",
        requestId: "correction-request",
        correctionPrompt: "Return the corrected result.",
      }, privateKey);
      client.write(`${JSON.stringify(correction)}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "ERROR",
        requestId: correction.requestId,
        message: "Schema corrections must be submitted by the Codex child through the gateway.",
      });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
    } finally {
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
    }
  });
  it("rejects a supervisor key used for another worker identity", async () => {
    const first = generateKeyPairSync("ed25519");
    const second = generateKeyPairSync("ed25519");
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([
        ["worker-1", first.publicKey],
        ["worker-2", second.publicKey],
      ]),
      maxConcurrentInvocations: 1,
      spawnProcess: jest.fn() as unknown as typeof nodeSpawn,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let client: Socket | null = null;
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      client = createConnection(socketPath);
      const nextResponse = responseReader(client);
      await once(client, "connect");
      const request = signedRequest({
        kind: "RESERVE",
        requestId: "cross-supervisor-request",
        workerId: "worker-2",
        invocationId: "invocation-2",
      }, first.privateKey);
      client.write(`${JSON.stringify(request)}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "ERROR",
        requestId: request.requestId,
        message: "The affiliate agent runner request is not authenticated.",
      });
    } finally {
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
    }
  });

  it("rejects a signed launch frame with an unknown field before spawning", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const spawnProcess = jest.fn() as unknown as typeof nodeSpawn;
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([["worker-1", publicKey]]),
      maxConcurrentInvocations: 1,
      spawnProcess,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let client: Socket | null = null;
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      client = createConnection(socketPath);
      const nextResponse = responseReader(client);
      await once(client, "connect");
      const reserve = signedRequest({
        kind: "RESERVE",
        requestId: "reserve-request",
        workerId: "worker-1",
        invocationId: "invocation-1",
      }, privateKey);
      client.write(`${JSON.stringify(reserve)}\n`);
      const reserved = await nextResponse();
      if (reserved.kind !== "RESERVED") throw new Error("Expected RESERVED.");
      const invalidRequest = {
        ...launchRequest(
          privateKey,
          reserved.reservationId,
          { CODEX_HOME: "/tmp/shared-codex" },
        ),
        unexpectedField: "reject-me",
      };
      client.write(`${JSON.stringify(invalidRequest)}\n`);
      await expect(nextResponse()).resolves.toMatchObject({
        kind: "ERROR",
        message: "The affiliate agent runner request is invalid.",
      });
      expect(spawnProcess).not.toHaveBeenCalled();
    } finally {
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
    }
  });
  it("does not start a second child while the first invocation is active", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const spawnProcess = jest.fn(() => {
      const child = new FakeCodexChild();
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }) as unknown as typeof nodeSpawn;
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      seenRequestIds: new Map(),
      activeReservations: new Set(),
      connections: new Set(),
      protocolPublicKeys: new Map([
        ["worker-1", publicKey],
        ["worker-2", publicKey],
      ]),
      maxConcurrentInvocations: 1,
      spawnProcess,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let client: Socket | null = null;
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      client = createConnection(socketPath);
      const nextResponse = responseReader(client);
      await once(client, "connect");
      const reserve = signedRequest({
        kind: "RESERVE",
        requestId: "reserve-request",
        workerId: "worker-1",
        invocationId: "invocation-1",
      }, privateKey);
      client.write(`${JSON.stringify(reserve)}\n`);
      const reserved = await nextResponse();
      if (reserved.kind !== "RESERVED") throw new Error("Expected RESERVED.");
      const first = launchRequest(privateKey, reserved.reservationId);
      client.write(`${JSON.stringify(first)}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "STARTED",
        requestId: first.requestId,
      });
      const second = signedRequest({
        kind: "RESERVE",
        requestId: "reserve-request-2",
        workerId: "worker-2",
        invocationId: "invocation-2",
      }, privateKey);
      client.write(`${JSON.stringify(second)}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "ERROR",
        requestId: second.requestId,
        message: "The affiliate agent runner is busy.",
      });
      expect(spawnProcess).toHaveBeenCalledTimes(1);
    } finally {
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
    }
  });
  it("serializes two supervisor reservations before any child claim launch", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const spawnProcess = jest.fn() as unknown as typeof nodeSpawn;
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([
        ["worker-1", publicKey],
        ["worker-2", publicKey],
      ]),
      maxConcurrentInvocations: 1,
      spawnProcess,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let firstClient: Socket | null = null;
    let secondClient: Socket | null = null;
    let secondClose: Promise<unknown[]> | null = null;
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      firstClient = createConnection(socketPath);
      secondClient = createConnection(socketPath);
      const firstResponse = responseReader(firstClient);
      const secondResponse = responseReader(secondClient);
      await Promise.all([once(firstClient, "connect"), once(secondClient, "connect")]);
      const firstReserve = signedRequest({
        kind: "RESERVE",
        requestId: "first-reserve",
        workerId: "worker-1",
        invocationId: "invocation-1",
      }, privateKey);
      firstClient.write(`${JSON.stringify(firstReserve)}\n`);
      await expect(firstResponse()).resolves.toMatchObject({
        kind: "RESERVED",
        requestId: firstReserve.requestId,
      });
      const secondReserve = signedRequest({
        kind: "RESERVE",
        requestId: "second-reserve",
        workerId: "worker-2",
        invocationId: "invocation-2",
      }, privateKey);
      secondClose = once(secondClient, "close");
      secondClient.write(`${JSON.stringify(secondReserve)}\n`);
      await expect(secondResponse()).resolves.toEqual({
        kind: "ERROR",
        requestId: secondReserve.requestId,
        message: "The affiliate agent runner is busy.",
      });
      await secondClose;
      expect(spawnProcess).not.toHaveBeenCalled();
      expect(context.activeReservations.size).toBe(1);
    } finally {
      const firstClosed = firstClient ? once(firstClient, "close") : Promise.resolve();
      const secondClosed = secondClose
        ?? (secondClient ? once(secondClient, "close") : Promise.resolve());
      firstClient?.destroy();
      secondClient?.destroy();
      await Promise.all([firstClosed, secondClosed]);
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
    }
  });

  it("reports EXIT instead of a terminal result when the child exits nonzero", async () => {
    const { event } = await runSingleChildScenario(
      JSON.stringify({
        kind: "TERMINAL_SUBMISSION",
        idempotencyKey: "child-terminal-key",
        result: { disposition: "APPROVED" },
      }),
      7,
    );
    expect(event).toEqual({ kind: "EXIT", exitCode: 7 });
  });

  it("delivers a terminal frame at the bounded framed-output limit", async () => {
    const terminal = JSON.stringify({
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: "x".repeat(128),
      result: {},
    });
    const padding = " ".repeat(
      AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES
        - Buffer.byteLength(terminal, "utf8"),
    );
    const { event } = await runSingleChildScenario(`${terminal}${padding}`, 0);
    expect(Buffer.byteLength(`${terminal}${padding}`, "utf8")).toBe(
      AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES,
    );
    expect(event).toEqual({
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: "x".repeat(128),
      result: {},
    });
  });
  it("delivers a terminal frame immediately below the bounded output limit", async () => {
    const terminal = JSON.stringify({
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: "x".repeat(128),
      result: {},
    });
    const padding = " ".repeat(
      AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES
        - Buffer.byteLength(terminal, "utf8")
        - 1,
    );
    const { event } = await runSingleChildScenario(`${terminal}${padding}`, 0);
    expect(Buffer.byteLength(`${terminal}${padding}`, "utf8")).toBe(
      AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES - 1,
    );
    expect(event.kind).toBe("TERMINAL_SUBMISSION");
  });

  it("rejects a terminal frame beyond the bounded output limit", async () => {
    const terminal = JSON.stringify({
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: "x".repeat(128),
      result: {},
    });
    const padding = " ".repeat(
      AFFILIATE_AGENT_RUNNER_MAX_CHILD_OUTPUT_BYTES
        - Buffer.byteLength(terminal, "utf8")
        + 1,
    );
    const { event, child } = await runSingleChildScenario(`${terminal}${padding}`, 0);
    expect(event).toEqual({ kind: "EXIT", exitCode: 0 });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });
  it("reaps an active child before releasing capacity after socket loss", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    let child: FakeCodexChild | null = null;
    const spawnProcess = jest.fn(() => {
      child = new FakeCodexChild();
      child.kill.mockImplementation(() => {
        expect(context.activeInvocations.size).toBe(1);
        child!.exitCode = 137;
        queueMicrotask(() => child!.emit("close", null));
        return true;
      });
      queueMicrotask(() => child!.emit("spawn"));
      return child;
    }) as unknown as typeof nodeSpawn;
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([["worker-1", publicKey]]),
      maxConcurrentInvocations: 1,
      spawnProcess,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    let serverSocket: Socket | null = null;
    const server = createServer((socket) => {
      serverSocket = socket;
      configureRunnerConnection(socket, context);
    });
    let client: Socket | null = null;
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      client = createConnection(socketPath);
      const nextResponse = responseReader(client);
      await once(client, "connect");
      const reserve = signedRequest({
        kind: "RESERVE",
        requestId: "reserve-request",
        workerId: "worker-1",
        invocationId: "invocation-1",
      }, privateKey);
      client.write(`${JSON.stringify(reserve)}\n`);
      const reserved = await nextResponse();
      if (reserved.kind !== "RESERVED") throw new Error("Expected RESERVED.");
      client.write(`${JSON.stringify(launchRequest(privateKey, reserved.reservationId))}\n`);
      await expect(nextResponse()).resolves.toEqual({
        kind: "STARTED",
        requestId: "launch-request",
      });
      expect(context.activeInvocations.size).toBe(1);

      client.destroy();
      await once(client, "close");
      if (!serverSocket) throw new Error("The runner server socket was not created.");
      await once(serverSocket, "close");
      await Promise.resolve();
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
      expect(child).not.toBeNull();
      expect(child!.kill).toHaveBeenCalledWith("SIGKILL");
      expect(context.activeInvocations.size).toBe(0);
    } finally {
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
    }
  });
  it("closes an idle pre-reservation socket at its bounded timeout", async () => {
    jest.useFakeTimers();
    const { publicKey } = generateKeyPairSync("ed25519");
    const context: RunnerServerContext = {
      activeInvocations: new Set(),
      activeReservations: new Set(),
      connections: new Set(),
      seenRequestIds: new Map(),
      protocolPublicKeys: new Map([["worker-1", publicKey]]),
      maxConcurrentInvocations: 1,
      spawnProcess: jest.fn() as unknown as typeof nodeSpawn,
    };
    const socketDirectory = await mkdtemp(join(tmpdir(), "affiliate-runner-"));
    const socketPath = join(socketDirectory, "runner.sock");
    const server = createServer((socket) => configureRunnerConnection(socket, context));
    let client: Socket | null = null;
    try {
      const serverReady = createDeferred<void>();
      server.once("error", serverReady.reject);
      server.listen(socketPath, serverReady.resolve);
      await serverReady.promise;
      client = createConnection(socketPath);
      await once(client, "connect");
      expect(context.connections.size).toBe(1);
      const clientClosed = once(client, "close");
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_RUNNER_PRE_RESERVATION_TIMEOUT_MILLISECONDS,
      );
      await clientClosed;
      expect(context.connections.size).toBe(0);
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
    } finally {
      client?.destroy();
      const serverClosed = createDeferred<void>();
      server.close(() => serverClosed.resolve());
      await serverClosed.promise;
      await rm(socketDirectory, { recursive: true, force: true });
      jest.useRealTimers();
    }
  });
});
