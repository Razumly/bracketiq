import { z } from "zod";

export const AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_EVENT =
  "affiliate-agent-invocation-diagnostic" as const;
export const AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_MAX_RECORD_BYTES = 1_024 as const;

export const AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_DRIVER_CODES = [
  "OMP_CONFIGURATION_INVALID",
  "OMP_GATEWAY_ADDRESS_INVALID",
  "OMP_PROMPT_TOO_LARGE",
  "OMP_MODEL_GATEWAY_UNAVAILABLE",
  "OMP_MODEL_CATALOG_TOO_LARGE",
  "OMP_REQUIRED_MODEL_UNAVAILABLE",
  "OMP_MODEL_CAPABILITIES_INVALID",
  "OMP_PROMPT_AUTHORITY_MISMATCH",
  "OMP_CLAIM_DEADLINE_EXCEEDED",
  "OMP_MODEL_SELECTOR_INVALID",
  "OMP_WORKSPACE_CONFIGURATION_INVALID",
  "OMP_SESSION_ABORT_FAILED",
  "OMP_PINNED_MODEL_METADATA_UNAVAILABLE",
  "OMP_SESSION_CANCELLED",
  "OMP_SESSION_ISOLATION_INVALID",
  "OMP_SESSION_FAILED",
  "OMP_NO_TERMINAL_RESULT",
  "OMP_DRIVER_FAILED",
] as const;
export type AffiliateAgentInvocationDriverCode =
  typeof AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_DRIVER_CODES[number];

export const AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_PROMPT_OUTCOMES = [
  "NOT_STARTED",
  "PENDING",
  "RETURNED",
  "THREW",
] as const;
export type AffiliateAgentInvocationPromptOutcome =
  typeof AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_PROMPT_OUTCOMES[number];

export const AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_ASSISTANT_STOP_REASONS = [
  "stop",
  "length",
  "toolUse",
  "error",
  "aborted",
  "UNKNOWN",
] as const;
export type AffiliateAgentInvocationAssistantStopReason =
  typeof AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_ASSISTANT_STOP_REASONS[number];

export const AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_ASSISTANT_ERROR_CATEGORIES = [
  "NONE",
  "AUTHENTICATION",
  "RATE_LIMIT",
  "REQUEST",
  "PROVIDER",
  "TIMEOUT",
  "ABORTED",
  "UNKNOWN",
] as const;
export type AffiliateAgentInvocationAssistantErrorCategory =
  typeof AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_ASSISTANT_ERROR_CATEGORIES[number];

export const affiliateAgentInvocationDiagnosticSchema = z.object({
  schemaVersion: z.literal(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_SCHEMA_VERSION),
  event: z.literal(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_EVENT),
  driverCode: z.enum(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_DRIVER_CODES),
  promptOutcome: z.enum(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_PROMPT_OUTCOMES),
  assistantStopReason: z.enum(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_ASSISTANT_STOP_REASONS).nullable(),
  assistantErrorCategory: z.enum(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_ASSISTANT_ERROR_CATEGORIES),
  assistantErrorStatus: z.number().int().min(100).max(599).nullable(),
  terminalFrameObserved: z.boolean(),
}).strict();

export type AffiliateAgentInvocationDiagnostic = z.infer<
  typeof affiliateAgentInvocationDiagnosticSchema
>;

const includes = <T extends string>(values: readonly T[], value: unknown): value is T => (
  typeof value === "string" && values.includes(value as T)
);

const recordValue = (value: unknown): Readonly<Record<string, unknown>> | null => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null
);

export const affiliateAgentInvocationDriverCodeFor = (
  value: unknown,
): AffiliateAgentInvocationDriverCode => {
  const candidate = typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : recordValue(value)?.code;
  return includes(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_DRIVER_CODES, candidate)
    ? candidate
    : "OMP_DRIVER_FAILED";
};

export const affiliateAgentInvocationPromptOutcomeFor = (
  value: unknown,
): AffiliateAgentInvocationPromptOutcome => (
  includes(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_PROMPT_OUTCOMES, value)
    ? value
    : "NOT_STARTED"
);

