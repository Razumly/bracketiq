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
import type { EnsureAffiliateSupplySourceResult } from '../affiliateSupplyPersistence';
import { buildAffiliateSupplyContractManifest, normalizeAffiliateSupplyIdentity } from '../affiliateSupplyLifecycle';
import { affiliateSportsCatalogSha256 } from '../affiliateSportsCatalog';
import type { AffiliateAgentArtifactStore } from '../agentGatewayAdapters';
import * as affiliateSupplyPersistence from '../affiliateSupplyPersistence';
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
  const historicalMappingRoleVersion = 2;
  const historicalMappingRoleHash = 'ac454e9c59388187e51a70e5dd24c9e8cf8dbf85ed983c6c36a510f4383a40e8';
  const historicalMappingPromptVersion = 2;
  const historicalMappingPromptHash = '8756108df1589b5058dd19e4440864f629fd9491f91a1707ddad20db5f2e07d1';
  const intakes: Record<string, unknown>[] = [];
  const runs: Record<string, unknown>[] = [];
  const pages: Record<string, unknown>[] = [];
  const artifacts: Record<string, unknown>[] = [];
  const artifactBytesByFileId = new Map<string, Buffer>();
  const priorDeploymentContractVersion = 3;
  const priorDeploymentContractHash = '15c37807d319b38b1c8558bfb3b1b84a16e5a85e4734aaf861d2f1259e4a7679';
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
    const artifactRows = (['PAGE_HTML', 'PAGE_MARKDOWN'] as const).map((kind) => {
      const fileId = `file-retry-${suffix}-${kind.toLowerCase()}`;
      const bytes = Buffer.from(`${suffix} source evidence confirms Grass Soccer for ${kind}.`, 'utf8');
      artifactBytesByFileId.set(fileId, bytes);
      return {
        id: `artifact-retry-${suffix}-${kind.toLowerCase()}`,
        intakeId,
        supplySourceId: rootId,
        pageId,
        runId,
        kind,
        sourceUrl,
        finalUrl: sourceUrl,
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        fileId,
        mimeType: kind === 'PAGE_HTML' ? 'text/html' : 'text/markdown',
        sizeBytes: bytes.length,
        createdAt: new Date('2026-08-20T00:01:00Z'),
        isPinned: true,
        retainUntil: null,
      };
    });
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
      deploymentContractVersion: priorDeploymentContractVersion,
      deploymentContractHash: priorDeploymentContractHash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      roleContractVersion: historicalMappingRoleVersion,
      roleContractHash: historicalMappingRoleHash,
      promptTemplateVersion: historicalMappingPromptVersion,
      promptTemplateHash: historicalMappingPromptHash,
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
      deploymentContractVersion: priorDeploymentContractVersion,
      deploymentContractHash: priorDeploymentContractHash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      roleContractVersion: historicalMappingRoleVersion,
      roleContractHash: historicalMappingRoleHash,
      promptTemplateVersion: historicalMappingPromptVersion,
      promptTemplateHash: historicalMappingPromptHash,
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
    const root = rootFor(`${sourceUrl}/events`, rootId, intakeId);
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
        legacyRepairAdmissionHistory: [],
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
      dedupeKey: [
        'legacy-sport-repair',
        mappingJobId,
        root.identityKey,
        runId,
        manifest.supplyContract.version,
        manifest.supplyContract.hash,
      ].join(':'),
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
      deploymentContractVersion: priorDeploymentContractVersion,
      deploymentContractHash: priorDeploymentContractHash,
      roleContractVersion: historicalMappingRoleVersion,
      roleContractHash: historicalMappingRoleHash,
      promptTemplateVersion: historicalMappingPromptVersion,
      promptTemplateHash: historicalMappingPromptHash,
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
    const identityKey = typeof where?.identityKey === 'string' ? where.identityKey : null;
    return rows.find((row) => (
      (id !== null && row.id === id)
      || (dedupeKey !== null && row.dedupeKey === dedupeKey)
      || (identityKey !== null && row.identityKey === identityKey)
    )) ?? null;
  };
  const updateManyRows = (
    rows: Record<string, unknown>[],
    where: Record<string, unknown>,
    data: Record<string, unknown>,
  ): { count: number } => {
    const row = rows.find((candidate) => Object.entries(where).every(([key, value]) => (
      value === undefined || candidate[key] === value
    )));
    if (!row) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
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
  const intakeDelegate = {
    findMany: jest.fn(async () => intakes),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(intakes, where)),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => (
      updateManyRows(intakes, where, data)
    )),
  };
  const sourceDelegate = {
    findMany: jest.fn(async () => sources),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(sources, where)),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => (
      updateManyRows(sources, where, data)
    )),
  };
  const mappingDelegate = {
    findMany: jest.fn(async () => mappings),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(mappings, where)),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => (
      updateManyRows(mappings, where, data)
    )),
  };
  const artifactDelegate = {
    findMany: jest.fn(async () => artifacts),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => (
      updateManyRows(artifacts, where, data)
    )),
  };
  const rootDelegate = {
    findMany: jest.fn(async () => roots),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(roots, where)),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const created = data;
      roots.push(created);
      return created;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => (
      updateManyRows(roots, where, data)
    )),
  };
  const organizationDelegate = {
    findMany: jest.fn(async () => organizations),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(organizations, where)),
  };
  const gatewayJobDelegate = {
    findMany: jest.fn(async () => gatewayJobs),
    findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(gatewayJobs, where)),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      gatewayJobs.push(data);
      return data;
    }),
    upsert: jest.fn(async ({ where, create }: { where: Record<string, unknown>; create: Record<string, unknown> }) => {
      const existing = findByWhere(gatewayJobs, where);
      if (existing) return existing;
      gatewayJobs.push(create);
      return create;
    }),
  };
  const database = {
    affiliateSourceMappingJobs: mappingJobDelegate,
    affiliateSourceIntakes: intakeDelegate,
    affiliateSourceIntakeRuns: { findMany: jest.fn(async () => runs) },
    affiliateSourceIntakePages: { findMany: jest.fn(async () => pages) },
    affiliateSourceIntakeArtifacts: artifactDelegate,
    affiliateScrapeSources: sourceDelegate,
    affiliateScrapeMappings: mappingDelegate,
    affiliateImportCandidates: { findMany: jest.fn(async () => candidates) },
    organizations: organizationDelegate,
    affiliateSupplySources: rootDelegate,
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
  const artifactStore: AffiliateAgentArtifactStore = {
    readImmutable: async ({ fileId, maximumBytes }) => {
      const artifactId = fileId.startsWith('intake-artifact:')
        ? fileId.slice('intake-artifact:'.length)
        : null;
      const row = artifacts.find((candidate) => candidate.id === artifactId);
      if (!row) throw new Error(`Artifact ${fileId} was not found.`);
      const bytes = artifactBytesByFileId.get(String(row.fileId));
      if (!bytes || bytes.length > maximumBytes) throw new Error(`Artifact ${fileId} is unavailable.`);
      return {
        bytes,
        mimeType: String(row.mimeType),
        byteSize: bytes.length,
        sourceUrl: String(row.sourceUrl),
        finalUrl: String(row.finalUrl),
        runId: String(row.runId),
        intakeId: String(row.intakeId),
      };
    },
  };
  return {
    input: {
      prisma,
      bundle,
      gatewayJobIds: ['gateway-parent-softball', 'gateway-parent-boomtown'],
      reason: 'authorized bounded retry',
      artifactStore,
    },
    mappingJobs,
    gatewayJobs,
    gatewayClaims,
    gatewayReceipts,
    runs,
    pages,
    roots,
    organizations,
    sources,
    intakes,
    mappings,
    artifacts,
    candidates,
    database,
  };
};

