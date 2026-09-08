/** @jest-environment node */
import { createHash } from "node:crypto";
import type { AffiliateAgentClaimOperation, AffiliateAgentSchemaCorrectionResult, AffiliateAgentTerminalAcceptedResult } from "../agentGateway";
import { AffiliateAgentGatewayError } from "../agentGateway";
import {
  AFFILIATE_AGENT_MAX_TERMINAL_RESULT_CANONICAL_BYTES,
  AFFILIATE_AGENT_MAX_TERMINAL_TRANSPORT_BYTES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  type AffiliateAgentClaimEnvelope,
} from "../agentGatewayContracts";
import { createAffiliateOmpGatewayTools, type AffiliateOmpToolResult } from "../affiliateOmpGatewayTools";

const evidence = Buffer.from("abc😀def", "utf8");
const evidenceHash = createHash("sha256").update(evidence).digest("hex");
const claimFor = (role: "MAPPING_PRODUCER" | "SUPPLY_REVIEWER"): AffiliateAgentClaimEnvelope => {
  const contract = AFFILIATE_AGENT_ROLE_CONTRACTS[role];
  const manifest = {
    schemaVersion: 1 as const,
    entries: [{
      evidenceRef: "evidence-1",
      kind: "PAGE_MARKDOWN" as const,
      artifactId: "artifact-1",
      sha256: evidenceHash,
      mimeType: "text/markdown",
      byteSize: evidence.byteLength,
      retention: "INDEFINITE" as const,
    }],
  };
  const common = {
    schemaVersion: 1 as const,
    jobId: "job-1",
    claimId: "claim-1",
    supplySourceId: "supply-1",
    claimGeneration: 1,
    lifecycleGeneration: 1,
    deploymentContractVersion: 1,
    deploymentContractHash: "a".repeat(64),
    supplyContractVersion: 1,
    supplyContractHash: "b".repeat(64),
    roleContractVersion: contract.version,
    roleContractHash: contract.hash,
    promptTemplateVersion: contract.promptTemplateVersion,
    promptTemplateHash: contract.promptTemplateHash,
    executionClass: "PRODUCTION_OMP" as const,
    workerId: `worker-${role}`,
    invocationId: `invocation-${role}`,
    workspaceId: `workspace-${role}`,
    claimedAt: "2026-09-07T12:00:00.000Z",
    expiresAt: "2026-09-07T12:05:00.000Z",
    evidenceManifest: { ...manifest, hash: hashAffiliateAgentValue(manifest) },
    permittedCommands: contract.permittedCommands,
  };
  return role === "MAPPING_PRODUCER" ? {
    ...common,
    role,
    queue: "AFFILIATE_MAPPING",
    lane: "MAPPING_PRODUCTION",
    subject: { type: role, supplySourceId: "supply-1", mappingJobId: "mapping-1", pass: 1 },
  } : {
    ...common,
    role,
    queue: "AFFILIATE_REVIEW",
    lane: "SUPPLY_REVIEW",
    subject: {
      type: role,
      supplySourceId: "supply-1",
      producerClaimId: "producer-claim",
      producerWorkerId: "producer-worker",
      producerInvocationId: "producer-invocation",
      producerWorkspaceId: "producer-workspace",
      committedPackageHash: "c".repeat(64),
      targetId: "organization-1",
      targetType: "ORGANIZATION",
      reviewPass: 1,
    },
  };
};

const terminalFields = {
  disposition: "SOURCE_INCOMPATIBLE",
  reasonCodes: ["SOURCE_UNSUPPORTED"],
  evidenceRefs: ["evidence-1"],
  summary: "The source layout does not support the mapping contract.",
  payload: { incompatibilityCode: "UNSUPPORTED_LAYOUT" },
};
const accepted = (operation: AffiliateAgentClaimOperation) => {
  if (operation.kind !== "SUBMIT_RESULT") throw new Error("Expected a terminal operation.");
  return {
    kind: "TERMINAL_ACCEPTED" as const,
    receiptId: "receipt-terminal",
    resultHash: hashAffiliateAgentValue(operation.result),
    disposition: "SOURCE_INCOMPATIBLE" as const,
    completedAt: "2026-09-07T12:01:00.000Z",
  };
};
const textValue = (result: AffiliateOmpToolResult) => {
  const block = result.content[0];
  if (block.type !== "text") throw new Error("Expected a text result.");
  return JSON.parse(block.text);
};

