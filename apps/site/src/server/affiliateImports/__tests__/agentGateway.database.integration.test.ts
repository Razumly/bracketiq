/** @jest-environment node */

import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  hashAffiliateAgentValue,
  type AffiliateAgentEvidenceManifest,
  type AffiliateAgentRole,
} from "../agentGatewayContracts";
import type {
  AffiliateAgentClaimAuthorization,
  AffiliateAgentClaimEnvelope,
  AffiliateAgentClaimGrant,
  AffiliateAgentClaimRequest,
  AffiliateAgentGateway,
  AffiliateAgentInvocationFailureCode,
} from "../agentGateway";
import {
  createProductionAffiliateAgentGatewayAdapters,
  createProductionAffiliateAgentGatewayDependencies,
  type AffiliateAgentCommandAdapters,
  type AffiliateAgentGatewayDependencies,
  type AffiliateAgentLifecycleAuthority,
  type AffiliateAgentProcessEvent,
  type AffiliateAgentProcessSession,
  type AffiliateAgentSupervisorDependencies,
  type AffiliateAgentTerminalEffectAdapter,
} from "../agentGatewayAdapters";
import type { StorageProvider } from "@/lib/storageProvider";
import {
  runAffiliateAgentInvocation,
  type AffiliateAgentSupervisorInput,
} from "../agentSupervisor";
import {
  createPrismaAffiliateAgentGateway,
  createPrismaAffiliateAgentInvocationReconciler,
} from "../prismaAgentGateway";
const describeDatabase =
  process.env.RUN_DATABASE_INTEGRATION === "1" ? describe : describe.skip;
const DATABASE_NAME = "bracketiq_e2e_67_gateway";
const INITIAL_TIME = new Date("2026-08-20T18:00:00.000Z");
const RUN_PREFIX = `issue67-gateway-${randomUUID()}`;
const INPUT_BYTES = Buffer.from("database gateway evidence", "utf8");
const INPUT_HASH = createHash("sha256").update(INPUT_BYTES).digest("hex");
const PROTECTED_AFFILIATE_AGENT_TABLES = [
  "AffiliateAgentGatewayJobs",
  "AffiliateAgentGatewayClaims",
  "AffiliateAgentGatewayArtifacts",
  "AffiliateAgentGatewayOperationReceipts",
  "AffiliateAgentGatewayEvents",
  "AffiliateCoverageAgentJobs",
  "AffiliateSourceMappingJobs",
  "AffiliateApprovalJobs",
  "AffiliateSourceIntakes",
  "AffiliateSourceIntakeArtifacts",
  "AffiliateSourceDiscoveryCampaigns",
  "AffiliateScrapeSources",
  "AffiliateScrapeMappings",
  "File",
] as const;
const PROTECTED_TABLE_OPERATIONS = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
] as const;

const assertIsolatedDatabaseUrl = (databaseUrl: string | undefined): string => {
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const parsed = new URL(databaseUrl);
  const isIsolatedDatabase =
    ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
    parsed.pathname.slice(1) === DATABASE_NAME;
  if (!isIsolatedDatabase) {
    throw new Error("The direct denial probe requires the isolated database.");
  }
  return databaseUrl;
};

const isAffiliateAgentPermissionDenied = (error: unknown): boolean => {
  if (error === null || typeof error !== "object") return false;
  return "code" in error && error.code === "42501";
};

const probeProtectedTableWrites = async (
  client: Client,
  agentRole: string,
  targets: readonly string[],
): Promise<string[]> => {
  const facts: string[] = [];
  for (const table of targets) {
    const statements = [
      {
        operation: "INSERT",
        sql: `INSERT INTO public."${table}" DEFAULT VALUES`,
      },
      {
        operation: "UPDATE",
        sql: `UPDATE public."${table}" SET "id" = "id" WHERE FALSE`,
      },
      {
        operation: "DELETE",
        sql: `DELETE FROM public."${table}" WHERE FALSE`,
      },
    ] as const;
    for (const statement of statements) {
      let isDenied = false;
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL ROLE "${agentRole}"`);
        await client.query(statement.sql);
      } catch (error) {
        isDenied = isAffiliateAgentPermissionDenied(error);
      } finally {
        await client.query("ROLLBACK");
      }
      expect(isDenied).toBe(true);
      facts.push(`${table} ${statement.operation.toLowerCase()}`);
    }
  }
  return facts;
};


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

const contractBundleFixture = (() => {
  const deploymentPreimage = {
    schemaVersion: 1,
    version: 1,
    gatewayVersion: 1,
    activeSupplyContract: {
      version: supplyContractFixture.version,
      hash: supplyContractFixture.hash,
    },
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).map(
      ({ role, version, hash }) => ({ role, version, hash }),
    ),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES).map(
      ({ role, version, hash }) => ({ role, version, hash }),
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
    schemaVersion: 1 as const,
    supplyContract: supplyContractFixture,
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES),
    deploymentContract: {
      ...deploymentPreimage,
      hash: hashAffiliateAgentValue(deploymentPreimage),
    },
  };
})();

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
    schemaVersion: 1 as const,
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
    contractBundleFixture.deploymentContract;
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
    contractBundleFixture.deploymentContract;
  const changedDeploymentPreimage = {
    ...deploymentPreimage,
    gatewayVersion: 2,
  };
  return {
    ...contractBundleFixture,
    deploymentContract: {
      ...changedDeploymentPreimage,
      hash: hashAffiliateAgentValue(changedDeploymentPreimage),
    },
  };
})();

const manifestFor = (
  label: string,
  kinds: readonly {
    evidenceRef: string;
    kind:
      | "ACTIVE_SUPPLY_CONTRACT"
      | "COMMITTED_PACKAGE"
      | "DETERMINISTIC_VALIDATION"
      | "DURABLE_EVIDENCE"
      | "HUMAN_DECISION"
      | "PAGE_MARKDOWN"
      | "REVIEWER_EVIDENCE";
    artifactId?: string;
    sha256?: string;
  }[],
): AffiliateAgentEvidenceManifest => {
  const preimage = {
    schemaVersion: 1 as const,
    entries: kinds
      .map(({ evidenceRef, kind, artifactId, sha256 }) => ({
        evidenceRef,
        kind,
        artifactId: artifactId ?? `${RUN_PREFIX}-${label}-${evidenceRef}`,
        sha256:
          sha256 ??
          (kind === "ACTIVE_SUPPLY_CONTRACT"
            ? contractBundleFixture.supplyContract.hash
            : kind === "COMMITTED_PACKAGE"
              ? "d".repeat(64)
              : INPUT_HASH),
        mimeType: "text/markdown",
        byteSize: INPUT_BYTES.byteLength,
        retention: "INDEFINITE" as const,
      }))
      .sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef)),
  };
  return { ...preimage, hash: hashAffiliateAgentValue(preimage) };
};

const coverageManifestFor = (label: string): AffiliateAgentEvidenceManifest =>
  manifestFor(label, [
    { evidenceRef: "input-evidence", kind: "PAGE_MARKDOWN" },
  ]);
type HumanJobPrerequisite = Readonly<{
  reviewerClaimId: string;
  supplySourceId: string;
  decisionHash: string;
  reviewerEvidence: Readonly<{
    evidenceRef: string;
    artifactId: string;
    sha256: string;
  }>;
}>;

const humanManifestFor = (
  label: string,
  prerequisite: Pick<HumanJobPrerequisite, "decisionHash" | "reviewerEvidence">,
): AffiliateAgentEvidenceManifest =>
  manifestFor(label, [
    {
      evidenceRef: "human-decision",
      kind: "HUMAN_DECISION",
      sha256: prerequisite.decisionHash,
    },
    {
      evidenceRef: prerequisite.reviewerEvidence.evidenceRef,
      kind: "REVIEWER_EVIDENCE",
      artifactId: prerequisite.reviewerEvidence.artifactId,
      sha256: prerequisite.reviewerEvidence.sha256,
    },
  ]);
const mappingManifestFor = (label: string): AffiliateAgentEvidenceManifest =>
  manifestFor(label, [
    {
      evidenceRef: "deterministic-validation",
      kind: "DETERMINISTIC_VALIDATION",
    },
    { evidenceRef: "durable-evidence", kind: "DURABLE_EVIDENCE" },
    { evidenceRef: "input-evidence", kind: "PAGE_MARKDOWN" },
  ]);

const reviewerManifestFor = (
  label: string,
  committedPackageHash = "d".repeat(64),
  producerEvidenceLabel?: string,
): AffiliateAgentEvidenceManifest =>
  manifestFor(label, [
    { evidenceRef: "active-contract", kind: "ACTIVE_SUPPLY_CONTRACT" },
    {
      evidenceRef: "committed-package",
      kind: "COMMITTED_PACKAGE",
      sha256: committedPackageHash,
    },
    {
      evidenceRef: "deterministic-validation",
      kind: "DETERMINISTIC_VALIDATION",
      artifactId: producerEvidenceLabel
        ? `${RUN_PREFIX}-${producerEvidenceLabel}-deterministic-validation`
        : undefined,
      sha256: producerEvidenceLabel ? INPUT_HASH : undefined,
    },
    {
      evidenceRef: "durable-evidence",
      kind: "DURABLE_EVIDENCE",
      artifactId: producerEvidenceLabel
        ? `${RUN_PREFIX}-${producerEvidenceLabel}-durable-evidence`
        : undefined,
      sha256: producerEvidenceLabel ? INPUT_HASH : undefined,
    },
  ]);

const seedSupplySource = async (
  id: string,
  lifecycleGeneration = 7,
): Promise<void> => {
  await prisma.affiliateSupplySources.create({
    data: {
      id,
      identityKey: `${id}:identity`,
      canonicalUrl: `https://source.example.test/${id}`,
      origin: "https://source.example.test",
      pathKey: `/${id}`,
      lifecycleGeneration,
    },
  });
};

const seedMappingJob = async (label: string): Promise<string> => {
  const id = `${RUN_PREFIX}-${label}-job`;
  const supplySourceId = `${RUN_PREFIX}-${label}-supply-source`;
  await seedSupplySource(supplySourceId);
  await prisma.affiliateAgentGatewayJobs.create({
    data: {
      id,
      dedupeKey: `${RUN_PREFIX}-${label}-dedupe`,
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: `${RUN_PREFIX}-${label}-mapping-job`,
      subjectJson: {
        type: "MAPPING_PRODUCER",
        supplySourceId,
        mappingJobId: `${RUN_PREFIX}-${label}-mapping-job`,
        pass: 1,
      },
      evidenceManifestJson: mappingManifestFor(label),
      supplySourceId,
      expectedLifecycleGeneration: 7,
      nextAttemptAt: INITIAL_TIME,
    },
  });
  return id;
};

type ProducerClaimIdentity = Readonly<{
  claimId: string;
  workerId: string;
  invocationId: string;
  workspaceId: string;
  supplySourceId: string;
}>;

