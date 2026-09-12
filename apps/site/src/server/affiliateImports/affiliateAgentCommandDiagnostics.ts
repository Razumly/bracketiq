import { z } from "zod";

export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_VERSION = 1 as const;
export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_EVENT = "affiliate-agent-command-rejection" as const;
export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_RECORD_BYTES = 4_096 as const;
export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_RECORDS = 32 as const;
export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_TOTAL_BYTES = 16_384 as const;
export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES = 8 as const;

export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_STAGES = [
  "LOCAL_SCHEMA",
  "GATEWAY",
] as const;
export type AffiliateAgentCommandDiagnosticStage =
  typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_STAGES[number];

export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS = [
  "UNKNOWN",
  "RUN_DISCOVERY_QUERY",
  "CAPTURE_CLAIM_URL",
  "VALIDATE_DECLARATIVE_PACKAGE",
  "COMMIT_DECLARATIVE_PACKAGE",
  "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
  "SUBMIT_TERMINAL_RESULT",
] as const;
export type AffiliateAgentCommandDiagnosticCommand =
  typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS[number];

export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ISSUE_CODES = [
  "INVALID_TYPE",
  "INVALID_VALUE",
  "MISSING_VALUE",
  "UNKNOWN_KEY",
] as const;
export type AffiliateAgentCommandDiagnosticIssueCode =
  typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ISSUE_CODES[number];

export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ERROR_CODES = [
  "COMMAND_SCHEMA_INVALID",
  "ROLE_CREDENTIAL_INVALID",
  "ROLE_NOT_ALLOWED",
  "WORKER_MISMATCH",
  "INVOCATION_MISMATCH",
  "JOB_MISMATCH",
  "CLAIM_NOT_FOUND",
  "CLAIM_NOT_ACTIVE",
  "CLAIM_GENERATION_STALE",
  "LIFECYCLE_GENERATION_STALE",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_INVALIDATED",
  "LEASE_EXPIRED",
  "HARD_DEADLINE_EXCEEDED",
  "SUPPLY_CONTRACT_STALE",
  "DEPLOYMENT_CONTRACT_STALE",
  "COMMAND_NOT_PERMITTED",
  "ARTIFACT_NOT_PERMITTED",
  "ARTIFACT_INTEGRITY_FAILED",
  "RESULT_SCHEMA_INVALID",
  "SCHEMA_CORRECTIONS_EXHAUSTED",
  "TERMINAL_DISPOSITION_NOT_PERMITTED",
  "EVIDENCE_REFERENCE_NOT_PERMITTED",
  "IDEMPOTENCY_KEY_REUSED",
  "OPERATION_IN_PROGRESS",
  "RETRY_NOT_ELIGIBLE",
  "PIPELINE_BLOCKED",
  "PRODUCER_REVIEWER_IDENTITY_REUSED",
  "REVIEW_WORKSPACE_INVALID",
  "LIFECYCLE_TRANSITION_CONFLICT",
  "PARTIAL_COMMAND_UNRESOLVED",
  "DUPLICATE_LIVE_CLAIM",
  "GATEWAY_ADMISSION_HALTED",
  "INTERNAL_ERROR",
] as const;
export type AffiliateAgentCommandDiagnosticErrorCode =
  typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ERROR_CODES[number];

export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_REASON_CODES = [
  "UNKNOWN",
  "LOCAL_SCHEMA_INVALID",
  "COMMAND_INPUT_TOO_DEEP",
  "COMMAND_INPUT_REPEATED_OBJECT",
  "COMMAND_INPUT_TOO_MANY_FIELDS",
  "COMMAND_INPUT_STRING_TOO_LARGE",
  "COMMAND_INPUT_UNSUPPORTED_VALUE",
  "COMMAND_INPUT_TOO_LARGE",
  "COMMAND_OUTSIDE_ROLE",
  "COMMAND_ADAPTER_UNAVAILABLE",
  "COMMAND_EVIDENCE_OUTSIDE_CLAIM",
  "COMMAND_IDEMPOTENCY_REUSED",
  "COMMAND_IN_PROGRESS",
  "COMMAND_PARTIAL_UNRESOLVED",
  "PACKAGE_SOURCE_MISMATCH",
  "SOURCE_KIND_MISMATCH",
  "PACKAGE_MANIFEST_MISMATCH",
  "PACKAGE_EVIDENCE_OUTSIDE_CLAIM",
  "PAGE_HTML_REQUIRED",
  "PACKAGE_SELECTOR_INVALID",
  "PACKAGE_NO_CANDIDATES",
  "PACKAGE_REQUIRED_FIELDS_MISSING",
  "PACKAGE_SPORT_EVIDENCE_REQUIRED",
  "PACKAGE_CITATION_REFERENCE_MISSING",
  "SPORT_EVIDENCE_RUN_MISMATCH",
  "SPORT_CATALOG_MISMATCH",
  "SPORT_OUTPUT_MISMATCH",
  "SPORT_EVIDENCE_INVALID",
] as const;
export type AffiliateAgentCommandDiagnosticReasonCode =
  typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_REASON_CODES[number];

