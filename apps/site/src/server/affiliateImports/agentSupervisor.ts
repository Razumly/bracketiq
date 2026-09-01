import { join } from "node:path";
import {
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AffiliateAgentGatewayError,
  type AffiliateAgentClaimAuthorization,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimRequest,
  type AffiliateAgentInvocationFailureEnvelope,
  type AffiliateAgentInvocationFailureCode,
  type AffiliateAgentSubmitResultOutcome,
  type AffiliateAgentWorkspaceAttestation,
} from "./agentGateway";
import type {
  AffiliateAgentInvocationReconciliationRequest,
  AffiliateAgentInvocationReconciliationResult,
  AffiliateAgentProcessEvent,
  AffiliateAgentProcessReservation,
  AffiliateAgentProcessSession,
  AffiliateAgentSupervisorDependencies,
} from "./agentGatewayAdapters";
import {
  AFFILIATE_AGENT_MAX_CLAIM_ENVELOPE_CANONICAL_BYTES,
  AFFILIATE_AGENT_MAX_ENVIRONMENT_VALUE_BYTES,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  type AffiliateAgentRole,
} from "./agentGatewayContracts";
import { AffiliateAgentProcessCapacityError } from "./agentGatewayAdapters";

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

export type AffiliateAgentSupervisorAdmissionState = {
  isAdmissionHalted: boolean;
  admissionHaltError: unknown | null;
  persistHalt?: () => void | Promise<void>;
};

export type AffiliateAgentSupervisorInput = Readonly<{
  role: AffiliateAgentRole;
  roleCredential: string;
  gatewayAddress: string;
  gatewayPathPrefix: string;
  workerId: string;
  invocationId: string;
  shutdownSignal?: AbortSignal;
  admissionState?: AffiliateAgentSupervisorAdmissionState;
}>;

export type AffiliateAgentSupervisorOutcome =
  | "NO_WORK"
  | "TERMINAL_ACCEPTED"
  | "INVOCATION_FAILED"
  | "PIPELINE_BLOCKED";

type SupervisorWaitControl =
  | Readonly<{ kind: "ERROR"; error: unknown }>
  | Readonly<{ kind: "DEADLINE" }>
  | Readonly<{ kind: "SHUTDOWN" }>;

type DeadlineWait<T> =
  | Readonly<{ kind: "VALUE"; value: T }>
  | SupervisorWaitControl;
type SettledWait<T> = Extract<
  DeadlineWait<T>,
  Readonly<{ kind: "VALUE" | "ERROR" }>
>;

const settleSupervisorOperation = <T>(
  operation: Promise<T>,
): Promise<SettledWait<T>> =>
  operation.then(
    (value) => ({ kind: "VALUE" as const, value }),
    (error: unknown) => ({ kind: "ERROR" as const, error }),
  );

type SupervisorTimer<T> = Readonly<{
  promise: Promise<T>;
  cancel(): void;
}>;

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

type SupervisorFailureCode = Exclude<
  AffiliateAgentInvocationFailureCode,
  "SCHEMA_CORRECTIONS_EXHAUSTED"
>;

