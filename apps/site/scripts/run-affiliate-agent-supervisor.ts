import { createHmac, createPrivateKey, randomUUID, sign, type KeyObject } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { basename, dirname, join, resolve } from "node:path";
import { mkdir, mkdtemp, rm, chmod, lstat, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import type {
  AffiliateAgentClaimGrant,
  AffiliateAgentClaimOperation,
  AffiliateAgentClaimOperationResult,
  AffiliateAgentClaimRequest,
  AffiliateAgentGateway,
  AffiliateAgentGatewayErrorCode,
  AffiliateAgentGatewayRequestOptions,
  AffiliateAgentInvocationFailureCode,
  AffiliateAgentReconcileReport,
  AffiliateAgentReconcileRequest,
  AffiliateAgentWorkspaceAttestation,
} from "../src/server/affiliateImports/agentGateway";
import {
  AffiliateAgentGatewayError,
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS,
} from "../src/server/affiliateImports/agentGateway";
import {
  AFFILIATE_AGENT_MAX_PROMPT_BYTES,
  AFFILIATE_AGENT_ROLES,
  affiliateAgentClaimEnvelopeSchema,
  canonicalizeAffiliateAgentValue,
  type AffiliateAgentRole,
  type AffiliateAgentTerminalDisposition,
} from "../src/server/affiliateImports/agentGatewayContracts";
import {
  AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
  runAffiliateAgentInvocation,
  type AffiliateAgentSupervisorAdmissionState,
  type AffiliateAgentSupervisorInput,
  type AffiliateAgentSupervisorOutcome,
} from "../src/server/affiliateImports/agentSupervisor";
import {
  AFFILIATE_AGENT_INVOCATION_ID_MAX_LENGTH,
  AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH,
  AFFILIATE_AGENT_WORKSPACE_ID_MAX_LENGTH,
  parseAffiliateAgentRunnerResponse,
  type AffiliateAgentRunnerRequest,
  type AffiliateAgentRunnerResponse,
} from "../src/server/affiliateImports/affiliateAgentRunnerProtocol";
import type {
  AffiliateAgentInvocationReconciliationRequest,
  AffiliateAgentInvocationReconciliationResult,
  AffiliateAgentProcessEvent,
  AffiliateAgentProcessInput,
  AffiliateAgentProcessLaunchInput,
  AffiliateAgentProcessLauncher,
  AffiliateAgentProcessReservation,
  AffiliateAgentProcessSession,
  AffiliateAgentSupervisorDependencies,
  AffiliateAgentWorkspaceManager,
  AffiliateAgentWorkerHealthWriter,
} from "../src/server/affiliateImports/agentGatewayAdapters";
import { AffiliateAgentProcessCapacityError } from "../src/server/affiliateImports/agentGatewayAdapters";


const DEFAULT_IDLE_SECONDS = 30;
const MAX_TIMER_SECONDS = 2_147_483;
const DEFAULT_FAILURE_SECONDS = 30;
const DEFAULT_WORKER_GATEWAY_REQUEST_TIMEOUT_MILLISECONDS =
  AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS;
const WORKSPACE_CLEANUP_TIMEOUT_MILLISECONDS = 30_000;
const WORKSPACE_ROOT_MODE = 0o710;
const WORKSPACE_SIGNING_ALGORITHM = "sha256";
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

type JsonRecord = Readonly<Record<string, unknown>>;
type GatewayErrorPayload = Readonly<{
  code?: string;
  isRetryable?: boolean;
  safeMessage?: string;
  receiptId?: string;
}>;
const AFFILIATE_AGENT_GATEWAY_ERROR_CODES: Record<AffiliateAgentGatewayErrorCode, true> = {
  ROLE_CREDENTIAL_INVALID: true,
  ROLE_NOT_ALLOWED: true,
  WORKER_MISMATCH: true,
  INVOCATION_MISMATCH: true,
  JOB_MISMATCH: true,
  CLAIM_NOT_FOUND: true,
  CLAIM_NOT_ACTIVE: true,
  CLAIM_GENERATION_STALE: true,
  LIFECYCLE_GENERATION_STALE: true,
  TOKEN_INVALID: true,
  TOKEN_EXPIRED: true,
  TOKEN_INVALIDATED: true,
  LEASE_EXPIRED: true,
  HARD_DEADLINE_EXCEEDED: true,
  SUPPLY_CONTRACT_STALE: true,
  DEPLOYMENT_CONTRACT_STALE: true,
  COMMAND_NOT_PERMITTED: true,
  ARTIFACT_NOT_PERMITTED: true,
  ARTIFACT_INTEGRITY_FAILED: true,
  RESULT_SCHEMA_INVALID: true,
  SCHEMA_CORRECTIONS_EXHAUSTED: true,
  TERMINAL_DISPOSITION_NOT_PERMITTED: true,
  EVIDENCE_REFERENCE_NOT_PERMITTED: true,
  IDEMPOTENCY_KEY_REUSED: true,
  OPERATION_IN_PROGRESS: true,
  RETRY_NOT_ELIGIBLE: true,
  PIPELINE_BLOCKED: true,
  PRODUCER_REVIEWER_IDENTITY_REUSED: true,
  REVIEW_WORKSPACE_INVALID: true,
  LIFECYCLE_TRANSITION_CONFLICT: true,
  PARTIAL_COMMAND_UNRESOLVED: true,
  DUPLICATE_LIVE_CLAIM: true,
  GATEWAY_ADMISSION_HALTED: true,
  INTERNAL_ERROR: true,
};

const isGatewayErrorCode = (
  value: unknown,
): value is AffiliateAgentGatewayErrorCode => (
  typeof value === "string"
  && Object.prototype.hasOwnProperty.call(AFFILIATE_AGENT_GATEWAY_ERROR_CODES, value)
);

type GatewayResponse<T> = Readonly<{
  result?: T;
  error?: GatewayErrorPayload;
}>;

type GatewayResultValidator = (value: unknown) => boolean;

const isJsonRecord = (value: unknown): value is JsonRecord => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
);

const hasExactKeys = (
  record: JsonRecord,
  expectedKeys: readonly string[],
): boolean => {
  const actualKeys = Object.keys(record);
  return (
    actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  );
};

const nonEmptyString = (value: unknown): value is string => (
  typeof value === "string" && value.trim().length > 0
);

const isTimestamp = (value: unknown): value is string => (
  nonEmptyString(value) && Number.isFinite(Date.parse(value))
);

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
);

const hasNonEmptyStrings = (
  record: JsonRecord,
  fields: readonly string[],
): boolean => fields.every((field) => nonEmptyString(record[field]));

const isNullableString = (value: unknown): boolean => (
  value === null || nonEmptyString(value)
);

const isGatewayErrorPayload = (value: unknown): value is GatewayErrorPayload => {
  if (!isJsonRecord(value)) return false;
  if (
    !Object.keys(value).every((key) => (
      key === "code"
      || key === "safeMessage"
      || key === "isRetryable"
      || key === "receiptId"
    ))
  ) return false;
  if (!hasNonEmptyStrings(value, ["code", "safeMessage"])) return false;
  if (!isGatewayErrorCode(value.code)) return false;
  if (typeof value.isRetryable !== "boolean") return false;
  if ("receiptId" in value && !nonEmptyString(value.receiptId)) return false;
  return true;
};

const isGatewayResponseValue = (
  value: unknown,
): value is GatewayResponse<unknown> => {
  if (!isJsonRecord(value)) return false;
  if (
    !Object.keys(value).every((key) => key === "result" || key === "error")
  ) return false;
  if (!("result" in value) && !("error" in value)) return false;
  if ("error" in value && value.error !== undefined) {
    return isGatewayErrorPayload(value.error);
  }
  return true;
};

const isClaimGrantResult = (
  value: unknown,
): value is AffiliateAgentClaimGrant | null => {
  if (value === null) return true;
  if (!isJsonRecord(value)) return false;
  if (!affiliateAgentClaimEnvelopeSchema.safeParse(value.envelope).success) {
    return false;
  }
  if (!hasNonEmptyStrings(value, ["prompt", "token", "leaseExpiresAt", "hardDeadlineAt"])) {
    return false;
  }
  if (value.heartbeatIntervalSeconds !== AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS) {
    return false;
  }
  return isTimestamp(value.leaseExpiresAt) && isTimestamp(value.hardDeadlineAt);
};

const isClaimGrantForRequest = (
  value: unknown,
  request: AffiliateAgentClaimRequest,
): value is AffiliateAgentClaimGrant | null => {
  if (!isClaimGrantResult(value) || value === null) return value === null;
  const envelope = value.envelope;
  return envelope.role === request.role
    && envelope.workerId === request.workerId
    && envelope.invocationId === request.invocationId
    && envelope.workspaceId === request.workspaceAttestation.workspaceId;
};

const operationShape = (
  value: JsonRecord,
  expectedKind: string,
  fields: readonly string[],
): boolean => hasExactKeys(value, ["kind", "receiptId", ...fields])
  && value.kind === expectedKind
  && hasNonEmptyStrings(value, ["kind", "receiptId"]);
const isHeartbeatOperationResult = (value: JsonRecord): boolean => (
  operationShape(value, "HEARTBEAT_ACCEPTED", ["heartbeatAt", "leaseExpiresAt"])
  && hasNonEmptyStrings(value, ["heartbeatAt", "leaseExpiresAt"])
  && isTimestamp(value.heartbeatAt)
  && isTimestamp(value.leaseExpiresAt)
);

