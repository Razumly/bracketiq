/** @jest-environment node */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PrismaClient } from "@/generated/prisma/client";

import {
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  affiliateAgentCommandSchema,
  canonicalizeAffiliateAgentValue,
  type AffiliateAgentClaimEnvelope,
  type AffiliateAgentRole,
} from "../agentGatewayContracts";
import {
  AffiliateAgentGatewayError,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimRequest,
  type AffiliateAgentGateway,
  type AffiliateAgentInvocationFailureCode,
} from "../agentGateway";
import {
  createProductionAffiliateAgentGatewayDependencies,
  type AffiliateAgentInvocationReconciliationRequest,
  type AffiliateAgentInvocationReconciliationResult,
  type AffiliateAgentProcessEvent,
  type AffiliateAgentProcessLauncher,
  type AffiliateAgentProcessSession,
  type AffiliateAgentSupervisorDependencies,
} from "../agentGatewayAdapters";
import {
  type AffiliateAgentSupervisorInput,
  runAffiliateAgentInvocation,
} from "../agentSupervisor";
import { createPrismaAffiliateAgentGateway } from "../prismaAgentGateway";

const SHA256 = "a".repeat(64);
const STARTED_AT = "2026-08-20T18:00:00.000Z";
const HARD_DEADLINE_AT = "2026-08-20T18:20:00.000Z";

const claimEnvelopeFor = (
  request: AffiliateAgentClaimRequest,
): AffiliateAgentClaimEnvelope => {
  const common = {
    schemaVersion: 1 as const,
    jobId: `job-${request.role.toLowerCase()}`,
    claimId: `claim-${request.role.toLowerCase()}`,
    claimGeneration: 1,
    lifecycleGeneration: null,
    deploymentContractVersion: 1,
    deploymentContractHash: SHA256,
    supplyContractVersion: 1,
    supplyContractHash: SHA256,
    roleContractVersion: 1,
    roleContractHash: SHA256,
    promptTemplateVersion: 1,
    promptTemplateHash: SHA256,
    executionClass: "PRODUCTION_CODEX" as const,
    workerId: request.workerId,
    invocationId: request.invocationId,
    workspaceId: request.workspaceAttestation.workspaceId,
    claimedAt: STARTED_AT,
    expiresAt: HARD_DEADLINE_AT,
    evidenceManifest: {
      schemaVersion: 1 as const,
      entries: [],
      hash: SHA256,
    },
    permittedCommands:
      AFFILIATE_AGENT_ROLE_CONTRACTS[request.role].permittedCommands,
  };

  switch (request.role) {
    case "COVERAGE_PLANNER":
      return {
        ...common,
        role: request.role,
        queue: "AFFILIATE_COVERAGE",
        lane: "COVERAGE_PLANNING",
        supplySourceId: null,
        subject: {
          type: request.role,
          coverageCellId: "coverage-cell-1",
          assessmentCycleId: "assessment-cycle-1",
        },
      };
    case "MAPPING_PRODUCER":
      return {
        ...common,
        role: request.role,
        queue: "AFFILIATE_MAPPING",
        lane: "MAPPING_PRODUCTION",
        supplySourceId: "supply-source-1",
        subject: {
          type: request.role,
          supplySourceId: "supply-source-1",
          mappingJobId: "mapping-job-1",
          pass: 1,
        },
      };
    case "SUPPLY_REVIEWER":
      return {
        ...common,
        role: request.role,
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
        supplySourceId: "supply-source-1",
        subject: {
          type: request.role,
          supplySourceId: "supply-source-1",
          producerClaimId: "producer-claim-1",
          producerWorkerId: "producer-worker-1",
          producerInvocationId: "producer-invocation-1",
          producerWorkspaceId: "producer-workspace-1",
          committedPackageHash: SHA256,
          reviewPass: 1,
        },
      };
    case "HUMAN_DIRECTED_EXECUTOR":
      return {
        ...common,
        role: request.role,
        queue: "AFFILIATE_HUMAN_DIRECTED",
        lane: "HUMAN_EXECUTION",
        supplySourceId: "supply-source-1",
        lifecycleGeneration: 7,
        subject: {
          type: request.role,
          caseId: "case-1",
          recordedHumanActorId: "human-1",
          decisionHash: SHA256,
          reviewerClaimId: "reviewer-claim-1",
          lifecycleCommandRef: "lifecycle-command-1",
        },
      };
  }
};

const claimGrantFor = (
  request: AffiliateAgentClaimRequest,
): AffiliateAgentClaimGrant => ({
  envelope: claimEnvelopeFor(request),
  prompt: "rendered prompt input",
  token: "agw1.claim.capability",
  heartbeatIntervalSeconds: 60,
  leaseExpiresAt: "2026-08-20T18:05:00.000Z",
  hardDeadlineAt: HARD_DEADLINE_AT,
});

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
}>;

