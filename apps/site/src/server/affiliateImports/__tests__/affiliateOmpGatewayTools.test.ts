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
import { buildAffiliateSportsCatalogSnapshot } from "../affiliateSportsCatalog";

const legacyRepairFixture = (html: string | Buffer = '<p>Outdoor&nbsp;soccer on grass fields</p>') => {
  const bytes = typeof html === "string" ? Buffer.from(html, "utf8") : html;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const catalog = buildAffiliateSportsCatalogSnapshot(
    [{ id: "grass-soccer", name: "Grass Soccer" }], "2026-09-07T12:00:00.000Z",
  );
  const base = claimFor("MAPPING_PRODUCER");
  const manifest = {
    schemaVersion: 1 as const,
    entries: [{
      evidenceRef: "evidence-1", kind: "PAGE_HTML" as const, artifactId: "artifact-1",
      sha256, mimeType: "text/html", byteSize: bytes.byteLength, retention: "INDEFINITE" as const,
    }],
  };
  const claim: AffiliateAgentClaimEnvelope = {
    ...base,
    role: "MAPPING_PRODUCER", queue: "AFFILIATE_MAPPING", lane: "MAPPING_PRODUCTION",
    evidenceManifest: { ...manifest, hash: hashAffiliateAgentValue(manifest) },
    subject: {
      type: "MAPPING_PRODUCER", supplySourceId: "supply-1", mappingJobId: "mapping-1",
      listingKind: "CLUB", pass: 1,
      repairContext: { kind: "LEGACY_SPORT_REPAIR", intakeId: "intake-1", evidenceRunId: "run-1", sportsCatalog: catalog },
    },
  };
  const artifact = {
    kind: "ARTIFACT_READ" as const, receiptId: "read-receipt", evidenceRef: "evidence-1",
    sha256, byteSize: bytes.byteLength, mimeType: "text/html", bytes,
    sourceUrl: "https://example.test/sports", finalUrl: "https://example.test/sports",
  };
  const draft = {
    disposition: "CONTRACT_GAP", reasonCodes: ["CONTRACT_REQUIREMENT_MISSING"], evidenceRefs: ["evidence-1"],
    summary: "A separate mapping requirement needs review.",
    payload: {
      contractArea: "MAPPING_EVIDENCE", requestedChange: "Define the missing mapping requirement.",
      sportEvidence: {
        evidenceRunId: "run-1", sportsCatalogSha256: catalog.sha256,
        sportDeterminations: [{
          sourceLabels: ["Soccer"], status: "RESOLVED", resolutionBasis: "SOURCE_EVIDENCE",
          canonicalSportNames: ["Grass Soccer"], rationale: "The source identifies grass fields.",
          evidence: [{
            artifactId: "artifact-1", artifactSha256: sha256, artifactKind: "PAGE_HTML",
            pageUrl: "https://example.test/sports", excerpt: "Outdoor soccer on grass fields",
          }],
        }],
      },
    },
  };
  return { claim, artifact, draft };
};

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
    subject: { type: role, supplySourceId: "supply-1", mappingJobId: "mapping-1", listingKind: "EVENT", pass: 1 },
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

const sourceExclusionFixture = () => {
  const evidence = legacyRepairFixture("<p>Track and Field events for young athletes.</p>");
  const base = claimFor("SUPPLY_REVIEWER");
  if (base.role !== "SUPPLY_REVIEWER" || base.subject.type !== "SUPPLY_REVIEWER"
    || evidence.claim.subject.type !== "MAPPING_PRODUCER" || !evidence.claim.subject.repairContext) {
    throw new Error("Expected source-review fixture context.");
  }
  const claim: AffiliateAgentClaimEnvelope = {
    ...base,
    executionBudget: "SINGLE_CLAIM",
    evidenceManifest: evidence.claim.evidenceManifest,
    subject: {
      type: "SOURCE_EXCLUSION_REVIEW",
      supplySourceId: base.subject.supplySourceId,
      producerClaimId: base.subject.producerClaimId,
      producerWorkerId: base.subject.producerWorkerId,
      producerInvocationId: base.subject.producerInvocationId,
      producerWorkspaceId: base.subject.producerWorkspaceId,
      producerResultHash: "d".repeat(64),
      requestHash: "e".repeat(64),
      requestedByActorId: "affiliate-gateway-operator",
      requestReason: "Review the blacklisted source.",
      repairContext: evidence.claim.subject.repairContext,
    },
  };
  const determination = evidence.draft.payload.sportEvidence.sportDeterminations[0];
  const draft = {
    disposition: "SOURCE_EXCLUSION_ASSESSED",
    reasonCodes: ["SPORT_BLACKLISTED"],
    evidenceRefs: ["evidence-1"],
    summary: "The source describes only blacklisted Track and Field.",
    payload: {
      supplySourceId: claim.supplySourceId,
      recommendation: "EXCLUDE",
      sportEvidence: {
        ...evidence.draft.payload.sportEvidence,
        sportDeterminations: [{
          ...determination,
          sourceLabels: ["Track and Field"],
          status: "BLACKLISTED",
          canonicalSportNames: [],
          rationale: "The first-party page identifies the blacklisted activity.",
          evidence: [{ ...determination.evidence[0], excerpt: "Track and Field events for young athletes." }],
        }],
      },
    },
  };
  return { claim, artifact: evidence.artifact, draft };
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

it.each(["check_result", "submit_result"])("redacts top-level %s draft errors", async (toolName) => {
  const perform = jest.fn();
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token", gateway: { perform }, onTerminal,
  });
  const privateKey = "private-undeclared-key";
  const privateValue = "private-draft-value";
  const response = await tools.execute(toolName, { ...terminalFields, [privateKey]: privateValue });
  expect(textValue(response)).toMatchObject({
    kind: "DRAFT_INVALID", authoritative: false, checked: ["INPUT_SCHEMA"],
    issues: [{ path: [], code: "UNKNOWN_KEY" }],
  });
  expect(JSON.stringify(response)).not.toContain(privateKey);
  expect(JSON.stringify(response)).not.toContain(privateValue);
  expect(perform).not.toHaveBeenCalled();
  expect(onTerminal).not.toHaveBeenCalled();
  expect(tools.isClosed).toBe(false);
});

