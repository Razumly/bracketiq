import { z } from "zod";
import {
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ERROR_CODES,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ISSUE_CODES,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_RECORD_BYTES,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_RECORDS,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_TOTAL_BYTES,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_PATHS,
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_REASON_CODES,
  commandDiagnosticCommandFor,
  gatewayCommandRejectionDiagnosticFor,
  issueCodeFor,
} from "./affiliateAgentCommandDiagnostics";

export const AFFILIATE_AGENT_ERROR_EVENT = "CLAIM_AGENT_ERROR_RECORDED" as const;
export const AFFILIATE_AGENT_ERROR_LIMIT_EVENT = "CLAIM_AGENT_ERROR_LIMIT_REACHED" as const;
export const AFFILIATE_AGENT_ERROR_MAX_RECORDS = AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_RECORDS;
export const AFFILIATE_AGENT_ERROR_MAX_RECORD_BYTES = AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_RECORD_BYTES;
export const AFFILIATE_AGENT_ERROR_MAX_TOTAL_BYTES = AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_TOTAL_BYTES;
export const REVIEWER_TERMINAL_EFFECT_FAILURE_REASON_CODES = [
  "LIFECYCLE_GENERATION_STALE",
  "SUPPLY_CONTRACT_STALE",
  "COMMAND_AUTHORITY_NOT_PERMITTED",
  "LEGACY_RECONCILIATION_WRITER_REQUIRED",
  "REVIEWER_OUTCOME_NOT_PERMITTED",
  "EVIDENCE_REQUIRED",
  "APPROVAL_PRECONDITION_FAILED",
  "APPROVAL_LIFECYCLE_EVIDENCE_MISSING",
  "ACTIVATION_PRECONDITION_FAILED",
  "PUBLICATION_PRECONDITION_FAILED",
  "TARGET_REJECTION_PRECONDITION_FAILED",
  "REFRESH_PRECONDITION_FAILED",
  "EMPTY_REFRESH_PRECONDITION_FAILED",
  "UNCLASSIFIED",
] as const;
export const AFFILIATE_AGENT_ERROR_TOOLS = [
  "read_artifact", "execute_command", "check_result", "submit_result", "UNKNOWN",
] as const;
export const AFFILIATE_AGENT_ERROR_STAGES = [
  "LOCAL_SCHEMA", "LOCAL_VALIDATION", "GATEWAY", "TOOL_RUNTIME",
] as const;
export const AFFILIATE_AGENT_ERROR_CODES = [
  ...AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ERROR_CODES,
  "LOCAL_DRAFT_INVALID", "CITATION_TEXT_LIMIT", "TOOL_NOT_PERMITTED",
  "INVOCATION_CLOSED", "TOOL_ABORTED", "ARTIFACT_VIEW_INVALID",
  "ARTIFACT_OFFSET_INVALID", "ARTIFACT_MIME_UNSUPPORTED", "ARTIFACT_PAGE_TOO_LARGE",
  "TERMINAL_RESULT_TOO_LARGE", "TERMINAL_SUBMISSION_UNCONFIRMED",
  "GATEWAY_OPERATION_UNVERIFIED", "UNCLASSIFIED_ERROR",
] as const;
export const AFFILIATE_AGENT_ERROR_REASONS = [
  ...AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_REASON_CODES,
  "LOCAL_DRAFT_INVALID", "TOOL_NOT_PERMITTED", "INVOCATION_CLOSED", "TOOL_ABORTED",
  "CITATION_TEXT_LIMIT", "ARTIFACT_VIEW_INVALID", "ARTIFACT_OFFSET_INVALID",
  "ARTIFACT_MIME_UNSUPPORTED", "ARTIFACT_PAGE_TOO_LARGE", "TERMINAL_RESULT_TOO_LARGE",
  "TERMINAL_SUBMISSION_UNCONFIRMED", "GATEWAY_OPERATION_UNVERIFIED",
] as const;
export const AFFILIATE_AGENT_ERROR_PATHS = [
  ...AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_PATHS,
  "tool", "artifact", "artifact.evidenceRef", "artifact.view", "artifact.offset", "artifact.limit",
  "result", "result.disposition", "result.reasonCodes", "result.evidenceRefs", "result.summary",
  "result.payload", "result.payload.packageHash", "result.payload.commitReceiptId",
  "result.payload.validationReceiptId", "result.payload.reviewIssues", "result.payload.checks",
  "result.payload.sportEvidence", "result.payload.sportEvidence.evidenceRunId",
  "result.payload.sportEvidence.sportsCatalogSha256",
  "result.payload.sportEvidence.sportDeterminations",
  "result.payload.sportEvidence.sportDeterminations.sourceLabels",
  "result.payload.sportEvidence.sportDeterminations.status",
  "result.payload.sportEvidence.sportDeterminations.canonicalSportNames",
  "result.payload.sportEvidence.sportDeterminations.rationale",
  "result.payload.sportEvidence.sportDeterminations.evidence",
] as const;

