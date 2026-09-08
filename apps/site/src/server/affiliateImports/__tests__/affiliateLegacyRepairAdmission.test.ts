/** @jest-environment node */
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  AFFILIATE_AGENT_ROLES,
  AFFILIATE_AGENT_ROLE_CONTRACTS,
  AFFILIATE_AGENT_PROMPT_TEMPLATES,
  affiliateAgentContractBundleSchema,
  hashAffiliateAgentValue,
} from '../agentGatewayContracts';
import { normalizeAffiliateSupplyIdentity } from '../affiliateSupplyLifecycle';
import { affiliateSportsCatalogSha256 } from '../affiliateSportsCatalog';
import { buildAffiliateSupplyContractManifest } from '../affiliateSupplyLifecycle';
import {
  applyAffiliateLegacyRepairAdmission,
  applyAffiliateLegacyRepairRetry,
  calculateAffiliateLegacyRepairAdmissionReportHash,
  calculateAffiliateLegacyRepairRetryReportHash,
  previewAffiliateLegacyRepairAdmission,
  previewAffiliateLegacyRepairRetry,
} from '../affiliateLegacyRepairAdmission';

const manifest = buildAffiliateSupplyContractManifest({
  version: 1,
  rolloutCohort: 'DEFAULT',
  status: 'ACTIVE',
  supplyContract: {
    schemaVersion: 1,
    version: 1,
    rolloutCohort: 'DEFAULT',
    freshnessWindows: [{ sourceProfile: 'CLUB', maximumAgeHours: 168 }],
    targets: [{ marketKey: 'test-market', sportId: 'Grass Soccer', sourceProfile: 'CLUB', minimumFreshPublishedSupply: 1 }],
    requiredMappingEvidenceKinds: ['PAGE_HTML'],
    requiredLifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
    searchSaturationMinimumCycles: 2,
  },
});
const roleContracts = AFFILIATE_AGENT_ROLES.map((role) => AFFILIATE_AGENT_ROLE_CONTRACTS[role]);
const promptTemplates = AFFILIATE_AGENT_ROLES.map((role) => AFFILIATE_AGENT_PROMPT_TEMPLATES[role]);
const deployment = {
  schemaVersion: 1,
  version: 1,
  gatewayVersion: 1,
  activeSupplyContract: { version: manifest.supplyContract.version, hash: manifest.supplyContract.hash },
  roleContracts: roleContracts.map(({ role, version, hash }) => ({ role, version, hash })),
  promptTemplates: promptTemplates.map(({ role, version, hash }) => ({ role, version, hash })),
  expectedTopology: {
    claimsPerInvocation: 1,
    hasFreshWorkspacePerClaim: true,
    processCommand: ['affiliate-omp-agent'],
    hasNestedGoal: false,
    hasClaimLoop: false,
    hasContextReuse: false,
    executionClass: 'PRODUCTION_OMP',
    databaseRoles: { gateway: 'bracketiq_affiliate_gateway', lifecycleAuthority: 'bracketiq_affiliate_lifecycle', agent: 'bracketiq_affiliate_agent' },
  },
};
const bundle = affiliateAgentContractBundleSchema.parse({
  schemaVersion: 1,
  supplyContract: manifest.supplyContract,
  roleContracts,
  promptTemplates,
  deploymentContract: { ...deployment, hash: hashAffiliateAgentValue(deployment) },
});