const failureCodeForGatewayError = (
  error: unknown,
  fallback: SupervisorFailureCode,
): SupervisorFailureCode => {
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

const failureSummaryFor = (code: SupervisorFailureCode): string => {
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

type SupervisorShutdown = Readonly<{
  promise: Promise<Readonly<{ kind: "SHUTDOWN" }>> | null;
  isAborted(): boolean;
  remove(): void;
}>;

const createSupervisorShutdown = (
  signal: AbortSignal | undefined,
): SupervisorShutdown => {
  if (signal === undefined) {
    return {
      promise: null,
      isAborted: () => false,
      remove: () => undefined,
    };
  }

  let remove = (): void => undefined;
  const promise = new Promise<Readonly<{ kind: "SHUTDOWN" }>>((resolve) => {
    const onAbort = (): void => resolve({ kind: "SHUTDOWN" });
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    remove = () => signal.removeEventListener("abort", onAbort);
  });
  return { promise, isAborted: () => signal.aborted, remove };
};

type SupervisorWorkspace = Readonly<{
  path: string;
  codexHome?: string;
  attestation: AffiliateAgentWorkspaceAttestation;
}>;

type SupervisorClaimRequest = AffiliateAgentClaimRequest;

type SupervisorClaimResult =
  | AffiliateAgentClaimGrant
  | "NO_WORK"
  | "PIPELINE_BLOCKED";

type SupervisorLease = Readonly<{
  wait<T>(operation: Promise<T>): Promise<DeadlineWait<T>>;
  waitForDrain<T>(operation: Promise<T>): Promise<DeadlineWait<T>>;
  isExpired(): boolean;
  cancel(): void;
}>;

type SupervisorState = {
  readonly shutdown: SupervisorShutdown;
  readonly admissionState?: AffiliateAgentSupervisorAdmissionState;
  processReservation: AffiliateAgentProcessReservation | null;
  processSession: AffiliateAgentProcessSession | null;
  lease: SupervisorLease | null;
  lateWorkspaceCleanup: Promise<void> | null;
};

const createSupervisorState = (
  shutdownSignal: AbortSignal | undefined,
  admissionState: AffiliateAgentSupervisorAdmissionState | undefined,
): SupervisorState => ({
  shutdown: createSupervisorShutdown(shutdownSignal),
  admissionState,
  processReservation: null,
  processSession: null,
  lease: null,
  lateWorkspaceCleanup: null,
});

const waitForShutdown = <T>(
  shutdown: SupervisorShutdown,
  operation: Promise<T>,
): Promise<DeadlineWait<T>> => {
  const settledOperation = settleSupervisorOperation(operation);
  if (shutdown.promise === null) return settledOperation;
  return Promise.race([settledOperation, shutdown.promise]);
};
export const AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS =
  30_000 as const;

const settleReservationWithinTimeout = async (
  operation: Promise<AffiliateAgentProcessReservation>,
): Promise<AffiliateAgentProcessReservation | null> => {
  const timeout = createSupervisorTimer(
    AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
    { kind: "TIMEOUT" } as const,
  );
  try {
    const result = await Promise.race([
      settleSupervisorOperation(operation),
      timeout.promise,
    ]);
    return result.kind === "VALUE" ? result.value : null;
  } finally {
    timeout.cancel();
  }
};

const releaseReservationWhenSettled = (
  operation: Promise<AffiliateAgentProcessReservation>,
): void => {
  void operation.then(
    (reservation) => Promise.resolve()
      .then(() => reservation.release())
      .catch(() => undefined),
    () => undefined,
  );
};

const waitForReservation = (
  shutdown: SupervisorShutdown,
  operation: Promise<AffiliateAgentProcessReservation>,
): Promise<DeadlineWait<AffiliateAgentProcessReservation>> => {
  const timeout = createSupervisorTimer(
    AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
    { kind: "DEADLINE" } as const,
  );
  const settledOperation = settleSupervisorOperation(operation);
  const wait = shutdown.promise === null
    ? Promise.race([settledOperation, timeout.promise])
    : Promise.race([settledOperation, timeout.promise, shutdown.promise]);
  return wait.finally(() => timeout.cancel());
};


const createClaimRequest = (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
  workspace: SupervisorWorkspace,
): SupervisorClaimRequest => ({
  idempotencyKey: dependencies.identifiers.create("receipt"),
  roleCredential: input.roleCredential,
  role: input.role,
  workerId: input.workerId,
  invocationId: input.invocationId,
  workspaceAttestation: workspace.attestation,
});

type SupervisorClaimFailureDecision =
  | "PIPELINE_BLOCKED"
  | "RETRY"
  | "HALT"
  | "FAILURE";

const databaseErrorCode = (error: object): string | null => (
  "code" in error && typeof error.code === "string" ? error.code : null
);

const databaseErrorMessage = (error: object): string => (
  "message" in error && typeof error.message === "string" ? error.message : ""
);

const isDatabaseAuthorizationCode = (code: string | null): boolean => (
  code === "P1000"
  || code === "P1010"
  || code === "28P01"
  || code === "28000"
);

const databaseAuthorizationError = (error: unknown): boolean => {
  if (error === null || typeof error !== "object") return false;
  if (isDatabaseAuthorizationCode(databaseErrorCode(error))) return true;
  return /(?:password )?authentication failed|not authorized to access/i.test(
    databaseErrorMessage(error),
  );
};

const admissionHaltRequiredFor = (error: unknown): boolean => {
  if (databaseAuthorizationError(error)) return true;
  if (!(error instanceof AffiliateAgentGatewayError)) return false;
  switch (error.code) {
    case "GATEWAY_ADMISSION_HALTED":
    case "ROLE_CREDENTIAL_INVALID":
    case "ROLE_NOT_ALLOWED":
    case "SUPPLY_CONTRACT_STALE":
    case "DEPLOYMENT_CONTRACT_STALE":
      return true;
    default:
      return false;
  }
};

const claimFailureDecision = (
  error: unknown,
  claimAttempt: number,
): SupervisorClaimFailureDecision => {
  if (
    error instanceof AffiliateAgentGatewayError
    && error.code === "PIPELINE_BLOCKED"
  ) {
    return "PIPELINE_BLOCKED";
  }
  if (
    error instanceof AffiliateAgentGatewayError
    && !error.isRetryable
  ) {
    return "FAILURE";
  }
  return claimAttempt >= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS
    ? "HALT"
    : "RETRY";
};

const resolveClaimFailure = async (
  state: SupervisorState,
  error: unknown,
  attempt: number,
  hadIndeterminateFailure: boolean,
  retry: () => Promise<SupervisorClaimResult>,
): Promise<SupervisorClaimResult> => {
  const decision = claimFailureDecision(error, attempt);
  if (decision === "PIPELINE_BLOCKED") return "PIPELINE_BLOCKED";
  if (decision === "FAILURE") {
    if (hadIndeterminateFailure || admissionHaltRequiredFor(error)) {
      await haltAdmission(state, error);
    }
    throw error;
  }
  if (decision === "HALT") {
    await haltAdmission(state, error);
    throw error;
  }
  return retry();
};

const claimAffiliateAgent = (
  dependencies: AffiliateAgentSupervisorDependencies,
  state: SupervisorState,
  claimRequest: SupervisorClaimRequest,
): Promise<SupervisorClaimResult> => {
  const claimAttempt = (
    attempt: number,
    allowAfterShutdown = false,
    hadIndeterminateFailure = false,
  ): Promise<SupervisorClaimResult> => {
    if (state.shutdown.isAborted() && !allowAfterShutdown) {
      return Promise.resolve("NO_WORK");
    }
    const claimOperation = dependencies.gateway.claim(claimRequest);
    return waitForShutdown(
      state.shutdown,
      claimOperation,
    ).then(async (claimResult) => {
      if (claimResult.kind === "SHUTDOWN") {
        const settledClaim = await settleSupervisorOperation(claimOperation);
        if (settledClaim.kind === "VALUE") {
          return settledClaim.value ?? "NO_WORK";
        }
        if (settledClaim.kind === "ERROR") {
          return resolveClaimFailure(
            state,
            settledClaim.error,
            attempt,
            hadIndeterminateFailure,
            () => claimAttempt(attempt + 1, true, true),
          );
        }
        return "NO_WORK";
      }
      if (claimResult.kind === "VALUE") {
        return claimResult.value ?? "NO_WORK";
      }
      if (claimResult.kind === "DEADLINE") {
        throw new AffiliateAgentGatewayError({
          code: "INTERNAL_ERROR",
          isRetryable: false,
          safeMessage:
            "The supervisor claim wait reached an unexpected deadline.",
        });
      }
      return resolveClaimFailure(
        state,
        claimResult.error,
        attempt,
        hadIndeterminateFailure,
        () => claimAttempt(attempt + 1, true, true),
      );
    });
  };
  return claimAttempt(1);
};



const hardDeadlineAtFor = (
  grant: AffiliateAgentClaimGrant,
  nowMilliseconds: number,
): number => {
  const claimedHardDeadline = Date.parse(grant.hardDeadlineAt);
  return Math.min(
    Number.isNaN(claimedHardDeadline) ? nowMilliseconds : claimedHardDeadline,
    nowMilliseconds + AFFILIATE_AGENT_HARD_DEADLINE_SECONDS * 1_000,
  );
};

type SupervisorHeartbeatOperation = Extract<
  AffiliateAgentClaimOperation,
  { kind: "HEARTBEAT" }
>;

const recordWorkerHeartbeat = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
): Promise<void> => {
  await dependencies.workerHealth?.heartbeat({
    workerId: input.workerId,
    role: input.role,
    now: dependencies.clock.now(),
  });
};
const waitForSupervisorHeartbeat = <T>(
  operation: Promise<T>,
  deadlinePromise: Promise<Readonly<{ kind: "DEADLINE" }>>,
  shutdownPromise: Promise<Readonly<{ kind: "SHUTDOWN" }>> | null,
  includeShutdown: boolean,
): Promise<DeadlineWait<T>> => {
  const waits: Array<Promise<DeadlineWait<T>>> = [
    settleSupervisorOperation(operation),
    deadlinePromise,
  ];
  if (includeShutdown && shutdownPromise !== null) {
    waits.push(shutdownPromise);
  }
  return Promise.race(waits);
};

const shouldStopGatewayHeartbeatRetry = (
  heartbeat: DeadlineWait<undefined>,
  attempt: number,
): boolean => {
  if (heartbeat.kind !== "ERROR") return true;
  if (attempt >= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS) return true;
  return (
    heartbeat.error instanceof AffiliateAgentGatewayError
    && !heartbeat.error.isRetryable
  );
};

const performGatewayHeartbeat = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  heartbeatOperation: SupervisorHeartbeatOperation,
  deadlinePromise: Promise<Readonly<{ kind: "DEADLINE" }>>,
  shutdownPromise: Promise<Readonly<{ kind: "SHUTDOWN" }>> | null,
  includeShutdown: boolean,
): Promise<DeadlineWait<undefined>> => {
  for (
    let heartbeatAttempt = 1;
    heartbeatAttempt <= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS;
    heartbeatAttempt += 1
  ) {
    const heartbeat = await waitForSupervisorHeartbeat(
      dependencies.gateway.perform(heartbeatOperation).then(() => undefined),
      deadlinePromise,
      shutdownPromise,
      includeShutdown,
    );
    if (shouldStopGatewayHeartbeatRetry(heartbeat, heartbeatAttempt)) {
      return heartbeat;
    }
  }
  return {
    kind: "ERROR",
    error: new AffiliateAgentGatewayError({
      code: "INTERNAL_ERROR",
      isRetryable: false,
      safeMessage: "The supervisor heartbeat retry loop exhausted unexpectedly.",
    }),
  };
};


