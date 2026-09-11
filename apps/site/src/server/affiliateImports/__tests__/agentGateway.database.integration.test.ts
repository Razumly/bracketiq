/** @jest-environment node */

import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  affiliateAgentClaimEnvelopeSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  canonicalizeAffiliateAgentValue,
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
  AffiliateAgentReviewerEffectRecoveryRequest,
  AffiliateAgentReviewerEffectRecoveryReport,
} from "../agentGateway";
import {
  buildAffiliateSupplyContractManifest,
  normalizeAffiliateSupplyIdentity,
  type AffiliateSupplyContractPolicy,
} from "../affiliateSupplyLifecycle";
import {
  buildAffiliateSportsCatalogSnapshot,
  loadAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from "../affiliateSportsCatalog";
import {
  createProductionAffiliateAgentGatewayAdapters,
  createProductionAffiliateAgentGatewayDependencies,
  type AffiliateAgentClaimAdmission,
  type AffiliateAgentCommandAdapters,
  type AffiliateAgentGatewayDependencies,
  type AffiliateAgentLifecycleAuthority,
  type AffiliateAgentProcessEvent,
  type AffiliateAgentProcessSession,
  type AffiliateAgentTerminalEffectAdapter,
} from "../agentGatewayAdapters";
import type { StorageProvider } from "@/lib/storageProvider";
import {
  runAffiliateAgentInvocation,
  type AffiliateAgentSupervisorInput,
} from "../agentSupervisor";
import {
  applyAffiliateSourceExclusionAdmission,
  previewAffiliateSourceExclusionAdmission,
} from "../affiliateSourceExclusionAdmission";
import {
  createAffiliateAgentClaimAdmission,
  createPrismaAffiliateAgentGateway,
  createPrismaAffiliateAgentInvocationReconciler,
  recoverAffiliateAgentReviewerEffect,
} from "../prismaAgentGateway";
const describeDatabase =
  process.env.RUN_DATABASE_INTEGRATION === "1" ? describe : describe.skip;
const DATABASE_NAME =
  process.env.AFFILIATE_TEST_DATABASE_NAME ?? "bracketiq_e2e_67_gateway";
const ISOLATED_DATABASE_NAME_PATTERN = /^bracketiq_e2e_[a-z0-9_]+$/;
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
  if (!ISOLATED_DATABASE_NAME_PATTERN.test(DATABASE_NAME)) {
    throw new Error(
      "AFFILIATE_TEST_DATABASE_NAME must use the bracketiq_e2e_ prefix.",
    );
  }
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
type RecoveryDeploymentContract = Omit<
  typeof contractBundleFixture.deploymentContract,
  "version" | "activeSupplyContract" | "hash"
> & {
  version: number;
  activeSupplyContract: Readonly<{ version: number; hash: string }>;
  hash: string;
};

type RecoveryContractBundle = Readonly<{
  schemaVersion: 1;
  supplyContract: AffiliateSupplyContractPolicy;
  roleContracts: typeof contractBundleFixture.roleContracts;
  promptTemplates: typeof contractBundleFixture.promptTemplates;
  deploymentContract: RecoveryDeploymentContract;
}>;

type RecoveryGatewayHarness = Readonly<{
  dependencies: AffiliateAgentGatewayDependencies;
  gateway: AffiliateAgentGateway;
  setNow: (value: string) => void;
  setActiveBundle: (value: unknown) => void;
}>;
const recoverySupplyContractPreimageFor = (
  rolloutCohort: string,
): Omit<AffiliateSupplyContractPolicy, "hash"> => ({
  schemaVersion: 1,
  version: 1,
  rolloutCohort,
  freshnessWindows: [{ sourceProfile: "EVENT", maximumAgeHours: 24 }],
  targets: [{
    marketKey: null,
    sportId: null,
    sourceProfile: "EVENT",
    minimumFreshPublishedSupply: 1,
  }],
  requiredMappingEvidenceKinds: ["PAGE_HTML"],
  requiredLifecycleEvidenceKinds: [
    "VALIDATION_OUTPUT",
    "DURABLE_SOURCE_EVIDENCE",
  ],
});
const recoverySupplyManifestFor = (
  rolloutCohort: string,
): AffiliateSupplyContractManifest => buildAffiliateSupplyContractManifest({
  version: 1,
  rolloutCohort,
  status: "ACTIVE",
  supplyContract: recoverySupplyContractPreimageFor(rolloutCohort),
});

const recoveryContractBundleFor = (
  manifest: AffiliateSupplyContractManifest,
): RecoveryContractBundle => {
  const deploymentPreimage = {
    schemaVersion: 1 as const,
    version: 5,
    gatewayVersion: 1,
    activeSupplyContract: {
      version: manifest.supplyContract.version,
      hash: manifest.supplyContract.hash,
    },
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS).map(
      ({ role, version, hash }) => ({ role, version, hash }),
    ),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES).map(
      ({ role, version, hash }) => ({ role, version, hash }),
    ),
    expectedTopology: contractBundleFixture.deploymentContract.expectedTopology,
  };
  return {
    schemaVersion: 1 as const,
    supplyContract: manifest.supplyContract,
    roleContracts: Object.values(AFFILIATE_AGENT_ROLE_CONTRACTS),
    promptTemplates: Object.values(AFFILIATE_AGENT_PROMPT_TEMPLATES),
    deploymentContract: {
      ...deploymentPreimage,
      hash: hashAffiliateAgentValue(deploymentPreimage),
    },
  };
};

type RecoveryManifestEntry = AffiliateAgentEvidenceManifest["entries"][number];

const recoveryEvidenceManifestFor = (
  entries: readonly RecoveryManifestEntry[],
): AffiliateAgentEvidenceManifest => {
  const preimage = {
    schemaVersion: 1 as const,
    entries: [...entries].sort((left, right) =>
      left.evidenceRef.localeCompare(right.evidenceRef)),
  };
  return {
    ...preimage,
    hash: hashAffiliateAgentValue(preimage),
  };
};

type ReviewerEffectRecoveryFixture = Readonly<{
  label: string;
  supplySourceId: string;
  sourceId: string;
  mappingId: string;
  mappingJobId: string;
  runId: string;
  intakeId: string;
  producerClaimId: string;
  producerJobId: string;
  reviewerClaimId: string;
  reviewerJobId: string;
  receiptId: string;
  producerCommitReceiptId: string;
  producerTerminalReceiptId: string;
  packageHash: string;
  bundle: RecoveryContractBundle;
  request: AffiliateAgentReviewerEffectRecoveryRequest;
  catalog: AffiliateSportsCatalogSnapshot;
  sourcePageBytes: Buffer;
  packageBytes: Buffer;
  durableBytes: Buffer;
  harness: RecoveryGatewayHarness;
}>;

