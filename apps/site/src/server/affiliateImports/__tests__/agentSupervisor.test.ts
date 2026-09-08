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
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS,
  AffiliateAgentGatewayError,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimRequest,
  type AffiliateAgentGateway,
  type AffiliateAgentInvocationFailureCode,
} from "../agentGateway";
import {
  createProductionAffiliateAgentGatewayDependencies,
  type AffiliateAgentCommandAdapters,
  type AffiliateAgentInvocationReconciliationRequest,
  type AffiliateAgentInvocationReconciliationResult,
  type AffiliateAgentProcessEvent,
  type AffiliateAgentProcessLauncher,
  type AffiliateAgentProcessReservation,
  type AffiliateAgentProcessSession,
  type AffiliateAgentSupervisorDependencies,
  type AffiliateAgentTerminalEffectAdapter,
} from "../agentGatewayAdapters";
import {
  AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
  AFFILIATE_AGENT_TERMINAL_CONFIRMATION_TIMEOUT_MILLISECONDS,
  type AffiliateAgentSupervisorAdmissionState,
  type AffiliateAgentSupervisorInput,
  runAffiliateAgentInvocation,
} from "../agentSupervisor";
import { createPrismaAffiliateAgentGateway } from "../prismaAgentGateway";

const SHA256 = "a".repeat(64);
const STARTED_AT = "2026-08-20T18:00:00.000Z";
const HARD_DEADLINE_AT = "2026-08-20T18:20:00.000Z";
const WORKSPACE_ATTESTATION_EXPIRES_AT = new Date(
  Date.parse(HARD_DEADLINE_AT)
  + AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS * 1_000,
).toISOString();
const offlineProductionAdapters = {
  commands: {
    transactional: {
      VALIDATE_DECLARATIVE_PACKAGE: {
        execute: async () => ({
          isValid: true as const,
          validatedPackageHash: "a".repeat(64),
        }),
      },
      COMMIT_DECLARATIVE_PACKAGE: {
        execute: async () => ({ packageHash: "a".repeat(64) }),
      },
    },
    external: {
      RUN_DISCOVERY_QUERY: {
        start: async () => ({}),
        recover: async () => null,
      },
      CAPTURE_CLAIM_URL: {
        start: async () => ({}),
        recover: async () => null,
      },
    },
  } satisfies AffiliateAgentCommandAdapters,
  terminalEffects: {
    APPROVED: { execute: async () => ({}), recover: async () => null },
    ACTIVATED: { execute: async () => ({}), recover: async () => null },
    PRODUCER_REPAIR_REQUIRED: { execute: async () => ({}), recover: async () => null },
    REGRESSION_ASSESSED: { execute: async () => ({}), recover: async () => null },
    SOURCE_EXCLUSION_ASSESSED: { execute: async () => ({}), recover: async () => null },
    EXACT_TARGET_REJECTED: { execute: async () => ({}), recover: async () => null },
    HUMAN_REVIEW_REQUIRED: { execute: async () => ({}), recover: async () => null },
  } satisfies AffiliateAgentTerminalEffectAdapter,
};

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
    roleContractVersion: 2,
    roleContractHash: SHA256,
    promptTemplateVersion: 2,
    promptTemplateHash: SHA256,
    executionClass: "PRODUCTION_OMP" as const,
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
const terminalProcessEvent = (
  result: Record<string, unknown>,
  idempotencyKey = "terminal-key",
): AffiliateAgentProcessEvent => ({
  kind: "TERMINAL_SUBMISSION",
  idempotencyKey,
  result,
});
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
  createWorkspace?: AffiliateAgentSupervisorDependencies["workspaces"]["create"];
  launch?: AffiliateAgentProcessReservation["launch"];
  reserve?: AffiliateAgentProcessLauncher["reserve"];
  send?: () => Promise<void>;
  terminate?: () => Promise<void>;
  forceTerminate?: () => Promise<void>;
  destroyWorkspace?: () => Promise<void>;
  reconcileInvocation?: (
    input: AffiliateAgentInvocationReconciliationRequest,
  ) => Promise<AffiliateAgentInvocationReconciliationResult>;
  now?: () => Date;
  workerHealth?: AffiliateAgentSupervisorDependencies["workerHealth"];
}>;
type SupervisorHarness = Readonly<{
  dependencies: AffiliateAgentSupervisorDependencies;
  gatewayClaim: jest.Mock;
  gatewayPerform: jest.Mock;
  reserve: jest.Mock;
  release: jest.Mock;
  launch: jest.Mock;
  nextEvent: jest.Mock;
  send: jest.Mock;
  terminate: jest.Mock;
  forceTerminate: jest.Mock;
  reconcileInvocation: jest.Mock;
  recoverStale: jest.Mock;
  createWorkspace: jest.Mock;
  destroyWorkspace: jest.Mock;
}>;

