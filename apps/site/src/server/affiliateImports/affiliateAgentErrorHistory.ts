import { z } from "zod";

import {
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS,
} from "./affiliateAgentCommandDiagnostics";
import {
  AFFILIATE_AGENT_ERROR_CODES,
  AFFILIATE_AGENT_ERROR_EVENT,
  AFFILIATE_AGENT_ERROR_LIMIT_EVENT,
  AFFILIATE_AGENT_ERROR_MAX_RECORD_BYTES,
  AFFILIATE_AGENT_ERROR_MAX_RECORDS,
  AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
  AFFILIATE_AGENT_ERROR_REASONS,
  REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES,
  affiliateAgentErrorCategoryFor,
  affiliateAgentErrorObservationSchema,
  type AffiliateAgentErrorCategory,
  type AffiliateAgentErrorObservation,
} from "./affiliateAgentErrorObservations";
import { AFFILIATE_AGENT_ROLES } from "./agentGatewayContracts";

export const AFFILIATE_AGENT_ERROR_HISTORY_SCHEMA_VERSION = 1 as const;
export const AFFILIATE_AGENT_ERROR_HISTORY_DEFAULT_MAX_RESULTS = 100 as const;
export const AFFILIATE_AGENT_ERROR_HISTORY_MAX_RESULTS = 500 as const;
export const AFFILIATE_AGENT_ERROR_HISTORY_MAX_SCOPE_JOBS = 2_000 as const;
export const AFFILIATE_AGENT_ERROR_HISTORY_GROUP_EXAMPLES = 3 as const;

export const AFFILIATE_AGENT_ERROR_HISTORY_EVENT_TYPES = [
  AFFILIATE_AGENT_ERROR_EVENT,
  AFFILIATE_AGENT_ERROR_LIMIT_EVENT,
  "CLAIM_INVOCATION_FAILED",
  "CLAIM_SCHEMA_CORRECTION_REQUIRED",
  "CLAIM_EXPIRED",
  "TERMINAL_EFFECT_FAILURE_RECORDED",
] as const;

export const AFFILIATE_AGENT_ERROR_HISTORY_RECEIPT_ONLY_EVENT_TYPE =
  "RECEIPT_ONLY_FAILURE" as const;

export type AffiliateAgentErrorHistoryEventType =
  typeof AFFILIATE_AGENT_ERROR_HISTORY_EVENT_TYPES[number];

export type AffiliateAgentErrorHistoryRowEventType =
  | AffiliateAgentErrorHistoryEventType
  | typeof AFFILIATE_AGENT_ERROR_HISTORY_RECEIPT_ONLY_EVENT_TYPE;

const INVOCATION_FAILURE_CODES = [
  "MALFORMED_OUTPUT",
  "STALE_GENERATION",
  "PROCESS_CRASH",
  "TIMEOUT",
  "TERMINAL_SUBMISSION_FAILURE",
  "SCHEMA_CORRECTIONS_EXHAUSTED",
] as const;

type InvocationFailureCode = typeof INVOCATION_FAILURE_CODES[number];

const JOB_STATUSES = [
  "QUEUED",
  "CLAIMED",
  "RETRY_WAIT",
  "COMPLETED",
  "PIPELINE_BLOCKED",
  "RECONCILIATION_REQUIRED",
] as const;
const CLAIM_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "REVOKED",
  "RECONCILIATION_REQUIRED",
] as const;
const RECEIPT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "UNKNOWN"] as const;
const RECEIPT_OPERATION_KINDS = [
  "CLAIM",
  "HEARTBEAT",
  "READ_ARTIFACT",
  "EXECUTE_COMMAND",
  "SUBMIT_RESULT",
  "RECORD_FAILURE",
  "RECORD_ERROR",
  "TERMINAL_EFFECT",
] as const;
const COMMAND_NAMES = AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS;
const ACTOR_KINDS = [
  "AGENT_INVOCATION",
  "AGENT_WORKER",
  "GATEWAY_RECONCILER",
  "SYSTEM",
  "TOOL_BRIDGE",
] as const;
const RETENTION_CLASSES = ["INDEFINITE", "DIAGNOSTIC"] as const;
const TERMINAL_EFFECT_FAILURE_CODE = "REVIEWER_TERMINAL_EFFECT_FAILED" as const;
const TERMINAL_EFFECT_FAILURE_STAGES = ["EXECUTE", "RECOVER"] as const;
type TerminalEffectFailureReasonCode =
  typeof REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES[number];
const RECEIPT_ERROR_CODES = ["ARTIFACT_READ_INTERRUPTED"] as const;

const ORIGINS = ["GATEWAY", "TOOL_BRIDGE"] as const;

const HISTORY_ERROR_CODES = [
  ...AFFILIATE_AGENT_ERROR_CODES,
  ...INVOCATION_FAILURE_CODES,
  ...RECEIPT_ERROR_CODES,
  "HISTORY_LIMIT_REACHED",
  "HISTORY_PAYLOAD_INVALID",
] as const;
const HISTORY_REASON_CODES = [
  ...AFFILIATE_AGENT_ERROR_REASONS,
  ...REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES,
  "INVOCATION_FAILURE",
  "SCHEMA_CORRECTION_REQUIRED",
  "CLAIM_LEASE_EXPIRED",
  "HISTORY_LIMIT_REACHED",
  "RECEIPT_FAILURE",
  "HISTORY_PAYLOAD_INVALID",
] as const;

type HistoryErrorCode = typeof HISTORY_ERROR_CODES[number];
type HistoryReasonCode = typeof HISTORY_REASON_CODES[number];
type HistoryOrigin = typeof ORIGINS[number];
type HistorySourceKind =
  | "RECORDED_OBSERVATION"
  | "STORAGE_LIMIT"
  | "INVOCATION_FAILURE"
  | "SCHEMA_FAILURE"
  | "CLAIM_LEASE_FAILURE"
  | "TERMINAL_EFFECT_FAILURE"
  | "RECEIPT_FAILURE"
  | "MALFORMED_HISTORY";

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T => (
  typeof value === "string" && values.includes(value as T)
);

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const identifierSchema = z
  .string()
  .trim()
  .min(1, "The identifier must not be empty.")
  .max(200, "The identifier is too long.")
  .regex(
    identifierPattern,
    "The identifier contains unsupported characters.",
  );

const maxResultsSchema = z
  .number()
  .int("The maximum result count must be an integer.")
  .min(1, "The maximum result count must be positive.")
  .max(AFFILIATE_AGENT_ERROR_HISTORY_MAX_RESULTS);

export const affiliateAgentErrorHistoryFiltersSchema = z
  .object({
    claimId: identifierSchema.nullable().optional(),
    jobId: identifierSchema.nullable().optional(),
    sourceId: identifierSchema.nullable().optional(),
    maxResults: maxResultsSchema.optional(),
  })
  .strict();

export type AffiliateAgentErrorHistoryFilters = Readonly<{
  claimId?: string | null;
  jobId?: string | null;
  sourceId?: string | null;
  maxResults?: number;
}>;

export type AffiliateAgentErrorHistoryNormalizedFilters = Readonly<{
  claimId: string | null;
  jobId: string | null;
  sourceId: string | null;
  maxResults: number;
}>;

export class AffiliateAgentErrorHistoryInputError extends Error {
  readonly name = "AffiliateAgentErrorHistoryInputError";
}

export const parseAffiliateAgentErrorHistoryFilters = (
  input: unknown,
): AffiliateAgentErrorHistoryNormalizedFilters => {
  const parsed = affiliateAgentErrorHistoryFiltersSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new AffiliateAgentErrorHistoryInputError(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }
  return {
    claimId: parsed.data.claimId ?? null,
    jobId: parsed.data.jobId ?? null,
    sourceId: parsed.data.sourceId ?? null,
    maxResults: parsed.data.maxResults ?? AFFILIATE_AGENT_ERROR_HISTORY_DEFAULT_MAX_RESULTS,
  };
};

const invocationFailureCodeSet = new Set<string>(INVOCATION_FAILURE_CODES);
const historyErrorCodeSet = new Set<string>(HISTORY_ERROR_CODES);