const createSupervisorLease = (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
  authorization: AffiliateAgentClaimAuthorization,
  hardDeadlineAt: number,
  nowMilliseconds: number,
  shutdown: SupervisorShutdown,
): SupervisorLease => {
  const deadlineTimer = createSupervisorTimer(hardDeadlineAt - nowMilliseconds, {
    kind: "DEADLINE" as const,
  });
  let heartbeatTimer = createSupervisorTimer(
    AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS * 1_000,
    { kind: "HEARTBEAT" } as const,
  );
  const shutdownPromise = shutdown.promise;

  const performHeartbeat = async (
    includeShutdown: boolean,
  ): Promise<DeadlineWait<undefined>> => {
    const workerHeartbeat = await waitForSupervisorHeartbeat(
      recordWorkerHeartbeat(dependencies, input),
      deadlineTimer.promise,
      shutdownPromise,
      includeShutdown,
    );
    if (workerHeartbeat.kind !== "VALUE") return workerHeartbeat;
    const heartbeatOperation: SupervisorHeartbeatOperation = {
      kind: "HEARTBEAT",
      idempotencyKey: dependencies.identifiers.create("receipt"),
      authorization,
    };
    return performGatewayHeartbeat(
      dependencies,
      heartbeatOperation,
      deadlineTimer.promise,
      shutdownPromise,
      includeShutdown,
    );
  };

  const waitFor = async <T>(
    operation: Promise<T>,
    includeShutdown: boolean,
  ): Promise<DeadlineWait<T>> => {
    const settledOperation = settleSupervisorOperation(operation);
    while (true) {
      const wake = await Promise.race([
        settledOperation,
        heartbeatTimer.promise,
        deadlineTimer.promise,
        ...(includeShutdown && shutdownPromise ? [shutdownPromise] : []),
      ]);
      if (wake.kind !== "HEARTBEAT") return wake;
      heartbeatTimer = createSupervisorTimer(
        AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS * 1_000,
        { kind: "HEARTBEAT" } as const,
      );
      const heartbeat = await performHeartbeat(includeShutdown);
      if (heartbeat.kind !== "VALUE") return heartbeat;
    }
  };

  return {
    wait: (operation) => waitFor(operation, true),
    waitForDrain: (operation) => waitFor(operation, false),
    isExpired: () => hardDeadlineAt <= dependencies.clock.now().getTime(),
    cancel: () => {
      heartbeatTimer.cancel();
      deadlineTimer.cancel();
    },
  };
};