const fixture = () => {
  const job = {
    id: 'job-date', intakeId: 'intake-date', supplySourceId: null,
    sourceId: null, mappingId: null, legacyIdentityMigrationEligible: false,
    status: 'QUEUED', claimedAt: null, leaseExpiresAt: null, workerId: null,
    resultSummary: {
      sportReconciliationHistory: [{
        strategyRevision: 'sport-evidence-v1',
        archivedPriorResultSummary: { result: { jobId: 'job-date', intakeId: 'intake-date' } },
      }],
    },
    errorMessage: null,
  };
  const intake = {
    id: 'intake-date', sourceKey: 'date-source', baseUrl: 'https://example.test',
    status: 'READY_FOR_MAPPING', affiliateSourceId: null, supplySourceId: null,
    lastRunId: 'run-date', targetKindHints: ['CLUB'],
  };
  const source = {
    id: 'source-date', sourceKey: 'date-source', organizationId: 'org-date',
    baseUrl: 'https://example.test', listUrl: 'https://example.test/events',
    targetKind: 'CLUB', status: 'ACTIVE', activeMappingId: 'mapping-date',
    supplySourceId: null, autoScrapeEnabled: false,
    metadata: { sourceEvidence: { intakeId: intake.id, runId: 'run-date' } },
  };
  const organization = { id: 'org-date', status: 'UNLISTED', publicPageEnabled: false, publicWidgetsEnabled: false };
  const mapping = {
    id: 'mapping-date', sourceId: source.id, supplySourceId: null,
    version: 1, isActive: true, validatedAt: null,
  };
  const run = {
    id: 'run-date', intakeId: intake.id, supplySourceId: null, status: 'SUCCEEDED',
    createdAt: new Date('2026-08-20T00:00:00Z'), finishedAt: new Date('2026-08-20T00:02:00Z'),
  };
  const page = {
    id: 'page-date', intakeId: intake.id, supplySourceId: null,
    url: source.listUrl, canonicalUrl: source.listUrl, status: 'ACTIVE',
  };
  const artifacts = ['PAGE_HTML', 'PAGE_MARKDOWN'].map((kind) => ({
    id: `artifact-${kind}`, intakeId: intake.id, supplySourceId: null, pageId: page.id, runId: run.id,
    kind, sourceUrl: source.listUrl, finalUrl: source.listUrl,
    contentHash: createHash('sha256').update(kind).digest('hex'),
    fileId: `file-${kind}`, mimeType: kind === 'PAGE_HTML' ? 'text/html' : 'text/markdown',
    sizeBytes: 100, createdAt: new Date('2026-08-20T00:01:00Z'), isPinned: false, retainUntil: null,
  }));
  const files = artifacts.map((artifact) => ({
    id: artifact.fileId, path: `affiliate/date/${artifact.id}`, bucket: 'evidence',
    mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes,
  }));
  const candidate = {
    id: 'private-club-candidate', sourceId: source.id, mappingId: mapping.id, supplySourceId: null,
    listingKind: 'CLUB', status: 'PUBLISHED', publishedOrganizationId: organization.id,
    publishedEventId: null, publishedTeamId: null, publishedFacilityId: null,
  };
  const claims: { id: string; jobId: string; status: string }[] = [];
  const database = {
    affiliateSourceMappingJobs: { findMany: jest.fn(async () => [job]) },
    affiliateSourceIntakes: { findMany: jest.fn(async () => [intake]) },
    affiliateSourceIntakeRuns: { findMany: jest.fn(async () => [run]) },
    affiliateSourceIntakePages: { findMany: jest.fn(async () => [page]) },
    affiliateSourceIntakeArtifacts: { findMany: jest.fn(async () => artifacts) },
    affiliateScrapeSources: { findMany: jest.fn(async () => [source]) },
    affiliateScrapeMappings: { findMany: jest.fn(async () => [mapping]) },
    affiliateImportCandidates: { findMany: jest.fn(async () => [candidate]) },
    organizations: { findMany: jest.fn(async () => [organization]) },
    affiliateSupplySources: { findMany: jest.fn(async () => []) },
    affiliateSupplyTargets: { findMany: jest.fn(async () => []) },
    affiliateApprovalJobs: { findMany: jest.fn(async () => []) },
    affiliateAgentGatewayJobs: { findMany: jest.fn(async () => []) },
    affiliateAgentGatewayClaims: { findMany: jest.fn(async () => claims) },
    affiliateSupplyContractManifests: {
      findFirst: jest.fn(async () => ({
        id: 'active-manifest', version: manifest.version, rolloutCohort: manifest.rolloutCohort,
        status: manifest.status, contractHash: manifest.hash, contractJson: manifest.supplyContract,
      })),
    },
    sports: { findMany: jest.fn(async () => [{ id: 'grass-soccer', name: 'Grass Soccer' }]) },
    file: { findMany: jest.fn(async () => files) },
  };
  // Only read delegates are supplied. Any unexpected mutation fails this fixture.
  const prisma = {
    ...database,
    $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => (
      callback(database as unknown as Prisma.TransactionClient)
    ),
  } as unknown as PrismaClient;
  return { input: { prisma, bundle, limit: 1 }, job, source, organization, candidate, run, claims, database };
};

