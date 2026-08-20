/** @jest-environment node */
import { createHash } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";

import {
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
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
} from "../agentGatewayContracts";
import {
  AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
  AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
  AFFILIATE_AGENT_LEASE_SECONDS,
  type AffiliateAgentClaimAuthorization,
  type AffiliateAgentClaimGrant,
  type AffiliateAgentClaimOperation,
  type AffiliateAgentClaimRequest,
  type AffiliateAgentGateway,
  AFFILIATE_AGENT_MAX_INVOCATION_ATTEMPTS,
  AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS,
  affiliateAgentRetryDelaySeconds,
} from "../agentGateway";
import {
  createProductionAffiliateAgentGatewayDependencies,
  type AffiliateAgentArtifactRead,
} from "../agentGatewayAdapters";
import { createPrismaAffiliateAgentGateway } from "../prismaAgentGateway";

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
      hash: "277dd86e998a419d93a1b4fe7045b90754979a73202e0e39f3600f71edd56d76",
      payload: {
        requiredEvidenceKinds: ["EXPECTED_CANDIDATE", "PAGE_MARKDOWN"],
        requiresDeterministicValidation: true,
      },
    },
    {
      schemaVersion: 1,
      name: "LIFECYCLE_EVIDENCE",
      version: 1,
      hash: "db8e8c028ef8876ad00d5a7dea9ddbf89fc014c1991a7c690b2b21745db26d29",
      payload: {
        requiredEvidenceKinds: ["DURABLE_SOURCE_EVIDENCE", "VALIDATION_OUTPUT"],
        requiresIndependentReview: true,
      },
    },
  ],
  hash: "fb7d336037f5dafbe4bfd37d4b21e369b12da6b328051744fe3fe28d8c9608c0",
} as const;

