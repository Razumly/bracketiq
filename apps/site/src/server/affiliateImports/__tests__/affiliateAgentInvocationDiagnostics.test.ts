/** @jest-environment node */

import {
  AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_MAX_RECORD_BYTES,
  affiliateAgentInvocationDiagnosticFor,
  createAffiliateAgentInvocationDiagnosticCapture,
  parseAffiliateAgentInvocationDiagnostic,
  serializeAffiliateAgentInvocationDiagnostic,
} from "../affiliateAgentInvocationDiagnostics";

describe("affiliate agent invocation diagnostics", () => {
  it("redacts unknown driver codes and keeps only bounded scalar fields", () => {
    const diagnostic = affiliateAgentInvocationDiagnosticFor({
      driverCode: "OMP_SECRET_PROVIDER_TOKEN",
      promptOutcome: "THREW",
      assistantObserved: true,
      assistantStopReason: "error",
      assistantErrorStatus: 401,
      assistantErrorPresent: true,
      terminalFrameObserved: false,
    });
    const serialized = serializeAffiliateAgentInvocationDiagnostic(diagnostic);

    expect(diagnostic.driverCode).toBe("OMP_DRIVER_FAILED");
    expect(serialized).not.toContain("OMP_SECRET_PROVIDER_TOKEN");
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(
      AFFILIATE_AGENT_INVOCATION_DIAGNOSTIC_MAX_RECORD_BYTES,
    );
    expect(parseAffiliateAgentInvocationDiagnostic(JSON.parse(serialized))).toEqual(diagnostic);
  });

  it("retains assistant error scalars after the SDK mutates and prunes the message", () => {
    const capture = createAffiliateAgentInvocationDiagnosticCapture();
    const assistant: {
      role: "assistant";
      stopReason: string;
      errorStatus?: number;
      errorMessage?: string;
    } = {
      role: "assistant",
      stopReason: "stop",
    };
    const olderAssistant = {
      role: "assistant",
      stopReason: "length",
    };
    capture.markPromptPending();
    capture.observeEvent({ type: "message_end", message: assistant });
    assistant.stopReason = "error";
    assistant.errorStatus = 429;
    assistant.errorMessage = "provider secret must not be retained";
    capture.observeMessages([olderAssistant]);
    capture.markPromptThrew();

    expect(capture.snapshot("OMP_SESSION_FAILED")).toEqual({
      schemaVersion: 1,
      event: "affiliate-agent-invocation-diagnostic",
      driverCode: "OMP_SESSION_FAILED",
      promptOutcome: "THREW",
      assistantStopReason: "error",
      assistantErrorCategory: "RATE_LIMIT",
      assistantErrorStatus: 429,
      terminalFrameObserved: false,
    });
  });

  it.each([
    ["returned", "RETURNED"],
    ["thrown", "THREW"],
  ] as const)("records a %s prompt outcome without an assistant result", (_label, outcome) => {
    const capture = createAffiliateAgentInvocationDiagnosticCapture();
    capture.markPromptPending();
    if (outcome === "RETURNED") capture.markPromptReturned();
    else capture.markPromptThrew();

    expect(capture.snapshot("OMP_NO_TERMINAL_RESULT")).toMatchObject({
      promptOutcome: outcome,
      assistantStopReason: null,
      assistantErrorCategory: "NONE",
      assistantErrorStatus: null,
      terminalFrameObserved: false,
    });
  });
  it("does not classify empty assistant error fields as an error", () => {
    const capture = createAffiliateAgentInvocationDiagnosticCapture();
    capture.observeAssistantMessage({
      role: "assistant",
      stopReason: "stop",
      errorMessage: "",
      errorClassificationMessage: undefined,
    });

    expect(capture.snapshot("OMP_NO_TERMINAL_RESULT")).toMatchObject({
      assistantStopReason: "stop",
      assistantErrorCategory: "NONE",
      assistantErrorStatus: null,
    });
  });

  it("uses strict parsing for malformed metadata and invalid status values", () => {
    const valid = affiliateAgentInvocationDiagnosticFor({
      driverCode: "OMP_NO_TERMINAL_RESULT",
      promptOutcome: "RETURNED",
      terminalFrameObserved: true,
    });

    expect(parseAffiliateAgentInvocationDiagnostic({
      ...valid,
      unknown: "secret",
    })).toBeNull();
    expect(parseAffiliateAgentInvocationDiagnostic({
      ...valid,
      assistantErrorStatus: 99,
    })).toBeNull();
    expect(parseAffiliateAgentInvocationDiagnostic(null)).toBeNull();
  });
});
