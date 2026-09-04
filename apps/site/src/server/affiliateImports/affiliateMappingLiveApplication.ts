import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import {
  affiliateApprovalResultV2Schema,
  type AffiliateApprovalResultV2,
} from './approvalResult';
import {
  assertAffiliateSportCompletionReady,
  affiliateHumanSportResolutionSchema,
  affiliateSportDeterminationsSha256,
} from './affiliateSportDetermination';
import {
  loadAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import {
  affiliateSourceMatchesIntakeEvidence,
  resolveApprovedAffiliateSetupScript,
} from './affiliateMappingApproval';
import {
  codexAffiliateIngestionResultV2Schema,
  type CodexAffiliateIngestionResultV2,
} from './affiliateIngestionSchemas';
import {
  inspectAffiliateProducerPackage,
  materializeAffiliateProducerCommit,
  resolveAffiliateProducerRepositoryRoot,
} from './producerPackageEvidence';

const APPROVAL_PERMIT = Symbol('affiliate-mapping-approval-permit');
const MAX_SETUP_MS = 90 * 60 * 1000;

type JsonRecord = Record<string, unknown>;
type ApprovalGeneration = {
  approvalJobId: string;
  reviewerId: string;
  claimedAt: string;
};
type DbQuery = <T = unknown>(args: unknown) => Promise<T>;
type DbTable = Record<string, DbQuery>;
type DbClient = Record<string, unknown> & {
  $transaction: <T>(callback: (transaction: DbClient) => Promise<T>) => Promise<T>;
};
type ApprovalRow = {
  id: string;
  status: string;
  reviewerId?: string | null;
  claimedAt?: Date | string | null;
  leaseExpiresAt?: Date | string | null;
};
type MappingJobRow = {
  id: string;
  intakeId: string;
  status: string;
  sourceId?: string | null;
  mappingId?: string | null;
  legacyIdentityMigrationEligible?: boolean | null;
  resultSummary: unknown;
};
type SourceRow = {
  id: string;
  sourceKey: string;
  organizationId?: string | null;
  activeMappingId?: string | null;
  autoScrapeEnabled: boolean;
  metadata: unknown;
};
type OrganizationRow = {
  id: string;
  logoId?: string | null;
  status: string;
  publicPageEnabled: boolean;
};
type MappingRow = {
  id: string;
  sourceId: string;
  isActive: boolean;
  validatedAt?: Date | null;
};
type RunRow = { id: string; status: string };

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);
const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);
const stableHash = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');
const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const dbFor = (client: DbClient) => {
  const table = (name: string): DbTable => client[name] as unknown as DbTable;
  return {
    approvals: table('affiliateApprovalJobs'),
    mappingJobs: table('affiliateSourceMappingJobs'),
    intakes: table('affiliateSourceIntakes'),
    sources: table('affiliateScrapeSources'),
    organizations: table('organizations'),
    mappings: table('affiliateScrapeMappings'),
    runs: table('affiliateScrapeRuns'),
    candidates: table('affiliateImportCandidates'),
  };
};

export type AffiliateMappingApprovalPermit = {
  readonly [APPROVAL_PERMIT]: true;
  readonly approvalJobId: string;
  readonly mappingJobId: string;
  readonly reviewerId: string;
  readonly claimGeneration: ApprovalGeneration;
  readonly approvalResult: AffiliateApprovalResultV2;
  readonly mappingResult: CodexAffiliateIngestionResultV2;
  readonly mappingResultEnvelope: JsonRecord;
  readonly mappingResultSha256: string;
  readonly intakeId: string;
  readonly acceptMissingLogo: boolean;
};

export type AffiliateMappingApprovalEligibilityDependencies = {
  db?: unknown;
  now?: () => Date;
  loadCatalog?: (client: unknown, capturedAt?: string) => Promise<AffiliateSportsCatalogSnapshot>;
};