const deploymentContractFixture = {
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
    freshWorkspacePerClaim: true,
    processCommand: ["codex", "exec", "--ephemeral"],
    nestedGoal: false,
    claimLoop: false,
    contextReuse: false,
    executionClass: "PRODUCTION_CODEX",
  },
  hash: "3f12c0702667a7a32cd88a9465cf541a249fc463aadc1aa6c63b42051798d5ae",
};

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
    version: 2,
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
    executionClass: "PRODUCTION_CODEX",
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
    payload: { committedPackageHash: "b".repeat(64) },
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
    roleContractVersion: claim.roleContractVersion,
    roleContractHash: claim.roleContractHash,
    supplyContractHash: claim.supplyContractHash,
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

  it("parses independently hashed Supply Contract components", () => {
    const parsed = affiliateAgentSupplyContractSchema.parse(
      supplyContractFixture,
    );

    expect(parsed.components.map((component) => component.hash)).toEqual([
      "f13a898bc1710efb2b926ed38da263437d44afcd0039dc684065142d3d451608",
      "0aa04cef3f1f03afb8359f17cece3fca596f5cae8fd4d95ca1ecdbd70378ca38",
      "0de164fdcc9a4b0cb731cc2dd659706c79d657f6d0512b25ca0027e3c3139c03",
      "69ff8f25c91412b3327058ed9daefee5b52cdfc784efd8294704c30adcb20340",
      "277dd86e998a419d93a1b4fe7045b90754979a73202e0e39f3600f71edd56d76",
      "db8e8c028ef8876ad00d5a7dea9ddbf89fc014c1991a7c690b2b21745db26d29",
    ]);
    expect(parsed.hash).toBe(
      "fb7d336037f5dafbe4bfd37d4b21e369b12da6b328051744fe3fe28d8c9608c0",
    );
  });

  it("parses all four role fixtures", () => {
    const parsed = Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).map(
      (contract) => affiliateAgentRoleContractSchema.parse(contract),
    );

    expect(
      parsed.map((contract) => ({
        role: contract.role,
        hash: contract.hash,
        promptTemplateHash: contract.promptTemplateHash,
        inputSchemaId: contract.inputSchemaId,
        permittedCommands: contract.permittedCommands,
        terminalDispositions: contract.terminalDispositions,
        executionClass: contract.executionClass,
        diagnosticRetentionDays:
          contract.retention.failedInvocationDiagnosticsDays,
        destroysWorkspace: contract.retention.workspace,
      })),
    ).toEqual([
      {
        role: "COVERAGE_PLANNER",
        hash: "381db9c28c2870b8a0a530110bd5931fd18a3675707fac4641d2e1fdaab70d72",
        promptTemplateHash:
          "9c0e6f32b1e935fd14c8872b8ea1ddad96cd25a7498858c4b810835cd38149fb",
        inputSchemaId: "affiliate-agent/coverage-planner-subject@1",
        permittedCommands: [
          "CAPTURE_CLAIM_URL",
          "RUN_DISCOVERY_QUERY",
          "SUBMIT_TERMINAL_RESULT",
        ],
        terminalDispositions: [
          "CAMPAIGN_PROPOSED",
          "CONTRACT_GAP",
          "FAILED_CAPTURE_EVIDENCE_RECORDED",
          "NO_ACTION",
          "SOURCE_EXCLUSION_PROPOSED",
        ],
        executionClass: "PRODUCTION_CODEX",
        diagnosticRetentionDays: 14,
        destroysWorkspace: "DESTROY_AFTER_TERMINAL_OR_FAILURE",
      },
      {
        role: "MAPPING_PRODUCER",
        hash: "1d1a18a7b25a084413dda5200409e236a2da465d2fa8ac062ec094d835c8cb05",
        promptTemplateHash:
          "8523e9a1d0377a45e5a4de03f5724ed4b07294f3b1ad623a55d064e6b872b45f",
        inputSchemaId: "affiliate-agent/mapping-producer-subject@1",
        permittedCommands: [
          "CAPTURE_CLAIM_URL",
          "COMMIT_DECLARATIVE_PACKAGE",
          "SUBMIT_TERMINAL_RESULT",
          "VALIDATE_DECLARATIVE_PACKAGE",
        ],
        terminalDispositions: [
          "BOUNDED_REPAIR_SUBMITTED",
          "CONTRACT_GAP",
          "PACKAGE_COMMITTED",
          "SOURCE_INCOMPATIBLE",
        ],
        executionClass: "PRODUCTION_CODEX",
        diagnosticRetentionDays: 14,
        destroysWorkspace: "DESTROY_AFTER_TERMINAL_OR_FAILURE",
      },
      {
        role: "SUPPLY_REVIEWER",
        hash: "434df5725ec14b466768c656a538d2a917afc93a900e4eeb9ccfe5191606b56b",
        promptTemplateHash:
          "f2a685039fac0dd4f261a645d3cfb9128f28dfbb0c86549e9d7866d858a32fe2",
        inputSchemaId: "affiliate-agent/supply-reviewer-subject@1",
        permittedCommands: ["SUBMIT_TERMINAL_RESULT"],
        terminalDispositions: [
          "ACTIVATED",
          "APPROVED",
          "EXACT_TARGET_REJECTED",
          "HUMAN_REVIEW_REQUIRED",
          "PRODUCER_REPAIR_REQUIRED",
          "REGRESSION_ASSESSED",
          "SOURCE_EXCLUSION_ASSESSED",
        ],
        executionClass: "PRODUCTION_CODEX",
        diagnosticRetentionDays: 14,
        destroysWorkspace: "DESTROY_AFTER_TERMINAL_OR_FAILURE",
      },
      {
        role: "HUMAN_DIRECTED_EXECUTOR",
        hash: "4aae27af7110f5ad4e3141f4d11882825e4db90422f1021bb4d24ee36c68527f",
        promptTemplateHash:
          "514fca00a373112dec2385a0b3b527975dec41d17b2288eb04e78ba7b98a72ec",
        inputSchemaId: "affiliate-agent/human-directed-executor-subject@1",
        permittedCommands: [
          "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
          "SUBMIT_TERMINAL_RESULT",
        ],
        terminalDispositions: ["CONTRACT_GAP", "LIFECYCLE_COMMAND_EXECUTED"],
        executionClass: "PRODUCTION_CODEX",
        diagnosticRetentionDays: 14,
        destroysWorkspace: "DESTROY_AFTER_TERMINAL_OR_FAILURE",
      },
    ]);
    expect(
      parsed.every((contract) => contract.forbiddenEffects.length > 0),
    ).toBe(true);
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

  it("rejects correctly rehashed version-1 role capability changes", () => {
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

  it("parses a hashed deployment contract with the expected topology", () => {
    const parsed = affiliateAgentDeploymentContractSchema.parse(
      deploymentContractFixture,
    );

    expect(parsed.hash).toBe(
      "3f12c0702667a7a32cd88a9465cf541a249fc463aadc1aa6c63b42051798d5ae",
    );
    expect(parsed.expectedTopology).toEqual({
      claimsPerInvocation: 1,
      freshWorkspacePerClaim: true,
      processCommand: ["codex", "exec", "--ephemeral"],
      nestedGoal: false,
      claimLoop: false,
      contextReuse: false,
      executionClass: "PRODUCTION_CODEX",
    });
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
  });

  it("renders one explicit authority projection with truthful hashes", () => {
    const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.COVERAGE_PLANNER;
    const claim = affiliateAgentClaimEnvelopeSchema.parse(
      claimFixtureForRole("COVERAGE_PLANNER"),
    );
    const prompt = renderAffiliateAgentPrompt(roleContract, claim);
    const projectionJson = prompt
      .split("## Authority Projection\n")[1]
      .split("\n\n## Completion")[0];

    expect(JSON.parse(projectionJson)).toEqual({
      schemaVersion: 1,
      role: "COVERAGE_PLANNER",
      queue: claim.queue,
      lane: claim.lane,
      jobId: claim.jobId,
      claimId: claim.claimId,
      supplySourceId: null,
      executionClass: "PRODUCTION_CODEX",
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
      evidenceManifestHash: claim.evidenceManifest.hash,
      claimGeneration: claim.claimGeneration,
      lifecycleGeneration: claim.lifecycleGeneration,
      subject: claim.subject,
      nonTerminalCommands: ["CAPTURE_CLAIM_URL", "RUN_DISCOVERY_QUERY"],
      terminalDispositions: roleContract.terminalDispositions,
      forbiddenEffects: roleContract.forbiddenEffects,
    });
    expect(projectionJson).not.toContain('"hash":');
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

  it("renders exactly one terminal completion command", () => {
    Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).forEach((roleContract) => {
      const claim = affiliateAgentClaimEnvelopeSchema.parse(
        claimFixtureForRole(roleContract.role),
      );
      const prompt = renderAffiliateAgentPrompt(roleContract, claim);

      expect(prompt.match(/SUBMIT_TERMINAL_RESULT/g)).toHaveLength(1);
      expect(
        prompt.endsWith(
          "Submit one terminal result with SUBMIT_TERMINAL_RESULT.",
        ),
      ).toBe(true);
    });
  });

  it("freezes the transactional timing and retry policy", () => {
    expect({
      heartbeat: AFFILIATE_AGENT_HEARTBEAT_INTERVAL_SECONDS,
      lease: AFFILIATE_AGENT_LEASE_SECONDS,
      deadline: AFFILIATE_AGENT_HARD_DEADLINE_SECONDS,
      schemaCorrections: AFFILIATE_AGENT_MAX_SCHEMA_CORRECTIONS,
      invocationAttempts: AFFILIATE_AGENT_MAX_INVOCATION_ATTEMPTS,
      retryDelays: [1, 2, 3].map((attempt) =>
        affiliateAgentRetryDelaySeconds(attempt as 1 | 2 | 3),
      ),
    }).toEqual({
      heartbeat: 60,
      lease: 300,
      deadline: 1_200,
      schemaCorrections: 3,
      invocationAttempts: 3,
      retryDelays: [300, 900, null],
    });
  });
});

type GatewayTestRow = Record<string, unknown>;

type GatewayClaimTestPrisma = {
  affiliateAgentGatewayJobs: {
    findFirst(input: { where: GatewayTestRow }): Promise<GatewayTestRow | null>;
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
    updateMany(input: {
      where: GatewayTestRow;
      data: GatewayTestRow;
    }): Promise<{ count: number }>;
  };
  affiliateAgentGatewayClaims: {
    findUnique(input: {
      where: GatewayTestRow;
    }): Promise<GatewayTestRow | null>;
    create(input: { data: GatewayTestRow }): Promise<GatewayTestRow>;
    updateMany(input: {
      where: GatewayTestRow;
      data: GatewayTestRow;
    }): Promise<{ count: number }>;
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
    create(input: { data: GatewayTestRow }): Promise<GatewayTestRow>;
    updateMany(input: {
      where: GatewayTestRow;
      data: GatewayTestRow;
    }): Promise<{ count: number }>;
  };
  affiliateAgentGatewayEvents: {
    create(input: { data: GatewayTestRow }): Promise<GatewayTestRow>;
  };
  $transaction<T>(
    callback: (transaction: GatewayClaimTestPrisma) => Promise<T>,
    options?: GatewayTestRow,
  ): Promise<T>;
};

type GatewayClaimHarness = Readonly<{
  gateway: AffiliateAgentGateway;
  state: {
    jobs: GatewayTestRow[];
    claims: GatewayTestRow[];
    artifacts: GatewayTestRow[];
    receipts: GatewayTestRow[];
    events: GatewayTestRow[];
  };
  artifactBytes: Buffer;
  setNow(value: string): void;
  setArtifactRead(value: AffiliateAgentArtifactRead): void;
  setActiveBundle(value: unknown): void;
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

const createGatewayClaimHarness = (): GatewayClaimHarness => {
  let activeBundle: unknown = contractBundleFixture;
  let currentTime = new Date("2026-08-20T18:00:00.000Z");
  const initialTime = new Date(currentTime);
  let identifierSequence = 0;
  const artifactBytes = Buffer.from("verified gateway artifact", "utf8");
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
    receipts: [] as GatewayTestRow[],
    events: [] as GatewayTestRow[],
  };
  const prismaMock: GatewayClaimTestPrisma = {
    affiliateAgentGatewayJobs: {
      findFirst: async () =>
        state.jobs.find(
          (job) =>
            job.status === "QUEUED" &&
            job.activeClaimId === null &&
            job.nextAttemptAt instanceof Date &&
            job.nextAttemptAt <= currentTime,
        ) ?? null,
      findUnique: async ({ where }) =>
        state.jobs.find((job) => job.id === where.id) ?? null,
      updateMany: async ({ where, data }) => {
        const job = state.jobs.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.status === where.status &&
            candidate.claimGeneration === where.claimGeneration &&
            candidate.activeClaimId === where.activeClaimId,
        );
        if (!job) return { count: 0 };
        const claimGenerationIncrement = gatewayTestIncrement(
          data.claimGeneration,
        );
        const eventSequenceIncrement = gatewayTestIncrement(data.eventSequence);
        Object.assign(job, data, {
          claimGeneration:
            claimGenerationIncrement !== null
              ? Number(job.claimGeneration) + claimGenerationIncrement
              : (data.claimGeneration ?? job.claimGeneration),
          eventSequence:
            eventSequenceIncrement !== null
              ? Number(job.eventSequence) + eventSequenceIncrement
              : (data.eventSequence ?? job.eventSequence),
        });
        return { count: 1 };
      },
    },
    affiliateAgentGatewayClaims: {
      findUnique: async ({ where }) =>
        state.claims.find(
          (claim) =>
            claim.id === where.id ||
            claim.claimRequestId === where.claimRequestId,
        ) ?? null,
      create: async ({ data }) => {
        state.claims.push(data);
        return data;
      },
      updateMany: async ({ where, data }) => {
        const claim = state.claims.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.status === where.status &&
            candidate.claimGeneration === where.claimGeneration &&
            candidate.tokenInvalidatedAt === where.tokenInvalidatedAt &&
            candidate.leaseExpiresAt instanceof Date &&
            candidate.hardDeadlineAt instanceof Date,
        );
        if (!claim) return { count: 0 };
        Object.assign(claim, data);
        return { count: 1 };
      },
    },
    affiliateAgentGatewayArtifacts: {
      createMany: async ({ data }) => {
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
      findUnique: async ({ where }) => {
        const compound = where.claimId_idempotencyKey;
        if (
          compound === null ||
          typeof compound !== "object" ||
          !("claimId" in compound) ||
          !("idempotencyKey" in compound)
        ) {
          return null;
        }
        return (
          state.receipts.find(
            (receipt) =>
              receipt.claimId === compound.claimId &&
              receipt.idempotencyKey === compound.idempotencyKey,
          ) ?? null
        );
      },
      create: async ({ data }) => {
        state.receipts.push(data);
        return data;
      },
      updateMany: async ({ where, data }) => {
        const receipt = state.receipts.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.status === where.status &&
            (where.requestHash === undefined ||
              candidate.requestHash === where.requestHash),
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
    },
    $transaction: async <T>(
      callback: (transaction: GatewayClaimTestPrisma) => Promise<T>,
    ): Promise<T> => callback(prismaMock),
  };

  // The fake implements the gateway delegates; PrismaClient's nominal internals cannot be modeled.
  const gatewayPrismaTestDouble = prismaMock as unknown as PrismaClient;

  const dependencies = createProductionAffiliateAgentGatewayDependencies({
    prisma: gatewayPrismaTestDouble,
    tokenSigningKey: Buffer.from("gateway-test-signing-key".repeat(2)),
    tokenKeyVersion: "test-key-v1",
    clock: { now: () => new Date(currentTime) },
    identifiers: {
      create: (kind) => `${kind}-${++identifierSequence}`,
    },
    credentials: {
      verify: async (input) =>
        input.roleCredential === "coverage-role-credential" &&
        input.role === "COVERAGE_PLANNER" &&
        input.executionClass === "PRODUCTION_CODEX",
    },
    workspaces: {
      verify: async (attestation) =>
        attestation.signature === "valid-workspace-signature",
    },
    contracts: {
      loadActiveBundle: async () => activeBundle,
    },
    artifacts: {
      readImmutable: async () => artifactRead,
    },
    commands: {
      transactional: {
        RUN_DISCOVERY_QUERY: {
          execute: async () => ({
            candidateRefs: ["candidate-source-1"],
            queryCompleted: true,
          }),
        },
      },
      external: {},
    },
    lifecycle: { kind: "UNAVAILABLE" },
  });

  return {
    gateway: createPrismaAffiliateAgentGateway(dependencies),
    state,
    artifactBytes,
    setNow: (value: string) => {
      currentTime = new Date(value);
    },
    setArtifactRead: (value: AffiliateAgentArtifactRead) => {
      artifactRead = value;
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
        executionClass: "PRODUCTION_CODEX" as const,
        workerId: "coverage-worker-1",
        invocationId: "coverage-invocation-1",
        issuedAt: "2026-08-20T17:59:00.000Z",
        expiresAt: "2026-08-20T18:20:00.000Z",
        signature: "valid-workspace-signature",
      },
    },
  };
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

const coverageTerminalResultFor = (grant: AffiliateAgentClaimGrant) => ({
  schemaVersion: 1 as const,
  jobId: grant.envelope.jobId,
  claimId: grant.envelope.claimId,
  claimGeneration: grant.envelope.claimGeneration,
  lifecycleGeneration: grant.envelope.lifecycleGeneration,
  roleContractVersion: grant.envelope.roleContractVersion,
  roleContractHash: grant.envelope.roleContractHash,
  supplyContractHash: grant.envelope.supplyContractHash,
  workerId: grant.envelope.workerId,
  invocationId: grant.envelope.invocationId,
  role: "COVERAGE_PLANNER" as const,
  disposition: "NO_ACTION" as const,
  reasonCodes: ["NO_QUALIFIED_ACTION"] as const,
  evidenceRefs: ["evidence-1"] as const,
  summary: "No qualified action remains for this coverage cell.",
  payload: { basis: "NO_QUALIFIED_ACTION" as const },
});

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
  return {
    kind: "RECORD_FAILURE",
    idempotencyKey: `scope-${kind}`,
    authorization,
    failure: {
      schemaVersion: 1,
      jobId: grant.envelope.jobId,
      claimId: grant.envelope.claimId,
      claimGeneration: grant.envelope.claimGeneration,
      lifecycleGeneration: grant.envelope.lifecycleGeneration,
      role: grant.envelope.role,
      workerId: grant.envelope.workerId,
      invocationId: grant.envelope.invocationId,
      supplyContractHash: grant.envelope.supplyContractHash,
      code: "PROCESS_CRASH",
      occurredAt: "2026-08-20T18:01:00.000Z",
      evidenceRefs: ["evidence-1"],
      safeSummary: "The invocation process ended before completion.",
    },
  };
};

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

  it("replays only an identical claim request", async () => {
    const { gateway, request, state } = createGatewayClaimHarness();

    const claimed = await gateway.claim(request);
    const replayed = await gateway.claim(request);

    expect(replayed).toEqual(claimed);
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
        expectedCode: "REVIEW_WORKSPACE_INVALID",
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

  it("extends an active lease to five minutes after a heartbeat", async () => {
    const { gateway, request, setNow } = createGatewayClaimHarness();
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

  it("executes the one closed Coverage Planner command", async () => {
    const { gateway, request } = createGatewayClaimHarness();
    const grant = await gateway.claim(request);
    if (!grant) throw new Error("Expected one Coverage Planner claim.");

    const result = await gateway.perform({
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
        candidateRefs: ["candidate-source-1"],
        queryCompleted: true,
      },
    });
    expect(result.responseHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns no artifact bytes when stored or adapter integrity checks fail", async () => {
    const verifiedBytes = Buffer.from("verified gateway artifact", "utf8");
    const invalidReads: readonly AffiliateAgentArtifactRead[] = [
      {
        bytes: new Uint8Array(Buffer.from("tampered artifact", "utf8")),
        mimeType: "text/markdown",
        byteSize: Buffer.byteLength("tampered artifact"),
        sourceUrl: "https://evidence.example.test/page",
      },
      {
        bytes: new Uint8Array(verifiedBytes),
        mimeType: "text/html",
        byteSize: verifiedBytes.byteLength,
        sourceUrl: "https://evidence.example.test/page",
      },
      {
        bytes: new Uint8Array(verifiedBytes),
        mimeType: "text/markdown",
        byteSize: verifiedBytes.byteLength + 1,
        sourceUrl: "https://evidence.example.test/page",
      },
      {
        bytes: new Uint8Array(verifiedBytes),
        mimeType: "text/markdown",
        byteSize: verifiedBytes.byteLength,
        sourceUrl: "file:///private/evidence",
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

  it("accepts one terminal Coverage Planner result and invalidates the token", async () => {
    const { gateway, request } = createGatewayClaimHarness();
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
        roleContractVersion: grant.envelope.roleContractVersion,
        roleContractHash: grant.envelope.roleContractHash,
        supplyContractHash: grant.envelope.supplyContractHash,
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
    const deniedAfterTerminal: readonly AffiliateAgentClaimOperation["kind"][] =
      [
        "HEARTBEAT",
        "READ_ARTIFACT",
        "EXECUTE_COMMAND",
        "SUBMIT_RESULT",
        "RECORD_FAILURE",
      ];
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
    const replayed = await gateway.perform(operation);

    expect(replayed).toEqual(accepted);
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
      "RECORD_FAILURE",
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
