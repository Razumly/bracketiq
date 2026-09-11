import { z } from "zod";
import type { AffiliateAgentArtifactReadResult } from "./agentGateway";
import {
  affiliateAgentTerminalResultEnvelopeSchema,
  type AffiliateAgentClaimEnvelope,
  type AffiliateAgentRole,
  type AffiliateAgentSchemaIssue,
  type AffiliateAgentLegacySportRepairContext,
  type AffiliateAgentSportEvidence,
} from "./agentGatewayContracts";
import {
  AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES,
  issueCodeFor,
} from "./affiliateAgentCommandDiagnostics";
import {
  AffiliateSportVerificationError,
  assertAffiliateSportExclusionReady,
  verifyAffiliateSportCompletion,
  type AffiliateSportCompletionStoredArtifact,
  type AffiliateSportCitationKind,
} from "./affiliateSportDetermination";

type ClaimCitationEntry =
  AffiliateAgentClaimEnvelope["evidenceManifest"]["entries"][number] & {
    kind: AffiliateSportCitationKind;
  };

const isGatewayRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const terminalSchemaIssuePath = (
  schema: z.core.$ZodType,
  path: readonly PropertyKey[],
): (string | number)[] => {
  const safePath: (string | number)[] = [];
  let current = schema;
  for (const segment of path) {
    while (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable
    ) {
      current = current.unwrap();
    }
    if (
      current instanceof z.ZodObject &&
      typeof segment === "string" &&
      Object.prototype.hasOwnProperty.call(current.shape, segment)
    ) {
      safePath.push(segment);
      current = current.shape[segment];
    } else if (
      current instanceof z.ZodArray &&
      typeof segment === "number" &&
      Number.isSafeInteger(segment) &&
      segment >= 0
    ) {
      safePath.push(segment);
      current = current.element;
    } else {
      break;
    }
  }
  return safePath;
};

const terminalRefinementMessages = new Set([
  "Set-like arrays must be sorted and unique.",
  "Only RESOLVED determinations may contain canonical sport names, and RESOLVED needs at least one.",
  "Unresolved, unsupported, and blacklisted determinations must use source evidence.",
  "User decisions may only resolve a prior determination.",
  "User decisions must identify the prior determination hash.",
  "Source-evidence determinations cannot contain a user-resolution hash.",
  "Sport determinations must be sorted by status, source labels, names, then hash.",
  "Every sport determination needs stored evidence.",
  "Determination citations must be sorted uniquely by their canonical tuple.",
  "sourceLabels must contain nonblank, unpadded strings.",
  "sourceLabels must be sorted uniquely by code unit order.",
  "canonicalSportNames must contain nonblank, unpadded strings.",
  "canonicalSportNames must be sorted uniquely by code unit order.",
]);

const terminalSchemaIssueMessage = (issue: z.core.$ZodIssue): string => {
  switch (issue.code) {
    case "invalid_value": {
      const message = `Use one of these allowed values: ${issue.values.map((value) => JSON.stringify(value)).join(", ")}.`;
      return message.length <= 500
        ? message
        : "Use a permitted value from the terminal schema.";
    }
    case "invalid_type":
      return [
        "string",
        "number",
        "boolean",
        "object",
        "array",
        "int",
        "null",
      ].includes(issue.expected)
        ? `Provide the required ${issue.expected} value.`
        : "Provide the value type required by the terminal schema.";
    case "unrecognized_keys":
      return "Remove fields that this terminal object does not allow.";
    case "too_small":
      return "Meet the minimum size or value required by this terminal field.";
    case "too_big":
      return "Do not exceed the maximum size or value for this terminal field.";
    case "invalid_format":
      return "Use the format required by this terminal field.";
    case "custom":
      if (terminalRefinementMessages.has(issue.message)) return issue.message;
      if (issue.message.startsWith("Duplicate sport determination ")) {
        return "Remove duplicate sport determinations.";
      }
      if (issue.message.startsWith("Invalid affiliate sport citation URL: ")) {
        return "Use a valid public HTTP or HTTPS citation URL.";
      }
      return "Match the terminal schema constraints for this field.";
    default:
      return "Match the terminal schema for this field.";
  }
};