it("rejects reviewer writes and model-supplied claim authority before a Gateway effect", async () => {
  const perform = jest.fn();
  const reviewer = createAffiliateOmpGatewayTools({
    claim: claimFor("SUPPLY_REVIEWER"), token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
  });
  const denied = await reviewer.execute("execute_command", {
    command: { type: "CAPTURE_CLAIM_URL", data: { urlRef: "url-1", captureProfileRef: "profile-1" } },
  });
  expect(denied.isError).toBe(true);
  const producer = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
  });
  const forged = await producer.execute("submit_result", { ...terminalFields, jobId: "another-job", authorization: { token: "another-token" } });
  expect(forged.isError).toBe(true);
  expect(perform).not.toHaveBeenCalled();
});

it("serializes an in-flight effect before terminal acceptance and denies later effects", async () => {
  let finishCapture!: () => void;
  const capture = new Promise<void>((resolve) => { finishCapture = resolve; });
  const effects: string[] = [];
  const perform = jest.fn();
  perform.mockImplementation(async (operation: AffiliateAgentClaimOperation) => {
    if (operation.kind === "EXECUTE_COMMAND") {
      effects.push("capture-start");
      await capture;
      effects.push("capture-end");
      return { kind: "COMMAND_SUCCEEDED", receiptId: "capture-receipt", commandType: "CAPTURE_CLAIM_URL", responseHash: "a".repeat(64), safeOutput: {} };
    }
    effects.push("terminal");
    return accepted(operation);
  });
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token", gateway: { perform }, onTerminal,
  });
  const command = { command: { type: "CAPTURE_CLAIM_URL", data: { urlRef: "url-1", captureProfileRef: "profile-1" } } };
  const first = tools.execute("execute_command", command);
  const terminal = tools.execute("submit_result", terminalFields);
  await Promise.resolve();
  expect(onTerminal).not.toHaveBeenCalled();
  finishCapture();
  await first;
  expect((await terminal).isError).toBeUndefined();
  expect(effects).toEqual(["capture-start", "capture-end", "terminal"]);
  expect(onTerminal).toHaveBeenCalledTimes(1);
  expect((await tools.execute("execute_command", command)).isError).toBe(true);
  expect(effects).toEqual(["capture-start", "capture-end", "terminal"]);
});

it("keeps correction feedback in the invocation without replaying the rejected submission", async () => {
  const correction = {
    kind: "SCHEMA_CORRECTION_REQUIRED" as const,
    receiptId: "receipt-correction",
    submissionNumber: 1 as const,
    remainingSubmissions: 2 as const,
    issues: [],
    correctionPrompt: "Revise the evidence references.",
  };
  const recorded = new Map<string, AffiliateAgentTerminalAcceptedResult | AffiliateAgentSchemaCorrectionResult>();
  const perform = jest.fn();
  perform.mockImplementation(async (operation: AffiliateAgentClaimOperation) => {
    const replay = recorded.get(operation.idempotencyKey);
    if (replay) return replay;
    const result = recorded.size === 0 ? correction : accepted(operation);
    recorded.set(operation.idempotencyKey, result);
    return result;
  });
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token", gateway: { perform }, onTerminal,
  });
  expect(textValue(await tools.execute("submit_result", terminalFields)).kind).toBe("SCHEMA_CORRECTION_REQUIRED");
  expect(onTerminal).not.toHaveBeenCalled();
  expect(textValue(await tools.execute("submit_result", terminalFields)).kind).toBe("TERMINAL_ACCEPTED");
  expect(onTerminal).toHaveBeenCalledTimes(1);
  const frame = onTerminal.mock.calls[0][0];
  expect(recorded.get(frame.idempotencyKey)).toEqual(expect.objectContaining({ resultHash: hashAffiliateAgentValue(frame.result) }));
});
it("emits the same terminal frame when the Gateway records an invocation failure", async () => {
  const perform = jest.fn().mockResolvedValue({
    kind: "INVOCATION_FAILED",
    receiptId: "receipt-failure",
    failureCode: "RESULT_SCHEMA_INVALID",
    invocationFailureCount: 1,
    nextAttemptAt: null,
    isPipelineBlocked: false,
  });
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"),
    token: "private-claim-token",
    gateway: { perform },
    onTerminal,
  });
  const outcome = await tools.execute("submit_result", terminalFields);
  expect(outcome.isError).toBe(true);
  expect(onTerminal).toHaveBeenCalledTimes(1);
  const operation = perform.mock.calls[0]?.[0] as Extract<
    AffiliateAgentClaimOperation,
    { kind: "SUBMIT_RESULT" }
  >;
  const frame = onTerminal.mock.calls[0]?.[0];
  expect(frame).toMatchObject({
    kind: "TERMINAL_SUBMISSION",
    idempotencyKey: operation.idempotencyKey,
    result: operation.result,
  });
});

