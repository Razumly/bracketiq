/** @jest-environment node */
import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { AffiliateAgentHttpGateway } from "../../../../scripts/run-affiliate-agent-supervisor";

import type { PrismaClient } from "@/generated/prisma/client";
import { buildAffiliateSportsCatalogSnapshot } from "../affiliateSportsCatalog";

import {
  AFFILIATE_AGENT_MAX_MANIFEST_ENTRIES,
  AFFILIATE_AGENT_MAX_SET_ITEMS,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  affiliateAgentPromptTemplateSchema,
  affiliateAgentRoleContractSchema,
  affiliateAgentClaimEnvelopeSchema,
  affiliateAgentCommandSchema,
  affiliateAgentDeploymentContractSchema,
  affiliateAgentContractBundleSchema,
  affiliateAgentSupplyContractSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  renderAffiliateAgentPrompt,
  type AffiliateAgentSportEvidence,
} from "../agentGatewayContracts";
import {
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AFFILIATE_AGENT_LEASE_SECONDS,
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS,
  AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimRequest,
  type AffiliateAgentGateway,
  type AffiliateAgentInvocationFailureCode,
  type AffiliateAgentInvocationFailureEnvelope,
  AFFILIATE_AGENT_MAX_INVOCATION_ATTEMPTS,
  AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS,
  affiliateAgentRetryDelaySeconds,
} from "../agentGateway";
import {
  createProductionAffiliateAgentGatewayAdapters,
  createProductionAffiliateAgentGatewayDependencies,
  type AffiliateAgentArtifactRead,
  type AffiliateAgentClaimAdmission,
  type AffiliateAgentInvocationReconciler,
  type AffiliateAgentReviewerTerminalDisposition,
  type AffiliateAgentTerminalEffectAdapter,
} from "../agentGatewayAdapters";
import type {
  AffiliateOperationalAlertInput,
  AffiliateOperationalAlertWriter,
} from "../affiliateOperationalAlerts";
import {
  createAffiliateAgentClaimAdmission,
  createPrismaAffiliateAgentGateway,
  createPrismaAffiliateAgentInvocationReconciler,
} from "../prismaAgentGateway";