const createDeferred = <T>(): Deferred<T> => {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolvePromise === null) {
        throw new Error("Deferred promise was not initialized.");
      }
      resolvePromise(value);
    },
  };
};
type SupervisorHarnessOptions = Readonly<{
  claimResult?: "GRANT" | "NO_WORK";
  claim?: (
    request: AffiliateAgentClaimRequest,
  ) => Promise<AffiliateAgentClaimGrant | null>;
  hardDeadlineAt?: string;
  processEvents?: readonly AffiliateAgentProcessEvent[];
  nextProcessEvent?: () => Promise<AffiliateAgentProcessEvent>;
  processStarted?: Promise<void>;
  perform?: (operation: AffiliateAgentClaimOperation) => Promise<unknown>;
  workspacePath?: string;
  launch?: AffiliateAgentProcessLauncher["launch"];
  send?: () => Promise<void>;
  terminate?: () => Promise<void>;
  forceTerminate?: () => Promise<void>;
  destroyWorkspace?: () => Promise<void>;
  reconcileInvocation?: (
    input: AffiliateAgentInvocationReconciliationRequest,
  ) => Promise<AffiliateAgentInvocationReconciliationResult>;
  now?: () => Date;
}>;
type SupervisorHarness = Readonly<{
  dependencies: AffiliateAgentSupervisorDependencies;
  gatewayClaim: jest.Mock;
  gatewayPerform: jest.Mock;
  launch: jest.Mock;
  nextEvent: jest.Mock;
  send: jest.Mock;
  terminate: jest.Mock;
  forceTerminate: jest.Mock;
  reconcileInvocation: jest.Mock;
  createWorkspace: jest.Mock;
  destroyWorkspace: jest.Mock;
}>;

const createSupervisorHarness = (
  options: SupervisorHarnessOptions = {},
): SupervisorHarness => {
  let identifierSequence = 0;
  let workspaceSequence = 0;
  const events = [
    ...(options.processEvents ?? [{ kind: "RESULT", value: {} }]),
  ];
  const gatewayClaim = jest.fn(
    async (
      request: AffiliateAgentClaimRequest,
    ): Promise<AffiliateAgentClaimGrant | null> => {
      if (options.claim !== undefined) return options.claim(request);
      if (options.claimResult === "NO_WORK") return null;
      return {
        ...claimGrantFor(request),
        hardDeadlineAt: options.hardDeadlineAt ?? HARD_DEADLINE_AT,
      };
    },
  );
  const gatewayPerform = jest.fn(
    async (operation: AffiliateAgentClaimOperation) => {
      if (options.perform !== undefined) return options.perform(operation);
      if (operation.kind === "HEARTBEAT") {
        return {
          kind: "HEARTBEAT_ACCEPTED" as const,
          receiptId: `heartbeat-receipt-${identifierSequence}`,
          heartbeatAt: STARTED_AT,
          leaseExpiresAt: "2026-08-20T18:05:00.000Z",
        };
      }
      if (operation.kind !== "SUBMIT_RESULT") {
        throw new Error(`Unexpected operation: ${operation.kind}`);
      }
      return {
        kind: "TERMINAL_ACCEPTED" as const,
        receiptId: "terminal-receipt-1",
        resultHash: SHA256,
        disposition: "NO_ACTION" as const,
        completedAt: STARTED_AT,
      };
    },
  );
  const gateway: AffiliateAgentGateway = {
    claim: gatewayClaim,
    perform: gatewayPerform as AffiliateAgentGateway["perform"],
    reconcile: async () => ({
      examinedClaims: 0,
      expiredClaims: 0,
      examinedReceipts: 0,
      recoveredReceipts: 0,
      completedReceipts: 0,
      unresolvedReceipts: 0,
      isAdmissionHalted: false,
    }),
  };
  const reconcileInvocation = jest.fn(
    async (
      input: AffiliateAgentInvocationReconciliationRequest,
    ): Promise<AffiliateAgentInvocationReconciliationResult> => {
      if (options.reconcileInvocation !== undefined) {
        return options.reconcileInvocation(input);
      }
      return {
        kind: "INVOCATION_FAILED",
        failureCode: input.failure.code,
        invocationFailureCount: 1,
        nextAttemptAt: "2026-08-20T18:05:00.000Z",
        isPipelineBlocked: false,
      };
    },
  );
  const nextEvent = jest.fn(async (): Promise<AffiliateAgentProcessEvent> => {
    const event = events.shift();
    if (event !== undefined) return event;
    if (options.nextProcessEvent !== undefined) {
      return options.nextProcessEvent();
    }
    return new Promise<AffiliateAgentProcessEvent>(() => undefined);
  });
  const send = jest.fn(options.send ?? (async () => undefined));
  const terminate = jest.fn(options.terminate ?? (async () => undefined));
  const forceTerminate = jest.fn(
    options.forceTerminate ?? (async () => undefined),
  );
  const session: AffiliateAgentProcessSession = {
    started: options.processStarted ?? Promise.resolve(),
    nextEvent,
    send,
    terminate,
    forceTerminate,
  };
  const launch = jest.fn(options.launch ?? (() => session));
  const createWorkspace = jest.fn(
    async (
      input: Readonly<{
        workerId: string;
        invocationId: string;
        mode: "READ_ONLY" | "READ_WRITE";
      }>,
    ) => {
      workspaceSequence += 1;
      return {
        path:
          options.workspacePath ??
          `/isolated/affiliate-agent-workspace-${workspaceSequence}`,
        attestation: {
          schemaVersion: 1 as const,
          workspaceId: `workspace-${workspaceSequence}`,
          mode: input.mode,
          executionClass: "PRODUCTION_CODEX" as const,
          workerId: input.workerId,
          invocationId: input.invocationId,
          issuedAt: STARTED_AT,
          expiresAt: HARD_DEADLINE_AT,
          signature: `workspace-signature-${workspaceSequence}`,
        },
      };
    },
  );
  const destroyWorkspace = jest.fn(
    options.destroyWorkspace ?? (async () => undefined),
  );

  return {
    dependencies: {
      gateway,
      invocationReconciler: { reconcileInvocation },
      clock: { now: options.now ?? (() => new Date(STARTED_AT)) },
      identifiers: {
        create: (kind) => `${kind}-${++identifierSequence}`,
      },
      processLauncher: { launch },
      workspaces: { create: createWorkspace, destroy: destroyWorkspace },
    },
    gatewayClaim,
    gatewayPerform,
    launch,
    reconcileInvocation,
    nextEvent,
    send,
    terminate,
    forceTerminate,
    createWorkspace,
    destroyWorkspace,
  };
};
const expectFailureReconciliation = (
  harness: ReturnType<typeof createSupervisorHarness>,
  code: AffiliateAgentInvocationFailureCode,
  identifiers: Readonly<Record<string, unknown>> = {},
): void => {
  expect(harness.reconcileInvocation).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "RECORD_FAILURE",
      authorization: expect.objectContaining(identifiers),
      failure: expect.objectContaining({
        ...identifiers,
        code,
      }),
    }),
  );
};