it("replays the exact terminal operation after a durable invocation failure loses its response", async () => {
  const durableOutcome = {
    kind: "INVOCATION_FAILED" as const,
    receiptId: "receipt-failure",
    failureCode: "RESULT_SCHEMA_INVALID" as const,
    invocationFailureCount: 1,
    nextAttemptAt: null,
    isPipelineBlocked: false,
  };
  let durableOperation: Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }> | null = null;
  let loseFirstResponse = true;
  const perform = jest.fn(async (operation: AffiliateAgentClaimOperation) => {
    if (operation.kind !== "SUBMIT_RESULT") throw new Error("Expected terminal operation.");
    if (loseFirstResponse) {
      loseFirstResponse = false;
      durableOperation = operation;
      throw new Error("Connection closed after durable Gateway write.");
    }
    if (durableOperation === null) throw new Error("Expected a durable operation.");
    expect(operation.idempotencyKey).toBe(durableOperation.idempotencyKey);
    expect(hashAffiliateAgentValue(operation.result)).toBe(
      hashAffiliateAgentValue(durableOperation.result),
    );
    return durableOutcome;
  });
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"),
    token: "private-claim-token",
    gateway: { perform },
    onTerminal,
  });

  const firstOutcome = await tools.execute("submit_result", terminalFields);
  expect(firstOutcome.isError).toBe(true);
  expect(onTerminal).toHaveBeenCalledTimes(1);
  const frame = onTerminal.mock.calls[0]?.[0];
  expect(frame).toEqual(expect.objectContaining({
    kind: "TERMINAL_SUBMISSION",
    idempotencyKey: durableOperation?.idempotencyKey,
    result: durableOperation?.result,
  }));

  const firstOperation = durableOperation;
  if (firstOperation === null || frame === undefined) {
    throw new Error("Expected the lost terminal operation and replay frame.");
  }
  const replay = await perform({
    kind: "SUBMIT_RESULT",
    idempotencyKey: frame.idempotencyKey,
    authorization: firstOperation.authorization,
    result: frame.result,
  });
  expect(replay).toEqual(durableOutcome);
  expect(perform).toHaveBeenCalledTimes(2);
});
it("forwards a maximal valid result body with its framing overhead", async () => {
  const correction = {
    kind: "SCHEMA_CORRECTION_REQUIRED" as const,
    receiptId: "receipt-correction",
    submissionNumber: 1 as const,
    remainingSubmissions: 2 as const,
    issues: [],
    correctionPrompt: "The Gateway response was not confirmed.",
  };
  const probe = async (payloadSize: number) => {
    const perform = jest.fn().mockResolvedValue(correction);
    const tools = createAffiliateOmpGatewayTools({
      claim: claimFor("MAPPING_PRODUCER"),
      token: "private-claim-token",
      gateway: { perform },
      onTerminal: jest.fn(),
    });
    await tools.execute("submit_result", {
      ...terminalFields,
      payload: { body: "x".repeat(payloadSize) },
    });
    return perform.mock.calls[0]?.[0] as Extract<
      AffiliateAgentClaimOperation,
      { kind: "SUBMIT_RESULT" }
    > | undefined;
  };

  let low = 0;
  let high = 70_000;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (await probe(candidate)) low = candidate;
    else high = candidate - 1;
  }

  const perform = jest.fn(async (operation: AffiliateAgentClaimOperation) => accepted(operation));
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"),
    token: "private-claim-token",
    gateway: { perform },
    onTerminal,
  });
  const outcome = await tools.execute("submit_result", {
    ...terminalFields,
    payload: { body: "x".repeat(low) },
  });
  expect(outcome.isError).toBeUndefined();
  const operation = perform.mock.calls[0]?.[0] as Extract<
    AffiliateAgentClaimOperation,
    { kind: "SUBMIT_RESULT" }
  >;
  const frame = onTerminal.mock.calls[0]?.[0];
  expect(Buffer.byteLength(canonicalizeAffiliateAgentValue(operation.result), "utf8"))
    .toBeLessThanOrEqual(AFFILIATE_AGENT_MAX_TERMINAL_RESULT_CANONICAL_BYTES);
  expect(Buffer.byteLength(`${JSON.stringify(frame)}\n`, "utf8"))
    .toBeGreaterThan(AFFILIATE_AGENT_MAX_TERMINAL_TRANSPORT_BYTES);
  expect(onTerminal).toHaveBeenCalledTimes(1);
});