const supplyContractFixture = {
  schemaVersion: 1,
  version: 1,
  components: [
    {
      schemaVersion: 1,
      name: "COVERAGE_APPLICABILITY",
      version: 1,
      hash: "f13a898bc1710efb2b926ed38da263437d44afcd0039dc684065142d3d451608",
      payload: {
        applicability: [
          {
            sourceProfile: "EVENT",
            sportIds: ["sport_basketball", "sport_soccer"],
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "SEARCH_STRATEGIES",
      version: 1,
      hash: "0aa04cef3f1f03afb8359f17cece3fca596f5cae8fd4d95ca1ecdbd70378ca38",
      payload: {
        families: [
          {
            family: "OFFICIAL_SITE_SEARCH",
            minimumDistinctCycles: 2,
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "SUPPLY_TARGETS_AND_MARKET_TIERS",
      version: 1,
      hash: "0de164fdcc9a4b0cb731cc2dd659706c79d657f6d0512b25ca0027e3c3139c03",
      payload: {
        tiers: [
          {
            tier: "LARGE",
            targets: [
              {
                minimumFreshPublishedSupply: 2,
                sourceProfile: "EVENT",
              },
            ],
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "FRESHNESS",
      version: 1,
      hash: "69ff8f25c91412b3327058ed9daefee5b52cdfc784efd8294704c30adcb20340",
      payload: {
        windows: [
          {
            maximumAgeHours: 24,
            sourceProfile: "EVENT",
          },
        ],
      },
    },
    {
      schemaVersion: 1,
      name: "MAPPING_EVIDENCE",
      version: 1,
      hash: "fe19bca864dbc9c0b1aa8b3a5db6e6bbca76134f6ff2a62be58bb6cc6d6c1bd0",
      payload: {
        requiredEvidenceKinds: ["EXPECTED_CANDIDATE", "PAGE_MARKDOWN"],
        hasDeterministicValidation: true,
      },
    },
    {
      schemaVersion: 1,
      name: "LIFECYCLE_EVIDENCE",
      version: 1,
      hash: "487050f64d9d5a0d00afff034aa8b2c129da68bdfb537774ec6db263e08b740f",
      payload: {
        requiredEvidenceKinds: ["DURABLE_SOURCE_EVIDENCE", "VALIDATION_OUTPUT"],
        hasIndependentReview: true,
      },
    },
  ],
  hash: "b12139b403f6f2ad946a7d416731ea7eed5aa6cb2bd149e1264c1e9b5304c554",
} as const;

const deploymentContractFixture = (() => {
  const preimage = {
    schemaVersion: 1,
    version: 1,
    gatewayVersion: 1,
    activeSupplyContract: {
      version: supplyContractFixture.version,
      hash: supplyContractFixture.hash,
    },
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).map(
      (contract) => ({
        role: contract.role,
        version: contract.version,
        hash: contract.hash,
      }),
    ),
    promptTemplates: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).map(
      (contract) => ({
        role: contract.role,
        version: contract.promptTemplateVersion,
        hash: contract.promptTemplateHash,
      }),
    ),
    expectedTopology: {
      claimsPerInvocation: 1,
      hasFreshWorkspacePerClaim: true,
      processCommand: ["affiliate-omp-agent"],
      hasNestedGoal: false,
      hasClaimLoop: false,
      hasContextReuse: false,
      executionClass: "PRODUCTION_OMP",
      databaseRoles: {
        gateway: "bracketiq_affiliate_gateway",
        lifecycleAuthority: "bracketiq_affiliate_lifecycle",
        agent: "bracketiq_affiliate_agent",
      },
    },
  } as const;
  return {
    ...preimage,
    hash: hashAffiliateAgentValue(preimage),
  } as const;
})();

const contractBundleFixture = {
  schemaVersion: 1,
  supplyContract: supplyContractFixture,
  roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS),
  promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES),
  deploymentContract: deploymentContractFixture,
};

const supplyContractStaleBundleFixture = (() => {
  const { hash: _componentHash, ...coverageComponentPreimage } =
    supplyContractFixture.components[0];
  const changedCoverageComponentPreimage = {
    ...coverageComponentPreimage,
    payload: {
      applicability: [
        {
          sourceProfile: "EVENT",
          sportIds: ["sport_basketball", "sport_soccer", "sport_tennis"],
        },
      ],
    },
  };
  const changedCoverageComponent = {
    ...changedCoverageComponentPreimage,
    hash: hashAffiliateAgentValue(changedCoverageComponentPreimage),
  };
  const supplyPreimage = {
    schemaVersion: 1,
    version: 1,
    components: [
      changedCoverageComponent,
      ...supplyContractFixture.components.slice(1),
    ],
  };
  const changedSupplyContract = {
    ...supplyPreimage,
    hash: hashAffiliateAgentValue(supplyPreimage),
  };
  const { hash: _deploymentHash, ...deploymentPreimage } =
    deploymentContractFixture;
  const changedDeploymentPreimage = {
    ...deploymentPreimage,
    activeSupplyContract: {
      version: changedSupplyContract.version,
      hash: changedSupplyContract.hash,
    },
  };
  return {
    ...contractBundleFixture,
    supplyContract: changedSupplyContract,
    deploymentContract: {
      ...changedDeploymentPreimage,
      hash: hashAffiliateAgentValue(changedDeploymentPreimage),
    },
  };
})();

const unsupportedDeploymentBundleFixture = (() => {
  const { hash: _deploymentHash, ...deploymentPreimage } =
    deploymentContractFixture;
  const unsupportedDeploymentPreimage = {
    ...deploymentPreimage,
    gatewayVersion: 2,
  };
  return {
    ...contractBundleFixture,
    deploymentContract: {
      ...unsupportedDeploymentPreimage,
      hash: hashAffiliateAgentValue(unsupportedDeploymentPreimage),
    },
  };
})();

const evidenceManifestFixture = {
  schemaVersion: 1,
  entries: [
    {
      evidenceRef: "evidence-1",
      kind: "PAGE_MARKDOWN",
      artifactId: "artifact-1",
      sha256: "a".repeat(64),
      mimeType: "text/markdown",
      byteSize: 100,
      retention: "INDEFINITE",
    },
  ],
  hash: "619cb5a92cc00acd7e84c4a3c3e12e52f09389f07642b3eb20bd654c0e5ffcd2",
};

const claimRoleFields = {
  COVERAGE_PLANNER: {
    queue: "AFFILIATE_COVERAGE",
    lane: "COVERAGE_PLANNING",
    subject: {
      type: "COVERAGE_PLANNER",
      coverageCellId: "coverage-cell-1",
      assessmentCycleId: "assessment-cycle-1",
    },
  },
  MAPPING_PRODUCER: {
    queue: "AFFILIATE_MAPPING",
    lane: "MAPPING_PRODUCTION",
    subject: {
      type: "MAPPING_PRODUCER",
      supplySourceId: "supply-source-1",
      mappingJobId: "mapping-job-1",
      pass: 1,
    },
  },
  SUPPLY_REVIEWER: {
    queue: "AFFILIATE_REVIEW",
    lane: "SUPPLY_REVIEW",
    subject: {
      type: "SUPPLY_REVIEWER",
      supplySourceId: "supply-source-1",
      producerClaimId: "producer-claim-1",
      producerWorkerId: "producer-worker-1",
      producerInvocationId: "producer-invocation-1",
      producerWorkspaceId: "producer-workspace-1",
      committedPackageHash: "b".repeat(64),
      targetId: "target-1",
      targetType: "EVENT",
      reviewPass: 1,
    },
  },
  HUMAN_DIRECTED_EXECUTOR: {
    queue: "AFFILIATE_HUMAN_DIRECTED",
    lane: "HUMAN_EXECUTION",
    subject: {
      type: "HUMAN_DIRECTED_EXECUTOR",
      caseId: "case-1",
      recordedHumanActorId: "user-1",
      decisionHash: "c".repeat(64),
      reviewerClaimId: "reviewer-claim-1",
      lifecycleCommandRef: "lifecycle-command-1",
    },
  },
} as const;

const claimFixtureForRole = (role: keyof typeof claimRoleFields) => {
  const contract = AFFILIATE_AGENT_ROLE_CONTRACTS[role];
  const roleFields = claimRoleFields[role];
  return {
    schemaVersion: 1,
    queue: roleFields.queue,
    lane: roleFields.lane,
    jobId: `job-${role.toLowerCase()}`,
    claimId: `claim-${role.toLowerCase()}`,
    supplySourceId: role === "COVERAGE_PLANNER" ? null : "supply-source-1",
    claimGeneration: 1,
    lifecycleGeneration: role === "COVERAGE_PLANNER" ? null : 7,
    deploymentContractVersion: deploymentContractFixture.version,
    deploymentContractHash: deploymentContractFixture.hash,
    supplyContractVersion: supplyContractFixture.version,
    supplyContractHash: supplyContractFixture.hash,
    roleContractVersion: contract.version,
    roleContractHash: contract.hash,
    promptTemplateVersion: contract.promptTemplateVersion,
    promptTemplateHash: contract.promptTemplateHash,
    role,
    executionClass: "PRODUCTION_OMP",
    workerId: `worker-${role.toLowerCase()}`,
    invocationId: `invocation-${role.toLowerCase()}`,
    workspaceId: `workspace-${role.toLowerCase()}`,
    claimedAt: "2026-08-20T18:00:00.000Z",
    expiresAt: "2026-08-20T18:20:00.000Z",
    evidenceManifest: evidenceManifestFixture,
    subject: roleFields.subject,
    permittedCommands: [...contract.permittedCommands],
  };
};

const terminalResultCases = [
  {
    role: "COVERAGE_PLANNER",
    disposition: "CAMPAIGN_PROPOSED",
    payload: { campaignProposalRefs: ["campaign-1"] },
  },
  {
    role: "COVERAGE_PLANNER",
    disposition: "FAILED_CAPTURE_EVIDENCE_RECORDED",
    payload: { captureEvidenceRef: "evidence-1" },
  },
  {
    role: "COVERAGE_PLANNER",
    disposition: "SOURCE_EXCLUSION_PROPOSED",
    payload: {
      supplySourceId: "supply-source-1",
      policyEvidenceRefs: ["evidence-1"],
    },
  },
  {
    role: "COVERAGE_PLANNER",
    disposition: "CONTRACT_GAP",
    payload: {
      contractArea: "SEARCH_STRATEGIES",
      requestedChange: "Add one governed strategy family.",
    },
  },
  {
    role: "COVERAGE_PLANNER",
    disposition: "NO_ACTION",
    payload: { basis: "SEARCH_SATURATED" },
  },
  {
    role: "MAPPING_PRODUCER",
    disposition: "PACKAGE_COMMITTED",
    payload: {
      packageHash: "d".repeat(64),
      commitReceiptId: "receipt-1",
    },
  },
  {
    role: "MAPPING_PRODUCER",
    disposition: "BOUNDED_REPAIR_SUBMITTED",
    payload: {
      repairPass: 1,
      packageHash: "d".repeat(64),
      commitReceiptId: "receipt-1",
    },
  },
  {
    role: "MAPPING_PRODUCER",
    disposition: "SOURCE_INCOMPATIBLE",
    payload: { incompatibilityCode: "UNSUPPORTED_LAYOUT" },
  },
  {
    role: "MAPPING_PRODUCER",
    disposition: "CONTRACT_GAP",
    payload: {
      contractArea: "MAPPING_EVIDENCE",
      requestedChange: "Add one evidence kind.",
    },
  },
  {
    role: "SUPPLY_REVIEWER",
    disposition: "APPROVED",
    payload: { committedPackageHash: "b".repeat(64) },
  },
  {
    role: "SUPPLY_REVIEWER",
    disposition: "ACTIVATED",
    payload: {
      committedPackageHash: "b".repeat(64),
      baselineHash: "c".repeat(64),
      candidateReviewId: "candidate-review-1",
    },
  },
  {
    role: "SUPPLY_REVIEWER",
    disposition: "PRODUCER_REPAIR_REQUIRED",
    payload: {
      committedPackageHash: "b".repeat(64),
      repairIssues: ["MISSING_REQUIRED_FIELD"],
    },
  },
  {
    role: "SUPPLY_REVIEWER",
    disposition: "REGRESSION_ASSESSED",
    payload: {
      supplySourceId: "supply-source-1",
      assessment: "PASS",
    },
  },
  {
    role: "SUPPLY_REVIEWER",
    disposition: "SOURCE_EXCLUSION_ASSESSED",
    payload: {
      supplySourceId: "supply-source-1",
      recommendation: "KEEP",
    },
  },
  {
    role: "SUPPLY_REVIEWER",
    disposition: "EXACT_TARGET_REJECTED",
    payload: {
      targetId: "event-1",
      targetType: "EVENT",
    },
  },
  {
    role: "SUPPLY_REVIEWER",
    disposition: "HUMAN_REVIEW_REQUIRED",
    payload: { caseReason: "Conflicting operator identity evidence." },
  },
  {
    role: "HUMAN_DIRECTED_EXECUTOR",
    disposition: "LIFECYCLE_COMMAND_EXECUTED",
    payload: {
      caseId: "case-1",
      lifecycleCommandRef: "lifecycle-command-1",
      receiptId: "receipt-1",
    },
  },
  {
    role: "HUMAN_DIRECTED_EXECUTOR",
    disposition: "CONTRACT_GAP",
    payload: {
      contractArea: "LIFECYCLE_EVIDENCE",
      requestedChange: "Add one recorded command type.",
    },
  },
] as const;

const terminalResultFixture = (input: (typeof terminalResultCases)[number]) => {
  const claim = claimFixtureForRole(input.role);
  return {
    schemaVersion: 1,
    jobId: claim.jobId,
    claimId: claim.claimId,
    claimGeneration: claim.claimGeneration,
    lifecycleGeneration: claim.lifecycleGeneration,
    role: claim.role,
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
    disposition: input.disposition,
    reasonCodes: ["EVIDENCE_VERIFIED"],
    evidenceRefs: ["evidence-1"],
    summary: "The durable evidence supports this result.",
    payload: input.payload,
  };
};

describe("affiliate Agent Gateway contracts", () => {
  it("hashes canonical contract fixtures", () => {
    const fixture = {
      b: [2, 1],
      a: { y: null, x: true },
    };

    expect(canonicalizeAffiliateAgentValue(fixture)).toBe(
      '{"a":{"x":true,"y":null},"b":[2,1]}',
    );
    expect(hashAffiliateAgentValue(fixture)).toBe(
      "11910f82e25827a749a9628114fc42560eb68ef68714c22218dd0478d4614208",
    );
  });

  it("rejects values that JSON cannot represent canonically", () => {
    expect(() =>
      canonicalizeAffiliateAgentValue({ missing: undefined }),
    ).toThrow("canonical JSON");
    expect(() => hashAffiliateAgentValue({ amount: Number.NaN })).toThrow(
      "canonical JSON",
    );
    expect(() => canonicalizeAffiliateAgentValue(new Date(0))).toThrow(
      "plain objects",
    );
  });
  it("rejects oversized agent-controlled collections before hashing", () => {
    const oversizedSet = Array.from(
      { length: AFFILIATE_AGENT_MAX_SET_ITEMS + 1 },
      (_, index) => `ref-${String(index).padStart(3, "0")}`,
    );
    const campaignResult = terminalResultFixture(terminalResultCases[0]);
    const policyResult = terminalResultFixture(terminalResultCases[2]);
    const repairResult = terminalResultFixture(terminalResultCases[10]);

    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...campaignResult,
        evidenceRefs: oversizedSet,
        payload: { campaignProposalRefs: oversizedSet },
      }).success,
    ).toBe(false);
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...policyResult,
        payload: {
          supplySourceId: "supply-source-1",
          policyEvidenceRefs: oversizedSet,
        },
      }).success,
    ).toBe(false);
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...repairResult,
        reasonCodes: Array.from(
          { length: AFFILIATE_AGENT_MAX_SET_ITEMS + 1 },
          () => "EVIDENCE_VERIFIED",
        ),
        payload: {
          committedPackageHash: "b".repeat(64),
          repairIssues: oversizedSet,
        },
      }).success,
    ).toBe(false);
    expect(
      affiliateAgentCommandSchema.safeParse({
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          evidenceManifestHash: evidenceManifestFixture.hash,
          candidatePackage: {
            schemaVersion: 1,
            supplySourceId: "supply-source-1",
            listingKind: "EVENT",
            listUrlRef: "url-ref-1",
            itemSelector: ".event-card",
            fields: [],
            evidenceRefs: oversizedSet,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      affiliateAgentClaimEnvelopeSchema.safeParse({
        ...claimFixtureForRole("COVERAGE_PLANNER"),
        evidenceManifest: {
          ...evidenceManifestFixture,
          entries: Array.from(
            { length: AFFILIATE_AGENT_MAX_MANIFEST_ENTRIES + 1 },
            (_, index) => ({
              ...evidenceManifestFixture.entries[0],
              evidenceRef: `evidence-${String(index).padStart(3, "0")}`,
            }),
          ),
        },
      }).success,
    ).toBe(false);
  });
  it("rejects empty terminal action lists", () => {
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...terminalResultFixture(terminalResultCases[0]),
        payload: { campaignProposalRefs: [] },
      }).success,
    ).toBe(false);
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...terminalResultFixture(terminalResultCases[2]),
        payload: {
          supplySourceId: "supply-source-1",
          policyEvidenceRefs: [],
        },
      }).success,
    ).toBe(false);
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...terminalResultFixture(terminalResultCases[10]),
        payload: {
          committedPackageHash: "b".repeat(64),
          repairIssues: [],
        },
      }).success,
    ).toBe(false);
  });
  it("rejects a versioned role contract with no terminal dispositions", () => {
    const { hash: _hash, ...rolePreimage } =
      AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const emptyDispositionPreimage = {
      ...rolePreimage,
      version: 2,
      terminalDispositions: [],
    };
    expect(
      affiliateAgentRoleContractSchema.safeParse({
        ...emptyDispositionPreimage,
        hash: hashAffiliateAgentValue(emptyDispositionPreimage),
      }).success,
    ).toBe(false);
  });

  it("rejects collections whose canonical UTF-8 bytes exceed the limit", () => {
    const oversizedSet = Array.from(
      { length: AFFILIATE_AGENT_MAX_SET_ITEMS },
      (_, index) =>
        `evidence-${String(index).padStart(2, "0")}-${"é".repeat(188)}`,
    );
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...terminalResultFixture(terminalResultCases[0]),
        evidenceRefs: oversizedSet,
      }).success,
    ).toBe(false);

    const oversizedManifestEntries = Array.from(
      { length: AFFILIATE_AGENT_MAX_MANIFEST_ENTRIES },
      (_, index) => {
        const suffix = `${String(index).padStart(2, "0")}-${"é".repeat(188)}`;
        return {
          ...evidenceManifestFixture.entries[0],
          evidenceRef: `evidence-${suffix}`,
          artifactId: `artifact-${suffix}`,
          mimeType: `text/${"é".repeat(188)}`,
        };
      },
    );
    const manifestPreimage = {
      schemaVersion: 1 as const,
      entries: oversizedManifestEntries,
    };
    expect(
      affiliateAgentClaimEnvelopeSchema.safeParse({
        ...claimFixtureForRole("COVERAGE_PLANNER"),
        evidenceManifest: {
          ...manifestPreimage,
          hash: hashAffiliateAgentValue(manifestPreimage),
        },
      }).success,
    ).toBe(false);
  });

  it("parses independently hashed Supply Contract components", () => {
    const parsed = affiliateAgentSupplyContractSchema.parse(
      supplyContractFixture,
    );

    expect(parsed.components.map((component) => component.hash)).toEqual([
      "f13a898bc1710efb2b926ed38da263437d44afcd0039dc684065142d3d451608",
      "0aa04cef3f1f03afb8359f17cece3fca596f5cae8fd4d95ca1ecdbd70378ca38",
      "0de164fdcc9a4b0cb731cc2dd659706c79d657f6d0512b25ca0027e3c3139c03",
      "69ff8f25c91412b3327058ed9daefee5b52cdfc784efd8294704c30adcb20340",
      "fe19bca864dbc9c0b1aa8b3a5db6e6bbca76134f6ff2a62be58bb6cc6d6c1bd0",
      "487050f64d9d5a0d00afff034aa8b2c129da68bdfb537774ec6db263e08b740f",
    ]);
    expect(parsed.hash).toBe(
      "b12139b403f6f2ad946a7d416731ea7eed5aa6cb2bd149e1264c1e9b5304c554",
    );
  });


  it("changes a hash when a contract field changes", () => {
    const contract = AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const { hash, ...preimage } = contract;
    const changedPreimage = {
      ...preimage,
      terminalDispositions: ["APPROVED", ...preimage.terminalDispositions],
    };

    expect(hashAffiliateAgentValue(changedPreimage)).not.toBe(hash);
    expect(
      affiliateAgentRoleContractSchema.safeParse({
        ...changedPreimage,
        hash,
      }).success,
    ).toBe(false);
  });

  it("rejects correctly rehashed version-2 role capability changes", () => {
    const contract = AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const { hash: _hash, ...preimage } = contract;
    const changedPreimages = [
      {
        ...preimage,
        permittedCommands: [
          "CAPTURE_CLAIM_URL",
          "COMMIT_DECLARATIVE_PACKAGE",
          "RUN_DISCOVERY_QUERY",
          "SUBMIT_TERMINAL_RESULT",
        ],
      },
      {
        ...preimage,
        terminalDispositions: ["APPROVED", ...preimage.terminalDispositions],
      },
      {
        ...preimage,
        inputSchemaId: "affiliate-agent/mapping-producer-subject@1",
      },
      {
        ...preimage,
        forbiddenEffects: preimage.forbiddenEffects.slice(0, -1),
      },
      {
        ...preimage,
        retention: {
          ...preimage.retention,
          failedInvocationDiagnosticsDays: 15,
        },
      },
    ];

    expect(
      changedPreimages.map(
        (changedPreimage) =>
          affiliateAgentRoleContractSchema.safeParse({
            ...changedPreimage,
            hash: hashAffiliateAgentValue(changedPreimage),
          }).success,
      ),
    ).toEqual([false, false, false, false, false]);
  });
  it("rejects legacy version-1 role and prompt contracts after the OMP cutover", () => {
    const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const { hash: _roleHash, ...rolePreimage } = roleContract;
    const legacyRolePreimage = {
      ...rolePreimage,
      version: 1,
      promptTemplateVersion: 1,
    };
    expect(
      affiliateAgentRoleContractSchema.safeParse({
        ...legacyRolePreimage,
        hash: hashAffiliateAgentValue(legacyRolePreimage),
      }).success,
    ).toBe(false);

    const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES.COVERAGE_PLANNER;
    const { hash: _promptHash, ...promptPreimage } = promptTemplate;
    const legacyPromptPreimage = {
      ...promptPreimage,
      version: 1,
    };
    expect(
      affiliateAgentPromptTemplateSchema.safeParse({
        ...legacyPromptPreimage,
        hash: hashAffiliateAgentValue(legacyPromptPreimage),
      }).success,
    ).toBe(false);
  });


  it("parses one complete contract bundle and rejects mismatched deployment references", () => {
    const parsed = affiliateAgentContractBundleSchema.parse(
      contractBundleFixture,
    );

    expect(parsed.promptTemplates).toHaveLength(4);

    const deploymentVariants = [
      {
        ...deploymentContractFixture,
        activeSupplyContract: {
          version: 2,
          hash: "d".repeat(64),
        },
      },
      {
        ...deploymentContractFixture,
        roleContracts: deploymentContractFixture.roleContracts.map(
          (reference, index) =>
            index === 0
              ? {
                  ...reference,
                  version: reference.version + 1,
                  hash: "d".repeat(64),
                }
              : reference,
        ),
      },
      {
        ...deploymentContractFixture,
        promptTemplates: deploymentContractFixture.promptTemplates.map(
          (reference, index) =>
            index === 0
              ? {
                  ...reference,
                  version: reference.version + 1,
                  hash: "d".repeat(64),
                }
              : reference,
        ),
      },
    ].map(({ hash: _hash, ...preimage }) => ({
      ...preimage,
      hash: hashAffiliateAgentValue(preimage),
    }));

    deploymentVariants.forEach((deploymentContract) => {
      expect(
        affiliateAgentContractBundleSchema.safeParse({
          ...contractBundleFixture,
          deploymentContract,
        }).success,
      ).toBe(false);
    });
  });

  it("parses all four typed claim subjects", () => {
    const roles = [
      "COVERAGE_PLANNER",
      "MAPPING_PRODUCER",
      "SUPPLY_REVIEWER",
      "HUMAN_DIRECTED_EXECUTOR",
    ] as const;
    const parsed = roles.map((role) =>
      affiliateAgentClaimEnvelopeSchema.parse(claimFixtureForRole(role)),
    );

    expect(
      parsed.map((claim) => ({
        role: claim.role,
        subjectType: claim.subject.type,
        queue: claim.queue,
        lane: claim.lane,
      })),
    ).toEqual([
      {
        role: "COVERAGE_PLANNER",
        subjectType: "COVERAGE_PLANNER",
        queue: "AFFILIATE_COVERAGE",
        lane: "COVERAGE_PLANNING",
      },
      {
        role: "MAPPING_PRODUCER",
        subjectType: "MAPPING_PRODUCER",
        queue: "AFFILIATE_MAPPING",
        lane: "MAPPING_PRODUCTION",
      },
      {
        role: "SUPPLY_REVIEWER",
        subjectType: "SUPPLY_REVIEWER",
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
      },
      {
        role: "HUMAN_DIRECTED_EXECUTOR",
        subjectType: "HUMAN_DIRECTED_EXECUTOR",
        queue: "AFFILIATE_HUMAN_DIRECTED",
        lane: "HUMAN_EXECUTION",
      },
    ]);
  });
  it("rejects claim identity conflicts within role subjects", () => {
    const mappingClaim = claimFixtureForRole("MAPPING_PRODUCER");
    const reviewerClaim = claimFixtureForRole("SUPPLY_REVIEWER");
    const conflictingClaims = [
      {
        ...claimFixtureForRole("COVERAGE_PLANNER"),
        supplySourceId: "unexpected-source",
      },
      {
        ...mappingClaim,
        supplySourceId: "different-source",
      },
      {
        ...reviewerClaim,
        supplySourceId: "different-source",
      },
      {
        ...reviewerClaim,
        workerId: reviewerClaim.subject.producerWorkerId,
      },
      {
        ...reviewerClaim,
        invocationId: reviewerClaim.subject.producerInvocationId,
      },
      {
        ...reviewerClaim,
        workspaceId: reviewerClaim.subject.producerWorkspaceId,
      },
    ];

    expect(
      conflictingClaims.map(
        (claim) => affiliateAgentClaimEnvelopeSchema.safeParse(claim).success,
      ),
    ).toEqual([false, false, false, false, false, false]);
  });

  it("rejects a role-forbidden command", () => {
    expect(
      affiliateAgentClaimEnvelopeSchema.safeParse({
        ...claimFixtureForRole("SUPPLY_REVIEWER"),
        permittedCommands: ["CAPTURE_CLAIM_URL", "SUBMIT_TERMINAL_RESULT"],
      }).success,
    ).toBe(false);
  });

  it("parses only closed typed gateway commands", () => {
    expect(
      affiliateAgentCommandSchema.parse({
        type: "RUN_DISCOVERY_QUERY",
        data: {
          strategyRef: "strategy-1",
          queryRef: "query-1",
        },
      }),
    ).toEqual({
      type: "RUN_DISCOVERY_QUERY",
      data: {
        strategyRef: "strategy-1",
        queryRef: "query-1",
      },
    });

    expect(
      affiliateAgentCommandSchema.safeParse({
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          evidenceManifestHash: evidenceManifestFixture.hash,
          candidatePackage: {
            schemaVersion: 1,
            supplySourceId: "supply-source-1",
            listingKind: "EVENT",
            listUrlRef: "url-ref-1",
            itemSelector: ".event-card",
            fields: [
              {
                field: "title",
                selector: ".title",
                mode: "TEXT",
                attribute: null,
                transform: "TRIM",
              },
            ],
            evidenceRefs: ["evidence-1"],
            script: "process.exit(1)",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("parses the complete role and terminal-disposition matrix", () => {
    const parsed = terminalResultCases.map((resultCase) =>
      affiliateAgentTerminalResultEnvelopeSchema.parse(
        terminalResultFixture(resultCase),
      ),
    );

    expect(parsed).toHaveLength(18);
    expect(
      parsed.map((result) => `${result.role}:${result.disposition}`),
    ).toEqual(
      terminalResultCases.map(
        ({ role, disposition }) => `${role}:${disposition}`,
      ),
    );
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...terminalResultFixture(terminalResultCases[0]),
        disposition: "APPROVED",
        payload: { committedPackageHash: "b".repeat(64) },
      }).success,
    ).toBe(false);
    expect(
      affiliateAgentTerminalResultEnvelopeSchema.safeParse({
        ...terminalResultFixture(
          terminalResultCases.find(
            (resultCase) =>
              resultCase.role === "COVERAGE_PLANNER" &&
              resultCase.disposition === "NO_ACTION",
          )!,
        ),
        evidenceRefs: [],
      }).success,
    ).toBe(false);
  });
  it("renders one explicit authority projection with the complete evidence manifest", () => {
    const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const claim = affiliateAgentClaimEnvelopeSchema.parse(
      claimFixtureForRole("COVERAGE_PLANNER"),
    );
    const prompt = renderAffiliateAgentPrompt(roleContract, claim);
    const projectionJson = prompt
      .split("## Authority Projection\n")[1]
      .split("\n\n## Role Instructions")[0];

    expect(JSON.parse(projectionJson)).toEqual({
      schemaVersion: 1,
      role: "COVERAGE_PLANNER",
      queue: claim.queue,
      lane: claim.lane,
      jobId: claim.jobId,
      claimId: claim.claimId,
      supplySourceId: null,
      executionClass: "PRODUCTION_OMP",
      workerId: claim.workerId,
      invocationId: claim.invocationId,
      workspaceId: claim.workspaceId,
      claimedAt: claim.claimedAt,
      expiresAt: claim.expiresAt,
      deploymentContractVersion: claim.deploymentContractVersion,
      deploymentContractHash: claim.deploymentContractHash,
      supplyContractVersion: claim.supplyContractVersion,
      supplyContractHash: claim.supplyContractHash,
      roleContractVersion: roleContract.version,
      roleContractHash: roleContract.hash,
      promptTemplateVersion: roleContract.promptTemplateVersion,
      promptTemplateHash: roleContract.promptTemplateHash,
      claimEnvelopeHash: hashAffiliateAgentValue(claim),
      evidenceManifest: claim.evidenceManifest,
      claimGeneration: claim.claimGeneration,
      lifecycleGeneration: claim.lifecycleGeneration,
      subject: claim.subject,
      nonTerminalCommands: ["CAPTURE_CLAIM_URL", "RUN_DISCOVERY_QUERY"],
      terminalDispositions: roleContract.terminalDispositions,
      forbiddenEffects: roleContract.forbiddenEffects,
    });
  });
  it("renders a byte-identical prompt", () => {
    const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const claim = affiliateAgentClaimEnvelopeSchema.parse(
      claimFixtureForRole("COVERAGE_PLANNER"),
    );

    const first = renderAffiliateAgentPrompt(roleContract, claim);
    const second = renderAffiliateAgentPrompt(roleContract, claim);

    expect(first).toBe(second);
    expect(first).not.toContain("\r");
    expect(first).toContain('"role":"COVERAGE_PLANNER"');
    expect(first).toContain(`"claimId":"${claim.claimId}"`);
  });


  it("freezes the transactional timing and retry policy", () => {
    expect({
      heartbeat: AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
      lease: AFFILIATE_AGENT_LEASE_SECONDS,
      deadline: AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
      attestationAdmissionMargin:
        AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS,
      attestationLifetime: AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS,
      schemaCorrections: AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS,
      invocationAttempts: AFFILIATE_AGENT_MAX_INVOCATION_ATTEMPTS,
      retryDelays: [1, 2, 3].map((attempt) =>
        affiliateAgentRetryDelaySeconds(attempt as 1 | 2 | 3),
      ),
    }).toEqual({
      heartbeat: 60,
      lease: 300,
      deadline: 1_200,
      attestationAdmissionMargin: 180,
      attestationLifetime: 1_380,
      schemaCorrections: 3,
      invocationAttempts: 3,
      retryDelays: [300, 900, null],
    });
  });
});

type GatewayTestRow = Record<string, unknown>;
const gatewayTestMatchesAlternative = (
  row: GatewayTestRow,
  alternative: unknown,
): boolean => {
  if (alternative === null || typeof alternative !== "object") return false;
  return gatewayTestMatchesWhere(row, alternative as GatewayTestRow);
};

const gatewayTestIsObjectFilter = (
  value: unknown,
): value is GatewayTestRow =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const gatewayTestMatchesFilterMembership = (
  actual: unknown,
  filter: GatewayTestRow,
): boolean => {
  if (Array.isArray(filter.in) && !filter.in.includes(actual)) return false;
  if (Array.isArray(filter.notIn) && filter.notIn.includes(actual)) return false;
  return true;
};

const gatewayTestMatchesDateFilter = (
  actual: unknown,
  filter: GatewayTestRow,
  key: "lte" | "lt",
): boolean => {
  const boundary = filter[key];
  if (!(boundary instanceof Date)) return true;
  if (!(actual instanceof Date)) return false;
  return key === "lte" ? !(actual > boundary) : !(actual >= boundary);
};

const gatewayTestMatchesObjectFilter = (
  actual: unknown,
  filter: GatewayTestRow,
): boolean => {
  if (!gatewayTestMatchesFilterMembership(actual, filter)) return false;
  if (!gatewayTestMatchesDateFilter(actual, filter, "lte")) return false;
  if (!gatewayTestMatchesDateFilter(actual, filter, "lt")) return false;
  return true;
};

const gatewayTestMatchesExpectedValue = (
  row: GatewayTestRow,
  key: string,
  expected: unknown,
): boolean => {
  if (expected === undefined) return true;
  if (key === "AND" && Array.isArray(expected)) {
    return expected.every((alternative) =>
      gatewayTestMatchesAlternative(row, alternative),
    );
  }
  if (key === "OR" && Array.isArray(expected)) {
    return expected.some((alternative) =>
      gatewayTestMatchesAlternative(row, alternative),
    );
  }
  const actual = row[key];
  if (expected instanceof Date) {
    return actual instanceof Date && actual.getTime() === expected.getTime();
  }
  if (gatewayTestIsObjectFilter(expected)) {
    return gatewayTestMatchesObjectFilter(actual, expected);
  }
  return actual === expected;
};

const gatewayTestMatchesWhere = (
  row: GatewayTestRow,
  where: GatewayTestRow,
): boolean => {
  const matches = Object.entries(where).every(([key, expected]) =>
    gatewayTestMatchesExpectedValue(row, key, expected),
  );
  return matches;
};

type GatewayClaimTransactionBarrier = Readonly<{
  entered(): void;
  released: Promise<void>;
}>;
type GatewayOperationReceiptReadBarrier = {
  remaining: number;
  entered(): void;
  released: Promise<void>;
};

type GatewayClaimTestPrisma = {
  affiliateAgentGatewayJobs: {
    findFirst(input: { where: GatewayTestRow }): Promise<GatewayTestRow | null>;
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
    findMany(input: {
      where: GatewayTestRow;
      take?: number;
    }): Promise<GatewayTestRow[]>;
    updateMany(input: {
      where: GatewayTestRow;
      data: GatewayTestRow;
    }): Promise<{ count: number }>;
  };
  affiliateAgentGatewayClaims: {
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
    findFirst(input: { where: GatewayTestRow }): Promise<GatewayTestRow | null>;
    findMany(input: {
      where: GatewayTestRow;
      take?: number;
    }): Promise<GatewayTestRow[]>;
    create(input: { data: GatewayTestRow }): Promise<GatewayTestRow>;
    updateMany(input: {
      where: GatewayTestRow;
      data: GatewayTestRow;
    }): Promise<{ count: number }>;
  };
  affiliateSupplySources: {
    findUnique(input: {
      where: GatewayTestRow;
      select?: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
  };
  affiliateSupplyLifecycleTransitions: {
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
    findFirst(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
  };
  affiliateSourceDiscoveryRuns: {
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
  };
  affiliateAgentWorkerHealth: {
    upsert(input: {
      where: GatewayTestRow;
      create: GatewayTestRow;
      update: GatewayTestRow;
    }): Promise<GatewayTestRow>;
  };
  affiliateAgentGatewayArtifacts: {
    createMany(input: {
      data: readonly GatewayTestRow[];
    }): Promise<{ count: number }>;
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
  };
  affiliateAgentGatewayOperationReceipts: {
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
    findFirst(input: { where: GatewayTestRow }): Promise<GatewayTestRow | null>;
    findMany(input: {
      where: GatewayTestRow;
      take?: number;
    }): Promise<GatewayTestRow[]>;
    create(input: { data: GatewayTestRow }): Promise<GatewayTestRow>;
    updateMany(input: {
      where: GatewayTestRow;
      data: GatewayTestRow;
    }): Promise<{ count: number }>;
  };
  affiliateAgentGatewayEvents: {
    create(input: { data: GatewayTestRow }): Promise<GatewayTestRow>;
    findFirst(input: {
      where: GatewayTestRow;
      orderBy?: readonly GatewayTestRow[];
    }): Promise<GatewayTestRow | null>;
  };
  affiliateOperationalAlerts: {
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
    create(input: { data: GatewayTestRow }): Promise<GatewayTestRow>;
  };
  $queryRaw<T>(query: unknown): Promise<T>;
  $transaction<T>(
    callback: (transaction: GatewayClaimTestPrisma) => Promise<T>,
    options?: GatewayTestRow,
  ): Promise<T>;
};

type GatewayClaimHarness = Readonly<{
  gateway: AffiliateAgentGateway;
  reconciler: AffiliateAgentInvocationReconciler;
  recreateGateway(): AffiliateAgentGateway;
  state: {
    jobs: GatewayTestRow[];
    claims: GatewayTestRow[];
    artifacts: GatewayTestRow[];
    discoveryRuns: GatewayTestRow[];
    receipts: GatewayTestRow[];
    workerHealth: GatewayTestRow[];
    events: GatewayTestRow[];
    operationalAlerts: GatewayTestRow[];
    lifecycleTransitions: GatewayTestRow[];
    lifecycleCalls: GatewayTestRow[];
    reviewerEffectCalls: string[];
    lifecycleRecoverReceiptIds: string[];
    externalStartKeys: string[];
    externalRecoverKeys: string[];
    transactionCalls: number;
  };
  artifactBytes: Buffer;
  setNow(value: string): void;
  setArtifactRead(value: AffiliateAgentArtifactRead): void;
  setArtifactReadError(value: unknown): void;
  setConcurrentArtifact(value: GatewayTestRow): void;
  setTransactionConflictsAfterArtifactRead(value: number): void;
  setNextTransactionConflicts(value: number): void;
  setNextTransactionError(value: unknown): void;
  setActiveBundle(value: unknown): void;
  setExternalCaptureMode(value: "SUCCEED" | "LOSE_RESPONSE" | "UNKNOWN"): void;
  setTerminalEffectTimeAdvanceSeconds(value: number): void;
  setExternalMimeType(value: string): void;
  setLifecycleResponseLoss(value: boolean): void;
  setLifecycleGeneration(value: number): void;
  setLifecycleSafeOutputDetails(value: string | null): void;
  setClaimCreateError(value: unknown): void;
  setOperationReceiptReadBarrier(
    barrier: GatewayOperationReceiptReadBarrier,
  ): void;
  setOperationReceiptCreateConflict(value: unknown, persist?: boolean): void;
  setClaimAdmissionOpen(value: boolean): void;
  setDomainDelegates(value: Readonly<Record<string, unknown>>): void;
  request: AffiliateAgentClaimRequest;
}>;

const gatewayTestIncrement = (value: unknown): number | null => {
  if (
    value !== null &&
    typeof value === "object" &&
    "increment" in value &&
    typeof value.increment === "number"
  ) {
    return value.increment;
  }
  return null;
};

type GatewayClaimHarnessOptions = Readonly<{
  disableExternalAdapters?: boolean;
  advanceClockDuringCredentialVerificationSeconds?: number;
  advanceClockDuringTransactionalCommandSeconds?: number;
  operationalAlert?: AffiliateOperationalAlertWriter;
  persistLifecycleAlertTransition?: boolean;
  persistLifecycleTransition?: boolean;
  claimAdmissionOpen?: boolean;
  claimAdmission?: AffiliateAgentClaimAdmission;
  claimTransactionBarrier?: GatewayClaimTransactionBarrier;
}>;
const captureRecordSummaryFixture = (
  value: Readonly<Record<string, unknown>>,
): Readonly<{
  keys: readonly string[];
  sha256: string;
  byteSize: number;
}> => {
  const canonical = canonicalizeAffiliateAgentValue(value);
  return {
    keys: Object.keys(value).sort(),
    sha256: createHash("sha256").update(canonical).digest("hex"),
    byteSize: Buffer.byteLength(canonical, "utf8"),
  };
};

const captureTextSummaryFixture = (
  value: string | null,
): Readonly<{ sha256: string; byteSize: number }> | null =>
  value === null
    ? null
    : {
        sha256: createHash("sha256").update(value, "utf8").digest("hex"),
        byteSize: Buffer.byteLength(value, "utf8"),
      };

const captureSetSummaryFixture = (
  values: readonly string[],
): Readonly<{ count: number; sha256: string; refs: readonly string[] }> => ({
  count: values.length,
  sha256: hashAffiliateAgentValue(values),
  refs: values,
});


const createGatewayClaimHarness = (
  options: GatewayClaimHarnessOptions = {},
): GatewayClaimHarness => {
  let activeBundle: unknown = contractBundleFixture;
  let currentTime = new Date("2026-08-20T18:00:00.000Z");
  const initialTime = new Date(currentTime);
  let identifierSequence = 0;
  let claimCreateError: unknown = null;
  let operationReceiptCreateError: unknown = null;
  let persistOperationReceiptCreateError = false;
  let artifactReadError: unknown = null;
  let operationReceiptReadBarrier: GatewayOperationReceiptReadBarrier | null =
    null;
  let concurrentArtifact: GatewayTestRow | null = null;
  let transactionConflictsAfterArtifactRead = 0;
  let pendingTransactionError: unknown = null;
  let pendingTransactionConflicts = 0;
  let lifecycleSafeOutputDetails: string | null = null;
  let terminalEffectTimeAdvanceSeconds = 0;
  let currentLifecycleGeneration = 7;
  let externalMimeType = "text/markdown";
  let claimAdmissionOpen = options.claimAdmissionOpen ?? true;
  let claimTransactionBarrier = options.claimTransactionBarrier ?? null;
  const claimAdmission: AffiliateAgentClaimAdmission =
    options.claimAdmission ?? {
      isOpen: () => claimAdmissionOpen,
      withClaim: (operation) => operation(),
    };

  const artifactBytes = Buffer.from("verified gateway artifact", "utf8");
  let externalCaptureMode: "SUCCEED" | "LOSE_RESPONSE" | "UNKNOWN" = "SUCCEED";
  const externalCaptureEffects = new Map<
    string,
    Readonly<Record<string, unknown>>
  >();
  let isLifecycleResponseLost = false;
  const lifecycleEffects = new Map<string, Readonly<Record<string, unknown>>>();
  const reviewerTerminalEffects = new Map<
    string,
    Readonly<Record<string, unknown>>
  >();
  const gatewayEvidenceManifestPreimage = {
    schemaVersion: 1 as const,
    entries: [
      {
        evidenceRef: "evidence-1",
        kind: "PAGE_MARKDOWN" as const,
        artifactId: "file-evidence-1",
        sha256: createHash("sha256").update(artifactBytes).digest("hex"),
        mimeType: "text/markdown",
        byteSize: artifactBytes.byteLength,
        retention: "INDEFINITE" as const,
      },
    ],
  };
  const gatewayEvidenceManifest = {
    ...gatewayEvidenceManifestPreimage,
    hash: hashAffiliateAgentValue(gatewayEvidenceManifestPreimage),
  };
  let artifactRead: AffiliateAgentArtifactRead = {
    bytes: new Uint8Array(artifactBytes),
    mimeType: "text/markdown",
    byteSize: artifactBytes.byteLength,
    sourceUrl: "https://evidence.example.test/page",
    finalUrl: "https://evidence.example.test/page",
  };
  const state = {
    jobs: [
      {
        id: "gateway-job-1",
        createdAt: initialTime,
        updatedAt: initialTime,
        dedupeKey: "coverage:coverage-cell-1:assessment-cycle-1",
        queue: "AFFILIATE_COVERAGE",
        lane: "COVERAGE_PLANNING",
        role: "COVERAGE_PLANNER",
        subjectType: "COVERAGE_PLANNER",
        subjectId: "coverage-cell-1",
        subjectJson: claimRoleFields.COVERAGE_PLANNER.subject,
        evidenceManifestJson: gatewayEvidenceManifest,
        supplySourceId: null,
        expectedLifecycleGeneration: null,
        status: "QUEUED",
        priority: 10,
        nextAttemptAt: initialTime,
        claimGeneration: 0,
        activeClaimId: null,
        parentClaimId: null,
        invocationFailureCount: 0,
        lastInvocationFailedAt: null,
        pipelineBlockedAt: null,
        terminalDisposition: null,
        resultHash: null,
        resultJson: null,
        terminalReceiptId: null,
        finishedAt: null,
        eventSequence: 0,
      },
    ] as GatewayTestRow[],
    claims: [] as GatewayTestRow[],
    artifacts: [] as GatewayTestRow[],
    discoveryRuns: [] as GatewayTestRow[],
    receipts: [] as GatewayTestRow[],
    events: [] as GatewayTestRow[],
    workerHealth: [] as GatewayTestRow[],
    operationalAlerts: [] as GatewayTestRow[],
    lifecycleTransitions: [] as GatewayTestRow[],
    lifecycleCalls: [] as GatewayTestRow[],
    reviewerEffectCalls: [] as string[],
    lifecycleRecoverReceiptIds: [] as string[],
    externalStartKeys: [] as string[],
    externalRecoverKeys: [] as string[],
    transactionCalls: 0,
  };
const findOperationReceiptById = (
  id: string,
): GatewayTestRow | null =>
  state.receipts.find((receipt) => receipt.id === id) ?? null;

const findOperationReceiptByCompound = async (
  compound: unknown,
): Promise<GatewayTestRow | null> => {
  if (
    compound === null
    || typeof compound !== "object"
    || !("claimId" in compound)
    || !("idempotencyKey" in compound)
  ) {
    return null;
  }
  const selected =
    state.receipts.find(
      (receipt) =>
        receipt.claimId === compound.claimId &&
        receipt.idempotencyKey === compound.idempotencyKey,
    ) ?? null;
  if (selected === null && operationReceiptReadBarrier !== null) {
    const barrier = operationReceiptReadBarrier;
    barrier.remaining -= 1;
    if (barrier.remaining === 0) {
      operationReceiptReadBarrier = null;
      barrier.entered();
    }
    await barrier.released;
  }
  return selected;
};

const queryRecordFor = (
  query: unknown,
): { strings?: readonly unknown[]; values?: readonly unknown[] } =>
  query !== null && typeof query === "object"
    ? query as { strings?: readonly unknown[]; values?: readonly unknown[] }
    : {};

const queryTextFor = (
  queryRecord: { strings?: readonly unknown[] },
): string =>
  Array.isArray(queryRecord.strings) ? queryRecord.strings.join("") : "";

const lifecycleDeadlineRowsFor = (
  queryRecord: { values?: readonly unknown[] },
): Array<{ id: unknown }> => {
  const before =
    queryRecord.values?.find(
      (value): value is Date => value instanceof Date,
    ) ?? currentTime;
  const limit =
    [...(queryRecord.values ?? [])]
      .reverse()
      .find((value): value is number => typeof value === "number") ??
    state.claims.length;
  return state.claims
    .filter((claim) => {
      if (
        claim.status !== "ACTIVE" ||
        !(claim.leaseExpiresAt instanceof Date) ||
        !(claim.hardDeadlineAt instanceof Date) ||
        (claim.leaseExpiresAt > before && claim.hardDeadlineAt > before)
      ) {
        return false;
      }
      return !state.receipts.some(
        (receipt) =>
          receipt.claimId === claim.id &&
          receipt.jobId === claim.jobId &&
          receipt.claimGeneration === claim.claimGeneration &&
          receipt.status === "SUCCEEDED" &&
          receipt.operationKind === "EXECUTE_COMMAND" &&
          receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND" &&
          claim.hardDeadlineAt > before,
      );
    })
    .sort(
      (left, right) =>
        Number(left.hardDeadlineAt) - Number(right.hardDeadlineAt) ||
        Number(left.leaseExpiresAt) - Number(right.leaseExpiresAt) ||
        String(left.id).localeCompare(String(right.id)),
    )
    .slice(0, limit)
    .map(({ id }) => ({ id }));
};

const reviewerEffectRows = (): Array<{ id: unknown }> =>
  state.receipts
    .filter((receipt) => {
      const claim = state.claims.find(
        (candidate) => candidate.id === receipt.claimId,
      );
      const isReviewerTerminalEffect =
        claim?.role === "SUPPLY_REVIEWER" &&
        receipt.status === "SUCCEEDED" &&
        receipt.operationKind === "TERMINAL_EFFECT" &&
        receipt.commandName === "SUPPLY_REVIEWER_TERMINAL_EFFECT";
      return claim?.status === "ACTIVE" && isReviewerTerminalEffect;
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map(({ id }) => ({ id }));

  const prismaMock: GatewayClaimTestPrisma = {
    affiliateAgentGatewayJobs: {
      findFirst: async ({ where }) =>
        state.jobs.find((job) => gatewayTestMatchesWhere(job, where)) ?? null,
      findMany: async ({ where, take }) => {
        const matches = state.jobs.filter((job) =>
          gatewayTestMatchesWhere(job, where),
        );
        return take === undefined ? matches : matches.slice(0, take);
      },
      findUnique: async ({ where }) =>
        state.jobs.find((job) => job.id === where.id) ?? null,
      updateMany: async ({ where, data }) => {
        const job = state.jobs.find((candidate) =>
          gatewayTestMatchesWhere(candidate, where),
        );
        if (!job) return { count: 0 };
        const claimGenerationIncrement = gatewayTestIncrement(
          data.claimGeneration,
        );
        const eventSequenceIncrement = gatewayTestIncrement(data.eventSequence);
        const invocationFailureIncrement = gatewayTestIncrement(
          data.invocationFailureCount,
        );
        Object.assign(job, data, {
          claimGeneration:
            claimGenerationIncrement !== null
              ? Number(job.claimGeneration) + claimGenerationIncrement
              : (data.claimGeneration ?? job.claimGeneration),
          eventSequence:
            eventSequenceIncrement !== null
              ? Number(job.eventSequence) + eventSequenceIncrement
              : (data.eventSequence ?? job.eventSequence),
          invocationFailureCount:
            invocationFailureIncrement !== null
              ? Number(job.invocationFailureCount) + invocationFailureIncrement
              : (data.invocationFailureCount ?? job.invocationFailureCount),
        });
        return { count: 1 };
      },
    },
    affiliateAgentGatewayClaims: {
      findUnique: async ({ where }) =>
        state.claims.find(
          (claim) =>
            (where.id !== undefined && claim.id === where.id) ||
            (where.claimRequestId !== undefined &&
              claim.claimRequestId === where.claimRequestId),
        ) ?? null,
      findFirst: async ({ where }) =>
        state.claims.find((claim) => gatewayTestMatchesWhere(claim, where)) ??
        null,
      findMany: async ({ where, take }) => {
        const matches = state.claims.filter((claim) =>
          gatewayTestMatchesWhere(claim, where),
        );
        return take === undefined ? matches : matches.slice(0, take);
      },
      create: async ({ data }) => {
        if (claimCreateError !== null) throw claimCreateError;
        const isDuplicate = state.claims.some(
          (claim) =>
            claim.claimRequestId === data.claimRequestId ||
            claim.invocationId === data.invocationId ||
            claim.workspaceId === data.workspaceId ||
            claim.tokenHash === data.tokenHash,
        );
        if (isDuplicate) throw { code: "P2002" };
        state.claims.push(data);
        return data;
      },
      updateMany: async ({ where, data }) => {
        const claim = state.claims.find((candidate) =>
          gatewayTestMatchesWhere(candidate, where),
        );
        if (!claim) return { count: 0 };
        Object.assign(claim, data);
        return { count: 1 };
      },
    },
    affiliateSupplySources: {
      findUnique: async ({ where }) =>
        typeof where.id === "string"
          ? {
              id: where.id,
              lifecycleGeneration: currentLifecycleGeneration,
            }
          : null,
    },
    affiliateSupplyLifecycleTransitions: {
      findUnique: async ({ where }) =>
        state.lifecycleTransitions.find((transition) =>
          gatewayTestMatchesWhere(transition, where),
        ) ?? null,
      findFirst: async ({ where }) =>
        state.lifecycleTransitions.find((transition) =>
          gatewayTestMatchesWhere(transition, where),
        ) ?? null,
    },
    affiliateSourceDiscoveryRuns: {
      findUnique: async ({ where }) =>
        state.discoveryRuns.find((run) => gatewayTestMatchesWhere(run, where))
        ?? null,
    },
    affiliateAgentWorkerHealth: {
      upsert: async ({ where, create, update }) => {
        const key = where.workerId_role as GatewayTestRow;
        const existing = state.workerHealth.find(
          (worker) =>
            worker.workerId === key.workerId && worker.role === key.role,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        state.workerHealth.push(create);
        return create;
      },
    },
    affiliateAgentGatewayArtifacts: {
      findMany: async ({ where }) =>
        state.artifacts.filter((artifact) =>
          gatewayTestMatchesWhere(artifact, where),
        ),
      createMany: async ({ data }) => {
        if (concurrentArtifact !== null) {
          state.artifacts.push(concurrentArtifact);
          concurrentArtifact = null;
          return { count: 0 };
        }
        state.artifacts.push(...data);
        return { count: data.length };
      },
      findUnique: async ({ where }) => {
        const compound = where.claimId_evidenceRef;
        if (
          compound === null ||
          typeof compound !== "object" ||
          !("claimId" in compound) ||
          !("evidenceRef" in compound)
        ) {
          return null;
        }
        return (
          state.artifacts.find(
            (artifact) =>
              artifact.claimId === compound.claimId &&
              artifact.evidenceRef === compound.evidenceRef,
          ) ?? null
        );
      },
    },
    affiliateAgentGatewayOperationReceipts: {
      findUnique: async ({ where }) =>
        typeof where.id === "string"
          ? findOperationReceiptById(where.id)
          : findOperationReceiptByCompound(where.claimId_idempotencyKey),
      create: async ({ data }) => {
        if (operationReceiptCreateError !== null) {
          const error = operationReceiptCreateError;
          const persist = persistOperationReceiptCreateError;
          operationReceiptCreateError = null;
          persistOperationReceiptCreateError = false;
          if (persist) state.receipts.push(data);
          throw error;
        }
        const duplicate = state.receipts.some(
          (receipt) =>
            receipt.claimId === data.claimId &&
            receipt.idempotencyKey === data.idempotencyKey,
        );
        if (duplicate) {
          throw {
            code: "P2002",
            meta: { target: ["claimId_idempotencyKey"] },
          };
        }
        state.receipts.push(data);
        return data;
      },
      findFirst: async ({ where }) =>
        state.receipts.find((receipt) =>
          gatewayTestMatchesWhere(receipt, where),
        ) ?? null,
      findMany: async ({ where, take }) => {
        const matches = state.receipts.filter((receipt) =>
          gatewayTestMatchesWhere(receipt, where),
        );
        return take === undefined ? matches : matches.slice(0, take);
      },
      updateMany: async ({ where, data }) => {
        const receipt = state.receipts.find((candidate) =>
          gatewayTestMatchesWhere(candidate, where),
        );
        if (!receipt) return { count: 0 };
        Object.assign(receipt, data);
        return { count: 1 };
      },
    },
    affiliateAgentGatewayEvents: {
      create: async ({ data }) => {
        state.events.push(data);
        return data;
      },
      findFirst: async ({ where, orderBy }) => {
        const matches = state.events.filter((event) =>
          gatewayTestMatchesWhere(event, where),
        );
        if (orderBy?.some((entry) => entry.sequence === "desc")) {
          matches.sort(
            (left, right) =>
              Number(right.sequence ?? 0) - Number(left.sequence ?? 0),
          );
        }
        return matches[0] ?? null;
      },
    },
    affiliateOperationalAlerts: {
      findUnique: async ({ where }) =>
        state.operationalAlerts.find(
          (alert) => alert.eventKey === where.eventKey,
        ) ?? null,
      create: async ({ data }) => {
        const existing = state.operationalAlerts.find(
          (alert) => alert.eventKey === data.eventKey,
        );
        if (existing) throw { code: "P2002" };
        state.operationalAlerts.push(data);
        return data;
      },
    },
    $queryRaw: async <T>(query: unknown) => {
      const queryRecord = queryRecordFor(query);
      const queryText = queryTextFor(queryRecord);
      if (
        queryText.includes('FROM "AffiliateSupplySources"') &&
        queryText.includes('"lifecycleGeneration"')
      ) {
        return [{ lifecycleGeneration: currentLifecycleGeneration }] as T;
      }
      if (
        queryText.includes('claim."hardDeadlineAt"') &&
        queryText.includes("NOT EXISTS")
      ) {
        return lifecycleDeadlineRowsFor(queryRecord) as T;
      }
      return reviewerEffectRows() as T;
    },
    $transaction: async <T>(
      callback: (transaction: GatewayClaimTestPrisma) => Promise<T>,
    ): Promise<T> => {
      state.transactionCalls += 1;
      const barrier = claimTransactionBarrier;
      if (barrier !== null) {
        claimTransactionBarrier = null;
        barrier.entered();
        await barrier.released;
      }
      if (pendingTransactionError !== null) {
        const error = pendingTransactionError;
        pendingTransactionError = null;
        throw error;
      }
      if (pendingTransactionConflicts > 0) {
        pendingTransactionConflicts -= 1;
        throw { code: "P2034", message: "unsafe serializable conflict detail" };
      }
      return callback(prismaMock);
    },
  };

  // The fake implements the gateway delegates; PrismaClient's nominal internals cannot be modeled.
  const gatewayPrismaTestDouble = prismaMock as unknown as PrismaClient;
  const reviewerEffectHandler = (
    disposition: AffiliateAgentReviewerTerminalDisposition,
  ) => ({
    execute: async ({ receiptId }: { receiptId: string }) => {
      state.reviewerEffectCalls.push(`${disposition}:execute`);
      if (terminalEffectTimeAdvanceSeconds > 0) {
        currentTime = new Date(
          currentTime.getTime() + terminalEffectTimeAdvanceSeconds * 1_000,
        );
      }
      const output = { effect: "APPLIED", receiptId };
      reviewerTerminalEffects.set(receiptId, output);
      return output;
    },
    recover: async ({ receiptId }: { receiptId: string }) => {
      state.reviewerEffectCalls.push(`${disposition}:recover`);
      return reviewerTerminalEffects.get(receiptId) ?? null;
    },
  });

  const productionDependencies = createProductionAffiliateAgentGatewayDependencies({
    prisma: gatewayPrismaTestDouble,
    tokenSigningKey: Buffer.from("gateway-test-signing-key".repeat(2)),
    tokenKeyVersion: "test-key-v1",
    clock: { now: () => new Date(currentTime) },
    identifiers: {
      create: (kind) => `${kind}-${++identifierSequence}`,
    },
    credentials: {
      verify: async (input) => {
        const isValid =
          input.roleCredential ===
            {
              COVERAGE_PLANNER: "coverage-role-credential",
              MAPPING_PRODUCER: "mapping-role-credential",
              SUPPLY_REVIEWER: "review-role-credential",
              HUMAN_DIRECTED_EXECUTOR: "human-role-credential",
            }[input.role] && input.executionClass === "PRODUCTION_OMP";
        if (
          isValid &&
          options.advanceClockDuringCredentialVerificationSeconds !== undefined
        ) {
          currentTime = new Date(
            currentTime.getTime() +
              options.advanceClockDuringCredentialVerificationSeconds * 1_000,
          );
        }
        return isValid;
      },
    },
    workspaces: {
      verify: async (attestation) =>
        attestation.signature === "valid-workspace-signature",
    },
    contracts: {
      loadActiveBundle: async () => activeBundle,
    },
    artifacts: {
      readImmutable: async () => {
        if (artifactReadError !== null) throw artifactReadError;
        if (transactionConflictsAfterArtifactRead > 0) {
          pendingTransactionConflicts = transactionConflictsAfterArtifactRead;
          transactionConflictsAfterArtifactRead = 0;
        }
        return artifactRead;
      },
    },
    commands: {
      transactional: {
        VALIDATE_DECLARATIVE_PACKAGE: {
          execute: async ({ command }) => {
            const seconds =
              options.advanceClockDuringTransactionalCommandSeconds;
            if (seconds !== undefined) {
              currentTime = new Date(currentTime.getTime() + seconds * 1_000);
            }
            return {
              isValid: true as const,
              validatedPackageHash: hashAffiliateAgentValue(
                command.data.candidatePackage,
              ),
            };
          },
        },
        COMMIT_DECLARATIVE_PACKAGE: {
          execute: async ({ command, receiptId }) => {
            const seconds =
              options.advanceClockDuringTransactionalCommandSeconds;
            if (seconds !== undefined) {
              currentTime = new Date(currentTime.getTime() + seconds * 1_000);
            }
            if (options.persistLifecycleAlertTransition) {
              state.lifecycleTransitions.push({
                idempotencyKey: receiptId,
                requestJson: {
                  __affiliateInvariantAlertContract: {
                    rolloutCohort: "test",
                    version: 1,
                    hash: "test-contract-hash",
                  },
                },
                resultJson: {
                  supplySourceId: "supply-source-1",
                  lifecycleGeneration: 8,
                  assessedAt: "2026-08-20T18:00:00.000Z",
                  invariantViolations: ["MAPPING_JOB_MAPPING_MISMATCH"],
                  evidenceRefs: [],
                },
              });
            }
            return {
              packageHash: command.data.validatedPackageHash,
            };
          },
        },
      },
      external: {
            RUN_DISCOVERY_QUERY: {
              start: async (externalOperationKey) => {
                state.externalStartKeys.push(externalOperationKey);
                const output = {
                  evidenceRef: "discovery-evidence-1",
                  artifactId: "discovery-file-1",
                  sha256: createHash("sha256")
                    .update(artifactBytes)
                    .digest("hex"),
                  mimeType: externalMimeType,
                  byteSize: artifactBytes.byteLength,
                };
                if (externalCaptureMode !== "UNKNOWN") {
                  externalCaptureEffects.set(externalOperationKey, output);
                }
                if (externalCaptureMode !== "SUCCEED") {
                  throw new Error("Simulated response loss.");
                }
                return output;
              },
              recover: async (externalOperationKey) => {
                state.externalRecoverKeys.push(externalOperationKey);
                return externalCaptureEffects.get(externalOperationKey) ?? null;
              },
            },
            CAPTURE_CLAIM_URL: {
              start: async (externalOperationKey) => {
                state.externalStartKeys.push(externalOperationKey);
                const output = {
                  evidenceRef: "capture-evidence-1",
                  artifactId: "capture-file-1",
                  sha256: createHash("sha256")
                    .update(artifactBytes)
                    .digest("hex"),
                  mimeType: externalMimeType,
                  byteSize: artifactBytes.byteLength,
                  captureMetadata: {
                    provider: "SCRAPINGDOG",
                    request: captureRecordSummaryFixture({
                      method: "GET",
                      profile: "capture-profile",
                    }),
                    response: captureRecordSummaryFixture({
                      status: "ok",
                      requestId: "provider-request-1",
                    }),
                    requestedUrl: "https://capture.example.test/requested",
                    finalUrl: "https://capture.example.test/final",
                    providerStatusCode: 207,
                    targetStatusCode: 200,
                    renderMode: "JAVASCRIPT",
                    elapsedMs: 321,
                    estimatedCredits: 5,
                    warnings: ["used provider fallback"],
                    providerJobId: "provider-job-1",
                    attempts: [{
                      renderMode: "STATIC",
                      providerStatusCode: 200,
                      elapsedMs: 123,
                      estimatedCredits: 1,
                      accepted: false,
                      quality: { textLength: 0 },
                      error: "insufficient content",
                    }],
                    providerArtifacts: {
                      markdown: captureTextSummaryFixture("# Capture"),
                      links: captureSetSummaryFixture([
                        "https://capture.example.test/final",
                      ]),
                      images: captureSetSummaryFixture([
                        "https://capture.example.test/image.png",
                      ]),
                      branding: { name: "Capture Example" },
                      screenshotUrl: "https://capture.example.test/screenshot.png",
                      metadata: { source: "test" },
                    },
                  },
                };
                if (externalCaptureMode !== "UNKNOWN") {
                  externalCaptureEffects.set(externalOperationKey, output);
                }
                if (externalCaptureMode !== "SUCCEED") {
                  throw new Error("Simulated response loss.");
                }
                return output;
              },
              recover: async (externalOperationKey) => {
                state.externalRecoverKeys.push(externalOperationKey);
                return externalCaptureEffects.get(externalOperationKey) ?? null;
              },
            },
          },
    },
    terminalEffects: {
      APPROVED: reviewerEffectHandler("APPROVED"),
      ACTIVATED: reviewerEffectHandler("ACTIVATED"),
      PRODUCER_REPAIR_REQUIRED: reviewerEffectHandler(
        "PRODUCER_REPAIR_REQUIRED",
      ),
      REGRESSION_ASSESSED: reviewerEffectHandler("REGRESSION_ASSESSED"),
      SOURCE_EXCLUSION_ASSESSED: reviewerEffectHandler(
        "SOURCE_EXCLUSION_ASSESSED",
      ),
      EXACT_TARGET_REJECTED: reviewerEffectHandler("EXACT_TARGET_REJECTED"),
      HUMAN_REVIEW_REQUIRED: reviewerEffectHandler("HUMAN_REVIEW_REQUIRED"),
    } satisfies AffiliateAgentTerminalEffectAdapter,
    claimAdmission,
    ...(options.operationalAlert === undefined
      ? {}
      : { operationalAlert: options.operationalAlert }),
    lifecycle: {
      kind: "AVAILABLE",
      currentGeneration: async () => currentLifecycleGeneration,
      resolveRecordedCommand: async (identity) => identity,
      execute: async (input) => {
        state.lifecycleCalls.push(input);
        const output = {
          receiptId: input.receiptId,
          lifecycleGeneration: 8,
          ...(lifecycleSafeOutputDetails === null
            ? {}
            : { details: lifecycleSafeOutputDetails }),
        };
        lifecycleEffects.set(input.receiptId, output);
        if (options.persistLifecycleTransition) {
          currentLifecycleGeneration = 8;
          state.lifecycleTransitions.push({
            supplySourceId: "supply-source-1",
            generation: 8,
            commandRef: input.receiptId,
            idempotencyKey: input.receiptId,
            actorKind: "HUMAN_DIRECTED_EXECUTOR",
            actorId: input.identity.recordedHumanActorId,
            executingAgentId: input.invocationId,
            command: "RECONCILE",
          });
        }
        if (isLifecycleResponseLost) {
          throw new Error("Simulated lifecycle response loss.");
        }
        return output;
      },
      recover: async (receiptId) => {
        state.lifecycleRecoverReceiptIds.push(receiptId);
        return lifecycleEffects.get(receiptId) ?? null;
      },
    },
  });
  const dependencies = options.disableExternalAdapters
    ? {
      ...productionDependencies,
      commands: {
        ...productionDependencies.commands,
        external: {},
      },
    }
    : productionDependencies;
  const gateway = createPrismaAffiliateAgentGateway(dependencies);
  const reconciler =
    createPrismaAffiliateAgentInvocationReconciler(dependencies);
  return {
    gateway,
    reconciler,
    recreateGateway: () => createPrismaAffiliateAgentGateway(dependencies),
    state,
    setDomainDelegates: (value: Readonly<Record<string, unknown>>) => {
      const target = prismaMock as unknown as Record<string, unknown>;
      for (const [name, delegate] of Object.entries(value)) {
        const current = target[name];
        if (
          current !== null
          && typeof current === "object"
          && delegate !== null
          && typeof delegate === "object"
        ) {
          Object.assign(current, delegate);
        } else {
          target[name] = delegate;
        }
      }
    },
    artifactBytes,
    setNow: (value: string) => {
      currentTime = new Date(value);
    },
    setArtifactRead: (value: AffiliateAgentArtifactRead) => {
      artifactRead = value;
    },
    setArtifactReadError: (value: unknown) => {
      artifactReadError = value;
    },
    setConcurrentArtifact: (value: GatewayTestRow) => {
      concurrentArtifact = value;
    },
    setTransactionConflictsAfterArtifactRead: (value: number) => {
      transactionConflictsAfterArtifactRead = value;
    },
    setNextTransactionConflicts: (value: number) => {
      pendingTransactionConflicts = value;
    },
    setNextTransactionError: (value: unknown) => {
      pendingTransactionError = value;
    },
    setExternalCaptureMode: (value) => {
      externalCaptureMode = value;
    },
    setTerminalEffectTimeAdvanceSeconds: (value: number) => {
      terminalEffectTimeAdvanceSeconds = value;
    },
    setExternalMimeType: (value: string) => {
      externalMimeType = value;
    },
    setLifecycleResponseLoss: (value) => {
      isLifecycleResponseLost = value;
    },
    setLifecycleGeneration: (value: number) => {
      currentLifecycleGeneration = value;
    },
    setLifecycleSafeOutputDetails: (value: string | null) => {
      lifecycleSafeOutputDetails = value;
    },
    setClaimCreateError: (value) => {
      claimCreateError = value;
    },
    setOperationReceiptCreateConflict: (value, persist = false) => {
      operationReceiptCreateError = value;
      persistOperationReceiptCreateError = persist;
    },
    setOperationReceiptReadBarrier: (barrier) => {
      operationReceiptReadBarrier = barrier;
    },
    setClaimAdmissionOpen: (value: boolean) => {
      claimAdmissionOpen = value;
    },
    setActiveBundle: (value: unknown) => {
      activeBundle = value;
    },
    request: {
      idempotencyKey: "claim-request-1",
      roleCredential: "coverage-role-credential",
      role: "COVERAGE_PLANNER" as const,
      workerId: "coverage-worker-1",
      invocationId: "coverage-invocation-1",
      workspaceAttestation: {
        schemaVersion: 1 as const,
        workspaceId: "coverage-workspace-1",
        mode: "READ_WRITE" as const,
        executionClass: "PRODUCTION_OMP" as const,
        workerId: "coverage-worker-1",
        invocationId: "coverage-invocation-1",
        issuedAt: "2026-08-20T17:59:00.000Z",
        expiresAt: "2026-08-20T18:20:00.000Z",
        signature: "valid-workspace-signature",
      },
    },
  };
};
const seedReviewerHistory = (
  harness: GatewayClaimHarness,
  evidence: Readonly<{
    evidenceRef: string;
    artifactId: string;
    sha256: string;
  }>,
): void => {
  const reviewerEvidencePreimage = {
    schemaVersion: 1 as const,
    entries: [
      {
        evidenceRef: evidence.evidenceRef,
        kind: "DURABLE_EVIDENCE" as const,
        artifactId: evidence.artifactId,
        sha256: evidence.sha256,
        mimeType: "application/json",
        byteSize: 10,
        retention: "INDEFINITE" as const,
      },
    ],
  };
  const reviewerEnvelope = {
    ...claimFixtureForRole("SUPPLY_REVIEWER"),
    jobId: "reviewer-job-1",
    claimId: "reviewer-claim-1",
    evidenceManifest: {
      ...reviewerEvidencePreimage,
      hash: hashAffiliateAgentValue(reviewerEvidencePreimage),
    },
  };
  const reviewerTerminalBase = terminalResultFixture({
    role: "SUPPLY_REVIEWER",
    disposition: "HUMAN_REVIEW_REQUIRED",
    payload: { caseReason: "Conflicting operator identity evidence." },
  });
  const reviewerTerminal = {
    ...reviewerTerminalBase,
    jobId: "reviewer-job-1",
    claimId: "reviewer-claim-1",
    evidenceRefs: [evidence.evidenceRef],
  };
  harness.state.claims.push({
    id: "reviewer-claim-1",
    jobId: "reviewer-job-1",
    claimGeneration: 1,
    lifecycleGeneration: 7,
    role: "SUPPLY_REVIEWER",
    workerId: "review-worker-1",
    invocationId: "review-invocation-1",
    workspaceId: "review-workspace-1",
    status: "COMPLETED",
    terminalReceiptId: "reviewer-terminal-receipt",
    claimEnvelopeHash: hashAffiliateAgentValue(reviewerEnvelope),
    claimEnvelopeJson: reviewerEnvelope,
  });
  harness.state.jobs.push({
    id: "reviewer-job-1",
    status: "COMPLETED",
    activeClaimId: null,
    claimGeneration: 1,
    parentClaimId: "reviewer-claim-1",
    terminalReceiptId: "reviewer-terminal-receipt",
    resultJson: reviewerTerminal,
  });
  harness.state.artifacts.push({
    id: "reviewer-artifact-1",
    claimId: "reviewer-claim-1",
    claimGeneration: 1,
    evidenceRef: evidence.evidenceRef,
    evidenceKind: "DURABLE_EVIDENCE",
    sourceArtifactId: evidence.artifactId,
    fileId: evidence.artifactId,
    contentHash: evidence.sha256,
    mimeType: "application/json",
    byteSize: 10,
    accessMode: "READ_ONLY",
    creatingClaimId: "producer-claim-1",
    retentionClass: "INDEFINITE",
    isPinned: true,
  });
};

const gatewayAuthorizationFor = (
  grant: AffiliateAgentClaimGrant,
): AffiliateAgentClaimAuthorization => ({
  token: grant.token,
  jobId: grant.envelope.jobId,
  claimId: grant.envelope.claimId,
  claimGeneration: grant.envelope.claimGeneration,
  lifecycleGeneration: grant.envelope.lifecycleGeneration,
  role: grant.envelope.role,
  workerId: grant.envelope.workerId,
  invocationId: grant.envelope.invocationId,
  supplyContractHash: grant.envelope.supplyContractHash,
});

const failureOperationFor = (
  grant: AffiliateAgentClaimGrant,
  idempotencyKey: string,
  code: Exclude<
    AffiliateAgentInvocationFailureCode,
    "SCHEMA_CORRECTIONS_EXHAUSTED"
  >,
  occurredAt = "2026-08-20T18:00:00.000Z",
) => ({
  kind: "RECORD_FAILURE" as const,
  idempotencyKey,
  authorization: gatewayAuthorizationFor(grant),
  failure: {
    schemaVersion: 1 as const,
    jobId: grant.envelope.jobId,
    claimId: grant.envelope.claimId,
    claimGeneration: grant.envelope.claimGeneration,
    lifecycleGeneration: grant.envelope.lifecycleGeneration,
    role: grant.envelope.role,
    workerId: grant.envelope.workerId,
    invocationId: grant.envelope.invocationId,
    supplyContractHash: grant.envelope.supplyContractHash,
    code,
    occurredAt,
    evidenceRefs: [] as readonly string[],
    safeSummary: `The invocation failed with ${code}.`,
  } satisfies AffiliateAgentInvocationFailureEnvelope,
});

const captureOperationFor = (
  grant: AffiliateAgentClaimGrant,
  idempotencyKey: string,
) => ({
  kind: "EXECUTE_COMMAND" as const,
  idempotencyKey,
  authorization: gatewayAuthorizationFor(grant),
  command: {
    type: "CAPTURE_CLAIM_URL" as const,
    data: {
      urlRef: "evidence-1",
      captureProfileRef: "evidence-1",
    },
  },
});

const coverageTerminalResultFor = (grant: AffiliateAgentClaimGrant) => ({
  schemaVersion: 1 as const,
  jobId: grant.envelope.jobId,
  claimId: grant.envelope.claimId,
  claimGeneration: grant.envelope.claimGeneration,
  lifecycleGeneration: grant.envelope.lifecycleGeneration,
  deploymentContractVersion: grant.envelope.deploymentContractVersion,
  deploymentContractHash: grant.envelope.deploymentContractHash,
  supplyContractVersion: grant.envelope.supplyContractVersion,
  supplyContractHash: grant.envelope.supplyContractHash,
  roleContractVersion: grant.envelope.roleContractVersion,
  roleContractHash: grant.envelope.roleContractHash,
  promptTemplateVersion: grant.envelope.promptTemplateVersion,
  promptTemplateHash: grant.envelope.promptTemplateHash,
  workerId: grant.envelope.workerId,
  invocationId: grant.envelope.invocationId,
  role: "COVERAGE_PLANNER" as const,
  disposition: "NO_ACTION" as const,
  reasonCodes: ["NO_QUALIFIED_ACTION"] as const,
  evidenceRefs: ["evidence-1"] as const,
  summary: "No qualified action remains for this coverage cell.",
  payload: { basis: "NO_QUALIFIED_ACTION" as const },
});

type LegacySportCatalog = Readonly<{
  sha256: string;
  sports: readonly Readonly<{ id: string; name: string }>[];
}>;

type LegacySportProducerFixture = Readonly<{
  request: AffiliateAgentClaimRequest;
  sportEvidence: AffiliateAgentSportEvidence;
  catalog: LegacySportCatalog;
  setCurrentCatalog(value: LegacySportCatalog): void;
}>;

const configureLegacySportProducerScenario = (
  harness: GatewayClaimHarness,
): LegacySportProducerFixture => {
  const artifactBytes = harness.artifactBytes;
  const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
  const catalog = buildAffiliateSportsCatalogSnapshot(
    [{ id: "sport-basketball", name: "Basketball" }],
    "2026-08-20T18:00:00.000Z",
  );
  const sportEvidence: AffiliateAgentSportEvidence = {
    evidenceRunId: "legacy-evidence-run",
    sportsCatalogSha256: catalog.sha256,
    sportDeterminations: [{
      sourceLabels: ["Basketball"],
      status: "RESOLVED",
      resolutionBasis: "SOURCE_EVIDENCE",
      canonicalSportNames: ["Basketball"],
      rationale: "The stored page identifies basketball.",
      evidence: [{
        artifactId: "file-evidence-1",
        artifactSha256,
        artifactKind: "PAGE_MARKDOWN",
        pageUrl: "https://evidence.example.test/page",
        excerpt: "verified gateway artifact",
      }],
    }],
  };
  const repairContext = {
    kind: "LEGACY_SPORT_REPAIR" as const,
    intakeId: "legacy-intake",
    evidenceRunId: sportEvidence.evidenceRunId,
    sportsCatalog: catalog,
  };
  const manifestPreimage = {
    schemaVersion: 1 as const,
    entries: [{
      evidenceRef: "evidence-1",
      kind: "PAGE_MARKDOWN" as const,
      artifactId: "file-evidence-1",
      sha256: artifactSha256,
      mimeType: "text/markdown",
      byteSize: artifactBytes.byteLength,
      retention: "INDEFINITE" as const,
    }],
  };
  Object.assign(harness.state.jobs[0], {
    queue: "AFFILIATE_MAPPING",
    lane: "MAPPING_PRODUCTION",
    role: "MAPPING_PRODUCER",
    subjectType: "MAPPING_PRODUCER",
    subjectId: "mapping-job-1",
    subjectJson: {
      ...claimRoleFields.MAPPING_PRODUCER.subject,
      repairContext,
    },
    evidenceManifestJson: {
      ...manifestPreimage,
      hash: hashAffiliateAgentValue(manifestPreimage),
    },
    supplySourceId: "supply-source-1",
    expectedLifecycleGeneration: 7,
  });
  harness.setArtifactRead({
    bytes: new Uint8Array(artifactBytes),
    mimeType: "text/markdown",
    byteSize: artifactBytes.byteLength,
    sourceUrl: "https://evidence.example.test/page",
    finalUrl: "https://evidence.example.test/page",
    runId: sportEvidence.evidenceRunId,
    intakeId: repairContext.intakeId,
  });
  let currentCatalog: LegacySportCatalog = catalog;
  harness.setDomainDelegates({
    sports: {
      findMany: async () => currentCatalog.sports,
    },
  });
  const request: AffiliateAgentClaimRequest = {
    ...harness.request,
    idempotencyKey: "legacy-sport-claim",
    roleCredential: "mapping-role-credential",
    role: "MAPPING_PRODUCER",
    workerId: "legacy-sport-worker",
    invocationId: "legacy-sport-invocation",
    workspaceAttestation: {
      ...harness.request.workspaceAttestation,
      workspaceId: "legacy-sport-workspace",
      workerId: "legacy-sport-worker",
      invocationId: "legacy-sport-invocation",
    },
  };
  return {
    request,
    sportEvidence,
    catalog,
    setCurrentCatalog: (value) => {
      currentCatalog = value;
    },
  };
};

const legacySportContractGapResultFor = (
  grant: AffiliateAgentClaimGrant,
  sportEvidence?: AffiliateAgentSportEvidence,
  overrides: Readonly<{
    evidenceRefs?: readonly string[];
    reasonCodes?: readonly string[];
  }> = {},
): Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }>["result"] => ({
  schemaVersion: 1 as const,
  jobId: grant.envelope.jobId,
  claimId: grant.envelope.claimId,
  claimGeneration: grant.envelope.claimGeneration,
  lifecycleGeneration: grant.envelope.lifecycleGeneration,
  deploymentContractVersion: grant.envelope.deploymentContractVersion,
  deploymentContractHash: grant.envelope.deploymentContractHash,
  supplyContractVersion: grant.envelope.supplyContractVersion,
  supplyContractHash: grant.envelope.supplyContractHash,
  roleContractVersion: grant.envelope.roleContractVersion,
  roleContractHash: grant.envelope.roleContractHash,
  promptTemplateVersion: grant.envelope.promptTemplateVersion,
  promptTemplateHash: grant.envelope.promptTemplateHash,
  workerId: grant.envelope.workerId,
  invocationId: grant.envelope.invocationId,
  role: "MAPPING_PRODUCER" as const,
  disposition: "CONTRACT_GAP" as const,
  reasonCodes: overrides.reasonCodes ?? ["CONTRACT_REQUIREMENT_MISSING"],
  evidenceRefs: overrides.evidenceRefs ?? (sportEvidence ? ["evidence-1"] : []),
  summary: "The mapping contract requires a bounded correction.",
  payload: {
    contractArea: "MAPPING_EVIDENCE" as const,
    requestedChange: "Record the missing mapping evidence requirement.",
    ...(sportEvidence === undefined ? {} : { sportEvidence }),
  },
} as unknown as Extract<
  AffiliateAgentClaimOperation,
  { kind: "SUBMIT_RESULT" }
>["result"]);

const gatewayOperationFor = (
  kind: AffiliateAgentClaimOperation["kind"],
  grant: AffiliateAgentClaimGrant,
  authorization: AffiliateAgentClaimAuthorization,
): AffiliateAgentClaimOperation => {
  if (kind === "HEARTBEAT") {
    return { kind, idempotencyKey: `scope-${kind}`, authorization };
  }
  if (kind === "READ_ARTIFACT") {
    return {
      kind,
      idempotencyKey: `scope-${kind}`,
      authorization,
      evidenceRef: "evidence-1",
    };
  }
  if (kind === "EXECUTE_COMMAND") {
    return {
      kind,
      idempotencyKey: `scope-${kind}`,
      authorization,
      command: {
        type: "RUN_DISCOVERY_QUERY",
        data: {
          strategyRef: "evidence-1",
          queryRef: "evidence-1",
        },
      },
    };
  }
  if (kind === "SUBMIT_RESULT") {
    return {
      kind,
      idempotencyKey: `scope-${kind}`,
      authorization,
      result: coverageTerminalResultFor(grant),
    };
  }
  throw new Error(`Unsupported operation kind: ${kind}`);
};

const configureStandaloneReviewerScenario = (
  harness: GatewayClaimHarness,
): void => {
  const manifestPreimage = {
    schemaVersion: 1 as const,
    entries: [
      "ACTIVE_SUPPLY_CONTRACT",
      "COMMITTED_PACKAGE",
      "DETERMINISTIC_VALIDATION",
      "DURABLE_EVIDENCE",
    ].map((kind, index) => ({
      evidenceRef: `review-evidence-${index + 1}`,
      kind,
      artifactId: `review-file-${index + 1}`,
      sha256:
        kind === "ACTIVE_SUPPLY_CONTRACT"
          ? supplyContractFixture.hash
          : kind === "COMMITTED_PACKAGE"
            ? claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash
            : String(index + 1).repeat(64),
      mimeType: "application/json",
      byteSize: 10,
      retention: "INDEFINITE",
    })),
  };
  const manifest = {
    ...manifestPreimage,
    hash: hashAffiliateAgentValue(manifestPreimage),
  };
  Object.assign(harness.state.jobs[0], {
    queue: "AFFILIATE_REVIEW",
    lane: "SUPPLY_REVIEW",
    role: "SUPPLY_REVIEWER",
    subjectType: "SUPPLY_REVIEWER",
    subjectId: "supply-source-1",
    subjectJson: claimRoleFields.SUPPLY_REVIEWER.subject,
    evidenceManifestJson: manifest,
    supplySourceId: "supply-source-1",
    parentClaimId: "producer-claim-1",
    expectedLifecycleGeneration: 7,
  });
  const producerEnvelope = {
    ...claimFixtureForRole("MAPPING_PRODUCER"),
    jobId: "producer-job-1",
    claimId: "producer-claim-1",
  };
  const producerTerminal = {
    ...terminalResultFixture({
      role: "MAPPING_PRODUCER",
      disposition: "PACKAGE_COMMITTED",
      payload: {
        packageHash: "b".repeat(64),
        commitReceiptId: "producer-commit-receipt",
      },
    }),
    jobId: "producer-job-1",
    claimId: "producer-claim-1",
  };
  harness.state.claims.push({
    id: "producer-claim-1",
    jobId: "producer-job-1",
    claimGeneration: 1,
    lifecycleGeneration: 7,
    role: "MAPPING_PRODUCER",
    workerId: "producer-worker-1",
    invocationId: "producer-invocation-1",
    workspaceId: "producer-workspace-1",
    status: "COMPLETED",
    terminalReceiptId: "producer-terminal-receipt",
    claimEnvelopeHash: hashAffiliateAgentValue(producerEnvelope),
    claimEnvelopeJson: producerEnvelope,
  });
  harness.state.jobs.push({
    id: "producer-job-1",
    status: "COMPLETED",
    activeClaimId: null,
    claimGeneration: 1,
    terminalReceiptId: "producer-terminal-receipt",
    resultJson: producerTerminal,
  });
  for (const entry of manifest.entries) {
    harness.state.artifacts.push({
      id: `producer-artifact-${entry.evidenceRef}`,
      claimId: "producer-claim-1",
      claimGeneration: 1,
      evidenceRef: entry.evidenceRef,
      evidenceKind: entry.kind,
      sourceArtifactId: entry.artifactId,
      fileId: entry.artifactId,
      contentHash: entry.sha256,
      mimeType: entry.mimeType,
      byteSize: entry.byteSize,
      accessMode: "READ_ONLY",
      creatingClaimId:
        entry.kind === "COMMITTED_PACKAGE" || entry.kind === "DETERMINISTIC_VALIDATION"
          ? "producer-claim-1"
          : null,
      retentionClass: entry.retention,
      isPinned: true,
    });
  }
};

const standaloneReviewerRequest = (): AffiliateAgentClaimRequest => ({
  idempotencyKey: "review-claim-request-1",
  roleCredential: "review-role-credential",
  role: "SUPPLY_REVIEWER",
  workerId: "review-worker-1",
  invocationId: "review-invocation-1",
  workspaceAttestation: {
    schemaVersion: 1,
    workspaceId: "review-workspace-1",
    mode: "READ_ONLY",
    executionClass: "PRODUCTION_OMP",
    workerId: "review-worker-1",
    invocationId: "review-invocation-1",
    issuedAt: "2026-08-20T17:59:00.000Z",
    expiresAt: "2026-08-20T18:20:00.000Z",
    signature: "valid-workspace-signature",
  },
});

describe("Prisma affiliate Agent Gateway", () => {
  it("claims one eligible Coverage Planner job with a scoped lease and deadline", async () => {
    const { gateway, request, state } = createGatewayClaimHarness();

    const grant = await gateway.claim(request);

    expect(grant).not.toBeNull();
    expect(grant).toMatchObject({
      envelope: {
        role: "COVERAGE_PLANNER",
        jobId: "gateway-job-1",
        claimGeneration: 1,
        workerId: "coverage-worker-1",
        invocationId: "coverage-invocation-1",
        claimedAt: "2026-08-20T18:00:00.000Z",
        expiresAt: "2026-08-20T18:20:00.000Z",
      },
      heartbeatIntervalSeconds: 60,
      leaseExpiresAt: "2026-08-20T18:05:00.000Z",
      hardDeadlineAt: "2026-08-20T18:20:00.000Z",
    });
    expect(grant?.token).toMatch(/^agw1\./);
    expect(grant?.prompt).toContain('"role":"COVERAGE_PLANNER"');
    expect(state.claims[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state)).not.toContain(grant?.token);
  });
  it("records a healthy worker heartbeat through the production claim boundary", async () => {
    const { gateway, request, state } = createGatewayClaimHarness();

    await gateway.claim(request);

    expect(state.workerHealth).toHaveLength(1);
    expect(state.workerHealth[0]).toMatchObject({
      workerId: request.workerId,
      role: request.role,
      status: "HEALTHY",
    });
    expect(state.workerHealth[0]?.heartbeatAt).toEqual(
      new Date("2026-08-20T18:00:00.000Z"),
    );
  });

  it("replays only an identical claim request", async () => {
    const { gateway, request, state } = createGatewayClaimHarness();

    const claimed = await gateway.claim(request);
    const replayedClaim = await gateway.claim(request);

    expect(replayedClaim).toEqual(claimed);
    expect(state.claims).toHaveLength(1);
    expect(state.events).toHaveLength(1);
    await expect(
      gateway.claim({
        ...request,
        invocationId: "different-invocation",
        workspaceAttestation: {
          ...request.workspaceAttestation,
          invocationId: "different-invocation",
        },
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      safeMessage: expect.any(String),
    });
  });
  it("rejects a second live claim for the same worker while preserving exact-key replay", async () => {
    const { gateway, request, state } = createGatewayClaimHarness();
    const firstGrant = await gateway.claim(request);
    expect(firstGrant).not.toBeNull();

    const secondRequest: AffiliateAgentClaimRequest = {
      ...request,
      idempotencyKey: "claim-request-2",
      invocationId: "coverage-invocation-2",
      workspaceAttestation: {
        ...request.workspaceAttestation,
        workspaceId: "coverage-workspace-2",
        invocationId: "coverage-invocation-2",
      },
    };
    await expect(gateway.claim(secondRequest)).rejects.toMatchObject({
      code: "DUPLICATE_LIVE_CLAIM",
      safeMessage: "The worker already owns an unexpired active claim.",
      isRetryable: true,
    });
    expect(state.claims).toHaveLength(1);

    await expect(gateway.claim(request)).resolves.toEqual(firstGrant);
    expect(state.claims).toHaveLength(1);
  });

  it("does not treat an unrelated Prisma unique violation as a lost claim race", async () => {
    const harness = createGatewayClaimHarness();
    harness.setClaimCreateError({
      code: "P2002",
      meta: { target: ["tokenHash"] },
    });

    await expect(harness.gateway.claim(harness.request)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      isRetryable: true,
    });
  });
  it("surfaces unrelated raw-query P2010 failures instead of returning no work", async () => {
    const harness = createGatewayClaimHarness();
    harness.setNextTransactionError({
      code: "P2010",
      meta: {
        code: "42P01",
        message: "relation affiliateAgentGatewayJobs does not exist",
      },
    });

    await expect(harness.gateway.claim(harness.request)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      isRetryable: true,
    });
  });

  it("replays a durable same-key claim during closed admission but rejects unrelated work", async () => {
    const harness = createGatewayClaimHarness();
    const claimed = await harness.gateway.claim(harness.request);
    expect(claimed).not.toBeNull();
    harness.setClaimAdmissionOpen(false);

    const replayed = await harness.recreateGateway().claim(harness.request);
    expect(replayed).toEqual(claimed);

    const originalJob = harness.state.jobs[0];
    if (!originalJob) throw new Error("Expected the seeded Coverage Planner job.");
    harness.state.jobs.push({
      ...originalJob,
      id: "gateway-job-2",
      dedupeKey: "coverage:coverage-cell-2:assessment-cycle-1",
      subjectId: "coverage-cell-2",
      subjectJson: {
        type: "COVERAGE_PLANNER",
        coverageCellId: "coverage-cell-2",
        assessmentCycleId: "assessment-cycle-1",
      },
      status: "QUEUED",
      claimGeneration: 0,
      activeClaimId: null,
      eventSequence: 0,
    });
    const unrelatedRequest: AffiliateAgentClaimRequest = {
      ...harness.request,
      idempotencyKey: "claim-request-2",
      workerId: "coverage-worker-2",
      invocationId: "coverage-invocation-2",
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: "coverage-workspace-2",
        workerId: "coverage-worker-2",
        invocationId: "coverage-invocation-2",
      },
    };

    await expect(harness.gateway.claim(unrelatedRequest)).resolves.toBeNull();
    expect(harness.state.claims).toHaveLength(1);
    expect(harness.state.jobs[1]).toMatchObject({
      id: "gateway-job-2",
      status: "QUEUED",
      activeClaimId: null,
    });
  });

  it("linearizes admission close around concurrent claim transactions", async () => {
    let resolveClaimTransactionEntered: () => void = () => {};
    const claimTransactionEntered = new Promise<void>((resolve) => {
      resolveClaimTransactionEntered = resolve;
    });
    let releaseClaimTransaction: () => void = () => {};
    const claimTransactionReleased = new Promise<void>((resolve) => {
      releaseClaimTransaction = resolve;
    });
    const admission = createAffiliateAgentClaimAdmission(true);
    const harness = createGatewayClaimHarness({
      claimAdmission: admission,
      claimTransactionBarrier: {
        entered: resolveClaimTransactionEntered,
        released: claimTransactionReleased,
      },
    });

    const claimPromise = harness.gateway.claim(harness.request);
    await claimTransactionEntered;

    let closeSettled = false;
    const closePromise = admission.close().then(() => {
      closeSettled = true;
    });
    await Promise.resolve();
    expect(closeSettled).toBe(false);

    releaseClaimTransaction();
    const grant = await claimPromise;
    await closePromise;
    expect(grant).not.toBeNull();
    expect(harness.state.claims).toHaveLength(1);
    expect(closeSettled).toBe(true);

    const closedAdmission = createAffiliateAgentClaimAdmission(true);
    const closedHarness = createGatewayClaimHarness({
      claimAdmission: closedAdmission,
    });
    const closeFirst = closedAdmission.close();
    const claimAfterClose = closedHarness.gateway.claim(closedHarness.request);

    await closeFirst;
    await expect(claimAfterClose).resolves.toBeNull();
    expect(closedHarness.state.claims).toHaveLength(0);
    expect(closedHarness.state.jobs[0]).toMatchObject({
      status: "QUEUED",
      activeClaimId: null,
    });
  });

  it("rejects an exact claim replay after an active contract changes", async () => {
    const harness = createGatewayClaimHarness();
    await harness.gateway.claim(harness.request);
    harness.setActiveBundle(supplyContractStaleBundleFixture);

    await expect(harness.gateway.claim(harness.request)).rejects.toMatchObject({
      code: "SUPPLY_CONTRACT_STALE",
      safeMessage: expect.any(String),
    });
  });

  it("returns typed denials when an invocation or workspace identity is reused", async () => {
    const cases = [
      {
        expectedCode: "INVOCATION_MISMATCH",
        request: (request: AffiliateAgentClaimRequest) => ({
          ...request,
          idempotencyKey: "claim-request-reused-invocation",
          workspaceAttestation: {
            ...request.workspaceAttestation,
            workspaceId: "coverage-workspace-2",
          },
        }),
      },
      {
        expectedCode: "REVIEW_WORKSPACE_INVALID",
        request: (request: AffiliateAgentClaimRequest) => ({
          ...request,
          idempotencyKey: "claim-request-reused-workspace",
          invocationId: "coverage-invocation-2",
          workspaceAttestation: {
            ...request.workspaceAttestation,
            invocationId: "coverage-invocation-2",
          },
        }),
      },
    ] as const;

    for (const testCase of cases) {
      const harness = createGatewayClaimHarness();
      await harness.gateway.claim(harness.request);
      const initialJob = harness.state.jobs[0];
      harness.state.jobs.push({
        ...initialJob,
        id: "gateway-job-2",
        dedupeKey: "coverage:coverage-cell-2:assessment-cycle-1",
        subjectId: "coverage-cell-2",
        subjectJson: {
          type: "COVERAGE_PLANNER",
          coverageCellId: "coverage-cell-2",
          assessmentCycleId: "assessment-cycle-1",
        },
        status: "QUEUED",
        claimGeneration: 0,
        activeClaimId: null,
        eventSequence: 0,
      });

      await expect(
        harness.gateway.claim(testCase.request(harness.request)),
      ).rejects.toMatchObject({
        code: testCase.expectedCode,
        safeMessage: expect.any(String),
      });
    }
  });

  it("denies invalid role credentials, workspaces, and offline execution before selection", async () => {
    const invalidRequests: readonly {
      expectedCode: string;
      request: AffiliateAgentClaimRequest;
    }[] = [
      {
        expectedCode: "ROLE_CREDENTIAL_INVALID",
        request: {
          ...createGatewayClaimHarness().request,
          roleCredential: "wrong-role-credential",
        },
      },
      {
        expectedCode: "REVIEW_WORKSPACE_INVALID",
        request: {
          ...createGatewayClaimHarness().request,
          workspaceAttestation: {
            ...createGatewayClaimHarness().request.workspaceAttestation,
            signature: "invalid-workspace-signature",
          },
        },
      },
      {
        expectedCode: "ROLE_NOT_ALLOWED",
        request: {
          ...createGatewayClaimHarness().request,
          workspaceAttestation: {
            ...createGatewayClaimHarness().request.workspaceAttestation,
            executionClass: "OFFLINE_OPEN_WEIGHT_EVALUATION",
          },
        },
      },
    ];

    for (const invalid of invalidRequests) {
      const harness = createGatewayClaimHarness();
      await expect(
        harness.gateway.claim(invalid.request),
      ).rejects.toMatchObject({
        code: invalid.expectedCode,
        safeMessage: expect.any(String),
      });
      expect(harness.state.claims).toHaveLength(0);
    }
  });
  it("rechecks attestation coverage after delayed claim validation", async () => {
    const harness = createGatewayClaimHarness({
      advanceClockDuringCredentialVerificationSeconds: 1,
    });

    await expect(harness.gateway.claim(harness.request)).rejects.toMatchObject({
      code: "REVIEW_WORKSPACE_INVALID",
      safeMessage:
        "The workspace attestation must cover the full invocation deadline.",
    });
    expect(harness.state.claims).toHaveLength(0);
  });
  it("admits a fresh attestation through the full handoff margin", async () => {
    const delayedSeconds =
      AFFILIATE_AGENT_WORKSPACE_ATTESTATION_ADMISSION_MARGIN_SECONDS;
    const harness = createGatewayClaimHarness({
      advanceClockDuringCredentialVerificationSeconds: delayedSeconds,
    });
    const issuedAt = "2026-08-20T18:00:00.000Z";
    const expiresAt = new Date(
      Date.parse(issuedAt)
        + AFFILIATE_AGENT_WORKSPACE_ATTESTATION_LIFETIME_SECONDS * 1_000,
    ).toISOString();
    const request = {
      ...harness.request,
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        issuedAt,
        expiresAt,
      },
    };

    const grant = await harness.gateway.claim(request);

    const admissionAt = new Date(
      Date.parse(issuedAt) + delayedSeconds * 1_000,
    );
    const expectedLeaseExpiresAt = new Date(
      admissionAt.getTime() + AFFILIATE_AGENT_LEASE_SECONDS * 1_000,
    ).toISOString();
    const expectedHardDeadlineAt = new Date(
      admissionAt.getTime() + AFFILIATE_AGENT_HARD_DEADLINE_SECONDS * 1_000,
    ).toISOString();
    expect(grant).toMatchObject({
      leaseExpiresAt: expectedLeaseExpiresAt,
      hardDeadlineAt: expectedHardDeadlineAt,
    });
    expect(harness.state.claims).toHaveLength(1);
  });

  it("enforces reviewer worker, invocation, workspace, attestation, and manifest isolation", async () => {
    const reviewerManifestPreimage = {
      schemaVersion: 1 as const,
      entries: [
        "ACTIVE_SUPPLY_CONTRACT",
        "COMMITTED_PACKAGE",
        "DETERMINISTIC_VALIDATION",
        "DURABLE_EVIDENCE",
      ].map((kind, index) => ({
        evidenceRef: `review-evidence-${index + 1}`,
        kind,
        artifactId: `review-file-${index + 1}`,
        sha256:
          kind === "ACTIVE_SUPPLY_CONTRACT"
            ? supplyContractFixture.hash
            : kind === "COMMITTED_PACKAGE"
              ? claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash
              : String(index + 1).repeat(64),
        mimeType: "application/json",
        byteSize: 10,
        retention: "INDEFINITE",
      })),
    };
    const reviewerManifest = {
      ...reviewerManifestPreimage,
      hash: hashAffiliateAgentValue(reviewerManifestPreimage),
    };
    const manifestWithHash = (kind: string, sha256: string) => {
      const preimage = {
        ...reviewerManifestPreimage,
        entries: reviewerManifestPreimage.entries.map((entry) =>
          entry.kind === kind ? { ...entry, sha256 } : entry,
        ),
      };
      return { ...preimage, hash: hashAffiliateAgentValue(preimage) };
    };
    const configureReviewerJob = (
      harness: GatewayClaimHarness,
      manifest = reviewerManifest,
    ): void => {
      Object.assign(harness.state.jobs[0], {
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
        role: "SUPPLY_REVIEWER",
        subjectType: "SUPPLY_REVIEWER",
        subjectId: "supply-source-1",
        subjectJson: claimRoleFields.SUPPLY_REVIEWER.subject,
        evidenceManifestJson: manifest,
        supplySourceId: "supply-source-1",
        parentClaimId: "producer-claim-1",
        expectedLifecycleGeneration: 7,
      });
    };
    const seedProducerHistory = (
      harness: GatewayClaimHarness,
      repairContext?: Readonly<Record<string, unknown>>,
    ): void => {
      const producerEnvelope = {
        ...claimFixtureForRole("MAPPING_PRODUCER"),
        jobId: "producer-job-1",
        claimId: "producer-claim-1",
        subject: {
          ...claimRoleFields.MAPPING_PRODUCER.subject,
          ...(repairContext ? { repairContext } : {}),
        },
      };
      const producerTerminalBase = terminalResultFixture({
        role: "MAPPING_PRODUCER",
        disposition: "PACKAGE_COMMITTED",
        payload: {
          packageHash: "b".repeat(64),
          commitReceiptId: "producer-commit-receipt",
        },
      });
      const producerTerminal = {
        ...producerTerminalBase,
        jobId: "producer-job-1",
        claimId: "producer-claim-1",
      };
      harness.state.claims.push({
        id: "producer-claim-1",
        jobId: "producer-job-1",
        claimGeneration: 1,
        lifecycleGeneration: 7,
        role: "MAPPING_PRODUCER",
        workerId: "producer-worker-1",
        invocationId: "producer-invocation-1",
        workspaceId: "producer-workspace-1",
        status: "COMPLETED",
        terminalReceiptId: "producer-terminal-receipt",
        claimEnvelopeHash: hashAffiliateAgentValue(producerEnvelope),
        claimEnvelopeJson: producerEnvelope,
      });
      harness.state.jobs.push({
        id: "producer-job-1",
        status: "COMPLETED",
        activeClaimId: null,
        claimGeneration: 1,
        terminalReceiptId: "producer-terminal-receipt",
        resultJson: producerTerminal,
      });
      for (const entry of reviewerManifest.entries) {
        harness.state.artifacts.push({
          id: `producer-artifact-${entry.evidenceRef}`,
          claimId: "producer-claim-1",
          claimGeneration: 1,
          evidenceRef: entry.evidenceRef,
          evidenceKind: entry.kind,
          sourceArtifactId: entry.artifactId,
          fileId: entry.artifactId,
          contentHash: entry.sha256,
          mimeType: entry.mimeType,
          creatingClaimId:
            entry.kind === "COMMITTED_PACKAGE" || entry.kind === "DETERMINISTIC_VALIDATION"
              ? "producer-claim-1"
              : null,
          byteSize: entry.byteSize,
          accessMode: "READ_ONLY",
          retentionClass: entry.retention,
          isPinned: true,
        });
      }
    };

    const reviewerRequest = (
      overrides: Partial<AffiliateAgentClaimRequest> = {},
    ): AffiliateAgentClaimRequest => {
      const workerId = overrides.workerId ?? "review-worker-1";
      const invocationId = overrides.invocationId ?? "review-invocation-1";
      const workspaceId =
        overrides.workspaceAttestation?.workspaceId ?? "review-workspace-1";
      return {
        idempotencyKey: "review-claim-request-1",
        roleCredential: "review-role-credential",
        role: "SUPPLY_REVIEWER",
        workerId,
        invocationId,
        workspaceAttestation: {
          schemaVersion: 1,
          workspaceId,
          mode: "READ_ONLY",
          executionClass: "PRODUCTION_OMP",
          workerId,
          invocationId,
          issuedAt: "2026-08-20T17:59:00.000Z",
          expiresAt: "2026-08-20T18:20:00.000Z",
          signature: "valid-workspace-signature",
        },
        ...overrides,
      };
    };
    const reuseCases = [
      {
        expectedCode: "PRODUCER_REVIEWER_IDENTITY_REUSED",
        request: reviewerRequest({
          workerId: "producer-worker-1",
        }),
      },
      {
        expectedCode: "INVOCATION_MISMATCH",
        request: reviewerRequest({
          invocationId: "producer-invocation-1",
        }),
      },
      {
        expectedCode: "REVIEW_WORKSPACE_INVALID",
        request: reviewerRequest({
          workspaceAttestation: {
            ...reviewerRequest().workspaceAttestation,
            workspaceId: "producer-workspace-1",
          },
        }),
      },
    ];

    for (const reuseCase of reuseCases) {
      const harness = createGatewayClaimHarness();
      configureReviewerJob(harness);
      seedProducerHistory(harness);
      await expect(
        harness.gateway.claim(reuseCase.request),
      ).rejects.toMatchObject({
        code: reuseCase.expectedCode,
        safeMessage: expect.any(String),
      });
    }
    for (const invalidManifest of [
      manifestWithHash("ACTIVE_SUPPLY_CONTRACT", "e".repeat(64)),
      manifestWithHash("COMMITTED_PACKAGE", "e".repeat(64)),
    ]) {
      const harness = createGatewayClaimHarness();
      configureReviewerJob(harness, invalidManifest);
      seedProducerHistory(harness);
      await expect(
        harness.gateway.claim(reviewerRequest()),
      ).rejects.toMatchObject({
        code: "REVIEW_WORKSPACE_INVALID",
        safeMessage: expect.any(String),
      });
    }

    const writableHarness = createGatewayClaimHarness();
    configureReviewerJob(writableHarness);
    seedProducerHistory(writableHarness);
    await expect(
      writableHarness.gateway.claim({
        ...reviewerRequest(),
        workspaceAttestation: {
          ...reviewerRequest().workspaceAttestation,
          mode: "READ_WRITE",
        },
      }),
    ).rejects.toMatchObject({ code: "REVIEW_WORKSPACE_INVALID" });

    const harness = createGatewayClaimHarness();
    configureReviewerJob(harness);
    seedProducerHistory(harness);
    const grant = await harness.gateway.claim(reviewerRequest());
    expect(
      grant?.envelope.evidenceManifest.entries.map(({ kind }) => kind),
    ).toEqual([
      "ACTIVE_SUPPLY_CONTRACT",
      "COMMITTED_PACKAGE",
      "DETERMINISTIC_VALIDATION",
      "DURABLE_EVIDENCE",
    ]);
    expect(
      harness.state.claims.find((claim) => claim.role === "SUPPLY_REVIEWER"),
    ).toMatchObject({
      role: "SUPPLY_REVIEWER",
      workspaceMode: "READ_ONLY",
      workerId: "review-worker-1",
      invocationId: "review-invocation-1",
      workspaceId: "review-workspace-1",
    });
    if (!grant) throw new Error("Expected one Supply Reviewer claim.");
    const reviewerTerminalFor = (
      reviewerGrant: AffiliateAgentClaimGrant,
      idempotencyKey: string,
      overrides: Readonly<{
        disposition: AffiliateAgentReviewerTerminalDisposition;
        payload: Readonly<Record<string, unknown>>;
      }> = {
        disposition: "APPROVED",
        payload: { committedPackageHash: "d".repeat(64) },
      },
    ): Extract<AffiliateAgentClaimOperation, { kind: "SUBMIT_RESULT" }> => ({
      kind: "SUBMIT_RESULT",
      idempotencyKey,
      authorization: gatewayAuthorizationFor(reviewerGrant),
      result: {
        schemaVersion: 1,
        jobId: reviewerGrant.envelope.jobId,
        claimId: reviewerGrant.envelope.claimId,
        claimGeneration: reviewerGrant.envelope.claimGeneration,
        lifecycleGeneration: reviewerGrant.envelope.lifecycleGeneration,
        deploymentContractVersion:
          reviewerGrant.envelope.deploymentContractVersion,
        deploymentContractHash: reviewerGrant.envelope.deploymentContractHash,
        supplyContractVersion: reviewerGrant.envelope.supplyContractVersion,
        supplyContractHash: reviewerGrant.envelope.supplyContractHash,
        roleContractVersion: reviewerGrant.envelope.roleContractVersion,
        roleContractHash: reviewerGrant.envelope.roleContractHash,
        promptTemplateVersion: reviewerGrant.envelope.promptTemplateVersion,
        promptTemplateHash: reviewerGrant.envelope.promptTemplateHash,
        workerId: reviewerGrant.envelope.workerId,
        role: reviewerGrant.envelope.role,
        invocationId: reviewerGrant.envelope.invocationId,
        reasonCodes: ["EVIDENCE_VERIFIED"],
        evidenceRefs: ["review-evidence-2"],
        summary: "The committed mapping package passed independent review.",
        ...overrides,
      } as AffiliateAgentReviewerTerminalResult,
    });
    const reviewerTerminal = reviewerTerminalFor(grant, "reviewer-terminal-1");
    await expect(
      harness.gateway.perform(reviewerTerminal),
    ).rejects.toMatchObject({
      code: "TERMINAL_DISPOSITION_NOT_PERMITTED",
      safeMessage: expect.any(String),
    });
    for (const [index, scopedResult] of [
      {
        disposition: "REGRESSION_ASSESSED" as const,
        payload: {
          supplySourceId: "other-supply-source",
          assessment: "PASS" as const,
        },
      },
      {
        disposition: "SOURCE_EXCLUSION_ASSESSED" as const,
        payload: {
          supplySourceId: "other-supply-source",
          recommendation: "EXCLUDE" as const,
        },
      },
    ].entries()) {
      await expect(
        harness.gateway.perform({
          ...reviewerTerminal,
          idempotencyKey: `reviewer-wrong-supply-source-${index}`,
          result: {
            ...reviewerTerminal.result,
            disposition: scopedResult.disposition,
            payload: scopedResult.payload,
          },
        }),
      ).rejects.toMatchObject({
        code: "TERMINAL_DISPOSITION_NOT_PERMITTED",
        safeMessage: expect.any(String),
      });
    }
    const accepted = await harness.gateway.perform({
      ...reviewerTerminal,
      result: {
        ...reviewerTerminal.result,
        payload: {
          committedPackageHash:
            claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash,
        },
      },
    });
    expect(harness.state.reviewerEffectCalls).toEqual(["APPROVED:execute"]);

    const reviewerDispositionCases = [
      {
        disposition: "ACTIVATED" as const,
        payload: {
          committedPackageHash:
            claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash,
          baselineHash: "c".repeat(64),
          candidateReviewId: "candidate-review-1",
        },
      },
      {
        disposition: "PRODUCER_REPAIR_REQUIRED" as const,
        payload: {
          committedPackageHash:
            claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash,
          repairIssues: ["MISSING_REQUIRED_FIELD"],
        },
      },
      {
        disposition: "REGRESSION_ASSESSED" as const,
        payload: {
          supplySourceId: "supply-source-1",
          assessment: "PASS" as const,
        },
      },
      {
        disposition: "SOURCE_EXCLUSION_ASSESSED" as const,
        payload: {
          supplySourceId: "supply-source-1",
          recommendation: "KEEP" as const,
        },
      },
      {
        disposition: "EXACT_TARGET_REJECTED" as const,
        payload: {
          targetId: "target-1",
          targetType: "EVENT" as const,
        },
      },
      {
        disposition: "HUMAN_REVIEW_REQUIRED" as const,
        payload: { caseReason: "Conflicting operator identity evidence." },
      },
    ] as const;
    for (const [index, scopedResult] of reviewerDispositionCases.entries()) {
      const matrixHarness = createGatewayClaimHarness();
      configureReviewerJob(matrixHarness);
      seedProducerHistory(matrixHarness);
      const matrixGrant = await matrixHarness.gateway.claim(
        reviewerRequest({
          idempotencyKey: `reviewer-matrix-claim-${index}`,
        }),
      );
      if (!matrixGrant) throw new Error("Expected a reviewer matrix claim.");

      await expect(
        matrixHarness.gateway.perform(
          reviewerTerminalFor(
            matrixGrant,
            `reviewer-matrix-terminal-${index}`,
            scopedResult,
          ),
        ),
      ).resolves.toMatchObject({
        kind: "TERMINAL_ACCEPTED",
        disposition: scopedResult.disposition,
      });
      expect(matrixHarness.state.reviewerEffectCalls).toEqual([
        `${scopedResult.disposition}:execute`,
      ]);
      expect(matrixHarness.state.receipts).toContainEqual(
        expect.objectContaining({
          commandName: "SUPPLY_REVIEWER_TERMINAL_EFFECT",
          status: "SUCCEEDED",
        }),
      );
    }

    const repairHarness = createGatewayClaimHarness();
    configureReviewerJob(repairHarness);
    const repairContext = {
        kind: "LEGACY_SPORT_REPAIR",
        intakeId: "repair-intake",
        evidenceRunId: "repair-run",
        sportsCatalog: buildAffiliateSportsCatalogSnapshot(
          [{ id: "grass-soccer", name: "Grass Soccer" }],
          "2026-08-20T18:00:00.000Z",
        ),
    };
    const strippedRepairHarness = createGatewayClaimHarness();
    configureReviewerJob(strippedRepairHarness);
    seedProducerHistory(strippedRepairHarness, repairContext);
    await expect(strippedRepairHarness.gateway.claim(reviewerRequest()))
      .rejects.toMatchObject({ code: "REVIEW_WORKSPACE_INVALID" });
    repairHarness.state.jobs[0].subjectJson = {
      ...claimRoleFields.SUPPLY_REVIEWER.subject,
      repairContext,
    };
    seedProducerHistory(repairHarness, repairContext);
    const repairGrant = await repairHarness.gateway.claim(reviewerRequest());
    if (!repairGrant) throw new Error("Expected a legacy repair review claim.");
    await expect(repairHarness.gateway.perform(reviewerTerminalFor(
      repairGrant,
      "repair-activation-denied",
      {
        disposition: "ACTIVATED",
        payload: {
          committedPackageHash: claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash,
          baselineHash: "a".repeat(64),
          candidateReviewId: "candidate-review-1",
        },
      },
    ))).rejects.toMatchObject({ code: "COMMAND_NOT_PERMITTED" });
    expect(repairHarness.state.reviewerEffectCalls).toEqual([]);

    expect(accepted).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "APPROVED",
    });
    const delayedHarness = createGatewayClaimHarness();
    configureReviewerJob(delayedHarness);
    seedProducerHistory(delayedHarness);
    delayedHarness.setTerminalEffectTimeAdvanceSeconds(
      AFFILIATE_AGENT_LEASE_SECONDS + 1,
    );
    const delayedGrant = await delayedHarness.gateway.claim(reviewerRequest());
    if (!delayedGrant) throw new Error("Expected one delayed reviewer claim.");
    const delayedTerminal = reviewerTerminalFor(
      delayedGrant,
      "reviewer-terminal-after-lease",
    );
    const delayedAccepted = await delayedHarness.gateway.perform({
      ...delayedTerminal,
      result: {
        ...delayedTerminal.result,
        payload: {
          committedPackageHash:
            claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash,
        },
      },
    });
    expect(delayedAccepted).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "APPROVED",
    });
  });
  it("replays a finalized reviewer result after claim expiry without rerunning its effect", async () => {
    const harness = createGatewayClaimHarness();
    configureStandaloneReviewerScenario(harness);
    const grant = await harness.gateway.claim(standaloneReviewerRequest());
    if (!grant) throw new Error("Expected one Supply Reviewer claim.");
    const result = {
      schemaVersion: 1 as const,
      jobId: grant.envelope.jobId,
      claimId: grant.envelope.claimId,
      claimGeneration: grant.envelope.claimGeneration,
      lifecycleGeneration: grant.envelope.lifecycleGeneration,
      deploymentContractVersion: grant.envelope.deploymentContractVersion,
      deploymentContractHash: grant.envelope.deploymentContractHash,
      supplyContractVersion: grant.envelope.supplyContractVersion,
      supplyContractHash: grant.envelope.supplyContractHash,
      roleContractVersion: grant.envelope.roleContractVersion,
      roleContractHash: grant.envelope.roleContractHash,
      promptTemplateVersion: grant.envelope.promptTemplateVersion,
      promptTemplateHash: grant.envelope.promptTemplateHash,
      workerId: grant.envelope.workerId,
      role: "SUPPLY_REVIEWER" as const,
      invocationId: grant.envelope.invocationId,
      disposition: "APPROVED" as const,
      reasonCodes: ["EVIDENCE_VERIFIED"] as const,
      evidenceRefs: ["review-evidence-2"] as const,
      summary: "The committed mapping package passed independent review.",
      payload: {
        committedPackageHash:
          claimRoleFields.SUPPLY_REVIEWER.subject.committedPackageHash,
      },
    };
    const operation: Extract<
      AffiliateAgentClaimOperation,
      { kind: "SUBMIT_RESULT" }
    > = {
      kind: "SUBMIT_RESULT",
      idempotencyKey: "reviewer-terminal-recovery",
      authorization: gatewayAuthorizationFor(grant),
      result,
    };
    await expect(harness.gateway.perform(operation)).resolves.toMatchObject({
      kind: "TERMINAL_ACCEPTED",
    });
    const claim = harness.state.claims.find(
      (candidate) => candidate.id === grant.envelope.claimId,
    );
    const job = harness.state.jobs.find(
      (candidate) => candidate.id === grant.envelope.jobId,
    );
    const effectReceipt = harness.state.receipts.find(
      (candidate) =>
        candidate.commandName === "SUPPLY_REVIEWER_TERMINAL_EFFECT",
    );
    if (!claim || !job || !effectReceipt) {
      throw new Error("Expected reviewer completion state.");
    }
    expect(effectReceipt).toMatchObject({
      status: "SUCCEEDED",
      responseJson: {
        kind: "SUCCEEDED",
        result,
      },
    });
    const terminalReceiptIndex = harness.state.receipts.findIndex(
      (candidate) => candidate.idempotencyKey === operation.idempotencyKey,
    );
    expect(terminalReceiptIndex).toBeGreaterThanOrEqual(0);
    harness.state.receipts.splice(terminalReceiptIndex, 1);
    const terminalEventIndex = harness.state.events.findIndex(
      (candidate) => candidate.eventType === "CLAIM_TERMINAL_RESULT_ACCEPTED",
    );
    expect(terminalEventIndex).toBeGreaterThanOrEqual(0);
    harness.state.events.splice(terminalEventIndex, 1);
    Object.assign(claim, {
      status: "ACTIVE",
      terminalReceiptId: null,
      tokenInvalidatedAt: null,
      endedAt: null,
    });
    Object.assign(job, {
      status: "CLAIMED",
      activeClaimId: claim.id,
      terminalReceiptId: null,
      terminalDisposition: null,
      resultHash: null,
      resultJson: null,
      finishedAt: null,
    });
    harness.state.claims.unshift({
      id: "aaa-reviewer-claim-without-effect",
      role: "SUPPLY_REVIEWER",
      status: "ACTIVE",
      leaseExpiresAt: new Date("2026-08-20T18:10:00.000Z"),
      hardDeadlineAt: new Date("2026-08-20T18:20:00.000Z"),
    });
    harness.setNow("2026-08-20T18:06:00.000Z");

    await expect(
      harness.gateway.reconcile({
        limit: 1,
        reconcileBefore: "2026-08-20T18:06:00.000Z",
      }),
    ).resolves.toMatchObject({
      examinedReceipts: 1,
      recoveredReceipts: 1,
      completedReceipts: 1,
      unresolvedReceipts: 0,
      expiredClaims: 0,
    });
    expect(claim).toMatchObject({ status: "COMPLETED" });
    expect(job).toMatchObject({ status: "COMPLETED" });
    expect(
      harness.state.receipts.find(
        (candidate) =>
          candidate.idempotencyKey === operation.idempotencyKey &&
          candidate.status === "SUCCEEDED",
      ),
    ).toBeDefined();
    const effectCallsAfterRecovery = [...harness.state.reviewerEffectCalls];
    const replayed = await harness.gateway.perform(operation);
    expect(replayed).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "APPROVED",
    });
    expect(harness.state.reviewerEffectCalls).toEqual(effectCallsAfterRecovery);

    await expect(harness.gateway.perform({
      ...operation,
      idempotencyKey: "reviewer-terminal-recovery-late-key",
    })).rejects.toMatchObject({
      code: "TOKEN_INVALIDATED",
      safeMessage: expect.any(String),
    });
    await expect(harness.gateway.perform({
      ...operation,
      result: {
        ...operation.result,
        summary: "A different terminal result.",
      },
    })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      safeMessage: expect.any(String),
    });
    expect(harness.state.reviewerEffectCalls).toEqual(effectCallsAfterRecovery);
  });

  it("fails closed when the active contract bundle is incomplete, unsupported, or mismatched", async () => {
    const mismatchedDeployments = [
      {
        ...deploymentContractFixture,

        activeSupplyContract: {
          version: 2,
          hash: "d".repeat(64),
        },
      },
      {
        ...deploymentContractFixture,
        roleContracts: deploymentContractFixture.roleContracts.map(
          (reference, index) =>
            index === 0
              ? {
                  ...reference,
                  version: reference.version + 1,
                  hash: "d".repeat(64),
                }
              : reference,
        ),
      },
      {
        ...deploymentContractFixture,
        promptTemplates: deploymentContractFixture.promptTemplates.map(
          (reference, index) =>
            index === 0
              ? {
                  ...reference,
                  version: reference.version + 1,
                  hash: "d".repeat(64),
                }
              : reference,
        ),
      },
    ].map(({ hash: _hash, ...preimage }) => ({
      ...preimage,
      hash: hashAffiliateAgentValue(preimage),
    }));
    const invalidBundles: readonly unknown[] = [
      { ...contractBundleFixture, promptTemplates: undefined },
      unsupportedDeploymentBundleFixture,
      ...mismatchedDeployments.map((deploymentContract) => ({
        ...contractBundleFixture,
        deploymentContract,
      })),
    ];
    for (const invalidBundle of invalidBundles) {
      const harness = createGatewayClaimHarness();
      harness.setActiveBundle(invalidBundle);

      await expect(
        harness.gateway.claim(harness.request),
      ).rejects.toMatchObject({
        code: "DEPLOYMENT_CONTRACT_STALE",
        safeMessage: expect.any(String),
      });
      expect(harness.state.claims).toHaveLength(0);
    }
  });
  it("applies a Coverage Planner campaign result to its linked replenishment wave", async () => {
    const harness = createGatewayClaimHarness();
    const wave = {
      id: "replenishment-wave-1",
      demandId: "replenishment-demand-1",
      coveragePlanningJobId: "gateway-job-1",
      rolloutCohort: "DEFAULT",
      demandGeneration: 1,
      status: "WAITING",
      evidenceRefs: [] as string[],
    };
    const demand = {
      id: "replenishment-demand-1",
      targetKey: "coverage-cell-1",
      rolloutCohort: "DEFAULT",
      contractVersion: supplyContractFixture.version,
      contractHash: supplyContractFixture.hash,
      generation: 1,
    };
    const campaign = {
      id: "campaign-1",
      status: "ACTIVE",
      region: "Test Region",
      metadata: {
        demandId: demand.id,
        coverageCellId: "coverage-cell-1",
        assessmentCycleId: "replenishment-demand-1:generation:1",
        rolloutCohort: "DEFAULT",
        contractVersion: supplyContractFixture.version,
        contractHash: supplyContractFixture.hash,
        waveId: wave.id,
        evidenceManifest: harness.state.jobs[0].evidenceManifestJson,
      },
    };
    const intake = {
      id: "intake-1",
      affiliateSourceId: "source-1",
      supplySourceId: "supply-source-1",
    };
    const mappingJob = {
      id: "mapping-job-1",
      intakeId: intake.id,
      sourceId: "source-1",
      supplySourceId: "supply-source-1",
      resultSummary: {},
    };
    const source = {
      id: "source-1",
      supplySourceId: "supply-source-1",
      targetKind: "EVENT",
    };
    const supplySource = {
      id: "supply-source-1",
      rolloutCohort: "DEFAULT",
      lifecycleGeneration: 0,
      activeSupplyContractVersion: null,
      activeSupplyContractHash: null,
    };
    const discoveryResult = {
      id: "discovery-result-1",
      campaignId: campaign.id,
      latestRunId: "discovery-run-1",
      matchingIntakeId: intake.id,
      matchingSourceId: source.id,
      supplySourceId: supplySource.id,
      canonicalUrl: "https://source.example.test/events",
      urlKey: "source.example.test/events",
      title: "Source events",
      sourceTypeHints: ["EVENT"],
    };
    harness.state.jobs[0].subjectJson = {
      type: "COVERAGE_PLANNER",
      coverageCellId: "coverage-cell-1",
      assessmentCycleId: "replenishment-demand-1:generation:1",
    };
    const waves = {
      findFirst: jest.fn(async () => wave),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(wave, data);
        return wave;
      }),
    };
    const campaigns = {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (
        where.id === campaign.id ? campaign : null
      )),
    };
    const discoveryResults = {
      findMany: jest.fn(async () => [discoveryResult]),
    };
    const intakes = {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (
        where.id === intake.id ? intake : null
      )),
      upsert: jest.fn(async () => intake),
    };
    const mappingJobs = {
      findFirst: jest.fn(async () => mappingJob),
      upsert: jest.fn(async () => mappingJob),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(mappingJob, data);
        return mappingJob;
      }),
    };
    const gatewayJobs = {
      upsert: jest.fn(async () => ({ id: "producer-job-1" })),
    };
    const sources = {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (
        where.id === source.id ? source : null
      )),
    };
    const supplySources = {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (
        where.id === supplySource.id ? supplySource : null
      )),
    };
    const demands = {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (
        where.id === demand.id ? demand : null
      )),
      update: jest.fn(async () => demand),
    };
    harness.setDomainDelegates({
      affiliateReplenishmentWaves: waves,
      affiliateReplenishmentDemands: demands,
      affiliateSourceDiscoveryCampaigns: campaigns,
      affiliateSourceDiscoveryResults: discoveryResults,
      affiliateSourceIntakes: intakes,
      affiliateSourceMappingJobs: mappingJobs,
      affiliateAgentGatewayJobs: gatewayJobs,
      affiliateScrapeSources: sources,
      affiliateSupplySources: supplySources,
    });

    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const providerEvidence = Buffer.from("provider discovery output", "utf8");
    const providerEvidenceHash = createHash("sha256")
      .update(providerEvidence)
      .digest("hex");
    harness.state.discoveryRuns.push({
      id: "discovery-run-1",
      campaignId: campaign.id,
      status: "SUCCEEDED",
    });
    harness.state.receipts.push({
      id: "discovery-receipt-1",
      claimId: grant.envelope.claimId,
      jobId: grant.envelope.jobId,
      claimGeneration: grant.envelope.claimGeneration,
      operationKind: "EXECUTE_COMMAND",
      commandName: "RUN_DISCOVERY_QUERY",
      status: "SUCCEEDED",
      responseJson: {
        kind: "COMMAND_SUCCEEDED",
        safeOutput: {
          evidenceRef: "provider-evidence-1",
          artifactId: "provider-artifact-1",
          sha256: providerEvidenceHash,
          mimeType: "application/json",
          byteSize: providerEvidence.byteLength,
        },
      },
    });
    harness.state.artifacts.push({
      id: "provider-artifact-row-1",
      claimId: grant.envelope.claimId,
      claimGeneration: grant.envelope.claimGeneration,
      evidenceRef: "provider-evidence-1",
      evidenceKind: "PROVIDER_RESULT",
      sourceArtifactId: "provider-artifact-1",
      fileId: "provider-artifact-1",
      contentHash: providerEvidenceHash,
      mimeType: "application/json",
      byteSize: providerEvidence.byteLength,
    });
    const operation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "coverage-domain-terminal",
      authorization: gatewayAuthorizationFor(grant),
      result: {
        ...coverageTerminalResultFor(grant),
        disposition: "CAMPAIGN_PROPOSED" as const,
        reasonCodes: ["EVIDENCE_VERIFIED"] as const,
        summary: "The coverage cell has one evidence-backed campaign.",
        payload: { campaignProposalRefs: ["campaign-1"] },
      },
    };

    const accepted = await harness.gateway.perform(operation);

    expect(accepted).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "CAMPAIGN_PROPOSED",
    });
    expect(wave).toEqual(expect.objectContaining({
      status: "ACTIVE",
      campaignId: "campaign-1",
      provider: "COVERAGE_PLANNER",
      evidenceRefs: [
        "gateway-job:gateway-job-1",
        "evidence-1",
        "campaign:campaign-1",
      ],
    }));
    expect(waves.update).toHaveBeenCalledTimes(1);
    expect(mappingJobs.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resultSummary: expect.objectContaining({
          coveragePlannerDispatch: expect.objectContaining({
            campaignId: campaign.id,
            discoveryResultId: discoveryResult.id,
            canonicalUrl: discoveryResult.canonicalUrl,
          }),
        }),
      }),
    }));
    expect(gatewayJobs.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        subjectJson: {
          type: "MAPPING_PRODUCER",
          supplySourceId: supplySource.id,
          mappingJobId: mappingJob.id,
          pass: 1,
        },
      }),
    }));
    expect(harness.state.receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        commandName: "GOVERNED_TERMINAL_DOMAIN_EFFECT",
        operationKind: "TERMINAL_EFFECT",
        status: "SUCCEEDED",
        responseJson: expect.objectContaining({
          kind: "SUCCEEDED",
          safeOutput: expect.objectContaining({
            kind: "COVERAGE_PLANNER_TERMINAL_EFFECT",
            waveId: wave.id,
          }),
        }),
      }),
    ]));
    await expect(harness.gateway.perform(operation)).resolves.toEqual(accepted);
    expect(waves.update).toHaveBeenCalledTimes(1);
  });

  it("applies a Mapping Producer package result to its mapping lineage and reviewer queue", async () => {
    const harness = createGatewayClaimHarness();
    const mappingJob = {
      id: "mapping-job-domain",
      supplySourceId: "supply-source-domain",
      sourceId: "scrape-source-domain",
      mappingId: null,
      resultSummary: {},
    };
    const source = {
      id: "scrape-source-domain",
      supplySourceId: "supply-source-domain",
      activeMappingId: "mapping-domain",
      targetKind: "EVENT",
    };
    const mappingJobs = {
      findUnique: jest.fn(async () => mappingJob),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(mappingJob, data);
        return mappingJob;
      }),
    };
    const sources = {
      findUnique: jest.fn(async () => source),
    };
    const targets = {
      findFirst: jest.fn(async () => ({
        targetId: "target-domain",
        targetType: "EVENT",
      })),
    };
    harness.setDomainDelegates({
      affiliateSourceMappingJobs: mappingJobs,
      affiliateScrapeSources: sources,
      affiliateSupplyTargets: targets,
    });
    Object.assign(harness.state.jobs[0], {
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: "mapping-job-domain",
      subjectJson: {
        type: "MAPPING_PRODUCER",
        supplySourceId: "supply-source-domain",
        mappingJobId: "mapping-job-domain",
        pass: 1,
      },
      supplySourceId: "supply-source-domain",
      expectedLifecycleGeneration: 7,
    });
    const request: AffiliateAgentClaimRequest = {
      idempotencyKey: "mapping-domain-claim",
      roleCredential: "mapping-role-credential",
      role: "MAPPING_PRODUCER",
      workerId: "mapping-worker-domain",
      invocationId: "mapping-invocation-domain",
      workspaceAttestation: {
        schemaVersion: 1,
        workspaceId: "mapping-workspace-domain",
        mode: "READ_WRITE",
        executionClass: "PRODUCTION_OMP",
        workerId: "mapping-worker-domain",
        invocationId: "mapping-invocation-domain",
        issuedAt: "2026-08-20T17:59:00.000Z",
        expiresAt: "2026-08-20T18:20:00.000Z",
        signature: "valid-workspace-signature",
      },
    };
    const grant = await harness.gateway.claim(request);
    if (!grant) throw new Error("Expected one Mapping Producer claim.");
    const packageHash = "b".repeat(64);
    harness.state.receipts.push({
      id: "mapping-commit-receipt-domain",
      claimId: grant.envelope.claimId,
      jobId: grant.envelope.jobId,
      claimGeneration: grant.envelope.claimGeneration,
      idempotencyKey: "mapping-commit-domain",
      operationKind: "EXECUTE_COMMAND",
      commandName: "COMMIT_DECLARATIVE_PACKAGE",
      requestHash: "c".repeat(64),
      status: "SUCCEEDED",
      responseHash: "d".repeat(64),
      responseJson: {
        kind: "COMMAND_SUCCEEDED",
        receiptId: "mapping-commit-receipt-domain",
        commandType: "COMMIT_DECLARATIVE_PACKAGE",
        responseHash: "d".repeat(64),
        safeOutput: { packageHash },
      },
      startedAt: new Date("2026-08-20T18:00:00.000Z"),
      completedAt: new Date("2026-08-20T18:00:01.000Z"),
    });
    harness.state.artifacts.push(
      {
        id: "mapping-package-artifact-domain",
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        evidenceRef: "committed-package",
        evidenceKind: "COMMITTED_PACKAGE",
        sourceArtifactId: "mapping-package-file-domain",
        fileId: "mapping-package-file-domain",
        contentHash: packageHash,
        mimeType: "application/json",
        byteSize: 128,
        creatingClaimId: grant.envelope.claimId,
      },
      {
        id: "mapping-validation-artifact-domain",
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        evidenceRef: "deterministic-validation",
        evidenceKind: "DETERMINISTIC_VALIDATION",
        sourceArtifactId: "mapping-validation-file-domain",
        fileId: "mapping-validation-file-domain",
        contentHash: "e".repeat(64),
        mimeType: "application/json",
        byteSize: 256,
        creatingClaimId: grant.envelope.claimId,
      },
      {
        id: "mapping-durable-artifact-domain",
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        evidenceRef: "durable-evidence",
        evidenceKind: "DURABLE_EVIDENCE",
        sourceArtifactId: "mapping-durable-file-domain",
        fileId: "mapping-durable-file-domain",
        contentHash: "f".repeat(64),
        mimeType: "text/markdown",
        byteSize: 512,
        creatingClaimId: grant.envelope.claimId,
      },
    );
    const reviewerUpsert = jest.fn(async ({
      create,
    }: {
      create: Record<string, unknown>;
    }) => ({
      ...create,
      id: "mapping-reviewer-job-domain",
    }));
    harness.setDomainDelegates({
      affiliateAgentGatewayJobs: { upsert: reviewerUpsert },
    });
    const resultOperation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "mapping-domain-terminal",
      authorization: gatewayAuthorizationFor(grant),
      result: {
        ...coverageTerminalResultFor(grant),
        role: "MAPPING_PRODUCER" as const,
        disposition: "PACKAGE_COMMITTED" as const,
        reasonCodes: ["SCHEMA_VALIDATED"] as const,
        summary: "The declarative mapping package is committed.",
        payload: {
          packageHash,
          commitReceiptId: "mapping-commit-receipt-domain",
        },
      },
    };

    const accepted = await harness.gateway.perform(resultOperation);
    expect(accepted).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "PACKAGE_COMMITTED",
    });
    expect(mappingJob).toEqual(expect.objectContaining({
      status: "COMPLETED",
      sourceId: source.id,
      mappingId: source.activeMappingId,
      commit: "mapping-commit-receipt-domain",
      claimedAt: null,
      workerId: null,
      leaseExpiresAt: null,
    }));
    expect(mappingJobs.update).toHaveBeenCalledTimes(1);
    expect(reviewerUpsert).toHaveBeenCalledTimes(1);
    expect(reviewerUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        dedupeKey: `mapping-review:${grant.envelope.claimId}:${packageHash}:1`,
      },
      create: expect.objectContaining({
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
        role: "SUPPLY_REVIEWER",
        parentClaimId: grant.envelope.claimId,
        supplySourceId: "supply-source-domain",
        subjectJson: expect.objectContaining({
          type: "SUPPLY_REVIEWER",
          producerClaimId: grant.envelope.claimId,
          committedPackageHash: packageHash,
          targetId: "target-domain",
          targetType: "EVENT",
          reviewPass: 1,
        }),
        evidenceManifestJson: expect.objectContaining({
          hash: expect.any(String),
          entries: expect.arrayContaining([
            expect.objectContaining({
              evidenceRef: "committed-package",
              kind: "COMMITTED_PACKAGE",
              artifactId: "mapping-package-file-domain",
              sha256: packageHash,
            }),
          ]),
        }),
      }),
    }));
    expect(harness.state.receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        commandName: "GOVERNED_TERMINAL_DOMAIN_EFFECT",
        operationKind: "TERMINAL_EFFECT",
        status: "SUCCEEDED",
        responseJson: expect.objectContaining({
          kind: "SUCCEEDED",
          safeOutput: expect.objectContaining({
            kind: "MAPPING_PRODUCER_TERMINAL_EFFECT",
            mappingJobId: "mapping-job-domain",
            reviewerJobId: "mapping-reviewer-job-domain",
          }),
        }),
      }),
    ]));
    await expect(harness.gateway.perform(resultOperation)).resolves.toEqual(accepted);
    expect(mappingJobs.update).toHaveBeenCalledTimes(1);
    expect(reviewerUpsert).toHaveBeenCalledTimes(1);
  });

  it("claims Mapping Producer work, validates and commits one declarative package, and replays its terminal result", async () => {
    let alertWriterCalls = 0;
    const operationalAlert: AffiliateOperationalAlertWriter = async (
      _input: AffiliateOperationalAlertInput,
    ) => {
      alertWriterCalls += 1;
      if (alertWriterCalls === 1) {
        return {
          alertId: "alert-1",
          deliveries: [{
            channel: "webhook",
            status: "FAILED",
            errorMessage: "Simulated post-commit alert failure.",
          }],
        };
      }
      return {
        alertId: `alert-${String(alertWriterCalls)}`,
        deliveries: [],
      };
    };
    const harness = createGatewayClaimHarness({
      advanceClockDuringTransactionalCommandSeconds: 7,
      operationalAlert,
      persistLifecycleAlertTransition: true,
    });
    const listBytes = Buffer.from(
      '<div class="event-card"><span class="event-title">Sample event</span><a class="event-link" href="/events/sample">Details</a></div>',
      "utf8",
    );
    harness.setArtifactRead({
      bytes: new Uint8Array(listBytes),
      mimeType: "text/markdown",
      byteSize: listBytes.byteLength,
      sourceUrl: "https://evidence.example.test/page",
      finalUrl: "https://evidence.example.test/page",
    });
    const listManifestPreimage = {
      schemaVersion: 1 as const,
      entries: [
        {
          evidenceRef: "evidence-1",
          kind: "PAGE_MARKDOWN" as const,
          artifactId: "file-evidence-1",
          sha256: createHash("sha256").update(listBytes).digest("hex"),
          mimeType: "text/markdown",
          byteSize: listBytes.byteLength,
          retention: "INDEFINITE" as const,
        },
      ],
    };
    harness.state.jobs[0].evidenceManifestJson = {
      ...listManifestPreimage,
      hash: hashAffiliateAgentValue(listManifestPreimage),
    };
    Object.assign(harness.state.jobs[0], {
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: "mapping-job-1",
      subjectJson: claimRoleFields.MAPPING_PRODUCER.subject,
      supplySourceId: "supply-source-1",
      expectedLifecycleGeneration: 7,
    });
    const request: AffiliateAgentClaimRequest = {
      idempotencyKey: "mapping-claim-request-1",
      roleCredential: "mapping-role-credential",
      role: "MAPPING_PRODUCER",
      workerId: "mapping-worker-1",
      invocationId: "mapping-invocation-1",
      workspaceAttestation: {
        schemaVersion: 1,
        workspaceId: "mapping-workspace-1",
        mode: "READ_WRITE",
        executionClass: "PRODUCTION_OMP",
        workerId: "mapping-worker-1",
        invocationId: "mapping-invocation-1",
        issuedAt: "2026-08-20T17:59:00.000Z",
        expiresAt: "2026-08-20T18:20:00.000Z",
        signature: "valid-workspace-signature",
      },
    };
    const grant = await harness.gateway.claim(request);
    if (!grant) throw new Error("Expected one Mapping Producer claim.");
    const authorization = gatewayAuthorizationFor(grant);
    const candidatePackage = {
      schemaVersion: 1 as const,
      supplySourceId: "supply-source-1",
      listingKind: "EVENT" as const,
      listUrlRef: "evidence-1",
      itemSelector: ".event-card",
      fields: [
        {
          field: "officialActionUrl" as const,
          selector: ".event-link" as const,
          mode: "ATTRIBUTE" as const,
          attribute: "href",
          transform: "ABSOLUTE_URL" as const,
        },
        {
          field: "title" as const,
          selector: ".event-title",
          mode: "TEXT" as const,
          attribute: null,
          transform: "TRIM" as const,
        },
      ],
      evidenceRefs: ["evidence-1"],
    };
    const packageHash = hashAffiliateAgentValue(candidatePackage);
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: "mapping-validate-mismatched-source",
        authorization,
        command: {
          type: "VALIDATE_DECLARATIVE_PACKAGE",
          data: {
            candidatePackage: {
              ...candidatePackage,
              supplySourceId: "supply-source-2",
            },
            evidenceManifestHash: grant.envelope.evidenceManifest.hash,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "COMMAND_NOT_PERMITTED" });

    const validation = await harness.gateway.perform({
      kind: "EXECUTE_COMMAND",
      idempotencyKey: "mapping-validate-1",
      authorization,
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage,
          evidenceManifestHash: grant.envelope.evidenceManifest.hash,
        },
      },
    });
    expect(validation).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "VALIDATE_DECLARATIVE_PACKAGE",
      safeOutput: { isValid: true, validatedPackageHash: packageHash },
    });
    const validationReceipt = harness.state.receipts.find(
      (receipt) => receipt.id === validation.receiptId,
    );
    expect(validationReceipt).toMatchObject({
      startedAt: new Date("2026-08-20T18:00:00.000Z"),
      completedAt: new Date("2026-08-20T18:00:07.000Z"),
    });
    const commitOperation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "mapping-commit-1",
      authorization,
      command: {
        type: "COMMIT_DECLARATIVE_PACKAGE" as const,
        data: {
          validationReceiptId: validation.receiptId,
          validatedPackageHash: packageHash,
        },
      },
    };
    await expect(
      harness.gateway.perform(commitOperation),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      isRetryable: true,
      receiptId: expect.any(String),
    });
    const committed = await harness.gateway.perform(commitOperation);
    expect(committed).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "COMMIT_DECLARATIVE_PACKAGE",
      safeOutput: { packageHash },
    });
    expect(alertWriterCalls).toBe(2);
    const replayedCommit = await harness.gateway.perform({
      kind: "EXECUTE_COMMAND",
      idempotencyKey: "mapping-commit-replay",
      authorization,
      command: {
        type: "COMMIT_DECLARATIVE_PACKAGE",
        data: {
          validationReceiptId: validation.receiptId,
          validatedPackageHash: packageHash,
        },
      },
    });
    expect(replayedCommit).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "COMMIT_DECLARATIVE_PACKAGE",
      safeOutput: { packageHash },
    });
    expect(
      harness.state.receipts.filter(
        (receipt) =>
          receipt.commandName === "COMMIT_DECLARATIVE_PACKAGE" &&
          receipt.status === "SUCCEEDED",
      ),
    ).toHaveLength(2);
    const repairResult = {
      schemaVersion: 1 as const,
      jobId: grant.envelope.jobId,
      claimId: grant.envelope.claimId,
      claimGeneration: grant.envelope.claimGeneration,
      lifecycleGeneration: grant.envelope.lifecycleGeneration,
      deploymentContractVersion: grant.envelope.deploymentContractVersion,
      deploymentContractHash: grant.envelope.deploymentContractHash,
      supplyContractVersion: grant.envelope.supplyContractVersion,
      supplyContractHash: grant.envelope.supplyContractHash,
      roleContractVersion: grant.envelope.roleContractVersion,
      roleContractHash: grant.envelope.roleContractHash,
      promptTemplateVersion: grant.envelope.promptTemplateVersion,
      promptTemplateHash: grant.envelope.promptTemplateHash,
      workerId: grant.envelope.workerId,
      role: grant.envelope.role,
      invocationId: grant.envelope.invocationId,
      disposition: "BOUNDED_REPAIR_SUBMITTED" as const,
      reasonCodes: ["SCHEMA_VALIDATED" as const],
      evidenceRefs: ["evidence-1"],
      summary: "The bounded mapping repair is committed.",
      payload: {
        repairPass: 2,
        packageHash,
        commitReceiptId: committed.receiptId,
      },
    };
    await expect(
      harness.gateway.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: "mapping-repair-wrong-pass",
        authorization,
        result: repairResult,
      }),
    ).rejects.toMatchObject({
      code: "TERMINAL_DISPOSITION_NOT_PERMITTED",
      safeMessage: expect.any(String),
    });
    await expect(
      harness.gateway.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: "mapping-repair-wrong-receipt",
        authorization,
        result: {
          ...repairResult,
          payload: {
            ...repairResult.payload,
            repairPass: 1,
            commitReceiptId: "wrong-commit-receipt",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "TERMINAL_DISPOSITION_NOT_PERMITTED",
      safeMessage: expect.any(String),
    });
    const resultOperation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "mapping-terminal-1",
      authorization,
      result: {
        schemaVersion: 1 as const,
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        lifecycleGeneration: grant.envelope.lifecycleGeneration,
        deploymentContractVersion: grant.envelope.deploymentContractVersion,
        deploymentContractHash: grant.envelope.deploymentContractHash,
        supplyContractVersion: grant.envelope.supplyContractVersion,
        supplyContractHash: grant.envelope.supplyContractHash,
        roleContractVersion: grant.envelope.roleContractVersion,
        roleContractHash: grant.envelope.roleContractHash,
        promptTemplateVersion: grant.envelope.promptTemplateVersion,
        promptTemplateHash: grant.envelope.promptTemplateHash,
        workerId: grant.envelope.workerId,
        invocationId: grant.envelope.invocationId,
        role: grant.envelope.role,
        disposition: "PACKAGE_COMMITTED" as const,
        reasonCodes: ["SCHEMA_VALIDATED"],
        evidenceRefs: ["evidence-1"],
        summary: "The declarative mapping package is committed.",
        payload: {
          packageHash,
          commitReceiptId: replayedCommit.receiptId,
        },
      },
    };
    const accepted = await harness.gateway.perform(resultOperation);
    expect(accepted).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "PACKAGE_COMMITTED",
    });
    expect(await harness.gateway.perform(resultOperation)).toEqual(accepted);
    expect(harness.state.jobs[0]?.invocationFailureCount).toBe(0);
  });

  it("executes one exact human lifecycle command and records both identities", async () => {
    const harness = createGatewayClaimHarness();
    const humanManifestPreimage = {
      schemaVersion: 1 as const,
      entries: ["HUMAN_DECISION", "REVIEWER_EVIDENCE"].map((kind, index) => ({
        evidenceRef: `human-evidence-${index + 1}`,
        kind,
        artifactId: `human-file-${index + 1}`,
        sha256:
          kind === "HUMAN_DECISION"
            ? claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash
            : String(index + 5).repeat(64),
        mimeType: "application/json",
        byteSize: 10,
        retention: "INDEFINITE",
      })),
    };
    Object.assign(harness.state.jobs[0], {
      queue: "AFFILIATE_HUMAN_DIRECTED",
      lane: "HUMAN_EXECUTION",
      role: "HUMAN_DIRECTED_EXECUTOR",
      subjectType: "HUMAN_DIRECTED_EXECUTOR",
      subjectId: "case-1",
      subjectJson: claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject,
      evidenceManifestJson: {
        ...humanManifestPreimage,
        hash: hashAffiliateAgentValue(humanManifestPreimage),
      },
      supplySourceId: "supply-source-1",
      parentClaimId: "reviewer-claim-1",
      expectedLifecycleGeneration: 7,
    });
    seedReviewerHistory(harness, humanManifestPreimage.entries[1]);
    const request: AffiliateAgentClaimRequest = {
      idempotencyKey: "human-claim-request-1",
      roleCredential: "human-role-credential",
      role: "HUMAN_DIRECTED_EXECUTOR",
      workerId: "human-worker-1",
      invocationId: "human-invocation-1",
      workspaceAttestation: {
        schemaVersion: 1,
        workspaceId: "human-workspace-1",
        mode: "READ_WRITE",
        executionClass: "PRODUCTION_OMP",
        workerId: "human-worker-1",
        invocationId: "human-invocation-1",
        issuedAt: "2026-08-20T17:59:00.000Z",
        expiresAt: "2026-08-20T18:20:00.000Z",
        signature: "valid-workspace-signature",
      },
    };
    const mismatchedHumanManifest = {
      ...humanManifestPreimage,
      entries: humanManifestPreimage.entries.map((entry) =>
        entry.kind === "REVIEWER_EVIDENCE"
          ? { ...entry, evidenceRef: "unbound-reviewer-evidence" }
          : entry,
      ),
    };
    const mismatchedHarness = createGatewayClaimHarness();
    Object.assign(mismatchedHarness.state.jobs[0], {
      queue: "AFFILIATE_HUMAN_DIRECTED",
      lane: "HUMAN_EXECUTION",
      role: "HUMAN_DIRECTED_EXECUTOR",
      subjectType: "HUMAN_DIRECTED_EXECUTOR",
      subjectId: "case-1",
      subjectJson: claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject,
      evidenceManifestJson: {
        ...mismatchedHumanManifest,
        hash: hashAffiliateAgentValue(mismatchedHumanManifest),
      },
      supplySourceId: "supply-source-1",
      parentClaimId: "reviewer-claim-1",
      expectedLifecycleGeneration: 7,
    });
    seedReviewerHistory(mismatchedHarness, humanManifestPreimage.entries[1]);
    await expect(
      mismatchedHarness.gateway.claim(request),
    ).rejects.toMatchObject({
      code: "REVIEW_WORKSPACE_INVALID",
      safeMessage: expect.any(String),
    });

    const unsupportedHumanManifest = {
      ...humanManifestPreimage,
      entries: [
        {
          evidenceRef: "human-contract-evidence",
          kind: "ACTIVE_SUPPLY_CONTRACT" as const,
          artifactId: "human-contract-file",
          sha256: "d".repeat(64),
          mimeType: "application/json",
          byteSize: 10,
          retention: "INDEFINITE" as const,
        },
        ...humanManifestPreimage.entries,
      ],
    };
    const unsupportedHarness = createGatewayClaimHarness();
    Object.assign(unsupportedHarness.state.jobs[0], {
      queue: "AFFILIATE_HUMAN_DIRECTED",
      lane: "HUMAN_EXECUTION",
      role: "HUMAN_DIRECTED_EXECUTOR",
      subjectType: "HUMAN_DIRECTED_EXECUTOR",
      subjectId: "case-1",
      subjectJson: claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject,
      evidenceManifestJson: {
        ...unsupportedHumanManifest,
        hash: hashAffiliateAgentValue(unsupportedHumanManifest),
      },
      supplySourceId: "supply-source-1",
      parentClaimId: "reviewer-claim-1",
      expectedLifecycleGeneration: 7,
    });
    await expect(
      unsupportedHarness.gateway.claim(request),
    ).rejects.toMatchObject({
      code: "REVIEW_WORKSPACE_INVALID",
      safeMessage: expect.any(String),
    });
    const grant = await harness.gateway.claim(request);
    if (!grant) throw new Error("Expected one Human-directed Executor claim.");
    const authorization = gatewayAuthorizationFor(grant);
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: "human-lifecycle-wrong-decision",
        authorization,
        command: {
          type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
          data: {
            caseId: "case-1",
            decisionHash: "d".repeat(64),
            lifecycleCommandRef: "lifecycle-command-1",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "COMMAND_NOT_PERMITTED",
      safeMessage: expect.any(String),
    });
    const lifecycleOperation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "human-lifecycle-1",
      authorization,
      command: {
        type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" as const,
        data: {
          caseId: "case-1",
          decisionHash:
            claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash,
          lifecycleCommandRef: "lifecycle-command-1",
        },
      },
    };
    const executed = await harness.gateway.perform(lifecycleOperation);
    expect(executed).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
    });
    expect(await harness.gateway.perform(lifecycleOperation)).toEqual(executed);
    expect(harness.state.lifecycleCalls).toHaveLength(1);
    expect(harness.state.lifecycleCalls[0]).toEqual(
      expect.objectContaining({ invocationId: "human-invocation-1" }),
    );

    const humanTerminal = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "human-terminal-1",
      authorization,
      result: {
        schemaVersion: 1 as const,
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        lifecycleGeneration: grant.envelope.lifecycleGeneration,
        deploymentContractVersion: grant.envelope.deploymentContractVersion,
        deploymentContractHash: grant.envelope.deploymentContractHash,
        supplyContractVersion: grant.envelope.supplyContractVersion,
        supplyContractHash: grant.envelope.supplyContractHash,
        roleContractVersion: grant.envelope.roleContractVersion,
        roleContractHash: grant.envelope.roleContractHash,
        promptTemplateVersion: grant.envelope.promptTemplateVersion,
        promptTemplateHash: grant.envelope.promptTemplateHash,
        workerId: grant.envelope.workerId,
        role: grant.envelope.role,
        invocationId: grant.envelope.invocationId,
        disposition: "LIFECYCLE_COMMAND_EXECUTED" as const,
        reasonCodes: ["EVIDENCE_VERIFIED"],
        evidenceRefs: ["human-evidence-1", "human-evidence-2"],
        summary: "The recorded lifecycle command completed.",
        payload: {
          caseId: "case-1",
          lifecycleCommandRef: "lifecycle-command-1",
          receiptId: "wrong-receipt",
        },
      },
    };
    await expect(harness.gateway.perform(humanTerminal)).rejects.toMatchObject({
      code: "TERMINAL_DISPOSITION_NOT_PERMITTED",
      safeMessage: expect.any(String),
    });
    harness.setNow("2026-08-20T18:06:00.000Z");
    const accepted = await harness.gateway.perform({
      ...humanTerminal,
      result: {
        ...humanTerminal.result,
        payload: {
          ...humanTerminal.result.payload,
          receiptId: executed.receiptId,
        },
      },
    });
    expect(accepted).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "LIFECYCLE_COMMAND_EXECUTED",
    });
    expect(harness.state.events).toContainEqual(
      expect.objectContaining({
        eventType: "LIFECYCLE_COMMAND_SUCCEEDED",
        actorId: "human-invocation-1",
        payload: expect.objectContaining({
          recordedHumanActorId: "user-1",
        }),
      }),
    );
  });

  it("recovers a lost lifecycle response after restart without executing twice", async () => {
    const harness = createGatewayClaimHarness();
    harness.setLifecycleResponseLoss(true);
    const humanManifestPreimage = {
      schemaVersion: 1 as const,
      entries: ["HUMAN_DECISION", "REVIEWER_EVIDENCE"].map((kind, index) => ({
        evidenceRef: `lifecycle-recovery-evidence-${index + 1}`,
        kind,
        artifactId: `lifecycle-recovery-file-${index + 1}`,
        sha256:
          kind === "HUMAN_DECISION"
            ? claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash
            : String(index + 7).repeat(64),
        mimeType: "application/json",
        byteSize: 10,
        retention: "INDEFINITE",
      })),
    };
    Object.assign(harness.state.jobs[0], {
      queue: "AFFILIATE_HUMAN_DIRECTED",
      lane: "HUMAN_EXECUTION",
      role: "HUMAN_DIRECTED_EXECUTOR",
      subjectType: "HUMAN_DIRECTED_EXECUTOR",
      subjectId: "case-1",
      subjectJson: claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject,
      evidenceManifestJson: {
        ...humanManifestPreimage,
        hash: hashAffiliateAgentValue(humanManifestPreimage),
      },
      supplySourceId: "supply-source-1",
      parentClaimId: "reviewer-claim-1",
      expectedLifecycleGeneration: 7,
    });
    seedReviewerHistory(harness, humanManifestPreimage.entries[1]);
    const request: AffiliateAgentClaimRequest = {
      ...harness.request,
      idempotencyKey: "lifecycle-recovery-claim",
      roleCredential: "human-role-credential",
      role: "HUMAN_DIRECTED_EXECUTOR",
      workerId: "lifecycle-recovery-worker",
      invocationId: "lifecycle-recovery-invocation",
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: "lifecycle-recovery-workspace",
        workerId: "lifecycle-recovery-worker",
        invocationId: "lifecycle-recovery-invocation",
      },
    };
    const grant = await harness.gateway.claim(request);
    if (!grant) throw new Error("Expected one Human-directed Executor claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "lifecycle-recovery-command",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" as const,
        data: {
          caseId: "case-1",
          decisionHash:
            claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash,
          lifecycleCommandRef: "lifecycle-command-1",
        },
      },
    };
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      receiptId: expect.any(String),
    });
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "OPERATION_IN_PROGRESS",
      receiptId: expect.any(String),
    });
    expect(harness.state.lifecycleRecoverReceiptIds).toHaveLength(0);
    harness.setNow("2026-08-20T18:06:00.000Z");
    harness.setNextTransactionConflicts(2);

    const restarted = harness.recreateGateway();
    expect(await restarted.reconcile({ limit: 10 })).toMatchObject({
      examinedReceipts: 1,
      recoveredReceipts: 1,
      completedReceipts: 1,
      unresolvedReceipts: 0,
      expiredClaims: 0,
    });
    expect(harness.state.lifecycleCalls).toHaveLength(1);
    expect(harness.state.lifecycleRecoverReceiptIds).toHaveLength(1);
    const lifecycleReceipt = harness.state.receipts.find(
      (receipt) => receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
    );
    if (!lifecycleReceipt || typeof lifecycleReceipt.id !== "string") {
      throw new Error("Expected the recovered lifecycle receipt.");
    }
    expect(lifecycleReceipt.status).toBe("SUCCEEDED");

    const terminalOperation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "lifecycle-recovery-terminal",
      authorization: gatewayAuthorizationFor(grant),
      result: {
        schemaVersion: 1 as const,
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        lifecycleGeneration: grant.envelope.lifecycleGeneration,
        deploymentContractVersion: grant.envelope.deploymentContractVersion,
        deploymentContractHash: grant.envelope.deploymentContractHash,
        supplyContractVersion: grant.envelope.supplyContractVersion,
        supplyContractHash: grant.envelope.supplyContractHash,
        roleContractVersion: grant.envelope.roleContractVersion,
        roleContractHash: grant.envelope.roleContractHash,
        promptTemplateVersion: grant.envelope.promptTemplateVersion,
        promptTemplateHash: grant.envelope.promptTemplateHash,
        workerId: grant.envelope.workerId,
        role: "HUMAN_DIRECTED_EXECUTOR" as const,
        invocationId: grant.envelope.invocationId,
        disposition: "LIFECYCLE_COMMAND_EXECUTED" as const,
        reasonCodes: ["EVIDENCE_VERIFIED"] as const,
        evidenceRefs: [
          "lifecycle-recovery-evidence-1",
          "lifecycle-recovery-evidence-2",
        ] as const,
        summary: "The recorded lifecycle command completed.",
        payload: {
          caseId: "case-1",
          lifecycleCommandRef: "lifecycle-command-1",
          receiptId: lifecycleReceipt.id,
        },
      },
    };
    const lifecycleCallsAfterRecovery = harness.state.lifecycleCalls.length;
    const replayedTerminal = await restarted.perform(terminalOperation);
    expect(replayedTerminal).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "LIFECYCLE_COMMAND_EXECUTED",
    });
    expect(harness.state.lifecycleCalls).toHaveLength(lifecycleCallsAfterRecovery);
    await expect(restarted.perform({
      ...terminalOperation,
      idempotencyKey: "lifecycle-recovery-terminal-late-key",
    })).rejects.toMatchObject({
      code: "TOKEN_INVALIDATED",
      safeMessage: expect.any(String),
    });
    await expect(restarted.perform({
      ...terminalOperation,
      result: {
        ...terminalOperation.result,
        summary: "A different lifecycle terminal result.",
      },
    })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      safeMessage: expect.any(String),
    });
    expect(harness.state.lifecycleCalls).toHaveLength(lifecycleCallsAfterRecovery);
    expect(await restarted.reconcile({ limit: 10 })).toMatchObject({
      examinedReceipts: 0,
      recoveredReceipts: 0,
      completedReceipts: 0,
    });
  });

  it("admits independently versioned active Supply and deployment contracts", async () => {
    const { hash: _supplyHash, ...supplyPreimageV1 } = supplyContractFixture;
    const supplyPreimage = { ...supplyPreimageV1, version: 2 };
    const supplyContract = {
      ...supplyPreimage,
      hash: hashAffiliateAgentValue(supplyPreimage),
    };
    const { hash: _deploymentHash, ...deploymentPreimageV1 } =
      deploymentContractFixture;
    const deploymentPreimage = {
      ...deploymentPreimageV1,
      version: 3,
      activeSupplyContract: {
        version: supplyContract.version,
        hash: supplyContract.hash,
      },
    };
    const harness = createGatewayClaimHarness();
    harness.setActiveBundle({
      ...contractBundleFixture,
      supplyContract,
      deploymentContract: {
        ...deploymentPreimage,
        hash: hashAffiliateAgentValue(deploymentPreimage),
      },
    });

    const grant = await harness.gateway.claim(harness.request);

    expect(grant?.envelope).toMatchObject({
      supplyContractVersion: 2,
      deploymentContractVersion: 3,
    });
  });
  it("rejects an invalid heartbeat idempotency identifier", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");

    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: " ",
        authorization: gatewayAuthorizationFor(grant),
      }),
    ).rejects.toMatchObject({
      code: "ROLE_NOT_ALLOWED",
      safeMessage: expect.any(String),
    });
    expect(harness.state.receipts).toHaveLength(0);
  });

  it("extends an active lease to five minutes after a heartbeat", async () => {
    const { gateway, request, setNow, state } = createGatewayClaimHarness();
    const grant = await gateway.claim(request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    setNow("2026-08-20T18:01:00.000Z");

    const result = await gateway.perform({
      kind: "HEARTBEAT",
      idempotencyKey: "heartbeat-1",
      authorization: {
        token: grant.token,
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        lifecycleGeneration: grant.envelope.lifecycleGeneration,
        role: grant.envelope.role,
        workerId: grant.envelope.workerId,
        invocationId: grant.envelope.invocationId,
        supplyContractHash: grant.envelope.supplyContractHash,
      },
    });

    expect(result).toMatchObject({
      kind: "HEARTBEAT_ACCEPTED",
      heartbeatAt: "2026-08-20T18:01:00.000Z",
      leaseExpiresAt: "2026-08-20T18:06:00.000Z",
    });
    expect(state.workerHealth[0]).toMatchObject({
      workerId: request.workerId,
      role: request.role,
      heartbeatAt: new Date("2026-08-20T18:01:00.000Z"),
      leaseExpiresAt: new Date("2026-08-20T18:06:00.000Z"),
    });
  });
  it("normalizes database authorization loss across claim and active operations", async () => {
    const claimHarness = createGatewayClaimHarness();
    claimHarness.setNextTransactionError({ code: "P1000" });
    await expect(claimHarness.gateway.claim(claimHarness.request)).rejects.toMatchObject({
      code: "GATEWAY_ADMISSION_HALTED",
      safeMessage: "Gateway admission is halted because gateway database authorization failed.",
      isRetryable: false,
    });

    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    harness.setNextTransactionError({
      code: "P2010",
      meta: { driverAdapterError: { originalCode: "42501" } },
    });
    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: "heartbeat-auth-revoked",
        authorization: gatewayAuthorizationFor(grant),
      }),
    ).rejects.toMatchObject({
      code: "GATEWAY_ADMISSION_HALTED",
      safeMessage: "Gateway admission is halted because gateway database authorization failed.",
      isRetryable: false,
    });

    harness.setNextTransactionError({ cause: { code: "P1010" } });
    await expect(
      harness.gateway.perform(
        failureOperationFor(grant, "failure-auth-revoked", "PROCESS_CRASH"),
      ),
    ).rejects.toMatchObject({
      code: "GATEWAY_ADMISSION_HALTED",
      safeMessage: "Gateway admission is halted because gateway database authorization failed.",
      isRetryable: false,
    });
  });
  it("replays concurrent identical heartbeats after an operation receipt race", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    let releaseReads = (): void => undefined;
    let markBothReads = (): void => undefined;
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const bothReads = new Promise<void>((resolve) => {
      markBothReads = resolve;
    });
    harness.setOperationReceiptReadBarrier({
      remaining: 2,
      entered: markBothReads,
      released: readsReleased,
    });
    const operation = {
      kind: "HEARTBEAT" as const,
      idempotencyKey: "heartbeat-receipt-race",
      authorization: gatewayAuthorizationFor(grant),
    };
    harness.setOperationReceiptCreateConflict(
      {
        code: "P2002",
        meta: { target: ["claimId", "idempotencyKey"] },
      },
      true,
    );

    const pending = [
      harness.gateway.perform(operation),
      harness.gateway.perform(operation),
    ];
    await bothReads;
    releaseReads();
    const results = await Promise.all(pending);

    expect(results[0]).toEqual(results[1]);
    expect(harness.state.receipts).toHaveLength(1);
    expect(harness.state.receipts[0]).toMatchObject({
      claimId: grant.envelope.claimId,
      idempotencyKey: operation.idempotencyKey,
      status: "SUCCEEDED",
    });
    await expect(harness.gateway.perform(operation)).resolves.toEqual(
      results[0],
    );
  });

  it("does not replay a heartbeat for an unrelated receipt unique violation", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "HEARTBEAT" as const,
      idempotencyKey: "heartbeat-unrelated-unique",
      authorization: gatewayAuthorizationFor(grant),
    };
    harness.setOperationReceiptCreateConflict({
      code: "P2002",
      meta: { target: ["externalOperationKey"] },
    });
    const transactionCallsBefore = harness.state.transactionCalls;

    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      isRetryable: false,
    });
    expect(harness.state.transactionCalls).toBe(transactionCallsBefore + 1);
    expect(harness.state.receipts).toHaveLength(0);
  });

  it("reads only a claim-manifest artifact after integrity verification", async () => {
    const { gateway, request, artifactBytes } = createGatewayClaimHarness();
    const grant = await gateway.claim(request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");

    const result = await gateway.perform({
      kind: "READ_ARTIFACT",
      idempotencyKey: "artifact-read-1",
      authorization: gatewayAuthorizationFor(grant),
      evidenceRef: "evidence-1",
    });

    expect(result).toMatchObject({
      kind: "ARTIFACT_READ",
      evidenceRef: "evidence-1",
      sha256: createHash("sha256").update(artifactBytes).digest("hex"),
      mimeType: "text/markdown",
      byteSize: artifactBytes.byteLength,
    });
    expect(Buffer.from(result.bytes)).toEqual(artifactBytes);
  });

  it("replays immutable artifact provenance without deriving URLs from a later read", async () => {
    const harness = createGatewayClaimHarness();
    harness.setArtifactRead({
      bytes: new Uint8Array(harness.artifactBytes),
      mimeType: "text/markdown",
      byteSize: harness.artifactBytes.byteLength,
      sourceUrl: "https://evidence.example.test/requested",
      finalUrl: "https://evidence.example.test/final",
    });
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "READ_ARTIFACT" as const,
      idempotencyKey: "artifact-provenance-replay",
      authorization: gatewayAuthorizationFor(grant),
      evidenceRef: "evidence-1",
    };
    const initial = await harness.gateway.perform(operation);
    expect(initial).toMatchObject({
      sourceUrl: "https://evidence.example.test/requested",
      finalUrl: "https://evidence.example.test/final",
    });
    harness.setArtifactRead({
      bytes: new Uint8Array(harness.artifactBytes),
      mimeType: "text/markdown",
      byteSize: harness.artifactBytes.byteLength,
      sourceUrl: "https://attacker.example.test/parsed-link",
      finalUrl: "https://attacker.example.test/parsed-final",
    });
    await expect(harness.gateway.perform(operation)).resolves.toMatchObject({
      sourceUrl: "https://evidence.example.test/requested",
      finalUrl: "https://evidence.example.test/final",
    });
    const receipt = harness.state.receipts.find(
      (candidate) => candidate.idempotencyKey === operation.idempotencyKey,
    );
    if (!receipt || typeof receipt.responseJson !== "object" || receipt.responseJson === null) {
      throw new Error("Expected persisted artifact read metadata.");
    }
    delete (receipt.responseJson as Record<string, unknown>).sourceUrl;
    delete (receipt.responseJson as Record<string, unknown>).finalUrl;
    await expect(harness.gateway.perform(operation)).resolves.toMatchObject({
      sourceUrl: null,
      finalUrl: null,
    });
    (receipt.responseJson as Record<string, unknown>).sourceUrl = { token: "private-value" };
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "ARTIFACT_INTEGRITY_FAILED",
      safeMessage: "The stored artifact source URL is invalid.",
    });
  });

  it("routes a generic legacy sport contract gap without evidence to bounded correction", async () => {
    const harness = createGatewayClaimHarness();
    const fixture = configureLegacySportProducerScenario(harness);
    const grant = await harness.gateway.claim(fixture.request);
    if (!grant) throw new Error("Expected one legacy sport producer claim.");
    const outcome = await harness.gateway.perform({
      kind: "SUBMIT_RESULT",
      idempotencyKey: "legacy-sport-empty-gap",
      authorization: gatewayAuthorizationFor(grant),
      result: legacySportContractGapResultFor(grant),
    });
    expect(outcome).toMatchObject({
      kind: "SCHEMA_CORRECTION_REQUIRED",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["payload", "sportEvidence"],
          message: expect.stringContaining("structured sportEvidence"),
        }),
        expect.objectContaining({
          path: ["evidenceRefs"],
          message: expect.stringContaining("every sport citation"),
        }),
      ]),
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "ACTIVE",
      schemaCorrectionCount: 1,
      terminalReceiptId: null,
    });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "CLAIMED",
      terminalReceiptId: null,
      resultJson: null,
    });
  });
  it("routes empty legacy sport assessments through bounded correction before terminal selection", async () => {
    const harness = createGatewayClaimHarness();
    const fixture = configureLegacySportProducerScenario(harness);
    const grant = await harness.gateway.claim(fixture.request);
    if (!grant) throw new Error("Expected one legacy sport producer claim.");
    const emptySportEvidence: AffiliateAgentSportEvidence = {
      ...fixture.sportEvidence,
      sportDeterminations: [],
    };
    const submit = (idempotencyKey: string) =>
      harness.gateway.perform({
        kind: "SUBMIT_RESULT" as const,
        idempotencyKey,
        authorization: gatewayAuthorizationFor(grant),
        result: legacySportContractGapResultFor(
          grant,
          emptySportEvidence,
          {
            evidenceRefs: [],
            reasonCodes: ["CONTRACT_REQUIREMENT_MISSING"],
          },
        ),
      });

    const first = await submit("legacy-sport-empty-assessments-1");
    expect(first).toMatchObject({
      kind: "SCHEMA_CORRECTION_REQUIRED",
      submissionNumber: 1,
      remainingSubmissions: 2,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["payload", "sportEvidence"],
        }),
      ]),
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "ACTIVE",
      schemaCorrectionCount: 1,
      terminalReceiptId: null,
    });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "CLAIMED",
      terminalReceiptId: null,
      resultJson: null,
    });
    expect(
      harness.state.receipts.filter(
        (receipt) =>
          receipt.operationKind === "TERMINAL_EFFECT"
          && receipt.status === "SUCCEEDED",
      ),
    ).toHaveLength(0);

    const second = await submit("legacy-sport-empty-assessments-2");
    expect(second).toMatchObject({
      kind: "SCHEMA_CORRECTION_REQUIRED",
      submissionNumber: 2,
      remainingSubmissions: 1,
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "ACTIVE",
      schemaCorrectionCount: 2,
    });
    expect(harness.state.jobs[0]?.status).toBe("CLAIMED");

    const exhausted = await submit("legacy-sport-empty-assessments-3");
    expect(exhausted).toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "SCHEMA_CORRECTIONS_EXHAUSTED",
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "FAILED",
      schemaCorrectionCount: 3,
      terminalReceiptId: exhausted.receiptId,
    });
    expect(harness.state.receipts.find((receipt) => receipt.id === exhausted.receiptId))
      .toMatchObject({ responseJson: { kind: "INVOCATION_FAILED" } });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RETRY_WAIT",
      terminalReceiptId: exhausted.receiptId,
      resultJson: null,
    });
    expect(
      harness.state.receipts.filter(
        (receipt) =>
          receipt.operationKind === "TERMINAL_EFFECT"
          && receipt.status === "SUCCEEDED",
      ),
    ).toHaveLength(0);
  });


  it("routes wrong-owned sport evidence and catalog drift to bounded correction", async () => {
    for (const failure of ["WRONG_OWNED_EVIDENCE", "CATALOG_DRIFT"] as const) {
      const harness = createGatewayClaimHarness();
      const fixture = configureLegacySportProducerScenario(harness);
      const grant = await harness.gateway.claim(fixture.request);
      if (!grant) throw new Error("Expected one legacy sport producer claim.");
      if (failure === "WRONG_OWNED_EVIDENCE") {
        harness.setArtifactRead({
          bytes: new Uint8Array(harness.artifactBytes),
          mimeType: "text/markdown",
          byteSize: harness.artifactBytes.byteLength,
          sourceUrl: "https://evidence.example.test/page",
          finalUrl: "https://evidence.example.test/page",
          runId: "different-evidence-run",
          intakeId: "legacy-intake",
        });
      } else {
        fixture.setCurrentCatalog(buildAffiliateSportsCatalogSnapshot(
          [{ id: "sport-indoor-soccer", name: "Indoor Soccer" }],
          "2026-08-20T18:00:00.000Z",
        ));
      }
      const outcome = await harness.gateway.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: `legacy-sport-${failure.toLowerCase()}`,
        authorization: gatewayAuthorizationFor(grant),
        result: legacySportContractGapResultFor(
          grant,
          fixture.sportEvidence,
        ),
      });
      expect(outcome).toMatchObject({
        kind: "SCHEMA_CORRECTION_REQUIRED",
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: ["payload", "sportEvidence"],
          }),
        ]),
      });
      expect(harness.state.claims[0]).toMatchObject({
        status: "ACTIVE",
        schemaCorrectionCount: 1,
      });
      expect(harness.state.jobs[0]).toMatchObject({
        status: "CLAIMED",
        terminalReceiptId: null,
      });
    }
  });

  it("accepts a non-sport legacy contract gap after a resolved sport assessment", async () => {
    const harness = createGatewayClaimHarness();
    const fixture = configureLegacySportProducerScenario(harness);
    const grant = await harness.gateway.claim(fixture.request);
    if (!grant) throw new Error("Expected one legacy sport producer claim.");
    await expect(
      harness.gateway.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: "legacy-sport-resolved-gap",
        authorization: gatewayAuthorizationFor(grant),
        result: legacySportContractGapResultFor(
          grant,
          fixture.sportEvidence,
          { reasonCodes: ["CONTRACT_REQUIREMENT_MISSING"] },
        ),
      }),
    ).resolves.toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "CONTRACT_GAP",
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "COMPLETED",
      terminalReceiptId: expect.any(String),
    });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "COMPLETED",
      terminalDisposition: "CONTRACT_GAP",
    });
  });

  it("executes the one closed Coverage Planner command", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");

    const result = await harness.gateway.perform({
      kind: "EXECUTE_COMMAND",
      idempotencyKey: "command-1",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "RUN_DISCOVERY_QUERY",
        data: {
          strategyRef: "evidence-1",
          queryRef: "evidence-1",
        },
      },
    });

    expect(result).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "RUN_DISCOVERY_QUERY",
      safeOutput: {
        evidenceRef: "discovery-evidence-1",
        artifactId: "discovery-file-1",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        mimeType: "text/markdown",
        byteSize: harness.artifactBytes.byteLength,
      },
    });
    expect(result.responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(harness.state.externalStartKeys).toHaveLength(1);
    expect(harness.state.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceRef: "discovery-evidence-1",
          evidenceKind: "PROVIDER_RESULT",
          fileId: "discovery-file-1",
        }),
      ]),
    );
  });
  it("rejects an external command when its adapter is not installed", async () => {
    const harness = createGatewayClaimHarness({
      disableExternalAdapters: true,
    });
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");

    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: "command-without-adapter",
        authorization: gatewayAuthorizationFor(grant),
        command: {
          type: "RUN_DISCOVERY_QUERY",
          data: {
            strategyRef: "evidence-1",
            queryRef: "evidence-1",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "COMMAND_NOT_PERMITTED",
      safeMessage: "The external command has no installed adapter.",
    });
    expect(harness.state.externalStartKeys).toHaveLength(0);
  });

  it("reserves, starts, finalizes, and exactly replays one external capture command", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "capture-command-1",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };

    const completed = await harness.gateway.perform(operation);

    expect(completed).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "CAPTURE_CLAIM_URL",
      safeOutput: {
        evidenceRef: "capture-evidence-1",
        artifactId: "capture-file-1",
      },
    });
    expect(completed).toMatchObject({
      safeOutput: {
        captureMetadata: {
          provider: "SCRAPINGDOG",
          request: captureRecordSummaryFixture({
            method: "GET",
            profile: "capture-profile",
          }),
          response: captureRecordSummaryFixture({
            status: "ok",
            requestId: "provider-request-1",
          }),
          requestedUrl: "https://capture.example.test/requested",
          finalUrl: "https://capture.example.test/final",
          providerStatusCode: 207,
          targetStatusCode: 200,
          renderMode: "JAVASCRIPT",
          elapsedMs: 321,
          estimatedCredits: 5,
          warnings: ["used provider fallback"],
          providerJobId: "provider-job-1",
          attempts: [{
            renderMode: "STATIC",
            providerStatusCode: 200,
            elapsedMs: 123,
            estimatedCredits: 1,
            accepted: false,
            quality: { textLength: 0 },
            error: "insufficient content",
          }],
          providerArtifacts: {
            markdown: captureTextSummaryFixture("# Capture"),
            links: captureSetSummaryFixture([
              "https://capture.example.test/final",
            ]),
            images: captureSetSummaryFixture([
              "https://capture.example.test/image.png",
            ]),
            branding: { name: "Capture Example" },
            screenshotUrl: "https://capture.example.test/screenshot.png",
            metadata: { source: "test" },
          },
        },
      },
    });
    expect(await harness.gateway.perform(operation)).toEqual(completed);
    expect(harness.state.externalStartKeys).toHaveLength(1);
    expect(harness.state.externalRecoverKeys).toHaveLength(0);
    expect(harness.state.receipts).toContainEqual(
      expect.objectContaining({
        id: completed.receiptId,
        status: "SUCCEEDED",
        externalOperationKey: harness.state.externalStartKeys[0],
      }),
    );
    expect(harness.state.artifacts).toContainEqual(
      expect.objectContaining({
        evidenceRef: "capture-evidence-1",
        fileId: "capture-file-1",
      }),
    );
  });

  it("recovers a lost external capture response by durable operation key without starting twice", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("LOSE_RESPONSE");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "capture-response-loss-1",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };

    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      isRetryable: true,
      receiptId: expect.any(String),
    });
    harness.setNow("2026-08-20T18:01:00.000Z");
    const recovered = await harness.gateway.perform(operation);

    expect(recovered).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "CAPTURE_CLAIM_URL",
    });
    expect(recovered).toMatchObject({
      safeOutput: {
        captureMetadata: {
          provider: "SCRAPINGDOG",
          requestedUrl: "https://capture.example.test/requested",
          finalUrl: "https://capture.example.test/final",
          providerStatusCode: 207,
          targetStatusCode: 200,
          renderMode: "JAVASCRIPT",
          elapsedMs: 321,
          estimatedCredits: 5,
          warnings: ["used provider fallback"],
          providerJobId: "provider-job-1",
          attempts: [{
            renderMode: "STATIC",
            providerStatusCode: 200,
            elapsedMs: 123,
            estimatedCredits: 1,
            accepted: false,
            quality: { textLength: 0 },
            error: "insufficient content",
          }],
          providerArtifacts: {
            metadata: { source: "test" },
          },
        },
      },
    });
    expect(harness.state.externalStartKeys).toHaveLength(1);

    expect(harness.state.externalRecoverKeys).toEqual(
      harness.state.externalStartKeys,
    );
    expect(await harness.gateway.perform(operation)).toEqual(recovered);
    expect(harness.state.externalStartKeys).toHaveLength(1);
  });
  it("blocks a new external effect while another effect is pending", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("LOSE_RESPONSE");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "capture-pending-1",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };

    const firstFailure = harness.gateway.perform(operation);
    await expect(firstFailure).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });

    await expect(
      harness.gateway.perform({
        ...operation,
        idempotencyKey: "capture-pending-2",
      }),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      isRetryable: false,
      receiptId: expect.any(String),
    });
    expect(harness.state.externalStartKeys).toHaveLength(1);
  });
  it("finalizes a pending external effect before recording invocation failure", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("LOSE_RESPONSE");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "capture-before-failure-1",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };

    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });
    const reconciled = await harness.reconciler.reconcileInvocation(
      failureOperationFor(
        grant,
        "capture-before-failure-failure",
        "PROCESS_CRASH",
      ),
    );

    expect(reconciled).toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "PROCESS_CRASH",
      invocationFailureCount: 1,
      nextAttemptAt: "2026-08-20T18:05:00.000Z",
      isPipelineBlocked: false,
    });
    expect(harness.state.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commandName: "CAPTURE_CLAIM_URL",
          status: "SUCCEEDED",
        }),
        expect.objectContaining({
          operationKind: "RECORD_FAILURE",
          status: "SUCCEEDED",
        }),
      ]),
    );
    expect(harness.state.claims[0]).toMatchObject({ status: "FAILED" });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 1,
      nextAttemptAt: new Date("2026-08-20T18:05:00.000Z"),
    });
    expect(harness.state.externalRecoverKeys).toHaveLength(1);
  });

  it("carries a successful lifecycle effect to the retry claim", async () => {
    const harness = createGatewayClaimHarness({
      persistLifecycleTransition: true,
    });
    harness.setLifecycleResponseLoss(true);
    const humanManifestPreimage = {
      schemaVersion: 1 as const,
      entries: ["HUMAN_DECISION", "REVIEWER_EVIDENCE"].map((kind, index) => ({
        evidenceRef: `lifecycle-carry-evidence-${index + 1}`,
        kind,
        artifactId: `lifecycle-carry-file-${index + 1}`,
        sha256:
          kind === "HUMAN_DECISION"
            ? claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash
            : String(index + 4).repeat(64),
        mimeType: "application/json",
        byteSize: 10,
        retention: "INDEFINITE" as const,
      })),
    };
    Object.assign(harness.state.jobs[0], {
      queue: "AFFILIATE_HUMAN_DIRECTED",
      lane: "HUMAN_EXECUTION",
      role: "HUMAN_DIRECTED_EXECUTOR",
      subjectType: "HUMAN_DIRECTED_EXECUTOR",
      subjectId: "case-1",
      subjectJson: claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject,
      evidenceManifestJson: {
        ...humanManifestPreimage,
        hash: hashAffiliateAgentValue(humanManifestPreimage),
      },
      supplySourceId: "supply-source-1",
      parentClaimId: "reviewer-claim-1",
      expectedLifecycleGeneration: 7,
    });
    seedReviewerHistory(harness, humanManifestPreimage.entries[1]);
    const firstRequest: AffiliateAgentClaimRequest = {
      ...harness.request,
      idempotencyKey: "lifecycle-carry-claim-1",
      roleCredential: "human-role-credential",
      role: "HUMAN_DIRECTED_EXECUTOR",
      workerId: "lifecycle-carry-worker-1",
      invocationId: "lifecycle-carry-invocation-1",
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: "lifecycle-carry-workspace-1",
        workerId: "lifecycle-carry-worker-1",
        invocationId: "lifecycle-carry-invocation-1",
      },
    };
    const firstGrant = await harness.gateway.claim(firstRequest);
    if (!firstGrant) throw new Error("Expected the first lifecycle claim.");
    const command = {
      type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND" as const,
      data: {
        caseId: "case-1",
        decisionHash:
          claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash,
        lifecycleCommandRef: "lifecycle-command-1",
      },
    };
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: "lifecycle-carry-command-1",
        authorization: gatewayAuthorizationFor(firstGrant),
        command,
      }),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });
    await expect(
      harness.reconciler.reconcileInvocation(
        failureOperationFor(
          firstGrant,
          "lifecycle-carry-failure",
          "PROCESS_CRASH",
        ),
      ),
    ).resolves.toMatchObject({
      kind: "INVOCATION_FAILED",
      nextAttemptAt: "2026-08-20T18:05:00.000Z",
      isPipelineBlocked: false,
    });
    expect(harness.state.lifecycleCalls).toHaveLength(1);

    harness.setNow("2026-08-20T18:05:00.000Z");
    const secondRequest: AffiliateAgentClaimRequest = {
      ...firstRequest,
      idempotencyKey: "lifecycle-carry-claim-2",
      workerId: "lifecycle-carry-worker-2",
      invocationId: "lifecycle-carry-invocation-2",
      workspaceAttestation: {
        ...firstRequest.workspaceAttestation,
        workspaceId: "lifecycle-carry-workspace-2",
        workerId: "lifecycle-carry-worker-2",
        invocationId: "lifecycle-carry-invocation-2",
        expiresAt: "2026-08-20T18:25:00.000Z",
      },
    };
    const secondGrant = await harness.gateway.claim(secondRequest);
    expect(secondGrant?.envelope.lifecycleGeneration).toBe(8);
    expect(harness.state.jobs[0]).toMatchObject({
      expectedLifecycleGeneration: 8,
    });
    const adoptedCommandResult = await harness.gateway.perform({
      kind: "EXECUTE_COMMAND",
      idempotencyKey: "lifecycle-carry-command-2",
      authorization: gatewayAuthorizationFor(secondGrant),
      command,
    });
    expect(adoptedCommandResult).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
    });
    const adoptedTerminal = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "lifecycle-carry-terminal-2",
      authorization: gatewayAuthorizationFor(secondGrant),
      result: {
        schemaVersion: 1 as const,
        jobId: secondGrant.envelope.jobId,
        claimId: secondGrant.envelope.claimId,
        claimGeneration: secondGrant.envelope.claimGeneration,
        lifecycleGeneration: secondGrant.envelope.lifecycleGeneration,
        deploymentContractVersion: secondGrant.envelope.deploymentContractVersion,
        deploymentContractHash: secondGrant.envelope.deploymentContractHash,
        supplyContractVersion: secondGrant.envelope.supplyContractVersion,
        supplyContractHash: secondGrant.envelope.supplyContractHash,
        roleContractVersion: secondGrant.envelope.roleContractVersion,
        roleContractHash: secondGrant.envelope.roleContractHash,
        promptTemplateVersion: secondGrant.envelope.promptTemplateVersion,
        promptTemplateHash: secondGrant.envelope.promptTemplateHash,
        workerId: secondGrant.envelope.workerId,
        role: "HUMAN_DIRECTED_EXECUTOR" as const,
        invocationId: secondGrant.envelope.invocationId,
        disposition: "LIFECYCLE_COMMAND_EXECUTED" as const,
        reasonCodes: ["EVIDENCE_VERIFIED"] as const,
        evidenceRefs: [
          "lifecycle-carry-evidence-1",
          "lifecycle-carry-evidence-2",
        ] as const,
        summary: "The adopted lifecycle command completed.",
        payload: {
          caseId: "case-1",
          lifecycleCommandRef: "lifecycle-command-1",
          receiptId: adoptedCommandResult.receiptId,
        },
      },
    };
    await expect(harness.gateway.perform(adoptedTerminal)).resolves.toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "LIFECYCLE_COMMAND_EXECUTED",
    });
    expect(harness.state.lifecycleCalls).toHaveLength(1);
    expect(
      harness.state.receipts.filter(
        (receipt) =>
          receipt.commandName === "EXECUTE_RECORDED_LIFECYCLE_COMMAND" &&
          receipt.status === "SUCCEEDED",
      ),
    ).toHaveLength(2);
  });

  it("recovers and finalizes a pending capture receipt after gateway restart", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("LOSE_RESPONSE");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "capture-restart-recovery-1",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      receiptId: expect.any(String),
    });
    harness.setNow("2026-08-20T18:01:00.000Z");

    const restarted = harness.recreateGateway();
    expect(await restarted.reconcile({ limit: 10 })).toEqual({
      examinedClaims: 0,
      expiredClaims: 0,
      examinedReceipts: 1,
      recoveredReceipts: 1,
      completedReceipts: 1,
      unresolvedReceipts: 0,
      isAdmissionHalted: false,
    });
    expect(harness.state.externalStartKeys).toHaveLength(1);
    expect(harness.state.externalRecoverKeys).toEqual(
      harness.state.externalStartKeys,
    );
    expect(await restarted.perform(operation)).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "CAPTURE_CLAIM_URL",
    });
    expect(harness.state.externalStartKeys).toHaveLength(1);
    expect(harness.state.receipts[0]).toMatchObject({ status: "SUCCEEDED" });
    expect(await restarted.reconcile({ limit: 10 })).toEqual({
      examinedClaims: 0,
      expiredClaims: 0,
      examinedReceipts: 0,
      recoveredReceipts: 0,
      completedReceipts: 0,
      unresolvedReceipts: 0,
      isAdmissionHalted: false,
    });
  });

  it("wraps storage failures from external finalization in one safe gateway error", async () => {
    const harness = createGatewayClaimHarness();
    harness.setArtifactReadError(
      new Error("unsafe storage implementation detail"),
    );
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");

    await expect(
      harness.gateway.perform(
        captureOperationFor(grant, "capture-storage-failure"),
      ),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: expect.not.stringContaining("unsafe storage"),
      receiptId: expect.any(String),
    });
  });

  it("rejects unbounded external and lifecycle safe output", async () => {
    const externalHarness = createGatewayClaimHarness();
    const oversizedMimeType = "x".repeat(201);
    externalHarness.setExternalMimeType(oversizedMimeType);
    externalHarness.setArtifactRead({
      bytes: new Uint8Array(externalHarness.artifactBytes),
      mimeType: oversizedMimeType,
      byteSize: externalHarness.artifactBytes.byteLength,
      sourceUrl: "https://evidence.example.test/page",
      finalUrl: "https://evidence.example.test/page",
    });
    const externalGrant = await externalHarness.gateway.claim(
      externalHarness.request,
    );
    if (!externalGrant) throw new Error("Expected one Coverage Planner claim.");
    await expect(
      externalHarness.gateway.perform(
        captureOperationFor(externalGrant, "capture-unbounded-output"),
      ),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: expect.any(String),
    });

    const lifecycleHarness = createGatewayClaimHarness();
    lifecycleHarness.setLifecycleSafeOutputDetails("x".repeat(16 * 1024 + 1));
    const humanManifestPreimage = {
      schemaVersion: 1 as const,
      entries: ["HUMAN_DECISION", "REVIEWER_EVIDENCE"].map((kind, index) => ({
        evidenceRef: `bounded-lifecycle-evidence-${index + 1}`,
        kind,
        artifactId: `bounded-lifecycle-file-${index + 1}`,
        sha256:
          kind === "HUMAN_DECISION"
            ? claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash
            : String(index + 4).repeat(64),
        mimeType: "application/json",
        byteSize: 10,
        retention: "INDEFINITE" as const,
      })),
    };
    Object.assign(lifecycleHarness.state.jobs[0], {
      queue: "AFFILIATE_HUMAN_DIRECTED",
      lane: "HUMAN_EXECUTION",
      role: "HUMAN_DIRECTED_EXECUTOR",
      subjectType: "HUMAN_DIRECTED_EXECUTOR",
      subjectId: "case-1",
      subjectJson: claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject,
      evidenceManifestJson: {
        ...humanManifestPreimage,
        hash: hashAffiliateAgentValue(humanManifestPreimage),
      },
      supplySourceId: "supply-source-1",
      parentClaimId: "reviewer-claim-1",
      expectedLifecycleGeneration: 7,
    });
    seedReviewerHistory(lifecycleHarness, humanManifestPreimage.entries[1]);
    const lifecycleRequest: AffiliateAgentClaimRequest = {
      ...lifecycleHarness.request,
      idempotencyKey: "bounded-lifecycle-claim",
      roleCredential: "human-role-credential",
      role: "HUMAN_DIRECTED_EXECUTOR",
      workerId: "bounded-lifecycle-worker",
      invocationId: "bounded-lifecycle-invocation",
      workspaceAttestation: {
        ...lifecycleHarness.request.workspaceAttestation,
        workspaceId: "bounded-lifecycle-workspace",
        workerId: "bounded-lifecycle-worker",
        invocationId: "bounded-lifecycle-invocation",
      },
    };
    const lifecycleGrant =
      await lifecycleHarness.gateway.claim(lifecycleRequest);
    if (!lifecycleGrant) {
      throw new Error("Expected one Human-directed Executor claim.");
    }
    await expect(
      lifecycleHarness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: "bounded-lifecycle-command",
        authorization: gatewayAuthorizationFor(lifecycleGrant),
        command: {
          type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
          data: {
            caseId: "case-1",
            decisionHash:
              claimRoleFields.HUMAN_DIRECTED_EXECUTOR.subject.decisionHash,
            lifecycleCommandRef: "lifecycle-command-1",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: expect.any(String),
    });
  });

  it("retries external finalization conflicts without repeating the external effect", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    harness.setTransactionConflictsAfterArtifactRead(2);

    await expect(
      harness.gateway.perform(
        captureOperationFor(grant, "capture-finalization-conflicts"),
      ),
    ).resolves.toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      commandType: "CAPTURE_CLAIM_URL",
    });
    expect(harness.state.externalStartKeys).toHaveLength(1);
  });
  it("maps exhausted serializable effect conflicts to a safe gateway error", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    harness.setTransactionConflictsAfterArtifactRead(3);

    await expect(
      harness.gateway.perform(
        captureOperationFor(grant, "capture-finalization-exhausted"),
      ),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: "The external command could not be finalized.",
      isRetryable: true,
      receiptId: expect.any(String),
    });
    expect(harness.state.externalStartKeys).toHaveLength(1);
  });

  it("re-reads a concurrent artifact and rejects a conflicting file or hash", async () => {
    const exactHarness = createGatewayClaimHarness();
    const exactGrant = await exactHarness.gateway.claim(exactHarness.request);
    if (!exactGrant) throw new Error("Expected one Coverage Planner claim.");
    exactHarness.setConcurrentArtifact({
      claimId: exactGrant.envelope.claimId,
      claimGeneration: exactGrant.envelope.claimGeneration,
      evidenceRef: "capture-evidence-1",
      evidenceKind: "CAPTURED_PAGE",
      sourceArtifactId: "capture-file-1",
      fileId: "capture-file-1",
      contentHash: createHash("sha256")
        .update(exactHarness.artifactBytes)
        .digest("hex"),
      mimeType: "text/markdown",
      byteSize: exactHarness.artifactBytes.byteLength,
      creatingClaimId: exactGrant.envelope.claimId,
    });
    await expect(
      exactHarness.gateway.perform(
        captureOperationFor(exactGrant, "capture-concurrent-exact"),
      ),
    ).resolves.toMatchObject({ kind: "COMMAND_SUCCEEDED" });

    const conflictHarness = createGatewayClaimHarness();
    const conflictGrant = await conflictHarness.gateway.claim(
      conflictHarness.request,
    );
    if (!conflictGrant) throw new Error("Expected one Coverage Planner claim.");
    conflictHarness.setConcurrentArtifact({
      claimId: conflictGrant.envelope.claimId,
      claimGeneration: conflictGrant.envelope.claimGeneration,
      evidenceRef: "capture-evidence-1",
      evidenceKind: "CAPTURED_PAGE",
      sourceArtifactId: "conflicting-file",
      fileId: "conflicting-file",
      contentHash: "f".repeat(64),
      mimeType: "text/markdown",
      byteSize: conflictHarness.artifactBytes.byteLength,
    });
    await expect(
      conflictHarness.gateway.perform(
        captureOperationFor(conflictGrant, "capture-concurrent-conflict"),
      ),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      safeMessage: expect.any(String),
    });
  });

  it("halts recovery when a concurrent artifact conflicts with recovered output", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("LOSE_RESPONSE");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    await expect(
      harness.gateway.perform(
        captureOperationFor(grant, "capture-recovery-conflict"),
      ),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      receiptId: expect.any(String),
    });
    harness.setConcurrentArtifact({
      claimId: grant.envelope.claimId,
      evidenceRef: "capture-evidence-1",
      fileId: "conflicting-recovery-file",
      contentHash: "e".repeat(64),
    });
    harness.setNow("2026-08-20T18:01:00.000Z");

    await expect(
      harness.recreateGateway().reconcile({ limit: 10 }),
    ).resolves.toMatchObject({
      completedReceipts: 0,
      unresolvedReceipts: 1,
      isAdmissionHalted: true,
    });
  });

  it("requires nested Coverage Planner evidence to be a result evidence subset", async () => {
    for (const [index, resultCase] of [
      {
        disposition: "FAILED_CAPTURE_EVIDENCE_RECORDED" as const,
        payload: { captureEvidenceRef: "evidence-1" },
        evidenceRefs: [],
      },
      {
        disposition: "SOURCE_EXCLUSION_PROPOSED" as const,
        payload: {
          supplySourceId: "supply-source-1",
          policyEvidenceRefs: ["evidence-1"],
        },
        evidenceRefs: [],
      },
      {
        disposition: "FAILED_CAPTURE_EVIDENCE_RECORDED" as const,
        payload: { captureEvidenceRef: "unscoped-evidence" },
        evidenceRefs: ["unscoped-evidence"],
      },
    ].entries()) {
      const harness = createGatewayClaimHarness();
      const grant = await harness.gateway.claim(harness.request);
      if (!grant) throw new Error("Expected one Coverage Planner claim.");
      await expect(
        harness.gateway.perform({
          kind: "SUBMIT_RESULT",
          idempotencyKey: `nested-evidence-${index}`,
          authorization: gatewayAuthorizationFor(grant),
          result: {
            ...coverageTerminalResultFor(grant),
            disposition: resultCase.disposition,
            evidenceRefs: resultCase.evidenceRefs,
            payload: resultCase.payload,
          },
        }),
      ).rejects.toMatchObject({
        code: "EVIDENCE_REFERENCE_NOT_PERMITTED",
        safeMessage: expect.any(String),
      });
    }
  });

  it("returns no artifact bytes when stored or adapter integrity checks fail", async () => {
    const verifiedBytes = Buffer.from("verified gateway artifact", "utf8");
    const invalidReads: readonly AffiliateAgentArtifactRead[] = [
      {
        bytes: new Uint8Array(Buffer.from("tampered artifact", "utf8")),
        mimeType: "text/markdown",
        byteSize: Buffer.byteLength("tampered artifact"),
        sourceUrl: "https://evidence.example.test/page",
        finalUrl: "https://evidence.example.test/page",
      },
      {
        bytes: new Uint8Array(verifiedBytes),
        mimeType: "text/html",
        byteSize: verifiedBytes.byteLength,
        sourceUrl: "https://evidence.example.test/page",
        finalUrl: "https://evidence.example.test/page",
      },
      {
        bytes: new Uint8Array(verifiedBytes),
        mimeType: "text/markdown",
        byteSize: verifiedBytes.byteLength + 1,
        sourceUrl: "https://evidence.example.test/page",
        finalUrl: "https://evidence.example.test/page",
      },
      {
        bytes: new Uint8Array(verifiedBytes),
        mimeType: "text/markdown",
        byteSize: verifiedBytes.byteLength,
        sourceUrl: "file:///private/evidence",
        finalUrl: "https://evidence.example.test/page",
      },
    ];

    for (const [index, invalidRead] of invalidReads.entries()) {
      const harness = createGatewayClaimHarness();
      harness.setArtifactRead(invalidRead);
      const grant = await harness.gateway.claim(harness.request);
      if (!grant) throw new Error("Expected one Coverage Planner claim.");

      await expect(
        harness.gateway.perform({
          kind: "READ_ARTIFACT",
          idempotencyKey: `invalid-artifact-${index}`,
          authorization: gatewayAuthorizationFor(grant),
          evidenceRef: "evidence-1",
        }),
      ).rejects.toMatchObject({
        code: "ARTIFACT_INTEGRITY_FAILED",
        safeMessage: expect.any(String),
      });
    }

    const oversizedHarness = createGatewayClaimHarness();
    const oversizedGrant = await oversizedHarness.gateway.claim(
      oversizedHarness.request,
    );
    if (!oversizedGrant)
      throw new Error("Expected one Coverage Planner claim.");
    const storedArtifact = oversizedHarness.state.artifacts[0];
    if (!storedArtifact) throw new Error("Expected one stored claim artifact.");
    storedArtifact.byteSize = 8 * 1024 * 1024 + 1;
    await expect(
      oversizedHarness.gateway.perform({
        kind: "READ_ARTIFACT",
        idempotencyKey: "oversized-artifact",
        authorization: gatewayAuthorizationFor(oversizedGrant),
        evidenceRef: "evidence-1",
      }),
    ).rejects.toMatchObject({
      code: "ARTIFACT_INTEGRITY_FAILED",
      safeMessage: expect.any(String),
    });
  });
  it("marks an unknown capture effect for reconciliation and halts only its lane", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("UNKNOWN");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "capture-unknown-1",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
      receiptId: expect.any(String),
    });
    harness.setNow("2026-08-20T18:01:00.000Z");

    const first = await harness.gateway.reconcile({ limit: 10 });

    expect(first).toEqual({
      examinedClaims: 0,
      expiredClaims: 0,
      examinedReceipts: 1,
      recoveredReceipts: 0,
      completedReceipts: 0,
      unresolvedReceipts: 1,
      isAdmissionHalted: false,
    });
    expect(harness.state.receipts[0]).toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "PARTIAL_COMMAND_UNRESOLVED",
      reconcileAfter: null,
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
    });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
    });

    const haltedLaneJob = {
      ...harness.state.jobs[0],
      id: "gateway-job-halted-lane",
      dedupeKey: "coverage:halted-lane",
      status: "QUEUED",
      claimGeneration: 0,
      activeClaimId: null,
      nextAttemptAt: new Date("2026-08-20T18:00:00.000Z"),
      eventSequence: 0,
    };
    const openLaneJob = {
      ...haltedLaneJob,
      id: "gateway-job-open-lane",
      dedupeKey: "mapping:open-lane",
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: "mapping-job-open-lane",
      subjectJson: {
        ...claimRoleFields.MAPPING_PRODUCER.subject,
        mappingJobId: "mapping-job-open-lane",
      },
      supplySourceId: "supply-source-1",
      expectedLifecycleGeneration: 7,
    };
    harness.state.jobs.push(haltedLaneJob, openLaneJob);
    const nextRequest: AffiliateAgentClaimRequest = {
      ...harness.request,
      idempotencyKey: "claim-open-lane",
      roleCredential: "mapping-role-credential",
      role: "MAPPING_PRODUCER",
      workerId: "mapping-worker-open-lane",
      invocationId: "mapping-invocation-open-lane",
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: "mapping-workspace-open-lane",
        workerId: "mapping-worker-open-lane",
        invocationId: "mapping-invocation-open-lane",
        issuedAt: "2026-08-20T18:00:00.000Z",
        expiresAt: "2026-08-20T18:25:00.000Z",
      },
    };
    const nextGrant = await harness.gateway.claim(nextRequest);
    expect(nextGrant?.envelope.lane).toBe("MAPPING_PRODUCTION");
    expect(haltedLaneJob.status).toBe("QUEUED");

    expect(await harness.gateway.reconcile({ limit: 10 })).toEqual({
      examinedClaims: 0,
      expiredClaims: 0,
      examinedReceipts: 0,
      recoveredReceipts: 0,
      completedReceipts: 0,
      unresolvedReceipts: 0,
      isAdmissionHalted: false,
    });
  });

  it("fails closed on an impossible recovered receipt, claim, and job state", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("LOSE_RESPONSE");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "impossible-capture-receipt",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });
    if (!harness.state.receipts[0])
      throw new Error("Expected one pending receipt.");
    harness.state.receipts[0].claimGeneration = 99;
    harness.setNow("2026-08-20T18:01:00.000Z");

    expect(await harness.gateway.reconcile({ limit: 10 })).toMatchObject({
      examinedReceipts: 1,
      recoveredReceipts: 1,
      unresolvedReceipts: 1,
      isAdmissionHalted: true,
    });
    expect(harness.state.receipts[0]).toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "GATEWAY_ADMISSION_HALTED",
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
      safeFailureCode: "GATEWAY_ADMISSION_HALTED",
    });
    expect(harness.state.jobs[0]?.status).toBe("RECONCILIATION_REQUIRED");

    harness.state.jobs.push({
      ...harness.state.jobs[0],
      id: "gateway-job-after-impossible-state",
      role: "MAPPING_PRODUCER",
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      status: "QUEUED",
      activeClaimId: null,
      claimGeneration: 0,
      eventSequence: 0,
    });
    await expect(
      harness.gateway.claim({
        ...harness.request,
        idempotencyKey: "claim-after-impossible-state",
        roleCredential: "mapping-role-credential",
        role: "MAPPING_PRODUCER",
        workerId: "mapping-worker-after-impossible",
        invocationId: "mapping-invocation-after-impossible",
        workspaceAttestation: {
          ...harness.request.workspaceAttestation,
          workspaceId: "mapping-workspace-after-impossible",
          workerId: "mapping-worker-after-impossible",
          invocationId: "mapping-invocation-after-impossible",
          expiresAt: "2026-08-20T18:25:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ code: "GATEWAY_ADMISSION_HALTED" });
  });
  it("propagates an impossible invocation reconciliation as a global admission halt", async () => {
    const harness = createGatewayClaimHarness();
    harness.setExternalCaptureMode("LOSE_RESPONSE");
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "invocation-halt-capture",
      authorization: gatewayAuthorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "evidence-1",
          captureProfileRef: "evidence-1",
        },
      },
    };
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });
    const receipt = harness.state.receipts[0];
    if (!receipt) throw new Error("Expected one pending receipt.");
    receipt.claimGeneration = 99;
    harness.setNow("2026-08-20T18:01:00.000Z");

    await expect(
      harness.reconciler.reconcileInvocation(
        failureOperationFor(grant, "invocation-halt-failure", "PROCESS_CRASH"),
      ),
    ).rejects.toMatchObject({
      code: "GATEWAY_ADMISSION_HALTED",
      safeMessage: "Gateway admission is halted until an impossible receipt state is resolved.",
      isRetryable: false,
    });
    expect(receipt).toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "GATEWAY_ADMISSION_HALTED",
    });
  });

  it("reconciles each expired lease once through plus five, plus fifteen, then Pipeline Blocked", async () => {
    const harness = createGatewayClaimHarness();
    const requestForAttempt = (
      attempt: number,
      issuedAt: string,
      expiresAt: string,
    ): AffiliateAgentClaimRequest => ({
      ...harness.request,
      idempotencyKey: `reconcile-claim-${attempt}`,
      invocationId: `reconcile-invocation-${attempt}`,
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: `reconcile-workspace-${attempt}`,
        invocationId: `reconcile-invocation-${attempt}`,
        issuedAt,
        expiresAt,
      },
    });
    const firstGrant = await harness.gateway.claim(
      requestForAttempt(
        1,
        "2026-08-20T17:59:00.000Z",
        "2026-08-20T19:00:00.000Z",
      ),
    );
    if (!firstGrant) throw new Error("Expected the first claim.");
    harness.setNow("2026-08-20T18:05:00.000Z");
    harness.setNextTransactionConflicts(1);

    expect(await harness.gateway.reconcile({ limit: 10 })).toMatchObject({
      examinedClaims: 1,
      expiredClaims: 1,
    });
    const expiryReceipt = harness.state.receipts[0];
    expect(expiryReceipt).toMatchObject({
      idempotencyKey: `supervisor-expiry-${firstGrant.envelope.claimId}`,
      operationKind: "RECORD_FAILURE",
      status: "SUCCEEDED",
      responseJson: {
        kind: "INVOCATION_FAILED",
        failureCode: "TIMEOUT",
        invocationFailureCount: 1,
      },
    });
    if (!expiryReceipt) throw new Error("Expected the expiry failure receipt.");
    const reconciler = harness.reconciler;
    const changedExpiryRequest = failureOperationFor(
      firstGrant,
      expiryReceipt.idempotencyKey,
      "TIMEOUT",
      "2026-08-20T18:05:00.000Z",
    );
    await expect(
      reconciler.reconcileInvocation({
        ...changedExpiryRequest,
        failure: {
          ...changedExpiryRequest.failure,
          safeSummary: "A different timeout summary.",
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(
      reconciler.reconcileInvocation(
        failureOperationFor(
          firstGrant,
          `supervisor-failure-${firstGrant.envelope.claimId}`,
          "TIMEOUT",
          "2026-08-20T18:05:00.000Z",
        ),
      ),
    ).resolves.toEqual({
      kind: "INVOCATION_FAILED",
      failureCode: "TIMEOUT",
      invocationFailureCount: 1,
      nextAttemptAt: "2026-08-20T18:10:00.000Z",
      isPipelineBlocked: false,
    });
    expect(harness.state.receipts).toHaveLength(1);
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 1,
      nextAttemptAt: new Date("2026-08-20T18:10:00.000Z"),
    });
    expect(await harness.gateway.reconcile({ limit: 10 })).toMatchObject({
      examinedClaims: 0,
      expiredClaims: 0,
    });
    expect(harness.state.jobs[0]?.invocationFailureCount).toBe(1);

    harness.setNow("2026-08-20T18:10:00.000Z");
    expect(
      await harness.gateway.claim(
        requestForAttempt(
          2,
          "2026-08-20T18:09:00.000Z",
          "2026-08-20T19:00:00.000Z",
        ),
      ),
    ).not.toBeNull();
    harness.setNow("2026-08-20T18:15:00.000Z");
    await harness.gateway.reconcile({ limit: 10 });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 2,
      nextAttemptAt: new Date("2026-08-20T18:30:00.000Z"),
    });

    harness.setNow("2026-08-20T18:30:00.000Z");
    expect(
      await harness.gateway.claim(
        requestForAttempt(
          3,
          "2026-08-20T18:29:00.000Z",
          "2026-08-20T19:00:00.000Z",
        ),
      ),
    ).not.toBeNull();
    harness.setNow("2026-08-20T18:35:00.000Z");
    await harness.gateway.reconcile({ limit: 10 });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "PIPELINE_BLOCKED",
      invocationFailureCount: 3,
      nextAttemptAt: null,
      pipelineBlockedAt: new Date("2026-08-20T18:35:00.000Z"),
    });
    expect(await harness.gateway.reconcile({ limit: 10 })).toMatchObject({
      examinedClaims: 0,
      expiredClaims: 0,
    });
  });

  it("reconciles a hard deadline once when heartbeats extended the lease to that deadline", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const claim = harness.state.claims[0];
    if (!claim?.hardDeadlineAt)
      throw new Error("Expected one claim hard deadline.");
    claim.leaseExpiresAt = claim.hardDeadlineAt;
    harness.setNow("2026-08-20T18:20:00.000Z");

    expect(await harness.gateway.reconcile({ limit: 10 })).toMatchObject({
      examinedClaims: 1,
      expiredClaims: 1,
    });
    expect(claim).toMatchObject({
      status: "EXPIRED",
      safeFailureCode: "TIMEOUT",
      endedAt: new Date("2026-08-20T18:20:00.000Z"),
    });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 1,
      nextAttemptAt: new Date("2026-08-20T18:25:00.000Z"),
    });
    expect(await harness.gateway.reconcile({ limit: 10 })).toMatchObject({
      examinedClaims: 0,
      expiredClaims: 0,
    });
  });
  it("keeps retry eligibility after a successful lifecycle effect", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const claim = harness.state.claims[0];
    const job = harness.state.jobs[0];
    if (!claim || !job) throw new Error("Expected seeded claim and job.");

    claim.leaseExpiresAt = new Date("2026-08-20T18:20:00.000Z");
    claim.hardDeadlineAt = new Date("2026-08-20T18:20:00.000Z");
    harness.state.receipts.push({
      id: "lifecycle-effect-receipt",
      claimId: claim.id,
      jobId: claim.jobId,
      claimGeneration: claim.claimGeneration,
      status: "SUCCEEDED",
      operationKind: "EXECUTE_COMMAND",
      commandName: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
      startedAt: new Date("2026-08-20T18:00:00.000Z"),
    });
    harness.setNow("2026-08-20T18:20:00.000Z");

    await expect(
      harness.gateway.reconcile({ limit: 10 }),
    ).resolves.toMatchObject({
      examinedClaims: 1,
      expiredClaims: 1,
    });
    expect(job).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 1,
      nextAttemptAt: new Date("2026-08-20T18:25:00.000Z"),
    });
  });
  it("fills an expiry batch after deferring a lifecycle claim", async () => {
    const harness = createGatewayClaimHarness();
    const firstGrant = await harness.gateway.claim(harness.request);
    if (!firstGrant) throw new Error("Expected the first claim.");
    const firstClaim = harness.state.claims[0];
    const firstJob = harness.state.jobs[0];
    if (!firstClaim || !firstJob) {
      throw new Error("Expected the first claim and job.");
    }

    firstClaim.leaseExpiresAt = new Date("2026-08-20T18:05:00.000Z");
    firstClaim.hardDeadlineAt = new Date("2026-08-20T18:20:00.000Z");
    harness.state.receipts.push({
      id: "deferred-lifecycle-effect",
      claimId: firstClaim.id,
      jobId: firstClaim.jobId,
      claimGeneration: firstClaim.claimGeneration,
      status: "SUCCEEDED",
      operationKind: "EXECUTE_COMMAND",
      commandName: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
      startedAt: new Date("2026-08-20T18:00:00.000Z"),
    });
    harness.state.jobs.push({
      ...firstJob,
      id: "gateway-job-2",
      dedupeKey: "coverage:coverage-cell-2:assessment-cycle-1",
      subjectId: "coverage-cell-2",
      subjectJson: {
        type: "COVERAGE_PLANNER",
        coverageCellId: "coverage-cell-2",
        assessmentCycleId: "assessment-cycle-1",
      },
      status: "QUEUED",
      nextAttemptAt: new Date("2026-08-20T18:00:00.000Z"),
      claimGeneration: 0,
      activeClaimId: null,
      invocationFailureCount: 0,
      terminalReceiptId: null,
      eventSequence: 0,
    });

    const secondGrant = await harness.gateway.claim({
      ...harness.request,
      idempotencyKey: "claim-after-deferred-lifecycle",
      workerId: "coverage-worker-2",
      invocationId: "coverage-invocation-2",
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: "coverage-workspace-2",
        workerId: "coverage-worker-2",
        invocationId: "coverage-invocation-2",
        expiresAt: "2026-08-20T19:00:00.000Z",
      },
    });
    if (!secondGrant) throw new Error("Expected the second claim.");
    const secondClaim = harness.state.claims.find(
      (claim) => claim.id === secondGrant.envelope.claimId,
    );
    if (!secondClaim) throw new Error("Expected the second claim row.");
    secondClaim.leaseExpiresAt = new Date("2026-08-20T18:05:00.000Z");
    secondClaim.hardDeadlineAt = new Date("2026-08-20T18:25:00.000Z");
    harness.setNow("2026-08-20T18:05:00.000Z");

    await expect(
      harness.gateway.reconcile({ limit: 1 }),
    ).resolves.toMatchObject({
      examinedClaims: 1,
      expiredClaims: 1,
    });
    expect(firstClaim.status).toBe("ACTIVE");
    expect(secondClaim.status).toBe("EXPIRED");
  });
  it("defers expiry while an artifact read receipt is pending", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const claim = harness.state.claims[0];
    if (!claim) throw new Error("Expected the claim row.");
    claim.leaseExpiresAt = new Date("2026-08-20T18:05:00.000Z");
    claim.hardDeadlineAt = new Date("2026-08-20T18:20:00.000Z");
    harness.state.receipts.push({
      id: "pending-artifact-read",
      claimId: claim.id,
      jobId: claim.jobId,
      claimGeneration: claim.claimGeneration,
      status: "PENDING",
      operationKind: "READ_ARTIFACT",
      commandName: null,
      startedAt: new Date("2026-08-20T18:04:59.000Z"),
    });
    harness.setNow("2026-08-20T18:05:00.000Z");

    await expect(
      harness.gateway.reconcile({ limit: 10 }),
    ).resolves.toMatchObject({
      examinedClaims: 1,
      expiredClaims: 0,
    });
    expect(claim.status).toBe("ACTIVE");
  });

  it("replays exact nonterminal operations and rejects changed input", async () => {
    const heartbeatHarness = createGatewayClaimHarness();
    const heartbeatGrant = await heartbeatHarness.gateway.claim(
      heartbeatHarness.request,
    );
    if (!heartbeatGrant)
      throw new Error("Expected one Coverage Planner claim.");
    const heartbeat = {
      kind: "HEARTBEAT" as const,
      idempotencyKey: "heartbeat-replay",
      authorization: gatewayAuthorizationFor(heartbeatGrant),
    };
    const heartbeatAccepted = await heartbeatHarness.gateway.perform(heartbeat);
    expect(await heartbeatHarness.gateway.perform(heartbeat)).toEqual(
      heartbeatAccepted,
    );
    await expect(
      heartbeatHarness.gateway.perform({
        kind: "READ_ARTIFACT",
        idempotencyKey: heartbeat.idempotencyKey,
        authorization: heartbeat.authorization,
        evidenceRef: "evidence-1",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(heartbeatHarness.state.receipts).toHaveLength(1);

    const artifactHarness = createGatewayClaimHarness();
    const artifactGrant = await artifactHarness.gateway.claim(
      artifactHarness.request,
    );
    if (!artifactGrant) throw new Error("Expected one Coverage Planner claim.");
    const artifactRead = {
      kind: "READ_ARTIFACT" as const,
      idempotencyKey: "artifact-replay",
      authorization: gatewayAuthorizationFor(artifactGrant),
      evidenceRef: "evidence-1",
    };
    const artifactReturned =
      await artifactHarness.gateway.perform(artifactRead);
    expect(await artifactHarness.gateway.perform(artifactRead)).toEqual(
      artifactReturned,
    );
    await expect(
      artifactHarness.gateway.perform({
        ...artifactRead,
        evidenceRef: "different-evidence",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(artifactHarness.state.receipts).toHaveLength(1);
    artifactHarness.setNow("2026-08-20T18:05:00.000Z");
    await expect(
      artifactHarness.gateway.perform(artifactRead),
    ).rejects.toMatchObject({ code: "LEASE_EXPIRED" });

    const commandHarness = createGatewayClaimHarness();
    const commandGrant = await commandHarness.gateway.claim(
      commandHarness.request,
    );
    if (!commandGrant) throw new Error("Expected one Coverage Planner claim.");
    const command = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: "command-replay",
      authorization: gatewayAuthorizationFor(commandGrant),
      command: {
        type: "RUN_DISCOVERY_QUERY" as const,
        data: {
          strategyRef: "evidence-1",
          queryRef: "evidence-1",
        },
      },
    };
    const commandSucceeded = await commandHarness.gateway.perform(command);
    expect(await commandHarness.gateway.perform(command)).toEqual(
      commandSucceeded,
    );
    await expect(
      commandHarness.gateway.perform({
        ...command,
        command: {
          ...command.command,
          data: {
            ...command.command.data,
            queryRef: "different-evidence",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(commandHarness.state.receipts).toHaveLength(1);
  });

  it("authorizes a result submission before returning schema feedback", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");

    await expect(
      harness.gateway.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: "unauthorized-invalid-result",
        authorization: {
          ...gatewayAuthorizationFor(grant),
          token: `${grant.token}-invalid`,
        },
        result: { untrusted: true },
      }),
    ).rejects.toMatchObject({
      code: "TOKEN_INVALID",
      safeMessage: expect.any(String),
    });
    expect(harness.state.receipts).toHaveLength(0);
  });

  it("returns two deterministic schema corrections and fails the invocation on the third distinct invalid result", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const authorization = gatewayAuthorizationFor(grant);
    const firstOperation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "schema-correction-1",
      authorization,
      result: { schemaVersion: 1 },
    };

    const first = await harness.gateway.perform(firstOperation);
    expect(first).toEqual({
      kind: "SCHEMA_CORRECTION_REQUIRED",
      receiptId: expect.any(String),
      submissionNumber: 1,
      remainingSubmissions: 2,
      issues: [
        {
          path: [],
          code: "INVALID_VALUE",
          message: "The result does not match an allowed terminal schema.",
        },
      ],
      correctionPrompt:
        'Correct terminal result submission 1. Remaining submissions: 2.\n{"issues":[{"code":"INVALID_VALUE","message":"The result does not match an allowed terminal schema.","path":[]}]}',
    });
    expect(await harness.gateway.perform(firstOperation)).toEqual(first);
    expect(harness.state.claims[0]?.schemaCorrectionCount).toBe(1);

    const second = await harness.gateway.perform({
      ...firstOperation,
      idempotencyKey: "schema-correction-2",
      result: { schemaVersion: 1, role: "COVERAGE_PLANNER" },
    });
    expect(second).toMatchObject({
      kind: "SCHEMA_CORRECTION_REQUIRED",
      submissionNumber: 2,
      remainingSubmissions: 1,
    });

    const third = await harness.gateway.perform({
      ...firstOperation,
      idempotencyKey: "schema-correction-3",
      result: {
        schemaVersion: 1,
        role: "COVERAGE_PLANNER",
        jobId: grant.envelope.jobId,
      },
    });
    expect(third).toEqual({
      kind: "INVOCATION_FAILED",
      receiptId: expect.any(String),
      failureCode: "SCHEMA_CORRECTIONS_EXHAUSTED",
      invocationFailureCount: 1,
      nextAttemptAt: "2026-08-20T18:05:00.000Z",
      isPipelineBlocked: false,
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "FAILED",
      schemaCorrectionCount: 3,
      safeFailureCode: "SCHEMA_CORRECTIONS_EXHAUSTED",
    });
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RETRY_WAIT",
      activeClaimId: null,
      invocationFailureCount: 1,
      nextAttemptAt: new Date("2026-08-20T18:05:00.000Z"),
    });
    expect(harness.state.receipts).toHaveLength(3);
  });

  it("uses initial, plus five minutes, plus fifteen minutes, then blocks with no fourth retry", async () => {
    const harness = createGatewayClaimHarness();
    const requestForAttempt = (
      attempt: number,
      issuedAt: string,
      expiresAt: string,
    ): AffiliateAgentClaimRequest => ({
      ...harness.request,
      idempotencyKey: `retry-claim-${attempt}`,
      invocationId: `coverage-invocation-${attempt}`,
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: `coverage-workspace-${attempt}`,
        invocationId: `coverage-invocation-${attempt}`,
        issuedAt,
        expiresAt,
      },
    });
    const reconciler = harness.reconciler;
    const fail = async (
      grant: AffiliateAgentClaimGrant,
      failureNumber: number,
      occurredAt: string,
    ) =>
      reconciler.reconcileInvocation(
        failureOperationFor(
          grant,
          `retry-failure-${failureNumber}`,
          "PROCESS_CRASH",
          occurredAt,
        ),
      );

    const firstGrant = await harness.gateway.claim(harness.request);
    if (!firstGrant) throw new Error("Expected the initial claim.");
    expect(await fail(firstGrant, 1, "2026-08-20T18:00:00.000Z")).toMatchObject(
      {
        kind: "INVOCATION_FAILED",
        invocationFailureCount: 1,
        nextAttemptAt: "2026-08-20T18:05:00.000Z",
        isPipelineBlocked: false,
      },
    );

    harness.setNow("2026-08-20T18:04:59.999Z");
    const secondRequest = requestForAttempt(
      2,
      "2026-08-20T18:04:00.000Z",
      "2026-08-20T18:30:00.000Z",
    );
    expect(await harness.gateway.claim(secondRequest)).toBeNull();
    harness.setNow("2026-08-20T18:05:00.000Z");
    const secondGrant = await harness.gateway.claim(secondRequest);
    expect(secondGrant?.envelope.claimGeneration).toBe(2);
    expect(secondGrant?.envelope).toMatchObject({
      invocationId: "coverage-invocation-2",
      workspaceId: "coverage-workspace-2",
    });
    if (!secondGrant) throw new Error("Expected the second claim.");

    harness.setNow("2026-08-20T18:06:00.000Z");
    expect(
      await fail(secondGrant, 2, "2026-08-20T18:06:00.000Z"),
    ).toMatchObject({
      invocationFailureCount: 2,
      nextAttemptAt: "2026-08-20T18:21:00.000Z",
      isPipelineBlocked: false,
    });

    harness.setNow("2026-08-20T18:21:00.000Z");
    const thirdGrant = await harness.gateway.claim(
      requestForAttempt(
        3,
        "2026-08-20T18:20:00.000Z",
        "2026-08-20T19:00:00.000Z",
      ),
    );
    expect(thirdGrant?.envelope.claimGeneration).toBe(3);
    expect(thirdGrant?.envelope).toMatchObject({
      invocationId: "coverage-invocation-3",
      workspaceId: "coverage-workspace-3",
    });
    if (!thirdGrant) throw new Error("Expected the third claim.");

    harness.setNow("2026-08-20T18:22:00.000Z");
    expect(await fail(thirdGrant, 3, "2026-08-20T18:22:00.000Z")).toMatchObject(
      {
        invocationFailureCount: 3,
        nextAttemptAt: null,
        isPipelineBlocked: true,
      },
    );
    expect(harness.state.jobs[0]).toMatchObject({
      status: "PIPELINE_BLOCKED",
      nextAttemptAt: null,
      pipelineBlockedAt: new Date("2026-08-20T18:22:00.000Z"),
    });
    harness.setNow("2026-08-20T19:07:00.000Z");
    expect(
      await harness.gateway.claim(
        requestForAttempt(
          4,
          "2026-08-20T19:06:00.000Z",
          "2026-08-20T20:00:00.000Z",
        ),
      ),
    ).toBeNull();
  });

  it("delivers real reconciliation failures through the supervisor HTTP decoder", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected a claim for reconciliation.");
    const operation = failureOperationFor(grant, "http-reconcile-failure", "PROCESS_CRASH");
    const result = await harness.reconciler.reconcileInvocation(operation);
    const server = createHttpServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ result }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP test server.");
      const client = new AffiliateAgentHttpGateway(`http://127.0.0.1:${address.port}`, {
        roleCredential: "role-credential",
      });
      await expect(client.reconcileInvocation(operation)).resolves.toMatchObject({
        kind: "INVOCATION_FAILED",
        failureCode: "PROCESS_CRASH",
        invocationFailureCount: 1,
        isPipelineBlocked: false,
      });
      expect(harness.state.jobs[0].status).toBe("RETRY_WAIT");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("validates invocation reconciliation input before Prisma access", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const request = failureOperationFor(
      grant,
      "reconcile-input-validation",
      "PROCESS_CRASH",
    );
    const invalidInputs: readonly unknown[] = [
      {},
      {
        kind: "HEARTBEAT",
        idempotencyKey: "heartbeat-input",
        authorization: request.authorization,
      },
      { ...request, unexpected: true },
      { ...request, idempotencyKey: "" },
      {
        ...request,
        failure: { ...request.failure, claimId: "" },
      },
    ];
    const transactionCallsBefore = harness.state.transactionCalls;

    for (const invalidInput of invalidInputs) {
      await expect(
        harness.reconciler.reconcileInvocation(invalidInput as never),
      ).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
        safeMessage: "The invocation reconciliation request is invalid.",
        isRetryable: false,
      });
      expect(harness.state.transactionCalls).toBe(transactionCallsBefore);
    }

    const reconciled = await harness.reconciler.reconcileInvocation(request);
    expect(reconciled).toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "PROCESS_CRASH",
      invocationFailureCount: 1,
    });
  });
  it("best-effort reports alert delivery failure after durable intent", async () => {
    let alertWriterCalls = 0;
    const alertEventKeys: string[] = [];
    const operationalAlert: AffiliateOperationalAlertWriter = async (
      input: AffiliateOperationalAlertInput,
    ) => {
      alertWriterCalls += 1;
      alertEventKeys.push(input.eventKey);
      if (alertWriterCalls === 2) {
        throw new Error("simulated alert delivery failure");
      }
      return {
        alertId: `alert-${String(alertWriterCalls)}`,
        deliveries: [],
      };
    };
    const harness = createGatewayClaimHarness({ operationalAlert });
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const request = failureOperationFor(
      grant,
      "alert-delivery-failure",
      "PROCESS_CRASH",
    );

    await expect(harness.gateway.perform(request)).resolves.toMatchObject({
      kind: "INVOCATION_FAILED",
    });
    expect(harness.state.operationalAlerts).toHaveLength(1);
    expect(harness.state.operationalAlerts[0]?.eventKey).toBe(alertEventKeys[0]);

    await expect(harness.gateway.perform(request)).resolves.toMatchObject({
      kind: "INVOCATION_FAILED",
    });
    expect(alertWriterCalls).toBe(3);
    expect(harness.state.operationalAlerts).toHaveLength(1);
    expect(alertEventKeys).toEqual([
      alertEventKeys[0],
      alertEventKeys[0],
      alertEventKeys[0],
    ]);
  });
  it("halts when database authorization fails while reporting an invocation alert", async () => {
    const operationalAlert: AffiliateOperationalAlertWriter = async () => {
      throw {
        code: "P2010",
        meta: { originalCode: "42501" },
      };
    };
    const harness = createGatewayClaimHarness({ operationalAlert });
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const request = failureOperationFor(
      grant,
      "alert-auth-revoked",
      "PROCESS_CRASH",
    );

    await expect(harness.gateway.perform(request)).rejects.toMatchObject({
      code: "GATEWAY_ADMISSION_HALTED",
      safeMessage: "Gateway admission is halted because gateway database authorization failed.",
      isRetryable: false,
    });
  });
  it("reports supervisor-recorded failures and replays without duplicate intent", async () => {
    let alertWriterCalls = 0;
    const alertEventKeys: string[] = [];
    const operationalAlert: AffiliateOperationalAlertWriter = async (
      input: AffiliateOperationalAlertInput,
    ) => {
      alertWriterCalls += 1;
      alertEventKeys.push(input.eventKey);
      return {
        alertId: `alert-${String(alertWriterCalls)}`,
        deliveries: [],
      };
    };
    const harness = createGatewayClaimHarness({ operationalAlert });
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const request = failureOperationFor(
      grant,
      "supervisor-alert-replay",
      "PROCESS_CRASH",
    );

    await expect(
      harness.reconciler.reconcileInvocation(request),
    ).resolves.toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "PROCESS_CRASH",
    });
    expect(alertWriterCalls).toBe(2);
    expect(harness.state.operationalAlerts).toHaveLength(1);

    await expect(
      harness.reconciler.reconcileInvocation(request),
    ).resolves.toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "PROCESS_CRASH",
    });
    expect(alertWriterCalls).toBe(3);
    expect(harness.state.operationalAlerts).toHaveLength(1);
    expect(alertEventKeys).toEqual([
      alertEventKeys[0],
      alertEventKeys[0],
      alertEventKeys[0],
    ]);
  });



  it("reconciles the five supervisor-reportable invocation failure codes", async () => {
    const failureCodes = [
      "MALFORMED_OUTPUT",
      "STALE_GENERATION",
      "PROCESS_CRASH",
      "TIMEOUT",
      "TERMINAL_SUBMISSION_FAILURE",
    ] as const;

    for (const code of failureCodes) {
      const harness = createGatewayClaimHarness();
      const grant = await harness.gateway.claim(harness.request);
      if (!grant) throw new Error("Expected one Coverage Planner claim.");
      const reconciler = harness.reconciler;
      const request = failureOperationFor(
        grant,
        `reconcile-failure-${code}`,
        code,
      );

      const failed = await reconciler.reconcileInvocation(request);
      expect(failed).toMatchObject({
        kind: "INVOCATION_FAILED",
        failureCode: code,
        invocationFailureCount: 1,
      });
      expect(await reconciler.reconcileInvocation(request)).toEqual(failed);
      expect(harness.state.jobs[0]?.invocationFailureCount).toBe(1);
      expect(harness.state.receipts).toHaveLength(1);
    }
  });

  it("reconciles one exact trusted claim once and rejects changed input", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const reconciler = harness.reconciler;
    const request = failureOperationFor(
      grant,
      "reconcile-changed-input",
      "STALE_GENERATION",
    );

    await expect(
      reconciler.reconcileInvocation({
        ...request,
        authorization: {
          ...request.authorization,
          claimId: "missing-claim",
        },
      }),
    ).rejects.toMatchObject({ code: "CLAIM_NOT_FOUND" });

    const failed = await reconciler.reconcileInvocation(request);
    expect(failed).toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "STALE_GENERATION",
      invocationFailureCount: 1,
      nextAttemptAt: "2026-08-20T18:05:00.000Z",
      isPipelineBlocked: false,
    });
    await expect(
      reconciler.reconcileInvocation({
        ...request,
        failure: {
          ...request.failure,
          code: "PROCESS_CRASH",
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await reconciler.reconcileInvocation(request)).toEqual(failed);
    expect(harness.state.jobs[0]).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 1,
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "FAILED",
      safeFailureCode: "STALE_GENERATION",
    });
    expect(harness.state.receipts).toHaveLength(1);
  });
  it("records trusted timeout after lease expiry", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const reconciler = harness.reconciler;
    harness.setNow("2026-08-20T18:05:00.000Z");

    await expect(
      harness.gateway.perform(
        failureOperationFor(
          grant,
          "public-expired-lease",
          "TIMEOUT",
          "2026-08-20T18:05:00.000Z",
        ),
      ),
    ).rejects.toMatchObject({ code: "LEASE_EXPIRED" });

    const failed = await reconciler.reconcileInvocation(
      failureOperationFor(
        grant,
        "trusted-expired-lease",
        "TIMEOUT",
        "2026-08-20T18:05:00.000Z",
      ),
    );
    expect(failed).toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "TIMEOUT",
      invocationFailureCount: 1,
      isPipelineBlocked: false,
    });
    expect(harness.state.claims[0]).toMatchObject({
      status: "FAILED",
      safeFailureCode: "TIMEOUT",
    });
  });

  it("replays a trusted timeout receipt after hard deadline and rejects new effects", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const reconciler = harness.reconciler;
    harness.setNow("2026-08-20T18:20:00.001Z");
    const trustedTimeoutOperation = failureOperationFor(
      grant,
      "trusted-expired-token",
      "TIMEOUT",
      "2026-08-20T18:20:00.001Z",
    );

    await expect(
      harness.gateway.perform(
        failureOperationFor(
          grant,
          "public-expired-token",
          "TIMEOUT",
          "2026-08-20T18:20:00.001Z",
        ),
      ),
    ).rejects.toMatchObject({ code: "HARD_DEADLINE_EXCEEDED" });

    const failed = await reconciler.reconcileInvocation(trustedTimeoutOperation);
    expect(failed).toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "TIMEOUT",
      invocationFailureCount: 1,
      isPipelineBlocked: false,
    });
    await expect(
      reconciler.reconcileInvocation(trustedTimeoutOperation),
    ).resolves.toEqual(failed);
    await expect(
      harness.gateway.perform(captureOperationFor(grant, "late-new-effect")),
    ).rejects.toMatchObject({ code: "HARD_DEADLINE_EXCEEDED" });
  });

  it("records trusted stale-generation failure after lifecycle generation changes", async () => {
    const harness = createGatewayClaimHarness();
    Object.assign(harness.state.jobs[0], {
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: "mapping-job-trusted-failure",
      subjectJson: {
        ...claimRoleFields.MAPPING_PRODUCER.subject,
        mappingJobId: "mapping-job-trusted-failure",
      },
      supplySourceId: "supply-source-1",
      expectedLifecycleGeneration: 7,
    });
    const grant = await harness.gateway.claim({
      ...harness.request,
      idempotencyKey: "mapping-trusted-failure-claim",
      roleCredential: "mapping-role-credential",
      role: "MAPPING_PRODUCER",
      workerId: "mapping-trusted-failure-worker",
      invocationId: "mapping-trusted-failure-invocation",
      workspaceAttestation: {
        ...harness.request.workspaceAttestation,
        workspaceId: "mapping-trusted-failure-workspace",
        workerId: "mapping-trusted-failure-worker",
        invocationId: "mapping-trusted-failure-invocation",
      },
    });
    if (!grant) throw new Error("Expected one Mapping Producer claim.");
    const reconciler = harness.reconciler;
    harness.setLifecycleGeneration(8);

    await expect(
      reconciler.reconcileInvocation(
        failureOperationFor(
          grant,
          "trusted-stale-generation",
          "STALE_GENERATION",
        ),
      ),
    ).resolves.toMatchObject({
      kind: "INVOCATION_FAILED",
      failureCode: "STALE_GENERATION",
      invocationFailureCount: 1,
      isPipelineBlocked: false,
    });
  });

  it("accepts one terminal Coverage Planner result and invalidates the token", async () => {
    const { gateway, reconciler, request, state } = createGatewayClaimHarness();
    const grant = await gateway.claim(request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const authorization = gatewayAuthorizationFor(grant);

    const result = await gateway.perform({
      kind: "SUBMIT_RESULT",
      idempotencyKey: "terminal-result-1",
      authorization,
      result: {
        schemaVersion: 1,
        jobId: grant.envelope.jobId,
        claimId: grant.envelope.claimId,
        claimGeneration: grant.envelope.claimGeneration,
        lifecycleGeneration: grant.envelope.lifecycleGeneration,
        deploymentContractVersion: grant.envelope.deploymentContractVersion,
        deploymentContractHash: grant.envelope.deploymentContractHash,
        supplyContractVersion: grant.envelope.supplyContractVersion,
        supplyContractHash: grant.envelope.supplyContractHash,
        roleContractVersion: grant.envelope.roleContractVersion,
        roleContractHash: grant.envelope.roleContractHash,
        promptTemplateVersion: grant.envelope.promptTemplateVersion,
        promptTemplateHash: grant.envelope.promptTemplateHash,
        workerId: grant.envelope.workerId,
        invocationId: grant.envelope.invocationId,
        role: "COVERAGE_PLANNER",
        disposition: "NO_ACTION",
        reasonCodes: ["NO_QUALIFIED_ACTION"],
        evidenceRefs: ["evidence-1"],
        summary: "No qualified action remains for this coverage cell.",
        payload: { basis: "NO_QUALIFIED_ACTION" },
      },
    });

    expect(result).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "NO_ACTION",
      completedAt: "2026-08-20T18:00:00.000Z",
    });
    await expect(
      reconciler.reconcileInvocation(
        failureOperationFor(
          grant,
          "terminal-reconcile-failure",
          "TERMINAL_SUBMISSION_FAILURE",
        ),
      ),
    ).resolves.toEqual({ kind: "TERMINAL_ACCEPTED" });
    expect(state.jobs[0]?.invocationFailureCount).toBe(0);
    expect(state.jobs[0]?.status).toBe("COMPLETED");
    const deniedAfterTerminal: readonly AffiliateAgentClaimOperation["kind"][] =
      ["HEARTBEAT", "READ_ARTIFACT", "EXECUTE_COMMAND", "SUBMIT_RESULT"];
    for (const operationKind of deniedAfterTerminal) {
      await expect(
        gateway.perform(
          gatewayOperationFor(operationKind, grant, authorization),
        ),
      ).rejects.toMatchObject({
        code: "TOKEN_INVALIDATED",
        safeMessage: expect.any(String),
      });
    }
  });
  it("does not accept a terminal result while an external effect is pending", async () => {
    const harness = createGatewayClaimHarness();
    const grant = await harness.gateway.claim(harness.request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    harness.setExternalCaptureMode("LOSE_RESPONSE");

    await expect(
      harness.gateway.perform(
        captureOperationFor(grant, "terminal-pending-capture"),
      ),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });

    const terminalOperation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "terminal-pending-result",
      authorization: gatewayAuthorizationFor(grant),
      result: coverageTerminalResultFor(grant),
    };
    await expect(
      harness.gateway.perform(terminalOperation),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });
    expect(harness.state.claims[0]).toMatchObject({ status: "ACTIVE" });
    expect(harness.state.jobs[0]).toMatchObject({ status: "CLAIMED" });

    harness.setNow("2026-08-20T18:05:00.000Z");
    await expect(
      harness.gateway.perform(terminalOperation),
    ).rejects.toMatchObject({
      code: "LEASE_EXPIRED",
    });
    expect(harness.state.claims[0]).toMatchObject({ status: "ACTIVE" });
    expect(harness.state.jobs[0]).toMatchObject({ status: "CLAIMED" });
    expect(harness.state.externalRecoverKeys).toHaveLength(0);
  });

  it("replays only the identical terminal result after token invalidation", async () => {
    const { gateway, request, state } = createGatewayClaimHarness();
    const grant = await gateway.claim(request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const operation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: "terminal-replay-1",
      authorization: gatewayAuthorizationFor(grant),
      result: coverageTerminalResultFor(grant),
    };

    const accepted = await gateway.perform(operation);
    const replayedResult = await gateway.perform(operation);

    expect(replayedResult).toEqual(accepted);
    expect(state.receipts).toHaveLength(1);
    expect(
      state.events.filter(
        (event) => event.eventType === "CLAIM_TERMINAL_RESULT_ACCEPTED",
      ),
    ).toHaveLength(1);
    await expect(
      gateway.perform({
        ...operation,
        result: {
          ...operation.result,
          summary: "Changed terminal input under the same operation key.",
        },
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      safeMessage: expect.any(String),
    });
  });

  it("denies command and artifact references outside the claim manifest", async () => {
    const { gateway, request } = createGatewayClaimHarness();
    const grant = await gateway.claim(request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");
    const authorization = gatewayAuthorizationFor(grant);

    await expect(
      gateway.perform({
        kind: "READ_ARTIFACT",
        idempotencyKey: "artifact-outside-manifest",
        authorization,
        evidenceRef: "not-in-manifest",
      }),
    ).rejects.toMatchObject({
      code: "ARTIFACT_NOT_PERMITTED",
      safeMessage: expect.any(String),
    });
    await expect(
      gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: "command-outside-manifest",
        authorization,
        command: {
          type: "RUN_DISCOVERY_QUERY",
          data: {
            strategyRef: "evidence-1",
            queryRef: "not-in-manifest",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "COMMAND_NOT_PERMITTED",
      safeMessage: expect.any(String),
    });
  });

  it("rejects every wrong or stale authorization field for every operation", async () => {
    const operationKinds: readonly AffiliateAgentClaimOperation["kind"][] = [
      "HEARTBEAT",
      "READ_ARTIFACT",
      "EXECUTE_COMMAND",
      "SUBMIT_RESULT",
    ];
    const scopeCases: readonly {
      name: string;
      expectedCode: string;
      apply: (
        harness: GatewayClaimHarness,
        authorization: AffiliateAgentClaimAuthorization,
      ) => AffiliateAgentClaimAuthorization;
    }[] = [
      {
        name: "claim",
        expectedCode: "CLAIM_NOT_FOUND",
        apply: (_harness, authorization) => ({
          ...authorization,
          claimId: "wrong-claim",
        }),
      },
      {
        name: "role",
        expectedCode: "ROLE_NOT_ALLOWED",
        apply: (_harness, authorization) => ({
          ...authorization,
          role: "MAPPING_PRODUCER",
        }),
      },
      {
        name: "worker",
        expectedCode: "WORKER_MISMATCH",
        apply: (_harness, authorization) => ({
          ...authorization,
          workerId: "wrong-worker",
        }),
      },
      {
        name: "invocation",
        expectedCode: "INVOCATION_MISMATCH",
        apply: (_harness, authorization) => ({
          ...authorization,
          invocationId: "wrong-invocation",
        }),
      },
      {
        name: "job",
        expectedCode: "JOB_MISMATCH",
        apply: (_harness, authorization) => ({
          ...authorization,
          jobId: "wrong-job",
        }),
      },
      {
        name: "claim generation",
        expectedCode: "CLAIM_GENERATION_STALE",
        apply: (_harness, authorization) => ({
          ...authorization,
          claimGeneration: authorization.claimGeneration + 1,
        }),
      },
      {
        name: "lifecycle generation",
        expectedCode: "LIFECYCLE_GENERATION_STALE",
        apply: (_harness, authorization) => ({
          ...authorization,
          lifecycleGeneration: 1,
        }),
      },
      {
        name: "token",
        expectedCode: "TOKEN_INVALID",
        apply: (_harness, authorization) => ({
          ...authorization,
          token: `${authorization.token}-changed`,
        }),
      },
      {
        name: "authorization Supply Contract",
        expectedCode: "SUPPLY_CONTRACT_STALE",
        apply: (_harness, authorization) => ({
          ...authorization,
          supplyContractHash: "f".repeat(64),
        }),
      },
      {
        name: "lease",
        expectedCode: "LEASE_EXPIRED",
        apply: (harness, authorization) => {
          harness.setNow("2026-08-20T18:05:00.000Z");
          return authorization;
        },
      },
      {
        name: "token expiry",
        expectedCode: "TOKEN_EXPIRED",
        apply: (harness, authorization) => {
          harness.setNow("2026-08-20T18:20:00.000Z");
          return authorization;
        },
      },
      {
        name: "hard deadline",
        expectedCode: "HARD_DEADLINE_EXCEEDED",
        apply: (harness, authorization) => {
          harness.setNow("2026-08-20T18:20:01.000Z");
          return authorization;
        },
      },
      {
        name: "active Supply Contract",
        expectedCode: "SUPPLY_CONTRACT_STALE",
        apply: (harness, authorization) => {
          harness.setActiveBundle(supplyContractStaleBundleFixture);
          return authorization;
        },
      },
      {
        name: "active deployment contract",
        expectedCode: "DEPLOYMENT_CONTRACT_STALE",
        apply: (harness, authorization) => {
          harness.setActiveBundle(unsupportedDeploymentBundleFixture);
          return authorization;
        },
      },
    ];

    for (const operationKind of operationKinds) {
      for (const scopeCase of scopeCases) {
        const harness = createGatewayClaimHarness();
        const grant = await harness.gateway.claim(harness.request);
        if (!grant) throw new Error("Expected one Coverage Planner claim.");
        const authorization = scopeCase.apply(
          harness,
          gatewayAuthorizationFor(grant),
        );

        await expect(
          harness.gateway.perform(
            gatewayOperationFor(operationKind, grant, authorization),
          ),
        ).rejects.toMatchObject({
          code: scopeCase.expectedCode,
          safeMessage: expect.any(String),
        });
      }
    }
  });
});