const errorEventPayloadSchema = z
  .object({
    schemaVersion: z.literal(AFFILIATE_AGENT_ERROR_HISTORY_SCHEMA_VERSION),
    origin: z.enum(ORIGINS),
    category: z.enum(["INPUT", "VALIDATION", "AUTHORITY", "EVIDENCE", "PLATFORM"]),
    observation: affiliateAgentErrorObservationSchema,
  })
  .strict();

const limitEventPayloadSchema = z
  .object({
    schemaVersion: z.literal(AFFILIATE_AGENT_ERROR_HISTORY_SCHEMA_VERSION),
    maxRecords: z.literal(AFFILIATE_AGENT_ERROR_MAX_RECORDS),
    maxTotalBytes: z.literal(AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES),
    recordedCount: z.number().int().min(0).max(AFFILIATE_AGENT_ERROR_MAX_RECORDS),
    recordedBytes: z.number().int().min(0).max(AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.recordedCount === 0 || value.recordedBytes === 0) {
      context.addIssue({
        code: "custom",
        message: "Recorded limit counts and bytes must both be positive.",
      });
    }
  });

type JsonRecord = Record<string, unknown>;

const recordValue = (value: unknown): JsonRecord | null => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

const boundedInteger = (value: unknown, maximum: number): number | null => (
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : null
);

const safeIdentifier = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0
    && normalized.length <= 200
    && identifierPattern.test(normalized)
    ? normalized
    : null;
};

const safeHash = (value: unknown): string | null => (
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null
);

const safeCode = <T extends string>(values: readonly T[], value: unknown): T | null => (
  isOneOf(values, value) ? value : null
);

const safeStatus = <T extends string>(values: readonly T[], value: unknown): T | "UNKNOWN" => (
  safeCode(values, value) ?? "UNKNOWN"
);