const assertClaimGeneration = (
  approval: ApprovalRow | null,
  generation: ApprovalGeneration,
  now: Date,
): void => {
  const claimedAt = toDate(approval?.claimedAt);
  const generationClaimedAt = toDate(generation.claimedAt);
  const leaseExpiresAt = toDate(approval?.leaseExpiresAt);
  if (!approval
    || approval.status !== 'CLAIMED'
    || approval.id !== generation.approvalJobId
    || approval.reviewerId !== generation.reviewerId
    || !claimedAt
    || !generationClaimedAt
    || claimedAt.getTime() !== generationClaimedAt.getTime()
    || !leaseExpiresAt
    || leaseExpiresAt.getTime() < now.getTime()) {
    throw new Error('Affiliate approval claim generation is stale, reclaimed, or expired.');
  }
};

/** The only constructor for the runtime-branded application permit. */
export const assertAffiliateMappingApprovalEligibility = async (
  input: {
    approvalResult: unknown;
    mappingJobId?: string;
    reviewerId?: string;
    claimGeneration?: ApprovalGeneration;
  },
  dependencies: AffiliateMappingApprovalEligibilityDependencies = {},
): Promise<AffiliateMappingApprovalPermit> => {
  const approvalResult = affiliateApprovalResultV2Schema.parse(input.approvalResult);
  if (approvalResult.subjectType !== 'MAPPING_PACKAGE' || approvalResult.decision !== 'APPROVE') {
    throw new Error('Live mapping application requires a schema-version-2 mapping APPROVE result.');
  }
  const generation = approvalResult.claimGeneration;
  if (input.mappingJobId && input.mappingJobId !== approvalResult.subjectKey) {
    throw new Error('Approval application mapping job does not match the result subject.');
  }
  if (input.reviewerId && input.reviewerId !== approvalResult.reviewerId) {
    throw new Error('Approval application reviewer does not match the result.');
  }
  if (input.claimGeneration && JSON.stringify(input.claimGeneration) !== JSON.stringify(generation)) {
    throw new Error('Approval application claim generation does not match the result.');
  }
  const client = (dependencies.db ?? prisma) as unknown as DbClient;
  const tables = dbFor(client);
  const [approval, mappingJob] = await Promise.all([
    tables.approvals.findUnique<ApprovalRow>({ where: { id: generation.approvalJobId } }),
    tables.mappingJobs.findUnique<MappingJobRow>({ where: { id: approvalResult.subjectKey } }),
  ]);
  const now = dependencies.now?.() ?? new Date();
  assertClaimGeneration(approval, generation, now);
  if (!mappingJob || mappingJob.status !== 'REVIEW_REQUIRED') {
    throw new Error('Live mapping application requires an unchanged REVIEW_REQUIRED mapping job.');
  }
  const envelope = recordValue(mappingJob.resultSummary);
  const parsed = codexAffiliateIngestionResultV2Schema.safeParse(envelope.result);
  if (!parsed.success || parsed.data.status !== 'REVIEW_REQUIRED') {
    throw new Error('Mapping approval requires a valid schema-version-2 review-required result.');
  }
  const mappingResult = parsed.data;
  if (mappingResult.jobId !== mappingJob.id || mappingResult.intakeId !== mappingJob.intakeId) {
    throw new Error('Mapping result identity does not match its queue row.');
  }
  const claimEvidence = recordValue(envelope.claimEvidenceContext);
  const claimCatalog = claimEvidence.sportsCatalog as AffiliateSportsCatalogSnapshot | undefined;
  if (!claimCatalog
    || claimEvidence.evidenceRunId !== mappingResult.evidenceRunId
    || claimEvidence.sportsCatalogSha256 !== mappingResult.sportsCatalogSha256
    || claimCatalog.sha256 !== mappingResult.sportsCatalogSha256) {
    throw new Error('Mapping approval requires the persisted claim evidence context.');
  }
  const catalogLoader = dependencies.loadCatalog
    ?? (loadAffiliateSportsCatalogSnapshot as unknown as (client: unknown, capturedAt?: string) => Promise<AffiliateSportsCatalogSnapshot>);
  const currentCatalog = await catalogLoader(client);
  if (currentCatalog.sha256 !== mappingResult.sportsCatalogSha256) {
    throw new Error('SPORT_CATALOG_MISMATCH: mapping approval catalog is stale.');
  }
  const humanResolution = envelope.humanSportResolution
    ? affiliateHumanSportResolutionSchema.parse(envelope.humanSportResolution)
    : undefined;
  if (mappingResult.sportDeterminations.some((determination) => determination.resolutionBasis === 'USER_DECISION')
    && (!humanResolution || humanResolution.state !== 'CONSUMED')) {
    throw new Error('Mapping approval requires a consumed authenticated human sport resolution.');
  }
  assertAffiliateSportCompletionReady({
    determinations: mappingResult.sportDeterminations,
    catalog: currentCatalog,
    resultKind: 'REVIEW_REQUIRED',
    humanResolution,
  });
  if (mappingResult.workerId === approvalResult.reviewerId) {
    throw new Error('Affiliate mapping packages cannot be approved by their producer identity.');
  }
  const sourceId = stringValue(mappingJob.sourceId);
  const mappingId = stringValue(mappingJob.mappingId);
  if (Boolean(sourceId) !== Boolean(mappingId)) {
    throw new Error('Mapping approval requires both source and mapping package identity fields.');
  }
  if (!sourceId && !mappingId && mappingJob.legacyIdentityMigrationEligible !== true) {
    throw new Error('Identity-less mapping approval requires the explicit legacy identity migration marker.');
  }
  if (mappingResult.logoDisposition === 'MANUAL_REVIEW') {
    if (approvalResult.checks.officialLogoVerified || !approvalResult.checks.logoAbsenceAccepted) {
      throw new Error('Manual-logo mapping approval requires an explicit accepted logo absence.');
    }
  } else if (!approvalResult.checks.officialLogoVerified || approvalResult.checks.logoAbsenceAccepted) {
    throw new Error('Official-logo mapping approval requires a verified official logo check.');
  }
  return {
    [APPROVAL_PERMIT]: true,
    approvalJobId: generation.approvalJobId,
    mappingJobId: mappingJob.id,
    reviewerId: generation.reviewerId,
    claimGeneration: generation,
    approvalResult,
    mappingResult,
    mappingResultEnvelope: envelope,
    mappingResultSha256: stableHash(envelope.result),
    intakeId: mappingJob.intakeId,
    acceptMissingLogo: approvalResult.checks.logoAbsenceAccepted,
  };
};