const terminateProcess = async (state: SupervisorState): Promise<void> => {
  const activeSession = state.processSession;
  if (activeSession === null) return;

  try {
    const terminated = await terminateWithinGrace(() =>
      activeSession.terminate(),
    );
    if (terminated) {
      state.processSession = null;
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
    state.processSession = null;
    return;
  }
  activeSession.disconnect();
  throw new AffiliateAgentGatewayError({
    code: "INTERNAL_ERROR",
    isRetryable: false,
    safeMessage: "The agent process could not be terminated.",
  });
};
type SupervisorContext = Readonly<{
  dependencies: AffiliateAgentSupervisorDependencies;
  state: SupervisorState;
  grant: AffiliateAgentClaimGrant;
  authorization: AffiliateAgentClaimAuthorization;
  lease: SupervisorLease;
}>;
const FAILURE_IDEMPOTENCY_KEY_PREFIX = "supervisor-failure-";
const MAX_FAILURE_IDEMPOTENCY_KEY_LENGTH = 200;
const failureIdempotencyKeyFor = (claimId: string): string => {
  const directKey = `${FAILURE_IDEMPOTENCY_KEY_PREFIX}${claimId}`;
  if (directKey.length <= MAX_FAILURE_IDEMPOTENCY_KEY_LENGTH) return directKey;
  return `${FAILURE_IDEMPOTENCY_KEY_PREFIX}${hashAffiliateAgentValue(claimId)}`;
};
const FAILURE_RECONCILIATION_TIMEOUT_MILLISECONDS = 30_000;

const reconcileFailureAttempt = async (
  context: SupervisorContext,
  request: AffiliateAgentInvocationReconciliationRequest,
): Promise<DeadlineWait<AffiliateAgentInvocationReconciliationResult>> => {
  const timeout = createSupervisorTimer(
    FAILURE_RECONCILIATION_TIMEOUT_MILLISECONDS,
    { kind: "DEADLINE" } as const,
  );
  try {
    return await Promise.race([
      settleSupervisorOperation(
        context.dependencies.invocationReconciler.reconcileInvocation(request),
      ),
      timeout.promise,
    ]);
  } finally {
    timeout.cancel();
  }
};
const failureReconciliationUnavailable = (): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code: "INTERNAL_ERROR",
    isRetryable: false,
    safeMessage: "The invocation failure reconciliation could not be confirmed.",
  });

const reconcileInvocationFailure = async (
  context: SupervisorContext,
  failureCode: SupervisorFailureCode,
): Promise<AffiliateAgentSupervisorOutcome> => {
  try {
    await terminateProcess(context.state);
  } catch {
    // Reconcile the claim even when child termination fails.
  }
  const { dependencies, grant, authorization } = context;
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
  const failureRequest: AffiliateAgentInvocationReconciliationRequest = {
    kind: "RECORD_FAILURE",
    idempotencyKey: failureIdempotencyKeyFor(grant.envelope.claimId),
    authorization,
    failure,
  };
  let reconciliationError: unknown = failureReconciliationUnavailable();
  for (
    let attempt = 1;
    attempt <= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    const reconciliation = await reconcileFailureAttempt(
      context,
      failureRequest,
    );
    if (reconciliation.kind === "VALUE") {
      if (reconciliation.value.kind === "TERMINAL_ACCEPTED") {
        return "TERMINAL_ACCEPTED";
      }
      return outcomeForInvocationFailure(reconciliation.value.isPipelineBlocked);
    }
    reconciliationError = reconciliation.kind === "ERROR"
      ? reconciliation.error
      : failureReconciliationUnavailable();
  }
  const finalError = reconciliationError instanceof Error
    ? reconciliationError
    : failureReconciliationUnavailable();
  await haltAdmission(context.state, finalError);
  throw finalError;
};

type SupervisorLaunchInput = Readonly<{
  command: readonly ["codex", "exec"];
  prompt: string;
  environment: Readonly<Record<string, string>>;
  workspacePath: string;
  workerId: string;
  invocationId: string;
  workspaceId: string;
  workspaceMode: "READ_ONLY" | "READ_WRITE";
}>;