const safeDate = (value: unknown): string | null => {
  const date = value instanceof Date
    ? value
    : typeof value === "string" && value.length <= 100
      ? new Date(value)
      : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

const safeUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const safeRole = (value: unknown): typeof AFFILIATE_AGENT_ROLES[number] | "UNKNOWN" => (
  safeCode(AFFILIATE_AGENT_ROLES, value) ?? "UNKNOWN"
);


const safeHistoryErrorCode = (value: unknown): HistoryErrorCode | null => (
  safeCode(HISTORY_ERROR_CODES, value)
);

const safeActorKind = (value: unknown): typeof ACTOR_KINDS[number] | "UNKNOWN" => (
  safeCode(ACTOR_KINDS, value) ?? "UNKNOWN"
);

const safeReceiptOperationKind = (
  value: unknown,
): typeof RECEIPT_OPERATION_KINDS[number] | "UNKNOWN" => (
  safeCode(RECEIPT_OPERATION_KINDS, value) ?? "UNKNOWN"
);
const safeCommandName = (value: unknown): typeof COMMAND_NAMES[number] | null => (
  safeCode(COMMAND_NAMES, value)
);

const safeRetentionClass = (value: unknown): typeof RETENTION_CLASSES[number] | "UNKNOWN" => (
  safeCode(RETENTION_CLASSES, value) ?? "UNKNOWN"
);


const categoryForInvocationFailure = (
  code: InvocationFailureCode | null,
): AffiliateAgentErrorCategory => {
  if (code === "STALE_GENERATION") return "AUTHORITY";
  if (code === "MALFORMED_OUTPUT" || code === "SCHEMA_CORRECTIONS_EXHAUSTED") return "VALIDATION";
  return "PLATFORM";
};
const receiptCategoryCodeFor = (
  code: HistoryErrorCode,
): AffiliateAgentErrorObservation["errorCode"] => {
  if (code === "ARTIFACT_READ_INTERRUPTED") return "UNCLASSIFIED_ERROR";
  return isOneOf(AFFILIATE_AGENT_ERROR_CODES, code) ? code : "INTERNAL_ERROR";
};

const categoryForReceiptError = (
  code: HistoryErrorCode,
): AffiliateAgentErrorCategory => affiliateAgentErrorCategoryFor({
  schemaVersion: 1,
  tool: "UNKNOWN",
  stage: "GATEWAY",
  command: "UNKNOWN",
  errorCode: receiptCategoryCodeFor(code),
  reasonCode: "UNKNOWN",
  issueCodes: [],
  issuePaths: [],
  isRetryable: false,
});


const errorClassification = (input: Readonly<{
  category: AffiliateAgentErrorCategory;
  errorCode: HistoryErrorCode;
  reasonCodes: readonly HistoryReasonCode[];
  issueCodes?: readonly string[];
  issuePaths?: readonly string[];
  origin: HistoryOrigin;
  sourceKind: HistorySourceKind;
}>): AffiliateAgentErrorHistoryClassification => ({
  category: input.category,
  errorCode: input.errorCode,
  reasonCodes: [...input.reasonCodes],
  issueCodes: [...(input.issueCodes ?? [])],
  issuePaths: [...(input.issuePaths ?? [])],
  origin: input.origin,
  sourceKind: input.sourceKind,
});

export type AffiliateAgentErrorHistoryClassification = Readonly<{
  category: AffiliateAgentErrorCategory;
  errorCode: HistoryErrorCode;
  reasonCodes: readonly HistoryReasonCode[];
  issueCodes: readonly string[];
  issuePaths: readonly string[];
  origin: HistoryOrigin;
  sourceKind: HistorySourceKind;
}>;

type RawGatewayEvent = Readonly<{
  id?: unknown;
  createdAt?: unknown;
  eventKey?: unknown;
  jobId?: unknown;
  claimId?: unknown;
  receiptId?: unknown;
  sequence?: unknown;
  eventType?: unknown;
  actorKind?: unknown;
  actorId?: unknown;
  role?: unknown;
  requestHash?: unknown;
  outputHash?: unknown;
  reasonCodes?: unknown;
  payload?: unknown;
  retentionClass?: unknown;
  retentionDeadline?: unknown;
}>;

type RawGatewayJob = Readonly<{
  id?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  queue?: unknown;
  lane?: unknown;
  role?: unknown;
  subjectType?: unknown;
  subjectId?: unknown;
  supplySourceId?: unknown;
  expectedLifecycleGeneration?: unknown;
  status?: unknown;
  claimGeneration?: unknown;
  invocationFailureCount?: unknown;
  lastInvocationFailedAt?: unknown;
  pipelineBlockedAt?: unknown;
  terminalDisposition?: unknown;
  terminalReceiptId?: unknown;
  finishedAt?: unknown;
}>;

type RawGatewayClaim = Readonly<{
  id?: unknown;
  jobId?: unknown;
  parentClaimId?: unknown;
  claimGeneration?: unknown;
  lifecycleGeneration?: unknown;
  queue?: unknown;
  lane?: unknown;
  role?: unknown;
  workerId?: unknown;
  invocationId?: unknown;
  status?: unknown;
  claimedAt?: unknown;
  endedAt?: unknown;
  terminalReceiptId?: unknown;
  safeFailureCode?: unknown;
  diagnosticRetainUntil?: unknown;
  deploymentContractVersion?: unknown;
  deploymentContractHash?: unknown;
  roleContractVersion?: unknown;
  roleContractHash?: unknown;
  promptTemplateVersion?: unknown;
  promptTemplateHash?: unknown;
  supplyContractVersion?: unknown;
  supplyContractHash?: unknown;
}>;

type RawGatewayReceipt = Readonly<{
  id?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  claimId?: unknown;
  jobId?: unknown;
  claimGeneration?: unknown;
  operationKind?: unknown;
  commandName?: unknown;
  status?: unknown;
  safeErrorCode?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  retentionClass?: unknown;
  retentionDeadline?: unknown;
}>;

type RawSupplySource = Readonly<{
  id?: unknown;
  liveSourceId?: unknown;
  canonicalUrl?: unknown;
  operatorDomain?: unknown;
  pathKey?: unknown;
  targetKind?: unknown;
  lifecycleGeneration?: unknown;
  derivedStage?: unknown;
  derivedOutcome?: unknown;
  freshnessStatus?: unknown;
}>;

type RawLegacySource = Readonly<{
  id?: unknown;
  supplySourceId?: unknown;
  sourceKey?: unknown;
  baseUrl?: unknown;
  listUrl?: unknown;
}>;

export type AffiliateAgentErrorHistorySource = Readonly<{
  id: string | null;
  canonicalUrl: string | null;
  links: readonly string[];
  targetKind: string | null;
  stage: string | null;
  outcome: string | null;
  freshnessStatus: string | null;
  lifecycleGeneration: number | null;
  legacySourceId: string | null;
  legacySourceKey: string | null;
}>;

export type AffiliateAgentErrorHistoryContractIdentity = Readonly<{
  deployment: Readonly<{ version: number | null; hash: string | null }>;
  role: Readonly<{ version: number | null; hash: string | null }>;
  prompt: Readonly<{ version: number | null; hash: string | null }>;
  supply: Readonly<{ version: number | null; hash: string | null }>;
}>;

export type AffiliateAgentErrorHistoryReceipt = Readonly<{
  id: string | null;
  operationKind: typeof RECEIPT_OPERATION_KINDS[number] | "UNKNOWN";
  commandName: string | null;
  status: typeof RECEIPT_STATUSES[number] | "UNKNOWN";
  safeErrorCode: HistoryErrorCode | null;
  startedAt: string | null;
  completedAt: string | null;
  retentionClass: typeof RETENTION_CLASSES[number] | "UNKNOWN";
  retentionDeadline: string | null;
}>;

export type AffiliateAgentErrorHistoryRow = Readonly<{
  eventId: string | null;
  eventKey: string | null;
  eventType: AffiliateAgentErrorHistoryRowEventType;
  recordKind: "EVENT" | "RECEIPT";
  createdAt: string | null;
  sequence: number | null;
  actorKind: typeof ACTOR_KINDS[number] | "UNKNOWN";
  actorId: string | null;
  classification: AffiliateAgentErrorHistoryClassification;
  observation: AffiliateAgentErrorObservation | null;
  limit: Readonly<{
    maxRecords: number | null;
    maxTotalBytes: number | null;
    recordedCount: number | null;
    recordedBytes: number | null;
  }> | null;
  claim: Readonly<{
    id: string | null;
    generation: number | null;
    lifecycleGeneration: number | null;
    role: typeof AFFILIATE_AGENT_ROLES[number] | "UNKNOWN";
    workerId: string | null;
    invocationId: string | null;
    status: typeof CLAIM_STATUSES[number] | "UNKNOWN";
    claimedAt: string | null;
    endedAt: string | null;
    terminalReceiptId: string | null;
    diagnosticRetainUntil: string | null;
  }> | null;
  job: Readonly<{
    id: string | null;
    role: typeof AFFILIATE_AGENT_ROLES[number] | "UNKNOWN";
    subjectType: string | null;
    subjectId: string | null;
    expectedLifecycleGeneration: number | null;
    status: typeof JOB_STATUSES[number] | "UNKNOWN";
    queue: string | null;
    lane: string | null;
    supplySourceId: string | null;
    claimGeneration: number | null;
    invocationFailureCount: number | null;
    terminalDisposition: string | null;
    terminalReceiptId: string | null;
    finishedAt: string | null;
  }> | null;
  contract: AffiliateAgentErrorHistoryContractIdentity | null;
  source: AffiliateAgentErrorHistorySource | null;
  receipt: AffiliateAgentErrorHistoryReceipt | null;
  finalReceipt: AffiliateAgentErrorHistoryReceipt | null;
  retention: Readonly<{
    eventClass: typeof RETENTION_CLASSES[number] | "UNKNOWN";
    eventDeadline: string | null;
    claimDeadline: string | null;
    receiptDeadline: string | null;
  }>;
  markers: Readonly<{
    malformedPayload: boolean;
    diagnosticRecordingReceipt: boolean;
    receiptOnly: boolean;
    recoveryNotInferred: true;
  }>;
}>;

export type AffiliateAgentErrorHistoryRecordReference = Readonly<{
  kind: "EVENT" | "RECEIPT";
  id: string;
}>;
export type AffiliateAgentErrorHistoryGroup = Readonly<{
  signature: string;
  recordCount: number;
  category: AffiliateAgentErrorCategory;
  errorCode: HistoryErrorCode;
  reasonCodes: readonly HistoryReasonCode[];
  issueCodes: readonly string[];
  issuePaths: readonly string[];
  origins: readonly HistoryOrigin[];
  recordReferences: readonly AffiliateAgentErrorHistoryRecordReference[];
}>;

export type AffiliateAgentErrorHistoryReport = Readonly<{
  schemaVersion: typeof AFFILIATE_AGENT_ERROR_HISTORY_SCHEMA_VERSION;
  readOnly: true;
  recoveryAssessment: "NOT_INFERRED";
  filters: Readonly<{
    claimId: string | null;
    jobId: string | null;
    sourceId: string | null;
    maxResults: number;
  }>;
  rows: readonly AffiliateAgentErrorHistoryRow[];
  groups: readonly AffiliateAgentErrorHistoryGroup[];
  limits: Readonly<{
    maxResults: number;
    returnedRows: number;
    resultTruncated: boolean;
    scopeJobLimit: number;
    scopeTruncated: boolean;
    storage: Readonly<{
      maxRecordsPerClaim: number;
      maxRecordBytes: number;
      maxTotalBytes: number;
    }>;
    limitMarkerCount: number;
    limitMarkerEventIds: readonly (string | null)[];
  }>;
}>;

export type AffiliateAgentErrorHistoryReadClient = Readonly<{
  affiliateAgentGatewayEvents: Readonly<{ findMany: (args: unknown) => Promise<readonly unknown[]> }>;
  affiliateAgentGatewayJobs: Readonly<{ findMany: (args: unknown) => Promise<readonly unknown[]> }>;
  affiliateAgentGatewayClaims: Readonly<{ findMany: (args: unknown) => Promise<readonly unknown[]> }>;
  affiliateAgentGatewayOperationReceipts: Readonly<{ findMany: (args: unknown) => Promise<readonly unknown[]> }>;
  affiliateSupplySources: Readonly<{ findMany: (args: unknown) => Promise<readonly unknown[]> }>;
  affiliateScrapeSources: Readonly<{ findMany: (args: unknown) => Promise<readonly unknown[]> }>;
}>;

export type AffiliateAgentErrorHistoryReadOnlyClient = AffiliateAgentErrorHistoryReadClient & Readonly<{
  $executeRawUnsafe?: (query: string, ...values: readonly unknown[]) => Promise<unknown>;
}>;

const rowSelect = {
  id: true,
  createdAt: true,
  eventKey: true,
  jobId: true,
  claimId: true,
  receiptId: true,
  sequence: true,
  eventType: true,
  actorKind: true,
  actorId: true,
  role: true,
  requestHash: true,
  outputHash: true,
  reasonCodes: true,
  payload: true,
  retentionClass: true,
  retentionDeadline: true,
} as const;

const jobSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  queue: true,
  lane: true,
  role: true,
  subjectType: true,
  subjectId: true,
  supplySourceId: true,
  expectedLifecycleGeneration: true,
  status: true,
  claimGeneration: true,
  invocationFailureCount: true,
  lastInvocationFailedAt: true,
  pipelineBlockedAt: true,
  terminalDisposition: true,
  terminalReceiptId: true,
  finishedAt: true,
} as const;

const claimSelect = {
  id: true,
  jobId: true,
  parentClaimId: true,
  claimGeneration: true,
  lifecycleGeneration: true,
  queue: true,
  lane: true,
  role: true,
  workerId: true,
  invocationId: true,
  status: true,
  claimedAt: true,
  endedAt: true,
  terminalReceiptId: true,
  safeFailureCode: true,
  diagnosticRetainUntil: true,
  deploymentContractVersion: true,
  deploymentContractHash: true,
  roleContractVersion: true,
  roleContractHash: true,
  promptTemplateVersion: true,
  promptTemplateHash: true,
  supplyContractVersion: true,
  supplyContractHash: true,
} as const;

const receiptSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  claimId: true,
  jobId: true,
  claimGeneration: true,
  operationKind: true,
  commandName: true,
  status: true,
  safeErrorCode: true,
  startedAt: true,
  completedAt: true,
  retentionClass: true,
  retentionDeadline: true,
} as const;

const supplySourceSelect = {
  id: true,
  liveSourceId: true,
  canonicalUrl: true,
  operatorDomain: true,
  pathKey: true,
  targetKind: true,
  lifecycleGeneration: true,
  derivedStage: true,
  derivedOutcome: true,
  freshnessStatus: true,
} as const;

const legacySourceSelect = {
  id: true,
  supplySourceId: true,
  sourceKey: true,
  baseUrl: true,
  listUrl: true,
} as const;