export const AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_PATHS = [
  "command",
  "command.type",
  "command.data",
  "command.data.strategyRef",
  "command.data.queryRef",
  "command.data.urlRef",
  "command.data.captureProfileRef",
  "command.data.candidatePackage",
  "command.data.evidenceManifestHash",
  "command.data.validationReceiptId",
  "command.data.validatedPackageHash",
  "command.data.caseId",
  "command.data.decisionHash",
  "command.data.lifecycleCommandRef",
] as const;
export type AffiliateAgentCommandDiagnosticPath =
  typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_PATHS[number];

export type AffiliateAgentCommandRejectionDiagnostic = Readonly<{
  version: typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_VERSION;
  event: typeof AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_EVENT;
  stage: AffiliateAgentCommandDiagnosticStage;
  command: AffiliateAgentCommandDiagnosticCommand;
  errorCode: AffiliateAgentCommandDiagnosticErrorCode;
  reasonCode: AffiliateAgentCommandDiagnosticReasonCode;
  issueCodes: readonly AffiliateAgentCommandDiagnosticIssueCode[];
  issuePaths: readonly AffiliateAgentCommandDiagnosticPath[];
  isRetryable: boolean;
}>;

const diagnosticSchema = z.object({
  version: z.literal(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_VERSION),
  event: z.literal(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_EVENT),
  stage: z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_STAGES),
  command: z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS),
  errorCode: z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ERROR_CODES),
  reasonCode: z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_REASON_CODES),
  issueCodes: z
    .array(z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ISSUE_CODES))
    .max(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES),
  issuePaths: z
    .array(z.enum(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_PATHS))
    .max(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES),
  isRetryable: z.boolean(),
});

type ParsedDiagnostic = z.infer<typeof diagnosticSchema>;

const includes = <T extends string>(values: readonly T[], value: unknown): value is T => (
  typeof value === "string" && values.includes(value as T)
);

const diagnosticFromParsed = (
  parsed: ParsedDiagnostic,
): AffiliateAgentCommandRejectionDiagnostic | null => {
  const issueCodes = Array.from(new Set(parsed.issueCodes));
  const issuePaths = Array.from(new Set(parsed.issuePaths));
  const isLocalSchema = parsed.stage === "LOCAL_SCHEMA";
  if (
    (isLocalSchema && parsed.errorCode !== "COMMAND_SCHEMA_INVALID")
    || (isLocalSchema && (issueCodes.length === 0 || issuePaths.length === 0))
    || (!isLocalSchema && (issueCodes.length !== 0 || issuePaths.length !== 0))
  ) return null;
  return {
    version: parsed.version,
    event: parsed.event,
    stage: parsed.stage,
    command: parsed.command,
    errorCode: parsed.errorCode,
    reasonCode: parsed.reasonCode,
    issueCodes,
    issuePaths,
    isRetryable: parsed.isRetryable,
  };
};

export const parseAffiliateAgentCommandRejectionDiagnostic = (
  value: unknown,
): AffiliateAgentCommandRejectionDiagnostic | null => {
  const parsed = diagnosticSchema.safeParse(value);
  return parsed.success ? diagnosticFromParsed(parsed.data) : null;
};

export const serializeAffiliateAgentCommandRejectionDiagnostic = (
  value: AffiliateAgentCommandRejectionDiagnostic,
): string => {
  const parsed = parseAffiliateAgentCommandRejectionDiagnostic(value);
  if (parsed === null) throw new TypeError("Invalid affiliate agent command diagnostic.");
  const serialized = JSON.stringify(parsed);
  if (
    Buffer.byteLength(serialized, "utf8")
      > AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_RECORD_BYTES
  ) throw new TypeError("Affiliate agent command diagnostic is too large.");
  return serialized;
};