it("rejects a terminal frame that exceeds the trusted transport bound before Gateway I/O", async () => {
  const perform = jest.fn();
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"),
    token: "private-claim-token",
    gateway: { perform },
    onTerminal,
  });
  const outcome = await tools.execute("submit_result", {
    ...terminalFields,
    payload: { oversized: "x".repeat(66_000) },
  });
  expect(outcome.isError).toBe(true);
  expect(textValue(outcome).code).toBe("TERMINAL_RESULT_TOO_LARGE");
  expect(perform).not.toHaveBeenCalled();
  expect(onTerminal).not.toHaveBeenCalled();
});

it("sends an identity-bound candidate to the Gateway when semantic validation fails locally", async () => {
  const perform = jest.fn().mockResolvedValue({
    kind: "SCHEMA_CORRECTION_REQUIRED",
    receiptId: "receipt-correction",
    submissionNumber: 1,
    remainingSubmissions: 2,
    issues: [],
    correctionPrompt: "Supply the required payload fields.",
  });
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"),
    token: "private-claim-token",
    gateway: { perform },
    onTerminal: jest.fn(),
  });
  await tools.execute("submit_result", { ...terminalFields, payload: {} });
  const operation = perform.mock.calls[0]?.[0] as Extract<
    AffiliateAgentClaimOperation,
    { kind: "SUBMIT_RESULT" }
  >;
  expect(operation.result).toMatchObject({
    jobId: "job-1",
    claimId: "claim-1",
    payload: {},
  });
});