type ParsedAffiliateAgentErrorEvent = Readonly<{
  classification: AffiliateAgentErrorHistoryClassification;
  observation: AffiliateAgentErrorObservation | null;
  limit: AffiliateAgentErrorHistoryRow["limit"];
  malformedPayload: boolean;
}>;

type ParsedTerminalEffectReasonCodes = Readonly<{
  reasonCodes: readonly HistoryReasonCode[];
  malformedPayload: boolean;
}>;

const terminalEffectReasonCodeSet = new Set<string>(
  REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES,
);

const terminalEffectReasonCodesFor = (
  payload: unknown,
  storedReasonCodes: unknown,
): ParsedTerminalEffectReasonCodes => {
  const collected: TerminalEffectFailureReasonCode[] = [];
  let malformedPayload = false;
  const collect = (value: unknown): void => {
    if (!Array.isArray(value)) {
      malformedPayload = true;
      return;
    }
    if (value.length === 0 || value.length > REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES.length) {
      malformedPayload = true;
    }
    for (const reasonCode of value.slice(0, REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES.length)) {
      if (terminalEffectReasonCodeSet.has(reasonCode)) {
        collected.push(reasonCode as TerminalEffectFailureReasonCode);
      } else {
        malformedPayload = true;
      }
    }
  };
  const payloadRecord = recordValue(payload);
  if (!payloadRecord) {
    malformedPayload = true;
  } else {
    if (
      payloadRecord.code !== TERMINAL_EFFECT_FAILURE_CODE
      || Object.keys(payloadRecord).some((key) => !["code", "diagnostics"].includes(key))
    ) {
      malformedPayload = true;
    }
    const diagnostics = payloadRecord.diagnostics;
    if (!Array.isArray(diagnostics)) {
      malformedPayload = true;
    } else {
      if (diagnostics.length === 0 || diagnostics.length > 2) malformedPayload = true;
      for (const diagnostic of diagnostics.slice(0, 2)) {
        const diagnosticRecord = recordValue(diagnostic);
        if (
          !diagnosticRecord
          || diagnosticRecord.code !== TERMINAL_EFFECT_FAILURE_CODE
          || !isOneOf(TERMINAL_EFFECT_FAILURE_STAGES, diagnosticRecord.stage)
          || Object.keys(diagnosticRecord).some(
            (key) => !["code", "stage", "reasonCodes"].includes(key),
          )
        ) {
          malformedPayload = true;
          continue;
        }
        collect(diagnosticRecord.reasonCodes);
      }
    }
  }
  collect(storedReasonCodes);
  const reasonCodes = [...new Set(collected)].sort() as TerminalEffectFailureReasonCode[];
  return {
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["HISTORY_PAYLOAD_INVALID"],
    malformedPayload: malformedPayload || reasonCodes.length === 0,
  };
};

const parseErrorEvent = (
  eventType: AffiliateAgentErrorHistoryEventType,
  payload: unknown,
  storedReasonCodes?: unknown,
): ParsedAffiliateAgentErrorEvent => {
  if (eventType === AFFILIATE_AGENT_ERROR_EVENT) {
    const parsed = errorEventPayloadSchema.safeParse(payload);
    if (parsed.success) {
      const observation = parsed.data.observation;
      return {
        classification: errorClassification({
          category: affiliateAgentErrorCategoryFor(observation),
          errorCode: observation.errorCode,
          reasonCodes: [observation.reasonCode],
          issueCodes: observation.issueCodes,
          issuePaths: observation.issuePaths,
          origin: parsed.data.origin,
          sourceKind: "RECORDED_OBSERVATION",
        }),
        observation,
        limit: null,
        malformedPayload: false,
      };
    }
    return {
      classification: errorClassification({
        category: "PLATFORM",
        errorCode: "HISTORY_PAYLOAD_INVALID",
        reasonCodes: ["HISTORY_PAYLOAD_INVALID"],
        origin: "GATEWAY",
        sourceKind: "MALFORMED_HISTORY",
      }),
      observation: null,
      limit: null,
      malformedPayload: true,
    };
  }

  if (eventType === AFFILIATE_AGENT_ERROR_LIMIT_EVENT) {
    const parsed = limitEventPayloadSchema.safeParse(payload);
    return {
      classification: errorClassification({
        category: "PLATFORM",
        errorCode: parsed.success ? "HISTORY_LIMIT_REACHED" : "HISTORY_PAYLOAD_INVALID",
        reasonCodes: [parsed.success ? "HISTORY_LIMIT_REACHED" : "HISTORY_PAYLOAD_INVALID"],
        origin: "GATEWAY",
        sourceKind: "STORAGE_LIMIT",
      }),
      observation: null,
      limit: parsed.success
        ? {
            maxRecords: parsed.data.maxRecords,
            maxTotalBytes: parsed.data.maxTotalBytes,
            recordedCount: parsed.data.recordedCount,
            recordedBytes: parsed.data.recordedBytes,
          }
        : {
            maxRecords: null,
            maxTotalBytes: null,
            recordedCount: null,
            recordedBytes: null,
          },
      malformedPayload: !parsed.success,
    };
  }

  if (eventType === "TERMINAL_EFFECT_FAILURE_RECORDED") {
    const parsed = terminalEffectReasonCodesFor(payload, storedReasonCodes);
    return {
      classification: errorClassification({
        category: "PLATFORM",
        errorCode: "PARTIAL_COMMAND_UNRESOLVED",
        reasonCodes: parsed.reasonCodes,
        origin: "GATEWAY",
        sourceKind: "TERMINAL_EFFECT_FAILURE",
      }),
      observation: null,
      limit: null,
      malformedPayload: parsed.malformedPayload,
    };
  }

  if (eventType === "CLAIM_SCHEMA_CORRECTION_REQUIRED") {
    return {
      classification: errorClassification({
        category: "VALIDATION",
        errorCode: "RESULT_SCHEMA_INVALID",
        reasonCodes: ["SCHEMA_CORRECTION_REQUIRED"],
        origin: "GATEWAY",
        sourceKind: "SCHEMA_FAILURE",
      }),
      observation: null,
      limit: null,
      malformedPayload: false,
    };
  }

  if (eventType === "CLAIM_EXPIRED") {
    return {
      classification: errorClassification({
        category: "AUTHORITY",
        errorCode: "LEASE_EXPIRED",
        reasonCodes: ["CLAIM_LEASE_EXPIRED"],
        origin: "GATEWAY",
        sourceKind: "CLAIM_LEASE_FAILURE",
      }),
      observation: null,
      limit: null,
      malformedPayload: false,
    };
  }

  const eventRecord = recordValue(payload);
  const failureCode = safeHistoryErrorCode(
    Array.isArray(eventRecord?.failureCode)
      ? eventRecord?.failureCode[0]
      : eventRecord?.failureCode,
  ) ?? safeHistoryErrorCode(eventRecord?.code);
  const payloadReasonCodes = Array.isArray(eventRecord?.reasonCodes)
    ? eventRecord.reasonCodes
    : [];
  const eventReason = payloadReasonCodes
    .map((value) => safeHistoryErrorCode(value))
    .find((value): value is HistoryErrorCode => value !== null);
  const invocationCode = (failureCode && invocationFailureCodeSet.has(failureCode)
    ? failureCode
    : eventReason && invocationFailureCodeSet.has(eventReason)
      ? eventReason
      : null) as InvocationFailureCode | null;
  const normalizedCode = invocationCode ?? "HISTORY_PAYLOAD_INVALID";
  return {
    classification: errorClassification({
      category: categoryForInvocationFailure(invocationCode),
      errorCode: normalizedCode,
      reasonCodes: [invocationCode ? "INVOCATION_FAILURE" : "HISTORY_PAYLOAD_INVALID"],
      origin: "GATEWAY",
      sourceKind: invocationCode ? "INVOCATION_FAILURE" : "MALFORMED_HISTORY",
    }),
    observation: null,
    limit: null,
    malformedPayload: invocationCode === null,
  };
};

const parseReasonCode = (value: unknown): HistoryErrorCode | null => {
  const code = safeHistoryErrorCode(value);
  return code && historyErrorCodeSet.has(code) ? code : null;
};