const isBase64 = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length % 4 !== 0) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
};
const AFFILIATE_AGENT_TERMINAL_DISPOSITIONS: ReadonlySet<string> = new Set([
  "ACTIVATED",
  "APPROVED",
  "BOUNDED_REPAIR_SUBMITTED",
  "CAMPAIGN_PROPOSED",
  "CONTRACT_GAP",
  "EXACT_TARGET_REJECTED",
  "FAILED_CAPTURE_EVIDENCE_RECORDED",
  "HUMAN_REVIEW_REQUIRED",
  "LIFECYCLE_COMMAND_EXECUTED",
  "NO_ACTION",
  "PACKAGE_COMMITTED",
  "PRODUCER_REPAIR_REQUIRED",
  "REGRESSION_ASSESSED",
  "SOURCE_EXCLUSION_ASSESSED",
  "SOURCE_EXCLUSION_PROPOSED",
  "SOURCE_INCOMPATIBLE",
]);
const AFFILIATE_AGENT_INVOCATION_FAILURE_CODES: ReadonlySet<string> = new Set([
  "MALFORMED_OUTPUT",
  "STALE_GENERATION",
  "PROCESS_CRASH",
  "TIMEOUT",
  "TERMINAL_SUBMISSION_FAILURE",
  "SCHEMA_CORRECTIONS_EXHAUSTED",
]);
const MAX_SCHEMA_ISSUE_PATH_ITEMS = 32;
const AFFILIATE_AGENT_SCHEMA_ISSUE_CODES: ReadonlySet<string> = new Set([
  "INVALID_TYPE",
  "INVALID_VALUE",
  "MISSING_VALUE",
  "UNKNOWN_KEY",
]);
const isTerminalDisposition = (
  value: unknown,
): value is AffiliateAgentTerminalDisposition => (
  typeof value === "string" && AFFILIATE_AGENT_TERMINAL_DISPOSITIONS.has(value)
);
const isInvocationFailureCode = (
  value: unknown,
): value is AffiliateAgentInvocationFailureCode => (
  typeof value === "string" && AFFILIATE_AGENT_INVOCATION_FAILURE_CODES.has(value)
);
const isSchemaIssue = (value: unknown): boolean => {
  if (!isJsonRecord(value) || !hasExactKeys(value, ["path", "code", "message"])) {
    return false;
  }
  const isPath = Array.isArray(value.path)
    && value.path.length <= MAX_SCHEMA_ISSUE_PATH_ITEMS
    && value.path.every((part) => (
      (typeof part === "string" && part.length <= 200)
      || (typeof part === "number" && Number.isSafeInteger(part) && part >= 0)
    ));
  return isPath
    && typeof value.code === "string"
    && AFFILIATE_AGENT_SCHEMA_ISSUE_CODES.has(value.code)
    && typeof value.message === "string"
    && value.message.length <= 500
    && nonEmptyString(value.message);
};
const isSchemaIssueArray = (value: unknown): boolean => (
  Array.isArray(value) && value.every(isSchemaIssue)
);

const isArtifactOperationResult = (value: JsonRecord): boolean => {
  if (!operationShape(value, "ARTIFACT_READ", [
    "evidenceRef",
    "sha256",
    "mimeType",
    "byteSize",
    "bytes",
    "encoding",
  ])) return false;
  if (!hasNonEmptyStrings(value, ["evidenceRef", "sha256", "mimeType"])) {
    return false;
  }
  if (value.encoding !== "base64" || !isBase64(value.bytes)) return false;
  return isNonNegativeInteger(value.byteSize)
    && Buffer.byteLength(value.bytes, "base64") === value.byteSize;
};

const isCommandOperationResult = (value: JsonRecord): boolean => (
  operationShape(value, "COMMAND_SUCCEEDED", ["commandType", "responseHash", "safeOutput"])
  && hasNonEmptyStrings(value, ["commandType", "responseHash"])
  && (value.safeOutput === null || isJsonRecord(value.safeOutput))
);

const isCorrectionOperationResult = (value: JsonRecord): boolean => (
  operationShape(value, "SCHEMA_CORRECTION_REQUIRED", [
    "submissionNumber",
    "remainingSubmissions",
    "issues",
    "correctionPrompt",
  ])
  && hasNonEmptyStrings(value, ["correctionPrompt"])
  && (value.submissionNumber === 1 || value.submissionNumber === 2)
  && (value.remainingSubmissions === 1 || value.remainingSubmissions === 2)
  && isSchemaIssueArray(value.issues)
);

const isTerminalOperationResult = (value: JsonRecord): boolean => (
  operationShape(value, "TERMINAL_ACCEPTED", ["resultHash", "disposition", "completedAt"])
  && hasNonEmptyStrings(value, ["resultHash", "disposition", "completedAt"])
  && isTerminalDisposition(value.disposition)
  && isTimestamp(value.completedAt)
);

const isFailureOperationResult = (value: JsonRecord): boolean => (
  operationShape(value, "INVOCATION_FAILED", [
    "failureCode",
    "invocationFailureCount",
    "nextAttemptAt",
    "isPipelineBlocked",
  ])
  && isInvocationFailureCode(value.failureCode)
  && (value.invocationFailureCount === 1
    || value.invocationFailureCount === 2
    || value.invocationFailureCount === 3)
  && isNullableString(value.nextAttemptAt)
  && (value.nextAttemptAt === null || isTimestamp(value.nextAttemptAt))
  && typeof value.isPipelineBlocked === "boolean"
);

const isSubmitResultOperationResult = (value: JsonRecord): boolean => (
  isCorrectionOperationResult(value)
  || isTerminalOperationResult(value)
  || isFailureOperationResult(value)
);

const claimOperationResultValidators: Readonly<
  Record<AffiliateAgentClaimOperation["kind"], (value: JsonRecord) => boolean>
> = {
  HEARTBEAT: isHeartbeatOperationResult,
  READ_ARTIFACT: isArtifactOperationResult,
  EXECUTE_COMMAND: isCommandOperationResult,
  SUBMIT_RESULT: isSubmitResultOperationResult,
  RECORD_FAILURE: isFailureOperationResult,
};

const isClaimOperationResult = (
  operationKind: AffiliateAgentClaimOperation["kind"],
  value: unknown,
): boolean => {
  if (!isJsonRecord(value)) return false;
  return claimOperationResultValidators[operationKind](value);
};

const isReconcileReport = (value: unknown): boolean => {
  if (!isJsonRecord(value)) return false;
  if (!hasExactKeys(value, [
    "examinedClaims",
    "expiredClaims",
    "examinedReceipts",
    "recoveredReceipts",
    "completedReceipts",
    "unresolvedReceipts",
    "isAdmissionHalted",
  ])) return false;
  return [
    value.examinedClaims,
    value.expiredClaims,
    value.examinedReceipts,
    value.recoveredReceipts,
    value.completedReceipts,
    value.unresolvedReceipts,
  ].every(isNonNegativeInteger) && typeof value.isAdmissionHalted === "boolean";
};

const isTerminalInvocationResult = (value: JsonRecord): boolean => (
  hasExactKeys(value, ["kind"]) && value.kind === "TERMINAL_ACCEPTED"
);

const isFailedInvocationResult = (value: JsonRecord): boolean => (
  hasExactKeys(value, [
    "kind",
    "failureCode",
    "invocationFailureCount",
    "nextAttemptAt",
    "isPipelineBlocked",
  ])
  && value.kind === "INVOCATION_FAILED"
  && isInvocationFailureCode(value.failureCode)
  && (value.invocationFailureCount === 1
    || value.invocationFailureCount === 2
    || value.invocationFailureCount === 3)
  && isNullableString(value.nextAttemptAt)
  && (value.nextAttemptAt === null || isTimestamp(value.nextAttemptAt))
  && typeof value.isPipelineBlocked === "boolean"
);

const isInvocationReconciliationResult = (value: unknown): boolean => (
  isJsonRecord(value)
  && (isTerminalInvocationResult(value) || isFailedInvocationResult(value))
);

const isHeartbeatResponseResult = (value: unknown): boolean => (
  isJsonRecord(value)
  && hasExactKeys(value, ["accepted"])
  && value.accepted === true
);
const isAdmissionStatusResult = (value: unknown): value is Readonly<{
  status: "open" | "closed";
  open: boolean;
}> => (
  isJsonRecord(value)
  && hasExactKeys(value, ["status", "open"])
  && (value.status === "open" || value.status === "closed")
  && typeof value.open === "boolean"
  && ((value.status === "open" && value.open)
    || (value.status === "closed" && !value.open))
);

type WorkerReconcileResult = Readonly<{
  report: AffiliateAgentReconcileReport;
  admissionOpen: boolean;
}>;

const isWorkerReconcileResult = (
  value: unknown,
): value is WorkerReconcileResult => (
  isJsonRecord(value)
  && hasExactKeys(value, ["report", "admissionOpen"])
  && isReconcileReport(value.report)
  && typeof value.admissionOpen === "boolean"
);
const isAdmissionClosedResult = (value: unknown): boolean => (
  isAdmissionStatusResult(value)
  && value.status === "closed"
  && value.open === false
);

