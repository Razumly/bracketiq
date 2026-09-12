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
  applyAffiliateLegacyRepairContinuation,
  assertAffiliateLegacyRepairScopeClaimBinding,
  calculateAffiliateLegacyRepairAdmissionReportHash,
  calculateAffiliateLegacyRepairRetryReportHash,
  calculateAffiliateLegacyRepairContinuationReportHash,
  previewAffiliateLegacyRepairAdmission,
  previewAffiliateLegacyRepairRetry,
  previewAffiliateLegacyRepairContinuation,
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
        // Capture IDs need not sort in manifest evidence-reference order.
        id: `artifact-retry-${suffix}-${kind === 'PAGE_HTML' ? 'z-html' : 'a-markdown'}`,
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
    findMany: jest.fn(async ({ select }: { select?: Record<string, boolean> } = {}) => (
      select
        ? gatewayJobs.map(row => Object.fromEntries(
          Object.entries(row).filter(([key]) => select[key] === true),
        ))
        : gatewayJobs
    )),
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
    affiliateAgentGatewayClaims: {
      findMany: jest.fn(async () => gatewayClaims),
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(gatewayClaims, where)),
    },
    affiliateAgentGatewayOperationReceipts: {
      findMany: jest.fn(async () => gatewayReceipts),
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => findByWhere(gatewayReceipts, where)),
    },
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
const admitRetryFixture = async (state: RetryFixtureState, retainAdmissionJobs = false): Promise<RetryFixtureState> => {
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
  if (retainAdmissionJobs) return state;
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
  parentClaimIdOverride?: string,
  childClaimIdOverride?: string,
  childReceiptIdOverride?: string,
  deploymentOverride?: Readonly<{ version: number; hash: string }>,
): string => {
  const parentClaimId = parentClaimIdOverride ?? `claim-parent-${suffix}`;
  const child = state.gatewayJobs.find((candidate) => (
    candidate.parentClaimId === parentClaimId
    && candidate.id !== `gateway-parent-${suffix}`
  ));
  if (!child) throw new Error(`Retry child for ${suffix} was not created.`);
  const deployment = deploymentOverride ?? {
    version: 3,
    hash: '15c37807d319b38b1c8558bfb3b1b84a16e5a85e4734aaf861d2f1259e4a7679',
  };
  const childSubject = child.subjectJson as Record<string, unknown>;
  const repairContext = childSubject.repairContext as Record<string, unknown>;
  const evidenceManifest = child.evidenceManifestJson as Record<string, unknown>;
  const evidenceEntries = Array.isArray(evidenceManifest.entries)
    ? evidenceManifest.entries.map((entry) => entry as Record<string, unknown>)
    : [];
  const citationEntry = evidenceEntries.find((entry) => entry.kind === 'PAGE_MARKDOWN');
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
  const childClaimId = childClaimIdOverride ?? `claim-retry-${suffix}`;
  const childReceiptId = childReceiptIdOverride ?? `receipt-retry-${suffix}`;
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
    deploymentContractVersion: deployment.version,
    deploymentContractHash: deployment.hash,
    ...(String(child.dedupeKey).startsWith('legacy-sport-repair-continuation:')
      ? { executionBudget: 'SINGLE_CLAIM' }
      : {}),
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
    deploymentContractVersion: deployment.version,
    deploymentContractHash: deployment.hash,
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
    deploymentContractVersion: deployment.version,
    deploymentContractHash: deployment.hash,
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

const exhaustedContinuationFixture = async () => {
  const state = await retryFixtureWithAdmission();
  const passTwoPreview = await previewAffiliateLegacyRepairRetry(state.input);
  await applyAffiliateLegacyRepairRetry({
    ...state.input,
    operatorId: 'affiliate-gateway-operator',
    expectedReportHash: passTwoPreview.reportHash,
  });
  const passTwoChildId = completeRetryChild(state, 'softball');
  const passThreeInput = { ...state.input, gatewayJobIds: [passTwoChildId] };
  const passThreePreview = await previewAffiliateLegacyRepairRetry(passThreeInput);
  await applyAffiliateLegacyRepairRetry({
    ...passThreeInput,
    operatorId: 'affiliate-gateway-operator',
    expectedReportHash: passThreePreview.reportHash,
  });
  const gatewayJobId = completeRetryChild(
    state, 'softball', 'claim-retry-softball', 'claim-retry-pass3-softball', 'receipt-retry-pass3-softball',
  );
  return { state, input: { ...state.input, gatewayJobId, reason: 'continue exhausted legacy repair' } };
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

  it.each([false, true])('replays initial admission without rewriting legacy queued subjects=%s', async (legacySubject) => {
    const state = await admitRetryFixture(retryFixture(), true);
    if (legacySubject) {
      for (const job of state.gatewayJobs) delete (job.subjectJson as Record<string, unknown>).listingKind;
    }
    const history = (state.mappingJobs[0]!.resultSummary as Record<string, unknown>).legacyRepairAdmissionHistory as Record<string, unknown>[];
    const expectedReportHash = String(history[0]!.reportHash);
    const before = JSON.stringify({ jobs: state.gatewayJobs, mappings: state.mappingJobs, roots: state.roots, artifacts: state.artifacts });
    const replay = await applyAffiliateLegacyRepairAdmission({
      prisma: state.input.prisma,
      bundle: state.input.bundle,
      jobIds: state.mappingJobs.map(job => String(job.id)),
      limit: 2,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash,
    });
    expect(replay).toMatchObject({ replayed: true, writeCount: 0 });
    expect(replay.appliedJobIds).toEqual(state.mappingJobs.map(job => String(job.id)).sort());
    expect(JSON.stringify({ jobs: state.gatewayJobs, mappings: state.mappingJobs, roots: state.roots, artifacts: state.artifacts })).toBe(before);
  });

  it.each(['SUBJECT_KIND', 'ROOT_KIND', 'QUEUE', 'LANE'])('rejects admission replay with conflicting %s', async (conflict) => {
    const state = await admitRetryFixture(retryFixture(), true);
    const queuedJob = state.gatewayJobs[0]!;
    if (conflict === 'SUBJECT_KIND') {
      (queuedJob.subjectJson as Record<string, unknown>).listingKind = 'EVENT';
    } else if (conflict === 'ROOT_KIND') {
      delete (queuedJob.subjectJson as Record<string, unknown>).listingKind;
      state.roots.find(root => root.id === queuedJob.supplySourceId)!.targetKind = 'EVENT';
    } else if (conflict === 'QUEUE') {
      queuedJob.queue = 'AFFILIATE_REVIEW';
    } else {
      queuedJob.lane = 'SUPPLY_REVIEW';
    }
    const history = (state.mappingJobs[0]!.resultSummary as Record<string, unknown>).legacyRepairAdmissionHistory as Record<string, unknown>[];
    const before = JSON.stringify(state.gatewayJobs);
    await expect(applyAffiliateLegacyRepairAdmission({
      prisma: state.input.prisma,
      bundle: state.input.bundle,
      jobIds: state.mappingJobs.map(job => String(job.id)),
      limit: 2,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: String(history[0]!.reportHash),
    })).rejects.toMatchObject({ code: 'ADMISSION_REPORT_DRIFT' });
    expect(JSON.stringify(state.gatewayJobs)).toBe(before);
  });

  it('does not admit an unsupported stored source kind using an intake fallback', async () => {
    const { input, source } = fixture();
    source.targetKind = 'TEAM';
    const preview = await previewAffiliateLegacyRepairAdmission(input);
    expect(preview.selectedJobIds).toEqual([]);
    expect(preview.rows[0].reasonCodes).toContain('SOURCE_LISTING_KIND_INVALID');
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
  it('rejects a current producer envelope without listing kind as historical evidence', async () => {
    const state = retryFixture();
    const parentJob = state.gatewayJobs.find((job) => job.id === 'gateway-parent-boomtown');
    const parentClaim = state.gatewayClaims.find((claim) => claim.id === 'claim-parent-boomtown');
    if (!parentJob || !parentClaim) throw new Error('Boomtown parent claim fixture was not created.');
    const roleContract = AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER;
    const promptTemplate = AFFILIATE_AGENT_PROMPT_TEMPLATES.MAPPING_PRODUCER;
    const claimEnvelope = parentClaim.claimEnvelopeJson as Record<string, unknown>;
    claimEnvelope.roleContractVersion = roleContract.version;
    claimEnvelope.roleContractHash = roleContract.hash;
    claimEnvelope.promptTemplateVersion = promptTemplate.version;
    claimEnvelope.promptTemplateHash = promptTemplate.hash;
    parentClaim.roleContractVersion = roleContract.version;
    parentClaim.roleContractHash = roleContract.hash;
    parentClaim.promptTemplateVersion = promptTemplate.version;
    parentClaim.promptTemplateHash = promptTemplate.hash;
    parentClaim.claimEnvelopeHash = hashAffiliateAgentValue(claimEnvelope);
    const terminalResult = parentJob.resultJson as Record<string, unknown>;
    terminalResult.roleContractVersion = roleContract.version;
    terminalResult.roleContractHash = roleContract.hash;
    terminalResult.promptTemplateVersion = promptTemplate.version;
    terminalResult.promptTemplateHash = promptTemplate.hash;
    parentJob.resultHash = hashAffiliateAgentValue(terminalResult);

    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: ['gateway-parent-boomtown'],
    });
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.rows[0].eligible).toBe(false);
    expect(report.rows[0].reasonCodes).toContain('PARENT_CLAIM_ENVELOPE_INVALID');
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
  it('replays a recorded version-one retry without adding fields to its history', async () => {
    const state = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(state.input);
    const applied = await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    const historical = structuredClone(applied);
    historical.schemaVersion = 1;
    for (const write of historical.proposedWrites) delete write.listingKind;
    for (const row of historical.rows) if (row.write) delete row.write.listingKind;
    historical.reportHash = calculateAffiliateLegacyRepairRetryReportHash(historical);
    historical.reviewedReportHash = historical.reportHash;
    for (const child of state.gatewayJobs.filter((job) => applied.appliedGatewayJobIds.includes(String(job.id)))) {
      delete (child.subjectJson as Record<string, unknown>).listingKind;
    }
    for (const job of state.mappingJobs) {
      const history = (job.resultSummary as Record<string, unknown>).legacyRepairRetryHistory as Record<string, unknown>[];
      for (const audit of history) {
        audit.schemaVersion = 1;
        audit.reportHash = historical.reportHash;
        audit.reportSnapshot = structuredClone(historical);
      }
    }
    const before = JSON.stringify({
      jobs: state.gatewayJobs,
      claims: state.gatewayClaims,
      receipts: state.gatewayReceipts,
      mappingJobs: state.mappingJobs,
    });
    const replay = await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: historical.reportHash,
    });
    expect(replay).toMatchObject({
      schemaVersion: 1,
      replayed: true,
      writeCount: 0,
      appliedGatewayJobIds: applied.appliedGatewayJobIds,
    });
    expect(JSON.stringify({
      jobs: state.gatewayJobs,
      claims: state.gatewayClaims,
      receipts: state.gatewayReceipts,
      mappingJobs: state.mappingJobs,
    })).toBe(before);
  });

  it('rejects a current retry whose audited listing kind is removed', async () => {
    const state = await retryFixtureWithAdmission();
    const preview = await previewAffiliateLegacyRepairRetry(state.input);
    const applied = await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    const child = state.gatewayJobs.find((job) => job.id === applied.appliedGatewayJobIds[0]);
    if (!child) throw new Error('Retry child was not created.');
    delete (child.subjectJson as Record<string, unknown>).listingKind;
    await expect(applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'RETRY_STATE_DRIFT' });
  });

  it('accepts a modern parent claim kind when its queued subject omits the enriched kind', async () => {
    const state = await retryFixtureWithAdmission();
    const parent = state.gatewayJobs.find((candidate) => candidate.id === 'gateway-parent-softball');
    const claim = state.gatewayClaims.find((candidate) => candidate.id === 'claim-parent-softball');
    if (!parent || !claim) throw new Error('Softball parent records were not created.');
    const parentSubject = parent.subjectJson as Record<string, unknown>;
    const parentContext = parentSubject.repairContext as Record<string, unknown>;
    const parentManifest = parent.evidenceManifestJson as Record<string, unknown>;
    const parentEntries = Array.isArray(parentManifest.entries)
      ? parentManifest.entries.map((entry) => entry as Record<string, unknown>)
      : [];
    const citationEntry = parentEntries.find((entry) => entry.kind === 'PAGE_MARKDOWN');
    if (!citationEntry) throw new Error('Softball parent evidence manifest is empty.');
    const parentResult = parent.resultJson as Record<string, unknown>;
    const parentPayload = parentResult.payload as Record<string, unknown>;
    const citation = {
      artifactId: String(citationEntry.artifactId),
      artifactSha256: String(citationEntry.sha256),
      artifactKind: String(citationEntry.kind),
      pageUrl: 'https://softball.example.test',
      excerpt: 'Grass Soccer',
    };
    parentPayload.sportEvidence = {
      evidenceRunId: parentContext.evidenceRunId,
      sportsCatalogSha256: (parentContext.sportsCatalog as Record<string, unknown>).sha256,
      sportDeterminations: [
        {
          sourceLabels: ['Dance'],
          status: 'BLACKLISTED',
          resolutionBasis: 'SOURCE_EVIDENCE',
          canonicalSportNames: [],
          rationale: 'The source activity is on the affiliate Dance blacklist.',
          evidence: [{ ...citation }],
        },
        {
          sourceLabels: ['Grass Soccer'],
          status: 'RESOLVED',
          resolutionBasis: 'SOURCE_EVIDENCE',
          canonicalSportNames: ['Grass Soccer'],
          rationale: 'The retained source evidence identifies Grass Soccer.',
          evidence: [citation],
        },
      ],
    };
    parentResult.reasonCodes = ['SPORT_BLACKLISTED'];
    parent.resultHash = hashAffiliateAgentValue(parentResult);
    const parentReceipt = state.gatewayReceipts.find((candidate) => candidate.jobId === parent.id);
    if (!parentReceipt) throw new Error('Softball parent receipt was not created.');
    const parentResponse = parentReceipt.responseJson as Record<string, unknown>;
    parentResponse.resultHash = parent.resultHash;
    parentReceipt.responseHash = hashAffiliateAgentValue(parentResponse);
    const claimEnvelope = claim.claimEnvelopeJson as Record<string, unknown>;
    claimEnvelope.subject = {
      ...(claimEnvelope.subject as Record<string, unknown>),
      listingKind: 'CLUB',
    };
    claimEnvelope.roleContractVersion = 8;
    claim.roleContractVersion = 8;
    claimEnvelope.promptTemplateVersion = 8;
    claim.promptTemplateVersion = 8;
    parentResult.roleContractVersion = 8;
    parentResult.promptTemplateVersion = 8;
    claim.claimEnvelopeHash = hashAffiliateAgentValue(claimEnvelope);
    parent.resultHash = hashAffiliateAgentValue(parentResult);
    parentResponse.resultHash = parent.resultHash;
    parentReceipt.responseHash = hashAffiliateAgentValue(parentResponse);
    expect(parentSubject.listingKind).toBeUndefined();
    const report = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [parent.id],
    });
    expect(report.selectedGatewayJobIds).toEqual([parent.id]);
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
        listingKind: 'CLUB',
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
  it('continues an exhausted pass-three parent with one producer and replays without writes', async () => {
    const { state, input: continuationInput } = await exhaustedContinuationFixture();
    const passThreeChildId = continuationInput.gatewayJobId;
    const preview = await previewAffiliateLegacyRepairContinuation(continuationInput);
    expect(preview.operation).toBe('LEGACY_SPORT_REPAIR_CONTINUATION');
    expect(preview.counts).toEqual({
      total: 1,
      eligible: 1,
      held: 0,
      selected: 1,
      alreadyContinued: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      gatewayJobId: passThreeChildId,
      parentPass: 3,
      continuationPass: 3,
      producerDedupeKey: 'legacy-sport-repair-continuation:root-retry-softball',
      eligible: true,
    });
    expect(calculateAffiliateLegacyRepairContinuationReportHash(preview)).toBe(preview.reportHash);

    const applied = await applyAffiliateLegacyRepairContinuation({
      ...continuationInput,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    expect(applied.writeCount).toBe(1);
    expect(applied.replayed).toBe(false);
    expect(applied.appliedGatewayJobIds).toHaveLength(1);
    expect(applied.childGatewayJobId).toBe(applied.appliedGatewayJobIds[0]);
    const continuationHistoryBeforeReplay = (
      state.mappingJobs.find((job) => job.id === 'mapping-retry-softball')
        ?.resultSummary as Record<string, unknown>
    ).legacyRepairContinuationHistory as readonly unknown[];
    expect(continuationHistoryBeforeReplay).toHaveLength(1);
    expect(state.gatewayJobs.filter((job) => (
      job.dedupeKey === 'legacy-sport-repair-continuation:root-retry-softball'
    ))).toHaveLength(1);

    const mappingJob = state.mappingJobs.find((job) => job.id === 'mapping-retry-softball')!;
    const source = state.sources.find((row) => row.id === mappingJob.sourceId)!;
    const previousMapping = state.mappings.find((row) => row.id === mappingJob.mappingId)!;
    const nextMapping = { ...previousMapping, id: 'softball-continuation-mapping-v2', version: 2 };
    state.mappings.push(nextMapping);
    mappingJob.mappingId = nextMapping.id;
    source.activeMappingId = nextMapping.id;
    state.roots.find((root) => root.id === 'root-retry-softball')!.lifecycleGeneration = 2;
    const replay = await applyAffiliateLegacyRepairContinuation({
      ...continuationInput,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.writeCount).toBe(0);
    expect(replay.childGatewayJobId).toBe(applied.childGatewayJobId);
    const continuationHistoryAfterReplay = (
      state.mappingJobs.find((job) => job.id === 'mapping-retry-softball')
        ?.resultSummary as Record<string, unknown>
    ).legacyRepairContinuationHistory as readonly unknown[];
    expect(continuationHistoryAfterReplay).toHaveLength(1);
  });

  it('holds continuation when the current HTML artifact is missing despite retained Markdown sport citation', async () => {
    const { state, input } = await exhaustedContinuationFixture();
    const htmlArtifacts = state.artifacts.filter((artifact) => (
      artifact.intakeId === 'intake-retry-softball' && artifact.kind === 'PAGE_HTML'
    ));
    expect(htmlArtifacts).toHaveLength(1);
    const htmlIndex = state.artifacts.indexOf(htmlArtifacts[0]!);
    state.artifacts.splice(htmlIndex, 1);

    const report = await previewAffiliateLegacyRepairContinuation(input);
    expect(report.rows[0]).toMatchObject({
      gatewayJobId: input.gatewayJobId,
      eligible: false,
    });
    expect(report.rows[0]?.reasonCodes).toContain('MISSING_PAGE_HTML');
    expect(report.selectedGatewayJobIds).toEqual([]);
    expect(report.writeCount).toBe(0);
  });

  it('rejects stale continuation authorization and preserves prior attempts', async () => {
    const { state, input } = await exhaustedContinuationFixture();
    const before = JSON.stringify({ jobs: state.gatewayJobs, claims: state.gatewayClaims, receipts: state.gatewayReceipts });
    const preview = await previewAffiliateLegacyRepairContinuation(input);
    expect(JSON.stringify({ jobs: state.gatewayJobs, claims: state.gatewayClaims, receipts: state.gatewayReceipts })).toBe(before);
    await expect(applyAffiliateLegacyRepairContinuation({
      ...input,
      reason: 'different authorization reason',
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'ADMISSION_REPORT_DRIFT' });
    expect(JSON.stringify({ jobs: state.gatewayJobs, claims: state.gatewayClaims, receipts: state.gatewayReceipts })).toBe(before);
  });

  it('rejects a tampered continuation claim limit even with a recomputed report hash', async () => {
    const { state, input } = await exhaustedContinuationFixture();
    const preview = await previewAffiliateLegacyRepairContinuation(input);
    await applyAffiliateLegacyRepairContinuation({
      ...input, operatorId: 'affiliate-gateway-operator', expectedReportHash: preview.reportHash,
    });
    const mappingJob = state.mappingJobs.find((job) => job.id === 'mapping-retry-softball')!;
    const history = (mappingJob.resultSummary as Record<string, unknown>).legacyRepairContinuationHistory as Record<string, unknown>[];
    const audit = history[0]!;
    const report = audit.reportSnapshot as Record<string, unknown>;
    report.limits = { producerClaims: 2, reviewerClaims: 1 };
    audit.limits = report.limits;
    const changedHash = calculateAffiliateLegacyRepairContinuationReportHash(
      report as Parameters<typeof calculateAffiliateLegacyRepairContinuationReportHash>[0],
    );
    report.reportHash = changedHash;
    report.reviewedReportHash = changedHash;
    audit.reportHash = changedHash;
    const before = JSON.stringify(state.gatewayJobs);
    await expect(applyAffiliateLegacyRepairContinuation({
      ...input, operatorId: 'affiliate-gateway-operator', expectedReportHash: changedHash,
    })).rejects.toMatchObject({ code: 'CONTINUATION_STATE_DRIFT' });
    expect(JSON.stringify(state.gatewayJobs)).toBe(before);
  });

  it('rejects continuation replay when only the persisted audit limits drift', async () => {
    const { state, input } = await exhaustedContinuationFixture();
    const preview = await previewAffiliateLegacyRepairContinuation(input);
    await applyAffiliateLegacyRepairContinuation({
      ...input, operatorId: 'affiliate-gateway-operator', expectedReportHash: preview.reportHash,
    });
    const mappingJob = state.mappingJobs.find((job) => job.id === 'mapping-retry-softball')!;
    const history = (mappingJob.resultSummary as Record<string, unknown>).legacyRepairContinuationHistory as Record<string, unknown>[];
    history[0]!.limits = { producerClaims: 2, reviewerClaims: 1 };
    const before = JSON.stringify({
      jobs: state.gatewayJobs,
      mappingJobs: state.mappingJobs,
    });

    await expect(applyAffiliateLegacyRepairContinuation({
      ...input, operatorId: 'affiliate-gateway-operator', expectedReportHash: preview.reportHash,
    })).rejects.toMatchObject({ code: 'CONTINUATION_STATE_DRIFT' });
    expect(JSON.stringify({ jobs: state.gatewayJobs, mappingJobs: state.mappingJobs })).toBe(before);
  });

  it('does not authorize a continuation of the one-time continuation', async () => {
    const { state, input } = await exhaustedContinuationFixture();
    const preview = await previewAffiliateLegacyRepairContinuation(input);
    await applyAffiliateLegacyRepairContinuation({
      ...input, operatorId: 'affiliate-gateway-operator', expectedReportHash: preview.reportHash,
    });
    const childId = completeRetryChild(
      state, 'softball', 'claim-retry-pass3-softball', 'claim-continuation-softball', 'receipt-continuation-softball',
      input.bundle.deploymentContract,
    );
    const before = JSON.stringify(state.gatewayJobs);
    const { hash: _oldHash, ...deploymentPreimage } = input.bundle.deploymentContract;
    const nextDeployment = { ...deploymentPreimage, version: deploymentPreimage.version + 1 };
    const denied = await previewAffiliateLegacyRepairContinuation({
      ...input,
      gatewayJobId: childId,
      bundle: {
        ...input.bundle,
        deploymentContract: { ...nextDeployment, hash: hashAffiliateAgentValue(nextDeployment) },
      },
    });
    expect(denied.row.eligible).toBe(false);
    expect(denied.selectedGatewayJobIds).toEqual([]);
    expect(denied.writeCount).toBe(0);
    expect(JSON.stringify(state.gatewayJobs)).toBe(before);
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





  it('requires one parent Gateway job for a source sport scope', async () => {
    const state = await retryFixtureWithAdmission();
    await expect(previewAffiliateLegacyRepairRetry({
      ...state.input,
      excludedSourceLabels: ['Dance'],
      operatorId: 'tph-operator',
    })).rejects.toMatchObject({ code: 'SOURCE_SCOPE_PARENT_COUNT_INVALID' });
  });

  it('binds a new source sport scope to verified non-resolved evidence and the retry report', async () => {
    const state = await retryFixtureWithAdmission();
    const initialPreview = await previewAffiliateLegacyRepairRetry(state.input);
    await applyAffiliateLegacyRepairRetry({
      ...state.input,
      operatorId: 'affiliate-gateway-operator',
      expectedReportHash: initialPreview.reportHash,
    });
    const parentId = completeRetryChild(state, 'softball');
    const parent = state.gatewayJobs.find((candidate) => candidate.id === parentId);
    if (!parent) throw new Error('Pass-two retry parent was not created.');
    const parentResult = parent.resultJson as Record<string, unknown>;
    const parentPayload = parentResult.payload as Record<string, unknown>;
    const sportEvidence = parentPayload.sportEvidence as Record<string, unknown>;
    const determinations = sportEvidence.sportDeterminations as Record<string, unknown>[];
    const resolved = determinations[0];
    if (!resolved) throw new Error('The retry fixture has no resolved sport determination.');
    const evidence = resolved.evidence as Record<string, unknown>[];
    const blacklisted = {
      ...resolved,
      sourceLabels: ['Dance'],
      status: 'BLACKLISTED',
      resolutionBasis: 'SOURCE_EVIDENCE',
      canonicalSportNames: [],
      rationale: 'The source activity is on the affiliate Dance blacklist.',
      evidence: evidence.map((citation) => ({ ...citation })),
    };
    const unsupported = {
      ...resolved,
      sourceLabels: ['Martial Arts'],
      status: 'UNSUPPORTED',
      resolutionBasis: 'SOURCE_EVIDENCE',
      canonicalSportNames: [],
      rationale: 'The source activity is outside the retained catalog.',
      evidence: evidence.map((citation) => ({ ...citation })),
    };
    determinations.splice(0, determinations.length, blacklisted, resolved, unsupported);
    const reasonCodes = parentResult.reasonCodes as string[];
    reasonCodes.splice(0, reasonCodes.length, 'SPORT_BLACKLISTED', 'SPORT_NOT_IN_CATALOG');
    parent.resultHash = hashAffiliateAgentValue(parentResult);
    const parentReceipt = state.gatewayReceipts.find((candidate) => candidate.jobId === parentId);
    if (!parentReceipt) throw new Error('Pass-two retry receipt was not created.');
    const receiptResponse = parentReceipt.responseJson as Record<string, unknown>;
    receiptResponse.resultHash = parent.resultHash;
    parentReceipt.responseHash = hashAffiliateAgentValue(receiptResponse);
    const historicalRetryMappingJob = state.mappingJobs.find(
      (candidate) => candidate.id === 'mapping-retry-softball',
    );
    const historicalRetryHistory = (
      historicalRetryMappingJob?.resultSummary as Record<string, unknown>
    ).legacyRepairRetryHistory as Record<string, unknown>[];
    const historicalRetryAudit = historicalRetryHistory.find((candidate) => (
      candidate.parentGatewayJobId === 'gateway-parent-softball'
      && candidate.childGatewayJobId === parentId
    ));
    if (!historicalRetryAudit) throw new Error('Historical retry audit was not created.');
    delete historicalRetryAudit.currentDeploymentContractVersion;
    delete historicalRetryAudit.currentDeploymentContractHash;

    const unscopedPreview = await previewAffiliateLegacyRepairRetry({
      ...state.input,
      gatewayJobIds: [parentId],
    });
    const scopedInput = {
      ...state.input,
      gatewayJobIds: [parentId],
      reason: 'authorize the TPH source sport scope',
      excludedSourceLabels: ['Dance', 'Martial Arts'],
      operatorId: 'tph-operator',
    };
    const scopedPreview = await previewAffiliateLegacyRepairRetry(scopedInput);
    const scopedRow = scopedPreview.rows[0];
    expect(scopedPreview.reportHash).not.toBe(unscopedPreview.reportHash);
    expect(scopedPreview.selectedGatewayJobIds).toEqual([parentId]);
    expect(scopedRow?.sourceSportScope).toMatchObject({
      supplySourceId: parent.supplySourceId,
      parentGatewayJobId: parentId,
      parentResultHash: parent.resultHash,
      excludedSourceLabels: ['Dance', 'Martial Arts'],
      operatorId: 'tph-operator',
      reason: scopedInput.reason,
    });
    const scope = scopedRow?.sourceSportScope;
    if (!scope) throw new Error('The scoped retry row did not include source scope.');
    const { hash: scopeHash, ...scopePreimage } = scope;
    expect(scopeHash).toBe(hashAffiliateAgentValue(scopePreimage));

    const applied = await applyAffiliateLegacyRepairRetry({
      ...scopedInput,
      expectedReportHash: scopedPreview.reportHash,
    });
    expect(applied.appliedGatewayJobIds).toHaveLength(1);
    const child = state.gatewayJobs.find((candidate) => (
      candidate.id === applied.appliedGatewayJobIds[0]
    ));
    expect((child?.subjectJson as Record<string, unknown>).repairContext).toMatchObject({
      sourceSportScope: scope,
    });
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    const summary = mappingJob?.resultSummary as Record<string, unknown>;
    const history = summary.legacyRepairRetryHistory as Record<string, unknown>[];
    const audit = history.find((entry) => entry.childGatewayJobId === child?.id);
    expect(audit?.sourceSportScope).toEqual(scope);
    expect((audit?.repairContext as Record<string, unknown>).sourceSportScope).toEqual(scope);
    if (!child) throw new Error('Scoped retry child was not created.');
    const completedChildId = completeRetryChild(
      state,
      'softball',
      'claim-retry-softball',
      'claim-scoped-retry-softball',
      'receipt-scoped-retry-softball',
    );
    expect(completedChildId).toBe(child.id);
    const childClaim = state.gatewayClaims.find((candidate) => candidate.jobId === child.id);
    if (!childClaim) throw new Error('Scoped retry child claim was not created.');
    const claimEnvelope = childClaim.claimEnvelopeJson;
    const childClaimIndex = state.gatewayClaims.indexOf(childClaim);
    const childReceiptIndex = state.gatewayReceipts.findIndex((candidate) => candidate.jobId === child.id);
    state.gatewayClaims.splice(childClaimIndex, 1);
    if (childReceiptIndex >= 0) state.gatewayReceipts.splice(childReceiptIndex, 1);
    Object.assign(child, {
      status: 'QUEUED',
      activeClaimId: null,
      claimGeneration: 0,
      terminalDisposition: null,
      resultHash: null,
      resultJson: null,
      terminalReceiptId: null,
      finishedAt: null,
    });
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: child,
      claim: claimEnvelope,
    })).resolves.toBeUndefined();
    const committedParentResult = parent.resultJson as Record<string, unknown>;
    committedParentResult.disposition = 'PACKAGE_COMMITTED';
    parent.terminalDisposition = 'PACKAGE_COMMITTED';
    parent.resultHash = hashAffiliateAgentValue(committedParentResult);
    const committedParentReceipt = state.gatewayReceipts.find(
      (candidate) => candidate.jobId === parent.id,
    );
    if (!committedParentReceipt) throw new Error('Scoped retry parent receipt was not created.');
    const committedParentResponse = committedParentReceipt.responseJson as Record<string, unknown>;
    committedParentResponse.resultHash = parent.resultHash;
    committedParentResponse.disposition = 'PACKAGE_COMMITTED';
    committedParentReceipt.responseHash = hashAffiliateAgentValue(committedParentResponse);
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: child,
      claim: claimEnvelope,
    })).rejects.toThrow('ancestry is not immutable');
  });
  it('inherits an existing source sport scope across a retry with a new audit actor and reason', async () => {
    const state = await retryFixtureWithAdmission();
    const initialParent = state.gatewayJobs.find((candidate) => candidate.id === 'gateway-parent-softball');
    if (!initialParent) throw new Error('Initial softball parent was not created.');
    const initialResult = initialParent.resultJson as Record<string, unknown>;
    const initialPayload = initialResult.payload as Record<string, unknown>;
    const initialSubject = initialParent.subjectJson as Record<string, unknown>;
    const initialContext = initialSubject.repairContext as Record<string, unknown>;
    const initialManifest = initialParent.evidenceManifestJson as Record<string, unknown>;
    const initialEntries = Array.isArray(initialManifest.entries)
      ? initialManifest.entries.map((entry) => entry as Record<string, unknown>)
      : [];
    const initialCitationEntry = initialEntries.find((entry) => entry.kind === 'PAGE_MARKDOWN');
    if (!initialCitationEntry) throw new Error('Initial softball evidence manifest is empty.');
    const resolved = {
      sourceLabels: ['Grass Soccer'],
      status: 'RESOLVED' as const,
      resolutionBasis: 'SOURCE_EVIDENCE' as const,
      canonicalSportNames: ['Grass Soccer'],
      rationale: 'The retained source evidence identifies Grass Soccer.',
      evidence: [{
        artifactId: String(initialCitationEntry.artifactId),
        artifactSha256: String(initialCitationEntry.sha256),
        artifactKind: String(initialCitationEntry.kind) as 'PAGE_HTML' | 'PAGE_MARKDOWN',
        pageUrl: 'https://softball.example.test',
        excerpt: 'Grass Soccer',
      }],
    };
    const initialEvidence = {
      evidenceRunId: String(initialContext.evidenceRunId),
      sportsCatalogSha256: String((initialContext.sportsCatalog as Record<string, unknown>).sha256),
      sportDeterminations: [
        {
          ...resolved,
          sourceLabels: ['Dance'],
          status: 'BLACKLISTED' as const,
          canonicalSportNames: [],
          rationale: 'The source activity is on the affiliate Dance blacklist.',
          evidence: resolved.evidence.map((citation) => ({ ...citation })),
        },
        resolved,
      ],
    };
    initialPayload.sportEvidence = initialEvidence;
    (initialResult.reasonCodes as string[]).splice(
      0,
      (initialResult.reasonCodes as string[]).length,
      'SPORT_BLACKLISTED',
    );
    initialParent.resultHash = hashAffiliateAgentValue(initialResult);
    const initialReceipt = state.gatewayReceipts.find((candidate) => candidate.jobId === initialParent.id);
    if (!initialReceipt) throw new Error('Initial softball receipt was not created.');
    const initialResponse = initialReceipt.responseJson as Record<string, unknown>;
    initialResponse.resultHash = initialParent.resultHash;
    initialReceipt.responseHash = hashAffiliateAgentValue(initialResponse);

    const firstScopeInput = {
      ...state.input,
      gatewayJobIds: [initialParent.id],
      reason: 'Authorize the original source sport scope.',
      excludedSourceLabels: ['Dance'],
      operatorId: 'original-scope-operator',
    };
    const firstPreview = await previewAffiliateLegacyRepairRetry(firstScopeInput);
    await applyAffiliateLegacyRepairRetry({
      ...firstScopeInput,
      expectedReportHash: firstPreview.reportHash,
    });
    const firstChildId = completeRetryChild(
      state,
      'softball',
      undefined,
      'claim-original-scope-retry-softball',
      'receipt-original-scope-retry-softball',
    );
    const firstChild = state.gatewayJobs.find((candidate) => candidate.id === firstChildId);
    if (!firstChild) throw new Error('Original scoped retry child was not created.');
    const firstChildSubject = firstChild.subjectJson as Record<string, unknown>;
    const firstChildContext = firstChildSubject.repairContext as Record<string, unknown>;
    const originalScope = firstChildContext.sourceSportScope;
    if (!originalScope) throw new Error('Original source sport scope was not retained.');

    const inheritedInput = {
      ...state.input,
      gatewayJobIds: [firstChildId],
      reason: 'Retry the inherited source scope with a different current reason.',
      excludedSourceLabels: ['Dance'],
      operatorId: 'different-current-operator',
    };
    const inheritedPreview = await previewAffiliateLegacyRepairRetry(inheritedInput);
    expect(inheritedPreview.selectedGatewayJobIds).toEqual([firstChildId]);
    expect(inheritedPreview.rows[0]?.sourceSportScope).toEqual(originalScope);
    await applyAffiliateLegacyRepairRetry({
      ...inheritedInput,
      expectedReportHash: inheritedPreview.reportHash,
    });
    const inheritedChildId = completeRetryChild(
      state,
      'softball',
      'claim-original-scope-retry-softball',
      'claim-inherited-scope-retry-softball',
      'receipt-inherited-scope-retry-softball',
    );
    const inheritedChild = state.gatewayJobs.find((candidate) => candidate.id === inheritedChildId);
    if (!inheritedChild) throw new Error('Inherited scoped retry child was not created.');
    const inheritedSubject = inheritedChild.subjectJson as Record<string, unknown>;
    expect((inheritedSubject.repairContext as Record<string, unknown>).sourceSportScope)
      .toEqual(originalScope);
    const mappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    const history = (mappingJob?.resultSummary as Record<string, unknown>)
      .legacyRepairRetryHistory as Record<string, unknown>[];
    const inheritedAudit = history.find((entry) => entry.childGatewayJobId === inheritedChildId);
    expect(inheritedAudit).toMatchObject({
      operatorId: inheritedInput.operatorId,
      reason: inheritedInput.reason,
      sourceSportScope: originalScope,
    });

    const inheritedClaim = state.gatewayClaims.find((candidate) => candidate.jobId === inheritedChildId);
    if (!inheritedClaim) throw new Error('Inherited scoped retry claim was not created.');
    const inheritedClaimEnvelope = inheritedClaim.claimEnvelopeJson;
    const inheritedClaimIndex = state.gatewayClaims.indexOf(inheritedClaim);
    const inheritedReceiptIndex = state.gatewayReceipts.findIndex(
      (candidate) => candidate.jobId === inheritedChildId,
    );
    state.gatewayClaims.splice(inheritedClaimIndex, 1);
    if (inheritedReceiptIndex >= 0) state.gatewayReceipts.splice(inheritedReceiptIndex, 1);
    Object.assign(inheritedChild, {
      status: 'QUEUED',
      activeClaimId: null,
      claimGeneration: 0,
      terminalDisposition: null,
      resultHash: null,
      resultJson: null,
      terminalReceiptId: null,
      finishedAt: null,
    });
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: inheritedChild,
      claim: inheritedClaimEnvelope,
    })).resolves.toBeUndefined();
    const producerClaim = state.gatewayClaims.find((candidate) => candidate.jobId === firstChildId);
    const producerReceipt = state.gatewayReceipts.find((candidate) => candidate.jobId === firstChildId);
    if (!producerClaim || !producerReceipt) throw new Error('Scoped producer records were not created.');
    const packageHash = 'a'.repeat(64);
    const producerResult = firstChild.resultJson as Record<string, unknown>;
    producerResult.disposition = 'PACKAGE_COMMITTED';
    producerResult.reasonCodes = [];
    producerResult.payload = {
      packageHash,
      commitReceiptId: 'scoped-reviewer-package-commit',
    };
    producerResult.summary = 'The scoped producer committed the package for reviewer repair.';
    firstChild.terminalDisposition = 'PACKAGE_COMMITTED';
    firstChild.resultHash = hashAffiliateAgentValue(producerResult);
    const producerResponse = producerReceipt.responseJson as Record<string, unknown>;
    producerResponse.resultHash = firstChild.resultHash;
    producerResponse.disposition = 'PACKAGE_COMMITTED';
    producerReceipt.responseHash = hashAffiliateAgentValue(producerResponse);
    const deploymentContract = state.input.bundle.deploymentContract;
    const reviewerRole = AFFILIATE_AGENT_ROLE_CONTRACTS.SUPPLY_REVIEWER;
    const reviewerPrompt = AFFILIATE_AGENT_PROMPT_TEMPLATES.SUPPLY_REVIEWER;
    const producerManifest = firstChild.evidenceManifestJson;
    const producerManifestRecord = producerManifest as Record<string, unknown>;
    const reviewerJobId = 'gateway-scoped-reviewer-softball';
    const reviewerClaimId = 'claim-scoped-reviewer-softball';
    const reviewerReceiptId = 'receipt-scoped-reviewer-softball';
    const reviewerSubject = {
      type: 'SUPPLY_REVIEWER' as const,
      supplySourceId: firstChild.supplySourceId,
      producerClaimId: producerClaim.id,
      producerWorkerId: producerClaim.workerId,
      producerInvocationId: producerClaim.invocationId,
      producerWorkspaceId: producerClaim.workspaceId,
      committedPackageHash: packageHash,
      targetId: 'scoped-reviewer-target',
      targetType: 'EVENT' as const,
      reviewPass: 1,
      repairContext: firstChildContext,
    };
    const reviewerEnvelope = {
      schemaVersion: 1 as const,
      role: 'SUPPLY_REVIEWER' as const,
      queue: 'AFFILIATE_REVIEW' as const,
      lane: 'SUPPLY_REVIEW' as const,
      jobId: reviewerJobId,
      claimId: reviewerClaimId,
      supplySourceId: firstChild.supplySourceId,
      claimGeneration: 1,
      lifecycleGeneration: producerClaim.lifecycleGeneration,
      deploymentContractVersion: deploymentContract.version,
      deploymentContractHash: deploymentContract.hash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      roleContractVersion: reviewerRole.version,
      roleContractHash: reviewerRole.hash,
      promptTemplateVersion: reviewerPrompt.version,
      promptTemplateHash: reviewerPrompt.hash,
      executionClass: 'PRODUCTION_OMP' as const,
      workerId: 'scoped-reviewer-worker',
      invocationId: 'scoped-reviewer-invocation',
      workspaceId: 'scoped-reviewer-workspace',
      claimedAt: '2026-08-20T00:10:00.000Z',
      expiresAt: '2026-08-20T00:30:00.000Z',
      evidenceManifest: producerManifest,
      permittedCommands: reviewerRole.permittedCommands,
      subject: reviewerSubject,
    };
    const reviewerResult = {
      schemaVersion: 1 as const,
      jobId: reviewerJobId,
      claimId: reviewerClaimId,
      claimGeneration: 1,
      lifecycleGeneration: producerClaim.lifecycleGeneration,
      deploymentContractVersion: deploymentContract.version,
      deploymentContractHash: deploymentContract.hash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      roleContractVersion: reviewerRole.version,
      roleContractHash: reviewerRole.hash,
      promptTemplateVersion: reviewerPrompt.version,
      promptTemplateHash: reviewerPrompt.hash,
      workerId: reviewerEnvelope.workerId,
      invocationId: reviewerEnvelope.invocationId,
      role: 'SUPPLY_REVIEWER' as const,
      disposition: 'PRODUCER_REPAIR_REQUIRED' as const,
      reasonCodes: ['EVIDENCE_VERIFIED'] as const,
      evidenceRefs: (
        Array.isArray(producerManifestRecord.entries)
          ? producerManifestRecord.entries
          : []
      ).map((entry) => String((entry as Record<string, unknown>).evidenceRef)),
      summary: 'The reviewer requested a scoped producer repair.',
      payload: {
        committedPackageHash: packageHash,
        repairIssues: ['VALIDATION_FAILED'] as const,
      },
    };
    const reviewerAccepted = {
      kind: 'TERMINAL_ACCEPTED' as const,
      receiptId: reviewerReceiptId,
      resultHash: hashAffiliateAgentValue(reviewerResult),
      disposition: reviewerResult.disposition,
      completedAt: '2026-08-20T00:11:00.000Z',
    };
    const reviewerJob = {
      id: reviewerJobId,
      dedupeKey: `mapping-review:${reviewerClaimId}`,
      queue: 'AFFILIATE_REVIEW',
      lane: 'SUPPLY_REVIEW',
      role: 'SUPPLY_REVIEWER',
      subjectType: 'SUPPLY_REVIEWER',
      subjectId: firstChild.supplySourceId,
      parentClaimId: producerClaim.id,
      subjectJson: reviewerSubject,
      evidenceManifestJson: producerManifest,
      supplySourceId: firstChild.supplySourceId,
      expectedLifecycleGeneration: producerClaim.lifecycleGeneration,
      status: 'COMPLETED',
      activeClaimId: null,
      claimGeneration: 1,
      terminalDisposition: reviewerResult.disposition,
      resultHash: hashAffiliateAgentValue(reviewerResult),
      resultJson: reviewerResult,
      terminalReceiptId: reviewerReceiptId,
      finishedAt: new Date('2026-08-20T00:11:00Z'),
    };
    const reviewerClaim = {
      id: reviewerClaimId,
      jobId: reviewerJobId,
      parentClaimId: producerClaim.id,
      claimGeneration: 1,
      lifecycleGeneration: producerClaim.lifecycleGeneration,
      queue: 'AFFILIATE_REVIEW',
      lane: 'SUPPLY_REVIEW',
      role: 'SUPPLY_REVIEWER',
      workerId: reviewerEnvelope.workerId,
      invocationId: reviewerEnvelope.invocationId,
      workspaceId: reviewerEnvelope.workspaceId,
      status: 'COMPLETED',
      deploymentContractVersion: deploymentContract.version,
      deploymentContractHash: deploymentContract.hash,
      roleContractVersion: reviewerRole.version,
      roleContractHash: reviewerRole.hash,
      promptTemplateVersion: reviewerPrompt.version,
      promptTemplateHash: reviewerPrompt.hash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      claimEnvelopeHash: hashAffiliateAgentValue(reviewerEnvelope),
      claimEnvelopeJson: reviewerEnvelope,
      evidenceManifestHash: producerManifestRecord.hash,
      terminalReceiptId: reviewerReceiptId,
    };
    const reviewerReceipt = {
      id: reviewerReceiptId,
      claimId: reviewerClaimId,
      jobId: reviewerJobId,
      claimGeneration: 1,
      idempotencyKey: 'submit-scoped-reviewer-softball',
      operationKind: 'SUBMIT_RESULT',
      commandName: null,
      requestHash: 'c'.repeat(64),
      status: 'SUCCEEDED',
      responseHash: hashAffiliateAgentValue(reviewerAccepted),
      responseJson: reviewerAccepted,
      safeErrorCode: null,
      completedAt: new Date('2026-08-20T00:11:00Z'),
    };
    const targetJobId = 'gateway-scoped-reviewer-repair-softball';
    const targetClaimId = 'claim-scoped-reviewer-repair-softball';
    const targetSubject = {
      type: 'MAPPING_PRODUCER' as const,
      supplySourceId: firstChild.supplySourceId,
      mappingJobId: firstChildSubject.mappingJobId,
      listingKind: 'CLUB' as const,
      pass: 2,
      repairContext: firstChildContext,
    };
    const targetEnvelope = {
      schemaVersion: 1 as const,
      role: 'MAPPING_PRODUCER' as const,
      queue: 'AFFILIATE_MAPPING' as const,
      lane: 'MAPPING_PRODUCTION' as const,
      jobId: targetJobId,
      claimId: targetClaimId,
      supplySourceId: firstChild.supplySourceId,
      claimGeneration: 1,
      lifecycleGeneration: reviewerClaim.lifecycleGeneration,
      deploymentContractVersion: deploymentContract.version,
      deploymentContractHash: deploymentContract.hash,
      supplyContractVersion: manifest.supplyContract.version,
      supplyContractHash: manifest.supplyContract.hash,
      roleContractVersion: AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.version,
      roleContractHash: AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.hash,
      promptTemplateVersion: AFFILIATE_AGENT_PROMPT_TEMPLATES.MAPPING_PRODUCER.version,
      promptTemplateHash: AFFILIATE_AGENT_PROMPT_TEMPLATES.MAPPING_PRODUCER.hash,
      executionClass: 'PRODUCTION_OMP' as const,
      workerId: 'scoped-reviewer-repair-worker',
      invocationId: 'scoped-reviewer-repair-invocation',
      workspaceId: 'scoped-reviewer-repair-workspace',
      claimedAt: '2026-08-20T00:12:00.000Z',
      expiresAt: '2026-08-20T00:30:00.000Z',
      evidenceManifest: producerManifest,
      permittedCommands: AFFILIATE_AGENT_ROLE_CONTRACTS.MAPPING_PRODUCER.permittedCommands,
      subject: targetSubject,
    };
    const targetJob = {
      id: targetJobId,
      dedupeKey: `mapping-repair:${producerClaim.id}:${packageHash}:2`,
      queue: 'AFFILIATE_MAPPING',
      lane: 'MAPPING_PRODUCTION',
      role: 'MAPPING_PRODUCER',
      subjectType: 'MAPPING_PRODUCER',
      subjectId: firstChildSubject.mappingJobId,
      parentClaimId: reviewerClaimId,
      subjectJson: targetSubject,
      evidenceManifestJson: producerManifest,
      supplySourceId: firstChild.supplySourceId,
      expectedLifecycleGeneration: reviewerClaim.lifecycleGeneration,
      status: 'QUEUED',
      activeClaimId: null,
      claimGeneration: 0,
      terminalDisposition: null,
      resultHash: null,
      resultJson: null,
      terminalReceiptId: null,
      finishedAt: null,
    };
    state.gatewayJobs.push(reviewerJob, targetJob);
    state.gatewayClaims.push(reviewerClaim);
    state.gatewayReceipts.push(reviewerReceipt);
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: targetJob,
      claim: targetEnvelope,
    })).resolves.toBeUndefined();
  });
  it('validates an expanded source scope through each audited predecessor transition', async () => {
    const state = await retryFixtureWithAdmission();
    const initialParent = state.gatewayJobs.find((candidate) => candidate.id === 'gateway-parent-softball');
    if (!initialParent) throw new Error('Initial softball parent was not created.');
    const initialResult = initialParent.resultJson as Record<string, unknown>;
    const initialPayload = initialResult.payload as Record<string, unknown>;
    const initialSubject = initialParent.subjectJson as Record<string, unknown>;
    const initialContext = initialSubject.repairContext as Record<string, unknown>;
    const initialManifest = initialParent.evidenceManifestJson as Record<string, unknown>;
    const initialEntries = Array.isArray(initialManifest.entries)
      ? initialManifest.entries.map((entry) => entry as Record<string, unknown>)
      : [];
    const initialCitationEntry = initialEntries.find((entry) => entry.kind === 'PAGE_MARKDOWN');
    if (!initialCitationEntry) throw new Error('Initial softball evidence manifest is empty.');
    const initialResolved = {
      sourceLabels: ['Grass Soccer'],
      status: 'RESOLVED' as const,
      resolutionBasis: 'SOURCE_EVIDENCE' as const,
      canonicalSportNames: ['Grass Soccer'],
      rationale: 'The retained source evidence identifies Grass Soccer.',
      evidence: [{
        artifactId: String(initialCitationEntry.artifactId),
        artifactSha256: String(initialCitationEntry.sha256),
        artifactKind: String(initialCitationEntry.kind) as 'PAGE_HTML' | 'PAGE_MARKDOWN',
        pageUrl: 'https://softball.example.test',
        excerpt: 'Grass Soccer',
      }],
    };
    const initialEvidence = {
      evidenceRunId: String(initialContext.evidenceRunId),
      sportsCatalogSha256: String((initialContext.sportsCatalog as Record<string, unknown>).sha256),
      sportDeterminations: [initialResolved],
    };
    initialPayload.sportEvidence = initialEvidence;
    const initialDeterminations = initialEvidence.sportDeterminations as Record<string, unknown>[];
    const initialCitations = initialResolved.evidence as Record<string, unknown>[];
    initialDeterminations.splice(0, initialDeterminations.length,
      {
        ...initialResolved,
        sourceLabels: ['Dance'],
        status: 'BLACKLISTED',
        resolutionBasis: 'SOURCE_EVIDENCE',
        canonicalSportNames: [],
        rationale: 'The source activity is on the affiliate Dance blacklist.',
        evidence: initialCitations.map((citation) => ({ ...citation })),
      },
      initialResolved,
    );
    (initialResult.reasonCodes as string[]).splice(0, (initialResult.reasonCodes as string[]).length, 'SPORT_BLACKLISTED');
    initialParent.resultHash = hashAffiliateAgentValue(initialResult);
    const initialReceipt = state.gatewayReceipts.find((candidate) => candidate.jobId === initialParent.id);
    if (!initialReceipt) throw new Error('Initial softball receipt was not created.');
    const initialResponse = initialReceipt.responseJson as Record<string, unknown>;
    initialResponse.resultHash = initialParent.resultHash;
    initialReceipt.responseHash = hashAffiliateAgentValue(initialResponse);

    const firstScopeInput = {
      ...state.input,
      gatewayJobIds: [initialParent.id],
      reason: 'Authorize the first source scope transition.',
      excludedSourceLabels: ['Dance'],
      operatorId: 'tph-operator',
    };
    const firstPreview = await previewAffiliateLegacyRepairRetry(firstScopeInput);
    await applyAffiliateLegacyRepairRetry({
      ...firstScopeInput,
      expectedReportHash: firstPreview.reportHash,
    });
    const firstChildId = completeRetryChild(state, 'softball');
    const firstChild = state.gatewayJobs.find((candidate) => candidate.id === firstChildId);
    if (!firstChild) throw new Error('First scoped retry child was not created.');
    const firstResult = firstChild.resultJson as Record<string, unknown>;
    const firstPayload = firstResult.payload as Record<string, unknown>;
    const firstEvidence = firstPayload.sportEvidence as Record<string, unknown>;
    const firstDeterminations = firstEvidence.sportDeterminations as Record<string, unknown>[];
    const firstResolved = firstDeterminations[0];
    if (!firstResolved) throw new Error('First scoped sport determination was not created.');
    const firstCitations = firstResolved.evidence as Record<string, unknown>[];
    firstDeterminations.push({
      ...firstResolved,
      sourceLabels: ['Martial Arts'],
      status: 'UNSUPPORTED',
      resolutionBasis: 'SOURCE_EVIDENCE',
      canonicalSportNames: [],
      rationale: 'The source activity is outside the retained catalog.',
      evidence: firstCitations.map((citation) => ({ ...citation })),
    });
    (firstResult.reasonCodes as string[]).splice(
      0,
      (firstResult.reasonCodes as string[]).length,
      'SPORT_NOT_IN_CATALOG',
    );
    firstChild.resultHash = hashAffiliateAgentValue(firstResult);
    const firstReceipt = state.gatewayReceipts.find((candidate) => candidate.jobId === firstChild.id);
    if (!firstReceipt) throw new Error('First scoped retry receipt was not created.');
    const firstResponse = firstReceipt.responseJson as Record<string, unknown>;
    firstResponse.resultHash = firstChild.resultHash;
    firstReceipt.responseHash = hashAffiliateAgentValue(firstResponse);

    const expandedScopeInput = {
      ...state.input,
      gatewayJobIds: [firstChildId],
      reason: 'Authorize the expanded source scope transition.',
      excludedSourceLabels: ['Dance', 'Martial Arts'],
      operatorId: 'tph-operator',
    };
    const expandedPreview = await previewAffiliateLegacyRepairRetry(expandedScopeInput);
    expect(expandedPreview.selectedGatewayJobIds).toEqual([firstChildId]);
    const expandedScope = expandedPreview.rows[0]?.sourceSportScope;
    if (!expandedScope) throw new Error('Expanded source scope was not created.');
    await applyAffiliateLegacyRepairRetry({
      ...expandedScopeInput,
      expectedReportHash: expandedPreview.reportHash,
    });
    const expandedChildId = completeRetryChild(
      state,
      'softball',
      'claim-retry-softball',
      'claim-expanded-retry-softball',
      'receipt-expanded-retry-softball',
    );
    const expandedChild = state.gatewayJobs.find((candidate) => candidate.id === expandedChildId);
    const expandedClaim = state.gatewayClaims.find((candidate) => candidate.jobId === expandedChildId);
    if (!expandedChild || !expandedClaim) throw new Error('Expanded retry child claim was not created.');
    const expandedClaimEnvelope = expandedClaim.claimEnvelopeJson;
    const expandedClaimIndex = state.gatewayClaims.indexOf(expandedClaim);
    const expandedReceiptIndex = state.gatewayReceipts.findIndex(
      (candidate) => candidate.jobId === expandedChildId,
    );
    state.gatewayClaims.splice(expandedClaimIndex, 1);
    if (expandedReceiptIndex >= 0) state.gatewayReceipts.splice(expandedReceiptIndex, 1);
    Object.assign(expandedChild, {
      status: 'QUEUED',
      activeClaimId: null,
      claimGeneration: 0,
      terminalDisposition: null,
      resultHash: null,
      resultJson: null,
      terminalReceiptId: null,
      finishedAt: null,
    });
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: expandedChild,
      claim: expandedClaimEnvelope,
    })).resolves.toBeUndefined();
    const fabricatedRootClaim = state.gatewayClaims.find(
      (candidate) => candidate.jobId === initialParent.id,
    );
    if (!fabricatedRootClaim) throw new Error('Original root claim was not retained.');
    const fabricatedRootClaimEnvelope = fabricatedRootClaim.claimEnvelopeJson as Record<string, unknown>;
    const fabricatedRootSubject = fabricatedRootClaimEnvelope.subject as Record<string, unknown>;
    const originalRootPass = initialSubject.pass;
    const originalClaimRootPass = fabricatedRootSubject.pass;
    initialSubject.pass = 2;
    fabricatedRootSubject.pass = 2;
    fabricatedRootClaim.claimEnvelopeHash = hashAffiliateAgentValue(fabricatedRootClaimEnvelope);
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: expandedChild,
      claim: expandedClaimEnvelope,
    })).rejects.toThrow('original pass-one admission');
    initialSubject.pass = originalRootPass;
    fabricatedRootSubject.pass = originalClaimRootPass;
    fabricatedRootClaim.claimEnvelopeHash = hashAffiliateAgentValue(fabricatedRootClaimEnvelope);
    const expandedMappingJob = state.mappingJobs.find((candidate) => candidate.id === 'mapping-retry-softball');
    if (!expandedMappingJob) throw new Error('Expanded retry mapping job was not created.');
    const expandedSummary = expandedMappingJob.resultSummary as Record<string, unknown>;
    const expandedHistory = expandedSummary.legacyRepairRetryHistory as Record<string, unknown>[];
    const expandedAudit = expandedHistory.find((candidate) => candidate.childGatewayJobId === expandedChildId);
    if (!expandedAudit) throw new Error('Expanded retry audit was not created.');
    const expandedReport = expandedAudit.reportSnapshot as Record<string, unknown>;
    const expandedOriginalReportHash = String(expandedReport.reportHash);
    const expandedRows = expandedReport.rows as Record<string, unknown>[];
    const expandedWrites = expandedReport.proposedWrites as Record<string, unknown>[];
    const expandedRequested = expandedReport.requestedGatewayJobIds as string[];
    const expandedSelected = expandedReport.selectedGatewayJobIds as string[];
    const expandedApplied = expandedReport.appliedGatewayJobIds as string[];
    const expandedCounts = expandedReport.counts as Record<string, unknown>;
    const extraParentId = 'coerced-inherited-scope-parent';
    const extraChildId = 'coerced-inherited-scope-child';
    expandedReport.requestedGatewayJobIds = [...expandedRequested, extraParentId];
    expandedReport.selectedGatewayJobIds = [...expandedSelected, extraParentId];
    expandedReport.appliedGatewayJobIds = [...expandedApplied, extraChildId];
    expandedReport.rows = [
      ...expandedRows,
      { ...expandedRows[0], gatewayJobId: extraParentId, childGatewayJobId: extraChildId },
    ];
    expandedReport.proposedWrites = [
      ...expandedWrites,
      { ...expandedWrites[0], gatewayJobId: extraParentId },
    ];
    expandedReport.counts = {
      ...expandedCounts,
      total: 2,
      eligible: 2,
      held: 0,
      selected: 2,
      alreadyRetried: 0,
    };
    expandedReport.writeCount = 2;
    expandedReport.reportHash = calculateAffiliateLegacyRepairRetryReportHash(
      expandedReport as Parameters<typeof calculateAffiliateLegacyRepairRetryReportHash>[0],
    );
    expandedReport.reviewedReportHash = expandedReport.reportHash;
    expandedAudit.reportHash = expandedReport.reportHash;
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: expandedChild,
      claim: expandedClaimEnvelope,
    })).rejects.toThrow('source-scope report');
    expandedReport.requestedGatewayJobIds = expandedRequested;
    expandedReport.selectedGatewayJobIds = expandedSelected;
    expandedReport.appliedGatewayJobIds = expandedApplied;
    expandedReport.rows = expandedRows;
    expandedReport.proposedWrites = expandedWrites;
    expandedReport.counts = expandedCounts;
    expandedReport.writeCount = expandedWrites.length;
    expandedReport.reportHash = expandedOriginalReportHash;
    expandedReport.reviewedReportHash = expandedOriginalReportHash;
    expandedAudit.reportHash = expandedOriginalReportHash;
    const firstClaim = state.gatewayClaims.find((candidate) => candidate.jobId === firstChild.id);
    if (!firstClaim) throw new Error('First scoped retry claim was not retained.');
    const firstClaimEnvelope = firstClaim.claimEnvelopeJson as Record<string, unknown>;
    const firstClaimSubject = firstClaimEnvelope.subject as Record<string, unknown>;
    const firstClaimContext = firstClaimSubject.repairContext as Record<string, unknown>;
    const firstScope = firstClaimContext.sourceSportScope as Record<string, unknown>;
    const { hash: _firstScopeHash, ...forgedScopePreimage } = firstScope;
    const forgedScope = {
      ...forgedScopePreimage,
      operatorId: 'forged-operator',
      hash: hashAffiliateAgentValue({
        ...forgedScopePreimage,
        operatorId: 'forged-operator',
      }),
    };
    const firstJobSubject = firstChild.subjectJson as Record<string, unknown>;
    const firstJobContext = firstJobSubject.repairContext as Record<string, unknown>;
    firstJobContext.sourceSportScope = forgedScope;
    firstClaimContext.sourceSportScope = forgedScope;
    firstClaim.claimEnvelopeHash = hashAffiliateAgentValue(firstClaimEnvelope);
    await expect(assertAffiliateLegacyRepairScopeClaimBinding({
      prisma: state.input.prisma,
      job: expandedChild,
      claim: expandedClaimEnvelope,
    })).rejects.toThrow('producer edge');
  });
});