const eventClassificationFor = (
  event: RawGatewayEvent,
  eventType: AffiliateAgentErrorHistoryEventType,
): ParsedAffiliateAgentErrorEvent => {
  const parsed = parseErrorEvent(eventType, event.payload, event.reasonCodes);
  if (eventType !== "CLAIM_INVOCATION_FAILED") return parsed;
  const eventRecord = recordValue(event.payload);
  const reasonCodes = Array.isArray(event.reasonCodes) ? event.reasonCodes : [];
  const finiteEventReason = reasonCodes
    .map(parseReasonCode)
    .find((value): value is HistoryErrorCode => value !== null);
  const finitePayloadReason = parseReasonCode(eventRecord?.failureCode ?? eventRecord?.code);
  const failure = finitePayloadReason ?? finiteEventReason;
  if (!failure || !invocationFailureCodeSet.has(failure)) return parsed;
  const invocationCode = failure as InvocationFailureCode;
  return {
    ...parsed,
    classification: errorClassification({
      category: categoryForInvocationFailure(invocationCode),
      errorCode: invocationCode,
      reasonCodes: ["INVOCATION_FAILURE"],
      origin: "GATEWAY",
      sourceKind: "INVOCATION_FAILURE",
    }),
    malformedPayload: false,
  };
};

const contractIdentityFor = (
  claim: RawGatewayClaim,
): AffiliateAgentErrorHistoryContractIdentity => ({
  deployment: {
    version: boundedInteger(claim.deploymentContractVersion, 1_000_000),
    hash: safeHash(claim.deploymentContractHash),
  },
  role: {
    version: boundedInteger(claim.roleContractVersion, 1_000_000),
    hash: safeHash(claim.roleContractHash),
  },
  prompt: {
    version: boundedInteger(claim.promptTemplateVersion, 1_000_000),
    hash: safeHash(claim.promptTemplateHash),
  },
  supply: {
    version: boundedInteger(claim.supplyContractVersion, 1_000_000),
    hash: safeHash(claim.supplyContractHash),
  },
});

const sourceFor = (
  supplySource: RawSupplySource | null,
  legacySource: RawLegacySource | null,
  fallbackId: string | null,
): AffiliateAgentErrorHistorySource | null => {
  if (!supplySource && !legacySource && !fallbackId) return null;
  const canonicalUrl = safeUrl(supplySource?.canonicalUrl);
  const legacyBaseUrl = safeUrl(legacySource?.baseUrl);
  const legacyListUrl = safeUrl(legacySource?.listUrl);
  return {
    id: safeIdentifier(supplySource?.id ?? legacySource?.supplySourceId ?? fallbackId),
    canonicalUrl,
    links: [...new Set([canonicalUrl, legacyBaseUrl, legacyListUrl].filter(
      (value): value is string => value !== null,
    ))],
    targetKind: safeIdentifier(supplySource?.targetKind),
    stage: safeIdentifier(supplySource?.derivedStage),
    outcome: safeIdentifier(supplySource?.derivedOutcome),
    freshnessStatus: safeIdentifier(supplySource?.freshnessStatus),
    lifecycleGeneration: boundedInteger(supplySource?.lifecycleGeneration, 1_000_000),
    legacySourceId: safeIdentifier(legacySource?.id),
    legacySourceKey: safeIdentifier(legacySource?.sourceKey),
  };
};

const receiptFor = (value: RawGatewayReceipt | null): AffiliateAgentErrorHistoryReceipt | null => {
  if (!value) return null;
  return {
    id: safeIdentifier(value.id),
    operationKind: safeReceiptOperationKind(value.operationKind),
    commandName: safeCommandName(value.commandName),
    status: safeStatus(RECEIPT_STATUSES, value.status),
    safeErrorCode: safeHistoryErrorCode(value.safeErrorCode),
    startedAt: safeDate(value.startedAt),
    completedAt: safeDate(value.completedAt),
    retentionClass: safeRetentionClass(value.retentionClass),
    retentionDeadline: safeDate(value.retentionDeadline),
  };
};

const recordReferenceFor = (
  row: AffiliateAgentErrorHistoryRow,
): AffiliateAgentErrorHistoryRecordReference | null => {
  const id = row.recordKind === "EVENT" ? row.eventId : row.receipt?.id ?? null;
  return id ? { kind: row.recordKind, id } : null;
};
const groupSignatureFor = (
  classification: AffiliateAgentErrorHistoryClassification,
): string => [
  classification.origin,
  classification.category,
  classification.errorCode,
  classification.reasonCodes.join(","),
  classification.issueCodes.join(","),
  classification.issuePaths.join(","),
].join("|");

const buildGroups = (
  rows: readonly AffiliateAgentErrorHistoryRow[],
): AffiliateAgentErrorHistoryGroup[] => {
  const groups = new Map<string, {
    classification: AffiliateAgentErrorHistoryClassification;
    recordCount: number;
    recordReferences: AffiliateAgentErrorHistoryRecordReference[];
  }>();
  for (const row of rows) {
    const signature = groupSignatureFor(row.classification);
    const reference = recordReferenceFor(row);
    const current = groups.get(signature);
    if (current) {
      current.recordCount += 1;
      if (reference && current.recordReferences.length < AFFILIATE_AGENT_ERROR_HISTORY_GROUP_EXAMPLES) {
        current.recordReferences.push(reference);
      }
      continue;
    }
    groups.set(signature, {
      classification: row.classification,
      recordCount: 1,
      recordReferences: reference ? [reference] : [],
    });
  }
  return [...groups.entries()]
    .map(([signature, value]) => ({
      signature,
      recordCount: value.recordCount,
      category: value.classification.category,
      errorCode: value.classification.errorCode,
      reasonCodes: [...value.classification.reasonCodes],
      issueCodes: [...value.classification.issueCodes],
      issuePaths: [...value.classification.issuePaths],
      origins: [value.classification.origin],
      recordReferences: [...value.recordReferences],
    }))
    .sort((left, right) => right.recordCount - left.recordCount || left.signature.localeCompare(right.signature));
};

type JobHistoryLookup = Readonly<{
  view: NonNullable<AffiliateAgentErrorHistoryRow["job"]>;
  supplySourceId: string | null;
  terminalReceiptId: string | null;
}>;

type ClaimHistoryLookup = Readonly<{
  view: NonNullable<AffiliateAgentErrorHistoryRow["claim"]>;
  contract: AffiliateAgentErrorHistoryContractIdentity;
  terminalReceiptId: string | null;
}>;

const claimForEvent = (
  claimsById: ReadonlyMap<string, ClaimHistoryLookup>,
  claimsByJobId: ReadonlyMap<string, ClaimHistoryLookup>,
  event: RawGatewayEvent,
): ClaimHistoryLookup | null => {
  const claimId = safeIdentifier(event.claimId);
  if (claimId) return claimsById.get(claimId) ?? null;
  const jobId = safeIdentifier(event.jobId);
  return jobId ? claimsByJobId.get(jobId) ?? null : null;
};

const claimViewFor = (
  claim: RawGatewayClaim,
): NonNullable<AffiliateAgentErrorHistoryRow["claim"]> => ({
  id: safeIdentifier(claim.id),
  generation: boundedInteger(claim.claimGeneration, 1_000_000),
  lifecycleGeneration: boundedInteger(claim.lifecycleGeneration, 1_000_000),
  role: safeRole(claim.role),
  workerId: safeIdentifier(claim.workerId),
  invocationId: safeIdentifier(claim.invocationId),
  status: safeStatus(CLAIM_STATUSES, claim.status),
  claimedAt: safeDate(claim.claimedAt),
  endedAt: safeDate(claim.endedAt),
  terminalReceiptId: safeIdentifier(claim.terminalReceiptId),
  diagnosticRetainUntil: safeDate(claim.diagnosticRetainUntil),
});

const jobViewFor = (
  job: RawGatewayJob,
): NonNullable<AffiliateAgentErrorHistoryRow["job"]> => ({
  id: safeIdentifier(job.id),
  role: safeRole(job.role),
  subjectType: safeIdentifier(job.subjectType),
  subjectId: safeIdentifier(job.subjectId),
  expectedLifecycleGeneration: boundedInteger(job.expectedLifecycleGeneration, 1_000_000),
  status: safeStatus(JOB_STATUSES, job.status),
  queue: safeIdentifier(job.queue),
  lane: safeIdentifier(job.lane),
  supplySourceId: safeIdentifier(job.supplySourceId),
  claimGeneration: boundedInteger(job.claimGeneration, 1_000_000),
  invocationFailureCount: boundedInteger(job.invocationFailureCount, 100),
  terminalDisposition: safeIdentifier(job.terminalDisposition),
  terminalReceiptId: safeIdentifier(job.terminalReceiptId),
  finishedAt: safeDate(job.finishedAt),
});

