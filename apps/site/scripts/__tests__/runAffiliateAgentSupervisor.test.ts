/** @jest-environment node */

import { generateKeyPairSync } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { chmod, lstat, mkdir, readdir, mkdtemp, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  AffiliateAgentHttpGateway,
  createWorkspaceManager,
  positiveSeconds,
  restorePersistedAdmissionHalt,
} from "../run-affiliate-agent-supervisor";
import {
  AffiliateAgentGatewayError,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimRequest,
} from "../../src/server/affiliateImports/agentGateway";
import {
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
} from "../../src/server/affiliateImports/agentGatewayContracts";
import type { AffiliateAgentProcessReservation } from "../../src/server/affiliateImports/agentGatewayAdapters";

const scriptPath = join(
  process.cwd(),
  "scripts",
  "run-affiliate-agent-supervisor.ts",
);
const tsxPath = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const runnerScriptPath = join(
  process.cwd(),
  "scripts",
  "run-affiliate-agent-runner.ts",
);

const staleRecoveryReservation = {
  reservationId: "stale-recovery-test-reservation",
  launch: () => {
    throw new Error("The stale recovery test reservation cannot launch.");
  },
  release: async () => undefined,
} satisfies AffiliateAgentProcessReservation;

const runSupervisorCli = (...arguments_: readonly string[]) => spawnSync(
  process.execPath,
  [tsxPath, scriptPath, ...arguments_],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  },
);
const serverWithPayload = async (
  payload: unknown,
): Promise<Readonly<{ server: ReturnType<typeof createHttpServer>; address: string }>> => {
  const server = createHttpServer((_request, response) => {
    const body = JSON.stringify(payload);
    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    response.end(body);
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The test gateway did not expose a TCP address.");
  }
  return {
    server,
    address: `http://127.0.0.1:${address.port}`,
  };
};

const artifactReadRequest = {
  kind: "READ_ARTIFACT",
  idempotencyKey: "read-artifact-1",
  evidenceRef: "page-evidence",
  authorization: {
    token: "test-claim-token",
    jobId: "job-1",
    claimId: "claim-1",
    claimGeneration: 1,
    lifecycleGeneration: 1,
    role: "MAPPING_PRODUCER",
    workerId: "producer-1",
    invocationId: "invocation-1",
    supplyContractHash: "a".repeat(64),
  },
} satisfies AffiliateAgentClaimOperation;

describe("affiliate agent supervisor CLI", () => {
  it("enters the main path when executed directly through tsx", () => {
    const result = runSupervisorCli();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "[affiliate-agent-supervisor] fatal: Missing --role=<value> argument.",
    );
  });

  it("does not enter the main path when imported through tsx", () => {
    const result = spawnSync(
      process.execPath,
      [tsxPath, "-e", `import ${JSON.stringify(scriptPath)}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
  it("keeps normal closed admission running but restores a durable halt", async () => {
    const reconcileWorkerState = jest.fn()
      .mockResolvedValueOnce({
        report: {
          examinedClaims: 0,
          expiredClaims: 0,
          examinedReceipts: 0,
          recoveredReceipts: 0,
          completedReceipts: 0,
          unresolvedReceipts: 0,
          isAdmissionHalted: false,
        },
        admissionOpen: false,
      })
      .mockResolvedValueOnce({
        report: {
          examinedClaims: 0,
          expiredClaims: 0,
          examinedReceipts: 0,
          recoveredReceipts: 0,
          completedReceipts: 0,
          unresolvedReceipts: 0,
          isAdmissionHalted: true,
        },
        admissionOpen: false,
      });
    const configuration = {
      gateway: { reconcileWorkerState },
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[0];
    const control = {
      signal: new AbortController().signal,
      admissionState: {
        isAdmissionHalted: false,
        admissionHaltError: null,
        persistHalt: jest.fn(async () => undefined),
      },
      isStopping: false,
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[1];

    await restorePersistedAdmissionHalt(configuration, control);
    expect(control.admissionState.isAdmissionHalted).toBe(false);
    expect(control.admissionState.admissionHaltError).toBeNull();

    await restorePersistedAdmissionHalt(configuration, control);
    expect(control.admissionState.isAdmissionHalted).toBe(true);
    expect(control.admissionState.admissionHaltError).toMatchObject({
      code: "GATEWAY_ADMISSION_HALTED",
    });
  });
  it("closes runtime admission before honoring an open persisted-halt response", async () => {
    const reconcileWorkerState = jest.fn().mockResolvedValue({
      report: {
        examinedClaims: 0,
        expiredClaims: 0,
        examinedReceipts: 0,
        recoveredReceipts: 0,
        completedReceipts: 0,
        unresolvedReceipts: 0,
        isAdmissionHalted: true,
      },
      admissionOpen: true,
    });
    const haltAdmission = jest.fn(async () => undefined);
    const configuration = {
      gateway: { reconcileWorkerState, haltAdmission },
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[0];
    const control = {
      signal: new AbortController().signal,
      admissionState: {
        isAdmissionHalted: false,
        admissionHaltError: null,
      },
      isStopping: false,
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[1];

    await restorePersistedAdmissionHalt(configuration, control);

    expect(haltAdmission).toHaveBeenCalledTimes(1);
    expect(control.admissionState.isAdmissionHalted).toBe(true);
  });
  it("persists a supervisor-only halt after startup worker authorization fails", async () => {
    const authorizationError = new AffiliateAgentGatewayError({
      code: "ROLE_CREDENTIAL_INVALID",
      isRetryable: false,
      safeMessage: "The worker credential was rejected.",
    });
    const reconcileWorkerState = jest.fn().mockRejectedValue(authorizationError);
    const haltAdmission = jest.fn(async () => undefined);
    const configuration = {
      gateway: { reconcileWorkerState, haltAdmission },
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[0];
    const control = {
      signal: new AbortController().signal,
      admissionState: {
        isAdmissionHalted: false,
        admissionHaltError: null,
      },
      isStopping: false,
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[1];

    await restorePersistedAdmissionHalt(configuration, control);

    expect(haltAdmission).toHaveBeenCalledTimes(1);
    expect(control.admissionState.isAdmissionHalted).toBe(true);
    expect(control.admissionState.admissionHaltError).toBe(authorizationError);
  });
  it("does not globally halt on a retryable startup transport error", async () => {
    const transportError = new AffiliateAgentGatewayError({
      code: "INTERNAL_ERROR",
      isRetryable: true,
      safeMessage: "The affiliate gateway request timed out.",
    });
    const reconcileWorkerState = jest.fn().mockRejectedValue(transportError);
    const haltAdmission = jest.fn(async () => undefined);
    const configuration = {
      gateway: { reconcileWorkerState, haltAdmission },
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[0];
    const control = {
      signal: new AbortController().signal,
      admissionState: {
        isAdmissionHalted: false,
        admissionHaltError: null,
      },
      isStopping: false,
    } as unknown as Parameters<typeof restorePersistedAdmissionHalt>[1];

    await restorePersistedAdmissionHalt(configuration, control);

    expect(haltAdmission).not.toHaveBeenCalled();
    expect(control.admissionState.isAdmissionHalted).toBe(false);
    expect(control.admissionState.admissionHaltError).toBeNull();
  });

  it("does not unlink another process's live runner socket when startup is rejected", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const root = await mkdtemp(join(tmpdir(), "affiliate-runner-live-"));
    const socketPath = join(root, "runner.sock");
    const server = createServer(() => undefined);
    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(socketPath, resolvePromise);
      });
      const result = spawnSync(
        process.execPath,
        [tsxPath, runnerScriptPath],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            AFFILIATE_AGENT_RUNNER_SOCKET: socketPath,
            AFFILIATE_AGENT_RUNNER_PROTOCOL_PUBLIC_KEY:
              publicKey.export({ format: "der", type: "spki" }).toString("base64"),
            AFFILIATE_AGENT_MODEL_ADDRESS: "https://model.internal",
            AFFILIATE_AGENT_MODEL_CREDENTIAL: "model-credential",
            AFFILIATE_AGENT_MAX_CONCURRENT_INVOCATIONS: "1",
          },
        },
      );
      expect(result.status).toBe(1);
      expect((await lstat(socketPath)).isSocket()).toBe(true);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
      await rm(root, { recursive: true, force: true });
    }
  });
  it("rejects a perform response whose result kind does not match the request", async () => {
    const { server, address } = await serverWithPayload({
      result: {
        kind: "COMMAND_SUCCEEDED",
        receiptId: "receipt-1",
        commandType: "VALIDATE_DECLARATIVE_PACKAGE",
        responseHash: "response-hash",
        safeOutput: null,
      },
    });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
      });
      const heartbeat = {
        kind: "HEARTBEAT",
        idempotencyKey: "heartbeat-1",
        authorization: {},
      } as unknown as AffiliateAgentClaimOperation;
      await expect(gateway.perform(heartbeat)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        safeMessage: "The affiliate gateway returned an invalid response.",
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });
  it("reads provenance-bearing evidence for source-relative link resolution", async () => {
    const bytes = Buffer.from("Stored source evidence.");
    const { server, address } = await serverWithPayload({
      result: {
        kind: "ARTIFACT_READ",
        receiptId: "receipt-1",
        evidenceRef: "page-evidence",
        sha256: "a".repeat(64),
        mimeType: "text/markdown",
        byteSize: bytes.length,
        bytes: bytes.toString("base64"),
        encoding: "base64",
        sourceUrl: null,
        finalUrl: "https://club.example/camps/chicago/",
      },
    });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
      });
      const artifact = await gateway.perform(artifactReadRequest);
      expect(new URL("register", artifact.finalUrl ?? artifact.sourceUrl ?? "").href)
        .toBe("https://club.example/camps/chicago/register");
      expect(Buffer.from(artifact.bytes).toString("utf8")).toBe("Stored source evidence.");
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it("rejects legacy artifact responses that omit provenance fields", async () => {
    const { server, address } = await serverWithPayload({
      result: {
        kind: "ARTIFACT_READ",
        receiptId: "receipt-1",
        evidenceRef: "page-evidence",
        sha256: "a".repeat(64),
        mimeType: "text/markdown",
        byteSize: 0,
        bytes: "",
        encoding: "base64",
      },
    });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
      });
      await expect(gateway.perform(artifactReadRequest)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        isRetryable: true,
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it("maps the exact gateway Unauthorized response to a non-retryable credential error", async () => {
    const server = createHttpServer((_request, response) => {
      const body = JSON.stringify({ error: "Unauthorized." });
      response.writeHead(401, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
      response.end(body);
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("The test gateway did not expose a TCP address.");
    }
    try {
      const gateway = new AffiliateAgentHttpGateway(`http://127.0.0.1:${address.port}`, {
        roleCredential: "role-credential",
      });
      await expect(
        gateway.heartbeatWorker({
          workerId: "mapping-producer-1",
          role: "MAPPING_PRODUCER",
        }),
      ).rejects.toMatchObject({
        code: "ROLE_CREDENTIAL_INVALID",
        isRetryable: false,
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it("rejects a version-skewed submit result discriminator", async () => {
    const { server, address } = await serverWithPayload({
      result: {
        kind: "TERMINAL_ACCEPTED",
        receiptId: "receipt-1",
        submissionNumber: 1,
        remainingSubmissions: 1,
        issues: [],
        correctionPrompt: "retry",
      },
    });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
      });
      const submitResult = {
        kind: "SUBMIT_RESULT",
        idempotencyKey: "submit-1",
        authorization: {},
        result: {},
      } as unknown as AffiliateAgentClaimOperation;
      await expect(gateway.perform(submitResult)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        safeMessage: "The affiliate gateway returned an invalid response.",
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it.each([
    {
      kind: "TERMINAL_ACCEPTED",
      receiptId: "receipt-1",
      resultHash: "result-hash",
      disposition: "UNKNOWN",
      completedAt: "2026-08-30T00:00:00.000Z",
    },
    {
      kind: "INVOCATION_FAILED",
      receiptId: "receipt-1",
      failureCode: "UNKNOWN",
      invocationFailureCount: 1,
      nextAttemptAt: null,
      isPipelineBlocked: false,
    },
    {
      kind: "SCHEMA_CORRECTION_REQUIRED",
      receiptId: "receipt-1",
      submissionNumber: 1,
      remainingSubmissions: 1,
      issues: [{ path: [], code: "UNKNOWN", message: "invalid" }],
      correctionPrompt: "retry",
    },
    {
      kind: "SCHEMA_CORRECTION_REQUIRED",
      receiptId: "receipt-1",
      submissionNumber: 1,
      remainingSubmissions: 2,
      issues: [{
        path: Array.from({ length: 33 }, (_, index) => index),
        code: "INVALID_VALUE",
        message: "invalid",
      }],
      correctionPrompt: "retry",
    },
  ])("rejects invalid submit-result union member fields: %o", async (result) => {
    const { server, address } = await serverWithPayload({ result });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
      });
      const submitResult = {
        kind: "SUBMIT_RESULT",
        idempotencyKey: "submit-1",
        authorization: {},
        result: {},
      } as unknown as AffiliateAgentClaimOperation;
      await expect(gateway.perform(submitResult)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        safeMessage: "The affiliate gateway returned an invalid response.",
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it("rejects contradictory admission status fields", async () => {
    const { server, address } = await serverWithPayload({
      result: { status: "open", open: false },
    });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
        workerRole: "COVERAGE_PLANNER",
        workerId: "worker-1",
      });
      await expect(gateway.isAdmissionOpen()).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        safeMessage: "The affiliate gateway returned an invalid response.",
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it("requires a claim grant to match the requested worker identity", async () => {
    const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES.COVERAGE_PLANNER;
    const grant = {
      envelope: {
        schemaVersion: 1 as const,
        role: "COVERAGE_PLANNER" as const,
        queue: "AFFILIATE_COVERAGE" as const,
        lane: "COVERAGE_PLANNING" as const,
        jobId: "job-1",
        claimId: "claim-1",
        claimGeneration: 1,
        lifecycleGeneration: null,
        deploymentContractVersion: 1,
        deploymentContractHash: "a".repeat(64),
        supplyContractVersion: 1,
        supplyContractHash: "a".repeat(64),
        roleContractVersion: roleContract.version,
        roleContractHash: roleContract.hash,
        promptTemplateVersion: promptTemplate.version,
        promptTemplateHash: promptTemplate.hash,
        executionClass: "PRODUCTION_OMP" as const,
        workerId: "worker-1",
        invocationId: "invocation-1",
        workspaceId: "workspace-1",
        claimedAt: "2026-08-30T00:00:00.000Z",
        expiresAt: "2026-08-30T00:20:00.000Z",
        evidenceManifest: {
          schemaVersion: 1 as const,
          entries: [],
          hash: "a".repeat(64),
        },
        permittedCommands: roleContract.permittedCommands,
        supplySourceId: null,
        subject: {
          type: "COVERAGE_PLANNER" as const,
          coverageCellId: "coverage-cell-1",
          assessmentCycleId: "assessment-cycle-1",
        },
      },
      prompt: "prompt",
      token: "token",
      heartbeatIntervalSeconds: 60 as const,
      leaseExpiresAt: "2026-08-30T00:05:00.000Z",
      hardDeadlineAt: "2026-08-30T00:20:00.000Z",
    };
    const { server, address } = await serverWithPayload({ result: grant });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
      });
      const request = {
        idempotencyKey: "claim-1",
        roleCredential: "role-credential",
        role: "COVERAGE_PLANNER" as const,
        workerId: "worker-2",
        invocationId: "invocation-1",
        workspaceAttestation: {
          schemaVersion: 1 as const,
          workspaceId: "workspace-1",
          mode: "READ_WRITE" as const,
          executionClass: "PRODUCTION_OMP" as const,
          workerId: "worker-2",
          invocationId: "invocation-1",
          issuedAt: "2026-08-30T00:00:00.000Z",
          expiresAt: "2026-08-30T00:20:00.000Z",
          signature: "signature",
        },
      };
      await expect(gateway.claim(request)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        safeMessage: "The affiliate gateway returned an invalid response.",
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });
  it("retries admission closure until a restart-safe closed state is verified", async () => {
    const counts = { close: 0, status: 0 };
    const server = createHttpServer((request, response) => {
      const bodyFor = (body: unknown): void => {
        const serialized = JSON.stringify(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(serialized);
      };
      if (request.url === "/v1/affiliate-agent/admission/close") {
        counts.close += 1;
        if (counts.close === 1) {
          response.writeHead(503, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "temporarily unavailable" }));
          return;
        }
        bodyFor({ status: "closed", open: false });
        return;
      }
      if (request.url === "/v1/affiliate-agent/admission") {
        counts.status += 1;
        bodyFor({ status: "closed", open: false });
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("The test gateway did not expose a TCP address.");
    }
    const previousToken = process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN;
    process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN = "operator-token";
    try {
      const gateway = new AffiliateAgentHttpGateway(`http://127.0.0.1:${address.port}`, {
        roleCredential: "role-credential",
      });
      await gateway.haltAdmission();
      await expect(gateway.isAdmissionOpen()).resolves.toBe(false);
      expect(counts.close).toBe(2);
      expect(counts.status).toBe(2);
    } finally {
      if (previousToken === undefined) {
        delete process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN;
      } else {
        process.env.AFFILIATE_GATEWAY_OPERATOR_TOKEN = previousToken;
      }
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });
  it("persists worker admission halt after shutdown aborts the supervisor signal", async () => {
    const counts = { close: 0, status: 0 };
    const server = createHttpServer((request, response) => {
      const body = JSON.stringify({
        result: { status: "closed", open: false },
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(body);
      if (request.url === "/v1/affiliate-agent/admission/supervisor/close") {
        counts.close += 1;
      } else if (request.url === "/v1/affiliate-agent/admission/worker/status") {
        counts.status += 1;
      }
    });
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("The test gateway did not expose a TCP address.");
    }
    const shutdown = new AbortController();
    shutdown.abort();
    try {
      const gateway = new AffiliateAgentHttpGateway(`http://127.0.0.1:${address.port}`, {
        shutdownSignal: shutdown.signal,
        roleCredential: "role-credential",
        workerRole: "COVERAGE_PLANNER",
        workerId: "worker-1",
      });
      await gateway.haltAdmission();
      await expect(gateway.isAdmissionOpen()).resolves.toBe(false);
      expect(counts).toEqual({ close: 1, status: 1 });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });


  it("rejects an unknown gateway error code instead of coercing it", async () => {
    const { server, address } = await serverWithPayload({
      error: {
        code: "UNKNOWN_GATEWAY_ERROR",
        safeMessage: "unknown",
        isRetryable: false,
      },
    });
    try {
      const gateway = new AffiliateAgentHttpGateway(address, {
        roleCredential: "role-credential",
      });
      await expect(
        gateway.claim({} as unknown as AffiliateAgentClaimRequest),
      ).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        safeMessage: "The affiliate gateway returned an invalid response.",
      });
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  it("rejects fractional delays instead of flooring them to zero", () => {
    const environmentName = "AFFILIATE_AGENT_IDLE_SECONDS";
    const previousValue = process.env[environmentName];
    try {
      process.env[environmentName] = "0.5";
      expect(() => positiveSeconds(environmentName, 30)).toThrow(
        "AFFILIATE_AGENT_IDLE_SECONDS must be a positive integer.",
      );

      process.env[environmentName] = "2147484";
      expect(() => positiveSeconds(environmentName, 30)).toThrow(
        "maximum supported timer duration",
      );

      process.env[environmentName] = "2";
      expect(positiveSeconds(environmentName, 30)).toBe(2);
    } finally {
      if (previousValue === undefined) delete process.env[environmentName];
      else process.env[environmentName] = previousValue;
    }
  });
  it("creates an empty isolated workspace with a private reviewer root", async () => {
    const root = await mkdtemp(join(tmpdir(), "affiliate-workspace-root-"));
    try {
      const manager = createWorkspaceManager(root, Buffer.alloc(32, 1));

      const workspace = await manager.create({
        workerId: "reviewer-1",
        invocationId: "invocation-1",
        mode: "READ_ONLY",
      });
      try {
        expect((await stat(root)).mode & 0o777).toBe(0o710);
        expect((await stat(workspace.path)).mode & 0o777).toBe(0o550);
        expect((await stat(workspace.ompConfigRoot!)).mode & 0o777).toBe(0o770);
        expect(await readdir(workspace.path)).toEqual([".omp"]);
      } finally {
        await manager.destroy(workspace.path);
      }
      await expect(readdir(workspace.path)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("removes a stale reviewer workspace for the same worker on restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "affiliate-workspace-restart-"));
    const stalePath = join(root, "reviewer-1-invocation-old-ABC123");
    try {
      await mkdir(join(stalePath, ".omp"), { recursive: true, mode: 0o770 });
      await chmod(stalePath, 0o550);
      const manager = createWorkspaceManager(root, Buffer.alloc(32, 1));
      await manager.recoverStale(staleRecoveryReservation);
      const workspace = await manager.create({
        workerId: "reviewer-1",
        invocationId: "invocation-new",
        mode: "READ_ONLY",
      });
      try {
        expect(await readdir(root)).toEqual([workspace.path.split("/").pop()]);
        await expect(readdir(stalePath)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await manager.destroy(workspace.path);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("removes a stale producer workspace before a reviewer workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "affiliate-workspace-cross-role-"));
    const stalePath = join(root, "producer-1-invocation-old-ABC123");
    try {
      await mkdir(join(stalePath, ".omp"), { recursive: true, mode: 0o770 });
      await chmod(stalePath, 0o770);
      const manager = createWorkspaceManager(root, Buffer.alloc(32, 1));
      await manager.recoverStale(staleRecoveryReservation);
      const workspace = await manager.create({
        workerId: "reviewer-1",
        invocationId: "invocation-new",
        mode: "READ_ONLY",
      });
      try {
        expect(await readdir(root)).toEqual([workspace.path.split("/").pop()]);
        await expect(readdir(stalePath)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await manager.destroy(workspace.path);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
