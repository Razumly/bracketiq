/** @jest-environment node */
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { AffiliateLegacyRepairAdmissionError } from "../affiliateLegacyRepairAdmission";

import {
  AffiliateAgentGatewayError,
  type AffiliateAgentGateway,
} from "../agentGateway";
import type {
  AffiliateAgentInvocationReconciler,
  AffiliateAgentWorkerHealthWriter,
} from "../agentGatewayAdapters";
import {
  createAffiliateAgentGatewayAdmission,
  createAffiliateAgentGatewayArtifactStore,
  createAffiliateAgentGatewayRequestHandler,
  isAdmissionRoleReady,
  validateAffiliateAgentSupervisorHaltCredential,
  validateAffiliateGatewayCredentialCollisions,
  validateAffiliateGatewayOperatorToken,
  validateAffiliateGatewayReplenishmentToken,
  AFFILIATE_GATEWAY_OPERATOR_TOKEN_SENTINEL,
  AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN_SENTINEL,
  type AffiliateAgentBoundedAdmissionRole,
  type AffiliateAgentClaimAdmissionDecision,
  type AffiliateAgentGatewayRequestHandler,
} from "../../../../scripts/run-affiliate-agent-gateway";

const OPERATOR_TOKEN = "operator-token";
const REPLENISHMENT_TOKEN = "replenishment-token-4f3a9e7c";
const SUPERVISOR_HALT_CREDENTIAL = "supervisor-halt-credential-4f3a9e7c";
const WORKER_ROLE_CREDENTIAL = "worker-role-credential-4f3a9e7c";
const PATH_PREFIX = "/v1/affiliate-agent";
describe("affiliate agent gateway artifact store", () => {
  it("preserves stored MIME and distinct capture URLs for local artifacts", async () => {
    const bytes = Buffer.from("<html>captured</html>", "utf8");
    const gatewayArtifactFindFirst = jest.fn(async () => ({ mimeType: "text/html" }));
    const storage = {
      getObjectStream: jest.fn(async () => ({
        stream: Readable.from([bytes]),
      })),
    } as unknown as Parameters<typeof createAffiliateAgentGatewayArtifactStore>[1];
    const database = {
      file: { findMany: jest.fn(async () => []) },
      affiliateSourceIntakeArtifacts: {
        findMany: jest.fn(async () => [{
          sourceUrl: "https://official.example/events",
          finalUrl: "https://official.example/calendar",
        }]),
      },
      affiliateAgentGatewayArtifacts: {
        findFirst: gatewayArtifactFindFirst,
      },
    } as unknown as Parameters<typeof createAffiliateAgentGatewayArtifactStore>[0];

    const artifactStore = createAffiliateAgentGatewayArtifactStore(database, storage);

    await expect(artifactStore.readImmutable({
      fileId: "capture-artifact",
      maximumBytes: 1024,
    })).resolves.toEqual({
      bytes,
      mimeType: "text/html",
      byteSize: bytes.byteLength,
      sourceUrl: "https://official.example/events",
      finalUrl: "https://official.example/calendar",
    });
  });

  it("binds shared file bytes to the exact admitted capture row", async () => {
    const bytes = Buffer.from("<html>Stored official evidence</html>", "utf8");
    const captures = [
      { id: "old-capture", fileId: "shared-file", intakeId: "old-intake", runId: "old-run", sourceUrl: "https://official.example/old", finalUrl: "https://official.example/old-final", mimeType: "text/html" },
      { id: "admitted-capture", fileId: "shared-file", intakeId: "current-intake", runId: "current-run", sourceUrl: "https://official.example/events", finalUrl: "https://official.example/calendar", mimeType: "text/html" },
    ];
    const database = {
      file: {
        findUnique: async () => ({ path: "intakes/run/page.html", bucket: "evidence", mimeType: "text/html" }),
      },
      affiliateSourceIntakeArtifacts: {
        findUnique: async ({ where }: { where: { id: string } }) => captures.find((row) => row.id === where.id),
      },
    } as unknown as Parameters<typeof createAffiliateAgentGatewayArtifactStore>[0];
    const storage = {
      getObjectStream: async ({ key, bucket }: { key: string; bucket?: string }) => {
        if (key !== "intakes/run/page.html" || bucket !== "evidence") throw new Error("Object not found");
        return { stream: Readable.from([bytes]) };
      },
    } as unknown as Parameters<typeof createAffiliateAgentGatewayArtifactStore>[1];
    const artifact = await createAffiliateAgentGatewayArtifactStore(database, storage).readImmutable({
      fileId: "intake-artifact:admitted-capture",
      maximumBytes: 1024,
    });
    expect(artifact.sourceUrl).toBe("https://official.example/events");
    expect(artifact.mimeType).toBe("text/html");
    expect(artifact.bytes).toEqual(bytes);
    expect(artifact.finalUrl).toBe("https://official.example/calendar");
    expect(artifact.intakeId).toBe("current-intake");
    expect(artifact.runId).toBe("current-run");
  });
});

type RunningServer = Readonly<{
  server: Server;
  baseUrl: string;
}>;