export const terminalResultSchemaCorrectionIssues = (
  role: AffiliateAgentRole,
  result: unknown,
  error: z.ZodError,
): readonly AffiliateAgentSchemaIssue[] => {
  if (!isGatewayRecord(result)) {
    return [
      {
        path: [],
        code: "INVALID_TYPE",
        message: "Provide a terminal result object.",
      },
    ];
  }
  if (result.role !== role) {
    return [
      {
        path: ["role"],
        code: "INVALID_VALUE",
        message: "Use the role from the claim.",
      },
    ];
  }
  const variantIndex =
    affiliateAgentTerminalResultEnvelopeSchema.options.findIndex(
      (variant) =>
        variant.shape.role.value === role &&
        variant.shape.disposition.value === result.disposition,
    );
  const variant =
    affiliateAgentTerminalResultEnvelopeSchema.options[variantIndex];
  if (!variant) {
    return [
      {
        path: ["disposition"],
        code: "INVALID_VALUE",
        message: "Use a terminal disposition permitted by the claim role.",
      },
    ];
  }
  const unionIssue = error.issues.find(
    (issue) => issue.code === "invalid_union",
  );
  const issues = unionIssue?.errors[variantIndex] ?? error.issues;
  return issues
    .slice(0, AFFILIATE_AGENT_COMMAND_DIAGNOSTIC_MAX_ISSUES)
    .map((issue) => ({
      path: terminalSchemaIssuePath(variant, issue.path),
      code: issueCodeFor(issue),
      message: terminalSchemaIssueMessage(issue),
    }));
};

export const affiliateAgentTerminalIdentityFor = (
  claim: AffiliateAgentClaimEnvelope,
) => ({
  schemaVersion: 1 as const,
  jobId: claim.jobId,
  claimId: claim.claimId,
  claimGeneration: claim.claimGeneration,
  lifecycleGeneration: claim.lifecycleGeneration,
  deploymentContractVersion: claim.deploymentContractVersion,
  deploymentContractHash: claim.deploymentContractHash,
  supplyContractVersion: claim.supplyContractVersion,
  supplyContractHash: claim.supplyContractHash,
  roleContractVersion: claim.roleContractVersion,
  roleContractHash: claim.roleContractHash,
  promptTemplateVersion: claim.promptTemplateVersion,
  promptTemplateHash: claim.promptTemplateHash,
  workerId: claim.workerId,
  invocationId: claim.invocationId,
  role: claim.role,
});

export type AffiliateAgentTerminalDraftCheck = Readonly<{
  kind: "DRAFT_VALID" | "DRAFT_INVALID";
  authoritative: false;
  scope: "CLAIM_SNAPSHOT";
  checked: readonly string[];
  issues: readonly AffiliateAgentSchemaIssue[];
}>;

const draftCheck = (
  issues: readonly AffiliateAgentSchemaIssue[],
  checked: readonly string[],
): AffiliateAgentTerminalDraftCheck => ({
  kind: issues.length === 0 ? "DRAFT_VALID" : "DRAFT_INVALID",
  authoritative: false,
  scope: "CLAIM_SNAPSHOT",
  checked,
  issues,
});

export const terminalDraftInputFailure = (
  role: AffiliateAgentRole,
  value: unknown,
  error: z.ZodError,
): AffiliateAgentTerminalDraftCheck =>
  draftCheck(
    terminalResultSchemaCorrectionIssues(
      role,
      isGatewayRecord(value) ? { ...value, role } : value,
      error,
    ),
    ["INPUT_SCHEMA"],
  );