const createLaunchInput = (
  input: AffiliateAgentSupervisorInput,
  grant: AffiliateAgentClaimGrant,
  workspace: SupervisorWorkspace,
  workspaceMode: "READ_ONLY" | "READ_WRITE",
): SupervisorLaunchInput => {
  const serializedClaimEnvelope = boundedClaimEnvelope(grant.envelope);
  const processPrompt = boundedEnvironmentValue("prompt", grant.prompt);
  return {
    command: ["codex", "exec"],
    prompt: processPrompt,
    environment: {
      AFFILIATE_AGENT_GATEWAY_ADDRESS: boundedEnvironmentValue(
        "gateway address",
        input.gatewayAddress,
      ),
      AFFILIATE_AGENT_GATEWAY_PATH_PREFIX: boundedEnvironmentValue(
        "gateway path prefix",
        input.gatewayPathPrefix,
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
    },
    workspacePath: workspace.path,
    workerId: input.workerId,
    invocationId: input.invocationId,
    workspaceId: workspace.attestation.workspaceId,
    workspaceMode,
  };
};
type LaunchInputAttempt =
  | Readonly<{ kind: "VALUE"; value: SupervisorLaunchInput }>
  | Readonly<{ kind: "ERROR"; error: unknown }>;

const createLaunchInputAttempt = (
  input: AffiliateAgentSupervisorInput,
  grant: AffiliateAgentClaimGrant,
  workspace: SupervisorWorkspace,
  workspaceMode: "READ_ONLY" | "READ_WRITE",
): LaunchInputAttempt => {
  try {
    return {
      kind: "VALUE",
      value: createLaunchInput(input, grant, workspace, workspaceMode),
    };
  } catch (error) {
    return { kind: "ERROR", error };
  }
};

const launchProcess = (
  reservation: AffiliateAgentProcessReservation,
  launchInput: SupervisorLaunchInput,
): AffiliateAgentProcessSession | null => {
  try {
    return reservation.launch(launchInput);
  } catch {
    return null;
  }
};

type SupervisorProcessResultEvent = Extract<
  AffiliateAgentProcessEvent,
  { kind: "TERMINAL_SUBMISSION" }
>;

type SupervisorProcessWakeDecision =
  | Readonly<{ kind: "FAILURE"; failureCode: SupervisorFailureCode; error?: unknown }>
  | Readonly<{ kind: "SHUTDOWN" }>
  | Readonly<{ kind: "READY" }>
  | Readonly<{ kind: "RESULT"; event: SupervisorProcessResultEvent }>;

const isProcessEvent = (
  event: AffiliateAgentProcessEvent | void,
): event is AffiliateAgentProcessEvent => event !== undefined;

const processEventWakeDecision = (
  event: AffiliateAgentProcessEvent | void,
  isProcessReady: boolean,
): SupervisorProcessWakeDecision => {
  if (!isProcessEvent(event)) {
    return isProcessReady
      ? { kind: "FAILURE", failureCode: "MALFORMED_OUTPUT" }
      : { kind: "READY" };
  }
  if (event.kind === "EXIT") {
    return {
      kind: "FAILURE",
      failureCode: event.reason === "TIMEOUT"
        ? "TIMEOUT"
        : event.exitCode === 0
          ? "MALFORMED_OUTPUT"
          : "PROCESS_CRASH",
    };
  }
  if (!isProcessReady || event.kind !== "TERMINAL_SUBMISSION") {
    return { kind: "FAILURE", failureCode: "MALFORMED_OUTPUT" };
  }
  return { kind: "RESULT", event };
};

const processWakeDecision = (
  wake: DeadlineWait<AffiliateAgentProcessEvent | void>,
  isProcessReady: boolean,
): SupervisorProcessWakeDecision => {
  if (wake.kind === "SHUTDOWN") {
    return { kind: "SHUTDOWN" };
  }
  if (wake.kind === "DEADLINE") {
    return { kind: "FAILURE", failureCode: "TIMEOUT" };
  }
  if (wake.kind === "ERROR") {
    return {
      kind: "FAILURE",
      failureCode: failureCodeForGatewayError(wake.error, "PROCESS_CRASH"),
      error: wake.error,
    };
  }
  return processEventWakeDecision(wake.value, isProcessReady);
};

type SupervisorSubmitOperation = Extract<
  AffiliateAgentClaimOperation,
  { kind: "SUBMIT_RESULT" }
>;

type SupervisorSubmissionDecision =
  | Readonly<{ kind: "FAILURE"; failureCode: SupervisorFailureCode; error?: unknown }>
  | Readonly<{ kind: "SHUTDOWN" }>
  | Readonly<{ kind: "RESULT"; result: AffiliateAgentSubmitResultOutcome }>;

const submitProcessResult = async (
  context: SupervisorContext,
  event: SupervisorProcessResultEvent,
): Promise<SupervisorSubmissionDecision> => {
  const terminalOperation: SupervisorSubmitOperation = {
    kind: "SUBMIT_RESULT",
    idempotencyKey: event.idempotencyKey,
    authorization: context.authorization,
    result: event.result,
  };
  let terminalError: unknown;
  for (
    let submissionAttempt = 1;
    submissionAttempt <= AFFILIATE_AGENT_GATEWAY_RETRY_ATTEMPTS;
    submissionAttempt += 1
  ) {
    const submission = await context.lease.waitForDrain(
      context.dependencies.gateway.perform(terminalOperation),
    );
    if (submission.kind === "SHUTDOWN") {
      return { kind: "SHUTDOWN" };
    }
    if (submission.kind === "DEADLINE") {
      return { kind: "FAILURE", failureCode: "TIMEOUT" };
    }
    if (submission.kind === "VALUE") {
      return { kind: "RESULT", result: submission.value };
    }
    terminalError = submission.error;
    const mappedFailure = failureCodeForGatewayError(
      terminalError,
      "TERMINAL_SUBMISSION_FAILURE",
    );
    if (mappedFailure !== "TERMINAL_SUBMISSION_FAILURE") {
      return {
        kind: "FAILURE",
        failureCode: mappedFailure,
        error: terminalError,
      };
    }
  }
  return {
    kind: "FAILURE",
    failureCode: failureCodeForGatewayError(
      terminalError,
      "TERMINAL_SUBMISSION_FAILURE",
    ),
    error: terminalError,
  };
};
const supervisionFailureOutcome = async (
  context: SupervisorContext,
  failureCode: SupervisorFailureCode,
  error: unknown,
): Promise<AffiliateAgentSupervisorOutcome> => {
  if (admissionHaltRequiredFor(error)) {
    await haltAdmission(context.state, error);
    throw error;
  }
  return reconcileInvocationFailure(context, failureCode);
};

const supervisionSubmissionOutcome = async (
  context: SupervisorContext,
  submission: SupervisorSubmissionDecision,
): Promise<AffiliateAgentSupervisorOutcome> => {
  if (submission.kind === "SHUTDOWN") {
    return reconcileInvocationFailure(context, "TERMINAL_SUBMISSION_FAILURE");
  }
  if (submission.kind === "FAILURE") {
    return supervisionFailureOutcome(
      context,
      submission.failureCode,
      submission.error,
    );
  }
  const result = submission.result;
  if (result.kind === "TERMINAL_ACCEPTED") {
    return "TERMINAL_ACCEPTED";
  }
  if (result.kind === "INVOCATION_FAILED") {
    return outcomeForInvocationFailure(result.isPipelineBlocked);
  }
  await terminateProcess(context.state);
  return reconcileInvocationFailure(context, "TERMINAL_SUBMISSION_FAILURE");
};

const superviseProcess = async (
  context: SupervisorContext,
  processSession: AffiliateAgentProcessSession,
): Promise<AffiliateAgentSupervisorOutcome> => {
  let processWake: Promise<AffiliateAgentProcessEvent | void> =
    processSession.started;
  let isProcessReady = false;
  while (true) {
    const wake = await context.lease.waitForDrain(processWake);
    const decision = processWakeDecision(wake, isProcessReady);
    if (decision.kind === "SHUTDOWN") {
      return reconcileInvocationFailure(context, "PROCESS_CRASH");
    }
    if (decision.kind === "FAILURE") {
      return supervisionFailureOutcome(
        context,
        decision.failureCode,
        decision.error,
      );
    }
    if (decision.kind === "READY") {
      isProcessReady = true;
      processWake = processSession.nextEvent();
      continue;
    }
    const submission = await submitProcessResult(context, decision.event);
    return supervisionSubmissionOutcome(context, submission);
  }
};

type SupervisorCleanupResult =
  | Readonly<{ kind: "OK" }>
  | Readonly<{ kind: "ERROR"; error: unknown }>;

const cleanupProcess = async (
  state: SupervisorState,
): Promise<SupervisorCleanupResult> => {
  try {
    await terminateProcess(state);
    return { kind: "OK" };
  } catch (error) {
    return { kind: "ERROR", error };
  }
};

const workspaceDestroyTimeoutError = (): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code: "INTERNAL_ERROR",
    isRetryable: false,
    safeMessage: "The agent workspace destruction did not settle before release.",
  });