const seedReviewerEffectRecoveryFixture = async (
  label: string,
): Promise<ReviewerEffectRecoveryFixture> => {
  const supplySourceId = `${RUN_PREFIX}-${label}-supply-source`;
  const sourceId = `${RUN_PREFIX}-${label}-scrape-source`;
  const mappingId = `${RUN_PREFIX}-${label}-mapping-v2`;
  const mappingJobId = `${RUN_PREFIX}-${label}-mapping-job`;
  const runId = `${RUN_PREFIX}-${label}-scrape-run`;
  const intakeId = `${RUN_PREFIX}-${label}-intake`;
  const producerClaimId = `${RUN_PREFIX}-${label}-producer-claim`;
  const producerJobId = `${RUN_PREFIX}-${label}-producer-job`;
  const reviewerClaimId = `${RUN_PREFIX}-${label}-reviewer-claim`;
  const reviewerJobId = `${RUN_PREFIX}-${label}-reviewer-job`;
  const receiptId = `${RUN_PREFIX}-${label}-reviewer-effect-receipt`;
  const producerCommitReceiptId = `${RUN_PREFIX}-${label}-producer-commit-receipt`;
  const producerTerminalReceiptId = `${RUN_PREFIX}-${label}-producer-terminal-receipt`;
  const workerId = `${RUN_PREFIX}-${label}-reviewer-worker`;
  const invocationId = `${RUN_PREFIX}-${label}-reviewer-invocation`;
  const workspaceId = `${RUN_PREFIX}-${label}-reviewer-workspace`;
  const producerWorkerId = `${RUN_PREFIX}-${label}-producer-worker`;
  const producerInvocationId = `${RUN_PREFIX}-${label}-producer-invocation`;
  const producerWorkspaceId = `${RUN_PREFIX}-${label}-producer-workspace`;
  const rolloutCohort = `${RUN_PREFIX}-${label}-cohort`;
  const activeManifest = recoverySupplyManifestFor(rolloutCohort);
  const bundle = recoveryContractBundleFor(activeManifest);
  const catalog = await loadAffiliateSportsCatalogSnapshot(
    prisma,
    INITIAL_TIME.toISOString(),
  );
  const sportName = catalog.sports[0]?.name;
  if (!sportName) throw new Error("The local sports catalog is empty.");
  const sourcePageBytes = Buffer.from(
    `<html><body><article class="event"><a href="/events/${label}">Register</a><h1 class="title">${label} legacy event</h1><p class="description">Join our weekly games for local players.</p><span class="sport">${sportName}</span></article></body></html>`,
    "utf8",
  );
  const sourcePageHash = createHash("sha256").update(sourcePageBytes).digest("hex");
  const sourcePageArtifactId = `${RUN_PREFIX}-${label}-source-page`;
  const durableBytes = Buffer.from(`durable proof for ${label}`, "utf8");
  const durableHash = createHash("sha256").update(durableBytes).digest("hex");
  const durableArtifactId = `${RUN_PREFIX}-${label}-durable-evidence`;
  const repairContext = {
    kind: "LEGACY_SPORT_REPAIR" as const,
    intakeId,
    evidenceRunId: runId,
    sportsCatalog: catalog,
  };
  const packagePreimage = {
    schemaVersion: 1 as const,
    supplySourceId,
    listingKind: "EVENT" as const,
    listUrlRef: "source-page",
    itemSelector: ".event",
    fields: [
      {
        field: "description" as const,
        selector: ".description",
        mode: "TEXT" as const,
        attribute: null,
        transform: "TRIM" as const,
      },
      {
        field: "officialActionUrl" as const,
        selector: "a",
        mode: "ATTRIBUTE" as const,
        attribute: "href",
        transform: "ABSOLUTE_URL" as const,
      },
      {
        field: "sportName" as const,
        selector: ".sport",
        mode: "TEXT" as const,
        attribute: null,
        transform: "TRIM" as const,
      },
      {
        field: "title" as const,
        selector: ".title",
        mode: "TEXT" as const,
        attribute: null,
        transform: "TRIM" as const,
      },
    ],
    evidenceRefs: ["source-page"],
    sportEvidence: {
      evidenceRunId: runId,
      sportsCatalogSha256: catalog.sha256,
      sportDeterminations: [{
        sourceLabels: [sportName],
        status: "RESOLVED" as const,
        resolutionBasis: "SOURCE_EVIDENCE" as const,
        canonicalSportNames: [sportName],
        rationale: "The retained source page identifies the catalog sport.",
        evidence: [{
          artifactId: sourcePageArtifactId,
          artifactSha256: sourcePageHash,
          artifactKind: "PAGE_HTML" as const,
          pageUrl: `https://source.example.test/${label}/events`,
          excerpt: sportName,
        }],
      }],
    },
  };
  const packageHash = hashAffiliateAgentValue(packagePreimage);
  const packageBytes = Buffer.from(
    canonicalizeAffiliateAgentValue(packagePreimage),
    "utf8",
  );
  const validationOutput = {
    schemaVersion: 1 as const,
    isValid: true as const,
    validatedPackageHash: packageHash,
    evidenceRefs: ["source-page"],
    evidenceKinds: ["PAGE_HTML"],
    validationReceiptId: `${RUN_PREFIX}-${label}-validation-receipt`,
    claimId: producerClaimId,
    claimGeneration: 1,
    invocationId: producerInvocationId,
    supplyContractHash: activeManifest.supplyContract.hash,
  };
  const validationHash = hashAffiliateAgentValue(validationOutput);
  const producerManifest = recoveryEvidenceManifestFor([
    {
      evidenceRef: "gateway-deterministic-validation",
      kind: "DETERMINISTIC_VALIDATION",
      artifactId: `${producerClaimId}:gateway-deterministic-validation`,
      sha256: validationHash,
      mimeType: "application/json",
      byteSize: Buffer.byteLength(canonicalizeAffiliateAgentValue(validationOutput)),
      retention: "INDEFINITE",
    },
    {
      evidenceRef: "gateway-durable-evidence",
      kind: "DURABLE_EVIDENCE",
      artifactId: durableArtifactId,
      sha256: durableHash,
      mimeType: "application/json",
      byteSize: durableBytes.byteLength,
      retention: "INDEFINITE",
    },
    {
      evidenceRef: "gateway-committed-package",
      kind: "COMMITTED_PACKAGE",
      artifactId: `${producerClaimId}:gateway-committed-package`,
      sha256: packageHash,
      mimeType: "application/json",
      byteSize: packageBytes.byteLength,
      retention: "INDEFINITE",
    },
    {
      evidenceRef: "source-page",
      kind: "PAGE_HTML",
      artifactId: sourcePageArtifactId,
      sha256: sourcePageHash,
      mimeType: "text/html",
      byteSize: sourcePageBytes.byteLength,
      retention: "INDEFINITE",
    },
  ]);
  const reviewerManifest = recoveryEvidenceManifestFor([
    {
      evidenceRef: "gateway-deterministic-validation",
      kind: "DETERMINISTIC_VALIDATION",
      artifactId: `${producerClaimId}:gateway-deterministic-validation`,
      sha256: validationHash,
      mimeType: "application/json",
      byteSize: Buffer.byteLength(canonicalizeAffiliateAgentValue(validationOutput)),
      retention: "INDEFINITE",
    },
    {
      evidenceRef: "gateway-durable-evidence",
      kind: "DURABLE_EVIDENCE",
      artifactId: durableArtifactId,
      sha256: durableHash,
      mimeType: "application/json",
      byteSize: durableBytes.byteLength,
      retention: "INDEFINITE",
    },
    {
      evidenceRef: "gateway-committed-package",
      kind: "COMMITTED_PACKAGE",
      artifactId: `${producerClaimId}:gateway-committed-package`,
      sha256: packageHash,
      mimeType: "application/json",
      byteSize: packageBytes.byteLength,
      retention: "INDEFINITE",
    },
    {
      evidenceRef: "active-contract",
      kind: "ACTIVE_SUPPLY_CONTRACT",
      artifactId: `supply-contract:${activeManifest.supplyContract.hash}`,
      sha256: activeManifest.supplyContract.hash,
      mimeType: "application/json",
      byteSize: Buffer.byteLength(canonicalizeAffiliateAgentValue(
        Object.fromEntries(
          Object.entries(activeManifest.supplyContract)
            .filter(([key]) => key !== "hash"),
        ),
      )),
      retention: "INDEFINITE",
    },
  ]);
  const producerSubject = {
    type: "MAPPING_PRODUCER" as const,
    supplySourceId,
    mappingJobId,
    listingKind: "EVENT" as const,
    pass: 1,
    repairContext,
  };
  const reviewerSubject = {
    type: "SUPPLY_REVIEWER" as const,
    supplySourceId,
    producerClaimId,
    producerWorkerId,
    producerInvocationId,
    producerWorkspaceId,
    committedPackageHash: packageHash,
    targetId: `${RUN_PREFIX}-${label}-target`,
    targetType: "EVENT" as const,
    reviewPass: 1,
    repairContext,
  };
  const oldDeploymentContractHash = "4".repeat(64);
  const oldRoleContractHash = "3".repeat(64);
  const oldPromptTemplateHash = "3".repeat(64);
  const producerEnvelope = {
    schemaVersion: 1 as const,
    queue: "AFFILIATE_MAPPING" as const,
    lane: "MAPPING_PRODUCTION" as const,
    jobId: producerJobId,
    claimId: producerClaimId,
    supplySourceId,
    claimGeneration: 1,
    lifecycleGeneration: 2,
    role: "MAPPING_PRODUCER" as const,
    deploymentContractVersion: 4,
    deploymentContractHash: oldDeploymentContractHash,
    supplyContractVersion: activeManifest.supplyContract.version,
    supplyContractHash: activeManifest.supplyContract.hash,
    roleContractVersion: 3,
    roleContractHash: oldRoleContractHash,
    promptTemplateVersion: 3,
    promptTemplateHash: oldPromptTemplateHash,
    executionClass: "PRODUCTION_OMP" as const,
    workerId: producerWorkerId,
    invocationId: producerInvocationId,
    workspaceId: producerWorkspaceId,
    claimedAt: "2026-08-20T17:50:00.000Z",
    expiresAt: "2026-08-20T18:10:00.000Z",
    evidenceManifest: producerManifest,
    subject: producerSubject,
    permittedCommands: [...AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.permittedCommands],
  };
  const reviewerEnvelope = {
    schemaVersion: 1 as const,
    queue: "AFFILIATE_REVIEW" as const,
    lane: "SUPPLY_REVIEW" as const,
    jobId: reviewerJobId,
    claimId: reviewerClaimId,
    supplySourceId,
    claimGeneration: 1,
    lifecycleGeneration: 2,
    role: "SUPPLY_REVIEWER" as const,
    deploymentContractVersion: 4,
    deploymentContractHash: oldDeploymentContractHash,
    supplyContractVersion: activeManifest.supplyContract.version,
    supplyContractHash: activeManifest.supplyContract.hash,
    roleContractVersion: 3,
    roleContractHash: oldRoleContractHash,
    promptTemplateVersion: 3,
    promptTemplateHash: oldPromptTemplateHash,
    executionClass: "PRODUCTION_OMP" as const,
    workerId,
    invocationId,
    workspaceId,
    claimedAt: "2026-08-20T17:50:00.000Z",
    expiresAt: "2026-08-20T18:10:00.000Z",
    evidenceManifest: reviewerManifest,
    subject: reviewerSubject,
    permittedCommands: [...AFFILIATE_AGENT_ROLE_CONTRACTS.SUPPLY_REVIEWER.permittedCommands],
  };
  const producerTerminalResult = {
    schemaVersion: 1 as const,
    jobId: producerJobId,
    claimId: producerClaimId,
    claimGeneration: 1,
    lifecycleGeneration: 2,
    deploymentContractVersion: 4,
    deploymentContractHash: oldDeploymentContractHash,
    supplyContractVersion: activeManifest.supplyContract.version,
    supplyContractHash: activeManifest.supplyContract.hash,
    roleContractVersion: 3,
    roleContractHash: oldRoleContractHash,
    promptTemplateVersion: 3,
    promptTemplateHash: oldPromptTemplateHash,
    workerId: producerWorkerId,
    invocationId: producerInvocationId,
    role: "MAPPING_PRODUCER" as const,
    disposition: "PACKAGE_COMMITTED" as const,
    reasonCodes: [] as const,
    evidenceRefs: [
      "gateway-committed-package",
      "gateway-deterministic-validation",
      "gateway-durable-evidence",
      "source-page",
    ] as const,
    summary: "The retained package was committed by the historical producer.",
    payload: {
      packageHash,
      commitReceiptId: producerCommitReceiptId,
    },
  };
  const reviewerResult = {
    schemaVersion: 1 as const,
    jobId: reviewerJobId,
    claimId: reviewerClaimId,
    claimGeneration: 1,
    lifecycleGeneration: 2,
    deploymentContractVersion: 4,
    deploymentContractHash: oldDeploymentContractHash,
    supplyContractVersion: activeManifest.supplyContract.version,
    supplyContractHash: activeManifest.supplyContract.hash,
    roleContractVersion: 3,
    roleContractHash: oldRoleContractHash,
    promptTemplateVersion: 3,
    promptTemplateHash: oldPromptTemplateHash,
    workerId,
    invocationId,
    role: "SUPPLY_REVIEWER" as const,
    disposition: "APPROVED" as const,
    reasonCodes: ["EVIDENCE_VERIFIED"] as const,
    evidenceRefs: [
      "gateway-committed-package",
      "gateway-deterministic-validation",
      "gateway-durable-evidence",
    ] as const,
    summary: "The retained historical reviewer approved the package.",
    payload: {
      committedPackageHash: packageHash,
    },
  };
  const terminalRequestHash = hashAffiliateAgentValue({
    commandName: "SUPPLY_REVIEWER_TERMINAL_EFFECT",
    claimId: reviewerClaimId,
    claimGeneration: 1,
    result: reviewerResult,
  });
  const pendingEffectState = {
    kind: "PENDING" as const,
    result: reviewerResult,
    terminalIdempotencyKey: `${RUN_PREFIX}-${label}-terminal-result`,
    terminalRequestHash,
    failureDiagnostics: [{
      code: "REVIEWER_TERMINAL_EFFECT_FAILED" as const,
      stage: "EXECUTE" as const,
      reasonCodes: ["UNCLASSIFIED"] as const,
    }],
  };
  const now = new Date(INITIAL_TIME);
  await prisma.$transaction(async (transaction) => {
    await transaction.affiliateSupplyContractManifests.create({
      data: {
        id: `${RUN_PREFIX}-${label}-supply-contract`,
        rolloutCohort,
        version: activeManifest.version,
        status: "ACTIVE",
        contractHash: activeManifest.hash,
        contractJson: activeManifest.supplyContract,
      },
    });
    await transaction.affiliateSupplySources.create({
      data: {
        id: supplySourceId,
        identityKey: `${RUN_PREFIX}-${label}-identity`,
        canonicalUrl: `https://source.example.test/${label}/events`,
        origin: `https://source.example.test`,
        pathKey: `/${label}/events`,
        targetKind: "EVENT",
        rolloutCohort,
        liveSourceId: sourceId,
        lifecycleGeneration: 2,
        activeSupplyContractVersion: activeManifest.supplyContract.version,
        activeSupplyContractHash: activeManifest.supplyContract.hash,
        derivedStage: "MAPPED",
        isAutomationEnabled: false,
        isExcluded: false,
        automationHoldReason: "LEGACY_SPORT_REPAIR",
        metadata: {
          automationReviewRequired: {
            hold: true,
            reason: "LEGACY_SPORT_REPAIR",
            evidenceRefs: ["source-page"],
          },
        },
      },
    });
    await transaction.affiliateScrapeSources.create({
      data: {
        id: sourceId,
        name: `Gateway ${label} source`,
        sourceKey: `${RUN_PREFIX}-${label}-source-key`,
        baseUrl: `https://source.example.test/${label}`,
        listUrl: `https://source.example.test/${label}/events`,
        targetKind: "EVENT",
        status: "ACTIVE",
        activeMappingId: mappingId,
        supplySourceId,
        lifecycleGeneration: 2,
        activeSupplyContractVersion: activeManifest.supplyContract.version,
        activeSupplyContractHash: activeManifest.supplyContract.hash,
        autoScrapeEnabled: false,
        metadata: {
          automationReviewRequired: {
            hold: true,
            reason: "LEGACY_SPORT_REPAIR",
            evidenceRefs: ["source-page"],
          },
        },
      },
    });
    await transaction.affiliateScrapeMappings.create({
      data: {
        id: mappingId,
        sourceId,
        supplySourceId,
        version: 2,
        isActive: false,
        validatedAt: null,
        mapping: {
          kind: "EVENT",
          listUrl: `https://source.example.test/${label}/events`,
          itemSelector: ".event",
          fields: {
            title: {
              selector: ".title",
              mode: "text",
              transform: "trim",
            },
            officialActionUrl: {
              selector: "a",
              mode: "attribute",
              attribute: "href",
              transform: "absoluteUrl",
            },
            sportName: {
              selector: ".sport",
              mode: "text",
              transform: "trim",
            },
          },
          metadata: {
            packageHash,
            evidenceRefs: ["source-page"],
            evidenceKinds: ["PAGE_HTML"],
            validationOutput,
          },
        },
      },
    });
    await transaction.affiliateSourceMappingJobs.create({
      data: {
        id: mappingJobId,
        intakeId,
        supplySourceId,
        sourceId,
        mappingId,
        status: "REVIEW_REQUIRED",
        resultSummary: {
          packageHash,
          evidenceRefs: ["source-page"],
          gatewayCandidatePackage: {
            candidatePackage: packagePreimage,
            packageHash,
            validatedPackageHash: packageHash,
            claimId: producerClaimId,
            claimGeneration: 1,
            invocationId: producerInvocationId,
            validationMetadata: {
              ...validationOutput,
              validationOutput,
              deterministicValidationArtifact: {
                sourceArtifactId: `${producerClaimId}:gateway-deterministic-validation`,
                contentHash: validationHash,
              },
              durableEvidenceArtifact: {
                sourceArtifactId: durableArtifactId,
                contentHash: durableHash,
              },
            },
            validationOutput,
            deterministicValidationArtifact: {
              sourceArtifactId: `${producerClaimId}:gateway-deterministic-validation`,
              contentHash: validationHash,
            },
            durableEvidenceArtifact: {
              sourceArtifactId: durableArtifactId,
              contentHash: durableHash,
            },
          },
        },
        finishedAt: now,
      },
    });
    await transaction.affiliateScrapeRuns.create({
      data: {
        id: runId,
        sourceId,
        supplySourceId,
        mappingId,
        status: "SUCCEEDED",
        startedAt: new Date(now.getTime() - 60_000),
        finishedAt: now,
        fetchedUrl: `https://source.example.test/${label}/events`,
        finalUrl: `https://source.example.test/${label}/events`,
        httpStatus: 200,
        itemCount: 1,
        candidateCount: 1,
        logs: { evidenceRefs: ["source-page"] },
      },
    });
    await transaction.affiliateImportCandidates.create({
      data: {
        id: `${RUN_PREFIX}-${label}-candidate`,
        sourceId,
        supplySourceId,
        runId,
        mappingId,
        listingKind: "EVENT",
        status: "DISCOVERED",
        dedupeKey: `${RUN_PREFIX}-${label}-candidate`,
        title: `${label} legacy event`,
        officialActionUrl: `https://source.example.test/${label}/register`,
        sourceUrl: `https://source.example.test/${label}/events`,
        sportName,
        rawPayload: { evidenceRefs: ["source-page"] },
      },
    });
    await transaction.affiliateAgentGatewayJobs.create({
      data: {
        id: producerJobId,
        dedupeKey: `${RUN_PREFIX}-${label}-producer-dedupe`,
        queue: "AFFILIATE_MAPPING",
        lane: "MAPPING_PRODUCTION",
        role: "MAPPING_PRODUCER",
        subjectType: "MAPPING_PRODUCER",
        subjectId: mappingJobId,
        subjectJson: producerSubject,
        evidenceManifestJson: producerManifest,
        supplySourceId,
        expectedLifecycleGeneration: 2,
        status: "COMPLETED",
        claimGeneration: 1,
        activeClaimId: null,
        terminalDisposition: "PACKAGE_COMMITTED",
        resultHash: hashAffiliateAgentValue(producerTerminalResult),
        resultJson: producerTerminalResult,
        terminalReceiptId: producerTerminalReceiptId,
        finishedAt: now,
      },
    });
    await transaction.affiliateAgentGatewayClaims.create({
      data: {
        id: producerClaimId,
        jobId: producerJobId,
        claimGeneration: 1,
        lifecycleGeneration: 2,
        queue: "AFFILIATE_MAPPING",
        lane: "MAPPING_PRODUCTION",
        role: "MAPPING_PRODUCER",
        workerId: producerWorkerId,
        invocationId: producerInvocationId,
        workspaceId: producerWorkspaceId,
        workspaceMode: "READ_WRITE",
        workspaceAttestationHash: hashAffiliateAgentValue({
          workerId: producerWorkerId,
          invocationId: producerInvocationId,
          workspaceId: producerWorkspaceId,
        }),
        status: "COMPLETED",
        claimRequestId: `${RUN_PREFIX}-${label}-producer-request`,
        claimRequestHash: hashAffiliateAgentValue({ producerClaimId }),
        claimedAt: new Date(now.getTime() - 10 * 60_000),
        lastHeartbeatAt: new Date(now.getTime() - 10 * 60_000),
        leaseExpiresAt: new Date(now.getTime() - 5 * 60_000),
        hardDeadlineAt: new Date(now.getTime() - 1 * 60_000),
        endedAt: now,
        tokenNonce: `${RUN_PREFIX}-${label}-producer-token-nonce`,
        tokenHash: `${RUN_PREFIX}-${label}-producer-token-hash`,
        tokenKeyVersion: "database-key-v1",
        tokenExpiresAt: new Date(now.getTime() - 1 * 60_000),
        tokenInvalidatedAt: now,
        deploymentContractVersion: producerEnvelope.deploymentContractVersion,
        deploymentContractHash: producerEnvelope.deploymentContractHash,
        roleContractVersion: producerEnvelope.roleContractVersion,
        roleContractHash: producerEnvelope.roleContractHash,
        promptTemplateVersion: producerEnvelope.promptTemplateVersion,
        promptTemplateHash: producerEnvelope.promptTemplateHash,
        supplyContractVersion: producerEnvelope.supplyContractVersion,
        supplyContractHash: producerEnvelope.supplyContractHash,
        claimEnvelopeHash: hashAffiliateAgentValue(producerEnvelope),
        claimEnvelopeJson: producerEnvelope,
        evidenceManifestHash: producerManifest.hash,
        permittedCommandHash: hashAffiliateAgentValue(producerEnvelope.permittedCommands),
        permittedCommands: [...producerEnvelope.permittedCommands],
        terminalReceiptId: producerTerminalReceiptId,
      },
    });
    await transaction.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: producerCommitReceiptId,
        claimId: producerClaimId,
        jobId: producerJobId,
        claimGeneration: 1,
        idempotencyKey: `${RUN_PREFIX}-${label}-producer-commit`,
        operationKind: "EXECUTE_COMMAND",
        commandName: "COMMIT_DECLARATIVE_PACKAGE",
        requestHash: hashAffiliateAgentValue({ producerCommitReceiptId }),
        status: "SUCCEEDED",
        responseHash: hashAffiliateAgentValue({
          commandType: "COMMIT_DECLARATIVE_PACKAGE",
          safeOutput: { packageHash },
        }),
        responseJson: {
          kind: "COMMAND_SUCCEEDED",
          receiptId: producerCommitReceiptId,
          commandType: "COMMIT_DECLARATIVE_PACKAGE",
          safeOutput: { packageHash },
        },
        startedAt: new Date(now.getTime() - 10 * 60_000),
        completedAt: new Date(now.getTime() - 9 * 60_000),
      },
    });
    await transaction.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: producerTerminalReceiptId,
        claimId: producerClaimId,
        jobId: producerJobId,
        claimGeneration: 1,
        idempotencyKey: `${RUN_PREFIX}-${label}-producer-terminal`,
        operationKind: "SUBMIT_RESULT",
        requestHash: hashAffiliateAgentValue({ producerTerminalResult }),
        status: "SUCCEEDED",
        responseHash: hashAffiliateAgentValue({
          kind: "COMMAND_SUCCEEDED",
          receiptId: producerTerminalReceiptId,
          commandType: "SUBMIT_TERMINAL_RESULT",
        }),
        responseJson: {
          kind: "COMMAND_SUCCEEDED",
          receiptId: producerTerminalReceiptId,
          commandType: "SUBMIT_TERMINAL_RESULT",
        },
        startedAt: new Date(now.getTime() - 8 * 60_000),
        completedAt: new Date(now.getTime() - 7 * 60_000),
      },
    });
    await transaction.affiliateAgentGatewayJobs.create({
      data: {
        id: reviewerJobId,
        dedupeKey: `${RUN_PREFIX}-${label}-reviewer-dedupe`,
        queue: "AFFILIATE_REVIEW",
        lane: "SUPPLY_REVIEW",
        role: "SUPPLY_REVIEWER",
        subjectType: "SUPPLY_REVIEWER",
        subjectId: supplySourceId,
        subjectJson: reviewerSubject,
        evidenceManifestJson: reviewerManifest,
        supplySourceId,
        expectedLifecycleGeneration: 2,
        status: "RECONCILIATION_REQUIRED",
        claimGeneration: 1,
        activeClaimId: reviewerClaimId,
        parentClaimId: producerClaimId,
        nextAttemptAt: null,
      },
    });
    await transaction.affiliateAgentGatewayClaims.create({
      data: {
        id: reviewerClaimId,
        jobId: reviewerJobId,
        parentClaimId: producerClaimId,
        claimGeneration: 1,
        lifecycleGeneration: 2,
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
        status: "RECONCILIATION_REQUIRED",
        claimRequestId: `${RUN_PREFIX}-${label}-reviewer-request`,
        claimRequestHash: hashAffiliateAgentValue({ reviewerClaimId }),
        claimedAt: new Date(now.getTime() - 5 * 60_000),
        lastHeartbeatAt: new Date(now.getTime() - 5 * 60_000),
        leaseExpiresAt: new Date(now.getTime() - 4 * 60_000),
        hardDeadlineAt: new Date(now.getTime() - 3 * 60_000),
        endedAt: now,
        tokenNonce: `${RUN_PREFIX}-${label}-reviewer-token-nonce`,
        tokenHash: `${RUN_PREFIX}-${label}-reviewer-token-hash`,
        tokenKeyVersion: "database-key-v1",
        tokenExpiresAt: new Date(now.getTime() - 3 * 60_000),
        tokenInvalidatedAt: now,
        deploymentContractVersion: reviewerEnvelope.deploymentContractVersion,
        deploymentContractHash: reviewerEnvelope.deploymentContractHash,
        roleContractVersion: reviewerEnvelope.roleContractVersion,
        roleContractHash: reviewerEnvelope.roleContractHash,
        promptTemplateVersion: reviewerEnvelope.promptTemplateVersion,
        promptTemplateHash: reviewerEnvelope.promptTemplateHash,
        supplyContractVersion: reviewerEnvelope.supplyContractVersion,
        supplyContractHash: reviewerEnvelope.supplyContractHash,
        claimEnvelopeHash: hashAffiliateAgentValue(reviewerEnvelope),
        claimEnvelopeJson: reviewerEnvelope,
        evidenceManifestHash: reviewerManifest.hash,
        permittedCommandHash: hashAffiliateAgentValue(reviewerEnvelope.permittedCommands),
        permittedCommands: [...reviewerEnvelope.permittedCommands],
        safeFailureCode: "PARTIAL_COMMAND_UNRESOLVED",
        safeFailureSummary: "The original reviewer effect outcome was not observed.",
        diagnosticRetainUntil: new Date(now.getTime() + 86_400_000),
      },
    });
    await transaction.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: receiptId,
        claimId: reviewerClaimId,
        jobId: reviewerJobId,
        claimGeneration: 1,
        idempotencyKey: "reviewer-terminal-effect",
        operationKind: "TERMINAL_EFFECT",
        commandName: "SUPPLY_REVIEWER_TERMINAL_EFFECT",
        requestHash: terminalRequestHash,
        status: "UNKNOWN",
        responseHash: null,
        responseJson: pendingEffectState,
        safeErrorCode: "PARTIAL_COMMAND_UNRESOLVED",
        startedAt: new Date(now.getTime() - 4 * 60_000),
        reconcileAfter: now,
      },
    });
    await transaction.affiliateAgentGatewayArtifacts.createMany({
      data: [
        {
          id: `${RUN_PREFIX}-${label}-producer-validation-artifact`,
          claimId: producerClaimId,
          claimGeneration: 1,
          evidenceRef: "gateway-deterministic-validation",
          evidenceKind: "DETERMINISTIC_VALIDATION",
          sourceArtifactId: `${producerClaimId}:gateway-deterministic-validation`,
          fileId: `${producerClaimId}:gateway-deterministic-validation`,
          contentHash: validationHash,
          mimeType: "application/json",
          byteSize: Buffer.byteLength(canonicalizeAffiliateAgentValue(validationOutput)),
          creatingClaimId: producerClaimId,
          accessMode: "READ_ONLY",
          retentionClass: "INDEFINITE",
          isPinned: true,
        },
        {
          id: `${RUN_PREFIX}-${label}-producer-package-artifact`,
          claimId: producerClaimId,
          claimGeneration: 1,
          evidenceRef: "gateway-committed-package",
          evidenceKind: "COMMITTED_PACKAGE",
          sourceArtifactId: `${producerClaimId}:gateway-committed-package`,
          fileId: `${producerClaimId}:gateway-committed-package`,
          contentHash: packageHash,
          mimeType: "application/json",
          byteSize: packageBytes.byteLength,
          creatingClaimId: producerClaimId,
          accessMode: "READ_ONLY",
          retentionClass: "INDEFINITE",
          isPinned: true,
        },
        {
          id: `${RUN_PREFIX}-${label}-producer-durable-artifact`,
          claimId: producerClaimId,
          claimGeneration: 1,
          evidenceRef: "gateway-durable-evidence",
          evidenceKind: "DURABLE_EVIDENCE",
          sourceArtifactId: durableArtifactId,
          fileId: durableArtifactId,
          contentHash: durableHash,
          mimeType: "application/json",
          byteSize: durableBytes.byteLength,
          creatingClaimId: producerClaimId,
          accessMode: "READ_ONLY",
          retentionClass: "INDEFINITE",
          isPinned: true,
        },
        ...[
          ["gateway-deterministic-validation", "DETERMINISTIC_VALIDATION", `${producerClaimId}:gateway-deterministic-validation`, validationHash, Buffer.byteLength(canonicalizeAffiliateAgentValue(validationOutput))],
          ["gateway-committed-package", "COMMITTED_PACKAGE", `${producerClaimId}:gateway-committed-package`, packageHash, packageBytes.byteLength],
          ["gateway-durable-evidence", "DURABLE_EVIDENCE", durableArtifactId, durableHash, durableBytes.byteLength],
        ].map(([evidenceRef, evidenceKind, artifactId, contentHash, byteSize], index) => ({
          id: `${RUN_PREFIX}-${label}-reviewer-artifact-${index + 1}`,
          claimId: reviewerClaimId,
          claimGeneration: 1,
          evidenceRef: evidenceRef as string,
          evidenceKind: evidenceKind as string,
          sourceArtifactId: artifactId as string,
          fileId: artifactId as string,
          contentHash: contentHash as string,
          mimeType: evidenceKind === "COMMITTED_PACKAGE" ? "application/json" : "application/json",
          byteSize: byteSize as number,
          creatingClaimId: producerClaimId,
          accessMode: "READ_ONLY",
          retentionClass: "INDEFINITE",
          isPinned: true,
        })),
      ],
    });
  });
  const harness = createGatewayHarness(label, {
    readImmutable: async ({ fileId }) => {
      if (fileId === `supply-contract:${activeManifest.supplyContract.hash}`) {
        const { hash: _hash, ...contractPreimage } = activeManifest.supplyContract;
        const bytes = Buffer.from(
          canonicalizeAffiliateAgentValue(contractPreimage),
          "utf8",
        );
        return {
          bytes,
          mimeType: "application/json",
          byteSize: bytes.byteLength,
          sourceUrl: null,
          finalUrl: null,
        };
      }
      if (
        fileId === sourcePageArtifactId
        || fileId === "source-page"
      ) {
        return {
          bytes: sourcePageBytes,
          mimeType: "text/html",
          byteSize: sourcePageBytes.byteLength,
          sourceUrl: `https://source.example.test/${label}/events`,
          finalUrl: `https://source.example.test/${label}/events`,
          runId,
          intakeId,
        };
      }
      if (fileId === `${producerClaimId}:gateway-committed-package`) {
        return {
          bytes: packageBytes,
          mimeType: "application/json",
          byteSize: packageBytes.byteLength,
          sourceUrl: null,
          finalUrl: null,
        };
      }
      if (fileId === durableArtifactId) {
        return {
          bytes: durableBytes,
          mimeType: "application/json",
          byteSize: durableBytes.byteLength,
          sourceUrl: null,
          finalUrl: null,
        };
      }
      throw new Error(`Unknown recovery artifact ${fileId}.`);
    },
  });
  harness.setActiveBundle(bundle);
  return {
    label,
    supplySourceId,
    sourceId,
    mappingId,
    mappingJobId,
    runId,
    intakeId,
    producerClaimId,
    producerJobId,
    reviewerClaimId,
    reviewerJobId,
    receiptId,
    producerCommitReceiptId,
    producerTerminalReceiptId,
    packageHash,
    bundle,
    request: {
      mode: "PREVIEW",
      receiptId,
      jobId: reviewerJobId,
      claimId: reviewerClaimId,
      supplySourceId,
      reason: "authorized reviewer effect recovery",
    },
    catalog,
    sourcePageBytes,
    packageBytes,
    durableBytes,
    harness,
  };
};

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
      targetKind: "EVENT",
      lifecycleGeneration,
    },
  });
};

