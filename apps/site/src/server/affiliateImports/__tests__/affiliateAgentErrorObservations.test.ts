import {
  affiliateAgentErrorCategoryFor,
  affiliateAgentErrorObservationFor,
  affiliateAgentErrorObservationSchema,
  affiliateAgentGatewayErrorObservationFor,
} from "../affiliateAgentErrorObservations";

describe("affiliate agent error observations", () => {
  it("keeps safe draft paths without retaining values, dynamic keys, or array positions", () => {
    const observation = affiliateAgentErrorObservationFor({
      tool: "submit_result",
      stage: "LOCAL_VALIDATION",
      errorCode: "LOCAL_DRAFT_INVALID",
      reasonCode: "LOCAL_DRAFT_INVALID",
      issues: [
        {
          code: "invalid_type",
          path: ["payload", "sportEvidence", "sportDeterminations", 42, "evidence", 7, "private-key"],
          message: "private-source-text",
          input: "private-token",
        },
        { code: "private-code", path: ["payload", "private-key"], message: "private-source-text" },
        { code: "invalid_type", path: ["payload", "private-key"] },
      ],
    });

    expect(observation.issueCodes).toEqual(["INVALID_TYPE", "INVALID_VALUE"]);
    expect(observation.issuePaths).toEqual([
      "result.payload.sportEvidence.sportDeterminations.evidence",
      "result.payload",
    ]);
    expect(JSON.stringify(observation)).not.toContain("private-");
    expect(JSON.stringify(observation)).not.toContain("42");
  });

  it("maps an exact Gateway guard to a finite reason and drops arbitrary error prose", () => {
    const known = affiliateAgentGatewayErrorObservationFor({
      tool: "execute_command",
      command: { type: "COMMIT_DECLARATIVE_PACKAGE", data: { token: "private-token" } },
      errorCode: "COMMAND_SCHEMA_INVALID",
      safeMessage: "The package commit validation receipt belongs to a different claim.",
      isRetryable: false,
    });
    const unknown = affiliateAgentGatewayErrorObservationFor({
      tool: "private-tool",
      command: { type: "private-command" },
      errorCode: "private-error-code",
      safeMessage: "private-source-text",
      isRetryable: true,
    });

    expect(known).toMatchObject({
      command: "COMMIT_DECLARATIVE_PACKAGE",
      reasonCode: "PACKAGE_COMMIT_RECEIPT_CLAIM_MISMATCH",
    });
    expect(unknown).toMatchObject({
      tool: "UNKNOWN",
      command: "UNKNOWN",
      errorCode: "UNCLASSIFIED_ERROR",
      reasonCode: "UNKNOWN",
      isRetryable: true,
    });
    expect(JSON.stringify([known, unknown])).not.toContain("private-");
  });

  it("rejects arbitrary stored fields and duplicate or excessive issue lists", () => {
    const observation = affiliateAgentErrorObservationFor({
      tool: "execute_command",
      stage: "LOCAL_SCHEMA",
      errorCode: "COMMAND_SCHEMA_INVALID",
      reasonCode: "LOCAL_SCHEMA_INVALID",
    });

    expect(affiliateAgentErrorObservationSchema.safeParse({
      ...observation,
      message: "private-input",
    }).success).toBe(false);
    expect(affiliateAgentErrorObservationSchema.safeParse({
      ...observation,
      issuePaths: ["command.data.private-key"],
    }).success).toBe(false);
    expect(affiliateAgentErrorObservationSchema.safeParse({
      ...observation,
      issueCodes: ["INVALID_TYPE", "INVALID_TYPE"],
    }).success).toBe(false);
    expect(affiliateAgentErrorObservationSchema.safeParse({
      ...observation,
      issuePaths: Array.from({ length: 9 }, () => "command"),
    }).success).toBe(false);
  });

  it("keeps platform and evidence failures separate from agent input mistakes", () => {
    const categorize = (errorCode: string) => affiliateAgentErrorCategoryFor(
      affiliateAgentErrorObservationFor({ tool: "read_artifact", stage: "TOOL_RUNTIME", errorCode }),
    );

    expect(categorize("GATEWAY_OPERATION_UNVERIFIED")).toBe("PLATFORM");
    expect(categorize("CITATION_TEXT_LIMIT")).toBe("EVIDENCE");
    expect(categorize("ARTIFACT_NOT_PERMITTED")).toBe("AUTHORITY");
    expect(categorize("ARTIFACT_OFFSET_INVALID")).toBe("INPUT");
    expect(categorize("LOCAL_DRAFT_INVALID")).toBe("VALIDATION");
  });
});