it("checks a fresh source-only assessment before one terminal exclusion submission", async () => {
  const fixture = sourceExclusionFixture();
  const perform = jest.fn(async (operation: AffiliateAgentClaimOperation) => {
    if (operation.kind === "READ_ARTIFACT") return fixture.artifact;
    if (operation.kind === "SUBMIT_RESULT") return { ...accepted(operation), disposition: "SOURCE_EXCLUSION_ASSESSED" as const };
    throw new Error("Source review must not execute a command.");
  });
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({ claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal });
  fixture.draft.payload.sportEvidence.sportDeterminations[0].status = "UNSUPPORTED";
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({
    kind: "DRAFT_INVALID",
    issues: [{ path: ["payload", "sportEvidence", "sportDeterminations", 0, "status"] }],
  });
  expect(perform).not.toHaveBeenCalled();
  fixture.draft.payload.sportEvidence.sportDeterminations[0].status = "BLACKLISTED";
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({
    kind: "DRAFT_VALID", authoritative: false,
  });
  expect(onTerminal).not.toHaveBeenCalled();
  expect(textValue(await tools.execute("submit_result", fixture.draft))).toMatchObject({ kind: "TERMINAL_ACCEPTED" });
  expect(perform.mock.calls.map(([operation]) => operation.kind)).toEqual(["READ_ARTIFACT", "SUBMIT_RESULT"]);
  expect(onTerminal).toHaveBeenCalledTimes(1);
});

it("denies source-only package approval and mixed-sport exclusion before Gateway effects", async () => {
  const fixture = sourceExclusionFixture();
  const perform = jest.fn();
  const tools = createAffiliateOmpGatewayTools({ claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn() });
  expect(textValue(await tools.execute("check_result", {
    ...fixture.draft,
    disposition: "APPROVED",
    reasonCodes: ["EVIDENCE_VERIFIED"],
    payload: { committedPackageHash: "c".repeat(64) },
  }))).toMatchObject({ kind: "DRAFT_INVALID", issues: [{ path: ["disposition"] }] });
  const determination = fixture.draft.payload.sportEvidence.sportDeterminations[0];
  determination.sourceLabels = ["Soccer", "Track and Field"];
  expect(textValue(await tools.execute("submit_result", fixture.draft))).toMatchObject({
    kind: "DRAFT_INVALID",
    issues: [{ path: ["payload", "sportEvidence", "sportDeterminations", 0, "sourceLabels"] }],
  });
  expect(perform).not.toHaveBeenCalled();
  expect(tools.isClosed).toBe(false);
});

it("uses verifier decoding for malformed UTF-8 without decoding SOURCE first", async () => {
  const bytes = Buffer.concat([Buffer.from("<p>Outdoor"), Buffer.from([255]), Buffer.from(" soccer on grass fields</p>")]);
  const fixture = legacyRepairFixture(bytes);
  const perform = jest.fn().mockResolvedValue(fixture.artifact);
  const tools = createAffiliateOmpGatewayTools({
    claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
  });
  const view = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", view: "CITATION_TEXT" }));
  expect(view.text).toBe("Outdoor� soccer on grass fields");
  fixture.draft.payload.sportEvidence.sportDeterminations[0].evidence[0].excerpt = view.text;
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({ kind: "DRAFT_VALID" });
  expect(tools.isClosed).toBe(false);
  expect((await tools.execute("read_artifact", { evidenceRef: "evidence-1", view: "SOURCE" })).isError).toBe(true);
  expect(tools.isClosed).toBe(true);
  expect(perform).toHaveBeenCalledTimes(1);
});