const cleanupWorkspace = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  state: SupervisorState,
  workspacePath: string | null,
): Promise<SupervisorCleanupResult> => {
  if (workspacePath === null) return { kind: "OK" };
  const operation = dependencies.workspaces.destroy(workspacePath);
  const timeout = createSupervisorTimer(
    WORKSPACE_SETTLEMENT_TIMEOUT_MILLISECONDS,
    { kind: "DEADLINE" } as const,
  );
  try {
    const result = await Promise.race([
      settleSupervisorOperation(operation),
      timeout.promise,
    ]);
    if (result.kind === "VALUE") return { kind: "OK" };
    if (result.kind === "ERROR") return { kind: "ERROR", error: result.error };
    state.lateWorkspaceCleanup = state.lateWorkspaceCleanup === null
      ? operation
      : Promise.all([
        state.lateWorkspaceCleanup,
        operation,
      ]).then(() => undefined);
    return { kind: "ERROR", error: workspaceDestroyTimeoutError() };
  } finally {
    timeout.cancel();
  }
};
const cleanupLateWorkspace = async (
  state: SupervisorState,
): Promise<SupervisorCleanupResult> => {
  if (state.lateWorkspaceCleanup === null) return { kind: "OK" };
  const result = await settleLateWorkspaceCleanupWithinTimeout(
    state.lateWorkspaceCleanup,
  );
  if (result.kind === "VALUE") return { kind: "OK" };
  return {
    kind: "ERROR",
    error: result.kind === "ERROR"
      ? result.error
      : workspaceSettlementTimeoutError(),
  };
};

const cleanupReservation = async (
  state: SupervisorState,
): Promise<SupervisorCleanupResult> => {
  const reservation = state.processReservation;
  if (reservation === null) return { kind: "OK" };
  try {
    await reservation.release();
    state.processReservation = null;
    return { kind: "OK" };
  } catch (error) {
    return { kind: "ERROR", error };
  }
};


const haltAdmission = async (
  state: SupervisorState,
  error: unknown,
): Promise<void> => {
  const admissionState = state.admissionState;
  if (admissionState === undefined || admissionState.isAdmissionHalted) return;
  admissionState.isAdmissionHalted = true;
  admissionState.admissionHaltError = error;
  await admissionState.persistHalt?.();
};
type CleanupFailure = Readonly<{
  error: unknown;
  admissionError: unknown;
}>;

const cleanupFailureFor = (
  result: SupervisorCleanupResult,
  phase: "PROCESS" | "WORKSPACE" | "RESERVATION",
): CleanupFailure | null => {
  if (result.kind === "OK") return null;
  if (phase === "PROCESS") {
    return { error: result.error, admissionError: result.error };
  }
  const error = new AffiliateAgentGatewayError({
    code: "INTERNAL_ERROR",
    isRetryable: false,
    safeMessage: phase === "WORKSPACE"
      ? "The agent workspace could not be destroyed."
      : "The agent runner reservation could not be released.",
  });
  return {
    error,
    admissionError: phase === "WORKSPACE" ? error : result.error,
  };
};

const firstCleanupFailure = (
  current: CleanupFailure | null,
  next: CleanupFailure | null,
): CleanupFailure | null => current ?? next;