export const affiliateAgentInvocationAssistantStopReasonFor = (
  value: unknown,
  assistantObserved = true,
): AffiliateAgentInvocationAssistantStopReason | null => {
  if (!assistantObserved || value === null || value === undefined) {
    return assistantObserved ? "UNKNOWN" : null;
  }
  return includes(AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_ASSISTANT_STOP_REASONS, value)
    ? value
    : "UNKNOWN";
};

export const affiliateAgentInvocationAssistantErrorStatusFor = (
  value: unknown,
): number | null => (
  typeof value === "number"
  && Number.isInteger(value)
  && value >= 100
  && value <= 599
    ? value
    : null
);

export const affiliateAgentInvocationAssistantErrorCategoryFor = (input: Readonly<{
  assistantStopReason: unknown;
  assistantErrorStatus: unknown;
  assistantErrorPresent?: boolean;
}>): AffiliateAgentInvocationAssistantErrorCategory => {
  const status = affiliateAgentInvocationAssistantErrorStatusFor(input.assistantErrorStatus);
  if (status === 401 || status === 403) return "AUTHENTICATION";
  if (status === 429) return "RATE_LIMIT";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status !== null && status >= 500) return "PROVIDER";
  if (status !== null && status >= 400) return "REQUEST";
  if (input.assistantStopReason === "aborted") return "ABORTED";
  if (input.assistantStopReason === "error" || input.assistantErrorPresent === true) {
    return "UNKNOWN";
  }
  return "NONE";
};

export type AffiliateAgentInvocationDiagnosticProjectionInput = Readonly<{
  driverCode?: unknown;
  promptOutcome?: unknown;
  assistantObserved?: boolean;
  assistantStopReason?: unknown;
  assistantErrorStatus?: unknown;
  assistantErrorPresent?: boolean;
  terminalFrameObserved?: unknown;
}>;

export const affiliateAgentInvocationDiagnosticFor = (
  input: AffiliateAgentInvocationDiagnosticProjectionInput = {},
): AffiliateAgentInvocationDiagnostic => {
  const assistantObserved = input.assistantObserved === true;
  const assistantStopReason = affiliateAgentInvocationAssistantStopReasonFor(
    input.assistantStopReason,
    assistantObserved,
  );
  const assistantErrorStatus = affiliateAgentInvocationAssistantErrorStatusFor(
    input.assistantErrorStatus,
  );
  return {
    schemaVersion: AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_SCHEMA_VERSION,
    event: AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_EVENT,
    driverCode: affiliateAgentInvocationDriverCodeFor(input.driverCode),
    promptOutcome: affiliateAgentInvocationPromptOutcomeFor(input.promptOutcome),
    assistantStopReason,
    assistantErrorCategory: affiliateAgentInvocationAssistantErrorCategoryFor({
      assistantStopReason,
      assistantErrorStatus,
      assistantErrorPresent: input.assistantErrorPresent === true,
    }),
    assistantErrorStatus,
    terminalFrameObserved: input.terminalFrameObserved === true,
  };
};

const serializedDiagnosticFor = (
  value: unknown,
): { diagnostic: AffiliateAgentInvocationDiagnostic; serialized: string } => {
  const parsed = affiliateAgentInvocationDiagnosticSchema.safeParse(value);
  if (!parsed.success) throw new Error("The affiliate agent invocation diagnostic is invalid.");
  const serialized = JSON.stringify(parsed.data);
  if (Buffer.byteLength(serialized, "utf8") > AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_MAX_RECORD_BYTES) {
    throw new Error("The affiliate agent invocation diagnostic is too large.");
  }
  return { diagnostic: parsed.data, serialized };
};

export const parseAffiliateAgentInvocationDiagnostic = (
  value: unknown,
): AffiliateAgentInvocationDiagnostic | null => {
  try {
    return serializedDiagnosticFor(value).diagnostic;
  } catch {
    return null;
  }
};