export const commandDiagnosticCommandFor = (
  value: unknown,
): AffiliateAgentCommandDiagnosticCommand => {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !("command" in value)
  ) return "UNKNOWN";
  const command = value.command;
  if (
    command === null
    || typeof command !== "object"
    || Array.isArray(command)
    || !("type" in command)
  ) return "UNKNOWN";
  return includes(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_COMMANDS, command.type)
    ? command.type
    : "UNKNOWN";
};

export const issueCodeFor = (
  value: unknown,
): AffiliateAgentCommandDiagnosticIssueCode => {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !("code" in value)
    || typeof value.code !== "string"
  ) return "INVALID_VALUE";
  switch (value.code) {
    case "invalid_type":
      return "INVALID_TYPE";
    case "unrecognized_keys":
      return "UNKNOWN_KEY";
    case "too_small":
      return "MISSING_VALUE";
    default:
      return "INVALID_VALUE";
  }
};

export const issuePathFor = (
  value: unknown,
): AffiliateAgentCommandDiagnosticPath => {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || !("path" in value)
    || !Array.isArray(value.path)
  ) return "command";
  const path = value.path
    .filter((segment): segment is string | number => (
      typeof segment === "string" || typeof segment === "number"
    ))
    .map(String)
    .join(".");
  const normalized = path === ""
    ? "command"
    : path.startsWith("command.") ? path : `command.${path}`;
  return includes(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_PATHS, normalized)
    ? normalized
    : normalized.startsWith("command.data.candidatePackage")
      ? "command.data.candidatePackage"
      : "command.data";
};