const cleanupSupervisor = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  state: SupervisorState,
  workspacePath: string | null,
): Promise<void> => {
  state.shutdown.remove();
  state.lease?.cancel();

  const processCleanup = await cleanupProcess(state);
  const processFailure = cleanupFailureFor(processCleanup, "PROCESS");
  if (processFailure !== null) {
    await haltAdmission(state, processFailure.admissionError);
    throw processFailure.error;
  }
  let failure: CleanupFailure | null = null;
  const workspaceCleanup = await cleanupWorkspace(
    dependencies,
    state,
    workspacePath,
  );
  const lateWorkspaceCleanup = await cleanupLateWorkspace(state);
  failure = firstCleanupFailure(
    failure,
    cleanupFailureFor(workspaceCleanup, "WORKSPACE"),
  );
  failure = firstCleanupFailure(
    failure,
    cleanupFailureFor(lateWorkspaceCleanup, "WORKSPACE"),
  );
  if (workspaceCleanup.kind === "OK" && lateWorkspaceCleanup.kind === "OK") {
    failure = firstCleanupFailure(
      failure,
      cleanupFailureFor(await cleanupReservation(state), "RESERVATION"),
    );
  }
  if (failure === null) return;
  try {
    await haltAdmission(state, failure.admissionError);
  } finally {
    state.processReservation?.disconnect?.();
  }
  throw failure.error;
};


const waitForWorkerHeartbeat = (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
  shutdown: SupervisorShutdown,
): Promise<boolean> | null => {
  const heartbeat = dependencies.workerHealth?.heartbeat({
    workerId: input.workerId,
    role: input.role,
    now: dependencies.clock.now(),
  });
  if (heartbeat === undefined) return null;
  return waitForShutdown(shutdown, heartbeat).then((result) => {
    if (result.kind === "SHUTDOWN") return false;
    if (result.kind === "DEADLINE") {
      throw new AffiliateAgentGatewayError({
        code: "INTERNAL_ERROR",
        isRetryable: false,
        safeMessage:
          "The supervisor worker heartbeat wait reached an unexpected deadline.",
      });
    }
    if (result.kind === "ERROR") throw result.error;
    return true;
  });
};

const reserveProcess = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
  state: SupervisorState,
): Promise<AffiliateAgentProcessReservation | null> => {
  const reservationOperation = dependencies.processLauncher.reserve({
    workerId: input.workerId,
    invocationId: input.invocationId,
  });
  const result = await waitForReservation(
    state.shutdown,
    reservationOperation,
  );
  if (result.kind === "SHUTDOWN") {
    const settledReservation = await settleReservationWithinTimeout(
      reservationOperation,
    );
    if (settledReservation !== null) {
      state.processReservation = settledReservation;
    } else {
      releaseReservationWhenSettled(reservationOperation);
    }
    return null;
  }
  if (result.kind === "DEADLINE") {
    releaseReservationWhenSettled(reservationOperation);
    return null;
  }
  if (result.kind === "ERROR") throw result.error;
  const reservation = result.value;
  if (state.shutdown.isAborted()) {
    state.processReservation = reservation;
    return null;
  }
  return reservation;
};

const workspaceModeFor = (
  role: AffiliateAgentRole,
): "READ_ONLY" | "READ_WRITE" =>
  role === "SUPPLY_REVIEWER" ? "READ_ONLY" : "READ_WRITE";

const WORKSPACE_SETTLEMENT_TIMEOUT_MILLISECONDS =
  AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS;

const settleWorkspaceWithinTimeout = async (
  operation: Promise<SupervisorWorkspace>,
): Promise<DeadlineWait<SupervisorWorkspace>> => {
  const timeout = createSupervisorTimer(
    WORKSPACE_SETTLEMENT_TIMEOUT_MILLISECONDS,
    { kind: "DEADLINE" } as const,
  );
  try {
    return await Promise.race([
      settleSupervisorOperation(operation),
      timeout.promise,
    ]);
  } finally {
    timeout.cancel();
  }
};
const waitForWorkspaceCreation = (
  shutdown: SupervisorShutdown,
  operation: Promise<SupervisorWorkspace>,
): Promise<DeadlineWait<SupervisorWorkspace>> => {
  const timeout = createSupervisorTimer(
    WORKSPACE_SETTLEMENT_TIMEOUT_MILLISECONDS,
    { kind: "DEADLINE" } as const,
  );
  const settledOperation = settleSupervisorOperation(operation);
  const wait = shutdown.promise === null
    ? Promise.race([settledOperation, timeout.promise])
    : Promise.race([settledOperation, timeout.promise, shutdown.promise]);
  return wait.finally(() => timeout.cancel());
};

const workspaceCreationTimeoutError = (): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code: "INTERNAL_ERROR",
    isRetryable: false,
    safeMessage: "The agent workspace did not settle within its creation deadline.",
  });

const lateWorkspaceCleanupFor = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  operation: Promise<SupervisorWorkspace>,
): Promise<void> => {
  const settledWorkspace = await settleSupervisorOperation(operation);
  if (settledWorkspace.kind === "ERROR") throw settledWorkspace.error;
  await dependencies.workspaces.destroy(settledWorkspace.value.path);
};

const settleLateWorkspaceCleanupWithinTimeout = async (
  operation: Promise<void>,
): Promise<DeadlineWait<void>> => {
  const timeout = createSupervisorTimer(
    WORKSPACE_SETTLEMENT_TIMEOUT_MILLISECONDS,
    { kind: "DEADLINE" } as const,
  );
  try {
    return await Promise.race([
      settleSupervisorOperation(operation),
      timeout.promise,
    ]);
  } finally {
    timeout.cancel();
  }
};

const workspaceSettlementTimeoutError = (): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code: "INTERNAL_ERROR",
    isRetryable: false,
    safeMessage: "The agent workspace did not settle during shutdown.",
  });