const invalidGatewayResponse = (): AffiliateAgentGatewayError =>
  new AffiliateAgentGatewayError({
    code: "INTERNAL_ERROR",
    isRetryable: true,
    safeMessage: "The affiliate gateway returned an invalid response.",
  });

const decodeGatewayResult = (value: unknown): unknown => {
  if (!isJsonRecord(value) || value.kind !== "ARTIFACT_READ") return value;
  const encodedBytes = value.bytes;
  if (typeof encodedBytes !== "string" || value.encoding !== "base64") {
    return value;
  }
  const { bytes: _bytes, encoding: _encoding, ...artifact } = value;
  return {
    ...artifact,
    bytes: Buffer.from(encodedBytes, "base64"),
  };
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const parseRunnerPrivateKey = (value: string) => {
  try {
    return createPrivateKey({
      key: Buffer.from(value, "base64"),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    throw new Error("AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY must be a base64 PKCS8 private key.");
  }
};

const signRunnerRequest = (
  request: Readonly<Record<string, unknown>>,
  privateKey: KeyObject,
): string => sign(
  null,
  Buffer.from(canonicalizeAffiliateAgentValue(request), "utf8"),
  privateKey,
).toString("base64");

export const positiveSeconds = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  if (value > MAX_TIMER_SECONDS) {
    throw new Error(`${name} exceeds the maximum supported timer duration.`);
  }
  return value;
};

const sleep = async (
  seconds: number,
  signal?: AbortSignal,
): Promise<void> => {
  const { promise, resolve } = createDeferred<void>();
  const finish = (): void => {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", finish);
    resolve();
  };
  const timeout = setTimeout(finish, seconds * 1_000);
  if (signal?.aborted) finish();
  else signal?.addEventListener("abort", finish, { once: true });
  await promise;
};

const DEFAULT_GATEWAY_PATH_PREFIX = "/v1/affiliate-agent";

export const normalizeGatewayPathPrefix = (
  pathPrefix: string | undefined,
): string => {
  const raw = pathPrefix?.trim() || DEFAULT_GATEWAY_PATH_PREFIX;
  if (
    !raw.startsWith("/")
    || raw.startsWith("//")
    || raw.includes("\\")
    || raw.includes("?")
    || raw.includes("#")
  ) {
    throw new Error(
      "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX must be a same-origin path with one leading slash.",
    );
  }
  const normalized = raw.replace(/\/+$/, "");
  return normalized || "/";
};

const gatewayPathPrefix = (): string => normalizeGatewayPathPrefix(
  process.env.AFFILIATE_AGENT_GATEWAY_PATH_PREFIX,
);

const gatewayPath = (suffix: string): string => {
  const prefix = gatewayPathPrefix();
  const normalizedSuffix = suffix.replace(/^\/+/, "");
  return prefix === "/" ? `/${normalizedSuffix}` : `${prefix}/${normalizedSuffix}`;
};

const safeIdentifier = (
  value: string,
  name: string,
  maximumLength: number = AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH,
): string => {
  const normalized = value.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)
    || normalized.length > maximumLength
  ) {
    throw new Error(`${name} must be a bounded identifier.`);
  }
  return normalized;
};

