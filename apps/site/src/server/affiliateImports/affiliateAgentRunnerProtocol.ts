import type {
  AffiliateAgentProcessEvent,
  AffiliateAgentProcessInput,
} from "./agentGatewayAdapters";

export const AFFILIATE_AGENT_WORKER_ID_MAX_LENGTH = 64 as const;
export const AFFILIATE_AGENT_INVOCATION_ID_MAX_LENGTH = 128 as const;
export const AFFILIATE_AGENT_WORKSPACE_ID_MAX_LENGTH = 200 as const;

export type AffiliateAgentRunnerLaunchRequest = Readonly<{
  kind: "LAUNCH";
  requestId: string;
  signature: string;
  reservationId: string;
  workerId: string;
  invocationId: string;
  workspaceId: string;
  workspaceMode: "READ_ONLY" | "READ_WRITE";
  prompt: string;
  environment: Readonly<Record<string, string>>;
  workspacePath: string;
}>;

export type AffiliateAgentRunnerReserveRequest = Readonly<{
  kind: "RESERVE";
  requestId: string;
  signature: string;
  workerId: string;
  invocationId: string;
}>;

export type AffiliateAgentRunnerReleaseRequest = Readonly<{
  kind: "RELEASE";
  requestId: string;
  signature: string;
  reservationId: string;
}>;

export type AffiliateAgentRunnerCorrectionRequest = Readonly<{
  kind: "CORRECTION";
  requestId: string;
  signature: string;
  correctionPrompt: AffiliateAgentProcessInput["correctionPrompt"];
}>;

export type AffiliateAgentRunnerTerminationRequest = Readonly<{
  kind: "TERMINATE" | "FORCE_TERMINATE";
  requestId: string;
  signature: string;
}>;

export type AffiliateAgentRunnerRequest =
  | AffiliateAgentRunnerLaunchRequest
  | AffiliateAgentRunnerReserveRequest
  | AffiliateAgentRunnerReleaseRequest
  | AffiliateAgentRunnerCorrectionRequest
  | AffiliateAgentRunnerTerminationRequest;

export type AffiliateAgentRunnerResponse =
  | Readonly<{ kind: "RESERVED"; requestId: string; reservationId: string }>
  | Readonly<{ kind: "RELEASED"; requestId: string }>
  | Readonly<{ kind: "STARTED"; requestId: string }>
  | Readonly<{
      kind: "EVENT";
      requestId: string;
      event: AffiliateAgentProcessEvent;
    }>
  | Readonly<{ kind: "TERMINATED"; requestId: string }>
  | Readonly<{ kind: "ERROR"; requestId: string; message: string }>;
type AffiliateAgentRunnerResponseRecord = Readonly<Record<string, unknown>>;

const isResponseRecord = (
  value: unknown,
): value is AffiliateAgentRunnerResponseRecord => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
);

const hasResponseKeys = (
  value: AffiliateAgentRunnerResponseRecord,
  keys: readonly string[],
): boolean => {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
};

const invalidRunnerResponse = (): never => {
  throw new Error("The affiliate agent runner returned an invalid response.");
};

const requestIdFrom = (value: unknown): string | null => (
  typeof value === "string"
  && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
    ? value
    : null
);


export const AFFILIATE_AGENT_TERMINAL_IDEMPOTENCY_KEY_MAX_LENGTH = 200 as const;

const terminalIdempotencyKeyFrom = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0
    && normalized.length <= AFFILIATE_AGENT_TERMINAL_IDEMPOTENCY_KEY_MAX_LENGTH
    ? value
    : null;
};

type AffiliateAgentRunnerTerminalSubmissionEventRecord =
  AffiliateAgentRunnerResponseRecord & Readonly<{
    kind: "TERMINAL_SUBMISSION";
    idempotencyKey: string;
    result: unknown;
  }>;

type AffiliateAgentRunnerExitEventRecord =
  AffiliateAgentRunnerResponseRecord & Readonly<{
    kind: "EXIT";
    exitCode: number;
    reason?: "TIMEOUT";
  }>;

const isExitEventRecord = (
  value: AffiliateAgentRunnerResponseRecord,
): value is AffiliateAgentRunnerExitEventRecord => (
  value.kind === "EXIT"
  && (
    hasResponseKeys(value, ["kind", "exitCode"])
    || (
      hasResponseKeys(value, ["kind", "exitCode", "reason"])
      && value.reason === "TIMEOUT"
    )
  )
  && typeof value.exitCode === "number"
  && Number.isInteger(value.exitCode)
);
const isTerminalSubmissionEventRecord = (
  value: AffiliateAgentRunnerResponseRecord,
): value is AffiliateAgentRunnerTerminalSubmissionEventRecord => (
  value.kind === "TERMINAL_SUBMISSION"
  && hasResponseKeys(value, ["kind", "idempotencyKey", "result"])
  && terminalIdempotencyKeyFrom(value.idempotencyKey) !== null
  && value.result !== null
  && typeof value.result === "object"
  && !Array.isArray(value.result)
);

const parseAffiliateAgentRunnerProcessEvent = (
  value: unknown,
): AffiliateAgentProcessEvent => {
  if (!isResponseRecord(value)) return invalidRunnerResponse();
  if (isTerminalSubmissionEventRecord(value)) {
    return {
      kind: "TERMINAL_SUBMISSION",
      idempotencyKey: value.idempotencyKey,
      result: value.result,
    };
  }
  if (isExitEventRecord(value)) {
    return {
      kind: "EXIT",
      exitCode: value.exitCode,
      ...(value.reason === "TIMEOUT" ? { reason: value.reason } : {}),
    };
  }
  return invalidRunnerResponse();
};

const requireResponseKeys = (
  value: AffiliateAgentRunnerResponseRecord,
  keys: readonly string[],
): void => {
  if (!hasResponseKeys(value, keys)) invalidRunnerResponse();
};

const messageFrom = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    return invalidRunnerResponse();
  }
  return value;
};

export const parseAffiliateAgentRunnerResponse = (
  value: unknown,
): AffiliateAgentRunnerResponse => {
  if (!isResponseRecord(value)) return invalidRunnerResponse();
  const requestId = requestIdFrom(value.requestId);
  if (requestId === null) return invalidRunnerResponse();
  switch (value.kind) {
    case "EVENT":
      requireResponseKeys(value, ["kind", "requestId", "event"]);
      return {
        kind: "EVENT",
        requestId,
        event: parseAffiliateAgentRunnerProcessEvent(value.event),
      };
    case "RESERVED": {
      requireResponseKeys(value, ["kind", "requestId", "reservationId"]);
      const reservationId = requestIdFrom(value.reservationId);
      if (reservationId === null) return invalidRunnerResponse();
      return { kind: "RESERVED", requestId, reservationId };
    }
    case "RELEASED":
      requireResponseKeys(value, ["kind", "requestId"]);
      return { kind: "RELEASED", requestId };
    case "STARTED":
      requireResponseKeys(value, ["kind", "requestId"]);
      return { kind: "STARTED", requestId };
    case "TERMINATED":
      requireResponseKeys(value, ["kind", "requestId"]);
      return { kind: "TERMINATED", requestId };
    case "ERROR":
      requireResponseKeys(value, ["kind", "requestId", "message"]);
      return { kind: "ERROR", requestId, message: messageFrom(value.message) };
    default:
      return invalidRunnerResponse();
  }
};