const seedReviewerJob = async (
  label: string,
  producer: ProducerClaimIdentity,
  committedPackageHash = "d".repeat(64),
  producerEvidenceLabel?: string,
): Promise<string> => {
  const id = `${RUN_PREFIX}-${label}-job`;
  const supplySourceId = producer.supplySourceId;
  await prisma.affiliateAgentGatewayJobs.create({
    data: {
      id,
      dedupeKey: `${RUN_PREFIX}-${label}-dedupe`,
      queue: "AFFILIATE_REVIEW",
      lane: "SUPPLY_REVIEW",
      role: "SUPPLY_REVIEWER",
      subjectType: "SUPPLY_REVIEWER",
      subjectId: supplySourceId,
      parentClaimId: producer.claimId,
      subjectJson: {
        type: "SUPPLY_REVIEWER",
        supplySourceId,
        producerClaimId: producer.claimId,
        producerWorkerId: producer.workerId,
        producerInvocationId: producer.invocationId,
        producerWorkspaceId: producer.workspaceId,
        committedPackageHash,
        targetId: `${RUN_PREFIX}-${label}-target`,
        targetType: "EVENT",
        reviewPass: 1,
      },
      evidenceManifestJson: reviewerManifestFor(
        label,
        committedPackageHash,
        producerEvidenceLabel,
      ),
      supplySourceId,
      expectedLifecycleGeneration: 7,
      nextAttemptAt: INITIAL_TIME,
    },
  });
  return id;
};
const seedCompletedReviewerForHuman = async (
  label: string,
  supplySourceId: string,
): Promise<HumanJobPrerequisite> => {
  await seedSupplySource(supplySourceId);
  const jobId = `${RUN_PREFIX}-${label}-reviewer-job`;
  const claimId = `${RUN_PREFIX}-${label}-reviewer-claim`;
  const terminalReceiptId = `${RUN_PREFIX}-${label}-reviewer-terminal`;
  const workerId = `${RUN_PREFIX}-${label}-reviewer-worker`;
  const invocationId = `${RUN_PREFIX}-${label}-reviewer-invocation`;
  const workspaceId = `${RUN_PREFIX}-${label}-reviewer-workspace`;
  const manifest = reviewerManifestFor(label);
  const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.SUPPLY_REVIEWER;
  const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES.SUPPLY_REVIEWER;
  const subject = {
    type: "SUPPLY_REVIEWER" as const,
    supplySourceId,
    producerClaimId: `${RUN_PREFIX}-${label}-producer-claim`,
    producerWorkerId: `${RUN_PREFIX}-${label}-producer-worker`,
    producerInvocationId: `${RUN_PREFIX}-${label}-producer-invocation`,
    producerWorkspaceId: `${RUN_PREFIX}-${label}-producer-workspace`,
    committedPackageHash: "d".repeat(64),
    targetId: `${RUN_PREFIX}-${label}-target`,
    targetType: "EVENT" as const,
    reviewPass: 1,
  };
  const envelope: AffiliateAgentClaimEnvelope = {
    schemaVersion: 1,
    queue: "AFFILIATE_REVIEW",
    lane: "SUPPLY_REVIEW",
    jobId,
    claimId,
    supplySourceId,
    claimGeneration: 1,
    lifecycleGeneration: 7,
    role: "SUPPLY_REVIEWER",
    deploymentContractVersion: contractBundleFixture.deploymentContract.version,
    deploymentContractHash: contractBundleFixture.deploymentContract.hash,
    supplyContractVersion: contractBundleFixture.supplyContract.version,
    supplyContractHash: contractBundleFixture.supplyContract.hash,
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    executionClass: "PRODUCTION_OMP",
    workerId,
    invocationId,
    workspaceId,
    claimedAt: "2026-08-20T17:59:00.000Z",
    expiresAt: "2026-08-20T18:20:00.000Z",
    evidenceManifest: manifest,
    subject,
    permittedCommands: roleContract.permittedCommands,
  };
  const result = {
    schemaVersion: 1 as const,
    jobId,
    claimId,
    claimGeneration: 1,
    lifecycleGeneration: 7,
    deploymentContractVersion: contractBundleFixture.deploymentContract.version,
    deploymentContractHash: contractBundleFixture.deploymentContract.hash,
    supplyContractVersion: contractBundleFixture.supplyContract.version,
    supplyContractHash: contractBundleFixture.supplyContract.hash,
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    workerId,
    invocationId,
    role: "SUPPLY_REVIEWER" as const,
    disposition: "HUMAN_REVIEW_REQUIRED" as const,
    reasonCodes: ["EVIDENCE_VERIFIED"] as const,
    evidenceRefs: manifest.entries.map(({ evidenceRef }) => evidenceRef),
    summary: "The reviewer requested a recorded human decision.",
    payload: { caseReason: "Conflicting operator identity evidence." },
  };
  await prisma.$transaction(async (transaction) => {
    await transaction.affiliateAgentGatewayJobs.create({
      data: {
        id: jobId,
        dedupeKey: `${RUN_PREFIX}-${label}-reviewer-dedupe`,
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
        role: "SUPPLY_REVIEWER",
        subjectType: "SUPPLY_REVIEWER",
        subjectId: supplySourceId,
        parentClaimId: claimId,
        subjectJson: subject,
        evidenceManifestJson: manifest,
        supplySourceId,
        expectedLifecycleGeneration: 7,
        status: "COMPLETED",
        claimGeneration: 1,
        activeClaimId: null,
        terminalDisposition: "HUMAN_REVIEW_REQUIRED",
        resultHash: hashAffiliateAgentValue(result),
        resultJson: result,
        terminalReceiptId,
        finishedAt: INITIAL_TIME,
      },
    });
    await transaction.affiliateAgentGatewayClaims.create({
      data: {
        id: claimId,
        jobId,
        parentClaimId: subject.producerClaimId,
        claimGeneration: 1,
        lifecycleGeneration: 7,
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
        role: "SUPPLY_REVIEWER",
        workerId,
        invocationId,
        workspaceId,
        workspaceMode: "READ_ONLY",
        workspaceAttestationHash: hashAffiliateAgentValue({
          workerId,
          invocationId,
          workspaceId,
        }),
        status: "COMPLETED",
        claimRequestId: `${RUN_PREFIX}-${label}-reviewer-request`,
        claimRequestHash: hashAffiliateAgentValue({
          claimId,
          jobId,
        }),
        claimedAt: INITIAL_TIME,
        lastHeartbeatAt: INITIAL_TIME,
        leaseExpiresAt: new Date("2026-08-20T18:05:00.000Z"),
        hardDeadlineAt: new Date("2026-08-20T18:20:00.000Z"),
        endedAt: INITIAL_TIME,
        tokenNonce: `${RUN_PREFIX}-${label}-reviewer-token-nonce`,
        tokenHash: `${RUN_PREFIX}-${label}-reviewer-token-hash`,
        tokenKeyVersion: "database-key-v1",
        tokenExpiresAt: new Date("2026-08-20T18:20:00.000Z"),
        tokenInvalidatedAt: INITIAL_TIME,
        deploymentContractVersion:
          contractBundleFixture.deploymentContract.version,
        deploymentContractHash: contractBundleFixture.deploymentContract.hash,
        roleContractVersion: roleContract.version,
        roleContractHash: roleContract.hash,
        promptTemplateVersion: promptTemplate.version,
        promptTemplateHash: promptTemplate.hash,
        supplyContractVersion: contractBundleFixture.supplyContract.version,
        supplyContractHash: contractBundleFixture.supplyContract.hash,
        claimEnvelopeHash: hashAffiliateAgentValue(envelope),
        claimEnvelopeJson: envelope,
        evidenceManifestHash: manifest.hash,
        permittedCommandHash: hashAffiliateAgentValue(
          roleContract.permittedCommands,
        ),
        permittedCommands: [...roleContract.permittedCommands],
        terminalReceiptId,
      },
    });
    await transaction.affiliateAgentGatewayArtifacts.createMany({
      data: manifest.entries.map((entry, index) => ({
        id: `${RUN_PREFIX}-${label}-reviewer-artifact-${index + 1}`,
        claimId,
        claimGeneration: 1,
        evidenceRef: entry.evidenceRef,
        evidenceKind: entry.kind,
        sourceArtifactId: entry.artifactId,
        fileId: entry.artifactId,
        contentHash: entry.sha256,
        mimeType: entry.mimeType,
        byteSize: entry.byteSize,
        accessMode: "READ_ONLY",
        creatingClaimId: subject.producerClaimId,
        retentionClass: entry.retention,
        isPinned: true,
      })),
    });
  });
  const reviewerEvidence = manifest.entries.find(
    ({ kind }) => kind === "DURABLE_EVIDENCE",
  );
  if (!reviewerEvidence) {
    throw new Error("The synthetic reviewer manifest is incomplete.");
  }
  return {
    reviewerClaimId: claimId,
    supplySourceId,
    decisionHash: "c".repeat(64),
    reviewerEvidence: {
      evidenceRef: reviewerEvidence.evidenceRef,
      artifactId: reviewerEvidence.artifactId,
      sha256: reviewerEvidence.sha256,
    },
  };
};
const completedReviewerPrerequisiteForJob = async (
  _label: string,
  jobId: string,
): Promise<HumanJobPrerequisite> => {
  const [job, claim] = await Promise.all([
    prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
      where: { id: jobId },
      select: { supplySourceId: true },
    }),
    prisma.affiliateAgentGatewayClaims.findFirstOrThrow({
      where: { jobId },
      orderBy: { claimGeneration: "desc" },
      select: { id: true },
    }),
  ]);
  if (!job.supplySourceId) {
    throw new Error("The completed reviewer job has no Supply Source.");
  }
  const reviewerEvidence =
    await prisma.affiliateAgentGatewayArtifacts.findFirstOrThrow({
      where: {
        claimId: claim.id,
        evidenceKind: "DURABLE_EVIDENCE",
      },
      select: {
        evidenceRef: true,
        sourceArtifactId: true,
        contentHash: true,
      },
    });
  return {
    reviewerClaimId: claim.id,
    supplySourceId: job.supplySourceId,
    decisionHash: "c".repeat(64),
    reviewerEvidence: {
      evidenceRef: reviewerEvidence.evidenceRef,
      artifactId: reviewerEvidence.sourceArtifactId,
      sha256: reviewerEvidence.contentHash,
    },
  };
};

const seedCoverageJob = async (
  label: string,
  input: Readonly<{ invocationFailureCount?: number }> = {},
): Promise<string> => {
  const id = `${RUN_PREFIX}-${label}-job`;
  const manifest = coverageManifestFor(label);
  await prisma.affiliateAgentGatewayJobs.create({
    data: {
      id,
      dedupeKey: `${RUN_PREFIX}-${label}-dedupe`,
      queue: "AFFILIATE_COVERAGE",
      lane: "COVERAGE_PLANNING",
      role: "COVERAGE_PLANNER",
      subjectType: "COVERAGE_PLANNER",
      subjectId: `${RUN_PREFIX}-${label}-coverage-cell`,
      subjectJson: {
        type: "COVERAGE_PLANNER",
        coverageCellId: `${RUN_PREFIX}-${label}-coverage-cell`,
        assessmentCycleId: `${RUN_PREFIX}-${label}-cycle`,
      },
      evidenceManifestJson: manifest,
      invocationFailureCount: input.invocationFailureCount ?? 0,
      nextAttemptAt: INITIAL_TIME,
    },
  });
  return id;
};
const seedHumanJob = async (
  label: string,
  prerequisite: HumanJobPrerequisite,
): Promise<string> => {
  const id = `${RUN_PREFIX}-${label}-job`;
  await prisma.affiliateAgentGatewayJobs.create({
    data: {
      id,
      dedupeKey: `${RUN_PREFIX}-${label}-dedupe`,
      queue: "AFFILIATE_HUMAN_DIRECTED",
      lane: "HUMAN_EXECUTION",
      role: "HUMAN_DIRECTED_EXECUTOR",
      subjectType: "HUMAN_DIRECTED_EXECUTOR",
      subjectId: `${RUN_PREFIX}-${label}-case`,
      subjectJson: {
        type: "HUMAN_DIRECTED_EXECUTOR",
        caseId: `${RUN_PREFIX}-${label}-case`,
        recordedHumanActorId: `${RUN_PREFIX}-${label}-human`,
        decisionHash: prerequisite.decisionHash,
        reviewerClaimId: prerequisite.reviewerClaimId,
        lifecycleCommandRef: `${RUN_PREFIX}-${label}-lifecycle-command`,
      },
      evidenceManifestJson: humanManifestFor(label, prerequisite),
      parentClaimId: prerequisite.reviewerClaimId,
      supplySourceId: prerequisite.supplySourceId,
      expectedLifecycleGeneration: 7,
      nextAttemptAt: INITIAL_TIME,
    },
  });
  return id;
};

const requestFor = (
  label: string,
  role: AffiliateAgentRole,
  now: Date,
): AffiliateAgentClaimRequest => ({
  idempotencyKey: `${RUN_PREFIX}-${label}-request`,
  roleCredential: `${role.toLowerCase()}-test-credential`,
  role,
  workerId: `${RUN_PREFIX}-${label}-worker`,
  invocationId: `${RUN_PREFIX}-${label}-invocation`,
  workspaceAttestation: {
    schemaVersion: 1,
    workspaceId: `${RUN_PREFIX}-${label}-workspace`,
    mode: role === "SUPPLY_REVIEWER" ? "READ_ONLY" : "READ_WRITE",
    executionClass: "PRODUCTION_OMP",
    workerId: `${RUN_PREFIX}-${label}-worker`,
    invocationId: `${RUN_PREFIX}-${label}-invocation`,
    issuedAt: new Date(now.getTime() - 60_000).toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
    signature: "valid-test-attestation",
  },
});

const authorizationFor = (
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
  occurredAt: string,
) => ({
  kind: "RECORD_FAILURE" as const,
  idempotencyKey,
  authorization: authorizationFor(grant),
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
  },
});