const retryFixture = () => {
  const sports = [{ id: 'grass-soccer', name: 'Grass Soccer' }];
  const catalog = {
    schemaVersion: 1 as const,
    capturedAt: '2026-08-20T00:00:00.000Z',
    sha256: affiliateSportsCatalogSha256(sports),
    sports,
  };
  const mappingRole = AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER;
  const mappingPrompt = AFFILIATE_AGENT_PROMPT_TEMPLATES.MAPPING_PRODUCER;
  const mappingJobs: Record<string, unknown>[] = [];
  const intakes: Record<string, unknown>[] = [];
  const runs: Record<string, unknown>[] = [];
  const pages: Record<string, unknown>[] = [];
  const artifacts: Record<string, unknown>[] = [];
  const priorDeploymentContractHash = 'c'.repeat(64);
  const files: Record<string, unknown>[] = [];
  const sources: Record<string, unknown>[] = [];
  const mappings: Record<string, unknown>[] = [];
  const roots: Record<string, unknown>[] = [];
  const organizations: Record<string, unknown>[] = [];
  const candidates: Record<string, unknown>[] = [];
  const gatewayJobs: Record<string, unknown>[] = [];
  const gatewayClaims: Record<string, unknown>[] = [];
  const gatewayReceipts: Record<string, unknown>[] = [];
  const rootFor = (sourceUrl: string, rootId: string, intakeId: string) => {
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: sourceUrl,
      resolvedCanonicalUrl: sourceUrl,
      operatorDomain: new URL(sourceUrl).hostname,
    });
    return {
      id: rootId,
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
      targetKind: 'CLUB',
      rolloutCohort: 'DEFAULT',
      intakeId,
      liveSourceId: null,
      lifecycleGeneration: 1,
      activeSupplyContractVersion: manifest.supplyContract.version,
      activeSupplyContractHash: manifest.supplyContract.hash,
      derivedStage: 'PRE_MAPPED',
      isAutomationEnabled: false,
      isExcluded: false,
      automationHoldReason: 'LEGACY_SPORT_REPAIR',
      metadata: {
        automationReviewRequired: { hold: true, reason: 'LEGACY_SPORT_REPAIR' },
      },
    };
  };
  const makeManifest = (jobId: string, artifactRows: readonly Record<string, unknown>[]) => {
    const entries = artifactRows.map((artifact) => ({
      evidenceRef: `legacy-sport-repair:${jobId}:${String(artifact.kind).toLowerCase()}`,
      kind: artifact.kind,
      artifactId: `intake-artifact:${artifact.id}`,
      sha256: artifact.contentHash,
      mimeType: artifact.mimeType,
      byteSize: artifact.sizeBytes,
      retention: 'INDEFINITE' as const,
    })).sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef));
    const preimage = { schemaVersion: 1 as const, entries };
    return { ...preimage, hash: hashAffiliateAgentValue(preimage) };
  };
  for (const index of [1, 2]) {
    const suffix = index === 1 ? 'softball' : 'boomtown';
    const mappingJobId = `mapping-retry-${suffix}`;
    const intakeId = `intake-retry-${suffix}`;
    const sourceId = `source-retry-${suffix}`;
    const mappingId = `mapping-retry-${suffix}`;
    const rootId = `root-retry-${suffix}`;
    const parentGatewayJobId = `gateway-parent-${suffix}`;
    const parentClaimId = `claim-parent-${suffix}`;
    const receiptId = `receipt-parent-${suffix}`;
    const sourceUrl = `https://${suffix}.example.test`;
    const runId = `run-retry-${suffix}`;
    const pageId = `page-retry-${suffix}`;
    const artifactRows = (['PAGE_HTML', 'PAGE_MARKDOWN'] as const).map((kind) => ({
      id: `artifact-retry-${suffix}-${kind.toLowerCase()}`,
      intakeId,
      supplySourceId: rootId,
      pageId,
      runId,
      kind,
      sourceUrl,
      finalUrl: sourceUrl,
      contentHash: createHash('sha256').update(`${suffix}:${kind}`).digest('hex'),
      fileId: `file-retry-${suffix}-${kind.toLowerCase()}`,
      mimeType: kind === 'PAGE_HTML' ? 'text/html' : 'text/markdown',
      sizeBytes: 100,
      createdAt: new Date('2026-08-20T00:01:00Z'),
      isPinned: true,
      retainUntil: null,
    }));
    const evidenceManifest = makeManifest(mappingJobId, artifactRows);
    const repairContext = {
      kind: 'LEGACY_SPORT_REPAIR' as const,
      intakeId,
      evidenceRunId: runId,
      sportsCatalog: catalog,
    };
    const subject = {
      type: 'MAPPING_PRODUCER' as const,
      supplySourceId: rootId,
      mappingJobId,
      pass: 1,
      repairContext,
    };
    const claimEnvelope = {
      schemaVersion: 1 as const,
      role: 'MAPPING_PRODUCER' as const,
      queue: 'AFFILIATE_MAPPING' as const,
      lane: 'MAPPING_PRODUCTION' as const,
      jobId: parentGatewayJobId,
      claimId: parentClaimId,
      supplySourceId: rootId,
      claimGeneration: 1,
      lifecycleGeneration: 1,
      deploymentContractVersion: bundle.deploymentContract.version,
      deploymentContractHash: priorDeploymentContractHash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      roleContractVersion: mappingRole.version,
      roleContractHash: mappingRole.hash,
      promptTemplateVersion: mappingPrompt.version,
      promptTemplateHash: mappingPrompt.hash,
      executionClass: 'PRODUCTION_OMP' as const,
      workerId: `worker-${suffix}`,
      invocationId: `invocation-${suffix}`,
      workspaceId: `workspace-${suffix}`,
      claimedAt: '2026-08-20T00:03:00.000Z',
      expiresAt: '2026-08-20T00:30:00.000Z',
      evidenceManifest,
      permittedCommands: mappingRole.permittedCommands,
      subject,
    };
    const terminalResult = {
      schemaVersion: 1 as const,
      jobId: parentGatewayJobId,
      claimId: parentClaimId,
      claimGeneration: 1,
      lifecycleGeneration: 1,
      deploymentContractVersion: bundle.deploymentContract.version,
      deploymentContractHash: priorDeploymentContractHash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      roleContractVersion: mappingRole.version,
      roleContractHash: mappingRole.hash,
      promptTemplateVersion: mappingPrompt.version,
      promptTemplateHash: mappingPrompt.hash,
      workerId: `worker-${suffix}`,
      invocationId: `invocation-${suffix}`,
      reasonCodes: ['CONTRACT_REQUIREMENT_MISSING' as const],
      evidenceRefs: evidenceManifest.entries.map((entry) => entry.evidenceRef),
      summary: 'The stored legacy sport context requires a bounded retry.',
      role: 'MAPPING_PRODUCER' as const,
      disposition: 'CONTRACT_GAP' as const,
      payload: {
        contractArea: 'MAPPING_EVIDENCE' as const,
        requestedChange: 'Retry the legacy sport mapping with the current reviewed contract.',
      },
    };
    const terminalAccepted = {
      kind: 'TERMINAL_ACCEPTED' as const,
      receiptId,
      resultHash: hashAffiliateAgentValue(terminalResult),
      disposition: 'CONTRACT_GAP' as const,
      completedAt: '2026-08-20T00:04:00.000Z',
    };
    const root = rootFor(sourceUrl, rootId, intakeId);
    roots.push(root);
    organizations.push({
      id: `organization-${suffix}`,
      status: 'UNLISTED',
      publicPageEnabled: false,
      publicWidgetsEnabled: false,
    });
    intakes.push({
      id: intakeId,
      sourceKey: `source-key-${suffix}`,
      baseUrl: sourceUrl,
      status: 'READY_FOR_MAPPING',
      affiliateSourceId: sourceId,
      supplySourceId: rootId,
      lastRunId: runId,
      targetKindHints: ['CLUB'],
    });
    sources.push({
      id: sourceId,
      sourceKey: `source-key-${suffix}`,
      organizationId: `organization-${suffix}`,
      baseUrl: sourceUrl,
      listUrl: `${sourceUrl}/events`,
      targetKind: 'CLUB',
      status: 'ACTIVE',
      activeMappingId: mappingId,
      supplySourceId: rootId,
      autoScrapeEnabled: false,
      metadata: {
        sourceEvidence: { intakeId, runId, intakeSourceKey: `source-key-${suffix}` },
        automationReviewRequired: {
          hold: true,
          reason: 'LEGACY_SPORT_REPAIR',
          reportHash: 'a'.repeat(64),
          evidenceRefs: artifactRows.map((artifact) => `intake-artifact:${artifact.id}`).sort(),
        },
      },
    });
    mappings.push({
      id: mappingId,
      sourceId,
      supplySourceId: rootId,
      version: 1,
      isActive: true,
      validatedAt: null,
    });
    mappingJobs.push({
      id: mappingJobId,
      intakeId,
      supplySourceId: rootId,
      sourceId,
      mappingId,
      legacyIdentityMigrationEligible: false,
      status: 'REVIEW_REQUIRED',
      claimedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      resultSummary: {
        sportReconciliationHistory: [{
          strategyRevision: 'sport-evidence-v1',
          archivedPriorResultSummary: { result: { jobId: mappingJobId } },
        }],
        legacyRepairAdmissionHistory: [{
          schemaVersion: 1,
          kind: 'LEGACY_SPORT_REPAIR_ADMISSION',
          reportHash: 'a'.repeat(64),
          rootId,
          gatewayDedupeKey: `legacy-sport-repair:${mappingJobId}`,
          repairContext,
          manifest: evidenceManifest,
          sourceId,
          mappingId,
          evidenceRunId: runId,
          selectedWrite: { sourceId, mappingId },
        }],
      },
      errorMessage: null,
    });
    runs.push({
      id: runId,
      intakeId,
      supplySourceId: null,
      status: 'SUCCEEDED',
      createdAt: new Date('2026-08-20T00:00:00Z'),
      finishedAt: new Date('2026-08-20T00:02:00Z'),
    });
    pages.push({
      id: pageId,
      intakeId,
      supplySourceId: null,
      url: sourceUrl,
      canonicalUrl: sourceUrl,
      status: 'ACTIVE',
    });
    artifacts.push(...artifactRows);
    files.push(...artifactRows.map((artifact) => ({
      id: artifact.fileId,
      path: `affiliate/retry/${artifact.id}`,
      bucket: 'evidence',
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
    })));
    candidates.push({
      id: `candidate-${suffix}`,
      sourceId,
      mappingId,
      supplySourceId: rootId,
      listingKind: 'CLUB',
      status: 'DRAFT',
      publishedOrganizationId: null,
      publishedEventId: null,
      publishedTeamId: null,
      publishedFacilityId: null,
    });
    gatewayJobs.push({
      id: parentGatewayJobId,
      dedupeKey: `legacy-sport-repair:${mappingJobId}`,
      queue: 'AFFILIATE_MAPPING',
      lane: 'MAPPING_PRODUCTION',
      role: 'MAPPING_PRODUCER',
      subjectType: 'MAPPING_PRODUCER',
      subjectId: mappingJobId,
      subjectJson: subject,
      evidenceManifestJson: evidenceManifest,
      supplySourceId: rootId,
      expectedLifecycleGeneration: 1,
      status: 'COMPLETED',
      activeClaimId: null,
      parentClaimId: null,
      claimGeneration: 1,
      terminalDisposition: 'CONTRACT_GAP',
      resultHash: hashAffiliateAgentValue(terminalResult),
      resultJson: terminalResult,
      terminalReceiptId: receiptId,
      finishedAt: new Date('2026-08-20T00:04:00Z'),
    });
    gatewayClaims.push({
      id: parentClaimId,
      jobId: parentGatewayJobId,
      parentClaimId: null,
      claimGeneration: 1,
      lifecycleGeneration: 1,
      queue: 'AFFILIATE_MAPPING',
      lane: 'MAPPING_PRODUCTION',
      role: 'MAPPING_PRODUCER',
      workerId: `worker-${suffix}`,
      invocationId: `invocation-${suffix}`,
      workspaceId: `workspace-${suffix}`,
      status: 'COMPLETED',
      deploymentContractVersion: bundle.deploymentContract.version,
      deploymentContractHash: priorDeploymentContractHash,
      roleContractVersion: mappingRole.version,
      roleContractHash: mappingRole.hash,
      promptTemplateVersion: mappingPrompt.version,
      promptTemplateHash: mappingPrompt.hash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      claimEnvelopeHash: hashAffiliateAgentValue(claimEnvelope),
      claimEnvelopeJson: claimEnvelope,
      evidenceManifestHash: evidenceManifest.hash,
      schemaCorrectionCount: 0,
      terminalReceiptId: receiptId,
    });
    gatewayReceipts.push({
      id: receiptId,
      claimId: parentClaimId,
      jobId: parentGatewayJobId,
      claimGeneration: 1,
      idempotencyKey: `submit-${suffix}`,
      operationKind: 'SUBMIT_RESULT',
      commandName: null,
      requestHash: 'b'.repeat(64),
      status: 'SUCCEEDED',
      responseHash: hashAffiliateAgentValue(terminalAccepted),
      responseJson: terminalAccepted,
      safeErrorCode: null,
      completedAt: new Date('2026-08-20T00:04:00Z'),
    });
  }
  const findByWhere = (rows: readonly Record<string, unknown>[], where: Record<string, unknown> | undefined) => {
    const id = typeof where?.id === 'string' ? where.id : null;
    const dedupeKey = typeof where?.dedupeKey === 'string' ? where.dedupeKey : null;
    return rows.find((row) => (id !== null && row.id === id) || (dedupeKey !== null && row.dedupeKey === dedupeKey)) ?? null;
  };
  const mappingJobDelegate = {
    findMany: jest.fn(async () => mappingJobs),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(mappingJobs, where)),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = mappingJobs.find((candidate) => (
        candidate.id === where.id
        && candidate.status === where.status
        && candidate.intakeId === where.intakeId
        && candidate.sourceId === where.sourceId
        && candidate.mappingId === where.mappingId
        && candidate.supplySourceId === where.supplySourceId
        && candidate.claimedAt === null
        && candidate.workerId === null
        && candidate.leaseExpiresAt === null
      ));
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
  };
  const gatewayJobDelegate = {
    findMany: jest.fn(async () => gatewayJobs),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(gatewayJobs, where)),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      gatewayJobs.push(data);
      return data;
    }),
  };
  const database = {
    affiliateSourceMappingJobs: mappingJobDelegate,
    affiliateSourceIntakes: { findMany: jest.fn(async () => intakes) },
    affiliateSourceIntakeRuns: { findMany: jest.fn(async () => runs) },
    affiliateSourceIntakePages: { findMany: jest.fn(async () => pages) },
    affiliateSourceIntakeArtifacts: { findMany: jest.fn(async () => artifacts) },
    affiliateScrapeSources: { findMany: jest.fn(async () => sources) },
    affiliateScrapeMappings: { findMany: jest.fn(async () => mappings) },
    affiliateImportCandidates: { findMany: jest.fn(async () => candidates) },
    organizations: { findMany: jest.fn(async () => organizations) },
    affiliateSupplySources: { findMany: jest.fn(async () => roots) },
    affiliateSupplyTargets: { findMany: jest.fn(async () => []) },
    affiliateApprovalJobs: { findMany: jest.fn(async () => []) },
    affiliateAgentGatewayJobs: gatewayJobDelegate,
    affiliateAgentGatewayClaims: { findMany: jest.fn(async () => gatewayClaims) },
    affiliateAgentGatewayOperationReceipts: { findMany: jest.fn(async () => gatewayReceipts) },
    affiliateSupplyContractManifests: {
      findFirst: jest.fn(async () => ({
        id: 'active-manifest',
        version: manifest.version,
        rolloutCohort: manifest.rolloutCohort,
        status: manifest.status,
        contractHash: manifest.hash,
        contractJson: manifest.supplyContract,
      })),
    },
    sports: { findMany: jest.fn(async () => sports) },
    file: { findMany: jest.fn(async () => files) },
  };
  const prisma = {
    ...database,
    $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => (
      callback(database as unknown as Prisma.TransactionClient)
    ),
  } as unknown as PrismaClient;
  return {
    input: { prisma, bundle, gatewayJobIds: ['gateway-parent-softball', 'gateway-parent-boomtown'], reason: 'authorized bounded retry' },
    mappingJobs,
    gatewayJobs,
    gatewayClaims,
    gatewayReceipts,
    runs,
    pages,
    roots,
    organizations,
    sources,
    database,
  };
};