export const affiliateAgentErrorObservationSchema = z.object({
  schemaVersion: z.literal(1),
  tool: z.enum(AFFILIATE_AGENT_ERROR_TOOLS),
  stage: z.enum(AFFILIATE_AGENT_ERROR_STAGES),
  command: z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS),
  errorCode: z.enum(AFFILIATE_AGENT_ERROR_CODES),
  reasonCode: z.enum(AFFILIATE_AGENT_ERROR_REASONS),
  issueCodes: z.array(z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ISSUE_CODES))
    .max(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES),
  issuePaths: z.array(z.enum(AFFILIATE_AGENT_ERROR_PATHS))
    .max(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES),
  isRetryable: z.boolean(),
}).strict().superRefine((value, context) => {
  if (new Set(value.issueCodes).size !== value.issueCodes.length
    || new Set(value.issuePaths).size !== value.issuePaths.length) {
    context.addIssue({ code: "custom", message: "Error issue codes and paths must be unique." });
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > AFFILIATE_AGENT_ERROR_MAX_RECORD_BYTES) {
    context.addIssue({ code: "custom", message: "Error observation exceeds the record bound." });
  }
});
export type AffiliateAgentErrorObservation = z.infer<typeof affiliateAgentErrorObservationSchema>;
export type AffiliateAgentErrorCategory = "INPUT" | "VALIDATION" | "AUTHORITY" | "EVIDENCE" | "PLATFORM";
export type AffiliateAgentErrorRecordResult =
  | Readonly<{ kind: "AGENT_ERROR_RECORDED"; eventId: string; replayed: boolean }>
  | Readonly<{ kind: "AGENT_ERROR_LIMIT_REACHED"; eventId: string }>;

const known = <T extends string>(values: readonly T[], value: unknown): value is T => (
  typeof value === "string" && values.includes(value as T)
);
const issueRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const pathTokens = AFFILIATE_AGENT_ERROR_PATHS.map((path) => ({ path, segments: path.split(".") }))
  .sort((left, right) => right.segments.length - left.segments.length);

const observationIssuePath = (
  tool: AffiliateAgentErrorObservation["tool"],
  issue: unknown,
): AffiliateAgentErrorObservation["issuePaths"][number] => {
  const root = tool === "execute_command" ? "command"
    : tool === "read_artifact" ? "artifact"
      : tool === "check_result" || tool === "submit_result" ? "result" : "tool";
  const raw = issueRecord(issue)?.path;
  if (!Array.isArray(raw)) return root;
  const segments: string[] = [];
  for (const segment of raw.slice(0, 16)) {
    if (typeof segment === "number") continue;
    if (typeof segment !== "string" || segment.length > 100) break;
    segments.push(segment);
  }
  if (segments[0] !== root) segments.unshift(root);
  return pathTokens.find((entry) => entry.segments.every((segment, index) => segment === segments[index]))?.path ?? root;
};