const seedMappingJob = async (label: string): Promise<string> => {
  const id = `${RUN_PREFIX}-${label}-job`;
  const mappingJobId = `${RUN_PREFIX}-${label}-mapping-job`;
  const supplySourceId = `${RUN_PREFIX}-${label}-supply-source`;
  const sourceId = `${RUN_PREFIX}-${label}-scrape-source`;
  await seedSupplySource(supplySourceId);
  await prisma.affiliateScrapeSources.create({
    data: {
      id: sourceId,
      name: `Gateway ${label} source`,
      sourceKey: `${RUN_PREFIX}-${label}-scrape-source-key`,
      baseUrl: `https://source.example.test/${label}`,
      listUrl: `https://source.example.test/${label}/events`,
      targetKind: "EVENT",
      status: "ACTIVE",
      supplySourceId,
      lifecycleGeneration: 7,
    },
  });
  await prisma.affiliateSourceMappingJobs.create({
    data: {
      id: mappingJobId,
      intakeId: `${RUN_PREFIX}-${label}-intake`,
      supplySourceId,
      sourceId,
      status: "QUEUED",
    },
  });
  await prisma.affiliateAgentGatewayJobs.create({
    data: {
      id,
      dedupeKey: `${RUN_PREFIX}-${label}-dedupe`,
      queue: "AFFILIATE_MAPPING",
      lane: "MAPPING_PRODUCTION",
      role: "MAPPING_PRODUCER",
      subjectType: "MAPPING_PRODUCER",
      subjectId: mappingJobId,
      subjectJson: {
        type: "MAPPING_PRODUCER",
        supplySourceId,
        mappingJobId,
        listingKind: "EVENT",
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
type SourceExclusionGatewayHarness = Readonly<{
  dependencies: AffiliateAgentGatewayDependencies;
  gateway: AffiliateAgentGateway;
  setActiveBundle(value: unknown): void;
  setNow(value: string): void;
}>;
type SourceExclusionWorkflowFixture = Readonly<{
  label: string;
  gatewayJobId: string;
  producerClaimId: string;
  supplySourceId: string;
  sourceId: string;
  mappingId: string;
  mappingJobId: string;
  intakeId: string;
  runId: string;
  organizationId: string;
  heldCandidateId: string;
  pageHtmlArtifactId: string;
  pageHtmlHash: string;
  pageUrl: string;
  currentCatalogHash: string;
  bundle: RecoveryContractBundle;
  harness: SourceExclusionGatewayHarness;
  claimAdmission: AffiliateAgentClaimAdmission;
}>;

const seedSourceExclusionWorkflow = async (
  label: string,
): Promise<SourceExclusionWorkflowFixture> => {
  const gatewayJobId = `${RUN_PREFIX}-${label}-producer-job`;
  const producerClaimId = `${RUN_PREFIX}-${label}-producer-claim`;
  const producerTerminalReceiptId = `${RUN_PREFIX}-${label}-producer-terminal`;
  const supplySourceId = `${RUN_PREFIX}-${label}-supply-source`;
  const sourceId = `${RUN_PREFIX}-${label}-source`;
  const mappingId = `${RUN_PREFIX}-${label}-mapping`;
  const mappingJobId = `${RUN_PREFIX}-${label}-mapping-job`;
  const intakeId = `${RUN_PREFIX}-${label}-intake`;
  const runId = `${RUN_PREFIX}-${label}-run`;
  const organizationId = `${RUN_PREFIX}-${label}-canonical-club`;
  const heldCandidateId = `${RUN_PREFIX}-${label}-held-club-candidate`;
  const pageId = `${RUN_PREFIX}-${label}-page`;
  const rolloutCohort = `${RUN_PREFIX}-${label}-cohort`;
  const pageUrl = `https://source.example.test/${label}/events`;
  const activeManifest = recoverySupplyManifestFor(rolloutCohort);
  const bundle = recoveryContractBundleFor(activeManifest);
  const currentCatalog = await loadAffiliateSportsCatalogSnapshot(
    prisma,
    INITIAL_TIME.toISOString(),
  );
  const historicalCatalog = buildAffiliateSportsCatalogSnapshot(
    currentCatalog.sports,
    new Date(INITIAL_TIME.getTime() - 86_400_000).toISOString(),
  );
  const repairContext = {
    kind: "LEGACY_SPORT_REPAIR" as const,
    intakeId,
    evidenceRunId: runId,
    sportsCatalog: historicalCatalog,
  };
  const pageArtifacts = [
    {
      id: `${RUN_PREFIX}-${label}-html`,
      kind: "PAGE_HTML" as const,
      fileId: `${RUN_PREFIX}-${label}-html-file`,
      mimeType: "text/html",
      bytes: Buffer.from(
        `<html><body><h1>Track and Field</h1><p>All events are Track and Field.</p></body></html>`,
        "utf8",
      ),
    },
    {
      id: `${RUN_PREFIX}-${label}-markdown`,
      kind: "PAGE_MARKDOWN" as const,
      fileId: `${RUN_PREFIX}-${label}-markdown-file`,
      mimeType: "text/markdown",
      bytes: Buffer.from("# Track and Field\nAll events are Track and Field.\n", "utf8"),
    },
  ].map((artifact) => ({
    ...artifact,
    contentHash: createHash("sha256").update(artifact.bytes).digest("hex"),
    sourceUrl: pageUrl,
    finalUrl: pageUrl,
  }));
  const parentManifest = recoveryEvidenceManifestFor(
    pageArtifacts.map((artifact) => ({
      evidenceRef: `${artifact.kind.toLowerCase()}-evidence`,
      kind: artifact.kind,
      artifactId: `intake-artifact:${artifact.id}`,
      sha256: artifact.contentHash,
      mimeType: artifact.mimeType,
      byteSize: artifact.bytes.byteLength,
      retention: "INDEFINITE" as const,
    })),
  );
  const producerSubject = {
    type: "MAPPING_PRODUCER" as const,
    supplySourceId,
    mappingJobId,
    listingKind: "EVENT" as const,
    pass: 1,
    repairContext,
  };
  const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER;
  const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES.MAPPING_PRODUCER;
  const producerEnvelope = {
    schemaVersion: 1 as const,
    queue: "AFFILIATE_MAPPING" as const,
    lane: "MAPPING_PRODUCTION" as const,
    jobId: gatewayJobId,
    claimId: producerClaimId,
    supplySourceId,
    claimGeneration: 1,
    lifecycleGeneration: 7,
    deploymentContractVersion: bundle.deploymentContract.version,
    deploymentContractHash: bundle.deploymentContract.hash,
    supplyContractVersion: bundle.supplyContract.version,
    supplyContractHash: bundle.supplyContract.hash,
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    role: "MAPPING_PRODUCER" as const,
    executionClass: "PRODUCTION_OMP" as const,
    workerId: `${RUN_PREFIX}-${label}-producer-worker`,
    invocationId: `${RUN_PREFIX}-${label}-producer-invocation`,
    workspaceId: `${RUN_PREFIX}-${label}-producer-workspace`,
    claimedAt: new Date(INITIAL_TIME.getTime() - 600_000).toISOString(),
    expiresAt: new Date(INITIAL_TIME.getTime() - 300_000).toISOString(),
    evidenceManifest: parentManifest,
    subject: producerSubject,
    permittedCommands: [...roleContract.permittedCommands],
  };
  const producerResult = {
    schemaVersion: 1 as const,
    jobId: gatewayJobId,
    claimId: producerClaimId,
    claimGeneration: 1,
    lifecycleGeneration: 7,
    deploymentContractVersion: producerEnvelope.deploymentContractVersion,
    deploymentContractHash: producerEnvelope.deploymentContractHash,
    supplyContractVersion: producerEnvelope.supplyContractVersion,
    supplyContractHash: producerEnvelope.supplyContractHash,
    roleContractVersion: producerEnvelope.roleContractVersion,
    roleContractHash: producerEnvelope.roleContractHash,
    promptTemplateVersion: producerEnvelope.promptTemplateVersion,
    promptTemplateHash: producerEnvelope.promptTemplateHash,
    workerId: producerEnvelope.workerId,
    invocationId: producerEnvelope.invocationId,
    role: "MAPPING_PRODUCER" as const,
    disposition: "CONTRACT_GAP" as const,
    reasonCodes: ["SPORT_NOT_IN_CATALOG"] as const,
    evidenceRefs: parentManifest.entries.map(({ evidenceRef }) => evidenceRef),
    summary: "The historical producer recorded an unsupported Track and Field activity.",
    payload: {
      contractArea: "MAPPING_EVIDENCE" as const,
      requestedChange: "Record the unsupported source activity for bounded review.",
      sportEvidence: {
        evidenceRunId: runId,
        sportsCatalogSha256: historicalCatalog.sha256,
        sportDeterminations: [{
          sourceLabels: ["Track and Field"],
          status: "UNSUPPORTED" as const,
          resolutionBasis: "SOURCE_EVIDENCE" as const,
          canonicalSportNames: [],
          rationale: "The historical source evidence identified Track and Field outside the catalog.",
          evidence: [{
            artifactId: `intake-artifact:${pageArtifacts[0]!.id}`,
            artifactSha256: pageArtifacts[0]!.contentHash,
            artifactKind: "PAGE_HTML" as const,
            pageUrl,
            excerpt: "Track and Field",
          }],
        }],
      },
    },
  };
  const producerResultHash = hashAffiliateAgentValue(producerResult);
  const terminalResponse = {
    kind: "TERMINAL_ACCEPTED" as const,
    receiptId: producerTerminalReceiptId,
    resultHash: producerResultHash,
    disposition: producerResult.disposition,
  };
  const identity = normalizeAffiliateSupplyIdentity({
    requestedUrl: pageUrl,
    resolvedCanonicalUrl: pageUrl,
    operatorDomain: new URL(pageUrl).hostname,
  });
  await prisma.$transaction(async (transaction) => {
    await transaction.affiliateSupplyContractManifests.create({
      data: {
        id: `${RUN_PREFIX}-${label}-contract`,
        rolloutCohort,
        version: activeManifest.version,
        status: "ACTIVE",
        contractHash: activeManifest.hash,
        contractJson: activeManifest.supplyContract,
      },
    });
    await transaction.organizations.create({
      data: {
        id: organizationId,
        name: `Canonical ${label} Club`,
        ownerId: `${RUN_PREFIX}-${label}-owner`,
        status: "UNLISTED",
        originType: "AFFILIATE_IMPORTED",
        ownershipStatus: "UNCLAIMED",
        publicPageEnabled: false,
        publicWidgetsEnabled: false,
      },
    });
    await transaction.affiliateSupplySources.create({
      data: {
        id: supplySourceId,
        identityKey: identity.identityKey,
        canonicalUrl: identity.canonicalUrl,
        origin: identity.origin,
        pathKey: identity.pathKey,
        targetKind: "EVENT",
        rolloutCohort,
        intakeId,
        liveSourceId: sourceId,
        lifecycleGeneration: 7,
        activeSupplyContractVersion: activeManifest.supplyContract.version,
        activeSupplyContractHash: activeManifest.supplyContract.hash,
        derivedStage: "MAPPED",
        isAutomationEnabled: false,
        isExcluded: false,
        automationHoldReason: "LEGACY_SPORT_REPAIR",
        metadata: {
          automationReviewRequired: {
            hold: true,
            reason: "LEGACY_SPORT_REPAIR",
            evidenceRefs: parentManifest.entries.map(({ evidenceRef }) => evidenceRef),
          },
        },
      },
    });
    await transaction.affiliateSourceIntakes.create({
      data: {
        id: intakeId,
        name: `Source exclusion ${label}`,
        sourceKey: `${RUN_PREFIX}-${label}-source-key`,
        baseUrl: pageUrl,
        organizationId,
        status: "READY_FOR_MAPPING",
        complianceStatus: "UNREVIEWED",
        targetKindHints: ["EVENT"],
        affiliateSourceId: sourceId,
        supplySourceId,
        lastRunId: runId,
      },
    });
    await transaction.affiliateScrapeSources.create({
      data: {
        id: sourceId,
        name: `Source exclusion ${label}`,
        sourceKey: `${RUN_PREFIX}-${label}-source-key`,
        baseUrl: pageUrl,
        listUrl: pageUrl,
        organizationId,
        targetKind: "EVENT",
        status: "HELD",
        activeMappingId: mappingId,
        supplySourceId,
        lifecycleGeneration: 7,
        activeSupplyContractVersion: activeManifest.supplyContract.version,
        activeSupplyContractHash: activeManifest.supplyContract.hash,
        autoScrapeEnabled: false,
        metadata: {
          automationReviewRequired: {
            hold: true,
            reason: "LEGACY_SPORT_REPAIR",
          },
        },
      },
    });
    await transaction.affiliateScrapeMappings.create({
      data: {
        id: mappingId,
        sourceId,
        supplySourceId,
        version: 1,
        isActive: true,
        mapping: { kind: "EVENT", listUrl: pageUrl, itemSelector: "article" },
      },
    });
    await transaction.affiliateSourceMappingJobs.create({
      data: {
        id: mappingJobId,
        intakeId,
        supplySourceId,
        sourceId,
        mappingId,
        status: "REVIEW_REQUIRED",
        resultSummary: {
          sportReconciliationHistory: [{
            status: "UNSUPPORTED",
            reasonCodes: ["SPORT_NOT_IN_CATALOG"],
            sourceLabels: ["Track and Field"],
          }],
        },
        finishedAt: INITIAL_TIME,
      },
    });
    await transaction.affiliateSourceIntakePages.create({
      data: {
        id: pageId,
        intakeId,
        supplySourceId,
        url: pageUrl,
        canonicalUrl: pageUrl,
        urlKey: `${RUN_PREFIX}-${label}-page-key`,
        role: "LISTING",
        targetKindHints: ["EVENT"],
        status: "ACTIVE",
        discoverySource: "MANUAL",
      },
    });
    await transaction.affiliateSourceIntakeRuns.create({
      data: {
        id: runId,
        intakeId,
        supplySourceId,
        requestedPageIds: [pageId],
        provider: "MANUAL",
        status: "SUCCEEDED",
        startedAt: new Date(INITIAL_TIME.getTime() - 120_000),
        finishedAt: INITIAL_TIME,
        capturedPageCount: pageArtifacts.length,
      },
    });
    await transaction.affiliateImportCandidates.create({
      data: {
        id: heldCandidateId,
        sourceId,
        supplySourceId,
        runId,
        mappingId,
        listingKind: "CLUB",
        status: "HELD",
        dedupeKey: `${RUN_PREFIX}-${label}-canonical-club`,
        title: `Canonical ${label} Club`,
        organizerName: `Canonical ${label} Club`,
        officialActionUrl: pageUrl,
        sourceUrl: pageUrl,
        rawPayload: {
          fixture: "source-exclusion",
          canonicalOrganizationId: organizationId,
        },
        publishedOrganizationId: organizationId,
      },
    });
    for (const artifact of pageArtifacts) {
      await transaction.file.create({
        data: {
          id: artifact.fileId,
          originalName: `${artifact.kind.toLowerCase()}.evidence`,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.bytes.byteLength,
          path: `${RUN_PREFIX}/${label}/${artifact.fileId}`,
        },
      });
      await transaction.affiliateSourceIntakeArtifacts.create({
        data: {
          id: artifact.id,
          intakeId,
          supplySourceId,
          pageId,
          runId,
          kind: artifact.kind,
          sourceUrl: pageUrl,
          finalUrl: pageUrl,
          provider: "MANUAL",
          httpStatus: 200,
          contentHash: artifact.contentHash,
          dedupeKey: `${RUN_PREFIX}-${label}-${artifact.kind.toLowerCase()}`,
          fileId: artifact.fileId,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.bytes.byteLength,
          isPinned: true,
        },
      });
    }
    await transaction.affiliateAgentGatewayJobs.create({
      data: {
        id: gatewayJobId,
        dedupeKey: `${RUN_PREFIX}-${label}-producer`,
        queue: "AFFILIATE_MAPPING",
        lane: "MAPPING_PRODUCTION",
        role: "MAPPING_PRODUCER",
        subjectType: "MAPPING_PRODUCER",
        subjectId: mappingJobId,
        subjectJson: producerSubject,
        evidenceManifestJson: parentManifest,
        supplySourceId,
        expectedLifecycleGeneration: 7,
        status: "COMPLETED",
        claimGeneration: 1,
        activeClaimId: null,
        parentClaimId: null,
        terminalDisposition: "CONTRACT_GAP",
        resultHash: producerResultHash,
        resultJson: producerResult,
        terminalReceiptId: producerTerminalReceiptId,
        finishedAt: INITIAL_TIME,
        eventSequence: 1,
      },
    });
    await transaction.affiliateAgentGatewayClaims.create({
      data: {
        id: producerClaimId,
        jobId: gatewayJobId,
        claimGeneration: 1,
        lifecycleGeneration: 7,
        queue: "AFFILIATE_MAPPING",
        lane: "MAPPING_PRODUCTION",
        role: "MAPPING_PRODUCER",
        workerId: producerEnvelope.workerId,
        invocationId: producerEnvelope.invocationId,
        workspaceId: producerEnvelope.workspaceId,
        workspaceMode: "READ_WRITE",
        workspaceAttestationHash: hashAffiliateAgentValue({
          workerId: producerEnvelope.workerId,
          invocationId: producerEnvelope.invocationId,
          workspaceId: producerEnvelope.workspaceId,
        }),
        status: "COMPLETED",
        claimRequestId: `${RUN_PREFIX}-${label}-producer-request`,
        claimRequestHash: hashAffiliateAgentValue({ producerClaimId }),
        claimedAt: new Date(INITIAL_TIME.getTime() - 600_000),
        lastHeartbeatAt: new Date(INITIAL_TIME.getTime() - 600_000),
        leaseExpiresAt: new Date(INITIAL_TIME.getTime() - 300_000),
        hardDeadlineAt: new Date(INITIAL_TIME.getTime() - 60_000),
        endedAt: INITIAL_TIME,
        tokenNonce: `${RUN_PREFIX}-${label}-producer-token`,
        tokenHash: `${RUN_PREFIX}-${label}-producer-token-hash`,
        tokenKeyVersion: "database-key-v1",
        tokenExpiresAt: new Date(INITIAL_TIME.getTime() - 60_000),
        tokenInvalidatedAt: INITIAL_TIME,
        deploymentContractVersion: producerEnvelope.deploymentContractVersion,
        deploymentContractHash: producerEnvelope.deploymentContractHash,
        roleContractVersion: producerEnvelope.roleContractVersion,
        roleContractHash: producerEnvelope.roleContractHash,
        promptTemplateVersion: producerEnvelope.promptTemplateVersion,
        promptTemplateHash: producerEnvelope.promptTemplateHash,
        supplyContractVersion: producerEnvelope.supplyContractVersion,
        supplyContractHash: producerEnvelope.supplyContractHash,
        claimEnvelopeHash: hashAffiliateAgentValue(producerEnvelope),
        claimEnvelopeJson: producerEnvelope,
        evidenceManifestHash: parentManifest.hash,
        permittedCommandHash: hashAffiliateAgentValue(producerEnvelope.permittedCommands),
        permittedCommands: [...producerEnvelope.permittedCommands],
        terminalReceiptId: producerTerminalReceiptId,
      },
    });
    await transaction.affiliateAgentGatewayOperationReceipts.create({
      data: {
        id: producerTerminalReceiptId,
        claimId: producerClaimId,
        jobId: gatewayJobId,
        claimGeneration: 1,
        idempotencyKey: `${RUN_PREFIX}-${label}-producer-terminal`,
        operationKind: "SUBMIT_RESULT",
        commandName: "SUBMIT_TERMINAL_RESULT",
        requestHash: hashAffiliateAgentValue({ producerResult }),
        status: "SUCCEEDED",
        responseHash: hashAffiliateAgentValue(terminalResponse),
        responseJson: terminalResponse,
        startedAt: new Date(INITIAL_TIME.getTime() - 120_000),
        completedAt: new Date(INITIAL_TIME.getTime() - 60_000),
      },
    });
    await transaction.affiliateAgentGatewayArtifacts.createMany({
      data: pageArtifacts.map((artifact) => ({
        id: `${RUN_PREFIX}-${label}-parent-${artifact.kind.toLowerCase()}`,
        claimId: producerClaimId,
        claimGeneration: 1,
        evidenceRef: `${artifact.kind.toLowerCase()}-evidence`,
        evidenceKind: artifact.kind,
        sourceArtifactId: `intake-artifact:${artifact.id}`,
        fileId: `intake-artifact:${artifact.id}`,
        contentHash: artifact.contentHash,
        mimeType: artifact.mimeType,
        byteSize: artifact.bytes.byteLength,
        creatingClaimId: producerClaimId,
        accessMode: "READ_ONLY",
        retentionClass: "INDEFINITE",
        isPinned: true,
      })),
    });
    await transaction.affiliateAgentGatewayEvents.create({
      data: {
        id: `${RUN_PREFIX}-${label}-producer-created`,
        eventKey: `${RUN_PREFIX}-${label}-producer-created`,
        jobId: gatewayJobId,
        claimId: null,
        receiptId: null,
        sequence: 1,
        eventType: "JOB_CREATED",
        actorKind: "SYSTEM",
        actorId: "source-exclusion-workflow",
        role: "MAPPING_PRODUCER",
        requestHash: hashAffiliateAgentValue({ gatewayJobId }),
        payload: {},
        retentionClass: "INDEFINITE",
      },
    });
  });
  const artifactBytesByHandle = new Map(
    pageArtifacts.map((artifact) => [
      `intake-artifact:${artifact.id}`,
      artifact,
    ]),
  );
  const claimAdmission = createAffiliateAgentClaimAdmission();
  const harness = createGatewayHarness(label, {
    claimAdmission,
    lifecycle: {
      kind: "AVAILABLE",
      currentGeneration: async (id) => (await prisma.affiliateSupplySources.findUniqueOrThrow({ where: { id } })).lifecycleGeneration,
      resolveRecordedCommand: async () => { throw new Error("Source review must not resolve a human command."); },
      execute: async () => { throw new Error("Source review must not execute a human command."); },
      recover: async () => null,
    },
    readImmutable: async ({ fileId }) => {
      if (fileId === `supply-contract:${activeManifest.supplyContract.hash}`) {
        const { hash: _hash, ...contractPreimage } = activeManifest.supplyContract;
        const bytes = Buffer.from(
          canonicalizeAffiliateAgentValue(contractPreimage),
          "utf8",
        );
        return {
          bytes: new Uint8Array(bytes),
          mimeType: "application/json",
          byteSize: bytes.byteLength,
          sourceUrl: null,
          finalUrl: null,
        };
      }
      const artifact = artifactBytesByHandle.get(fileId);
      if (!artifact) throw new Error(`Unknown source exclusion artifact ${fileId}.`);
      return {
        bytes: new Uint8Array(artifact.bytes),
        mimeType: artifact.mimeType,
        byteSize: artifact.bytes.byteLength,
        sourceUrl: artifact.sourceUrl,
        finalUrl: artifact.finalUrl,
        intakeId,
        runId,
      };
    },
  });
  harness.setActiveBundle(bundle);
  return {
    label,
    gatewayJobId,
    producerClaimId,
    supplySourceId,
    sourceId,
    mappingId,
    mappingJobId,
    intakeId,
    runId,
    organizationId,
    heldCandidateId,
    pageHtmlArtifactId: `intake-artifact:${pageArtifacts[0]!.id}`,
    pageHtmlHash: pageArtifacts[0]!.contentHash,
    pageUrl,
    currentCatalogHash: currentCatalog.sha256,
    bundle,
    harness,
    claimAdmission,
  };
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
  const coverageCellId = `${RUN_PREFIX}-${label}-coverage-cell`;
  const manifest = coverageManifestFor(label);
  await prisma.affiliateAgentGatewayJobs.create({
    data: {
      id,
      dedupeKey: `${RUN_PREFIX}-${label}-dedupe`,
      queue: "AFFILIATE_COVERAGE",
      lane: "COVERAGE_PLANNING",
      role: "COVERAGE_PLANNER",
      subjectType: "COVERAGE_PLANNER",
      subjectId: coverageCellId,
      subjectJson: {
        type: "COVERAGE_PLANNER",
        coverageCellId,
        assessmentCycleId: `${RUN_PREFIX}-${label}-cycle`,
      },
      evidenceManifestJson: manifest,
      invocationFailureCount: input.invocationFailureCount ?? 0,
      nextAttemptAt: INITIAL_TIME,
    },
  });
  return id;
};
const seedCoveragePlanningWave = async (
  label: string,
  jobId: string,
): Promise<void> => {
  const coverageCellId = `${RUN_PREFIX}-${label}-coverage-cell`;
  const demandId = `${RUN_PREFIX}-${label}-demand`;
  await prisma.affiliateReplenishmentDemands.create({
    data: {
      id: demandId,
      targetKey: coverageCellId,
      marketKey: `${RUN_PREFIX}-${label}-market`,
      sportId: `${RUN_PREFIX}-${label}-sport`,
      sourceProfile: "EVENT",
      rolloutCohort: "DEFAULT",
      contractVersion: contractBundleFixture.supplyContract.version,
      contractHash: contractBundleFixture.supplyContract.hash,
      minimumFreshPublishedSupply: 1,
      reasonCodes: [],
      evidenceJson: {},
    },
  });
  await prisma.affiliateReplenishmentWaves.create({
    data: {
      id: `${RUN_PREFIX}-${label}-wave`,
      demandId,
      rolloutCohort: "DEFAULT",
      coveragePlanningJobId: jobId,
      demandGeneration: 0,
    },
  });
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

const sourceExclusionTerminalResultFor = (
  grant: AffiliateAgentClaimGrant,
  fixture: Pick<
    SourceExclusionWorkflowFixture,
    "pageHtmlArtifactId" | "pageHtmlHash" | "pageUrl" | "currentCatalogHash"
  >,
) => {
  const subject = grant.envelope.subject;
  if (subject.type !== "SOURCE_EXCLUSION_REVIEW") {
    throw new Error("Expected a source exclusion reviewer claim.");
  }
  const pageEntry = grant.envelope.evidenceManifest.entries.find(
    (entry) => entry.artifactId === fixture.pageHtmlArtifactId,
  );
  if (!pageEntry) throw new Error("Expected the source HTML in the reviewer manifest.");
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
    invocationId: grant.envelope.invocationId,
    role: "SUPPLY_REVIEWER" as const,
    disposition: "SOURCE_EXCLUSION_ASSESSED" as const,
    reasonCodes: ["SPORT_BLACKLISTED"] as const,
    evidenceRefs: [pageEntry.evidenceRef],
    summary: "Independent review confirmed that every source activity is blacklisted.",
    payload: {
      supplySourceId: subject.supplySourceId,
      recommendation: "EXCLUDE" as const,
      sportEvidence: {
        evidenceRunId: subject.repairContext.evidenceRunId,
        sportsCatalogSha256: fixture.currentCatalogHash,
        sportDeterminations: [{
          sourceLabels: ["Track and Field"],
          status: "BLACKLISTED" as const,
          resolutionBasis: "SOURCE_EVIDENCE" as const,
          canonicalSportNames: [],
          rationale: "The source pages explicitly identify Track and Field.",
          evidence: [{
            artifactId: fixture.pageHtmlArtifactId,
            artifactSha256: fixture.pageHtmlHash,
            artifactKind: "PAGE_HTML" as const,
            pageUrl: fixture.pageUrl,
            excerpt: "Track and Field",
          }],
        }],
      },
    },
  };
};

const admitSourceExclusionForTest = async (label: string) => {
  const fixture = await seedSourceExclusionWorkflow(label);
  const options = {
    prisma, artifactStore: fixture.harness.dependencies.artifacts, bundle: fixture.bundle,
    gatewayJobId: fixture.gatewayJobId, reason: "Independently review the blacklisted source.",
    operatorId: `${RUN_PREFIX}-operator`,
  };
  const preview = await previewAffiliateSourceExclusionAdmission(options);
  expect(preview.reasonCodes).toEqual([]);
  const applied = await applyAffiliateSourceExclusionAdmission({ ...options, expectedReportHash: preview.reportHash });
  if (!applied.reviewerJobId) throw new Error("The source review job was not created.");
  const job = await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: applied.reviewerJobId } });
  if (!job.nextAttemptAt) throw new Error("The source review job has no admission time.");
  fixture.harness.setNow(job.nextAttemptAt.toISOString());
  const request = requestFor(label, "SUPPLY_REVIEWER", job.nextAttemptAt);
  await fixture.claimAdmission.openBoundedLease({
    role: "SUPPLY_REVIEWER", workerId: request.workerId, jobId: job.id, leaseSeconds: 1_200,
  });
  return { fixture, options, preview, job, request };
};

const claimSourceExclusionForTest = async (label: string) => {
  const prepared = await admitSourceExclusionForTest(label);
  const grant = await claimOrThrow(prepared.fixture.harness.gateway, prepared.request);
  for (const entry of grant.envelope.evidenceManifest.entries) {
    await prepared.fixture.harness.gateway.perform({
      kind: "READ_ARTIFACT", idempotencyKey: `${RUN_PREFIX}-${label}-read-${entry.evidenceRef}`,
      authorization: authorizationFor(grant), evidenceRef: entry.evidenceRef,
    });
  }
  const operation = {
    kind: "SUBMIT_RESULT" as const,
    idempotencyKey: `${RUN_PREFIX}-${label}-terminal`,
    authorization: authorizationFor(grant),
    result: sourceExclusionTerminalResultFor(grant, prepared.fixture),
  };
  return { ...prepared, grant, operation };
};

type GatewayHarnessOptions = Readonly<{
  database?: typeof prisma;
  commands?: AffiliateAgentCommandAdapters;
  terminalEffects?: AffiliateAgentTerminalEffectAdapter;
  lifecycle?: AffiliateAgentLifecycleAuthority;
  readImmutable?: AffiliateAgentGatewayDependencies["artifacts"]["readImmutable"];
  claimAdmission?: AffiliateAgentClaimAdmission;
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
        finalUrl: "https://evidence.example.test/database",
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
    claimAdmission: options.claimAdmission,
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
    where: { OR: [{ id: { startsWith: RUN_PREFIX } }, { supplySourceId: { startsWith: RUN_PREFIX } }] },
    select: { id: true },
  });
  const jobIds = jobs.map(({ id }) => id);
  const supplySourceIds = (
    await prisma.affiliateSupplySources.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const candidateIds = (
    await prisma.affiliateImportCandidates.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const organizationIds = (
    await prisma.organizations.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const mappingJobIds = (
    await prisma.affiliateSourceMappingJobs.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const scrapeSourceIds = (
    await prisma.affiliateScrapeSources.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const scrapeMappingIds = (
    await prisma.affiliateScrapeMappings.findMany({
      where: {
        OR: [
          { id: { startsWith: RUN_PREFIX } },
          { sourceId: { startsWith: RUN_PREFIX } },
        ],
      },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const contractManifestIds = (
    await prisma.affiliateSupplyContractManifests.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const demandIds = (
    await prisma.affiliateReplenishmentDemands.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const waveIds = (
    await prisma.affiliateReplenishmentWaves.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const intakeIds = (
    await prisma.affiliateSourceIntakes.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const runIds = (
    await prisma.affiliateSourceIntakeRuns.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const pageIds = (
    await prisma.affiliateSourceIntakePages.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const intakeArtifactIds = (
    await prisma.affiliateSourceIntakeArtifacts.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  const fileIds = (
    await prisma.file.findMany({
      where: { id: { startsWith: RUN_PREFIX } },
      select: { id: true },
    })
  ).map(({ id }) => id);
  if (
    jobIds.length === 0
    && supplySourceIds.length === 0
    && candidateIds.length === 0
    && organizationIds.length === 0
    && mappingJobIds.length === 0
    && scrapeSourceIds.length === 0
    && scrapeMappingIds.length === 0
    && contractManifestIds.length === 0
    && waveIds.length === 0
    && demandIds.length === 0
    && runIds.length === 0
    && pageIds.length === 0
    && intakeArtifactIds.length === 0
    && fileIds.length === 0
  ) return;
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
    if (intakeArtifactIds.length > 0) {
      await transaction.affiliateSourceIntakeArtifacts.deleteMany({
        where: { id: { in: intakeArtifactIds } },
      });
    }
    if (runIds.length > 0) {
      await transaction.affiliateSourceIntakeRuns.deleteMany({
        where: { id: { in: runIds } },
      });
    }
    if (pageIds.length > 0) {
      await transaction.affiliateSourceIntakePages.deleteMany({
        where: { id: { in: pageIds } },
      });
    }
    if (intakeIds.length > 0) {
      await transaction.affiliateSourceIntakes.deleteMany({
        where: { id: { in: intakeIds } },
      });
    }
    if (fileIds.length > 0) {
      await transaction.file.deleteMany({
        where: { id: { in: fileIds } },
      });
    }
    if (supplySourceIds.length > 0) {
      await transaction.affiliateSupplyLifecycleTransitions.deleteMany({
        where: { supplySourceId: { in: supplySourceIds } },
      });
    }
    if (contractManifestIds.length > 0) {
      await transaction.affiliateSupplyContractManifests.deleteMany({
        where: { id: { in: contractManifestIds } },
      });
    }
    if (scrapeMappingIds.length > 0) {
      await transaction.affiliateScrapeMappings.deleteMany({
        where: { id: { in: scrapeMappingIds } },
      });
    }
    if (mappingJobIds.length > 0) {
      await transaction.affiliateSourceMappingJobs.deleteMany({
        where: { id: { in: mappingJobIds } },
      });
    }
    if (waveIds.length > 0) {
      await transaction.affiliateReplenishmentWaves.deleteMany({
        where: { id: { in: waveIds } },
      });
    }
    if (demandIds.length > 0) {
      await transaction.affiliateReplenishmentDemands.deleteMany({
        where: { id: { in: demandIds } },
      });
    }
    if (candidateIds.length > 0) {
      await transaction.affiliateImportCandidates.deleteMany({
        where: { id: { in: candidateIds } },
      });
    }
    if (scrapeSourceIds.length > 0) {
      await transaction.affiliateScrapeSources.deleteMany({
        where: { id: { in: scrapeSourceIds } },
      });
    }
    if (supplySourceIds.length > 0) {
      await transaction.affiliateSupplySources.deleteMany({
        where: { id: { in: supplySourceIds } },
      });
    }
    if (organizationIds.length > 0) {
      await transaction.organizations.deleteMany({
        where: { id: { in: organizationIds } },
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
const recordValueForTest = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a JSON object in the recovery fixture.");
  }
  // The runtime guard above proves the persisted JSON object shape.
  return value as Record<string, unknown>;
};
const recoveryDurableStateFor = async (
  fixture: ReviewerEffectRecoveryFixture,
) => {
  const [
    root,
    source,
    mapping,
    mappingJob,
    reviewerJob,
    reviewerClaim,
    effectReceipt,
    contractManifest,
    approvals,
    events,
    transitions,
    targets,
  ] = await Promise.all([
    prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: fixture.supplySourceId },
    }),
    prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: fixture.sourceId },
    }),
    prisma.affiliateScrapeMappings.findUniqueOrThrow({
      where: { id: fixture.mappingId },
    }),
    prisma.affiliateSourceMappingJobs.findUniqueOrThrow({
      where: { id: fixture.mappingJobId },
    }),
    prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({

      where: { id: fixture.reviewerJobId },
    }),
    prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
      where: { id: fixture.reviewerClaimId },
    }),
    prisma.affiliateAgentGatewayOperationReceipts.findUniqueOrThrow({
      where: { id: fixture.receiptId },
    }),
    prisma.affiliateSupplyContractManifests.findUniqueOrThrow({
      where: { id: `${RUN_PREFIX}-${fixture.label}-supply-contract` },
    }),
    prisma.affiliateApprovalJobs.findMany({
      where: { supplySourceId: fixture.supplySourceId },
      orderBy: [{ id: "asc" }],
    }),
    prisma.affiliateAgentGatewayEvents.findMany({
      where: { jobId: fixture.reviewerJobId },
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    }),
    prisma.affiliateSupplyLifecycleTransitions.findMany({
      where: { supplySourceId: fixture.supplySourceId },
      orderBy: [{ sequence: "asc" }, { id: "asc" }],
    }),
    prisma.affiliateSupplyTargets.findMany({
      where: { supplySourceId: fixture.supplySourceId },
      orderBy: [{ id: "asc" }],
    }),
  ]);
  return {
    root,
    source,
    mapping,
    mappingJob,
    reviewerJob,
    reviewerClaim,
    effectReceipt,
    contractManifest,
    approvals,
    events,
    transitions,
    targets,
  };
};

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

  it("admits an independent source exclusion reviewer and excludes only the held source", async () => {
    const fixture = await seedSourceExclusionWorkflow("source-exclusion");
    const reason = "Review Track and Field for exclusion under the current blacklist.";
    const operatorId = `${RUN_PREFIX}-operator`;
    const parentState = () => Promise.all([
      prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: fixture.gatewayJobId } }),
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({ where: { id: fixture.producerClaimId } }),
      prisma.affiliateAgentGatewayOperationReceipts.findMany({
        where: { claimId: fixture.producerClaimId }, orderBy: { id: "asc" },
      }),
      prisma.affiliateAgentGatewayArtifacts.findMany({
        where: { claimId: fixture.producerClaimId }, orderBy: { id: "asc" },
      }),
      prisma.affiliateSourceIntakeArtifacts.findMany({
        where: { intakeId: fixture.intakeId, runId: fixture.runId }, orderBy: { id: "asc" },
      }),
    ]);
    const originalParentState = await parentState();
    const beforeMapping = await prisma.affiliateScrapeMappings.findUniqueOrThrow({
      where: { id: fixture.mappingId },
    });
    const beforeTargetCount = await prisma.affiliateSupplyTargets.count({
      where: { supplySourceId: fixture.supplySourceId },
    });
    const beforeOrganization = await prisma.organizations.findUniqueOrThrow({
      where: { id: fixture.organizationId },
    });
    const beforeCandidate = await prisma.affiliateImportCandidates.findUniqueOrThrow({
      where: { id: fixture.heldCandidateId },
    });
    const beforeChildJobCount = await prisma.affiliateAgentGatewayJobs.count({
      where: { parentClaimId: fixture.producerClaimId, subjectType: "SOURCE_EXCLUSION_REVIEW" },
    });

    const preview = await previewAffiliateSourceExclusionAdmission({
      prisma,
      artifactStore: fixture.harness.dependencies.artifacts,
      bundle: fixture.bundle,
      gatewayJobId: fixture.gatewayJobId,
      reason,
      operatorId,
    });
    expect(preview.reasonCodes).toEqual([]);
    expect(preview).toMatchObject({
      mode: "PREVIEW",
      eligible: true,
      gatewayJobId: fixture.gatewayJobId,
      supplySourceId: fixture.supplySourceId,
      writeCount: 0,
      replayed: false,
    });
    expect(await prisma.affiliateAgentGatewayJobs.count({
      where: { parentClaimId: fixture.producerClaimId, subjectType: "SOURCE_EXCLUSION_REVIEW" },
    })).toBe(beforeChildJobCount);

    const applied = await applyAffiliateSourceExclusionAdmission({
      prisma,
      artifactStore: fixture.harness.dependencies.artifacts,
      bundle: fixture.bundle,
      gatewayJobId: fixture.gatewayJobId,
      reason,
      operatorId,
      expectedReportHash: preview.reportHash,
    });
    expect(applied).toMatchObject({
      mode: "APPLY",
      eligible: true,
      gatewayJobId: fixture.gatewayJobId,
      supplySourceId: fixture.supplySourceId,
      replayed: false,
      reviewerJobId: expect.any(String),
    });
    if (!applied.reviewerJobId) throw new Error("Admission did not create a reviewer job.");
    const queuedReviewer = await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
      where: { id: applied.reviewerJobId },
    });
    if (!queuedReviewer.nextAttemptAt) throw new Error("The reviewer has no admission time.");
    fixture.harness.setNow(queuedReviewer.nextAttemptAt.toISOString());

    const reviewerRequest = requestFor(
      "source-exclusion",
      "SUPPLY_REVIEWER",
      queuedReviewer.nextAttemptAt,
    );
    await fixture.claimAdmission.openBoundedLease({
      role: "SUPPLY_REVIEWER",
      workerId: reviewerRequest.workerId,
      jobId: applied.reviewerJobId,
      leaseSeconds: 1_200,
    });
    const grant = await claimOrThrow(fixture.harness.gateway, reviewerRequest);
    expect(grant.envelope.executionBudget).toBe("SINGLE_CLAIM");
    expect(grant.envelope.subject.type).toBe("SOURCE_EXCLUSION_REVIEW");
    expect(await applyAffiliateSourceExclusionAdmission({
      prisma, artifactStore: fixture.harness.dependencies.artifacts, bundle: fixture.bundle,
      gatewayJobId: fixture.gatewayJobId, reason, operatorId, expectedReportHash: preview.reportHash,
    })).toMatchObject({ replayed: true, writeCount: 0, reviewerJobId: applied.reviewerJobId });
    for (const entry of grant.envelope.evidenceManifest.entries) {
      await fixture.harness.gateway.perform({
        kind: "READ_ARTIFACT",
        idempotencyKey: `${RUN_PREFIX}-source-read-${entry.evidenceRef}`,
        authorization: authorizationFor(grant),
        evidenceRef: entry.evidenceRef,
      });
    }

    const result = sourceExclusionTerminalResultFor(grant, fixture);
    const operation = {
      kind: "SUBMIT_RESULT" as const,
      idempotencyKey: `${RUN_PREFIX}-source-exclusion-terminal`,
      authorization: authorizationFor(grant),
      result,
    };
    const invalid: typeof result = JSON.parse(JSON.stringify(result));
    invalid.payload.sportEvidence.sportDeterminations[0]!.evidence[0]!.excerpt = "A quote absent from the stored source.";
    expect(await fixture.harness.gateway.perform({
      ...operation,
      idempotencyKey: `${RUN_PREFIX}-invalid-source-quote`,
      result: invalid,
    })).toMatchObject({ kind: "SCHEMA_CORRECTION_REQUIRED" });
    expect(await prisma.affiliateAgentGatewayOperationReceipts.count({
      where: { claimId: grant.envelope.claimId, operationKind: "TERMINAL_EFFECT" },
    })).toBe(0);
    const accepted = await fixture.harness.gateway.perform(operation);
    expect(await fixture.harness.gateway.perform(operation)).toEqual(accepted);
    expect(accepted).toMatchObject({ kind: "TERMINAL_ACCEPTED", disposition: "SOURCE_EXCLUSION_ASSESSED" });
    const transitions = await prisma.affiliateSupplyLifecycleTransitions.findMany({
      where: { supplySourceId: fixture.supplySourceId },
    });
    expect(transitions).toEqual([expect.objectContaining({
      command: "EXCLUDE_SOURCE",
      actorKind: "SUPPLY_REVIEWER",
      actorId: grant.envelope.workerId,
      generation: 8,
    })]);

    const [root, source, mapping, targetCount, childJob, childArtifacts, organization, candidate] =
      await Promise.all([
        prisma.affiliateSupplySources.findUniqueOrThrow({
          where: { id: fixture.supplySourceId },
        }),
        prisma.affiliateScrapeSources.findUniqueOrThrow({
          where: { id: fixture.sourceId },
        }),
        prisma.affiliateScrapeMappings.findUniqueOrThrow({
          where: { id: fixture.mappingId },
        }),
        prisma.affiliateSupplyTargets.count({
          where: { supplySourceId: fixture.supplySourceId },
        }),
        prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({
          where: { id: applied.reviewerJobId },
        }),
        prisma.affiliateAgentGatewayArtifacts.findMany({
          where: { claimId: grant.envelope.claimId },
          orderBy: [{ id: "asc" }],
        }),
        prisma.organizations.findUniqueOrThrow({
          where: { id: fixture.organizationId },
        }),
        prisma.affiliateImportCandidates.findUniqueOrThrow({
          where: { id: fixture.heldCandidateId },
        }),
      ]);
    expect(root).toMatchObject({
      isExcluded: true,
      isAutomationEnabled: false,
    });
    expect(root.excludedAt).not.toBeNull();
    expect(source).toMatchObject({
      autoScrapeEnabled: false,
      status: "EXCLUDED",
    });
    expect(mapping).toEqual(beforeMapping);
    expect(targetCount).toBe(beforeTargetCount);
    expect(organization).toEqual(beforeOrganization);
    expect(candidate).toEqual(beforeCandidate);
    expect(childJob).toMatchObject({
      status: "COMPLETED",
      terminalDisposition: "SOURCE_EXCLUSION_ASSESSED",
    });
    expect(childArtifacts.map(({ evidenceKind }) => evidenceKind)).toEqual(
      expect.arrayContaining(["PAGE_HTML", "PAGE_MARKDOWN", "ACTIVE_SUPPLY_CONTRACT"]),
    );
    expect(childArtifacts.some(({ evidenceKind }) => (
      ["COMMITTED_PACKAGE", "DETERMINISTIC_VALIDATION", "DURABLE_EVIDENCE"].includes(evidenceKind)
    ))).toBe(false);

    const replay = await applyAffiliateSourceExclusionAdmission({
      prisma,
      artifactStore: fixture.harness.dependencies.artifacts,
      bundle: fixture.bundle,
      gatewayJobId: fixture.gatewayJobId,
      reason,
      expectedReportHash: preview.reportHash,
      operatorId,
    });
    expect(replay).toMatchObject({
      mode: "APPLY",
      eligible: true,
      replayed: true,
      reviewerJobId: applied.reviewerJobId,
      writeCount: 0,
    });
    expect(await parentState()).toEqual(originalParentState);
  }, 60_000);

  it.each([
    {
      name: "incomplete producer receipt",
      mutate: async (fixture: SourceExclusionWorkflowFixture) => prisma.affiliateAgentGatewayOperationReceipts.updateMany({
        where: { claimId: fixture.producerClaimId }, data: { responseHash: null },
      }),
      reason: "PARENT_TERMINAL_RECEIPT_RESPONSE_HASH_MISMATCH",
    },
    {
      name: "unpinned source evidence",
      mutate: async (fixture: SourceExclusionWorkflowFixture) => prisma.affiliateSourceIntakeArtifacts.updateMany({
        where: { intakeId: fixture.intakeId }, data: { isPinned: false },
      }),
      reason: "EVIDENCE_NOT_PINNED_PAGE_HTML",
    },
    {
      name: "detached live source",
      mutate: async (fixture: SourceExclusionWorkflowFixture) => prisma.affiliateScrapeSources.update({
        where: { id: fixture.sourceId }, data: { supplySourceId: null },
      }),
      reason: "ROOT_LINK_DRIFT",
    },
    {
      name: "active mapping without a parent mapping",
      mutate: async (fixture: SourceExclusionWorkflowFixture) => prisma.$transaction([
        prisma.affiliateSourceMappingJobs.update({ where: { id: fixture.mappingJobId }, data: { mappingId: null } }),
        prisma.affiliateImportCandidates.updateMany({ where: { sourceId: fixture.sourceId }, data: { mappingId: null } }),
        prisma.affiliateScrapeMappings.update({ where: { id: fixture.mappingId }, data: { validatedAt: INITIAL_TIME } }),
      ]),
      reason: "ACTIVE_MAPPING_MISMATCH",
    },
  ])("refuses admission after $name drift", async ({ mutate, reason }) => {
    const fixture = await seedSourceExclusionWorkflow(`source-drift-${reason.toLowerCase()}`);
    const options = {
      prisma, artifactStore: fixture.harness.dependencies.artifacts, bundle: fixture.bundle,
      gatewayJobId: fixture.gatewayJobId, reason: "Review the original blacklisted source.", operatorId: `${RUN_PREFIX}-operator`,
    };
    const preview = await previewAffiliateSourceExclusionAdmission(options);
    expect(preview.reasonCodes).toEqual([]);
    await mutate(fixture);
    const changed = await previewAffiliateSourceExclusionAdmission(options);
    expect(changed).toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining([reason]) });
    await expect(applyAffiliateSourceExclusionAdmission({ ...options, expectedReportHash: preview.reportHash })).rejects.toBeInstanceOf(Error);
    expect(await prisma.affiliateAgentGatewayJobs.count({
      where: { parentClaimId: fixture.producerClaimId, subjectType: "SOURCE_EXCLUSION_REVIEW" },
    })).toBe(0);
  });

  it("rejects source publication drift after admission without issuing a claim", async () => {
    const { fixture, job, request } = await admitSourceExclusionForTest("source-public-drift");
    await prisma.organizations.update({ where: { id: fixture.organizationId }, data: { publicPageEnabled: true } });
    await expect(fixture.harness.gateway.claim(request)).rejects.toMatchObject({ code: "REVIEW_WORKSPACE_INVALID" });
    expect(await prisma.affiliateAgentGatewayClaims.count({ where: { jobId: job.id } })).toBe(0);
    expect(await prisma.affiliateSupplyLifecycleTransitions.count({ where: { supplySourceId: fixture.supplySourceId } })).toBe(0);
  });

  it.each(["KEEP", "HUMAN_REVIEW"] as const)("records evidenced %s without changing the held source", async (recommendation) => {
    const { fixture, grant, operation } = await claimSourceExclusionForTest(`source-${recommendation.toLowerCase()}`);
    const before = await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: fixture.sourceId } });
    const result = {
      ...operation.result, reasonCodes: ["EVIDENCE_VERIFIED"] as const,
      payload: { supplySourceId: fixture.supplySourceId, recommendation },
    };
    await expect(fixture.harness.gateway.perform({
      ...operation, idempotencyKey: `${operation.idempotencyKey}-empty`,
      result: { ...result, evidenceRefs: [] },
    })).rejects.toBeInstanceOf(Error);
    expect(await prisma.affiliateAgentGatewayOperationReceipts.count({
      where: { claimId: grant.envelope.claimId, operationKind: "TERMINAL_EFFECT" },
    })).toBe(0);
    expect(await fixture.harness.gateway.perform({ ...operation, result })).toMatchObject({ kind: "TERMINAL_ACCEPTED" });
    expect(await prisma.affiliateScrapeSources.findUniqueOrThrow({ where: { id: fixture.sourceId } })).toEqual(before);
    expect(await prisma.affiliateSupplyLifecycleTransitions.count({ where: { supplySourceId: fixture.supplySourceId } })).toBe(0);
  });

  it("denies package approval from a source-only claim before any effect", async () => {
    const { fixture, grant, operation } = await claimSourceExclusionForTest("source-forbidden-approval");
    await expect(fixture.harness.gateway.perform({
      ...operation,
      result: {
        ...operation.result, disposition: "APPROVED", reasonCodes: ["EVIDENCE_VERIFIED"],
        payload: { committedPackageHash: "a".repeat(64) },
      },
    })).rejects.toBeInstanceOf(Error);
    expect(await prisma.affiliateAgentGatewayOperationReceipts.count({
      where: { claimId: grant.envelope.claimId, operationKind: "TERMINAL_EFFECT" },
    })).toBe(0);
    expect(await prisma.affiliateSupplyLifecycleTransitions.count({ where: { supplySourceId: fixture.supplySourceId } })).toBe(0);
  });

  it("recovers an ambiguous committed exclusion without another lifecycle write", async () => {
    const { fixture, grant, operation } = await claimSourceExclusionForTest("source-unknown-recovery");
    const effect = fixture.harness.dependencies.terminalEffects!.SOURCE_EXCLUSION_ASSESSED;
    const execute = effect.execute;
    const executeSpy = jest.spyOn(effect, "execute").mockImplementation(async (input) => {
      await execute(input);
      throw new Error("The exclusion response was lost after commit.");
    });
    const recoverSpy = jest.spyOn(effect, "recover").mockRejectedValue(new Error("Recovery transport is unavailable."));
    try {
      await expect(fixture.harness.gateway.perform(operation)).rejects.toBeInstanceOf(Error);
      const pending = await prisma.affiliateAgentGatewayOperationReceipts.findFirstOrThrow({
        where: { claimId: grant.envelope.claimId, operationKind: "TERMINAL_EFFECT" },
      });
      fixture.harness.setNow(new Date(pending.startedAt.getTime() + 120_000).toISOString());
      await createPrismaAffiliateAgentGateway(fixture.harness.dependencies).reconcile({ limit: 10 });
    } finally {
      executeSpy.mockRestore();
      recoverSpy.mockRestore();
    }
    const receipt = await prisma.affiliateAgentGatewayOperationReceipts.findFirstOrThrow({
      where: { claimId: grant.envelope.claimId, operationKind: "TERMINAL_EFFECT" },
    });
    expect(receipt).toMatchObject({ status: "UNKNOWN", safeErrorCode: "PARTIAL_COMMAND_UNRESOLVED" });
    const transitionsBefore = await prisma.affiliateSupplyLifecycleTransitions.findMany({ where: { supplySourceId: fixture.supplySourceId } });
    expect(transitionsBefore).toEqual([expect.objectContaining({ command: "EXCLUDE_SOURCE" })]);
    const recoveryRequest = {
      mode: "PREVIEW" as const, receiptId: receipt.id, jobId: grant.envelope.jobId,
      claimId: grant.envelope.claimId, supplySourceId: fixture.supplySourceId,
      reason: "Complete the recorded exclusion after response loss.",
    };
    const preview = await recoverAffiliateAgentReviewerEffect(fixture.harness.dependencies, recoveryRequest, { operatorId: "affiliate-gateway-operator" });
    expect(preview).toMatchObject({ eligible: true, reasonCodes: expect.arrayContaining(["LIFECYCLE_ALREADY_RECORDED"]) });
    await recoverAffiliateAgentReviewerEffect(fixture.harness.dependencies, {
      ...recoveryRequest, mode: "APPLY", expectedReportHash: preview.reportHash,
    }, { operatorId: "affiliate-gateway-operator" });
    expect(await prisma.affiliateAgentGatewayJobs.findUniqueOrThrow({ where: { id: grant.envelope.jobId } })).toMatchObject({
      status: "COMPLETED", activeClaimId: null, terminalDisposition: "SOURCE_EXCLUSION_ASSESSED",
    });
    expect(await prisma.affiliateSupplyLifecycleTransitions.findMany({ where: { supplySourceId: fixture.supplySourceId } })).toEqual(transitionsBefore);
  }, 60_000);

  it("previews a held legacy repair without writes and keeps its report stable across time", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-preview");
    const before = await recoveryDurableStateFor(fixture);

    const preview: AffiliateAgentReviewerEffectRecoveryReport =
      await recoverAffiliateAgentReviewerEffect(
        fixture.harness.dependencies,
        fixture.request,
        { operatorId: "affiliate-gateway-operator" },
      );

    expect(preview).toEqual({
      schemaVersion: 1,
      mode: "PREVIEW",
      eligible: true,
      reasonCodes: ["ELIGIBLE"],
      reportHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      receiptId: fixture.receiptId,
      jobId: fixture.reviewerJobId,
      claimId: fixture.reviewerClaimId,
      supplySourceId: fixture.supplySourceId,
      currentState: {
        receipt: "UNKNOWN",
        claim: "RECONCILIATION_REQUIRED",
        job: "RECONCILIATION_REQUIRED",
        sourceStage: "MAPPED",
        sourceLifecycleGeneration: 2,
      },
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    });
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);

    fixture.harness.setNow("2026-08-20T18:47:00.000Z");
    const laterPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(laterPreview).toEqual(preview);
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 40_000);
  it("applies the retained approval once, keeps automation held, and replays without a second effect", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-apply");
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    const terminalEffects = fixture.harness.dependencies.terminalEffects;
    if (!terminalEffects) throw new Error("Expected production terminal effects.");
    const originalRecover = terminalEffects.APPROVED.recover;
    let recoverCalls = 0;
    const wrappedEffects: AffiliateAgentTerminalEffectAdapter = {
      ...terminalEffects,
      APPROVED: {
        ...terminalEffects.APPROVED,
        recover: async (input: Parameters<typeof originalRecover>[0]) => {
          recoverCalls += 1;
          return originalRecover(input);
        },
      },
    };
    // The harness intentionally replaces the immutable dependency adapter to inject call counting.
    const mutableDependencies = fixture.harness.dependencies as unknown as {
      terminalEffects: AffiliateAgentTerminalEffectAdapter;
    };
    mutableDependencies.terminalEffects = wrappedEffects;

    const completed = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      {
        ...fixture.request,
        mode: "APPLY",
        expectedReportHash: preview.reportHash,
      },
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(completed).toEqual(expect.objectContaining({
      schemaVersion: 1,
      mode: "APPLY",
      eligible: true,
      reasonCodes: ["ELIGIBLE"],
      reportHash: preview.reportHash,
      receiptId: fixture.receiptId,
      jobId: fixture.reviewerJobId,
      claimId: fixture.reviewerClaimId,
      supplySourceId: fixture.supplySourceId,
      currentState: {
        receipt: "SUCCEEDED",
        claim: "COMPLETED",
        job: "COMPLETED",
        sourceStage: "APPROVED",
        sourceLifecycleGeneration: 3,
      },
      outcome: "COMPLETED",
      replayed: false,
      writeCount: expect.any(Number),
    }));
    expect(recoverCalls).toBe(1);

    const afterCompletion = await recoveryDurableStateFor(fixture);
    expect(afterCompletion.effectReceipt).toMatchObject({
      status: "SUCCEEDED",
      responseHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(afterCompletion.reviewerClaim).toMatchObject({
      status: "COMPLETED",
      tokenInvalidatedAt: expect.any(Date),
      terminalReceiptId: expect.any(String),
    });
    expect(afterCompletion.reviewerJob).toMatchObject({
      status: "COMPLETED",
      activeClaimId: null,
      terminalDisposition: "APPROVED",
      terminalReceiptId: afterCompletion.reviewerClaim.terminalReceiptId,
    });
    expect(afterCompletion.root).toMatchObject({
      lifecycleGeneration: 3,
      derivedStage: "APPROVED",
      isAutomationEnabled: false,
      automationHoldReason: "LEGACY_SPORT_REPAIR",
    });
    expect(afterCompletion.source).toMatchObject({
      lifecycleGeneration: 3,
      activeMappingId: fixture.mappingId,
      autoScrapeEnabled: false,
    });
    expect(afterCompletion.mapping).toMatchObject({
      version: 2,
      isActive: false,
      validatedAt: expect.any(Date),
    });
    expect(afterCompletion.approvals).toEqual([
      expect.objectContaining({
        status: "APPROVED",
        decision: expect.objectContaining({
          decision: "APPROVE",
        }),
        supplySourceId: fixture.supplySourceId,
      }),
    ]);
    expect(afterCompletion.transitions).toEqual([
      expect.objectContaining({
        command: "APPROVE",
        fromStage: "MAPPED",
        toStage: "APPROVED",
        generation: 3,
        idempotencyKey: fixture.receiptId,
        commandRef: fixture.receiptId,
        actorKind: "SUPPLY_REVIEWER",
        actorId: `${RUN_PREFIX}-${fixture.label}-reviewer-worker`,
        executingAgentId: `${RUN_PREFIX}-${fixture.label}-reviewer-invocation`,
      }),
    ]);
    expect(afterCompletion.targets).toEqual([]);

    const stateBeforeReplay = await recoveryDurableStateFor(fixture);
    const replayed = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      {
        ...fixture.request,
        mode: "APPLY",
        expectedReportHash: preview.reportHash,
      },
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(replayed).toEqual(expect.objectContaining({
      outcome: "REPLAYED",
      replayed: true,
      writeCount: 0,
      reportHash: preview.reportHash,
    }));
    expect(recoverCalls).toBe(1);
    expect(await recoveryDurableStateFor(fixture)).toEqual(stateBeforeReplay);
  }, 60_000);


  it("records a failed recovery audit and keeps the quarantined effect unresolved", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-failure");
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    const terminalEffects = fixture.harness.dependencies.terminalEffects;
    if (!terminalEffects) throw new Error("Expected production terminal effects.");
    const originalRecover = terminalEffects.APPROVED.recover;
    const failingEffects: AffiliateAgentTerminalEffectAdapter = {
      ...terminalEffects,
      APPROVED: {
        ...terminalEffects.APPROVED,
        recover: async (input: Parameters<typeof originalRecover>[0]) => {
          void input;
          throw new Error("simulated recovery failure");
        },
      },
    };
    // The harness intentionally replaces the immutable dependency adapter for failure injection.
    const mutableDependencies = fixture.harness.dependencies as unknown as {
      terminalEffects: AffiliateAgentTerminalEffectAdapter;
    };
    mutableDependencies.terminalEffects = failingEffects;

    const failed = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      {
        ...fixture.request,
        mode: "APPLY",
        expectedReportHash: preview.reportHash,
      },
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(failed).toEqual(expect.objectContaining({
      schemaVersion: 1,
      mode: "APPLY",
      eligible: false,
      reasonCodes: ["RECOVERY_FAILED", "RECONCILIATION_REQUIRED"],
      reportHash: preview.reportHash,
      receiptId: fixture.receiptId,
      outcome: "RECONCILIATION_REQUIRED",
      replayed: false,
      writeCount: expect.any(Number),
      currentState: {
        receipt: "UNKNOWN",
        claim: "RECONCILIATION_REQUIRED",
        job: "RECONCILIATION_REQUIRED",
        sourceStage: "MAPPED",
        sourceLifecycleGeneration: 2,
      },
    }));
    expect(failed.writeCount).toBeGreaterThan(0);

    const afterFailure = await recoveryDurableStateFor(fixture);
    expect(afterFailure.effectReceipt).toMatchObject({
      status: "UNKNOWN",
      responseHash: null,
      safeErrorCode: "PARTIAL_COMMAND_UNRESOLVED",
    });
    expect(afterFailure.reviewerClaim).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
      tokenHash: `${RUN_PREFIX}-${fixture.label}-reviewer-token-hash`,
      tokenInvalidatedAt: expect.any(Date),
      terminalReceiptId: null,
    });
    expect(afterFailure.reviewerJob).toMatchObject({
      status: "RECONCILIATION_REQUIRED",
      activeClaimId: fixture.reviewerClaimId,
      terminalReceiptId: null,
    });
    expect(afterFailure.approvals).toEqual([]);
    expect(afterFailure.transitions).toEqual([]);
    expect(afterFailure.targets).toEqual([]);
    expect(afterFailure.events.length).toBeGreaterThanOrEqual(2);
    expect(afterFailure.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorKind: "OPERATOR_RECOVERY",
        actorId: "affiliate-gateway-operator",
        receiptId: fixture.receiptId,
        payload: expect.objectContaining({
          phase: "AUTHORIZED",
          priorStatusEvidence: expect.objectContaining({
            receiptStatus: "UNKNOWN",
            claimStatus: "RECONCILIATION_REQUIRED",
            jobStatus: "RECONCILIATION_REQUIRED",
          }),
        }),
      }),
      expect.objectContaining({
        actorKind: "OPERATOR_RECOVERY",
        actorId: "affiliate-gateway-operator",
        receiptId: fixture.receiptId,
        payload: expect.objectContaining({
          phase: "FAILED",
          failureReasonCodes: ["RECOVERY_FAILED"],
          priorStatusEvidence: expect.objectContaining({
            receiptStatus: "UNKNOWN",
            claimStatus: "RECONCILIATION_REQUIRED",
            jobStatus: "RECONCILIATION_REQUIRED",
          }),
        }),
      }),
    ]));
  }, 60_000);
  it("resumes a post-effect crash from the recorded lifecycle transition without duplicating it", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-resume");
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    const terminalEffects = fixture.harness.dependencies.terminalEffects;
    if (!terminalEffects) throw new Error("Expected production terminal effects.");
    const originalRecover = terminalEffects.APPROVED.recover;
    let recoverCalls = 0;
    const crashAfterEffect: AffiliateAgentTerminalEffectAdapter = {
      ...terminalEffects,
      APPROVED: {
        ...terminalEffects.APPROVED,
        recover: async (input: Parameters<typeof originalRecover>[0]) => {
          recoverCalls += 1;
          const output = await originalRecover(input);
          if (recoverCalls === 1) throw new Error("simulated post-effect crash");
          return output;
        },
      },
    };
    // The harness intentionally replaces the immutable dependency adapter to model a crash after the effect.
    const mutableDependencies = fixture.harness.dependencies as unknown as {
      terminalEffects: AffiliateAgentTerminalEffectAdapter;
    };
    mutableDependencies.terminalEffects = crashAfterEffect;

    const firstAttempt = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      {
        ...fixture.request,
        mode: "APPLY",
        expectedReportHash: preview.reportHash,
      },
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(firstAttempt).toEqual(expect.objectContaining({
      outcome: "RECONCILIATION_REQUIRED",
      eligible: false,
      writeCount: expect.any(Number),
      currentState: {
        receipt: "UNKNOWN",
        claim: "RECONCILIATION_REQUIRED",
        job: "RECONCILIATION_REQUIRED",
        sourceStage: "APPROVED",
        sourceLifecycleGeneration: 3,
      },
    }));
    expect(recoverCalls).toBe(1);
    const afterCrash = await recoveryDurableStateFor(fixture);
    expect(afterCrash.transitions).toHaveLength(1);

    fixture.harness.setNow("2026-08-20T18:47:00.000Z");
    const resumePreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(resumePreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: true,
      reasonCodes: ["ELIGIBLE", "LIFECYCLE_ALREADY_RECORDED"],
      currentState: {
        receipt: "UNKNOWN",
        claim: "RECONCILIATION_REQUIRED",
        job: "RECONCILIATION_REQUIRED",
        sourceStage: "APPROVED",
        sourceLifecycleGeneration: 3,
      },
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));

    const resumed = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      {
        ...fixture.request,
        mode: "APPLY",
        expectedReportHash: resumePreview.reportHash,
      },
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(resumed).toEqual(expect.objectContaining({
      outcome: "COMPLETED",
      eligible: true,
      reportHash: resumePreview.reportHash,
      replayed: false,
      writeCount: expect.any(Number),
      currentState: {
        receipt: "SUCCEEDED",
        claim: "COMPLETED",
        job: "COMPLETED",
        sourceStage: "APPROVED",
        sourceLifecycleGeneration: 3,
      },
    }));
    expect(recoverCalls).toBe(2);
    const afterResume = await recoveryDurableStateFor(fixture);
    expect(afterResume.transitions).toHaveLength(1);
    expect(afterResume.transitions[0]).toEqual(expect.objectContaining({
      command: "APPROVE",
      idempotencyKey: fixture.receiptId,
      commandRef: fixture.receiptId,
    }));

    const replayed = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      {
        ...fixture.request,
        mode: "APPLY",
        expectedReportHash: resumePreview.reportHash,
      },
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(replayed).toEqual(expect.objectContaining({
      outcome: "REPLAYED",
      replayed: true,
      writeCount: 0,
    }));
    expect(recoverCalls).toBe(2);
    expect(await recoveryDurableStateFor(fixture)).toEqual(afterResume);
  }, 60_000);

  it("serializes concurrent APPLY calls and permits only one recovered effect", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-concurrent");
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    const terminalEffects = fixture.harness.dependencies.terminalEffects;
    if (!terminalEffects) throw new Error("Expected production terminal effects.");
    const originalRecover = terminalEffects.APPROVED.recover;
    let recoverCalls = 0;
    let releaseFirstEffect = (): void => undefined;
    let startFirstEffect = (): void => undefined;
    const firstEffectStarted = new Promise<void>((resolve) => {
      startFirstEffect = resolve;
    });
    const wrappedEffects: AffiliateAgentTerminalEffectAdapter = {
      ...terminalEffects,
      APPROVED: {
        ...terminalEffects.APPROVED,
        recover: async (input: Parameters<typeof originalRecover>[0]) => {
          const callNumber = ++recoverCalls;
          if (callNumber === 1) {
            startFirstEffect();
            await new Promise<void>((release) => {
              releaseFirstEffect = release;
            });
          }
          return originalRecover(input);
        },
      },
    };
    // The harness intentionally replaces the immutable dependency adapter for the concurrency barrier.
    const mutableDependencies = fixture.harness.dependencies as unknown as {
      terminalEffects: AffiliateAgentTerminalEffectAdapter;
    };
    mutableDependencies.terminalEffects = wrappedEffects;

    const applyRequest = {
      ...fixture.request,
      mode: "APPLY" as const,
      expectedReportHash: preview.reportHash,
    };
    const firstApply = recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      applyRequest,
      { operatorId: "affiliate-gateway-operator" },
    );
    await firstEffectStarted;
    const secondApply = recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      applyRequest,
      { operatorId: "affiliate-gateway-operator" },
    );
    const secondOutcome = await secondApply.catch((error: unknown) => error);
    expect(secondOutcome).toMatchObject({
      code: "REVIEWER_EFFECT_RECOVERY_IN_PROGRESS",
    });
    releaseFirstEffect();
    await expect(firstApply).resolves.toEqual(expect.objectContaining({
      outcome: "COMPLETED",
      replayed: false,
      writeCount: expect.any(Number),
    }));
    expect(recoverCalls).toBe(1);

    await expect(
      recoverAffiliateAgentReviewerEffect(
        fixture.harness.dependencies,
        applyRequest,
        { operatorId: "affiliate-gateway-operator" },
      ),
    ).resolves.toEqual(expect.objectContaining({
      outcome: "REPLAYED",
      replayed: true,
      writeCount: 0,
    }));
    expect(recoverCalls).toBe(1);
    expect((await recoveryDurableStateFor(fixture)).transitions).toHaveLength(1);
  }, 60_000);


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
  it("rejects a stale PREVIEW hash after lifecycle evidence changes without writing", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-stale");
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    await prisma.affiliateSupplySources.update({
      where: { id: fixture.supplySourceId },
      data: { lifecycleGeneration: 3 },
    });
    await prisma.affiliateScrapeSources.update({
      where: { id: fixture.sourceId },
      data: { lifecycleGeneration: 3 },
    });
    const beforeApply = await recoveryDurableStateFor(fixture);
    await expect(
      recoverAffiliateAgentReviewerEffect(
        fixture.harness.dependencies,
        {
          ...fixture.request,
          mode: "APPLY",
          expectedReportHash: preview.reportHash,
        },
        { operatorId: "affiliate-gateway-operator" },
      ),
    ).rejects.toMatchObject({
      code: expect.stringMatching(
        /^REVIEWER_EFFECT_RECOVERY_(STALE|NOT_ELIGIBLE)$/,
      ),
    });
    expect(await recoveryDurableStateFor(fixture)).toEqual(beforeApply);
  }, 60_000);

  it("rejects a foreign recovery scope without touching the retained quarantine", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-foreign-scope");
    const before = await recoveryDurableStateFor(fixture);
    const foreignPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      {
        ...fixture.request,
        supplySourceId: `${fixture.supplySourceId}-foreign`,
      },
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(foreignPreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["LEGACY_APPROVAL_SCOPE_INVALID"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);
  it("rejects a tampered retained approval result before any recovery write", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-tampered-result");
    const receipt = await prisma.affiliateAgentGatewayOperationReceipts.findUniqueOrThrow({
      where: { id: fixture.receiptId },
    });
    const pendingState = recordValueForTest(receipt.responseJson);
    const retainedResult = recordValueForTest(pendingState.result);
    const retainedPayload = recordValueForTest(retainedResult.payload);
    const tamperedResponseJson = {
      ...pendingState,
      result: {
        ...retainedResult,
        payload: {
          ...retainedPayload,
          committedPackageHash: "f".repeat(64),
        },
      },
    } as unknown as Prisma.InputJsonValue;
    await prisma.affiliateAgentGatewayOperationReceipts.update({
      where: { id: fixture.receiptId },
      data: { responseJson: tamperedResponseJson },
    });
    const before = await recoveryDurableStateFor(fixture);
    const tamperedPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(tamperedPreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["EFFECT_REQUEST_HASH_INVALID"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);
  it("rejects an active contract bundle drift before recovery writes", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-contract-drift");
    const driftManifest = recoverySupplyManifestFor(
      `${RUN_PREFIX}-${fixture.label}-different-cohort`,
    );
    fixture.harness.setActiveBundle(recoveryContractBundleFor(driftManifest));
    const before = await recoveryDurableStateFor(fixture);
    const driftPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(driftPreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SUPPLY_CONTRACT_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("rejects a reviewer claim tied to a stale sports catalog", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-catalog-drift");
    const claim = await prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
      where: { id: fixture.reviewerClaimId },
    });
    const envelope = recordValueForTest(claim.claimEnvelopeJson);
    const subject = recordValueForTest(envelope.subject);
    const repairContext = recordValueForTest(subject.repairContext);
    const driftCatalog = buildAffiliateSportsCatalogSnapshot(
      [
        ...fixture.catalog.sports,
        {
          id: `${RUN_PREFIX}-${fixture.label}-catalog-drift`,
          name: `${fixture.label} Drift Sport`,
        },
      ],
      "2026-08-20T18:47:00.000Z",
    );
    const driftEnvelope = {
      ...envelope,
      subject: {
        ...subject,
        repairContext: {
          ...repairContext,
          sportsCatalog: driftCatalog,
        },
      },
    } as unknown as Prisma.InputJsonValue;
    await prisma.affiliateAgentGatewayClaims.update({
      where: { id: fixture.reviewerClaimId },
      data: {
        claimEnvelopeJson: driftEnvelope,
        claimEnvelopeHash: hashAffiliateAgentValue(driftEnvelope),
      },
    });
    const before = await recoveryDurableStateFor(fixture);
    const catalogPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(catalogPreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SPORTS_CATALOG_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("rejects any non-legacy automation hold", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-other-hold");
    const [root, source] = await Promise.all([
      prisma.affiliateSupplySources.findUniqueOrThrow({
        where: { id: fixture.supplySourceId },
      }),
      prisma.affiliateScrapeSources.findUniqueOrThrow({
        where: { id: fixture.sourceId },
      }),
    ]);
    const rootMetadata = recordValueForTest(root.metadata);
    const sourceMetadata = recordValueForTest(source.metadata);
    const policyHold = {
      hold: true,
      reason: "POLICY_HOLD",
      evidenceRefs: ["policy-review"],
    };
    await prisma.affiliateSupplySources.update({
      where: { id: fixture.supplySourceId },
      data: {
        metadata: {
          ...rootMetadata,
          automationReviewRequired: policyHold,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.affiliateScrapeSources.update({
      where: { id: fixture.sourceId },
      data: {
        metadata: {
          ...sourceMetadata,
          automationReviewRequired: policyHold,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    const before = await recoveryDurableStateFor(fixture);
    const holdPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(holdPreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SOURCE_EVIDENCE_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);
  it("rejects a root automation-enabled source even when legacy hold remains", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-root-automation-enabled");
    await prisma.affiliateSupplySources.update({
      where: { id: fixture.supplySourceId },
      data: { isAutomationEnabled: true },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SOURCE_EVIDENCE_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);
  it("rejects a live source auto-scrape flag even when legacy hold remains", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-live-auto-scrape-enabled");
    await prisma.affiliateScrapeSources.update({
      where: { id: fixture.sourceId },
      data: { autoScrapeEnabled: true },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SOURCE_EVIDENCE_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("rejects an unrelated active claim pointer on the same source", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-competing-pointer");
    await prisma.affiliateAgentGatewayJobs.update({
      where: { id: fixture.producerJobId },
      data: { activeClaimId: `${RUN_PREFIX}-${fixture.label}-competing-claim` },
    });
    const before = await recoveryDurableStateFor(fixture);
    const pointerPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(pointerPreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["OTHER_ACTIVE_CLAIM"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);
  it("reports a missing legacy automation hold without writing", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-missing-hold");
    const [root, source] = await Promise.all([
      prisma.affiliateSupplySources.findUniqueOrThrow({
        where: { id: fixture.supplySourceId },
      }),
      prisma.affiliateScrapeSources.findUniqueOrThrow({
        where: { id: fixture.sourceId },
      }),
    ]);
    const rootMetadata = recordValueForTest(root.metadata);
    const sourceMetadata = recordValueForTest(source.metadata);
    const rootWithoutHold = Object.fromEntries(
      Object.entries(rootMetadata).filter(([key]) => key !== "automationReviewRequired"),
    );
    const sourceWithoutHold = Object.fromEntries(
      Object.entries(sourceMetadata).filter(([key]) => key !== "automationReviewRequired"),
    );
    await prisma.affiliateSupplySources.update({
      where: { id: fixture.supplySourceId },
      data: {
        automationHoldReason: null,
        metadata: rootWithoutHold as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.affiliateScrapeSources.update({
      where: { id: fixture.sourceId },
      data: { metadata: sourceWithoutHold as unknown as Prisma.InputJsonValue },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SOURCE_EVIDENCE_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);
  it("rejects a scalar root hold change after preview without writing", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-root-scalar-drift");
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    await prisma.affiliateSupplySources.update({
      where: { id: fixture.supplySourceId },
      data: { automationHoldReason: "POLICY_HOLD" },
    });
    const before = await recoveryDurableStateFor(fixture);
    const changedPreview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(changedPreview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SOURCE_EVIDENCE_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    await expect(
      recoverAffiliateAgentReviewerEffect(
        fixture.harness.dependencies,
        {
          ...fixture.request,
          mode: "APPLY",
          expectedReportHash: preview.reportHash,
        },
        { operatorId: "affiliate-gateway-operator" },
      ),
    ).rejects.toMatchObject({
      code: expect.stringMatching(
        /^REVIEWER_EFFECT_RECOVERY_(STALE|NOT_ELIGIBLE)$/,
      ),
    });
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("reports a missing persisted live source without writing", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-missing-live-source");
    await prisma.affiliateSupplySources.update({
      where: { id: fixture.supplySourceId },
      data: { liveSourceId: `${fixture.sourceId}-missing` },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["PACKAGE_OR_SOURCE_DRIFT"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("reports a persisted live-source backlink mismatch without writing", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-live-source-backlink");
    await prisma.affiliateScrapeSources.update({
      where: { id: fixture.sourceId },
      data: { supplySourceId: `${fixture.supplySourceId}-wrong` },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["PACKAGE_OR_SOURCE_DRIFT"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);
  it("reports a root legacy hold plus source policy hold as ineligible", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-root-legacy-source-policy");
    const source = await prisma.affiliateScrapeSources.findUniqueOrThrow({
      where: { id: fixture.sourceId },
    });
    const sourceMetadata = recordValueForTest(source.metadata);
    const beforeSource = {
      ...sourceMetadata,
      automationReviewRequired: {
        hold: true,
        reason: "POLICY_HOLD",
        evidenceRefs: ["policy-review"],
      },
    } as unknown as Prisma.InputJsonValue;
    await prisma.affiliateScrapeSources.update({
      where: { id: fixture.sourceId },
      data: { metadata: beforeSource },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SOURCE_EVIDENCE_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("reports a root policy hold plus source legacy hold as ineligible", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-root-policy-source-legacy");
    const root = await prisma.affiliateSupplySources.findUniqueOrThrow({
      where: { id: fixture.supplySourceId },
    });
    const rootMetadata = recordValueForTest(root.metadata);
    const beforeRoot = {
      ...rootMetadata,
      automationReviewRequired: {
        hold: true,
        reason: "POLICY_HOLD",
        evidenceRefs: ["policy-review"],
      },
    } as unknown as Prisma.InputJsonValue;
    await prisma.affiliateSupplySources.update({
      where: { id: fixture.supplySourceId },
      data: { metadata: beforeRoot },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["SOURCE_EVIDENCE_STALE"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("reports a reviewer row and envelope identity mismatch without writing", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-reviewer-row-mismatch");
    await prisma.affiliateAgentGatewayClaims.update({
      where: { id: fixture.reviewerClaimId },
      data: {
        workerId: `${RUN_PREFIX}-${fixture.label}-row-mismatch-worker`,
      },
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["REVIEWER_RESULT_IDENTITY_INVALID"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);

  it("reports a hash-consistent reviewer identity reused from the producer without writing", async () => {
    const fixture = await seedReviewerEffectRecoveryFixture("recovery-reviewer-identity-reuse");
    const [producerClaim, reviewerClaim, receipt] = await Promise.all([
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: fixture.producerClaimId },
      }),
      prisma.affiliateAgentGatewayClaims.findUniqueOrThrow({
        where: { id: fixture.reviewerClaimId },
      }),
      prisma.affiliateAgentGatewayOperationReceipts.findUniqueOrThrow({
        where: { id: fixture.receiptId },
      }),
    ]);
    const envelope = recordValueForTest(reviewerClaim.claimEnvelopeJson);
    const retainedState = recordValueForTest(receipt.responseJson);
    const retainedResult = recordValueForTest(retainedState.result);
    const reboundResult = {
      ...retainedResult,
      workerId: producerClaim.workerId,
    };
    const reboundTerminalRequestHash = hashAffiliateAgentValue({
      commandName: "SUPPLY_REVIEWER_TERMINAL_EFFECT",
      claimId: fixture.reviewerClaimId,
      claimGeneration: reviewerClaim.claimGeneration,
      result: reboundResult,
    });
    const reboundState = {
      ...retainedState,
      result: reboundResult,
      terminalRequestHash: reboundTerminalRequestHash,
    };
    const reboundRequestHash = hashAffiliateAgentValue({
      commandName: "SUPPLY_REVIEWER_TERMINAL_EFFECT",
      claimId: fixture.reviewerClaimId,
      claimGeneration: reviewerClaim.claimGeneration,
      result: reboundResult,
    });
    expect(affiliateAgentClaimEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(affiliateAgentTerminalResultEnvelopeSchema.safeParse(reboundResult).success).toBe(true);
    expect(hashAffiliateAgentValue(envelope)).toBe(reviewerClaim.claimEnvelopeHash);
    expect(reboundState.terminalRequestHash).toBe(reboundRequestHash);
    await prisma.$transaction(async (transaction) => {
      await transaction.affiliateAgentGatewayClaims.update({
        where: { id: fixture.reviewerClaimId },
        data: {
          workerId: producerClaim.workerId,
        },
      });
      await transaction.affiliateAgentGatewayOperationReceipts.update({
        where: { id: fixture.receiptId },
        data: {
          requestHash: reboundRequestHash,
          responseJson: reboundState as unknown as Prisma.InputJsonValue,
        },
      });
    });
    const before = await recoveryDurableStateFor(fixture);
    const preview = await recoverAffiliateAgentReviewerEffect(
      fixture.harness.dependencies,
      fixture.request,
      { operatorId: "affiliate-gateway-operator" },
    );
    expect(preview).toEqual(expect.objectContaining({
      mode: "PREVIEW",
      eligible: false,
      reasonCodes: expect.arrayContaining(["PRODUCER_REVIEWER_IDENTITY_REUSED"]),
      outcome: "PREVIEW",
      replayed: false,
      writeCount: 0,
    }));
    expect(await recoveryDurableStateFor(fixture)).toEqual(before);
  }, 60_000);


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
    let artifactReadCount = 0;
    let markFirstArtifactReadStarted = (): void => undefined;
    let releaseFirstArtifactRead = (): void => undefined;
    const firstArtifactReadStarted = new Promise<void>((resolve) => {
      markFirstArtifactReadStarted = resolve;
    });
    const firstArtifactReadReleased = new Promise<void>((resolve) => {
      releaseFirstArtifactRead = resolve;
    });
    const harness = createGatewayHarness("artifact-read-race", {
      readImmutable: async () => {
        artifactReadCount += 1;
        if (artifactReadCount === 1) {
          markFirstArtifactReadStarted();
          await firstArtifactReadReleased;
        }
        return {
          bytes: new Uint8Array(INPUT_BYTES),
          mimeType: "text/markdown",
          byteSize: INPUT_BYTES.byteLength,
          sourceUrl: "https://evidence.example.test/database",
          finalUrl: "https://evidence.example.test/database",
        };
      },
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
    const firstRead = harness.gateway.perform(operation);
    await firstArtifactReadStarted;
    const pendingDuplicate = harness.gateway.perform(operation);
    await expect(pendingDuplicate).rejects.toMatchObject({
      code: "OPERATION_IN_PROGRESS",
    });
    releaseFirstArtifactRead();
    const firstResult = await firstRead;
    const replay = await harness.gateway.perform(operation);
    expect(replay).toEqual(firstResult);
    expect(artifactReadCount).toBe(2);
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
    await seedCoveragePlanningWave("terminal-atomic", jobId);
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
    expect(receipts.filter((receipt) => receipt.operationKind === "SUBMIT_RESULT")).toEqual([
      expect.objectContaining({ id: accepted.receiptId, status: "SUCCEEDED" }),
    ]);
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
          finalUrl: "https://evidence.example.test/recovered",
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
        finalUrl: "https://evidence.example.test/provider-lane-failure",
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
        finalUrl: "https://evidence.example.test/impossible",
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
      await prisma.affiliateAgentGatewayArtifacts.updateMany({
        where: {
          claimId: envelope.claimId,
          claimGeneration: envelope.claimGeneration,
          evidenceKind: {
            in: ["DETERMINISTIC_VALIDATION", "DURABLE_EVIDENCE"],
          },
        },
        data: { creatingClaimId: envelope.claimId },
      });
      await prisma.affiliateAgentGatewayArtifacts.create({
        data: {
          id: `${RUN_PREFIX}-four-role-mapping-committed-package`,
          claimId: envelope.claimId,
          claimGeneration: envelope.claimGeneration,
          evidenceRef: "committed-package",
          evidenceKind: "COMMITTED_PACKAGE",
          sourceArtifactId: `${RUN_PREFIX}-four-role-mapping-committed-package`,
          fileId: `${RUN_PREFIX}-four-role-mapping-committed-package`,
          contentHash: mappingPackageHash,
          mimeType: "text/markdown",
          byteSize: INPUT_BYTES.byteLength,
          accessMode: "READ_ONLY",
          creatingClaimId: envelope.claimId,
          retentionClass: "INDEFINITE",
          isPinned: true,
        },
      });

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
            disposition: "NO_ACTION" as const,
            reasonCodes: ["NO_QUALIFIED_ACTION"] as const,
            summary: "No qualified campaign remains for this coverage cell.",
            payload: { basis: "NO_QUALIFIED_ACTION" },
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
    await seedCoveragePlanningWave("four-role-coverage", coverageJobId);
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
    const reviewerJob = await prisma.affiliateAgentGatewayJobs.findFirstOrThrow({
      where: {
        parentClaimId: mappingEnvelope.claimId,
        role: "SUPPLY_REVIEWER",
        status: "QUEUED",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    await runRole("SUPPLY_REVIEWER", reviewerJob.id);
    const humanPrerequisite = await completedReviewerPrerequisiteForJob(
      "four-role-reviewer",
      reviewerJob.id,
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