it("preserves Unicode across bounded evidence pages and refuses corrupt bytes", async () => {
  const artifact = {
    kind: "ARTIFACT_READ" as const,
    receiptId: "artifact-receipt",
    evidenceRef: "evidence-1",
    sha256: evidenceHash,
    mimeType: "text/markdown",
    byteSize: evidence.byteLength,
    sourceUrl: "https://evidence.example.test/requested",
    finalUrl: "https://evidence.example.test/final",
    bytes: evidence,
  };
  const perform = jest.fn().mockResolvedValue(artifact);
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
  });
  const first = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", limit: 4 }));
  expect(first.sourceUrl).toBe(artifact.sourceUrl);
  expect(first.finalUrl).toBe(artifact.finalUrl);
  const cached = textValue(await tools.execute("read_artifact", {
    evidenceRef: "evidence-1",
    limit: 4,
  }));
  expect(cached).toEqual(first);
  const second = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", offset: first.nextOffset, limit: 1 }));
  const third = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", offset: second.nextOffset }));
  expect(second.sourceUrl).toBe(artifact.sourceUrl);
  expect(second.finalUrl).toBe(artifact.finalUrl);
  expect(third.sourceUrl).toBe(artifact.sourceUrl);
  expect(third.finalUrl).toBe(artifact.finalUrl);
  expect(first.text + second.text + third.text).toBe(evidence.toString("utf8"));
  expect(third.endOfArtifact).toBe(true);
  const corrupt = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token",
    gateway: { perform: jest.fn().mockResolvedValue({ ...artifact, bytes: Buffer.from("wrong") }) },
    onTerminal: jest.fn(),
  });
  expect((await corrupt.execute("read_artifact", { evidenceRef: "evidence-1" })).isError).toBe(true);
  expect(corrupt.isClosed).toBe(true);
});
it("preserves immutable URL metadata in image evidence", async () => {
  const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10]);
  const baseClaim = claimFor("MAPPING_PRODUCER");
  const baseEntry = baseClaim.evidenceManifest.entries[0];
  if (!baseEntry) throw new Error("Expected a fixture evidence entry.");
  const manifestWithoutHash = {
    schemaVersion: baseClaim.evidenceManifest.schemaVersion,
    entries: [{
      ...baseEntry,
      kind: "PAGE_SCREENSHOT" as const,
      sha256: createHash("sha256").update(imageBytes).digest("hex"),
      mimeType: "image/png",
      byteSize: imageBytes.byteLength,
    }],
  };
  const claim = {
    ...baseClaim,
    evidenceManifest: {
      ...manifestWithoutHash,
      hash: hashAffiliateAgentValue(manifestWithoutHash),
    },
  };
  const artifact = {
    kind: "ARTIFACT_READ" as const,
    receiptId: "image-receipt",
    evidenceRef: "evidence-1",
    sha256: manifestWithoutHash.entries[0]!.sha256,
    mimeType: "image/png",
    byteSize: imageBytes.byteLength,
    sourceUrl: "https://evidence.example.test/screenshot",
    finalUrl: "https://cdn.example.test/screenshot.png",
    bytes: imageBytes,
  };
  const tools = createAffiliateOmpGatewayTools({
    claim,
    token: "private-claim-token",
    gateway: { perform: jest.fn().mockResolvedValue(artifact) },
    onTerminal: jest.fn(),
  });
  const result = await tools.execute("read_artifact", { evidenceRef: "evidence-1" });
  expect(textValue(result)).toEqual({
    evidenceRef: artifact.evidenceRef,
    sha256: artifact.sha256,
    sourceUrl: artifact.sourceUrl,
    finalUrl: artifact.finalUrl,
  });
  expect(result.content[1]).toEqual({
    type: "image",
    data: imageBytes.toString("base64"),
    mimeType: "image/png",
  });
});
it("bounds serialized Unicode text pages while preserving the complete artifact", async () => {
  const largeText = "😀".repeat(40_000);
  const largeBytes = Buffer.from(largeText, "utf8");
  const baseClaim = claimFor("MAPPING_PRODUCER");
  const baseEntry = baseClaim.evidenceManifest.entries[0];
  if (!baseEntry) throw new Error("Expected a fixture evidence entry.");
  const manifestWithoutHash = {
    schemaVersion: baseClaim.evidenceManifest.schemaVersion,
    entries: [{
      ...baseEntry,
      sha256: createHash("sha256").update(largeBytes).digest("hex"),
      byteSize: largeBytes.byteLength,
    }],
  };
  const claim = {
    ...baseClaim,
    evidenceManifest: {
      ...manifestWithoutHash,
      hash: hashAffiliateAgentValue(manifestWithoutHash),
    },
  };
  const artifact = {
    kind: "ARTIFACT_READ" as const,
    receiptId: "large-artifact-receipt",
    evidenceRef: "evidence-1",
    sha256: manifestWithoutHash.entries[0]!.sha256,
    mimeType: "text/markdown",
    sourceUrl: "https://evidence.example.test/requested",
    finalUrl: "https://evidence.example.test/final",
    byteSize: largeBytes.byteLength,
    bytes: largeBytes,
  };
  const tools = createAffiliateOmpGatewayTools({
    claim,
    token: "private-claim-token",
    gateway: { perform: jest.fn().mockResolvedValue(artifact) },
    onTerminal: jest.fn(),
  });
  let offset = 0;
  let reconstructed = "";
  while (true) {
    const pageResult = await tools.execute("read_artifact", {
      evidenceRef: "evidence-1",
      offset,
      limit: 65_536,
    });
    const serialized = pageResult.content[0];
    if (serialized.type !== "text") throw new Error("Expected a text page.");
    expect(Buffer.byteLength(serialized.text, "utf8")).toBeLessThan(48 * 1024);
    const page = textValue(pageResult);
    reconstructed += page.text;
    if (page.endOfArtifact) break;
    offset = page.nextOffset;
  }
  expect(reconstructed).toBe(largeText);
});

