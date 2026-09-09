/** @jest-environment node */

import {
  AFFILIATE_AGENT_RUNNER_MAX_STDERR_TAIL_BYTES,
  classifyAffiliateAgentRunnerChildFailure,
  serializeAffiliateAgentRunnerChildFailureDiagnostic,
  type AffiliateAgentRunnerChildFailureDiagnostic,
} from "../run-affiliate-agent-runner";
import {
  gatewayCommandRejectionDiagnosticFor,
  parseAffiliateAgentCommandRejectionDiagnostic,
} from "../../src/server/affiliateImports/affiliateAgentCommandDiagnostics";

describe("affiliate agent runner child diagnostics", () => {
  it.each([
    ["sandbox namespace denial", "unshare: Operation not permitted", "SANDBOX_NAMESPACE_DENIAL"],
    ["authentication failure", "Authentication failed for the OMP session", "AUTHENTICATION_FAILURE"],
    ["model unavailable", "The selected OMP model is not available", "MODEL_UNAVAILABLE"],
    ["CLI argument rejection", "error: unknown option --legacy-model", "CLI_ARGUMENT_REJECTION"],
    ["filesystem denial", "EACCES: permission denied", "FILESYSTEM_DENIAL"],
    ["rate limiting", "429 Too Many Requests", "RATE_LIMITING"],
    ["network failure", "connect ECONNRESET", "NETWORK_FAILURE"],
  ])("classifies %s without exposing the source text", (_name, stderr, signal) => {
    expect(classifyAffiliateAgentRunnerChildFailure(stderr)).toEqual([signal]);
  });
  it("ignores a nonfatal child warning", () => {
    const warning = "warning: OMP child is using the configured model gateway. "
      + "No terminal result has been submitted yet.";

    expect(classifyAffiliateAgentRunnerChildFailure(warning)).toEqual([]);
  });

  it("serializes bounded public fields without stderr or spawn error messages", () => {
    const secret = "fake-secret-bearing-stderr-value";
    const stderr = `${"prefix".repeat(2_000)}\nAuthentication failed: ${secret}`;
    const serialized = serializeAffiliateAgentRunnerChildFailureDiagnostic({
      exitCode: 23,
      stdoutBytes: 17,
      stderrBytes: Buffer.byteLength(stderr, "utf8"),
      stderrTail: stderr,
      hasOutputOverflow: false,
      hasOutputDecodeError: false,
      spawnErrorCode: { code: "EACCES", message: secret },
    });
    const diagnostic = JSON.parse(serialized) as AffiliateAgentRunnerChildFailureDiagnostic;

    expect(serialized).not.toContain(secret);
    expect(diagnostic).toEqual({
      event: "affiliate-agent-runner-child-failure",
      exitCode: 23,
      stdoutBytes: 17,
      stderrBytes: Buffer.byteLength(stderr, "utf8"),
      stderrTailBytes: AFFILIATE_AGENT_RUNNER_MAX_STDERR_TAIL_BYTES,
      hasOutputOverflow: false,
      hasOutputDecodeError: false,
      signals: ["AUTHENTICATION_FAILURE"],
      spawnErrorCode: "EACCES",
    });
    expect(diagnostic.stderrTailBytes).toBeLessThanOrEqual(
      AFFILIATE_AGENT_RUNNER_MAX_STDERR_TAIL_BYTES,
    );
  });
  it("maps only exact finite Gateway messages to reason codes", () => {
    const packageMismatch = gatewayCommandRejectionDiagnosticFor({
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {},
      },
      errorCode: "COMMAND_NOT_PERMITTED",
      safeMessage: "The package Supply Source does not match the claim.",
      isRetryable: false,
    });
    expect(packageMismatch).toEqual(expect.objectContaining({
      reasonCode: "PACKAGE_SOURCE_MISMATCH",
    }));
    const unknown = gatewayCommandRejectionDiagnosticFor({
      command: { type: "VALIDATE_DECLARATIVE_PACKAGE", data: {} },
      errorCode: "COMMAND_NOT_PERMITTED",
      safeMessage: "unsafe secret-bearing detail",
      isRetryable: false,
    });
    expect(unknown).toEqual(expect.objectContaining({ reasonCode: "UNKNOWN" }));
    expect(JSON.stringify(unknown)).not.toContain("unsafe secret-bearing detail");
  });
  it("retains the source-kind reason without accepting appended source text", () => {
    const safeMessage = "The declarative package listing kind does not match the source target kind.";
    const diagnosticFor = (message: string) => gatewayCommandRejectionDiagnosticFor({
      command: { type: "VALIDATE_DECLARATIVE_PACKAGE", data: {} },
      errorCode: "COMMAND_SCHEMA_INVALID",
      safeMessage: message,
      isRetryable: false,
    });
    expect(diagnosticFor(safeMessage)).toMatchObject({
      reasonCode: "SOURCE_KIND_MISMATCH",
      isRetryable: false,
    });
    expect(parseAffiliateAgentCommandRejectionDiagnostic(diagnosticFor(safeMessage))).toMatchObject({
      stage: "GATEWAY",
      reasonCode: "SOURCE_KIND_MISMATCH",
    });
    const untrusted = diagnosticFor(`${safeMessage} private-source-value`);
    expect(untrusted).toMatchObject({ reasonCode: "UNKNOWN" });
    expect(JSON.stringify(untrusted)).not.toContain("private-source-value");
  });
});