const normalizeEvent = (input: Readonly<{
  event: RawGatewayEvent;
  job: AffiliateAgentErrorHistoryRow["job"];
  claim: AffiliateAgentErrorHistoryRow["claim"];
  contract: AffiliateAgentErrorHistoryContractIdentity | null;
  source: AffiliateAgentErrorHistorySource | null;
  receipt: AffiliateAgentErrorHistoryReceipt | null;
  finalReceipt: AffiliateAgentErrorHistoryReceipt | null;
}>): AffiliateAgentErrorHistoryRow | null => {
  const eventType = safeCode(AFFILIATE_AGENT_ERROR_HISTORY_EVENT_TYPES, input.event.eventType);
  if (!eventType) return null;
  const parsed = eventClassificationFor(input.event, eventType);
  return {
    eventId: safeIdentifier(input.event.id),
    eventKey: safeIdentifier(input.event.eventKey),
    eventType,
    recordKind: "EVENT",
    createdAt: safeDate(input.event.createdAt),
    sequence: boundedInteger(input.event.sequence, 1_000_000_000),
    actorKind: safeActorKind(input.event.actorKind),
    actorId: safeIdentifier(input.event.actorId),
    classification: parsed.classification,
    observation: parsed.observation,
    limit: parsed.limit,
    claim: input.claim,
    job: input.job,
    contract: input.contract,
    source: input.source,
    receipt: input.receipt,
    finalReceipt: input.finalReceipt,
    retention: {
      eventClass: safeRetentionClass(input.event.retentionClass),
      eventDeadline: safeDate(input.event.retentionDeadline),
      claimDeadline: input.claim?.diagnosticRetainUntil ?? null,
      receiptDeadline: input.receipt?.retentionDeadline ?? null,
    },
    markers: {
      malformedPayload: parsed.malformedPayload,
      receiptOnly: false,
      diagnosticRecordingReceipt: input.receipt?.operationKind === "RECORD_ERROR",
      recoveryNotInferred: true,
    },
  };
};
const receiptOnlyRowFor = (input: Readonly<{
  receipt: AffiliateAgentErrorHistoryReceipt;
  claim: AffiliateAgentErrorHistoryRow["claim"];
  job: AffiliateAgentErrorHistoryRow["job"];
  contract: AffiliateAgentErrorHistoryContractIdentity | null;
  source: AffiliateAgentErrorHistorySource | null;
  finalReceipt: AffiliateAgentErrorHistoryReceipt | null;
}>): AffiliateAgentErrorHistoryRow => ({
  eventId: null,
  eventKey: null,
  eventType: AFFILIATE_AGENT_ERROR_HISTORY_RECEIPT_ONLY_EVENT_TYPE,
  recordKind: "RECEIPT",
  createdAt: input.receipt.completedAt ?? input.receipt.startedAt,
  sequence: null,
  actorKind: "SYSTEM",
  actorId: null,
  classification: errorClassification({
    category: categoryForReceiptError(input.receipt.safeErrorCode ?? "UNCLASSIFIED_ERROR"),
    errorCode: input.receipt.safeErrorCode ?? "UNCLASSIFIED_ERROR",
    reasonCodes: ["RECEIPT_FAILURE"],
    origin: "GATEWAY",
    sourceKind: "RECEIPT_FAILURE",
  }),
  observation: null,
  limit: null,
  claim: input.claim,
  job: input.job,
  contract: input.contract,
  source: input.source,
  receipt: input.receipt,
  finalReceipt: input.finalReceipt,
  retention: {
    eventClass: input.receipt.retentionClass,
    eventDeadline: input.receipt.retentionDeadline,
    claimDeadline: input.claim?.diagnosticRetainUntil ?? null,
    receiptDeadline: input.receipt.retentionDeadline,
  },
  markers: {
    malformedPayload: false,
    diagnosticRecordingReceipt: false,
    receiptOnly: true,
    recoveryNotInferred: true,
  },
});

const scopeWhereFor = (
  base: Record<string, unknown>,
  filters: AffiliateAgentErrorHistoryNormalizedFilters,
  scopedJobIds: readonly string[] | null,
): Record<string, unknown> => {
  const predicates: Record<string, unknown>[] = [];
  if (scopedJobIds) predicates.push({ jobId: { in: [...scopedJobIds] } });
  if (filters.jobId) predicates.push({ jobId: filters.jobId });
  if (filters.claimId) predicates.push({ claimId: filters.claimId });
  return predicates.length > 0 ? { ...base, AND: predicates } : base;
};

const buildWhere = (
  filters: AffiliateAgentErrorHistoryNormalizedFilters,
  scopedJobIds: readonly string[] | null,
): Record<string, unknown> => scopeWhereFor(
  { eventType: { in: [...AFFILIATE_AGENT_ERROR_HISTORY_EVENT_TYPES] } },
  filters,
  scopedJobIds,
);
const normalizeRows = (
  events: readonly RawGatewayEvent[],
  jobs: readonly RawGatewayJob[],
  claims: readonly RawGatewayClaim[],
  sources: readonly RawSupplySource[],
  legacySources: readonly RawLegacySource[],
  receipts: readonly RawGatewayReceipt[],
  receiptOnlyReceipts: readonly RawGatewayReceipt[],
): AffiliateAgentErrorHistoryRow[] => {
  const jobsById = new Map<string, JobHistoryLookup>();
  for (const job of jobs) {
    const id = safeIdentifier(job.id);
    if (!id || jobsById.has(id)) continue;
    const view = jobViewFor(job);
    jobsById.set(id, {
      view,
      supplySourceId: view.supplySourceId,
      terminalReceiptId: view.terminalReceiptId,
    });
  }
  const claimsById = new Map<string, ClaimHistoryLookup>();
  const claimsByJobId = new Map<string, ClaimHistoryLookup>();
  for (const claim of claims) {
    const id = safeIdentifier(claim.id);
    if (!id || claimsById.has(id)) continue;
    const view = claimViewFor(claim);
    const lookup = {
      view,
      contract: contractIdentityFor(claim),
      terminalReceiptId: view.terminalReceiptId,
    };
    claimsById.set(id, lookup);
    const jobId = safeIdentifier(claim.jobId);
    if (jobId && !claimsByJobId.has(jobId)) claimsByJobId.set(jobId, lookup);
  }
  const sourceById = new Map<string, RawSupplySource>();
  for (const source of sources) {
    const id = safeIdentifier(source.id);
    if (id && !sourceById.has(id)) sourceById.set(id, source);
  }
  const legacyById = new Map<string, RawLegacySource>();
  const legacyBySupplySourceId = new Map<string, RawLegacySource>();
  for (const source of legacySources) {
    const id = safeIdentifier(source.id);
    if (id && !legacyById.has(id)) legacyById.set(id, source);
    const supplySourceId = safeIdentifier(source.supplySourceId);
    if (supplySourceId && !legacyBySupplySourceId.has(supplySourceId)) {
      legacyBySupplySourceId.set(supplySourceId, source);
    }
  }
  const sourceViewsById = new Map<string, AffiliateAgentErrorHistorySource>();
  const sourceIds = new Set([
    ...sourceById.keys(),
    ...legacyById.keys(),
    ...legacyBySupplySourceId.keys(),
  ]);
  for (const id of sourceIds) {
    const source = sourceFor(
      sourceById.get(id) ?? null,
      legacyBySupplySourceId.get(id) ?? legacyById.get(id) ?? null,
      id,
    );
    if (source) sourceViewsById.set(id, source);
  }
  const receiptsById = new Map<string, AffiliateAgentErrorHistoryReceipt>();
  for (const receipt of receipts) {
    const id = safeIdentifier(receipt.id);
    if (!id || receiptsById.has(id)) continue;
    const view = receiptFor(receipt);
    if (view) receiptsById.set(id, view);
  }
  const representedReceiptIds = new Set(
    events
      .map((event) => safeIdentifier(event.receiptId))
      .filter((value): value is string => value !== null),
  );
  const rows = events
    .map((event) => {
      const jobId = safeIdentifier(event.jobId);
      const job = jobId ? jobsById.get(jobId) ?? null : null;
      const claim = claimForEvent(claimsById, claimsByJobId, event);
      const supplySourceId = job?.supplySourceId ?? null;
      const eventReceiptId = safeIdentifier(event.receiptId);
      const eventReceipt = eventReceiptId
        ? receiptsById.get(eventReceiptId) ?? null
        : null;
      const finalReceiptId = job?.terminalReceiptId ?? claim?.terminalReceiptId ?? null;
      const finalReceipt = finalReceiptId
        ? receiptsById.get(finalReceiptId) ?? null
        : null;
      return normalizeEvent({
        event,
        job: job?.view ?? null,
        claim: claim?.view ?? null,
        contract: claim?.contract ?? null,
        source: supplySourceId ? sourceViewsById.get(supplySourceId) ?? null : null,
        receipt: eventReceipt,
        finalReceipt,
      });
    })
    .filter((row): row is AffiliateAgentErrorHistoryRow => row !== null);
  for (const rawReceipt of receiptOnlyReceipts) {
    if (rawReceipt.status !== "FAILED" && rawReceipt.status !== "UNKNOWN") continue;
    const receiptId = safeIdentifier(rawReceipt.id);
    if (!receiptId || representedReceiptIds.has(receiptId)) continue;
    const receipt = receiptsById.get(receiptId);
    if (!receipt) continue;
    const jobId = safeIdentifier(rawReceipt.jobId);
    const job = jobId ? jobsById.get(jobId) ?? null : null;
    const claimId = safeIdentifier(rawReceipt.claimId);
    const claim = claimId
      ? claimsById.get(claimId) ?? null
      : jobId ? claimsByJobId.get(jobId) ?? null : null;
    const supplySourceId = job?.supplySourceId ?? null;
    const finalReceiptId = job?.terminalReceiptId ?? claim?.terminalReceiptId ?? null;
    const finalReceipt = finalReceiptId
      ? receiptsById.get(finalReceiptId) ?? null
      : null;
    rows.push(receiptOnlyRowFor({
      receipt,
      claim: claim?.view ?? null,
      job: job?.view ?? null,
      contract: claim?.contract ?? null,
      source: supplySourceId ? sourceViewsById.get(supplySourceId) ?? null : null,
      finalReceipt,
    }));
  }
  return rows;
};
const sortHistoryRowsByOccurrence = (
  rows: readonly AffiliateAgentErrorHistoryRow[],
): AffiliateAgentErrorHistoryRow[] => rows
  .map((row, index) => ({ row, index }))
  .sort((left, right) => {
    const leftTime = left.row.createdAt;
    const rightTime = right.row.createdAt;
    if (leftTime === null && rightTime !== null) return 1;
    if (leftTime !== null && rightTime === null) return -1;
    if (leftTime !== null && rightTime !== null) {
      if (leftTime > rightTime) return -1;
      if (leftTime < rightTime) return 1;
    }
    return left.index - right.index;
  })
  .map(({ row }) => row);