type RetryFixtureState = {
  input: {
    prisma: PrismaClient;
    bundle: typeof bundle;
    gatewayJobIds: string[];
    reason: string;
    artifactStore: AffiliateAgentArtifactStore;
  };
  mappingJobs: Record<string, unknown>[];
  gatewayJobs: Record<string, unknown>[];
  gatewayClaims: Record<string, unknown>[];
  gatewayReceipts: Record<string, unknown>[];
  intakes: Record<string, unknown>[];
  sources: Record<string, unknown>[];
  mappings: Record<string, unknown>[];
  artifacts: Record<string, unknown>[];

  candidates: Record<string, unknown>[];
  roots: Record<string, unknown>[];
  organizations: Record<string, unknown>[];
};
const admitRetryFixture = async (state: RetryFixtureState): Promise<RetryFixtureState> => {
  const historicalGatewayJobs = [...state.gatewayJobs];
  const historicalGatewayClaims = [...state.gatewayClaims];
  const historicalGatewayReceipts = [...state.gatewayReceipts];
  const rootTemplates = [...state.roots];
  state.gatewayJobs.splice(0, state.gatewayJobs.length);
  state.gatewayClaims.splice(0, state.gatewayClaims.length);
  state.gatewayReceipts.splice(0, state.gatewayReceipts.length);
  state.roots.splice(0, state.roots.length);
  for (const job of state.mappingJobs) {
    job.supplySourceId = null;
    job.status = 'QUEUED';
    job.resultSummary = {
      sportReconciliationHistory: [{
        strategyRevision: 'sport-evidence-v1',
        archivedPriorResultSummary: { result: { jobId: job.id } },
      }],
      legacyRepairAdmissionHistory: [],
    };
  }
  for (const intake of state.intakes) intake.supplySourceId = null;
  for (const source of state.sources) source.supplySourceId = null;
  for (const mapping of state.mappings) mapping.supplySourceId = null;
  for (const artifact of state.artifacts) {
    artifact.supplySourceId = null;
    artifact.isPinned = false;
  }
  for (const candidate of state.candidates) candidate.supplySourceId = null;
  const ensureSpy = jest.spyOn(affiliateSupplyPersistence, 'ensureAffiliateSupplySource')
    .mockImplementation(async (request) => {
      const root = rootTemplates.find((candidate) => (
        candidate.intakeId === request.intakeId
        || candidate.canonicalUrl === (request.resolvedCanonicalUrl ?? request.requestedUrl)
      ));
      if (!root) throw new Error(`No root template for ${request.requestedUrl}.`);
      state.roots.push(root);
      const intake = state.intakes.find((candidate) => candidate.id === request.intakeId);
      if (intake) intake.supplySourceId = root.id;
      const source = state.sources.find((candidate) => candidate.id === request.liveSourceId);
      if (source) source.supplySourceId = root.id;
      return {
        supplySource: root as unknown as EnsureAffiliateSupplySourceResult['supplySource'],
        identity: normalizeAffiliateSupplyIdentity({
          requestedUrl: request.requestedUrl,
          resolvedCanonicalUrl: request.resolvedCanonicalUrl,
          operatorDomain: request.operatorDomain,
        }),
        isCreated: true,
        isSuccessorCreated: false,
        predecessorId: null,
      };
    });
  const admissionInput = {
    prisma: state.input.prisma,
    bundle: state.input.bundle,
    jobIds: state.mappingJobs.map((job) => String(job.id)),
    limit: 2,
  };
  try {
    const preview = await previewAffiliateLegacyRepairAdmission(admissionInput);
    if (preview.selectedJobIds.length !== 2) throw new Error('Admission fixture did not select both mapping jobs.');
    await applyAffiliateLegacyRepairAdmission({
      ...admissionInput,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
  } finally {
    ensureSpy.mockRestore();
  }
  state.gatewayJobs.splice(0, state.gatewayJobs.length, ...historicalGatewayJobs);
  state.gatewayClaims.splice(0, state.gatewayClaims.length, ...historicalGatewayClaims);
  state.gatewayReceipts.splice(0, state.gatewayReceipts.length, ...historicalGatewayReceipts);
  for (const job of state.mappingJobs) job.status = 'REVIEW_REQUIRED';
  return state;
};
const retryFixtureWithAdmission = async (): Promise<RetryFixtureState> => (
  admitRetryFixture(retryFixture())
);

const completeRetryChild = (
  state: RetryFixtureState,
  suffix: 'softball' | 'boomtown',
): string => {
  const parentClaimId = `claim-parent-${suffix}`;
  const child = state.gatewayJobs.find((candidate) => (
    candidate.parentClaimId === parentClaimId
    && candidate.id !== `gateway-parent-${suffix}`
  ));
  if (!child) throw new Error(`Retry child for ${suffix} was not created.`);
  const childSubject = child.subjectJson as Record<string, unknown>;
  const repairContext = childSubject.repairContext as Record<string, unknown>;
  const evidenceManifest = child.evidenceManifestJson as Record<string, unknown>;
  const evidenceEntries = Array.isArray(evidenceManifest.entries)
    ? evidenceManifest.entries.map((entry) => entry as Record<string, unknown>)
    : [];
  const citationEntry = evidenceEntries[0];
  if (!citationEntry) throw new Error(`Retry evidence manifest for ${suffix} is empty.`);
  const sportDetermination = {
    sourceLabels: ['Grass Soccer'],
    status: 'RESOLVED' as const,
    resolutionBasis: 'SOURCE_EVIDENCE' as const,
    canonicalSportNames: ['Grass Soccer'],
    rationale: 'The retained source evidence identifies Grass Soccer.',
    evidence: [{
      artifactId: String(citationEntry.artifactId),
      artifactSha256: String(citationEntry.sha256),
      artifactKind: String(citationEntry.kind) as 'PAGE_HTML' | 'PAGE_MARKDOWN',
      pageUrl: `https://${suffix}.example.test`,
      excerpt: 'Grass Soccer',
    }],
  };
  const childClaimId = `claim-retry-${suffix}`;
  const childReceiptId = `receipt-retry-${suffix}`;
  const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER;
  const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES.MAPPING_PRODUCER;
  const claimEnvelope = {
    schemaVersion: 1 as const,
    role: 'MAPPING_PRODUCER' as const,
    queue: 'AFFILIATE_MAPPING' as const,
    lane: 'MAPPING_PRODUCTION' as const,
    jobId: child.id,
    claimId: childClaimId,
    supplySourceId: child.supplySourceId,
    claimGeneration: 1,
    lifecycleGeneration: child.expectedLifecycleGeneration,
    deploymentContractVersion: 3,
    deploymentContractHash: '15c37807d319b38b1c8558bfb3b1b84a16e5a85e4734aaf861d2f1259e4a7679',
    supplyContractVersion: manifest.supplyContract.version,
    supplyContractHash: manifest.supplyContract.hash,
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    executionClass: 'PRODUCTION_OMP' as const,
    workerId: `retry-worker-${suffix}`,
    invocationId: `retry-invocation-${suffix}`,
    workspaceId: `retry-workspace-${suffix}`,
    claimedAt: '2026-08-20T00:05:00.000Z',
    expiresAt: '2026-08-20T00:30:00.000Z',
    evidenceManifest,
    permittedCommands: roleContract.permittedCommands,
    subject: childSubject,
  };
  const result = {
    schemaVersion: 1 as const,
    jobId: child.id,
    claimId: childClaimId,
    claimGeneration: 1,
    lifecycleGeneration: child.expectedLifecycleGeneration,
    deploymentContractVersion: 3,
    deploymentContractHash: '15c37807d319b38b1c8558bfb3b1b84a16e5a85e4734aaf861d2f1259e4a7679',
    supplyContractVersion: manifest.supplyContract.version,
    supplyContractHash: manifest.supplyContract.hash,
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    workerId: `retry-worker-${suffix}`,
    invocationId: `retry-invocation-${suffix}`,
    reasonCodes: ['CONTRACT_REQUIREMENT_MISSING' as const],
    evidenceRefs: (Array.isArray(evidenceManifest.entries) ? evidenceManifest.entries : [])
      .map((entry) => String((entry as Record<string, unknown>).evidenceRef)),
    summary: 'The retry fixture completed with a contract gap.',
    disposition: 'CONTRACT_GAP' as const,
    role: 'MAPPING_PRODUCER' as const,
    payload: {
      contractArea: 'MAPPING_EVIDENCE' as const,
      requestedChange: 'Retry the mapping with the current reviewed contract.',
      sportEvidence: {
        evidenceRunId: String(repairContext.evidenceRunId),
        sportsCatalogSha256: String((repairContext.sportsCatalog as Record<string, unknown>).sha256),
        sportDeterminations: [sportDetermination],
      },
    },
  };
  const terminalAccepted = {
    kind: 'TERMINAL_ACCEPTED' as const,
    receiptId: childReceiptId,
    resultHash: hashAffiliateAgentValue(result),
    disposition: 'CONTRACT_GAP' as const,
    completedAt: '2026-08-20T00:06:00.000Z',
  };
  child.status = 'COMPLETED';
  child.claimGeneration = 1;
  child.terminalDisposition = 'CONTRACT_GAP';
  child.resultHash = hashAffiliateAgentValue(result);
  child.resultJson = result;
  child.terminalReceiptId = childReceiptId;
  child.finishedAt = new Date('2026-08-20T00:06:00Z');
  state.gatewayClaims.push({
    id: childClaimId,
    jobId: child.id,
    parentClaimId,
    claimGeneration: 1,
    lifecycleGeneration: child.expectedLifecycleGeneration,
    queue: 'AFFILIATE_MAPPING',
    lane: 'MAPPING_PRODUCTION',
    role: 'MAPPING_PRODUCER',
    workerId: `retry-worker-${suffix}`,
    invocationId: `retry-invocation-${suffix}`,
    workspaceId: `retry-workspace-${suffix}`,
    status: 'COMPLETED',
    deploymentContractVersion: 3,
    deploymentContractHash: '15c37807d319b38b1c8558bfb3b1b84a16e5a85e4734aaf861d2f1259e4a7679',
    roleContractVersion: roleContract.version,
    roleContractHash: roleContract.hash,
    promptTemplateVersion: promptTemplate.version,
    promptTemplateHash: promptTemplate.hash,
    supplyContractVersion: manifest.supplyContract.version,
    supplyContractHash: manifest.supplyContract.hash,
    claimEnvelopeHash: hashAffiliateAgentValue(claimEnvelope),
    claimEnvelopeJson: claimEnvelope,
    evidenceManifestHash: String(evidenceManifest.hash),
    schemaCorrectionCount: 0,
    terminalReceiptId: childReceiptId,
  });
  state.gatewayReceipts.push({
    id: childReceiptId,
    claimId: childClaimId,
    jobId: child.id,
    claimGeneration: 1,
    idempotencyKey: `submit-retry-${suffix}`,
    operationKind: 'SUBMIT_RESULT',
    commandName: null,
    requestHash: 'b'.repeat(64),
    status: 'SUCCEEDED',
    responseHash: hashAffiliateAgentValue(terminalAccepted),
    responseJson: terminalAccepted,
    safeErrorCode: null,
    completedAt: new Date('2026-08-20T00:06:00Z'),
  });
  const mappingJob = state.mappingJobs.find((candidate) => candidate.id === `mapping-retry-${suffix}`);
  if (!mappingJob) throw new Error(`Mapping job for ${suffix} was not found.`);
  mappingJob.status = 'REVIEW_REQUIRED';
  return child.id;
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
  it('builds retry admission evidence through the actual admission writer', async () => {
    const state = await retryFixtureWithAdmission();
    const mappingJob = state.mappingJobs.find((job) => job.id === 'mapping-retry-softball');
    if (!mappingJob) throw new Error('Softball mapping job was not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairAdmissionHistory as Record<string, unknown>[];
    expect(history).toHaveLength(1);
    expect(history[0]).not.toHaveProperty('schemaVersion');
    expect((history[0].selectedRow as Record<string, unknown>).rootId).toBeNull();
    expect((history[0].selectedWrite as Record<string, unknown>).rootAction).toBe('CREATE_ROOT');
  });

  it('previews both bounded retries as one deterministic all-or-nothing proposal', async () => {
    const { input } = await retryFixtureWithAdmission();
    const first = await previewAffiliateLegacyRepairRetry(input);
    const second = await previewAffiliateLegacyRepairRetry(input);

    expect(first.counts).toEqual({ total: 2, eligible: 2, held: 0, selected: 2, alreadyRetried: 0 });
    expect(first.selectedGatewayJobIds).toEqual(['gateway-parent-boomtown', 'gateway-parent-softball']);
    expect(first.rows.every((row) => row.eligible)).toBe(true);
    expect(first.reportHash).toBe(second.reportHash);
    expect(calculateAffiliateLegacyRepairRetryReportHash(first)).toBe(first.reportHash);
  });

  it('replays both retries after normal root progress without mutating parent history', async () => {
    const fixtureState = await retryFixtureWithAdmission();
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
    for (const suffix of ['softball', 'boomtown'] as const) {
      const mappingJob = fixtureState.mappingJobs.find((job) => job.id === `mapping-retry-${suffix}`);
      if (!mappingJob) throw new Error(`Mapping job for ${suffix} was not created.`);
      const summary = mappingJob.resultSummary as Record<string, unknown>;
      const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
      const audit = history.find((entry) => entry.parentGatewayJobId === `gateway-parent-${suffix}`);
      if (!audit) throw new Error(`Retry audit for ${suffix} was not created.`);
      const auditReport = audit.reportSnapshot as Record<string, unknown>;
      const auditRows = auditReport.rows as Record<string, unknown>[];
      expect(auditReport.mode).toBe('APPLY');
      expect(auditReport.reviewedReportHash).toBe(preview.reportHash);
      expect(auditReport.writeCount).toBe(2);
      expect(auditReport.appliedGatewayJobIds).toEqual(applied.appliedGatewayJobIds);
      expect(auditRows.every((row) => (
        row.outcome === 'APPLIED' && typeof row.childGatewayJobId === 'string'
      ))).toBe(true);
      expect(auditRows.map((row) => row.childGatewayJobId).sort()).toEqual(
        [...applied.appliedGatewayJobIds].sort(),
      );
    }
    completeRetryChild(fixtureState, 'softball');
    const progressedMappingJob = fixtureState.mappingJobs.find((job) => job.id === 'mapping-retry-softball');
    const progressedSource = fixtureState.sources.find((source) => source.id === 'source-retry-softball');
    const previousMapping = fixtureState.mappings.find((mapping) => mapping.id === 'mapping-retry-softball');
    if (!progressedMappingJob || !progressedSource || !previousMapping) {
      throw new Error('Softball mapping progress rows were not created.');
    }
    previousMapping.isActive = false;
    const successorMapping = {
      ...previousMapping,
      id: 'mapping-retry-softball-successor',
      version: 2,
      isActive: true,
      validatedAt: new Date('2026-08-20T00:07:00Z'),
    };
    fixtureState.mappings.push(successorMapping);
    progressedMappingJob.mappingId = successorMapping.id;
    progressedSource.activeMappingId = successorMapping.id;
    fixtureState.roots[0].lifecycleGeneration = 2;
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
  it('rejects a same-version changed-hash deployment before retry writes', async () => {
    const state = await retryFixtureWithAdmission();
    const parentClaim = state.gatewayClaims.find((claim) => claim.id === 'claim-parent-softball');
    if (!parentClaim) throw new Error('Softball parent claim was not created.');
    const { hash: _deploymentHash, ...deploymentPreimage } = state.input.bundle.deploymentContract;
    const changedDeploymentPreimage = {
      ...deploymentPreimage,
      version: parentClaim.deploymentContractVersion,
      gatewayVersion: state.input.bundle.deploymentContract.gatewayVersion + 1,
    };
    const changedBundle = {
      ...state.input.bundle,
      deploymentContract: {
        ...changedDeploymentPreimage,
        hash: hashAffiliateAgentValue(changedDeploymentPreimage),
      },
    };
    expect(changedBundle.deploymentContract.hash).not.toBe(parentClaim.deploymentContractHash);
    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      bundle: changedBundle,
    });
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.rows.every((row) => row.reasonCodes.includes('SAME_DEPLOYMENT_RETRY'))).toBe(true);
    const gatewayJobSnapshots = state.gatewayJobs.map((job) => JSON.stringify(job));
    const mappingJobSnapshots = state.mappingJobs.map((job) => JSON.stringify(job));
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      bundle: changedBundle,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: report.reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_SCOPE_NOT_ELIGIBLE' });
    expect(state.gatewayJobs.map((job) => JSON.stringify(job))).toEqual(gatewayJobSnapshots);
    expect(state.mappingJobs.map((job) => JSON.stringify(job))).toEqual(mappingJobSnapshots);
  });
  it('rejects a changed current Supply contract even when roots are aligned before retry writes', async () => {
    const state = await retryFixtureWithAdmission();
    const { hash: _supplyHash, ...supplyPreimage } = state.input.bundle.supplyContract;
    const changedSupplyPreimage = {
      ...supplyPreimage,
      version: state.input.bundle.supplyContract.version + 1,
    };
    const changedSupply = {
      ...changedSupplyPreimage,
      hash: hashAffiliateAgentValue(changedSupplyPreimage),
    };
    const { hash: _deploymentHash, ...deploymentPreimage } = state.input.bundle.deploymentContract;
    const changedDeploymentPreimage = {
      ...deploymentPreimage,
      activeSupplyContract: {
        version: changedSupply.version,
        hash: changedSupply.hash,
      },
    };
    const changedBundle = {
      ...state.input.bundle,
      supplyContract: changedSupply,
      deploymentContract: {
        ...changedDeploymentPreimage,
        hash: hashAffiliateAgentValue(changedDeploymentPreimage),
      },
    };
    for (const root of state.roots) {
      root.activeSupplyContractVersion = changedSupply.version;
      root.activeSupplyContractHash = changedSupply.hash;
    }
    const changedManifest = buildAffiliateSupplyContractManifest({
      version: changedSupply.version,
      rolloutCohort: manifest.rolloutCohort,
      status: manifest.status,
      supplyContract: changedSupply,
    });
    state.database.affiliateSupplyContractManifests.findFirst.mockResolvedValue({
      id: 'active-manifest',
      version: changedManifest.version,
      rolloutCohort: changedManifest.rolloutCohort,
      status: changedManifest.status,
      contractHash: changedManifest.hash,
      contractJson: changedManifest.supplyContract,
    });
    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      bundle: changedBundle,
    });
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.rows.every((row) => row.reasonCodes.includes('PARENT_SUPPLY_CONTRACT_DRIFT'))).toBe(true);
    const gatewayJobSnapshots = state.gatewayJobs.map((job) => JSON.stringify(job));
    const mappingJobSnapshots = state.mappingJobs.map((job) => JSON.stringify(job));
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      bundle: changedBundle,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: report.reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_SCOPE_NOT_ELIGIBLE' });
    expect(state.gatewayJobs.map((job) => JSON.stringify(job))).toEqual(gatewayJobSnapshots);
    expect(state.mappingJobs.map((job) => JSON.stringify(job))).toEqual(mappingJobSnapshots);
  });

  it('holds a retry when a source becomes public and refuses stale apply state', async () => {
    const publicFixture = await retryFixtureWithAdmission();
    publicFixture.organizations[0].status = 'LISTED';
    const held = await previewAffiliateLegacyRepairRetry(publicFixture.input);
    expect(held.selectedGatewayJobIds).toEqual([]);
    const publicRow = held.rows.find((row) => row.gatewayJobId === 'gateway-parent-softball');
    expect(publicRow?.reasonCodes).toContain('PUBLIC_ORGANIZATION_PAGE');

    const driftFixture = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(driftFixture.input);
    driftFixture.roots[0].derivedStage = 'MAPPED';
    await expect(applyAffiliateLegacyRepairRetry({
      ...driftFixture.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'ADMISSION_REPORT_DRIFT' });
  });

  it('holds an active descendant and exhausted parent pass rather than creating another child', async () => {
    const descendantFixture = await retryFixtureWithAdmission();
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

    const exhaustedFixture = await retryFixtureWithAdmission();
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
    const foreignFixture = await retryFixtureWithAdmission();
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
  it('rejects replay when the audited retry child is deleted', async () => {
    const state = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    const childIndex = state.gatewayJobs.findIndex((job) => (
      job.parentClaimId === 'claim-parent-softball'
      && job.id !== 'gateway-parent-softball'
    ));
    expect(childIndex).toBeGreaterThanOrEqual(0);
    state.gatewayJobs.splice(childIndex, 1);
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_STATE_DRIFT' });
  });

  it('rejects replay when the audited child sports catalog is tampered', async () => {
    const state = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    const child = state.gatewayJobs.find((job) => (
      job.parentClaimId === 'claim-parent-softball'
      && job.id !== 'gateway-parent-softball'
    ));
    if (!child) throw new Error('Retry child was not created.');
    const subject = child.subjectJson as Record<string, unknown>;
    const repairContext = subject.repairContext as Record<string, unknown>;
    const sportsCatalog = repairContext.sportsCatalog as Record<string, unknown>;
    sportsCatalog.sha256 = '0'.repeat(64);
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_STATE_DRIFT' });
  });
  it('rejects replay when the audited child and audit co-tamper to a valid different catalog', async () => {
    const state = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    const child = state.gatewayJobs.find((job) => (
      job.parentClaimId === 'claim-parent-softball'
      && job.id !== 'gateway-parent-softball'
    ));
    const mappingJob = state.mappingJobs.find((job) => job.id === 'mapping-retry-softball');
    if (!child || !mappingJob) throw new Error('Retry child or mapping job was not created.');
    const alternateSports = [
      { id: 'grass-soccer', name: 'Grass Soccer' },
      { id: 'indoor-soccer', name: 'Indoor Soccer' },
    ];
    const alternateCatalog = {
      schemaVersion: 1 as const,
      capturedAt: '2026-08-20T00:07:00.000Z',
      sha256: affiliateSportsCatalogSha256(alternateSports),
      sports: alternateSports,
    };
    const parent = state.gatewayJobs.find((job) => job.id === 'gateway-parent-softball');
    const parentClaim = state.gatewayClaims.find((claim) => claim.id === 'claim-parent-softball');
    if (!parent || !parentClaim) throw new Error('Softball parent contract rows were not created.');
    const parentSubject = parent.subjectJson as Record<string, unknown>;
    const parentContext = parentSubject.repairContext as Record<string, unknown>;
    parentContext.sportsCatalog = alternateCatalog;
    const parentClaimEnvelope = parentClaim.claimEnvelopeJson as Record<string, unknown>;
    (parentClaimEnvelope.subject as Record<string, unknown>).repairContext = parentContext;
    parentClaim.claimEnvelopeHash = hashAffiliateAgentValue(parentClaimEnvelope);
    const childSubject = child.subjectJson as Record<string, unknown>;
    const childContext = childSubject.repairContext as Record<string, unknown>;
    childContext.sportsCatalog = alternateCatalog;
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const audit = history.find((entry) => entry.parentGatewayJobId === 'gateway-parent-softball');
    if (!audit) throw new Error('Retry audit was not created.');
    audit.sportsCatalogSha256 = alternateCatalog.sha256;
    const auditContext = audit.repairContext as Record<string, unknown>;
    auditContext.sportsCatalog = alternateCatalog;
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_STATE_DRIFT' });
  });

  it.each([
    ['queue', 'WRONG_QUEUE'],
    ['lane', 'WRONG_LANE'],
  ] as const)('holds replay when the audited child has an invalid %s', async (field, value) => {
    const state = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    const child = state.gatewayJobs.find((job) => (
      job.parentClaimId === 'claim-parent-softball'
      && job.id !== 'gateway-parent-softball'
    ));
    if (!child) throw new Error('Retry child was not created.');
    child[field] = value;
    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: ['gateway-parent-softball'],
    });
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.rows[0].reasonCodes).toContain('MALFORMED_RETRY_AUDIT');
  });

  it('blocks retry apply when only the gateway job active-claim pointer is set', async () => {
    const state = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(state.input);
    state.gatewayJobs[0].activeClaimId = 'claim-pointer-only';
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'CLAIM_DRIFT' });
  });
  it('requires sport assessment evidence for a version-three parent result', async () => {
    const state = await retryFixtureWithAdmission();
    const parentClaim = state.gatewayClaims.find((claim) => claim.id === 'claim-parent-softball');
    const parentJob = state.gatewayJobs.find((job) => job.id === 'gateway-parent-softball');
    const parentReceipt = state.gatewayReceipts.find((receipt) => receipt.id === 'receipt-parent-softball');
    if (!parentClaim || !parentJob || !parentReceipt) throw new Error('Softball parent contract rows were not created.');
    const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER;
    const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES.MAPPING_PRODUCER;
    parentClaim.roleContractVersion = roleContract.version;
    parentClaim.roleContractHash = roleContract.hash;
    parentClaim.promptTemplateVersion = promptTemplate.version;
    parentClaim.promptTemplateHash = promptTemplate.hash;
    const claimEnvelope = parentClaim.claimEnvelopeJson as Record<string, unknown>;
    claimEnvelope.roleContractVersion = roleContract.version;
    claimEnvelope.roleContractHash = roleContract.hash;
    claimEnvelope.promptTemplateVersion = promptTemplate.version;
    claimEnvelope.promptTemplateHash = promptTemplate.hash;
    parentClaim.claimEnvelopeHash = hashAffiliateAgentValue(claimEnvelope);
    const result = parentJob.resultJson as Record<string, unknown>;
    result.roleContractVersion = roleContract.version;
    result.roleContractHash = roleContract.hash;
    result.promptTemplateVersion = promptTemplate.version;
    result.promptTemplateHash = promptTemplate.hash;
    const payload = result.payload as Record<string, unknown>;
    delete payload.sportEvidence;
    parentJob.resultHash = hashAffiliateAgentValue(result);
    const receiptResponse = parentReceipt.responseJson as Record<string, unknown>;
    receiptResponse.resultHash = parentJob.resultHash;
    parentReceipt.responseHash = hashAffiliateAgentValue(receiptResponse);
    const report = await previewAffiliateLegacyRepairRetry(state.input);
    const row = report.rows.find((candidate) => candidate.gatewayJobId === 'gateway-parent-softball');
    expect(row?.reasonCodes).toContain('PARENT_SPORT_EVIDENCE_MISSING');
  });
  it('holds malformed historical admission evidence instead of trusting a partial record', async () => {
    const state = await retryFixtureWithAdmission();
    const mappingJob = state.mappingJobs.find((job) => job.id === 'mapping-retry-softball');
    if (!mappingJob) throw new Error('Softball mapping job was not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairAdmissionHistory as Record<string, unknown>[];
    history[0].reportHash = '0'.repeat(64);
    const report = await previewAffiliateLegacyRepairRetry(state.input);
    const row = report.rows.find((candidate) => candidate.gatewayJobId === 'gateway-parent-softball');
    expect(row?.reasonCodes).toContain('ADMISSION_EVIDENCE_INVALID');
    expect(row?.eligible).toBe(false);
  });
  it('admits a completed pass-two child for a bounded pass-three retry', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const childId = completeRetryChild(state, 'softball');
    const passThreeInput = { ...state.input, gatewayJobIds: [childId] };
    const passThreePreview = await previewAffiliateLegacyRepairRetry(passThreeInput);
    expect(passThreePreview.selectedGatewayJobIds).toEqual([childId]);
    expect(passThreePreview.rows[0]).toMatchObject({ parentPass: 2, retryPass: 3, eligible: true });
    const applied = await applyAffiliateLegacyRepairRetry({
      ...passThreeInput,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passThreePreview.reportHash,
    });
    expect(applied.writeCount).toBe(1);
    expect(applied.appliedGatewayJobIds).toHaveLength(1);
    expect(state.gatewayJobs.some((job) => (
      job.parentClaimId === 'claim-retry-softball'
      && job.dedupeKey === `legacy-sport-repair-retry:${childId}`
    ))).toBe(true);
  });
  it('holds pass-three retry when its incoming pass-two audit is deleted', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const childId = completeRetryChild(state, 'softball');
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    if (!mappingJob) throw new Error('Softball mapping job was not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const auditIndex = history.findIndex((entry) => entry.parentGatewayJobId === 'gateway-parent-softball');
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    history.splice(auditIndex, 1);
    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [childId],
    });
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.rows[0].reasonCodes).toContain('MALFORMED_PARENT_LINEAGE');
  });
  it('holds pass-three retry when the incoming audit is replaced with its hash-equivalent preview', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const childId = completeRetryChild(state, 'softball');
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    if (!mappingJob) throw new Error('Softball mapping job was not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const audit = history.find((entry) => entry.parentGatewayJobId === 'gateway-parent-softball');
    if (!audit) throw new Error('Retry audit was not created.');
    audit.reportSnapshot = passTwoPreview;
    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [childId],
    });
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.rows[0].reasonCodes).toContain('MALFORMED_PARENT_LINEAGE');
  });
  it('holds pass-three retry when an incoming audit claims the parent deployment', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const childId = completeRetryChild(state, 'softball');
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    const parentClaim = state.gatewayClaims.find((candidate) => candidate.id === 'claim-parent-softball');
    if (!mappingJob || !parentClaim) throw new Error('Softball retry rows were not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const audit = history.find((entry) => entry.parentGatewayJobId === 'gateway-parent-softball');
    if (!audit) throw new Error('Retry audit was not created.');
    const report = audit.reportSnapshot as Record<string, unknown>;
    report.deploymentContractVersion = parentClaim.deploymentContractVersion;
    report.deploymentContractHash = parentClaim.deploymentContractHash;
    const reportHash = calculateAffiliateLegacyRepairRetryReportHash(
      report as Parameters<typeof calculateAffiliateLegacyRepairRetryReportHash>[0],
    );
    report.reportHash = reportHash;
    report.reviewedReportHash = reportHash;
    audit.reportHash = reportHash;
    const preview = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [childId],
    });
    expect(preview.selectedGatewayJobIds).toEqual([]);
    expect(preview.rows[0].reasonCodes).toContain('MALFORMED_PARENT_LINEAGE');
  });
  it('holds pass-three retry when the audited child and audit co-tamper its dedupe key', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const childId = completeRetryChild(state, 'softball');
    const child = state.gatewayJobs.find((candidate) => candidate.id === childId);
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    if (!child || !mappingJob) throw new Error('Softball retry rows were not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const audit = history.find((entry) => entry.parentGatewayJobId === 'gateway-parent-softball');
    if (!audit) throw new Error('Retry audit was not created.');
    child.dedupeKey = 'co-tampered-retry-dedupe';
    audit.childDedupeKey = child.dedupeKey;
    const preview = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [childId],
    });
    expect(preview.selectedGatewayJobIds).toEqual([]);
    expect(preview.rows[0].reasonCodes).toContain('MALFORMED_PARENT_LINEAGE');
  });
  it('rejects replay and pass-three lineage when an audit names a foreign source', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    if (!mappingJob) throw new Error('Softball mapping job was not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const audit = history.find((entry) => entry.parentGatewayJobId === 'gateway-parent-softball');
    if (!audit) throw new Error('Retry audit was not created.');
    audit.sourceId = 'foreign-source';
    const gatewayJobSnapshots = state.gatewayJobs.map((job) => JSON.stringify(job));
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: state.input.gatewayJobIds,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_STATE_DRIFT' });
    expect(state.gatewayJobs.map((job) => JSON.stringify(job))).toEqual(gatewayJobSnapshots);
    const childId = completeRetryChild(state, 'softball');
    const passThree = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [childId],
    });
    expect(passThree.selectedGatewayJobIds).toEqual([]);
    expect(passThree.rows[0].reasonCodes).toContain('MALFORMED_PARENT_LINEAGE');
  });
  it('rejects replay and pass-three lineage when a report write names a foreign mapping job', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    if (!mappingJob) throw new Error('Softball mapping job was not created.');
    const summary = mappingJob.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const audit = history.find((entry) => entry.parentGatewayJobId === 'gateway-parent-softball');
    if (!audit) throw new Error('Retry audit was not created.');
    const report = audit.reportSnapshot as Record<string, unknown>;
    const writes = report.proposedWrites as Record<string, unknown>[];
    const reportWrite = writes.find((write) => write.gatewayJobId === 'gateway-parent-softball');
    if (!reportWrite) throw new Error('Softball retry report write was not created.');
    reportWrite.mappingJobId = 'foreign-mapping-job';
    const reportHash = calculateAffiliateLegacyRepairRetryReportHash(
      report as Parameters<typeof calculateAffiliateLegacyRepairRetryReportHash>[0],
    );
    report.reportHash = reportHash;
    report.reviewedReportHash = reportHash;
    audit.reportHash = reportHash;
    for (const candidate of state.mappingJobs) {
      const candidateSummary = candidate.resultSummary as Record<string, unknown>;
      const candidateHistory = candidateSummary.legacyRepairRetryHistory as Record<string, unknown>[];
      for (const candidateAudit of candidateHistory) candidateAudit.reportHash = reportHash;
    }
    const gatewayJobSnapshots = state.gatewayJobs.map((job) => JSON.stringify(job));
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: state.input.gatewayJobIds,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_STATE_DRIFT' });
    expect(state.gatewayJobs.map((job) => JSON.stringify(job))).toEqual(gatewayJobSnapshots);
    const childId = completeRetryChild(state, 'softball');
    const passThree = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [childId],
    });
    expect(passThree.selectedGatewayJobIds).toEqual([]);
    expect(passThree.rows[0].reasonCodes).toContain('MALFORMED_PARENT_LINEAGE');
  });
  it('rejects a retry chain whose ancestor resolves to a different root', async () => {
    const state = await retryFixtureWithAdmission();
    const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: passTwoPreview.reportHash,
    });
    const childId = completeRetryChild(state, 'softball');
    const child = state.gatewayJobs.find((candidate) => candidate.id === childId);
    if (!child) throw new Error('Retry child was not created.');
    child.supplySourceId = 'foreign-root';
    const subject = child.subjectJson as Record<string, unknown>;
    subject.supplySourceId = 'foreign-root';
    const childClaim = state.gatewayClaims.find((candidate) => candidate.jobId === childId);
    if (!childClaim) throw new Error('Retry child claim was not created.');
    const claimEnvelope = childClaim.claimEnvelopeJson as Record<string, unknown>;
    claimEnvelope.supplySourceId = 'foreign-root';
    (claimEnvelope.subject as Record<string, unknown>).supplySourceId = 'foreign-root';
    childClaim.claimEnvelopeHash = hashAffiliateAgentValue(claimEnvelope);
    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [childId],
    });
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.rows[0].reasonCodes).toContain('MALFORMED_PARENT_LINEAGE');
  });





});
