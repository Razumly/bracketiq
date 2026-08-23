import {
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS,
  AffiliateAgentGatewayError,
  type AffiliateAgentClaimAuthorization,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentInvocationFailureEnvelope,
  type AffiliateAgentInvocationFailureCode,
  type AffiliateAgentSubmitResultOutcome,
} from "./agentGateway";
import type {
  AffiliateAgentProcessEvent,
  AffiliateAgentProcessSession,
  AffiliateAgentSupervisorDependencies,
} from "./agentGatewayAdapters";
import {
  AFFILIATE_AGENT_MAX_CLAIM_ENVELOPE_CANONICAL_BYTES,
  AFFILIATE_AGENT_MAX_ENVIRONMENT_VALUE_BYTES,
  canonicalizeAffiliateAgentValue,
  type AffiliateAgentRole,
} from "./agentGatewayContracts";

const AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS = 2;

const boundedEnvironmentValue = (name: string, value: string): string => {
  if (
    Buffer.byteLength(value, "utf8") >
    AFFILIATE_AGENT_MAX_ENVIRONMENT_VALUE_BYTES
  ) {
    throw new AffiliateAgentGatewayError({
      code: "INTERNAL_ERROR",
      isRetryable: false,
      safeMessage: `The ${name} environment value is too large.`,
    });
  }
  return value;
};

const boundedClaimEnvelope = (envelope: unknown): string => {
  const serialized = canonicalizeAffiliateAgentValue(envelope);
  if (
    Buffer.byteLength(serialized, "utf8") >
    AFFILIATE_AGENT_MAX_CLAIM_ENVELOPE_CANONICAL_BYTES
  ) {
    throw new AffiliateAgentGatewayError({
      code: "INTERNAL_ERROR",
      isRetryable: false,
      safeMessage: "The claim envelope is too large.",
    });
  }
  return serialized;
};

export type AffiliateAgentSupervisorInput = Readonly<{
  role: AffiliateAgentRole;
  roleCredential: string;
  modelCredential: string;
  gatewayAddress: string;
  workerId: string;
  invocationId: string;
}>;

export type AffiliateAgentSupervisorOutcome =
  | "NO_WORK"
  | "TERMINAL_ACCEPTED"
  | "INVOCATION_FAILED"
  | "PIPELINE_BLOCKED";

type SupervisorTimer<T> = Readonly<{
  promise: Promise<T>;
  cancel(): void;
}>;

type DeadlineWait<T> =
  | Readonly<{ kind: "VALUE"; value: T }>
  | Readonly<{ kind: "ERROR"; error: unknown }>
  | Readonly<{ kind: "DEADLINE" }>;

const createSupervisorTimer = <T>(
  delayMilliseconds: number,
  value: T,
): SupervisorTimer<T> => {
  let timeout: NodeJS.Timeout | undefined;
  const promise = new Promise<T>((resolve) => {
    timeout = setTimeout(resolve, Math.max(0, delayMilliseconds), value);
  });
  return {
    promise,
    cancel: () => {
      clearTimeout(timeout);
    },
  };
};

const AFFILIATE_AGENT_TERMINATION_GRACE_MILLISECONDS = 5_000;

const terminateWithinGrace = async (
  terminate: () => Promise<void>,
): Promise<boolean> => {
  const timeout = createSupervisorTimer(
    AFFILIATE_AGENT_TERMINATION_GRACE_MILLISECONDS,
    false,
  );
  try {
    return await Promise.race([terminate().then(() => true), timeout.promise]);
  } finally {
    timeout.cancel();
  }
};

const authorizationFor = (
  grant: AffiliateAgentClaimGrant,
): AffiliateAgentClaimAuthorization => ({
  token: grant.token,
  jobId: grant.envelope.jobId,
  claimId: grant.envelope.claimId,
  claimGeneration: grant.envelope.claimGeneration,
  lifecycleGeneration: grant.envelope.lifecycleGeneration,
  role: grant.envelope.role,
  workerId: grant.envelope.workerId,
  invocationId: grant.envelope.invocationId,
  supplyContractHash: grant.envelope.supplyContractHash,
});

const outcomeForInvocationFailure = (
  isPipelineBlocked: boolean,
): AffiliateAgentSupervisorOutcome =>
  isPipelineBlocked ? "PIPELINE_BLOCKED" : "INVOCATION_FAILED";