const authorizationForTokenAndEnvelope = (
  token: string,
  envelope: AffiliateAgentClaimEnvelope,
): AffiliateAgentClaimAuthorization => ({
  token,
  jobId: envelope.jobId,
  claimId: envelope.claimId,
  claimGeneration: envelope.claimGeneration,
  lifecycleGeneration: envelope.lifecycleGeneration,
  role: envelope.role,
  workerId: envelope.workerId,
  invocationId: envelope.invocationId,
  supplyContractHash: envelope.supplyContractHash,
});

const terminalResultFor = (grant: AffiliateAgentClaimGrant) => ({
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
  evidenceRefs: ["input-evidence"] as const,
  summary: "No qualified action remains for this coverage cell.",
  payload: { basis: "NO_QUALIFIED_ACTION" as const },
});
const humanTerminalResultFor = (
  grant: AffiliateAgentClaimGrant,
  receiptId: string,
) => {
  const subject = grant.envelope.subject;
  if (subject.type !== "HUMAN_DIRECTED_EXECUTOR") {
    throw new Error("Expected a human-directed claim subject.");
  }
  return {
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
    evidenceRefs: grant.envelope.evidenceManifest.entries.map(
      ({ evidenceRef }) => evidenceRef,
    ),
    summary: "The recorded lifecycle command completed.",
    payload: {
      caseId: subject.caseId,
      lifecycleCommandRef: subject.lifecycleCommandRef,
      receiptId,
    },
  };
};
type GatewayHarnessOptions = Readonly<{
  database?: typeof prisma;
  commands?: AffiliateAgentCommandAdapters;
  terminalEffects?: AffiliateAgentTerminalEffectAdapter;
  lifecycle?: AffiliateAgentLifecycleAuthority;
  readImmutable?: AffiliateAgentGatewayDependencies["artifacts"]["readImmutable"];
}>;

const createGatewayHarness = (
  label: string,
  options: GatewayHarnessOptions = {},
) => {
  let now = new Date(INITIAL_TIME);
  let activeBundle: unknown = contractBundleFixture;
  let identifierSequence = 0;
  const database = options.database ?? prisma;
  const identifiers = {
    create: (
      kind: Parameters<
        AffiliateAgentGatewayDependencies["identifiers"]["create"]
      >[0],
    ) => `${RUN_PREFIX}-${label}-${kind}-${++identifierSequence}`,
  };
  const artifacts: AffiliateAgentGatewayDependencies["artifacts"] = {
    readImmutable:
      options.readImmutable ??
      (async () => ({
        bytes: new Uint8Array(INPUT_BYTES),
        mimeType: "text/markdown",
        byteSize: INPUT_BYTES.byteLength,
        sourceUrl: "https://evidence.example.test/database",
      })),
  };
  const storedObjects = new Map<
    string,
    Readonly<{ bytes: Buffer; contentType?: string }>
  >();
  const storage: StorageProvider = {
    async putObject({ data, originalName, contentType, key }) {
      const objectKey = key?.trim() || `${RUN_PREFIX}-${label}-${originalName}`;
      const normalizedContentType = contentType?.trim() || undefined;
      storedObjects.set(objectKey, {
        bytes: Buffer.from(data),
        ...(normalizedContentType ? { contentType: normalizedContentType } : {}),
      });
      return {
        key: objectKey,
        sizeBytes: data.byteLength,
        ...(normalizedContentType ? { contentType: normalizedContentType } : {}),
      };
    },
    async getObjectStream({ key }) {
      const stored = storedObjects.get(key);
      if (!stored) throw new Error(`Stored object ${key} was not found.`);
      return {
        stream: Readable.from([Buffer.from(stored.bytes)]),
        contentType: stored.contentType,
        sizeBytes: stored.bytes.byteLength,
      };
    },
    async deleteObject({ key }) {
      storedObjects.delete(key);
    },
    async headObject({ key }) {
      const stored = storedObjects.get(key);
      return stored
        ? {
          exists: true,
          contentType: stored.contentType,
          sizeBytes: stored.bytes.byteLength,
        }
        : { exists: false };
    },
  };
  const productionAdapters = createProductionAffiliateAgentGatewayAdapters({
    prisma: database,
    artifacts,
    storage,
    identifiers,
  });
  const commands: AffiliateAgentCommandAdapters = {
    transactional: {
      ...productionAdapters.commands.transactional,
      ...(options.commands?.transactional ?? {}),
    },
    external: {
      ...productionAdapters.commands.external,
      ...(options.commands?.external ?? {}),
    },
  };
  const dependencies = createProductionAffiliateAgentGatewayDependencies({
    prisma: database,
    tokenSigningKey: Buffer.from("database-gateway-signing-key".repeat(2)),
    tokenKeyVersion: "database-key-v1",
    clock: { now: () => new Date(now) },
    identifiers,
    credentials: {
      verify: async ({ executionClass }) =>
        executionClass === "PRODUCTION_OMP",
    },
    workspaces: { verify: async () => true },
    contracts: { loadActiveBundle: async () => activeBundle },
    artifacts,
    commands,
    terminalEffects: options.terminalEffects ?? productionAdapters.terminalEffects,
    lifecycle: options.lifecycle ?? { kind: "UNAVAILABLE" },
  });
  const gateway = createPrismaAffiliateAgentGateway(dependencies);
  const reconciler =
    createPrismaAffiliateAgentInvocationReconciler(dependencies);
  return {
    dependencies,
    gateway,
    reconciler,
    recreateGateway: (): AffiliateAgentGateway =>
      createPrismaAffiliateAgentGateway(dependencies),
    setNow: (value: string) => {
      now = new Date(value);
    },
    setActiveBundle: (value: unknown) => {
      activeBundle = value;
    },
  };
};

const claimOrThrow = async (
  gateway: AffiliateAgentGateway,
  request: AffiliateAgentClaimRequest,
): Promise<AffiliateAgentClaimGrant> => {
  const grant = await gateway.claim(request);
  if (!grant) throw new Error("Expected one Affiliate Agent claim.");
  return grant;
};

const cleanupGatewayRows = async (): Promise<void> => {
  const jobs = await prisma.affiliateAgentGatewayJobs.findMany({
    where: { id: { startsWith: RUN_PREFIX } },
    select: { id: true },
  });
  const jobIds = jobs.map(({ id }) => id);
  if (jobIds.length === 0) return;
  const supplySourceIds = (
    await prisma.affiliateSupplySources.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const claims = await prisma.affiliateAgentGatewayClaims.findMany({
    where: { jobId: { in: jobIds } },
    select: { id: true },
  });
  const claimIds = claims.map(({ id }) => id);
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      "SET LOCAL session_replication_role = replica",
    );
    await transaction.affiliateAgentGatewayEvents.deleteMany({
      where: { jobId: { in: jobIds } },
    });
    await transaction.affiliateAgentGatewayOperationReceipts.deleteMany({
      where: { jobId: { in: jobIds } },
    });
    await transaction.affiliateAgentGatewayArtifacts.deleteMany({
      where: { claimId: { in: claimIds } },
    });
    await transaction.affiliateAgentGatewayClaims.deleteMany({
      where: { jobId: { in: jobIds } },
    });
    await transaction.affiliateAgentGatewayJobs.deleteMany({
      where: { id: { in: jobIds } },
    });
    if (supplySourceIds.length > 0) {
      await transaction.affiliateSupplySources.deleteMany({
        where: { id: { in: supplySourceIds } },
      });
    }
  });
};

const zeroTransitionReport = {
  examinedClaims: 0,
  expiredClaims: 0,
  examinedReceipts: 0,
  recoveredReceipts: 0,
  completedReceipts: 0,
  unresolvedReceipts: 0,
  isAdmissionHalted: false,
} as const;