describe('legacy repair admission with real contract validators', () => {
  it('previews private promoted club drafts without inventing prior sport context', async () => {
    const { input } = fixture();
    const first = await previewAffiliateLegacyRepairAdmission(input);
    const second = await previewAffiliateLegacyRepairAdmission(input);
    expect(first.counts).toEqual({ total: 1, eligible: 1, held: 0, selected: 1, alreadyAdmitted: 0 });
    expect(first.rows[0]).toMatchObject({ mappingId: 'mapping-date', evidenceRunId: 'run-date', eligible: true });
    expect(first.rows[0].artifacts[0].artifactId).toMatch(/^intake-artifact:/);
    expect(first.reportHash).toBe(second.reportHash);
    expect(calculateAffiliateLegacyRepairAdmissionReportHash(first)).toBe(first.reportHash);
  });

  it('holds a directory-visible organization even when its page and widgets are disabled', async () => {
    const { input, organization } = fixture();
    organization.status = 'LISTED';
    const report = await previewAffiliateLegacyRepairAdmission(input);
    expect(report.counts.selected).toBe(0);
    expect(report.rows[0].reasonCodes).toContain('PUBLIC_ORGANIZATION_PAGE');
  });

  it('holds a published reference to another organization rather than treating it as the source draft', async () => {
    const { input, candidate } = fixture();
    candidate.publishedOrganizationId = 'other-organization';
    const report = await previewAffiliateLegacyRepairAdmission(input);
    expect(report.rows[0].reasonCodes).toContain('PUBLISHED_AFFILIATE_CANDIDATE');
    expect(report.selectedJobIds).toEqual([]);
  });

  it('does not substitute the latest run when source provenance cites a missing run', async () => {
    const { input, source } = fixture();
    source.metadata.sourceEvidence.runId = 'missing-run';
    const report = await previewAffiliateLegacyRepairAdmission(input);
    expect(report.rows[0].reasonCodes).toContain('SUCCESSFUL_CAPTURE_RUN_MISSING');
    expect(report.selectedJobIds).toEqual([]);
  });

  it('rejects state drift after validating the distinct manifest and policy hashes', async () => {
    const { input, source } = fixture();
    expect(manifest.hash).not.toBe(manifest.supplyContract.hash);
    const preview = await previewAffiliateLegacyRepairAdmission(input);
    source.autoScrapeEnabled = true;
    await expect(applyAffiliateLegacyRepairAdmission({
      ...input, operatorId: 'affiliate-gateway-operator', expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'ADMISSION_REPORT_DRIFT' });
  });

  it('blocks apply while any gateway claim has active authority', async () => {
    const { input, claims } = fixture();
    const preview = await previewAffiliateLegacyRepairAdmission(input);
    claims.push({ id: 'unrelated-claim', jobId: 'unrelated-job', status: 'ACTIVE' });
    await expect(applyAffiliateLegacyRepairAdmission({
      ...input, operatorId: 'affiliate-gateway-operator', expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'CLAIM_DRIFT' });
  });

  it('rejects out-of-bound selection and absent apply authority', async () => {
    const { input } = fixture();
    await expect(previewAffiliateLegacyRepairAdmission({ ...input, limit: 21 }))
      .rejects.toMatchObject({ code: 'INVALID_LIMIT' });
    await expect(applyAffiliateLegacyRepairAdmission({
      ...input, operatorId: ' ', expectedReportHash: 'a'.repeat(64),
    })).rejects.toMatchObject({ code: 'OPERATOR_REQUIRED' });
  });
  it('previews both bounded retries as one deterministic all-or-nothing proposal', async () => {
    const { input } = retryFixture();
    const first = await previewAffiliateLegacyRepairRetry(input);
    const second = await previewAffiliateLegacyRepairRetry(input);

    expect(first.counts).toEqual({ total: 2, eligible: 2, held: 0, selected: 2, alreadyRetried: 0 });
    expect(first.selectedGatewayJobIds).toEqual(['gateway-parent-boomtown', 'gateway-parent-softball']);
    expect(first.rows.every((row) => row.eligible)).toBe(true);
    expect(first.reportHash).toBe(second.reportHash);
    expect(calculateAffiliateLegacyRepairRetryReportHash(first)).toBe(first.reportHash);
  });

  it('applies both retries without mutating parent history and replays idempotently', async () => {
    const fixtureState = retryFixture();
    const preview = await previewAffiliateLegacyRepairRetry(fixtureState.input);
    const parentSnapshots = fixtureState.gatewayJobs.map((job) => JSON.stringify(job));
    const claimSnapshots = fixtureState.gatewayClaims.map((claim) => JSON.stringify(claim));
    const receiptSnapshots = fixtureState.gatewayReceipts.map((receipt) => JSON.stringify(receipt));
    const applied = await applyAffiliateLegacyRepairRetry({
      ...fixtureState.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    expect(applied.writeCount).toBe(2);
    expect(applied.appliedGatewayJobIds).toHaveLength(2);
    expect(fixtureState.mappingJobs.every((job) => job.status === 'QUEUED')).toBe(true);
    expect(fixtureState.gatewayJobs).toHaveLength(4);
    expect(fixtureState.gatewayJobs.slice(0, 2).map((job) => JSON.stringify(job))).toEqual(parentSnapshots);
    expect(fixtureState.gatewayClaims.map((claim) => JSON.stringify(claim))).toEqual(claimSnapshots);
    expect(fixtureState.gatewayReceipts.map((receipt) => JSON.stringify(receipt))).toEqual(receiptSnapshots);
    const replay = await applyAffiliateLegacyRepairRetry({
      ...fixtureState.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.writeCount).toBe(0);
    expect(replay.appliedGatewayJobIds).toEqual(applied.appliedGatewayJobIds);
    expect(fixtureState.gatewayJobs).toHaveLength(4);
    expect(fixtureState.gatewayJobs.slice(2).map((job) => job.dedupeKey).sort()).toEqual([
      'legacy-sport-repair-retry:gateway-parent-boomtown',
      'legacy-sport-repair-retry:gateway-parent-softball',
    ]);
    const { hash: _deploymentHash, ...deploymentPreimage } = fixtureState.input.bundle.deploymentContract;
    const changedDeploymentPreimage = {
      ...deploymentPreimage,
      version: fixtureState.input.bundle.deploymentContract.version + 1,
    };
    const changedDeploymentBundle = {
      ...fixtureState.input.bundle,
      deploymentContract: {
        ...changedDeploymentPreimage,
        hash: hashAffiliateAgentValue(changedDeploymentPreimage),
      },
    };
    await expect(applyAffiliateLegacyRepairRetry({
      ...fixtureState.input,
      bundle: changedDeploymentBundle,
      gatewayJobIds: ['gateway-parent-softball'],
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'ADMISSION_REPORT_DRIFT' });
    expect(fixtureState.gatewayJobs).toHaveLength(4);
  });

  it('holds a retry when a source becomes public and refuses stale apply state', async () => {
    const publicFixture = retryFixture();
    publicFixture.organizations[0].status = 'LISTED';
    const held = await previewAffiliateLegacyRepairRetry(publicFixture.input);
    expect(held.selectedGatewayJobIds).toEqual([]);
    const publicRow = held.rows.find((row) => row.gatewayJobId === 'gateway-parent-softball');
    expect(publicRow?.reasonCodes).toContain('PUBLIC_ORGANIZATION_PAGE');

    const driftFixture = retryFixture();
    const preview = await previewAffiliateLegacyRepairRetry(driftFixture.input);
    driftFixture.roots[0].derivedStage = 'MAPPED';
    await expect(applyAffiliateLegacyRepairRetry({
      ...driftFixture.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'ADMISSION_REPORT_DRIFT' });
  });

  it('holds an active descendant and exhausted parent pass rather than creating another child', async () => {
    const descendantFixture = retryFixture();
    descendantFixture.gatewayJobs.push({
      id: 'active-retry-child',
      dedupeKey: 'active-retry-child-dedupe',
      queue: 'AFFILIATE_MAPPING',
      lane: 'MAPPING_PRODUCTION',
      role: 'MAPPING_PRODUCER',
      subjectType: 'MAPPING_PRODUCER',
      subjectId: 'mapping-retry-softball',
      subjectJson: {
        type: 'MAPPING_PRODUCER',
        supplySourceId: 'root-retry-softball',
        mappingJobId: 'mapping-retry-softball',
        pass: 2,
      },
      evidenceManifestJson: {},
      supplySourceId: 'root-retry-softball',
      expectedLifecycleGeneration: 1,
      status: 'QUEUED',
      activeClaimId: null,
      parentClaimId: 'claim-parent-softball',
    });
    const descendantHeld = await previewAffiliateLegacyRepairRetry(descendantFixture.input);
    const softballRow = descendantHeld.rows.find((row) => row.gatewayJobId === 'gateway-parent-softball');
    expect(softballRow?.reasonCodes).toContain('ACTIVE_RETRY_DESCENDANT');

    const exhaustedFixture = retryFixture();
    const exhaustedParent = exhaustedFixture.gatewayJobs.find((job) => job.id === 'gateway-parent-boomtown');
    const exhaustedSubject = exhaustedParent?.subjectJson;
    if (exhaustedSubject && typeof exhaustedSubject === 'object'
      && 'pass' in exhaustedSubject && typeof exhaustedSubject.pass === 'number') {
      exhaustedSubject.pass = 3;
    }
    const exhausted = await previewAffiliateLegacyRepairRetry(exhaustedFixture.input);
    const boomtownRow = exhausted.rows.find((row) => row.gatewayJobId === 'gateway-parent-boomtown');
    expect(boomtownRow?.reasonCodes).toContain('RETRY_PASS_EXHAUSTED');
    expect(exhausted.selectedGatewayJobIds).toEqual([]);
  });
  it('rejects non-null foreign run and page root links while accepting null legacy links', async () => {
    const foreignFixture = retryFixture();
    foreignFixture.runs[0].supplySourceId = 'foreign-root';
    foreignFixture.pages[0].supplySourceId = 'foreign-root';
    const held = await previewAffiliateLegacyRepairRetry(foreignFixture.input);
    expect(held.selectedGatewayJobIds).toEqual([]);
    const softballRow = held.rows.find((row) => row.gatewayJobId === 'gateway-parent-softball');
    expect(softballRow?.reasonCodes).toEqual(expect.arrayContaining([
      'EVIDENCE_PAGE_ROOT_OWNERSHIP_CONFLICT',
      'EVIDENCE_ROOT_OWNERSHIP_CONFLICT',
    ]));
  });
});