export const localCommandRejectionDiagnosticFor = (
  input: Readonly<{
    command: unknown;
    issues: readonly unknown[];
  }>,
): AffiliateAgentCommandRejectionDiagnostic => {
  const issueCodes = Array.from(new Set(
    input.issues
      .slice(0, AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES)
      .map(issueCodeFor),
  ));
  const issuePaths = Array.from(new Set(
    input.issues
      .slice(0, AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES)
      .map(issuePathFor),
  ));
  return {
    version: AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_VERSION,
    event: AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_EVENT,
    stage: "LOCAL_SCHEMA",
    command: commandDiagnosticCommandFor(input.command),
    errorCode: "COMMAND_SCHEMA_INVALID",
    reasonCode: "LOCAL_SCHEMA_INVALID",
    issueCodes: issueCodes.length > 0 ? issueCodes : ["INVALID_VALUE"],
    issuePaths: issuePaths.length > 0 ? issuePaths : ["command"],
    isRetryable: false,
  };
};
const gatewayReasonCodeFor = (
  safeMessage: unknown,
): AffiliateAgentCommandDiagnosticReasonCode => {
  if (typeof safeMessage !== "string") return "UNKNOWN";
  switch (safeMessage) {
    case "The gateway input is too deeply nested.":
      return "COMMAND_INPUT_TOO_DEEP";
    case "The gateway input contains a repeated object.":
      return "COMMAND_INPUT_REPEATED_OBJECT";
    case "The gateway input contains too many fields.":
      return "COMMAND_INPUT_TOO_MANY_FIELDS";
    case "The gateway input string exceeds the allowed limit.":
      return "COMMAND_INPUT_STRING_TOO_LARGE";
    case "The gateway input contains an unsupported value.":
      return "COMMAND_INPUT_UNSUPPORTED_VALUE";
    case "The gateway input exceeds the allowed size.":
      return "COMMAND_INPUT_TOO_LARGE";
    case "The command is not permitted by the active role contract.":
    case "The command is not permitted for this claim.":
    case "The external command is not permitted for this claim.":
    case "The lifecycle command is not permitted for this claim.":
    case "The lifecycle command requires a human-directed executor subject.":
      return "COMMAND_OUTSIDE_ROLE";
    case "The external command has no installed adapter.":
    case "The discovery command has no installed external adapter.":
    case "The capture command has no installed adapter.":
    case "The capture command has no installed external adapter.":
    case "The command has no installed transactional adapter.":
    case "The command is not available through a transactional adapter.":
    case "Supply Reviewer work requires a terminal effect adapter.":
    case "The reviewer terminal effect adapter is not installed.":
    case "The lifecycle authority is not installed.":
      return "COMMAND_ADAPTER_UNAVAILABLE";
    case "The external command references data outside the claim manifest.":
      return "COMMAND_EVIDENCE_OUTSIDE_CLAIM";
    case "The operation idempotency key was used for different input.":
      return "COMMAND_IDEMPOTENCY_REUSED";
    case "The command is still in progress.":
    case "The external command is still in progress.":
    case "The lifecycle command is still in progress.":
    case "The operation is still in progress.":
      return "COMMAND_IN_PROGRESS";
    case "A prior external command requires reconciliation before another can start.":
    case "The external command effect is unknown and requires reconciliation.":
    case "The external command receipt requires reconciliation.":
    case "The lifecycle command requires reconciliation.":
    case "The lifecycle command effect is unknown and requires reconciliation.":
    case "The lifecycle receipt requires reconciliation.":
    case "The package validation adapter returned invalid output.":
    case "The package commit adapter returned invalid output.":
      return "COMMAND_PARTIAL_UNRESOLVED";
    case "The package Supply Source does not match the claim.":
      return "PACKAGE_SOURCE_MISMATCH";
    case "The declarative package listing kind does not match the source target kind.":
      return "SOURCE_KIND_MISMATCH";
    case "The package validation manifest does not match the claim.":
      return "PACKAGE_MANIFEST_MISMATCH";
    case "The package commit does not match a successful validation receipt.":
      return "PACKAGE_MANIFEST_MISMATCH";
    case "The package references evidence outside the claim manifest.":
      return "PACKAGE_EVIDENCE_OUTSIDE_CLAIM";
    case "Declarative CSS extraction requires PAGE_HTML listing evidence.":
      return "PAGE_HTML_REQUIRED";
    case "The declarative package selectors are invalid.":
      return "PACKAGE_SELECTOR_INVALID";
    case "The declarative package selectors produced no candidates.":
      return "PACKAGE_NO_CANDIDATES";
    case "The declarative package must map title and official action URL.":
    case "The declarative package output must include title and official action URL.":
      return "PACKAGE_REQUIRED_FIELDS_MISSING";
    case "Legacy sport repair packages require sportEvidence.":
      return "PACKAGE_SPORT_EVIDENCE_REQUIRED";
    case "Legacy sport citations must be included in package evidenceRefs.":
      return "PACKAGE_CITATION_REFERENCE_MISSING";
    case "The package sport evidence run does not match the repair context.":
      return "SPORT_EVIDENCE_RUN_MISMATCH";
    case "The package sport evidence catalog does not match the repair context.":
    case "The current sports catalog differs from the claim catalog.":
      return "SPORT_CATALOG_MISMATCH";
    case "Extracted sports do not match the resolved sport evidence.":
    case "A CONSTANT sportName or sportNames field is not supported by sportEvidence.":
    case "Retained sport determinations cannot include an activity excluded by the source sport scope.":
    case "Source sport scope does not authorize a canonical sport selection. Retained sports require SOURCE_EVIDENCE.":
    case "Executable sport names cannot include an activity excluded by the source sport scope.":
      return "SPORT_OUTPUT_MISMATCH";
    case "Legacy sport repair sport evidence could not be verified.":
    case "sportEvidence is permitted only for legacy sport repairs.":
    case "CONSTANT sportName or sportNames fields are permitted only for legacy sport repairs.":
    case "The package source sport scope hash does not match the repair context.":
    case "sourceSportScopeHash is not permitted without a source sport scope.":
    case "The committed mapping package source sport scope changed after producer commit.":
    case "The committed mapping package has an unexpected source sport scope.":
      return "SPORT_EVIDENCE_INVALID";
    default:
      return "UNKNOWN";
  }
};

export const gatewayCommandRejectionDiagnosticFor = (
  input: Readonly<{
    command: unknown;
    errorCode: unknown;
    safeMessage: unknown;
    isRetryable: boolean;
  }>,
): AffiliateAgentCommandRejectionDiagnostic | null => {
  if (
    !includes(AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_ERROR_CODES, input.errorCode)
  ) return null;
  return {
    version: AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_VERSION,
    event: AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_EVENT,
    stage: "GATEWAY",
    command: commandDiagnosticCommandFor({ command: input.command }),
    errorCode: input.errorCode,
    reasonCode: gatewayReasonCodeFor(input.safeMessage),
    issueCodes: [],
    issuePaths: [],
    isRetryable: input.isRetryable,
  };
};