it("reuses pending command authority instead of starting a duplicate effect", async () => {
  let pendingKey: string | null = null;
  const perform = jest.fn();
  perform.mockImplementation(async (operation: AffiliateAgentClaimOperation) => {
    if (pendingKey === null) {
      pendingKey = operation.idempotencyKey;
      throw new AffiliateAgentGatewayError({
        code: "OPERATION_IN_PROGRESS",
        isRetryable: true,
        safeMessage: "The capture is still in progress.",
      });
    }
    if (operation.idempotencyKey !== pendingKey) {
      throw new AffiliateAgentGatewayError({
        code: "PARTIAL_COMMAND_UNRESOLVED",
        isRetryable: false,
        safeMessage: "The previous capture must resolve first.",
      });
    }
    return { kind: "COMMAND_SUCCEEDED", receiptId: "capture-receipt", commandType: "CAPTURE_CLAIM_URL", responseHash: "a".repeat(64), safeOutput: {} };
  });
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
  });
  const command = { command: { type: "CAPTURE_CLAIM_URL", data: { urlRef: "url-1", captureProfileRef: "profile-1" } } };
  expect(textValue(await tools.execute("execute_command", command)).code).toBe("OPERATION_IN_PROGRESS");
  expect(textValue(await tools.execute("execute_command", command)).kind).toBe("COMMAND_SUCCEEDED");
});
it("emits bounded redacted diagnostics for local and Gateway command rejection", async () => {
  const secret = "https://secret.example/credential?token=not-a-log";
  const diagnostics: Array<Record<string, unknown>> = [];
  const perform = jest.fn().mockRejectedValue(new AffiliateAgentGatewayError({
    code: "COMMAND_NOT_PERMITTED",
    isRetryable: false,
    safeMessage: `unsafe implementation detail ${secret}`,
  }));
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"),
    token: "private-claim-token",
    gateway: { perform },
    onTerminal: jest.fn(),
    onCommandRejection: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  });
  const command = {
    command: {
      type: "CAPTURE_CLAIM_URL",
      data: { urlRef: "url-1", captureProfileRef: "profile-1" },
    },
  };
  expect((await tools.execute("execute_command", command)).isError).toBe(true);
  expect((await tools.execute("execute_command", {
    command: { type: "CAPTURE_CLAIM_URL", data: { urlRef: secret, captureProfileRef: "" } },
  })).isError).toBe(true);
  expect(diagnostics).toEqual([
    expect.objectContaining({
      version: 1,
      event: "affiliate-agent-command-rejection",
      stage: "GATEWAY",
      command: "CAPTURE_CLAIM_URL",
      errorCode: "COMMAND_NOT_PERMITTED",
      issueCodes: [],
      issuePaths: [],
      isRetryable: false,
    }),
    expect.objectContaining({
      stage: "LOCAL_SCHEMA",
      command: "CAPTURE_CLAIM_URL",
      errorCode: "COMMAND_SCHEMA_INVALID",
      issueCodes: ["MISSING_VALUE"],
      issuePaths: ["command.data.captureProfileRef"],
    }),
  ]);
  expect(JSON.stringify(diagnostics)).not.toContain(secret);
  for (let index = 0; index < 40; index += 1) {
    await tools.execute("execute_command", {
      command: { type: "CAPTURE_CLAIM_URL", data: { urlRef: secret, captureProfileRef: "" } },
    });
  }
  expect(diagnostics.length).toBeLessThanOrEqual(32);
  expect(Buffer.byteLength(JSON.stringify(diagnostics), "utf8")).toBeLessThanOrEqual(16 * 1_024);
});
