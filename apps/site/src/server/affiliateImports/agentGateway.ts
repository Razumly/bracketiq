import type {
  AffiliateAgentClaimEnvelope,
  AffiliateAgentCommand,
  AffiliateAgentExecutionClass,
  AffiliateAgentRole,
  AffiliateAgentSchemaIssue,
  AffiliateAgentTerminalDisposition,
} from "./agentGatewayContracts";

export const AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS = 60 as const;
export const AFFILIATE_AGENT_LEASE_SECONDS = 300 as const;
export const AFFILIATE_AGENT_HARD_DEADLINE_SECONDS = 1_200 as const;
export const AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS = 180 as const;
export const AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS =
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS
  + AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS;
export const AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS = 3 as const;
export const AFFILIATE_AGENT_MAX_INVOCATION_ATTEMPTS = 3 as const;

export const affiliateAgentRetryDelaySeconds = (
  failedAttemptCount: 1 | 2 | 3,
): 300 | 900 | null => {
  if (failedAttemptCount === 1) return 300;
  if (failedAttemptCount === 2) return 900;
  if (failedAttemptCount === 3) return null;
  throw new RangeError(
    "Affiliate Agent failed attempt count must be 1, 2, or 3.",
  );
};

export type AffiliateAgentWorkspaceAttestation = Readonly<{
  schemaVersion: 1;
  workspaceId: string;
  mode: "READ_ONLY" | "READ_WRITE";
  executionClass: AffiliateAgentExecutionClass;
  workerId: string;
  invocationId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}>;

export type AffiliateAgentClaimRequest = Readonly<{
  idempotencyKey: string;
  roleCredential: string;
  role: AffiliateAgentRole;
  workerId: string;
  invocationId: string;
  workspaceAttestation: AffiliateAgentWorkspaceAttestation;
}>;

export type AffiliateAgentClaimGrant = Readonly<{
  envelope: AffiliateAgentClaimEnvelope;
  prompt: string;
  token: string;
  heartbeatIntervalSeconds: typeof AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS;
  leaseExpiresAt: string;
  hardDeadlineAt: string;
}>;

export type AffiliateAgentClaimAuthorization = Readonly<{
  token: string;
  jobId: string;
  claimId: string;
  claimGeneration: number;
  lifecycleGeneration: number | null;
  role: AffiliateAgentRole;
  workerId: string;
  invocationId: string;
  supplyContractHash: string;
}>;

export type AffiliateAgentInvocationFailureCode =
  | "MALFORMED_OUTPUT"
  | "STALE_GENERATION"
  | "PROCESS_CRASH"
  | "TIMEOUT"
  | "TERMINAL_SUBMISSION_FAILURE"
  | "SCHEMA_CORRECTIONS_EXHAUSTED";

export type AffiliateAgentInvocationFailureEnvelope = Readonly<{
  schemaVersion: 1;
  jobId: string;
  claimId: string;
  claimGeneration: number;
  lifecycleGeneration: number | null;
  role: AffiliateAgentRole;
  workerId: string;
  invocationId: string;
  supplyContractHash: string;
  code: AffiliateAgentInvocationFailureCode;
  occurredAt: string;
  evidenceRefs: readonly string[];
  safeSummary: string;
}>;

type AffiliateAgentNonTerminalCommand = Exclude<
  AffiliateAgentCommand,
  Readonly<{ type: "SUBMIT_TERMINAL_RESULT" }>
>;

export type AffiliateAgentClaimOperation =
  | Readonly<{
      kind: "HEARTBEAT";
      idempotencyKey: string;
      authorization: AffiliateAgentClaimAuthorization;
    }>
  | Readonly<{
      kind: "READ_ARTIFACT";
      idempotencyKey: string;
      authorization: AffiliateAgentClaimAuthorization;
      evidenceRef: string;
    }>
  | Readonly<{
      kind: "EXECUTE_COMMAND";
      idempotencyKey: string;
      authorization: AffiliateAgentClaimAuthorization;
      command: AffiliateAgentNonTerminalCommand;
    }>
  | Readonly<{
      kind: "SUBMIT_RESULT";
      idempotencyKey: string;
      authorization: AffiliateAgentClaimAuthorization;
      result: unknown;
    }>
  | Readonly<{
      kind: "RECORD_FAILURE";
      idempotencyKey: string;
      authorization: AffiliateAgentClaimAuthorization;
      failure: AffiliateAgentInvocationFailureEnvelope;
    }>;

export type AffiliateAgentHeartbeatResult = Readonly<{
  kind: "HEARTBEAT_ACCEPTED";
  receiptId: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
}>;

export type AffiliateAgentArtifactReadResult = Readonly<{
  kind: "ARTIFACT_READ";
  receiptId: string;
  evidenceRef: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  sourceUrl: string | null;
  finalUrl: string | null;
  bytes: Uint8Array;
}>;

export type AffiliateAgentCommandResult = Readonly<{
  kind: "COMMAND_SUCCEEDED";
  receiptId: string;
  commandType: AffiliateAgentNonTerminalCommand["type"];
  responseHash: string;
  safeOutput: Readonly<Record<string, unknown>> | null;
}>;

export type AffiliateAgentSchemaCorrectionResult = Readonly<{
  kind: "SCHEMA_CORRECTION_REQUIRED";
  receiptId: string;
  submissionNumber: 1 | 2;
  remainingSubmissions: 1 | 2;
  issues: readonly AffiliateAgentSchemaIssue[];
  correctionPrompt: string;
}>;