const createSupervisorHarness = (
  options: SupervisorHarnessOptions = {},
): SupervisorHarness => {
  let identifierSequence = 0;
  let workspaceSequence = 0;
  const events = [
    ...(options.processEvents ?? [terminalProcessEvent({})]),
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
    disconnect: jest.fn(),
  };
  const launch = jest.fn(options.launch ?? (() => session));
  const releaseReservation = jest.fn(async () => undefined);
  const reservation: AffiliateAgentProcessReservation = {
    reservationId: "reservation-1",
    launch,
    release: releaseReservation,
  };
  const reserve = jest.fn(
    options.reserve ?? (async () => reservation),
  );
  const defaultCreateWorkspace = async (
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
        executionClass: "PRODUCTION_OMP" as const,
        workerId: input.workerId,
        invocationId: input.invocationId,
        issuedAt: STARTED_AT,
        expiresAt: WORKSPACE_ATTESTATION_EXPIRES_AT,
        signature: `workspace-signature-${workspaceSequence}`,
      },
    };
  };
  const createWorkspace = jest.fn(
    options.createWorkspace ?? defaultCreateWorkspace,
  );
  const recoverStale = jest.fn(
    async (_reservation: AffiliateAgentProcessReservation) => undefined,
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
      processLauncher: { reserve },
      workspaces: {
        recoverStale,
        create: createWorkspace,
        destroy: destroyWorkspace,
      },
      workerHealth: options.workerHealth,
    },
    gatewayClaim,
    gatewayPerform,
    reserve,
    release: releaseReservation,
    launch,
    reconcileInvocation,
    recoverStale,
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
  gatewayAddress: "unix:///internal/affiliate-agent-gateway.sock",
  gatewayPathPrefix: "/v1/affiliate-agent",
  workerId: `${role.toLowerCase()}-worker-1`,
  invocationId: `${role.toLowerCase()}-invocation-1`,
});