export const serializeAffiliateAgentInvocationDiagnostic = (
  value: AffiliateAgentInvocationDiagnostic,
): string => serializedDiagnosticFor(value).serialized;

export type AffiliateAgentInvocationDiagnosticCapture = Readonly<{
  markPromptPending(): void;
  markPromptReturned(): void;
  markPromptThrew(): void;
  observeAssistantMessage(message: unknown): void;
  observeMessages(messages: unknown): void;
  observeEvent(event: unknown): void;
  setTerminalFrameObserved(observed: boolean): void;
  snapshot(driverCode: unknown): AffiliateAgentInvocationDiagnostic;
}>;

const meaningfulErrorField = (
  value: Readonly<Record<string, unknown>>,
  key: string,
): boolean => {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
  const text = value[key];
  return typeof text === "string" && text.trim().length > 0;
};

export const createAffiliateAgentInvocationDiagnosticCapture = (): AffiliateAgentInvocationDiagnosticCapture => {
  let promptOutcome: AffiliateAgentInvocationPromptOutcome = "NOT_STARTED";
  let assistantObserved = false;
  let assistantStopReason: unknown;
  let assistantErrorStatus: unknown;
  let assistantErrorPresent = false;
  let lastAssistantRecord: Readonly<Record<string, unknown>> | null = null;
  let terminalFrameObserved = false;

  const refreshAssistantOutcome = (): void => {
    if (lastAssistantRecord === null) return;
    assistantStopReason = lastAssistantRecord.stopReason;
    assistantErrorStatus = lastAssistantRecord.errorStatus;
    assistantErrorPresent = meaningfulErrorField(lastAssistantRecord, "errorMessage")
      || meaningfulErrorField(lastAssistantRecord, "errorClassificationMessage");
  };
  const observeAssistantMessage = (message: unknown): void => {
    const record = recordValue(message);
    if (record?.role !== "assistant") return;
    assistantObserved = true;
    lastAssistantRecord = record;
    refreshAssistantOutcome();
  };
  const observeMessages = (messages: unknown): void => {
    if (!Array.isArray(messages)) return;
    const assistantRecords: Readonly<Record<string, unknown>>[] = [];
    for (const message of messages) {
      const record = recordValue(message);
      if (record?.role === "assistant") assistantRecords.push(record);
    }
    if (assistantRecords.length === 0) {
      refreshAssistantOutcome();
      return;
    }
    if (lastAssistantRecord === null) {
      observeAssistantMessage(assistantRecords[assistantRecords.length - 1]);
      return;
    }
    const lastObservedIndex = assistantRecords.indexOf(lastAssistantRecord);
    if (lastObservedIndex >= 0 && lastObservedIndex < assistantRecords.length - 1) {
      observeAssistantMessage(assistantRecords[assistantRecords.length - 1]);
      return;
    }
    refreshAssistantOutcome();
  };
  return {
    markPromptPending(): void {
      if (promptOutcome === "NOT_STARTED") promptOutcome = "PENDING";
    },
    markPromptReturned(): void {
      promptOutcome = "RETURNED";
    },
    markPromptThrew(): void {
      promptOutcome = "THREW";
    },
    observeAssistantMessage,
    observeMessages,
    observeEvent(event: unknown): void {
      const record = recordValue(event);
      if (!record) return;
      if (record.type === "message_start" || record.type === "message_update" || record.type === "message_end") {
        observeAssistantMessage(record.message);
      } else if (record.type === "agent_end" && Array.isArray(record.messages)) {
        for (const message of record.messages) observeAssistantMessage(message);
      }
    },
    setTerminalFrameObserved(observed: boolean): void {
      if (observed) terminalFrameObserved = true;
    },
    snapshot(driverCode: unknown): AffiliateAgentInvocationDiagnostic {
      refreshAssistantOutcome();
      return affiliateAgentInvocationDiagnosticFor({
        driverCode,
        promptOutcome,
        assistantObserved,
        assistantStopReason,
        assistantErrorStatus,
        assistantErrorPresent,
        terminalFrameObserved,
      });
    },
  };
};