export const buildAffiliateAgentErrorHistoryReport = (input: Readonly<{
  filters: AffiliateAgentErrorHistoryFilters;
  events: readonly RawGatewayEvent[];
  jobs?: readonly RawGatewayJob[];
  claims?: readonly RawGatewayClaim[];
  sources?: readonly RawSupplySource[];
  legacySources?: readonly RawLegacySource[];
  receipts?: readonly RawGatewayReceipt[];
  receiptOnlyReceipts?: readonly RawGatewayReceipt[];
  resultTruncated?: boolean;
  scopeTruncated?: boolean;
}>): AffiliateAgentErrorHistoryReport => {
  const filters = parseAffiliateAgentErrorHistoryFilters(input.filters);
  const normalizedRows = sortHistoryRowsByOccurrence(normalizeRows(
    input.events,
    input.jobs ?? [],
    input.claims ?? [],
    input.sources ?? [],
    input.legacySources ?? [],
    input.receipts ?? [],
    input.receiptOnlyReceipts ?? [],
  ));
  const rows = normalizedRows.slice(0, filters.maxResults);
  const limitRows = rows.filter((row) => row.eventType === AFFILIATE_AGENT_ERROR_LIMIT_EVENT);
  return {
    schemaVersion: AFFILIATE_AGENT_ERROR_HISTORY_SCHEMA_VERSION,
    readOnly: true,
    recoveryAssessment: "NOT_INFERRED",
    filters: {
      claimId: filters.claimId,
      jobId: filters.jobId,
      sourceId: filters.sourceId,
      maxResults: filters.maxResults,
    },
    rows,
    groups: buildGroups(rows),
    limits: {
      maxResults: filters.maxResults,
      returnedRows: rows.length,
      resultTruncated: input.resultTruncated === true
        || input.events.length > filters.maxResults
        || (input.receiptOnlyReceipts?.length ?? 0) > filters.maxResults
        || normalizedRows.length > filters.maxResults,
      scopeJobLimit: AFFILIATE_AGENT_ERROR_HISTORY_MAX_SCOPE_JOBS,
      scopeTruncated: input.scopeTruncated === true,
      storage: {
        maxRecordsPerClaim: AFFILIATE_AGENT_ERROR_MAX_RECORDS,
        maxRecordBytes: AFFILIATE_AGENT_ERROR_MAX_RECORD_BYTES,
        maxTotalBytes: AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES,
      },
      limitMarkerCount: limitRows.length,
      limitMarkerEventIds: limitRows.map((row) => row.eventId),
    },
  };
};
const receiptFailureWhereFor = (
  filters: AffiliateAgentErrorHistoryNormalizedFilters,
  scopedJobIds: readonly string[] | null,
): Record<string, unknown> => scopeWhereFor(
  { status: { in: ["FAILED", "UNKNOWN"] } },
  filters,
  scopedJobIds,
);