it.each(["application/octet-stream", "image/png"])("uses claim kind for citation text with %s MIME", async (mimeType) => {
  const fixture = legacyRepairFixture();
  fixture.artifact.mimeType = mimeType;
  fixture.claim.evidenceManifest.entries[0].mimeType = mimeType;
  fixture.claim.evidenceManifest.hash = hashAffiliateAgentValue({
    schemaVersion: 1, entries: fixture.claim.evidenceManifest.entries,
  });
  const tools = createAffiliateOmpGatewayTools({
    claim: fixture.claim, token: "private-claim-token",
    gateway: { perform: jest.fn().mockResolvedValue(fixture.artifact) }, onTerminal: jest.fn(),
  });
  const view = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", view: "CITATION_TEXT" }));
  expect(view.text).toBe("Outdoor soccer on grass fields");
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({ kind: "DRAFT_VALID" });
  expect(tools.isClosed).toBe(false);
});

it("keeps a parser limit repairable while preserving raw artifact access", async () => {
  const fixture = legacyRepairFixture("<b>x</b>".repeat(4_097));
  const tools = createAffiliateOmpGatewayTools({
    claim: fixture.claim, token: "private-claim-token",
    gateway: { perform: jest.fn().mockResolvedValue(fixture.artifact) }, onTerminal: jest.fn(),
  });
  expect(textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", view: "CITATION_TEXT" })))
    .toMatchObject({ code: "CITATION_TEXT_LIMIT" });
  expect(tools.isClosed).toBe(false);
  expect(textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", limit: 3 })).text).toBe("<b>");
});

it("repairs a draft from claim citation text before one terminal submission", async () => {
  const fixture = legacyRepairFixture();
  const perform = jest.fn(async (operation: AffiliateAgentClaimOperation) => {
    if (operation.kind === "READ_ARTIFACT") return fixture.artifact;
    if (operation.kind === "SUBMIT_RESULT") return { ...accepted(operation), disposition: "CONTRACT_GAP" as const };
    throw new Error("Draft repair must not execute commands.");
  });
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({ claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal });
  fixture.draft.reasonCodes = ["SOURCE_UNSUPPORTED", "CONTRACT_REQUIREMENT_MISSING"];
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({
    kind: "DRAFT_INVALID", authoritative: false, issues: [{ path: ["reasonCodes", 1] }],
  });
  expect(perform).not.toHaveBeenCalled();
  fixture.draft.reasonCodes = ["CONTRACT_REQUIREMENT_MISSING"];
  fixture.draft.payload.sportEvidence.sportDeterminations[0].evidence[0].excerpt = "Invented source quotation";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    expect(textValue(await tools.execute("submit_result", fixture.draft))).toMatchObject({
      kind: "DRAFT_INVALID",
      issues: [{ path: ["payload", "sportEvidence", "sportDeterminations", 0, "evidence", 0, "excerpt"] }],
    });
  }
  expect(perform.mock.calls.map(([operation]) => operation.kind)).toEqual(["READ_ARTIFACT"]);
  expect(onTerminal).not.toHaveBeenCalled();
  expect(tools.isClosed).toBe(false);
  const raw = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1" }));
  const view = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", view: "CITATION_TEXT" }));
  expect(raw.text).toContain("&nbsp;");
  expect(view.text).toBe("Outdoor soccer on grass fields");
  Object.assign(fixture.draft.payload.sportEvidence.sportDeterminations[0].evidence[0], view.citation, { excerpt: view.text });
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({
    kind: "DRAFT_VALID", authoritative: false, scope: "CLAIM_SNAPSHOT", issues: [],
  });
  expect(onTerminal).not.toHaveBeenCalled();
  expect(textValue(await tools.execute("submit_result", fixture.draft))).toMatchObject({ kind: "TERMINAL_ACCEPTED" });
  expect(perform.mock.calls.map(([operation]) => operation.kind)).toEqual(["READ_ARTIFACT", "SUBMIT_RESULT"]);
  expect(onTerminal).toHaveBeenCalledTimes(1);
  expect(tools.isClosed).toBe(true);
});

it("denies foreign citations and model-supplied draft authority without a read", async () => {
  const fixture = legacyRepairFixture();
  const perform = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
  });
  const forged = await tools.execute("check_result", { ...fixture.draft, jobId: "foreign-job" });
  expect(forged.isError).toBe(true);
  fixture.draft.payload.sportEvidence.sportDeterminations[0].evidence[0].artifactId = "foreign-artifact";
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({
    kind: "DRAFT_INVALID",
    issues: [{ path: ["payload", "sportEvidence", "sportDeterminations", 0, "evidence", 0, "artifactId"] }],
  });
  expect((await tools.execute("read_artifact", {
    evidenceRef: "foreign-artifact", view: "CITATION_TEXT",
  })).isError).toBe(true);
  expect(perform).not.toHaveBeenCalled();
  expect(tools.isClosed).toBe(false);
});