export const checkAffiliateAgentTerminalDraft = async (
  input: Readonly<{
    claim: AffiliateAgentClaimEnvelope;
    result: unknown;
    readArtifact(
      evidenceRef: string,
    ): Promise<AffiliateAgentArtifactReadResult>;
  }>,
): Promise<AffiliateAgentTerminalDraftCheck> => {
  const parsed = affiliateAgentTerminalResultEnvelopeSchema.safeParse(
    input.result,
  );
  if (!parsed.success) {
    return draftCheck(
      terminalResultSchemaCorrectionIssues(
        input.claim.role,
        input.result,
        parsed.error,
      ),
      ["SCHEMA"],
    );
  }
  const result = parsed.data;
  const identity = affiliateAgentTerminalIdentityFor(input.claim);
  for (const key of Object.keys(identity) as (keyof typeof identity)[]) {
    if (result[key] !== identity[key]) {
      return draftCheck(
        [
          {
            path: [key],
            code: "INVALID_VALUE",
            message: "Use the claim identity supplied by the trusted driver.",
          },
        ],
        ["SCHEMA", "CLAIM_IDENTITY"],
      );
    }
  }
  const checked = ["SCHEMA", "CLAIM_IDENTITY"];
  let context: AffiliateAgentLegacySportRepairContext;
  let sportEvidence: AffiliateAgentSportEvidence | undefined;
  const isSourceExclusion = input.claim.subject.type === "SOURCE_EXCLUSION_REVIEW";
  if (input.claim.subject.type === "SOURCE_EXCLUSION_REVIEW") {
    if (result.role !== "SUPPLY_REVIEWER"
      || (result.disposition !== "SOURCE_EXCLUSION_ASSESSED" && result.disposition !== "HUMAN_REVIEW_REQUIRED")) {
      return draftCheck([{ path: ["disposition"], code: "INVALID_VALUE", message: "Use a source assessment or human review for this claim." }], checked);
    }
    if (result.evidenceRefs.length === 0
      || result.evidenceRefs.some((ref) => !input.claim.evidenceManifest.entries.some((entry) => entry.evidenceRef === ref))) {
      return draftCheck([{ path: ["evidenceRefs"], code: "INVALID_VALUE", message: "Provide source evidence references from the claim manifest." }], checked);
    }
    if (result.disposition === "HUMAN_REVIEW_REQUIRED") return draftCheck([], checked);
    if (result.payload.supplySourceId !== input.claim.subject.supplySourceId) {
      return draftCheck([{ path: ["payload", "supplySourceId"], code: "INVALID_VALUE", message: "Use the Supply Source from the claim." }], checked);
    }
    if (result.payload.recommendation !== "EXCLUDE") return draftCheck([], checked);
    context = input.claim.subject.repairContext;
    sportEvidence = result.payload.sportEvidence;
  } else if (input.claim.subject.type === "MAPPING_PRODUCER"
    && input.claim.subject.repairContext?.kind === "LEGACY_SPORT_REPAIR"
    && result.role === "MAPPING_PRODUCER" && result.disposition === "CONTRACT_GAP") {
    context = input.claim.subject.repairContext;
    sportEvidence = result.payload.sportEvidence;
  } else {
    return draftCheck([], checked);
  }
  checked.push("SPORT_EVIDENCE");
  const invalid = (
    path: (string | number)[],
    message: string,
    code: AffiliateAgentSchemaIssue["code"] = "INVALID_VALUE",
  ) => draftCheck([{ path, code, message }], checked);
  if (!sportEvidence || sportEvidence.sportDeterminations.length === 0) {
    return invalid(
      ["payload", "sportEvidence"],
      "Provide a nonempty sport assessment with claim-owned citations.",
      "MISSING_VALUE",
    );
  }
  if (isSourceExclusion) {
    try {
      assertAffiliateSportExclusionReady({
        determinations: sportEvidence.sportDeterminations,
        reasonCodes: result.reasonCodes,
      });
    } catch (error) {
      if (!(error instanceof AffiliateSportVerificationError)) throw error;
      return invalid(
        error.path[0] === "reasonCodes" ? [...error.path] : ["payload", "sportEvidence", ...error.path],
        error.message,
      );
    }
  }
  if (sportEvidence.evidenceRunId !== context.evidenceRunId) {
    return invalid(
      ["payload", "sportEvidence", "evidenceRunId"],
      "Use the evidence run from the claim repair context.",
    );
  }
  if (
    sportEvidence.sportsCatalogSha256.toLowerCase() !==
    context.sportsCatalog.sha256.toLowerCase()
  ) {
    return invalid(
      ["payload", "sportEvidence", "sportsCatalogSha256"],
      "Use the sports catalog hash from the claim repair context.",
    );
  }
  const needed = new Map<string, ClaimCitationEntry>();
  for (
    let index = 0;
    index < sportEvidence.sportDeterminations.length;
    index += 1
  ) {
    const citations = sportEvidence.sportDeterminations[index].evidence;
    for (
      let citationIndex = 0;
      citationIndex < citations.length;
      citationIndex += 1
    ) {
      const citation = citations[citationIndex];
      const entry = input.claim.evidenceManifest.entries.find(
        (candidate): candidate is ClaimCitationEntry =>
          candidate.artifactId === citation.artifactId &&
          candidate.kind === citation.artifactKind,
      );
      if (!entry) {
        return invalid(
          [
            "payload",
            "sportEvidence",
            "sportDeterminations",
            index,
            "evidence",
            citationIndex,
            "artifactId",
          ],
          "Use an artifact identifier and kind from the claim manifest.",
        );
      }
      if (!result.evidenceRefs.includes(entry.evidenceRef)) {
        return invalid(
          ["evidenceRefs"],
          "Include the manifest evidenceRef for every cited artifact.",
          "MISSING_VALUE",
        );
      }
      needed.set(entry.evidenceRef, entry);
    }
  }
  const artifacts: AffiliateSportCompletionStoredArtifact[] = [];
  for (const [evidenceRef, entry] of needed) {
    const artifact = await input.readArtifact(evidenceRef);
    artifacts.push({
      artifactId: entry.artifactId,
      runId: context.evidenceRunId,
      intakeId: context.intakeId,
      kind: entry.kind,
      sourceUrl: artifact.sourceUrl,
      finalUrl: artifact.finalUrl,
      artifactSha256: entry.sha256,
      bytes: artifact.bytes,
    });
  }
  const reviewReady =
    sportEvidence.sportDeterminations.every(
      (determination) =>
        determination.status === "RESOLVED" ||
        determination.status === "BLACKLISTED",
    ) &&
    sportEvidence.sportDeterminations.some(
      (determination) => determination.status === "RESOLVED",
    );
  const resultKind = reviewReady ? "REVIEW_REQUIRED" : "HUMAN_REVIEW_REQUIRED";
  try {
    await verifyAffiliateSportCompletion(
      {
        result: {
          status: resultKind,
          evidenceRunId: sportEvidence.evidenceRunId,
          sportsCatalogSha256: sportEvidence.sportsCatalogSha256,
          sportDeterminations: sportEvidence.sportDeterminations,
        },
        resultKind,
        reasonCodes: result.reasonCodes,
        claimEvidenceContext: context,
        freshCatalog: context.sportsCatalog,
        expectedIntakeId: context.intakeId,
        artifacts,
      },
      {},
    );
  } catch (error) {
    if (error instanceof AffiliateSportVerificationError) {
      return invalid(
        error.path[0] === "reasonCodes"
          ? [...error.path]
          : ["payload", "sportEvidence", ...error.path],
        error.message,
      );
    }
    if (error instanceof Error && error.name === "SPORT_CATALOG_MISMATCH") {
      return invalid(
        ["payload", "sportEvidence", "sportsCatalogSha256"],
        "Use the sports catalog from the claim snapshot.",
      );
    }
    throw error;
  }
  return draftCheck([], checked);
};