export const affiliateAgentErrorObservationFor = (input: Readonly<{
  tool: unknown;
  stage: AffiliateAgentErrorObservation["stage"];
  command?: unknown;
  errorCode: unknown;
  reasonCode?: unknown;
  issues?: readonly unknown[];
  isRetryable?: boolean;
}>): AffiliateAgentErrorObservation => {
  const tool = known(AFFILIATE_AGENT_ERROR_TOOLS, input.tool) ? input.tool : "UNKNOWN";
  const issues = input.issues?.slice(0, AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES) ?? [];
  return affiliateAgentErrorObservationSchema.parse({
    schemaVersion: 1,
    tool,
    stage: input.stage,
    command: commandDiagnosticCommandFor({ command: input.command }),
    errorCode: known(AFFILIATE_AGENT_ERROR_CODES, input.errorCode) ? input.errorCode : "UNCLASSIFIED_ERROR",
    reasonCode: known(AFFILIATE_AGENT_ERROR_REASONS, input.reasonCode) ? input.reasonCode : "UNKNOWN",
    issueCodes: [...new Set(issues.map((issue) => {
      const code = issueRecord(issue)?.code;
      return known(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ISSUE_CODES, code) ? code : issueCodeFor(issue);
    }))],
    issuePaths: [...new Set(issues.map((issue) => observationIssuePath(tool, issue)))],
    isRetryable: input.isRetryable ?? false,
  });
};

export const affiliateAgentGatewayErrorObservationFor = (input: Readonly<{
  tool: unknown;
  command?: unknown;
  errorCode: unknown;
  safeMessage: unknown;
  isRetryable: boolean;
}>): AffiliateAgentErrorObservation => {
  const diagnostic = gatewayCommandRejectionDiagnosticFor({
    command: input.command,
    errorCode: input.errorCode,
    safeMessage: input.safeMessage,
    isRetryable: input.isRetryable,
  });
  return affiliateAgentErrorObservationFor({
    tool: input.tool,
    stage: "GATEWAY",
    command: input.command,
    errorCode: input.errorCode,
    reasonCode: diagnostic?.reasonCode,
    isRetryable: input.isRetryable,
  });
};

export const affiliateAgentErrorCategoryFor = (
  observation: AffiliateAgentErrorObservation,
): AffiliateAgentErrorCategory => {
  switch (observation.errorCode) {
    case "INTERNAL_ERROR":
    case "PARTIAL_COMMAND_UNRESOLVED":
    case "OPERATION_IN_PROGRESS":
    case "GATEWAY_OPERATION_UNVERIFIED":
    case "TERMINAL_SUBMISSION_UNCONFIRMED":
    case "UNCLASSIFIED_ERROR":
      return "PLATFORM";
    case "ROLE_CREDENTIAL_INVALID":
    case "ROLE_NOT_ALLOWED":
    case "WORKER_MISMATCH":
    case "INVOCATION_MISMATCH":
    case "JOB_MISMATCH":
    case "CLAIM_NOT_FOUND":
    case "CLAIM_NOT_ACTIVE":
    case "CLAIM_GENERATION_STALE":
    case "LIFECYCLE_GENERATION_STALE":
    case "TOKEN_INVALID":
    case "TOKEN_EXPIRED":
    case "TOKEN_INVALIDATED":
    case "LEASE_EXPIRED":
    case "HARD_DEADLINE_EXCEEDED":
    case "SUPPLY_CONTRACT_STALE":
    case "DEPLOYMENT_CONTRACT_STALE":
    case "COMMAND_NOT_PERMITTED":
    case "ARTIFACT_NOT_PERMITTED":
    case "EVIDENCE_REFERENCE_NOT_PERMITTED":
    case "PRODUCER_REVIEWER_IDENTITY_REUSED":
    case "REVIEW_WORKSPACE_INVALID":
    case "GATEWAY_ADMISSION_HALTED":
    case "INVOCATION_CLOSED":
    case "TOOL_ABORTED":
      return "AUTHORITY";
    case "CITATION_TEXT_LIMIT":
    case "ARTIFACT_MIME_UNSUPPORTED":
    case "ARTIFACT_PAGE_TOO_LARGE":
    case "ARTIFACT_INTEGRITY_FAILED":
      return "EVIDENCE";
    case "TOOL_NOT_PERMITTED":
    case "ARTIFACT_VIEW_INVALID":
    case "ARTIFACT_OFFSET_INVALID":
      return "INPUT";
  }
  if (observation.stage === "LOCAL_SCHEMA") return "INPUT";
  return "VALIDATION";
};