it("keeps Gateway authority after a successful local draft check", async () => {
  const fixture = legacyRepairFixture();
  const perform = jest.fn(async (operation: AffiliateAgentClaimOperation) => {
    if (operation.kind === "READ_ARTIFACT") return fixture.artifact;
    throw new AffiliateAgentGatewayError({
      code: "CLAIM_NOT_ACTIVE", isRetryable: false, safeMessage: "The claim is no longer active.",
    });
  });
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({ claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal });
  expect(textValue(await tools.execute("check_result", fixture.draft))).toMatchObject({
    kind: "DRAFT_VALID", authoritative: false,
  });
  expect(textValue(await tools.execute("submit_result", fixture.draft))).toMatchObject({ code: "CLAIM_NOT_ACTIVE" });
  expect(onTerminal).not.toHaveBeenCalled();
});

it("pages canonical citation text within the existing byte and Unicode limits", async () => {
  const fixture = legacyRepairFixture("<p>Club&nbsp;😀 &amp; league</p>".repeat(4_000));
  const perform = jest.fn().mockResolvedValue(fixture.artifact);
  const tools = createAffiliateOmpGatewayTools({
    claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
  });
  let offset = 0;
  const parts: string[] = [];
  for (;;) {
    const response = await tools.execute("read_artifact", { evidenceRef: "evidence-1", view: "CITATION_TEXT", offset, limit: 65_536 });
    const page = textValue(response);
    expect(Buffer.byteLength(JSON.stringify(page), "utf8")).toBeLessThan(48 * 1024);
    expect(page.nextOffset).toBeGreaterThan(offset);
    parts.push(page.text);
    offset = page.nextOffset;
    if (page.endOfArtifact) break;
  }
  expect(parts.join("")).toBe("Club 😀 & league ".repeat(4_000).trim());
  const raw = textValue(await tools.execute("read_artifact", { evidenceRef: "evidence-1", limit: 3 }));
  expect(raw.text).toBe("<p>");
  expect(perform).toHaveBeenCalledTimes(1);
});

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
  const fixture = legacyRepairFixture();
  const draftFor = (size: number) => ({
    ...fixture.draft,
    payload: {
      ...fixture.draft.payload,
      sportEvidence: {
        ...fixture.draft.payload.sportEvidence,
        sportDeterminations: Array.from({ length: 32 }, (_, index) => ({
          ...fixture.draft.payload.sportEvidence.sportDeterminations[0],
          sourceLabels: [`Soccer ${String(index).padStart(2, "0")}`],
          rationale: "x".repeat(size),
        })),
      },
    },
  });
  const performFor = () => jest.fn(async (operation: AffiliateAgentClaimOperation) => (
    operation.kind === "READ_ARTIFACT"
      ? fixture.artifact
      : { ...accepted(operation), disposition: "CONTRACT_GAP" as const }
  ));
  const probe = async (size: number) => {
    const perform = performFor();
    const tools = createAffiliateOmpGatewayTools({
      claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal: jest.fn(),
    });
    await tools.execute("submit_result", draftFor(size));
    return perform.mock.calls.some(([operation]) => operation.kind === "SUBMIT_RESULT");
  };
  let low = 1;
  let high = 2_000;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (await probe(candidate)) low = candidate;
    else high = candidate - 1;
  }
  const perform = performFor();
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: fixture.claim, token: "private-claim-token", gateway: { perform }, onTerminal,
  });
  const outcome = await tools.execute("submit_result", draftFor(low));
  expect(outcome.isError).toBeUndefined();
  const operation = perform.mock.calls.find(([operation]) => operation.kind === "SUBMIT_RESULT")?.[0];
  if (operation?.kind !== "SUBMIT_RESULT") throw new Error("Expected a validated terminal submission.");
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

it("returns a local payload correction without terminal Gateway I/O", async () => {
  const perform = jest.fn();
  const onTerminal = jest.fn();
  const tools = createAffiliateOmpGatewayTools({
    claim: claimFor("MAPPING_PRODUCER"), token: "private-claim-token", gateway: { perform }, onTerminal,
  });
  expect(textValue(await tools.execute("submit_result", { ...terminalFields, payload: {} }))).toMatchObject({
    kind: "DRAFT_INVALID",
    issues: [{ path: ["payload", "incompatibilityCode"] }],
  });
  expect(perform).not.toHaveBeenCalled();
  expect(onTerminal).not.toHaveBeenCalled();
  expect(tools.isClosed).toBe(false);
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