export type AffiliateAgentTerminalAcceptedResult = Readonly<{
  kind: "TERMINAL_ACCEPTED";
  receiptId: string;
  resultHash: string;
  disposition: AffiliateAgentTerminalDisposition;
  completedAt: string;
}>;

export type AffiliateAgentInvocationFailedResult = Readonly<{
  kind: "INVOCATION_FAILED";
  receiptId: string;
  failureCode: AffiliateAgentInvocationFailureCode;
  invocationFailureCount: 1 | 2 | 3;
  nextAttemptAt: string | null;
  isPipelineBlocked: boolean;
}>;

export type AffiliateAgentSubmitResultOutcome =
  | AffiliateAgentSchemaCorrectionResult
  | AffiliateAgentTerminalAcceptedResult
  | AffiliateAgentInvocationFailedResult;

export type AffiliateAgentClaimOperationResult<
  T extends AffiliateAgentClaimOperation,
> =
  T extends Readonly<{ kind: "HEARTBEAT" }>
    ? AffiliateAgentHeartbeatResult
    : T extends Readonly<{ kind: "READ_ARTIFACT" }>
      ? AffiliateAgentArtifactReadResult
      : T extends Readonly<{ kind: "EXECUTE_COMMAND" }>
        ? AffiliateAgentCommandResult
        : T extends Readonly<{ kind: "SUBMIT_RESULT" }>
          ? AffiliateAgentSubmitResultOutcome
          : T extends Readonly<{ kind: "RECORD_FAILURE" }>
            ? AffiliateAgentInvocationFailedResult
            : never;

export type AffiliateAgentReconcileRequest = Readonly<{
  limit?: number;
  reconcileBefore?: string;
}>;

export type AffiliateAgentReconcileReport = Readonly<{
  examinedClaims: number;
  expiredClaims: number;
  examinedReceipts: number;
  recoveredReceipts: number;
  completedReceipts: number;
  unresolvedReceipts: number;
  isAdmissionHalted: boolean;
}>;

export type AffiliateAgentGatewayErrorCode =
  | "ROLE_CREDENTIAL_INVALID"
  | "ROLE_NOT_ALLOWED"
  | "WORKER_MISMATCH"
  | "INVOCATION_MISMATCH"
  | "JOB_MISMATCH"
  | "CLAIM_NOT_FOUND"
  | "CLAIM_NOT_ACTIVE"
  | "CLAIM_GENERATION_STALE"
  | "LIFECYCLE_GENERATION_STALE"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_INVALIDATED"
  | "LEASE_EXPIRED"
  | "HARD_DEADLINE_EXCEEDED"
  | "SUPPLY_CONTRACT_STALE"
  | "DEPLOYMENT_CONTRACT_STALE"
  | "COMMAND_NOT_PERMITTED"
  | "COMMAND_SCHEMA_INVALID"
  | "ARTIFACT_NOT_PERMITTED"
  | "ARTIFACT_INTEGRITY_FAILED"
  | "RESULT_SCHEMA_INVALID"
  | "SCHEMA_CORRECTIONS_EXHAUSTED"
  | "TERMINAL_DISPOSITION_NOT_PERMITTED"
  | "EVIDENCE_REFERENCE_NOT_PERMITTED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "OPERATION_IN_PROGRESS"
  | "RETRY_NOT_ELIGIBLE"
  | "PIPELINE_BLOCKED"
  | "PRODUCER_REVIEWER_IDENTITY_REUSED"
  | "REVIEW_WORKSPACE_INVALID"
  | "LIFECYCLE_TRANSITION_CONFLICT"
  | "PARTIAL_COMMAND_UNRESOLVED"
  | "DUPLICATE_LIVE_CLAIM"
  | "GATEWAY_ADMISSION_HALTED"
  | "INTERNAL_ERROR";

export class AffiliateAgentGatewayError extends Error {
  readonly code: AffiliateAgentGatewayErrorCode;
  readonly isRetryable: boolean;
  readonly safeMessage: string;
  readonly receiptId?: string;

  constructor(
    input: Readonly<{
      code: AffiliateAgentGatewayErrorCode;
      isRetryable: boolean;
      safeMessage: string;
      receiptId?: string;
    }>,
  ) {
    super(input.safeMessage);
    this.name = "AffiliateAgentGatewayError";
    this.code = input.code;
    this.isRetryable = input.isRetryable;
    this.safeMessage = input.safeMessage;
    this.receiptId = input.receiptId;
  }
}

export type AffiliateAgentGatewayRequestOptions = Readonly<{
  signal?: AbortSignal;
  deadlineAt?: number;
}>;

export interface AffiliateAgentGateway {
  claim(
    input: AffiliateAgentClaimRequest,
    options?: AffiliateAgentGatewayRequestOptions,
  ): Promise<AffiliateAgentClaimGrant | null>;
  perform<T extends AffiliateAgentClaimOperation>(
    input: T,
    options?: AffiliateAgentGatewayRequestOptions,
  ): Promise<AffiliateAgentClaimOperationResult<T>>;
  reconcile(
    input?: AffiliateAgentReconcileRequest,
  ): Promise<AffiliateAgentReconcileReport>;
}
