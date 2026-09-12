import { createId } from '@/lib/id';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  affiliateAgentContractBundleSchema,
  affiliateAgentClaimEnvelopeSchema,
  affiliateAgentHistoricalMappingProducerSubjectSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  affiliateAgentEvidenceManifestSchema,
  affiliateAgentSportEvidenceSchema,
  affiliateAgentSourceSportScopeLabelsSchema,
  affiliateAgentSourceSportScopeSchema,
  affiliateAgentSubjectSchema,
  affiliateAgentQueuedMappingProducerSubjectSchema,
  parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  type AffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  type AffiliateAgentSourceSportScope,
  type AffiliateAgentSportEvidence,
  type AffiliateAgentTerminalResultEnvelope,
  type AffiliateAgentContractBundle,
  type AffiliateAgentHistoricalMappingProducerSubject,
  type AffiliateAgentLegacySportRepairContext,
  type AffiliateAgentListingKind,
  type AffiliateAgentSubject,
  hashAffiliateAgentValue,
  AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX,
  AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX,
} from './agentGatewayContracts';
import type { AffiliateAgentArtifactStore } from './agentGatewayAdapters';
import {
  buildAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import {
  normalizeAffiliateSupplyIdentity,
  type AffiliateSupplyIdentity,
} from './affiliateSupplyLifecycle';
import {
  normalizeAffiliateSportLabel,
  verifyAffiliateSportCompletion,
  type AffiliateSportCompletionStoredArtifact,
} from './affiliateSportDetermination';
import {
  affiliateSupplyDatabase,
  ensureAffiliateSupplySource,
  loadActiveAffiliateSupplyContract,
} from './affiliateSupplyPersistence';
import { hasPublicAffiliateCandidate } from './affiliateSourcePublicationSafety';

export const AFFILIATE_LEGACY_REPAIR_ADMISSION_MAX_LIMIT = 20;
export const AFFILIATE_LEGACY_REPAIR_ADMISSION_DEFAULT_LIMIT = 1;
export const AFFILIATE_LEGACY_REPAIR_ADMISSION_SCHEMA_VERSION = 1 as const;
export const AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION = 'sport-evidence-v1' as const;

const ADMISSION_READ_BATCH_SIZE = 500;
const SUCCESSFUL_INTAKE_RUN_STATUSES = new Set(['SUCCEEDED', 'PARTIAL']);
const ACTIVE_MAPPING_JOB_STATUSES = new Set(['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED']);
const ACTIVE_APPROVAL_STATUSES = new Set(['QUEUED', 'CLAIMED']);
const LEGACY_SPORT_EVIDENCE_MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const PUBLIC_SOURCE_STATUSES = new Set(['PUBLIC', 'PUBLISHED', 'LISTED', 'ACTIVE_PUBLIC']);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

type JsonRecord = Record<string, unknown>;
type AdmissionClient = PrismaClient | Prisma.TransactionClient;

export class AffiliateLegacyRepairAdmissionError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = 'AffiliateLegacyRepairAdmissionError';
    this.code = code;
    this.details = details;
  }
}

export type AffiliateLegacyRepairAdmissionArtifact = Readonly<{
  kind: 'PAGE_HTML' | 'PAGE_MARKDOWN';
  artifactId: string;
  sourceArtifactId: string;
  storageKey: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  sourceUrl: string | null;
  finalUrl: string | null;
  intakeArtifactId: string;
  runId: string;
}>;

export type AffiliateLegacyRepairAdmissionWrite = Readonly<{
  jobId: string;
  intakeId: string;
  rootIdentityKey: string;
  rootAction: 'CREATE_ROOT' | 'REUSE_ROOT';
  sourceId: string;
  mappingId: string | null;
  evidenceRunId: string;
  artifactIds: readonly string[];
  gatewayDedupeKey: string;
  writes: readonly string[];
}>;

export type AffiliateLegacyRepairAdmissionRow = Readonly<{
  jobId: string;
  intakeId: string | null;
  status: string;
  sourceKey: string | null;
  sportRequeued: boolean;
  eligible: boolean;
  alreadyAdmitted: boolean;
  reason: string;
  reasonCodes: readonly string[];
  sourceId: string | null;
  mappingId: string | null;
  rootId: string | null;
  rootIdentityKey: string | null;
  evidenceRunId: string | null;
  sportsCatalogSha256: string | null;
  sportsCatalogCapturedAt: string | null;
  stateFingerprint: string;
  artifacts: readonly AffiliateLegacyRepairAdmissionArtifact[];
  gatewayDedupeKey: string | null;
  write?: AffiliateLegacyRepairAdmissionWrite;
  outcome?: 'HELD' | 'PROPOSED' | 'ALREADY_ADMITTED' | 'APPLIED';
}>;

export type AffiliateLegacyRepairAdmissionCounts = Readonly<{
  total: number;
  eligible: number;
  held: number;
  selected: number;
  alreadyAdmitted: number;
}>;

export type AffiliateLegacyRepairAdmissionReport = Readonly<{
  schemaVersion: 1;
  mode: 'PREVIEW' | 'APPLY';
  evaluatedAt: string;
  contractVersion: number;
  contractHash: string;
  counts: AffiliateLegacyRepairAdmissionCounts;
  requestedJobIds: readonly string[] | null;
  selectionLimit: number;
  selectedJobIds: readonly string[];
  proposedJobIds: readonly string[];
  rows: readonly AffiliateLegacyRepairAdmissionRow[];
  proposedWrites: readonly AffiliateLegacyRepairAdmissionWrite[];
  reportHash: string;
  reviewedReportHash: string | null;
  writeCount: number;
  appliedJobIds: readonly string[];
  replayed: boolean;
}>;

export type AffiliateLegacyRepairAdmissionPreview = AffiliateLegacyRepairAdmissionReport & {
  mode: 'PREVIEW';
};

export type AffiliateLegacyRepairAdmissionApplyReport = AffiliateLegacyRepairAdmissionReport & {
  mode: 'APPLY';
};

export type PreviewAffiliateLegacyRepairAdmissionInput = Readonly<{
  prisma: PrismaClient;
  bundle: AffiliateAgentContractBundle;
  limit?: number;
  jobIds?: readonly string[];
}>;

export type ApplyAffiliateLegacyRepairAdmissionInput = Readonly<{
  prisma: PrismaClient;
  bundle: AffiliateAgentContractBundle;
  limit?: number;
  jobIds?: readonly string[];
  expectedReportHash: string;
  operatorId: string;
}>;
export const AFFILIATE_LEGACY_REPAIR_RETRY_MAX_REASON_BYTES = 1_000;
export const AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION = 2;

export type AffiliateLegacyRepairRetryWrite = Readonly<{
  gatewayJobId: string;
  parentClaimId: string;
  parentReceiptId: string;
  parentResultHash: string;
  parentDeploymentContractHash: string;
  parentClaimGeneration: number;
  parentLifecycleGeneration: number;
  mappingJobId: string;
  intakeId: string;
  sourceKey: string;
  sourceId: string;
  mappingId: string | null;
  rootId: string;
  rootIdentityKey: string;
  rootLifecycleGeneration: number;
  parentPass: number;
  retryPass: number;
  listingKind: AffiliateAgentListingKind;
  evidenceRunId: string;
  sportsCatalogSha256: string;
  currentDeploymentContractHash: string;
  repairContext: Readonly<Record<string, unknown>>;
  manifestHash: string;
  manifest: Readonly<Record<string, unknown>>;
  artifactIds: readonly string[];
  sourceSportScope?: AffiliateAgentSourceSportScope;
  gatewayDedupeKey: string;
  writes: readonly string[];
}>;

export type AffiliateLegacyRepairRetryRow = Readonly<{
  gatewayJobId: string;
  parentClaimId: string | null;
  mappingJobId: string | null;
  intakeId: string | null;
  sourceKey: string | null;
  sourceId: string | null;
  mappingId: string | null;
  rootId: string | null;
  rootIdentityKey: string | null;
  parentPass: number | null;
  retryPass: number | null;
  parentReceiptId: string | null;
  parentResultHash: string | null;
  parentDeploymentContractHash: string | null;
  currentDeploymentContractHash: string;
  evidenceRunId: string | null;
  sportsCatalogSha256: string | null;
  sportsCatalogCapturedAt: string | null;
  stateFingerprint: string;
  artifacts: readonly AffiliateLegacyRepairAdmissionArtifact[];
  sourceSportScope?: AffiliateAgentSourceSportScope;
  gatewayDedupeKey: string | null;
  childGatewayJobId: string | null;
  eligible: boolean;
  alreadyRetried: boolean;
  reason: string;
  reasonCodes: readonly string[];
  write?: AffiliateLegacyRepairRetryWrite;
  outcome?: 'HELD' | 'PROPOSED' | 'APPLIED' | 'ALREADY_RETRIED';
}>;

type RecordedRetryWrite = Omit<AffiliateLegacyRepairRetryWrite, 'listingKind'> & {
  listingKind?: AffiliateAgentListingKind;
};
type RecordedRetryRow = Omit<AffiliateLegacyRepairRetryRow, 'write'> & {
  write?: RecordedRetryWrite;
};

export type AffiliateLegacyRepairRetryCounts = Readonly<{
  total: number;
  eligible: number;
  held: number;
  selected: number;
  alreadyRetried: number;
}>;

export type AffiliateLegacyRepairRetryReport = Readonly<{
  schemaVersion: 1 | 2;
  mode: 'PREVIEW' | 'APPLY';
  evaluatedAt: string;
  contractVersion: number;
  contractHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  reason: string;
  requestedGatewayJobIds: readonly string[];
  selectedGatewayJobIds: readonly string[];
  counts: AffiliateLegacyRepairRetryCounts;
  rows: readonly RecordedRetryRow[];
  proposedWrites: readonly RecordedRetryWrite[];
  reportHash: string;
  reviewedReportHash: string | null;
  writeCount: number;
  appliedGatewayJobIds: readonly string[];
  replayed: boolean;
}>;

export type AffiliateLegacyRepairRetryPreview = AffiliateLegacyRepairRetryReport & {
  mode: 'PREVIEW';
};
export type AffiliateLegacyRepairRetryApplyReport = AffiliateLegacyRepairRetryReport & {
  mode: 'APPLY';
};
export type PreviewAffiliateLegacyRepairRetryInput = Readonly<{
  prisma: PrismaClient;
  bundle: AffiliateAgentContractBundle;
  gatewayJobIds: readonly string[];
  reason: string;
  excludedSourceLabels?: readonly string[];
  operatorId?: string;
  artifactStore?: AffiliateAgentArtifactStore;
}>;

export type ApplyAffiliateLegacyRepairRetryInput = Readonly<{
  prisma: PrismaClient;
  bundle: AffiliateAgentContractBundle;
  gatewayJobIds: readonly string[];
  reason: string;
  excludedSourceLabels?: readonly string[];
  expectedReportHash: string;
  operatorId: string;
  artifactStore?: AffiliateAgentArtifactStore;
}>;
export const AFFILIATE_LEGACY_REPAIR_CONTINUATION_MAX_REASON_BYTES = 1_000;
export const AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION = 1 as const;
export const AFFILIATE_LEGACY_REPAIR_CONTINUATION_PRODUCER_LIMIT = 1 as const;
export const AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT = 1 as const;

export type AffiliateLegacyRepairContinuationLimits = Readonly<{
  producerClaims: 1;
  reviewerClaims: 1;
}>;

export type AffiliateLegacyRepairContinuationWrite = Readonly<{
  gatewayJobId: string;
  parentClaimId: string;
  parentReceiptId: string;
  parentResultHash: string;
  parentDeploymentContractHash: string;
  parentClaimGeneration: number;
  parentLifecycleGeneration: number;
  mappingJobId: string;
  intakeId: string;
  sourceKey: string;
  sourceId: string;
  mappingId: string | null;
  rootId: string;
  rootIdentityKey: string;
  rootLifecycleGeneration: number;
  parentPass: 3;
  continuationPass: 3;
  listingKind: AffiliateAgentListingKind;
  evidenceRunId: string;
  sportsCatalogSha256: string;
  currentDeploymentContractHash: string;
  repairContext: Readonly<Record<string, unknown>>;
  manifestHash: string;
  manifest: Readonly<Record<string, unknown>>;
  sourceSportScope?: AffiliateAgentSourceSportScope;
  artifactIds: readonly string[];
  producerDedupeKey: string;
  reviewerDedupePrefix: string;
  writes: readonly string[];
}>;

export type AffiliateLegacyRepairContinuationRow = Readonly<{
  gatewayJobId: string;
  parentClaimId: string | null;
  mappingJobId: string | null;
  intakeId: string | null;
  sourceKey: string | null;
  sourceId: string | null;
  mappingId: string | null;
  rootId: string | null;
  rootIdentityKey: string | null;
  parentPass: 3 | null;
  continuationPass: 3 | null;
  parentReceiptId: string | null;
  parentResultHash: string | null;
  parentDeploymentContractHash: string | null;
  currentDeploymentContractHash: string;
  evidenceRunId: string | null;
  sportsCatalogSha256: string | null;
  sportsCatalogCapturedAt: string | null;
  stateFingerprint: string;
  artifacts: readonly AffiliateLegacyRepairAdmissionArtifact[];
  sourceSportScope?: AffiliateAgentSourceSportScope;
  producerDedupeKey: string | null;
  reviewerDedupePrefix: string;
  childGatewayJobId: string | null;
  eligible: boolean;
  alreadyContinued: boolean;
  reason: string;
  reasonCodes: readonly string[];
  write?: AffiliateLegacyRepairContinuationWrite;
  outcome?: 'HELD' | 'PROPOSED' | 'APPLIED' | 'ALREADY_CONTINUED';
}>;

export type AffiliateLegacyRepairContinuationCounts = Readonly<{
  total: 1;
  eligible: 0 | 1;
  held: 0 | 1;
  selected: 0 | 1;
  alreadyContinued: 0 | 1;
}>;

export type AffiliateLegacyRepairContinuationReport = Readonly<{
  schemaVersion: 1;
  operation: 'LEGACY_SPORT_REPAIR_CONTINUATION';
  mode: 'PREVIEW' | 'APPLY';
  evaluatedAt: string;
  contractVersion: number;
  contractHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  reason: string;
  gatewayJobId: string;
  requestedGatewayJobIds: readonly [string];
  selectedGatewayJobIds: readonly [] | readonly [string];
  parentPass: 3;
  continuationPass: 3;
  limits: AffiliateLegacyRepairContinuationLimits;
  counts: AffiliateLegacyRepairContinuationCounts;
  row: AffiliateLegacyRepairContinuationRow;
  rows: readonly [AffiliateLegacyRepairContinuationRow];
  proposedWrites: readonly [] | readonly [AffiliateLegacyRepairContinuationWrite];
  childGatewayJobId: string | null;
  producerDedupeKey: string | null;
  reviewerDedupePrefix: string;
  reportHash: string;
  reviewedReportHash: string | null;
  writeCount: 0 | 1;
  appliedGatewayJobIds: readonly [] | readonly [string];
  replayed: boolean;
}>;

export type AffiliateLegacyRepairContinuationPreview =
  AffiliateLegacyRepairContinuationReport & { mode: 'PREVIEW' };
export type AffiliateLegacyRepairContinuationApplyReport =
  AffiliateLegacyRepairContinuationReport & { mode: 'APPLY' };

export type PreviewAffiliateLegacyRepairContinuationInput = Readonly<{
  prisma: PrismaClient;
  bundle: AffiliateAgentContractBundle;
  gatewayJobId: string;
  reason: string;
  artifactStore?: AffiliateAgentArtifactStore;
}>;

export type ApplyAffiliateLegacyRepairContinuationInput = Readonly<{
  prisma: PrismaClient;
  bundle: AffiliateAgentContractBundle;
  gatewayJobId: string;
  reason: string;
  expectedReportHash: string;
  operatorId: string;
  artifactStore?: AffiliateAgentArtifactStore;
}>;

type MappingJobRow = {
  id: string;
  intakeId: string;
  supplySourceId: string | null;
  sourceId: string | null;
  mappingId: string | null;
  legacyIdentityMigrationEligible: boolean;
  status: string;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  workerId: string | null;
  resultSummary: unknown;
  errorMessage: string | null;
};

type IntakeRow = {
  id: string;
  sourceKey: string;
  baseUrl: string | null;
  status: string;
  affiliateSourceId: string | null;
  supplySourceId: string | null;
  lastRunId: string | null;
  targetKindHints: string[];
};

type CaptureRunRow = {
  id: string;
  intakeId: string;
  supplySourceId: string | null;
  status: string;
  createdAt: Date;
  finishedAt: Date | null;
};

type IntakePageRow = {
  id: string;
  supplySourceId: string | null;
  intakeId: string;
  url: string;
  canonicalUrl: string;
  status: string;
};

type ArtifactRow = {
  id: string;
  supplySourceId: string | null;
  intakeId: string;
  pageId: string | null;
  runId: string;
  kind: string;
  sourceUrl: string | null;
  finalUrl: string | null;
  contentHash: string;
  fileId: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  isPinned: boolean;
};

type FileRow = {
  id: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

type SourceRow = {
  id: string;
  sourceKey: string;
  organizationId: string | null;
  baseUrl: string | null;
  listUrl: string;
  targetKind: string;
  status: string;
  activeMappingId: string | null;
  supplySourceId: string | null;
  autoScrapeEnabled: boolean;
  metadata: unknown;
};

type OrganizationRow = {
  id: string;
  status: string;
  publicPageEnabled: boolean;
  publicWidgetsEnabled: boolean;
};

type CandidateRow = {
  id: string;
  sourceId: string;
  supplySourceId: string | null;
  mappingId: string | null;
  status: string;
  listingKind: string;
  publishedEventId: string | null;
  publishedTeamId: string | null;
  publishedFacilityId: string | null;
  publishedOrganizationId: string | null;
};

type SupplyTargetRow = {
  id: string;
  supplySourceId: string;
  status: string;
  publishedAt: Date | null;
  rejectedAt: Date | null;
};

type MappingRow = {
  id: string;
  sourceId: string;
  supplySourceId: string | null;
  version: number;
  isActive: boolean;
  validatedAt: Date | null;
};
type SupplyRootRow = {
  id: string;
  identityKey: string;
  canonicalUrl: string;
  origin: string;
  pathKey: string;
  targetKind: string;
  rolloutCohort: string;
  intakeId: string | null;
  liveSourceId: string | null;
  lifecycleGeneration: number;
  activeSupplyContractVersion: number | null;
  activeSupplyContractHash: string | null;
  derivedStage: string;
  isAutomationEnabled: boolean;
  isExcluded: boolean;
  automationHoldReason: string | null;
  metadata: unknown;
};

type ApprovalRow = {
  id: string;
  subjectType: string;
  subjectKey: string;
  status: string;
};
type GatewayJobRow = {
  id: string;
  dedupeKey: string;
  role: string;
  subjectType: string;
  subjectId: string;
  subjectJson: unknown;
  expectedLifecycleGeneration: number | null;
  evidenceManifestJson: unknown;
  supplySourceId: string | null;
  status: string;
  activeClaimId: string | null;
  queue: string;
  lane: string;
  parentClaimId?: string | null;
  terminalDisposition?: string | null;
  resultHash?: string | null;
  resultJson?: unknown;
  terminalReceiptId?: string | null;
  finishedAt?: Date | null;
  claimGeneration?: number;
};

type GatewayClaimRow = {
  id: string;
  jobId: string;
  status: string;
};
type LegacyRetryProducerSubject = AffiliateAgentHistoricalMappingProducerSubject & {
  repairContext: AffiliateAgentLegacySportRepairContext;
};

type RetryGatewayClaimRow = GatewayClaimRow & {
  parentClaimId: string | null;
  claimGeneration: number;
  lifecycleGeneration: number | null;
  queue: string;
  lane: string;
  role: string;
  workerId: string;
  invocationId: string;
  workspaceId: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  roleContractVersion: number;
  roleContractHash: string;
  promptTemplateVersion: number;
  promptTemplateHash: string;
  supplyContractVersion: number;
  supplyContractHash: string;
  claimEnvelopeHash: string;
  claimEnvelopeJson: unknown;
  evidenceManifestHash: string;
  terminalReceiptId: string | null;
  schemaCorrectionCount: number;
};

type RetryGatewayReceiptRow = {
  id: string;
  claimId: string;
  jobId: string;
  claimGeneration: number;
  idempotencyKey: string;
  operationKind: string;
  commandName: string | null;
  requestHash: string;
  status: string;
  responseHash: string | null;
  responseJson: unknown;
  safeErrorCode: string | null;
  completedAt: Date | null;
};

type RetryParentContext = Readonly<{
  gatewayJob: GatewayJobRow;
  claim: RetryGatewayClaimRow;
  receipt: RetryGatewayReceiptRow;
  envelope: AffiliateAgentProducerClaimEnvelopeForHistoricalRead;
  subject: LegacyRetryProducerSubject;
  result: AffiliateAgentTerminalResultEnvelope;
  mappingJob: MappingJobRow;
  intake: IntakeRow;
  source: SourceRow;
  mapping: MappingRow | null;
  root: SupplyRootRow;
  run: CaptureRunRow;
  artifacts: readonly ArtifactRow[];
  pages: readonly IntakePageRow[];
  manifest: Record<string, unknown>;
  admissionEvidence: JsonRecord;
  freshRepairContext: AffiliateAgentLegacySportRepairContext;
  retryPass: number;
  gatewayDedupeKey: string;
  childGatewayJob: GatewayJobRow | null;
}>;

type RetryPlan = Readonly<{
  row: AffiliateLegacyRepairRetryRow;
  parent: RetryParentContext;
  write: AffiliateLegacyRepairRetryWrite;
}>;

type IdentityPair = Readonly<{ sourceId: string; mappingId: string }>;
type SportContext = Readonly<{
  evidenceRunId: string;
  sportsCatalog: AffiliateSportsCatalogSnapshot;
  sportsCatalogSha256: string;
  capturedAt: string;
  sportDeterminations: unknown[];
}>;

type AdmissionPlan = Readonly<{
  row: AffiliateLegacyRepairAdmissionRow;
  job: MappingJobRow;
  intake: IntakeRow;
  source: SourceRow;
  mapping: MappingRow | null;
  root: SupplyRootRow | null;
  identity: AffiliateSupplyIdentity;
  context: SportContext;
  run: CaptureRunRow;
  artifacts: readonly ArtifactRow[];
  filesById: ReadonlyMap<string, FileRow>;
  pages: readonly IntakePageRow[];
  manifest: Record<string, unknown>;
  repairContext: AffiliateAgentLegacySportRepairContext;
  gatewayDedupeKey: string;
}>;
type AdmissionSnapshot = Readonly<{
  jobs: readonly MappingJobRow[];
  intakes: readonly IntakeRow[];
  runs: readonly CaptureRunRow[];
  pages: readonly IntakePageRow[];
  artifacts: readonly ArtifactRow[];
  files: readonly FileRow[];
  sources: readonly SourceRow[];
  mappings: readonly MappingRow[];
  roots: readonly SupplyRootRow[];
  organizations: readonly OrganizationRow[];
  candidates: readonly CandidateRow[];
  targets: readonly SupplyTargetRow[];
  approvals: readonly ApprovalRow[];
  gatewayJobs: readonly GatewayJobRow[];
  gatewayClaims: readonly GatewayClaimRow[];
  sportsCatalog: AffiliateSportsCatalogSnapshot;
}>;

type ParsedBundle = AffiliateAgentContractBundle;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);


const normalizedUpper = (value: unknown): string => String(value ?? '').trim().toUpperCase();
const listingKindFor = (value: unknown): AffiliateAgentListingKind | null => {
  return value === 'EVENT'
    || value === 'RENTAL'
    || value === 'CLUB'
    ? value
    : null;
};

const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
)).sort();

const compareById = (left: { id: string }, right: { id: string }): number => (
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0
);

const normalizeHash = (value: unknown): string | null => {
  const text = stringValue(value)?.toLowerCase() ?? null;
  return text && HASH_PATTERN.test(text) ? text : null;
};

const parseBundle = (bundle: AffiliateAgentContractBundle): ParsedBundle => {
  const parsed = affiliateAgentContractBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    throw new AffiliateLegacyRepairAdmissionError(
      'INVALID_CONTRACT_BUNDLE',
      `The supplied Affiliate Agent contract bundle is invalid: ${parsed.error.message}`,
    );
  }
  return parsed.data;
};

const contractCohort = (bundle: ParsedBundle): string => {
  const supply = bundle.supplyContract as Record<string, unknown>;
  if (typeof supply.rolloutCohort === 'string' && supply.rolloutCohort.trim()) {
    return supply.rolloutCohort.trim();
  }
  return 'DEFAULT';
};

const contractVersion = (bundle: ParsedBundle): number => bundle.supplyContract.version;
const contractHash = (bundle: ParsedBundle): string => bundle.supplyContract.hash;

const validateLimit = (value: number | undefined): number => {
  const limit = value ?? AFFILIATE_LEGACY_REPAIR_ADMISSION_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > AFFILIATE_LEGACY_REPAIR_ADMISSION_MAX_LIMIT) {
    throw new AffiliateLegacyRepairAdmissionError(
      'INVALID_LIMIT',
      `limit must be an integer between 1 and ${AFFILIATE_LEGACY_REPAIR_ADMISSION_MAX_LIMIT}.`,
    );
  }
  return limit;
};

const validateJobIds = (jobIds: readonly string[] | undefined): string[] | undefined => {
  if (jobIds === undefined) return undefined;
  const normalized = sortedUnique(jobIds);
  if (normalized.length === 0 || normalized.length > AFFILIATE_LEGACY_REPAIR_ADMISSION_MAX_LIMIT) {
    throw new AffiliateLegacyRepairAdmissionError(
      'INVALID_JOB_IDS',
      `jobIds must contain between 1 and ${AFFILIATE_LEGACY_REPAIR_ADMISSION_MAX_LIMIT} IDs.`,
    );
  }
  return normalized;
};

const loadBatched = async <T>(
  loader: (args: Record<string, unknown>) => Promise<readonly T[]>,
  where: Record<string, unknown> = {},
): Promise<T[]> => {
  const result: T[] = [];
  const seenIds = new Set<string>();
  let skip = 0;
  while (true) {
    const batch = await loader({ where, orderBy: { id: 'asc' }, skip, take: ADMISSION_READ_BATCH_SIZE });
    const unseen = batch.filter((row) => {
      const id = recordValue(row).id;
      if (typeof id !== 'string' || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
    result.push(...unseen);
    if (batch.length < ADMISSION_READ_BATCH_SIZE || unseen.length === 0) break;
    skip += batch.length;
  }
  return result;
};
const readSnapshot = async (
  client: AdmissionClient,
  jobIds: readonly string[] | undefined,
): Promise<AdmissionSnapshot> => {
  const mappingJobSelect = {
    id: true,
    intakeId: true,
    supplySourceId: true,
    sourceId: true,
    mappingId: true,
    legacyIdentityMigrationEligible: true,
    status: true,
    claimedAt: true,
    leaseExpiresAt: true,
    workerId: true,
    resultSummary: true,
    errorMessage: true,
  } as const;
  const selectedJobWhere = {
    resultSummary: {
      path: ['sportReconciliationHistory'],
      array_contains: [{ strategyRevision: AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION }],
    },
  };
  const requestedJobs = jobIds
    ? await client.affiliateSourceMappingJobs.findMany({
      where: { id: { in: [...jobIds] } },
      select: mappingJobSelect,
      orderBy: { id: 'asc' },
    })
    : await loadBatched((args) => (
      (client.affiliateSourceMappingJobs.findMany as unknown as (
        query: Record<string, unknown>,
      ) => Promise<readonly MappingJobRow[]> )({ ...args, select: mappingJobSelect })
    ), selectedJobWhere);
  const requestedTypedJobs = requestedJobs as unknown as MappingJobRow[];
  const requestedIntakeIds = sortedUnique(requestedTypedJobs
    .map((job) => job.intakeId)
    .filter((id): id is string => Boolean(id)));
  const siblingJobs = requestedIntakeIds.length > 0
    ? await client.affiliateSourceMappingJobs.findMany({
      where: { intakeId: { in: requestedIntakeIds } },
      select: mappingJobSelect,
      orderBy: { id: 'asc' },
    })
    : [];
  const typedJobs = Array.from(new Map(
    [...requestedTypedJobs, ...(siblingJobs as unknown as MappingJobRow[])]
      .map((job) => [job.id, job]),
  ).values());
  const jobSubjectIds = sortedUnique(typedJobs.map((job) => job.id));
  const intakeIds = sortedUnique(typedJobs.map((job) => job.intakeId).filter((id): id is string => Boolean(id)));
  const intakes = intakeIds.length
    ? await client.affiliateSourceIntakes.findMany({
      where: { id: { in: intakeIds } },
      select: {
        id: true,
        sourceKey: true,
        baseUrl: true,
        status: true,
        affiliateSourceId: true,
        supplySourceId: true,
        lastRunId: true,
        targetKindHints: true,
      },
    })
    : [];
  const typedIntakes = intakes as unknown as IntakeRow[];
  const intakeSourceKeys = sortedUnique(typedIntakes.map((intake) => intake.sourceKey));
  const intakeSourceIds = sortedUnique(typedIntakes
    .map((intake) => intake.affiliateSourceId)
    .filter((id): id is string => Boolean(id)));
  const sourceReferenceIds = sortedUnique([
    ...typedJobs.map((job) => job.sourceId).filter((id): id is string => Boolean(id)),
    ...intakeSourceIds,
  ]);
  const sourceMetadataPredicates = [
    ...intakeIds.flatMap((intakeId) => [
      { metadata: { path: ['intakeId'], equals: intakeId } },
      { metadata: { path: ['sourceEvidence', 'intakeId'], equals: intakeId } },
    ]),
    ...intakeSourceKeys.flatMap((sourceKey) => [
      { metadata: { path: ['intakeSourceKey'], equals: sourceKey } },
      { metadata: { path: ['sourceEvidence', 'intakeSourceKey'], equals: sourceKey } },
    ]),
  ];
  const sourceWhere: Record<string, unknown> = {
    OR: [
      ...(sourceReferenceIds.length ? [{ id: { in: sourceReferenceIds } }] : []),
      ...(intakeSourceKeys.length ? [{ sourceKey: { in: intakeSourceKeys } }] : []),
      ...sourceMetadataPredicates,
    ],
  };
  const [runs, pages, artifacts, sources, sportsCatalog] = await Promise.all([
    intakeIds.length
      ? client.affiliateSourceIntakeRuns.findMany({ where: { intakeId: { in: intakeIds } }, orderBy: { id: 'asc' } })
      : Promise.resolve([]),
    intakeIds.length
      ? client.affiliateSourceIntakePages.findMany({ where: { intakeId: { in: intakeIds } }, orderBy: { id: 'asc' } })
      : Promise.resolve([]),
    intakeIds.length
      ? client.affiliateSourceIntakeArtifacts.findMany({
        where: { intakeId: { in: intakeIds }, kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN'] } },
        orderBy: { id: 'asc' },
      })
      : Promise.resolve([]),
    sourceReferenceIds.length || intakeSourceKeys.length
      ? client.affiliateScrapeSources.findMany({
        where: sourceWhere as never,
        select: {
          id: true,
          sourceKey: true,
          organizationId: true,
          baseUrl: true,
          listUrl: true,
          targetKind: true,
          status: true,
          activeMappingId: true,
          supplySourceId: true,
          autoScrapeEnabled: true,
          metadata: true,
        },
        orderBy: { id: 'asc' },
      })
      : Promise.resolve([]),
    client.sports.findMany({ select: { id: true, name: true } })
      .then((rows) => buildAffiliateSportsCatalogSnapshot(rows, new Date().toISOString())),
  ]);
  const typedSources = sources as unknown as SourceRow[];
  const mappingReferenceIds = sortedUnique([
    ...typedJobs.map((job) => job.mappingId).filter((id): id is string => Boolean(id)),
    ...typedSources.map((source) => source.activeMappingId).filter((id): id is string => Boolean(id)),
  ]);
  const sourceIds = sortedUnique(typedSources.map((source) => source.id));
  const mappings = sourceIds.length || mappingReferenceIds.length
    ? await client.affiliateScrapeMappings.findMany({
      where: {
        OR: [
          ...(mappingReferenceIds.length ? [{ id: { in: mappingReferenceIds } }] : []),
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      select: {
        id: true,
        sourceId: true,
        supplySourceId: true,
        version: true,
        isActive: true,
        validatedAt: true,
      },
      orderBy: { id: 'asc' },
    })
    : [];
  const typedMappings = mappings as unknown as MappingRow[];
  const rootReferenceIds = sortedUnique([
    ...typedJobs.map((job) => job.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedIntakes.map((intake) => intake.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedSources.map((source) => source.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedMappings.map((mapping) => mapping.supplySourceId).filter((id): id is string => Boolean(id)),
  ]);
  const rootIdentityKeys = sortedUnique(typedSources.flatMap((source) => {
    const url = source.listUrl || source.baseUrl;
    if (!url) return [];
    try {
      return [normalizeAffiliateSupplyIdentity({
        requestedUrl: url,
        resolvedCanonicalUrl: url,
        operatorDomain: new URL(url).hostname,
      }).identityKey];
    } catch {
      return [];
    }
  }));
  const rootWhere: Record<string, unknown> = {
    OR: [
      ...(rootReferenceIds.length ? [{ id: { in: rootReferenceIds } }] : []),
      ...(rootIdentityKeys.length ? [{ identityKey: { in: rootIdentityKeys } }] : []),
    ],
  };
  const [roots, approvals, gatewayJobs, gatewayClaims] = await Promise.all([
    rootReferenceIds.length || rootIdentityKeys.length
      ? client.affiliateSupplySources.findMany({
        where: rootWhere as never,
        select: {
          id: true,
          identityKey: true,
          canonicalUrl: true,
          origin: true,
          pathKey: true,
          targetKind: true,
          rolloutCohort: true,
          intakeId: true,
          liveSourceId: true,
          lifecycleGeneration: true,
          activeSupplyContractVersion: true,
          activeSupplyContractHash: true,
          derivedStage: true,
          isAutomationEnabled: true,
          isExcluded: true,
          automationHoldReason: true,
          metadata: true,
        },
        orderBy: { id: 'asc' },
      })
      : Promise.resolve([]),
    jobSubjectIds.length
      ? client.affiliateApprovalJobs.findMany({
        where: { subjectType: 'MAPPING_PACKAGE', subjectKey: { in: jobSubjectIds } },
        orderBy: { id: 'asc' },
      })
      : Promise.resolve([]),
    client.affiliateAgentGatewayJobs.findMany({
      where: {
        OR: [
          { subjectId: { in: jobSubjectIds } },
          { activeClaimId: { not: null } },
        ],
      },
      select: {
        id: true,
        dedupeKey: true,
        queue: true,
        lane: true,
        role: true,
        subjectType: true,
        subjectId: true,
        subjectJson: true,
        expectedLifecycleGeneration: true,
        evidenceManifestJson: true,
        supplySourceId: true,
        activeClaimId: true,
        status: true,
      },
      orderBy: { id: 'asc' },
    }),
    client.affiliateAgentGatewayClaims.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, jobId: true, status: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  const typedRoots = roots as unknown as SupplyRootRow[];
  const organizationIds = sortedUnique(typedSources
    .map((source) => source.organizationId)
    .filter((id): id is string => Boolean(id)));
  const rootIds = sortedUnique(typedRoots.map((root) => root.id));
  const candidateMappingIds = sortedUnique(typedMappings.map((mapping) => mapping.id));
  const [organizations, candidates, targets] = await Promise.all([
    organizationIds.length
      ? client.organizations.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, status: true, publicPageEnabled: true, publicWidgetsEnabled: true },
      })
      : Promise.resolve([]),
    sourceIds.length || candidateMappingIds.length || rootIds.length
      ? client.affiliateImportCandidates.findMany({
        where: {
          OR: [
            ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
            ...(candidateMappingIds.length ? [{ mappingId: { in: candidateMappingIds } }] : []),
            ...(rootIds.length ? [{ supplySourceId: { in: rootIds } }] : []),
          ],
        },
        select: {
          id: true,
          sourceId: true,
          supplySourceId: true,
          mappingId: true,
          status: true,
          listingKind: true,
          publishedEventId: true,
          publishedTeamId: true,
          publishedFacilityId: true,
          publishedOrganizationId: true,
        },
        orderBy: { id: 'asc' },
      })
      : Promise.resolve([]),
    rootIds.length
      ? client.affiliateSupplyTargets.findMany({
        where: { supplySourceId: { in: rootIds } },
        select: { id: true, supplySourceId: true, status: true, publishedAt: true, rejectedAt: true },
        orderBy: { id: 'asc' },
      })
      : Promise.resolve([]),
  ]);
  const fileIds = sortedUnique((artifacts as unknown as ArtifactRow[]).map((artifact) => artifact.fileId));
  const files = fileIds.length
    ? await client.file.findMany({ where: { id: { in: fileIds } }, orderBy: { id: 'asc' } })
    : [];
  return {
    jobs: typedJobs,
    intakes: typedIntakes,
    runs: runs as unknown as CaptureRunRow[],
    pages: pages as unknown as IntakePageRow[],
    files: files as unknown as FileRow[],
    artifacts: artifacts as unknown as ArtifactRow[],
    sources: typedSources,
    mappings: typedMappings,
    roots: typedRoots,
    organizations: organizations as unknown as OrganizationRow[],
    candidates: candidates as unknown as CandidateRow[],
    targets: targets as unknown as SupplyTargetRow[],
    approvals: approvals as unknown as ApprovalRow[],
    gatewayJobs: gatewayJobs as unknown as GatewayJobRow[],
    gatewayClaims: gatewayClaims as unknown as GatewayClaimRow[],
    sportsCatalog: sportsCatalog as AffiliateSportsCatalogSnapshot,
  };
};

const historyEntries = (summary: unknown): JsonRecord[] => {
  const history = recordValue(summary).sportReconciliationHistory;
  return Array.isArray(history)
    ? history.map(recordValue).filter((entry) => entry.strategyRevision === AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION)
    : [];
};

const hasSportRequeueMarker = (job: MappingJobRow): boolean => historyEntries(job.resultSummary).length > 0;

const admissionHistoryEntries = (summary: unknown): JsonRecord[] => {
  const history = recordValue(summary).legacyRepairAdmissionHistory;
  return Array.isArray(history) ? history.map(recordValue) : [];
};
const stringArrayValue = (value: unknown): string[] | null => (
  Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string')
    ? [...value]
    : null
);

const admissionEvidenceFor = (summary: unknown, reportHash: string): JsonRecord | null => (
  admissionHistoryEntries(summary).find((entry) => entry.reportHash === reportHash) ?? null
);

const matchingAdmissionEvidence = (summary: unknown, reportHash: string): boolean => (
  admissionEvidenceFor(summary, reportHash) !== null
);

const summaryEnvelopes = (summary: unknown): JsonRecord[] => {
  const envelope = recordValue(summary);
  const result = recordValue(envelope.result);
  const history = historyEntries(summary);
  const latestHistory = history.length > 0 ? history[history.length - 1] : null;
  const archived = latestHistory ? recordValue(latestHistory.archivedPriorResultSummary) : {};
  return [envelope, result, archived, recordValue(archived.result)];
};

const readIdentityPair = (value: unknown): IdentityPair | null | 'MALFORMED' => {
  const candidate = recordValue(value);
  const hasSource = Object.prototype.hasOwnProperty.call(candidate, 'sourceId');
  const hasMapping = Object.prototype.hasOwnProperty.call(candidate, 'mappingId');
  if (!hasSource && !hasMapping) return null;
  const sourceId = stringValue(candidate.sourceId);
  const mappingId = stringValue(candidate.mappingId);
  if (!sourceId || !mappingId) return 'MALFORMED';
  return { sourceId, mappingId };
};

const identitiesFromJob = (job: MappingJobRow): { pairs: IdentityPair[]; reasonCodes: string[] } => {
  const pairs: IdentityPair[] = [];
  const reasonCodes: string[] = [];
  const envelopes = summaryEnvelopes(job.resultSummary);
  for (const envelope of envelopes) {
    for (const field of ['packageIdentity', 'liveApproval']) {
      const parsed = readIdentityPair(envelope[field]);
      if (parsed === 'MALFORMED') reasonCodes.push('MALFORMED_PACKAGE_IDENTITY');
      else if (parsed) pairs.push(parsed);
    }
  }
  const uniquePairs = Array.from(new Map(pairs.map((pair) => [`${pair.sourceId}:${pair.mappingId}`, pair])).values());
  if (uniquePairs.length > 1) reasonCodes.push('CONFLICTING_PACKAGE_IDENTITIES');
  return { pairs: uniquePairs, reasonCodes: sortedUnique(reasonCodes) };
};

const archiveLineageValid = (job: MappingJobRow, intake: IntakeRow): boolean => historyEntries(job.resultSummary).every((entry) => {
  const archived = recordValue(entry.archivedPriorResultSummary);
  const result = recordValue(archived.result);
  const archivedJobId = stringValue(result.jobId ?? archived.jobId);
  const archivedIntakeId = stringValue(result.intakeId ?? archived.intakeId);
  return (!archivedJobId || archivedJobId === job.id) && (!archivedIntakeId || archivedIntakeId === intake.id);
});

const metadataSourceEvidence = (source: SourceRow): JsonRecord => {
  const metadata = recordValue(source.metadata);
  const nested = recordValue(metadata.sourceEvidence);
  return {
    ...metadata,
    ...nested,
    intakeId: nested.intakeId ?? metadata.intakeId,
    runId: nested.runId ?? metadata.runId,
    evidenceRunId: nested.evidenceRunId ?? metadata.evidenceRunId,
    intakeSourceKey: nested.intakeSourceKey ?? metadata.intakeSourceKey,
  };
};
const sourceEvidenceConflict = (source: SourceRow): boolean => {
  const metadata = recordValue(source.metadata);
  const nested = recordValue(metadata.sourceEvidence);
  const citedRuns = [
    metadata.runId,
    metadata.evidenceRunId,
    nested.runId,
    nested.evidenceRunId,
  ].map(stringValue).filter((value): value is string => Boolean(value));
  const citedIntakes = [
    metadata.intakeId,
    nested.intakeId,
  ].map(stringValue).filter((value): value is string => Boolean(value));
  const citedKeys = [
    metadata.intakeSourceKey,
    nested.intakeSourceKey,
  ].map(stringValue).filter((value): value is string => Boolean(value));
  return new Set(citedRuns).size > 1 || new Set(citedIntakes).size > 1 || new Set(citedKeys).size > 1;
};

const sourceBindsToIntake = (source: SourceRow, intake: IntakeRow): boolean => {
  const evidence = metadataSourceEvidence(source);
  return evidence.intakeId === intake.id || evidence.intakeSourceKey === intake.sourceKey;
};

const sourceIsPublicOrLive = (
  source: SourceRow,
  mapping: MappingRow | null,
  activeMapping: MappingRow | null = null,
): boolean => {
  const metadata = recordValue(source.metadata);
  const publicationStatus = normalizedUpper(
    metadata.publicationStatus ?? metadata.publicStatus ?? metadata.lifecycleStatus,
  );
  return source.autoScrapeEnabled === true
    || PUBLIC_SOURCE_STATUSES.has(normalizedUpper(source.status))
    || PUBLIC_SOURCE_STATUSES.has(publicationStatus)
    || metadata.isPublic === true
    || metadata.public === true
    || Boolean(mapping?.validatedAt)
    || Boolean(activeMapping?.validatedAt);
};
const sourceHoldReason = (source: SourceRow): string | null => {
  const review = recordValue(recordValue(source.metadata).automationReviewRequired);
  return review.hold === true ? stringValue(review.reason) : null;
};
const publicationReasonCodes = (
  snapshot: AdmissionSnapshot,
  source: SourceRow,
  mapping: MappingRow | null,
  root: SupplyRootRow | null,
): string[] => {
  const reasons: string[] = [];
  if (source.organizationId) {
    const organization = snapshot.organizations.find((candidate) => candidate.id === source.organizationId);
    if (organization && (
      normalizedUpper(organization.status) !== 'UNLISTED'
      || organization.publicPageEnabled
      || organization.publicWidgetsEnabled
    )) {
      reasons.push('PUBLIC_ORGANIZATION_PAGE');
    }
  }
  const candidates = snapshot.candidates.filter((candidate) => (
    candidate.sourceId === source.id
    || Boolean(mapping && candidate.mappingId === mapping.id)
    || Boolean(root && candidate.supplySourceId === root.id)
  ));
  if (candidates.some((candidate) => hasPublicAffiliateCandidate(candidate, source.organizationId, snapshot.organizations))) {
    reasons.push('PUBLISHED_AFFILIATE_CANDIDATE');
  }
  if (root && snapshot.targets.some((target) => (
    target.supplySourceId === root.id
    && !target.rejectedAt
    && (
      normalizedUpper(target.status) === 'PUBLISHED'
      || normalizedUpper(target.status) === 'ACTIVE'
      || normalizedUpper(target.status) === 'LAST_KNOWN_GOOD'
    )
  ))) {
    reasons.push('PUBLISHED_AFFILIATE_TARGET');
  }
  return reasons;
};

const urlOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
};

const urlOwnedBySource = (value: string | null, ownedOrigins: ReadonlySet<string>): boolean => {
  const origin = urlOrigin(value);
  return Boolean(origin && ownedOrigins.has(origin));
};

const sourceEvidenceRunId = (source: SourceRow | null): string | null => {
  if (!source) return null;
  const evidence = metadataSourceEvidence(source);
  return stringValue(evidence.runId ?? evidence.evidenceRunId);
};

const selectedSuccessfulRun = (
  intake: IntakeRow,
  source: SourceRow | null,
  runs: readonly CaptureRunRow[],
): CaptureRunRow | null => {
  const intakeRuns = runs
    .filter((run) => run.intakeId === intake.id && SUCCESSFUL_INTAKE_RUN_STATUSES.has(normalizedUpper(run.status)))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || (left.id < right.id ? 1 : -1));
  const citedRunId = sourceEvidenceRunId(source);
  if (citedRunId) return intakeRuns.find((run) => run.id === citedRunId) ?? null;
  if (intake.lastRunId) {
    const last = intakeRuns.find((run) => run.id === intake.lastRunId);
    if (last) return last;
  }
  return intakeRuns[0] ?? null;
};


const sourceForJob = (
  snapshot: AdmissionSnapshot,
  intake: IntakeRow,
  job: MappingJobRow,
  identity: IdentityPair | null,
): { source: SourceRow | null; reasonCodes: string[] } => {
  const reasons: string[] = [];
  const exactKeyCandidates = snapshot.sources.filter((source) => source.sourceKey === intake.sourceKey);
  const metadataCandidates = snapshot.sources.filter((source) => sourceBindsToIntake(source, intake));
  if (identity) {
    const source = snapshot.sources.find((candidate) => candidate.id === identity.sourceId) ?? null;
    if (!source) return { source: null, reasonCodes: ['IDENTITY_SOURCE_MISSING'] };
    if (sourceEvidenceConflict(source)) reasons.push('CONFLICTING_SOURCE_PROVENANCE');
    if (exactKeyCandidates.length !== 1) {
      reasons.push(exactKeyCandidates.length === 0 ? 'SOURCE_NOT_FOUND_BY_EXACT_KEY' : 'AMBIGUOUS_SOURCE_IDENTITY');
    }
    if (exactKeyCandidates.length === 1 && exactKeyCandidates[0].id !== source.id) reasons.push('SOURCE_KEY_IDENTITY_CONFLICT');
    if (metadataCandidates.some((candidate) => candidate.id !== source.id)) reasons.push('AMBIGUOUS_SOURCE_IDENTITY');
    if (metadataCandidates.some((candidate) => sourceEvidenceConflict(candidate))) reasons.push('CONFLICTING_SOURCE_PROVENANCE');
    if (intake.affiliateSourceId && intake.affiliateSourceId !== source.id) reasons.push('INTAKE_SOURCE_ID_CONFLICT');
    if (job.sourceId && job.sourceId !== source.id) reasons.push('MAPPING_JOB_SOURCE_CONFLICT');
    if (job.mappingId && job.mappingId !== identity.mappingId) reasons.push('MAPPING_JOB_MAPPING_CONFLICT');
    return { source: reasons.length === 0 ? source : null, reasonCodes: reasons };
  }
  if (exactKeyCandidates.length > 1) reasons.push('AMBIGUOUS_SOURCE_IDENTITY');
  if (exactKeyCandidates.length === 1 && metadataCandidates.some((candidate) => candidate.id !== exactKeyCandidates[0].id)) {
    reasons.push('AMBIGUOUS_SOURCE_IDENTITY');
  }
  if (exactKeyCandidates.some((candidate) => sourceEvidenceConflict(candidate))) {
    reasons.push('CONFLICTING_SOURCE_PROVENANCE');
  }
  if (intake.affiliateSourceId && exactKeyCandidates.length === 1 && intake.affiliateSourceId !== exactKeyCandidates[0].id) {
    reasons.push('INTAKE_SOURCE_ID_CONFLICT');
  }
  if (job.sourceId && (exactKeyCandidates.length !== 1 || job.sourceId !== exactKeyCandidates[0].id)) {
    reasons.push('MAPPING_JOB_SOURCE_CONFLICT');
  }
  return { source: reasons.length === 0 && exactKeyCandidates.length === 1 ? exactKeyCandidates[0] : null, reasonCodes: reasons };
};
const mappingForIdentity = (
  snapshot: AdmissionSnapshot,
  source: SourceRow | null,
  identity: IdentityPair | null,
): { mapping: MappingRow | null; reasonCodes: string[] } => {
  if (identity) {
    const mapping = snapshot.mappings.find((candidate) => candidate.id === identity.mappingId) ?? null;
    if (!mapping) return { mapping: null, reasonCodes: ['IDENTITY_MAPPING_MISSING'] };
    if (!source || mapping.sourceId !== source.id) return { mapping: null, reasonCodes: ['MAPPING_OWNERSHIP_CONFLICT'] };
    if (mapping.validatedAt) return { mapping, reasonCodes: ['VALIDATED_MAPPING_LIVE_STATE'] };
    return { mapping, reasonCodes: [] };
  }
  if (!source) return { mapping: null, reasonCodes: ['MAPPING_SOURCE_MISSING'] };
  const mappings = snapshot.mappings.filter((candidate) => candidate.sourceId === source.id);
  if (mappings.length === 0) return { mapping: null, reasonCodes: ['MAPPING_NOT_FOUND_FOR_SOURCE'] };
  if (mappings.length > 1) return { mapping: null, reasonCodes: ['AMBIGUOUS_MAPPING_FOR_SOURCE'] };
  const mapping = mappings[0];
  if (mapping.validatedAt) return { mapping, reasonCodes: ['VALIDATED_MAPPING_LIVE_STATE'] };
  return { mapping, reasonCodes: [] };
};
const rootForIdentity = (
  snapshot: AdmissionSnapshot,
  identity: AffiliateSupplyIdentity,
  intake: IntakeRow,
  source: SourceRow,
  rolloutCohort: string,
): { root: SupplyRootRow | null; reasonCodes: string[] } => {
  const reasons: string[] = [];
  const matching = snapshot.roots.filter((root) => root.identityKey === identity.identityKey).sort(compareById);
  const linked = intake.supplySourceId
    ? snapshot.roots.find((root) => root.id === intake.supplySourceId) ?? null
    : null;
  if (linked && linked.identityKey !== identity.identityKey) reasons.push('INTAKE_ROOT_IDENTITY_CONFLICT');
  if (intake.supplySourceId && !linked) reasons.push('INTAKE_ROOT_MISSING');
  if (matching.length > 1) reasons.push('AMBIGUOUS_ROOT_IDENTITY');
  const root = matching.length === 1
    ? matching[0]
    : matching.length === 0 && linked?.identityKey === identity.identityKey
      ? linked
      : null;
  const rootReview = root ? recordValue(recordValue(root.metadata).automationReviewRequired) : {};
  if (root && rootReview.hold === true && stringValue(rootReview.reason) !== 'LEGACY_SPORT_REPAIR') reasons.push('ROOT_HOLD_CONFLICT');
  if (root && root.intakeId && root.intakeId !== intake.id) reasons.push('ROOT_INTAKE_OWNERSHIP_CONFLICT');
  if (root && normalizedUpper(root.targetKind) !== normalizedUpper(source.targetKind)) reasons.push('ROOT_TARGET_KIND_CONFLICT');
  if (root && root.rolloutCohort !== rolloutCohort) reasons.push('ROOT_ROLLOUT_COHORT_CONFLICT');
  if (root && root.automationHoldReason && root.automationHoldReason !== 'LEGACY_SPORT_REPAIR') reasons.push('ROOT_HOLD_CONFLICT');
  if (root && (root.derivedStage !== 'PRE_MAPPED' || root.isAutomationEnabled || root.isExcluded)) {
    reasons.push('ROOT_LIVE_STATE');
  }
  if (root && root.liveSourceId && root.liveSourceId !== source.id) reasons.push('ROOT_SOURCE_OWNERSHIP_CONFLICT');
  if (source.supplySourceId && (!root || source.supplySourceId !== root.id)) reasons.push('SOURCE_ROOT_OWNERSHIP_CONFLICT');
  return { root, reasonCodes: reasons };
};


const gatewayRepairJobsFor = (snapshot: AdmissionSnapshot, jobId: string): GatewayJobRow[] => snapshot.gatewayJobs
  .filter((candidate) => (
    candidate.role === 'MAPPING_PRODUCER'
    && candidate.subjectId === jobId
  ))
  .sort(compareById);

const admissionEvidenceForGateway = (
  job: MappingJobRow,
  rootId: string,
  repairContext: unknown,
  manifest: unknown,
  dedupeKey: string,
): JsonRecord | null => admissionHistoryEntries(job.resultSummary).find((entry) => (
  stringValue(entry.rootId) === rootId
  && stringValue(entry.gatewayDedupeKey) === dedupeKey
  && sameRepairContext(entry.repairContext, repairContext)
  && sameAdmissionValue(entry.manifest, manifest)
)) ?? null;
const productionAdmissionEvidenceMatches = (input: Readonly<{
  entry: JsonRecord;
  mappingJob: MappingJobRow;
  intake: IntakeRow;
  source: SourceRow;
  mapping: MappingRow | null;
  root: SupplyRootRow;
  run: CaptureRunRow;
  artifacts: readonly ArtifactRow[];
  ancestor: RetryParentParts;
  manifest: Record<string, unknown>;
  expectedRootLifecycleGeneration?: number;
}>): boolean => {
  const entry = input.entry;
  const report = recordValue(entry.reportSnapshot);
  const reportRows = Array.isArray(report.rows) ? report.rows.map(recordValue) : null;
  const reportWrites = Array.isArray(report.proposedWrites) ? report.proposedWrites.map(recordValue) : null;
  const selectedRow = recordValue(entry.selectedRow);
  const selectedWrite = recordValue(entry.selectedWrite);
  const reportRow = reportRows?.find((row) => row.jobId === input.mappingJob.id) ?? null;
  const reportWrite = reportWrites?.find((write) => write.gatewayDedupeKey === entry.gatewayDedupeKey) ?? null;
  const reportSelectedJobIds = stringArrayValue(report.selectedJobIds);
  const entrySelectedJobIds = stringArrayValue(entry.selectedJobIds);
  const entryRequestedJobIds = stringArrayValue(entry.requestedJobIds);
  const reportRequestedJobIds = stringArrayValue(report.requestedJobIds);
  const reportProposedJobIds = stringArrayValue(report.proposedJobIds);
  const reportAppliedJobIds = stringArrayValue(report.appliedJobIds);
  const entryArtifactIds = stringArrayValue(entry.artifactIds);
  const expectedArtifactIds = input.artifacts.map((artifact) => `intake-artifact:${artifact.id}`).sort();
  const selectedRootId = selectedWrite.rootAction === 'CREATE_ROOT'
    ? null
    : selectedWrite.rootAction === 'REUSE_ROOT'
      ? input.root.id
      : undefined;
  let reportHashValid = false;
  try {
    reportHashValid = typeof entry.reportHash === 'string'
      && report.reportHash === entry.reportHash
      && reportHashFor(report as unknown as AffiliateLegacyRepairAdmissionReport) === entry.reportHash;
  } catch {
    reportHashValid = false;
  }
  return entry.strategyRevision === AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION
    && stringValue(entry.operatorId) !== null
    && reportHashValid
    && sameAdmissionValue(entrySelectedJobIds, reportSelectedJobIds)
    && sameAdmissionValue(entryRequestedJobIds, reportRequestedJobIds)
    && entry.selectionLimit === report.selectionLimit
    && sameAdmissionValue(reportProposedJobIds, reportSelectedJobIds)
    && sameAdmissionValue(reportAppliedJobIds, reportSelectedJobIds)
    && report.writeCount === reportAppliedJobIds?.length
    && report.reviewedReportHash === null
    && report.replayed === false
    && report.schemaVersion === AFFILIATE_LEGACY_REPAIR_ADMISSION_SCHEMA_VERSION
    && report.mode === 'APPLY'
    && report.contractVersion === input.ancestor.result.supplyContractVersion
    && report.contractHash === input.ancestor.result.supplyContractHash
    && reportSelectedJobIds?.includes(input.mappingJob.id) === true
    && reportRow !== null
    && reportWrite !== null
    && selectedRow.jobId === input.mappingJob.id
    && selectedRow.intakeId === input.intake.id
    && selectedRow.sourceId === input.source.id
    && selectedRow.mappingId === (input.mapping?.id ?? null)
    && (selectedWrite.rootAction === 'CREATE_ROOT' || selectedWrite.rootAction === 'REUSE_ROOT')
    && selectedRow.rootId === selectedRootId
    && selectedRow.evidenceRunId === input.ancestor.subject.repairContext.evidenceRunId
    && selectedRow.gatewayDedupeKey === entry.gatewayDedupeKey
    && selectedWrite.gatewayDedupeKey === entry.gatewayDedupeKey
    && selectedWrite.intakeId === input.intake.id
    && selectedWrite.rootIdentityKey === input.root.identityKey
    && selectedWrite.sourceId === input.source.id
    && selectedWrite.mappingId === (input.mapping?.id ?? null)
    && selectedWrite.evidenceRunId === input.run.id
    && sameAdmissionValue(selectedWrite.artifactIds, expectedArtifactIds)
    && sameAdmissionValue(reportWrite, selectedWrite)
    && reportRow.jobId === selectedRow.jobId
    && sameAdmissionValue(
      Object.fromEntries(Object.entries(reportRow).filter(([key]) => key !== 'outcome')),
      Object.fromEntries(Object.entries(selectedRow).filter(([key]) => key !== 'outcome')),
    )
    && entry.rootId === input.root.id
    && entry.rootLifecycleGeneration === (
      input.expectedRootLifecycleGeneration ?? input.root.lifecycleGeneration
    )
    && entry.sourceId === input.source.id
    && entry.mappingId === (input.mapping?.id ?? null)
    && entry.evidenceRunId === input.run.id
    && entry.sportsCatalogSha256 === input.ancestor.subject.repairContext.sportsCatalog.sha256
    && sameAdmissionValue(entry.artifactIds, expectedArtifactIds)
    && sameRepairContext(entry.repairContext, input.ancestor.subject.repairContext)
    && sameAdmissionValue(entry.gatewayDedupeKey, input.ancestor.gatewayJob.dedupeKey)
};

const gatewayIdentityMatches = (
  gatewayJob: GatewayJobRow,
  jobId: string,
  rootId: string | null,
  expectedLifecycleGeneration: number | null,
  repairContext: unknown,
  manifest: unknown,
  dedupeKey: string | null,
  expectedListingKind: AffiliateAgentListingKind | null,
): boolean => {
  const parsedSubject = affiliateAgentQueuedMappingProducerSubjectSchema.safeParse(gatewayJob.subjectJson);
  if (!parsedSubject.success) return false;
  const subject = recordValue(parsedSubject.data);
  return gatewayJob.role === 'MAPPING_PRODUCER'
    && gatewayJob.queue === 'AFFILIATE_MAPPING'
    && gatewayJob.lane === 'MAPPING_PRODUCTION'
    && subject.type === 'MAPPING_PRODUCER'
    && expectedListingKind !== null
    && (subject.listingKind === undefined || subject.listingKind === expectedListingKind)
    && gatewayJob.subjectType === 'MAPPING_PRODUCER'
    && gatewayJob.subjectId === jobId
    && gatewayJob.supplySourceId === rootId
    && gatewayJob.expectedLifecycleGeneration === expectedLifecycleGeneration
    && gatewayJob.dedupeKey === dedupeKey
    && subject.mappingJobId === jobId
    && subject.supplySourceId === rootId
    && subject.pass === 1
    && sameRepairContext(subject.repairContext, repairContext)
    && sameAdmissionValue(gatewayJob.evidenceManifestJson, manifest);
};

const activeGatewayClaimFor = (snapshot: AdmissionSnapshot, gatewayJob: GatewayJobRow | null): boolean => {
  if (!gatewayJob) return false;
  if (gatewayJob.activeClaimId) return true;
  return snapshot.gatewayClaims.some((claim) => claim.jobId === gatewayJob.id && claim.status === 'ACTIVE');
};

const gatewayDedupeKeyFor = (
  jobId: string,
  identityKey: string,
  context: SportContext,
  bundle: ParsedBundle,
): string => [
  'legacy-sport-repair',
  jobId,
  identityKey,
  context.evidenceRunId,
  contractVersion(bundle),
  contractHash(bundle),
].join(':');

const artifactSort = (left: ArtifactRow, right: ArtifactRow): number => (
  right.createdAt.getTime() - left.createdAt.getTime() || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
);

const artifactForKind = (
  artifacts: readonly ArtifactRow[],
  kind: 'PAGE_HTML' | 'PAGE_MARKDOWN',
): ArtifactRow | null => artifacts
  .filter((artifact) => artifact.kind === kind)
  .sort(artifactSort)[0] ?? null;

const artifactManifestEntry = (
  artifact: ArtifactRow,
  file: FileRow,
  kind: 'PAGE_HTML' | 'PAGE_MARKDOWN',
  jobId: string,
): AffiliateLegacyRepairAdmissionArtifact => {
  const sha256 = normalizeHash(artifact.contentHash);
  if (!sha256) throw new AffiliateLegacyRepairAdmissionError('INVALID_ARTIFACT_HASH', `Artifact ${artifact.id} has an invalid content hash.`);
  const byteSizeCandidate = artifact.sizeBytes ?? file.sizeBytes;
  if (typeof byteSizeCandidate !== 'number' || !Number.isInteger(byteSizeCandidate) || byteSizeCandidate < 0) {
    throw new AffiliateLegacyRepairAdmissionError('INVALID_ARTIFACT_SIZE', `Artifact ${artifact.id} has no durable byte size.`);
  }
  const byteSize = byteSizeCandidate;
  const mimeType = stringValue(artifact.mimeType ?? file.mimeType)
    ?? (kind === 'PAGE_HTML' ? 'text/html' : 'text/markdown');
  return {
    kind,
    artifactId: `intake-artifact:${artifact.id}`,
    sourceArtifactId: file.id,
    storageKey: file.path,
    sha256,
    mimeType,
    byteSize,
    sourceUrl: artifact.sourceUrl,
    finalUrl: artifact.finalUrl,
    intakeArtifactId: artifact.id,
    runId: artifact.runId,
  };
};

const manifestFor = (
  artifacts: readonly AffiliateLegacyRepairAdmissionArtifact[],
  jobId: string,
): Record<string, unknown> => {
  const entries = artifacts.map((artifact) => ({
    evidenceRef: `legacy-sport-repair:${jobId}:${artifact.kind.toLowerCase()}`,
    kind: artifact.kind,
    artifactId: artifact.artifactId,
    sha256: artifact.sha256,
    mimeType: artifact.mimeType,
    byteSize: artifact.byteSize,
    retention: 'INDEFINITE' as const,
  })).sort((left, right) => left.evidenceRef < right.evidenceRef ? -1 : left.evidenceRef > right.evidenceRef ? 1 : 0);
  const preimage = { schemaVersion: 1 as const, entries };
  const manifest = { ...preimage, hash: hashAffiliateAgentValue(preimage) };
  const parsed = affiliateAgentEvidenceManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new AffiliateLegacyRepairAdmissionError('INVALID_EVIDENCE_MANIFEST', `Initial evidence manifest is invalid: ${parsed.error.message}`);
  }
  return parsed.data as unknown as Record<string, unknown>;
};

const reportRowFor = (
  input: Omit<AffiliateLegacyRepairAdmissionRow, 'outcome'> & { outcome?: AffiliateLegacyRepairAdmissionRow['outcome'] },
): AffiliateLegacyRepairAdmissionRow => ({
  ...input,
  reasonCodes: sortedUnique(input.reasonCodes),
  artifacts: [...input.artifacts].sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0),
});


const normalizeAdmissionHashValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    return value
      .map(normalizeAdmissionHashValue)
      .filter((nested) => nested !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .flatMap(([key, nested]) => {
          const normalized = normalizeAdmissionHashValue(nested);
          return normalized === undefined ? [] : [[key, normalized]];
        }),
    );
  }
  return undefined;
};
const stableRepairContext = (value: unknown): unknown => {
  const context = recordValue(value);
  const catalog = recordValue(context.sportsCatalog);
  return {
    kind: context.kind,
    intakeId: context.intakeId,
    evidenceRunId: context.evidenceRunId,
    sportsCatalog: {
      schemaVersion: catalog.schemaVersion,
      sha256: catalog.sha256,
      sports: catalog.sports,
    },
    ...(context.sourceSportScope === undefined
      ? {}
      : { sourceSportScope: context.sourceSportScope }),
  };
};

const sameAdmissionValue = (left: unknown, right: unknown): boolean => (
  hashAffiliateAgentValue(normalizeAdmissionHashValue(left) ?? null)
  === hashAffiliateAgentValue(normalizeAdmissionHashValue(right) ?? null)
);

const sameRepairContext = (left: unknown, right: unknown): boolean => (
  sameAdmissionValue(stableRepairContext(left), stableRepairContext(right))
);

const sameRetryLineageContext = (left: unknown, right: unknown): boolean => {
  const leftContext = recordValue(left);
  const rightContext = recordValue(right);
  return sameAdmissionValue(
    {
      kind: leftContext.kind,
      intakeId: leftContext.intakeId,
      evidenceRunId: leftContext.evidenceRunId,
    },
    {
      kind: rightContext.kind,
      intakeId: rightContext.intakeId,
      evidenceRunId: rightContext.evidenceRunId,
    },
  );
};
const retryHistoricalSportEvidenceFor = async (
  parent: RetryParentParts,
  artifactStore?: AffiliateAgentArtifactStore,
): Promise<AffiliateAgentSportEvidence | null> => {
  const sportEvidence = affiliateAgentSportEvidenceSchema.safeParse(
    recordValue(parent.result.payload).sportEvidence,
  );
  if (!sportEvidence.success || sportEvidence.data.sportDeterminations.length === 0 || !artifactStore) return null;
  const manifest = affiliateAgentEvidenceManifestSchema.safeParse(parent.gatewayJob.evidenceManifestJson);
  if (!manifest.success) return null;
  const evidenceRefs = new Set(parent.result.evidenceRefs);
  const artifacts: AffiliateSportCompletionStoredArtifact[] = [];
  const loaded = new Set<string>();
  try {
    for (const determination of sportEvidence.data.sportDeterminations) {
      for (const citation of determination.evidence) {
        const key = `${citation.artifactId}:${citation.artifactKind}`;
        const entry = manifest.data.entries.find((candidate) => (
          candidate.artifactId === citation.artifactId
          && candidate.kind === citation.artifactKind
        ));
        if (!entry || !evidenceRefs.has(entry.evidenceRef)) return null;
        if (loaded.has(key)) continue;
        loaded.add(key);
        const artifact = await artifactStore.readImmutable({
          fileId: entry.artifactId,
          maximumBytes: LEGACY_SPORT_EVIDENCE_MAX_ARTIFACT_BYTES,
        });
        artifacts.push({
          artifactId: entry.artifactId,
          runId: artifact.runId ?? '',
          intakeId: artifact.intakeId ?? null,
          kind: citation.artifactKind,
          sourceUrl: artifact.sourceUrl,
          finalUrl: artifact.finalUrl,
          mimeType: artifact.mimeType,
          artifactSha256: entry.sha256,
          bytes: artifact.bytes,
        });
      }
    }
    const reviewReady = sportEvidence.data.sportDeterminations.every(
      (determination) => determination.status === 'RESOLVED' || determination.status === 'BLACKLISTED',
    ) && sportEvidence.data.sportDeterminations.some(
      (determination) => determination.status === 'RESOLVED',
    );
    const resultKind = reviewReady ? 'REVIEW_REQUIRED' : 'HUMAN_REVIEW_REQUIRED';
    await verifyAffiliateSportCompletion({
      result: {
        status: resultKind,
        evidenceRunId: sportEvidence.data.evidenceRunId,
        sportsCatalogSha256: sportEvidence.data.sportsCatalogSha256,
        sportDeterminations: sportEvidence.data.sportDeterminations,
        humanReviewRequired: resultKind === 'HUMAN_REVIEW_REQUIRED'
          ? {
            reasonCodes: [...parent.result.reasonCodes],
            sourceSportLabels: sportEvidence.data.sportDeterminations.flatMap(
              (determination) => determination.sourceLabels,
            ),
          }
          : null,
      },
      resultKind,
      reasonCodes: parent.result.reasonCodes,
      determinations: sportEvidence.data.sportDeterminations,
      claimEvidenceContext: {
        intakeId: parent.subject.repairContext.intakeId,
        evidenceRunId: parent.subject.repairContext.evidenceRunId,
        sportsCatalog: parent.subject.repairContext.sportsCatalog,
      },
      freshCatalog: parent.subject.repairContext.sportsCatalog,
      expectedIntakeId: parent.subject.repairContext.intakeId,
      artifacts,
      observedSportNames: reviewReady
        ? Array.from(new Set(sportEvidence.data.sportDeterminations.flatMap(
          (determination) => determination.canonicalSportNames,
        ))).sort()
        : undefined,
    });
    return sportEvidence.data;
  } catch {
    return null;
  }
};

const retryHistoricalSportEvidenceValid = async (
  parent: RetryParentParts,
  artifactStore?: AffiliateAgentArtifactStore,
): Promise<boolean> => {
  if (parent.claim.roleContractVersion < 3) return true;
  return await retryHistoricalSportEvidenceFor(parent, artifactStore) !== null;
};


const stateFingerprintFor = (input: Readonly<{
  job: MappingJobRow;
  intake?: IntakeRow | null;
  source?: SourceRow | null;
  mapping?: MappingRow | null;
  activeMapping?: MappingRow | null;
  root?: SupplyRootRow | null;
  run?: CaptureRunRow | null;
  runArtifacts?: readonly ArtifactRow[];
  files?: readonly FileRow[];
  pages?: readonly IntakePageRow[];
  gatewayJob?: GatewayJobRow | null;
  gatewayClaims?: readonly GatewayClaimRow[];
  organizations?: readonly OrganizationRow[];
  candidates?: readonly CandidateRow[];
  targets?: readonly SupplyTargetRow[];
  sportsCatalog?: AffiliateSportsCatalogSnapshot;
}>): string => {
  const catalog = input.sportsCatalog
    ? {
      schemaVersion: input.sportsCatalog.schemaVersion,
      sha256: input.sportsCatalog.sha256,
      sports: input.sportsCatalog.sports,
    }
    : null;
  const state = normalizeAdmissionHashValue({
    job: input.job,
    intake: input.intake ?? null,
    source: input.source ?? null,
    mapping: input.mapping ?? null,
    activeMapping: input.activeMapping ?? null,
    root: input.root ?? null,
    run: input.run ?? null,
    runArtifacts: input.runArtifacts ?? [],
    files: input.files ?? [],
    pages: input.pages ?? [],
    gatewayJob: input.gatewayJob ?? null,
    gatewayClaims: input.gatewayClaims ?? [],
    organizations: input.organizations ?? [],
    candidates: input.candidates ?? [],
    targets: input.targets ?? [],
    sportsCatalog: catalog,
  });
  return hashAffiliateAgentValue(state);
};

const deterministicRow = (row: AffiliateLegacyRepairAdmissionRow): Record<string, unknown> => ({
  jobId: row.jobId,
  intakeId: row.intakeId,
  status: row.status,
  sourceKey: row.sourceKey,
  sportRequeued: row.sportRequeued,
  eligible: row.eligible,
  alreadyAdmitted: row.alreadyAdmitted,
  reason: row.reason,
  reasonCodes: row.reasonCodes,
  sourceId: row.sourceId,
  mappingId: row.mappingId,
  rootId: row.rootId,
  rootIdentityKey: row.rootIdentityKey,
  evidenceRunId: row.evidenceRunId,
  sportsCatalogSha256: row.sportsCatalogSha256,
  stateFingerprint: row.stateFingerprint,
  artifacts: row.artifacts,
  gatewayDedupeKey: row.gatewayDedupeKey,
  write: row.write ?? null,
});

const reportHashFor = (input: Readonly<{
  contractVersion: number;
  contractHash: string;
  counts: AffiliateLegacyRepairAdmissionCounts;
  selectedJobIds: readonly string[];
  requestedJobIds?: readonly string[] | null;
  selectionLimit?: number;
  rows: readonly AffiliateLegacyRepairAdmissionRow[];
  proposedWrites: readonly AffiliateLegacyRepairAdmissionWrite[];
}>): string => hashAffiliateAgentValue({
  schemaVersion: AFFILIATE_LEGACY_REPAIR_ADMISSION_SCHEMA_VERSION,
  contractVersion: input.contractVersion,
  contractHash: input.contractHash,
  requestedJobIds: input.requestedJobIds ? [...input.requestedJobIds].sort() : null,
  selectionLimit: input.selectionLimit ?? 0,
  counts: input.counts,
  selectedJobIds: [...input.selectedJobIds].sort(),
  rows: [...input.rows]
    .sort((left, right) => left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0)
    .map(deterministicRow),
  proposedWrites: [...input.proposedWrites].sort((left, right) => left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0),
});
const emptyWrite = (plan: AdmissionPlan): AffiliateLegacyRepairAdmissionWrite => ({
  jobId: plan.job.id,
  intakeId: plan.intake.id,
  rootIdentityKey: plan.identity.identityKey,
  rootAction: plan.root ? 'REUSE_ROOT' : 'CREATE_ROOT',
  sourceId: plan.source.id,
  mappingId: plan.mapping?.id ?? null,
  evidenceRunId: plan.context.evidenceRunId,
  artifactIds: plan.artifacts.map((artifact) => `intake-artifact:${artifact.id}`).sort(),
  gatewayDedupeKey: plan.gatewayDedupeKey,
  writes: [
    'AFFILIATE_SUPPLY_ROOT',
    'AFFILIATE_SOURCE_INTAKE_LINK',
    'AFFILIATE_MAPPING_JOB_LINK',
    'AFFILIATE_MAPPING_ROOT_LINK',
    'AFFILIATE_SOURCE_ARTIFACT_PIN',
    'AFFILIATE_SOURCE_ARTIFACT_ROOT_LINK',
    'AFFILIATE_SOURCE_AUTOMATION_HOLD',
    'AFFILIATE_GATEWAY_MAPPING_PRODUCER_JOB',
    'AFFILIATE_REPAIR_ADMISSION_EVIDENCE',
  ],
});

const reason = (codes: readonly string[]): string => codes[0] ?? 'ELIGIBLE';

const evaluateJob = (
  snapshot: AdmissionSnapshot,
  job: MappingJobRow,
  bundle: ParsedBundle,
): { row: AffiliateLegacyRepairAdmissionRow; plan: AdmissionPlan | null } => {
  const intake = snapshot.intakes.find((candidate) => candidate.id === job.intakeId) ?? null;
  const sportRequeued = hasSportRequeueMarker(job);
  if (!sportRequeued) {
    return {
      row: reportRowFor({
        jobId: job.id,
        intakeId: intake?.id ?? job.intakeId ?? null,
        status: job.status,
        sourceKey: intake?.sourceKey ?? null,
        sportRequeued: false,
        eligible: false,
        alreadyAdmitted: false,
        reason: 'OUT_OF_SCOPE_NOT_SPORT_REQUEUED',
        reasonCodes: ['OUT_OF_SCOPE_NOT_SPORT_REQUEUED'],
        sourceId: job.sourceId,
        mappingId: job.mappingId,
        rootId: null,
        rootIdentityKey: null,
        evidenceRunId: null,
        sportsCatalogSha256: null,
        sportsCatalogCapturedAt: null,
        artifacts: [],
        gatewayDedupeKey: null,
        stateFingerprint: stateFingerprintFor({
          job,
          intake,
          sportsCatalog: snapshot.sportsCatalog,
        }),
        outcome: 'HELD',
      }),
      plan: null,
    };
  }
  const reasons: string[] = [];
  if (!intake) reasons.push('INTAKE_MISSING');
  if (intake && intake.status !== 'READY_FOR_MAPPING') reasons.push('INTAKE_NOT_READY_FOR_MAPPING');
  if (normalizedUpper(job.status) !== 'QUEUED') reasons.push('MAPPING_JOB_NOT_QUEUED');
  if (job.claimedAt || job.workerId || job.leaseExpiresAt) reasons.push('MAPPING_JOB_HAS_ACTIVE_LEASE');
  const activeSibling = snapshot.jobs.some((candidate) => (
    candidate.id !== job.id
    && candidate.intakeId === intake?.id
    && ACTIVE_MAPPING_JOB_STATUSES.has(normalizedUpper(candidate.status))
  ));
  if (activeSibling) reasons.push('ACTIVE_MAPPING_JOB_PRESENT');
  if (snapshot.approvals.some((approval) => (
    approval.subjectType === 'MAPPING_PACKAGE'
    && approval.subjectKey === job.id
    && ACTIVE_APPROVAL_STATUSES.has(normalizedUpper(approval.status))
  ))) reasons.push('ACTIVE_APPROVAL_PRESENT');
  if (!intake) {
    return { row: reportRowFor({
      jobId: job.id,
      intakeId: job.intakeId ?? null,
      status: job.status,
      sourceKey: null,
      sportRequeued: true,
      eligible: false,
      alreadyAdmitted: false,
      reason: reason(reasons),
      reasonCodes: reasons,
      sourceId: job.sourceId,
      mappingId: job.mappingId,
      rootId: null,
      rootIdentityKey: null,
      evidenceRunId: null,
      sportsCatalogSha256: null,
      sportsCatalogCapturedAt: null,
      artifacts: [],
      gatewayDedupeKey: null,
      stateFingerprint: stateFingerprintFor({
        job,
        intake: null,
        sportsCatalog: snapshot.sportsCatalog,
      }),
      outcome: 'HELD',
    }), plan: null };
  }
  if (!archiveLineageValid(job, intake)) reasons.push('ARCHIVE_LINEAGE_CONFLICT');
  const identityState = identitiesFromJob(job);
  reasons.push(...identityState.reasonCodes);
  const identity = identityState.pairs.length === 1 ? identityState.pairs[0] : null;
  const sourceState = sourceForJob(snapshot, intake, job, identity);
  reasons.push(...sourceState.reasonCodes);
  const source = sourceState.source;
  if (source && !listingKindFor(source.targetKind)) reasons.push('SOURCE_LISTING_KIND_INVALID');
  const mappingState = mappingForIdentity(snapshot, source, identity);
  reasons.push(...mappingState.reasonCodes);
  const mapping = mappingState.mapping;
  if (!identity && job.mappingId && mapping && job.mappingId !== mapping.id) {
    reasons.push('MAPPING_JOB_MAPPING_CONFLICT');
  }
  const activeMapping = source?.activeMappingId
    ? snapshot.mappings.find((candidate) => candidate.id === source.activeMappingId) ?? null
    : null;
  if (source?.activeMappingId && (!activeMapping || activeMapping.sourceId !== source.id)) {
    reasons.push('ACTIVE_MAPPING_OWNERSHIP_CONFLICT');
  }
  const run = selectedSuccessfulRun(intake, source, snapshot.runs);
  if (!run) reasons.push('SUCCESSFUL_CAPTURE_RUN_MISSING');
  const context: SportContext | null = run
    ? {
      evidenceRunId: run.id,
      sportsCatalog: snapshot.sportsCatalog,
      sportsCatalogSha256: snapshot.sportsCatalog.sha256.toLowerCase(),
      capturedAt: snapshot.sportsCatalog.capturedAt,
      sportDeterminations: [],
    } : null;
  const pages = snapshot.pages.filter((page) => page.intakeId === intake.id && page.status === 'ACTIVE');
  const runArtifacts = run ? snapshot.artifacts.filter((artifact) => artifact.intakeId === intake.id && artifact.runId === run.id) : [];
  const ownedOrigins = new Set<string>([
    urlOrigin(intake.baseUrl),
    ...(source ? [urlOrigin(source.baseUrl), urlOrigin(source.listUrl)] : []),
    ...pages.flatMap((page) => [urlOrigin(page.url), urlOrigin(page.canonicalUrl)]),
  ].filter((value): value is string => Boolean(value)));
  const artifacts: AffiliateLegacyRepairAdmissionArtifact[] = [];
  const selectedArtifacts: ArtifactRow[] = [];
  const filesById = new Map(snapshot.files.map((file) => [file.id, file]));
  for (const kind of ['PAGE_HTML', 'PAGE_MARKDOWN'] as const) {
    const artifact = artifactForKind(runArtifacts, kind);
    if (!artifact) {
      reasons.push(`MISSING_${kind}`);
      continue;
    }
    const file = filesById.get(artifact.fileId);
    if (!file || !file.path.trim()) reasons.push(`MISSING_STORAGE_FILE_${kind}`);
    if (!artifact.sourceUrl && !artifact.finalUrl) reasons.push(`MISSING_SOURCE_URL_${kind}`);
    if (artifact.sourceUrl && !urlOwnedBySource(artifact.sourceUrl, ownedOrigins)
      || artifact.finalUrl && !urlOwnedBySource(artifact.finalUrl, ownedOrigins)) reasons.push(`SOURCE_EVIDENCE_URL_NOT_OWNED_${kind}`);
    if (artifact.pageId && !pages.some((page) => page.id === artifact.pageId)) reasons.push(`ARTIFACT_PAGE_NOT_OWNED_${kind}`);
    if (file) {
      try {
        artifacts.push(artifactManifestEntry(artifact, file, kind, job.id));
        selectedArtifacts.push(artifact);
      } catch (error) {
        reasons.push(error instanceof AffiliateLegacyRepairAdmissionError ? error.code : `INVALID_${kind}`);
      }
    }
  }
  if (!source) reasons.push('SCRAPE_SOURCE_MISSING');
  let normalizedIdentity: AffiliateSupplyIdentity | null = null;
  if (source) {
    try {
      const exactSourceUrl = stringValue(source.listUrl) ?? stringValue(source.baseUrl) ?? stringValue(intake.baseUrl);
      if (!exactSourceUrl) throw new Error('No source URL.');
      normalizedIdentity = normalizeAffiliateSupplyIdentity({
        requestedUrl: exactSourceUrl,
        resolvedCanonicalUrl: exactSourceUrl,
        operatorDomain: new URL(exactSourceUrl).hostname,
      });
    } catch {
      reasons.push('SOURCE_IDENTITY_UNVERIFIABLE');
    }
  }
  const rootState = normalizedIdentity && source
    ? rootForIdentity(snapshot, normalizedIdentity, intake, source, contractCohort(bundle))
    : { root: null, reasonCodes: [] as string[] };
  if (mapping?.supplySourceId && (!rootState.root || mapping.supplySourceId !== rootState.root.id)) {
    reasons.push('MAPPING_ROOT_OWNERSHIP_CONFLICT');
  }
  if (job.supplySourceId && (!rootState.root || job.supplySourceId !== rootState.root.id)) {
    reasons.push('MAPPING_JOB_ROOT_OWNERSHIP_CONFLICT');
  }
  const evidenceRootIds = [
    run?.supplySourceId ?? null,
    ...pages.map((page) => page.supplySourceId ?? null),
    ...runArtifacts.map((artifact) => artifact.supplySourceId ?? null),
  ].filter((value): value is string => Boolean(value));
  if (evidenceRootIds.some((value) => !rootState.root || value !== rootState.root.id)) {
    reasons.push('EVIDENCE_ROOT_OWNERSHIP_CONFLICT');
  }
  reasons.push(...rootState.reasonCodes);
  const gatewayCandidates = gatewayRepairJobsFor(snapshot, job.id);
  const gatewayExisting = gatewayCandidates.length === 1 ? gatewayCandidates[0] : null;
  if (gatewayCandidates.length > 1) reasons.push('CONFLICTING_GATEWAY_REPAIR_JOB');
  if (gatewayExisting && activeGatewayClaimFor(snapshot, gatewayExisting)) reasons.push('ACTIVE_GATEWAY_CLAIM');
  const gatewayDedupeKey = normalizedIdentity && context
    ? gatewayDedupeKeyFor(job.id, normalizedIdentity.identityKey, context, bundle)
    : null;
  const candidateRepairContext = context
    ? {
      kind: 'LEGACY_SPORT_REPAIR' as const,
      intakeId: intake.id,
      evidenceRunId: context.evidenceRunId,
      sportsCatalog: context.sportsCatalog,
    }
    : null;
  let candidateManifest: Record<string, unknown> | null = null;
  if (artifacts.length === 2) {
    try {
      candidateManifest = manifestFor(artifacts, job.id);
    } catch {
      reasons.push('INVALID_EVIDENCE_MANIFEST');
    }
  }
  const gatewayHistory = rootState.root && candidateRepairContext && candidateManifest && gatewayDedupeKey
    ? admissionEvidenceForGateway(job, rootState.root.id, candidateRepairContext, candidateManifest, gatewayDedupeKey)
    : null;
  const gatewayMatches = Boolean(
    gatewayExisting
    && rootState.root
    && candidateRepairContext
    && candidateManifest
    && gatewayIdentityMatches(
      gatewayExisting,
      job.id,
      rootState.root.id,
      typeof gatewayHistory?.rootLifecycleGeneration === 'number'
        ? gatewayHistory.rootLifecycleGeneration
        : rootState.root.lifecycleGeneration,
      candidateRepairContext,
      candidateManifest,
      gatewayDedupeKey,
      listingKindFor(source?.targetKind),
    )
    && gatewayHistory !== null
  );
  const alreadyAdmitted = Boolean(gatewayMatches && gatewayExisting && !activeGatewayClaimFor(snapshot, gatewayExisting));
  if (gatewayExisting && !gatewayMatches) reasons.push('CONFLICTING_GATEWAY_REPAIR_JOB');
  if (source && sourceIsPublicOrLive(source, mapping, activeMapping)) reasons.push('PUBLIC_AUTOMATED_OR_VALIDATED_SOURCE');
  if (source && sourceHoldReason(source) && sourceHoldReason(source) !== 'LEGACY_SPORT_REPAIR') {
    reasons.push('SOURCE_AUTOMATION_HOLD_CONFLICT');
  }
  if (source) reasons.push(...publicationReasonCodes(snapshot, source, mapping, rootState.root));
  if (alreadyAdmitted) reasons.push('ALREADY_ADMITTED');
  const uniqueReasons = sortedUnique(reasons);
  const eligible = uniqueReasons.length === 0 && Boolean(source && normalizedIdentity && context && run && artifacts.length === 2 && gatewayDedupeKey);
  if (!eligible && uniqueReasons.length === 0) uniqueReasons.push('REPAIR_ADMISSION_NOT_READY');
  const row = reportRowFor({
    jobId: job.id,
    intakeId: intake.id,
    status: job.status,
    sourceKey: intake.sourceKey,
    sportRequeued: true,
    eligible: eligible && !alreadyAdmitted,
    alreadyAdmitted,
    reason: alreadyAdmitted ? 'ALREADY_ADMITTED' : reason(uniqueReasons),
    reasonCodes: alreadyAdmitted ? ['ALREADY_ADMITTED'] : uniqueReasons,
    sourceId: source?.id ?? null,
    mappingId: mapping?.id ?? identity?.mappingId ?? null,
    rootId: rootState.root?.id ?? null,
    rootIdentityKey: normalizedIdentity?.identityKey ?? null,
    evidenceRunId: context?.evidenceRunId ?? null,
    sportsCatalogSha256: context?.sportsCatalogSha256 ?? null,
    sportsCatalogCapturedAt: context?.capturedAt ?? null,
    stateFingerprint: stateFingerprintFor({
      job,
      intake,
      source,
      mapping,
      activeMapping,
      root: rootState.root,
      run,
      runArtifacts,
      files: snapshot.files.filter((file) => runArtifacts.some((artifact) => artifact.fileId === file.id)),
      pages,
      gatewayJob: gatewayExisting,
      gatewayClaims: gatewayExisting
        ? snapshot.gatewayClaims.filter((claim) => claim.jobId === gatewayExisting.id)
        : [],
      organizations: source?.organizationId
        ? snapshot.organizations.filter((organization) => organization.id === source.organizationId)
        : [],
      candidates: snapshot.candidates.filter((candidate) => (
        candidate.sourceId === source?.id
        || Boolean(mapping && candidate.mappingId === mapping.id)
        || Boolean(rootState.root && candidate.supplySourceId === rootState.root.id)
      )),
      targets: rootState.root
        ? snapshot.targets.filter((target) => target.supplySourceId === rootState.root?.id)
        : [],
      sportsCatalog: snapshot.sportsCatalog,
    }),
    artifacts,
    gatewayDedupeKey,
  });
  if (!eligible || alreadyAdmitted || !source || !normalizedIdentity || !context || !run || !gatewayDedupeKey) return { row, plan: null };
  const repairContext: AffiliateAgentLegacySportRepairContext = {
    kind: 'LEGACY_SPORT_REPAIR',
    intakeId: intake.id,
    evidenceRunId: context.evidenceRunId,
    sportsCatalog: context.sportsCatalog,
  };
  const write = emptyWrite({
    row,
    job,
    intake,
    source,
    mapping,
    root: rootState.root,
    identity: normalizedIdentity,
    context,
    run,
    artifacts: selectedArtifacts,
    filesById,
    pages,
    manifest: manifestFor(artifacts, job.id),
    repairContext,
    gatewayDedupeKey,
  });
  const rowWithWrite = reportRowFor({ ...row, write, outcome: 'PROPOSED' });
  const plan: AdmissionPlan = {
    row: rowWithWrite,
    job,
    intake,
    source,
    mapping,
    root: rootState.root,
    identity: normalizedIdentity,
    context,
    run,
    artifacts: selectedArtifacts,
    filesById,
    pages,
    manifest: manifestFor(artifacts, job.id),
    repairContext,
    gatewayDedupeKey,
  };
  return { row: rowWithWrite, plan };
};

const buildReport = async (
  client: AdmissionClient,
  bundle: ParsedBundle,
  limit: number,
  jobIds: readonly string[] | undefined,
  mode: 'PREVIEW' | 'APPLY',
): Promise<{ report: AffiliateLegacyRepairAdmissionReport; plans: readonly AdmissionPlan[]; snapshot: AdmissionSnapshot }> => {
  const snapshot = await readSnapshot(client, jobIds);
  const candidateJobs = snapshot.jobs
    .filter((job) => jobIds === undefined
      ? hasSportRequeueMarker(job)
      : jobIds.includes(job.id))
    .sort(compareById);
  const evaluated = candidateJobs.map((job) => evaluateJob(snapshot, job, bundle));
  const plansByIdentity = new Map<string, readonly { jobId: string }[]>();
  for (const { row, plan } of evaluated) {
    if (!row.eligible || !plan) continue;
    const existing = plansByIdentity.get(plan.identity.identityKey) ?? [];
    plansByIdentity.set(plan.identity.identityKey, [...existing, { jobId: row.jobId }]);
  }
  const duplicateByJobId = new Map<string, string>();
  for (const [identityKey, entries] of plansByIdentity) {
    if (entries.length < 2) continue;
    const conflictingIds = entries.map((entry) => entry.jobId).sort();
    const marker = `DUPLICATE_ROOT_IDENTITY:${identityKey}:${conflictingIds.join(',')}`;
    for (const entry of entries) duplicateByJobId.set(entry.jobId, marker);
  }
  const guardedEvaluated = evaluated.map((entry) => {
    const marker = duplicateByJobId.get(entry.row.jobId);
    if (!marker) return entry;
    return {
      row: {
        ...entry.row,
        eligible: false,
        reason: marker,
        reasonCodes: sortedUnique([...entry.row.reasonCodes, marker]),
        outcome: 'HELD' as const,
      },
      plan: null,
    };
  });
  const rows = guardedEvaluated.map(({ row }) => row);
  const eligible = guardedEvaluated
    .filter(({ row, plan }) => row.eligible && plan)
    .sort((left, right) => left.row.jobId < right.row.jobId ? -1 : left.row.jobId > right.row.jobId ? 1 : 0);
  const alreadyAdmitted = rows.filter((row) => row.alreadyAdmitted).length;
  const selected = eligible.slice(0, limit);
  const selectedJobIds = selected.map(({ row }) => row.jobId);
  const plans = selected.map(({ plan }) => plan!).sort((left, right) => left.job.id < right.job.id ? -1 : left.job.id > right.job.id ? 1 : 0);
  const proposedWrites = plans.map((plan) => emptyWrite(plan));
  const counts: AffiliateLegacyRepairAdmissionCounts = {
    total: rows.filter((row) => row.sportRequeued).length,
    eligible: rows.filter((row) => row.eligible).length,
    held: rows.filter((row) => row.sportRequeued && !row.eligible && !row.alreadyAdmitted).length,
    selected: selected.length,
    alreadyAdmitted,
  };
  const reportHash = reportHashFor({
    contractVersion: contractVersion(bundle),
    contractHash: contractHash(bundle),
    counts,
    requestedJobIds: jobIds ? [...jobIds].sort() : null,
    selectionLimit: limit,
    selectedJobIds,
    rows,
    proposedWrites,
  });
  const selectedSet = new Set(selectedJobIds);
  const normalizedRows: AffiliateLegacyRepairAdmissionRow[] = rows.map((row) => {
    if (!selectedSet.has(row.jobId)) return row;
    return { ...row, outcome: mode === 'APPLY' ? ('APPLIED' as const) : ('PROPOSED' as const) };
  });
  return {
    snapshot,
    plans,
    report: {
      schemaVersion: AFFILIATE_LEGACY_REPAIR_ADMISSION_SCHEMA_VERSION,
      contractVersion: contractVersion(bundle),
      contractHash: contractHash(bundle),
      mode,
      evaluatedAt: new Date().toISOString(),
      counts,
      requestedJobIds: jobIds ? [...jobIds].sort() : null,
      selectionLimit: limit,
      selectedJobIds,
      proposedJobIds: selectedJobIds,
      rows: normalizedRows,
      proposedWrites,
      reportHash,
      reviewedReportHash: null,
      writeCount: mode === 'APPLY' ? plans.length : 0,
      appliedJobIds: mode === 'APPLY' ? selectedJobIds : [],
      replayed: false,
    },
  };
};

const appendAdmissionEvidence = (
  summary: unknown,
  evidence: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const envelope = recordValue(summary);
  const history = Array.isArray(envelope.legacyRepairAdmissionHistory)
    ? envelope.legacyRepairAdmissionHistory.map((entry) => recordValue(entry))
    : [];
  if (history.some((entry) => entry.reportHash === evidence.reportHash)) return envelope;
  return {
    ...envelope,
    legacyRepairAdmissionHistory: [...history, evidence],
  };
};

const assertActiveContract = async (client: AdmissionClient, bundle: ParsedBundle): Promise<void> => {
  const active = await loadActiveAffiliateSupplyContract({
    db: affiliateSupplyDatabase(client),
    rolloutCohort: contractCohort(bundle),
  });
  if (
    active.manifest.version !== contractVersion(bundle)
    || active.manifest.supplyContract.hash !== contractHash(bundle)
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'ACTIVE_CONTRACT_DRIFT',
      'The active Supply contract changed or is unavailable for this admission.',
      {
        expectedVersion: contractVersion(bundle),
        expectedHash: contractHash(bundle),
        observedVersion: active.manifest.version,
        observedHash: active.manifest.supplyContract.hash,
      },
    );
  }
};

const asPrismaJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const applyPlan = async (
  client: Prisma.TransactionClient,
  plan: AdmissionPlan,
  bundle: ParsedBundle,
  reportSnapshot: AffiliateLegacyRepairAdmissionReport,
  reportHash: string,
  operatorId: string,
  selectedJobIds: readonly string[],
  requestedJobIds: readonly string[] | undefined,
  selectionLimit: number,
): Promise<void> => {
  const sourceListingKind = listingKindFor(plan.source.targetKind);
  if (!sourceListingKind) {
    throw new AffiliateLegacyRepairAdmissionError('SOURCE_LISTING_KIND_INVALID', 'The source target kind is not supported.');
  }
  const currentJob = await client.affiliateSourceMappingJobs.findUnique({ where: { id: plan.job.id } }) as unknown as MappingJobRow | null;
  if (!currentJob || currentJob.status !== 'QUEUED'
    || currentJob.sourceId !== plan.job.sourceId
    || currentJob.mappingId !== plan.job.mappingId
    || currentJob.legacyIdentityMigrationEligible !== plan.job.legacyIdentityMigrationEligible
    || currentJob.supplySourceId !== plan.job.supplySourceId
    || currentJob.intakeId !== plan.intake.id
    || currentJob.claimedAt || currentJob.workerId || currentJob.leaseExpiresAt) {
    throw new AffiliateLegacyRepairAdmissionError('IDENTITY_DRIFT', `Mapping job ${plan.job.id} changed after preview.`);
  }
  const currentIntake = await client.affiliateSourceIntakes.findUnique({ where: { id: plan.intake.id } }) as unknown as IntakeRow | null;
  if (!currentIntake || currentIntake.status !== 'READY_FOR_MAPPING'
    || currentIntake.sourceKey !== plan.intake.sourceKey
    || (currentIntake.affiliateSourceId !== plan.intake.affiliateSourceId)
    || (currentIntake.supplySourceId !== plan.intake.supplySourceId)) {
    throw new AffiliateLegacyRepairAdmissionError('IDENTITY_DRIFT', `Intake ${plan.intake.id} changed after preview.`);
  }
  const source = await client.affiliateScrapeSources.findUnique({ where: { id: plan.source.id } }) as unknown as SourceRow | null;
  if (!source
    || source.sourceKey !== plan.source.sourceKey
    || source.supplySourceId !== plan.source.supplySourceId
    || source.autoScrapeEnabled !== plan.source.autoScrapeEnabled) {
    throw new AffiliateLegacyRepairAdmissionError('IDENTITY_DRIFT', `Source ${plan.source.id} changed after preview.`);
  }
  if (source.organizationId) {
    const organization = await client.organizations.findUnique({ where: { id: source.organizationId } }) as unknown as OrganizationRow | null;
    if (organization && (
      normalizedUpper(organization.status) !== 'UNLISTED'
      || organization.publicPageEnabled
      || organization.publicWidgetsEnabled
    )) {
      throw new AffiliateLegacyRepairAdmissionError('PUBLIC_STATE_DRIFT', `Organization ${organization.id} became public.`);
    }
  }
  const activeMapping = source.activeMappingId
    ? await client.affiliateScrapeMappings.findUnique({ where: { id: source.activeMappingId } }) as unknown as MappingRow | null
    : null;
  if (source.activeMappingId && (!activeMapping || activeMapping.sourceId !== source.id)) {
    throw new AffiliateLegacyRepairAdmissionError('MAPPING_OWNERSHIP_DRIFT', `Source ${source.id} active mapping ownership changed.`);
  }
  const currentSourceHold = sourceHoldReason(source);
  if (currentSourceHold && currentSourceHold !== 'LEGACY_SPORT_REPAIR') {
    throw new AffiliateLegacyRepairAdmissionError('ROOT_HOLD_CONFLICT', `Source ${source.id} has an incompatible automation hold.`);
  }
  if (sourceIsPublicOrLive(source, plan.mapping, activeMapping)) {
    throw new AffiliateLegacyRepairAdmissionError('PUBLIC_STATE_DRIFT', `Source ${source.id} became public, automated, or validated.`);
  }
  if (plan.mapping) {
    const mapping = await client.affiliateScrapeMappings.findUnique({ where: { id: plan.mapping.id } }) as unknown as MappingRow | null;
    if (!mapping
      || mapping.sourceId !== plan.source.id
      || mapping.supplySourceId !== plan.mapping.supplySourceId
      || mapping.validatedAt) {
      throw new AffiliateLegacyRepairAdmissionError('MAPPING_OWNERSHIP_DRIFT', `Mapping ${plan.mapping.id} changed after preview.`);
    }
  }
  const existingGateway = await client.affiliateAgentGatewayJobs.findUnique({ where: { dedupeKey: plan.gatewayDedupeKey } });
  if (existingGateway) {
    const activeClaims = await client.affiliateAgentGatewayClaims.findMany({
      where: { jobId: existingGateway.id, status: 'ACTIVE' },
      take: 1,
    });
    if (existingGateway.activeClaimId || activeClaims.length > 0) {
      throw new AffiliateLegacyRepairAdmissionError('CLAIM_DRIFT', `Gateway job ${existingGateway.id} is actively claimed.`);
    }
    const subject = recordValue(existingGateway.subjectJson);
    if (recordValue(subject.repairContext).kind === 'LEGACY_SPORT_REPAIR') {
      throw new AffiliateLegacyRepairAdmissionError('ALREADY_ADMITTED', `Mapping job ${plan.job.id} was already admitted.`);
    }
    throw new AffiliateLegacyRepairAdmissionError('GATEWAY_DEDUPE_CONFLICT', `Gateway dedupe key ${plan.gatewayDedupeKey} is occupied by another subject.`);
  }
  const priorRootMetadata = recordValue(plan.root?.metadata);
  const admissionMetadata = {
    ...priorRootMetadata,
    automationReviewRequired: {
      ...recordValue(priorRootMetadata.automationReviewRequired),
      hold: true,
      reason: 'LEGACY_SPORT_REPAIR',
      reportHash,
      jobId: plan.job.id,
    },
    legacyRepairAdmission: {
      ...recordValue(priorRootMetadata.legacyRepairAdmission),
      reportHash,
      jobId: plan.job.id,
      operatorId,
      strategyRevision: AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION,
    },
  };
  const supplyDb = affiliateSupplyDatabase(client);
  const ensured = await ensureAffiliateSupplySource({
    db: supplyDb,
    requestedUrl: plan.identity.canonicalUrl,
    resolvedCanonicalUrl: plan.identity.canonicalUrl,
    isRedirectVerified: true,
    operatorDomain: new URL(plan.identity.canonicalUrl).hostname,
    targetKind: sourceListingKind,
    rolloutCohort: contractCohort(bundle),
    intakeId: plan.intake.id,
    expectedIntakeSupplySourceId: plan.intake.supplySourceId,
    liveSourceId: plan.source.id,
    metadata: admissionMetadata,
  });
  const root = ensured.supplySource as unknown as SupplyRootRow;
  if (root.identityKey !== plan.identity.identityKey) {
    throw new AffiliateLegacyRepairAdmissionError('IDENTITY_DRIFT', `Supply root identity changed for ${plan.job.id}.`);
  }
  const rootUpdate = await client.affiliateSupplySources.updateMany({
    where: {
      id: root.id,
      identityKey: plan.identity.identityKey,
      derivedStage: 'PRE_MAPPED',
      isAutomationEnabled: false,
      automationHoldReason: root.automationHoldReason,
      lifecycleGeneration: plan.root?.lifecycleGeneration ?? root.lifecycleGeneration,
    },
    data: {
      derivedStage: 'PRE_MAPPED',
      isAutomationEnabled: false,
      isExcluded: false,
      automationHoldReason: 'LEGACY_SPORT_REPAIR',
      activeSupplyContractVersion: contractVersion(bundle),
      activeSupplyContractHash: contractHash(bundle),
      metadata: asPrismaJson({
        ...recordValue(root.metadata),
        automationReviewRequired: {
          ...recordValue(recordValue(root.metadata).automationReviewRequired),
          hold: true,
          reason: 'LEGACY_SPORT_REPAIR',
          reportHash,
          jobId: plan.job.id,
        },
        legacyRepairAdmission: {
          ...recordValue(recordValue(root.metadata).legacyRepairAdmission),
          reportHash,
          jobId: plan.job.id,
          operatorId,
          strategyRevision: AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION,
        },
      }),
    },
  });
  if (rootUpdate.count !== 1) {
    throw new AffiliateLegacyRepairAdmissionError('ROOT_CAS_FAILED', `Supply root ${root.id} changed during admission.`);
  }
  const linkedSource = await client.affiliateScrapeSources.findUnique({
    where: { id: plan.source.id },
  }) as unknown as SourceRow | null;
  if (!linkedSource || linkedSource.supplySourceId !== root.id) {
    throw new AffiliateLegacyRepairAdmissionError('SOURCE_CAS_FAILED', `Source ${plan.source.id} could not be linked to the admitted root.`);
  }
  const currentActiveMapping = linkedSource.activeMappingId
    ? await client.affiliateScrapeMappings.findUnique({ where: { id: linkedSource.activeMappingId } }) as unknown as MappingRow | null
    : null;
  const linkedSourceHold = sourceHoldReason(linkedSource);
  if (linkedSourceHold && linkedSourceHold !== 'LEGACY_SPORT_REPAIR') {
    throw new AffiliateLegacyRepairAdmissionError('SOURCE_HOLD_CONFLICT', `Source ${plan.source.id} acquired an incompatible automation hold.`);
  }
  if (sourceIsPublicOrLive(linkedSource, plan.mapping, currentActiveMapping)) {
    throw new AffiliateLegacyRepairAdmissionError('PUBLIC_STATE_DRIFT', `Source ${plan.source.id} became public, automated, or validated.`);
  }
  const sourceUpdate = await client.affiliateScrapeSources.updateMany({
    where: {
      id: plan.source.id,
      supplySourceId: root.id,
      autoScrapeEnabled: false,
      activeMappingId: linkedSource.activeMappingId,
    },
    data: {
      autoScrapeEnabled: false,
      metadata: asPrismaJson({
        ...recordValue(linkedSource.metadata),
        automationReviewRequired: {
          ...recordValue(recordValue(linkedSource.metadata).automationReviewRequired),
          hold: true,
          reason: 'LEGACY_SPORT_REPAIR',
          reportHash,
          evidenceRefs: plan.artifacts.map((artifact) => `intake-artifact:${artifact.id}`).sort(),
        },
        legacyRepairAdmission: {
          ...recordValue(recordValue(linkedSource.metadata).legacyRepairAdmission),
          reportHash,
          jobId: plan.job.id,
          operatorId,
          strategyRevision: AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION,
        },
      }),
    },
  });
  if (sourceUpdate.count !== 1) {
    throw new AffiliateLegacyRepairAdmissionError('SOURCE_CAS_FAILED', `Source ${plan.source.id} automation hold changed during admission.`);
  }
  if (plan.mapping) {
    const mappingUpdate = await client.affiliateScrapeMappings.updateMany({
      where: {
        id: plan.mapping.id,
        sourceId: plan.source.id,
        supplySourceId: plan.mapping.supplySourceId,
        validatedAt: null,
      },
      data: { supplySourceId: root.id },
    });
    if (mappingUpdate.count !== 1) {
      throw new AffiliateLegacyRepairAdmissionError('MAPPING_CAS_FAILED', `Mapping ${plan.mapping.id} could not be linked to the admitted root.`);
    }
  }
  const linkedIntake = await client.affiliateSourceIntakes.findUnique({
    where: { id: plan.intake.id },
  }) as unknown as IntakeRow | null;
  if (!linkedIntake || linkedIntake.status !== 'READY_FOR_MAPPING' || linkedIntake.supplySourceId !== root.id) {
    throw new AffiliateLegacyRepairAdmissionError('INTAKE_CAS_FAILED', `Intake ${plan.intake.id} could not be linked to the admitted root.`);
  }
  if (linkedIntake.affiliateSourceId && linkedIntake.affiliateSourceId !== plan.source.id) {
    throw new AffiliateLegacyRepairAdmissionError('INTAKE_SOURCE_CAS_FAILED', `Intake ${plan.intake.id} changed source ownership.`);
  }
  if (!linkedIntake.affiliateSourceId) {
    const intakeUpdate = await client.affiliateSourceIntakes.updateMany({
      where: {
        id: plan.intake.id,
        status: 'READY_FOR_MAPPING',
        sourceKey: plan.intake.sourceKey,
        supplySourceId: root.id,
        affiliateSourceId: null,
      },
      data: { affiliateSourceId: plan.source.id },
    });
    if (intakeUpdate.count !== 1) {
      throw new AffiliateLegacyRepairAdmissionError('INTAKE_CAS_FAILED', `Intake ${plan.intake.id} source binding changed during admission.`);
    }
  }
  const nextSummary = appendAdmissionEvidence(plan.job.resultSummary, {
    strategyRevision: AFFILIATE_LEGACY_REPAIR_STRATEGY_REVISION,
    reportHash,
    reportSnapshot,
    operatorId,
    selectedJobIds: [...selectedJobIds].sort(),
    requestedJobIds: requestedJobIds ? [...requestedJobIds].sort() : null,
    selectionLimit,
    selectedRow: plan.row,
    selectedWrite: emptyWrite(plan),
    repairContext: plan.repairContext,
    manifest: plan.manifest,
    rootId: root.id,
    rootLifecycleGeneration: root.lifecycleGeneration,
    sourceId: plan.source.id,
    mappingId: plan.mapping?.id ?? null,
    evidenceRunId: plan.context.evidenceRunId,
    sportsCatalogSha256: plan.context.sportsCatalogSha256,
    artifactIds: plan.artifacts.map((artifact) => `intake-artifact:${artifact.id}`).sort(),
    gatewayDedupeKey: plan.gatewayDedupeKey,
  });
  const jobUpdate = await client.affiliateSourceMappingJobs.updateMany({
    where: {
      id: plan.job.id,
      intakeId: plan.intake.id,
      status: 'QUEUED',
      sourceId: plan.job.sourceId,
      mappingId: plan.job.mappingId,
      legacyIdentityMigrationEligible: plan.job.legacyIdentityMigrationEligible,
      supplySourceId: plan.job.supplySourceId,
      claimedAt: null,
      workerId: null,
    },
    data: {
      supplySourceId: root.id,
      sourceId: plan.source.id,
      mappingId: plan.mapping?.id ?? null,
      legacyIdentityMigrationEligible: false,
      resultSummary: asPrismaJson(nextSummary),
    },
  });
  if (jobUpdate.count !== 1) throw new AffiliateLegacyRepairAdmissionError('MAPPING_JOB_CAS_FAILED', `Mapping job ${plan.job.id} could not be linked atomically.`);
  for (const artifact of plan.artifacts) {
    const update = await client.affiliateSourceIntakeArtifacts.updateMany({
      where: {
        id: artifact.id,
        intakeId: plan.intake.id,
        runId: plan.run.id,
        fileId: artifact.fileId,
        supplySourceId: artifact.supplySourceId,
      },
      data: { isPinned: true, retainUntil: null, supplySourceId: root.id },
    });
    if (update.count !== 1) throw new AffiliateLegacyRepairAdmissionError('ARTIFACT_CAS_FAILED', `Artifact ${artifact.id} could not be pinned.`);
  }
  const subject: AffiliateAgentSubject = {
    type: 'MAPPING_PRODUCER' as const,
    supplySourceId: root.id,
    mappingJobId: plan.job.id,
    listingKind: sourceListingKind,
    pass: 1,
    repairContext: plan.repairContext,
  };
  await client.affiliateAgentGatewayJobs.upsert({
    where: { dedupeKey: plan.gatewayDedupeKey },
    create: {
      id: createId(),
      dedupeKey: plan.gatewayDedupeKey,
      queue: 'AFFILIATE_MAPPING',
      lane: 'MAPPING_PRODUCTION',
      role: 'MAPPING_PRODUCER',
      subjectType: 'MAPPING_PRODUCER',
      subjectId: plan.job.id,
      subjectJson: asPrismaJson(subject),
      evidenceManifestJson: asPrismaJson(plan.manifest),
      supplySourceId: root.id,
      expectedLifecycleGeneration: root.lifecycleGeneration,
      status: 'QUEUED',
      priority: 0,
      nextAttemptAt: new Date(),
      claimGeneration: 0,
      activeClaimId: null,
      parentClaimId: null,
    },
    update: {},
  });
};
const createReplayReport = (
  expectedReportHash: string,
  evidence: readonly JsonRecord[],
): AffiliateLegacyRepairAdmissionApplyReport => {
  const stored = recordValue(evidence[0]?.reportSnapshot);
  if (
    stored.reportHash !== expectedReportHash
    || !Array.isArray(stored.rows)
    || !Array.isArray(stored.proposedWrites)
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'ADMISSION_REPORT_DRIFT',
      'Persisted admission report evidence is incomplete and cannot be replayed safely.',
    );
  }
  const storedReport = stored as unknown as AffiliateLegacyRepairAdmissionReport;
  const selectedJobIds = stringArrayValue(storedReport.selectedJobIds) ?? [];
  return {
    ...storedReport,
    mode: 'APPLY',
    reviewedReportHash: expectedReportHash,
    writeCount: 0,
    appliedJobIds: selectedJobIds,
    replayed: true,
  };
};

const withSerializableTransaction = async <T>(
  prisma: PrismaClient,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => prisma.$transaction(callback, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 120_000,
});

export const previewAffiliateLegacyRepairAdmission = async (
  input: PreviewAffiliateLegacyRepairAdmissionInput,
): Promise<AffiliateLegacyRepairAdmissionPreview> => {
  const bundle = parseBundle(input.bundle);
  const limit = validateLimit(input.limit);
  const jobIds = validateJobIds(input.jobIds);
  const { report } = await buildReport(input.prisma, bundle, limit, jobIds, 'PREVIEW');
  return report as AffiliateLegacyRepairAdmissionPreview;
};

export const applyAffiliateLegacyRepairAdmission = async (
  input: ApplyAffiliateLegacyRepairAdmissionInput,
): Promise<AffiliateLegacyRepairAdmissionApplyReport> => {
  const bundle = parseBundle(input.bundle);
  const limit = validateLimit(input.limit);
  const jobIds = validateJobIds(input.jobIds);
  const operatorId = stringValue(input.operatorId);
  if (!operatorId) throw new AffiliateLegacyRepairAdmissionError('OPERATOR_REQUIRED', 'operatorId is required for admission apply.');
  const expectedReportHash = normalizeHash(input.expectedReportHash);
  if (!expectedReportHash) throw new AffiliateLegacyRepairAdmissionError('REPORT_HASH_REQUIRED', 'expectedReportHash must be a SHA-256 hash.');
  return withSerializableTransaction(input.prisma, async (transaction) => {
    await assertActiveContract(transaction, bundle);
    const current = await buildReport(transaction, bundle, limit, jobIds, 'APPLY');
    if (
      current.snapshot.gatewayClaims.some((claim) => normalizedUpper(claim.status) === 'ACTIVE')
      || current.snapshot.gatewayJobs.some((gatewayJob) => gatewayJob.activeClaimId !== null)
    ) {
      throw new AffiliateLegacyRepairAdmissionError('CLAIM_DRIFT', 'An active gateway claim exists; legacy repair admission is paused.');
    }
    if (current.report.reportHash !== expectedReportHash) {
      const admittedJobs = current.snapshot.jobs.filter((job) => (
        hasSportRequeueMarker(job) && matchingAdmissionEvidence(job.resultSummary, expectedReportHash)
      ));
      const evidence = admittedJobs
        .map((job) => admissionEvidenceFor(job.resultSummary, expectedReportHash))
        .filter((entry): entry is JsonRecord => Boolean(entry));
      const firstEvidence = evidence[0] ?? null;
      const selectedJobIds = firstEvidence ? stringArrayValue(firstEvidence.selectedJobIds) : null;
      const requestedJobIds = firstEvidence
        ? (firstEvidence.requestedJobIds === null ? null : stringArrayValue(firstEvidence.requestedJobIds))
        : null;
      const selectionLimit = firstEvidence?.selectionLimit;
      const evidenceByJobId = new Map<string, JsonRecord>();
      for (const entry of evidence) {
        const row = recordValue(entry.selectedRow);
        if (typeof row.jobId === 'string') evidenceByJobId.set(row.jobId, entry);
      }
      const setsEqual = (left: readonly string[], right: readonly string[]): boolean => (
        left.length === right.length && left.every((value, index) => value === right[index])
      );
      const storedSnapshot = recordValue(firstEvidence?.reportSnapshot);
      const storedSelectedJobIds = stringArrayValue(storedSnapshot.selectedJobIds);
      const storedProposedJobIds = stringArrayValue(storedSnapshot.proposedJobIds);
      const reportSnapshotValid = Boolean(
        firstEvidence
        && storedSnapshot.reportHash === expectedReportHash
        && storedSelectedJobIds
        && storedProposedJobIds
        && setsEqual(storedSelectedJobIds, selectedJobIds ?? [])
        && setsEqual(storedProposedJobIds, selectedJobIds ?? [])
        && Array.isArray(storedSnapshot.rows)
        && Array.isArray(storedSnapshot.proposedWrites)
        && reportHashFor(storedSnapshot as unknown as AffiliateLegacyRepairAdmissionReport) === expectedReportHash
      );
      const admittedJobIds = admittedJobs.map((job) => job.id).sort();
      const selectedIdsMatch = Boolean(selectedJobIds && setsEqual(selectedJobIds, admittedJobIds));
      const evidenceConsistent = Boolean(
        firstEvidence
        && reportSnapshotValid
        && selectedJobIds
        && evidence.length === selectedJobIds.length
        && evidence.every((entry) => (
          entry.operatorId === stringValue(firstEvidence.operatorId)
          && sameAdmissionValue(entry.selectedJobIds, selectedJobIds)
          && sameAdmissionValue(entry.requestedJobIds, requestedJobIds)
          && entry.selectionLimit === selectionLimit
        ))
        && stringValue(firstEvidence.operatorId) === operatorId
        && sameAdmissionValue(current.report.requestedJobIds, requestedJobIds)
        && current.report.selectionLimit === selectionLimit
      );
      const gatewayEvidenceMatches = Boolean(selectedJobIds && selectedJobIds.every((jobId) => {
        const entry = evidenceByJobId.get(jobId);
        const gatewayCandidates = gatewayRepairJobsFor(current.snapshot, jobId);
        const gatewayJob = gatewayCandidates.length === 1 ? gatewayCandidates[0] : null;
        const source = current.snapshot.sources.find((candidate) => candidate.id === entry?.sourceId);
        const root = current.snapshot.roots.find((candidate) => candidate.id === entry?.rootId);
        const expectedListingKind = listingKindFor(source?.targetKind);
        const rootLifecycleGeneration = typeof entry?.rootLifecycleGeneration === 'number'
          ? entry.rootLifecycleGeneration
          : null;
        if (!entry || !gatewayJob || gatewayJob.activeClaimId !== null
          || !expectedListingKind || listingKindFor(root?.targetKind) !== expectedListingKind
          || current.snapshot.gatewayClaims.some((claim) => claim.jobId === gatewayJob.id && normalizedUpper(claim.status) === 'ACTIVE')) {
          return false;
        }
        return gatewayIdentityMatches(
          gatewayJob,
          jobId,
          stringValue(entry.rootId),
          rootLifecycleGeneration,
          entry.repairContext,
          entry.manifest,
          stringValue(entry.gatewayDedupeKey),
          expectedListingKind,
        );
      }));
      const canReplay = selectedIdsMatch && evidenceConsistent && gatewayEvidenceMatches;
      if (canReplay) return createReplayReport(expectedReportHash, evidence);
      throw new AffiliateLegacyRepairAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The reviewed legacy repair admission report no longer matches current identity, capture, or contract state.',
        { expectedReportHash, observedReportHash: current.report.reportHash },
      );
    }
    if (current.plans.length === 0) {
      return {
        ...current.report,
        mode: 'APPLY',
        reviewedReportHash: expectedReportHash,
        writeCount: 0,
        appliedJobIds: [],
        replayed: false,
      };
    }
    for (const plan of current.plans) {
      await applyPlan(
        transaction,
        plan,
        bundle,
        current.report,
        expectedReportHash,
        operatorId,
        current.report.selectedJobIds,
        jobIds,
        limit,
      );
    }
    return {
      ...current.report,
      mode: 'APPLY',
      writeCount: current.plans.length,
      reviewedReportHash: expectedReportHash,
      appliedJobIds: current.plans.map((plan) => plan.job.id),
      replayed: false,
      rows: current.report.rows.map((row) => current.plans.some((plan) => plan.job.id === row.jobId)
        ? { ...row, outcome: 'APPLIED' as const }
        : row),
    };
  });
};

export const calculateAffiliateLegacyRepairAdmissionReportHash = (
  report: Pick<AffiliateLegacyRepairAdmissionReport, 'contractVersion' | 'contractHash' | 'counts' | 'selectedJobIds' | 'rows' | 'proposedWrites'>
    & Partial<Pick<AffiliateLegacyRepairAdmissionReport, 'requestedJobIds' | 'selectionLimit'>>,
): string => reportHashFor(report);

type RetrySnapshot = Readonly<{
  admission: AdmissionSnapshot;
  gatewayJobs: readonly GatewayJobRow[];
  gatewayClaims: readonly RetryGatewayClaimRow[];
  gatewayReceipts: readonly RetryGatewayReceiptRow[];
}>;

type RetryParentParts = Readonly<{
  gatewayJob: GatewayJobRow;
  claim: RetryGatewayClaimRow;
  receipt: RetryGatewayReceiptRow;
  envelope: AffiliateAgentProducerClaimEnvelopeForHistoricalRead;
  subject: LegacyRetryProducerSubject;
  result: AffiliateAgentTerminalResultEnvelope;
}>;
type RetryScopeRequest = Readonly<{
  excludedSourceLabels?: readonly string[];
  operatorId?: string;
}>;

type RetryScopeDecision = Readonly<{
  sourceSportScope?: AffiliateAgentSourceSportScope;
  hasNewExclusions: boolean;
  reasonCodes: readonly string[];
  verifiedParentSportEvidence?: AffiliateAgentSportEvidence | null;
}>;

const retryExcludedSourceLabels = (
  value: readonly string[] | undefined,
): readonly string[] | undefined => {
  if (value === undefined) return undefined;
  const parsed = affiliateAgentSourceSportScopeLabelsSchema.safeParse(value);
  if (!parsed.success) {
    throw new AffiliateLegacyRepairAdmissionError(
      'SOURCE_SCOPE_LABELS_INVALID',
      'excludedSourceLabels must be a sorted, unique, nonempty source activity label set.',
    );
  }
  return parsed.data;
};

const retryScopeRequestFor = (
  gatewayJobIds: readonly string[],
  excludedSourceLabels: readonly string[] | undefined,
  operatorId: string | undefined,
): RetryScopeRequest => {
  if (excludedSourceLabels !== undefined && gatewayJobIds.length !== 1) {
    throw new AffiliateLegacyRepairAdmissionError(
      'SOURCE_SCOPE_PARENT_COUNT_INVALID',
      'A source sport scope must name exactly one parent Gateway job.',
    );
  }
  return {
    ...(excludedSourceLabels === undefined ? {} : { excludedSourceLabels }),
    ...(operatorId ? { operatorId } : {}),
  };
};
const retryScopeOperatorId = (value: unknown): string | undefined => (
  value === undefined ? undefined : stringValue(value) ?? undefined
);

const retryReason = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_REASON_REQUIRED',
      'reason is required for legacy repair retry.',
    );
  }
  const reason = value.trim();
  if (!reason) {
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_REASON_REQUIRED',
      'reason is required for legacy repair retry.',
    );
  }
  if (Buffer.byteLength(reason, 'utf8') > AFFILIATE_LEGACY_REPAIR_RETRY_MAX_REASON_BYTES) {
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_REASON_TOO_LONG',
      `reason must not exceed ${AFFILIATE_LEGACY_REPAIR_RETRY_MAX_REASON_BYTES} UTF-8 bytes.`,
    );
  }
  return reason;
};

const retryGatewayJobIds = (value: readonly string[] | undefined): string[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > AFFILIATE_LEGACY_REPAIR_ADMISSION_MAX_LIMIT) {
    throw new AffiliateLegacyRepairAdmissionError(
      'INVALID_GATEWAY_JOB_IDS',
      `gatewayJobIds must contain between 1 and ${AFFILIATE_LEGACY_REPAIR_ADMISSION_MAX_LIMIT} IDs.`,
    );
  }
  const normalized = value.map((entry) => (typeof entry === 'string' ? entry.trim() : ''));
  if (
    normalized.some((entry) => !entry || entry.length > 200)
    || new Set(normalized).size !== normalized.length
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'INVALID_GATEWAY_JOB_IDS',
      'gatewayJobIds must contain explicit unique non-blank IDs.',
    );
  }
  return [...normalized].sort();
};
const continuationGatewayJobId = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new AffiliateLegacyRepairAdmissionError(
      'INVALID_GATEWAY_JOB_ID',
      'gatewayJobId must be a non-blank string.',
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new AffiliateLegacyRepairAdmissionError(
      'INVALID_GATEWAY_JOB_ID',
      'gatewayJobId must be between 1 and 200 characters.',
    );
  }
  return normalized;
};

const continuationReason = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_REASON_REQUIRED',
      'reason is required for legacy sport repair continuation.',
    );
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_REASON_REQUIRED',
      'reason is required for legacy sport repair continuation.',
    );
  }
  if (Buffer.byteLength(normalized, 'utf8') > AFFILIATE_LEGACY_REPAIR_CONTINUATION_MAX_REASON_BYTES) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_REASON_TOO_LONG',
      `reason must not exceed ${AFFILIATE_LEGACY_REPAIR_CONTINUATION_MAX_REASON_BYTES} UTF-8 bytes.`,
    );
  }
  return normalized;
};


const retryGatewayJobSelect = {
  id: true,
  dedupeKey: true,
  queue: true,
  lane: true,
  role: true,
  subjectType: true,
  subjectId: true,
  subjectJson: true,
  evidenceManifestJson: true,
  supplySourceId: true,
  expectedLifecycleGeneration: true,
  status: true,
  activeClaimId: true,
  parentClaimId: true,
  claimGeneration: true,
  terminalDisposition: true,
  resultHash: true,
  resultJson: true,
  terminalReceiptId: true,
  finishedAt: true,
} as const;

const retryGatewayClaimSelect = {
  id: true,
  jobId: true,
  parentClaimId: true,
  claimGeneration: true,
  lifecycleGeneration: true,
  queue: true,
  lane: true,
  role: true,
  workerId: true,
  invocationId: true,
  workspaceId: true,
  status: true,
  deploymentContractVersion: true,
  deploymentContractHash: true,
  roleContractVersion: true,
  roleContractHash: true,
  promptTemplateVersion: true,
  promptTemplateHash: true,
  supplyContractVersion: true,
  supplyContractHash: true,
  claimEnvelopeHash: true,
  claimEnvelopeJson: true,
  evidenceManifestHash: true,
  schemaCorrectionCount: true,
  terminalReceiptId: true,
} as const;

const retryGatewayReceiptSelect = {
  id: true,
  claimId: true,
  jobId: true,
  claimGeneration: true,
  idempotencyKey: true,
  operationKind: true,
  commandName: true,
  requestHash: true,
  status: true,
  responseHash: true,
  responseJson: true,
  safeErrorCode: true,
  completedAt: true,
} as const;

const retryRowsFor = <T>(value: unknown): T[] => (
  Array.isArray(value) ? value as T[] : []
);

const readRetrySnapshot = async (
  client: AdmissionClient,
  gatewayJobIds: readonly string[],
): Promise<RetrySnapshot> => {
  const requestedGatewayJobs = retryRowsFor<GatewayJobRow>(
    await client.affiliateAgentGatewayJobs.findMany({
      where: { id: { in: [...gatewayJobIds] } },
      select: retryGatewayJobSelect,
      orderBy: { id: 'asc' },
    }),
  ).filter((job) => gatewayJobIds.includes(job.id));
  const mappingJobIds = sortedUnique(requestedGatewayJobs.flatMap((job) => {
    const subject = recordValue(job.subjectJson);
    const mappingJobId = stringValue(subject.mappingJobId);
    return mappingJobId ? [mappingJobId] : [];
  }));
  const admission = await readSnapshot(client, mappingJobIds);
  const scopedGatewayJobs = retryRowsFor<GatewayJobRow>(
    await client.affiliateAgentGatewayJobs.findMany({
      where: {
        OR: [
          { id: { in: [...gatewayJobIds] } },
          ...(mappingJobIds.length ? [{ subjectId: { in: mappingJobIds } }] : []),
        ],
      },
      select: retryGatewayJobSelect,
      orderBy: { id: 'asc' },
    }),
  );
  const gatewayJobsById = new Map<string, GatewayJobRow>();
  for (const job of [...admission.gatewayJobs, ...requestedGatewayJobs, ...scopedGatewayJobs]) {
    if (job && typeof job.id === 'string') gatewayJobsById.set(job.id, job);
  }
  const gatewayJobs = [...gatewayJobsById.values()]
    .filter((job) => gatewayJobIds.includes(job.id)
      || (typeof job.subjectId === 'string' && mappingJobIds.includes(job.subjectId)))
    .sort(compareById);
  const scopedGatewayJobIds = sortedUnique(gatewayJobs.map((job) => job.id));
  const gatewayClaims = retryRowsFor<RetryGatewayClaimRow>(
    await client.affiliateAgentGatewayClaims.findMany({
      where: { jobId: { in: scopedGatewayJobIds } },
      select: retryGatewayClaimSelect,
      orderBy: { id: 'asc' },
    }),
  ).filter((claim) => scopedGatewayJobIds.includes(claim.jobId));
  const claimsById = new Map<string, RetryGatewayClaimRow>();
  for (const claim of gatewayClaims) claimsById.set(claim.id, claim);
  const gatewayReceipts = retryRowsFor<RetryGatewayReceiptRow>(
    await client.affiliateAgentGatewayOperationReceipts.findMany({
      where: { claimId: { in: [...claimsById.keys()] } },
      select: retryGatewayReceiptSelect,
      orderBy: { id: 'asc' },
    }),
  ).filter((receipt) => claimsById.has(receipt.claimId));
  return {
    admission,
    gatewayJobs,
    gatewayClaims,
    gatewayReceipts,
  };
};

const retryGatewayJobsForMapping = (
  snapshot: RetrySnapshot,
  mappingJobId: string,
): GatewayJobRow[] => snapshot.gatewayJobs
  .filter((job) => (
    job.role === 'MAPPING_PRODUCER'
    && job.subjectType === 'MAPPING_PRODUCER'
    && job.subjectId === mappingJobId
  ))
  .sort(compareById);

const retryAuditEntries = (summary: unknown): JsonRecord[] => {
  const history = recordValue(summary).legacyRepairRetryHistory;
  return Array.isArray(history) ? history.map(recordValue) : [];
};

const retryAuditForParent = (
  mappingJob: MappingJobRow,
  gatewayJobId: string,
): JsonRecord[] => retryAuditEntries(mappingJob.resultSummary)
  .filter((entry) => stringValue(entry.parentGatewayJobId) === gatewayJobId);
const continuationAuditEntries = (summary: unknown): JsonRecord[] => {
  const history = recordValue(summary).legacyRepairContinuationHistory;
  return Array.isArray(history)
    ? history.map(recordValue)
      .filter((entry) => entry.operation === 'LEGACY_SPORT_REPAIR_CONTINUATION')
    : [];
};

const continuationAuditForParent = (
  mappingJob: MappingJobRow,
  gatewayJobId: string,
): JsonRecord[] => continuationAuditEntries(mappingJob.resultSummary)
  .filter((entry) => stringValue(entry.parentGatewayJobId) === gatewayJobId);

const retryJobHasPersistedSourceSportScope = (
  snapshot: RetrySnapshot,
  gatewayJobId: string,
): boolean => {
  const gatewayJob = snapshot.gatewayJobs.find((candidate) => candidate.id === gatewayJobId);
  if (!gatewayJob) return false;
  const subject = recordValue(gatewayJob.subjectJson);
  if (recordValue(subject.repairContext).sourceSportScope !== undefined) {
    return true;
  }
  const scopedClaim = snapshot.gatewayClaims.find((claim) => (
    claim.jobId === gatewayJobId && claim.claimEnvelopeJson !== undefined
  ));
  if (scopedClaim) {
    const parsedClaim = affiliateAgentClaimEnvelopeSchema.safeParse(scopedClaim.claimEnvelopeJson);
    if (
      parsedClaim.success
      && parsedClaim.data.subject.type === 'MAPPING_PRODUCER'
      && parsedClaim.data.subject.repairContext?.sourceSportScope !== undefined
    ) {
      return true;
    }
  }
  const mappingJobId = stringValue(subject.mappingJobId);
  const mappingJob = mappingJobId
    ? snapshot.admission.jobs.find((candidate) => candidate.id === mappingJobId)
    : null;
  if (!mappingJob) return false;
  return [
    ...retryAuditEntries(mappingJob.resultSummary),
    ...continuationAuditEntries(mappingJob.resultSummary),
  ].some((audit) => (
    (audit.parentGatewayJobId === gatewayJobId || audit.childGatewayJobId === gatewayJobId)
    && (
      audit.sourceSportScope !== undefined
      || recordValue(audit.repairContext).sourceSportScope !== undefined
    )
  ));
};

const assertRetryScopeParentCount = (
  snapshot: RetrySnapshot,
  gatewayJobIds: readonly string[],
  scopeRequest: RetryScopeRequest,
): void => {
  if (
    gatewayJobIds.length > 1
    && (
      scopeRequest.excludedSourceLabels !== undefined
      || gatewayJobIds.some((gatewayJobId) => retryJobHasPersistedSourceSportScope(snapshot, gatewayJobId))
    )
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'SOURCE_SCOPE_PARENT_COUNT_INVALID',
      'A source sport scope must name exactly one parent Gateway job.',
    );
  }
};

type RetryParentPartsOptions = Readonly<{
  allowPass3?: boolean;
}>;

const readContinuationSnapshot = async (
  client: AdmissionClient,
  gatewayJobId: string,
): Promise<RetrySnapshot> => {
  const snapshot = await readRetrySnapshot(client, [gatewayJobId]);
  const parent = snapshot.gatewayJobs.find((job) => job.id === gatewayJobId);
  const rootId = stringValue(recordValue(parent?.subjectJson).supplySourceId);
  if (!rootId) return snapshot;
  const rootJobs = retryRowsFor<GatewayJobRow>(
    await client.affiliateAgentGatewayJobs.findMany({
      where: { supplySourceId: rootId },
      select: retryGatewayJobSelect,
      orderBy: { id: 'asc' },
    }),
  );
  const gatewayJobs = Array.from(new Map(
    [...snapshot.gatewayJobs, ...rootJobs].map((job) => [job.id, job]),
  ).values()).sort(compareById);
  const gatewayJobIds = sortedUnique(gatewayJobs.map((job) => job.id));
  const gatewayClaims = retryRowsFor<RetryGatewayClaimRow>(
    await client.affiliateAgentGatewayClaims.findMany({
      where: { jobId: { in: gatewayJobIds } },
      select: retryGatewayClaimSelect,
      orderBy: { id: 'asc' },
    }),
  );
  const claimIds = sortedUnique(gatewayClaims.map((claim) => claim.id));
  const gatewayReceipts = retryRowsFor<RetryGatewayReceiptRow>(
    await client.affiliateAgentGatewayOperationReceipts.findMany({
      where: { claimId: { in: claimIds } },
      select: retryGatewayReceiptSelect,
      orderBy: { id: 'asc' },
    }),
  );
  return { ...snapshot, gatewayJobs, gatewayClaims, gatewayReceipts };
};

type RetryEvaluationOptions = Readonly<{
  mode?: 'RETRY' | 'CONTINUATION';
  scopeRequest?: RetryScopeRequest;
}>;

const retryParentPartsFor = (
  snapshot: RetrySnapshot,
  gatewayJobId: string,
  options: RetryParentPartsOptions = {},
): { parts: RetryParentParts | null; reasonCodes: string[] } => {
  const reasons: string[] = [];
  const gatewayJob = snapshot.gatewayJobs.find((job) => job.id === gatewayJobId) ?? null;
  if (!gatewayJob) return { parts: null, reasonCodes: ['PARENT_GATEWAY_JOB_MISSING'] };
  if (
    gatewayJob.role !== 'MAPPING_PRODUCER'
    || gatewayJob.subjectType !== 'MAPPING_PRODUCER'
    || gatewayJob.status !== 'COMPLETED'
    || gatewayJob.activeClaimId !== null
    || gatewayJob.terminalDisposition !== 'CONTRACT_GAP'
    || !gatewayJob.terminalReceiptId
    || !gatewayJob.resultJson
  ) {
    reasons.push('PARENT_GATEWAY_JOB_NOT_COMPLETED_CONTRACT_GAP');
  }
  const parsedCurrentSubject = affiliateAgentSubjectSchema.safeParse(gatewayJob.subjectJson);
  const parsedSubject = parsedCurrentSubject.success
    ? parsedCurrentSubject
    : affiliateAgentHistoricalMappingProducerSubjectSchema.safeParse(gatewayJob.subjectJson);
  const subject = parsedSubject.success
    && parsedSubject.data.type === 'MAPPING_PRODUCER'
    && parsedSubject.data.repairContext?.kind === 'LEGACY_SPORT_REPAIR'
    ? parsedSubject.data as LegacyRetryProducerSubject
    : null;
  if (!subject || subject.repairContext?.kind !== 'LEGACY_SPORT_REPAIR') {
    reasons.push('PARENT_REPAIR_CONTEXT_INVALID');
  }
  if (gatewayJob.subjectId !== subject?.mappingJobId) reasons.push('PARENT_MAPPING_IDENTITY_INVALID');
  if (gatewayJob.supplySourceId !== subject?.supplySourceId) reasons.push('PARENT_ROOT_IDENTITY_INVALID');
  if (gatewayJob.parentClaimId === gatewayJob.id) reasons.push('MALFORMED_PARENT_LINEAGE');
  const claims = snapshot.gatewayClaims.filter((claim) => claim.jobId === gatewayJob.id);
  const terminalClaims = gatewayJob.terminalReceiptId
    ? claims.filter((claim) => claim.terminalReceiptId === gatewayJob.terminalReceiptId)
    : [];
  if (terminalClaims.length !== 1) reasons.push('PARENT_TERMINAL_CLAIM_INVALID');
  const claim = terminalClaims.length === 1 ? terminalClaims[0] : null;
  if (
    !claim
    || claim.status !== 'COMPLETED'
    || claim.role !== 'MAPPING_PRODUCER'
    || claim.jobId !== gatewayJob.id
    || claim.terminalReceiptId !== gatewayJob.terminalReceiptId
    || claim.parentClaimId !== (gatewayJob.parentClaimId ?? null)
    || typeof claim.claimGeneration !== 'number'
    || gatewayJob.claimGeneration !== undefined && claim.claimGeneration !== gatewayJob.claimGeneration
  ) {
    reasons.push('PARENT_TERMINAL_CLAIM_INVALID');
  }
  let envelope: AffiliateAgentProducerClaimEnvelopeForHistoricalRead | null = null;
  if (claim) {
    const parsedEnvelope = parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(
      claim.claimEnvelopeJson,
    );
    envelope = parsedEnvelope?.role === 'MAPPING_PRODUCER'
      ? parsedEnvelope
      : null;
    if (!envelope) reasons.push('PARENT_CLAIM_ENVELOPE_INVALID');
    else {
      if (hashAffiliateAgentValue(envelope) !== claim.claimEnvelopeHash) reasons.push('PARENT_CLAIM_ENVELOPE_HASH_MISMATCH');
      if (envelope.jobId !== gatewayJob.id || envelope.claimId !== claim.id) reasons.push('PARENT_CLAIM_IDENTITY_INVALID');
      if (envelope.subject.type !== 'MAPPING_PRODUCER') reasons.push('PARENT_CLAIM_SUBJECT_INVALID');
      if (
        envelope.role !== claim.role
        || envelope.role !== gatewayJob.role
        || envelope.queue !== claim.queue
        || envelope.queue !== gatewayJob.queue
        || envelope.lane !== claim.lane
        || envelope.lane !== gatewayJob.lane
        || envelope.supplySourceId !== gatewayJob.supplySourceId
        || !subject
        || envelope.supplySourceId !== subject.supplySourceId
        || envelope.claimGeneration !== claim.claimGeneration
        || envelope.lifecycleGeneration !== claim.lifecycleGeneration
        || envelope.workerId !== claim.workerId
        || envelope.invocationId !== claim.invocationId
        || envelope.workspaceId !== claim.workspaceId
      ) reasons.push('PARENT_CLAIM_ROUTING_MISMATCH');
      if (
        envelope.deploymentContractVersion !== claim.deploymentContractVersion
        || envelope.deploymentContractHash !== claim.deploymentContractHash
        || envelope.roleContractVersion !== claim.roleContractVersion
        || envelope.roleContractHash !== claim.roleContractHash
        || envelope.promptTemplateVersion !== claim.promptTemplateVersion
        || envelope.promptTemplateHash !== claim.promptTemplateHash
        || envelope.supplyContractVersion !== claim.supplyContractVersion
        || envelope.supplyContractHash !== claim.supplyContractHash
      ) reasons.push('PARENT_CLAIM_CONTRACT_MISMATCH');
      if (!sameAdmissionValue(envelope.evidenceManifest, gatewayJob.evidenceManifestJson)) {
        reasons.push('PARENT_EVIDENCE_MANIFEST_MISMATCH');
      }
      if (claim.evidenceManifestHash !== envelope.evidenceManifest.hash) reasons.push('PARENT_EVIDENCE_MANIFEST_HASH_MISMATCH');
      if (
        !subject
        || envelope.subject.mappingJobId !== subject.mappingJobId
        || envelope.subject.supplySourceId !== subject.supplySourceId
        || envelope.subject.pass !== subject.pass
        || !sameRepairContext(envelope.subject.repairContext, subject.repairContext)
      ) reasons.push('PARENT_CLAIM_SUBJECT_INVALID');
      if (
        envelope.roleContractVersion >= 4
        && (
          !subject
          || envelope.subject.listingKind === undefined
          || (
            subject.listingKind !== undefined
            && envelope.subject.listingKind !== subject.listingKind
          )
        )
      ) reasons.push('PARENT_CLAIM_SUBJECT_INVALID');
    }
  }
  const receipt = claim?.terminalReceiptId
    ? snapshot.gatewayReceipts.find((candidate) => candidate.id === claim.terminalReceiptId) ?? null
    : null;
  const response = receipt ? recordValue(receipt.responseJson) : {};
  if (
    !receipt
    || receipt.status !== 'SUCCEEDED'
    || receipt.claimId !== claim?.id
    || receipt.jobId !== gatewayJob.id
    || receipt.claimGeneration !== claim?.claimGeneration
    || receipt.operationKind !== 'SUBMIT_RESULT'
    || receipt.responseHash === null
    || !receipt.completedAt
    || response.kind !== 'TERMINAL_ACCEPTED'
    || response.receiptId !== receipt.id
    || response.disposition !== 'CONTRACT_GAP'
  ) {
    reasons.push('PARENT_TERMINAL_RECEIPT_INVALID');
  } else if (hashAffiliateAgentValue(receipt.responseJson) !== receipt.responseHash) {
    reasons.push('PARENT_TERMINAL_RECEIPT_HASH_MISMATCH');
  }
  const parsedResult = affiliateAgentTerminalResultEnvelopeSchema.safeParse(gatewayJob.resultJson);
  const result = parsedResult.success && parsedResult.data.role === 'MAPPING_PRODUCER'
    ? parsedResult.data
    : null;
  if (!result) reasons.push('PARENT_TERMINAL_RESULT_INVALID');
  else {
    if (
      result.jobId !== gatewayJob.id
      || result.claimId !== claim?.id
      || result.claimGeneration !== claim?.claimGeneration
      || result.lifecycleGeneration !== claim?.lifecycleGeneration
      || result.roleContractVersion !== claim?.roleContractVersion
      || result.roleContractHash !== claim?.roleContractHash
      || result.promptTemplateVersion !== claim?.promptTemplateVersion
      || result.promptTemplateHash !== claim?.promptTemplateHash
      || result.role !== 'MAPPING_PRODUCER'
      || result.disposition !== 'CONTRACT_GAP'
      || result.deploymentContractVersion !== claim?.deploymentContractVersion
      || result.deploymentContractHash !== claim?.deploymentContractHash
      || result.supplyContractVersion !== claim?.supplyContractVersion
      || result.supplyContractHash !== claim?.supplyContractHash
      || result.workerId !== claim?.workerId
      || result.invocationId !== claim?.invocationId
    ) reasons.push('PARENT_TERMINAL_RESULT_IDENTITY_INVALID');
    if (
      (claim?.roleContractVersion ?? 0) >= 3
      && recordValue(result.payload).sportEvidence === undefined
    ) reasons.push('PARENT_SPORT_EVIDENCE_MISSING');
    const parentManifest = affiliateAgentEvidenceManifestSchema.safeParse(gatewayJob.evidenceManifestJson);
    if (!parentManifest.success) {
      reasons.push('PARENT_EVIDENCE_MANIFEST_INVALID');
    } else if (result.evidenceRefs.some((evidenceRef) => (
      !parentManifest.data.entries.some((entry) => entry.evidenceRef === evidenceRef)
    ))) {
      reasons.push('PARENT_RESULT_EVIDENCE_NOT_OWNED');
    }
    if (!gatewayJob.resultHash || gatewayJob.resultHash !== hashAffiliateAgentValue(result)) {
      reasons.push('PARENT_TERMINAL_RESULT_HASH_MISMATCH');
    }
    if (
      receipt
      && (response.resultHash !== hashAffiliateAgentValue(result)
        || response.disposition !== result.disposition)
    ) reasons.push('PARENT_TERMINAL_RECEIPT_RESULT_MISMATCH');
  }
  if (
    !subject
    || !Number.isInteger(subject.pass)
    || subject.pass < 1
    || subject.pass > (options.allowPass3 ? 3 : 2)
  ) reasons.push('RETRY_PASS_EXHAUSTED');
  if (reasons.length > 0 || !claim || !receipt || !envelope || !subject || !result) {
    return { parts: null, reasonCodes: sortedUnique(reasons) };
  }
  return {
    parts: {
      gatewayJob,
      claim,
      receipt,
      envelope,
      subject,
      result,
    },
    reasonCodes: [],
  };
};
const retryScopeAuthorityValid = (
  snapshot: RetrySnapshot,
  parent: RetryParentParts,
): boolean => {
  const scope = parent.subject.repairContext.sourceSportScope;
  if (!scope) return true;
  const parsedScope = affiliateAgentSourceSportScopeSchema.safeParse(scope);
  if (
    !parsedScope.success
    || parsedScope.data.supplySourceId !== parent.subject.supplySourceId
    || parsedScope.data.intakeId !== parent.subject.repairContext.intakeId
    || parsedScope.data.evidenceRunId !== parent.subject.repairContext.evidenceRunId
  ) return false;
  const authorityJob = snapshot.gatewayJobs.find(
    (candidate) => candidate.id === parsedScope.data.parentGatewayJobId,
  );
  if (
    !authorityJob
    || authorityJob.id === parent.gatewayJob.id
    || authorityJob.supplySourceId !== parsedScope.data.supplySourceId
    || !retryAncestorGatewayJobIds(snapshot, parent).has(authorityJob.id)
  ) return false;
  const authority = retryParentPartsFor(snapshot, authorityJob.id, { allowPass3: true }).parts;
  if (
    !authority
    || authority.gatewayJob.id !== parsedScope.data.parentGatewayJobId
    || authority.gatewayJob.resultHash !== parsedScope.data.parentResultHash
    || authority.subject.supplySourceId !== parsedScope.data.supplySourceId
    || authority.subject.repairContext.intakeId !== parsedScope.data.intakeId
    || authority.subject.repairContext.evidenceRunId !== parsedScope.data.evidenceRunId
  ) return false;
  const mappingJob = snapshot.admission.jobs.find(
    (candidate) => candidate.id === parent.subject.mappingJobId,
  );
  const intake = mappingJob
    ? snapshot.admission.intakes.find((candidate) => candidate.id === mappingJob.intakeId)
    : null;
  if (!mappingJob || !intake) return false;
  const audits = retryAuditForParent(mappingJob, authority.gatewayJob.id).filter((audit) => (
    audit.kind === 'LEGACY_SPORT_REPAIR_RETRY'
    && sameAdmissionValue(audit.sourceSportScope ?? null, parsedScope.data)
    && sameAdmissionValue(
      recordValue(audit.repairContext).sourceSportScope ?? null,
      parsedScope.data,
    )
  ));
  if (audits.length !== 1) return false;
  const childId = stringValue(audits[0]?.childGatewayJobId);
  const child = childId
    ? snapshot.gatewayJobs.find((candidate) => candidate.id === childId) ?? null
    : null;
  return child !== null
    && childId !== null
    && retryAuditMatchesEdge(
      snapshot,
      mappingJob,
      intake,
      authority,
      child,
      authority.subject.pass + 1,
    );
};

const retrySourceSportScopeFor = async (
  snapshot: RetrySnapshot,
  parent: RetryParentParts,
  requestedReason: string,
  request: RetryScopeRequest,
  artifactStore?: AffiliateAgentArtifactStore,
): Promise<RetryScopeDecision> => {
  const inheritedScope = parent.subject.repairContext.sourceSportScope;
  const reasons: string[] = [];
  if (inheritedScope && !retryScopeAuthorityValid(snapshot, parent)) {
    reasons.push('SOURCE_SCOPE_AUTHORITY_INVALID');
  }
  let verifiedParentSportEvidence: AffiliateAgentSportEvidence | null | undefined;
  if (inheritedScope) {
    verifiedParentSportEvidence = await retryHistoricalSportEvidenceFor(parent, artifactStore);
  }
  const requestedLabels = request.excludedSourceLabels;
  if (requestedLabels === undefined) {
    return {
      ...(inheritedScope ? { sourceSportScope: inheritedScope } : {}),
      hasNewExclusions: false,
      reasonCodes: reasons,
      verifiedParentSportEvidence,
    };
  }
  const inheritedLabelsByKey = new Map(
    (inheritedScope?.excludedSourceLabels ?? []).map((label) => [
      normalizeAffiliateSportLabel(label),
      label,
    ]),
  );
  const requestedLabelKeys = new Set(requestedLabels.map(normalizeAffiliateSportLabel));
  const inheritedKeys = [...inheritedLabelsByKey.keys()];
  if (inheritedKeys.some((label) => !requestedLabelKeys.has(label))) {
    reasons.push('SOURCE_SCOPE_WEAKENED');
  }
  const newLabels = requestedLabels.filter(
    (label) => !inheritedLabelsByKey.has(normalizeAffiliateSportLabel(label)),
  );
  if (newLabels.length === 0) {
    return {
      ...(inheritedScope ? { sourceSportScope: inheritedScope } : {}),
      hasNewExclusions: false,
      reasonCodes: reasons,
      verifiedParentSportEvidence,
    };
  }
  if (verifiedParentSportEvidence === undefined) {
    verifiedParentSportEvidence = await retryHistoricalSportEvidenceFor(parent, artifactStore);
  }
  if (!verifiedParentSportEvidence) {
    reasons.push('SOURCE_SCOPE_EVIDENCE_INVALID');
  } else {
    const effectiveLabelKeys = new Set([
      ...inheritedKeys,
      ...requestedLabels.map(normalizeAffiliateSportLabel),
    ]);
    const newLabelKeys = new Set(newLabels.map(normalizeAffiliateSportLabel));
    const coveredNewLabels = new Set<string>();
    for (const determination of verifiedParentSportEvidence.sportDeterminations) {
      const determinationLabelKeys = determination.sourceLabels.map(normalizeAffiliateSportLabel);
      const matchingNewLabels = determinationLabelKeys.filter((label) => newLabelKeys.has(label));
      if (matchingNewLabels.length === 0) {
        if (
          determination.status === 'RESOLVED'
          && determination.canonicalSportNames.some((name) => newLabelKeys.has(normalizeAffiliateSportLabel(name)))
        ) {
          reasons.push('SOURCE_SCOPE_RESOLVED_LABEL');
        }
        continue;
      }
      if (determination.status === 'RESOLVED') {
        reasons.push('SOURCE_SCOPE_RESOLVED_LABEL');
      }
      if (determination.resolutionBasis !== 'SOURCE_EVIDENCE') {
        reasons.push('SOURCE_SCOPE_USER_DECISION');
      }
      if (determinationLabelKeys.some((label) => !effectiveLabelKeys.has(label))) {
        reasons.push('SOURCE_SCOPE_DETERMINATION_SPLIT');
      }
      matchingNewLabels.forEach((label) => coveredNewLabels.add(label));
    }
    if (newLabels.some((label) => !coveredNewLabels.has(normalizeAffiliateSportLabel(label)))) {
      reasons.push('SOURCE_SCOPE_LABEL_NOT_VERIFIED');
    }
  }
  const operatorId = request.operatorId;
  if (!operatorId) reasons.push('SOURCE_SCOPE_OPERATOR_REQUIRED');
  const parentResultHash = normalizeHash(parent.gatewayJob.resultHash);
  if (!parentResultHash) reasons.push('SOURCE_SCOPE_PARENT_RESULT_HASH_INVALID');
  const canBuild = reasons.length === 0 && operatorId && parentResultHash;
  if (!canBuild) {
    return {
      ...(inheritedScope ? { sourceSportScope: inheritedScope } : {}),
      hasNewExclusions: false,
      reasonCodes: reasons,
      verifiedParentSportEvidence,
    };
  }
  const labelByKey = new Map<string, string>();
  for (const label of inheritedScope?.excludedSourceLabels ?? []) {
    labelByKey.set(normalizeAffiliateSportLabel(label), label);
  }
  for (const label of requestedLabels) {
    labelByKey.set(normalizeAffiliateSportLabel(label), label);
  }
  const excludedSourceLabels = [...labelByKey.values()].sort();
  const preimage = {
    schemaVersion: 1 as const,
    supplySourceId: parent.subject.supplySourceId,
    intakeId: parent.subject.repairContext.intakeId,
    evidenceRunId: parent.subject.repairContext.evidenceRunId,
    parentGatewayJobId: parent.gatewayJob.id,
    parentResultHash,
    excludedSourceLabels,
    operatorId,
    reason: requestedReason,
  };
  const sourceSportScope = affiliateAgentSourceSportScopeSchema.parse({
    ...preimage,
    hash: hashAffiliateAgentValue(preimage),
  });
  return {
    sourceSportScope,
    hasNewExclusions: true,
    reasonCodes: reasons,
    verifiedParentSportEvidence,
  };
};


const retryParentLineageValid = (
  snapshot: RetrySnapshot,
  parent: RetryParentParts,
  seen = new Set<string>(),
  options: RetryParentPartsOptions = {},
): boolean => {
  if (seen.has(parent.gatewayJob.id)) return false;
  seen.add(parent.gatewayJob.id);
  if (parent.subject.pass === 1) return parent.gatewayJob.parentClaimId === null;
  const parentClaimId = parent.gatewayJob.parentClaimId;
  if (!parentClaimId) return false;
  const ancestorClaim = snapshot.gatewayClaims.find((claim) => claim.id === parentClaimId);
  const ancestorJob = ancestorClaim
    ? snapshot.gatewayJobs.find((job) => job.id === ancestorClaim.jobId)
    : null;
  if (!ancestorClaim || !ancestorJob) return false;
  const ancestorParts = retryParentPartsFor(snapshot, ancestorJob.id, options).parts;
  if (!ancestorParts || ancestorParts.subject.pass !== parent.subject.pass - 1) return false;
  const mappingJob = snapshot.admission.jobs.find((job) => job.id === parent.subject.mappingJobId) ?? null;
  const intake = mappingJob
    ? snapshot.admission.intakes.find((candidate) => candidate.id === mappingJob.intakeId) ?? null
    : null;
  return ancestorParts.subject.mappingJobId === parent.subject.mappingJobId
    && ancestorParts.subject.supplySourceId === parent.subject.supplySourceId
    && sameRetryLineageContext(ancestorParts.subject.repairContext, parent.subject.repairContext)
    && sameAdmissionValue(ancestorJob.evidenceManifestJson, parent.gatewayJob.evidenceManifestJson)
    && mappingJob !== null
    && intake !== null
    && retryAuditMatchesEdge(snapshot, mappingJob, intake, ancestorParts, parent.gatewayJob, parent.subject.pass)
    && retryParentLineageValid(snapshot, ancestorParts, seen, options);
};

const retryAncestorGatewayJobIds = (
  snapshot: RetrySnapshot,
  parent: RetryParentParts,
): ReadonlySet<string> => {
  const result = new Set<string>();
  let parentClaimId = parent.gatewayJob.parentClaimId;
  while (parentClaimId) {
    const claim = snapshot.gatewayClaims.find((candidate) => candidate.id === parentClaimId);
    if (!claim) break;
    const job = snapshot.gatewayJobs.find((candidate) => candidate.id === claim.jobId);
    if (!job || result.has(job.id)) break;
    result.add(job.id);
    parentClaimId = job.parentClaimId ?? null;
  }
  return result;
};
const retryOriginalAncestorFor = (
  snapshot: RetrySnapshot,
  parent: RetryParentParts,
): RetryParentParts | null => {
  let current = parent;
  const seen = new Set<string>();
  while (current.subject.pass > 1) {
    if (seen.has(current.gatewayJob.id)) return null;
    seen.add(current.gatewayJob.id);
    const parentClaimId = current.gatewayJob.parentClaimId;
    if (!parentClaimId) return null;
    const ancestorClaim = snapshot.gatewayClaims.find((claim) => claim.id === parentClaimId);
    const ancestorJob = ancestorClaim
      ? snapshot.gatewayJobs.find((job) => job.id === ancestorClaim.jobId)
      : null;
    if (!ancestorJob) return null;
    const ancestor = retryParentPartsFor(snapshot, ancestorJob.id).parts;
    const mappingJob = snapshot.admission.jobs.find((job) => job.id === current.subject.mappingJobId) ?? null;
    const intake = mappingJob
      ? snapshot.admission.intakes.find((candidate) => candidate.id === mappingJob.intakeId) ?? null
      : null;
    if (
      !ancestor
      || ancestor.subject.pass !== current.subject.pass - 1
      || ancestor.subject.mappingJobId !== current.subject.mappingJobId
      || ancestor.subject.supplySourceId !== current.subject.supplySourceId
      || !sameRetryLineageContext(ancestor.subject.repairContext, current.subject.repairContext)
      || !sameAdmissionValue(ancestor.gatewayJob.evidenceManifestJson, current.gatewayJob.evidenceManifestJson)
      || !mappingJob
      || !intake
      || !retryAuditMatchesEdge(snapshot, mappingJob, intake, ancestor, current.gatewayJob, current.subject.pass)
    ) return null;
    current = ancestor;
  }
  return current.subject.pass === 1 ? current : null;
};

const retryDedupeKeyFor = (gatewayJobId: string): string => (
  `legacy-sport-repair-retry:${gatewayJobId}`
);

const retryDeterministicRow = (
  row: RecordedRetryRow,
): Record<string, unknown> => ({
  gatewayJobId: row.gatewayJobId,
  parentClaimId: row.parentClaimId,
  mappingJobId: row.mappingJobId,
  intakeId: row.intakeId,
  sourceKey: row.sourceKey,
  sourceId: row.sourceId,
  mappingId: row.mappingId,
  rootId: row.rootId,
  rootIdentityKey: row.rootIdentityKey,
  parentPass: row.parentPass,
  retryPass: row.retryPass,
  parentReceiptId: row.parentReceiptId,
  parentResultHash: row.parentResultHash,
  parentDeploymentContractHash: row.parentDeploymentContractHash,
  currentDeploymentContractHash: row.currentDeploymentContractHash,
  evidenceRunId: row.evidenceRunId,
  sportsCatalogSha256: row.sportsCatalogSha256,
  stateFingerprint: row.stateFingerprint,
  artifacts: row.artifacts,
  ...(row.sourceSportScope ? { sourceSportScope: row.sourceSportScope } : {}),
  gatewayDedupeKey: row.gatewayDedupeKey,
  write: row.write ?? null,
});

const retryReportHashFor = (input: Readonly<{
  schemaVersion: 1 | 2;
  contractVersion: number;
  contractHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  reason: string;
  requestedGatewayJobIds: readonly string[];
  selectedGatewayJobIds: readonly string[];
  counts: AffiliateLegacyRepairRetryCounts;
  rows: readonly RecordedRetryRow[];
  proposedWrites: readonly RecordedRetryWrite[];
}>): string => hashAffiliateAgentValue(normalizeAdmissionHashValue({
  schemaVersion: input.schemaVersion,
  operation: 'LEGACY_SPORT_REPAIR_RETRY',
  contractVersion: input.contractVersion,
  contractHash: input.contractHash,
  deploymentContractVersion: input.deploymentContractVersion,
  deploymentContractHash: input.deploymentContractHash,
  reason: input.reason,
  requestedGatewayJobIds: [...input.requestedGatewayJobIds].sort(),
  selectedGatewayJobIds: [...input.selectedGatewayJobIds].sort(),
  counts: input.counts,
  rows: [...input.rows]
    .sort((left, right) => left.gatewayJobId < right.gatewayJobId ? -1 : left.gatewayJobId > right.gatewayJobId ? 1 : 0)
    .map(retryDeterministicRow),
  proposedWrites: [...input.proposedWrites]
    .sort((left, right) => left.gatewayJobId < right.gatewayJobId ? -1 : left.gatewayJobId > right.gatewayJobId ? 1 : 0),
}) ?? null);

const retryAuditedSubjectFor = (
  child: GatewayJobRow,
  audit: JsonRecord,
  write: JsonRecord | undefined,
): AffiliateAgentHistoricalMappingProducerSubject | null => {
  const version = audit.schemaVersion;
  if (!write || (version !== 1 && version !== AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION)
    || recordValue(audit.reportSnapshot).schemaVersion !== version) return null;
  const parsed = version === 1
    ? affiliateAgentHistoricalMappingProducerSubjectSchema.safeParse(child.subjectJson)
    : affiliateAgentSubjectSchema.safeParse(child.subjectJson);
  if (!parsed.success || parsed.data.type !== 'MAPPING_PRODUCER') return null;
  if (version === 1) {
    if (write.listingKind !== undefined || parsed.data.listingKind !== undefined) return null;
  } else {
    const listingKind = listingKindFor(write.listingKind);
    if (!listingKind || parsed.data.listingKind !== listingKind) return null;
  }
  return parsed.data;
};
const retryAuditMatchesEdge = (
  snapshot: RetrySnapshot,
  mappingJob: MappingJobRow,
  intake: IntakeRow,
  parent: RetryParentParts,
  child: GatewayJobRow,
  childPass: number,
): boolean => {
  const audits = retryAuditForParent(mappingJob, parent.gatewayJob.id);
  if (audits.length !== 1) return false;
  const audit = audits[0];
  const report = recordValue(audit.reportSnapshot);
  const reportRows = Array.isArray(report.rows) ? report.rows.map(recordValue) : [];
  const reportWrites = Array.isArray(report.proposedWrites) ? report.proposedWrites.map(recordValue) : [];
  const reportRow = reportRows.find((row) => row.gatewayJobId === parent.gatewayJob.id);
  const reportWrite = reportWrites.find((write) => write.gatewayJobId === parent.gatewayJob.id);
  if (!reportRow || !reportWrite) return false;
  const reportHash = stringValue(audit.reportHash);
  if (!reportHash || report.reportHash !== reportHash) return false;
  try {
    if (retryReportHashFor(report as unknown as AffiliateLegacyRepairRetryReport) !== reportHash) return false;
  } catch {
    return false;
  }
  const childSubject = retryAuditedSubjectFor(child, audit, reportWrite);
  if (!childSubject) return false;
  const root = snapshot.admission.roots.find((candidate) => candidate.id === parent.subject.supplySourceId) ?? null;
  const auditManifest = affiliateAgentEvidenceManifestSchema.safeParse(audit.manifest);
  if (!auditManifest.success) return false;
  if (!root) return false;
  const manifestArtifactIds = auditManifest.data.entries.map((entry) => entry.artifactId).sort();
  const rowArtifacts = Array.isArray(reportRow.artifacts)
    ? reportRow.artifacts.map(recordValue).map((artifact) => ({
      kind: artifact.kind,
      artifactId: artifact.artifactId,
      sha256: artifact.sha256,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
    }))
    : [];
  const catalogHash = stringValue(audit.sportsCatalogSha256);
  const auditContextCatalogHash = stringValue(recordValue(recordValue(audit.repairContext).sportsCatalog).sha256);
  const childContextCatalogHash = stringValue(
    recordValue(recordValue(childSubject.repairContext).sportsCatalog).sha256,
  );
  const auditArtifactIds = stringArrayValue(audit.artifactIds);
  const expectedChildDedupeKey = retryDedupeKeyFor(parent.gatewayJob.id);
  const reportRequestedGatewayJobIds = stringArrayValue(report.requestedGatewayJobIds);
  const reportSelectedGatewayJobIds = stringArrayValue(report.selectedGatewayJobIds);
  const auditScope = recordValue(audit.repairContext).sourceSportScope;
  const parentScope = parent.subject.repairContext.sourceSportScope;
  const parentScopeLabels = new Set(
    parentScope?.excludedSourceLabels.map(normalizeAffiliateSportLabel) ?? [],
  );
  const parsedAuditScope = affiliateAgentSourceSportScopeSchema.safeParse(auditScope);
  const auditScopeLabels = new Set(
    parsedAuditScope.success
      ? parsedAuditScope.data.excludedSourceLabels.map(normalizeAffiliateSportLabel)
      : [],
  );
  const meaningfulSourceScopeChange = parsedAuditScope.success
    && parsedAuditScope.data.supplySourceId === parent.subject.supplySourceId
    && parsedAuditScope.data.intakeId === parent.subject.repairContext.intakeId
    && parsedAuditScope.data.evidenceRunId === parent.subject.repairContext.evidenceRunId
    && parsedAuditScope.data.parentGatewayJobId === parent.gatewayJob.id
    && normalizeHash(parsedAuditScope.data.parentResultHash) === normalizeHash(parent.gatewayJob.resultHash)
    && [...auditScopeLabels].some((label) => !parentScopeLabels.has(label));
  const reportAppliedGatewayJobIds = stringArrayValue(report.appliedGatewayJobIds);
  const reportCounts = recordValue(report.counts);
  const reportRowChildIds = reportRows.map((row) => row.childGatewayJobId);
  const reportShapeValid = report.mode === 'APPLY'
    && report.reportHash === reportHash
    && report.reviewedReportHash === reportHash
    && (
      (
        report.deploymentContractVersion !== parent.claim.deploymentContractVersion
        && report.deploymentContractHash !== parent.claim.deploymentContractHash
      )
      || meaningfulSourceScopeChange
    )
    && stringValue(report.reason) === stringValue(audit.reason)
    && report.contractVersion === parent.claim.supplyContractVersion
    && report.contractHash === parent.claim.supplyContractHash
    && reportRequestedGatewayJobIds !== null
    && reportSelectedGatewayJobIds !== null
    && reportAppliedGatewayJobIds !== null
    && sameAdmissionValue(reportRequestedGatewayJobIds, reportSelectedGatewayJobIds)
    && sameAdmissionValue(reportRequestedGatewayJobIds, reportRows.map((row) => row.gatewayJobId))
    && sameAdmissionValue(reportRequestedGatewayJobIds, reportWrites.map((write) => write.gatewayJobId))
    && reportRows.length === reportRequestedGatewayJobIds.length
    && reportWrites.length === reportRequestedGatewayJobIds.length
    && reportCounts.total === reportRequestedGatewayJobIds.length
    && reportCounts.eligible === reportRequestedGatewayJobIds.length
    && reportCounts.held === 0
    && reportCounts.selected === reportRequestedGatewayJobIds.length
    && reportCounts.alreadyRetried === 0
    && report.writeCount === reportRequestedGatewayJobIds.length
    && reportAppliedGatewayJobIds.length === reportRequestedGatewayJobIds.length
    && reportRows.every((row) => (
      row.eligible === true
      && row.alreadyRetried === false
      && row.outcome === 'APPLIED'
      && typeof row.childGatewayJobId === 'string'
    ))
    && sameAdmissionValue(reportAppliedGatewayJobIds, reportRowChildIds)
    && stringValue(audit.operatorId) !== null;
  const expectedRootLifecycleGeneration = child.expectedLifecycleGeneration;
  return audit.kind === 'LEGACY_SPORT_REPAIR_RETRY'
    && reportShapeValid
    && parent.gatewayJob.queue === 'AFFILIATE_MAPPING'
    && parent.gatewayJob.lane === 'MAPPING_PRODUCTION'
    && parent.claim.queue === 'AFFILIATE_MAPPING'
    && parent.claim.lane === 'MAPPING_PRODUCTION'
    && child.parentClaimId === parent.claim.id
    && child.role === 'MAPPING_PRODUCER'
    && child.queue === 'AFFILIATE_MAPPING'
    && child.lane === 'MAPPING_PRODUCTION'
    && child.subjectType === 'MAPPING_PRODUCER'
    && child.subjectId === mappingJob.id
    && child.supplySourceId === parent.subject.supplySourceId
    && childSubject.mappingJobId === mappingJob.id
    && childSubject.supplySourceId === parent.subject.supplySourceId
    && audit.schemaVersion === report.schemaVersion
    && sameAdmissionValue(audit.requestedGatewayJobIds, report.requestedGatewayJobIds)
    && audit.parentGatewayJobId === parent.gatewayJob.id
    && audit.parentClaimId === parent.claim.id
    && audit.parentMappingJobId === mappingJob.id
    && audit.parentReceiptId === parent.receipt.id
    && audit.parentResultHash === parent.gatewayJob.resultHash
    && audit.parentDeploymentContractHash === parent.claim.deploymentContractHash
    && audit.parentPass === parent.subject.pass
    && audit.retryPass === childPass
    && audit.rootId === childSubject.supplySourceId
    && audit.rootLifecycleGeneration === expectedRootLifecycleGeneration
    && audit.childGatewayJobId === child.id
    && child.dedupeKey === expectedChildDedupeKey
    && audit.childDedupeKey === expectedChildDedupeKey
    && audit.intakeId === intake.id
    && audit.sourceId === mappingJob.sourceId
    && audit.mappingId === reportRow.mappingId
    && audit.mappingId === reportWrite.mappingId
    && audit.evidenceRunId === parent.subject.repairContext.evidenceRunId
    && sameRepairContext(audit.repairContext, childSubject.repairContext)
    && sameAdmissionValue(
      audit.sourceSportScope ?? null,
      recordValue(audit.repairContext).sourceSportScope ?? null,
    )
    && sameAdmissionValue(reportRow.sourceSportScope ?? null, reportWrite.sourceSportScope ?? null)
    && sameAdmissionValue(
      reportWrite.sourceSportScope ?? null,
      recordValue(audit.repairContext).sourceSportScope ?? null,
    )
    && sameRetryLineageContext(audit.repairContext, parent.subject.repairContext)
    && audit.rootId === parent.subject.supplySourceId
    && audit.rootLifecycleGeneration === parent.claim.lifecycleGeneration
    && parent.gatewayJob.expectedLifecycleGeneration === parent.claim.lifecycleGeneration
    && child.expectedLifecycleGeneration === parent.claim.lifecycleGeneration
    && catalogHash !== null
    && catalogHash === stringValue(reportRow.sportsCatalogSha256)
    && catalogHash === stringValue(reportWrite.sportsCatalogSha256)
    && catalogHash === auditContextCatalogHash
    && catalogHash === childContextCatalogHash
    && sameAdmissionValue(auditArtifactIds, manifestArtifactIds)
    && sameAdmissionValue(rowArtifacts, auditManifest.data.entries.map((entry) => ({
      kind: entry.kind,
      artifactId: entry.artifactId,
      sha256: entry.sha256,
      mimeType: entry.mimeType,
      byteSize: entry.byteSize,
    })))
    && sameAdmissionValue(audit.manifest, parent.gatewayJob.evidenceManifestJson)
    && sameAdmissionValue(audit.manifest, child.evidenceManifestJson)
    && sameAdmissionValue(sortedUnique(auditManifest.data.entries.map((entry) => entry.artifactId)), reportWrite.artifactIds)
    && reportRow.gatewayJobId === parent.gatewayJob.id
    && reportRow.childGatewayJobId === child.id
    && reportRow.parentClaimId === parent.claim.id
    && reportRow.mappingJobId === mappingJob.id
    && reportRow.intakeId === intake.id
    && reportRow.sourceKey === intake.sourceKey
    && reportRow.sourceId === mappingJob.sourceId
    && reportRow.rootId === childSubject.supplySourceId
    && reportRow.rootIdentityKey === root?.identityKey
    && reportRow.parentPass === parent.subject.pass
    && reportRow.retryPass === childPass
    && reportRow.parentReceiptId === parent.receipt.id
    && reportRow.parentResultHash === parent.gatewayJob.resultHash
    && reportRow.parentDeploymentContractHash === parent.claim.deploymentContractHash
    && reportRow.evidenceRunId === parent.subject.repairContext.evidenceRunId
    && reportRow.gatewayDedupeKey === expectedChildDedupeKey
    && reportRow.currentDeploymentContractHash === report.deploymentContractHash
    && reportWrite.gatewayJobId === parent.gatewayJob.id
    && reportWrite.mappingJobId === mappingJob.id
    && reportWrite.parentReceiptId === parent.receipt.id
    && reportWrite.parentResultHash === parent.gatewayJob.resultHash
    && reportWrite.parentDeploymentContractHash === parent.claim.deploymentContractHash
    && reportWrite.parentClaimGeneration === parent.claim.claimGeneration
    && reportWrite.parentLifecycleGeneration === parent.claim.lifecycleGeneration
    && reportWrite.parentClaimId === parent.claim.id
    && reportWrite.sourceKey === intake.sourceKey
    && reportWrite.rootIdentityKey === root.identityKey
    && reportWrite.intakeId === intake.id
    && reportWrite.sourceId === mappingJob.sourceId
    && reportWrite.rootId === childSubject.supplySourceId
    && reportWrite.rootLifecycleGeneration === expectedRootLifecycleGeneration
    && reportWrite.parentPass === parent.subject.pass
    && reportWrite.retryPass === childPass
    && reportWrite.evidenceRunId === parent.subject.repairContext.evidenceRunId
    && reportWrite.gatewayDedupeKey === expectedChildDedupeKey
    && sameAdmissionValue(reportWrite.artifactIds, auditArtifactIds)
    && sameAdmissionValue(reportWrite.writes, [
      'AFFILIATE_LEGACY_MAPPING_JOB_QUEUE',
      'AFFILIATE_GATEWAY_MAPPING_PRODUCER_RETRY_JOB',
      'AFFILIATE_LEGACY_REPAIR_RETRY_AUDIT',
    ])
    && reportWrite.currentDeploymentContractHash === report.deploymentContractHash
    && sameRepairContext(reportWrite.repairContext, audit.repairContext)
    && reportWrite.manifestHash === auditManifest.data.hash
    && sameAdmissionValue(reportWrite.manifest, audit.manifest);
};

const continuationDeterministicRow = (
  row: AffiliateLegacyRepairContinuationRow,
): Record<string, unknown> => ({
  gatewayJobId: row.gatewayJobId,
  parentClaimId: row.parentClaimId,
  mappingJobId: row.mappingJobId,
  intakeId: row.intakeId,
  sourceKey: row.sourceKey,
  sourceId: row.sourceId,
  mappingId: row.mappingId,
  rootId: row.rootId,
  rootIdentityKey: row.rootIdentityKey,
  parentPass: row.parentPass,
  continuationPass: row.continuationPass,
  parentReceiptId: row.parentReceiptId,
  parentResultHash: row.parentResultHash,
  parentDeploymentContractHash: row.parentDeploymentContractHash,
  currentDeploymentContractHash: row.currentDeploymentContractHash,
  evidenceRunId: row.evidenceRunId,
  sportsCatalogSha256: row.sportsCatalogSha256,
  stateFingerprint: row.stateFingerprint,
  artifacts: row.artifacts,
  ...(row.sourceSportScope ? { sourceSportScope: row.sourceSportScope } : {}),
  producerDedupeKey: row.producerDedupeKey,
  reviewerDedupePrefix: row.reviewerDedupePrefix,
  write: row.write ?? null,
});

const continuationReportHashFor = (input: Readonly<{
  schemaVersion: 1;
  contractVersion: number;
  contractHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  reason: string;
  gatewayJobId: string;
  requestedGatewayJobIds: readonly string[];
  selectedGatewayJobIds: readonly string[];
  parentPass: 3;
  continuationPass: 3;
  limits: AffiliateLegacyRepairContinuationLimits;
  counts: AffiliateLegacyRepairContinuationCounts;
  rows: readonly AffiliateLegacyRepairContinuationRow[];
  proposedWrites: readonly AffiliateLegacyRepairContinuationWrite[];
}>): string => hashAffiliateAgentValue(normalizeAdmissionHashValue({
  schemaVersion: input.schemaVersion,
  operation: 'LEGACY_SPORT_REPAIR_CONTINUATION',
  contractVersion: input.contractVersion,
  contractHash: input.contractHash,
  deploymentContractVersion: input.deploymentContractVersion,
  deploymentContractHash: input.deploymentContractHash,
  reason: input.reason,
  gatewayJobId: input.gatewayJobId,
  requestedGatewayJobIds: [...input.requestedGatewayJobIds].sort(),
  selectedGatewayJobIds: [...input.selectedGatewayJobIds].sort(),
  parentPass: input.parentPass,
  continuationPass: input.continuationPass,
  limits: input.limits,
  counts: input.counts,
  rows: [...input.rows].map(continuationDeterministicRow),
  proposedWrites: [...input.proposedWrites],
}) ?? null);

const retryStateFingerprintFor = (input: Readonly<Record<string, unknown>>): string => (
  hashAffiliateAgentValue(normalizeAdmissionHashValue(input) ?? null)
);

const retryEmptyRow = (
  gatewayJobId: string,
  currentDeploymentContractHash: string,
  reasonCodes: readonly string[],
): AffiliateLegacyRepairRetryRow => ({
  gatewayJobId,
  parentClaimId: null,
  mappingJobId: null,
  intakeId: null,
  sourceKey: null,
  sourceId: null,
  mappingId: null,
  rootId: null,
  rootIdentityKey: null,
  parentPass: null,
  retryPass: null,
  parentReceiptId: null,
  parentResultHash: null,
  parentDeploymentContractHash: null,
  currentDeploymentContractHash,
  evidenceRunId: null,
  sportsCatalogSha256: null,
  sportsCatalogCapturedAt: null,
  stateFingerprint: retryStateFingerprintFor({ gatewayJobId, reasonCodes }),
  artifacts: [],
  gatewayDedupeKey: null,
  childGatewayJobId: null,
  eligible: false,
  alreadyRetried: false,
  reason: reason(reasonCodes),
  reasonCodes: sortedUnique(reasonCodes),
  outcome: 'HELD',
});

const retryAuditedChildMatches = (
  child: GatewayJobRow | null,
  parent: RetryParentParts,
  audit: JsonRecord,
  mappingJob: MappingJobRow,
  root: SupplyRootRow,
  manifest: Record<string, unknown>,
  retryPass: number,
): boolean => {
  if (!child) return false;
  const report = recordValue(audit.reportSnapshot);
  const reportWrites = Array.isArray(report.proposedWrites)
    ? report.proposedWrites.map(recordValue)
    : [];
  const reportWrite = reportWrites.find((write) => write.gatewayJobId === parent.gatewayJob.id);
  const parsedSubject = retryAuditedSubjectFor(child, audit, reportWrite);
  const auditRootLifecycleGeneration = typeof audit.rootLifecycleGeneration === 'number'
    ? audit.rootLifecycleGeneration
    : null;
  return child.id === stringValue(audit.childGatewayJobId)
    && child.dedupeKey === stringValue(audit.childDedupeKey)
    && child.role === 'MAPPING_PRODUCER'
    && child.queue === 'AFFILIATE_MAPPING'
    && child.lane === 'MAPPING_PRODUCTION'
    && child.subjectType === 'MAPPING_PRODUCER'
    && child.subjectId === mappingJob.id
    && child.parentClaimId === parent.claim.id
    && child.supplySourceId === root.id
    && auditRootLifecycleGeneration !== null
    && child.expectedLifecycleGeneration === auditRootLifecycleGeneration
    && parsedSubject !== null
    && parsedSubject.mappingJobId === mappingJob.id
    && parsedSubject.supplySourceId === root.id
    && parsedSubject.pass === retryPass
    && sameAdmissionValue(parsedSubject.repairContext, audit.repairContext)
    && sameAdmissionValue(
      audit.sourceSportScope ?? null,
      recordValue(audit.repairContext).sourceSportScope ?? null,
    )
    && sameAdmissionValue(
      reportWrite?.sourceSportScope ?? null,
      recordValue(audit.repairContext).sourceSportScope ?? null,
    )
    && sameAdmissionValue(child.evidenceManifestJson, manifest);
};
const continuationLimitsValid = (
  auditLimits: JsonRecord,
  reportLimits: JsonRecord,
): boolean => (
  auditLimits.producerClaims === AFFILIATE_LEGACY_REPAIR_CONTINUATION_PRODUCER_LIMIT
  && auditLimits.reviewerClaims === AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT
  && reportLimits.producerClaims === AFFILIATE_LEGACY_REPAIR_CONTINUATION_PRODUCER_LIMIT
  && reportLimits.reviewerClaims === AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT
  && sameAdmissionValue(auditLimits, reportLimits)
);

const continuationAuditedChildMatches = (
  parent: RetryParentParts,
  audit: JsonRecord,
  child: GatewayJobRow | null,
  mappingJob: MappingJobRow,
  root: SupplyRootRow,
  manifest: Record<string, unknown>,
): boolean => {
  if (!child) return false;
  const report = recordValue(audit.reportSnapshot);
  const reportRows = Array.isArray(report.rows) ? report.rows.map(recordValue) : [];
  const reportWrites = Array.isArray(report.proposedWrites)
    ? report.proposedWrites.map(recordValue)
    : [];
  const row = reportRows.find((value) => value.gatewayJobId === parent.gatewayJob.id);
  const write = reportWrites.find((value) => value.gatewayJobId === parent.gatewayJob.id);
  const parsedSubject = affiliateAgentSubjectSchema.safeParse(child.subjectJson);
  const reportRequested = stringArrayValue(report.requestedGatewayJobIds);
  const reportSelected = stringArrayValue(report.selectedGatewayJobIds);
  const reportApplied = stringArrayValue(report.appliedGatewayJobIds);
  const reportCounts = recordValue(report.counts);
  const reportLimits = recordValue(report.limits);
  const auditLimits = recordValue(audit.limits);
  let reportHashValid = false;
  try {
    reportHashValid = typeof report.reportHash === 'string'
      && continuationReportHashFor(report as unknown as AffiliateLegacyRepairContinuationReport)
        === report.reportHash;
  } catch {
    reportHashValid = false;
  }
  const producerDedupeKey = `${AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX}${root.id}`;
  const reviewerDedupePrefix = AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX;
  const childSubject = parsedSubject.success && parsedSubject.data.type === 'MAPPING_PRODUCER'
    ? parsedSubject.data
    : null;
  const parsedManifest = affiliateAgentEvidenceManifestSchema.safeParse(manifest);
  return (
    audit.operation === 'LEGACY_SPORT_REPAIR_CONTINUATION'
    && audit.kind === 'LEGACY_SPORT_REPAIR_CONTINUATION'
    && audit.schemaVersion === AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION
    && reportHashValid
    && report.operation === 'LEGACY_SPORT_REPAIR_CONTINUATION'
    && report.schemaVersion === AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION
    && report.mode === 'APPLY'
    && report.reportHash === audit.reportHash
    && report.reviewedReportHash === audit.reportHash
    && report.replayed === false
    && report.writeCount === 1
    && report.gatewayJobId === parent.gatewayJob.id
    && report.parentPass === 3
    && report.continuationPass === 3
    && reportRequested !== null
    && reportSelected !== null
    && reportApplied !== null
    && sameAdmissionValue(reportRequested, [parent.gatewayJob.id])
    && sameAdmissionValue(reportSelected, [parent.gatewayJob.id])
    && reportApplied.length === 1
    && continuationLimitsValid(auditLimits, reportLimits)
    && reportCounts.total === 1
    && reportCounts.eligible === 1
    && reportCounts.held === 0
    && reportCounts.selected === 1
    && reportCounts.alreadyContinued === 0
    && reportRows.length === 1
    && reportWrites.length === 1
    && row !== undefined
    && write !== undefined
    && row.gatewayJobId === parent.gatewayJob.id
    && row.childGatewayJobId === child.id
    && row.parentPass === 3
    && row.continuationPass === 3
    && row.eligible === true
    && row.alreadyContinued === false
    && row.outcome === 'APPLIED'
    && row.parentClaimId === parent.claim.id
    && row.mappingJobId === mappingJob.id
    && row.intakeId === mappingJob.intakeId
    && row.sourceId === mappingJob.sourceId
    && row.rootId === root.id
    && row.rootIdentityKey === root.identityKey
    && row.parentReceiptId === parent.receipt.id
    && row.parentResultHash === parent.gatewayJob.resultHash
    && row.parentDeploymentContractHash === parent.claim.deploymentContractHash
    && row.evidenceRunId === parent.subject.repairContext.evidenceRunId
    && row.sportsCatalogSha256 === write.sportsCatalogSha256
    && row.currentDeploymentContractHash === write.currentDeploymentContractHash
    && write.gatewayJobId === parent.gatewayJob.id
    && write.parentClaimId === parent.claim.id
    && write.parentReceiptId === parent.receipt.id
    && write.parentResultHash === parent.gatewayJob.resultHash
    && write.parentDeploymentContractHash === parent.claim.deploymentContractHash
    && write.mappingJobId === mappingJob.id
    && write.rootId === root.id
    && write.parentPass === 3
    && write.continuationPass === 3
    && write.producerDedupeKey === producerDedupeKey
    && write.reviewerDedupePrefix === reviewerDedupePrefix
    && write.currentDeploymentContractHash === report.deploymentContractHash
    && write.intakeId === mappingJob.intakeId
    && write.sourceKey === row.sourceKey
    && write.sourceId === mappingJob.sourceId
    && write.mappingId === row.mappingId
    && write.rootIdentityKey === root.identityKey
    && write.rootLifecycleGeneration === parent.claim.lifecycleGeneration
    && write.evidenceRunId === parent.subject.repairContext.evidenceRunId
    && write.sportsCatalogSha256 === row.sportsCatalogSha256
    && sameRepairContext(write.repairContext, parent.subject.repairContext)
    && sameAdmissionValue(row.sourceSportScope ?? null, write.sourceSportScope ?? null)
    && sameAdmissionValue(
      write.sourceSportScope ?? null,
      recordValue(audit.repairContext).sourceSportScope ?? null,
    )
    && write.manifestHash === manifest.hash
    && parsedManifest.success
    && sameAdmissionValue(
      write.artifactIds,
      sortedUnique(parsedManifest.data.entries.map((entry) => entry.artifactId)),
    )
    && sameAdmissionValue(write.writes, continuationWrites)
    && audit.reportHash === report.reportHash
    && audit.operation === report.operation
    && audit.reason === report.reason
    && audit.parentClaimGeneration === parent.claim.claimGeneration
    && audit.parentLifecycleGeneration === parent.claim.lifecycleGeneration
    && stringValue(audit.operatorId) !== null
    && audit.parentGatewayJobId === parent.gatewayJob.id
    && audit.parentClaimId === parent.claim.id
    && audit.parentMappingJobId === mappingJob.id
    && audit.childGatewayJobId === child.id
    && audit.producerDedupeKey === producerDedupeKey
    && audit.reviewerDedupePrefix === reviewerDedupePrefix
    && audit.rootLifecycleGeneration === parent.claim.lifecycleGeneration
    && audit.intakeId === mappingJob.intakeId
    && audit.sourceId === mappingJob.sourceId
    && audit.sourceKey === row.sourceKey
    && audit.rootIdentityKey === root.identityKey
    && audit.currentDeploymentContractVersion === report.deploymentContractVersion
    && audit.currentDeploymentContractHash === report.deploymentContractHash
    && audit.sportsCatalogSha256 === row.sportsCatalogSha256
    && audit.manifestHash === manifest.hash
    && sameAdmissionValue(
      audit.artifactIds,
      parsedManifest.success
        ? sortedUnique(parsedManifest.data.entries.map((entry) => entry.artifactId))
        : [],
    )
    && sameAdmissionValue(audit.writes, continuationWrites)
    && audit.mappingId === write.mappingId
    && audit.evidenceRunId === parent.subject.repairContext.evidenceRunId
    && sameRepairContext(audit.repairContext, childSubject?.repairContext)
    && sameRepairContext(audit.repairContext, parent.subject.repairContext)
    && sameAdmissionValue(
      audit.sourceSportScope ?? null,
      recordValue(audit.repairContext).sourceSportScope ?? null,
    )
    && sameAdmissionValue(audit.manifest, manifest)
    && sameAdmissionValue(child.evidenceManifestJson, manifest)
    && child.role === 'MAPPING_PRODUCER'
    && child.queue === 'AFFILIATE_MAPPING'
    && child.lane === 'MAPPING_PRODUCTION'
    && child.subjectType === 'MAPPING_PRODUCER'
    && child.subjectId === mappingJob.id
    && child.parentClaimId === parent.claim.id
    && child.supplySourceId === root.id
    && child.expectedLifecycleGeneration === parent.claim.lifecycleGeneration
    && child.dedupeKey === producerDedupeKey
    && childSubject?.mappingJobId === mappingJob.id
    && childSubject.supplySourceId === root.id
    && childSubject.pass === 3
  );
};


const retryEvaluateJob = async (
  snapshot: RetrySnapshot,
  gatewayJobId: string,
  bundle: ParsedBundle,
  requestedReason: string,
  artifactStore?: AffiliateAgentArtifactStore,
  options: RetryEvaluationOptions = {},
): Promise<{ row: AffiliateLegacyRepairRetryRow; plan: RetryPlan | null }> => {
  const continuation = options.mode === 'CONTINUATION';
  const currentDeploymentContractHash = bundle.deploymentContract.hash;
  const partsResult = retryParentPartsFor(snapshot, gatewayJobId, { allowPass3: continuation });
  if (!partsResult.parts) {
    return {
      row: retryEmptyRow(gatewayJobId, currentDeploymentContractHash, partsResult.reasonCodes),
      plan: null,
    };
  }
  const parent = partsResult.parts;
  const reasons: string[] = [];
  if (continuation && parent.subject.pass !== 3) {
    reasons.push('CONTINUATION_PARENT_PASS_INVALID');
  }
  const scopeDecision = await retrySourceSportScopeFor(
    snapshot,
    parent,
    requestedReason,
    options.scopeRequest ?? {},
    artifactStore,
  );
  reasons.push(...scopeDecision.reasonCodes);
  const historicalSportEvidenceValid = scopeDecision.verifiedParentSportEvidence !== undefined
    ? scopeDecision.verifiedParentSportEvidence !== null
    : await retryHistoricalSportEvidenceValid(parent, artifactStore);
  if (!historicalSportEvidenceValid) {
    reasons.push('PARENT_SPORT_EVIDENCE_INVALID');
  }
  if (
    (
      parent.claim.deploymentContractVersion === bundle.deploymentContract.version
      || parent.claim.deploymentContractHash === currentDeploymentContractHash
    )
    && !scopeDecision.hasNewExclusions
  ) {
    reasons.push('SAME_DEPLOYMENT_RETRY');
  }
  const mappingJob = snapshot.admission.jobs.find((job) => job.id === parent.subject.mappingJobId) ?? null;
  const intake = mappingJob
    ? snapshot.admission.intakes.find((candidate) => candidate.id === mappingJob.intakeId) ?? null
    : null;
  if (!mappingJob) reasons.push('MAPPING_JOB_MISSING');
  if (!intake) reasons.push('INTAKE_MISSING');
  if (parent.subject.repairContext.intakeId !== intake?.id) reasons.push('REPAIR_CONTEXT_INTAKE_MISMATCH');
  if (mappingJob && normalizedUpper(mappingJob.status) !== 'REVIEW_REQUIRED') reasons.push('MAPPING_JOB_NOT_REVIEW_REQUIRED');
  if (mappingJob && (
    mappingJob.claimedAt
    || mappingJob.workerId
    || mappingJob.leaseExpiresAt
  )) reasons.push('MAPPING_JOB_HAS_ACTIVE_LEASE');
  if (intake && intake.status !== 'READY_FOR_MAPPING') reasons.push('INTAKE_NOT_READY_FOR_MAPPING');
  if (mappingJob && snapshot.admission.jobs.some((candidate) => (
    candidate.id !== mappingJob.id
    && candidate.intakeId === mappingJob.intakeId
    && ACTIVE_MAPPING_JOB_STATUSES.has(normalizedUpper(candidate.status))
  ))) reasons.push('ACTIVE_MAPPING_JOB_PRESENT');
  if (mappingJob && snapshot.admission.approvals.some((approval) => (
    approval.subjectType === 'MAPPING_PACKAGE'
    && approval.subjectKey === mappingJob.id
    && ACTIVE_APPROVAL_STATUSES.has(normalizedUpper(approval.status))
  ))) reasons.push('ACTIVE_APPROVAL_PRESENT');
  if (!retryParentLineageValid(
    snapshot,
    parent,
    new Set<string>(),
    { allowPass3: continuation },
  )) reasons.push('MALFORMED_PARENT_LINEAGE');
  if (
    parent.claim.supplyContractVersion !== bundle.supplyContract.version
    || parent.claim.supplyContractHash !== bundle.supplyContract.hash
  ) reasons.push('PARENT_SUPPLY_CONTRACT_DRIFT');
  const retryPass = continuation ? 3 : parent.subject.pass + 1;
  if (retryPass > 3) reasons.push('RETRY_PASS_EXHAUSTED');
  let source: SourceRow | null = null;
  let mapping: MappingRow | null = null;
  let root: SupplyRootRow | null = null;
  let run: CaptureRunRow | null = null;
  let identity: AffiliateSupplyIdentity | null = null;
  let listingKind: AffiliateAgentListingKind | null = null;
  let manifest: Record<string, unknown> | null = null;
  let artifacts: ArtifactRow[] = [];
  let pages: IntakePageRow[] = [];
  let admissionEvidence: JsonRecord | null = null;
  if (mappingJob && intake) {
    const sourceState = sourceForJob(snapshot.admission, intake, mappingJob, null);
    reasons.push(...sourceState.reasonCodes);
    source = sourceState.source;
    if (source) {
      const currentSource = source;
      listingKind = listingKindFor(currentSource.targetKind);
      const claimListingKind = recordValue(parent.envelope.subject).listingKind;
      if (
        !listingKind
        || parent.claim.roleContractVersion >= 4 && claimListingKind === undefined
        || claimListingKind !== undefined && claimListingKind !== listingKind
      ) {
        reasons.push('PARENT_CLAIM_SUBJECT_INVALID');
      }
      if (!listingKind) reasons.push('SOURCE_LISTING_KIND_INVALID');
      if (mappingJob.sourceId !== source.id) reasons.push('MAPPING_JOB_SOURCE_IDENTITY_DRIFT');
      const linkedRoot = snapshot.admission.roots.find((candidate) => candidate.id === parent.subject.supplySourceId) ?? null;
      if (linkedRoot) {
        identity = {
          canonicalUrl: linkedRoot.canonicalUrl,
          origin: linkedRoot.origin,
          pathKey: linkedRoot.pathKey,
          identityKey: linkedRoot.identityKey,
          rootDecision: 'SAME_ROOT',
          isRevalidationRequired: false,
          reasonCodes: [],
        };
        const sourceIdentityMatchesRoot = [source.listUrl, source.baseUrl, intake.baseUrl].some((url) => {
          if (!url) return false;
          try {
            return normalizeAffiliateSupplyIdentity({
              requestedUrl: url,
              resolvedCanonicalUrl: url,
              operatorDomain: new URL(url).hostname,
            }).identityKey === linkedRoot.identityKey;
          } catch {
            return false;
          }
        });
        if (!sourceIdentityMatchesRoot) reasons.push('SOURCE_ROOT_IDENTITY_DRIFT');
      } else {
        reasons.push('SUPPLY_ROOT_MISSING');
      }
      const mappingState = mappingForIdentity(
        snapshot.admission,
        source,
        mappingJob.mappingId
          ? { sourceId: source.id, mappingId: mappingJob.mappingId }
          : null,
      );
      reasons.push(...mappingState.reasonCodes);
      mapping = mappingState.mapping;
      if (!mapping) reasons.push('MAPPING_MISSING');
      if (mappingJob.mappingId !== (mapping?.id ?? null)) reasons.push('MAPPING_JOB_MAPPING_IDENTITY_DRIFT');
      if (mapping && !mapping.isActive) reasons.push('MAPPING_NOT_ACTIVE');
      if (source.activeMappingId !== (mapping?.id ?? null)) reasons.push('ACTIVE_MAPPING_IDENTITY_DRIFT');
      const rootState = identity
        ? rootForIdentity(snapshot.admission, identity, intake, source, contractCohort(bundle))
        : { root: null, reasonCodes: [] as string[] };
      reasons.push(...rootState.reasonCodes);
      root = rootState.root;
      const currentRoot = root;
      if (intake.affiliateSourceId !== source.id) reasons.push('INTAKE_SOURCE_OWNERSHIP_CONFLICT');
      if (intake.supplySourceId !== (root?.id ?? null)) reasons.push('INTAKE_ROOT_OWNERSHIP_CONFLICT');
      if (!root) reasons.push('SUPPLY_ROOT_MISSING');
      if (root && parent.subject.supplySourceId !== root.id) reasons.push('PARENT_ROOT_IDENTITY_DRIFT');
      if (mapping && mapping.supplySourceId !== (root?.id ?? null)) reasons.push('MAPPING_ROOT_OWNERSHIP_CONFLICT');
      if (mappingJob.supplySourceId !== (root?.id ?? null)) reasons.push('MAPPING_JOB_ROOT_OWNERSHIP_CONFLICT');
      if (source.supplySourceId !== (root?.id ?? null)) reasons.push('SOURCE_ROOT_OWNERSHIP_CONFLICT');
      if (root) {
        const rootReview = recordValue(recordValue(root.metadata).automationReviewRequired);
        if (
          root.derivedStage !== 'PRE_MAPPED'
          || root.isAutomationEnabled
          || root.isExcluded
          || root.automationHoldReason !== 'LEGACY_SPORT_REPAIR'
          || rootReview.hold !== true
          || stringValue(rootReview.reason) !== 'LEGACY_SPORT_REPAIR'
        ) reasons.push('ROOT_HOLD_OR_AUTOMATION_DRIFT');
        if (
          parent.gatewayJob.expectedLifecycleGeneration === null
          || root.lifecycleGeneration !== parent.gatewayJob.expectedLifecycleGeneration
          || parent.claim.lifecycleGeneration !== root.lifecycleGeneration
        ) reasons.push('ROOT_GENERATION_DRIFT');
        if (
          root.activeSupplyContractVersion !== contractVersion(bundle)
          || root.activeSupplyContractHash !== contractHash(bundle)
        ) reasons.push('ROOT_CONTRACT_DRIFT');
      }
      const sourceHold = sourceHoldReason(currentSource);
      if (currentSource.autoScrapeEnabled) reasons.push('SOURCE_AUTOMATION_ENABLED');
      if (sourceHold !== 'LEGACY_SPORT_REPAIR') reasons.push('SOURCE_HOLD_DRIFT');
      if (sourceIsPublicOrLive(currentSource, mapping, currentSource.activeMappingId
        ? snapshot.admission.mappings.find((candidate) => candidate.id === currentSource.activeMappingId) ?? null
        : null)) reasons.push('PUBLIC_AUTOMATED_OR_VALIDATED_SOURCE');
      reasons.push(...publicationReasonCodes(snapshot.admission, currentSource, mapping, root));
      if (parent.subject.repairContext.evidenceRunId !== sourceEvidenceRunId(currentSource)) {
        reasons.push('SOURCE_EVIDENCE_RUN_DRIFT');
      }
      run = snapshot.admission.runs.find((candidate) => (
        candidate.id === parent.subject.repairContext.evidenceRunId
        && candidate.intakeId === intake.id
        && SUCCESSFUL_INTAKE_RUN_STATUSES.has(normalizedUpper(candidate.status))
      )) ?? null;
      const currentRun = run;
      if (!currentRun) reasons.push('SUCCESSFUL_CAPTURE_RUN_MISSING');
      pages = snapshot.admission.pages.filter((page) => page.intakeId === intake.id && page.status === 'ACTIVE');
      if (currentRoot && pages.some((page) => page.supplySourceId !== null && page.supplySourceId !== currentRoot.id)) {
        reasons.push('EVIDENCE_PAGE_ROOT_OWNERSHIP_CONFLICT');
      }
      if (currentRun && currentRun.supplySourceId !== null && currentRun.supplySourceId !== currentRoot?.id) reasons.push('EVIDENCE_ROOT_OWNERSHIP_CONFLICT');
      const runArtifacts = currentRun
        ? snapshot.admission.artifacts.filter((artifact) => (
          artifact.intakeId === intake.id
          && artifact.runId === currentRun.id
        ))
        : [];
      const ownedOrigins = new Set<string>([
        urlOrigin(intake.baseUrl),
        urlOrigin(currentSource.baseUrl),
        urlOrigin(currentSource.listUrl),
        ...pages.flatMap((page) => [urlOrigin(page.url), urlOrigin(page.canonicalUrl)]),
      ].filter((value): value is string => Boolean(value)));
      const filesById = new Map(snapshot.admission.files.map((file) => [file.id, file]));
      const manifestArtifacts: AffiliateLegacyRepairAdmissionArtifact[] = [];
      for (const kind of ['PAGE_HTML', 'PAGE_MARKDOWN'] as const) {
        const artifact = artifactForKind(runArtifacts, kind);
        if (!artifact) {
          reasons.push(`MISSING_${kind}`);
          continue;
        }
        const file = filesById.get(artifact.fileId);
        if (!file || !file.path.trim()) reasons.push(`MISSING_STORAGE_FILE_${kind}`);
        if (!artifact.isPinned) reasons.push(`EVIDENCE_NOT_PINNED_${kind}`);
        if (root && artifact.supplySourceId !== root.id) reasons.push(`EVIDENCE_ROOT_OWNERSHIP_CONFLICT_${kind}`);
        if (!artifact.sourceUrl && !artifact.finalUrl) reasons.push(`MISSING_SOURCE_URL_${kind}`);
        if (
          artifact.sourceUrl && !urlOwnedBySource(artifact.sourceUrl, ownedOrigins)
          || artifact.finalUrl && !urlOwnedBySource(artifact.finalUrl, ownedOrigins)
        ) reasons.push(`SOURCE_EVIDENCE_URL_NOT_OWNED_${kind}`);
        if (artifact.pageId && !pages.some((page) => page.id === artifact.pageId)) reasons.push(`ARTIFACT_PAGE_NOT_OWNED_${kind}`);
        if (file) {
          try {
            manifestArtifacts.push(artifactManifestEntry(artifact, file, kind, mappingJob.id));
            artifacts.push(artifact);
          } catch (error) {
            reasons.push(error instanceof AffiliateLegacyRepairAdmissionError ? error.code : `INVALID_${kind}`);
          }
        }
      }
      if (manifestArtifacts.length === 2) {
        try {
          manifest = manifestFor(manifestArtifacts, mappingJob.id);
          if (!sameAdmissionValue(parent.gatewayJob.evidenceManifestJson, manifest)) {
            reasons.push('STORED_EVIDENCE_MANIFEST_DRIFT');
          }
          const parsedManifest = affiliateAgentEvidenceManifestSchema.safeParse(parent.gatewayJob.evidenceManifestJson);
          if (!parsedManifest.success) reasons.push('PARENT_EVIDENCE_MANIFEST_INVALID');
          else if (parent.claim.evidenceManifestHash !== parsedManifest.data.hash) reasons.push('PARENT_EVIDENCE_MANIFEST_HASH_MISMATCH');
        } catch {
          reasons.push('INVALID_EVIDENCE_MANIFEST');
        }
      }
      const admittedParent = retryOriginalAncestorFor(snapshot, parent);
      admissionEvidence = manifest && root && admittedParent
        ? admissionEvidenceForGateway(
          mappingJob,
          admittedParent.subject.supplySourceId,
          admittedParent.subject.repairContext,
          manifest,
          admittedParent.gatewayJob.dedupeKey,
        )
        : null;
      if (!admissionEvidence) reasons.push('MISSING_ADMISSION_EVIDENCE');
      if (admissionEvidence) {
        const selectedWrite = recordValue(admissionEvidence.selectedWrite);
        if (
          stringValue(admissionEvidence.sourceId) !== source.id
          || stringValue(admissionEvidence.mappingId) !== (mapping?.id ?? null)
          || stringValue(admissionEvidence.evidenceRunId) !== run?.id
          || stringValue(selectedWrite.sourceId) !== source.id
          || stringValue(selectedWrite.mappingId) !== (mapping?.id ?? null)
        ) reasons.push('ADMISSION_IDENTITY_DRIFT');
        if (
          admissionEvidence
          && admittedParent
          && run
          && root
          && manifest
          && !productionAdmissionEvidenceMatches({
            entry: admissionEvidence,
            mappingJob,
            intake,
            source: currentSource,
            mapping,
            root,
            run,
            artifacts,
            ancestor: admittedParent,
            manifest,
          })
        ) reasons.push('ADMISSION_EVIDENCE_INVALID');
      }
    }
  }
  const auditEntries = mappingJob
    ? continuation
      ? continuationAuditForParent(mappingJob, parent.gatewayJob.id)
      : retryAuditForParent(mappingJob, parent.gatewayJob.id)
    : [];
  const currentAudit = auditEntries.length === 1 ? auditEntries[0] : null;
  if (auditEntries.length > 1) {
    reasons.push(continuation ? 'CONFLICTING_CONTINUATION_AUDIT' : 'CONFLICTING_RETRY_AUDIT');
  }
  const gatewayDedupeKey: string | null = continuation
    ? root
      ? `${AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX}${root.id}`
      : null
    : retryPass <= 3
      ? retryDedupeKeyFor(parent.gatewayJob.id)
      : null;
  let childGatewayJob: GatewayJobRow | null = null;
  const ancestorIds = retryAncestorGatewayJobIds(snapshot, parent);
  if (mappingJob) {
    const sameScopeJobs = retryGatewayJobsForMapping(snapshot, mappingJob.id)
      .filter((candidate) => candidate.id !== parent.gatewayJob.id && !ancestorIds.has(candidate.id));
    if (continuation) {
      const continuationJobs = snapshot.gatewayJobs.filter((candidate) => (
        root !== null
        && candidate.supplySourceId === root.id
        && (
          candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX)
          || candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX)
        )
      ));
      const continuationProducerJobs = continuationJobs.filter((candidate) => (
        candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX)
      ));
      const continuationReviewerJobs = continuationJobs.filter((candidate) => (
        candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX)
      ));
      const continuationReviewerKeys = new Set(
        snapshot.gatewayClaims
          .filter((claim) => continuationProducerJobs.some((candidate) => candidate.id === claim.jobId))
          .map((claim) => `${AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX}${claim.id}`),
      );
      if (continuationProducerJobs.length > 1) reasons.push('CONTINUATION_DEDUPE_CONFLICT');
      if (
        continuationReviewerJobs.length > AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT
        || continuationReviewerJobs.some((candidate) => !continuationReviewerKeys.has(candidate.dedupeKey))
      ) reasons.push('CONTINUATION_REVIEWER_LIMIT');
      const activeContinuationChild = continuationJobs.find((candidate) => (
        candidate.parentClaimId === parent.claim.id
        && ['QUEUED', 'CLAIMED', 'RETRY_WAIT', 'PIPELINE_BLOCKED', 'RECONCILIATION_REQUIRED']
          .includes(normalizedUpper(candidate.status))
      ));
      if (activeContinuationChild) reasons.push('ACTIVE_CONTINUATION_DESCENDANT');
      if (currentAudit) {
        const auditedChildId = stringValue(currentAudit.childGatewayJobId);
        const auditedChild = auditedChildId
          ? snapshot.gatewayJobs.find((candidate) => candidate.id === auditedChildId) ?? null
          : null;
        if (
          !root
          || !auditedChild
          || !manifest
          || !continuationAuditedChildMatches(parent, currentAudit, auditedChild, mappingJob, root, manifest)
        ) {
          reasons.push('MALFORMED_CONTINUATION_AUDIT');
        } else {
          childGatewayJob = auditedChild;
          if (activeContinuationChild?.id === auditedChild.id) reasons.push('ACTIVE_CONTINUATION_DESCENDANT');
        }
      } else if (continuationJobs.length > 0) {
        reasons.push('CONTINUATION_DEDUPE_CONFLICT');
      }
    } else {
      const activeChild = sameScopeJobs.find((candidate) => (
        candidate.parentClaimId === parent.claim.id
        && ['QUEUED', 'CLAIMED', 'RETRY_WAIT', 'PIPELINE_BLOCKED', 'RECONCILIATION_REQUIRED'].includes(normalizedUpper(candidate.status))
      ));
      if (activeChild) reasons.push('ACTIVE_RETRY_DESCENDANT');
      if (currentAudit) {
        const auditedChildId = stringValue(currentAudit.childGatewayJobId);
        const auditedChild = auditedChildId
          ? snapshot.gatewayJobs.find((candidate) => candidate.id === auditedChildId) ?? null
          : null;
        if (
          !auditedChild
          || !sameScopeJobs.includes(auditedChild)
          || !root
          || !manifest
          || !retryAuditedChildMatches(
            auditedChild,
            parent,
            currentAudit,
            mappingJob,
            root,
            manifest,
            retryPass,
          )
        ) {
          reasons.push('MALFORMED_RETRY_AUDIT');
        } else {
          childGatewayJob = auditedChild;
          if (activeChild?.id === auditedChild.id) reasons.push('ACTIVE_RETRY_DESCENDANT');
        }
      } else if (sameScopeJobs.some((candidate) => candidate.subjectId === mappingJob.id)) {
        reasons.push('COMPETING_RETRY_CHILD');
      }
    }
  }
  const currentAuditReport = recordValue(currentAudit?.reportSnapshot);
  if (currentAudit) {
    if (continuation) {
      if (
        currentAudit.operation !== 'LEGACY_SPORT_REPAIR_CONTINUATION'
        || currentAudit.reason !== requestedReason
        || !gatewayDedupeKey
        || currentAudit.producerDedupeKey !== gatewayDedupeKey
        || currentAudit.parentPass !== 3
        || currentAuditReport.operation !== 'LEGACY_SPORT_REPAIR_CONTINUATION'
        || currentAuditReport.schemaVersion !== AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION
        || currentAuditReport.reportHash !== currentAudit.reportHash
        || currentAuditReport.contractVersion !== contractVersion(bundle)
        || currentAuditReport.contractHash !== contractHash(bundle)
        || currentAuditReport.deploymentContractVersion !== bundle.deploymentContract.version
        || currentAuditReport.deploymentContractHash !== bundle.deploymentContract.hash
        || currentAudit.continuationPass !== 3
      ) reasons.push('CONTINUATION_REQUEST_DRIFT');
    } else if (
      currentAudit.reason !== requestedReason
      || !gatewayDedupeKey
      || currentAudit.gatewayDedupeKey !== gatewayDedupeKey
      || currentAudit.retryPass !== retryPass
    ) reasons.push('RETRY_REQUEST_DRIFT');
  }
  if (snapshot.gatewayJobs.some((candidate) => (
    gatewayDedupeKey !== null
    && candidate.dedupeKey === gatewayDedupeKey
    && candidate.id !== parent.gatewayJob.id
    && candidate.id !== stringValue(currentAudit?.childGatewayJobId)
  ))) {
    reasons.push(continuation ? 'CONTINUATION_DEDUPE_CONFLICT' : 'RETRY_DEDUPE_CONFLICT');
  }
  const currentCatalog = snapshot.admission.sportsCatalog;
  const freshRepairContext: AffiliateAgentLegacySportRepairContext = {
    kind: 'LEGACY_SPORT_REPAIR',
    intakeId: parent.subject.repairContext.intakeId,
    evidenceRunId: parent.subject.repairContext.evidenceRunId,
    sportsCatalog: currentCatalog,
    ...(scopeDecision.sourceSportScope
      ? { sourceSportScope: scopeDecision.sourceSportScope }
      : {}),
  };
  if (currentCatalog.sports.length === 0 || !HASH_PATTERN.test(currentCatalog.sha256)) {
    reasons.push('CURRENT_SPORTS_CATALOG_INVALID');
  }
  const stateFingerprint = retryStateFingerprintFor({
    gatewayJob: parent.gatewayJob,
    claim: {
      id: parent.claim.id,
      jobId: parent.claim.jobId,
      claimGeneration: parent.claim.claimGeneration,
      lifecycleGeneration: parent.claim.lifecycleGeneration,
      status: parent.claim.status,
      deploymentContractHash: parent.claim.deploymentContractHash,
      supplyContractHash: parent.claim.supplyContractHash,
      claimEnvelopeHash: parent.claim.claimEnvelopeHash,
      evidenceManifestHash: parent.claim.evidenceManifestHash,
      terminalReceiptId: parent.claim.terminalReceiptId,
    },
    receipt: {
      id: parent.receipt.id,
      claimId: parent.receipt.claimId,
      jobId: parent.receipt.jobId,
      claimGeneration: parent.receipt.claimGeneration,
      operationKind: parent.receipt.operationKind,
      requestHash: parent.receipt.requestHash,
      responseHash: parent.receipt.responseHash,
      status: parent.receipt.status,
    },
    mappingJob,
    intake,
    source,
    mapping,
    root,
    run,
    artifacts,
    pages,
    organizations: source?.organizationId
      ? snapshot.admission.organizations.filter((row) => row.id === source.organizationId)
      : [],
    candidates: snapshot.admission.candidates.filter((candidate) => (
      candidate.sourceId === source?.id
      || Boolean(mapping && candidate.mappingId === mapping.id)
      || Boolean(root && candidate.supplySourceId === root.id)
    )),
    targets: root
      ? snapshot.admission.targets.filter((target) => target.supplySourceId === root.id)
      : [],
    sportsCatalog: {
      schemaVersion: currentCatalog.schemaVersion,
      sha256: currentCatalog.sha256,
      sports: currentCatalog.sports,
    },
  });
  const rowBase: Omit<AffiliateLegacyRepairRetryRow, 'eligible' | 'alreadyRetried' | 'reason' | 'reasonCodes' | 'outcome'> = {
    gatewayJobId: parent.gatewayJob.id,
    parentClaimId: parent.claim.id,
    mappingJobId: mappingJob?.id ?? parent.subject.mappingJobId,
    intakeId: intake?.id ?? null,
    sourceKey: intake?.sourceKey ?? null,
    sourceId: source?.id ?? null,
    mappingId: mapping?.id ?? mappingJob?.mappingId ?? null,
    rootId: root?.id ?? parent.subject.supplySourceId,
    rootIdentityKey: identity?.identityKey ?? null,
    parentPass: parent.subject.pass,
    retryPass: retryPass <= 3 ? retryPass : null,
    parentReceiptId: parent.receipt.id,
    parentResultHash: parent.gatewayJob.resultHash ?? null,
    parentDeploymentContractHash: parent.claim.deploymentContractHash,
    currentDeploymentContractHash,
    evidenceRunId: run?.id ?? parent.subject.repairContext.evidenceRunId,
    sportsCatalogSha256: currentCatalog.sha256,
    sportsCatalogCapturedAt: currentCatalog.capturedAt,
    stateFingerprint,
    artifacts: artifacts.map((artifact) => artifactManifestEntry(
      artifact,
      snapshot.admission.files.find((file) => file.id === artifact.fileId) ?? {
        id: artifact.fileId,
        path: '',
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
      },
      artifact.kind as 'PAGE_HTML' | 'PAGE_MARKDOWN',
      mappingJob?.id ?? parent.subject.mappingJobId,
    )).sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0),
    ...(scopeDecision.sourceSportScope
      ? { sourceSportScope: scopeDecision.sourceSportScope }
      : {}),
    gatewayDedupeKey,
    childGatewayJobId: stringValue(currentAudit?.childGatewayJobId),
  };
  const alreadyRetried = Boolean(currentAudit && childGatewayJob);
  if (alreadyRetried) reasons.push('ALREADY_RETRIED');
  const uniqueReasons = sortedUnique(reasons);
  const eligible = uniqueReasons.length === 0
    && Boolean(mappingJob && intake && source && mapping && root && identity && run && manifest && gatewayDedupeKey && listingKind)
    && !alreadyRetried;
  const row: AffiliateLegacyRepairRetryRow = {
    ...rowBase,
    eligible,
    alreadyRetried,
    reason: alreadyRetried ? 'ALREADY_RETRIED' : reason(uniqueReasons),
    reasonCodes: alreadyRetried ? ['ALREADY_RETRIED'] : uniqueReasons,
    outcome: alreadyRetried ? 'ALREADY_RETRIED' : eligible ? 'PROPOSED' : 'HELD',
  };
  if (
    !eligible
    || !mappingJob
    || !intake
    || !source
    || !mapping
    || !root
    || !identity
    || !run
    || !manifest
    || !gatewayDedupeKey
    || !listingKind
    || !admissionEvidence
  ) {
    return { row, plan: null };
  }
  const write: AffiliateLegacyRepairRetryWrite = {
    gatewayJobId: parent.gatewayJob.id,
    parentClaimId: parent.claim.id,
    parentReceiptId: parent.receipt.id,
    parentResultHash: parent.gatewayJob.resultHash ?? '',
    parentDeploymentContractHash: parent.claim.deploymentContractHash,
    parentClaimGeneration: parent.claim.claimGeneration,
    parentLifecycleGeneration: parent.claim.lifecycleGeneration ?? 0,
    mappingJobId: mappingJob.id,
    intakeId: intake.id,
    sourceKey: intake.sourceKey,
    sourceId: source.id,
    mappingId: mapping.id,
    rootId: root.id,
    rootIdentityKey: root.identityKey,
    rootLifecycleGeneration: root.lifecycleGeneration,
    parentPass: parent.subject.pass,
    retryPass,
    listingKind,
    evidenceRunId: run.id,
    sportsCatalogSha256: currentCatalog.sha256,
    currentDeploymentContractHash,
    repairContext: stableRepairContext(freshRepairContext) as Record<string, unknown>,
    manifestHash: String((manifest as Record<string, unknown>).hash),
    manifest,
    artifactIds: artifacts.map((artifact) => `intake-artifact:${artifact.id}`).sort(),
    ...(scopeDecision.sourceSportScope
      ? { sourceSportScope: scopeDecision.sourceSportScope }
      : {}),
    gatewayDedupeKey,
    writes: [
      'AFFILIATE_LEGACY_MAPPING_JOB_QUEUE',
      'AFFILIATE_GATEWAY_MAPPING_PRODUCER_RETRY_JOB',
      'AFFILIATE_LEGACY_REPAIR_RETRY_AUDIT',
    ],
  };
  const retryParent: RetryParentContext = {
    gatewayJob: parent.gatewayJob,
    claim: parent.claim,
    receipt: parent.receipt,
    envelope: parent.envelope,
    subject: parent.subject,
    result: parent.result,
    mappingJob,
    intake,
    source,
    mapping,
    root,
    run,
    artifacts,
    pages,
    manifest,
    admissionEvidence,
    freshRepairContext,
    retryPass,
    gatewayDedupeKey,
    childGatewayJob,
  };
  return { row, plan: { row, parent: retryParent, write } };
};

type ContinuationPlan = Readonly<{
  row: AffiliateLegacyRepairContinuationRow;
  parent: RetryParentContext;
  write: AffiliateLegacyRepairContinuationWrite;
}>;

const continuationWrites = [
  'AFFILIATE_LEGACY_MAPPING_JOB_QUEUE',
  'AFFILIATE_GATEWAY_MAPPING_PRODUCER_CONTINUATION_JOB',
  'AFFILIATE_LEGACY_REPAIR_CONTINUATION_AUDIT',
] as const;

const continuationWriteFor = (
  write: AffiliateLegacyRepairRetryWrite,
): AffiliateLegacyRepairContinuationWrite => {
  if (write.parentPass !== 3 || write.retryPass !== 3) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_PASS_INVALID',
      'A continuation must retain parent and child pass three.',
    );
  }
  return {
    gatewayJobId: write.gatewayJobId,
    parentClaimId: write.parentClaimId,
    parentReceiptId: write.parentReceiptId,
    parentResultHash: write.parentResultHash,
    parentDeploymentContractHash: write.parentDeploymentContractHash,
    parentClaimGeneration: write.parentClaimGeneration,
    parentLifecycleGeneration: write.parentLifecycleGeneration,
    mappingJobId: write.mappingJobId,
    intakeId: write.intakeId,
    sourceKey: write.sourceKey,
    sourceId: write.sourceId,
    mappingId: write.mappingId,
    rootId: write.rootId,
    rootIdentityKey: write.rootIdentityKey,
    rootLifecycleGeneration: write.rootLifecycleGeneration,
    parentPass: 3,
    continuationPass: 3,
    listingKind: write.listingKind,
    ...(write.sourceSportScope ? { sourceSportScope: write.sourceSportScope } : {}),
    evidenceRunId: write.evidenceRunId,
    sportsCatalogSha256: write.sportsCatalogSha256,
    currentDeploymentContractHash: write.currentDeploymentContractHash,
    repairContext: write.repairContext,
    manifestHash: write.manifestHash,
    manifest: write.manifest,
    artifactIds: write.artifactIds,
    producerDedupeKey: write.gatewayDedupeKey,
    reviewerDedupePrefix: AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX,
    writes: continuationWrites,
  };
};

const continuationRowFor = (
  row: AffiliateLegacyRepairRetryRow,
  write?: AffiliateLegacyRepairContinuationWrite,
): AffiliateLegacyRepairContinuationRow => ({
  gatewayJobId: row.gatewayJobId,
  parentClaimId: row.parentClaimId,
  mappingJobId: row.mappingJobId,
  intakeId: row.intakeId,
  sourceKey: row.sourceKey,
  sourceId: row.sourceId,
  mappingId: row.mappingId,
  rootId: row.rootId,
  rootIdentityKey: row.rootIdentityKey,
  parentPass: row.parentPass === null ? null : row.parentPass === 3 ? 3 : null,
  continuationPass: row.retryPass === null ? null : row.retryPass === 3 ? 3 : null,
  parentReceiptId: row.parentReceiptId,
  ...(row.sourceSportScope ? { sourceSportScope: row.sourceSportScope } : {}),
  parentResultHash: row.parentResultHash,
  parentDeploymentContractHash: row.parentDeploymentContractHash,
  currentDeploymentContractHash: row.currentDeploymentContractHash,
  evidenceRunId: row.evidenceRunId,
  sportsCatalogSha256: row.sportsCatalogSha256,
  sportsCatalogCapturedAt: row.sportsCatalogCapturedAt,
  stateFingerprint: row.stateFingerprint,
  artifacts: row.artifacts,
  producerDedupeKey: write?.producerDedupeKey ?? row.gatewayDedupeKey,
  reviewerDedupePrefix: AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX,
  childGatewayJobId: row.childGatewayJobId,
  eligible: row.eligible,
  alreadyContinued: row.alreadyRetried,
  reason: row.reason === 'ALREADY_RETRIED' ? 'ALREADY_CONTINUED' : row.reason,
  reasonCodes: row.reasonCodes.map((code) => code === 'ALREADY_RETRIED' ? 'ALREADY_CONTINUED' : code),
  write,
  outcome: row.outcome === 'ALREADY_RETRIED'
    ? 'ALREADY_CONTINUED'
    : row.outcome === 'APPLIED'
      ? 'APPLIED'
      : row.outcome === 'PROPOSED'
        ? 'PROPOSED'
        : 'HELD',
});

const continuationEvaluationFor = async (
  snapshot: RetrySnapshot,
  gatewayJobId: string,
  bundle: ParsedBundle,
  requestedReason: string,
  artifactStore?: AffiliateAgentArtifactStore,
): Promise<{ row: AffiliateLegacyRepairContinuationRow; plan: ContinuationPlan | null }> => {
  const evaluated = await retryEvaluateJob(
    snapshot,
    gatewayJobId,
    bundle,
    requestedReason,
    artifactStore,
    { mode: 'CONTINUATION' },
  );
  const write = evaluated.plan ? continuationWriteFor(evaluated.plan.write) : undefined;
  const row = continuationRowFor(evaluated.row, write);
  return {
    row,
    plan: evaluated.plan && write
      ? { row, parent: evaluated.plan.parent, write }
      : null,
  };
};

const continuationCountsFor = (
  row: AffiliateLegacyRepairContinuationRow,
  selected: boolean,
): AffiliateLegacyRepairContinuationCounts => ({
  total: 1,
  eligible: row.eligible ? 1 : 0,
  held: row.eligible || row.alreadyContinued ? 0 : 1,
  selected: selected ? 1 : 0,
  alreadyContinued: row.alreadyContinued ? 1 : 0,
});

const buildContinuationReport = async (
  client: AdmissionClient,
  bundle: ParsedBundle,
  gatewayJobId: string,
  requestedReason: string,
  mode: 'PREVIEW' | 'APPLY',
  artifactStore?: AffiliateAgentArtifactStore,
): Promise<{
  report: AffiliateLegacyRepairContinuationReport;
  plans: readonly ContinuationPlan[];
  snapshot: RetrySnapshot;
}> => {
  const snapshot = await readContinuationSnapshot(client, gatewayJobId);
  const evaluated = await continuationEvaluationFor(
    snapshot,
    gatewayJobId,
    bundle,
    requestedReason,
    artifactStore,
  );
  const selected = evaluated.row.eligible && evaluated.plan !== null;
  const selectedGatewayJobIds = selected ? [gatewayJobId] as const : [] as const;
  const plans = selected && evaluated.plan ? [evaluated.plan] as const : [] as const;
  const proposedWrites = selected ? [evaluated.plan!.write] as const : [] as const;
  const counts = continuationCountsFor(evaluated.row, selected);
  const reportHash = continuationReportHashFor({
    schemaVersion: AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION,
    contractVersion: contractVersion(bundle),
    contractHash: contractHash(bundle),
    deploymentContractVersion: bundle.deploymentContract.version,
    deploymentContractHash: bundle.deploymentContract.hash,
    reason: requestedReason,
    gatewayJobId,
    requestedGatewayJobIds: [gatewayJobId],
    selectedGatewayJobIds,
    parentPass: 3,
    continuationPass: 3,
    limits: {
      producerClaims: AFFILIATE_LEGACY_REPAIR_CONTINUATION_PRODUCER_LIMIT,
      reviewerClaims: AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT,
    },
    counts,
    rows: [evaluated.row],
    proposedWrites,
  });
  const row = selected
    ? {
      ...evaluated.row,
      outcome: mode === 'APPLY' ? 'APPLIED' as const : 'PROPOSED' as const,
    }
    : evaluated.row;
  return {
    snapshot,
    plans,
    report: {
      schemaVersion: AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION,
      operation: 'LEGACY_SPORT_REPAIR_CONTINUATION',
      mode,
      evaluatedAt: new Date().toISOString(),
      contractVersion: contractVersion(bundle),
      contractHash: contractHash(bundle),
      deploymentContractVersion: bundle.deploymentContract.version,
      deploymentContractHash: bundle.deploymentContract.hash,
      reason: requestedReason,
      gatewayJobId,
      requestedGatewayJobIds: [gatewayJobId],
      selectedGatewayJobIds,
      parentPass: 3,
      continuationPass: 3,
      limits: {
        producerClaims: AFFILIATE_LEGACY_REPAIR_CONTINUATION_PRODUCER_LIMIT,
        reviewerClaims: AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT,
      },
      counts,
      row,
      rows: [row],
      proposedWrites,
      childGatewayJobId: null,
      producerDedupeKey: row.producerDedupeKey,
      reviewerDedupePrefix: AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX,
      reportHash,
      reviewedReportHash: null,
      writeCount: mode === 'APPLY' ? plans.length : 0,
      appliedGatewayJobIds: [],
      replayed: false,
    },
  };
};

const buildRetryReport = async (
  client: AdmissionClient,
  bundle: ParsedBundle,
  gatewayJobIds: readonly string[],
  requestedReason: string,
  mode: 'PREVIEW' | 'APPLY',
  artifactStore?: AffiliateAgentArtifactStore,
  scopeRequest: RetryScopeRequest = {},
): Promise<{
  report: AffiliateLegacyRepairRetryReport;
  plans: readonly RetryPlan[];
  snapshot: RetrySnapshot;
}> => {
  const snapshot = await readRetrySnapshot(client, gatewayJobIds);
  assertRetryScopeParentCount(snapshot, gatewayJobIds, scopeRequest);
  const evaluated = await Promise.all(gatewayJobIds.map((gatewayJobId) => (
    retryEvaluateJob(
      snapshot,
      gatewayJobId,
      bundle,
      requestedReason,
      artifactStore,
      { scopeRequest },
    )
  )));
  const rows = evaluated.map(({ row }) => row);
  const allEligible = evaluated.length === gatewayJobIds.length
    && evaluated.every(({ row, plan }) => row.eligible && plan !== null);
  const selectedGatewayJobIds = allEligible ? [...gatewayJobIds] : [];
  const plans = allEligible
    ? evaluated.map(({ plan }) => plan!).sort((left, right) => left.write.gatewayJobId < right.write.gatewayJobId ? -1 : left.write.gatewayJobId > right.write.gatewayJobId ? 1 : 0)
    : [];
  const proposedWrites = allEligible ? plans.map((plan) => plan.write) : [];
  const counts: AffiliateLegacyRepairRetryCounts = {
    total: rows.length,
    eligible: rows.filter((row) => row.eligible).length,
    held: rows.filter((row) => !row.eligible && !row.alreadyRetried).length,
    selected: selectedGatewayJobIds.length,
    alreadyRetried: rows.filter((row) => row.alreadyRetried).length,
  };
  const reportHash = retryReportHashFor({
    schemaVersion: AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION,
    contractVersion: contractVersion(bundle),
    contractHash: contractHash(bundle),
    deploymentContractVersion: bundle.deploymentContract.version,
    deploymentContractHash: bundle.deploymentContract.hash,
    reason: requestedReason,
    requestedGatewayJobIds: gatewayJobIds,
    selectedGatewayJobIds,
    counts,
    rows,
    proposedWrites,
  });
  const selected = new Set(selectedGatewayJobIds);
  const normalizedRows = rows.map((row) => (
    selected.has(row.gatewayJobId)
      ? { ...row, outcome: mode === 'APPLY' ? 'APPLIED' as const : 'PROPOSED' as const }
      : row
  ));
  return {
    snapshot,
    plans,
    report: {
      schemaVersion: AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION,
      mode,
      evaluatedAt: new Date().toISOString(),
      contractVersion: contractVersion(bundle),
      contractHash: contractHash(bundle),
      deploymentContractVersion: bundle.deploymentContract.version,
      deploymentContractHash: bundle.deploymentContract.hash,
      reason: requestedReason,
      requestedGatewayJobIds: [...gatewayJobIds],
      selectedGatewayJobIds,
      counts,
      rows: normalizedRows,
      proposedWrites,
      reportHash,
      reviewedReportHash: null,
      writeCount: mode === 'APPLY' ? plans.length : 0,
      appliedGatewayJobIds: [],
      replayed: false,
    },
  };
};

const appendRetryAudit = (
  summary: unknown,
  evidence: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const envelope = recordValue(summary);
  const history = retryAuditEntries(summary);
  const existing = history.find((entry) => (
    entry.parentGatewayJobId === evidence.parentGatewayJobId
    && entry.reportHash === evidence.reportHash
  ));
  if (existing) {
    if (sameAdmissionValue(existing, evidence)) return envelope;
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_AUDIT_CONFLICT',
      'The existing retry audit does not match the requested retry.',
    );
  }
  return {
    ...envelope,
    legacyRepairRetryHistory: [...history, evidence],
  };
};


const applyRetryPlan = async (
  client: Prisma.TransactionClient,
  plan: RetryPlan,
  reportSnapshot: AffiliateLegacyRepairRetryReport,
  reportHash: string,
  reasonText: string,
  operatorId: string,
  requestedGatewayJobIds: readonly string[],
  childGatewayJobId: string,
): Promise<string> => {
  const currentParent = await client.affiliateAgentGatewayJobs.findUnique({
    where: { id: plan.parent.gatewayJob.id },
    select: retryGatewayJobSelect,
  }) as unknown as GatewayJobRow | null;
  if (
    !currentParent
    || currentParent.status !== 'COMPLETED'
    || currentParent.activeClaimId !== null
    || currentParent.terminalReceiptId !== plan.parent.receipt.id
    || currentParent.resultHash !== plan.parent.gatewayJob.resultHash
    || currentParent.parentClaimId !== (plan.parent.gatewayJob.parentClaimId ?? null)
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_STATE_DRIFT',
      `Parent Gateway job ${plan.parent.gatewayJob.id} changed after preview.`,
    );
  }
  const currentMappingJob = await client.affiliateSourceMappingJobs.findUnique({
    where: { id: plan.parent.mappingJob.id },
  }) as unknown as MappingJobRow | null;
  if (
    !currentMappingJob
    || currentMappingJob.status !== 'REVIEW_REQUIRED'
    || currentMappingJob.intakeId !== plan.parent.mappingJob.intakeId
    || currentMappingJob.sourceId !== plan.parent.mappingJob.sourceId
    || currentMappingJob.mappingId !== plan.parent.mappingJob.mappingId
    || currentMappingJob.supplySourceId !== plan.parent.mappingJob.supplySourceId
    || currentMappingJob.claimedAt
    || currentMappingJob.workerId
    || currentMappingJob.leaseExpiresAt
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_STATE_DRIFT',
      `Mapping job ${plan.parent.mappingJob.id} changed after preview.`,
    );
  }
  const existingByDedupe = await client.affiliateAgentGatewayJobs.findUnique({
    where: { dedupeKey: plan.write.gatewayDedupeKey },
    select: retryGatewayJobSelect,
  }) as unknown as GatewayJobRow | null;
  if (existingByDedupe) {
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_DEDUPE_CONFLICT',
      `Retry dedupe key ${plan.write.gatewayDedupeKey} is already occupied.`,
    );
  }
  const retryAudit = {
    schemaVersion: AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION,
    kind: 'LEGACY_SPORT_REPAIR_RETRY',
    reportHash,
    reportSnapshot,
    requestedGatewayJobIds: [...requestedGatewayJobIds].sort(),
    reason: reasonText,
    operatorId,
    parentGatewayJobId: plan.parent.gatewayJob.id,
    parentClaimId: plan.parent.claim.id,
    parentMappingJobId: plan.parent.mappingJob.id,
    parentReceiptId: plan.parent.receipt.id,
    parentResultHash: plan.parent.gatewayJob.resultHash,
    parentDeploymentContractHash: plan.parent.claim.deploymentContractHash,
    currentDeploymentContractVersion: reportSnapshot.deploymentContractVersion,
    currentDeploymentContractHash: reportSnapshot.deploymentContractHash,
    childGatewayJobId,
    childDedupeKey: plan.write.gatewayDedupeKey,
    parentPass: plan.write.parentPass,
    retryPass: plan.write.retryPass,
    intakeId: plan.write.intakeId,
    sourceId: plan.write.sourceId,
    mappingId: plan.write.mappingId,
    rootId: plan.write.rootId,
    rootLifecycleGeneration: plan.write.rootLifecycleGeneration,
    evidenceRunId: plan.write.evidenceRunId,
    sportsCatalogSha256: plan.write.sportsCatalogSha256,
    repairContext: plan.parent.freshRepairContext,
    manifest: plan.parent.manifest,
    artifactIds: [...plan.write.artifactIds],
    ...(plan.write.sourceSportScope ? { sourceSportScope: plan.write.sourceSportScope } : {}),
  };
  const nextMappingSummary = appendRetryAudit(plan.parent.mappingJob.resultSummary, retryAudit);
  const mappingUpdate = await client.affiliateSourceMappingJobs.updateMany({
    where: {
      id: plan.parent.mappingJob.id,
      intakeId: plan.parent.mappingJob.intakeId,
      status: 'REVIEW_REQUIRED',
      sourceId: plan.parent.mappingJob.sourceId,
      mappingId: plan.parent.mappingJob.mappingId,
      supplySourceId: plan.parent.mappingJob.supplySourceId,
      claimedAt: null,
      workerId: null,
      leaseExpiresAt: null,
    },
    data: {
      status: 'QUEUED',
      claimedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      errorMessage: null,
      finishedAt: null,
      resultSummary: asPrismaJson(nextMappingSummary),
    },
  });
  if (mappingUpdate.count !== 1) {
    throw new AffiliateLegacyRepairAdmissionError(
      'RETRY_MAPPING_JOB_CAS_FAILED',
      `Mapping job ${plan.parent.mappingJob.id} could not be queued for retry.`,
    );
  }
  await client.affiliateAgentGatewayJobs.create({
    data: {
      id: childGatewayJobId,
      dedupeKey: plan.write.gatewayDedupeKey,
      queue: 'AFFILIATE_MAPPING',
      lane: 'MAPPING_PRODUCTION',
      role: 'MAPPING_PRODUCER',
      subjectType: 'MAPPING_PRODUCER',
      subjectId: plan.write.mappingJobId,
      subjectJson: asPrismaJson({
        type: 'MAPPING_PRODUCER',
        supplySourceId: plan.write.rootId,
        mappingJobId: plan.write.mappingJobId,
        listingKind: plan.write.listingKind,
        pass: plan.write.retryPass,
        repairContext: plan.parent.freshRepairContext,
      }),
      evidenceManifestJson: asPrismaJson(plan.parent.manifest),
      supplySourceId: plan.write.rootId,
      expectedLifecycleGeneration: plan.write.rootLifecycleGeneration,
      status: 'QUEUED',
      priority: 0,
      nextAttemptAt: new Date(),
      claimGeneration: 0,
      activeClaimId: null,
      parentClaimId: plan.write.parentClaimId,
    },
  });
  return childGatewayJobId;
};
const appendContinuationAudit = (
  summary: unknown,
  evidence: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const envelope = recordValue(summary);
  const history = continuationAuditEntries(summary);
  const existing = history.find((entry) => (
    entry.parentGatewayJobId === evidence.parentGatewayJobId
    && entry.operation === evidence.operation
  ));
  if (existing) {
    if (sameAdmissionValue(existing, evidence)) return envelope;
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_AUDIT_CONFLICT',
      'The existing continuation audit does not match the requested continuation.',
    );
  }
  return {
    ...envelope,
    legacyRepairContinuationHistory: [...history, evidence],
  };
};

const applyContinuationPlan = async (
  client: Prisma.TransactionClient,
  plan: ContinuationPlan,
  reportSnapshot: AffiliateLegacyRepairContinuationApplyReport,
  reportHash: string,
  reasonText: string,
  operatorId: string,
  childGatewayJobId: string,
): Promise<void> => {
  const currentParent = await client.affiliateAgentGatewayJobs.findUnique({
    where: { id: plan.parent.gatewayJob.id },
    select: retryGatewayJobSelect,
  }) as unknown as GatewayJobRow | null;
  if (
    !currentParent
    || currentParent.status !== 'COMPLETED'
    || currentParent.activeClaimId !== null
    || currentParent.terminalReceiptId !== plan.parent.receipt.id
    || currentParent.resultHash !== plan.parent.gatewayJob.resultHash
    || currentParent.parentClaimId !== (plan.parent.gatewayJob.parentClaimId ?? null)
    || currentParent.subjectId !== plan.parent.mappingJob.id
    || currentParent.supplySourceId !== plan.write.rootId
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_STATE_DRIFT',
      `Parent Gateway job ${plan.parent.gatewayJob.id} changed after preview.`,
    );
  }
  const currentMappingJob = await client.affiliateSourceMappingJobs.findUnique({
    where: { id: plan.parent.mappingJob.id },
  }) as unknown as MappingJobRow | null;
  if (
    !currentMappingJob
    || currentMappingJob.status !== 'REVIEW_REQUIRED'
    || currentMappingJob.intakeId !== plan.parent.mappingJob.intakeId
    || currentMappingJob.sourceId !== plan.parent.mappingJob.sourceId
    || currentMappingJob.mappingId !== plan.parent.mappingJob.mappingId
    || currentMappingJob.supplySourceId !== plan.parent.mappingJob.supplySourceId
    || currentMappingJob.claimedAt
    || currentMappingJob.workerId
    || currentMappingJob.leaseExpiresAt
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_STATE_DRIFT',
      `Mapping job ${plan.parent.mappingJob.id} changed after preview.`,
    );
  }
  const existingByDedupe = await client.affiliateAgentGatewayJobs.findUnique({
    where: { dedupeKey: plan.write.producerDedupeKey },
    select: retryGatewayJobSelect,
  }) as unknown as GatewayJobRow | null;
  if (existingByDedupe) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_DEDUPE_CONFLICT',
      `Continuation producer key ${plan.write.producerDedupeKey} is already occupied.`,
    );
  }
  const continuationAudit = {
    schemaVersion: AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION,
    operation: 'LEGACY_SPORT_REPAIR_CONTINUATION',
    kind: 'LEGACY_SPORT_REPAIR_CONTINUATION',
    reportHash,
    reportSnapshot,
    requestedGatewayJobId: plan.parent.gatewayJob.id,
    requestedGatewayJobIds: [plan.parent.gatewayJob.id],
    reason: reasonText,
    operatorId,
    limits: {
      producerClaims: AFFILIATE_LEGACY_REPAIR_CONTINUATION_PRODUCER_LIMIT,
      reviewerClaims: AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT,
    },
    parentGatewayJobId: plan.parent.gatewayJob.id,
    parentClaimId: plan.parent.claim.id,
    parentClaimGeneration: plan.parent.claim.claimGeneration,
    parentLifecycleGeneration: plan.parent.claim.lifecycleGeneration,
    parentMappingJobId: plan.parent.mappingJob.id,
    parentReceiptId: plan.parent.receipt.id,
    parentResultHash: plan.parent.gatewayJob.resultHash,
    parentDeploymentContractHash: plan.parent.claim.deploymentContractHash,
    parentPass: 3,
    continuationPass: 3,
    childGatewayJobId,
    producerDedupeKey: plan.write.producerDedupeKey,
    childDedupeKey: plan.write.producerDedupeKey,
    reviewerDedupePrefix: plan.write.reviewerDedupePrefix,
    sourceKey: plan.write.sourceKey,
    intakeId: plan.write.intakeId,
    sourceId: plan.write.sourceId,
    mappingId: plan.write.mappingId,
    rootId: plan.write.rootId,
    rootIdentityKey: plan.write.rootIdentityKey,
    rootLifecycleGeneration: plan.write.rootLifecycleGeneration,
    currentDeploymentContractVersion: reportSnapshot.deploymentContractVersion,
    currentDeploymentContractHash: plan.write.currentDeploymentContractHash,
    evidenceRunId: plan.write.evidenceRunId,
    sportsCatalogSha256: plan.write.sportsCatalogSha256,
    repairContext: plan.write.repairContext,
    manifest: plan.write.manifest,
    manifestHash: plan.write.manifestHash,
    artifactIds: [...plan.write.artifactIds],
    ...(plan.write.sourceSportScope ? { sourceSportScope: plan.write.sourceSportScope } : {}),
    writes: [...plan.write.writes],
  };
  const nextMappingSummary = appendContinuationAudit(
    plan.parent.mappingJob.resultSummary,
    continuationAudit,
  );
  const mappingUpdate = await client.affiliateSourceMappingJobs.updateMany({
    where: {
      id: plan.parent.mappingJob.id,
      intakeId: plan.parent.mappingJob.intakeId,
      status: 'REVIEW_REQUIRED',
      sourceId: plan.parent.mappingJob.sourceId,
      mappingId: plan.parent.mappingJob.mappingId,
      supplySourceId: plan.parent.mappingJob.supplySourceId,
      claimedAt: null,
      workerId: null,
      leaseExpiresAt: null,
    },
    data: {
      status: 'QUEUED',
      claimedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      errorMessage: null,
      finishedAt: null,
      resultSummary: asPrismaJson(nextMappingSummary),
    },
  });
  if (mappingUpdate.count !== 1) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_MAPPING_JOB_CAS_FAILED',
      `Mapping job ${plan.parent.mappingJob.id} could not be queued for continuation.`,
    );
  }
  await client.affiliateAgentGatewayJobs.create({
    data: {
      id: childGatewayJobId,
      dedupeKey: plan.write.producerDedupeKey,
      queue: 'AFFILIATE_MAPPING',
      lane: 'MAPPING_PRODUCTION',
      role: 'MAPPING_PRODUCER',
      subjectType: 'MAPPING_PRODUCER',
      subjectId: plan.write.mappingJobId,
      subjectJson: asPrismaJson({
        type: 'MAPPING_PRODUCER',
        supplySourceId: plan.write.rootId,
        mappingJobId: plan.write.mappingJobId,
        listingKind: plan.write.listingKind,
        pass: 3,
        repairContext: plan.parent.freshRepairContext,
      }),
      evidenceManifestJson: asPrismaJson(plan.write.manifest),
      supplySourceId: plan.write.rootId,
      expectedLifecycleGeneration: plan.write.rootLifecycleGeneration,
      status: 'QUEUED',
      priority: 0,
      nextAttemptAt: new Date(),
      claimGeneration: 0,
      activeClaimId: null,
      parentClaimId: plan.write.parentClaimId,
    },
  });
};

const continuationReplayReport = async (
  snapshot: RetrySnapshot,
  bundle: ParsedBundle,
  gatewayJobId: string,
  reasonText: string,
  expectedReportHash: string,
  operatorId: string,
  artifactStore?: AffiliateAgentArtifactStore,
): Promise<AffiliateLegacyRepairContinuationApplyReport | null> => {
  const parent = retryParentPartsFor(snapshot, gatewayJobId, { allowPass3: true }).parts;
  const mappingJobId = parent?.subject.mappingJobId;
  const mappingJob = mappingJobId
    ? snapshot.admission.jobs.find((job) => job.id === mappingJobId) ?? null
    : null;
  if (!parent || !mappingJob) return null;
  const audits = continuationAuditForParent(mappingJob, gatewayJobId);
  if (audits.length === 0) return null;
  if (audits.length !== 1) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_AUDIT_CONFLICT',
      'Multiple continuation audits exist for one parent Gateway job.',
    );
  }
  const audit = audits[0];
  const storedReport = recordValue(audit.reportSnapshot);
  const storedRequested = stringArrayValue(storedReport.requestedGatewayJobIds);
  const storedSelected = stringArrayValue(storedReport.selectedGatewayJobIds);
  const storedApplied = stringArrayValue(storedReport.appliedGatewayJobIds);
  const storedRows = Array.isArray(storedReport.rows)
    ? storedReport.rows.map(recordValue)
    : [];
  const storedWrites = Array.isArray(storedReport.proposedWrites)
    ? storedReport.proposedWrites.map(recordValue)
    : [];
  const storedCounts = recordValue(storedReport.counts);
  const storedLimits = recordValue(storedReport.limits);
  const auditLimits = recordValue(audit.limits);
  let storedHash: string | null = null;
  try {
    storedHash = continuationReportHashFor(
      storedReport as unknown as AffiliateLegacyRepairContinuationReport,
    );
  } catch {
    storedHash = null;
  }
  const childGatewayJobId = stringValue(audit.childGatewayJobId);
  const child = childGatewayJobId
    ? snapshot.gatewayJobs.find((job) => job.id === childGatewayJobId) ?? null
    : null;
  const rootId = stringValue(audit.rootId) ?? parent.subject.supplySourceId;
  const root = rootId
    ? snapshot.admission.roots.find((candidate) => candidate.id === rootId) ?? null
    : null;
  const sourceId = stringValue(audit.sourceId);
  const source = sourceId
    ? snapshot.admission.sources.find((candidate) => candidate.id === sourceId) ?? null
    : null;
  const intakeId = stringValue(audit.intakeId);
  const intake = intakeId
    ? snapshot.admission.intakes.find((candidate) => candidate.id === intakeId) ?? null
    : null;
  const mapping = stringValue(audit.mappingId)
    ? snapshot.admission.mappings.find((candidate) => candidate.id === audit.mappingId) ?? null
    : null;
  const manifest = recordValue(audit.manifest);
  const producerDedupeKey = `${AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX}${rootId ?? ''}`;
  const reportRow = storedRows.find((row) => row.gatewayJobId === gatewayJobId);
  const reportWrite = storedWrites.find((write) => write.gatewayJobId === gatewayJobId);
  const childClaims = child
    ? snapshot.gatewayClaims.filter((claim) => claim.jobId === child.id)
    : [];
  const continuationJobs = rootId
    ? snapshot.gatewayJobs.filter((candidate) => (
      candidate.supplySourceId === rootId
      && (
        candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX)
        || candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX)
      )
    ))
    : [];
  const producerJobs = continuationJobs.filter((candidate) => (
    candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX)
  ));
  const reviewerJobs = continuationJobs.filter((candidate) => (
    candidate.dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX)
  ));
  const expectedReviewerKeys = new Set(
    childClaims.map((claim) => `${AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX}${claim.id}`),
  );
  const childMatches = root
    && affiliateAgentEvidenceManifestSchema.safeParse(manifest).success
    && continuationAuditedChildMatches(
      parent,
      audit,
      child,
      mappingJob,
      root,
      manifest,
    );
  const replayStateValid = (
    childMatches === true
    && child !== null
    && (child.status !== 'COMPLETED' || child.terminalReceiptId !== null)
  );
  if (
    storedReport.operation !== 'LEGACY_SPORT_REPAIR_CONTINUATION'
    || storedReport.schemaVersion !== AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION
    || storedReport.mode !== 'APPLY'
    || storedReport.reportHash !== expectedReportHash
    || audit.operation !== 'LEGACY_SPORT_REPAIR_CONTINUATION'
    || audit.kind !== 'LEGACY_SPORT_REPAIR_CONTINUATION'
    || audit.schemaVersion !== AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION
    || audit.reportHash !== expectedReportHash
    || audit.reason !== reasonText
    || audit.operatorId !== operatorId
    || storedReport.reason !== reasonText
    || storedReport.gatewayJobId !== gatewayJobId
    || !storedRequested
    || !sameAdmissionValue(storedRequested, [gatewayJobId])
    || !storedSelected
    || !sameAdmissionValue(storedSelected, [gatewayJobId])
    || !storedApplied
    || storedApplied.length !== 1
    || storedApplied[0] !== childGatewayJobId
    || storedRows.length !== 1
    || storedWrites.length !== 1
    || storedCounts.total !== 1
    || storedCounts.eligible !== 1
    || storedCounts.held !== 0
    || storedCounts.selected !== 1
    || storedCounts.alreadyContinued !== 0
    || storedLimits.producerClaims !== AFFILIATE_LEGACY_REPAIR_CONTINUATION_PRODUCER_LIMIT
    || storedLimits.reviewerClaims !== AFFILIATE_LEGACY_REPAIR_CONTINUATION_REVIEWER_LIMIT
    || !continuationLimitsValid(auditLimits, storedLimits)
    || storedHash !== expectedReportHash
    || storedReport.contractVersion !== bundle.supplyContract.version
    || storedReport.contractHash !== bundle.supplyContract.hash
    || storedReport.deploymentContractVersion !== bundle.deploymentContract.version
    || storedReport.deploymentContractHash !== bundle.deploymentContract.hash
    || audit.parentGatewayJobId !== gatewayJobId
    || audit.parentClaimId !== parent.claim.id
    || audit.parentMappingJobId !== mappingJob.id
    || audit.parentReceiptId !== parent.receipt.id
    || audit.parentResultHash !== parent.gatewayJob.resultHash
    || audit.parentDeploymentContractHash !== parent.claim.deploymentContractHash
    || audit.parentPass !== 3
    || audit.continuationPass !== 3
    || audit.childGatewayJobId !== childGatewayJobId
    || audit.producerDedupeKey !== producerDedupeKey
    || audit.reviewerDedupePrefix !== AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX
    || audit.rootId !== rootId
    || audit.rootIdentityKey !== root?.identityKey
    || audit.intakeId !== intake?.id
    || audit.sourceId !== source?.id
    || !mapping
    || audit.mappingId !== mapping.id
    || audit.evidenceRunId !== parent.subject.repairContext.evidenceRunId
    || !sameAdmissionValue(audit.manifest, parent.gatewayJob.evidenceManifestJson)
    || !sameAdmissionValue(storedReport.row, reportRow)
    || !root
    || !source
    || !intake
    || (intake.affiliateSourceId !== source.id)
    || (intake.supplySourceId !== root.id)
    || (source.supplySourceId !== root.id)
    || (mapping && (mapping.sourceId !== source.id || mapping.supplySourceId !== root.id))
    || !reportRow
    || reportRow.gatewayJobId !== gatewayJobId
    || reportRow.childGatewayJobId !== childGatewayJobId
    || reportRow.parentPass !== 3
    || reportRow.continuationPass !== 3
    || reportRow.outcome !== 'APPLIED'
    || reportRow.producerDedupeKey !== producerDedupeKey
    || !reportWrite
    || reportWrite.gatewayJobId !== gatewayJobId
    || reportWrite.parentPass !== 3
    || reportWrite.continuationPass !== 3
    || reportWrite.producerDedupeKey !== producerDedupeKey
    || !replayStateValid
    || producerJobs.length !== 1
    || producerJobs[0]?.id !== childGatewayJobId
    || reviewerJobs.length > 1
    || reviewerJobs.some((job) => !expectedReviewerKeys.has(job.dedupeKey))
    || !await retryHistoricalSportEvidenceValid(parent, artifactStore)
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'CONTINUATION_STATE_DRIFT',
      'The persisted continuation child no longer matches its parent audit.',
      { expectedReportHash },
    );
  }
  const replayRow = {
    ...(reportRow as unknown as AffiliateLegacyRepairContinuationRow),
    childGatewayJobId,
    outcome: 'APPLIED' as const,
  };
  return {
    ...(storedReport as unknown as AffiliateLegacyRepairContinuationReport),
    mode: 'APPLY',
    row: replayRow,
    rows: [replayRow],
    childGatewayJobId,
    producerDedupeKey,
    reviewerDedupePrefix: AFFILIATE_AGENT_CONTINUATION_REVIEWER_PREFIX,
    reviewedReportHash: expectedReportHash,
    writeCount: 0,
    appliedGatewayJobIds: [childGatewayJobId],
    replayed: true,
  };
};

const retryReplayReport = async (
  snapshot: RetrySnapshot,
  bundle: ParsedBundle,
  gatewayJobIds: readonly string[],
  reasonText: string,
  expectedReportHash: string,
  operatorId: string,
  scopeRequest: RetryScopeRequest,
  artifactStore?: AffiliateAgentArtifactStore,
): Promise<AffiliateLegacyRepairRetryApplyReport | null> => {
  const audits: JsonRecord[] = [];
  const scopeDecisions: Array<RetryScopeDecision | null> = [];
  for (const gatewayJobId of gatewayJobIds) {
    const parent = retryParentPartsFor(snapshot, gatewayJobId).parts;
    const mappingJobId = parent?.subject.mappingJobId;
    const mappingJob = mappingJobId
      ? snapshot.admission.jobs.find((job) => job.id === mappingJobId)
      : null;
    const entries = mappingJob ? retryAuditForParent(mappingJob, gatewayJobId) : [];
    if (entries.length === 0) return null;
    if (entries.length !== 1) {
      throw new AffiliateLegacyRepairAdmissionError(
        'RETRY_AUDIT_CONFLICT',
        'Multiple retry audits exist for one parent Gateway job.',
      );
    }
    const scopeDecision = parent
      ? await retrySourceSportScopeFor(snapshot, parent, reasonText, scopeRequest, artifactStore)
      : null;
    scopeDecisions.push(scopeDecision);
    if (
      parent
      && (
        !scopeDecision
        || scopeDecision.reasonCodes.length > 0
      )
    ) return null;
    if (
      parent
      && !(
        scopeDecision?.verifiedParentSportEvidence !== undefined
          ? scopeDecision.verifiedParentSportEvidence !== null
          : await retryHistoricalSportEvidenceValid(parent, artifactStore)
      )
    ) return null;
    audits.push(entries[0]);
  }
  if (audits.some((audit, index) => (
    !sameAdmissionValue(
      scopeDecisions[index]?.sourceSportScope ?? null,
      recordValue(audit.repairContext).sourceSportScope ?? null,
    )
  ))) return null;
  const first = audits[0];
  const storedReport = recordValue(first.reportSnapshot);
  const storedRequested = Array.isArray(storedReport.requestedGatewayJobIds)
    ? storedReport.requestedGatewayJobIds.filter((value): value is string => typeof value === 'string')
    : null;
  const storedSelected = Array.isArray(storedReport.selectedGatewayJobIds)
    ? storedReport.selectedGatewayJobIds.filter((value): value is string => typeof value === 'string')
    : null;
  const storedRows = Array.isArray(storedReport.rows) ? storedReport.rows : null;
  const storedWrites = Array.isArray(storedReport.proposedWrites) ? storedReport.proposedWrites : null;
  const storedCounts = recordValue(storedReport.counts);
  if (!storedRows || !storedWrites || !storedRequested || !storedSelected) {
    throw new AffiliateLegacyRepairAdmissionError(
      'ADMISSION_REPORT_DRIFT',
      'Persisted retry report evidence is incomplete or stale.',
      { expectedReportHash },
    );
  }
  const storedHash = retryReportHashFor(storedReport as unknown as AffiliateLegacyRepairRetryReport);
  if (
    first.kind !== 'LEGACY_SPORT_REPAIR_RETRY'
    || (first.schemaVersion !== 1 && first.schemaVersion !== AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION)
    || first.reportHash !== expectedReportHash
    || first.reason !== reasonText
    || !sameAdmissionValue(first.requestedGatewayJobIds, gatewayJobIds)
    || first.operatorId !== operatorId
    || audits.some((audit, index) => {
      const parent = retryParentPartsFor(snapshot, gatewayJobIds[index]).parts;
      return (
        audit.kind !== first.kind
        || audit.schemaVersion !== first.schemaVersion
        || audit.reportHash !== first.reportHash
        || audit.reason !== first.reason
        || audit.operatorId !== operatorId
        || !sameAdmissionValue(audit.requestedGatewayJobIds, first.requestedGatewayJobIds)
        || audit.parentGatewayJobId !== gatewayJobIds[index]
        || audit.parentClaimId !== parent?.claim.id
        || audit.parentMappingJobId !== parent?.subject.mappingJobId
        || audit.parentReceiptId !== parent?.receipt.id
        || audit.parentResultHash !== parent?.gatewayJob.resultHash
        || audit.parentDeploymentContractHash !== parent?.claim.deploymentContractHash
        || audit.parentPass !== parent?.subject.pass
        || audit.retryPass !== (parent ? parent.subject.pass + 1 : null)
        || audit.rootId !== parent?.subject.supplySourceId
        || audit.rootLifecycleGeneration !== parent?.claim.lifecycleGeneration
        || audit.evidenceRunId !== parent?.subject.repairContext.evidenceRunId
        || !sameRetryLineageContext(audit.repairContext, parent?.subject.repairContext)
        || !sameAdmissionValue(audit.manifest, parent?.gatewayJob.evidenceManifestJson)
      );
    })
    || storedReport.schemaVersion !== first.schemaVersion
    || storedReport.reportHash !== expectedReportHash
    || storedReport.reason !== reasonText
    || !storedRequested
    || !sameAdmissionValue(storedRequested, gatewayJobIds)
    || !storedSelected
    || !sameAdmissionValue(storedSelected, gatewayJobIds)
    || storedRows.length !== gatewayJobIds.length
    || storedWrites.length !== gatewayJobIds.length
    || typeof storedCounts.total !== 'number'
    || typeof storedCounts.eligible !== 'number'
    || typeof storedCounts.held !== 'number'
    || typeof storedCounts.selected !== 'number'
    || typeof storedCounts.alreadyRetried !== 'number'
    || storedHash !== expectedReportHash
    || storedReport.deploymentContractVersion !== bundle.deploymentContract.version
    || storedReport.deploymentContractHash !== bundle.deploymentContract.hash
    || storedReport.contractVersion !== bundle.supplyContract.version
    || storedReport.contractHash !== bundle.supplyContract.hash
  ) {
    throw new AffiliateLegacyRepairAdmissionError(
      'ADMISSION_REPORT_DRIFT',
      'Persisted retry report evidence is incomplete or stale.',
      { expectedReportHash },
    );
  }
  const childGatewayJobIds: string[] = [];
  for (let index = 0; index < audits.length; index += 1) {
    const audit = audits[index];
    const parentParts = retryParentPartsFor(snapshot, gatewayJobIds[index]).parts;
    const write = storedWrites.find((value) => recordValue(value).gatewayJobId === gatewayJobIds[index]) ?? {};
    const childId = stringValue(audit.childGatewayJobId);
    const child = childId
      ? snapshot.gatewayJobs.find((job) => job.id === childId) ?? null
      : null;
    const mappingJob = parentParts
      ? snapshot.admission.jobs.find((job) => job.id === parentParts.subject.mappingJobId) ?? null
      : null;
    const intake = mappingJob
      ? snapshot.admission.intakes.find((candidate) => candidate.id === mappingJob.intakeId) ?? null
      : null;
    const root = parentParts
      ? snapshot.admission.roots.find((candidate) => candidate.id === parentParts.subject.supplySourceId) ?? null
      : null;
    const retryPass = typeof audit.retryPass === 'number' ? audit.retryPass : null;
    const auditManifest = recordValue(audit.manifest);
    const auditManifestValid = affiliateAgentEvidenceManifestSchema.safeParse(audit.manifest).success;
    const childMatches = parentParts
      && mappingJob
      && root
      && retryPass !== null
      && auditManifestValid
      && retryAuditedChildMatches(
        child,
        parentParts,
        audit,
        mappingJob,
        root,
        auditManifest,
        retryPass,
      );
    const auditReportMatches = parentParts
      && mappingJob
      && intake
      && child
      && retryAuditMatchesEdge(
        snapshot,
        mappingJob,
        intake,
        parentParts,
        child,
        retryPass ?? 0,
      );
    if (
      !parentParts
      || !childId
      || !childMatches
      || !auditReportMatches
      || (child !== null && child.status === 'COMPLETED' && child.terminalReceiptId === null)
      || write.gatewayJobId !== gatewayJobIds[index]
      || !sameAdmissionValue(write.gatewayDedupeKey, audit.childDedupeKey)
    ) {
      throw new AffiliateLegacyRepairAdmissionError(
        'RETRY_STATE_DRIFT',
        'The persisted retry child no longer matches its parent audit.',
      );
    }
    childGatewayJobIds.push(childId);
  }
  return {
    ...(storedReport as unknown as AffiliateLegacyRepairRetryReport),
    mode: 'APPLY',
    reviewedReportHash: expectedReportHash,
    writeCount: 0,
    appliedGatewayJobIds: childGatewayJobIds,
    replayed: true,
    rows: storedRows.map((value) => ({
      ...(value as AffiliateLegacyRepairRetryRow),
      childGatewayJobId: childGatewayJobIds[gatewayJobIds.indexOf((value as AffiliateLegacyRepairRetryRow).gatewayJobId)] ?? null,
      outcome: 'APPLIED' as const,
    })),
  };
};

export const assertAffiliateLegacyRepairScopeClaimBinding = async (input: Readonly<{
  prisma: AdmissionClient;
  job: unknown;
  claim: unknown;
}>): Promise<void> => {
  function reject(message: string): never {
    throw new AffiliateLegacyRepairAdmissionError(
      'CLAIM_BINDING_INVALID',
      message,
    );
  }
  const job = recordValue(input.job);
  const parsedClaim = affiliateAgentClaimEnvelopeSchema.safeParse(input.claim);
  if (!parsedClaim.success) reject('The scoped legacy repair claim envelope is invalid.');
  const envelope = parsedClaim.data;
  if (envelope.role !== 'MAPPING_PRODUCER' || envelope.subject.type !== 'MAPPING_PRODUCER') {
    return;
  }
  const subject = envelope.subject;
  const repairContext = subject.repairContext;
  const dedupeKey = stringValue(job.dedupeKey) ?? '';
  const legacyRepairLineage = repairContext?.kind === 'LEGACY_SPORT_REPAIR'
    || dedupeKey.startsWith('legacy-sport-repair-retry:')
    || dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX)
    || dedupeKey.startsWith('mapping-repair:');
  if (!legacyRepairLineage) return;
  const scope = repairContext?.sourceSportScope;
  const requiresScopedLineage = scope !== undefined
    || dedupeKey.startsWith('legacy-sport-repair-retry:')
    || dedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX)
    || dedupeKey.startsWith('mapping-repair:');
  if (!requiresScopedLineage) return;
  const childJobId = stringValue(job.id);
  const childParentClaimId = stringValue(job.parentClaimId);
  const queuedChild = affiliateAgentQueuedMappingProducerSubjectSchema.safeParse(job.subjectJson);
  if (
    !childJobId
    || !childParentClaimId
    || job.role !== 'MAPPING_PRODUCER'
    || job.subjectType !== 'MAPPING_PRODUCER'
    || job.queue !== 'AFFILIATE_MAPPING'
    || job.lane !== 'MAPPING_PRODUCTION'
    || job.subjectId !== subject.mappingJobId
    || job.supplySourceId !== subject.supplySourceId
    || job.parentClaimId !== childParentClaimId
    || envelope.jobId !== childJobId
    || envelope.role !== job.role
    || envelope.queue !== job.queue
    || envelope.lane !== job.lane
    || envelope.supplySourceId !== subject.supplySourceId
    || envelope.lifecycleGeneration !== job.expectedLifecycleGeneration
    || typeof job.claimGeneration !== 'number'
    || envelope.claimGeneration !== job.claimGeneration + 1
    || !queuedChild.success
    || !sameAdmissionValue(
      {
        ...queuedChild.data,
        ...(subject.listingKind === undefined ? {} : { listingKind: subject.listingKind }),
      },
      subject,
    )
    || !sameAdmissionValue(job.evidenceManifestJson, envelope.evidenceManifest)
  ) {
    reject('The scoped legacy repair claim does not match its Gateway job.');
  }
  const mappingJobId = subject.mappingJobId;
  const mappingJobRaw = await input.prisma.affiliateSourceMappingJobs.findUnique({
    where: { id: mappingJobId },
  });
  const mappingJob = recordValue(mappingJobRaw);
  const mappingSummary = recordValue(mappingJob.resultSummary);
  const retryHistory = Array.isArray(mappingSummary.legacyRepairRetryHistory)
    ? mappingSummary.legacyRepairRetryHistory.map(recordValue)
    : [];
  const continuationHistory = Array.isArray(mappingSummary.legacyRepairContinuationHistory)
    ? mappingSummary.legacyRepairContinuationHistory.map(recordValue)
    : [];
  const queuedScope = queuedChild.success
    ? recordValue(queuedChild.data.repairContext).sourceSportScope
    : undefined;
  const childScopeAudit = [...retryHistory, ...continuationHistory].some((audit) => {
    if (audit.childGatewayJobId !== childJobId) return false;
    const report = recordValue(audit.reportSnapshot);
    const reportRows = Array.isArray(report.rows)
      ? report.rows.map(recordValue)
      : [];
    const reportWrites = Array.isArray(report.proposedWrites)
      ? report.proposedWrites.map(recordValue)
      : [];
    const reportHasScope = reportRows.some((row) => row.sourceSportScope !== undefined)
      || reportWrites.some((write) => write.sourceSportScope !== undefined);
    return audit.sourceSportScope !== undefined
      || recordValue(audit.repairContext).sourceSportScope !== undefined
      || reportHasScope;
  });
  const immediateClaimRaw = await input.prisma.affiliateAgentGatewayClaims.findUnique({
    where: { id: childParentClaimId },
  });
  const immediateClaim = recordValue(immediateClaimRaw);
  const immediateJobId = stringValue(immediateClaim.jobId);
  const immediateJobRaw = immediateJobId
    ? await input.prisma.affiliateAgentGatewayJobs.findUnique({
      where: { id: immediateJobId },
    })
    : null;
  const immediateScope = recordValue(
    recordValue(immediateJobRaw?.subjectJson).repairContext,
  ).sourceSportScope;
  const immediateProducerEnvelope = immediateJobRaw?.role === 'MAPPING_PRODUCER'
    ? parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(immediateClaim.claimEnvelopeJson)
    : null;
  const immediateReviewerEnvelope = immediateJobRaw?.role === 'SUPPLY_REVIEWER'
    ? affiliateAgentClaimEnvelopeSchema.safeParse(immediateClaim.claimEnvelopeJson)
    : null;
  const immediateClaimEnvelopeData = immediateProducerEnvelope
    ? recordValue(immediateProducerEnvelope)
    : immediateReviewerEnvelope?.success
      ? recordValue(immediateReviewerEnvelope.data)
      : null;
  const parsedImmediateClaimContext = immediateClaimEnvelopeData
    ? recordValue(recordValue(immediateClaimEnvelopeData.subject).repairContext)
    : undefined;
  const immediateClaimEnvelopeHash = immediateClaimEnvelopeData
    ? normalizeHash(hashAffiliateAgentValue(immediateClaimEnvelopeData))
    : null;
  const immediateClaimEnvelopeHashMatches = immediateClaimEnvelopeHash !== null
    && immediateClaimEnvelopeHash === normalizeHash(immediateClaim.claimEnvelopeHash);
  if (
    !immediateClaimRaw
    || !immediateClaimEnvelopeData
    || !immediateClaimEnvelopeHashMatches
    || !immediateJobRaw
  ) {
    reject('The scoped legacy repair immediate parent claim envelope is not immutable.');
  }
  const immediateClaimContext = immediateClaimEnvelopeHashMatches
    ? parsedImmediateClaimContext
    : undefined;
  const immediateClaimScope = immediateClaimContext?.sourceSportScope;
  if (
    immediateClaimContext !== undefined
    && !sameRepairContext(
      recordValue(immediateJobRaw?.subjectJson).repairContext,
      immediateClaimContext,
    )
  ) {
    reject('The scoped legacy repair immediate parent context is not immutable.');
  }
  if (scope === undefined) {
    if (
      queuedScope !== undefined
      || childScopeAudit
      || immediateScope !== undefined
      || immediateClaimScope !== undefined
    ) {
      reject('The scoped legacy repair claim dropped its authenticated source scope.');
    }
    return;
  }
  if (!repairContext) {
    reject('The scoped legacy repair claim has no legacy repair context.');
  }
  const sourceId = stringValue(mappingJob.sourceId);
  const sourceRaw = sourceId
    ? await input.prisma.affiliateScrapeSources.findUnique({
      where: { id: sourceId },
      select: { id: true, supplySourceId: true, targetKind: true },
    })
    : null;
  const sourceListingKind = listingKindFor(normalizedUpper(sourceRaw?.targetKind));
  if (
    !mappingJobRaw
    || mappingJob.id !== mappingJobId
    || (
      repairContext?.intakeId !== undefined
      && mappingJob.intakeId !== repairContext.intakeId
    )
    || mappingJob.supplySourceId !== subject.supplySourceId
    || !sourceRaw
    || sourceRaw.id !== sourceId
    || sourceRaw.supplySourceId !== subject.supplySourceId
    || !sourceListingKind
    || subject.listingKind !== sourceListingKind
  ) {
    reject('The scoped legacy repair Mapping Job or source is not bound to the claim.');
  }
  const parsedScope = affiliateAgentSourceSportScopeSchema.safeParse(scope);
  if (!parsedScope.success) reject('The scoped legacy repair claim scope is invalid.');
  const trustedScope = parsedScope.data;
  if (
    trustedScope.supplySourceId !== subject.supplySourceId
    || trustedScope.intakeId !== repairContext.intakeId
    || trustedScope.evidenceRunId !== repairContext.evidenceRunId
  ) {
    reject('The scoped legacy repair claim scope identity is invalid.');
  }
  const authorityParentGatewayJobId = trustedScope.parentGatewayJobId;
  type ScopedClaimNode = Readonly<{
    claim: JsonRecord;
    job: JsonRecord;
    envelope: JsonRecord | null;
    subject: JsonRecord | null;
    result: JsonRecord | null;
    receipt: JsonRecord | null;
  }>;
  const sourceScopeTransitionValid = (transition: Readonly<{
    parentScopeValue: unknown;
    childScopeValue: unknown;
    parentResult: JsonRecord | null;
    parentGatewayJobId: string | null;
    parentResultHash: string | null;
    auditOperatorId?: string | null;
    auditReason?: string | null;
    deploymentChanged: boolean;
    requireIntroducingDelta?: boolean;
  }>): boolean => {
    const parsedChildScope = affiliateAgentSourceSportScopeSchema.safeParse(
      transition.childScopeValue,
    );
    if (
      !parsedChildScope.success
      || parsedChildScope.data.supplySourceId !== trustedScope.supplySourceId
      || parsedChildScope.data.intakeId !== trustedScope.intakeId
      || parsedChildScope.data.evidenceRunId !== trustedScope.evidenceRunId
    ) {
      return false;
    }
    const parsedParentScope = transition.parentScopeValue === undefined
      ? null
      : affiliateAgentSourceSportScopeSchema.safeParse(transition.parentScopeValue);
    if (
      transition.parentScopeValue !== undefined
      && (!parsedParentScope || !parsedParentScope.success)
    ) {
      return false;
    }
    const parentScope = parsedParentScope && parsedParentScope.success
      ? parsedParentScope.data
      : null;
    if (
      parentScope
      && (
        parentScope.supplySourceId !== parsedChildScope.data.supplySourceId
        || parentScope.intakeId !== parsedChildScope.data.intakeId
        || parentScope.evidenceRunId !== parsedChildScope.data.evidenceRunId
      )
    ) {
      return false;
    }
    const parentLabels = new Set(
      parentScope?.excludedSourceLabels.map(normalizeAffiliateSportLabel) ?? [],
    );
    const childLabels = new Set(
      parsedChildScope.data.excludedSourceLabels.map(normalizeAffiliateSportLabel),
    );
    if ([...parentLabels].some((label) => !childLabels.has(label))) return false;
    const newLabels = [...childLabels].filter((label) => !parentLabels.has(label));
    if (newLabels.length === 0) {
      if (
        transition.requireIntroducingDelta === true
        || !transition.deploymentChanged
        || parentScope === null
        || !sameAdmissionValue(parentScope, parsedChildScope.data)
      ) {
        return false;
      }
      return true;
    }
    if (
      parsedChildScope.data.parentGatewayJobId !== transition.parentGatewayJobId
      || normalizeHash(parsedChildScope.data.parentResultHash)
        !== normalizeHash(transition.parentResultHash)
      || (
        transition.auditOperatorId !== undefined
        && (
          stringValue(transition.auditOperatorId) !== parsedChildScope.data.operatorId
          || stringValue(transition.auditReason) !== parsedChildScope.data.reason
        )
      )
    ) {
      return false;
    }
    const parsedSportEvidence = affiliateAgentSportEvidenceSchema.safeParse(
      recordValue(transition.parentResult?.payload).sportEvidence,
    );
    if (
      !parsedSportEvidence.success
      || parsedSportEvidence.data.evidenceRunId !== parsedChildScope.data.evidenceRunId
    ) {
      return false;
    }
    const effectiveLabels = new Set([...parentLabels, ...childLabels]);
    const newLabelSet = new Set(newLabels);
    const coveredLabels = new Set<string>();
    for (const determination of parsedSportEvidence.data.sportDeterminations) {
      const determinationLabels = determination.sourceLabels.map(normalizeAffiliateSportLabel);
      const matchingNewLabels = determinationLabels.filter((label) => newLabelSet.has(label));
      if (
        matchingNewLabels.length === 0
        && determination.status === 'RESOLVED'
        && determination.canonicalSportNames.some(
          (name) => newLabelSet.has(normalizeAffiliateSportLabel(name)),
        )
      ) {
        return false;
      }
      if (matchingNewLabels.length === 0) continue;
      if (
        determination.status === 'RESOLVED'
        || determination.resolutionBasis !== 'SOURCE_EVIDENCE'
        || determinationLabels.some((label) => !effectiveLabels.has(label))
      ) {
        return false;
      }
      matchingNewLabels.forEach((label) => coveredLabels.add(label));
    }
    return newLabels.every((label) => coveredLabels.has(label));
  };
  const claimCache = new Map<string, JsonRecord | null>();
  const jobCache = new Map<string, JsonRecord | null>();
  const receiptCache = new Map<string, JsonRecord | null>();
  const loadNode = async (claimId: string): Promise<ScopedClaimNode | null> => {
    const claimRaw = claimCache.has(claimId)
      ? claimCache.get(claimId)
      : recordValue(await input.prisma.affiliateAgentGatewayClaims.findUnique({
        where: { id: claimId },
      }));
    claimCache.set(claimId, claimRaw ?? null);
    if (!claimRaw) return null;
    const claim = recordValue(claimRaw);
    const jobId = stringValue(claim.jobId);
    if (!jobId) return null;
    const jobRaw = jobCache.has(jobId)
      ? jobCache.get(jobId)
      : recordValue(await input.prisma.affiliateAgentGatewayJobs.findUnique({
        where: { id: jobId },
      }));
    jobCache.set(jobId, jobRaw ?? null);
    if (!jobRaw) return null;
    const nodeJob = recordValue(jobRaw);
    const producerEnvelope = nodeJob.role === 'MAPPING_PRODUCER'
      ? parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(claim.claimEnvelopeJson)
      : null;
    const reviewerEnvelope = nodeJob.role === 'SUPPLY_REVIEWER'
      ? affiliateAgentClaimEnvelopeSchema.safeParse(claim.claimEnvelopeJson)
      : null;
    const nodeEnvelope = producerEnvelope && producerEnvelope.role === 'MAPPING_PRODUCER'
      ? recordValue(producerEnvelope)
      : reviewerEnvelope?.success && reviewerEnvelope.data.role === 'SUPPLY_REVIEWER'
        ? recordValue(reviewerEnvelope.data)
        : null;
    const parsedResult = affiliateAgentTerminalResultEnvelopeSchema.safeParse(nodeJob.resultJson);
    const nodeResult = parsedResult.success ? recordValue(parsedResult.data) : null;
    const receiptId = stringValue(claim.terminalReceiptId);
    const receiptRaw = receiptId
      ? receiptCache.has(receiptId)
        ? receiptCache.get(receiptId)
        : recordValue(await input.prisma.affiliateAgentGatewayOperationReceipts.findUnique({
          where: { id: receiptId },
        }))
      : null;
    if (receiptId) receiptCache.set(receiptId, receiptRaw ?? null);
    return {
      claim,
      job: nodeJob,
      envelope: nodeEnvelope,
      subject: nodeEnvelope ? recordValue(nodeEnvelope.subject) : null,
      result: nodeResult,
      receipt: receiptRaw ? recordValue(receiptRaw) : null,
    };
  };
  const immediateNode = await loadNode(childParentClaimId);
  if (!immediateNode) reject('The scoped legacy repair immediate parent lineage is missing.');
  const lineageNodes: ScopedClaimNode[] = [];
  const visitedClaimIds = new Set<string>();
  let node: ScopedClaimNode | null = immediateNode;
  let originNode: ScopedClaimNode | null = null;
  for (let depth = 0; node; depth += 1) {
    const nodeClaimId = stringValue(node.claim.id);
    if (!nodeClaimId || depth >= 8 || visitedClaimIds.has(nodeClaimId)) {
      reject('The scoped legacy repair claim ancestry is malformed.');
    }
    visitedClaimIds.add(nodeClaimId);
    const nodeEnvelope = node.envelope;
    const nodeSubject = node.subject;
    const nodeResult = node.result;
    const nodeReceipt = node.receipt;
    const producerNode = node.job.role === 'MAPPING_PRODUCER';
    const reviewerNode = node.job.role === 'SUPPLY_REVIEWER';
    const expectedQueue = producerNode ? 'AFFILIATE_MAPPING' : 'AFFILIATE_REVIEW';
    const expectedLane = producerNode ? 'MAPPING_PRODUCTION' : 'SUPPLY_REVIEW';
    let resultHash: string | null = null;
    let envelopeHash: string | null = null;
    let receiptResponseHash: string | null = null;
    try {
      resultHash = nodeResult ? hashAffiliateAgentValue(nodeResult) : null;
      envelopeHash = nodeEnvelope ? hashAffiliateAgentValue(nodeEnvelope) : null;
      receiptResponseHash = nodeReceipt
        ? hashAffiliateAgentValue(nodeReceipt.responseJson)
        : null;
    } catch {
      resultHash = null;
      envelopeHash = null;
      receiptResponseHash = null;
    }
    const response = recordValue(nodeReceipt?.responseJson);
    if (
      (!producerNode && !reviewerNode)
      || !nodeEnvelope
      || !nodeSubject
      || !nodeResult
      || !nodeReceipt
      || node.job.id !== nodeEnvelope.jobId
      || node.job.id !== nodeResult.jobId
      || node.claim.id !== nodeEnvelope.claimId
      || node.claim.id !== nodeResult.claimId
      || node.job.role !== nodeEnvelope.role
      || node.job.role !== nodeResult.role
      || node.job.queue !== expectedQueue
      || node.job.lane !== expectedLane
      || node.job.subjectType !== nodeSubject.type
      || node.claim.role !== node.job.role
      || node.claim.queue !== node.job.queue
      || node.claim.lane !== node.job.lane
      || node.claim.jobId !== node.job.id
      || (stringValue(node.claim.parentClaimId) ?? null)
        !== (stringValue(node.job.parentClaimId) ?? null)
      || node.claim.status !== 'COMPLETED'
      || node.job.status !== 'COMPLETED'
      || node.job.activeClaimId !== null
      || node.job.terminalReceiptId !== node.claim.terminalReceiptId
      || !stringValue(node.claim.terminalReceiptId)
      || node.job.terminalDisposition !== nodeResult.disposition
      || typeof node.claim.claimGeneration !== 'number'
      || typeof node.job.claimGeneration !== 'number'
      || node.job.claimGeneration !== node.claim.claimGeneration
      || nodeEnvelope.claimGeneration !== node.claim.claimGeneration
      || nodeEnvelope.lifecycleGeneration !== node.claim.lifecycleGeneration
      || node.job.expectedLifecycleGeneration !== node.claim.lifecycleGeneration
      || nodeEnvelope.queue !== node.job.queue
      || nodeEnvelope.lane !== node.job.lane
      || nodeEnvelope.supplySourceId !== trustedScope.supplySourceId
      || node.job.supplySourceId !== trustedScope.supplySourceId
      || nodeEnvelope.workerId !== node.claim.workerId
      || nodeEnvelope.invocationId !== node.claim.invocationId
      || nodeEnvelope.workspaceId !== node.claim.workspaceId
      || recordValue(nodeEnvelope.evidenceManifest).hash !== node.claim.evidenceManifestHash
      || !sameAdmissionValue(node.job.evidenceManifestJson, nodeEnvelope.evidenceManifest)
      || normalizeHash(envelopeHash) !== normalizeHash(node.claim.claimEnvelopeHash)
      || nodeResult.claimGeneration !== node.claim.claimGeneration
      || nodeResult.lifecycleGeneration !== node.claim.lifecycleGeneration
      || nodeResult.deploymentContractVersion !== nodeEnvelope.deploymentContractVersion
      || nodeResult.deploymentContractHash !== nodeEnvelope.deploymentContractHash
      || nodeResult.supplyContractVersion !== nodeEnvelope.supplyContractVersion
      || nodeResult.supplyContractHash !== nodeEnvelope.supplyContractHash
      || nodeResult.roleContractVersion !== nodeEnvelope.roleContractVersion
      || nodeResult.roleContractHash !== nodeEnvelope.roleContractHash
      || nodeResult.promptTemplateVersion !== nodeEnvelope.promptTemplateVersion
      || nodeResult.promptTemplateHash !== nodeEnvelope.promptTemplateHash
      || nodeResult.workerId !== nodeEnvelope.workerId
      || nodeResult.invocationId !== nodeEnvelope.invocationId
      || normalizeHash(resultHash) !== normalizeHash(node.job.resultHash)
      || nodeReceipt.id !== node.claim.terminalReceiptId
      || nodeReceipt.jobId !== node.job.id
      || nodeReceipt.claimId !== node.claim.id
      || nodeReceipt.claimGeneration !== node.claim.claimGeneration
      || nodeReceipt.operationKind !== 'SUBMIT_RESULT'
      || nodeReceipt.status !== 'SUCCEEDED'
      || !nodeReceipt.completedAt
      || normalizeHash(receiptResponseHash) !== normalizeHash(nodeReceipt.responseHash)
      || response.kind !== 'TERMINAL_ACCEPTED'
      || response.receiptId !== nodeReceipt.id
      || normalizeHash(response.resultHash) !== normalizeHash(resultHash)
      || response.disposition !== nodeResult.disposition
    ) {
      reject('The scoped legacy repair claim ancestry is not immutable.');
    }
    if (producerNode) {
      const parsedQueued = affiliateAgentQueuedMappingProducerSubjectSchema.safeParse(node.job.subjectJson);
      const normalizedQueued = parsedQueued.success
        ? {
          ...parsedQueued.data,
          ...(nodeSubject.listingKind === undefined ? {} : { listingKind: nodeSubject.listingKind }),
        }
        : null;
      const nodeContext = recordValue(nodeSubject.repairContext);
      const nodeScope = nodeContext.sourceSportScope;
      if (
        !parsedQueued.success
        || !sameAdmissionValue(normalizedQueued, nodeSubject)
        || nodeSubject.type !== 'MAPPING_PRODUCER'
        || nodeSubject.mappingJobId !== mappingJobId
        || nodeSubject.supplySourceId !== trustedScope.supplySourceId
        || node.job.subjectId !== mappingJobId
        || nodeContext.kind !== 'LEGACY_SPORT_REPAIR'
        || nodeContext.intakeId !== trustedScope.intakeId
        || nodeContext.evidenceRunId !== trustedScope.evidenceRunId
        || nodeSubject.listingKind !== undefined && nodeSubject.listingKind !== sourceListingKind
      ) {
        reject('The scoped legacy repair producer ancestry is invalid.');
      }
      if (nodeScope !== undefined) {
        const parsedNodeScope = affiliateAgentSourceSportScopeSchema.safeParse(nodeScope);
        const nodeScopeLabels = parsedNodeScope.success
          ? new Set(parsedNodeScope.data.excludedSourceLabels.map(normalizeAffiliateSportLabel))
          : new Set<string>();
        const trustedScopeLabels = new Set(
          trustedScope.excludedSourceLabels.map(normalizeAffiliateSportLabel),
        );
        if (
          !parsedNodeScope.success
          || parsedNodeScope.data.supplySourceId !== trustedScope.supplySourceId
          || parsedNodeScope.data.intakeId !== trustedScope.intakeId
          || parsedNodeScope.data.evidenceRunId !== trustedScope.evidenceRunId
          || [...nodeScopeLabels].some((label) => !trustedScopeLabels.has(label))
        ) {
          reject('The scoped legacy repair producer ancestry changed its source scope.');
        }
      }
    } else {
      const nodeContext = recordValue(nodeSubject.repairContext);
      const parsedReviewerScope = affiliateAgentSourceSportScopeSchema.safeParse(
        nodeContext.sourceSportScope,
      );
      const reviewerScopeLabels = parsedReviewerScope.success
        ? new Set(parsedReviewerScope.data.excludedSourceLabels.map(normalizeAffiliateSportLabel))
        : new Set<string>();
      const trustedScopeLabels = new Set(
        trustedScope.excludedSourceLabels.map(normalizeAffiliateSportLabel),
      );
      if (
        nodeSubject.type !== 'SUPPLY_REVIEWER'
        || node.job.subjectId !== trustedScope.supplySourceId
        || nodeSubject.supplySourceId !== trustedScope.supplySourceId
        || node.job.parentClaimId !== nodeSubject.producerClaimId
        || nodeContext.kind !== 'LEGACY_SPORT_REPAIR'
        || nodeContext.intakeId !== trustedScope.intakeId
        || nodeContext.evidenceRunId !== trustedScope.evidenceRunId
        || !parsedReviewerScope.success
        || parsedReviewerScope.data.supplySourceId !== trustedScope.supplySourceId
        || parsedReviewerScope.data.intakeId !== trustedScope.intakeId
        || parsedReviewerScope.data.evidenceRunId !== trustedScope.evidenceRunId
        || [...reviewerScopeLabels].some((label) => !trustedScopeLabels.has(label))
        || nodeResult.disposition !== 'PRODUCER_REPAIR_REQUIRED'
      ) {
        reject('The scoped legacy repair reviewer ancestry is invalid.');
      }
      if (
        typeof nodeSubject.reviewPass !== 'number'
        || nodeSubject.reviewPass < 1
        || nodeSubject.reviewPass > 3
        || !stringValue(nodeSubject.producerClaimId)
        || !stringValue(nodeSubject.committedPackageHash)
      ) {
        reject('The scoped legacy repair reviewer ancestry is invalid.');
      }
    }
    lineageNodes.push(node);
    if (node.job.id === trustedScope.parentGatewayJobId) {
      originNode = node;
    }
    const ancestorClaimId = stringValue(node.job.parentClaimId);
    if (!ancestorClaimId) break;
    node = await loadNode(ancestorClaimId);
  }
  if (!originNode || originNode.job.role !== 'MAPPING_PRODUCER' || !originNode.subject || !originNode.result) {
    reject('The scoped legacy repair source scope has no reachable authority parent.');
  }
  const originIndex = lineageNodes.findIndex((candidate) => candidate === originNode);
  const unscopedProducer = (candidate: ScopedClaimNode): boolean => (
    candidate.job.role === 'MAPPING_PRODUCER'
    && recordValue(candidate.subject?.repairContext).sourceSportScope === undefined
  );
  if (
    originIndex < 0
    || lineageNodes.slice(0, originIndex).some(unscopedProducer)
    || !lineageNodes.slice(originIndex).some(unscopedProducer)
  ) {
    reject('The scoped legacy repair source scope does not trace to an unscoped authority ancestor.');
  }
  const originJob = originNode.job;
  const originClaim = originNode.claim;
  const originEnvelope = originNode.envelope!;
  const originSubject = originNode.subject!;
  const originResult = originNode.result!;
  const originReceipt = originNode.receipt;
  if (
    originJob.terminalDisposition !== 'CONTRACT_GAP'
    || originResult.disposition !== 'CONTRACT_GAP'
    || normalizeHash(originJob.resultHash) !== trustedScope.parentResultHash
    || originSubject.type !== 'MAPPING_PRODUCER'
  ) {
    reject('The scoped legacy repair authority parent is not the completed contract gap named by the scope.');
  }
  const originJobId = stringValue(originJob.id);
  const originPass = typeof originSubject.pass === 'number'
    ? originSubject.pass
    : null;
  if (!originJobId || originPass === null) {
    reject('The scoped legacy repair authority parent identity is invalid.');
  }
  const lineageRoot = lineageNodes[lineageNodes.length - 1];
  const lineageRootSubject = lineageRoot?.subject;
  const lineageRootClaim = lineageRoot?.claim;
  if (
    !lineageRoot
    || !lineageRootSubject
    || !lineageRootClaim
    || lineageRoot.job.role !== 'MAPPING_PRODUCER'
    || lineageRootSubject.type !== 'MAPPING_PRODUCER'
    || lineageRootSubject.pass !== 1
    || lineageRoot.job.parentClaimId !== null
    || lineageRootClaim.parentClaimId !== null
  ) {
    reject('The scoped legacy repair source scope does not terminate at the original pass-one admission.');
  }
  if (
    !gatewayIdentityMatches(
      lineageRoot.job as unknown as GatewayJobRow,
      mappingJobId,
      trustedScope.supplySourceId,
      typeof lineageRootClaim.lifecycleGeneration === 'number'
        ? lineageRootClaim.lifecycleGeneration
        : null,
      lineageRootSubject.repairContext,
      lineageRoot.job.evidenceManifestJson,
      stringValue(lineageRoot.job.dedupeKey),
      sourceListingKind,
    )
  ) {
    reject('The scoped legacy repair source scope origin admission identity is invalid.');
  }
  const originParentScope = recordValue(originSubject.repairContext).sourceSportScope;
  if (!sourceScopeTransitionValid({
    parentScopeValue: originParentScope,
    childScopeValue: trustedScope,
    parentResult: originResult,
    parentGatewayJobId: originJobId,
    parentResultHash: normalizeHash(originJob.resultHash),
    deploymentChanged: false,
    requireIntroducingDelta: true,
  })) {
    reject('The scoped legacy repair authority result does not support its source-scope transition.');
  }
  const producerLineageIds = new Set([
    childJobId,
    ...lineageNodes
      .filter((candidate) => candidate.job.role === 'MAPPING_PRODUCER')
      .map((candidate) => candidate.job.id),
  ]);
  const originAudits = [...retryHistory, ...continuationHistory].filter((audit) => (
    audit.kind === 'LEGACY_SPORT_REPAIR_RETRY'
    && audit.parentGatewayJobId === originJob.id
    && producerLineageIds.has(String(audit.childGatewayJobId ?? ''))
    && sameAdmissionValue(audit.sourceSportScope ?? null, trustedScope)
    && sameAdmissionValue(recordValue(audit.repairContext).sourceSportScope ?? null, trustedScope)
  ));
  if (originAudits.length !== 1) {
    reject('The scoped legacy repair claim has no unique source-scope origin audit.');
  }
  const originAudit = originAudits[0]!;
  const originChildId = stringValue(originAudit.childGatewayJobId);
  const originChildNode = originChildId && originChildId !== childJobId
    ? lineageNodes.find((candidate) => candidate.job.id === originChildId) ?? null
    : null;
  const originChildJob = originChildNode?.job ?? job;
  const originChildSubject = originChildNode?.subject ?? subject;
  const originChildContext = recordValue(originChildSubject.repairContext);
  const originChildDedupeKey = retryDedupeKeyFor(originJobId);
  if (
    !originChildId
    || originChildJob.id !== originChildId
    || originChildJob.dedupeKey !== originChildDedupeKey
    || originChildSubject.type !== 'MAPPING_PRODUCER'
    || originChildSubject.pass !== originPass + 1
    || originChildContext.kind !== 'LEGACY_SPORT_REPAIR'
    || originChildContext.intakeId !== trustedScope.intakeId
    || originChildContext.evidenceRunId !== trustedScope.evidenceRunId
    || !sameAdmissionValue(originChildContext.sourceSportScope ?? null, trustedScope)
  ) {
    reject('The scoped legacy repair source-scope origin child is not bound to its audit.');
  }
  const originAuditContext = recordValue(originAudit.repairContext);
  if (
    originAudit.reason !== trustedScope.reason
    || originAudit.operatorId !== trustedScope.operatorId
    || originAudit.parentGatewayJobId !== originJob.id
    || originAudit.parentClaimId !== originClaim.id
    || originAudit.parentMappingJobId !== mappingJobId
    || originAudit.parentReceiptId !== originClaim.terminalReceiptId
    || normalizeHash(originAudit.parentResultHash) !== trustedScope.parentResultHash
    || originAudit.parentDeploymentContractHash !== originClaim.deploymentContractHash
    || originAudit.rootId !== trustedScope.supplySourceId
    || originAudit.intakeId !== trustedScope.intakeId
    || originAudit.evidenceRunId !== trustedScope.evidenceRunId
    || originAudit.sourceId !== mappingJob.sourceId
    || originAudit.mappingId !== (mappingJob.mappingId ?? null)
    || !sameAdmissionValue(originAudit.sourceSportScope ?? null, trustedScope)
    || !sameAdmissionValue(originAuditContext.sourceSportScope ?? null, trustedScope)
    || originAuditContext.kind !== 'LEGACY_SPORT_REPAIR'
    || originAuditContext.intakeId !== trustedScope.intakeId
    || originAuditContext.evidenceRunId !== trustedScope.evidenceRunId
    || !originReceipt
  ) {
    reject('The scoped legacy repair source-scope origin audit is not immutable.');
  }
  const originalAdmissionEvidence = admissionEvidenceForGateway(
    mappingJob as unknown as MappingJobRow,
    trustedScope.supplySourceId,
    lineageRootSubject.repairContext,
    lineageRoot.job.evidenceManifestJson,
    stringValue(lineageRoot.job.dedupeKey) ?? '',
  );
  const originalAdmissionSelectedRow = recordValue(originalAdmissionEvidence?.selectedRow);
  const originalAdmissionSelectedWrite = recordValue(originalAdmissionEvidence?.selectedWrite);
  const originalAdmissionIntakeId = stringValue(
    originalAdmissionEvidence?.intakeId
      ?? originalAdmissionSelectedRow.intakeId
      ?? originalAdmissionSelectedWrite.intakeId,
  );
  const originalAdmissionSourceId = stringValue(
    originalAdmissionEvidence?.sourceId
      ?? originalAdmissionSelectedRow.sourceId
      ?? originalAdmissionSelectedWrite.sourceId,
  );
  const originalAdmissionMappingId = stringValue(
    originalAdmissionEvidence?.mappingId
      ?? originalAdmissionSelectedRow.mappingId
      ?? originalAdmissionSelectedWrite.mappingId,
  );
  const originalAdmissionRunId = stringValue(
    originalAdmissionEvidence?.evidenceRunId
      ?? originalAdmissionSelectedRow.evidenceRunId
      ?? originalAdmissionSelectedWrite.evidenceRunId,
  );
  if (
    !originalAdmissionEvidence
    || originalAdmissionIntakeId !== originAudit.intakeId
    || originalAdmissionSourceId !== originAudit.sourceId
    || originalAdmissionMappingId !== originAudit.mappingId
    || originalAdmissionRunId !== originAudit.evidenceRunId
  ) {
    reject('The scoped legacy repair source scope has no immutable original admission evidence.');
  }
  const originalIntakeId = originalAdmissionIntakeId;
  const originalSourceId = originalAdmissionSourceId;
  const originalMappingId = originalAdmissionMappingId;
  const originalRunId = originalAdmissionRunId;
  const originalArtifactRefs = stringArrayValue(originalAdmissionEvidence.artifactIds);
  if (
    !originalIntakeId
    || !originalSourceId
    || !originalMappingId
    || !originalRunId
    || !originalArtifactRefs
    || originalArtifactRefs.some((artifactId) => !artifactId.startsWith('intake-artifact:'))
  ) {
    reject('The scoped legacy repair source scope original admission identity is incomplete.');
  }
  const originalArtifactIds = originalArtifactRefs.map((artifactId) => artifactId.slice('intake-artifact:'.length));
  const [
    originalIntakeRows,
    originalSourceRows,
    originalMappingRows,
    originalRunRows,
    originalArtifactRows,
    originalRootRows,
  ] = await Promise.all([
    input.prisma.affiliateSourceIntakes.findMany({
      where: { id: { in: [originalIntakeId] } },
    }),
    input.prisma.affiliateScrapeSources.findMany({
      where: { id: { in: [originalSourceId] } },
    }),
    input.prisma.affiliateScrapeMappings.findMany({
      where: { id: { in: [originalMappingId] } },
    }),
    input.prisma.affiliateSourceIntakeRuns.findMany({
      where: { id: { in: [originalRunId] } },
    }),
    input.prisma.affiliateSourceIntakeArtifacts.findMany({
      where: { id: { in: originalArtifactIds } },
    }),
    input.prisma.affiliateSupplySources.findMany({
      where: { id: { in: [trustedScope.supplySourceId] } },
    }),
  ]);
  const originalIntake = (originalIntakeRows as unknown as IntakeRow[]).find(
    (candidate) => candidate.id === originalIntakeId,
  );
  const originalSource = (originalSourceRows as unknown as SourceRow[]).find(
    (candidate) => candidate.id === originalSourceId,
  );
  const originalMapping = (originalMappingRows as unknown as MappingRow[]).find(
    (candidate) => candidate.id === originalMappingId,
  );
  const originalRun = (originalRunRows as unknown as CaptureRunRow[]).find(
    (candidate) => candidate.id === originalRunId,
  );
  const originalArtifacts = (originalArtifactRows as unknown as ArtifactRow[])
    .filter((candidate) => originalArtifactIds.includes(candidate.id));
  const originalRoot = (originalRootRows as unknown as SupplyRootRow[]).find(
    (candidate) => candidate.id === trustedScope.supplySourceId,
  );
  if (
    !originalIntake
    || !originalSource
    || !originalMapping
    || !originalRun
    || !originalRoot
    || originalArtifacts.length !== originalArtifactIds.length
  ) {
    reject('The scoped legacy repair source scope original admission records are incomplete.');
  }
  if (
    !lineageRoot.receipt
    || !lineageRoot.envelope
    || !lineageRoot.subject
    || !lineageRoot.result
    || !productionAdmissionEvidenceMatches({
      entry: originalAdmissionEvidence,
      mappingJob: mappingJob as unknown as MappingJobRow,
      intake: originalIntake,
      source: originalSource,
      mapping: originalMapping,
      root: originalRoot,
      run: originalRun,
      artifacts: originalArtifacts,
      ancestor: {
        gatewayJob: lineageRoot.job as unknown as GatewayJobRow,
        claim: lineageRoot.claim as unknown as RetryGatewayClaimRow,
        receipt: lineageRoot.receipt as unknown as RetryGatewayReceiptRow,
        envelope: lineageRoot.envelope as unknown as AffiliateAgentProducerClaimEnvelopeForHistoricalRead,
        subject: lineageRoot.subject as unknown as LegacyRetryProducerSubject,
        result: lineageRoot.result as unknown as AffiliateAgentTerminalResultEnvelope,
      },
      manifest: recordValue(lineageRoot.job.evidenceManifestJson),
      expectedRootLifecycleGeneration: typeof lineageRootClaim.lifecycleGeneration === 'number'
        ? lineageRootClaim.lifecycleGeneration
        : undefined,
    })
  ) {
    reject('The scoped legacy repair source scope original admission evidence is invalid.');
  }
  const report = recordValue(originAudit.reportSnapshot);
  const reportCounts = recordValue(report.counts);
  const reportHash = normalizeHash(report.reportHash);
  const auditReportHash = normalizeHash(originAudit.reportHash);
  let recomputedReportHash: string | null = null;
  try {
    recomputedReportHash = retryReportHashFor(
      report as unknown as AffiliateLegacyRepairRetryReport,
    );
  } catch {
    recomputedReportHash = null;
  }
  const reportRows = Array.isArray(report.rows) ? report.rows.map(recordValue) : [];
  const reportWrites = Array.isArray(report.proposedWrites)
    ? report.proposedWrites.map(recordValue)
    : [];
  const reportRow = reportRows.find((row) => row.gatewayJobId === originJob.id);
  const reportWrite = reportWrites.find((write) => write.gatewayJobId === originJob.id);
  const requestedGatewayJobIds = stringArrayValue(report.requestedGatewayJobIds);
  const selectedGatewayJobIds = stringArrayValue(report.selectedGatewayJobIds);
  const appliedGatewayJobIds = stringArrayValue(report.appliedGatewayJobIds);
  const reportValid = report.schemaVersion === AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION
    && report.mode === 'APPLY'
    && report.reviewedReportHash === reportHash
    && report.writeCount === 1
    && reportCounts.total === 1
    && reportCounts.eligible === 1
    && reportCounts.held === 0
    && reportCounts.selected === 1
    && reportCounts.alreadyRetried === 0
    && reportRow?.gatewayJobId === originJob.id
    && reportRow?.parentPass === originPass
    && reportRow?.eligible === true
    && reportRow?.alreadyRetried === false
    && reportRow?.outcome === 'APPLIED'
    && reportRow?.childGatewayJobId === originChildId
    && reportWrite?.gatewayJobId === originJob.id
    && reportWrite?.parentPass === originPass
    && reportWrite?.gatewayDedupeKey === originChildDedupeKey
    && originAudit.childDedupeKey === originChildDedupeKey;
  if (
    !reportHash
    || reportHash !== auditReportHash
    || recomputedReportHash !== reportHash
    || !reportValid
    || report.replayed !== false
    || report.reason !== trustedScope.reason
    || report.contractVersion !== originEnvelope.supplyContractVersion
    || report.contractHash !== originEnvelope.supplyContractHash
    || originAudit.currentDeploymentContractVersion !== report.deploymentContractVersion
    || originAudit.currentDeploymentContractHash !== report.deploymentContractHash
    || !requestedGatewayJobIds
    || !sameAdmissionValue(requestedGatewayJobIds, [originJob.id])
    || !selectedGatewayJobIds
    || !sameAdmissionValue(selectedGatewayJobIds, [originJob.id])
    || !appliedGatewayJobIds
    || !sameAdmissionValue(appliedGatewayJobIds, [originChildId])
    || reportRows.length !== 1
    || reportWrites.length !== 1
    || !reportRow
    || !reportWrite
    || !sameAdmissionValue(reportRow.sourceSportScope ?? null, trustedScope)
    || !sameAdmissionValue(reportWrite.sourceSportScope ?? null, trustedScope)
    || !sameRepairContext(reportWrite.repairContext, originAuditContext)
    || !sameAdmissionValue(reportWrite.manifest, originAudit.manifest)
    || !sameAdmissionValue(originAudit.manifest, originChildJob.evidenceManifestJson)
  ) {
    reject('The scoped legacy repair source-scope report is not bound to its origin audit.');
  }
  const edgeAuditMatchesChild = (
    parentNode: ScopedClaimNode,
    childJob: JsonRecord,
    childSubject: JsonRecord,
  ): boolean => {
    if (!parentNode.subject || !parentNode.receipt) return false;
    const parentId = stringValue(parentNode.job.id);
    const childId = stringValue(childJob.id);
    const childDedupeKey = stringValue(childJob.dedupeKey);
    if (!parentId || !childId || !childDedupeKey) return false;
    const continuation = childDedupeKey.startsWith(AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX);
    const retry = childDedupeKey.startsWith('legacy-sport-repair-retry:');
    if (
      (continuation || retry)
      && (
        parentNode.job.terminalDisposition !== 'CONTRACT_GAP'
        || parentNode.result?.disposition !== 'CONTRACT_GAP'
      )
    ) return false;
    if (!continuation && !retry) return false;
    const edgeAudits = (continuation ? continuationHistory : retryHistory).filter((audit) => (
      audit.parentGatewayJobId === parentId
      && audit.childGatewayJobId === childId
    ));
    if (edgeAudits.length !== 1) return false;
    const audit = edgeAudits[0]!;
    const report = recordValue(audit.reportSnapshot);
    const reportRows = Array.isArray(report.rows) ? report.rows.map(recordValue) : [];
    const reportWrites = Array.isArray(report.proposedWrites)
      ? report.proposedWrites.map(recordValue)
      : [];
    const reportRow = reportRows.find((row) => row.gatewayJobId === parentId);
    const reportWrite = reportWrites.find((write) => write.gatewayJobId === parentId);
    const reportHash = normalizeHash(report.reportHash);
    const auditReportHash = normalizeHash(audit.reportHash);
    const requestedGatewayJobIds = stringArrayValue(report.requestedGatewayJobIds);
    const selectedGatewayJobIds = stringArrayValue(report.selectedGatewayJobIds);
    const appliedGatewayJobIds = stringArrayValue(report.appliedGatewayJobIds);
    const reportCounts = recordValue(report.counts);
    let recomputedReportHash: string | null = null;
    try {
      recomputedReportHash = continuation
        ? continuationReportHashFor(
          report as unknown as AffiliateLegacyRepairContinuationReport,
        )
        : retryReportHashFor(report as unknown as AffiliateLegacyRepairRetryReport);
    } catch {
      recomputedReportHash = null;
    }
    const parentSubject = parentNode.subject;
    const childContext = recordValue(childSubject.repairContext);
    const auditContext = recordValue(audit.repairContext);
    const reportWriteContext = recordValue(reportWrite?.repairContext);
    const edgeScope = childContext.sourceSportScope;
    const parentScopeValue = recordValue(parentSubject.repairContext).sourceSportScope;
    const scopedEdge = edgeScope !== undefined || parentScopeValue !== undefined;
    const auditDeploymentVersion = audit.currentDeploymentContractVersion;
    const auditDeploymentHash = normalizeHash(audit.currentDeploymentContractHash);
    const reportDeploymentVersion = report.deploymentContractVersion;
    const reportDeploymentHash = normalizeHash(report.deploymentContractHash);
    const auditDeploymentBindingValid = scopedEdge
      ? auditDeploymentVersion !== undefined
        && auditDeploymentHash !== null
        && auditDeploymentVersion === reportDeploymentVersion
        && auditDeploymentHash === reportDeploymentHash
      : (
        (auditDeploymentVersion === undefined && audit.currentDeploymentContractHash === undefined)
        || (
          auditDeploymentVersion !== undefined
          && audit.currentDeploymentContractHash !== undefined
          && auditDeploymentVersion === reportDeploymentVersion
          && auditDeploymentHash === reportDeploymentHash
        )
      );
    const reportRowGatewayJobIds = reportRows.map((row) => row.gatewayJobId);
    const reportWriteGatewayJobIds = reportWrites.map((write) => write.gatewayJobId);
    const reportChildGatewayJobIds = reportRows.map((row) => row.childGatewayJobId);
    const reportBatchSize = requestedGatewayJobIds?.length ?? 0;
    const reportBatchShapeValid = requestedGatewayJobIds !== null
      && selectedGatewayJobIds !== null
      && appliedGatewayJobIds !== null
      && sameAdmissionValue(requestedGatewayJobIds, selectedGatewayJobIds)
      && sameAdmissionValue(requestedGatewayJobIds, reportRowGatewayJobIds)
      && sameAdmissionValue(requestedGatewayJobIds, reportWriteGatewayJobIds)
      && (!scopedEdge || reportBatchSize === 1)
      && reportRows.length === reportBatchSize
      && reportWrites.length === reportBatchSize
      && reportCounts.total === reportBatchSize
      && reportCounts.eligible === reportBatchSize
      && reportCounts.held === 0
      && reportCounts.selected === reportBatchSize
      && report.writeCount === reportBatchSize
      && appliedGatewayJobIds.length === reportBatchSize
      && sameAdmissionValue(appliedGatewayJobIds, reportChildGatewayJobIds)
      && reportRows.every((row) => (
        row.eligible === true
        && (continuation ? row.alreadyContinued === false : row.alreadyRetried === false)
        && row.outcome === 'APPLIED'
        && typeof row.childGatewayJobId === 'string'
      ))
      && (continuation
        ? reportCounts.alreadyContinued === 0
        : reportCounts.alreadyRetried === 0);
    const reportShapeValid = report.mode === 'APPLY'
      && reportHash !== null
      && reportHash === auditReportHash
      && recomputedReportHash === reportHash
      && report.reviewedReportHash === reportHash
      && report.replayed === false
      && reportBatchShapeValid
      && (continuation
        ? reportWrite?.producerDedupeKey === childDedupeKey
        : reportWrite?.gatewayDedupeKey === childDedupeKey)
      && reportRow?.gatewayJobId === parentId
      && reportRow?.childGatewayJobId === childId
      && reportWrite?.gatewayJobId === parentId
      && (continuation
        ? reportWrite?.producerDedupeKey === childDedupeKey
        : reportWrite?.gatewayDedupeKey === childDedupeKey)
      && sameAdmissionValue(reportRow?.sourceSportScope ?? null, edgeScope ?? null)
      && sameAdmissionValue(reportWrite?.sourceSportScope ?? null, edgeScope ?? null)
      && sameRepairContext(reportWriteContext, auditContext)
      && sameAdmissionValue(reportWrite?.manifest, audit.manifest)
      && sameAdmissionValue(auditContext.sourceSportScope ?? null, edgeScope ?? null)
      && sameAdmissionValue(audit.sourceSportScope ?? null, edgeScope ?? null)
      && stringValue(audit.operatorId) !== null
      && audit.reason === report.reason
      && report.contractVersion === parentNode.claim.supplyContractVersion
      && report.contractHash === parentNode.claim.supplyContractHash
      && auditDeploymentBindingValid
      && audit.parentGatewayJobId === parentId
      && audit.parentClaimId === parentNode.claim.id
      && audit.parentMappingJobId === mappingJobId
      && audit.parentReceiptId === parentNode.receipt.id
      && audit.parentResultHash === parentNode.job.resultHash
      && audit.parentDeploymentContractHash === parentNode.claim.deploymentContractHash
      && audit.childGatewayJobId === childId
      && audit.intakeId === mappingJob.intakeId
      && audit.sourceId === mappingJob.sourceId
      && audit.mappingId === (mappingJob.mappingId ?? null)
      && audit.rootId === childSubject.supplySourceId
      && audit.evidenceRunId === childContext.evidenceRunId
      && sameRetryLineageContext(auditContext, parentSubject.repairContext)
      && sameRepairContext(auditContext, childSubject.repairContext)
      && sameAdmissionValue(audit.manifest, parentNode.job.evidenceManifestJson)
      && sameAdmissionValue(audit.manifest, childJob.evidenceManifestJson)
      && childJob.role === 'MAPPING_PRODUCER'
      && childContext.intakeId === trustedScope.intakeId
      && childContext.evidenceRunId === trustedScope.evidenceRunId;
    if (!reportShapeValid) return false;
    const deploymentChanged = (
      report.deploymentContractVersion !== parentNode.claim.deploymentContractVersion
      && report.deploymentContractHash !== parentNode.claim.deploymentContractHash
    );
    if (scopedEdge) {
      if (!sourceScopeTransitionValid({
        parentScopeValue,
        childScopeValue: edgeScope,
        parentResult: parentNode.result,
        parentGatewayJobId: stringValue(parentNode.job.id),
        parentResultHash: normalizeHash(parentNode.job.resultHash),
        auditOperatorId: stringValue(audit.operatorId),
        auditReason: stringValue(audit.reason),
        deploymentChanged,
      })) return false;
    }
    if (!scopedEdge && !deploymentChanged) return false;
    if (continuation) {
      return audit.operation === 'LEGACY_SPORT_REPAIR_CONTINUATION'
        && audit.kind === 'LEGACY_SPORT_REPAIR_CONTINUATION'
        && report.operation === 'LEGACY_SPORT_REPAIR_CONTINUATION'
        && report.schemaVersion === AFFILIATE_LEGACY_REPAIR_CONTINUATION_SCHEMA_VERSION
        && audit.schemaVersion === report.schemaVersion
        && report.gatewayJobId === parentId
        && parentSubject.pass === 3
        && childSubject.pass === 3
        && report.parentPass === 3
        && report.continuationPass === 3
        && reportRow?.parentPass === 3
        && reportRow?.continuationPass === 3
        && reportWrite?.parentPass === 3
        && reportWrite?.continuationPass === 3
        && audit.parentPass === 3
        && audit.continuationPass === 3
        && audit.producerDedupeKey === childDedupeKey;
    }
    return audit.kind === 'LEGACY_SPORT_REPAIR_RETRY'
      && (
        scopedEdge
          ? report.schemaVersion === AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION
          : report.schemaVersion === 1
            || report.schemaVersion === AFFILIATE_LEGACY_REPAIR_RETRY_SCHEMA_VERSION
      )
      && audit.schemaVersion === report.schemaVersion
      && typeof parentSubject.pass === 'number'
      && typeof childSubject.pass === 'number'
      && childSubject.pass === parentSubject.pass + 1
      && reportRow?.parentPass === parentSubject.pass
      && reportRow?.retryPass === childSubject.pass
      && reportWrite?.parentPass === parentSubject.pass
      && reportWrite?.retryPass === childSubject.pass
      && audit.parentPass === parentSubject.pass
      && audit.retryPass === childSubject.pass
      && audit.childDedupeKey === childDedupeKey;
  };
  const producerEdges: Array<{
    parentNode: ScopedClaimNode;
    childJob: JsonRecord;
    childSubject: JsonRecord;
  }> = [
    {
      parentNode: immediateNode,
      childJob: job,
      childSubject: subject,
    },
    ...lineageNodes.flatMap((candidate, index) => {
      const parentNode = lineageNodes[index + 1];
      if (
        candidate.job.role !== 'MAPPING_PRODUCER'
        || !parentNode
      ) return [];
      return [{
        parentNode,
        childJob: candidate.job,
        childSubject: candidate.subject!,
      }];
    }),
  ];
  for (const edge of producerEdges) {
    if (
      edge.parentNode.job.role === 'MAPPING_PRODUCER'
      && !edgeAuditMatchesChild(edge.parentNode, edge.childJob, edge.childSubject)
    ) {
      reject(`The scoped legacy repair producer edge is not bound to its creation audit: ${JSON.stringify({
        parentId: edge.parentNode.job.id,
        parentClaimId: edge.parentNode.claim.id,
        childId: edge.childJob.id,
        childParentClaimId: edge.childJob.parentClaimId,
        childDedupeKey: edge.childJob.dedupeKey,
        parentScope: recordValue(edge.parentNode.subject?.repairContext).sourceSportScope,
        childScope: recordValue(edge.childSubject.repairContext).sourceSportScope,
        parentDisposition: edge.parentNode.job.terminalDisposition,
        resultDisposition: edge.parentNode.result?.disposition,
      })}`);
    }
  }
  const reviewerProducerIdentityValid = (
    reviewerNode: ScopedClaimNode,
    childJob: JsonRecord,
    reviewerSubject: JsonRecord,
  ): boolean => {
    const producerNode = lineageNodes.find((candidate) => (
      candidate.job.role === 'MAPPING_PRODUCER'
      && candidate.claim.id === reviewerSubject.producerClaimId
    ));
    const producerSubject = producerNode?.subject;
    const producerClaim = producerNode?.claim;
    const producerJob = producerNode?.job;
    const producerResult = producerNode?.result;
    const producerEnvelope = producerNode?.envelope;
    const producerResultPayload = recordValue(producerResult?.payload);
    const committedPackageHash = producerResult
      && (
        producerResult.disposition === 'PACKAGE_COMMITTED'
        || producerResult.disposition === 'BOUNDED_REPAIR_SUBMITTED'
      )
      ? stringValue(producerResultPayload.packageHash)
      : null;
    return (
      producerNode !== undefined
      && producerSubject !== null
      && producerSubject !== undefined
      && producerClaim !== undefined
      && producerJob !== undefined
      && producerResult !== null
      && producerResult !== undefined
      && producerEnvelope !== null
      && producerEnvelope !== undefined
      && producerSubject.type === 'MAPPING_PRODUCER'
      && producerSubject.supplySourceId === reviewerSubject.supplySourceId
      && sameRepairContext(producerSubject.repairContext, reviewerSubject.repairContext)
      && reviewerNode.job.parentClaimId === reviewerSubject.producerClaimId
      && childJob.parentClaimId === reviewerNode.claim.id
      && producerClaim.status === 'COMPLETED'
      && producerClaim.role === 'MAPPING_PRODUCER'
      && producerClaim.terminalReceiptId !== null
      && producerJob.status === 'COMPLETED'
      && producerJob.activeClaimId === null
      && producerJob.terminalReceiptId === producerClaim.terminalReceiptId
      && normalizeHash(hashAffiliateAgentValue(producerEnvelope))
        === normalizeHash(producerClaim.claimEnvelopeHash)
      && producerClaim.workerId === reviewerSubject.producerWorkerId
      && producerClaim.invocationId === reviewerSubject.producerInvocationId
      && producerClaim.workspaceId === reviewerSubject.producerWorkspaceId
      && producerResult.jobId === producerJob.id
      && producerResult.claimId === producerClaim.id
      && producerResult.claimGeneration === producerClaim.claimGeneration
      && producerResult.role === 'MAPPING_PRODUCER'
      && committedPackageHash === reviewerSubject.committedPackageHash
    );
  };
  const historicalReviewerEdgeValid = (
    reviewerNode: ScopedClaimNode,
    childJob: JsonRecord,
    childSubject: JsonRecord,
  ): boolean => {
    const reviewerSubject = reviewerNode.subject;
    const childDedupeKey = stringValue(childJob.dedupeKey);
    if (
      reviewerNode.job.role !== 'SUPPLY_REVIEWER'
      || !reviewerSubject
      || !reviewerNode.envelope
      || childJob.role !== 'MAPPING_PRODUCER'
      || childSubject.type !== 'MAPPING_PRODUCER'
      || childSubject.mappingJobId !== mappingJobId
      || childSubject.supplySourceId !== trustedScope.supplySourceId
      || !sameRepairContext(childSubject.repairContext, reviewerSubject.repairContext)
    ) return false;
    const reviewerRepairPass = Number(reviewerSubject.reviewPass) + 1;
    if (
      childSubject.pass !== reviewerRepairPass
      || childDedupeKey !== [
        'mapping-repair',
        reviewerSubject.producerClaimId,
        reviewerSubject.committedPackageHash,
        reviewerRepairPass,
      ].join(':')
    ) return false;
    if (!reviewerProducerIdentityValid(reviewerNode, childJob, reviewerSubject)) {
      return false;
    }
    const producerNode = lineageNodes.find((candidate) => (
      candidate.job.role === 'MAPPING_PRODUCER'
      && candidate.claim.id === reviewerSubject.producerClaimId
    ));
    const producerManifest = producerNode?.envelope
      ? affiliateAgentEvidenceManifestSchema.safeParse(
        producerNode.envelope.evidenceManifest,
      )
      : null;
    const reviewerManifest = affiliateAgentEvidenceManifestSchema.safeParse(
      reviewerNode.envelope.evidenceManifest,
    );
    if (
      !producerManifest
      || !producerManifest.success
      || !reviewerManifest.success
    ) return false;
    const entriesByRef = new Map<string, JsonRecord>();
    for (const entry of [
      ...producerManifest.data.entries,
      ...reviewerManifest.data.entries,
    ]) {
      const prior = entriesByRef.get(entry.evidenceRef);
      if (prior && !sameAdmissionValue(prior, entry)) return false;
      entriesByRef.set(entry.evidenceRef, entry);
    }
    const preimage = {
      schemaVersion: 1 as const,
      entries: [...entriesByRef.values()].sort(
        (left, right) => String(left.evidenceRef).localeCompare(String(right.evidenceRef)),
      ),
    };
    const expectedManifest = affiliateAgentEvidenceManifestSchema.safeParse({
      ...preimage,
      hash: hashAffiliateAgentValue(preimage),
    });
    return expectedManifest.success
      && sameAdmissionValue(childJob.evidenceManifestJson, expectedManifest.data);
  };
  for (let index = 0; index + 1 < lineageNodes.length; index += 1) {
    const childNode = lineageNodes[index]!;
    const parentNode = lineageNodes[index + 1]!;
    if (
      childNode.job.role === 'MAPPING_PRODUCER'
      && parentNode.job.role === 'SUPPLY_REVIEWER'
      && !historicalReviewerEdgeValid(parentNode, childNode.job, childNode.subject!)
    ) {
      reject('The scoped legacy repair historical reviewer edge is not bound to its creation contract.');
    }
  }
  const immediateParentSubject = immediateNode.subject;
  if (!immediateParentSubject) {
    reject('The scoped legacy repair immediate parent subject is missing.');
  }
  const immediateParentRole = immediateNode.job.role;
  const immediateNodeJobId = stringValue(immediateNode.job.id);
  if (!immediateNodeJobId) {
    reject('The scoped legacy repair immediate parent identity is invalid.');
  }
  const currentDedupeKey = String(job.dedupeKey ?? '');
  const reviewerRepairPass = Number(immediateParentSubject?.reviewPass) + 1;
  const currentDedupeValid = immediateParentRole === 'SUPPLY_REVIEWER'
    ? immediateParentSubject?.type === 'SUPPLY_REVIEWER'
      && subject.pass === reviewerRepairPass
      && currentDedupeKey === [
        'mapping-repair',
        immediateParentSubject.producerClaimId,
        immediateParentSubject.committedPackageHash,
        reviewerRepairPass,
      ].join(':')
    : immediateParentRole === 'MAPPING_PRODUCER'
      ? (
        currentDedupeKey === retryDedupeKeyFor(immediateNodeJobId)
        && subject.pass === Number(immediateParentSubject?.pass) + 1
      ) || (
        currentDedupeKey === `${AFFILIATE_AGENT_CONTINUATION_PRODUCER_PREFIX}${trustedScope.supplySourceId}`
        && subject.pass === 3
      )
      : false;
  if (immediateParentRole === 'SUPPLY_REVIEWER') {
    if (!sameRepairContext(repairContext, immediateParentSubject.repairContext)) {
      reject('The scoped legacy repair reviewer child context is not immutable.');
    }
    if (!reviewerProducerIdentityValid(immediateNode, job, immediateParentSubject)) {
      reject('The scoped legacy repair reviewer producer identity is not immutable.');
    }
    const producerNode = lineageNodes.find((candidate) => (
      candidate.job.role === 'MAPPING_PRODUCER'
      && candidate.claim.id === immediateParentSubject?.producerClaimId
    ));
    const producerManifest = producerNode?.envelope
      ? affiliateAgentEvidenceManifestSchema.safeParse(
        producerNode.envelope.evidenceManifest,
      )
      : null;
    const reviewerManifest = immediateNode.envelope
      ? affiliateAgentEvidenceManifestSchema.safeParse(
        immediateNode.envelope.evidenceManifest,
      )
      : null;
    if (
      !producerManifest
      || !producerManifest.success
      || !reviewerManifest
      || !reviewerManifest.success
    ) {
      reject('The scoped legacy repair reviewer evidence manifest is invalid.');
    }
    const entriesByRef = new Map<string, JsonRecord>();
    for (const entry of [
      ...producerManifest.data.entries,
      ...reviewerManifest.data.entries,
    ]) {
      const prior = entriesByRef.get(entry.evidenceRef);
      if (prior && !sameAdmissionValue(prior, entry)) {
        reject('The scoped legacy repair reviewer evidence references conflict.');
      }
      entriesByRef.set(entry.evidenceRef, entry);
    }
    const preimage = {
      schemaVersion: 1 as const,
      entries: [...entriesByRef.values()].sort(
        (left, right) => String(left.evidenceRef).localeCompare(String(right.evidenceRef)),
      ),
    };
    const expectedManifest = affiliateAgentEvidenceManifestSchema.safeParse({
      ...preimage,
      hash: hashAffiliateAgentValue(preimage),
    });
    if (
      !expectedManifest.success
      || !sameAdmissionValue(job.evidenceManifestJson, expectedManifest.data)
    ) {
      reject('The scoped legacy repair reviewer evidence manifest is not derived from its lineage.');
    }
  }
  if (!currentDedupeValid) {
    reject('The scoped legacy repair child dedupe key is not bound to its immediate parent.');
  }
};
export const previewAffiliateLegacyRepairRetry = async (
  input: PreviewAffiliateLegacyRepairRetryInput,
): Promise<AffiliateLegacyRepairRetryPreview> => {
  const bundle = parseBundle(input.bundle);
  const gatewayJobIds = retryGatewayJobIds(input.gatewayJobIds);
  const excludedSourceLabels = retryExcludedSourceLabels(input.excludedSourceLabels);
  const scopeRequest = retryScopeRequestFor(
    gatewayJobIds,
    excludedSourceLabels,
    retryScopeOperatorId(input.operatorId),
  );
  const reasonText = retryReason(input.reason);
  const { report } = await buildRetryReport(
    input.prisma,
    bundle,
    gatewayJobIds,
    reasonText,
    'PREVIEW',
    input.artifactStore,
    scopeRequest,
  );
  return report as AffiliateLegacyRepairRetryPreview;
};
export const applyAffiliateLegacyRepairRetry = async (
  input: ApplyAffiliateLegacyRepairRetryInput,
): Promise<AffiliateLegacyRepairRetryApplyReport> => {
  const bundle = parseBundle(input.bundle);
  const gatewayJobIds = retryGatewayJobIds(input.gatewayJobIds);
  const excludedSourceLabels = retryExcludedSourceLabels(input.excludedSourceLabels);
  const reasonText = retryReason(input.reason);
  const operatorId = stringValue(input.operatorId);
  if (!operatorId) {
    throw new AffiliateLegacyRepairAdmissionError(
      'OPERATOR_REQUIRED',
      'operatorId is required for retry apply.',
    );
  }
  const scopeRequest = retryScopeRequestFor(
    gatewayJobIds,
    excludedSourceLabels,
    operatorId,
  );
  const expectedReportHash = normalizeHash(input.expectedReportHash);
  if (!expectedReportHash) {
    throw new AffiliateLegacyRepairAdmissionError(
      'REPORT_HASH_REQUIRED',
      'expectedReportHash must be a SHA-256 hash.',
    );
  }
  return withSerializableTransaction(input.prisma, async (transaction) => {
    await assertActiveContract(transaction, bundle);
    const retrySnapshot = await readRetrySnapshot(transaction, gatewayJobIds);
    assertRetryScopeParentCount(retrySnapshot, gatewayJobIds, scopeRequest);
    if (
      retrySnapshot.admission.gatewayClaims.some((claim) => normalizedUpper(claim.status) === 'ACTIVE')
      || retrySnapshot.gatewayClaims.some((claim) => normalizedUpper(claim.status) === 'ACTIVE')
      || retrySnapshot.admission.gatewayJobs.some((gatewayJob) => gatewayJob.activeClaimId !== null)
      || retrySnapshot.gatewayJobs.some((gatewayJob) => gatewayJob.activeClaimId !== null)
    ) {
      throw new AffiliateLegacyRepairAdmissionError(
        'CLAIM_DRIFT',
        'An active gateway claim exists; legacy sport repair retry is paused.',
      );
    }
    const replay = await retryReplayReport(
      retrySnapshot,
      bundle,
      gatewayJobIds,
      reasonText,
      expectedReportHash,
      operatorId,
      scopeRequest,
      input.artifactStore,
    );
    if (replay) return replay;
    const current = await buildRetryReport(
      transaction,
      bundle,
      gatewayJobIds,
      reasonText,
      'APPLY',
      input.artifactStore,
      scopeRequest,
    );
    if (current.report.reportHash !== expectedReportHash) {
      throw new AffiliateLegacyRepairAdmissionError(

        'ADMISSION_REPORT_DRIFT',
        'The reviewed retry report no longer matches current identity, evidence, state, or contract.',
        { expectedReportHash, observedReportHash: current.report.reportHash },
      );
    }
    if (current.plans.length !== gatewayJobIds.length) {
      throw new AffiliateLegacyRepairAdmissionError(
        'RETRY_SCOPE_NOT_ELIGIBLE',
        'Every requested parent Gateway job must be eligible; no retry writes were made.',
        {
          requestedGatewayJobIds: gatewayJobIds,
          heldGatewayJobIds: current.report.rows
            .filter((row) => !row.eligible)
            .map((row) => row.gatewayJobId),
        },
      );
    }
    const childGatewayJobIds = current.plans.map(() => createId());
    const childGatewayJobIdsByParent = new Map(
      current.plans.map((plan, index) => [plan.write.gatewayJobId, childGatewayJobIds[index]] as const),
    );
    const appliedReport: AffiliateLegacyRepairRetryApplyReport = {
      ...current.report,
      mode: 'APPLY',
      reviewedReportHash: expectedReportHash,
      appliedGatewayJobIds: childGatewayJobIds,
      replayed: false,
      rows: current.report.rows.map((row) => {
        const childGatewayJobId = childGatewayJobIdsByParent.get(row.gatewayJobId);
        return childGatewayJobId
          ? { ...row, childGatewayJobId, outcome: 'APPLIED' as const }
          : row;
      }),
    };
    for (let index = 0; index < current.plans.length; index += 1) {
      await applyRetryPlan(
        transaction,
        current.plans[index],
        appliedReport,
        expectedReportHash,
        reasonText,
        operatorId,
        gatewayJobIds,
        childGatewayJobIds[index],
      );
    }
    return appliedReport;
  });
};
export const previewAffiliateLegacyRepairContinuation = async (
  input: PreviewAffiliateLegacyRepairContinuationInput,
): Promise<AffiliateLegacyRepairContinuationPreview> => {
  const bundle = parseBundle(input.bundle);
  const gatewayJobId = continuationGatewayJobId(input.gatewayJobId);
  const reasonText = continuationReason(input.reason);
  const { report } = await buildContinuationReport(
    input.prisma,
    bundle,
    gatewayJobId,
    reasonText,
    'PREVIEW',
    input.artifactStore,
  );
  return report as AffiliateLegacyRepairContinuationPreview;
};

export const applyAffiliateLegacyRepairContinuation = async (
  input: ApplyAffiliateLegacyRepairContinuationInput,
): Promise<AffiliateLegacyRepairContinuationApplyReport> => {
  const bundle = parseBundle(input.bundle);
  const gatewayJobId = continuationGatewayJobId(input.gatewayJobId);
  const reasonText = continuationReason(input.reason);
  const operatorId = stringValue(input.operatorId);
  if (!operatorId) {
    throw new AffiliateLegacyRepairAdmissionError(
      'OPERATOR_REQUIRED',
      'operatorId is required for continuation apply.',
    );
  }
  const expectedReportHash = normalizeHash(input.expectedReportHash);
  if (!expectedReportHash) {
    throw new AffiliateLegacyRepairAdmissionError(
      'REPORT_HASH_REQUIRED',
      'expectedReportHash must be a SHA-256 hash.',
    );
  }
  return withSerializableTransaction(input.prisma, async (transaction) => {
    await assertActiveContract(transaction, bundle);
    const continuationSnapshot = await readContinuationSnapshot(transaction, gatewayJobId);
    if (
      continuationSnapshot.admission.gatewayClaims.some((claim) => normalizedUpper(claim.status) === 'ACTIVE')
      || continuationSnapshot.gatewayClaims.some((claim) => normalizedUpper(claim.status) === 'ACTIVE')
      || continuationSnapshot.admission.gatewayJobs.some((gatewayJob) => gatewayJob.activeClaimId !== null)
      || continuationSnapshot.gatewayJobs.some((gatewayJob) => gatewayJob.activeClaimId !== null)
    ) {
      throw new AffiliateLegacyRepairAdmissionError(
        'CLAIM_DRIFT',
        'An active gateway claim exists; legacy sport repair continuation is paused.',
      );
    }
    const replay = await continuationReplayReport(
      continuationSnapshot,
      bundle,
      gatewayJobId,
      reasonText,
      expectedReportHash,
      operatorId,
      input.artifactStore,
    );
    if (replay) return replay;
    const current = await buildContinuationReport(
      transaction,
      bundle,
      gatewayJobId,
      reasonText,
      'APPLY',
      input.artifactStore,
    );
    if (current.report.reportHash !== expectedReportHash) {
      throw new AffiliateLegacyRepairAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The reviewed continuation report no longer matches current identity, evidence, state, or contract.',
        { expectedReportHash, observedReportHash: current.report.reportHash },
      );
    }
    if (current.plans.length !== 1) {
      throw new AffiliateLegacyRepairAdmissionError(
        'CONTINUATION_SCOPE_NOT_ELIGIBLE',
        'The requested parent Gateway job is not eligible for continuation; no continuation writes were made.',
        {
          requestedGatewayJobId: gatewayJobId,
          reasonCodes: current.report.row.reasonCodes,
        },
      );
    }
    const childGatewayJobId = createId();
    const appliedRow = {
      ...current.report.row,
      childGatewayJobId,
      outcome: 'APPLIED' as const,
    };
    const appliedReport: AffiliateLegacyRepairContinuationApplyReport = {
      ...current.report,
      mode: 'APPLY',
      row: appliedRow,
      rows: [appliedRow],
      childGatewayJobId,
      reviewedReportHash: expectedReportHash,
      writeCount: 1,
      appliedGatewayJobIds: [childGatewayJobId],
      replayed: false,
    };
    await applyContinuationPlan(
      transaction,
      current.plans[0],
      appliedReport,
      expectedReportHash,
      reasonText,
      operatorId,
      childGatewayJobId,
    );
    return appliedReport;
  });
};

export const calculateAffiliateLegacyRepairContinuationReportHash = (
  report: Pick<
    AffiliateLegacyRepairContinuationReport,
    | 'schemaVersion'
    | 'contractVersion'
    | 'contractHash'
    | 'deploymentContractVersion'
    | 'deploymentContractHash'
    | 'reason'
    | 'gatewayJobId'
    | 'requestedGatewayJobIds'
    | 'selectedGatewayJobIds'
    | 'parentPass'
    | 'continuationPass'
    | 'limits'
    | 'counts'
    | 'rows'
    | 'proposedWrites'
  >,
): string => continuationReportHashFor(report);

export const calculateAffiliateLegacyRepairRetryReportHash = (
  report: Pick<
    AffiliateLegacyRepairRetryReport,
    | 'schemaVersion'
    | 'contractVersion'
    | 'contractHash'
    | 'deploymentContractVersion'
    | 'deploymentContractHash'
    | 'reason'
    | 'requestedGatewayJobIds'
    | 'selectedGatewayJobIds'
    | 'counts'
    | 'rows'
    | 'proposedWrites'
  >,
): string => retryReportHashFor(report);