const startServer = async (
  handler: AffiliateAgentGatewayRequestHandler,
): Promise<RunningServer> => {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected a TCP address for the test gateway.");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

const stopServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

describe("affiliate agent gateway operator token startup validation", () => {
  it("rejects the public sentinel without echoing the token", () => {
    let error: unknown;
    try {
      validateAffiliateGatewayOperatorToken(AFFILIATE_GATEWAY_OPERATOR_TOKEN_SENTINEL);
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(Error);
    if (error instanceof Error) {
      expect(error.message).not.toContain(AFFILIATE_GATEWAY_OPERATOR_TOKEN_SENTINEL);
    }
  });

  it("rejects blank operator tokens", () => {
    expect(() => validateAffiliateGatewayOperatorToken(" \t\n ")).toThrow(
      "AFFILIATE_GATEWAY_OPERATOR_TOKEN is required.",
    );
  });

  it.each([
    "REVIEWED_GATEWAY_OPERATOR_TOKEN",
    "replace-me",
    "operator-token",
  ])("rejects obvious placeholder token %s", (value) => {
    expect(() => validateAffiliateGatewayOperatorToken(value)).toThrow(
      "AFFILIATE_GATEWAY_OPERATOR_TOKEN must be a reviewed non-placeholder value.",
    );
  });

  it("accepts a reviewed non-placeholder token", () => {
    const token = "reviewed-operator-token-4f3a9e7c";
    expect(validateAffiliateGatewayOperatorToken(token)).toBe(token);
  });
});
describe("affiliate agent gateway replenishment token startup validation", () => {
  it("rejects blank replenishment tokens", () => {
    expect(() => validateAffiliateGatewayReplenishmentToken(" \t\n ")).toThrow(
      "AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN is required.",
    );
  });

  it("rejects the public sentinel", () => {
    expect(() => validateAffiliateGatewayReplenishmentToken(
      AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN_SENTINEL,
    )).toThrow(
      "AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be a reviewed non-placeholder value.",
    );
  });

  it("rejects an obvious replenishment token placeholder", () => {
    expect(() => validateAffiliateGatewayReplenishmentToken(
      "REVIEWED_GATEWAY_REPLENISHMENT_TOKEN",
    )).toThrow(
      "AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be a reviewed non-placeholder value.",
    );
  });

  it("accepts a reviewed non-placeholder token", () => {
    const token = "reviewed-replenishment-token-4f3a9e7c";
    expect(validateAffiliateGatewayReplenishmentToken(token)).toBe(token);
  });
});
describe("affiliate agent supervisor halt credential startup validation", () => {
  it("rejects blank credentials", () => {
    expect(() => validateAffiliateAgentSupervisorHaltCredential(" \t\n ")).toThrow(
      "AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL is required.",
    );
  });

  it("rejects short or obvious placeholder credentials", () => {
    expect(() => validateAffiliateAgentSupervisorHaltCredential("short")).toThrow(
      "AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL must be at least 32 bytes.",
    );
    expect(() => validateAffiliateAgentSupervisorHaltCredential(
      "__REPLACE_WITH_PRIVATE_REVIEWED_SUPERVISOR_HALT_CREDENTIAL__",
    )).toThrow(
      "AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL must be a reviewed non-placeholder value.",
    );
  });

  it("accepts a reviewed non-placeholder credential", () => {
    const credential = "reviewed-supervisor-halt-credential-4f3a9e7c";
    expect(validateAffiliateAgentSupervisorHaltCredential(credential)).toBe(credential);
  });
});
describe("affiliate agent gateway credential collision startup validation", () => {
  const workerCredentials = [
    "mapping-producer-credential-4f3a9e7c",
    "mapping-producer-credential-5f3a9e7c",
  ];

  it("rejects operator and worker credential collisions", () => {
    expect(() => validateAffiliateGatewayCredentialCollisions(
      workerCredentials[0],
      "reviewed-replenishment-token-4f3a9e7c",
      "reviewed-supervisor-halt-credential-4f3a9e7c",
      workerCredentials,
    )).toThrow(
      "AFFILIATE_GATEWAY_OPERATOR_TOKEN must be distinct from every worker credential.",
    );
  });

  it("rejects operator and supervisor-halt credential collisions without echoing credentials", () => {
    const collision = workerCredentials[0];
    expect(() => validateAffiliateGatewayCredentialCollisions(
      collision,
      "reviewed-replenishment-token-4f3a9e7c",
      collision,
      workerCredentials.slice(1),
    )).toThrow(
      "AFFILIATE_GATEWAY_OPERATOR_TOKEN must be distinct from AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL.",
    );
    try {
      validateAffiliateGatewayCredentialCollisions(
        collision,
        "reviewed-replenishment-token-4f3a9e7c",
        collision,
        workerCredentials.slice(1),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(collision);
    }
  });
  it("rejects replenishment and worker credential collisions without echoing credentials", () => {
    const collision = workerCredentials[0];
    expect(() => validateAffiliateGatewayCredentialCollisions(
      "reviewed-operator-token-4f3a9e7c",
      collision,
      "reviewed-supervisor-halt-credential-4f3a9e7c",
      workerCredentials,
    )).toThrow(
      "AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be distinct from every worker credential.",
    );
    try {
      validateAffiliateGatewayCredentialCollisions(
        "reviewed-operator-token-4f3a9e7c",
        collision,
        "reviewed-supervisor-halt-credential-4f3a9e7c",
        workerCredentials,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(collision);
    }
  });

  it("rejects replenishment and supervisor-halt credential collisions without echoing credentials", () => {
    const collision = "replenishment-supervisor-collision-4f3a9e7c";
    expect(() => validateAffiliateGatewayCredentialCollisions(
      "reviewed-operator-token-4f3a9e7c",
      collision,
      collision,
      workerCredentials,
    )).toThrow(
      "AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN must be distinct from AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL.",
    );
    try {
      validateAffiliateGatewayCredentialCollisions(
        "reviewed-operator-token-4f3a9e7c",
        collision,
        collision,
        workerCredentials,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(collision);
    }
  });
});

describe("affiliate agent gateway admission HTTP boundary", () => {
  let running: RunningServer;
  let readinessValue = false;
  let health: jest.Mock<Promise<void>, []>;
  let readiness: jest.Mock<
    Promise<boolean>,
    [role?: AffiliateAgentBoundedAdmissionRole, workerId?: string]
  >;
  let claimAdmissionReadiness: jest.Mock<
    Promise<AffiliateAgentClaimAdmissionDecision>,
    [input: unknown]
  >;
  const admission = createAffiliateAgentGatewayAdmission();
  const leaseRequest = {
    role: "COVERAGE_PLANNER",
    workerId: "coverage-planner",
    roleCredential: "worker-credential",
    leaseSeconds: 60,
  };
  const gateway = {
  replenishment: jest.fn(async () => ({
    status: "RECONCILED" as const,
    rolloutCohorts: ["reviewed-cohort"],
    reconciliations: [],
  })),
    claim: jest.fn(async () => null),
    perform: jest.fn(async () => null),
    reconcile: jest.fn(async () => ({
      examinedClaims: 0,
      expiredClaims: 0,
      examinedReceipts: 0,
      recoveredReceipts: 0,
      completedReceipts: 0,
      unresolvedReceipts: 0,
      isAdmissionHalted: false,
    })),
  } as unknown as AffiliateAgentGateway;

  const workerHealth: AffiliateAgentWorkerHealthWriter = {
    heartbeat: jest.fn(async () => undefined),
  };
  const verifyWorkerCredential = jest.fn(async (
    input: Readonly<{ role: string; workerId: string; roleCredential: string }>,
  ) => input.roleCredential !== "random-credential");
  const invocationReconciler = {
    reconcileInvocation: jest.fn(async () => ({ kind: "TERMINAL_ACCEPTED" as const })),
  } as unknown as AffiliateAgentInvocationReconciler;
  const legacyRepairAdmission = jest.fn(async () => ({ proposedWrites: [], reportHash: "a".repeat(64) }));
  const legacyRepairRetry = jest.fn(async () => ({
    requestedGatewayJobIds: ["gateway-parent-boomtown", "gateway-parent-softball"],
    selectedGatewayJobIds: ["gateway-parent-boomtown", "gateway-parent-softball"],
    reportHash: "a".repeat(64),
  }));
  beforeEach(async () => {
    jest.clearAllMocks();
    readinessValue = false;
    await admission.close();
    health = jest.fn(async () => undefined);
    readiness = jest.fn(async () => readinessValue);
    claimAdmissionReadiness = jest.fn(async (
      _input: unknown,
    ): Promise<AffiliateAgentClaimAdmissionDecision> => "READY");
    running = await startServer(createAffiliateAgentGatewayRequestHandler({
      legacyRepairAdmission,
      legacyRepairRetry,
      replenishment: gateway.replenishment,
      gateway,
      invocationReconciler,
      health,
      readiness,
      claimAdmissionReadiness,
      workerHealth,
      verifyWorkerCredential,
      admission,
      operatorToken: OPERATOR_TOKEN,
      replenishmentToken: REPLENISHMENT_TOKEN,
      supervisorHaltCredential: SUPERVISOR_HALT_CREDENTIAL,
      pathPrefix: PATH_PREFIX,
    }));
  });

  afterEach(async () => {
    await stopServer(running.server);
  });

  const requestAt = (
    path: string,
    token = OPERATOR_TOKEN,
    method = "GET",
    body?: unknown,
  ) => fetch(
    `${running.baseUrl}${path}`,
    {
      method,
      headers: {
        ...(token === "" ? {} : { "x-affiliate-gateway-operator-token": token }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );

  const request = (
    path: string,
    token = OPERATOR_TOKEN,
    method = "GET",
    body?: unknown,
  ) => requestAt(
    `${PATH_PREFIX}${path}`,
    token,
    method,
    body,
  );
  const requestReplenishment = (
    path: string,
    token = REPLENISHMENT_TOKEN,
    method = "GET",
    body?: unknown,
  ) => fetch(
    `${running.baseUrl}${PATH_PREFIX}${path}`,
    {
      method,
      headers: {
        ...(token === "" ? {} : { "x-affiliate-gateway-replenishment-token": token }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const requestSupervisor = (credential = WORKER_ROLE_CREDENTIAL) => fetch(
    `${running.baseUrl}${PATH_PREFIX}/admission/supervisor/close`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "SUPPLY_REVIEWER",
        workerId: "supply-reviewer-1",
        roleCredential: credential,
      }),
    },
  );

  it("keeps legacy repair admission operator-only and rejects unreviewed apply", async () => {
    const denied = await request("/legacy-repair/admission", WORKER_ROLE_CREDENTIAL, "POST", {
      mode: "PREVIEW",
    });
    expect(denied.status).toBe(401);
    const unreviewed = await request("/legacy-repair/admission", OPERATOR_TOKEN, "POST", {
      mode: "APPLY",
      operatorId: "operator",
    });
    expect(unreviewed.status).toBe(400);
    const oversized = await request("/legacy-repair/admission", OPERATOR_TOKEN, "POST", {
      mode: "PREVIEW",
      limit: 21,
    });
    expect(oversized.status).toBe(400);
    const impersonated = await request("/legacy-repair/admission", OPERATOR_TOKEN, "POST", {
      mode: "APPLY",
      expectedReportHash: "a".repeat(64),
      operatorId: "another-user",
    });
    expect(impersonated.status).toBe(400);
    expect(legacyRepairAdmission).not.toHaveBeenCalled();
  });

  it("returns reviewed admission drift as a non-retryable conflict", async () => {
    legacyRepairAdmission.mockRejectedValueOnce(new AffiliateLegacyRepairAdmissionError(
      "ADMISSION_REPORT_DRIFT",
      "The reviewed report no longer matches.",
      { observedReportHash: "b".repeat(64) },
    ));
    const response = await request("/legacy-repair/admission", OPERATOR_TOKEN, "POST", {
      mode: "APPLY",
      expectedReportHash: "a".repeat(64),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "ADMISSION_REPORT_DRIFT", isRetryable: false },
    });
  });

  it("keeps bounded legacy repair retry operator-only and validates its reviewed input", async () => {
    let response = await request("/legacy-repair/retry", WORKER_ROLE_CREDENTIAL, "POST", {
      mode: "PREVIEW",
      gatewayJobIds: ["gateway-parent-softball"],
      reason: "authorized bounded retry",
    });
    expect(response.status).toBe(401);

    response = await request("/legacy-repair/retry", OPERATOR_TOKEN, "POST", {
      mode: "PREVIEW",
      gatewayJobIds: ["gateway-parent-softball", "gateway-parent-softball"],
      reason: "authorized bounded retry",
    });
    expect(response.status).toBe(400);

    response = await request("/legacy-repair/retry", OPERATOR_TOKEN, "POST", {
      mode: "PREVIEW",
      gatewayJobIds: ["gateway-parent-softball"],
      reason: "authorized bounded retry",
      expectedReportHash: "a".repeat(64),
    });
    expect(response.status).toBe(400);

    response = await request("/legacy-repair/retry", OPERATOR_TOKEN, "POST", {
      mode: "APPLY",
      gatewayJobIds: ["gateway-parent-softball"],
      reason: "authorized bounded retry",
    });
    expect(response.status).toBe(400);
    expect(legacyRepairRetry).not.toHaveBeenCalled();
  });

  it("dispatches a reviewed legacy repair retry and returns safe admission conflicts", async () => {
    let response = await request("/legacy-repair/retry", OPERATOR_TOKEN, "POST", {
      mode: "PREVIEW",
      gatewayJobIds: ["gateway-parent-softball", "gateway-parent-boomtown"],
      reason: "authorized bounded retry",
    });
    expect(response.status).toBe(200);
    expect(legacyRepairRetry).toHaveBeenCalledWith({
      mode: "PREVIEW",
      gatewayJobIds: ["gateway-parent-softball", "gateway-parent-boomtown"],
      reason: "authorized bounded retry",
    });

    legacyRepairRetry.mockRejectedValueOnce(new AffiliateLegacyRepairAdmissionError(
      "ADMISSION_REPORT_DRIFT",
      "The reviewed retry report no longer matches.",
      { observedReportHash: "b".repeat(64) },
    ));
    response = await request("/legacy-repair/retry", OPERATOR_TOKEN, "POST", {
      mode: "APPLY",
      gatewayJobIds: ["gateway-parent-softball"],
      reason: "authorized bounded retry",
      expectedReportHash: "a".repeat(64),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "ADMISSION_REPORT_DRIFT", isRetryable: false },
    });
  });

  it("rejects routes outside the configured prefix before dispatching and dispatches prefixed routes", async () => {
    const gatewayRoutes = [
      { path: "/claim", consumer: gateway.claim },
      { path: "/perform", consumer: gateway.perform },
      { path: "/reconcile/invocation", consumer: invocationReconciler.reconcileInvocation },
      { path: "/replenishment", consumer: gateway.replenishment },
      { path: "/reconcile", consumer: gateway.reconcile },
    ] as const;

    for (const { path, consumer } of gatewayRoutes) {
      const response = await requestAt(path, OPERATOR_TOKEN, "POST");
      expect(response.status).toBe(404);
      expect(consumer).not.toHaveBeenCalled();
    }

    for (const { path, consumer } of gatewayRoutes) {
      const response = path === "/replenishment"
        ? await requestReplenishment(path, REPLENISHMENT_TOKEN, "POST")
        : await request(path, OPERATOR_TOKEN, "POST");
      expect(response.status).toBe(200);
      expect(consumer).toHaveBeenCalledTimes(1);
    }

    let response = await requestAt("/healthz");
    expect(response.status).toBe(404);
    response = await requestAt("/readiness");
    expect(response.status).toBe(404);
    response = await requestAt("/admission");
    expect(response.status).toBe(404);
    response = await requestAt("/admission/open", OPERATOR_TOKEN, "POST");
    expect(response.status).toBe(404);
    response = await requestAt("/admission/close", OPERATOR_TOKEN, "POST");
    expect(response.status).toBe(404);
    response = await requestAt("/worker/heartbeat", OPERATOR_TOKEN, "POST");
    expect(response.status).toBe(404);
    expect(health).not.toHaveBeenCalled();
    expect(readiness).not.toHaveBeenCalled();
    expect(workerHealth.heartbeat).not.toHaveBeenCalled();
  });
  it("requires the dedicated replenishment authorization for replenishment cadence", async () => {
    let response = await requestReplenishment("/replenishment", "", "POST", {});
    expect(response.status).toBe(401);
    expect(gateway.replenishment).not.toHaveBeenCalled();

    response = await requestReplenishment(
      "/replenishment",
      "invalid-replenishment-token",
      "POST",
      {},
    );
    expect(response.status).toBe(401);
    expect(gateway.replenishment).not.toHaveBeenCalled();

    response = await request("/replenishment", OPERATOR_TOKEN, "POST", {});
    expect(response.status).toBe(401);
    expect(gateway.replenishment).not.toHaveBeenCalled();

    response = await requestReplenishment("/replenishment", REPLENISHMENT_TOKEN, "POST", {});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: {
        status: "RECONCILED",
        rolloutCohorts: ["reviewed-cohort"],
        reconciliations: [],
      },
    });
    expect(gateway.replenishment).toHaveBeenCalledTimes(1);
  });
  it("does not accept the replenishment credential on operator routes", async () => {
    let response = await requestReplenishment("/admission");
    expect(response.status).toBe(401);
    expect(admission.isOpen()).toBe(false);

    response = await requestReplenishment("/reconcile", REPLENISHMENT_TOKEN, "POST", {});
    expect(response.status).toBe(401);
    expect(gateway.reconcile).not.toHaveBeenCalled();
  });
  it("rechecks lane readiness for new claims while allowing exact idempotent replays", async () => {
    readinessValue = true;
    const mappingLease = {
      role: "MAPPING_PRODUCER",
      workerId: "mapping-producer-1",
      roleCredential: "worker-credential",
      leaseSeconds: 1_200,
    };
    let response = await request("/admission/open", OPERATOR_TOKEN, "POST", mappingLease);
    expect(response.status).toBe(200);

    const claim = {
      idempotencyKey: "mapping-claim-replay",
      role: "MAPPING_PRODUCER",
      workerId: "mapping-producer-1",
    };
    claimAdmissionReadiness.mockResolvedValueOnce("NOT_READY");
    response = await request("/claim", OPERATOR_TOKEN, "POST", claim);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: null });
    expect(claimAdmissionReadiness).toHaveBeenCalledWith(claim);
    expect(gateway.claim).not.toHaveBeenCalled();

    claimAdmissionReadiness.mockResolvedValueOnce("REPLAY");
    response = await request("/claim", OPERATOR_TOKEN, "POST", claim);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: null });
    expect(gateway.claim).toHaveBeenCalledWith(claim);
  });
  it("reports claim authentication and validation failures before stale-readiness no-work", async () => {
    const claim = {
      idempotencyKey: "mapping-claim-invalid",
      role: "MAPPING_PRODUCER",
      workerId: "mapping-producer-1",
      roleCredential: "revoked-worker-credential",
      workspaceAttestation: {},
    };
    claimAdmissionReadiness.mockRejectedValueOnce(new AffiliateAgentGatewayError({
      code: "ROLE_CREDENTIAL_INVALID",
      safeMessage: "The role credential is invalid for this claim request.",
      isRetryable: false,
    }));
    let response = await request("/claim", OPERATOR_TOKEN, "POST", claim);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ROLE_CREDENTIAL_INVALID",
        safeMessage: "The role credential is invalid for this claim request.",
        isRetryable: false,
      },
    });

    claimAdmissionReadiness.mockRejectedValueOnce(new AffiliateAgentGatewayError({
      code: "REVIEW_WORKSPACE_INVALID",
      safeMessage: "The workspace attestation is invalid or expired.",
      isRetryable: false,
    }));
    response = await request("/claim", OPERATOR_TOKEN, "POST", claim);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REVIEW_WORKSPACE_INVALID",
        safeMessage: "The workspace attestation is invalid or expired.",
        isRetryable: false,
      },
    });
    expect(gateway.claim).not.toHaveBeenCalled();
  });



  it("records an authenticated worker heartbeat without dispatching claim work", async () => {
    const heartbeat = {
      workerId: "mapping-producer-1",
      role: "MAPPING_PRODUCER",
      roleCredential: "worker-credential",
    };
    let response = await fetch(`${running.baseUrl}${PATH_PREFIX}/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(heartbeat),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: { accepted: true } });
    expect(verifyWorkerCredential).toHaveBeenCalledWith(heartbeat);
    expect(workerHealth.heartbeat).toHaveBeenCalledWith({
      workerId: heartbeat.workerId,
      role: heartbeat.role,
      now: expect.any(Date),
    });
    expect(gateway.claim).not.toHaveBeenCalled();

    verifyWorkerCredential.mockResolvedValueOnce(false);
    response = await fetch(`${running.baseUrl}${PATH_PREFIX}/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(heartbeat),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(workerHealth.heartbeat).toHaveBeenCalledTimes(1);
  });
  it("halts admission on Prisma database authorization loss but not transient database errors", async () => {
    const heartbeat = {
      workerId: "mapping-producer-1",
      role: "MAPPING_PRODUCER",
      roleCredential: "worker-credential",
    };
    await admission.open();
    workerHealth.heartbeat.mockImplementationOnce(async () => {
      throw {
        name: "PrismaClientKnownRequestError",
        code: "P2010",
        meta: {
          code: "42501",
          message: "permission denied for table affiliateAgentWorkerHealth",
        },
      };
    });

    let response = await fetch(`${running.baseUrl}${PATH_PREFIX}/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(heartbeat),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "GATEWAY_ADMISSION_HALTED",
        safeMessage: "Gateway admission is halted because gateway database authorization failed.",
        isRetryable: false,
      },
    });
    expect(admission.isOpen()).toBe(false);

    await admission.open();
    workerHealth.heartbeat.mockImplementationOnce(async () => {
      throw {
        name: "PrismaClientKnownRequestError",
        code: "P2024",
        meta: { timeout: 5_000 },
      };
    });
    response = await fetch(`${running.baseUrl}${PATH_PREFIX}/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(heartbeat),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        safeMessage: "Gateway request failed.",
        isRetryable: true,
      },
    });
    expect(admission.isOpen()).toBe(true);
    await admission.open();
    workerHealth.heartbeat.mockImplementationOnce(async () => {
      throw {
        name: "PrismaClientKnownRequestError",
        code: "P2010",
        meta: {
          code: "42P01",
          message: "relation affiliateAgentWorkerHealth does not exist",
        },
      };
    });
    response = await fetch(`${running.baseUrl}${PATH_PREFIX}/worker/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(heartbeat),
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        safeMessage: "Gateway request failed.",
        isRetryable: true,
      },
    });
    expect(admission.isOpen()).toBe(true);
  });

  it("halts admission for direct, original, and nested database authorization codes", async () => {
    const heartbeat = {
      workerId: "mapping-producer-1",
      role: "MAPPING_PRODUCER",
      roleCredential: "worker-credential",
    };
    const authorizationErrors: readonly unknown[] = [
      { code: "P1000" },
      { code: "P1010" },
      { code: "28P01" },
      { originalCode: "28000" },
      { code: "P2010", meta: { originalCode: "42501" } },
      {
        code: "P2010",
        meta: { driverAdapterError: { originalCode: "28P01" } },
      },
      { code: "P2010", meta: { cause: { code: "28000" } } },
    ];

    for (const error of authorizationErrors) {
      await admission.open();
      workerHealth.heartbeat.mockImplementationOnce(async () => {
        throw error;
      });
      const response = await fetch(`${running.baseUrl}${PATH_PREFIX}/worker/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(heartbeat),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "GATEWAY_ADMISSION_HALTED",
          isRetryable: false,
        },
      });
      expect(admission.isOpen()).toBe(false);
    }
  });

  it("allows an authenticated worker to reconcile without granting admission close authority", async () => {
    const worker = {
      role: "MAPPING_PRODUCER",
      workerId: "mapping-producer-1",
      roleCredential: "worker-credential",
    };
    let response = await request("/reconcile/worker", "", "POST", worker);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: {
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
      },
    });
    expect(verifyWorkerCredential).toHaveBeenCalledWith(worker);
    expect(gateway.reconcile).toHaveBeenCalledWith({ limit: 1 });

    response = await request("/admission/worker/close", "", "POST", worker);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(admission.isOpen()).toBe(false);

    response = await request("/admission/worker/status", "", "POST", worker);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { status: "closed", open: false },
    });
  });
  it("closes in-memory admission when reconciliation reports a durable halt", async () => {
    const haltedReport = {
      examinedClaims: 1,
      expiredClaims: 0,
      examinedReceipts: 1,
      recoveredReceipts: 0,
      completedReceipts: 0,
      unresolvedReceipts: 1,
      isAdmissionHalted: true,
    } as const;
    await admission.open();
    gateway.reconcile.mockResolvedValueOnce(haltedReport);

    const response = await request("/reconcile", OPERATOR_TOKEN, "POST", {});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: haltedReport });
    expect(gateway.reconcile).toHaveBeenCalledWith({});
    expect(admission.isOpen()).toBe(false);
  });
  it("closes admission when reconciliation fails before generic service unavailable", async () => {
    await admission.open();
    gateway.reconcile.mockRejectedValueOnce(new Error("reconciliation health failed."));

    const response = await request("/reconcile", OPERATOR_TOKEN, "POST", {});

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        safeMessage: "Gateway request failed.",
        isRetryable: true,
      },
    });
    expect(admission.isOpen()).toBe(false);
  });

  it("closes in-memory admission when invocation reconciliation discovers a global halt", async () => {
    const haltError = new AffiliateAgentGatewayError({
      code: "GATEWAY_ADMISSION_HALTED",
      safeMessage: "Gateway admission is halted until an impossible receipt state is resolved.",
      isRetryable: false,
    });
    const reconcileInvocation = invocationReconciler.reconcileInvocation as jest.Mock;
    reconcileInvocation.mockRejectedValueOnce(haltError);
    await admission.open();

    const response = await request("/reconcile/invocation", OPERATOR_TOKEN, "POST", {});
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "GATEWAY_ADMISSION_HALTED",
        safeMessage: "Gateway admission is halted until an impossible receipt state is resolved.",
        isRetryable: false,
      },
    });
    expect(admission.isOpen()).toBe(false);
  });

  it("closes admission when live contract health fails", async () => {
    await admission.open();
    const failure = new Error("active contract bundle mismatch.");
    failure.name = "ZodError";
    health.mockRejectedValueOnce(failure);

    const response = await request("/healthz");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        safeMessage: "Gateway request failed.",
        isRetryable: true,
      },
    });
    expect(admission.isOpen()).toBe(false);

    readinessValue = true;
    const reopenResponse = await request("/admission/open", OPERATOR_TOKEN, "POST", leaseRequest);
    expect(reopenResponse.status).toBe(200);
    expect(admission.isOpen()).toBe(true);
  });

  it("closes admission for an unpublished active supply contract and requires explicit reopen", async () => {
    await admission.open();
    health.mockRejectedValueOnce(new Error(
      "No active Affiliate Supply Contract is published for this rollout cohort.",
    ));

    let response = await request("/healthz");

    expect(response.status).toBe(503);
    expect(admission.isOpen()).toBe(false);

    health.mockResolvedValueOnce(undefined);
    response = await request("/healthz");
    expect(response.status).toBe(200);
    expect(admission.isOpen()).toBe(false);

    readinessValue = true;
    response = await request("/admission/open", OPERATOR_TOKEN, "POST", leaseRequest);
    expect(response.status).toBe(200);
    expect(admission.isOpen()).toBe(true);
  });

  it("keeps admission open for non-authority liveness failures", async () => {
    await admission.open();
    health.mockRejectedValueOnce(new Error("transient liveness failure."));

    const response = await request("/healthz");

    expect(response.status).toBe(503);
    expect(admission.isOpen()).toBe(true);
  });

  it("rejects child or random worker credential requests without mutating global admission", async () => {
    await admission.open();
    let response = await request("/admission/worker/close", "", "POST", {});
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(admission.isOpen()).toBe(true);

    response = await requestSupervisor("random-credential");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(admission.isOpen()).toBe(true);
  });

  it("allows an authenticated supervisor worker to close global admission", async () => {
    await admission.open();

    const response = await requestSupervisor();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { status: "closed", open: false },
    });
    expect(admission.isOpen()).toBe(false);
  });



  it("requires downstream readiness before opening and keeps health/readiness available during close containment", async () => {
    let response = await request("/admission", "wrong-token");
    expect(response.status).toBe(401);

    response = await request("/admission");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "closed", open: false });
    response = await request("/admission/open", "wrong-token", "POST");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });

    response = await request("/admission/open", OPERATOR_TOKEN, "POST", leaseRequest);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "waiting",
      open: false,
      ready: false,
    });
    expect(admission.isOpen()).toBe(false);

    readinessValue = true;
    response = await request("/admission/open", OPERATOR_TOKEN, "POST", leaseRequest);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "open",
      open: true,
      lease: {
        role: "COVERAGE_PLANNER",
        workerId: leaseRequest.workerId,
        remainingClaims: 1,
        expiresAt: expect.any(String),
      },
    });

    response = await request("/admission/open", OPERATOR_TOKEN, "POST", leaseRequest);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "open",
      open: true,
      lease: {
        role: "COVERAGE_PLANNER",
        workerId: leaseRequest.workerId,
        remainingClaims: 1,
        expiresAt: expect.any(String),
      },
    });
    expect(readiness).toHaveBeenCalledTimes(3);

    readinessValue = false;
    response = await request("/admission/close", OPERATOR_TOKEN, "POST");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "closed", open: false });

    response = await request("/admission/close", OPERATOR_TOKEN, "POST");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "closed", open: false });

    response = await request("/admission");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "closed", open: false });

    response = await request("/healthz");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(health).toHaveBeenCalledTimes(1);

    response = await request("/readiness");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "waiting", ready: false });
  });
  it("scopes readiness to the exact requested role and worker", async () => {
    readiness.mockImplementation(async (role, workerId) => (
      role === "MAPPING_PRODUCER" && workerId === "mapping-producer"
    ));

    let response = await request(
      "/readiness?role=MAPPING_PRODUCER&workerId=mapping-producer",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready", ready: true });
    expect(readiness).toHaveBeenCalledWith("MAPPING_PRODUCER", "mapping-producer");

    response = await request("/readiness?role=MAPPING_PRODUCER");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "waiting", ready: false });
    expect(readiness).toHaveBeenCalledTimes(1);
  });
  it("opens a healthy downstream lane without requiring the other lane", async () => {
    const now = new Date("2026-06-15T00:00:00.000Z");
    const workers = [
      {
        workerId: "mapping-producer-1",
        role: "MAPPING_PRODUCER",
        status: "HEALTHY",
        heartbeatAt: new Date("2026-06-14T23:59:00.000Z"),
        leaseExpiresAt: new Date("2026-06-15T00:05:00.000Z"),
      },
      {
        workerId: "mapping-producer-2",
        role: "MAPPING_PRODUCER",
        status: "HEALTHY",
        heartbeatAt: new Date("2026-06-14T23:59:00.000Z"),
        leaseExpiresAt: new Date("2026-06-15T00:05:00.000Z"),
      },
      {
        workerId: "supply-reviewer-1",
        role: "SUPPLY_REVIEWER",
        status: "HEALTHY",
        heartbeatAt: new Date("2026-06-14T23:59:00.000Z"),
        leaseExpiresAt: new Date("2026-06-15T00:05:00.000Z"),
      },
      {
        workerId: "supply-reviewer-2",
        role: "SUPPLY_REVIEWER",
        status: "HEALTHY",
        heartbeatAt: new Date("2026-06-14T23:59:00.000Z"),
        leaseExpiresAt: new Date("2026-06-14T23:59:30.000Z"),
      },
    ];
    readiness.mockImplementation(async (role, workerId) => (
      isAdmissionRoleReady(workers, now, role, workerId)
    ));

    const mappingLease = {
      ...leaseRequest,
      role: "MAPPING_PRODUCER",
      workerId: "mapping-producer-1",
    };
    let response = await request(
      "/admission/open",
      OPERATOR_TOKEN,
      "POST",
      mappingLease,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "open",
      open: true,
      lease: {
        role: "MAPPING_PRODUCER",
        workerId: "mapping-producer-1",
        remainingClaims: 1,
      },
    });

    await admission.close();
    const reviewerLease = {
      ...leaseRequest,
      role: "SUPPLY_REVIEWER",
      workerId: "supply-reviewer-1",
    };
    response = await request(
      "/admission/open",
      OPERATOR_TOKEN,
      "POST",
      reviewerLease,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "open",
      open: true,
      lease: {
        role: "SUPPLY_REVIEWER",
        workerId: "supply-reviewer-1",
        remainingClaims: 1,
      },
    });

    await admission.close();
    const noHealthyReviewers = workers.map((worker) => (
      worker.role === "SUPPLY_REVIEWER"
        ? {
          ...worker,
          status: "UNHEALTHY",
          heartbeatAt: null,
          leaseExpiresAt: null,
        }
        : worker
    ));
    readiness.mockImplementation(async (role, workerId) => (
      isAdmissionRoleReady(noHealthyReviewers, now, role, workerId)
    ));
    response = await request(
      "/admission/open",
      OPERATOR_TOKEN,
      "POST",
      mappingLease,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "waiting",
      open: false,
      ready: false,
    });

    readiness.mockImplementation(async (role, workerId) => (
      isAdmissionRoleReady(workers, now, role, workerId)
    ));
    await admission.close();
    response = await request(
      "/admission/open",
      OPERATOR_TOKEN,
      "POST",
      leaseRequest,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "waiting",
      open: false,
      ready: false,
    });
  });


  it("opens bounded producer and reviewer windows through role-aware readiness", async () => {
    readinessValue = true;
    const mappingLease = {
      ...leaseRequest,
      role: "MAPPING_PRODUCER",
      workerId: "mapping-producer",
    };
    let response = await request(
      "/admission/open",
      OPERATOR_TOKEN,
      "POST",
      mappingLease,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "open",
      lease: {
        role: "MAPPING_PRODUCER",
        workerId: "mapping-producer",
        remainingClaims: 1,
      },
    });
    expect(readiness).toHaveBeenLastCalledWith("MAPPING_PRODUCER", "mapping-producer");

    await admission.close();
    const reviewerLease = {
      ...leaseRequest,
      role: "SUPPLY_REVIEWER",
      workerId: "supply-reviewer",
    };
    response = await request(
      "/admission/open",
      OPERATOR_TOKEN,
      "POST",
      reviewerLease,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "open",
      lease: {
        role: "SUPPLY_REVIEWER",
        workerId: "supply-reviewer",
        remainingClaims: 1,
      },
    });
    expect(readiness).toHaveBeenLastCalledWith("SUPPLY_REVIEWER", "supply-reviewer");
  });
  it("opens a bounded human-directed window through the exact worker credential", async () => {
    readinessValue = true;
    const humanLease = {
      role: "HUMAN_DIRECTED_EXECUTOR",
      workerId: "human-directed-executor",
      roleCredential: "human-worker-credential",
      leaseSeconds: 120,
    };
    const response = await request(
      "/admission/open",
      OPERATOR_TOKEN,
      "POST",
      humanLease,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "open",
      open: true,
      lease: {
        role: humanLease.role,
        workerId: humanLease.workerId,
        remainingClaims: 1,
      },
    });
    expect(readiness).toHaveBeenLastCalledWith(
      humanLease.role,
      humanLease.workerId,
    );
    expect(verifyWorkerCredential).toHaveBeenCalledWith(humanLease);
  });


  it("starts a fresh process admission closed", async () => {
    await admission.open();
    expect(admission.isOpen()).toBe(true);
    expect(createAffiliateAgentGatewayAdmission().isOpen()).toBe(false);
  });

  it("authenticates close without changing the current admission state", async () => {
    readinessValue = true;
    await request("/admission/open", OPERATOR_TOKEN, "POST", leaseRequest);

    const response = await request("/admission/close", "wrong-token", "POST");
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(admission.isOpen()).toBe(true);
  });
});