export const loadAffiliateAgentErrorHistoryReport = async (
  client: AffiliateAgentErrorHistoryReadClient,
  input: AffiliateAgentErrorHistoryFilters = {},
): Promise<AffiliateAgentErrorHistoryReport> => {
  const filters = parseAffiliateAgentErrorHistoryFilters(input);
  let scopedJobIds: string[] | null = null;
  let scopeTruncated = false;
  let scopedJobs: readonly RawGatewayJob[] = [];
  let prefetchedSupplySources: readonly RawSupplySource[] = [];
  let prefetchedLegacySources: readonly RawLegacySource[] = [];

  if (filters.sourceId) {
    const [supplySources, directLegacySources, mappedLegacySources] = await Promise.all([
      client.affiliateSupplySources.findMany({
        where: { id: filters.sourceId },
        select: supplySourceSelect,
        take: 1,
      }),
      client.affiliateScrapeSources.findMany({
        where: { id: filters.sourceId },
        orderBy: { id: "asc" },
        select: legacySourceSelect,
        take: 1,
      }),
      client.affiliateScrapeSources.findMany({
        where: { supplySourceId: filters.sourceId },
        orderBy: { id: "asc" },
        select: legacySourceSelect,
        take: 1,
      }),
    ]);
    prefetchedSupplySources = supplySources as RawSupplySource[];
    const prefetchedLegacyIds = new Set<string>();
    prefetchedLegacySources = [
      ...(directLegacySources as RawLegacySource[]),
      ...(mappedLegacySources as RawLegacySource[]),
    ].filter((row) => {
      const id = safeIdentifier(row.id);
      if (!id || prefetchedLegacyIds.has(id)) return false;
      prefetchedLegacyIds.add(id);
      return true;
    });
    const sourceScopeIds = [...new Set([
      filters.sourceId,
      ...prefetchedSupplySources.map((row) => safeIdentifier(row.id)),
      ...prefetchedLegacySources.map((row) => safeIdentifier(row.supplySourceId)),
    ].filter((value): value is string => value !== null))];
    const hasExplicitJobScope = filters.jobId !== null || filters.claimId !== null;
    let claimJobId: string | null = null;
    if (filters.claimId !== null) {
      const explicitClaims = await client.affiliateAgentGatewayClaims.findMany({
        where: { id: filters.claimId },
        select: { id: true, jobId: true },
        take: 1,
      }) as RawGatewayClaim[];
      claimJobId = safeIdentifier(explicitClaims[0]?.jobId);
    }
    const exactScopeJobIds = filters.jobId !== null
      ? filters.claimId === null
        ? [filters.jobId]
        : claimJobId === filters.jobId
          ? [filters.jobId]
          : []
      : claimJobId !== null ? [claimJobId] : [];
    const scopedJobsResult = await client.affiliateAgentGatewayJobs.findMany({
      where: hasExplicitJobScope
        ? {
            AND: [
              { supplySourceId: { in: sourceScopeIds } },
              { id: { in: exactScopeJobIds } },
            ],
          }
        : { supplySourceId: { in: sourceScopeIds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: hasExplicitJobScope
        ? exactScopeJobIds.length
        : AFFILIATE_AGENT_ERROR_HISTORY_MAX_SCOPE_JOBS + 1,
      select: jobSelect,
    }) as RawGatewayJob[];
    scopeTruncated = !hasExplicitJobScope
      && scopedJobsResult.length > AFFILIATE_AGENT_ERROR_HISTORY_MAX_SCOPE_JOBS;
    scopedJobs = scopedJobsResult.slice(
      0,
      hasExplicitJobScope
        ? exactScopeJobIds.length
        : AFFILIATE_AGENT_ERROR_HISTORY_MAX_SCOPE_JOBS,
    );
    scopedJobIds = scopedJobs
      .map((row) => safeIdentifier(row.id))
      .filter((value): value is string => value !== null);
    if (scopedJobIds.length === 0) {
      return buildAffiliateAgentErrorHistoryReport({
        filters,
        events: [],
        jobs: [],
        sources: prefetchedSupplySources,
        legacySources: prefetchedLegacySources,
        scopeTruncated,
      });
    }
  }

  const [events, failedReceipts] = await Promise.all([
    client.affiliateAgentGatewayEvents.findMany({
      where: buildWhere(filters, scopedJobIds),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.maxResults + 1,
      select: rowSelect,
    }) as Promise<RawGatewayEvent[]>,
    client.affiliateAgentGatewayOperationReceipts.findMany({
      where: receiptFailureWhereFor(filters, scopedJobIds),
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
      take: filters.maxResults + 1,
      select: receiptSelect,
    }) as Promise<RawGatewayReceipt[]>,
  ]);
  const reportableFailedReceipts = failedReceipts.filter((receipt) => (
    receipt.status === "FAILED" || receipt.status === "UNKNOWN"
  ));
  const resultTruncated = events.length > filters.maxResults
    || reportableFailedReceipts.length > filters.maxResults;
  const jobIds = [...new Set([
    ...events.map((event) => safeIdentifier(event.jobId)),
    ...reportableFailedReceipts.map((receipt) => safeIdentifier(receipt.jobId)),
  ].filter((value): value is string => value !== null))];
  const claimIds = [...new Set([
    ...events.map((event) => safeIdentifier(event.claimId)),
    ...reportableFailedReceipts.map((receipt) => safeIdentifier(receipt.claimId)),
  ].filter((value): value is string => value !== null))];
  const eventReceiptIds = [...new Set(events
    .map((event) => safeIdentifier(event.receiptId))
    .filter((value): value is string => value !== null))];

  const [jobRows, claimRows] = await Promise.all([
    scopedJobs.length > 0 && scopedJobIds
      ? Promise.resolve(scopedJobs)
      : jobIds.length > 0
        ? client.affiliateAgentGatewayJobs.findMany({
            where: { id: { in: jobIds } },
            select: jobSelect,
          }) as Promise<RawGatewayJob[]>
        : Promise.resolve([] as RawGatewayJob[]),
    claimIds.length > 0
      ? client.affiliateAgentGatewayClaims.findMany({
          where: { id: { in: claimIds } },
          select: claimSelect,
        }) as Promise<RawGatewayClaim[]>
      : Promise.resolve([] as RawGatewayClaim[]),
  ]);
  const allJobs = jobRows.length > 0 ? jobRows : scopedJobs;
  const sourceIds = [...new Set([
    filters.sourceId,
    ...allJobs.map((job) => safeIdentifier(job.supplySourceId)),
  ].filter((value): value is string => value !== null))];
  const terminalReceiptIds = [...new Set([
    ...allJobs.map((job) => safeIdentifier(job.terminalReceiptId)),
    ...claimRows.map((claim) => safeIdentifier(claim.terminalReceiptId)),
  ].filter((value): value is string => value !== null))];
  const failedReceiptIds = new Set(
    reportableFailedReceipts
      .map((receipt) => safeIdentifier(receipt.id))
      .filter((value): value is string => value !== null),
  );
  const receiptIds = [...new Set([
    ...eventReceiptIds,
    ...terminalReceiptIds,
    ...failedReceiptIds,
  ])];
  const linkedReceiptIds = receiptIds.filter((id) => !failedReceiptIds.has(id));
  const linkedReceipts = linkedReceiptIds.length > 0
    ? await client.affiliateAgentGatewayOperationReceipts.findMany({
        where: { id: { in: linkedReceiptIds } },
        select: receiptSelect,
      }) as RawGatewayReceipt[]
    : [];
  const receipts = [...failedReceipts, ...linkedReceipts];
  const supplySources = prefetchedSupplySources.length > 0
    ? prefetchedSupplySources
    : sourceIds.length > 0
      ? await client.affiliateSupplySources.findMany({
          where: { id: { in: sourceIds } },
          take: sourceIds.length,
          select: supplySourceSelect,
        }) as RawSupplySource[]
      : [];
  const liveSourceIdsBySupplySourceId = new Map<string, string>();
  for (const supplySource of supplySources) {
    const supplySourceId = safeIdentifier(supplySource.id);
    const liveSourceId = safeIdentifier(supplySource.liveSourceId);
    if (supplySourceId && liveSourceId) {
      liveSourceIdsBySupplySourceId.set(supplySourceId, liveSourceId);
    }
  }
  const canonicalLegacySourceIds = [...new Set(supplySources
    .map((source) => safeIdentifier(source.liveSourceId))
    .filter((value): value is string => value !== null))];
  const prefetchedLegacyIds = new Set(
    prefetchedLegacySources
      .map((source) => safeIdentifier(source.id))
      .filter((value): value is string => value !== null),
  );
  const prefetchedLegacySourceIds = new Set(
    prefetchedLegacySources.flatMap((source) => [
      safeIdentifier(source.id),
      safeIdentifier(source.supplySourceId),
    ].filter((value): value is string => value !== null)),
  );
  const legacyLookupIds = [...new Set([
    ...canonicalLegacySourceIds.filter((id) => !prefetchedLegacyIds.has(id)),
    ...sourceIds
      .filter((sourceId) => !prefetchedLegacySourceIds.has(sourceId))
      .map((sourceId) => liveSourceIdsBySupplySourceId.get(sourceId) ?? sourceId),
  ])];
  const queriedLegacySources = legacyLookupIds.length > 0
    ? await client.affiliateScrapeSources.findMany({
        where: { id: { in: legacyLookupIds } },
        orderBy: { id: "asc" },
        take: legacyLookupIds.length,
        select: legacySourceSelect,
      }) as RawLegacySource[]
    : [];
  const legacySourceIds = new Set<string>();
  const legacySources = [
    ...queriedLegacySources,
    ...prefetchedLegacySources,
  ].filter((source) => {
    const id = safeIdentifier(source.id);
    if (!id || legacySourceIds.has(id)) return false;
    legacySourceIds.add(id);
    return true;
  });
  return buildAffiliateAgentErrorHistoryReport({
    filters,
    events,
    jobs: allJobs,
    claims: claimRows,
    sources: supplySources,
    legacySources,
    receipts,
    receiptOnlyReceipts: reportableFailedReceipts,
    resultTruncated,
    scopeTruncated,
  });
};

export const withAffiliateAgentErrorHistoryReadOnly = async <T>(
  client: Readonly<{
    $transaction: <R>(callback: (transaction: AffiliateAgentErrorHistoryReadOnlyClient) => Promise<R>) => Promise<R>;
  }>,
  callback: (transaction: AffiliateAgentErrorHistoryReadOnlyClient) => Promise<T>,
): Promise<T> => client.$transaction(async (transaction) => {
  if (typeof transaction.$executeRawUnsafe !== "function") {
    throw new Error("Affiliate error history report requires a read-only transaction guard.");
  }
  await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  return callback(transaction);
});