const supervisorInput = (
  role: AffiliateAgentRole = "COVERAGE_PLANNER",
): AffiliateAgentSupervisorInput => ({
  role,
  roleCredential: `${role.toLowerCase()}-role-credential`,
  modelCredential: "model-credential",
  gatewayAddress: "unix:///internal/affiliate-agent-gateway.sock",
  workerId: `${role.toLowerCase()}-worker-1`,
  invocationId: `${role.toLowerCase()}-invocation-1`,
});

describe("affiliate agent one-claim supervisor", () => {
  it("starts one exact ephemeral process for one claim and submits one terminal result", async () => {
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "RESULT", value: { disposition: "NO_ACTION" } }],
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("TERMINAL_ACCEPTED");

    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    expect(harness.launch).toHaveBeenCalledTimes(1);
    const request = harness.gatewayClaim.mock
      .calls[0][0] as AffiliateAgentClaimRequest;
    const grant = claimGrantFor(request);
    expect(harness.launch).toHaveBeenCalledWith({
      command: ["codex", "exec", "--ephemeral"],
      prompt: grant.prompt,
      environment: {
        OPENAI_API_KEY: "model-credential",
        AFFILIATE_AGENT_GATEWAY_ADDRESS:
          "unix:///internal/affiliate-agent-gateway.sock",
        AFFILIATE_AGENT_CLAIM_TOKEN: grant.token,
        AFFILIATE_AGENT_CLAIM_ENVELOPE: canonicalizeAffiliateAgentValue(
          grant.envelope,
        ),
        AFFILIATE_AGENT_PROMPT: grant.prompt,
      },
      workspacePath: "/isolated/affiliate-agent-workspace-1",
    });
    expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
    expect(harness.gatewayPerform.mock.calls[0][0]).toMatchObject({
      kind: "SUBMIT_RESULT",
      result: { disposition: "NO_ACTION" },
    });
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledWith(
      "/isolated/affiliate-agent-workspace-1",
    );
  });
  it.each(["indeterminate", "retryable"] as const)(
    "retries a %s claim failure with the complete request and same idempotency key",
    async (failureKind) => {
      let claimAttempt = 0;
      const harness = createSupervisorHarness({
        claim: async (request) => {
          claimAttempt += 1;
          if (claimAttempt === 1) {
            if (failureKind === "retryable") {
              throw new AffiliateAgentGatewayError({
                code: "INTERNAL_ERROR",
                isRetryable: true,
                safeMessage: "The first claim response was unavailable.",
              });
            }
            throw new Error("The first claim response was unavailable.");
          }
          return claimGrantFor(request);
        },
      });

      await expect(
        runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
      ).resolves.toBe("TERMINAL_ACCEPTED");

      expect(harness.gatewayClaim).toHaveBeenCalledTimes(2);
      expect(harness.gatewayClaim.mock.calls[1][0]).toBe(
        harness.gatewayClaim.mock.calls[0][0],
      );
      expect(harness.gatewayClaim.mock.calls[1][0]).toEqual(
        harness.gatewayClaim.mock.calls[0][0],
      );
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    },
  );
  it("destroys a workspace even when process termination is unconfirmed", async () => {
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "RESULT", value: { disposition: "NO_ACTION" } }],
      terminate: async () => {
        throw new Error("graceful termination failed");
      },
      forceTerminate: async () => {
        throw new Error("force termination failed");
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      safeMessage: "The agent process could not be terminated.",
    });

    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.forceTerminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledWith(
      "/isolated/affiliate-agent-workspace-1",
    );
  });
  it("reports explicit cleanup failure when workspace destruction fails", async () => {
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "RESULT", value: { disposition: "NO_ACTION" } }],
      destroyWorkspace: async () => {
        throw new Error("workspace destruction failed");
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      safeMessage: "The agent workspace could not be destroyed.",
    });

    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledWith(
      "/isolated/affiliate-agent-workspace-1",
    );
  });

  it("returns no work after one claim and destroys the fresh workspace", async () => {
    const harness = createSupervisorHarness({ claimResult: "NO_WORK" });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("NO_WORK");

    expect(harness.createWorkspace).toHaveBeenCalledTimes(1);
    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    expect(harness.launch).not.toHaveBeenCalled();
    expect(harness.gatewayPerform).not.toHaveBeenCalled();
    expect(harness.destroyWorkspace).toHaveBeenCalledWith(
      "/isolated/affiliate-agent-workspace-1",
    );
  });

  it("creates a fresh read-only reviewer workspace and read-write producer workspaces", async () => {
    const harness = createSupervisorHarness({ claimResult: "NO_WORK" });
    const roles = [
      "COVERAGE_PLANNER",
      "MAPPING_PRODUCER",
      "SUPPLY_REVIEWER",
      "HUMAN_DIRECTED_EXECUTOR",
    ] as const;

    for (const role of roles) {
      await runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(role),
      );
    }

    expect(
      harness.createWorkspace.mock.calls.map(([input]) => input.mode),
    ).toEqual(["READ_WRITE", "READ_WRITE", "READ_ONLY", "READ_WRITE"]);
    expect(harness.destroyWorkspace.mock.calls.map(([path]) => path)).toEqual([
      "/isolated/affiliate-agent-workspace-1",
      "/isolated/affiliate-agent-workspace-2",
      "/isolated/affiliate-agent-workspace-3",
      "/isolated/affiliate-agent-workspace-4",
    ]);
    expect(
      new Set(
        harness.gatewayClaim.mock.calls.map(
          ([request]) => request.workspaceAttestation.workspaceId,
        ),
      ).size,
    ).toBe(4);
  });

  it("sends heartbeats on the 60-second cadence during the same process", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const processEvent = createDeferred<AffiliateAgentProcessEvent>();
      const harness = createSupervisorHarness({
        processEvents: [],
        nextProcessEvent: () => processEvent.promise,
        now: () => new Date(),
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );
      await jest.advanceTimersByTimeAsync(0);

      await jest.advanceTimersByTimeAsync(59_000);
      expect(
        harness.gatewayPerform.mock.calls.filter(
          ([operation]) => operation.kind === "HEARTBEAT",
        ),
      ).toHaveLength(0);

      for (let heartbeat = 1; heartbeat <= 3; heartbeat += 1) {
        await jest.advanceTimersByTimeAsync(heartbeat === 1 ? 1_000 : 60_000);
        expect(
          harness.gatewayPerform.mock.calls.filter(
            ([operation]) => operation.kind === "HEARTBEAT",
          ),
        ).toHaveLength(heartbeat);
      }

      processEvent.resolve({
        kind: "RESULT",
        value: { disposition: "NO_ACTION" },
      });
      await expect(invocation).resolves.toBe("TERMINAL_ACCEPTED");
      expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("retries an indeterminate heartbeat with the same operation key", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      let heartbeatAttempts = 0;
      const processEvent = createDeferred<AffiliateAgentProcessEvent>();
      const harness = createSupervisorHarness({
        processEvents: [],
        nextProcessEvent: () => processEvent.promise,
        now: () => new Date(),
        perform: async (operation) => {
          if (operation.kind === "HEARTBEAT") {
            heartbeatAttempts += 1;
            if (heartbeatAttempts === 1) {
              throw new Error("The heartbeat response was unavailable.");
            }
            return {
              kind: "HEARTBEAT_ACCEPTED" as const,
              receiptId: operation.idempotencyKey,
              heartbeatAt: STARTED_AT,
              leaseExpiresAt: HARD_DEADLINE_AT,
            };
          }
          if (operation.kind !== "SUBMIT_RESULT") {
            throw new Error(`Unexpected operation: ${operation.kind}`);
          }
          return {
            kind: "TERMINAL_ACCEPTED" as const,
            receiptId: "terminal-receipt-1",
            resultHash: SHA256,
            disposition: "NO_ACTION" as const,
            completedAt: STARTED_AT,
          };
        },
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );
      await jest.advanceTimersByTimeAsync(60_000);

      const heartbeats = harness.gatewayPerform.mock.calls
        .map(([operation]) => operation as AffiliateAgentClaimOperation)
        .filter((operation) => operation.kind === "HEARTBEAT");
      expect(heartbeats).toHaveLength(2);
      expect(heartbeats[1]).toBe(heartbeats[0]);
      expect(heartbeats[1].idempotencyKey).toBe(heartbeats[0].idempotencyKey);

      processEvent.resolve({
        kind: "RESULT",
        value: { disposition: "NO_ACTION" },
      });
      await expect(invocation).resolves.toBe("TERMINAL_ACCEPTED");
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("terminates at the hard deadline before exact-claim timeout reconciliation", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const harness = createSupervisorHarness({
        processEvents: [],
        now: () => new Date(),
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(20 * 60 * 1_000);

      await expect(invocation).resolves.toBe("INVOCATION_FAILED");
      const operations = harness.gatewayPerform.mock.calls.map(
        ([operation]) => operation as AffiliateAgentClaimOperation,
      );
      expect(
        operations.filter((operation) => operation.kind === "HEARTBEAT"),
      ).toHaveLength(19);
      const request = harness.gatewayClaim.mock
        .calls[0][0] as AffiliateAgentClaimRequest;
      const grant = claimGrantFor(request);
      expectFailureReconciliation(harness, "TIMEOUT", {
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
      });
      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expect(harness.terminate.mock.invocationCallOrder[0]).toBeLessThan(
        harness.reconcileInvocation.mock.invocationCallOrder[0],
      );
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("terminates a crashed process before exact-claim failure reconciliation", async () => {
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "EXIT", exitCode: 17 }],
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    expect(harness.gatewayPerform).not.toHaveBeenCalled();
    expectFailureReconciliation(harness, "PROCESS_CRASH", {
      jobId: "job-coverage_planner",
      claimId: "claim-coverage_planner",
      claimGeneration: 1,
    });
    expect(harness.launch).toHaveBeenCalledTimes(1);
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });
  it("returns bounded schema feedback through the same process session", async () => {
    let resultSubmission = 0;
    const harness = createSupervisorHarness({
      processEvents: [
        { kind: "RESULT", value: { invalid: 1 } },
        { kind: "RESULT", value: { invalid: 2 } },
        { kind: "RESULT", value: { disposition: "NO_ACTION" } },
      ],
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        resultSubmission += 1;
        if (resultSubmission <= 2) {
          return {
            kind: "SCHEMA_CORRECTION_REQUIRED" as const,
            receiptId: `correction-receipt-${resultSubmission}`,
            submissionNumber: resultSubmission as 1 | 2,
            remainingSubmissions: (3 - resultSubmission) as 1 | 2,
            issues: [
              {
                path: ["payload"],
                code: "invalid_type",
                message: `Correction ${resultSubmission}`,
              },
            ],
            correctionPrompt: `schema correction ${resultSubmission}`,
          };
        }
        return {
          kind: "TERMINAL_ACCEPTED" as const,
          receiptId: "terminal-receipt-1",
          resultHash: SHA256,
          disposition: "NO_ACTION" as const,
          completedAt: STARTED_AT,
        };
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("TERMINAL_ACCEPTED");

    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    expect(harness.launch).toHaveBeenCalledTimes(1);
    expect(harness.nextEvent).toHaveBeenCalledTimes(3);
    expect(harness.send.mock.calls.map(([input]) => input)).toEqual([
      {
        kind: "SCHEMA_CORRECTION",
        correctionPrompt: "schema correction 1",
      },
      {
        kind: "SCHEMA_CORRECTION",
        correctionPrompt: "schema correction 2",
      },
    ]);
    expect(
      harness.gatewayPerform.mock.calls.filter(
        ([operation]) => operation.kind === "SUBMIT_RESULT",
      ),
    ).toHaveLength(3);
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("uses the gateway-owned third invalid result as the only schema-exhaustion failure", async () => {
    let invalidSubmission = 0;
    const harness = createSupervisorHarness({
      processEvents: [
        { kind: "RESULT", value: { invalid: 1 } },
        { kind: "RESULT", value: { invalid: 2 } },
        { kind: "RESULT", value: { invalid: 3 } },
      ],
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        invalidSubmission += 1;
        if (invalidSubmission < 3) {
          return {
            kind: "SCHEMA_CORRECTION_REQUIRED" as const,
            receiptId: `correction-receipt-${invalidSubmission}`,
            submissionNumber: invalidSubmission as 1 | 2,
            remainingSubmissions: (3 - invalidSubmission) as 1 | 2,
            issues: [],
            correctionPrompt: `schema correction ${invalidSubmission}`,
          };
        }
        return {
          kind: "INVOCATION_FAILED" as const,
          receiptId: "schema-exhaustion-receipt",
          failureCode: "SCHEMA_CORRECTIONS_EXHAUSTED" as const,
          invocationFailureCount: 1 as const,
          nextAttemptAt: "2026-08-20T18:05:00.000Z",
          isPipelineBlocked: false,
        };
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    const operations = harness.gatewayPerform.mock.calls.map(
      ([operation]) => operation as AffiliateAgentClaimOperation,
    );
    expect(operations.map(({ kind }) => kind)).toEqual([
      "SUBMIT_RESULT",
      "SUBMIT_RESULT",
      "SUBMIT_RESULT",
    ]);
    expect(harness.send).toHaveBeenCalledTimes(2);
    expect(harness.reconcileInvocation).not.toHaveBeenCalled();
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("treats an extra correction response as a gateway invariant error", async () => {
    let invalidSubmission = 0;
    const harness = createSupervisorHarness({
      processEvents: [
        { kind: "RESULT", value: { invalid: 1 } },
        { kind: "RESULT", value: { invalid: 2 } },
        { kind: "RESULT", value: { invalid: 3 } },
      ],
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        invalidSubmission += 1;
        return {
          kind: "SCHEMA_CORRECTION_REQUIRED" as const,
          receiptId: `invalid-correction-receipt-${invalidSubmission}`,
          submissionNumber: Math.min(invalidSubmission, 2) as 1 | 2,
          remainingSubmissions: 1 as const,
          issues: [],
          correctionPrompt: `invalid schema correction ${invalidSubmission}`,
        };
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      safeMessage: expect.any(String),
    });

    expect(harness.gatewayPerform).toHaveBeenCalledTimes(3);
    expect(harness.send).toHaveBeenCalledTimes(2);
    expect(harness.reconcileInvocation).not.toHaveBeenCalled();
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("replays a possible lost terminal response with the same idempotency key", async () => {
    let submissionCount = 0;
    const harness = createSupervisorHarness({
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        submissionCount += 1;
        if (submissionCount === 1) {
          throw new Error("Simulated terminal response loss.");
        }
        return {
          kind: "TERMINAL_ACCEPTED" as const,
          receiptId: "terminal-receipt-1",
          resultHash: SHA256,
          disposition: "NO_ACTION" as const,
          completedAt: STARTED_AT,
        };
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("TERMINAL_ACCEPTED");

    const submissions = harness.gatewayPerform.mock.calls.map(
      ([operation]) =>
        operation as Extract<
          AffiliateAgentClaimOperation,
          { kind: "SUBMIT_RESULT" }
        >,
    );
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toEqual(submissions[0]);
    expect(harness.reconcileInvocation).not.toHaveBeenCalled();
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("maps a rejected terminal schema to malformed output", async () => {
    const harness = createSupervisorHarness({
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        throw new AffiliateAgentGatewayError({
          code: "RESULT_SCHEMA_INVALID",
          isRetryable: false,
          safeMessage: "The terminal input cannot enter schema correction.",
        });
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
    expectFailureReconciliation(harness, "MALFORMED_OUTPUT");
    expect(harness.terminate.mock.invocationCallOrder[0]).toBeLessThan(
      harness.reconcileInvocation.mock.invocationCallOrder[0],
    );
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("keeps an authoritative terminal commit when both submission responses are lost", async () => {
    const harness = createSupervisorHarness({
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        throw new Error("Simulated terminal response loss.");
      },
      reconcileInvocation: async () => ({ kind: "TERMINAL_ACCEPTED" }),
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("TERMINAL_ACCEPTED");

    const submissions = harness.gatewayPerform.mock.calls.map(
      ([operation]) => operation as AffiliateAgentClaimOperation,
    );
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toEqual(submissions[0]);
    expect(harness.reconcileInvocation).toHaveBeenCalledTimes(1);
    expect(harness.terminate.mock.invocationCallOrder[0]).toBeLessThan(
      harness.reconcileInvocation.mock.invocationCallOrder[0],
    );
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("propagates pipeline blocked from authoritative reconciliation", async () => {
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "EXIT", exitCode: 9 }],
      reconcileInvocation: async (request) => ({
        kind: "INVOCATION_FAILED",
        failureCode: request.failure.code,
        invocationFailureCount: 3,
        nextAttemptAt: null,
        isPipelineBlocked: true,
      }),
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("PIPELINE_BLOCKED");

    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    expect(harness.gatewayPerform).not.toHaveBeenCalled();
    expectFailureReconciliation(harness, "PROCESS_CRASH");
    expect(harness.launch).toHaveBeenCalledTimes(1);
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["CLAIM_GENERATION_STALE", "STALE_GENERATION"],
    ["LIFECYCLE_GENERATION_STALE", "STALE_GENERATION"],
    ["LEASE_EXPIRED", "TIMEOUT"],
    ["TOKEN_EXPIRED", "TIMEOUT"],
  ] as const)(
    "uses trusted exact-claim reconciliation after %s rejects token-authenticated failure scope",
    async (gatewayCode, failureCode) => {
      jest.useFakeTimers({ now: new Date(STARTED_AT) });
      try {
        const harness = createSupervisorHarness({
          processEvents: [],
          now: () => new Date(),
          perform: async (operation) => {
            if (operation.kind !== "HEARTBEAT") {
              throw new Error(`Unexpected operation: ${operation.kind}`);
            }
            throw new AffiliateAgentGatewayError({
              code: gatewayCode,
              isRetryable: false,
              safeMessage: "The token-authenticated claim scope is invalid.",
            });
          },
        });

        const invocation = runAffiliateAgentInvocation(
          harness.dependencies,
          supervisorInput(),
        );
        await jest.advanceTimersByTimeAsync(60_000);
        await expect(invocation).resolves.toBe("INVOCATION_FAILED");

        expect(
          harness.gatewayPerform.mock.calls.map(
            ([operation]) => operation.kind,
          ),
        ).toEqual(["HEARTBEAT"]);
        expectFailureReconciliation(harness, failureCode, {
          jobId: "job-coverage_planner",
          claimId: "claim-coverage_planner",
          claimGeneration: 1,
        });
        expect(harness.terminate.mock.invocationCallOrder[0]).toBeLessThan(
          harness.reconcileInvocation.mock.invocationCallOrder[0],
        );
        expect(harness.launch).toHaveBeenCalledTimes(1);
        expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it("terminates and cleans up when process launch completion hangs until the deadline", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const harness = createSupervisorHarness({
        processEvents: [],
        processStarted: new Promise<void>(() => undefined),
        now: () => new Date(),
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );
      await jest.advanceTimersByTimeAsync(20 * 60 * 1_000);
      await expect(invocation).resolves.toBe("INVOCATION_FAILED");

      expect(
        harness.gatewayPerform.mock.calls.filter(
          ([operation]) => operation.kind === "HEARTBEAT",
        ),
      ).toHaveLength(19);
      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.nextEvent).not.toHaveBeenCalled();
      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expectFailureReconciliation(harness, "TIMEOUT");
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("terminates and cleans up when a schema-correction send hangs until the deadline", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const harness = createSupervisorHarness({
        processEvents: [{ kind: "RESULT", value: { invalid: 1 } }],
        now: () => new Date(),
        send: async () => new Promise<void>(() => undefined),
        perform: async (operation) => {
          if (operation.kind === "HEARTBEAT") {
            return {
              kind: "HEARTBEAT_ACCEPTED" as const,
              receiptId: operation.idempotencyKey,
              heartbeatAt: new Date().toISOString(),
              leaseExpiresAt: HARD_DEADLINE_AT,
            };
          }
          if (operation.kind !== "SUBMIT_RESULT") {
            throw new Error(`Unexpected operation: ${operation.kind}`);
          }
          return {
            kind: "SCHEMA_CORRECTION_REQUIRED" as const,
            receiptId: "hung-send-correction",
            submissionNumber: 1 as const,
            remainingSubmissions: 2 as const,
            issues: [],
            correctionPrompt: "Correct the terminal result.",
          };
        },
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(harness.send).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(20 * 60 * 1_000);
      await expect(invocation).resolves.toBe("INVOCATION_FAILED");

      expect(
        harness.gatewayPerform.mock.calls.filter(
          ([operation]) => operation.kind === "HEARTBEAT",
        ),
      ).toHaveLength(19);
      expect(harness.send).toHaveBeenCalledTimes(1);
      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expectFailureReconciliation(harness, "TIMEOUT");
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("terminates and cleans up when terminal submission hangs until the deadline", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const harness = createSupervisorHarness({
        processEvents: [
          { kind: "RESULT", value: { disposition: "NO_ACTION" } },
        ],
        now: () => new Date(),
        perform: async (operation) => {
          if (operation.kind === "HEARTBEAT") {
            return {
              kind: "HEARTBEAT_ACCEPTED" as const,
              receiptId: operation.idempotencyKey,
              heartbeatAt: new Date().toISOString(),
              leaseExpiresAt: HARD_DEADLINE_AT,
            };
          }
          if (operation.kind !== "SUBMIT_RESULT") {
            throw new Error(`Unexpected operation: ${operation.kind}`);
          }
          return new Promise<never>(() => undefined);
        },
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(20 * 60 * 1_000);
      await expect(invocation).resolves.toBe("INVOCATION_FAILED");

      expect(
        harness.gatewayPerform.mock.calls.filter(
          ([operation]) => operation.kind === "HEARTBEAT",
        ),
      ).toHaveLength(19);
      expect(
        harness.gatewayPerform.mock.calls.filter(
          ([operation]) => operation.kind === "SUBMIT_RESULT",
        ),
      ).toHaveLength(1);
      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expectFailureReconciliation(harness, "TIMEOUT");
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("terminates and cleans up when a heartbeat hangs until the deadline", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const harness = createSupervisorHarness({
        processEvents: [],
        now: () => new Date(),
        perform: async (operation) => {
          if (operation.kind !== "HEARTBEAT") {
            throw new Error(`Unexpected operation: ${operation.kind}`);
          }
          return new Promise<never>(() => undefined);
        },
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );
      await jest.advanceTimersByTimeAsync(60_000);
      expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(19 * 60 * 1_000);
      await expect(invocation).resolves.toBe("INVOCATION_FAILED");

      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expectFailureReconciliation(harness, "TIMEOUT");
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("passes only the scoped token, canonical envelope, prompt, channel, and model credential", async () => {
    const parentEnvironment = jest.replaceProperty(process, "env", {
      ...process.env,
      DATABASE_URL: "database-fixture",
      DO_SPACES_SECRET: "storage-fixture",
      SCRAPINGDOG_API_KEY: "provider-fixture",
      JWT_SECRET: "backend-fixture",
      ADMIN_TOKEN: "admin-fixture",
      GITHUB_TOKEN: "repository-fixture",
      SSH_AUTH_SOCK: "/private/ssh-agent-fixture",
      MVP_SITE_DIR: "/host/repository-fixture",
    });
    try {
      const harness = createSupervisorHarness();

      await runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );

      const launchInput = harness.launch.mock.calls[0][0] as Readonly<{
        environment: Readonly<Record<string, string>>;
      }>;
      expect(Object.keys(launchInput.environment).sort()).toEqual([
        "AFFILIATE_AGENT_CLAIM_ENVELOPE",
        "AFFILIATE_AGENT_CLAIM_TOKEN",
        "AFFILIATE_AGENT_GATEWAY_ADDRESS",
        "AFFILIATE_AGENT_PROMPT",
        "OPENAI_API_KEY",
      ]);
      const request = harness.gatewayClaim.mock
        .calls[0][0] as AffiliateAgentClaimRequest;
      const grant = claimGrantFor(request);
      expect(launchInput.environment.AFFILIATE_AGENT_CLAIM_TOKEN).toBe(
        grant.token,
      );
      expect(launchInput.environment.AFFILIATE_AGENT_CLAIM_ENVELOPE).toBe(
        canonicalizeAffiliateAgentValue(grant.envelope),
      );
      expect(launchInput.environment.AFFILIATE_AGENT_PROMPT).toBe(grant.prompt);
      expect(launchInput.environment).not.toHaveProperty("roleCredential");
      expect(launchInput.environment).not.toHaveProperty("workerId");
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      parentEnvironment.restore();
    }
  });

  it("proves a real child has no protected credentials or direct-write authority", async () => {
    const parentEnvironment = jest.replaceProperty(process, "env", {
      ...process.env,
      DATABASE_URL: "database-fixture",
      DO_SPACES_SECRET: "storage-fixture",
      SCRAPINGDOG_API_KEY: "provider-fixture",
      JWT_SECRET: "backend-fixture",
      ADMIN_TOKEN: "admin-fixture",
      GITHUB_TOKEN: "repository-fixture",
      SSH_AUTH_SOCK: "/private/ssh-agent-fixture",
      MVP_SITE_DIR: "/host/repository-fixture",
    });
    const forbiddenNames = [
      "DATABASE_URL",
      "DO_SPACES_SECRET",
      "SCRAPINGDOG_API_KEY",
      "JWT_SECRET",
      "ADMIN_TOKEN",
      "GITHUB_TOKEN",
      "SSH_AUTH_SOCK",
      "MVP_SITE_DIR",
      "AFFILIATE_AGENT_LIFECYCLE_WRITE_TOKEN",
    ];
    const workspacePath = await mkdtemp(
      join(tmpdir(), "affiliate-agent-workspace-"),
    );
    const restrictedChildScript = `
      const { existsSync } = require("node:fs");
      const path = require("node:path");
      const expectedWorkspacePath = ${JSON.stringify(realpathSync(workspacePath))};
      const forbiddenNames = ${JSON.stringify(forbiddenNames)};
      const directAccess = Object.fromEntries(
        forbiddenNames.map((name) => [
          name,
          process.env[name] === undefined ? "DENIED" : "EXPOSED",
        ]),
      );
      process.stdout.write("READY\\n");
      process.stdout.write(
        JSON.stringify({
          environmentKeys: Object.keys(process.env).sort(),
          missingCredentialNames: forbiddenNames.filter(
            (name) => process.env[name] === undefined,
          ),
          directAccess,
          workspacePathMatches: process.cwd() === expectedWorkspacePath,
          gitPathAvailable: existsSync(path.join(process.cwd(), ".git")),
        }) + "\\n",
      );
    `;
    const restrictedChildLauncher: AffiliateAgentProcessLauncher["launch"] = ({
      environment,
      workspacePath: launchWorkspacePath,
    }) => {
      const child = spawn(process.execPath, ["-e", restrictedChildScript], {
        cwd: launchWorkspacePath,
        env: environment,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const reader = createInterface({ input: child.stdout });
      const queuedEvents: AffiliateAgentProcessEvent[] = [];
      const eventWaiters: Array<(event: AffiliateAgentProcessEvent) => void> =
        [];
      const pushEvent = (event: AffiliateAgentProcessEvent): void => {
        const waiter = eventWaiters.shift();
        if (waiter) waiter(event);
        else queuedEvents.push(event);
      };
      let resolveStarted: (() => void) | null = null;
      let rejectStarted: ((error: unknown) => void) | null = null;
      const started = new Promise<void>((resolve, reject) => {
        resolveStarted = resolve;
        rejectStarted = reject;
      });
      let resolveClosed: (() => void) | null = null;
      const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
      });
      let isReady = false;
      let hasExited = false;
      reader.on("line", (line) => {
        if (!isReady) {
          if (line !== "READY") {
            rejectStarted?.(
              new Error("Restricted child did not become ready."),
            );
            return;
          }
          isReady = true;
          resolveStarted?.();
          return;
        }
        pushEvent({ kind: "RESULT", value: JSON.parse(line) });
      });
      child.once("error", (error) => {
        if (!isReady) rejectStarted?.(error);
      });
      child.once("close", (exitCode) => {
        hasExited = true;
        if (!isReady) {
          rejectStarted?.(new Error("Restricted child exited before ready."));
        }
        pushEvent({ kind: "EXIT", exitCode: exitCode ?? -1 });
        resolveClosed?.();
      });
      const stop = async (signal: "SIGTERM" | "SIGKILL"): Promise<void> => {
        if (!hasExited) child.kill(signal);
        await closed;
        reader.close();
      };
      return {
        started,
        nextEvent: async () => {
          const queued = queuedEvents.shift();
          if (queued) return queued;
          return new Promise<AffiliateAgentProcessEvent>((resolve) => {
            eventWaiters.push(resolve);
          });
        },
        send: async () => undefined,
        terminate: () => stop("SIGTERM"),
        forceTerminate: () => stop("SIGKILL"),
      };
    };
    try {
      const harness = createSupervisorHarness({
        launch: restrictedChildLauncher,
        workspacePath,
      });
      await expect(
        runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
      ).resolves.toBe("TERMINAL_ACCEPTED");

      const terminalSubmission = harness.gatewayPerform.mock.calls.find(
        ([operation]) =>
          (operation as AffiliateAgentClaimOperation).kind === "SUBMIT_RESULT",
      )?.[0] as Extract<
        AffiliateAgentClaimOperation,
        { kind: "SUBMIT_RESULT" }
      >;
      expect(terminalSubmission.result).toMatchObject({
        environmentKeys: expect.arrayContaining([
          "AFFILIATE_AGENT_CLAIM_ENVELOPE",
          "AFFILIATE_AGENT_CLAIM_TOKEN",
          "AFFILIATE_AGENT_GATEWAY_ADDRESS",
          "AFFILIATE_AGENT_PROMPT",
          "OPENAI_API_KEY",
        ]),
        missingCredentialNames: forbiddenNames,
        directAccess: Object.fromEntries(
          forbiddenNames.map((name) => [name, "DENIED"]),
        ),
        workspacePathMatches: true,
        gitPathAvailable: false,
      });
      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      parentEnvironment.restore();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("rejects offline open-weight execution before queue access or executable publication", async () => {
    const databaseAccess = jest.fn();
    const prisma = new Proxy({} as PrismaClient, {
      get: () => {
        databaseAccess();
        throw new Error("Queue access is forbidden in this test.");
      },
    });
    const credentialVerification = jest.fn(async () => true);
    const workspaceVerification = jest.fn(async () => true);
    const contractLoad = jest.fn(async () => {
      throw new Error("Contract load is forbidden in this test.");
    });
    const gateway = createPrismaAffiliateAgentGateway(
      createProductionAffiliateAgentGatewayDependencies({
        prisma,
        tokenSigningKey: new Uint8Array(32).fill(7),
        tokenKeyVersion: "test-key-1",
        clock: { now: () => new Date(STARTED_AT) },
        credentials: { verify: credentialVerification },
        workspaces: { verify: workspaceVerification },
        contracts: { loadActiveBundle: contractLoad },
        artifacts: {
          readImmutable: async () => {
            throw new Error("Artifact access is forbidden in this test.");
          },
        },
      }),
    );

    await expect(
      gateway.claim({
        idempotencyKey: "offline-claim-request-1",
        roleCredential: "offline-evaluation-credential",
        role: "MAPPING_PRODUCER",
        workerId: "offline-worker-1",
        invocationId: "offline-invocation-1",
        workspaceAttestation: {
          schemaVersion: 1,
          workspaceId: "offline-workspace-1",
          mode: "READ_WRITE",
          executionClass: "OFFLINE_OPEN_WEIGHT_EVALUATION",
          workerId: "offline-worker-1",
          invocationId: "offline-invocation-1",
          issuedAt: "2026-08-20T17:59:00.000Z",
          expiresAt: HARD_DEADLINE_AT,
          signature: "offline-workspace-signature",
        },
      }),
    ).rejects.toMatchObject({
      code: "ROLE_NOT_ALLOWED",
      safeMessage: expect.any(String),
    });
    expect(workspaceVerification).not.toHaveBeenCalled();
    expect(credentialVerification).not.toHaveBeenCalled();
    expect(contractLoad).not.toHaveBeenCalled();
    expect(databaseAccess).not.toHaveBeenCalled();
    expect(
      affiliateAgentCommandSchema.safeParse({
        type: "PUBLISH_EXECUTABLE_CODE",
        source: "export default function run() {}",
      }).success,
    ).toBe(false);
  });
});
