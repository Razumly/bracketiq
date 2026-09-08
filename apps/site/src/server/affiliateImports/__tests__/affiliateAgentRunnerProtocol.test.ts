/** @jest-environment node */

import { parseAffiliateAgentRunnerResponse } from "../affiliateAgentRunnerProtocol";

describe("affiliate agent runner response protocol", () => {
  it.each([
    {
      kind: "EVENT",
      requestId: "launch-request",
      event: {
        kind: "TERMINAL_SUBMISSION",
        idempotencyKey: "terminal-key",
        result: { disposition: "NO_ACTION" },
      },
    },
    {
      kind: "RESERVED",
      requestId: "reserve-request",
      reservationId: "reservation-id",
    },
    { kind: "RELEASED", requestId: "release-request" },
    {
      kind: "EVENT",
      requestId: "deadline-request",
      event: { kind: "EXIT", exitCode: 1, reason: "TIMEOUT" },
    },
    { kind: "STARTED", requestId: "launch-request" },
    {
      kind: "ERROR",
      requestId: "correction-request",
      message: "Schema corrections must be submitted by the child through the gateway.",
    },
    { kind: "TERMINATED", requestId: "termination-request" },
  ])("parses valid response %#", (response) => {
    expect(parseAffiliateAgentRunnerResponse(response)).toEqual(response);
  });

  it("accepts the gateway terminal idempotency key length", () => {
    const response = {
      kind: "EVENT" as const,
      requestId: "launch-request",
      event: {
        kind: "TERMINAL_SUBMISSION" as const,
        idempotencyKey: "x".repeat(200),
        result: { disposition: "NO_ACTION" },
      },
    };
    expect(parseAffiliateAgentRunnerResponse(response)).toEqual(response);
    expect(() => parseAffiliateAgentRunnerResponse({
      ...response,
      event: {
        ...response.event,
        idempotencyKey: "x".repeat(201),
      },
    })).toThrow("The affiliate agent runner returned an invalid response.");
  });

  it.each([
    ["null response", null],
    ["unknown response kind", { kind: "UNKNOWN", requestId: "launch-request" }],
    ["missing request id", { kind: "STARTED" }],
    ["malformed request id", { kind: "STARTED", requestId: " launch-request" }],
    [
      "event without an event payload",
      { kind: "EVENT", requestId: "launch-request" },
    ],
    [
      "event with an unknown event kind",
      {
        kind: "EVENT",
        requestId: "launch-request",
        event: { kind: "UNKNOWN", value: {} },
      },
    ],
    [
      "terminal submission without a result",
      {
        kind: "EVENT",
        requestId: "launch-request",
        event: { kind: "TERMINAL_SUBMISSION", idempotencyKey: "terminal-key" },
      },
    ],
    [
      "event with an unknown field",
      {
        kind: "EVENT",
        requestId: "launch-request",
        event: { kind: "EXIT", exitCode: 0, reason: "unexpected" },
      },
    ],
    [
      "response with an unknown field",
      { kind: "STARTED", requestId: "launch-request", phase: "launch" },
    ],
    [
      "error without a message",
      { kind: "ERROR", requestId: "launch-request", message: " " },
    ],
  ] as const)("rejects %s", (_label, response) => {
    expect(() => parseAffiliateAgentRunnerResponse(response)).toThrow(
      "The affiliate agent runner returned an invalid response.",
    );
  });
});