const failureCodeForGatewayError = (
  error: unknown,
  fallback: Exclude<
    AffiliateAgentInvocationFailureCode,
    "SCHEMA_CORRECTIONS_EXHAUSTED"
  >,
): Exclude<
  AffiliateAgentInvocationFailureCode,
  "SCHEMA_CORRECTIONS_EXHAUSTED"
> => {
  if (!(error instanceof AffiliateAgentGatewayError)) return fallback;
  if (
    error.code === "CLAIM_GENERATION_STALE" ||
    error.code === "LIFECYCLE_GENERATION_STALE"
  ) {
    return "STALE_GENERATION";
  }
  if (
    error.code === "LEASE_EXPIRED" ||
    error.code === "HARD_DEADLINE_EXCEEDED" ||
    error.code === "TOKEN_EXPIRED"
  ) {
    return "TIMEOUT";
  }
  if (error.code === "RESULT_SCHEMA_INVALID") return "MALFORMED_OUTPUT";
  return fallback;
};
const failureSummaryFor = (
  code: Exclude<
    AffiliateAgentInvocationFailureCode,
    "SCHEMA_CORRECTIONS_EXHAUSTED"
  >,
): string => {
  switch (code) {
    case "MALFORMED_OUTPUT":
      return "The invocation output was malformed.";
    case "STALE_GENERATION":
      return "The invocation claim generation became stale.";
    case "PROCESS_CRASH":
      return "The invocation process ended before completion.";
    case "TIMEOUT":
      return "The invocation exceeded its hard deadline.";
    case "TERMINAL_SUBMISSION_FAILURE":
      return "The terminal result could not be confirmed.";
  }
};