const roleFrom = (value: string): AffiliateAgentRole => {
  const role = value.trim().toUpperCase();
  if (!(AFFILIATE_AGENT_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Unsupported governed agent role: ${value}.`);
  }
  return role as AffiliateAgentRole;
};

const argumentValue = (name: string): string => {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!argument) throw new Error(`Missing ${prefix}<value> argument.`);
  return argument.slice(prefix.length);
};

const gatewayErrorCode = (
  value: unknown,
  status: number,
): AffiliateAgentGatewayErrorCode => {
  if (status === 401) return "ROLE_CREDENTIAL_INVALID";
  return isGatewayErrorCode(value) ? value : "INTERNAL_ERROR";
};

const gatewayErrorFrom = (
  response: GatewayResponse<unknown>,
  status: number,
): AffiliateAgentGatewayError => {
  const payload = response.error ?? {};
  return new AffiliateAgentGatewayError({
    code: gatewayErrorCode(payload.code, status),
    isRetryable: status !== 401
      && (payload.isRetryable === true || status >= 500),
    safeMessage: typeof payload.safeMessage === "string"
      ? payload.safeMessage
      : `The affiliate gateway returned HTTP ${status}.`,
    receiptId: typeof payload.receiptId === "string" ? payload.receiptId : undefined,
  });
};


type GatewayRequestCancellation = Readonly<{
  signal: AbortSignal;
  cleanup(): void;
}>;

type GatewayRequestCancellationOptions = Readonly<{
  shutdownSignal?: AbortSignal;
  signal?: AbortSignal;
  deadlineAt?: number;
  timeoutMilliseconds?: number | null;
}>;

const requestCancellationFor = (
  input: GatewayRequestCancellationOptions = {},
): GatewayRequestCancellation => {
  const controller = new AbortController();
  const finish = (): void => {
    if (!controller.signal.aborted) controller.abort();
  };
  const configuredTimeout = input.timeoutMilliseconds === null
    ? Number.POSITIVE_INFINITY
    : input.timeoutMilliseconds ?? DEFAULT_WORKER_GATEWAY_REQUEST_TIMEOUT_MILLISECONDS;
  const deadlineTimeout = input.deadlineAt === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, input.deadlineAt - Date.now());
  const timeoutMilliseconds = Math.min(configuredTimeout, deadlineTimeout);
  let timeout: NodeJS.Timeout | undefined;
  if (timeoutMilliseconds <= 0) finish();
  else if (Number.isFinite(timeoutMilliseconds)) timeout = setTimeout(finish, timeoutMilliseconds);
  const signals = [input.shutdownSignal, input.signal].filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  for (const signal of signals) {
    if (signal.aborted) finish();
    else signal.addEventListener("abort", finish, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      for (const signal of signals) signal.removeEventListener("abort", finish);
    },
  };
};

const waitForRunnerHandshake = async <T>(
  operation: Promise<T>,
  onTimeout: (error: Error) => void,
  timeoutMessage = "The affiliate agent runner reservation handshake timed out.",
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<Readonly<{ kind: "TIMEOUT" }>>((resolve) => {
    timeoutHandle = setTimeout(
      () => resolve({ kind: "TIMEOUT" }),
      AFFILIATE_AGENT_RUNNER_RESERVATION_TIMEOUT_MILLISECONDS,
    );
  });
  try {
    const result = await Promise.race([
      operation.then(
        (value) => ({ kind: "VALUE" as const, value }),
        (error: unknown) => ({ kind: "ERROR" as const, error }),
      ),
      timeout,
    ]);
    if (result.kind === "TIMEOUT") {
      const error = new Error(timeoutMessage);
      onTimeout(error);
      throw error;
    }
    if (result.kind === "ERROR") throw result.error;
    return result.value;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const gatewayAdmissionIsOpen = async (
  baseUrl: URL,
  operatorToken: string,
): Promise<boolean> => {
  const cancellation = requestCancellationFor();
  try {
    const response = await fetch(
      new URL(gatewayPath("admission"), baseUrl),
      {
        headers: {
          "x-affiliate-gateway-operator-token": operatorToken,
        },
        signal: cancellation.signal,
      },
    );
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // The shape check below produces the safe error.
    }
    if (!response.ok || !isAdmissionStatusResult(payload)) {
      throw invalidGatewayResponse();
    }
    return payload.open;
  } finally {
    cancellation.cleanup();
  }
};

const closeGatewayAdmission = async (
  baseUrl: URL,
  operatorToken: string,
): Promise<void> => {
  const cancellation = requestCancellationFor();
  try {
    const response = await fetch(
      new URL(gatewayPath("admission/close"), baseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-affiliate-gateway-operator-token": operatorToken,
        },
        body: "{}",
        signal: cancellation.signal,
      },
    );
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // The shape check below produces the safe error.
    }
    if (!response.ok || !isAdmissionClosedResult(payload)) {
      throw invalidGatewayResponse();
    }
  } finally {
    cancellation.cleanup();
  }
};
const persistGatewayAdmissionHalt = async (
  baseUrl: URL,
  operatorToken: string,
): Promise<void> => {
  let lastError: unknown = new Error("The gateway admission halt was not confirmed.");
  while (true) {
    try {
      await closeGatewayAdmission(baseUrl, operatorToken);
      if (!(await gatewayAdmissionIsOpen(baseUrl, operatorToken))) return;
      lastError = new Error("The gateway admission remained open after close.");
    } catch (error) {
      lastError = error;
    }
    console.error(
      `[affiliate-agent-supervisor] admission halt persistence retry: ${
        lastError instanceof Error ? lastError.message : "unknown error"
      }`,
    );
    await sleep(1);
  }
};

const gatewayResponsePayload = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    // Keep the empty payload so the response shape produces the safe error.
    return {};
  }
};

const decodeGatewayResponse = <T>(
  response: Response,
  payloadValue: unknown,
  validateResult: GatewayResultValidator,
): T => {
  if (response.status === 401) {
    const authPayload = isGatewayResponseValue(payloadValue) ? payloadValue : {};
    throw gatewayErrorFrom(authPayload, response.status);
  }
  if (!isGatewayResponseValue(payloadValue)) {
    throw invalidGatewayResponse();
  }
  const payload = payloadValue;
  if (!response.ok || ("error" in payload && payload.error !== undefined)) {
    throw gatewayErrorFrom(payload, response.status);
  }
  if (!("result" in payload)) {
    throw new AffiliateAgentGatewayError({
      code: "INTERNAL_ERROR",
      isRetryable: true,
      safeMessage: "The affiliate gateway returned no result.",
    });
  }
  if (!validateResult(payload.result)) {
    throw invalidGatewayResponse();
  }
  return decodeGatewayResult(payload.result) as T;
};

export type AffiliateAgentHttpGatewayOptions = Readonly<{
  shutdownSignal?: AbortSignal;
  roleCredential?: string | null;
  workerRole?: AffiliateAgentRole;
  workerId?: string;
  claimDeadlineAt?: number;
  requestTimeoutMilliseconds?: number | null;
}>;

type AffiliateAgentHttpRequestOptions = Readonly<{
  headers?: Readonly<Record<string, string>>;
  cancelOnShutdown?: boolean;
  signal?: AbortSignal;
  deadlineAt?: number;
  validateResult: GatewayResultValidator;
}>;

export class AffiliateAgentHttpGateway implements AffiliateAgentGateway {
  private readonly baseUrl: URL;
  private readonly shutdownSignal: AbortSignal | undefined;
  private readonly roleCredential: string | null;
  private readonly workerRole?: AffiliateAgentRole;
  private readonly workerId?: string;
  private readonly claimDeadlineAt: number | undefined;
  private readonly requestTimeoutMilliseconds: number | null;

  constructor(
    address: string,
    options: AffiliateAgentHttpGatewayOptions = {},
  ) {
    this.baseUrl = new URL(address);
    if (this.baseUrl.protocol !== "http:" && this.baseUrl.protocol !== "https:") {
      throw new Error("AFFILIATE_AGENT_GATEWAY_ADDRESS must use HTTP or HTTPS.");
    }
    if (
      options.claimDeadlineAt !== undefined
      && !Number.isFinite(options.claimDeadlineAt)
    ) {
      throw new Error("The affiliate agent claim deadline must be finite.");
    }
    this.shutdownSignal = options.shutdownSignal;
    this.roleCredential = options.roleCredential ?? null;
    this.workerRole = options.workerRole;
    this.workerId = options.workerId;
    this.claimDeadlineAt = options.claimDeadlineAt;
    this.requestTimeoutMilliseconds = options.requestTimeoutMilliseconds
      ?? (options.claimDeadlineAt === undefined
        ? DEFAULT_WORKER_GATEWAY_REQUEST_TIMEOUT_MILLISECONDS
        : null);
  }

  async heartbeatWorker(
    input: Readonly<{ workerId: string; role: AffiliateAgentRole }>,
  ): Promise<void> {
    if (!this.roleCredential) {
      throw new Error("Worker heartbeats require a role credential.");
    }
    await this.request(
      gatewayPath("worker/heartbeat"),
      {
        workerId: input.workerId,
        role: input.role,
        roleCredential: this.roleCredential,
      },
      {
        cancelOnShutdown: false,
        validateResult: isHeartbeatResponseResult,
      },
    );
  }

  private async request<T>(
    path: string,
    body: unknown,
    options: AffiliateAgentHttpRequestOptions,
  ): Promise<T> {
    const deadlineAt = this.claimDeadlineAt === undefined
      ? options.deadlineAt
      : options.deadlineAt === undefined
        ? this.claimDeadlineAt
        : Math.min(this.claimDeadlineAt, options.deadlineAt);
    const cancellation = requestCancellationFor({
      shutdownSignal: options.cancelOnShutdown ? this.shutdownSignal : undefined,
      signal: options.signal,
      deadlineAt,
      timeoutMilliseconds: this.requestTimeoutMilliseconds,
    });
    try {
      const url = new URL(path, this.baseUrl);
      if (url.origin !== this.baseUrl.origin) {
        throw new Error("The affiliate gateway request resolved outside the configured origin.");
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...options.headers,
        },
        body: JSON.stringify(body),
        signal: cancellation.signal,
      });
      const payloadValue = await gatewayResponsePayload(response);
      return decodeGatewayResponse(response, payloadValue, options.validateResult);
    } finally {
      cancellation.cleanup();
    }
  }

  claim(
    input: AffiliateAgentClaimRequest,
    options?: AffiliateAgentGatewayRequestOptions,
  ): Promise<AffiliateAgentClaimGrant | null> {
    return this.request<AffiliateAgentClaimGrant | null>(
      gatewayPath("claim"),
      input,
      {
        signal: options?.signal,
        deadlineAt: options?.deadlineAt,
        validateResult: (value) => isClaimGrantForRequest(value, input),
      },
    );
  }

  private workerRequest(): Readonly<{
    role: AffiliateAgentRole;
    workerId: string;
    roleCredential: string;
  }> {
    if (!this.workerRole || !this.workerId || !this.roleCredential) {
      throw new Error("Worker-safe gateway operations require a configured worker identity.");
    }
    return {
      role: this.workerRole,
      workerId: this.workerId,
      roleCredential: this.roleCredential,
    };
  }

  async reconcileWorkerState(): Promise<WorkerReconcileResult> {
    return this.request<WorkerReconcileResult>(
      gatewayPath("reconcile/worker"),
      this.workerRequest(),
      {
        cancelOnShutdown: true,
        validateResult: isWorkerReconcileResult,
      },
    );
  }

  perform<T extends AffiliateAgentClaimOperation>(
    input: T,
    options?: AffiliateAgentGatewayRequestOptions,
  ): Promise<AffiliateAgentClaimOperationResult<T>> {
    return this.request<AffiliateAgentClaimOperationResult<T>>(
      gatewayPath("perform"),
      input,
      {
        signal: options?.signal,
        deadlineAt: options?.deadlineAt,
        validateResult: (value) => isClaimOperationResult(input.kind, value),
      },
    );
  }

  reconcile(
    input?: AffiliateAgentReconcileRequest,
  ): Promise<AffiliateAgentReconcileReport> {
    const operatorToken = requiredEnvironment("AFFILIATE_GATEWAY_OPERATOR_TOKEN");
    return this.request<AffiliateAgentReconcileReport>(
      gatewayPath("reconcile"),
      input ?? {},
      {
        headers: { "x-affiliate-gateway-operator-token": operatorToken },
        cancelOnShutdown: true,
        validateResult: isReconcileReport,
      },
    );
  }

  private workerAdmissionRequest(): Readonly<{
    role: AffiliateAgentRole;
    workerId: string;
    roleCredential: string;
  }> {
    return this.workerRequest();
  }

  private async closeSupervisorAdmission(): Promise<void> {
    await this.request(
      gatewayPath("admission/supervisor/close"),
      this.workerAdmissionRequest(),
      {
        cancelOnShutdown: false,
        validateResult: (value) => isAdmissionStatusResult(value)
          && value.status === "closed"
          && !value.open,
      },
    );
  }

  private async workerAdmissionIsOpen(): Promise<boolean> {
    const result = await this.request<Readonly<{ status: "open" | "closed"; open: boolean }>>(
      gatewayPath("admission/worker/status"),
      this.workerAdmissionRequest(),
      {
        cancelOnShutdown: false,
        validateResult: isAdmissionStatusResult,
      },
    );
    return result.open;
  }

  private async persistWorkerAdmissionHalt(): Promise<void> {
    let lastError: unknown = new Error("The gateway admission halt was not confirmed.");
    while (true) {
      try {
        await this.closeSupervisorAdmission();
        return;
      } catch (error) {
        if (
          error instanceof AffiliateAgentGatewayError
          && error.code === "ROLE_CREDENTIAL_INVALID"
        ) {
          throw error;
        }
        lastError = error;
      }
      console.error(
        `[affiliate-agent-supervisor] admission halt persistence retry: ${
          lastError instanceof Error ? lastError.message : "unknown error"
        }`,
      );
      await sleep(1);
    }
  }

  haltAdmission(): Promise<void> {
    return this.workerRole && this.workerId
      ? this.persistWorkerAdmissionHalt()
      : persistGatewayAdmissionHalt(
          this.baseUrl,
          requiredEnvironment("AFFILIATE_GATEWAY_OPERATOR_TOKEN"),
        );
  }

  isAdmissionOpen(): Promise<boolean> {
    return this.workerRole && this.workerId
      ? this.workerAdmissionIsOpen()
      : gatewayAdmissionIsOpen(
          this.baseUrl,
          requiredEnvironment("AFFILIATE_GATEWAY_OPERATOR_TOKEN"),
        );
  }

  async reconcileInvocation(
    input: AffiliateAgentInvocationReconciliationRequest,
  ): Promise<AffiliateAgentInvocationReconciliationResult> {
    return this.request<AffiliateAgentInvocationReconciliationResult>(
      gatewayPath("reconcile/invocation"),
      input,
      {
        cancelOnShutdown: false,
        validateResult: isInvocationReconciliationResult,
      },
    );
  }

  async isDownstreamCapacityHealthy(): Promise<boolean> {
    const cancellation = requestCancellationFor({
      shutdownSignal: this.shutdownSignal,
      timeoutMilliseconds: this.requestTimeoutMilliseconds,
      deadlineAt: this.claimDeadlineAt,
    });
    try {
      const response = await fetch(
        new URL(gatewayPath("readiness"), this.baseUrl),
        { signal: cancellation.signal },
      );
      let payload: { ready?: unknown } = {};
      try {
        payload = await response.json() as { ready?: unknown };
      } catch {
        if (response.status !== 503) {
          throw gatewayErrorFrom({}, response.status);
        }
      }
      if (response.status === 503) return false;
      if (!response.ok) throw gatewayErrorFrom({}, response.status);
      return payload.ready === true;
    } finally {
      cancellation.cleanup();
    }
  }
}

const workspaceSignatureFor = (
  attestation: Omit<AffiliateAgentWorkspaceAttestation, "signature">,
  signingKey: Uint8Array,
): string => createHmac(WORKSPACE_SIGNING_ALGORITHM, signingKey)
  .update(canonicalizeAffiliateAgentValue(attestation))
  .digest("base64url");


type WorkspacePath = string | Buffer;
type WorkspaceMode = "READ_ONLY" | "READ_WRITE";

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

const workspaceEntryStatsFor = async (
  entryPath: WorkspacePath,
): Promise<Awaited<ReturnType<typeof lstat>> | null> => {
  try {
    return await lstat(entryPath);
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) return null;
    throw error;
  }
};

const workspaceFileModeFor = (
  mode: WorkspaceMode,
  isExecutable: boolean,
): number => mode === "READ_ONLY"
  ? isExecutable ? 0o550 : 0o440
  : isExecutable ? 0o770 : 0o660;

const applyWorkspaceEntryPermissions = async (
  path: WorkspacePath,
  entry: Dirent<Buffer>,
  mode: WorkspaceMode,
): Promise<void> => {
  const entryPath = workspaceEntryPath(path, entry.name);
  const entryStats = await workspaceEntryStatsFor(entryPath);
  if (entryStats === null || entryStats.isSymbolicLink()) return;
  const isReadOnly = mode === "READ_ONLY";
  if (entryStats.isDirectory()) {
    await applyWorkspacePermissions(
      entryPath,
      isReadOnly && entry.name.toString("utf8") === ".omp" ? "READ_WRITE" : mode,
    );
    return;
  }
  const isExecutable = (Number(entryStats.mode) & 0o111) !== 0;
  await chmod(entryPath, workspaceFileModeFor(mode, isExecutable));
};

const applyWorkspacePermissions = async (
  path: WorkspacePath,
  mode: WorkspaceMode,
): Promise<void> => {
  const isReadOnly = mode === "READ_ONLY";
  const directoryMode = isReadOnly ? 0o550 : 0o770;
  const entries = await readdir(path, { withFileTypes: true, encoding: "buffer" });
  await chmod(path, directoryMode);
  for (const entry of entries) {
    await applyWorkspaceEntryPermissions(path, entry, mode);
  }
};


const workspaceSetupRollbackError = (
  workspacePath: string,
  error: unknown,
): AffiliateAgentGatewayError => new AffiliateAgentGatewayError({
  code: "INTERNAL_ERROR",
  isRetryable: false,
  safeMessage: `The workspace setup rollback failed for ${workspacePath}: ${
    error instanceof Error ? error.message : "unknown rollback error"
  }`,
});
const isGovernedWorkspace = (name: string): boolean => (
  /^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9]{6}$/.test(name)
);

const assertStaleWorkspaceDirectory = (entry: Dirent): void => {
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`The governed workspace entry is not a directory: ${entry.name}`);
  }
};

const assertOwnedStaleWorkspace = (
  name: string,
  entry: Awaited<ReturnType<typeof lstat>>,
): void => {
  const ownerUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (
    entry.isSymbolicLink()
    || !entry.isDirectory()
    || (ownerUid !== null && entry.uid !== ownerUid)
  ) {
    throw new Error(`The governed workspace entry changed type or owner: ${name}`);
  }
};

const removeStaleWorkspace = async (
  root: string,
  entry: Dirent,
): Promise<void> => {
  if (!isGovernedWorkspace(entry.name)) return;
  assertStaleWorkspaceDirectory(entry);
  const workspacePath = join(root, entry.name);
  const workspaceEntry = await lstat(workspacePath);
  assertOwnedStaleWorkspace(entry.name, workspaceEntry);
  await chmod(workspacePath, 0o770);
  await rm(workspacePath, { recursive: true, force: true });
};

const cleanupStaleWorkspaces = async (root: string): Promise<void> => {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
    ) return;
    throw error;
  }
  for (const entry of entries) {
    await removeStaleWorkspace(root, entry);
  }
  const residualEntries = await readdir(root, { withFileTypes: true, encoding: "utf8" });
  if (residualEntries.some((entry) => isGovernedWorkspace(entry.name))) {
    throw new Error("Governed workspace cleanup left a residual workspace.");
  }
};

const removeStaleGovernedWorkspaces = async (root: string): Promise<void> => {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, rejectPromise) => {
    timeout = setTimeout(
      () => rejectPromise(new Error("Governed workspace cleanup timed out.")),
      WORKSPACE_CLEANUP_TIMEOUT_MILLISECONDS,
    );
    timeout.unref?.();
  });
  try {
    await Promise.race([cleanupStaleWorkspaces(root), timeoutPromise]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
};

export const createWorkspaceManager = (
  root: string,
  signingKey: Uint8Array,
): AffiliateAgentWorkspaceManager => ({
  async recoverStale(_reservation) {
    const resolvedRoot = resolve(root);
    await mkdir(resolvedRoot, { recursive: true, mode: WORKSPACE_ROOT_MODE });
    const rootEntry = await lstat(resolvedRoot);
    const ownerUid = typeof process.getuid === "function" ? process.getuid() : null;
    if (
      rootEntry.isSymbolicLink()
      || !rootEntry.isDirectory()
      || (ownerUid !== null && rootEntry.uid !== ownerUid)
    ) {
      throw new Error("The governed workspace root must be an owned directory.");
    }
    await chmod(resolvedRoot, WORKSPACE_ROOT_MODE);
    await removeStaleGovernedWorkspaces(resolvedRoot);
  },
  async create(input) {
    const workerId = safeIdentifier(
      input.workerId,
      "workerId",
      AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH,
    );
    const invocationId = safeIdentifier(
      input.invocationId,
      "invocationId",
      AFFILIATE_AGENT_INVOCATION_ID_MAX_LENGTH,
    );
    const workspaceId = safeIdentifier(
      `${workerId}-${invocationId}`,
      "workspaceId",
      AFFILIATE_AGENT_WORKSPACE_ID_MAX_LENGTH,
    );
    const resolvedRoot = resolve(root);
    await mkdir(resolvedRoot, { recursive: true, mode: WORKSPACE_ROOT_MODE });
    const rootEntry = await lstat(resolvedRoot);
    if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
      throw new Error("The governed workspace root must be a directory.");
    }
    await chmod(resolvedRoot, WORKSPACE_ROOT_MODE);
    const path = await mkdtemp(join(resolvedRoot, `${workspaceId}-`));
    try {
      await chmod(path, 0o770);
      const ompConfigRoot = join(path, ".omp");
      await mkdir(ompConfigRoot, { recursive: true, mode: 0o770 });
      await chmod(ompConfigRoot, 0o770);
      await applyWorkspacePermissions(path, input.mode);
      await chmod(ompConfigRoot, 0o770);
      const issuedAtDate = new Date(Date.now());
      const issuedAt = issuedAtDate.toISOString();
      const expiresAt = new Date(
        issuedAtDate.getTime()
          + AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS * 1_000,
      ).toISOString();
      const unsignedAttestation = {
        schemaVersion: 1 as const,
        workspaceId,
        mode: input.mode,
        executionClass: "PRODUCTION_OMP" as const,
        workerId,
        invocationId,
        issuedAt,
        expiresAt,
      } satisfies Omit<AffiliateAgentWorkspaceAttestation, "signature">;
      return {
        path,
        ompConfigRoot,
        attestation: {
          ...unsignedAttestation,
          signature: workspaceSignatureFor(unsignedAttestation, signingKey),
        },
      };
    } catch (error) {
      try {
        await applyWorkspacePermissions(path, "READ_WRITE");
      } catch {
        // Best-effort permission recovery before removing a failed workspace.
      }
      try {
        await rm(path, { recursive: true, force: true });
      } catch (rollbackError) {
        throw workspaceSetupRollbackError(path, rollbackError);
      }
      throw error;
    }
  },
  async destroy(path) {
    const resolvedRoot = resolve(root);
    const resolvedPath = resolve(path);
    if (dirname(resolvedPath) !== resolvedRoot) {
      throw new Error("The workspace path must be a direct child of the governed workspace root.");
    }
    try {
      await chmod(resolvedPath, 0o770);
    } catch (error) {
      if (
        !error
        || typeof error !== "object"
        || !("code" in error)
        || error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
    await rm(resolvedPath, { recursive: true, force: true });
  },
});


const RUNNER_ENVIRONMENT_KEYS = new Set([
  "AFFILIATE_AGENT_GATEWAY_ADDRESS",
  "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX",
  "AFFILIATE_AGENT_CLAIM_TOKEN",
  "AFFILIATE_AGENT_CLAIM_ENVELOPE",
]);

type RunnerResponseWaiter = Readonly<{
  resolve(value?: unknown): void;
  reject(error: unknown): void;
  expectedKind: "RESERVED" | "RELEASED" | "STARTED" | "TERMINATED";
}>;
type AffiliateAgentRunnerControlRequest =
  | Omit<
      Extract<AffiliateAgentRunnerRequest, { kind: "CORRECTION" }>,
      "signature"
    >
  | Omit<
      Extract<
        AffiliateAgentRunnerRequest,
        { kind: "TERMINATE" | "FORCE_TERMINATE" }
      >,
      "signature"
    >;

class AffiliateAgentRunnerProcessSession implements AffiliateAgentProcessSession {
  readonly started: Promise<void>;
  private readonly socket: Socket;
  private readonly protocolPrivateKey: KeyObject;
  private readonly reservationId: string;
  private readonly resolveStarted: () => void;
  private readonly rejectStarted: (error: unknown) => void;
  private readonly responseWaiters = new Map<string, RunnerResponseWaiter>();
  private readonly pendingEvents: AffiliateAgentProcessEvent[] = [];
  private readonly waitingEvents: Array<
    (event: AffiliateAgentProcessEvent) => void
  > = [];
  private lineBuffer = "";
  private launchRequestId: string | null = null;
  private isRunnerClosed = false;
  private isChildClosed = false;
  private isTerminated = false;

  constructor(
    socketPathOrSocket: string | Socket,
    protocolPrivateKey: KeyObject,
    input: AffiliateAgentProcessLaunchInput & Readonly<{ reservationId: string }>,
  ) {
    const started = createDeferred<void>();
    this.started = started.promise;
    this.resolveStarted = started.resolve;
    this.reservationId = input.reservationId;
    this.protocolPrivateKey = protocolPrivateKey;
    this.rejectStarted = started.reject;
    this.socket = typeof socketPathOrSocket === "string"
      ? createConnection(socketPathOrSocket)
      : socketPathOrSocket;
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string | Buffer) => {
      this.consume(chunk.toString());
    });
    this.socket.once("error", (error) => this.fail(error));
    this.socket.once("close", () => {
      this.fail(new Error("The affiliate agent runner connection closed."));
    });
    const sendLaunch = (): void => {
      const requestId = randomUUID();
      const unsignedRequest = {
        kind: "LAUNCH" as const,
        requestId,
        reservationId: input.reservationId,
        workerId: input.workerId,
        invocationId: input.invocationId,
        workspaceId: input.workspaceId,
        workspaceMode: input.workspaceMode,
        prompt: input.prompt,
        environment: Object.fromEntries(
          Object.entries(input.environment).filter(([name]) =>
            RUNNER_ENVIRONMENT_KEYS.has(name),
          ),
        ),
        workspacePath: input.workspacePath,
      };
      const request: AffiliateAgentRunnerRequest = {
        ...unsignedRequest,
        signature: signRunnerRequest(unsignedRequest, protocolPrivateKey),
      };
      this.launchRequestId = request.requestId;
      this.writeRequest(request, {
        resolve: this.resolveStarted,
        reject: this.rejectStarted,
        expectedKind: "STARTED",
      });
    };
    if (typeof socketPathOrSocket === "string") {
      this.socket.once("connect", sendLaunch);
    } else {
      sendLaunch();
    }
  }

  private consume(chunk: string): void {
    this.lineBuffer += chunk;
    while (true) {
      const newlineIndex = this.lineBuffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = this.lineBuffer.slice(0, newlineIndex);
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        this.fail(new Error("The affiliate agent runner returned invalid JSON."));
        return;
      }
      try {
        this.consumeResponse(parseAffiliateAgentRunnerResponse(parsed));
      } catch (error) {
        this.fail(error);
        return;
      }
    }
  }

  private responseMatchesRequest(
    response: AffiliateAgentRunnerResponse,
  ): boolean {
    if (response.kind === "EVENT") {
      return response.requestId === this.launchRequestId;
    }
    const waiter = this.responseWaiters.get(response.requestId);
    return (
      waiter !== undefined
      && (response.kind === "ERROR" || response.kind === waiter.expectedKind)
    );
  }

  private takeResponseWaiter(
    requestId: string,
  ): RunnerResponseWaiter | null {
    const waiter = this.responseWaiters.get(requestId);
    if (!waiter) {
      this.fail(
        new Error(
          "The affiliate agent runner returned a response for an unknown request.",
        ),
      );
      return null;
    }
    this.responseWaiters.delete(requestId);
    return waiter;
  }

  private consumeEvent(event: AffiliateAgentProcessEvent): void {
    this.isChildClosed = true;
    const waiter = this.waitingEvents.shift();
    if (waiter) waiter(event);
    else this.pendingEvents.push(event);
  }

  private consumeMatchedResponse(response: AffiliateAgentRunnerResponse): void {
    switch (response.kind) {
      case "EVENT":
        this.consumeEvent(response.event);
        return;
      case "ERROR": {
        const waiter = this.takeResponseWaiter(response.requestId);
        if (waiter) waiter.reject(new Error(response.message));
        return;
      }
      case "STARTED": {
        const waiter = this.takeResponseWaiter(response.requestId);
        if (!waiter) return;
        this.isRunnerClosed = false;
        this.isChildClosed = false;
        waiter.resolve();
        return;
      }
      case "RELEASED": {
        const waiter = this.takeResponseWaiter(response.requestId);
        if (waiter) waiter.resolve();
        return;
      }
      case "TERMINATED": {
        const waiter = this.takeResponseWaiter(response.requestId);
        if (waiter) waiter.resolve();
        this.isTerminated = true;
        this.isChildClosed = true;
        return;
      }
    }
  }

  private consumeResponse(response: AffiliateAgentRunnerResponse): void {
    if (!this.responseMatchesRequest(response)) {
      this.fail(
        new Error(
          "The affiliate agent runner returned a response for a mismatched request.",
        ),
      );
      return;
    }
    this.consumeMatchedResponse(response);
  }

  private writeRequest(
    request: AffiliateAgentRunnerRequest,
    waiter: RunnerResponseWaiter,
  ): void {
    this.responseWaiters.set(request.requestId, waiter);
    try {
      this.socket.write(`${JSON.stringify(request)}\n`);
    } catch (error) {
      this.responseWaiters.delete(request.requestId);
      waiter.reject(error);
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    if (this.isRunnerClosed) return;
    this.isRunnerClosed = true;
    this.pendingEvents.length = 0;
    this.rejectStarted(error);
    for (const waiter of this.responseWaiters.values()) waiter.reject(error);
    this.responseWaiters.clear();
    while (this.waitingEvents.length > 0) {
      this.waitingEvents.shift()?.({ kind: "EXIT", exitCode: 1 });
    }
    this.socket.destroy();
  }

  nextEvent(): Promise<AffiliateAgentProcessEvent> {
    if (this.isRunnerClosed) {
      return Promise.resolve({ kind: "EXIT", exitCode: 1 });
    }
    const event = this.pendingEvents.shift();
    if (event) return Promise.resolve(event);
    if (this.isChildClosed) {
      return Promise.resolve({ kind: "EXIT", exitCode: 1 });
    }
    const deferred = createDeferred<AffiliateAgentProcessEvent>();
    this.waitingEvents.push(deferred.resolve);
    return deferred.promise;
  }

  async send(_input: AffiliateAgentProcessInput): Promise<void> {
    throw new Error(
      "Schema corrections must be submitted by the child through the gateway.",
    );
  }

  async terminate(): Promise<void> {
    if (this.isTerminated) return;
    if (this.isRunnerClosed) {
      throw new Error("The affiliate agent runner closed before termination was confirmed.");
    }
    await this.requestTermination("TERMINATE");
  }

  async forceTerminate(): Promise<void> {
    if (this.isTerminated) return;
    if (this.isRunnerClosed) {
      throw new Error(
        "The affiliate agent runner closed before force termination was confirmed.",
      );
    }
    await this.requestTermination("FORCE_TERMINATE");
  }
  disconnect(): void {
    this.fail(new Error("The affiliate agent runner connection was abandoned."));
  }

  async release(): Promise<void> {
    if (this.isRunnerClosed) return;
    if (!this.isTerminated) {
      throw new Error("The affiliate agent runner invocation is still active.");
    }
    const requestId = randomUUID();
    const unsignedRequest = {
      kind: "RELEASE" as const,
      requestId,
      reservationId: this.reservationId,
    };
    const request: AffiliateAgentRunnerRequest = {
      ...unsignedRequest,
      signature: signRunnerRequest(unsignedRequest, this.protocolPrivateKey),
    };
    const deferred = createDeferred<unknown>();
    this.writeRequest(request, {
      resolve: deferred.resolve,
      reject: deferred.reject,
      expectedKind: "RELEASED",
    });
    await waitForRunnerHandshake(
      deferred.promise,
      () => {
        this.isRunnerClosed = true;
        this.socket.destroy();
      },
      "The affiliate agent runner release response timed out.",
    );
    this.isRunnerClosed = true;
    this.socket.end();
  }

  private async requestTermination(
    kind: "TERMINATE" | "FORCE_TERMINATE",
  ): Promise<void> {
    const requestId = randomUUID();
    const unsignedRequest = { kind, requestId } as const;
    const request: AffiliateAgentRunnerRequest = {
      ...unsignedRequest,
      signature: signRunnerRequest(unsignedRequest, this.protocolPrivateKey),
    };
    const deferred = createDeferred<unknown>();
    this.writeRequest(request, {
      resolve: deferred.resolve,
      reject: deferred.reject,
      expectedKind: "TERMINATED",
    });
    await waitForRunnerHandshake(
      deferred.promise,
      () => {
        this.isRunnerClosed = true;
        this.socket.destroy();
      },
      "The affiliate agent runner termination response timed out.",
    );
    this.isTerminated = true;
  }
}
type RunnerDeferred = Readonly<{
  resolve(value?: unknown): void;
  reject(error: unknown): void;
}>;
type RunnerReservationWaiter = Readonly<{
  requestId: string;
  expectedKind: "RESERVED" | "RELEASED";
  deferred: RunnerDeferred;
}>;

type ParsedReservationResponse =
  | Readonly<{ kind: "VALUE"; response: AffiliateAgentRunnerResponse }>
  | Readonly<{ kind: "ERROR"; error: unknown }>;

const parseReservationResponse = (
  line: string,
): ParsedReservationResponse => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return {
      kind: "ERROR",
      error: new Error("The affiliate agent runner returned invalid JSON."),
    };
  }
  try {
    return {
      kind: "VALUE",
      response: parseAffiliateAgentRunnerResponse(parsed),
    };
  } catch (error) {
    return { kind: "ERROR", error };
  }
};

class AffiliateAgentRunnerProcessReservation
  implements AffiliateAgentProcessReservation {
  readonly started: Promise<void>;
  private readonly socket: Socket;
  private readonly protocolPrivateKey: KeyObject;
  private readonly resolveStarted: () => void;
  private readonly rejectStarted: (error: unknown) => void;
  private readonly onData: (chunk: string | Buffer) => void;
  private readonly onError: (error: Error) => void;
  private readonly onClose: () => void;
  private responseWaiter: RunnerReservationWaiter | null = null;
  private lineBuffer = "";
  private assignedReservationId: string | null = null;
  private launchedSession: AffiliateAgentRunnerProcessSession | null = null;
  private state: "RESERVING" | "RESERVED" | "LAUNCHED" | "RELEASED" | "CLOSED" =
    "RESERVING";

  constructor(
    socketPath: string,
    protocolPrivateKey: KeyObject,
    input: Readonly<{ workerId: string; invocationId: string }>,
  ) {
    const started = createDeferred<void>();
    this.started = started.promise;
    this.resolveStarted = started.resolve;
    this.rejectStarted = started.reject;
    this.protocolPrivateKey = protocolPrivateKey;
    this.socket = createConnection(socketPath);
    this.socket.setEncoding("utf8");
    this.onData = (chunk) => this.consume(chunk.toString());
    this.onError = (error) => this.fail(error);
    this.onClose = () => this.fail(
      new Error("The affiliate agent runner connection closed."),
    );
    this.socket.on("data", this.onData);
    this.socket.once("error", this.onError);
    this.socket.once("close", this.onClose);
    this.socket.once("connect", () => {
      const requestId = randomUUID();
      const unsignedRequest = {
        kind: "RESERVE" as const,
        requestId,
        workerId: input.workerId,
        invocationId: input.invocationId,
      };
      this.writeRequest(
        {
          ...unsignedRequest,
          signature: signRunnerRequest(unsignedRequest, protocolPrivateKey),
        },
        "RESERVED",
        {
          resolve: () => this.resolveStarted(),
          reject: this.rejectStarted,
        },
      );
    });
  }

  get reservationId(): string {
    if (this.assignedReservationId === null) {
      throw new Error("The affiliate agent runner reservation is not ready.");
    }
    return this.assignedReservationId;
  }

  cancel(error: Error): void {
    this.fail(error);
  }

  cancelPending(error: Error): void {
    if (this.state === "RESERVING") this.fail(error);
  }

  private consume(chunk: string): void {
    this.lineBuffer += chunk;
    while (true) {
      const newlineIndex = this.lineBuffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = this.lineBuffer.slice(0, newlineIndex);
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      const parsed = parseReservationResponse(line);
      if (parsed.kind === "ERROR") {
        this.fail(parsed.error);
        return;
      }
      this.consumeResponse(parsed.response);
      if (this.state === "CLOSED") return;
    }
  }

  private takeResponseWaiter(
    response: AffiliateAgentRunnerResponse,
  ): RunnerReservationWaiter | null {
    const waiter = this.responseWaiter;
    if (
      waiter === null
      || waiter.requestId !== response.requestId
      || (
        response.kind !== "ERROR"
        && response.kind !== waiter.expectedKind
      )
    ) {
      this.fail(
        new Error("The affiliate agent runner returned a mismatched response."),
      );
      return null;
    }
    this.responseWaiter = null;
    return waiter;
  }

  private consumeResponse(response: AffiliateAgentRunnerResponse): void {
    const waiter = this.takeResponseWaiter(response);
    if (waiter === null) return;
    if (response.kind === "ERROR") {
      const error = response.message === "The affiliate agent runner is busy."
        ? new AffiliateAgentProcessCapacityError()
        : new Error(response.message);
      this.fail(error);
      waiter.deferred.reject(error);
      return;
    }
    if (response.kind === "RESERVED") {
      this.assignedReservationId = response.reservationId;
      this.state = "RESERVED";
      waiter.deferred.resolve(response.reservationId);
      this.resolveStarted();
      return;
    }
    this.state = "RELEASED";
    waiter.deferred.resolve(undefined);
  }

  private writeRequest(
    request: AffiliateAgentRunnerRequest,
    expectedKind: "RESERVED" | "RELEASED",
    startedOrDeferred: RunnerDeferred,
  ): void {
    this.responseWaiter = {
      requestId: request.requestId,
      expectedKind,
      deferred: startedOrDeferred,
    };
    try {
      this.socket.write(`${JSON.stringify(request)}\n`);
    } catch (error) {
      this.responseWaiter = null;
      startedOrDeferred.reject(error);
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    if (this.state === "CLOSED" || this.state === "LAUNCHED") return;
    this.state = "CLOSED";
    this.rejectStarted(error);
    this.responseWaiter?.deferred.reject(error);
    this.responseWaiter = null;
    this.socket.destroy();
  }

  launch(input: AffiliateAgentProcessLaunchInput): AffiliateAgentProcessSession {
    if (this.state !== "RESERVED" || this.assignedReservationId === null) {
      throw new Error("The affiliate agent runner reservation is not available.");
    }
    const session = new AffiliateAgentRunnerProcessSession(
      this.socket,
      this.protocolPrivateKey,
      { ...input, reservationId: this.assignedReservationId },
    );
    this.launchedSession = session;
    this.detach();
    this.state = "LAUNCHED";
    return session;
  }
  disconnect(): void {
    if (this.state === "LAUNCHED") {
      this.launchedSession?.disconnect();
      return;
    }
    if (this.state !== "RELEASED") {
      this.fail(new Error("The affiliate agent runner reservation was abandoned."));
    }
  }


  async release(): Promise<void> {
    if (this.state === "RELEASED") return;
    if (this.state === "LAUNCHED") {
      if (this.launchedSession === null) {
        throw new Error("The launched agent runner session is unavailable.");
      }
      await this.launchedSession.release();
      this.state = "RELEASED";
      return;
    }
    if (this.state !== "RESERVED" || this.assignedReservationId === null) {
      throw new Error("The affiliate agent runner reservation is unavailable.");
    }
    const requestId = randomUUID();
    const deferred = createDeferred<unknown>();
    const unsignedRequest = {
      kind: "RELEASE" as const,
      requestId,
      reservationId: this.assignedReservationId,
    };
    this.writeRequest(
      {
        ...unsignedRequest,
        signature: signRunnerRequest(unsignedRequest, this.protocolPrivateKey),
      },
      "RELEASED",
      deferred,
    );
    await waitForRunnerHandshake(
      deferred.promise,
      (error) => this.fail(error),
      "The affiliate agent runner release response timed out.",
    );
    this.detach();
    this.socket.end();
  }

  private detach(): void {
    this.socket.removeListener("data", this.onData);
    this.socket.removeListener("error", this.onError);
    this.socket.removeListener("close", this.onClose);
  }
}

const createProcessLauncher = (
  runnerSocket: string,
  protocolPrivateKey: KeyObject,
  shutdownSignal?: AbortSignal,
): AffiliateAgentProcessLauncher => ({
  async reserve(input) {
    const reservation = new AffiliateAgentRunnerProcessReservation(
      runnerSocket,
      protocolPrivateKey,
      input,
    );
    const cancelOnShutdown = (): void => {
      reservation.cancelPending(
        new Error("The affiliate agent runner reservation was cancelled."),
      );
    };
    if (shutdownSignal?.aborted) cancelOnShutdown();
    else shutdownSignal?.addEventListener("abort", cancelOnShutdown, { once: true });
    try {
      await waitForRunnerHandshake(
        reservation.started,
        (error) => reservation.cancel(error),
      );
      return reservation;
    } finally {
      shutdownSignal?.removeEventListener("abort", cancelOnShutdown);
    }
  },
});



const createInvocationReconciler = (
  gateway: AffiliateAgentHttpGateway,
): AffiliateAgentSupervisorDependencies["invocationReconciler"] => ({
  reconcileInvocation: (input) => gateway.reconcileInvocation(input),
});

const parseSupervisorArguments = (): Readonly<{
  role: AffiliateAgentRole;
  workerId: string;

}> => ({
  role: roleFrom(argumentValue("role")),
  workerId: safeIdentifier(argumentValue("worker-id"), "worker-id"),
});
type SupervisorConfiguration = Readonly<{
  role: AffiliateAgentRole;
  workerId: string;
  roleCredential: string;
  gateway: AffiliateAgentHttpGateway;
  dependencies: AffiliateAgentSupervisorDependencies;
  idleSeconds: number;
  failureSeconds: number;
}>;
type SupervisorControl = {
  readonly signal: AbortSignal;
  readonly admissionState: AffiliateAgentSupervisorAdmissionState;
  isStopping: boolean;
};

const createSupervisorConfiguration = (
  role: AffiliateAgentRole,
  workerId: string,
  shutdownSignal: AbortSignal,
): SupervisorConfiguration => {
  const roleCredential = requiredEnvironment("AFFILIATE_AGENT_ROLE_CREDENTIAL");
  const gateway = new AffiliateAgentHttpGateway(
    requiredEnvironment("AFFILIATE_AGENT_GATEWAY_ADDRESS"),
    {
      shutdownSignal,
      roleCredential,
      workerRole: role,
      workerId,
    },
  );
  const runnerSocket = requiredEnvironment("AFFILIATE_AGENT_RUNNER_SOCKET");
  const runnerProtocolPrivateKey = parseRunnerPrivateKey(
    requiredEnvironment("AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY"),
  );
  const workspaceRoot = requiredEnvironment("AFFILIATE_AGENT_WORKSPACE_ROOT");
  const workspaceSigningKey = Buffer.from(
    requiredEnvironment("AFFILIATE_AGENT_WORKSPACE_SIGNING_KEY"),
    "base64",
  );
  if (workspaceSigningKey.byteLength < 32) {
    throw new Error("AFFILIATE_AGENT_WORKSPACE_SIGNING_KEY must decode to at least 32 bytes.");
  }
  const idleSeconds = positiveSeconds("AFFILIATE_AGENT_IDLE_SECONDS", DEFAULT_IDLE_SECONDS);
  const failureSeconds = positiveSeconds(
    "AFFILIATE_AGENT_FAILURE_SECONDS",
    DEFAULT_FAILURE_SECONDS,
  );
  const dependencies: AffiliateAgentSupervisorDependencies = {
    gateway,
    invocationReconciler: createInvocationReconciler(gateway),
    clock: { now: () => new Date() },
    identifiers: { create: (kind) => `agw-${kind}-${randomUUID()}` },
    processLauncher: createProcessLauncher(
      runnerSocket,
      runnerProtocolPrivateKey,
      shutdownSignal,
    ),
    workspaces: createWorkspaceManager(workspaceRoot, workspaceSigningKey),
    workerHealth: {
      heartbeat: ({ workerId, role }) =>
        gateway.heartbeatWorker({ workerId, role }),
    },
  };
  return {
    role,
    workerId,
    roleCredential,
    gateway,
    dependencies,
    idleSeconds,
    failureSeconds,
  };
};
const supervisorInputFor = (
  configuration: SupervisorConfiguration,
  control: SupervisorControl,
): AffiliateAgentSupervisorInput => ({
  role: configuration.role,
  roleCredential: configuration.roleCredential,
  gatewayAddress: requiredEnvironment("AFFILIATE_AGENT_GATEWAY_ADDRESS"),
  gatewayPathPrefix: gatewayPathPrefix(),
  workerId: configuration.workerId,
  invocationId: `${configuration.workerId}-${randomUUID()}`,
  shutdownSignal: control.signal,
  admissionState: control.admissionState,
});

const supervisorErrorMessage = (error: unknown): string => {
  if (error instanceof AffiliateAgentGatewayError) {
    return `${error.code}: ${error.safeMessage}`;
  }
  return error instanceof Error ? error.message : "Unknown supervisor failure.";
};

const waitForDownstreamCapacity = async (
  configuration: SupervisorConfiguration,
  control: SupervisorControl,
): Promise<boolean> => {
  while (
    !control.isStopping
    && !control.admissionState.isAdmissionHalted
  ) {
    try {
      if (await configuration.gateway.isDownstreamCapacityHealthy()) return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capacity readiness failed.";
      console.error(
        `[affiliate-agent-supervisor] ${configuration.workerId}: ${message}`,
      );
    }
    if (
      !control.isStopping
      && !control.admissionState.isAdmissionHalted
    ) {
      await sleep(configuration.failureSeconds, control.signal);
    }
  }
  return false;
};

const pauseAfterOutcome = async (
  outcome: AffiliateAgentSupervisorOutcome,
  configuration: SupervisorConfiguration,
  control: SupervisorControl,
): Promise<void> => {
  let delaySeconds: number | null = null;
  if (outcome === "NO_WORK") {
    delaySeconds = configuration.idleSeconds;
  } else if (
    outcome === "PIPELINE_BLOCKED"
    || outcome === "INVOCATION_FAILED"
  ) {
    delaySeconds = configuration.failureSeconds;
  }
  if (delaySeconds !== null && !control.isStopping) {
    await sleep(delaySeconds, control.signal);
  }
};

const runSupervisorIteration = async (
  configuration: SupervisorConfiguration,
  control: SupervisorControl,
): Promise<void> => {
  if (control.admissionState.isAdmissionHalted) return;
  const input = supervisorInputFor(configuration, control);
  try {
    const outcome = await runAffiliateAgentInvocation(
      configuration.dependencies,
      input,
    );
    await pauseAfterOutcome(outcome, configuration, control);
  } catch (error) {
    console.error(
      `[affiliate-agent-supervisor] ${configuration.workerId}: ${supervisorErrorMessage(error)}`,
    );
    if (control.admissionState.isAdmissionHalted) {
      control.isStopping = true;
      throw error;
    }
    if (!control.isStopping) await sleep(configuration.failureSeconds, control.signal);
  }
};

const runSupervisorLoop = async (
  configuration: SupervisorConfiguration,
  control: SupervisorControl,
): Promise<void> => {
  while (
    !control.isStopping
    && !control.admissionState.isAdmissionHalted
  ) {
    if (
      configuration.role === "COVERAGE_PLANNER"
      && !(await waitForDownstreamCapacity(configuration, control))
    ) break;
    await runSupervisorIteration(configuration, control);
  }
};
const startupAdmissionHaltRequiredFor = (error: unknown): boolean => {
  if (!(error instanceof AffiliateAgentGatewayError)) return false;
  if (
    error.code === "ROLE_CREDENTIAL_INVALID"
    || error.code === "ROLE_NOT_ALLOWED"
    || error.code === "SUPPLY_CONTRACT_STALE"
    || error.code === "DEPLOYMENT_CONTRACT_STALE"
    || error.code === "GATEWAY_ADMISSION_HALTED"
  ) {
    return true;
  }
  return error.code === "INTERNAL_ERROR"
    && (
      !error.isRetryable
      || /database|authentication|not authorized/i.test(error.safeMessage)
    );
};
export const restorePersistedAdmissionHalt = async (
  configuration: SupervisorConfiguration,
  control: SupervisorControl,
): Promise<void> => {
  try {
    const reconciled = await configuration.gateway.reconcileWorkerState();
    if (!reconciled.report.isAdmissionHalted) return;
    control.admissionState.isAdmissionHalted = true;
    control.admissionState.admissionHaltError = new AffiliateAgentGatewayError({
      code: "GATEWAY_ADMISSION_HALTED",
      isRetryable: false,
      safeMessage: "Gateway admission remains halted pending reconciliation.",
    });
    if (reconciled.admissionOpen) {
      try {
        await configuration.gateway.haltAdmission();
      } catch (error) {
        control.admissionState.admissionHaltError = error;
      }
    }
  } catch (error) {
    if (!startupAdmissionHaltRequiredFor(error)) return;
    control.admissionState.isAdmissionHalted = true;
    control.admissionState.admissionHaltError = error;
    try {
      await configuration.gateway.haltAdmission();
    } catch (haltError) {
      control.admissionState.admissionHaltError = haltError;
    }
  }
};


export const runGovernedAffiliateAgentSupervisor = async (): Promise<void> => {
  const { role, workerId } = parseSupervisorArguments();
  const shutdownController = new AbortController();
  const configuration = createSupervisorConfiguration(
    role,
    workerId,
    shutdownController.signal,
  );
  const control: SupervisorControl = {
    signal: shutdownController.signal,
    admissionState: {
      isAdmissionHalted: false,
      admissionHaltError: null,
      persistHalt: () => configuration.gateway.haltAdmission(),
    },
    isStopping: false,
  };
  const stopped = createDeferred<void>();
  const stop = (): void => {
    control.isStopping = true;
    shutdownController.abort();
    stopped.resolve();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await restorePersistedAdmissionHalt(configuration, control);
    if (control.admissionState.isAdmissionHalted) {
      await stopped.promise;
      return;
    }
    await runSupervisorLoop(configuration, control);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
};

const isMainModule = typeof require === "function"
  ? require.main === module
  : basename(process.argv[1] ?? "") === "run-affiliate-agent-supervisor.ts";

if (isMainModule) {
  runGovernedAffiliateAgentSupervisor().catch((error) => {
    console.error(
      "[affiliate-agent-supervisor] fatal:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}