const createWorkspaceFor = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
  state: SupervisorState,
  workspaceMode: "READ_ONLY" | "READ_WRITE",
): Promise<SupervisorWorkspace | null> => {
  const workspaceOperation = dependencies.workspaces.create({
    workerId: input.workerId,
    invocationId: input.invocationId,
    mode: workspaceMode,
  });
  const result = await waitForWorkspaceCreation(
    state.shutdown,
    workspaceOperation,
  );
  if (result.kind === "SHUTDOWN") {
    const settledWorkspace = await settleWorkspaceWithinTimeout(workspaceOperation);
    if (settledWorkspace.kind === "VALUE") return settledWorkspace.value;
    if (settledWorkspace.kind === "ERROR") throw settledWorkspace.error;
    state.lateWorkspaceCleanup = lateWorkspaceCleanupFor(
      dependencies,
      workspaceOperation,
    );
    throw workspaceSettlementTimeoutError();
  }
  if (result.kind === "DEADLINE") {
    state.lateWorkspaceCleanup = lateWorkspaceCleanupFor(
      dependencies,
      workspaceOperation,
    );
    throw workspaceCreationTimeoutError();
  }
  if (result.kind === "ERROR") throw result.error;
  return result.value;
};

const runClaimedInvocation = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
  state: SupervisorState,
  workspace: SupervisorWorkspace,
  workspaceMode: "READ_ONLY" | "READ_WRITE",
  grant: AffiliateAgentClaimGrant,
): Promise<AffiliateAgentSupervisorOutcome> => {
  const authorization = authorizationFor(grant);
  const nowMilliseconds = dependencies.clock.now().getTime();
  const hardDeadlineAt = hardDeadlineAtFor(grant, nowMilliseconds);
  const lease = createSupervisorLease(
    dependencies,
    input,
    authorization,
    hardDeadlineAt,
    nowMilliseconds,
    state.shutdown,
  );
  state.lease = lease;
  const context: SupervisorContext = {
    dependencies,
    state,
    grant,
    authorization,
    lease,
  };
  if (lease.isExpired()) {
    return reconcileInvocationFailure(context, "TIMEOUT");
  }
  if (state.shutdown.isAborted()) {
    return reconcileInvocationFailure(context, "PROCESS_CRASH");
  }

  const launchInputAttempt = createLaunchInputAttempt(
    input,
    grant,
    workspace,
    workspaceMode,
  );
  if (launchInputAttempt.kind === "ERROR") {
    return reconcileInvocationFailure(
      context,
      failureCodeForGatewayError(launchInputAttempt.error, "MALFORMED_OUTPUT"),
    );
  }
  const launchInput = launchInputAttempt.value;
  const reservation = state.processReservation;
  if (reservation === null) {
    throw new AffiliateAgentGatewayError({
      code: "INTERNAL_ERROR",
      isRetryable: false,
      safeMessage: "The agent runner reservation was lost before launch.",
    });
  }
  const processSession = launchProcess(reservation, launchInput);
  if (processSession === null) {
    return reconcileInvocationFailure(context, "PROCESS_CRASH");
  }
  state.processSession = processSession;
  return superviseProcess(context, processSession);
};

const supervisorShouldStop = (
  input: AffiliateAgentSupervisorInput,
  state: SupervisorState,
): boolean => (
  input.admissionState?.isAdmissionHalted === true
  || state.shutdown.isAborted()
);

const claimOutcomeFor = (
  result: SupervisorClaimResult,
): result is "NO_WORK" | "PIPELINE_BLOCKED" => (
  result === "NO_WORK" || result === "PIPELINE_BLOCKED"
);

const createWorkspaceOrHalt = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
  state: SupervisorState,
  workspaceMode: "READ_ONLY" | "READ_WRITE",
): Promise<SupervisorWorkspace | null> => {
  try {
    return await createWorkspaceFor(
      dependencies,
      input,
      state,
      workspaceMode,
    );
  } catch (error) {
    await haltAdmission(state, error);
    throw error;
  }
};

const recoverStaleWorkspacesOrHalt = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  state: SupervisorState,
  reservation: AffiliateAgentProcessReservation,
): Promise<void> => {
  try {
    await dependencies.workspaces.recoverStale(reservation);
  } catch (error) {
    await haltAdmission(state, error);
    throw error;
  }
};

const heartbeatAllowsInvocation = async (
  heartbeat: Promise<boolean>,
  state: SupervisorState,
): Promise<boolean> => {
  try {
    return await heartbeat;
  } catch (error) {
    if (admissionHaltRequiredFor(error)) await haltAdmission(state, error);
    throw error;
  }
};

export const runAffiliateAgentInvocation = async (
  dependencies: AffiliateAgentSupervisorDependencies,
  input: AffiliateAgentSupervisorInput,
): Promise<AffiliateAgentSupervisorOutcome> => {
  const state = createSupervisorState(
    input.shutdownSignal,
    input.admissionState,
  );
  let workspace: SupervisorWorkspace | null = null;
  try {
    if (supervisorShouldStop(input, state)) return "NO_WORK";
    const heartbeat = waitForWorkerHeartbeat(dependencies, input, state.shutdown);
    if (heartbeat !== null && !(await heartbeatAllowsInvocation(heartbeat, state))) {
      return "NO_WORK";
    }
    if (supervisorShouldStop(input, state)) return "NO_WORK";

    const reservation = await reserveProcess(dependencies, input, state);
    if (reservation === null) return "NO_WORK";
    state.processReservation = reservation;
    await recoverStaleWorkspacesOrHalt(dependencies, state, reservation);

    const workspaceMode = workspaceModeFor(input.role);
    workspace = await createWorkspaceOrHalt(
      dependencies,
      input,
      state,
      workspaceMode,
    );
    if (workspace === null) return "NO_WORK";

    const claimRequest = createClaimRequest(dependencies, input, workspace);
    const claimResult = await claimAffiliateAgent(
      dependencies,
      state,
      claimRequest,
    );
    if (claimOutcomeFor(claimResult)) return claimResult;
    return await runClaimedInvocation(
      dependencies,
      input,
      state,
      workspace,
      workspaceMode,
      claimResult,
    );
  } finally {
    await cleanupSupervisor(
      dependencies,
      state,
      workspace?.path ?? null,
    );
  }
};