export const runAffiliateAgentInvocation = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
): Promise<AffiliateAgentSupervisorOutcome> => {
  await dependencies.workerHealth?.heartbeat({
    workerId: input.workerId,
    role: input.role,
    now: dependencies.clock.now(),
  });
  const workspace = await dependencies.workspaces.create({
    workerId: input.workerId,
    invocationId: input.invocationId,
    mode: input.role === "SUPPLY_REVIEWER" ? "READ_ONLY" : "READ_WRITE",
  });
  let processSession: AffiliateAgentProcessSession | null = null;
  let heartbeatTimer: SupervisorTimer<Readonly<{ kind: "HEARTBEAT" }>> | null =
    null;
  let deadlineTimer: SupervisorTimer<Readonly<{ kind: "DEADLINE" }>> | null =
    null;

  const terminateProcess = async (): Promise<void> => {
    const activeSession = processSession;
    if (activeSession === null) return;

    try {
      const terminated = await terminateWithinGrace(() =>
        activeSession.terminate(),
      );
      if (terminated) {
        processSession = null;
        return;
      }
    } catch {
      // Try force termination after a graceful failure.
    }

    let isForceTerminated = false;
    try {
      isForceTerminated = await terminateWithinGrace(() =>
        activeSession.forceTerminate(),
      );
    } catch {
      isForceTerminated = false;
    }
    if (isForceTerminated) {
      processSession = null;
      return;
    }
    throw new AffiliateAgentGatewayError({
      code: "INTERNAL_ERROR",
      isRetryable: false,
      safeMessage: "The agent process could not be terminated.",
    });
  };

  try {
    const claimRequest = {
      idempotencyKey: dependencies.identifiers.create("receipt"),
      roleCredential: input.roleCredential,
      role: input.role,
      workerId: input.workerId,
      invocationId: input.invocationId,
      workspaceAttestation: workspace.attestation,
    } as const;
    let grant: AffiliateAgentClaimGrant | null = null;
    for (
      let claimAttempt = 1;
      claimAttempt <= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS;
      claimAttempt += 1
    ) {
      try {
        grant = await dependencies.gateway.claim(claimRequest);
        break;
      } catch (error) {
        if (
          error instanceof AffiliateAgentGatewayError &&
          error.code === "PIPELINE_BLOCKED"
        ) {
          return "PIPELINE_BLOCKED";
        }
        if (claimAttempt >= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS) {
          throw error;
        }
        if (error instanceof AffiliateAgentGatewayError && !error.isRetryable) {
          throw error;
        }
      }
    }

    if (grant === null) return "NO_WORK";

    const authorization = authorizationFor(grant);
    const failureIdempotencyKey = `supervisor-failure-${grant.envelope.claimId}`;
    const claimedHardDeadline = Date.parse(grant.hardDeadlineAt);
    const now = dependencies.clock.now().getTime();
    const hardDeadlineAt = Math.min(
      Number.isNaN(claimedHardDeadline) ? now : claimedHardDeadline,
      now + AFFILIATE_AGENT_HARD_DEADLINE_SECONDS * 1_000,
    );
    deadlineTimer = createSupervisorTimer(hardDeadlineAt - now, {
      kind: "DEADLINE" as const,
    });
    heartbeatTimer = createSupervisorTimer(
      AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS * 1_000,
      { kind: "HEARTBEAT" } as const,
    );

    const reconcileFailure = async (
      failureCode: Exclude<
        AffiliateAgentInvocationFailureCode,
        "SCHEMA_CORRECTIONS_EXHAUSTED"
      >,
    ): Promise<AffiliateAgentSupervisorOutcome> => {
      try {
        await terminateProcess();
      } catch {
        // Reconcile the claim even when child termination fails.
      }
      const failure: AffiliateAgentInvocationFailureEnvelope = {
        schemaVersion: 1,
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        lifecycleGeneration: grant.envelope.lifecycleGeneration,
        role: grant.envelope.role,
        workerId: grant.envelope.workerId,
        invocationId: grant.envelope.invocationId,
        supplyContractHash: grant.envelope.supplyContractHash,
        code: failureCode,
        occurredAt: dependencies.clock.now().toISOString(),
        evidenceRefs: [],
        safeSummary: failureSummaryFor(failureCode),
      };
      const authoritative =
        await dependencies.invocationReconciler.reconcileInvocation({
          kind: "RECORD_FAILURE",
          idempotencyKey: failureIdempotencyKey,
          authorization,
          failure,
        });
      if (authoritative.kind === "TERMINAL_ACCEPTED") {
        return "TERMINAL_ACCEPTED";
      }
      return outcomeForInvocationFailure(authoritative.isPipelineBlocked);
    };

    const waitHeartbeatAware = async <T>(
      operation: Promise<T>,
    ): Promise<DeadlineWait<T>> => {
      const settledOperation = operation.then(
        (value) => ({ kind: "VALUE" as const, value }),
        (error: unknown) => ({ kind: "ERROR" as const, error }),
      );
      while (true) {
        if (heartbeatTimer === null || deadlineTimer === null) {
          return {
            kind: "ERROR",
            error: new AffiliateAgentGatewayError({
              code: "INTERNAL_ERROR",
              isRetryable: false,
              safeMessage: "The supervisor wait timers are not available.",
            }),
          };
        }
        const wake = await Promise.race([
          settledOperation,
          heartbeatTimer.promise,
          deadlineTimer.promise,
        ]);
        if (wake.kind !== "HEARTBEAT") return wake;

        heartbeatTimer = createSupervisorTimer(
          AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS * 1_000,
          { kind: "HEARTBEAT" } as const,
        );
        const heartbeatOperation = {
          kind: "HEARTBEAT" as const,
          idempotencyKey: dependencies.identifiers.create("receipt"),
          authorization,
        };
        for (
          let heartbeatAttempt = 1;
          heartbeatAttempt <= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS;
          heartbeatAttempt += 1
        ) {
          const heartbeat = await Promise.race([
            dependencies.gateway.perform(heartbeatOperation).then(
              () => ({ kind: "VALUE" as const }),
              (error: unknown) => ({ kind: "ERROR" as const, error }),
            ),
            deadlineTimer.promise,
          ]);
          if (heartbeat.kind === "DEADLINE") return heartbeat;
          if (heartbeat.kind === "VALUE") break;
          if (heartbeatAttempt >= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS) {
            return heartbeat;
          }
          if (
            heartbeat.error instanceof AffiliateAgentGatewayError &&
            !heartbeat.error.isRetryable
          ) {
            return heartbeat;
          }
        }
      }
    };

    if (hardDeadlineAt <= dependencies.clock.now().getTime()) {
      return await reconcileFailure("TIMEOUT");
    }
    const serializedClaimEnvelope = boundedClaimEnvelope(grant.envelope);
    const processPrompt = boundedEnvironmentValue("prompt", grant.prompt);
    const launchEnvironment = {
      OPENAI_API_KEY: boundedEnvironmentValue(
        "model credential",
        input.modelCredential,
      ),
      AFFILIATE_AGENT_GATEWAY_ADDRESS: boundedEnvironmentValue(
        "gateway address",
        input.gatewayAddress,
      ),
      AFFILIATE_AGENT_CLAIM_TOKEN: boundedEnvironmentValue(
        "claim token",
        grant.token,
      ),
      AFFILIATE_AGENT_CLAIM_ENVELOPE: boundedEnvironmentValue(
        "claim envelope",
        serializedClaimEnvelope,
      ),
      AFFILIATE_AGENT_PROMPT: processPrompt,
    };

    try {
      processSession = dependencies.processLauncher.launch({
        command: ["codex", "exec", "--ephemeral"],
        prompt: processPrompt,
        environment: launchEnvironment,
        workspacePath: workspace.path,
      });
    } catch {
      return await reconcileFailure("PROCESS_CRASH");
    }

    let processWake: Promise<AffiliateAgentProcessEvent | void> =
      processSession.started;
    let isProcessReady = false;
    let resultSubmissionCount = 0;
    while (true) {
      const wake = await waitHeartbeatAware(processWake);

      if (wake.kind === "DEADLINE") return await reconcileFailure("TIMEOUT");
      if (wake.kind === "ERROR") {
        return await reconcileFailure(
          failureCodeForGatewayError(wake.error, "PROCESS_CRASH"),
        );
      }

      const event = wake.value;

      if (!isProcessReady) {
        if (event !== undefined) {
          return await reconcileFailure("MALFORMED_OUTPUT");
        }
        isProcessReady = true;
        processWake = processSession.nextEvent();
        continue;
      }

      const processEvent = event;
      if (processEvent === undefined) {
        return await reconcileFailure("MALFORMED_OUTPUT");
      }
      if (processEvent.kind === "EXIT") {
        return await reconcileFailure(
          processEvent.exitCode === 0 ? "MALFORMED_OUTPUT" : "PROCESS_CRASH",
        );
      }

      resultSubmissionCount += 1;
      const terminalOperation = {
        kind: "SUBMIT_RESULT" as const,
        idempotencyKey: dependencies.identifiers.create("receipt"),
        authorization,
        result: processEvent.value,
      };
      let result: AffiliateAgentSubmitResultOutcome | null = null;
      let terminalError: unknown;
      for (
        let submissionAttempt = 1;
        submissionAttempt <= 2;
        submissionAttempt += 1
      ) {
        const submission = await waitHeartbeatAware(
          dependencies.gateway.perform(terminalOperation),
        );
        if (submission.kind === "DEADLINE") {
          return await reconcileFailure("TIMEOUT");
        }
        if (submission.kind === "VALUE") {
          result = submission.value;
          break;
        }
        terminalError = submission.error;
        const mappedFailure = failureCodeForGatewayError(
          terminalError,
          "TERMINAL_SUBMISSION_FAILURE",
        );
        if (mappedFailure !== "TERMINAL_SUBMISSION_FAILURE") {
          return await reconcileFailure(mappedFailure);
        }
      }
      if (result === null) {
        return await reconcileFailure(
          failureCodeForGatewayError(
            terminalError,
            "TERMINAL_SUBMISSION_FAILURE",
          ),
        );
      }

      if (result.kind === "TERMINAL_ACCEPTED") return "TERMINAL_ACCEPTED";
      if (result.kind === "INVOCATION_FAILED") {
        return outcomeForInvocationFailure(result.isPipelineBlocked);
      }
      if (resultSubmissionCount >= AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS) {
        await terminateProcess();
        throw new AffiliateAgentGatewayError({
          code: "INTERNAL_ERROR",
          isRetryable: false,
          safeMessage:
            "The gateway returned schema correction after the correction limit.",
        });
      }

      const correctionSend = await waitHeartbeatAware(
        processSession.send({
          kind: "SCHEMA_CORRECTION",
          correctionPrompt: result.correctionPrompt,
        }),
      );
      if (correctionSend.kind === "DEADLINE") {
        return await reconcileFailure("TIMEOUT");
      }
      if (correctionSend.kind === "ERROR") {
        return await reconcileFailure(
          failureCodeForGatewayError(correctionSend.error, "PROCESS_CRASH"),
        );
      }
      processWake = processSession.nextEvent();
    }
  } finally {
    heartbeatTimer?.cancel();
    deadlineTimer?.cancel();

    let isTerminationFailed = false;
    let terminationFailure: unknown;
    try {
      await terminateProcess();
    } catch (error) {
      isTerminationFailed = true;
      terminationFailure = error;
    }
    let isWorkspaceFailed = false;
    try {
      await dependencies.workspaces.destroy(workspace.path);
    } catch {
      isWorkspaceFailed = true;
    }

    if (isTerminationFailed) throw terminationFailure;
    if (isWorkspaceFailed) {
      throw new AffiliateAgentGatewayError({
        code: "INTERNAL_ERROR",
        isRetryable: false,
        safeMessage: "The agent workspace could not be destroyed.",
      });
    }
  }
};