export type AffiliateMappingLiveApplicationDependencies = AffiliateMappingApprovalEligibilityDependencies & {
  nodeModulesRoot?: string;
  tsxExecutable?: string;
  spawn?: typeof spawnSync;
};

export const applyVerifiedAffiliateMappingPackage = async (
  permit: AffiliateMappingApprovalPermit,
  dependencies: AffiliateMappingLiveApplicationDependencies = {},
): Promise<{ sourceId: string; mappingId: string }> => {
  if (!permit || permit[APPROVAL_PERMIT] !== true) {
    throw new Error('Live mapping application requires an internal approval permit.');
  }
  const client = (dependencies.db ?? prisma) as unknown as DbClient;
  const tables = dbFor(client);
  const producerRepositoryRoot = resolveAffiliateProducerRepositoryRoot(permit.mappingResult.workerId);
  const producerEvidence = inspectAffiliateProducerPackage({
    repositoryRoot: producerRepositoryRoot,
    result: permit.mappingResult,
  });
  const materialized = materializeAffiliateProducerCommit({
    repositoryRoot: producerRepositoryRoot,
    commit: producerEvidence.commit,
    nodeModulesRoot: dependencies.nodeModulesRoot ?? process.cwd(),
  });
  try {
    const materializedSetup = resolveApprovedAffiliateSetupScript(materialized.repositoryRoot, producerEvidence.setupScript);
    if (!fs.existsSync(materializedSetup)) throw new Error(`Approved setup script is missing: ${producerEvidence.setupScript}`);
    const tsxExecutable = dependencies.tsxExecutable ?? path.resolve('node_modules/.bin/tsx');
    const spawn = dependencies.spawn ?? spawnSync;
    const child = spawn(tsxExecutable, [materializedSetup, '--live', '--scrape'], {
      cwd: path.join(materialized.repositoryRoot, 'apps', 'site'),
      env: process.env,
      stdio: 'inherit',
      timeout: MAX_SETUP_MS,
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Approved setup failed with exit ${String(child.status)}.`);
  } finally {
    materialized.cleanup();
  }

  const sources = await tables.sources.findMany<SourceRow[]>({
    select: { id: true, sourceKey: true, organizationId: true, activeMappingId: true, autoScrapeEnabled: true, metadata: true },
  });
  const matchedSources = sources.filter((source) => affiliateSourceMatchesIntakeEvidence(
    source.metadata,
    { intakeId: permit.intakeId, intakeSourceKey: permit.mappingResult.sourceKey },
  ));
  if (matchedSources.length !== 1) throw new Error(`Expected one evidence-matched live source; found ${matchedSources.length}.`);
  const source = matchedSources[0];
  if (!source.organizationId || !source.activeMappingId || source.autoScrapeEnabled) {
    throw new Error(`Live source ${source.id} failed unlisted/disabled safety checks.`);
  }
  const [organization, mapping, latestRun] = await Promise.all([
    tables.organizations.findUnique<OrganizationRow | null>({ where: { id: source.organizationId }, select: { id: true, logoId: true, status: true, publicPageEnabled: true } }),
    tables.mappings.findUnique<MappingRow | null>({ where: { id: source.activeMappingId }, select: { id: true, sourceId: true, isActive: true, validatedAt: true } }),
    tables.runs.findFirst<RunRow | null>({ where: { sourceId: source.id }, orderBy: { startedAt: 'desc' }, select: { id: true, status: true } }),
  ]);
  if (!organization) throw new Error(`Approved live organization ${source.organizationId} was not found.`);
  if (!organization.logoId && !permit.acceptMissingLogo) throw new Error(`Approved live organization ${source.organizationId} has no official logo.`);
  if (organization.status !== 'UNLISTED' || organization.publicPageEnabled) throw new Error('Approved organization was published unexpectedly.');
  if (!mapping || mapping.sourceId !== source.id || !mapping.isActive || mapping.validatedAt) throw new Error('Live mapping failed disabled-review checks.');
  if (!latestRun || latestRun.status !== 'SUCCEEDED') throw new Error(`Live review scrape did not succeed for source ${source.id}.`);
  const candidateCount = await tables.candidates.count<number>({ where: { runId: latestRun.id } });
  if (candidateCount !== permit.mappingResult.candidateCount) throw new Error('Live candidate count did not match the reviewed package.');

  const now = dependencies.now?.() ?? new Date();
  const currentApproval = await tables.approvals.findUnique<ApprovalRow>({ where: { id: permit.approvalJobId } });
  assertClaimGeneration(currentApproval, permit.claimGeneration, now);
  const currentMapping = await tables.mappingJobs.findUnique<MappingJobRow>({ where: { id: permit.mappingJobId } });
  if (!currentMapping || currentMapping.status !== 'REVIEW_REQUIRED') {
    throw new Error('Mapping job changed before final approval CAS.');
  }
  if (stableHash(recordValue(currentMapping.resultSummary).result) !== permit.mappingResultSha256) {
    throw new Error('Mapping result changed during live application.');
  }
  const catalogLoader = dependencies.loadCatalog
    ?? (loadAffiliateSportsCatalogSnapshot as unknown as (client: unknown, capturedAt?: string) => Promise<AffiliateSportsCatalogSnapshot>);
  const finalCatalog = await catalogLoader(client);
  if (finalCatalog.sha256 !== permit.mappingResult.sportsCatalogSha256) {
    throw new Error('SPORT_CATALOG_MISMATCH: mapping approval catalog changed during live application.');
  }
  // Queue terminalization is deliberately owned by completeAffiliateApproval.
  // This service only performs producer setup/safety checks and returns identities.
  return { sourceId: source.id, mappingId: mapping.id };
};

export const affiliateMappingApprovalPermitDeterminationHash = (
  permit: AffiliateMappingApprovalPermit,
): string => affiliateSportDeterminationsSha256(permit.mappingResult.sportDeterminations);
