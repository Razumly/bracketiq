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
import { buildAffiliateSupplyContractManifest } from '../affiliateSupplyLifecycle';
import {
  applyAffiliateLegacyRepairAdmission,
  previewAffiliateLegacyRepairAdmission,
  calculateAffiliateLegacyRepairAdmissionReportHash,
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
});