describe("affiliate agent one-claim supervisor", () => {
  it("reserves runner capacity before claiming and releases it on no work", async () => {
    const harness = createSupervisorHarness({ claimResult: "NO_WORK" });
    const order: string[] = [];
    harness.reserve.mockImplementation(async () => {
      order.push("reserve");
      return {
        reservationId: "reservation-ordered",
        launch: harness.launch,
        release: harness.release,
      } satisfies AffiliateAgentProcessReservation;
    });
    harness.recoverStale.mockImplementation(async () => {
      order.push("recover");
    });
    harness.gatewayClaim.mockImplementation(async () => {
      order.push("claim");
      return null;
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("NO_WORK");

    expect(order).toEqual(["reserve", "recover", "claim"]);
    expect(harness.launch).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledTimes(1);
  });

  it("starts one exact OMP process for one claim and submits one terminal result", async () => {
    const harness = createSupervisorHarness({
      processEvents: [terminalProcessEvent({ disposition: "NO_ACTION" })],
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
      command: ["affiliate-omp-agent"],
      prompt: grant.prompt,
      environment: {
        AFFILIATE_AGENT_GATEWAY_ADDRESS:
          "unix:///internal/affiliate-agent-gateway.sock",
        AFFILIATE_AGENT_GATEWAY_PATH_PREFIX: "/v1/affiliate-agent",
        AFFILIATE_AGENT_CLAIM_TOKEN: grant.token,
        AFFILIATE_AGENT_CLAIM_ENVELOPE: canonicalizeAffiliateAgentValue(
          grant.envelope,
        ),
      },
      workspacePath: "/isolated/affiliate-agent-workspace-1",
      workerId: request.workerId,
      invocationId: request.invocationId,
      workspaceId: grant.envelope.workspaceId,
      workspaceMode: "READ_WRITE",
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
  it("halts admission after same-key claim transport retries remain indeterminate", async () => {
    const persistHalt = jest.fn(async () => undefined);
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt,
    };
    const harness = createSupervisorHarness({
      claim: async () => {
        throw new Error("The claim response was unavailable.");
      },
    });
    const input = { ...supervisorInput(), admissionState };

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, input),
    ).rejects.toThrow("The claim response was unavailable.");

    expect(harness.gatewayClaim).toHaveBeenCalledTimes(2);
    expect(harness.gatewayClaim.mock.calls[1][0]).toBe(
      harness.gatewayClaim.mock.calls[0][0],
    );
    expect(admissionState.isAdmissionHalted).toBe(true);
    expect(persistHalt).toHaveBeenCalledTimes(1);
    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...input,
        invocationId: "coverage_planner-invocation-2",
      }),
    ).resolves.toBe("NO_WORK");
    expect(harness.gatewayClaim).toHaveBeenCalledTimes(2);
  });

  it("does not halt admission for a non-retryable claim rejection", async () => {
    const persistHalt = jest.fn(async () => undefined);
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt,
    };
    const rejection = new AffiliateAgentGatewayError({
      code: "TOKEN_INVALID",
      isRetryable: false,
      safeMessage: "The claim token is invalid.",
    });
    const harness = createSupervisorHarness({
      claim: async () => {
        throw rejection;
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        admissionState,
      }),
    ).rejects.toBe(rejection);

    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    expect(admissionState.isAdmissionHalted).toBe(false);
    expect(persistHalt).not.toHaveBeenCalled();
  });
  it("halts after an indeterminate claim is followed by a non-retryable rejection", async () => {
    const persistHalt = jest.fn(async () => undefined);
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt,
    };
    const rejection = new AffiliateAgentGatewayError({
      code: "TOKEN_INVALID",
      isRetryable: false,
      safeMessage: "The second claim response rejected the request.",
    });
    let claimAttempt = 0;
    const harness = createSupervisorHarness({
      claim: async () => {
        claimAttempt += 1;
        if (claimAttempt === 1) {
          throw new Error("The first claim response was unavailable.");
        }
        throw rejection;
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        admissionState,
      }),
    ).rejects.toBe(rejection);

    expect(harness.gatewayClaim).toHaveBeenCalledTimes(2);
    expect(admissionState.isAdmissionHalted).toBe(true);
    expect(admissionState.admissionHaltError).toBe(rejection);
    expect(persistHalt).toHaveBeenCalledTimes(1);
  });
  it("halts admission and preserves workspace and reservation when process termination is unconfirmed", async () => {
    const persistHalt = jest.fn(async () => undefined);
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt,
    };
    const harness = createSupervisorHarness({
      processEvents: [terminalProcessEvent({ disposition: "NO_ACTION" })],
      terminate: async () => {
        throw new Error("graceful termination failed");
      },
      forceTerminate: async () => {
        throw new Error("force termination failed");
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        admissionState,
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      safeMessage: "The agent process could not be terminated.",
    });

    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.forceTerminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).not.toHaveBeenCalled();
    expect(harness.release).not.toHaveBeenCalled();
    expect(admissionState.isAdmissionHalted).toBe(true);
    expect(admissionState.admissionHaltError).toMatchObject({
      safeMessage: "The agent process could not be terminated.",
    });
    expect(persistHalt).toHaveBeenCalledTimes(1);
  });
  it("reports explicit cleanup failure when workspace destruction fails", async () => {
    const harness = createSupervisorHarness({
      processEvents: [terminalProcessEvent({ disposition: "NO_ACTION" })],
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
  it("halts admission after uncertain workspace cleanup", async () => {
    const persistHalt = jest.fn(async () => undefined);
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt,
    };
    const harness = createSupervisorHarness({
      processEvents: [terminalProcessEvent({ disposition: "NO_ACTION" })],
      destroyWorkspace: async () => {
        throw new Error("workspace destruction failed");
      },
    });
    const input = {
      ...supervisorInput(),
      admissionState,
    };

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, input),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      safeMessage: "The agent workspace could not be destroyed.",
    });
    expect(admissionState.isAdmissionHalted).toBe(true);
    expect(admissionState.admissionHaltError).toMatchObject({
      safeMessage: "The agent workspace could not be destroyed.",
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...input,
        invocationId: "coverage_planner-invocation-2",
      }),
    ).resolves.toBe("NO_WORK");
    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    expect(harness.createWorkspace).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    expect(harness.release).not.toHaveBeenCalled();
    expect(persistHalt).toHaveBeenCalledTimes(1);
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
  it("records a grant that resolves after shutdown before cleanup", async () => {
    const claimResult = createDeferred<AffiliateAgentClaimGrant | null>();
    const shutdownController = new AbortController();
    let claimRequest: AffiliateAgentClaimRequest | null = null;
    const harness = createSupervisorHarness({
      claim: async (request) => {
        claimRequest = request;
        return claimResult.promise;
      },
    });

    const invocation = runAffiliateAgentInvocation(harness.dependencies, {
      ...supervisorInput(),
      shutdownSignal: shutdownController.signal,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    expect(claimRequest).not.toBeNull();

    shutdownController.abort();
    claimResult.resolve(claimGrantFor(claimRequest!));

    await expect(invocation).resolves.toBe("INVOCATION_FAILED");
    expect(harness.launch).not.toHaveBeenCalled();
    expect(harness.gatewayPerform).not.toHaveBeenCalled();
    expectFailureReconciliation(harness, "PROCESS_CRASH", {
      jobId: "job-coverage_planner",
      claimId: "claim-coverage_planner",
      claimGeneration: 1,
    });
    expect(harness.reconcileInvocation.mock.invocationCallOrder[0]).toBeLessThan(
      harness.destroyWorkspace.mock.invocationCallOrder[0],
    );
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });
  it("recovers a rejected claim after shutdown with the same idempotency key", async () => {
    let rejectFirstClaim: ((error: unknown) => void) | null = null;
    const firstClaim = new Promise<AffiliateAgentClaimGrant | null>(
      (_resolve, reject) => {
        rejectFirstClaim = reject;
      },
    );
    let claimAttempt = 0;
    const shutdownController = new AbortController();
    const harness = createSupervisorHarness({
      claim: async (request) => {
        claimAttempt += 1;
        if (claimAttempt === 1) return firstClaim;
        return claimGrantFor(request);
      },
    });
    const invocation = runAffiliateAgentInvocation(harness.dependencies, {
      ...supervisorInput(),
      shutdownSignal: shutdownController.signal,
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
    shutdownController.abort();
    if (rejectFirstClaim === null) {
      throw new Error("The first claim rejection was not initialized.");
    }
    rejectFirstClaim(new Error("The first claim response was unavailable."));

    await expect(invocation).resolves.toBe("INVOCATION_FAILED");
    expect(harness.gatewayClaim).toHaveBeenCalledTimes(2);
    expect(harness.gatewayClaim.mock.calls[1][0]).toBe(
      harness.gatewayClaim.mock.calls[0][0],
    );
    expect(harness.launch).not.toHaveBeenCalled();
    expect(harness.gatewayPerform).not.toHaveBeenCalled();
    expect(harness.reconcileInvocation).toHaveBeenCalledTimes(1);
    expectFailureReconciliation(harness, "PROCESS_CRASH", {
      jobId: "job-coverage_planner",
      claimId: "claim-coverage_planner",
      claimGeneration: 1,
    });
    expect(harness.reconcileInvocation.mock.invocationCallOrder[0]).toBeLessThan(
      harness.destroyWorkspace.mock.invocationCallOrder[0],
    );
  });


  it("bounds a stalled runner reservation during shutdown and releases it if it arrives late", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const reservationResult = createDeferred<AffiliateAgentProcessReservation>();
      const shutdownController = new AbortController();
      const harness = createSupervisorHarness({
        reserve: async () => reservationResult.promise,
      });
      const invocation = runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        shutdownSignal: shutdownController.signal,
      });

      expect(harness.reserve).toHaveBeenCalledTimes(1);
      shutdownController.abort();
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
      );

      await expect(invocation).resolves.toBe("NO_WORK");
      expect(harness.createWorkspace).not.toHaveBeenCalled();
      expect(harness.gatewayClaim).not.toHaveBeenCalled();

      reservationResult.resolve({
        reservationId: "late-reservation",
        launch: harness.launch,
        release: harness.release,
      });
      await jest.advanceTimersByTimeAsync(0);
      expect(harness.release).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
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

      processEvent.resolve(
        terminalProcessEvent({ disposition: "NO_ACTION" }, "heartbeat-terminal-key"),
      );
      await expect(invocation).resolves.toBe("TERMINAL_ACCEPTED");
      expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("halts admission without reconciling when a lease heartbeat loses authorization", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const processEvent = createDeferred<AffiliateAgentProcessEvent>();
      const persistHalt = jest.fn();
      const admissionState = {
        isAdmissionHalted: false,
        admissionHaltError: null,
        persistHalt,
      };
      const authorizationError = new AffiliateAgentGatewayError({
        code: "ROLE_CREDENTIAL_INVALID",
        isRetryable: false,
        safeMessage: "The role credential is invalid.",
      });
      const harness = createSupervisorHarness({
        processEvents: [],
        nextProcessEvent: () => processEvent.promise,
        now: () => new Date(),
        perform: async (operation) => {
          if (operation.kind === "HEARTBEAT") throw authorizationError;
          throw new Error(`Unexpected operation: ${operation.kind}`);
        },
      });

      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        { ...supervisorInput(), admissionState },
      );
      const rejection = expect(invocation).rejects.toBe(authorizationError);
      await jest.advanceTimersByTimeAsync(60_000);
      await rejection;
      expect(admissionState.isAdmissionHalted).toBe(true);
      expect(admissionState.admissionHaltError).toBe(authorizationError);
      expect(persistHalt).toHaveBeenCalledTimes(1);
      expect(harness.reconcileInvocation).not.toHaveBeenCalled();
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it("reconciles an active claim when shutdown interrupts a heartbeat", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const shutdownController = new AbortController();
      const processEvent = createDeferred<AffiliateAgentProcessEvent>();
      let heartbeatCount = 0;
      const workerHealth = {
        heartbeat: jest.fn(async () => {
          heartbeatCount += 1;
          if (shutdownController.signal.aborted) {
            throw new Error("The worker heartbeat was cancelled.");
          }
        }),
      };
      const harness = createSupervisorHarness({
        processEvents: [],
        nextProcessEvent: () => processEvent.promise,
        workerHealth,
      });
      const invocation = runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        shutdownSignal: shutdownController.signal,
      });

      await jest.advanceTimersByTimeAsync(0);
      expect(harness.launch).toHaveBeenCalledTimes(1);

      shutdownController.abort();
      await jest.advanceTimersByTimeAsync(60_000);

      await expect(invocation).resolves.toBe("INVOCATION_FAILED");
      expect(heartbeatCount).toBe(2);
      expect(harness.gatewayPerform).not.toHaveBeenCalled();
      expectFailureReconciliation(harness, "PROCESS_CRASH");
      expect(harness.terminate).toHaveBeenCalledTimes(1);
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

      processEvent.resolve(
        terminalProcessEvent({ disposition: "NO_ACTION" }, "heartbeat-terminal-key"),
      );
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
      await jest.advanceTimersByTimeAsync(0);
      expect(harness.reconcileInvocation).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_TERMINAL_CONFIRMATION_TIMEOUT_MILLISECONDS,
      );

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

  it("drains a terminal frame after the model deadline for bounded confirmation", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const processEvent = createDeferred<AffiliateAgentProcessEvent>();
      const harness = createSupervisorHarness({
        processEvents: [],
        nextProcessEvent: () => processEvent.promise,
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
          return {
            kind: "INVOCATION_FAILED" as const,
            receiptId: "terminal-failure-after-deadline",
            failureCode: "TERMINAL_SUBMISSION_FAILURE" as const,
            invocationFailureCount: 1,
            nextAttemptAt: null,
            isPipelineBlocked: false,
          };
        },
      });
      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        supervisorInput(),
      );

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(20 * 60 * 1_000);
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1_000);
      processEvent.resolve(
        terminalProcessEvent({ disposition: "NO_ACTION" }, "late-terminal-key"),
      );
      await jest.advanceTimersByTimeAsync(0);

      await expect(invocation).resolves.toBe("INVOCATION_FAILED");
      const submitCall = harness.gatewayPerform.mock.calls.find(
        ([operation]) => operation.kind === "SUBMIT_RESULT",
      );
      expect(submitCall?.[0]).toMatchObject({
        kind: "SUBMIT_RESULT",
        idempotencyKey: "late-terminal-key",
      });
      expect(submitCall?.[1].deadlineAt).toBeGreaterThan(
        Date.parse(HARD_DEADLINE_AT),
      );
      expect(harness.reconcileInvocation).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("finishes failed terminal confirmation after shutdown begins", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const processEvent = createDeferred<AffiliateAgentProcessEvent>();
      const terminalResponse = createDeferred<{
        kind: "INVOCATION_FAILED";
        receiptId: string;
        failureCode: "TERMINAL_SUBMISSION_FAILURE";
        invocationFailureCount: 1;
        nextAttemptAt: string | null;
        isPipelineBlocked: boolean;
      }>();
      const shutdownController = new AbortController();
      const harness = createSupervisorHarness({
        processEvents: [],
        nextProcessEvent: () => processEvent.promise,
        now: () => new Date(),
        perform: async (operation) => {
          if (operation.kind === "HEARTBEAT") {
            return {
              kind: "HEARTBEAT_ACCEPTED" as const,
              receiptId: operation.idempotencyKey,
              heartbeatAt: STARTED_AT,
              leaseExpiresAt: "2026-08-20T18:05:00.000Z",
            };
          }
          if (operation.kind !== "SUBMIT_RESULT") {
            throw new Error(`Unexpected operation: ${operation.kind}`);
          }
          return terminalResponse.promise;
        },
      });
      const invocation = runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        shutdownSignal: shutdownController.signal,
      });

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(20 * 60 * 1_000);
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1_000);
      processEvent.resolve(
        terminalProcessEvent({ disposition: "NO_ACTION" }, "late-failed-key"),
      );
      await jest.advanceTimersByTimeAsync(0);
      expect(
        harness.gatewayPerform.mock.calls.filter(
          ([operation]) => operation.kind === "SUBMIT_RESULT",
        ),
      ).toHaveLength(1);
      shutdownController.abort();
      terminalResponse.resolve({
        kind: "INVOCATION_FAILED",
        receiptId: "failed-receipt-after-shutdown",
        failureCode: "TERMINAL_SUBMISSION_FAILURE",
        invocationFailureCount: 1,
        nextAttemptAt: null,
        isPipelineBlocked: false,
      });

      await expect(invocation).resolves.toBe("INVOCATION_FAILED");
      expect(harness.reconcileInvocation).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("drains an already launched claim to terminal acceptance after shutdown", async () => {
    const processEvent = createDeferred<AffiliateAgentProcessEvent>();
    const shutdownController = new AbortController();
    const lifecycle: string[] = [];
    const harness = createSupervisorHarness({
      processEvents: [],
      nextProcessEvent: () => processEvent.promise,
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        lifecycle.push("SUBMIT_RESULT");
        lifecycle.push("TERMINAL_ACCEPTED");
        return {
          kind: "TERMINAL_ACCEPTED" as const,
          receiptId: "terminal-receipt-after-shutdown",
          resultHash: SHA256,
          disposition: "NO_ACTION" as const,
          completedAt: STARTED_AT,
        };
      },
      terminate: async () => {
        lifecycle.push("TERMINATE");
      },
      destroyWorkspace: async () => {
        lifecycle.push("DESTROY_WORKSPACE");
      },
    });

    const invocation = runAffiliateAgentInvocation(harness.dependencies, {
      ...supervisorInput(),
      shutdownSignal: shutdownController.signal,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(harness.launch).toHaveBeenCalledTimes(1);

    shutdownController.abort();
    processEvent.resolve(
      terminalProcessEvent(
        { disposition: "NO_ACTION" },
        "terminal-key-after-shutdown",
      ),
    );

    await expect(invocation).resolves.toBe("TERMINAL_ACCEPTED");
    expect(lifecycle).toEqual([
      "SUBMIT_RESULT",
      "TERMINAL_ACCEPTED",
      "TERMINATE",
      "DESTROY_WORKSPACE",
    ]);
    expect(harness.reconcileInvocation).not.toHaveBeenCalled();
    expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });
  it("drains a terminal submission that began before shutdown", async () => {
    const terminalSubmission = createDeferred<unknown>();
    const shutdownController = new AbortController();
    const lifecycle: string[] = [];
    const harness = createSupervisorHarness({
      processEvents: [terminalProcessEvent({ disposition: "NO_ACTION" })],
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        lifecycle.push("SUBMIT_RESULT");
        const result = await terminalSubmission.promise;
        lifecycle.push("TERMINAL_ACCEPTED");
        return result;
      },
      terminate: async () => {
        lifecycle.push("TERMINATE");
      },
      destroyWorkspace: async () => {
        lifecycle.push("DESTROY_WORKSPACE");
      },
    });

    const invocation = runAffiliateAgentInvocation(harness.dependencies, {
      ...supervisorInput(),
      shutdownSignal: shutdownController.signal,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
    expect(harness.gatewayPerform.mock.calls[0][0]).toMatchObject({
      kind: "SUBMIT_RESULT",
    });

    shutdownController.abort();
    terminalSubmission.resolve({
      kind: "TERMINAL_ACCEPTED",
      receiptId: "terminal-receipt-after-shutdown",
      resultHash: SHA256,
      disposition: "NO_ACTION",
      completedAt: STARTED_AT,
    });

    await expect(invocation).resolves.toBe("TERMINAL_ACCEPTED");
    expect(lifecycle).toEqual([
      "SUBMIT_RESULT",
      "TERMINAL_ACCEPTED",
      "TERMINATE",
      "DESTROY_WORKSPACE",
    ]);
    expect(harness.reconcileInvocation).not.toHaveBeenCalled();
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
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
  it("preserves a runner hard-deadline timeout when the runner reports first", async () => {
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "EXIT", exitCode: 1, reason: "TIMEOUT" }],
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    expectFailureReconciliation(harness, "TIMEOUT", {
      jobId: "job-coverage_planner",
      claimId: "claim-coverage_planner",
      claimGeneration: 1,
    });
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });
  it("retries failure reconciliation with the same request until authoritative", async () => {
    let reconciliationAttempts = 0;
    const reconciliationRequests: AffiliateAgentInvocationReconciliationRequest[] = [];
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "EXIT", exitCode: 17 }],
      reconcileInvocation: async (request) => {
        reconciliationAttempts += 1;
        reconciliationRequests.push(request);
        if (reconciliationAttempts === 1) {
          throw new Error("The failure response was unavailable.");
        }
        return {
          kind: "INVOCATION_FAILED",
          failureCode: request.failure.code,
          invocationFailureCount: 1,
          nextAttemptAt: null,
          isPipelineBlocked: false,
        };
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    expect(reconciliationRequests).toHaveLength(2);
    expect(reconciliationRequests[1]).toBe(reconciliationRequests[0]);
    expect(reconciliationRequests[1].idempotencyKey).toBe(
      reconciliationRequests[0].idempotencyKey,
    );
  });

  it("halts shared admission after bounded failure reconciliation remains indeterminate", async () => {
    const persistHalt = jest.fn(async () => undefined);
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt,
    };
    const reconciliationRequests: AffiliateAgentInvocationReconciliationRequest[] = [];
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "EXIT", exitCode: 17 }],
      reconcileInvocation: async (request) => {
        reconciliationRequests.push(request);
        throw new Error("The failure response was unavailable.");
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        admissionState,
      }),
    ).rejects.toThrow("The failure response was unavailable.");

    expect(reconciliationRequests).toHaveLength(2);
    expect(reconciliationRequests[1]).toBe(reconciliationRequests[0]);
    expect(admissionState.isAdmissionHalted).toBe(true);
    expect(admissionState.admissionHaltError).toBeInstanceOf(Error);
    expect(persistHalt).toHaveBeenCalledTimes(1);
  });
  it("does not suppress admission persistence failure after an indeterminate outcome", async () => {
    const persistHalt = jest.fn(async () => {
      throw new Error("gateway halt persistence failed");
    });
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt,
    };
    const harness = createSupervisorHarness({
      processEvents: [{ kind: "EXIT", exitCode: 17 }],
      reconcileInvocation: async () => {
        throw new Error("The failure response was unavailable.");
      },
    });
    const input = { ...supervisorInput(), admissionState };

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, input),
    ).rejects.toThrow("gateway halt persistence failed");

    expect(admissionState.isAdmissionHalted).toBe(true);
    expect(admissionState.admissionHaltError).toMatchObject({
      message: "The failure response was unavailable.",
    });
    expect(persistHalt).toHaveBeenCalledTimes(1);
    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...input,
        invocationId: "coverage_planner-invocation-2",
      }),
    ).resolves.toBe("NO_WORK");
    expect(harness.gatewayClaim).toHaveBeenCalledTimes(1);
  });

  it("replays the child terminal handoff and never sends a runner correction", async () => {
    const result = {
      disposition: "NO_ACTION",
      evidenceRef: "evidence-1",
    };
    const idempotencyKey = "child-terminal-key";
    const harness = createSupervisorHarness({
      processEvents: [terminalProcessEvent(result, idempotencyKey)],
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("TERMINAL_ACCEPTED");

    expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
    expect(harness.gatewayPerform.mock.calls[0][0]).toMatchObject({
      kind: "SUBMIT_RESULT",
      idempotencyKey,
      result,
    });
    expect(harness.send).not.toHaveBeenCalled();
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("reconciles an inconsistent correction response without invoking runner correction", async () => {
    const result = { disposition: "NO_ACTION" };
    const harness = createSupervisorHarness({
      processEvents: [terminalProcessEvent(result, "child-terminal-key")],
      perform: async (operation) => {
        if (operation.kind !== "SUBMIT_RESULT") {
          throw new Error(`Unexpected operation: ${operation.kind}`);
        }
        return {
          kind: "SCHEMA_CORRECTION_REQUIRED" as const,
          receiptId: "inconsistent-correction-receipt",
          submissionNumber: 1 as const,
          remainingSubmissions: 2 as const,
          issues: [],
          correctionPrompt: "The child should have handled this correction.",
        };
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    expect(harness.gatewayPerform).toHaveBeenCalledTimes(1);
    expect(harness.send).not.toHaveBeenCalled();
    expectFailureReconciliation(harness, "TERMINAL_SUBMISSION_FAILURE");
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

  it("reconciles a malformed post-claim launch input", async () => {
    const harness = createSupervisorHarness({
      claim: async (request) => ({
        ...claimGrantFor(request),
        prompt: "x".repeat(131_073),
      }),
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    expect(harness.launch).not.toHaveBeenCalled();
    expectFailureReconciliation(harness, "MALFORMED_OUTPUT");
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
  });

  it("bounds failure reconciliation idempotency keys for long claim ids", async () => {
    const harness = createSupervisorHarness({
      claim: async (request) => {
        const grant = claimGrantFor(request);
        return {
          ...grant,
          envelope: {
            ...grant.envelope,
            claimId: "claim-" + "x".repeat(300),
          },
        };
      },
      processEvents: [{ kind: "EXIT", exitCode: 9 }],
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, supervisorInput()),
    ).resolves.toBe("INVOCATION_FAILED");

    const failureRequest = harness.reconcileInvocation.mock.calls[0][0] as
      AffiliateAgentInvocationReconciliationRequest;
    expect(failureRequest.idempotencyKey).toHaveLength(83);
    expect(failureRequest.idempotencyKey).toMatch(/^supervisor-failure-[0-9a-f]{64}$/);
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
      await jest.advanceTimersByTimeAsync(0);
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

  it("bounds workspace settlement after shutdown and cleans up a late workspace", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    const shutdown = new AbortController();
    const workspace = {
      path: "/isolated/late-workspace",
      attestation: {
        schemaVersion: 1 as const,
        workspaceId: "workspace-late",
        mode: "READ_WRITE" as const,
        executionClass: "PRODUCTION_OMP" as const,
        workerId: "coverage_planner-worker-1",
        invocationId: "coverage_planner-invocation-1",
        issuedAt: STARTED_AT,
        expiresAt: WORKSPACE_ATTESTATION_EXPIRES_AT,
        signature: "late-workspace-signature",
      },
    };
    const workspaceCreation = createDeferred<typeof workspace>();
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
    };
    try {
      const harness = createSupervisorHarness({
        createWorkspace: async () => workspaceCreation.promise,
      });
      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        {
          ...supervisorInput(),
          shutdownSignal: shutdown.signal,
          admissionState,
        },
      );
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await Promise.resolve();
      }
      shutdown.abort();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
      );
      expect(admissionState.isAdmissionHalted).toBe(true);
      workspaceCreation.resolve(workspace);
      await expect(invocation).rejects.toMatchObject({
        safeMessage: "The agent workspace did not settle during shutdown.",
      });
      expect(harness.destroyWorkspace).toHaveBeenCalledWith(workspace.path);
    } finally {
      jest.useRealTimers();
    }
  });
  it("bounds normal workspace creation before the runner reservation expires", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    const workspace = {
      path: "/isolated/slow-workspace",
      attestation: {
        schemaVersion: 1 as const,
        workspaceId: "workspace-slow",
        mode: "READ_WRITE" as const,
        executionClass: "PRODUCTION_OMP" as const,
        workerId: "coverage_planner-worker-1",
        invocationId: "coverage_planner-invocation-1",
        issuedAt: STARTED_AT,
        expiresAt: WORKSPACE_ATTESTATION_EXPIRES_AT,
        signature: "slow-workspace-signature",
      },
    };
    const workspaceCreation = createDeferred<typeof workspace>();
    const admissionState: AffiliateAgentSupervisorAdmissionState = {
      isAdmissionHalted: false,
      admissionHaltError: null,
    };
    try {
      const harness = createSupervisorHarness({
        createWorkspace: () => workspaceCreation.promise,
      });
      const invocation = runAffiliateAgentInvocation(
        harness.dependencies,
        {
          ...supervisorInput(),
          admissionState,
        },
      );
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await Promise.resolve();
      }
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
      );
      workspaceCreation.resolve(workspace);
      await expect(invocation).rejects.toMatchObject({
        safeMessage:
          "The agent workspace did not settle within its creation deadline.",
      });
      expect(admissionState.isAdmissionHalted).toBe(true);
      expect(harness.gatewayClaim).not.toHaveBeenCalled();
      expect(harness.launch).not.toHaveBeenCalled();
      expect(harness.destroyWorkspace).toHaveBeenCalledWith(workspace.path);
      expect(harness.release).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("destroys a workspace retained when shutdown races its completion", async () => {
    const shutdown = new AbortController();
    const workspaceStarted = createDeferred<boolean>();
    const workspace = {
      path: "/isolated/raced-workspace",
      attestation: {
        schemaVersion: 1 as const,
        workspaceId: "workspace-raced",
        mode: "READ_WRITE" as const,
        executionClass: "PRODUCTION_OMP" as const,
        workerId: "coverage_planner-worker-1",
        invocationId: "coverage_planner-invocation-1",
        issuedAt: STARTED_AT,
        expiresAt: WORKSPACE_ATTESTATION_EXPIRES_AT,
        signature: "raced-workspace-signature",
      },
    };
    const workspaceCreation = createDeferred<typeof workspace>();
    const harness = createSupervisorHarness({
      createWorkspace: () => {
        workspaceStarted.resolve(true);
        return workspaceCreation.promise;
      },
    });

    const invocation = runAffiliateAgentInvocation(
      harness.dependencies,
      {
        ...supervisorInput(),
        shutdownSignal: shutdown.signal,
      },
    );
    await workspaceStarted.promise;
    workspaceCreation.resolve(workspace);
    queueMicrotask(() => shutdown.abort());

    await expect(invocation).resolves.toBe("NO_WORK");
    expect(harness.gatewayClaim).not.toHaveBeenCalled();
    expect(harness.destroyWorkspace).toHaveBeenCalledWith(workspace.path);
    expect(harness.release).toHaveBeenCalledTimes(1);
  });
  it("rechecks an indeterminate claim after shutdown until authoritative no-work", async () => {
    const shutdown = new AbortController();
    let claimAttempt = 0;
    const harness = createSupervisorHarness({
      claim: async () => {
        claimAttempt += 1;
        if (claimAttempt === 1) {
          shutdown.abort();
          throw new Error("The first claim response was unavailable.");
        }
        return null;
      },
    });

    await expect(
      runAffiliateAgentInvocation(harness.dependencies, {
        ...supervisorInput(),
        shutdownSignal: shutdown.signal,
      }),
    ).resolves.toBe("NO_WORK");

    expect(harness.gatewayClaim).toHaveBeenCalledTimes(2);
    expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    expect(harness.release).toHaveBeenCalledTimes(1);
  });


  it("terminates and cleans up when terminal submission hangs until the deadline", async () => {
    jest.useFakeTimers({ now: new Date(STARTED_AT) });
    try {
      const harness = createSupervisorHarness({
        processEvents: [
          terminalProcessEvent({ disposition: "NO_ACTION" }),
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
      await jest.advanceTimersByTimeAsync(0);
      expect(harness.reconcileInvocation).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_TERMINAL_CONFIRMATION_TIMEOUT_MILLISECONDS,
      );
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
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(
        AFFILIATE_AGENT_TERMINAL_CONFIRMATION_TIMEOUT_MILLISECONDS,
      );
      await expect(invocation).resolves.toBe("INVOCATION_FAILED");

      expect(harness.launch).toHaveBeenCalledTimes(1);
      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expectFailureReconciliation(harness, "TIMEOUT");
      expect(harness.destroyWorkspace).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("passes only the scoped token, canonical envelope, prompt, and gateway channel", async () => {
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
        "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX",
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
    const restrictedChildLauncher: AffiliateAgentProcessReservation["launch"] = ({
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
        pushEvent(terminalProcessEvent(JSON.parse(line), "restricted-child-terminal-key"));
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
        disconnect: () => {
          if (!hasExited) child.kill("SIGKILL");
          reader.close();
        },
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
          "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX",
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
        commands: offlineProductionAdapters.commands,
        terminalEffects: offlineProductionAdapters.terminalEffects,
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