describeDatabase("Affiliate Agent Gateway PostgreSQL authority", () => {
  beforeAll(async () => {
    const rows = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (rows[0]?.database !== DATABASE_NAME) {
      throw new Error(`Gateway integration requires ${DATABASE_NAME}.`);
    }
  });

  afterEach(async () => {
    await cleanupGatewayRows();
  });

  afterAll(async () => {
    await cleanupGatewayRows();
    await prisma.$disconnect();
  });

  it("admits one concurrent claim winner and never stores a duplicate live claim", async () => {
    const jobId = await seedCoverageJob("claim-race");
    let selectedCount = 0;
    let releaseSelection = (): void => undefined;
    let markBothSelected = (): void => undefined;
    const selectionBarrier = new Promise<void>((resolve) => {
      releaseSelection = resolve;
    });
    const bothSelected = new Promise<void>((resolve) => {
      markBothSelected = resolve;
    });
    const racingPrisma = prisma.$extends({
      query: {
        affiliateAgentGatewayJobs: {
          async findFirst({ args, query }) {
            const selected = await query(args);
            if (selected?.id === jobId) {
              selectedCount += 1;
              if (selectedCount === 2) markBothSelected();
              await selectionBarrier;
            }
            return selected;
          },
        },
      },
    });
    const harness = createGatewayHarness("claim-race", {
      database: racingPrisma,
    });
    const requests = [
      requestFor("claim-race-one", "COVERAGE_PLANNER", INITIAL_TIME),
      requestFor("claim-race-two", "COVERAGE_PLANNER", INITIAL_TIME),
    ];
    const claims = requests.map((request) => harness.gateway.claim(request));
    await bothSelected;
    releaseSelection();
    const grants = await Promise.all(claims);
    const winners = grants.filter(
      (grant): grant is AffiliateAgentClaimGrant => grant !== null,
    );

    expect(selectedCount).toBe(2);
    expect(winners).toHaveLength(1);
    expect(
      await harness.gateway.claim(requests[grants.indexOf(winners[0])]),
    ).toEqual(winners[0]);
    expect(
      await prisma.affiliateAgentGatewayClaims.count({
        where: { jobId, endedAt: null },
      }),
    ).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayClaims.count({ where: { jobId } }),
    ).toBe(1);
  }, 20_000);
  it("rejects claim admission after an intervening lifecycle advance", async () => {
    const label = "lifecycle-admission-race";
    const jobId = await seedMappingJob(label);
    const supplySourceId = `${RUN_PREFIX}-${label}-supply-source`;
    let readPhase: "BEFORE" | null = null;
    let releaseLifecycleRead = (): void => undefined;
    let markLifecycleRead = (): void => undefined;
    const lifecycleReadReleased = new Promise<void>((resolve) => {
      releaseLifecycleRead = resolve;
    });
    const lifecycleReadEntered = new Promise<void>((resolve) => {
      markLifecycleRead = resolve;
    });
    const racingPrisma = prisma.$extends({
      query: {
        $allOperations: async ({ operation, args, query }) => {
          if (operation === "$queryRaw" && readPhase === "BEFORE") {
            readPhase = null;
            markLifecycleRead();
            await lifecycleReadReleased;
          }
          return query(args);
        },
      },
    });
    const harness = createGatewayHarness(label, {
      database: racingPrisma,
      lifecycle: {
        kind: "AVAILABLE",
        currentGeneration: async () => 7,
        resolveRecordedCommand: async (identity) => identity,
        execute: async () => ({}),
        recover: async () => null,
      },
    });
    readPhase = "BEFORE";
    const claim = harness.gateway.claim(
      requestFor(label, "MAPPING_PRODUCER", INITIAL_TIME),
    );
    await lifecycleReadEntered;
    await prisma.affiliateSupplySources.update({
      where: { id: supplySourceId },
      data: { lifecycleGeneration: 8 },
    });
    releaseLifecycleRead();

    await expect(claim).rejects.toMatchObject({
      code: "LIFECYCLE_GENERATION_STALE",
    });
    expect(
      await prisma.affiliateAgentGatewayClaims.count({ where: { jobId } }),
    ).toBe(0);
    expect(
      await prisma.affiliateAgentGatewayEvents.count({ where: { jobId } }),
    ).toBe(0);
    await expect(
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
    ).resolves.toMatchObject({
      status: "QUEUED",
      activeClaimId: null,
      claimGeneration: 0,
    });
  }, 20_000);
  it("rejects a terminal effect after an intervening lifecycle advance", async () => {
    const label = "lifecycle-terminal-race";
    const jobId = await seedMappingJob(label);
    const supplySourceId = `${RUN_PREFIX}-${label}-supply-source`;
    const harness = createGatewayHarness(label, {
      lifecycle: {
        kind: "AVAILABLE",
        currentGeneration: async () => 7,
        resolveRecordedCommand: async (identity) => identity,
        execute: async () => ({}),
        recover: async () => null,
      },
    });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor(label, "MAPPING_PRODUCER", INITIAL_TIME),
    );
    const result = {
      ...terminalResultFor(grant),
      role: "MAPPING_PRODUCER" as const,
      disposition: "SOURCE_INCOMPATIBLE" as const,
      reasonCodes: ["SOURCE_UNSUPPORTED"] as const,
      summary: "The source layout is not supported.",
      payload: { incompatibilityCode: "UNSUPPORTED_LAYOUT" as const },
    };
    await prisma.affiliateSupplySources.update({
      where: { id: supplySourceId },
      data: { lifecycleGeneration: 8 },
    });

    await expect(
      harness.gateway.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: `${RUN_PREFIX}-${label}-terminal`,
        authorization: authorizationFor(grant),
        result,
      }),
    ).rejects.toMatchObject({
      code: "LIFECYCLE_GENERATION_STALE",
    });
    expect(
      await prisma.affiliateAgentGatewayOperationReceipts.count({
        where: { claimId: grant.envelope.claimId },
      }),
    ).toBe(0);
    await expect(
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
    ).resolves.toMatchObject({
      status: "ACTIVE",
      terminalReceiptId: null,
      claimGeneration: grant.envelope.claimGeneration,
      lifecycleGeneration: 7,
    });
    await expect(
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
    ).resolves.toMatchObject({
      status: "CLAIMED",
      activeClaimId: grant.envelope.claimId,
      terminalReceiptId: null,
    });
  }, 20_000);
  it("handles one concurrent artifact read receipt without duplicate writes", async () => {
    const jobId = await seedCoverageJob("artifact-read-race");
    const idempotencyKey = `${RUN_PREFIX}-artifact-read-race-operation`;
    let selectedCount = 0;
    let releaseSelection = (): void => undefined;
    let markBothSelected = (): void => undefined;
    const selectionBarrier = new Promise<void>((resolve) => {
      releaseSelection = resolve;
    });
    const bothSelected = new Promise<void>((resolve) => {
      markBothSelected = resolve;
    });
    const racingPrisma = prisma.$extends({
      query: {
        affiliateAgentGatewayOperationReceipts: {
          async findUnique({ args, query }) {
            const selected = await query(args);
            const compound = args.where.claimId_idempotencyKey;
            if (
              selected === null &&
              compound?.idempotencyKey === idempotencyKey
            ) {
              selectedCount += 1;
              if (selectedCount === 2) markBothSelected();
              await selectionBarrier;
            }
            return selected;
          },
        },
      },
    });
    const harness = createGatewayHarness("artifact-read-race", {
      database: racingPrisma,
    });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("artifact-read-race", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    const operation = {
      kind: "READ_ARTIFACT" as const,
      idempotencyKey,
      authorization: authorizationFor(grant),
      evidenceRef: "input-evidence",
    };
    const reads = [
      harness.gateway.perform(operation),
      harness.gateway.perform(operation),
    ];
    await bothSelected;
    releaseSelection();
    const results = await Promise.allSettled(reads);

    expect(selectedCount).toBe(2);
    expect(results.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const fulfilled = results.find(
      (result): result is PromiseFulfilledResult<unknown> =>
        result.status === "fulfilled",
    );
    const rejected = results.find((result) => result.status === "rejected");
    expect(fulfilled?.value).toMatchObject({
      kind: "ARTIFACT_READ",
      evidenceRef: "input-evidence",
      byteSize: INPUT_BYTES.byteLength,
    });
    expect(rejected?.reason).toMatchObject({
      code: "OPERATION_IN_PROGRESS",
    });
    expect(
      await prisma.affiliateAgentGatewayOperationReceipts.count({
        where: { jobId, operationKind: "READ_ARTIFACT" },
      }),
    ).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayEvents.count({
        where: { jobId, eventType: "CLAIM_ARTIFACT_READ" },
      }),
    ).toBe(1);
  }, 20_000);

  it("rejects stale claim, lifecycle, deployment, and Supply Contract scope without writes", async () => {
    const coverageJobId = await seedCoverageJob("stale-scope");
    let lifecycleGeneration = 7;
    const lifecycle: AffiliateAgentLifecycleAuthority = {
      kind: "AVAILABLE",
      currentGeneration: async () => lifecycleGeneration,
      resolveRecordedCommand: async (identity) => identity,
      execute: async () => ({}),
      recover: async () => null,
    };
    const harness = createGatewayHarness("stale-scope", { lifecycle });
    const coverageGrant = await claimOrThrow(
      harness.gateway,
      requestFor("stale-scope", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    const authorization = authorizationFor(coverageGrant);
    const initialCoverageFacts = await Promise.all([
      prisma.affiliateAgentGatewayOperationReceipts.count({
        where: { jobId: coverageJobId },
      }),
      prisma.affiliateAgentGatewayEvents.count({
        where: { jobId: coverageJobId },
      }),
    ]);

    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-stale-claim-operation`,
        authorization: {
          ...authorization,
          claimGeneration: authorization.claimGeneration + 1,
        },
      }),
    ).rejects.toMatchObject({ code: "CLAIM_GENERATION_STALE" });
    harness.setActiveBundle(supplyContractStaleBundleFixture);
    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-stale-supply-operation`,
        authorization,
      }),
    ).rejects.toMatchObject({ code: "SUPPLY_CONTRACT_STALE" });
    harness.setActiveBundle(unsupportedDeploymentBundleFixture);
    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-stale-deployment-operation`,
        authorization,
      }),
    ).rejects.toMatchObject({ code: "DEPLOYMENT_CONTRACT_STALE" });
    expect(
      await Promise.all([
        prisma.affiliateAgentGatewayOperationReceipts.count({
          where: { jobId: coverageJobId },
        }),
        prisma.affiliateAgentGatewayEvents.count({
          where: { jobId: coverageJobId },
        }),
      ]),
    ).toEqual(initialCoverageFacts);

    harness.setActiveBundle(contractBundleFixture);
    const staleLifecyclePrerequisite = await seedCompletedReviewerForHuman(
      "stale-lifecycle-prerequisite",
      `${RUN_PREFIX}-stale-lifecycle-supply-source`,
    );
    const humanJobId = await seedHumanJob(
      "stale-lifecycle",
      staleLifecyclePrerequisite,
    );
    const humanGrant = await claimOrThrow(
      harness.gateway,
      requestFor("stale-lifecycle", "HUMAN_DIRECTED_EXECUTOR", INITIAL_TIME),
    );
    const initialHumanFacts = await Promise.all([
      prisma.affiliateAgentGatewayOperationReceipts.count({
        where: { jobId: humanJobId },
      }),
      prisma.affiliateAgentGatewayEvents.count({
        where: { jobId: humanJobId },
      }),
    ]);
    lifecycleGeneration = 8;
    await prisma.affiliateSupplySources.update({
      where: { id: `${RUN_PREFIX}-stale-lifecycle-supply-source` },
      data: { lifecycleGeneration },
    });
    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-stale-lifecycle-operation`,
        authorization: authorizationFor(humanGrant),
      }),
    ).rejects.toMatchObject({ code: "LIFECYCLE_GENERATION_STALE" });
    expect(
      await Promise.all([
        prisma.affiliateAgentGatewayOperationReceipts.count({
          where: { jobId: humanJobId },
        }),
        prisma.affiliateAgentGatewayEvents.count({
          where: { jobId: humanJobId },
        }),
      ]),
    ).toEqual(initialHumanFacts);
  });

  it("enforces heartbeat, five-minute lease, and 20-minute hard-deadline boundaries", async () => {
    await seedCoverageJob("heartbeat-boundary");
    const harness = createGatewayHarness("heartbeat-boundary");
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("heartbeat-boundary", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    expect(grant).toMatchObject({
      heartbeatIntervalSeconds: 60,
      leaseExpiresAt: "2026-08-20T18:05:00.000Z",
      hardDeadlineAt: "2026-08-20T18:20:00.000Z",
    });
    harness.setNow("2026-08-20T18:01:00.000Z");
    const heartbeat = {
      kind: "HEARTBEAT" as const,
      idempotencyKey: `${RUN_PREFIX}-heartbeat-boundary-operation`,
      authorization: authorizationFor(grant),
    };
    const accepted = await harness.gateway.perform(heartbeat);
    expect(accepted.leaseExpiresAt).toBe("2026-08-20T18:06:00.000Z");
    expect(await harness.recreateGateway().perform(heartbeat)).toEqual(
      accepted,
    );
    await expect(
      harness.gateway.perform({
        kind: "READ_ARTIFACT",
        idempotencyKey: heartbeat.idempotencyKey,
        authorization: heartbeat.authorization,
        evidenceRef: "input-evidence",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    await seedCoverageJob("lease-exclusive");
    const leaseGrant = await claimOrThrow(
      harness.gateway,
      requestFor(
        "lease-exclusive",
        "COVERAGE_PLANNER",
        new Date("2026-08-20T18:01:00.000Z"),
      ),
    );
    harness.setNow("2026-08-20T18:06:00.000Z");
    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-lease-exclusive-operation`,
        authorization: authorizationFor(leaseGrant),
      }),
    ).rejects.toMatchObject({ code: "LEASE_EXPIRED" });

    await seedCoverageJob("hard-deadline");
    const deadlineHarness = createGatewayHarness("hard-deadline");
    const deadlineGrant = await claimOrThrow(
      deadlineHarness.gateway,
      requestFor("hard-deadline", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    for (const [index, heartbeatAt] of [
      "2026-08-20T18:04:00.000Z",
      "2026-08-20T18:08:00.000Z",
      "2026-08-20T18:12:00.000Z",
      "2026-08-20T18:16:00.000Z",
      "2026-08-20T18:19:59.999Z",
    ].entries()) {
      deadlineHarness.setNow(heartbeatAt);
      const result = await deadlineHarness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-deadline-heartbeat-${index}`,
        authorization: authorizationFor(deadlineGrant),
      });
      if (index === 4) {
        expect(result.leaseExpiresAt).toBe("2026-08-20T18:20:00.000Z");
      }
    }
    deadlineHarness.setNow("2026-08-20T18:20:00.000Z");
    await expect(
      deadlineHarness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-deadline-exact`,
        authorization: authorizationFor(deadlineGrant),
      }),
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    deadlineHarness.setNow("2026-08-20T18:20:00.001Z");
    await expect(
      deadlineHarness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-deadline-after`,
        authorization: authorizationFor(deadlineGrant),
      }),
    ).rejects.toMatchObject({ code: "HARD_DEADLINE_EXCEEDED" });
  });

  it("commits one terminal result atomically, invalidates its token, and permits only exact replay", async () => {
    const jobId = await seedCoverageJob("terminal-atomic");
    const harness = createGatewayHarness("terminal-atomic");
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("terminal-atomic", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    const operation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: `${RUN_PREFIX}-terminal-atomic-operation`,
      authorization: authorizationFor(grant),
      result: terminalResultFor(grant),
    };
    const accepted = await harness.gateway.perform(operation);
    expect(await harness.recreateGateway().perform(operation)).toEqual(
      accepted,
    );
    await expect(
      harness.gateway.perform({
        ...operation,
        result: { ...operation.result, summary: "Changed terminal input." },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(
      harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-heartbeat-after-terminal`,
        authorization: operation.authorization,
      }),
    ).rejects.toMatchObject({ code: "TOKEN_INVALIDATED" });

    const [job, claim, receipts, terminalEvents] = await Promise.all([
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
      prisma.affiliateAgentGatewayOperationReceipts.findMany({
        where: { jobId },
      }),
      prisma.affiliateAgentGatewayEvents.count({
        where: { jobId, eventType: "CLAIM_TERMINAL_RESULT_ACCEPTED" },
      }),
    ]);
    expect(job).toMatchObject({
      status: "COMPLETED",
      activeClaimId: null,
      terminalReceiptId: accepted.receiptId,
      resultHash: accepted.resultHash,
    });
    expect(claim).toMatchObject({
      status: "COMPLETED",
      terminalReceiptId: accepted.receiptId,
      tokenInvalidatedAt: INITIAL_TIME,
      endedAt: INITIAL_TIME,
    });
    expect(receipts).toHaveLength(1);
    expect(terminalEvents).toBe(1);
  });

  it("uses +5 and +15 retries, blocks failure three immediately, and records trusted reconciliation", async () => {
    const jobId = await seedCoverageJob("invocation-retries");
    const harness = createGatewayHarness("invocation-retries");
    const fail = async (
      grant: AffiliateAgentClaimGrant,
      label: string,
      occurredAt: string,
    ) =>
      harness.reconciler.reconcileInvocation(
        failureOperationFor(
          grant,
          `${RUN_PREFIX}-${label}-failure`,
          "PROCESS_CRASH",
          occurredAt,
        ),
      );

    const first = await claimOrThrow(
      harness.gateway,
      requestFor("retry-one", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    expect(
      await fail(first, "retry-one", INITIAL_TIME.toISOString()),
    ).toMatchObject({
      invocationFailureCount: 1,
      nextAttemptAt: "2026-08-20T18:05:00.000Z",
      isPipelineBlocked: false,
    });
    const firstFailureEvent =
      await prisma.affiliateAgentGatewayEvents.findFirstOrThrow({
        where: { jobId, eventType: "CLAIM_INVOCATION_FAILED" },
      });
    expect(firstFailureEvent).toMatchObject({
      claimId: first.envelope.claimId,
      reasonCodes: ["PROCESS_CRASH"],
      retentionClass: "INDEFINITE",
      payload: {
        evidenceRefs: [],
        invocationFailureCount: 1,
        nextAttemptAt: "2026-08-20T18:05:00.000Z",
        isPipelineBlocked: false,
      },
    });

    harness.setNow("2026-08-20T18:05:00.000Z");
    const second = await claimOrThrow(
      harness.gateway,
      requestFor(
        "retry-two",
        "COVERAGE_PLANNER",
        new Date("2026-08-20T18:05:00.000Z"),
      ),
    );
    harness.setNow("2026-08-20T18:06:00.000Z");
    expect(
      await fail(second, "retry-two", "2026-08-20T18:06:00.000Z"),
    ).toMatchObject({
      invocationFailureCount: 2,
      nextAttemptAt: "2026-08-20T18:21:00.000Z",
      isPipelineBlocked: false,
    });

    harness.setNow("2026-08-20T18:21:00.000Z");
    const third = await claimOrThrow(
      harness.gateway,
      requestFor(
        "retry-three",
        "COVERAGE_PLANNER",
        new Date("2026-08-20T18:21:00.000Z"),
      ),
    );
    harness.setNow("2026-08-20T18:22:00.000Z");
    expect(
      await fail(third, "retry-three", "2026-08-20T18:22:00.000Z"),
    ).toMatchObject({
      invocationFailureCount: 3,
      nextAttemptAt: null,
      isPipelineBlocked: true,
    });
    expect(
      await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
    ).toMatchObject({
      status: "PIPELINE_BLOCKED",
      invocationFailureCount: 3,
      nextAttemptAt: null,
      lastInvocationFailedAt: new Date("2026-08-20T18:22:00.000Z"),
      pipelineBlockedAt: new Date("2026-08-20T18:22:00.000Z"),
      finishedAt: new Date("2026-08-20T18:22:00.000Z"),
    });
  });
  it("bases expiry retries on gateway recording time, not a historical boundary", async () => {
    const jobId = await seedCoverageJob("retry-boundary");
    const harness = createGatewayHarness("retry-boundary");
    await claimOrThrow(
      harness.gateway,
      requestFor("retry-boundary", "COVERAGE_PLANNER", INITIAL_TIME),
    );

    harness.setNow("2026-08-20T18:20:00.000Z");
    expect(
      await harness.recreateGateway().reconcile({
        limit: 10,
        reconcileBefore: "2026-08-20T18:05:00.000Z",
      }),
    ).toMatchObject({
      examinedClaims: 1,
      expiredClaims: 1,
    });
    expect(
      await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
    ).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 1,
      lastInvocationFailedAt: new Date("2026-08-20T18:20:00.000Z"),
      nextAttemptAt: new Date("2026-08-20T18:25:00.000Z"),
    });
  });
  it("skips pending artifact reads before filling an expiry batch", async () => {
    await seedCoverageJob("expiry-pending-artifact");
    await seedCoverageJob("expiry-ready");
    const harness = createGatewayHarness("expiry-batch-selection");
    const pendingGrant = await claimOrThrow(
      harness.gateway,
      requestFor("expiry-pending-artifact", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    const readyGrant = await claimOrThrow(
      harness.gateway,
      requestFor("expiry-ready", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    await prisma.affiliateAgentGatewayClaims.update({
      where: { id: pendingGrant.envelope.claimId },
      data: {
        leaseExpiresAt: new Date("2026-08-20T18:05:00.000Z"),
        hardDeadlineAt: new Date("2026-08-20T18:20:00.000Z"),
        tokenExpiresAt: new Date("2026-08-20T18:20:00.000Z"),
      },
    });
    await prisma.affiliateAgentGatewayClaims.update({
      where: { id: readyGrant.envelope.claimId },
      data: {
        leaseExpiresAt: new Date("2026-08-20T18:05:00.000Z"),
        hardDeadlineAt: new Date("2026-08-20T18:21:00.000Z"),
        tokenExpiresAt: new Date("2026-08-20T18:21:00.000Z"),
      },
    });
    await prisma.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: `${RUN_PREFIX}-pending-artifact-read`,
        claimId: pendingGrant.envelope.claimId,
        jobId: pendingGrant.envelope.jobId,
        claimGeneration: pendingGrant.envelope.claimGeneration,
        idempotencyKey: `${RUN_PREFIX}-pending-artifact-read`,
        operationKind: "READ_ARTIFACT",
        commandName: null,
        requestHash: INPUT_HASH,
        startedAt: new Date("2026-08-20T18:04:59.000Z"),
      },
    });

    harness.setNow("2026-08-20T18:05:00.000Z");
    await expect(
      harness.recreateGateway().reconcile({ limit: 1 }),
    ).resolves.toMatchObject({
      examinedClaims: 1,
      expiredClaims: 1,
    });
    const [pendingClaim, readyClaim] = await Promise.all([
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: pendingGrant.envelope.claimId },
      }),
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: readyGrant.envelope.claimId },
      }),
    ]);
    expect(pendingClaim.status).toBe("ACTIVE");
    expect(readyClaim.status).toBe("EXPIRED");
  });

  it("counts three invalid submissions as one invocation failure", async () => {
    const jobId = await seedCoverageJob("schema-exhaustion");
    const harness = createGatewayHarness("schema-exhaustion");
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("schema-exhaustion", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    const authorization = authorizationFor(grant);

    for (const submission of [1, 2, 3] as const) {
      const outcome = await harness.gateway.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: `${RUN_PREFIX}-invalid-schema-${submission}`,
        authorization,
        result: { schemaVersion: 1, submission },
      });
      if (submission < 3) {
        expect(outcome).toMatchObject({
          kind: "SCHEMA_CORRECTION_REQUIRED",
          submissionNumber: submission,
        });
      } else {
        expect(outcome).toMatchObject({
          kind: "INVOCATION_FAILED",
          failureCode: "SCHEMA_CORRECTIONS_EXHAUSTED",
          invocationFailureCount: 1,
        });
      }
    }
    const [job, claim, receiptCount, failureEventCount] = await Promise.all([
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
      prisma.affiliateAgentGatewayOperationReceipts.count({ where: { jobId } }),
      prisma.affiliateAgentGatewayEvents.count({
        where: { jobId, eventType: "CLAIM_INVOCATION_FAILED" },
      }),
    ]);
    expect(job.invocationFailureCount).toBe(1);
    expect(claim).toMatchObject({
      schemaCorrectionCount: 3,
      safeFailureCode: "SCHEMA_CORRECTIONS_EXHAUSTED",
    });
    expect(receiptCount).toBe(3);
    expect(failureEventCount).toBe(1);
  });

  it("recovers a lost capture response after restart with one external effect and one artifact", async () => {
    const jobId = await seedCoverageJob("provider-recovery");
    const capturedBytes = Buffer.from("recovered capture bytes", "utf8");
    const captureOutput = {
      evidenceRef: "recovered-capture",
      artifactId: `${RUN_PREFIX}-provider-recovery-artifact`,
      sha256: createHash("sha256").update(capturedBytes).digest("hex"),
      mimeType: "text/markdown",
      byteSize: capturedBytes.byteLength,
    };
    const effects = new Map<string, typeof captureOutput>();
    let externalEffectCount = 0;
    const commands: AffiliateAgentCommandAdapters = {
      transactional: {},
      external: {
        CAPTURE_CLAIM_URL: {
          start: async (operationKey) => {
            externalEffectCount += 1;
            effects.set(operationKey, captureOutput);
            throw new Error("simulated provider response loss");
          },
          recover: async (operationKey) => effects.get(operationKey) ?? null,
        },
      },
    };
    const harness = createGatewayHarness("provider-recovery", {
      commands,
      readImmutable: async ({ fileId }) => {
        if (fileId !== captureOutput.artifactId) {
          throw new Error("Unexpected recovered artifact identifier.");
        }
        return {
          bytes: new Uint8Array(capturedBytes),
          mimeType: captureOutput.mimeType,
          byteSize: capturedBytes.byteLength,
          sourceUrl: "https://evidence.example.test/recovered",
        };
      },
    });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("provider-recovery", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-provider-recovery-operation`,
        authorization: authorizationFor(grant),
        command: {
          type: "CAPTURE_CLAIM_URL",
          data: {
            urlRef: "input-evidence",
            captureProfileRef: "input-evidence",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_COMMAND_UNRESOLVED" });
    harness.setNow("2026-08-20T18:01:00.000Z");

    const reports = await Promise.all([
      harness.recreateGateway().reconcile({ limit: 10 }),
      harness.recreateGateway().reconcile({ limit: 10 }),
    ]);
    expect(
      reports.reduce((sum, report) => sum + report.completedReceipts, 0),
    ).toBe(1);
    expect(externalEffectCount).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayArtifacts.count({
        where: {
          claimId: grant.envelope.claimId,
          evidenceRef: "recovered-capture",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayEvents.count({
        where: { jobId, eventType: "EXTERNAL_COMMAND_SUCCEEDED" },
      }),
    ).toBe(1);
    expect(await harness.recreateGateway().reconcile({ limit: 10 })).toEqual(
      zeroTransitionReport,
    );
  });

  it("recovers a lost discovery-provider response after restart without repeating the provider effect", async () => {
    const jobId = await seedCoverageJob("discovery-recovery");
    const discoveryOutput = {
      evidenceRef: "discovery-evidence",
      artifactId: `${RUN_PREFIX}-discovery-recovery-artifact`,
      sha256: INPUT_HASH,
      mimeType: "text/markdown",
      byteSize: INPUT_BYTES.byteLength,
    };
    const effects = new Map<string, typeof discoveryOutput>();
    let providerEffectCount = 0;
    const commands = {
      transactional: {},
      external: {
        RUN_DISCOVERY_QUERY: {
          start: async (operationKey: string) => {
            providerEffectCount += 1;
            effects.set(operationKey, discoveryOutput);
            throw new Error("simulated discovery-provider response loss");
          },
          recover: async (operationKey: string) =>
            effects.get(operationKey) ?? null,
        },
      },
    } as unknown as AffiliateAgentCommandAdapters;
    const harness = createGatewayHarness("discovery-recovery", { commands });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("discovery-recovery", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-discovery-recovery-operation`,
        authorization: authorizationFor(grant),
        command: {
          type: "RUN_DISCOVERY_QUERY",
          data: {
            strategyRef: "input-evidence",
            queryRef: "input-evidence",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_COMMAND_UNRESOLVED" });
    harness.setNow("2026-08-20T18:01:00.000Z");

    expect(
      await harness.recreateGateway().reconcile({ limit: 10 }),
    ).toMatchObject({
      examinedReceipts: 1,
      recoveredReceipts: 1,
      completedReceipts: 1,
      unresolvedReceipts: 0,
    });
    expect(providerEffectCount).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayArtifacts.count({
        where: {
          claimId: grant.envelope.claimId,
          evidenceRef: discoveryOutput.evidenceRef,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayEvents.count({
        where: { jobId, eventType: "EXTERNAL_COMMAND_SUCCEEDED" },
      }),
    ).toBe(1);
    expect(await harness.recreateGateway().reconcile({ limit: 10 })).toEqual(
      zeroTransitionReport,
    );
  });
  it("scopes malformed provider recovery to its lane", async () => {
    const jobId = await seedCoverageJob("provider-lane-failure");
    const captureOutput = {
      evidenceRef: "provider-lane-failure-evidence",
      artifactId: `${RUN_PREFIX}-provider-lane-failure-artifact`,
      sha256: INPUT_HASH,
      mimeType: "application/json",
      byteSize: INPUT_BYTES.byteLength,
    };
    const commands: AffiliateAgentCommandAdapters = {
      transactional: {},
      external: {
        CAPTURE_CLAIM_URL: {
          start: async () => {
            throw new Error("simulated provider response loss");
          },
          recover: async () => captureOutput,
        },
      },
    };
    const harness = createGatewayHarness("provider-lane-failure", {
      commands,
      lifecycle: {
        kind: "AVAILABLE",
        currentGeneration: async () => 7,
        resolveRecordedCommand: async () => null,
        execute: async () => ({}),
        recover: async () => null,
      },
      readImmutable: async () => ({
        bytes: new Uint8Array(INPUT_BYTES),
        mimeType: "text/markdown",
        byteSize: INPUT_BYTES.byteLength,
        sourceUrl: "https://evidence.example.test/provider-lane-failure",
      }),
    });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("provider-lane-failure", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-provider-lane-failure-operation`,
        authorization: authorizationFor(grant),
        command: {
          type: "CAPTURE_CLAIM_URL",
          data: {
            urlRef: "input-evidence",
            captureProfileRef: "input-evidence",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_COMMAND_UNRESOLVED" });
    harness.setNow("2026-08-20T18:01:00.000Z");

    expect(
      await harness.recreateGateway().reconcile({ limit: 10 }),
    ).toMatchObject({
      examinedReceipts: 1,
      recoveredReceipts: 1,
      completedReceipts: 0,
      unresolvedReceipts: 1,
      isAdmissionHalted: false,
    });
    const [receipt, claim, job] = await Promise.all([
      prisma.affiliateAgentGatewayOperationReceipts.findFirstOrThrow({
        where: { jobId },
      }),
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
    ]);
    expect(receipt).toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "PARTIAL_COMMAND_UNRESOLVED",
      reconcileAfter: null,
    });
    expect(claim).toMatchObject({ status: "RECONCILIATION_REQUIRED" });
    expect(job).toMatchObject({ status: "RECONCILIATION_REQUIRED" });

    const nextJobId = await seedMappingJob("after-provider-lane-failure");
    const nextGrant = await claimOrThrow(
      harness.recreateGateway(),
      requestFor(
        "after-provider-lane-failure",
        "MAPPING_PRODUCER",
        new Date("2026-08-20T18:01:00.000Z"),
      ),
    );
    expect(nextGrant.envelope.jobId).toBe(nextJobId);
  });

  it("returns operation in progress for an early exact external replay without recovery", async () => {
    await seedCoverageJob("early-external-replay");
    const effects = new Map<string, Readonly<Record<string, unknown>>>();
    let recoverCount = 0;
    const output = {
      evidenceRef: "early-replay-evidence",
      artifactId: `${RUN_PREFIX}-early-replay-artifact`,
      sha256: INPUT_HASH,
      mimeType: "text/markdown",
      byteSize: INPUT_BYTES.byteLength,
    };
    const commands: AffiliateAgentCommandAdapters = {
      transactional: {},
      external: {
        CAPTURE_CLAIM_URL: {
          start: async (operationKey) => {
            effects.set(operationKey, output);
            throw new Error("simulated capture response loss");
          },
          recover: async (operationKey) => {
            recoverCount += 1;
            return effects.get(operationKey) ?? null;
          },
        },
      },
    };
    const harness = createGatewayHarness("early-external-replay", { commands });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("early-external-replay", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    const operation = {
      kind: "EXECUTE_COMMAND" as const,
      idempotencyKey: `${RUN_PREFIX}-early-external-replay-operation`,
      authorization: authorizationFor(grant),
      command: {
        type: "CAPTURE_CLAIM_URL" as const,
        data: {
          urlRef: "input-evidence",
          captureProfileRef: "input-evidence",
        },
      },
    };
    await expect(harness.gateway.perform(operation)).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });

    await expect(
      harness.recreateGateway().perform(operation),
    ).rejects.toMatchObject({
      code: "OPERATION_IN_PROGRESS",
      receiptId: expect.any(String),
    });
    expect(recoverCount).toBe(0);
  });

  it("resolves a pending external effect before hard-deadline expiry reconciliation", async () => {
    const jobId = await seedCoverageJob("pending-at-deadline");
    const effects = new Map<string, Readonly<Record<string, unknown>>>();
    let recoverCount = 0;
    const output = {
      evidenceRef: "deadline-capture-evidence",
      artifactId: `${RUN_PREFIX}-deadline-capture-artifact`,
      sha256: INPUT_HASH,
      mimeType: "text/markdown",
      byteSize: INPUT_BYTES.byteLength,
    };
    const commands: AffiliateAgentCommandAdapters = {
      transactional: {},
      external: {
        CAPTURE_CLAIM_URL: {
          start: async (operationKey) => {
            effects.set(operationKey, output);
            throw new Error("simulated capture response loss");
          },
          recover: async (operationKey) => {
            recoverCount += 1;
            return effects.get(operationKey) ?? null;
          },
        },
      },
    };
    const harness = createGatewayHarness("pending-at-deadline", { commands });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("pending-at-deadline", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    const authorization = authorizationFor(grant);
    for (const [minute, suffix] of [
      [4, "one"],
      [8, "two"],
      [12, "three"],
      [16, "four"],
    ] as const) {
      harness.setNow(
        `2026-08-20T18:${String(minute).padStart(2, "0")}:00.000Z`,
      );
      await harness.gateway.perform({
        kind: "HEARTBEAT",
        idempotencyKey: `${RUN_PREFIX}-deadline-heartbeat-${suffix}`,
        authorization,
      });
    }
    harness.setNow("2026-08-20T18:19:59.000Z");
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-pending-at-deadline-operation`,
        authorization,
        command: {
          type: "CAPTURE_CLAIM_URL",
          data: {
            urlRef: "input-evidence",
            captureProfileRef: "input-evidence",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_COMMAND_UNRESOLVED" });

    harness.setNow("2026-08-20T18:20:00.000Z");
    expect(
      await harness.recreateGateway().reconcile({ limit: 10 }),
    ).toMatchObject({
      examinedReceipts: 0,
      expiredClaims: 0,
    });
    expect(recoverCount).toBe(0);
    expect(
      await prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
    ).toMatchObject({ status: "ACTIVE", tokenInvalidatedAt: null });

    harness.setNow("2026-08-20T18:20:59.000Z");
    expect(
      await harness.recreateGateway().reconcile({ limit: 10 }),
    ).toMatchObject({
      completedReceipts: 1,
      expiredClaims: 1,
    });
    expect(recoverCount).toBe(1);
    const orderedEvents = await prisma.affiliateAgentGatewayEvents.findMany({
      where: {
        jobId,
        eventType: { in: ["EXTERNAL_COMMAND_SUCCEEDED", "CLAIM_EXPIRED"] },
      },
      orderBy: { sequence: "asc" },
      select: { eventType: true },
    });
    expect(orderedEvents.map(({ eventType }) => eventType)).toEqual([
      "EXTERNAL_COMMAND_SUCCEEDED",
      "CLAIM_EXPIRED",
    ]);
  });

  it("recovers a lost lifecycle response after restart with one transition", async () => {
    const lifecyclePrerequisite = await seedCompletedReviewerForHuman(
      "lifecycle-recovery-prerequisite",
      `${RUN_PREFIX}-lifecycle-recovery-supply-source`,
    );
    const jobId = await seedHumanJob(
      "lifecycle-recovery",
      lifecyclePrerequisite,
    );
    const effects = new Map<string, Readonly<Record<string, unknown>>>();
    let lifecycleTransitionCount = 0;
    const lifecycle: AffiliateAgentLifecycleAuthority = {
      kind: "AVAILABLE",
      currentGeneration: async () => 7,
      resolveRecordedCommand: async (identity) => identity,
      execute: async ({ receiptId }) => {
        lifecycleTransitionCount += 1;
        effects.set(receiptId, {
          transitionReceipt: receiptId,
          lifecycleGeneration: 8,
        });
        throw new Error("simulated lifecycle response loss");
      },
      recover: async (receiptId) => effects.get(receiptId) ?? null,
    };
    const harness = createGatewayHarness("lifecycle-recovery", { lifecycle });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("lifecycle-recovery", "HUMAN_DIRECTED_EXECUTOR", INITIAL_TIME),
    );
    const subject = grant.envelope.subject;
    if (subject.type !== "HUMAN_DIRECTED_EXECUTOR") {
      throw new Error("Expected a human-directed claim subject.");
    }
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-lifecycle-recovery-operation`,
        authorization: authorizationFor(grant),
        command: {
          type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
          data: {
            caseId: subject.caseId,
            decisionHash: subject.decisionHash,
            lifecycleCommandRef: subject.lifecycleCommandRef,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_COMMAND_UNRESOLVED" });
    harness.setNow("2026-08-20T18:06:00.000Z");

    const restarted = harness.recreateGateway();
    expect(await restarted.reconcile({ limit: 10 })).toMatchObject({
      examinedReceipts: 1,
      recoveredReceipts: 1,
      completedReceipts: 1,
      unresolvedReceipts: 0,
      expiredClaims: 0,
    });
    expect(lifecycleTransitionCount).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayEvents.count({
        where: { jobId, eventType: "LIFECYCLE_COMMAND_SUCCEEDED" },
      }),
    ).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
    ).toMatchObject({ status: "ACTIVE", tokenInvalidatedAt: null });
    const lifecycleReceipt =
      await prisma.affiliateAgentGatewayOperationReceipts.findFirstOrThrow({
        where: {
          claimId: grant.envelope.claimId,
          commandName: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
        },
      });
    expect(lifecycleReceipt.status).toBe("SUCCEEDED");
    expect(
      await restarted.perform({
        kind: "SUBMIT_RESULT",
        idempotencyKey: `${RUN_PREFIX}-lifecycle-recovery-terminal`,
        authorization: authorizationFor(grant),
        result: humanTerminalResultFor(grant, lifecycleReceipt.id),
      }),
    ).toMatchObject({
      kind: "TERMINAL_ACCEPTED",
      disposition: "LIFECYCLE_COMMAND_EXECUTED",
    });
    expect(await harness.recreateGateway().reconcile({ limit: 10 })).toEqual(
      zeroTransitionReport,
    );
  });

  it("rejects future reconciliation and lets concurrent expiry reconciliation count once", async () => {
    const jobId = await seedCoverageJob("concurrent-expiry");
    const harness = createGatewayHarness("concurrent-expiry");
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("concurrent-expiry", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    await expect(
      harness.gateway.reconcile({
        limit: 10,
        reconcileBefore: "2026-08-20T18:05:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
    expect(
      await prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
    ).toMatchObject({ status: "ACTIVE", tokenInvalidatedAt: null });

    harness.setNow("2026-08-20T18:05:00.000Z");
    const reports = await Promise.all([
      harness.recreateGateway().reconcile({ limit: 10 }),
      harness.recreateGateway().reconcile({ limit: 10 }),
    ]);
    expect(reports.reduce((sum, report) => sum + report.expiredClaims, 0)).toBe(
      1,
    );
    expect(
      await prisma.affiliateAgentGatewayEvents.count({
        where: { jobId, eventType: "CLAIM_EXPIRED" },
      }),
    ).toBe(1);
    expect(
      await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
    ).toMatchObject({
      status: "RETRY_WAIT",
      invocationFailureCount: 1,
      nextAttemptAt: new Date("2026-08-20T18:10:00.000Z"),
    });
    expect(await harness.recreateGateway().reconcile({ limit: 10 })).toEqual(
      zeroTransitionReport,
    );
  });

  it("records exact terminal timestamps when expiry consumes failure three", async () => {
    const jobId = await seedCoverageJob("third-expiry", {
      invocationFailureCount: 2,
    });
    const harness = createGatewayHarness("third-expiry");
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("third-expiry", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    harness.setNow("2026-08-20T18:05:00.000Z");
    expect(await harness.gateway.reconcile({ limit: 10 })).toMatchObject({
      examinedClaims: 1,
      expiredClaims: 1,
    });
    const [job, claim] = await Promise.all([
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: jobId },
      }),
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
    ]);
    expect(job).toMatchObject({
      status: "PIPELINE_BLOCKED",
      invocationFailureCount: 3,
      lastInvocationFailedAt: new Date("2026-08-20T18:05:00.000Z"),
      pipelineBlockedAt: new Date("2026-08-20T18:05:00.000Z"),
      finishedAt: new Date("2026-08-20T18:05:00.000Z"),
      nextAttemptAt: null,
    });
    expect(claim).toMatchObject({
      status: "EXPIRED",
      safeFailureCode: "TIMEOUT",
      endedAt: new Date("2026-08-20T18:05:00.000Z"),
      tokenInvalidatedAt: new Date("2026-08-20T18:05:00.000Z"),
    });
    expect(await harness.gateway.reconcile({ limit: 10 })).toEqual(
      zeroTransitionReport,
    );
  });

  it("halts admission when reconciliation finds an impossible partial state", async () => {
    await seedCoverageJob("impossible-state");
    const capturedBytes = Buffer.from("impossible recovered bytes", "utf8");
    const captureOutput = {
      evidenceRef: "impossible-recovery",
      artifactId: `${RUN_PREFIX}-impossible-state-artifact`,
      sha256: createHash("sha256").update(capturedBytes).digest("hex"),
      mimeType: "text/markdown",
      byteSize: capturedBytes.byteLength,
    };
    const effects = new Map<string, typeof captureOutput>();
    const commands: AffiliateAgentCommandAdapters = {
      transactional: {},
      external: {
        CAPTURE_CLAIM_URL: {
          start: async (operationKey) => {
            effects.set(operationKey, captureOutput);
            throw new Error("simulated response loss");
          },
          recover: async (operationKey) => effects.get(operationKey) ?? null,
        },
      },
    };
    const harness = createGatewayHarness("impossible-state", {
      commands,
      readImmutable: async () => ({
        bytes: new Uint8Array(capturedBytes),
        mimeType: captureOutput.mimeType,
        byteSize: capturedBytes.byteLength,
        sourceUrl: "https://evidence.example.test/impossible",
      }),
    });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor("impossible-state", "COVERAGE_PLANNER", INITIAL_TIME),
    );
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-impossible-state-operation`,
        authorization: authorizationFor(grant),
        command: {
          type: "CAPTURE_CLAIM_URL",
          data: {
            urlRef: "input-evidence",
            captureProfileRef: "input-evidence",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PARTIAL_COMMAND_UNRESOLVED" });
    await prisma.affiliateAgentGatewayOperationReceipts.updateMany({
      where: { claimId: grant.envelope.claimId, status: "PENDING" },
      data: { claimGeneration: grant.envelope.claimGeneration + 1 },
    });
    harness.setNow("2026-08-20T18:01:00.000Z");
    expect(
      await harness.recreateGateway().reconcile({ limit: 10 }),
    ).toMatchObject({
      examinedReceipts: 1,
      recoveredReceipts: 1,
      unresolvedReceipts: 1,
      isAdmissionHalted: true,
    });
    expect(
      await prisma.affiliateAgentGatewayOperationReceipts.findFirstOrThrow({
        where: { claimId: grant.envelope.claimId },
      }),
    ).toMatchObject({
      status: "UNKNOWN",
      safeErrorCode: "GATEWAY_ADMISSION_HALTED",
      reconcileAfter: null,
    });
    await seedCoverageJob("after-impossible-state");
    await expect(
      harness.gateway.claim(
        requestFor(
          "after-impossible-state",
          "COVERAGE_PLANNER",
          new Date("2026-08-20T18:01:00.000Z"),
        ),
      ),
    ).rejects.toMatchObject({ code: "GATEWAY_ADMISSION_HALTED" });
    expect(
      await harness.recreateGateway().reconcile({ limit: 10 }),
    ).toMatchObject({
      examinedClaims: 0,
      expiredClaims: 0,
      examinedReceipts: 0,
      recoveredReceipts: 0,
      completedReceipts: 0,
      unresolvedReceipts: 0,
      isAdmissionHalted: true,
    });
  });
  it("persists a duplicate package commit block atomically", async () => {
    const label = "commit-replay-block";
    const supplySourceId = `${RUN_PREFIX}-${label}-supply-source`;
    await seedMappingJob(label);
    const candidatePackage = {
      schemaVersion: 1 as const,
      supplySourceId,
      listingKind: "EVENT" as const,
      listUrlRef: "input-evidence",
      itemSelector: ".event",
      fields: [],
      evidenceRefs: ["input-evidence"] as const,
    };
    const packageHash = hashAffiliateAgentValue(candidatePackage);
    let commitCalls = 0;
    const harness = createGatewayHarness(label, {
      lifecycle: {
        kind: "AVAILABLE",
        currentGeneration: async () => 7,
        resolveRecordedCommand: async (identity) => identity,
        execute: async ({ receiptId }) => ({
          transitionReceipt: receiptId,
          lifecycleGeneration: 8,
        }),
        recover: async () => null,
      },
      commands: {
        transactional: {
          VALIDATE_DECLARATIVE_PACKAGE: {
            execute: async () => ({
              isValid: true as const,
              validatedPackageHash: packageHash,
            }),
          },
          COMMIT_DECLARATIVE_PACKAGE: {
            execute: async () => {
              commitCalls += 1;
              return { packageHash };
            },
          },
        },
        external: {},
      },
    });
    const grant = await claimOrThrow(
      harness.gateway,
      requestFor(label, "MAPPING_PRODUCER", INITIAL_TIME),
    );
    const authorization = authorizationFor(grant);
    const validation = await harness.gateway.perform({
      kind: "EXECUTE_COMMAND",
      idempotencyKey: `${RUN_PREFIX}-${label}-validation`,
      authorization,
      command: {
        type: "VALIDATE_DECLARATIVE_PACKAGE",
        data: {
          candidatePackage,
          evidenceManifestHash: grant.envelope.evidenceManifest.hash,
        },
      },
    });
    if (validation.kind !== "COMMAND_SUCCEEDED") {
      throw new Error("Expected package validation to succeed.");
    }
    const firstCommit = await harness.gateway.perform({
      kind: "EXECUTE_COMMAND",
      idempotencyKey: `${RUN_PREFIX}-${label}-commit-one`,
      authorization,
      command: {
        type: "COMMIT_DECLARATIVE_PACKAGE",
        data: {
          validationReceiptId: validation.receiptId,
          validatedPackageHash: packageHash,
        },
      },
    });
    expect(firstCommit).toMatchObject({
      kind: "COMMAND_SUCCEEDED",
      safeOutput: { packageHash },
    });
    await expect(
      harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-${label}-commit-two`,
        authorization,
        command: {
          type: "COMMIT_DECLARATIVE_PACKAGE",
          data: {
            validationReceiptId: validation.receiptId,
            validatedPackageHash: "f".repeat(64),
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "PARTIAL_COMMAND_UNRESOLVED",
    });
    expect(commitCalls).toBe(1);
    const [claim, job, blockedEvent] = await Promise.all([
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: grant.envelope.claimId },
      }),
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
        where: { id: grant.envelope.jobId },
      }),
      prisma.affiliateAgentGatewayEvents.findFirstOrThrow({
        where: {
          jobId: grant.envelope.jobId,
          eventType: "COMMIT_REPLAY_BLOCKED",
        },
      }),
    ]);
    expect(claim).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
      safeFailureCode: "COMMIT_REPLAY_BLOCKED",
    });
    expect(job).toMatchObject({
      status: "PIPELINE_BLOCKED",
      activeClaimId: null,
      nextAttemptAt: null,
    });
    expect(blockedEvent).toMatchObject({
      eventType: "COMMIT_REPLAY_BLOCKED",
      receiptId: firstCommit.receiptId,
    });
  });
  it("executes one fresh supervised claim for every production role", async () => {
    const mappingCandidatePackageFor = (supplySourceId: string) => ({
      schemaVersion: 1 as const,
      supplySourceId,
      listingKind: "EVENT" as const,
      listUrlRef: "input-evidence",
      itemSelector: ".event",
      fields: [],
      evidenceRefs: [],
    });
    const mappingPackageHash = hashAffiliateAgentValue(
      mappingCandidatePackageFor(
        `${RUN_PREFIX}-four-role-mapping-supply-source`,
      ),
    );
    const childEnvironmentKeys: string[][] = [];
    const launchedClaims = new Map<
      AffiliateAgentRole,
      AffiliateAgentClaimEnvelope
    >();

    const lifecycle: AffiliateAgentLifecycleAuthority = {
      kind: "AVAILABLE",
      currentGeneration: async () => 7,
      resolveRecordedCommand: async (identity) => identity,
      execute: async ({ receiptId }) => ({
        transitionReceipt: receiptId,
        lifecycleGeneration: 8,
      }),
      recover: async () => null,
    };
    const commands: AffiliateAgentCommandAdapters = {
      transactional: {
        VALIDATE_DECLARATIVE_PACKAGE: {
          execute: async () => ({
            isValid: true as const,
            validatedPackageHash: mappingPackageHash,
          }),
        },
        COMMIT_DECLARATIVE_PACKAGE: {
          execute: async () => ({
            packageHash: mappingPackageHash,
          }),
        },
      },
      external: {},
    };
    const reviewerEffectHandler = () => ({
      execute: async ({ receiptId }: { receiptId: string }) => ({
        effect: "APPLIED",
        receiptId,
      }),
      recover: async () => null,
    });
    const harness = createGatewayHarness("four-role-smoke", {
      commands,
      terminalEffects: {
        APPROVED: reviewerEffectHandler(),
        ACTIVATED: reviewerEffectHandler(),
        PRODUCER_REPAIR_REQUIRED: reviewerEffectHandler(),
        REGRESSION_ASSESSED: reviewerEffectHandler(),
        SOURCE_EXCLUSION_ASSESSED: reviewerEffectHandler(),
        EXACT_TARGET_REJECTED: reviewerEffectHandler(),
        HUMAN_REVIEW_REQUIRED: reviewerEffectHandler(),
      },
      lifecycle,
    });

    type GatewayTerminalResultCommon = Readonly<{
      schemaVersion: 1;
      jobId: string;
      claimId: string;
      claimGeneration: number;
      lifecycleGeneration: number | null;
      deploymentContractVersion: number;
      deploymentContractHash: string;
      supplyContractVersion: number;
      supplyContractHash: string;
      roleContractVersion: number;
      roleContractHash: string;
      promptTemplateVersion: number;
      promptTemplateHash: string;
      workerId: string;
      invocationId: string;
      evidenceRefs: string[];
    }>;

    const terminalResultCommonFor = (
      envelope: AffiliateAgentClaimEnvelope,
    ): GatewayTerminalResultCommon => ({
      schemaVersion: 1 as const,
      jobId: envelope.jobId,
      claimId: envelope.claimId,
      claimGeneration: envelope.claimGeneration,
      lifecycleGeneration: envelope.lifecycleGeneration,
      deploymentContractVersion: envelope.deploymentContractVersion,
      deploymentContractHash: envelope.deploymentContractHash,
      supplyContractVersion: envelope.supplyContractVersion,
      supplyContractHash: envelope.supplyContractHash,
      roleContractVersion: envelope.roleContractVersion,
      roleContractHash: envelope.roleContractHash,
      promptTemplateVersion: envelope.promptTemplateVersion,
      promptTemplateHash: envelope.promptTemplateHash,
      workerId: envelope.workerId,
      invocationId: envelope.invocationId,
      evidenceRefs: envelope.evidenceManifest.entries.map(
        ({ evidenceRef }) => evidenceRef,
      ),
    });

    const mappingTerminalResultFor = async (
      authorization: AffiliateAgentClaimAuthorization,
      envelope: Extract<
        AffiliateAgentClaimEnvelope,
        { role: "MAPPING_PRODUCER" }
      >,
      common: GatewayTerminalResultCommon,
    ): Promise<unknown> => {
      if (envelope.subject.type !== "MAPPING_PRODUCER") {
        throw new Error("Expected a Mapping Producer subject.");
      }
      const candidatePackage = mappingCandidatePackageFor(
        envelope.subject.supplySourceId,
      );
      const validation = await harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-four-role-mapping-validation`,
        authorization,
        command: {
          type: "VALIDATE_DECLARATIVE_PACKAGE",
          data: {
            candidatePackage,
            evidenceManifestHash: envelope.evidenceManifest.hash,
          },
        },
      });
      if (
        validation.kind !== "COMMAND_SUCCEEDED" ||
        validation.safeOutput?.validatedPackageHash !== mappingPackageHash
      ) {
        throw new Error("Mapping validation did not return its package hash.");
      }
      const commit = await harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-four-role-mapping-commit`,
        authorization,
        command: {
          type: "COMMIT_DECLARATIVE_PACKAGE",
          data: {
            validationReceiptId: validation.receiptId,
            validatedPackageHash: mappingPackageHash,
          },
        },
      });
      if (
        commit.kind !== "COMMAND_SUCCEEDED" ||
        commit.safeOutput?.packageHash !== mappingPackageHash
      ) {
        throw new Error("Mapping commit did not return its package hash.");
      }
      return {
        ...common,
        role: envelope.role,
        disposition: "PACKAGE_COMMITTED" as const,
        reasonCodes: ["SCHEMA_VALIDATED"] as const,
        summary: "The declarative package passed validation and committed.",
        payload: {
          packageHash: mappingPackageHash,
          commitReceiptId: commit.receiptId,
        },
      };
    };

    const humanTerminalResultFor = async (
      authorization: AffiliateAgentClaimAuthorization,
      envelope: Extract<
        AffiliateAgentClaimEnvelope,
        { role: "HUMAN_DIRECTED_EXECUTOR" }
      >,
      common: GatewayTerminalResultCommon,
    ): Promise<unknown> => {
      if (envelope.subject.type !== "HUMAN_DIRECTED_EXECUTOR") {
        throw new Error("Expected a Human-directed Executor subject.");
      }
      const lifecycleResult = await harness.gateway.perform({
        kind: "EXECUTE_COMMAND",
        idempotencyKey: `${RUN_PREFIX}-four-role-human-lifecycle`,
        authorization,
        command: {
          type: "EXECUTE_RECORDED_LIFECYCLE_COMMAND",
          data: {
            caseId: envelope.subject.caseId,
            decisionHash: envelope.subject.decisionHash,
            lifecycleCommandRef: envelope.subject.lifecycleCommandRef,
          },
        },
      });
      if (lifecycleResult.kind !== "COMMAND_SUCCEEDED") {
        throw new Error("The recorded lifecycle command did not succeed.");
      }
      return {
        ...common,
        role: envelope.role,
        disposition: "LIFECYCLE_COMMAND_EXECUTED" as const,
        reasonCodes: ["EVIDENCE_VERIFIED"] as const,
        summary: "The recorded human decision executed once.",
        payload: {
          caseId: envelope.subject.caseId,
          lifecycleCommandRef: envelope.subject.lifecycleCommandRef,
          receiptId: lifecycleResult.receiptId,
        },
      };
    };

    const terminalResultForClaim = async (
      token: string,
      envelope: AffiliateAgentClaimEnvelope,
    ): Promise<unknown> => {
      const authorization = authorizationForTokenAndEnvelope(token, envelope);
      const common = terminalResultCommonFor(envelope);

      switch (envelope.role) {
        case "COVERAGE_PLANNER":
          return {
            ...common,
            role: envelope.role,
            disposition: "CAMPAIGN_PROPOSED" as const,
            reasonCodes: ["EVIDENCE_VERIFIED"] as const,
            summary: "The coverage cell has one evidence-backed campaign.",
            payload: { campaignProposalRefs: ["smoke-campaign"] },
          };
        case "MAPPING_PRODUCER":
          return mappingTerminalResultFor(authorization, envelope, common);
        case "SUPPLY_REVIEWER":
          return {
            ...common,
            role: envelope.role,
            disposition: "HUMAN_REVIEW_REQUIRED" as const,
            reasonCodes: ["EVIDENCE_VERIFIED"] as const,
            summary: "The committed package needs a recorded human decision.",
            payload: {
              caseReason: "Smoke-test review requires human direction.",
            },
          };
        case "HUMAN_DIRECTED_EXECUTOR":
          return humanTerminalResultFor(authorization, envelope, common);
      }
    };

    const processLauncher: AffiliateAgentSupervisorDependencies["processLauncher"] =
      {
        reserve: async () => ({
          reservationId: "integration-runner-reservation",
          release: async () => undefined,
          launch: (input) => {
            const envelope = JSON.parse(
              input.environment.AFFILIATE_AGENT_CLAIM_ENVELOPE,
            ) as AffiliateAgentClaimEnvelope;
            const token = input.environment.AFFILIATE_AGENT_CLAIM_TOKEN;
            launchedClaims.set(envelope.role, envelope);
            childEnvironmentKeys.push(Object.keys(input.environment).sort());
            let resultPromise: Promise<AffiliateAgentProcessEvent> | null = null;
            return {
              started: Promise.resolve(),
              nextEvent: () => {
                resultPromise ??= terminalResultForClaim(token, envelope).then(
                  (value) => ({
                    kind: "TERMINAL_SUBMISSION" as const,
                    idempotencyKey: `integration-terminal-${envelope.claimId}`,
                    result: value,
                  }),
                );
                return resultPromise;
              },
              send: async () => undefined,
              terminate: async () => undefined,
              forceTerminate: async () => undefined,
              disconnect: () => undefined,
            } satisfies AffiliateAgentProcessSession;
          },
        }),
      };
    let workspaceSequence = 0;
    const workspaces: AffiliateAgentSupervisorDependencies["workspaces"] = {
      recoverStale: async () => undefined,
      create: async ({ workerId, invocationId, mode }) => {
        workspaceSequence += 1;
        return {
          path: `${RUN_PREFIX}-workspace-${workspaceSequence}`,
          attestation: {
            schemaVersion: 1 as const,
            workspaceId: `${RUN_PREFIX}-workspace-${workspaceSequence}`,
            mode,
            executionClass: "PRODUCTION_OMP" as const,
            workerId,
            invocationId,
            issuedAt: "2026-08-20T17:59:00.000Z",
            expiresAt: "2026-08-20T19:00:00.000Z",
            signature: "smoke-workspace-attestation",
          },
        };
      },
      destroy: async () => undefined,
    };
    const supervisorDependencies: AffiliateAgentSupervisorDependencies = {
      gateway: harness.gateway,
      invocationReconciler: harness.reconciler,
      clock: harness.dependencies.clock,
      identifiers: harness.dependencies.identifiers,
      processLauncher,
      workspaces,
    };
    const runRole = async (
      role: AffiliateAgentRole,
      jobId: string,
    ): Promise<void> => {
      const input: AffiliateAgentSupervisorInput = {
        role,
        roleCredential: `${role.toLowerCase()}-smoke-credential`,
        gatewayAddress: "unix:///internal/affiliate-agent-gateway.sock",
        gatewayPathPrefix: "/v1/affiliate-agent",
        workerId: `${RUN_PREFIX}-${role}-worker`,
        invocationId: `${RUN_PREFIX}-${role}-invocation`,
      };
      await expect(
        runAffiliateAgentInvocation(supervisorDependencies, input),
      ).resolves.toBe("TERMINAL_ACCEPTED");
      const [job, claim] = await Promise.all([
        prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
          where: { id: jobId },
          select: {
            status: true,
            claimGeneration: true,
            activeClaimId: true,
            terminalReceiptId: true,
          },
        }),
        prisma.affiliateAgentGatewayClaims.findFirstOrThrow({
          where: { jobId },
          orderBy: { claimGeneration: "desc" },
          select: { status: true, tokenInvalidatedAt: true },
        }),
      ]);
      expect(job).toMatchObject({
        status: "COMPLETED",
        claimGeneration: 1,
        activeClaimId: null,
      });
      expect(job.terminalReceiptId).not.toBeNull();
      expect(claim.status).toBe("COMPLETED");
      expect(claim.tokenInvalidatedAt).not.toBeNull();
    };

    const coverageJobId = await seedCoverageJob("four-role-coverage");
    await runRole("COVERAGE_PLANNER", coverageJobId);
    const mappingJobId = await seedMappingJob("four-role-mapping");
    await runRole("MAPPING_PRODUCER", mappingJobId);
    const mappingEnvelope = launchedClaims.get("MAPPING_PRODUCER");
    if (
      !mappingEnvelope ||
      mappingEnvelope.subject.type !== "MAPPING_PRODUCER"
    ) {
      throw new Error("Mapping claim was not launched.");
    }
    const reviewerJobId = await seedReviewerJob(
      "four-role-reviewer",
      {
        claimId: mappingEnvelope.claimId,
        workerId: mappingEnvelope.workerId,
        invocationId: mappingEnvelope.invocationId,
        workspaceId: mappingEnvelope.workspaceId,
        supplySourceId: mappingEnvelope.subject.supplySourceId,
      },
      mappingPackageHash,
      "four-role-mapping",
    );
    await runRole("SUPPLY_REVIEWER", reviewerJobId);
    const humanPrerequisite = await completedReviewerPrerequisiteForJob(
      "four-role-reviewer",
      reviewerJobId,
    );
    const humanJobId = await seedHumanJob("four-role-human", humanPrerequisite);
    await runRole("HUMAN_DIRECTED_EXECUTOR", humanJobId);

    expect(childEnvironmentKeys).toHaveLength(4);
    for (const keys of childEnvironmentKeys) {
      expect(keys).toEqual([
        "AFFILIATE_AGENT_CLAIM_ENVELOPE",
        "AFFILIATE_AGENT_CLAIM_TOKEN",
        "AFFILIATE_AGENT_GATEWAY_ADDRESS",
        "AFFILIATE_AGENT_GATEWAY_PATH_PREFIX",
      ]);
    }
    expect(
      [...launchedClaims.values()].map(({ role, claimGeneration }) => [
        role,
        claimGeneration,
      ]),
    ).toEqual([
      ["COVERAGE_PLANNER", 1],
      ["MAPPING_PRODUCER", 1],
      ["SUPPLY_REVIEWER", 1],
      ["HUMAN_DIRECTED_EXECUTOR", 1],
    ]);
  });

  it("denies protected-table writes for the provisioned affiliate agent role", async () => {
    const databaseUrl = assertIsolatedDatabaseUrl(process.env.DATABASE_URL);
    const agentRole = "bracketiq_affiliate_agent";
    const client = new Client({ connectionString: databaseUrl });
    let isRoleCreated = false;
    let facts: string[] = [];
    try {
      await client.connect();
      const existingRole = await client.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
        [agentRole],
      );
      if (!existingRole.rows[0]?.exists) {
        await client.query(
          `CREATE ROLE "${agentRole}" NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
        );
        isRoleCreated = true;
      }

      const privileges = await client.query<{
        table_name: string;
        operation: string;
        allowed: boolean;
      }>(
        `
          SELECT protected.table_name, requested.operation,
            has_table_privilege(
              $1,
              format('public.%I', protected.table_name),
              requested.operation
            ) AS allowed
          FROM (VALUES
            ('AffiliateAgentGatewayJobs'::text),
            ('AffiliateAgentGatewayClaims'::text),
            ('AffiliateAgentGatewayArtifacts'::text),
            ('AffiliateAgentGatewayOperationReceipts'::text),
            ('AffiliateAgentGatewayEvents'::text),
            ('AffiliateCoverageAgentJobs'::text),
            ('AffiliateSourceMappingJobs'::text),
            ('AffiliateApprovalJobs'::text),
            ('AffiliateSourceIntakes'::text),
            ('AffiliateSourceIntakeArtifacts'::text),
            ('AffiliateSourceDiscoveryCampaigns'::text),
            ('AffiliateScrapeSources'::text),
            ('AffiliateScrapeMappings'::text),
            ('File'::text)
          ) AS protected(table_name)
          CROSS JOIN (VALUES
            ('SELECT'::text),
            ('INSERT'::text),
            ('UPDATE'::text),
            ('DELETE'::text)
          ) AS requested(operation)
          ORDER BY protected.table_name, requested.operation
        `,
        [agentRole],
      );
      expect(privileges.rows).toHaveLength(
        PROTECTED_AFFILIATE_AGENT_TABLES.length *
          PROTECTED_TABLE_OPERATIONS.length,
      );
      expect(privileges.rows.every((row) => row.allowed === false)).toBe(true);
      facts = await probeProtectedTableWrites(
        client,
        agentRole,
        PROTECTED_AFFILIATE_AGENT_TABLES,
      );
    } finally {
      await client.end().catch(() => undefined);
      if (isRoleCreated) {
        await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS "${agentRole}"`);
      }
    }
    expect(facts).toHaveLength(PROTECTED_AFFILIATE_AGENT_TABLES.length * 3);
  });
});
