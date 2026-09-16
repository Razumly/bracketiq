import { createHash } from 'node:crypto';
import { Prisma, type AffiliateSupplySources, type PrismaClient } from '@/generated/prisma/client';
import { createId } from '@/lib/id';
import {
  affiliateAgentClaimEnvelopeSchema,
  affiliateAgentContractBundleSchema,
  affiliateAgentEvidenceManifestSchema,
  affiliateAgentExistingDataRepairContextSchema,
  affiliateAgentMappingRepairDirectiveSchema,
  affiliateAgentSourceKindAssessmentSchema,
  affiliateAgentSourceSportScopeSchema,
  affiliateAgentSubjectSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  hashAffiliateAgentValue,
  parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  type AffiliateAgentContractBundle,
  type AffiliateAgentEvidenceManifest,
  type AffiliateAgentExistingDataRepairContext,
  type AffiliateAgentListingKind,
  type AffiliateAgentSubject,
  type AffiliateAgentSourceKindAssessment,
  type AffiliateAgentSourceSportScope,
  type AffiliateAgentTerminalResultEnvelope,
} from './agentGatewayContracts';
import type { AffiliateAgentArtifactStore } from './agentGatewayAdapters';
import {
  buildAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';
import { normalizeAffiliateSupplyIdentity, type AffiliateSupplyIdentity } from './affiliateSupplyLifecycle';
import {
  affiliateSupplyDatabase,
  ensureAffiliateSupplySource,
  loadActiveAffiliateSupplyContract,
} from './affiliateSupplyPersistence';
import {
  AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY,
  AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY,
  AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS,
  AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY,
  affiliateExistingDataRepairCorrectionHoldSchema,
  affiliateExistingDataRepairPendingMappingSchema,
  captureAffiliateExistingRepairSourceState,
  metadataWithExistingDataRepairCorrectionHold,
  pendingMappingForMetadata,
  pendingMappingHash,
  readAffiliateExistingDataRepairCorrectionHold,
  type AffiliateExistingDataRepairCorrectionHold,
  type AffiliateExistingDataRepairPendingMapping,
  type AffiliateExistingDataRepairSourceState,
} from './affiliateExistingDataRepairState';
import { tryLockAffiliateRepairWrites } from './affiliateRepairActivityLease';

/** The operator workflow is deliberately bounded. */
export const AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_MAX_LIMIT = 20;
export const AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_DEFAULT_LIMIT = 20;
export const AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_SCHEMA_VERSION = 1 as const;
export const AFFILIATE_EXISTING_DATA_REPAIR_MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;
export const AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX = 'existing-data-repair:';
const SNAPSHOT_PER_INTAKE_LIMIT = 200;
const SNAPSHOT_GLOBAL_LIMIT = 2_000;

const SUCCESSFUL_RUN_STATUSES = new Set(['SUCCEEDED', 'PARTIAL']);
const ACTIVE_INTAKE_RUN_STATUSES = new Set(['QUEUED', 'RUNNING', 'CLAIMED']);
const ACTIVE_JOB_STATUSES = new Set(['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED', 'MAPPING_IN_PROGRESS', AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS]);
const TERMINAL_REPAIR_STATUSES = new Set([
  'COMPLETED', 'SUCCEEDED', 'FAILED', 'EXCLUDED', 'REJECTED', 'CANCELLED', 'APPROVED', 'DONE',
]);
const SUPPORTED_KINDS = new Set<AffiliateAgentListingKind>(['CLUB', 'EVENT', 'RENTAL']);
const SOURCE_CREATION_PRIMARY_PAGE_ROLES: Record<string, true> = {
  HOME: true,
  LISTING: true,
  DETAIL: true,
  REGISTRATION: true,
  RENTAL: true,
};
const SOURCE_CREATION_PAGE_ROLE_HOLD = 'SOURCE_CREATION_PAGE_ROLE_UNSUPPORTED';
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const REASON_MAX_BYTES = 1_000;

type JsonRecord = Record<string, unknown>;
type Delegate = {
  findMany?: (args: unknown) => Promise<unknown>;
  findUnique?: (args: unknown) => Promise<unknown>;
  create?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<{ count: number }>;
};
type Client = PrismaClient | Prisma.TransactionClient | Record<string, Delegate>;
type AnyDelegate = Record<string, Delegate>;
type Transaction = (callback: (tx: Client) => Promise<AffiliateExistingDataRepairAdmissionApplyReport>, options?: unknown) => Promise<AffiliateExistingDataRepairAdmissionApplyReport>;
const transactionFor = (value: unknown): Transaction | null => {
  if (!value || typeof value !== 'object' || !('$transaction' in value)) return null;
  const method = value.$transaction;
  if (typeof method !== 'function') return null;
  return method.bind(value) as unknown as Transaction;
};
export class AffiliateExistingDataRepairAdmissionError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: string, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = 'AffiliateExistingDataRepairAdmissionError';
    this.code = code;
    this.details = details;
  }
}
function bindingError(message: string, details: JsonRecord = {}): never {
  throw new AffiliateExistingDataRepairAdmissionError('CLAIM_BINDING_INVALID', message, details);
}

type WriteDelegateMethod = 'create' | 'updateMany';

const requiredWriteDelegateMethod = <K extends WriteDelegateMethod>(
  db: AnyDelegate,
  model: string,
  method: K,
): NonNullable<Delegate[K]> => {
  const delegate = db[model];
  const candidate = delegate?.[method];
  if (typeof candidate !== 'function') {
    throw new AffiliateExistingDataRepairAdmissionError(
      'PERSISTENCE_UNAVAILABLE',
      `The ${model}.${method} delegate is required.`,
    );
  }
  return candidate.bind(delegate) as NonNullable<Delegate[K]>;
};


type MappingJobRow = {
  id: string;
  intakeId: string;
  supplySourceId: string | null;
  sourceId: string | null;
  mappingId: string | null;
  legacyIdentityMigrationEligible?: boolean;
  status: string;
  claimedAt?: Date | string | null;
  leaseExpiresAt?: Date | string | null;
  workerId?: string | null;
  resultSummary: unknown;
  errorMessage?: string | null;
};
type IntakeRow = {
  id: string;
  name?: string;
  sourceKey: string;
  baseUrl: string | null;
  status: string;
  complianceStatus?: string | null;
  affiliateSourceId: string | null;
  supplySourceId: string | null;
  lastRunId: string | null;
  targetKindHints: string[];
};
type RunRow = {
  id: string;
  intakeId: string;
  supplySourceId: string | null;
  status: string;
  claimedAt?: Date | string | null;
  workerId?: string | null;
  createdAt?: Date | string;
  finishedAt?: Date | string | null;
  summary?: unknown;
};
type PageRow = {
  id: string;
  intakeId: string;
  supplySourceId: string | null;
  url: string;
  canonicalUrl: string;
  status: string;
  role?: string;
  targetKindHints?: string[];
  metadata?: unknown;
};
type ArtifactRow = {
  id: string;
  intakeId: string;
  supplySourceId: string | null;
  pageId: string | null;
  runId: string;
  kind: string;
  sourceUrl: string | null;
  finalUrl: string | null;
  contentHash: string;
  fileId: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt?: Date | string;
  isPinned: boolean;
  metadata?: unknown;
};
type FileRow = { id: string; path: string; mimeType: string | null; sizeBytes: number | null };
type SourceRow = {
  id: string;
  name: string;
  sourceKey: string;
  organizationId: string | null;
  baseUrl: string | null;
  listUrl: string;
  targetKind: string;
  status: string;
  activeMappingId: string | null;
  supplySourceId: string | null;
  lifecycleGeneration?: number;
  autoScrapeEnabled: boolean;
  metadata: unknown;
};
type SourceOwnerRow = {
  id: string;
  affiliateSourceId: string;
};
type MappingRow = {
  id: string;
  sourceId: string;
  supplySourceId: string | null;
  version: number;
  isActive: boolean;
  mapping: unknown;
  createdByUserId?: string | null;
  notes?: string | null;
  validatedAt: Date | string | null;
};
type RootRow = {
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
  successorId?: string | null;
  metadata: unknown;
};
type OrganizationRow = { id: string; status: string; publicPageEnabled: boolean; publicWidgetsEnabled: boolean };
type CandidateRow = {
  id: string;
  sourceId: string;
  supplySourceId: string | null;
  mappingId: string | null;
  runId?: string;
  listingKind: string;
  status: string;
  publishedEventId: string | null;
  publishedTeamId: string | null;
  publishedFacilityId: string | null;
  publishedOrganizationId: string | null;
};
type ApprovalRow = { id: string; subjectType: string; subjectKey: string; status: string };
type DomainPolicyRow = {
  id: string;
  policyKey: string;
  status: string;
  reviewedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  termsUrl?: string | null;
  robotsSummary?: string | null;
  restrictionNotes?: string | null;
  evidence?: unknown;
};
type GatewayJobRow = {
  id: string;
  dedupeKey: string;
  queue: string;
  lane: string;
  role: string;
  subjectType: string;
  subjectId: string;
  subjectJson: unknown;
  evidenceManifestJson: unknown;
  supplySourceId: string | null;
  expectedLifecycleGeneration: number | null;
  status: string;
  activeClaimId: string | null;
  parentClaimId?: string | null;
  eventSequence?: number;
  claimGeneration?: number;
  terminalDisposition?: string | null;
  resultHash?: string | null;
  resultJson?: unknown;
  terminalReceiptId?: string | null;
  finishedAt?: Date | string | null;
};
type GatewayClaimRow = {
  id: string;
  jobId: string;
  parentClaimId?: string | null;
  status: string;
  claimGeneration?: number;
  lifecycleGeneration?: number | null;
  queue?: string;
  lane?: string;
  role?: string;
  workerId?: string;
  invocationId?: string;
  workspaceId?: string;
  claimEnvelopeHash?: string;
  claimEnvelopeJson?: unknown;
  evidenceManifestHash?: string;
  deploymentContractVersion?: number;
  deploymentContractHash?: string;
  supplyContractVersion?: number;
  supplyContractHash?: string;
  roleContractVersion?: number;
  roleContractHash?: string;
  promptTemplateVersion?: number;
  promptTemplateHash?: string;
  terminalReceiptId?: string | null;
};
type GatewayReceiptRow = {
  id: string;
  claimId: string;
  jobId: string;
  claimGeneration: number;
  operationKind: string;
  status: string;
  responseHash?: string | null;
  responseJson?: unknown;
  completedAt?: Date | string | null;
};
type GatewayArtifactRow = {
  evidenceKind: string;
  sourceArtifactId: string;
  fileId: string;
  contentHash: string;
  mimeType: string;
  byteSize: number;
  claimId: string;
  creatingClaimId?: string | null;
};
type CompletedGatewayNode = Readonly<{
  job: GatewayJobRow;
  claim: GatewayClaimRow;
  envelope: JsonRecord;
  subject: JsonRecord;
  manifest: AffiliateAgentEvidenceManifest;
  result: JsonRecord;
  receipt: GatewayReceiptRow;
}>;

type Snapshot = {
  jobs: MappingJobRow[];
  intakes: IntakeRow[];
  runs: RunRow[];
  pages: PageRow[];
  artifacts: ArtifactRow[];
  files: FileRow[];
  sourceOwners: SourceOwnerRow[];
  sources: SourceRow[];
  mappings: MappingRow[];
  roots: RootRow[];
  organizations: OrganizationRow[];
  candidates: CandidateRow[];
  approvals: ApprovalRow[];
  gatewayJobs: GatewayJobRow[];
  gatewayClaims: GatewayClaimRow[];
  policies: DomainPolicyRow[];
  sportsCatalog: AffiliateSportsCatalogSnapshot;
};

type ExistingDataRepairArtifact = Readonly<{
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
  pageId: string;
}>;

export type AffiliateExistingDataRepairAdmissionWrite = Readonly<{
  mappingJobId: string;
  intakeId: string;
  sourceAction: 'CREATE_SOURCE' | 'REUSE_SOURCE';
  rootAction: 'CREATE_ROOT' | 'REUSE_ROOT';
  sourceId: string | null;
  rootIdentityKey: string;
  supplySourceId: string | null;
  evidenceRunId: string;
  artifactIds: readonly string[];
  gatewayDedupeKey: string;
  writes: readonly string[];
}>;

export type AffiliateExistingDataRepairAdmissionRow = Readonly<{
  jobId: string | null;
  mappingJobId: string | null;
  intakeId: string | null;
  status: string;
  sourceKey: string | null;
  sourceId: string | null;
  mappingId: string | null;
  supplySourceId: string | null;
  rootId: string | null;
  rootIdentityKey: string | null;
  sourceIdentityKey: string | null;
  evidenceRunId: string | null;
  evidencePageId: string | null;
  evidencePageIds: readonly string[];
  sportsCatalogSha256: string | null;
  sourceStateSha256: string | null;
  workingMappingId: string | null;
  isPublicReplacement: boolean;
  sourceKindAssessment?: AffiliateAgentSourceKindAssessment;
  artifacts: readonly ExistingDataRepairArtifact[];
  gatewayJobId: string | null;
  gatewayDedupeKey: string | null;
  stateFingerprint: string;
  eligible: boolean;
  alreadyAdmitted: boolean;
  reason: string;
  reasonCodes: readonly string[];
  outcome?: 'HELD' | 'PROPOSED' | 'ALREADY_ADMITTED' | 'APPLIED';
  write?: AffiliateExistingDataRepairAdmissionWrite;
}>;

export type AffiliateExistingDataRepairAdmissionCounts = Readonly<{
  total: number;
  eligible: number;
  held: number;
  selected: number;
  alreadyAdmitted: number;
}>;

export type AffiliateExistingDataRepairAppliedJob = Readonly<{
  jobId: string;
  mappingJobId: string;
  sourceId: string;
  supplySourceId: string;
}>;

export type AffiliateExistingDataRepairAdmissionReport = Readonly<{
  schemaVersion: 1;
  mode: 'PREVIEW' | 'APPLY';
  evaluatedAt: string;
  contractVersion: number;
  contractHash: string;
  reason: string;
  operatorId: string;
  requestedJobIds: readonly string[] | null;
  requestedSourceIds: readonly string[] | null;
  evidenceSelections: readonly ExistingDataRepairEvidenceSelection[] | null;
  selectionLimit: number;
  selectedJobIds: readonly string[];
  proposedJobIds: readonly string[];
  counts: AffiliateExistingDataRepairAdmissionCounts;
  rows: readonly AffiliateExistingDataRepairAdmissionRow[];
  proposedWrites: readonly AffiliateExistingDataRepairAdmissionWrite[];
  reportHash: string;
  reviewedReportHash: string | null;
  writeCount: number;
  appliedJobs: readonly AffiliateExistingDataRepairAppliedJob[];
  replayed: boolean;
}>;
export type AffiliateExistingDataRepairCorrectionPriorState = Readonly<{
  mappingJobId: string;
  sourceId: string;
  supplySourceId: string;
  mappingId: string | null;
  pendingMapping: unknown;
  pendingMappingHash: string;
  context: unknown;
  admissionAuditReference: Readonly<{
    mappingJobId: string;
    reportHash: string | null;
    gatewayJobId: string | null;
    auditHash: string;
  }>;
  mappingState: unknown;
  mappingBytes: unknown;
  mappingSha256: string | null;
  mappingJobState: unknown;
  gatewayJobs: readonly unknown[];
  gatewayClaims: readonly unknown[];
  gatewayReceipts: readonly unknown[];
  gatewayArtifacts: readonly unknown[];
  gatewayEvents: readonly unknown[];
  admissionEventId: string | null;
}>;

export type AffiliateExistingDataRepairCorrectionReport =
  AffiliateExistingDataRepairAdmissionReport & Readonly<{
    operation: 'CORRECTION';
    supersededMappingIds: readonly string[];
    supersededGatewayJobIds: readonly string[];
    priorStates: readonly AffiliateExistingDataRepairCorrectionPriorState[];
  }>;
export type AffiliateExistingDataRepairCorrectionPreview =
  AffiliateExistingDataRepairCorrectionReport & { mode: 'PREVIEW' };
export type AffiliateExistingDataRepairCorrectionApplyReport =
  AffiliateExistingDataRepairCorrectionReport & { mode: 'APPLY' };
export type AffiliateExistingDataRepairAdmissionPreview = AffiliateExistingDataRepairAdmissionReport & { mode: 'PREVIEW' };
export type AffiliateExistingDataRepairAdmissionApplyReport = AffiliateExistingDataRepairAdmissionReport & { mode: 'APPLY' };
type ExistingDataRepairAdmissionAuditSelectedRow = Readonly<{
  jobId: string;
  mappingJobId: string;
  intakeId: string;
  sourceId: string;
  mappingId: string | null;
  supplySourceId: string;
  rootId: string;
  gatewayJobId: string;
  evidenceRunId: string;
  eligible: boolean;
  outcome: 'APPLIED';
}>;
type ExistingDataRepairAdmissionAudit = Readonly<{
  schemaVersion: 1;
  reportHash: string;
  reportSnapshot: AffiliateExistingDataRepairAdmissionReport;
  operatorId: string;
  reason: string;
  mappingJobId: string;
  intakeId: string;
  evidenceRunId: string;
  sourceId: string;
  supplySourceId: string;
  rootId: string;
  rootIdentityKey: string;
  mappingId: string | null;
  gatewayJobId: string;
  gatewayDedupeKey: string;
  selectedJobIds: readonly string[];
  requestedJobIds: readonly string[] | null;
  requestedSourceIds: readonly string[] | null;
  selectionLimit: number;
  selectedRow: ExistingDataRepairAdmissionAuditSelectedRow;
  selectedWrite: Omit<AffiliateExistingDataRepairAdmissionWrite, 'sourceId' | 'supplySourceId'> & {
    sourceId: string;
    supplySourceId: string;
  };
  repairContext: AffiliateAgentExistingDataRepairContext;
  manifest: AffiliateAgentEvidenceManifest;
  sourceStateSha256: string;
  sourceState: unknown;
  workingMappingState: unknown;
  organizationState: unknown;
  baseline?: Pick<AffiliateExistingDataRepairSourceState, 'sourceStateSha256' | 'sourceState' | 'workingMappingState' | 'organizationState'>;
  rootLifecycleGeneration: number;
  artifactIds: readonly string[];
  evidenceSnapshots?: readonly ExistingDataRepairArtifact[];
  pageSnapshots?: readonly JsonRecord[];
  policySnapshots?: readonly DomainPolicyRow[];
  deploymentContract?: unknown;
  legacyMappingJobState?: JsonRecord;
  createdIds: Readonly<{
    gatewayJobId: string;
    mappingJobId: string;
    sourceId: string;
    supplySourceId: string;
    evidenceArtifactIds: readonly string[];
  }>;
  operation?: 'CORRECTION';
  supersededMappingIds?: readonly string[];
  supersededGatewayJobIds?: readonly string[];
  correctionPriorState?: AffiliateExistingDataRepairCorrectionPriorState;
}>;
export type ExistingDataRepairEvidenceSelection = Readonly<{
  jobId: string;
  runId: string;
  pageId: string;
  supportingPageIds?: readonly string[];
}>;

type CommonInput = Readonly<{
  prisma: PrismaClient;
  bundle: AffiliateAgentContractBundle;
  jobIds?: readonly string[];
  sourceIds?: readonly string[];
  reason: string;
  operatorId: string;
  artifactStore?: AffiliateAgentArtifactStore;
  limit?: number;
  evidenceSelections?: readonly ExistingDataRepairEvidenceSelection[];
}>;
export type PreviewAffiliateExistingDataRepairAdmissionInput = CommonInput;
export type ApplyAffiliateExistingDataRepairAdmissionInput = CommonInput & Readonly<{ expectedReportHash: string }>;

type Baseline = AffiliateExistingDataRepairSourceState;
type Plan = {
  row: AffiliateExistingDataRepairAdmissionRow;
  job: MappingJobRow;
  intake: IntakeRow;
  source: SourceRow | null;
  mapping: MappingRow | null;
  root: RootRow | null;
  identity: AffiliateSupplyIdentity;

  run: RunRow;
  page: PageRow;
  evidencePages: readonly PageRow[];
  artifacts: readonly ArtifactRow[];
  evidence: readonly ExistingDataRepairArtifact[];
  manifest: AffiliateAgentEvidenceManifest;
  baseline: Baseline | null;
  sourceKindAssessment?: AffiliateAgentSourceKindAssessment;
  sourceSportScope?: JsonRecord;
  policySnapshots: readonly DomainPolicyRow[];
  sportsCatalog: AffiliateSportsCatalogSnapshot;
  gatewayDedupeKey: string;
  sourceCreated: boolean;
};

const artifactTime = (value: Date | string | undefined): number => {
  const timestamp = value instanceof Date ? value.getTime() : value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};
const artifactSort = (left: ArtifactRow, right: ArtifactRow): number => (
  artifactTime(right.createdAt) - artifactTime(left.createdAt)
  || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);
const hasOwn = (value: unknown, key: string): boolean => (
  Object.prototype.hasOwnProperty.call(recordValue(value), key)
);
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const upper = (value: unknown): string => String(value ?? '').trim().toUpperCase();
const normalizeAdmissionHashValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalizeAdmissionHashValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([key, nested]) => (
      nested === undefined ? [] : [[key, normalizeAdmissionHashValue(nested)]]
    )));
  }
  return value;
};
const hash = (value: unknown): string => hashAffiliateAgentValue(normalizeAdmissionHashValue(value));
const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
const compareId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const normalizeHash = (value: unknown): string | null => {
  const candidate = text(value)?.toLowerCase() ?? null;
  return candidate && HASH_PATTERN.test(candidate) ? candidate : null;
};
const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const sameValue = (a: unknown, b: unknown): boolean => hash(a) === hash(b);
const activeLease = (row: { claimedAt?: Date | string | null; leaseExpiresAt?: Date | string | null; workerId?: string | null }): boolean => (
  Boolean(row.claimedAt || row.workerId || row.leaseExpiresAt)
);
const activeGatewayClaim = (snapshot: Snapshot, gatewayJob: GatewayJobRow | null): boolean => (
  Boolean(gatewayJob && (gatewayJob.activeClaimId || snapshot.gatewayClaims.some((claim) => claim.jobId === gatewayJob.id && upper(claim.status) === 'ACTIVE')))
);
const admissionHistoryValues = (summary: unknown): unknown[] => {
  const envelope = recordValue(summary);
  const value = envelope.existingDataRepairAdmissionHistory;
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
};
const admissionHistoryHasMalformedEntry = (summary: unknown): boolean => (
  admissionHistoryValues(summary).some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))
);
const admissionHistory = (summary: unknown): JsonRecord[] => (
  admissionHistoryValues(summary).filter((entry): entry is JsonRecord => (
    Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
  ))
);
const priorContextFor = (job: MappingJobRow): JsonRecord | null => {
  const history = admissionHistory(job.resultSummary);
  const context = history.find((entry) => recordValue(entry.repairContext).kind === 'EXISTING_DATA_REPAIR');
  return context ? recordValue(context.repairContext) : null;
};
const recordedRepairReasons = (summary: unknown): string[] => {
  const reasons: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    const record = value as JsonRecord;
    const repairReasons = record.repairReasons;
    if (Array.isArray(repairReasons)) {
      reasons.push(...repairReasons.filter((reason): reason is string => typeof reason === 'string'));
    }
    if (typeof record.repairReason === 'string') reasons.push(record.repairReason);
    for (const [key, nested] of Object.entries(record)) {
      if (key === 'repairReasons' || key === 'repairReason') continue;
      if (nested && typeof nested === 'object') visit(nested, depth + 1);
    }
  };
  visit(summary, 0);
  return sortedUnique(reasons);
};
const reportSnapshot = (value: unknown): JsonRecord => recordValue(value);

const normalizeInputIds = (value: readonly string[] | undefined, name: string): string[] | undefined => {
  if (value === undefined) return undefined;
  const ids = sortedUnique(value);
  if (!ids.length) throw new AffiliateExistingDataRepairAdmissionError(`INVALID_${name.toUpperCase()}`, `${name} must not be empty.`);
  return ids;
};
const normalizeEvidenceSelections = (value: readonly ExistingDataRepairEvidenceSelection[] | undefined): ExistingDataRepairEvidenceSelection[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) throw new AffiliateExistingDataRepairAdmissionError('INVALID_EVIDENCE_SELECTIONS', 'evidenceSelections must contain at least one selection when supplied.');
  if (value.length > AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_MAX_LIMIT) {
    throw new AffiliateExistingDataRepairAdmissionError('EVIDENCE_SELECTION_LIMIT_EXCEEDED', `At most ${AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_MAX_LIMIT} evidence selections are permitted.`);
  }
  const seenJobs = new Set<string>();
  return value.map((selection) => {
    const jobId = text(selection?.jobId);
    const runId = text(selection?.runId);
    const pageId = text(selection?.pageId);
    const supportingPageIds = selection?.supportingPageIds;
    if (!jobId || !runId || !pageId) throw new AffiliateExistingDataRepairAdmissionError('INVALID_EVIDENCE_SELECTION', 'Each evidence selection requires jobId, runId, and pageId.');
    if (seenJobs.has(jobId)) throw new AffiliateExistingDataRepairAdmissionError('DUPLICATE_EVIDENCE_SELECTION', `Evidence selection ${jobId} is repeated.`);
    seenJobs.add(jobId);
    if (supportingPageIds !== undefined && (!Array.isArray(supportingPageIds) || supportingPageIds.length > 2)) {
      throw new AffiliateExistingDataRepairAdmissionError('SUPPORTING_PAGE_LIMIT_EXCEEDED', 'Each evidence selection may include at most two supporting page IDs.');
    }
    const support = supportingPageIds === undefined ? undefined : sortedUnique(supportingPageIds.map((id: string) => text(id) ?? ''));
    if (support?.some((id) => !id || id === pageId)) throw new AffiliateExistingDataRepairAdmissionError('INVALID_SUPPORTING_PAGE', 'Supporting page IDs must be non-empty and differ from the primary page.');
    if (support && support.length !== supportingPageIds!.length) throw new AffiliateExistingDataRepairAdmissionError('DUPLICATE_SUPPORTING_PAGE', `Evidence selection ${jobId} repeats a supporting page.`);
    return { jobId, runId, pageId, ...(support?.length ? { supportingPageIds: support } : {}) };
  }).sort((a, b) => a.jobId.localeCompare(b.jobId));
};
type ValidatedAdmissionInput = Readonly<{
  jobIds?: string[];
  sourceIds?: string[];
  evidenceSelections?: ExistingDataRepairEvidenceSelection[];
  limit: number;
  reason: string;
  operatorId: string;
}>;
const validateInput = (input: CommonInput): ValidatedAdmissionInput => {
  const jobIds = normalizeInputIds(input.jobIds, 'jobIds');
  const sourceIds = normalizeInputIds(input.sourceIds, 'sourceIds');
  if (!jobIds && !sourceIds) {
    throw new AffiliateExistingDataRepairAdmissionError('SELECTION_REQUIRED', 'Select explicit existing mapping job IDs or source IDs.');
  }
  if (sortedUnique([...(jobIds ?? []), ...(sourceIds ?? [])]).length > AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_MAX_LIMIT) {
    throw new AffiliateExistingDataRepairAdmissionError('SELECTION_LIMIT_EXCEEDED', `The combined explicit selection cannot exceed ${AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_MAX_LIMIT} IDs.`);
  }
  const limit = input.limit ?? AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_MAX_LIMIT) {
    throw new AffiliateExistingDataRepairAdmissionError('INVALID_LIMIT', `limit must be an integer between 1 and ${AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_MAX_LIMIT}.`);
  }
  const reason = text(input.reason);
  const operatorId = text(input.operatorId);
  if (!reason || Buffer.byteLength(reason, 'utf8') > REASON_MAX_BYTES) throw new AffiliateExistingDataRepairAdmissionError('REASON_REQUIRED', 'reason is required and must not exceed 1,000 UTF-8 bytes.');
  if (!operatorId) throw new AffiliateExistingDataRepairAdmissionError('OPERATOR_REQUIRED', 'operatorId is required.');
  return { jobIds, sourceIds, evidenceSelections: normalizeEvidenceSelections(input.evidenceSelections), limit, reason, operatorId };
};
const parseBundle = (bundle: AffiliateAgentContractBundle): AffiliateAgentContractBundle => {
  const parsed = affiliateAgentContractBundleSchema.safeParse(bundle);
  if (!parsed.success) throw new AffiliateExistingDataRepairAdmissionError('INVALID_CONTRACT_BUNDLE', `The supplied contract bundle is invalid: ${parsed.error.message}`);
  return parsed.data as AffiliateAgentContractBundle;
};
const cohort = (bundle: AffiliateAgentContractBundle): string => text((bundle.supplyContract as JsonRecord).rolloutCohort) ?? 'DEFAULT';

const delegateRows = async <T = unknown>(delegate: Delegate | undefined, args: unknown): Promise<T[]> => {
  if (!delegate || typeof delegate.findMany !== 'function') {
    throw new AffiliateExistingDataRepairAdmissionError(
      'PERSISTENCE_UNAVAILABLE',
      'The requested Prisma findMany delegate is required.',
    );
  }
  const result = await delegate.findMany(args);
  if (!Array.isArray(result)) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'PERSISTENCE_INVALID',
      'The requested Prisma findMany delegate returned an invalid collection.',
    );
  }
  return result as T[];
};

const readUnique = async (
  db: AnyDelegate,
  model: string,
  args: unknown,
): Promise<JsonRecord | null> => {
  const delegate = db[model];
  if (!delegate || typeof delegate.findUnique !== 'function') {
    throw new AffiliateExistingDataRepairAdmissionError(
      'PERSISTENCE_UNAVAILABLE',
      `The ${model}.findUnique delegate is required.`,
    );
  }
  const result = await delegate.findUnique(args);
  if (result === null || result === undefined) return null;
  if (typeof result !== 'object' || Array.isArray(result)) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'PERSISTENCE_INVALID',
      `The ${model}.findUnique delegate returned a malformed row.`,
    );
  }
  return result as JsonRecord;
};

const uniqueRows = <T extends { id: string }>(rows: readonly T[]): T[] => Array.from(new Map(rows.map((row) => [row.id, row])).values()).sort(compareId);
const snapshotRows = async <T>(
  delegate: Delegate | undefined,
  args: JsonRecord,
  limit: number,
  scope: string,
): Promise<T[]> => {
  const rows = await delegateRows<T>(delegate, { ...args, take: limit + 1 });
  if (rows.length > limit) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'SNAPSHOT_OVERFLOW',
      `The bounded admission snapshot is larger than the ${scope} limit.`,
      { scope, limit },
    );
  }
  return rows;
};

const snapshotCollection = <T>(
  rows: readonly T[],
  limit: number,
  scope: string,
): T[] => {
  if (rows.length > limit) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'SNAPSHOT_OVERFLOW',
      `The bounded admission snapshot is larger than the ${scope} limit.`,
      { scope, limit },
    );
  }
  return [...rows];
};

const readSnapshot = async (client: Client, selectedJobIds: readonly string[], selectedSourceIds: readonly string[]): Promise<Snapshot> => {
  const db = client as unknown as AnyDelegate;
  const mappingJobsDelegate = db.affiliateSourceMappingJobs;
  const intakeIdsFor = async <T>(
    delegate: Delegate | undefined,
    intakeIds: readonly string[],
    limit: number,
    scope: string,
    extraWhere: JsonRecord = {},
  ): Promise<T[]> => (
    (await Promise.all(intakeIds.map((intakeId) => snapshotRows<T>(
      delegate,
      { where: { intakeId, ...extraWhere }, orderBy: { id: 'asc' } },
      limit,
      `${scope}:${intakeId}`,
    )))).flat()
  );
  const selectedSourceIntakes = selectedSourceIds.length
    ? await snapshotRows<IntakeRow>(db.affiliateSourceIntakes, {
      where: { affiliateSourceId: { in: [...selectedSourceIds] } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_PER_INTAKE_LIMIT, 'source-linked intakes')
    : [];
  const selectedMappingsBySource = selectedSourceIds.length
    ? await snapshotRows<MappingRow>(db.affiliateScrapeMappings, {
      where: { sourceId: { in: [...selectedSourceIds] } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'source-linked mappings')
    : [];
  const selectedMappingIds = sortedUnique(selectedMappingsBySource.map((mapping) => mapping.id));
  const sourceIntakeIds = sortedUnique(selectedSourceIntakes.map((intake) => intake.id));
  const [jobsById, jobsBySource, jobsByMapping, jobsBySourceIntake] = await Promise.all([
    selectedJobIds.length
      ? snapshotRows<MappingJobRow>(mappingJobsDelegate, {
        where: { id: { in: [...selectedJobIds] } },
        orderBy: { id: 'asc' },
      }, selectedJobIds.length, 'selected mapping jobs')
      : Promise.resolve([] as MappingJobRow[]),
    selectedSourceIds.length
      ? snapshotRows<MappingJobRow>(mappingJobsDelegate, {
        where: { sourceId: { in: [...selectedSourceIds] } },
        orderBy: { id: 'asc' },
      }, SNAPSHOT_GLOBAL_LIMIT, 'source-linked mapping jobs')
      : Promise.resolve([] as MappingJobRow[]),
    selectedMappingIds.length
      ? snapshotRows<MappingJobRow>(mappingJobsDelegate, {
        where: { mappingId: { in: selectedMappingIds } },
        orderBy: { id: 'asc' },
      }, SNAPSHOT_GLOBAL_LIMIT, 'mapping-linked mapping jobs')
      : Promise.resolve([] as MappingJobRow[]),
    sourceIntakeIds.length
      ? intakeIdsFor<MappingJobRow>(mappingJobsDelegate, sourceIntakeIds, SNAPSHOT_PER_INTAKE_LIMIT, 'source-intake mapping jobs')
      : Promise.resolve([] as MappingJobRow[]),
  ]);
  const selectedJobs = uniqueRows<MappingJobRow>([
    ...jobsById,
    ...jobsBySource,
    ...jobsByMapping,
    ...jobsBySourceIntake,
  ]);
  const intakeIds = sortedUnique(selectedJobs.map((job) => job.intakeId).filter(Boolean));
  const [intakes, activeSiblingJobs] = await Promise.all([
    intakeIds.length
      ? snapshotRows<IntakeRow>(db.affiliateSourceIntakes, {
        where: { id: { in: intakeIds } },
        orderBy: { id: 'asc' },
      }, SNAPSHOT_GLOBAL_LIMIT, 'selected intakes')
      : Promise.resolve([] as IntakeRow[]),
    intakeIds.length
      ? Promise.all(intakeIds.map((intakeId) => snapshotRows<MappingJobRow>(mappingJobsDelegate, {
        where: { intakeId, status: { in: [...ACTIVE_JOB_STATUSES] } },
        orderBy: { id: 'asc' },
      }, SNAPSHOT_PER_INTAKE_LIMIT, `active sibling mapping jobs:${intakeId}`)))
        .then((rows) => rows.flat())
      : Promise.resolve([] as MappingJobRow[]),
  ]);
  const jobs = snapshotCollection(
    uniqueRows<MappingJobRow>([...selectedJobs, ...activeSiblingJobs]),
    SNAPSHOT_GLOBAL_LIMIT,
    'mapping jobs',
  );
  const typedIntakes = snapshotCollection(
    uniqueRows<IntakeRow>([...intakes, ...selectedSourceIntakes]),
    SNAPSHOT_GLOBAL_LIMIT,
    'intakes',
  );
  const initialMappingIds = sortedUnique([
    ...selectedMappingIds,
    ...jobs.map((job) => job.mappingId).filter((id): id is string => Boolean(id)),
  ]);
  const mappingsForJobs = initialMappingIds.length
    ? await snapshotRows<MappingRow>(db.affiliateScrapeMappings, {
      where: { id: { in: initialMappingIds } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'job-linked mappings')
    : [];
  const typedMappingsForJobs = snapshotCollection(
    uniqueRows<MappingRow>([...selectedMappingsBySource, ...mappingsForJobs]),
    SNAPSHOT_GLOBAL_LIMIT,
    'job-linked mappings',
  );
  const sourceKeys = sortedUnique(typedIntakes.map((intake) => intake.sourceKey));
  const sourceReferenceIds = sortedUnique([
    ...selectedSourceIds,
    ...jobs.map((job) => job.sourceId).filter((id): id is string => Boolean(id)),
    ...typedIntakes.map((intake) => intake.affiliateSourceId).filter((id): id is string => Boolean(id)),
    ...typedMappingsForJobs.map((mapping) => mapping.sourceId).filter(Boolean),
  ]);
  const sourceWhere: JsonRecord = {
    OR: [
      ...(sourceReferenceIds.length ? [{ id: { in: sourceReferenceIds } }] : []),
      ...(sourceKeys.length ? [{ sourceKey: { in: sourceKeys } }] : []),
      ...intakeIds.flatMap((id) => [
        { metadata: { path: ['intakeId'], equals: id } },
        { metadata: { path: ['sourceEvidence', 'intakeId'], equals: id } },
        { metadata: { path: ['existingDataRepair', 'intakeId'], equals: id } },
        { metadata: { path: ['existingDataRepairAdmission', 'intakeId'], equals: id } },
      ]),
      ...sourceKeys.flatMap((key) => [
        { metadata: { path: ['intakeSourceKey'], equals: key } },
        { metadata: { path: ['sourceKey'], equals: key } },
        { metadata: { path: ['sourceEvidence', 'sourceKey'], equals: key } },
        { metadata: { path: ['sourceEvidence', 'intakeSourceKey'], equals: key } },
        { metadata: { path: ['existingDataRepair', 'sourceKey'], equals: key } },
        { metadata: { path: ['existingDataRepair', 'intakeSourceKey'], equals: key } },
        { metadata: { path: ['existingDataRepairAdmission', 'sourceKey'], equals: key } },
        { metadata: { path: ['existingDataRepairAdmission', 'intakeSourceKey'], equals: key } },
      ]),
    ],
  };
  const [sources, runs, pages, artifacts, sportsRows] = await Promise.all([
    sourceReferenceIds.length || sourceKeys.length || intakeIds.length
      ? snapshotRows<SourceRow>(db.affiliateScrapeSources, {
        where: sourceWhere,
        orderBy: { id: 'asc' },
      }, SNAPSHOT_GLOBAL_LIMIT, 'source candidates')
      : Promise.resolve([] as SourceRow[]),
    intakeIds.length
      ? intakeIdsFor<RunRow>(db.affiliateSourceIntakeRuns, intakeIds, SNAPSHOT_PER_INTAKE_LIMIT, 'intake runs')
      : Promise.resolve([] as RunRow[]),
    intakeIds.length
      ? intakeIdsFor<PageRow>(db.affiliateSourceIntakePages, intakeIds, SNAPSHOT_PER_INTAKE_LIMIT, 'intake pages')
      : Promise.resolve([] as PageRow[]),
    intakeIds.length
      ? intakeIdsFor<ArtifactRow>(
        db.affiliateSourceIntakeArtifacts,
        intakeIds,
        SNAPSHOT_PER_INTAKE_LIMIT * 6,
        'intake artifacts',
        { kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN'] } },
      )
      : Promise.resolve([] as ArtifactRow[]),
    snapshotRows<{ id: string; name: string }>(db.sports, {
      select: { id: true, name: true },
    }, SNAPSHOT_GLOBAL_LIMIT, 'sports catalog'),
  ]);
  const typedRuns = snapshotCollection(uniqueRows<RunRow>(runs), SNAPSHOT_GLOBAL_LIMIT, 'intake runs');
  const typedPages = snapshotCollection(uniqueRows<PageRow>(pages), SNAPSHOT_GLOBAL_LIMIT, 'intake pages');
  const typedArtifacts = snapshotCollection(uniqueRows<ArtifactRow>(artifacts), SNAPSHOT_GLOBAL_LIMIT, 'intake artifacts');
  const sourceListingUrls = sortedUnique([
    ...typedPages.map((page) => page.url),
    ...typedPages.map((page) => page.canonicalUrl),
  ]);
  const sourcesByExactListingUrl = sourceListingUrls.length
    ? await snapshotRows<SourceRow>(db.affiliateScrapeSources, {
      where: { listUrl: { in: sourceListingUrls } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'exact source listing URL candidates')
    : [];
  const sourceHosts = sortedUnique([
    ...typedPages.map((page) => page.canonicalUrl),
    ...typedIntakes.map((intake) => intake.baseUrl),
  ].flatMap((url) => {
    if (!url) return [];
    try { return [new URL(url).host.toLowerCase()]; } catch { return []; }
  }));
  const sourcesByCanonicalUrl = sourceHosts.length
    ? await snapshotRows<SourceRow>(db.affiliateScrapeSources, {
      where: {
        OR: sourceHosts.flatMap((host) => [
          { listUrl: { contains: host, mode: 'insensitive' } },
          { baseUrl: { contains: host, mode: 'insensitive' } },
        ]),
      },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'canonical source URL candidates')
    : [];
  const typedSources = snapshotCollection(
    uniqueRows<SourceRow>([...sources, ...sourcesByExactListingUrl, ...sourcesByCanonicalUrl]),
    SNAPSHOT_GLOBAL_LIMIT,
    'sources',
  );
  const sourceOwnerIds = sortedUnique(typedSources.map((source) => source.id));
  const sourceOwners = sourceOwnerIds.length
    ? await snapshotRows<SourceOwnerRow>(db.affiliateSourceIntakes, {
      where: { affiliateSourceId: { in: sourceOwnerIds } },
      select: { id: true, affiliateSourceId: true },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'source candidate intake owners')
    : [];
  const typedSourceOwners = snapshotCollection(
    uniqueRows<SourceOwnerRow>(sourceOwners),
    SNAPSHOT_GLOBAL_LIMIT,
    'source candidate intake owners',
  );
  const mappingIds = sortedUnique([
    ...initialMappingIds,
    ...mappingsForJobs.map((mapping) => mapping.id),
    ...typedSources.map((source) => source.activeMappingId).filter((id): id is string => Boolean(id)),
  ]);
  const mappings = mappingIds.length
    ? await snapshotRows<MappingRow>(db.affiliateScrapeMappings, {
      where: {
        OR: [
          ...(selectedSourceIds.length ? [{ sourceId: { in: [...selectedSourceIds] } }] : []),
          { id: { in: mappingIds } },
        ],
      },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'mappings')
    : [];
  const typedMappings = snapshotCollection(
    uniqueRows<MappingRow>([...typedMappingsForJobs, ...mappings]),
    SNAPSHOT_GLOBAL_LIMIT,
    'mappings',
  );
  const rootIds = sortedUnique([
    ...jobs.map((job) => job.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedIntakes.map((intake) => intake.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedSources.map((source) => source.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedMappings.map((mapping) => mapping.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedRuns.map((run) => run.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedPages.map((page) => page.supplySourceId).filter((id): id is string => Boolean(id)),
    ...typedArtifacts.map((artifact) => artifact.supplySourceId).filter((id): id is string => Boolean(id)),
  ]);
  const rootIdentityKeys = sortedUnique([
    ...typedSources.flatMap((source) => {
      try {
        const url = source.listUrl || source.baseUrl;
        return url
          ? [normalizeAffiliateSupplyIdentity({
            requestedUrl: url,
            resolvedCanonicalUrl: url,
            operatorDomain: new URL(url).hostname,
          }).identityKey]
          : [];
      } catch {
        return [];
      }
    }),
    ...typedPages.flatMap((page) => {
      try {
        return [normalizeAffiliateSupplyIdentity({
          requestedUrl: page.canonicalUrl,
          resolvedCanonicalUrl: page.canonicalUrl,
          operatorDomain: new URL(page.canonicalUrl).hostname,
        }).identityKey];
      } catch {
        return [];
      }
    }),
    ...typedIntakes.flatMap((intake) => {
      try {
        return intake.baseUrl
          ? [normalizeAffiliateSupplyIdentity({
            requestedUrl: intake.baseUrl,
            resolvedCanonicalUrl: intake.baseUrl,
            operatorDomain: new URL(intake.baseUrl).hostname,
          }).identityKey]
          : [];
      } catch {
        return [];
      }
    }),
  ]);
  const roots = rootIds.length || rootIdentityKeys.length
    ? await snapshotRows<RootRow>(db.affiliateSupplySources, {
      where: {
        OR: [
          ...(rootIds.length ? [{ id: { in: rootIds } }] : []),
          ...(rootIdentityKeys.length ? [{ identityKey: { in: rootIdentityKeys } }] : []),
        ],
      },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'Supply Source roots')
    : [];
  const typedRoots = snapshotCollection(uniqueRows<RootRow>(roots), SNAPSHOT_GLOBAL_LIMIT, 'Supply Source roots');
  const organizationIds = sortedUnique(typedSources.map((source) => source.organizationId).filter((id): id is string => Boolean(id)));
  const candidates = selectedSourceIds.length || mappingIds.length || rootIds.length
    ? await snapshotRows<CandidateRow>(db.affiliateImportCandidates, {
      where: {
        OR: [
          ...(selectedSourceIds.length ? [{ sourceId: { in: [...selectedSourceIds] } }] : []),
          ...(mappingIds.length ? [{ mappingId: { in: mappingIds } }] : []),
          ...(rootIds.length ? [{ supplySourceId: { in: rootIds } }] : []),
        ],
      },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'import candidates')
    : [];
  const approvals = jobs.length
    ? await snapshotRows<ApprovalRow>(db.affiliateApprovalJobs, {
      where: { subjectType: 'MAPPING_PACKAGE', subjectKey: { in: jobs.map((job) => job.id) } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'approval jobs')
    : [];
  const gatewayJobs = jobs.length || rootIds.length
    ? await snapshotRows<GatewayJobRow>(db.affiliateAgentGatewayJobs, {
      where: {
        OR: [
          ...(jobs.length ? [{ subjectId: { in: jobs.map((job) => job.id) } }] : []),
          ...(rootIds.length ? [{ supplySourceId: { in: rootIds } }] : []),
        ],
      },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'Gateway jobs')
    : [];
  const gatewayJobIds = sortedUnique(gatewayJobs.map((job) => job.id));
  const gatewayClaims = gatewayJobIds.length
    ? await snapshotRows<GatewayClaimRow>(db.affiliateAgentGatewayClaims, {
      where: { jobId: { in: gatewayJobIds }, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'Gateway claims')
    : [];
  const fileIds = sortedUnique(typedArtifacts.map((artifact) => artifact.fileId));
  const files = fileIds.length
    ? await snapshotRows<FileRow>(db.file, {
      where: { id: { in: fileIds } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'artifact files')
    : [];
  const organizations = organizationIds.length
    ? await snapshotRows<OrganizationRow>(db.organizations, {
      where: { id: { in: organizationIds } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'source organizations')
    : [];
  const policyKeys = sortedUnique([
    ...typedIntakes.map((intake) => intake.baseUrl),
    ...typedPages.map((page) => page.canonicalUrl),
    ...typedSources.flatMap((source) => [source.listUrl, source.baseUrl]),
    ...typedArtifacts.flatMap((artifact) => [artifact.sourceUrl, artifact.finalUrl]),
  ].map((url) => {
    if (!url) return '';
    try { return affiliateDiscoveryPolicyKeyForUrl(url); } catch { return ''; }
  }));
  const policies = policyKeys.length
    ? await snapshotRows<DomainPolicyRow>(db.affiliateSourceDomainPolicies, {
      where: { policyKey: { in: policyKeys } },
      orderBy: { policyKey: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'domain policies')
    : [];
  const catalog = buildAffiliateSportsCatalogSnapshot(
    sportsRows.map((row) => ({ id: String(row.id), name: String(row.name) })),
    new Date().toISOString(),
  );
  return {
    jobs,
    intakes: typedIntakes,
    runs: typedRuns,
    pages: typedPages,
    artifacts: typedArtifacts,
    files: snapshotCollection(uniqueRows<FileRow>(files), SNAPSHOT_GLOBAL_LIMIT, 'artifact files'),
    sources: typedSources,
    sourceOwners: typedSourceOwners,
    mappings: typedMappings,
    roots: typedRoots,
    organizations: snapshotCollection(uniqueRows<OrganizationRow>(organizations), SNAPSHOT_GLOBAL_LIMIT, 'source organizations'),
    candidates: snapshotCollection(uniqueRows<CandidateRow>(candidates), SNAPSHOT_GLOBAL_LIMIT, 'import candidates'),
    approvals: snapshotCollection(uniqueRows<ApprovalRow>(approvals), SNAPSHOT_GLOBAL_LIMIT, 'approval jobs'),
    gatewayJobs: snapshotCollection(uniqueRows<GatewayJobRow>(gatewayJobs), SNAPSHOT_GLOBAL_LIMIT, 'Gateway jobs'),
    gatewayClaims: snapshotCollection(uniqueRows<GatewayClaimRow>(gatewayClaims), SNAPSHOT_GLOBAL_LIMIT, 'Gateway claims'),
    policies: snapshotCollection(uniqueRows<DomainPolicyRow>(policies), SNAPSHOT_GLOBAL_LIMIT, 'domain policies'),
    sportsCatalog: catalog,
  };
};
const assertNoGlobalActiveGatewayClaims = async (client: Client): Promise<void> => {
  const db = client as unknown as AnyDelegate;
  const activeClaims = await delegateRows<GatewayClaimRow>(db.affiliateAgentGatewayClaims, {
    where: { status: 'ACTIVE' },
    select: { id: true, jobId: true, status: true },
    orderBy: { id: 'asc' },
    take: 1,
  });
  if (activeClaims.length) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      'An active Gateway claim exists; existing-data repair admission is paused.',
    );
  }
  const activePointers = await delegateRows<JsonRecord>(db.affiliateAgentGatewayJobs, {
    where: { activeClaimId: { not: null } },
    select: { id: true, activeClaimId: true },
    orderBy: { id: 'asc' },
    take: 1,
  });
  for (const pointer of activePointers) {
    const jobId = text(pointer.id);
    const claimId = text(pointer.activeClaimId);
    const claim = claimId
      ? await readUnique(db, 'affiliateAgentGatewayClaims', { where: { id: claimId } })
      : null;
    if (
      !jobId
      || !claim
      || upper(claim.status) !== 'ACTIVE'
      || text(claim.jobId) !== jobId
    ) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'CLAIM_DRIFT',
        'A Gateway activeClaimId pointer is stale or invalid.',
      );
    }
  }
};


const canonical = (value: string | null | undefined): string | null => {
  if (!text(value)) return null;
  try { return normalizeAffiliateSupplyIdentity({ requestedUrl: value!, resolvedCanonicalUrl: value!, operatorDomain: new URL(value!).hostname }).canonicalUrl; } catch { return null; }
};
const identityForSource = (source: SourceRow | null, page?: PageRow | null, intake?: IntakeRow | null): AffiliateSupplyIdentity | null => {
  const url = source?.listUrl || source?.baseUrl || page?.canonicalUrl || intake?.baseUrl;
  if (!url) return null;
  try { return normalizeAffiliateSupplyIdentity({ requestedUrl: url, resolvedCanonicalUrl: url, operatorDomain: new URL(url).hostname }); } catch { return null; }
};
const sourceCandidatesFor = (
  snapshot: Snapshot,
  job: MappingJobRow,
  intake: IntakeRow,
  requestedSourceIds: readonly string[],
  mappingSourceId: string | null = null,
  selectedPrimaryPageUrl: string | null = null,
): { candidates: SourceRow[]; reasons: string[] } => {
  const reasons: string[] = [];
  const explicitValues = [job.sourceId, intake.affiliateSourceId, mappingSourceId];
  const explicitIds = sortedUnique(
    explicitValues
      .map((value) => text(value))
      .filter((value): value is string => Boolean(value)),
  );
  const hasMalformedExplicitId = explicitValues.some((value) => value !== null && text(value) === null);
  const explicitCandidates = snapshot.sources.filter((source) => explicitIds.includes(source.id));
  const explicitCandidateIds = new Set(explicitCandidates.map((source) => source.id));
  if (hasMalformedExplicitId || explicitIds.length > 1) reasons.push('SOURCE_IDENTITY_CONFLICT');
  if (hasMalformedExplicitId || explicitIds.some((id) => !explicitCandidateIds.has(id))) {
    reasons.push('SOURCE_IDENTITY_MISSING');
  }
  if (reasons.includes('SOURCE_IDENTITY_MISSING')) return { candidates: [], reasons };

  const provenanceFor = (source: SourceRow): { intakeIds: string[]; sourceKeys: string[] } => {
    const metadata = recordValue(source.metadata);
    const records = [
      metadata,
      recordValue(metadata.sourceEvidence),
      recordValue(metadata.existingDataRepair),
      recordValue(metadata.existingDataRepairAdmission),
    ];
    return {
      intakeIds: sortedUnique(records
        .map((record) => text(record.intakeId))
        .filter((value): value is string => Boolean(value))),
      sourceKeys: sortedUnique(records
        .flatMap((record) => [text(record.sourceKey), text(record.intakeSourceKey)])
        .filter((value): value is string => Boolean(value))),
    };
  };
  const provenanceBySourceId = new Map(snapshot.sources.map((source) => [source.id, provenanceFor(source)]));
  const strongCandidates = snapshot.sources.filter((source) => {
    const provenance = provenanceBySourceId.get(source.id);
    return source.sourceKey === intake.sourceKey
      || provenance?.intakeIds.includes(intake.id) === true
      || provenance?.sourceKeys.includes(intake.sourceKey) === true;
  });
  const exactUrl = canonical(selectedPrimaryPageUrl);
  const exactListingCandidates = exactUrl
    ? snapshot.sources.filter((source) => canonical(source.listUrl) === exactUrl)
    : [];
  const anchoredById = new Map<string, SourceRow>();
  [...explicitCandidates, ...strongCandidates, ...exactListingCandidates]
    .forEach((source) => anchoredById.set(source.id, source));
  const anchoredCandidates = Array.from(anchoredById.values()).sort(compareId);
  const selectedCandidates = explicitIds.length
    ? explicitCandidates
    : strongCandidates.length
      ? strongCandidates
      : exactListingCandidates;
  const selectedIds = new Set(selectedCandidates.map((source) => source.id));
  const competingCandidates = anchoredCandidates.filter((source) => !selectedIds.has(source.id));
  if (strongCandidates.length > 1 || competingCandidates.length > 0) {
    reasons.push('SOURCE_IDENTITY_CONFLICT');
  }
  const sourceOwnerIntakeIdsBySourceId = new Map<string, Set<string>>();
  for (const owner of snapshot.sourceOwners) {
    const ownerIntakeIds = sourceOwnerIntakeIdsBySourceId.get(owner.affiliateSourceId);
    if (ownerIntakeIds) ownerIntakeIds.add(owner.id);
    else sourceOwnerIntakeIdsBySourceId.set(owner.affiliateSourceId, new Set([owner.id]));
  }
  if (anchoredCandidates.some((source) => {
    const provenance = provenanceBySourceId.get(source.id);
    const ownerIntakeIds = sourceOwnerIntakeIdsBySourceId.get(source.id);
    return provenance?.intakeIds.some((id) => id !== intake.id) === true
      || provenance?.sourceKeys.some((key) => key !== intake.sourceKey) === true
      || Boolean(ownerIntakeIds && (ownerIntakeIds.size > 1 || !ownerIntakeIds.has(intake.id)));
  })) {
    reasons.push('SOURCE_IDENTITY_CONFLICT');
  }
  const candidates = Array.from(new Map(
    [...selectedCandidates, ...competingCandidates].map((source) => [source.id, source]),
  ).values()).sort(compareId);
  if (candidates.length > 1) reasons.push('AMBIGUOUS_SOURCE_IDENTITY');
  if (job.sourceId && candidates.length === 1 && candidates[0]!.id !== job.sourceId) {
    reasons.push('MAPPING_JOB_SOURCE_CONFLICT');
  }
  if (intake.affiliateSourceId && candidates.length === 1 && candidates[0]!.id !== intake.affiliateSourceId) {
    reasons.push('INTAKE_SOURCE_CONFLICT');
  }
  if (requestedSourceIds.some((id) => explicitIds.length > 0 && !explicitIds.includes(id))) {
    reasons.push('SOURCE_IDENTITY_CONFLICT');
  }
  return { candidates, reasons };
};

const evidenceRootReferencesFor = (
  snapshot: Snapshot,
  intake: IntakeRow,
  identity: AffiliateSupplyIdentity,
  job: MappingJobRow,
  input: CommonInput,
): string[] => {
  const selection = evidenceSelectionFor(input, job);
  const activePages = snapshot.pages.filter((page) => (
    page.intakeId === intake.id
    && upper(page.status) === 'ACTIVE'
  ));
  const pageIds = new Set(
    selection
      ? [selection.pageId]
      : activePages
        .filter((page) => canonical(page.canonicalUrl) === identity.canonicalUrl)
        .map((page) => page.id),
  );
  const successfulRuns = snapshot.runs.filter((run) => (
    run.intakeId === intake.id && SUCCESSFUL_RUN_STATUSES.has(upper(run.status))
  ));
  const runIds = new Set(
    selection?.runId
      ? [selection.runId]
      : successfulRuns.map((run) => run.id),
  );
  return sortedUnique([
    ...activePages.filter((page) => pageIds.has(page.id))
      .map((page) => page.supplySourceId)
      .filter((id): id is string => Boolean(id)),
    ...successfulRuns.filter((run) => runIds.has(run.id))
      .map((run) => run.supplySourceId)
      .filter((id): id is string => Boolean(id)),
    ...snapshot.artifacts
      .filter((artifact) => (
        artifact.intakeId === intake.id
        && runIds.has(artifact.runId)
        && artifact.pageId !== null
        && pageIds.has(artifact.pageId)
      ))
      .map((artifact) => artifact.supplySourceId)
      .filter((id): id is string => Boolean(id)),
  ]);
};

const rootFor = (
  snapshot: Snapshot,
  identity: AffiliateSupplyIdentity,
  source: SourceRow | null,
  intake: IntakeRow,
  job: MappingJobRow,
  mapping: MappingRow | null,
  expectedCohort: string,
  evidenceRootIds: readonly string[],
): { root: RootRow | null; reasons: string[] } => {
  const reasons: string[] = [];
  const refs = sortedUnique([
    ...(job.supplySourceId ? [job.supplySourceId] : []),
    ...(intake.supplySourceId ? [intake.supplySourceId] : []),
    ...(source?.supplySourceId ? [source.supplySourceId] : []),
    ...(mapping?.supplySourceId ? [mapping.supplySourceId] : []),
    ...evidenceRootIds,
  ]);
  const matching = snapshot.roots.filter((root) => root.identityKey === identity.identityKey).sort(compareId);
  if (matching.length > 1) reasons.push('AMBIGUOUS_ROOT_IDENTITY');
  if (refs.length > 1) reasons.push('ROOT_REFERENCE_CONFLICT');
  const referenced = refs.length ? snapshot.roots.find((root) => root.id === refs[0]) ?? null : null;
  if (refs.length && !referenced) reasons.push('ROOT_REFERENCE_MISSING');
  if (referenced && referenced.identityKey !== identity.identityKey) reasons.push('ROOT_IDENTITY_CONFLICT');
  if (matching.length === 1 && referenced && matching[0]!.id !== referenced.id) reasons.push('ROOT_REFERENCE_CONFLICT');
  const root = matching.length === 1
    ? matching[0]!
    : referenced && referenced.identityKey === identity.identityKey
      ? referenced
      : null;
  if (root) {
    if (canonical(root.canonicalUrl) !== identity.canonicalUrl) reasons.push('ROOT_CANONICAL_URL_CONFLICT');
    if (root.origin !== identity.origin) reasons.push('ROOT_ORIGIN_CONFLICT');
    if (root.pathKey !== identity.pathKey) reasons.push('ROOT_PATH_CONFLICT');
    if (root.rolloutCohort !== expectedCohort) reasons.push('ROOT_ROLLOUT_COHORT_CONFLICT');
    if (root.intakeId && root.intakeId !== intake.id) reasons.push('ROOT_INTAKE_OWNERSHIP_CONFLICT');
    if (root.liveSourceId && root.liveSourceId !== (source?.id ?? null)) reasons.push('ROOT_SOURCE_OWNERSHIP_CONFLICT');
    if (source?.supplySourceId && source.supplySourceId !== root.id) reasons.push('SOURCE_ROOT_OWNERSHIP_CONFLICT');
    if (source && upper(root.targetKind) !== upper(source.targetKind)) reasons.push('ROOT_TARGET_KIND_CONFLICT');
  }
  return { root, reasons };
};

const evidenceSelectionFor = (input: CommonInput, job: MappingJobRow): ExistingDataRepairEvidenceSelection | null => (
  input.evidenceSelections?.find((selection) => selection.jobId === job.id) ?? null
);
type EvidencePair = { run: RunRow; page: PageRow; artifacts: ArtifactRow[] };
type PagePairResult = { run: RunRow | null; page: PageRow | null; pairs: EvidencePair[]; artifacts: ArtifactRow[]; reasons: string[] };
const urlOrigin = (value: string | null | undefined): string | null => {
  const normalized = canonical(value);
  if (!normalized) return null;
  try { return new URL(normalized).origin; } catch { return null; }
};
const pairForPage = (snapshot: Snapshot, run: RunRow, page: PageRow, reasons: string[]): EvidencePair | null => {
  const owned = snapshot.artifacts.filter((artifact) => artifact.intakeId === page.intakeId
    && artifact.runId === run.id
    && artifact.pageId === page.id
    && (artifact.kind === 'PAGE_HTML' || artifact.kind === 'PAGE_MARKDOWN'));
  const html = owned.filter((artifact) => artifact.kind === 'PAGE_HTML').sort(artifactSort);
  const markdown = owned.filter((artifact) => artifact.kind === 'PAGE_MARKDOWN').sort(artifactSort);
  if (html.length !== 1 || markdown.length !== 1) {
    if (html.length > 1 || markdown.length > 1) reasons.push(`AMBIGUOUS_PAIRED_EVIDENCE_${page.id}`);
    else reasons.push(`PAIRED_EVIDENCE_MISSING_${page.id}`);
    return null;
  }
  return { run, page, artifacts: [html[0]!, markdown[0]!] };
};
const checkPairOwnership = (
  pair: EvidencePair,
  identity: AffiliateSupplyIdentity,
  source: SourceRow | null,
  rootId: string | null,
  primary: boolean,
  reasons: string[],
): void => {
  const expectedOrigin = urlOrigin(identity.canonicalUrl);
  const pageCanonical = canonical(pair.page.canonicalUrl);
  if (!pageCanonical || !expectedOrigin || urlOrigin(pageCanonical) !== expectedOrigin) reasons.push('EVIDENCE_PAGE_ORIGIN_CONFLICT');
  if (primary && pageCanonical !== identity.canonicalUrl) reasons.push('EVIDENCE_PAGE_URL_CONFLICT');
  if (pair.run.intakeId !== pair.page.intakeId) reasons.push('EVIDENCE_RUN_INTAKE_OWNERSHIP_CONFLICT');
  if (pair.run.supplySourceId != null && pair.run.supplySourceId !== rootId) reasons.push('EVIDENCE_ROOT_OWNERSHIP_CONFLICT');
  if (pair.page.supplySourceId != null && pair.page.supplySourceId !== rootId) reasons.push('EVIDENCE_PAGE_ROOT_OWNERSHIP_CONFLICT');
  for (const artifact of pair.artifacts) {
    const urls = [artifact.sourceUrl, artifact.finalUrl].filter((value): value is string => Boolean(value));
    const origins = urls.map(urlOrigin);
    if (!urls.length || origins.some((origin) => origin !== expectedOrigin)) reasons.push(`EVIDENCE_ORIGIN_CONFLICT_${artifact.kind}`);
    if (primary && urls.map(canonical).some((url) => url !== identity.canonicalUrl)) reasons.push(`EVIDENCE_URL_CONFLICT_${artifact.kind}`);
    if (artifact.supplySourceId != null && artifact.supplySourceId !== rootId) reasons.push('EVIDENCE_ROOT_OWNERSHIP_CONFLICT');
    if (artifact.intakeId !== pair.page.intakeId || artifact.runId !== pair.run.id || artifact.pageId !== pair.page.id) {
      reasons.push('EVIDENCE_ARTIFACT_OWNERSHIP_CONFLICT');
    }
  }
};
const pagePairFor = (
  snapshot: Snapshot,
  intake: IntakeRow,
  source: SourceRow | null,
  identity: AffiliateSupplyIdentity,
  job: MappingJobRow,
  input: CommonInput,
  rootId: string | null,
): PagePairResult => {
  const reasons: string[] = [];
  const activePages = snapshot.pages.filter((candidate) => (
    candidate.intakeId === intake.id && upper(candidate.status) === 'ACTIVE'
  ));
  const selection = evidenceSelectionFor(input, job);
  const exactPages = activePages.filter((candidate) => canonical(candidate.canonicalUrl) === identity.canonicalUrl);
  const primaryPages = selection ? activePages.filter((candidate) => candidate.id === selection.pageId) : exactPages;
  if (selection && primaryPages.length === 0) reasons.push('SELECTED_EVIDENCE_PAGE_NOT_FOUND');
  if (!selection && primaryPages.length > 1) reasons.push('AMBIGUOUS_EVIDENCE_PAGE');
  const page = primaryPages.length === 1 ? primaryPages[0]! : null;
  if (!page) {
    if (!reasons.length) reasons.push('EVIDENCE_PAGE_MISSING');
    return { run: null, page: null, pairs: [], artifacts: [], reasons };
  }
  if (canonical(page.canonicalUrl) !== identity.canonicalUrl) reasons.push('EVIDENCE_PAGE_URL_CONFLICT');
  const runs = snapshot.runs.filter((candidate) => (
    candidate.intakeId === intake.id && SUCCESSFUL_RUN_STATUSES.has(upper(candidate.status))
  ));
  const selectedRun = selection ? runs.find((candidate) => candidate.id === selection.runId) ?? null : null;
  if (selection && !selectedRun) reasons.push('SELECTED_EVIDENCE_RUN_NOT_FOUND');
  const runsToInspect = selection ? (selectedRun ? [selectedRun] : []) : runs;
  const primaryPairs: EvidencePair[] = [];
  for (const run of runsToInspect) {
    const pair = pairForPage(snapshot, run, page, reasons);
    if (pair) primaryPairs.push(pair);
  }
  if (!selection && primaryPairs.length > 1) reasons.push('AMBIGUOUS_EVIDENCE_RUN');
  const primaryPair = primaryPairs.length === 1 ? primaryPairs[0]! : null;
  if (!primaryPair) {
    if (!reasons.some((code) => code.startsWith('EVIDENCE_') || code.includes('PAIRED'))) reasons.push('PAIRED_EVIDENCE_MISSING');
    return { run: null, page, pairs: [], artifacts: [], reasons };
  }
  checkPairOwnership(primaryPair, identity, source, rootId, true, reasons);
  const pairs: EvidencePair[] = [primaryPair];
  if (selection?.supportingPageIds?.length) {
    const supportIds = new Set<string>(selection.supportingPageIds);
    for (const supportId of supportIds) {
      const supportPage = activePages.find((candidate) => candidate.id === supportId) ?? null;
      if (!supportPage) {
        reasons.push('SUPPORTING_EVIDENCE_PAGE_NOT_FOUND');
        continue;
      }
      if (supportPage.id === page.id) {
        reasons.push('SUPPORTING_EVIDENCE_PAGE_DUPLICATE');
        continue;
      }
      if (urlOrigin(supportPage.canonicalUrl) !== urlOrigin(identity.canonicalUrl)) {
        reasons.push('SUPPORTING_EVIDENCE_ORIGIN_CONFLICT');
        continue;
      }
      const supportPair = pairForPage(snapshot, primaryPair.run, supportPage, reasons);
      if (!supportPair) continue;
      checkPairOwnership(supportPair, identity, source, rootId, false, reasons);
      pairs.push(supportPair);
    }
  }
  return {
    run: primaryPair.run,
    page: primaryPair.page,
    pairs,
    artifacts: pairs.flatMap((pair) => pair.artifacts),
    reasons,
  };
};

const verifyArtifact = async (
  artifact: ArtifactRow,
  file: FileRow,
  store: AffiliateAgentArtifactStore | undefined,
): Promise<string | null> => {
  const expectedHash = normalizeHash(artifact.contentHash);
  if (!expectedHash) return 'INVALID_ARTIFACT_HASH';
  const artifactMime = text(artifact.mimeType);
  const fileMime = text(file.mimeType);
  if (!file.path || !artifactMime || !fileMime) return 'INVALID_STORAGE_FILE';
  if (artifactMime !== fileMime) return 'ARTIFACT_MIME_METADATA_CONFLICT';
  if (
    !Number.isInteger(artifact.sizeBytes)
    || artifact.sizeBytes! < 0
    || !Number.isInteger(file.sizeBytes)
    || file.sizeBytes! < 0
  ) return 'INVALID_ARTIFACT_SIZE';
  if (artifact.sizeBytes !== file.sizeBytes) return 'ARTIFACT_SIZE_METADATA_CONFLICT';
  if (!store) return 'ARTIFACT_BYTES_UNAVAILABLE';
  try {
    const read = await store.readImmutable({
      fileId: `intake-artifact:${artifact.id}`,
      maximumBytes: AFFILIATE_EXISTING_DATA_REPAIR_MAX_ARTIFACT_BYTES,
    });
    const digest = createHash('sha256').update(read.bytes).digest('hex');
    if (
      digest !== expectedHash
      || read.byteSize !== artifact.sizeBytes
      || read.bytes.byteLength !== artifact.sizeBytes
    ) return 'ARTIFACT_BYTES_MISMATCH';
    if (read.mimeType !== artifactMime) return 'ARTIFACT_MIME_MISMATCH';
    if (read.intakeId && read.intakeId !== artifact.intakeId) return 'ARTIFACT_INTAKE_OWNERSHIP_CONFLICT';
    if (read.runId && read.runId !== artifact.runId) return 'ARTIFACT_RUN_OWNERSHIP_CONFLICT';
    if (read.sourceUrl && canonical(read.sourceUrl) !== canonical(artifact.sourceUrl)) return 'ARTIFACT_SOURCE_URL_DRIFT';
    if (read.finalUrl && canonical(read.finalUrl) !== canonical(artifact.finalUrl)) return 'ARTIFACT_FINAL_URL_DRIFT';
  } catch {
    return 'ARTIFACT_BYTES_UNAVAILABLE';
  }
  return null;
};
const artifactManifestFor = async (snapshot: Snapshot, pairs: readonly EvidencePair[], job: MappingJobRow, store: AffiliateAgentArtifactStore | undefined): Promise<{ entries: ExistingDataRepairArtifact[]; reasons: string[] }> => {
  const reasons: string[] = [];
  const files = new Map(snapshot.files.map((file) => [file.id, file]));
  const entries: ExistingDataRepairArtifact[] = [];
  for (const pair of pairs) {
    for (const artifact of pair.artifacts) {
      const file = files.get(artifact.fileId);
      if (!file) { reasons.push(`MISSING_STORAGE_FILE_${artifact.kind}`); continue; }
      const failure = await verifyArtifact(artifact, file, store);
      if (failure) reasons.push(`${failure}_${artifact.kind}`);
      const sha256 = normalizeHash(artifact.contentHash);
      const byteSize = artifact.sizeBytes;
      const mimeType = text(artifact.mimeType);
      if (
        sha256
        && typeof byteSize === 'number'
        && Number.isInteger(byteSize)
        && byteSize >= 0
        && mimeType
        && mimeType === text(file.mimeType)
        && file.sizeBytes === byteSize
        && !failure
      ) entries.push({
        kind: artifact.kind as 'PAGE_HTML' | 'PAGE_MARKDOWN',
        artifactId: `intake-artifact:${artifact.id}`,
        sourceArtifactId: file.id,
        storageKey: file.path,
        sha256,
        mimeType,
        byteSize,
        sourceUrl: artifact.sourceUrl,
        finalUrl: artifact.finalUrl,
        intakeArtifactId: artifact.id,
        runId: pair.run.id,
        pageId: pair.page.id,
      });
  }
  }
  if (entries.length < 2 || entries.length > 6) reasons.push('PAIRED_EVIDENCE_INVALID');
  return { entries, reasons };
};
const manifestFor = (entries: readonly ExistingDataRepairArtifact[], jobId: string): AffiliateAgentEvidenceManifest => {
  const preimage = {
    schemaVersion: 1 as const,
    entries: entries.map((entry) => ({
      evidenceRef: `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${jobId}:${entry.pageId}:${entry.kind.toLowerCase()}`,
      kind: entry.kind,
      artifactId: entry.artifactId,
      sha256: entry.sha256,
      mimeType: entry.mimeType,
      byteSize: entry.byteSize,
      retention: 'INDEFINITE' as const,
    })).sort((a, b) => a.evidenceRef.localeCompare(b.evidenceRef)),
  };
  const parsed = affiliateAgentEvidenceManifestSchema.safeParse({ ...preimage, hash: hash(preimage) });
  if (!parsed.success) throw new AffiliateExistingDataRepairAdmissionError('INVALID_EVIDENCE_MANIFEST', parsed.error.message);
  return parsed.data;
};

const sourceKindAssessmentFor = (
  intake: IntakeRow,
  source: SourceRow | null,
  root: RootRow | null,
  run: RunRow,
  page: PageRow | null,
): { assessment?: AffiliateAgentSourceKindAssessment; reasons: string[] } => {
  const sourceKind = upper(source?.targetKind);
  const rootKind = upper(root?.targetKind);
  const authoritativeKind = sourceKind && sourceKind !== 'UNCLASSIFIED'
    ? sourceKind
    : rootKind && rootKind !== 'UNCLASSIFIED'
      ? rootKind
      : null;
  if (authoritativeKind) return { reasons: [] };
  const intakeHints = sortedUnique((intake.targetKindHints ?? []).map(upper));
  const pageHints = sortedUnique((page?.targetKindHints ?? []).map(upper));
  const unsupported = [...intakeHints, ...pageHints]
    .filter((hint) => !SUPPORTED_KINDS.has(hint as AffiliateAgentListingKind));
  if (unsupported.length) return { reasons: ['UNSUPPORTED_TARGET_KIND_HINT'] };
  if (intakeHints.length && pageHints.length) {
    const overlap = intakeHints.filter((hint) => pageHints.includes(hint));
    if (!overlap.length) return { reasons: ['TARGET_KIND_HINT_CONFLICT'] };
  }
  const hints = intakeHints.length && pageHints.length
    ? intakeHints.filter((hint) => pageHints.includes(hint))
    : intakeHints.length ? intakeHints : pageHints;
  const allowedListingKinds = (hints.length ? hints : ['CLUB', 'EVENT', 'RENTAL'])
    .filter((kind): kind is AffiliateAgentListingKind => SUPPORTED_KINDS.has(kind as AffiliateAgentListingKind))
    .sort();
  const assessment = affiliateAgentSourceKindAssessmentSchema.safeParse({
    schemaVersion: 1,
    state: 'UNCLASSIFIED',
    intakeId: intake.id,
    evidenceRunId: run.id,
    allowedListingKinds,
  });
  if (!assessment.success) return { reasons: ['INVALID_SOURCE_KIND_ASSESSMENT'] };
  return { assessment: assessment.data, reasons: [] };
};
const sourceSportScopeFor = (job: MappingJobRow, source: SourceRow | null): { scope?: AffiliateAgentSourceSportScope; reasons: string[] } => {
  const sourceRaw = recordValue(recordValue(source?.metadata).existingDataRepair).sourceSportScope;
  const jobRaw = recordValue(priorContextFor(job)).sourceSportScope;
  const reasons: string[] = [];
  const sourceParsed = sourceRaw === undefined
    ? null
    : affiliateAgentSourceSportScopeSchema.safeParse(sourceRaw);
  const jobParsed = jobRaw === undefined
    ? null
    : affiliateAgentSourceSportScopeSchema.safeParse(jobRaw);
  if (sourceParsed && !sourceParsed.success) reasons.push('INVALID_SOURCE_SPORT_SCOPE');
  if (jobParsed && !jobParsed.success) reasons.push('INVALID_SOURCE_SPORT_SCOPE');
  if (sourceParsed?.success && jobParsed?.success && !sameValue(sourceParsed.data, jobParsed.data)) {
    reasons.push('SOURCE_SPORT_SCOPE_CONFLICT');
  }
  if (sourceParsed?.success) return { scope: sourceParsed.data, reasons };
  if (sourceRaw !== undefined) return { reasons };
  if (jobParsed?.success) return { scope: jobParsed.data, reasons };
  return { reasons };
};

const policyKeyForUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return affiliateDiscoveryPolicyKeyForUrl(value);
  } catch {
    return null;
  }
};

const policyAllowedNow = (policy: DomainPolicyRow | null, now = Date.now()): boolean => {
  if (!policy || upper(policy.status) !== 'ALLOWED') return false;
  if (policy.expiresAt === null || policy.expiresAt === undefined) return true;
  const expiry = policy.expiresAt instanceof Date ? policy.expiresAt.getTime() : Date.parse(policy.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
};

const appendCurrentPolicyReasons = (
  snapshot: Snapshot,
  urls: readonly (string | null | undefined)[],
  reasons: string[],
): void => {
  const keys = sortedUnique(urls.map(policyKeyForUrl).filter((key): key is string => Boolean(key)));
  for (const key of keys) {
    const policy = snapshot.policies.find((candidate) => candidate.policyKey === key) ?? null;
    if (!policy) reasons.push('SOURCE_POLICY_MISSING');
    else if (upper(policy.status) !== 'ALLOWED') reasons.push('SOURCE_POLICY_NOT_ALLOWED');
    else if (!policyAllowedNow(policy)) reasons.push('SOURCE_POLICY_EXPIRED');
  }
  if (urls.some((url) => url !== null && url !== undefined && !policyKeyForUrl(url))) {
    reasons.push('SOURCE_POLICY_IDENTITY_UNVERIFIABLE');
  }
};

const assertCurrentPolicies = async (
  client: Client,
  urls: readonly (string | null | undefined)[],
): Promise<void> => {
  const db = client as unknown as AnyDelegate;
  const keys = sortedUnique(urls.map(policyKeyForUrl).filter((key): key is string => Boolean(key)));
  const policies = keys.length
    ? await delegateRows<DomainPolicyRow>(db.affiliateSourceDomainPolicies, {
      where: { policyKey: { in: keys } },
      orderBy: { policyKey: 'asc' },
      take: keys.length,
    })
    : [];
  const byKey = new Map(policies.map((policy) => [policy.policyKey, policy]));
  if (urls.some((url) => url !== null && url !== undefined && !policyKeyForUrl(url))) {
    bindingError('The repair source policy identity is invalid.');
  }
  for (const key of keys) {
    const policy = byKey.get(key) ?? null;
    if (!policy) bindingError('The current repair source policy is missing.');
    if (upper(policy.status) !== 'ALLOWED') bindingError('The current repair source policy is not allowed.');
    if (!policyAllowedNow(policy)) bindingError('The current repair source policy has expired.');
  }
};
const stableStateFingerprint = (input: Readonly<Record<string, unknown>>): string => hash(input);

const deterministicRow = (row: AffiliateExistingDataRepairAdmissionRow): JsonRecord => ({
  jobId: row.jobId,
  mappingJobId: row.mappingJobId,
  intakeId: row.intakeId,
  status: row.status,
  sourceKey: row.sourceKey,
  sourceId: row.sourceId,
  mappingId: row.mappingId,
  supplySourceId: row.supplySourceId,
  rootId: row.rootId,
  rootIdentityKey: row.rootIdentityKey,
  sourceIdentityKey: row.sourceIdentityKey,
  evidencePageIds: row.evidencePageIds,
  evidenceRunId: row.evidenceRunId,
  evidencePageId: row.evidencePageId,
  sportsCatalogSha256: row.sportsCatalogSha256,
  sourceStateSha256: row.sourceStateSha256,
  workingMappingId: row.workingMappingId,
  isPublicReplacement: row.isPublicReplacement,
  sourceKindAssessment: row.sourceKindAssessment ?? null,
  artifacts: row.artifacts,
  gatewayJobId: row.gatewayJobId,
  gatewayDedupeKey: row.gatewayDedupeKey,
  stateFingerprint: row.stateFingerprint,
  eligible: row.eligible,
  alreadyAdmitted: row.alreadyAdmitted,
  reason: row.reason,
  reasonCodes: row.reasonCodes,
  write: row.write ?? null,
});
const writeFor = (plan: Plan): AffiliateExistingDataRepairAdmissionWrite => ({
  mappingJobId: plan.job.id,
  intakeId: plan.intake.id,
  sourceAction: plan.source ? 'REUSE_SOURCE' : 'CREATE_SOURCE',
  rootAction: plan.root ? 'REUSE_ROOT' : 'CREATE_ROOT',
  sourceId: plan.source?.id ?? null,
  rootIdentityKey: plan.identity.identityKey,
  supplySourceId: plan.root?.id ?? null,
  evidenceRunId: plan.run.id,
  artifactIds: plan.evidence.map((entry) => entry.artifactId).sort(),
  gatewayDedupeKey: plan.gatewayDedupeKey,
  writes: [
    'AFFILIATE_EXISTING_REPAIR_SOURCE_LINK',
    'AFFILIATE_EXISTING_REPAIR_ROOT_LINK',
    'AFFILIATE_EXISTING_REPAIR_MAPPING_JOB_LINK',
    'AFFILIATE_EXISTING_REPAIR_EVIDENCE_PIN',
    'AFFILIATE_EXISTING_REPAIR_GATEWAY_JOB',
    'AFFILIATE_EXISTING_REPAIR_CONTEXT',
    'AFFILIATE_EXISTING_REPAIR_AUDIT',
    'AFFILIATE_EXISTING_REPAIR_LEGACY_QUEUE_RETIREMENT',
  ],
});
const reportHashFor = (input: Readonly<{
  contractVersion: number;
  contractHash: string;
  reason: string;
  operatorId: string;
  requestedJobIds: readonly string[] | null;
  requestedSourceIds: readonly string[] | null;
  evidenceSelections: readonly ExistingDataRepairEvidenceSelection[] | null;
  selectionLimit: number;
  counts: AffiliateExistingDataRepairAdmissionCounts;
  selectedJobIds: readonly string[];
  rows: readonly AffiliateExistingDataRepairAdmissionRow[];
  proposedWrites: readonly AffiliateExistingDataRepairAdmissionWrite[];
}>): string => hash({
  schemaVersion: AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_SCHEMA_VERSION,
  contractVersion: input.contractVersion,
  contractHash: input.contractHash,
  reason: input.reason,
  operatorId: input.operatorId,
  requestedJobIds: input.requestedJobIds ? [...input.requestedJobIds].sort() : null,
  requestedSourceIds: input.requestedSourceIds ? [...input.requestedSourceIds].sort() : null,
  evidenceSelections: input.evidenceSelections,
  selectionLimit: input.selectionLimit,
  counts: input.counts,
  selectedJobIds: [...input.selectedJobIds].sort(),
  rows: [...input.rows].sort((a, b) => (a.jobId ?? '').localeCompare(b.jobId ?? '')).map(deterministicRow),
  proposedWrites: [...input.proposedWrites].sort((a, b) => a.mappingJobId.localeCompare(b.mappingJobId)),
});

const loadBaseline = async (
  client: Client,
  sourceId: string,
  resolvedRoot?: AffiliateSupplySources | null,
): Promise<Baseline> => (
  resolvedRoot === undefined
    ? captureAffiliateExistingRepairSourceState(
      client as unknown as Parameters<typeof captureAffiliateExistingRepairSourceState>[0],
      sourceId,
    )
    : captureAffiliateExistingRepairSourceState(
      client as unknown as Parameters<typeof captureAffiliateExistingRepairSourceState>[0],
      sourceId,
      { resolvedRoot },
    )
);
const evaluateJob = async (
  client: Client,
  snapshot: Snapshot,
  job: MappingJobRow,
  input: CommonInput,
  parsedBundle: AffiliateAgentContractBundle,
): Promise<{ row: AffiliateExistingDataRepairAdmissionRow; plan: Plan | null }> => {
  const intake = snapshot.intakes.find((candidate) => candidate.id === job.intakeId) ?? null;
  const reasons: string[] = [];
  if (!intake) {
    const row: AffiliateExistingDataRepairAdmissionRow = {
      jobId: job.id,
      mappingJobId: job.id,
      intakeId: null,
      status: job.status,
      sourceKey: null,
      sourceId: job.sourceId,
      mappingId: job.mappingId,
      supplySourceId: job.supplySourceId,
      rootId: null,
      rootIdentityKey: null,
      sourceIdentityKey: null,
      evidenceRunId: null,
      evidencePageId: null,
      evidencePageIds: [],
      sportsCatalogSha256: snapshot.sportsCatalog.sha256,
      sourceStateSha256: null,
      workingMappingId: null,
      isPublicReplacement: false,
      artifacts: [],
      gatewayJobId: null,
      gatewayDedupeKey: null,
      stateFingerprint: stableStateFingerprint({ job }),
      eligible: false,
      alreadyAdmitted: false,
      reason: 'INTAKE_MISSING',
      reasonCodes: ['INTAKE_MISSING'],
      outcome: 'HELD',
    };
    return { row, plan: null };
  }
  if (admissionHistoryHasMalformedEntry(job.resultSummary)) reasons.push('PRIOR_ADMISSION_HISTORY_INVALID');

  if (upper(intake.complianceStatus) !== 'ALLOWED') {
    reasons.push(intake.complianceStatus ? 'SOURCE_POLICY_NOT_ALLOWED' : 'SOURCE_POLICY_MISSING');
  }
  if (['BLOCKED', 'EXCLUDED', 'POLICY_BLOCKED', 'REPLACED'].includes(upper(intake.status))) reasons.push('INTAKE_BLOCKED');
  if (activeLease(job)) reasons.push('MAPPING_JOB_HAS_ACTIVE_LEASE');
  const siblings = snapshot.jobs.filter((candidate) => (
    candidate.intakeId === intake.id
    && candidate.id !== job.id
    && ACTIVE_JOB_STATUSES.has(upper(candidate.status))
  ));
  if (siblings.length) reasons.push('ACTIVE_MAPPING_JOB_PRESENT');
  if (snapshot.approvals.some((approval) => (
    approval.subjectType === 'MAPPING_PACKAGE'
    && approval.subjectKey === job.id
    && ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(upper(approval.status))
  ))) reasons.push('ACTIVE_APPROVAL_PRESENT');

  const knownMapping = job.mappingId
    ? snapshot.mappings.find((candidate) => candidate.id === job.mappingId) ?? null
    : null;
  const jobRequestedSourceIds = (input.sourceIds ?? []).filter((sourceId) => (
    sourceId === job.sourceId
    || sourceId === intake.affiliateSourceId
    || sourceId === knownMapping?.sourceId
  ));
  const selection = evidenceSelectionFor(input, job);
  const selectedPrimaryPageUrl = selection
    ? snapshot.pages.find((candidate) => (
      candidate.id === selection.pageId
      && candidate.intakeId === intake.id
      && upper(candidate.status) === 'ACTIVE'
    ))?.canonicalUrl ?? null
    : null;
  const sourceResolution = sourceCandidatesFor(
    snapshot,
    job,
    intake,
    jobRequestedSourceIds,
    knownMapping?.sourceId ?? null,
    selectedPrimaryPageUrl,
  );
  reasons.push(...sourceResolution.reasons);
  const source = sourceResolution.candidates.length === 1 ? sourceResolution.candidates[0]! : null;
  if (!source && sourceResolution.candidates.length > 1) reasons.push('SOURCE_IDENTITY_AMBIGUOUS');
  if (source && job.sourceId && job.sourceId !== source.id) reasons.push('MAPPING_JOB_SOURCE_CONFLICT');
  if (source && intake.affiliateSourceId && intake.affiliateSourceId !== source.id) reasons.push('INTAKE_SOURCE_CONFLICT');
  const mapping = knownMapping
    ?? (source?.activeMappingId
      ? snapshot.mappings.find((candidate) => candidate.id === source.activeMappingId) ?? null
      : null);
  if (job.mappingId && !mapping) reasons.push('MAPPING_MISSING');
  if (mapping && source && mapping.sourceId !== source.id) reasons.push('MAPPING_SOURCE_OWNERSHIP_CONFLICT');
  const identityFromSource = source ? identityForSource(source, null, intake) : null;
  if (source && !identityFromSource) reasons.push('SOURCE_IDENTITY_UNVERIFIABLE');
  const identity = identityFromSource ?? (
    source ? null : sourceIdentityForNoSource(snapshot, intake, input, job)
  );
  if (!identity) reasons.push('EXACT_PAGE_IDENTITY_MISSING');

  const evidenceRootIds = identity
    ? evidenceRootReferencesFor(snapshot, intake, identity, job, input)
    : [];
  const expectedCohort = cohort(parsedBundle);
  const rootState = identity
    ? rootFor(snapshot, identity, source, intake, job, mapping, expectedCohort, evidenceRootIds)
    : { root: null, reasons: [] as string[] };
  reasons.push(...rootState.reasons);
  const root = rootState.root;
  if (source && ['BLOCKED', 'EXCLUDED', 'POLICY_BLOCKED', 'REPLACED'].includes(upper(source.status))) {
    reasons.push('SOURCE_EXCLUDED_OR_REPLACED');
  }
  if (root && (
    root.isExcluded === true
    || ['SOURCE_EXCLUDED', 'SUPERSEDED'].includes(upper(root.derivedStage))
    || text(root.successorId) !== null
  )) reasons.push('SOURCE_EXCLUDED_OR_REPLACED');
  if (source && upper(source.targetKind) !== 'UNCLASSIFIED' && !SUPPORTED_KINDS.has(upper(source.targetKind) as AffiliateAgentListingKind)) {
    reasons.push('SOURCE_LISTING_KIND_UNSUPPORTED');
  }
  if (root && !source && upper(root.targetKind) !== 'UNCLASSIFIED'
    && !SUPPORTED_KINDS.has(upper(root.targetKind) as AffiliateAgentListingKind)) {
    reasons.push('ROOT_TARGET_KIND_CONFLICT');
  }
  if (mapping && root && mapping.supplySourceId && mapping.supplySourceId !== root.id) reasons.push('MAPPING_ROOT_OWNERSHIP_CONFLICT');
  if (source && root) reasons.push(...correctionHoldReasonsFor(source, root));

  const pair = identity
    ? pagePairFor(snapshot, intake, source, identity, job, input, root?.id ?? null)
    : { run: null, page: null, pairs: [], artifacts: [], reasons: ['EVIDENCE_PAGE_MISSING'] };
  reasons.push(...pair.reasons);
  const run = pair.run;
  const page = pair.page;
  if (!source && page && !SOURCE_CREATION_PRIMARY_PAGE_ROLES[upper(page.role)]) {
    reasons.push(SOURCE_CREATION_PAGE_ROLE_HOLD);
  }
  let evidence: ExistingDataRepairArtifact[] = [];
  let manifest: AffiliateAgentEvidenceManifest | null = null;
  if (run && page) {
    const checked = await artifactManifestFor(snapshot, pair.pairs, job, input.artifactStore);
    evidence = checked.entries;
    reasons.push(...checked.reasons);
    if (evidence.length >= 2 && evidence.length <= 6) {
      try {
        manifest = manifestFor(evidence, job.id);
      } catch {
        reasons.push('INVALID_EVIDENCE_MANIFEST');
      }
    }
  }
  const kindState = run
    ? sourceKindAssessmentFor(intake, source, root, run, page)
    : { reasons: [] as string[] };
  reasons.push(...kindState.reasons);
  const repairReasons = sortedUnique([input.reason, ...recordedRepairReasons(job.resultSummary)]);
  if (!affiliateAgentExistingDataRepairContextSchema.shape.repairReasons.safeParse(repairReasons).success) {
    reasons.push('REPAIR_REASONS_INVALID');
  }
  const baseline = source ? await loadBaselineSafe(client, source.id, reasons, root as unknown as AffiliateSupplySources | null) : null;
  const workingMappingId = baseline?.workingMappingId ?? source?.activeMappingId ?? null;
  const isPublicReplacement = baseline?.isPublicReplacement ?? false;
  if (isPublicReplacement && kindState.assessment) reasons.push('PUBLIC_UNCLASSIFIED_SOURCE');
  const sportScopeState = sourceSportScopeFor(job, source);
  reasons.push(...sportScopeState.reasons);
  if (sportScopeState.scope) {
    if (root && sportScopeState.scope.supplySourceId !== root.id) reasons.push('SOURCE_SPORT_SCOPE_ROOT_CONFLICT');
    if (sportScopeState.scope.intakeId !== intake.id) reasons.push('SOURCE_SPORT_SCOPE_INTAKE_CONFLICT');
  }
  const pendingValues = [
    recordValue(recordValue(source?.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]),
    recordValue(recordValue(root?.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]),
  ];
  const pendingValuesPresent = pendingValues.filter((value) => Object.keys(value).length > 0);
  if (pendingValuesPresent.length) {
    reasons.push('PENDING_REPAIR_PRESENT');
    if (pendingValuesPresent.length === 2 && !sameValue(pendingValuesPresent[0], pendingValuesPresent[1])) {
      reasons.push('PENDING_REPAIR_PROOF_CONFLICT');
    }
  }
  if (identity) {
    appendCurrentPolicyReasons(snapshot, [
      identity.canonicalUrl,
      intake.baseUrl,
      source?.listUrl,
      source?.baseUrl,
      ...pair.pairs.map((candidate) => candidate.page.canonicalUrl),
      ...pair.artifacts.flatMap((artifact) => [artifact.sourceUrl, artifact.finalUrl]),
    ], reasons);
  }

  const gatewayDedupeKey = identity && run && manifest
    ? `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${job.id}:${identity.identityKey}:${run.id}:${manifest.hash}:${hash({
      evidenceSelection: evidenceSelectionFor(input, job),
      sportsCatalogSha256: snapshot.sportsCatalog.sha256,
      sourceStateSha256: baseline?.sourceStateSha256 ?? null,
      sourceKindAssessment: kindState.assessment ?? null,
      sourceSportScope: sportScopeState.scope ?? null,
      repairReasons,
      deploymentContract: parsedBundle.deploymentContract,
      supplyContract: {
        version: parsedBundle.supplyContract.version,
        hash: parsedBundle.supplyContract.hash,
      },
    })}`
    : null;
  const history = admissionHistory(job.resultSummary);
  const matchingHistory = history.filter((entry) => {
    const parsed = affiliateAgentExistingDataRepairContextSchema.safeParse(entry.repairContext);
    if (!parsed.success || !baseline || !manifest || !identity) return false;
    const context = parsed.data;
    const recordedSelections = recordValue(entry.reportSnapshot).evidenceSelections;
    const recordedSelection = Array.isArray(recordedSelections)
      ? recordedSelections.find((selection) => recordValue(selection).jobId === job.id) ?? null
      : null;
    return context.intakeId === intake.id
      && context.evidenceRunId === run?.id
      && context.sourceId === source?.id
      && context.sourceIdentityKey === identity.identityKey
      && context.sportsCatalog.sha256 === snapshot.sportsCatalog.sha256
      && context.sourceStateSha256 === baseline.sourceStateSha256
      && context.workingMappingId === baseline.workingMappingId
      && context.isPublicReplacement === baseline.isPublicReplacement
      && sameValue(context.deploymentContract, parsedBundle.deploymentContract)
      && sameValue(context.sourceKindAssessment ?? null, kindState.assessment ?? null)
      && sameValue(context.sourceSportScope ?? null, sportScopeState.scope ?? null)
      && sameValue(context.repairReasons, repairReasons)
      && recordValue(entry.manifest).hash === manifest.hash
      && sameValue(recordedSelection, evidenceSelectionFor(input, job));
  });
  const matchingGatewayIds = new Set(matchingHistory.map((entry) => text(entry.gatewayJobId)));
  const gatewayCandidates = gatewayDedupeKey
    ? snapshot.gatewayJobs.filter((candidate) => (
      candidate.role === 'MAPPING_PRODUCER'
      && candidate.subjectId === job.id
      && (candidate.dedupeKey === gatewayDedupeKey || matchingGatewayIds.has(candidate.id))
    ))
    : [];
  if (gatewayCandidates.length > 1) reasons.push('CONFLICTING_GATEWAY_REPAIR_JOB');
  const gatewayExisting = gatewayCandidates.length === 1 ? gatewayCandidates[0]! : null;
  if (gatewayExisting && activeGatewayClaim(snapshot, gatewayExisting)) reasons.push('ACTIVE_GATEWAY_CLAIM');
  const alreadyAdmittedCandidate = Boolean(
    gatewayExisting
    && !activeGatewayClaim(snapshot, gatewayExisting)
    && matchingGatewayIds.has(gatewayExisting.id),
  );
  const priorGatewayRepairs = snapshot.gatewayJobs.filter((candidate) => (
    candidate.role === 'MAPPING_PRODUCER'
    && candidate.subjectId === job.id
    && candidate.dedupeKey.startsWith(AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX)
    && candidate.id !== gatewayExisting?.id
  ));
  if (priorGatewayRepairs.some((candidate) => !TERMINAL_REPAIR_STATUSES.has(upper(candidate.status)))) {
    reasons.push('ACTIVE_GATEWAY_REPAIR_PRESENT');
  }
  const previousRuns = new Set(history.map((entry) => text(entry.evidenceRunId)).filter((value): value is string => Boolean(value)));
  const hasChangedContext = history.some((entry) => {
    const context = affiliateAgentExistingDataRepairContextSchema.safeParse(entry.repairContext);
    return context.success
      && context.data.evidenceRunId === run?.id
      && (
        context.data.sportsCatalog.sha256 !== snapshot.sportsCatalog.sha256
        || context.data.sourceStateSha256 !== baseline?.sourceStateSha256
        || !sameValue(context.data.deploymentContract, parsedBundle.deploymentContract)
        || !sameValue(context.data.sourceKindAssessment ?? null, kindState.assessment ?? null)
        || !sameValue(context.data.sourceSportScope ?? null, sportScopeState.scope ?? null)
        || !sameValue(context.data.repairReasons, repairReasons)
        || recordValue(entry.manifest).hash !== manifest?.hash
      );
  });
  if (TERMINAL_REPAIR_STATUSES.has(upper(job.status)) && previousRuns.has(run?.id ?? '') && !alreadyAdmittedCandidate && !hasChangedContext) {
    reasons.push('COMPLETED_WITHOUT_CHANGED_EVIDENCE');
  }
  if (gatewayExisting && !alreadyAdmittedCandidate) reasons.push('GATEWAY_DEDUPE_CONFLICT');
  const reasonCodes = sortedUnique(reasons);
  const alreadyAdmitted = alreadyAdmittedCandidate && reasonCodes.length === 0;
  const eligible = !alreadyAdmitted && reasonCodes.length === 0 && Boolean(identity && run && page && manifest && gatewayDedupeKey);
  const rowBase: AffiliateExistingDataRepairAdmissionRow = {
    jobId: job.id,
    mappingJobId: job.id,
    intakeId: intake.id,
    status: job.status,
    sourceKey: intake.sourceKey,
    sourceId: source?.id ?? null,
    mappingId: mapping?.id ?? job.mappingId ?? null,
    supplySourceId: root?.id ?? source?.supplySourceId ?? job.supplySourceId ?? null,
    rootId: root?.id ?? null,
    rootIdentityKey: identity?.identityKey ?? null,
    sourceIdentityKey: identity?.identityKey ?? null,
    evidenceRunId: run?.id ?? null,
    evidencePageId: page?.id ?? null,
    evidencePageIds: pair.pairs.map((candidate) => candidate.page.id).sort(),
    sportsCatalogSha256: snapshot.sportsCatalog.sha256,
    sourceStateSha256: baseline?.sourceStateSha256 ?? null,
    workingMappingId,
    isPublicReplacement,
    ...(kindState.assessment ? { sourceKindAssessment: kindState.assessment } : {}),
    artifacts: evidence,
    gatewayJobId: gatewayExisting?.id ?? null,
    gatewayDedupeKey,
    stateFingerprint: stableStateFingerprint({
      job,
      intake,
      source,
      mapping,
      root,
      run,
      page,
      evidencePages: pair.pairs.map((candidate) => candidate.page),
      evidenceRuns: pair.pairs.map((candidate) => candidate.run),
      artifacts: pair.artifacts,
      evidence,
      baseline: baseline?.sourceStateSha256 ?? null,
      policies: snapshot.policies,
      sportsCatalogSha256: snapshot.sportsCatalog.sha256,
      deploymentContract: parsedBundle.deploymentContract,
      sourceSportScope: sportScopeState.scope ?? null,
    }),
    eligible,
    alreadyAdmitted,
    reason: alreadyAdmitted ? 'ALREADY_ADMITTED' : (reasonCodes[0] ?? 'ELIGIBLE'),
    reasonCodes: alreadyAdmitted ? ['ALREADY_ADMITTED'] : reasonCodes,
    outcome: alreadyAdmitted ? 'ALREADY_ADMITTED' : eligible ? 'PROPOSED' : 'HELD',
  };
  if (!eligible || alreadyAdmitted || !identity || !run || !page || !manifest || !gatewayDedupeKey) {
    return { row: rowBase, plan: null };
  }
  const plan: Plan = {
    row: rowBase,
    job,
    intake,
    source,
    mapping,
    root,
    identity,
    run,
    page,
    artifacts: pair.artifacts,
    manifest,
    evidencePages: pair.pairs.map((candidate) => candidate.page),
    evidence,
    baseline,
    policySnapshots: snapshot.policies,
    sportsCatalog: snapshot.sportsCatalog,
    ...(kindState.assessment ? { sourceKindAssessment: kindState.assessment } : {}),
    ...(sportScopeState.scope ? { sourceSportScope: sportScopeState.scope } : {}),
    gatewayDedupeKey,
    sourceCreated: false,
  };
  const write = writeFor(plan);
  return { row: { ...rowBase, write }, plan };
};
const sourceIdentityForNoSource = (
  snapshot: Snapshot,
  intake: IntakeRow,
  input: CommonInput,
  job: MappingJobRow,
): AffiliateSupplyIdentity | null => {
  const activePages = snapshot.pages.filter((page) => (
    page.intakeId === intake.id && upper(page.status) === 'ACTIVE'
  ));
  const selection = evidenceSelectionFor(input, job);
  const pages = selection
    ? activePages.filter((page) => page.id === selection.pageId)
    : activePages.filter((page) => (
      upper(page.role) === 'LISTING'
      && (!intake.baseUrl || canonical(page.canonicalUrl) === canonical(intake.baseUrl))
    ));
  const canonicalPages = pages.filter((page) => canonical(page.canonicalUrl));
  const uniqueUrls = sortedUnique(canonicalPages.map((page) => canonical(page.canonicalUrl)!).filter(Boolean));
  if (uniqueUrls.length !== 1) return null;
  try {
    const url = uniqueUrls[0]!;
    return normalizeAffiliateSupplyIdentity({
      requestedUrl: url,
      resolvedCanonicalUrl: url,
      operatorDomain: new URL(url).hostname,
    });
  } catch {
    return null;
  }
};
const loadBaselineSafe = async (
  client: Client,
  sourceId: string,
  reasons: string[],
  resolvedRoot?: AffiliateSupplySources | null,
): Promise<Baseline | null> => {
  try { return await loadBaseline(client, sourceId, resolvedRoot); } catch { reasons.push('SOURCE_STATE_UNAVAILABLE'); return null; }
};

const buildReport = async (
  client: Client,
  input: CommonInput,
  parsedBundle: AffiliateAgentContractBundle,
  mode: 'PREVIEW' | 'APPLY',
): Promise<{ report: AffiliateExistingDataRepairAdmissionReport; plans: Plan[]; snapshot: Snapshot }> => {
  const validated = validateInput(input);
  const normalizedInput: CommonInput = {
    ...input,
    jobIds: validated.jobIds,
    sourceIds: validated.sourceIds,
    evidenceSelections: validated.evidenceSelections,
  };
  const snapshot = await readSnapshot(client, validated.jobIds ?? [], validated.sourceIds ?? []);
  const selectedSourceIntakeIds = new Set(
    snapshot.intakes
      .filter((intake) => validated.sourceIds?.includes(intake.affiliateSourceId ?? '') ?? false)
      .map((intake) => intake.id),
  );
  const selectedJobIds = sortedUnique(snapshot.jobs.filter((job) => (
    (validated.jobIds?.includes(job.id) ?? false)
    || (validated.sourceIds?.length
      ? validated.sourceIds.some((sourceId) => job.sourceId === sourceId)
        || selectedSourceIntakeIds.has(job.intakeId)
        || Boolean(job.mappingId && snapshot.mappings.some((mapping) => mapping.id === job.mappingId && mapping.sourceId && validated.sourceIds?.includes(mapping.sourceId)))
      : false)
  )).map((job) => job.id));
  const missingJobIds = (validated.jobIds ?? []).filter((id) => !selectedJobIds.includes(id));
  if (validated.evidenceSelections?.some((selection) => !selectedJobIds.includes(selection.jobId))) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'EVIDENCE_SELECTION_JOB_NOT_SELECTED',
      'Every evidence selection must identify one selected mapping job.',
    );
  }
  const evaluated = await Promise.all(
    snapshot.jobs
      .filter((job) => selectedJobIds.includes(job.id))
      .sort(compareId)
      .map((job) => evaluateJob(client, snapshot, job, normalizedInput, parsedBundle)),
  );
  for (const id of missingJobIds) {
    evaluated.push({
      row: {
        jobId: id,
        mappingJobId: id,
        intakeId: null,
        status: 'MISSING',
        sourceKey: null,
        sourceId: null,
        mappingId: null,
        supplySourceId: null,
        rootId: null,
        rootIdentityKey: null,
        sourceIdentityKey: null,
        evidenceRunId: null,
        evidencePageId: null,
        evidencePageIds: [],
        sportsCatalogSha256: snapshot.sportsCatalog.sha256,
        sourceStateSha256: null,
        workingMappingId: null,
        isPublicReplacement: false,
        artifacts: [],
        gatewayJobId: null,
        gatewayDedupeKey: null,
        stateFingerprint: hash({ missingJobId: id }),
        eligible: false,
        alreadyAdmitted: false,
        reason: 'MAPPING_JOB_MISSING',
        reasonCodes: ['MAPPING_JOB_MISSING'],
        outcome: 'HELD',
      },
      plan: null,
    });
  }
  const selectedSourceIdsWithJobs = new Set(
    selectedJobIds.flatMap((jobId) => {
      const job = snapshot.jobs.find((candidate) => candidate.id === jobId);
      const intake = job ? snapshot.intakes.find((candidate) => candidate.id === job.intakeId) : null;
      const mapping = job?.mappingId ? snapshot.mappings.find((candidate) => candidate.id === job.mappingId) : null;
      return [
        job?.sourceId ?? null,
        intake?.affiliateSourceId ?? null,
        mapping?.sourceId ?? null,
      ].filter((id): id is string => Boolean(id));
    }),
  );
  for (const sourceId of validated.sourceIds ?? []) {
    if (selectedSourceIdsWithJobs.has(sourceId)) continue;
    const source = snapshot.sources.find((candidate) => candidate.id === sourceId) ?? null;
    const root = source?.supplySourceId
      ? snapshot.roots.find((candidate) => candidate.id === source.supplySourceId) ?? null
      : null;
    evaluated.push({
      row: {
        jobId: null,
        mappingJobId: null,
        intakeId: null,
        status: 'MISSING_SOURCE_MAPPING_JOB',
        sourceKey: source?.sourceKey ?? null,
        sourceId,
        mappingId: source?.activeMappingId ?? null,
        supplySourceId: root?.id ?? source?.supplySourceId ?? null,
        rootId: root?.id ?? null,
        rootIdentityKey: root?.identityKey ?? null,
        sourceIdentityKey: source ? identityForSource(source)?.identityKey ?? null : null,
        evidenceRunId: null,
        evidencePageId: null,
        evidencePageIds: [],
        sportsCatalogSha256: snapshot.sportsCatalog.sha256,
        sourceStateSha256: null,
        workingMappingId: source?.activeMappingId ?? null,
        isPublicReplacement: false,
        artifacts: [],
        gatewayJobId: null,
        gatewayDedupeKey: null,
        stateFingerprint: hash({ missingSourceId: sourceId, source, root }),
        eligible: false,
        alreadyAdmitted: false,
        reason: 'MAPPING_JOB_MISSING_FOR_SOURCE',
        reasonCodes: ['MAPPING_JOB_MISSING_FOR_SOURCE'],
        outcome: 'HELD',
      },
      plan: null,
    });
  }
  const plansBySource = new Map<string, Plan[]>();
  for (const entry of evaluated) {
    if (!entry.plan || !entry.row.eligible) continue;
    const key = entry.plan.identity.identityKey;
    const current = plansBySource.get(key) ?? [];
    current.push(entry.plan);
    plansBySource.set(key, current);
  }
  const duplicateJobIds = new Set<string>();
  for (const plans of plansBySource.values()) {
    if (plans.length > 1) plans.forEach((plan) => duplicateJobIds.add(plan.job.id));
  }
  const rowsAfterDuplicates = evaluated.map((entry) => {
    if (entry.row.jobId === null || !duplicateJobIds.has(entry.row.jobId)) return entry;
    const marker = `DUPLICATE_SOURCE_SELECTION:${entry.row.sourceIdentityKey}`;
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
  const eligible = rowsAfterDuplicates
    .filter((entry) => entry.row.eligible && entry.plan)
    .sort((a, b) => (a.row.jobId ?? '').localeCompare(b.row.jobId ?? ''));
  const selected = eligible.slice(0, validated.limit);
  const selectedIds = selected
    .map((entry) => entry.row.jobId)
    .filter((id): id is string => Boolean(id));
  const selectedEntryKeys = new Set(selected.map((entry) => entry.row.jobId));
  const rows = rowsAfterDuplicates.map(({ row }) => {
    if (row.eligible && !selectedEntryKeys.has(row.jobId)) {
      const marker = 'SELECTION_LIMIT_EXCLUDED';
      return {
        ...row,
        eligible: false,
        reason: marker,
        reasonCodes: sortedUnique([...row.reasonCodes, marker]),
        outcome: 'HELD' as const,
      };
    }
    if (row.jobId !== null && selectedEntryKeys.has(row.jobId)) {
      return { ...row, outcome: mode === 'APPLY' ? 'APPLIED' as const : 'PROPOSED' as const };
    }
    return row;
  });
  const plans = selected.map((entry) => entry.plan!).sort((a, b) => a.job.id.localeCompare(b.job.id));
  const writes = plans.map(writeFor);
  const counts: AffiliateExistingDataRepairAdmissionCounts = {
    total: rows.length,
    eligible: rows.filter((row) => row.eligible).length,
    held: rows.filter((row) => !row.eligible && !row.alreadyAdmitted).length,
    selected: selected.length,
    alreadyAdmitted: rows.filter((row) => row.alreadyAdmitted).length,
  };
  const reportHash = reportHashFor({
    contractVersion: parsedBundle.supplyContract.version,
    contractHash: parsedBundle.supplyContract.hash,
    reason: validated.reason,
    operatorId: validated.operatorId,
    requestedJobIds: validated.jobIds ?? null,
    requestedSourceIds: validated.sourceIds ?? null,
    evidenceSelections: validated.evidenceSelections ?? null,
    selectionLimit: validated.limit,
    counts,
    selectedJobIds: selectedIds,
    rows,
    proposedWrites: writes,
  });
  return {
    snapshot,
    plans,
    report: {
      schemaVersion: 1,
      mode,
      evaluatedAt: new Date().toISOString(),
      contractVersion: parsedBundle.supplyContract.version,
      contractHash: parsedBundle.supplyContract.hash,
      reason: validated.reason,
      operatorId: validated.operatorId,
      requestedJobIds: validated.jobIds ?? null,
      requestedSourceIds: validated.sourceIds ?? null,
      evidenceSelections: validated.evidenceSelections ?? null,
      selectionLimit: validated.limit,
      selectedJobIds: selectedIds,
      proposedJobIds: selectedIds,
      counts,
      rows,
      proposedWrites: writes,
      reportHash,
      reviewedReportHash: null,
      writeCount: mode === 'APPLY' ? plans.length : 0,
      appliedJobs: [],
      replayed: false,
    },
  };
};
const appendHistory = (summary: unknown, entry: JsonRecord): JsonRecord => {
  const envelope = recordValue(summary);
  const rawHistory = admissionHistoryValues(summary);
  const history = admissionHistory(summary);
  if (
    !admissionHistoryHasMalformedEntry(summary)
    && history.some((candidate) => candidate.reportHash === entry.reportHash && candidate.gatewayJobId === entry.gatewayJobId)
  ) return envelope;
  return { ...envelope, existingDataRepairAdmissionHistory: [...rawHistory, entry] };
};
const appendMetadata = (
  metadata: unknown,
  context: AffiliateAgentExistingDataRepairContext,
  audit: JsonRecord,
): JsonRecord => ({
  ...recordValue(metadata),
  existingDataRepair: context,
  [AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]: audit,
});
const parseContext = (context: JsonRecord): AffiliateAgentExistingDataRepairContext => {
  const parsed = affiliateAgentExistingDataRepairContextSchema.safeParse(context);
  if (!parsed.success) throw new AffiliateExistingDataRepairAdmissionError('INVALID_REPAIR_CONTEXT', parsed.error.message);
  return parsed.data;
};

const createOrReuseSourceAndRoot = async (
  tx: Client,
  plan: Plan,
  reportHash: string,
  bundle: AffiliateAgentContractBundle,
  now: Date,
): Promise<{ source: SourceRow; root: RootRow }> => {
  const db = tx as unknown as AnyDelegate;
  let source: SourceRow;
  if (plan.source) {
    const current = await readUnique(db, 'affiliateScrapeSources', { where: { id: plan.source.id } }) as unknown as SourceRow | null;
    if (!current
      || current.sourceKey !== plan.source.sourceKey
      || canonical(current.listUrl) !== plan.identity.canonicalUrl
      || (current.supplySourceId && current.supplySourceId !== plan.source.supplySourceId)
    ) {
      throw new AffiliateExistingDataRepairAdmissionError('SOURCE_IDENTITY_DRIFT', `Source ${plan.source.id} changed after preview.`);
    }
    const pending = recordValue(recordValue(current.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]);
    if (Object.keys(pending).length) {
      throw new AffiliateExistingDataRepairAdmissionError('PENDING_REPAIR_PRESENT', `Source ${current.id} already has a pending repair.`);
    }
    source = current;
  } else {
    const existingByKey = await readUnique(db, 'affiliateScrapeSources', { where: { sourceKey: plan.intake.sourceKey } });
    if (existingByKey) throw new AffiliateExistingDataRepairAdmissionError('SOURCE_IDENTITY_DRIFT', `Source key ${plan.intake.sourceKey} is now occupied.`);
    const sourceHost = new URL(plan.identity.canonicalUrl).host.toLowerCase();
    const existingByIdentity = await snapshotRows<SourceRow>(db.affiliateScrapeSources, {
      where: {
        OR: [
          { listUrl: { contains: sourceHost, mode: 'insensitive' } },
          { baseUrl: { contains: sourceHost, mode: 'insensitive' } },
        ],
      },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'source identity candidates');
    if (existingByIdentity.some((candidate) => (
      canonical(candidate.listUrl) === plan.identity.canonicalUrl
      || canonical(candidate.baseUrl) === plan.identity.canonicalUrl
    ))) {
      throw new AffiliateExistingDataRepairAdmissionError('SOURCE_IDENTITY_DRIFT', `Source identity ${plan.identity.identityKey} is now occupied.`);
    }
    const id = createId();
    const created = await requiredWriteDelegateMethod(db, 'affiliateScrapeSources', 'create')({ data: {
      id,
      name: plan.intake.name?.trim() || plan.intake.sourceKey,
      sourceKey: plan.intake.sourceKey,
      organizationId: null,
      baseUrl: plan.identity.canonicalUrl,
      listUrl: plan.identity.canonicalUrl,
      targetKind: plan.root && upper(plan.root.targetKind) !== 'UNCLASSIFIED'
        ? upper(plan.root.targetKind)
        : 'UNCLASSIFIED',
      status: 'ACTIVE',
      activeMappingId: null,
      supplySourceId: null,
      autoScrapeEnabled: false,
      metadata: asJson({ existingDataRepairAdmission: { reportHash, mappingJobId: plan.job.id, intakeId: plan.intake.id } }),
      createdAt: now,
      updatedAt: now,
    } as unknown as Record<string, unknown> }) as unknown as SourceRow;
    source = created;
    plan.sourceCreated = true;
  }
  let root = plan.root;
  if (!root) {
    const existingByIdentity = await readUnique(db, 'affiliateSupplySources', { where: { identityKey: plan.identity.identityKey } });
    if (existingByIdentity) throw new AffiliateExistingDataRepairAdmissionError('ROOT_IDENTITY_DRIFT', `Supply Source ${plan.identity.identityKey} was created after preview.`);
    const ensured = await ensureAffiliateSupplySource({
      db: affiliateSupplyDatabase(tx as unknown as PrismaClient),
      requestedUrl: plan.identity.canonicalUrl,
      resolvedCanonicalUrl: plan.identity.canonicalUrl,
      isRedirectVerified: true,
      operatorDomain: new URL(plan.identity.canonicalUrl).hostname,
      targetKind: upper(source.targetKind) === 'UNCLASSIFIED' ? 'UNCLASSIFIED' : upper(source.targetKind),
      rolloutCohort: cohort(bundle),
      intakeId: plan.intake.id,
      expectedIntakeSupplySourceId: plan.intake.supplySourceId,
      liveSourceId: source.id,
      metadata: { existingDataRepairAdmission: { reportHash, mappingJobId: plan.job.id, intakeId: plan.intake.id } },
    });
    root = ensured.supplySource as unknown as RootRow;
  }
  const currentRoot = await readUnique(db, 'affiliateSupplySources', { where: { id: root.id } }) as unknown as RootRow | null;
  if (!currentRoot
    || currentRoot.identityKey !== plan.identity.identityKey
    || canonical(currentRoot.canonicalUrl) !== plan.identity.canonicalUrl
    || currentRoot.origin !== plan.identity.origin
    || currentRoot.pathKey !== plan.identity.pathKey
    || currentRoot.rolloutCohort !== cohort(bundle)
    || upper(currentRoot.targetKind) !== upper(source.targetKind)
  ) {
    throw new AffiliateExistingDataRepairAdmissionError('ROOT_IDENTITY_DRIFT', 'The existing-data repair Supply Source identity changed.');
  }
  if (currentRoot.intakeId && currentRoot.intakeId !== plan.intake.id) {
    throw new AffiliateExistingDataRepairAdmissionError('ROOT_SOURCE_DRIFT', `Supply Source ${root.id} is linked to another intake.`);
  }
  if (currentRoot.liveSourceId && currentRoot.liveSourceId !== source.id) {
    throw new AffiliateExistingDataRepairAdmissionError('ROOT_SOURCE_DRIFT', `Supply Source ${root.id} is linked to another source.`);
  }
  if (currentRoot.intakeId !== plan.intake.id || currentRoot.liveSourceId !== source.id) {
    const rootLink = await requiredWriteDelegateMethod(db, 'affiliateSupplySources', 'updateMany')({
      where: {
        id: currentRoot.id,
        identityKey: plan.identity.identityKey,
        intakeId: currentRoot.intakeId,
        liveSourceId: currentRoot.liveSourceId,
      },
      data: { intakeId: plan.intake.id, liveSourceId: source.id },
    });
    if (rootLink.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('ROOT_CAS_FAILED', `Supply Source ${root.id} could not be linked.`);
  }
  const linkedSource = await readUnique(db, 'affiliateScrapeSources', { where: { id: source.id } }) as unknown as SourceRow | null;
  if (!linkedSource || (linkedSource.supplySourceId && linkedSource.supplySourceId !== root.id)) {
    throw new AffiliateExistingDataRepairAdmissionError('SOURCE_ROOT_DRIFT', `Source ${source.id} is linked to another Supply Source.`);
  }
  if (!linkedSource.supplySourceId) {
    const result = await requiredWriteDelegateMethod(db, 'affiliateScrapeSources', 'updateMany')({
      where: { id: source.id, supplySourceId: null, sourceKey: source.sourceKey },
      data: { supplySourceId: root.id },
    });
    if (result.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('SOURCE_CAS_FAILED', `Source ${source.id} could not be linked.`);
  }
  const linkedRoot = await readUnique(db, 'affiliateSupplySources', { where: { id: root.id } }) as unknown as RootRow | null;
  if (!linkedRoot
    || linkedRoot.identityKey !== plan.identity.identityKey
    || canonical(linkedRoot.canonicalUrl) !== plan.identity.canonicalUrl
    || linkedRoot.origin !== plan.identity.origin
    || linkedRoot.pathKey !== plan.identity.pathKey
    || linkedRoot.rolloutCohort !== cohort(bundle)
    || upper(linkedRoot.targetKind) !== upper(source.targetKind)
    || linkedRoot.intakeId !== plan.intake.id
    || linkedRoot.liveSourceId !== source.id
  ) {
    throw new AffiliateExistingDataRepairAdmissionError('ROOT_IDENTITY_DRIFT', `Supply Source ${root.id} changed during admission.`);
  }
  return { source, root };
};

const assertActiveContract = async (client: Client, bundle: AffiliateAgentContractBundle): Promise<void> => {
  let active;
  try {
    active = await loadActiveAffiliateSupplyContract({
      db: affiliateSupplyDatabase(client as unknown as PrismaClient),
      rolloutCohort: cohort(bundle),
    });
  } catch (error) {
    throw new AffiliateExistingDataRepairAdmissionError('ACTIVE_CONTRACT_DRIFT', 'The active Supply contract changed or is unavailable for this admission.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (
    active.manifest.version !== bundle.supplyContract.version
    || active.manifest.supplyContract.hash !== bundle.supplyContract.hash
  ) {
    throw new AffiliateExistingDataRepairAdmissionError('ACTIVE_CONTRACT_DRIFT', 'The active Supply contract changed or is unavailable for this admission.', {
      expectedVersion: bundle.supplyContract.version,
      expectedHash: bundle.supplyContract.hash,
      observedVersion: active.manifest.version,
      observedHash: active.manifest.supplyContract.hash,
    });
  }
};

const applyPlan = async (
  tx: Client,
  plan: Plan,
  report: AffiliateExistingDataRepairAdmissionReport,
  reportHash: string,
  operatorId: string,
  reasonText: string,
  bundle: AffiliateAgentContractBundle,
  requestedJobIds: readonly string[] | undefined,
  requestedSourceIds: readonly string[] | undefined,
  selectionLimit: number,
): Promise<AffiliateExistingDataRepairAppliedJob> => {
  const db = tx as unknown as AnyDelegate;
  const currentJob = await readUnique(db, 'affiliateSourceMappingJobs', { where: { id: plan.job.id } }) as unknown as MappingJobRow | null;
  if (!currentJob
    || currentJob.intakeId !== plan.intake.id
    || currentJob.status !== plan.job.status
    || currentJob.sourceId !== plan.job.sourceId
    || currentJob.mappingId !== plan.job.mappingId
    || currentJob.supplySourceId !== plan.job.supplySourceId
    || activeLease(currentJob)
  ) throw new AffiliateExistingDataRepairAdmissionError('IDENTITY_DRIFT', `Mapping job ${plan.job.id} changed after preview.`);
  const policyUrls = [
    plan.identity.canonicalUrl,
    plan.intake.baseUrl,
    plan.source?.listUrl,
    plan.source?.baseUrl,
    ...plan.evidencePages.map((page) => page.canonicalUrl),
    ...plan.artifacts.flatMap((artifact) => [artifact.sourceUrl, artifact.finalUrl]),
  ];
  await assertCurrentPolicies(tx, policyUrls);
  const currentSource = plan.source
    ? await readUnique(db, 'affiliateScrapeSources', { where: { id: plan.source.id } })
    : null;
  const currentRoot = plan.root
    ? await readUnique(db, 'affiliateSupplySources', { where: { id: plan.root.id } })
    : null;
  if (plan.source && !currentSource) {
    throw new AffiliateExistingDataRepairAdmissionError('SOURCE_IDENTITY_DRIFT', `Source ${plan.source.id} disappeared after preview.`);
  }
  if (plan.root && !currentRoot) {
    throw new AffiliateExistingDataRepairAdmissionError('ROOT_IDENTITY_DRIFT', `Supply Source ${plan.root.id} disappeared after preview.`);
  }
  if (currentSource && currentRoot) {
    const holdReasons = correctionHoldReasonsFor(
      currentSource as unknown as SourceRow,
      currentRoot as unknown as RootRow,
    );
    if (holdReasons.length) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'CORRECTION_HOLD_PRESENT',
        `Existing-data repair admission is blocked by a correction hold on ${plan.source?.id ?? 'the selected source'}.`,
        { reasonCodes: holdReasons },
      );
    }
  }
  if (currentSource) {
    const pending = recordValue(recordValue(currentSource).metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY];
    if (Object.keys(recordValue(pending)).length) {
      throw new AffiliateExistingDataRepairAdmissionError('PENDING_REPAIR_PRESENT', `Source ${plan.source?.id ?? 'the selected source'} already has a pending repair.`);
    }
  }
  if (currentRoot) {
    const pending = recordValue(recordValue(currentRoot).metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY];
    if (Object.keys(recordValue(pending)).length) {
      throw new AffiliateExistingDataRepairAdmissionError('PENDING_REPAIR_PRESENT', `Supply Source ${plan.root?.id ?? 'the selected root'} already has a pending repair.`);
    }
  }
  const now = new Date();
  if (plan.source && plan.baseline) {
    const beforeLink = await loadBaseline(tx, plan.source.id, plan.root as unknown as AffiliateSupplySources | null);
    if (beforeLink.sourceStateSha256 !== plan.baseline.sourceStateSha256
      || beforeLink.workingMappingId !== plan.baseline.workingMappingId
      || beforeLink.isPublicReplacement !== plan.baseline.isPublicReplacement
    ) {
      throw new AffiliateExistingDataRepairAdmissionError('SOURCE_STATE_DRIFT', `Source ${plan.source.id} changed after preview.`);
    }
  }
  const linked = await createOrReuseSourceAndRoot(tx, plan, reportHash, bundle, now);
  const source = linked.source;
  const root = linked.root;
  const intake = await readUnique(db, 'affiliateSourceIntakes', { where: { id: plan.intake.id } }) as unknown as IntakeRow | null;
  if (!intake || (intake.supplySourceId && intake.supplySourceId !== root.id) || (intake.affiliateSourceId && intake.affiliateSourceId !== source.id)) throw new AffiliateExistingDataRepairAdmissionError('INTAKE_IDENTITY_DRIFT', `Intake ${plan.intake.id} changed during admission.`);
  if (upper(intake.complianceStatus) !== 'ALLOWED') {
    throw new AffiliateExistingDataRepairAdmissionError(
      'SOURCE_POLICY_NOT_ALLOWED',
      `Intake ${plan.intake.id} no longer has allowed compliance at claim time.`,
    );
  }
  if (!intake.supplySourceId || !intake.affiliateSourceId) {
    const update = await requiredWriteDelegateMethod(db, 'affiliateSourceIntakes', 'updateMany')({ where: { id: plan.intake.id, supplySourceId: intake.supplySourceId ?? null, affiliateSourceId: intake.affiliateSourceId ?? null }, data: { supplySourceId: root.id, affiliateSourceId: source.id } });
    if (update.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('INTAKE_CAS_FAILED', `Intake ${plan.intake.id} could not be linked.`);
  }
  if (plan.mapping) {
    const mapping = await readUnique(db, 'affiliateScrapeMappings', { where: { id: plan.mapping.id } }) as unknown as MappingRow | null;
    if (!mapping || mapping.sourceId !== source.id || (mapping.supplySourceId && mapping.supplySourceId !== root.id)) throw new AffiliateExistingDataRepairAdmissionError('MAPPING_IDENTITY_DRIFT', `Mapping ${plan.mapping.id} changed during admission.`);
    if (!mapping.supplySourceId) {
      const update = await requiredWriteDelegateMethod(db, 'affiliateScrapeMappings', 'updateMany')({ where: { id: mapping.id, sourceId: source.id, supplySourceId: null }, data: { supplySourceId: root.id } });
      if (update.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('MAPPING_CAS_FAILED', `Mapping ${mapping.id} could not be linked.`);
    }
  }
  const baseline = await loadBaseline(tx, source.id);
  const sourceKindAssessment = plan.sourceKindAssessment;
  const repairReasons = sortedUnique([
    reasonText,
    ...recordedRepairReasons(plan.job.resultSummary),
  ]);
  const context = parseContext({
    kind: 'EXISTING_DATA_REPAIR',
    intakeId: plan.intake.id,
    evidenceRunId: plan.run.id,
    sportsCatalog: plan.sportsCatalog,
    sourceId: source.id,
    sourceIdentityKey: plan.identity.identityKey,
    admissionHash: reportHash,
    sourceStateSha256: baseline.sourceStateSha256,
    workingMappingId: baseline.workingMappingId,
    isPublicReplacement: baseline.isPublicReplacement,
    repairReasons,
    deploymentContract: bundle.deploymentContract,
    ...(sourceKindAssessment ? { sourceKindAssessment } : {}),
    ...(plan.sourceSportScope ? { sourceSportScope: plan.sourceSportScope } : {}),
  });
  const pageSnapshots = plan.evidencePages.map((page) => ({
    id: page.id,
    intakeId: page.intakeId,
    supplySourceId: page.supplySourceId,
    url: page.url,
    canonicalUrl: page.canonicalUrl,
    status: page.status,
    role: page.role ?? null,
    targetKindHints: page.targetKindHints ?? [],
    metadata: page.metadata ?? null,
  }));
  const sourceAudit = {
    reportHash,
    mappingJobId: plan.job.id,
    intakeId: plan.intake.id,
    evidenceRunId: plan.run.id,
    sourceId: source.id,
    supplySourceId: root.id,
    operatorId,
    reason: reasonText,
    context,
    evidenceSnapshots: plan.evidence,
    pageSnapshots,
    policySnapshots: plan.policySnapshots,
    deploymentContract: bundle.deploymentContract,
    previewBaseline: plan.baseline
      ? {
        sourceStateSha256: plan.baseline.sourceStateSha256,
        sourceState: plan.baseline.sourceState,
        workingMappingState: plan.baseline.workingMappingState,
        organizationState: plan.baseline.organizationState,
      }
      : null,
    baseline: {
      sourceStateSha256: baseline.sourceStateSha256,
      sourceState: baseline.sourceState,
      workingMappingState: baseline.workingMappingState,
      organizationState: baseline.organizationState,
    },
  };
  const sourceMetaUpdate = await requiredWriteDelegateMethod(db, 'affiliateScrapeSources', 'updateMany')({ where: { id: source.id, supplySourceId: root.id }, data: { metadata: asJson(appendMetadata(source.metadata, context, sourceAudit)) } });
  if (sourceMetaUpdate.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('SOURCE_CAS_FAILED', `Source ${source.id} metadata changed during admission.`);
  const rootMetaUpdate = await requiredWriteDelegateMethod(db, 'affiliateSupplySources', 'updateMany')({ where: { id: root.id, identityKey: plan.identity.identityKey }, data: { metadata: asJson(appendMetadata(root.metadata, context, sourceAudit)) } });
  if (rootMetaUpdate.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('ROOT_CAS_FAILED', `Supply Source ${root.id} metadata changed during admission.`);
  const artifactIds = plan.evidence.map((entry) => entry.intakeArtifactId).sort();
  for (const artifact of plan.artifacts) {
    const update = await requiredWriteDelegateMethod(db, 'affiliateSourceIntakeArtifacts', 'updateMany')({ where: { id: artifact.id, intakeId: plan.intake.id, runId: artifact.runId, pageId: artifact.pageId, fileId: artifact.fileId, supplySourceId: artifact.supplySourceId ?? null }, data: { isPinned: true, retainUntil: null, supplySourceId: root.id } });
    if (update.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('ARTIFACT_CAS_FAILED', `Artifact ${artifact.id} could not be pinned.`);
  }
  const parsedExisting = upper(source.targetKind) === 'UNCLASSIFIED';
  const subject: AffiliateAgentSubject = parsedExisting
    ? { type: 'MAPPING_PRODUCER', supplySourceId: root.id, mappingJobId: plan.job.id, pass: 1, repairContext: context }
    : { type: 'MAPPING_PRODUCER', supplySourceId: root.id, mappingJobId: plan.job.id, listingKind: upper(source.targetKind) as AffiliateAgentListingKind, pass: 1, repairContext: context };
  const gatewayData = {
    id: createId(),
    dedupeKey: plan.gatewayDedupeKey,
    queue: 'AFFILIATE_MAPPING',
    lane: 'MAPPING_PRODUCTION',
    role: 'MAPPING_PRODUCER',
    subjectType: 'MAPPING_PRODUCER',
    subjectId: plan.job.id,
    subjectJson: asJson(subject),
    evidenceManifestJson: asJson(plan.manifest),
    supplySourceId: root.id,
    expectedLifecycleGeneration: root.lifecycleGeneration,
    status: 'QUEUED',
    priority: 0,
    nextAttemptAt: now,
    claimGeneration: 0,
    eventSequence: 1,
    activeClaimId: null,
    parentClaimId: null,
  };
  const gateway = await requiredWriteDelegateMethod(db, 'affiliateAgentGatewayJobs', 'create')({ data: gatewayData as unknown as Record<string, unknown> }) as unknown as GatewayJobRow;
  if (!gateway?.id) throw new AffiliateExistingDataRepairAdmissionError('GATEWAY_CREATE_FAILED', `Gateway job for ${plan.job.id} was not created.`);
  const audit: ExistingDataRepairAdmissionAudit = {
    schemaVersion: 1,
    reportHash,
    reportSnapshot: report,
    operatorId,
    reason: reasonText,
    mappingJobId: plan.job.id,
    intakeId: plan.intake.id,
    evidenceRunId: plan.run.id,
    sourceId: source.id,
    supplySourceId: root.id,
    rootId: root.id,
    rootIdentityKey: root.identityKey,
    mappingId: plan.mapping?.id ?? null,
    gatewayJobId: gateway.id,
    selectedJobIds: [...report.selectedJobIds].sort(),
    requestedJobIds: requestedJobIds ? [...requestedJobIds].sort() : null,
    requestedSourceIds: requestedSourceIds ? [...requestedSourceIds].sort() : null,
    selectionLimit,
    selectedRow: {
      jobId: plan.job.id,
      mappingJobId: plan.job.id,
      intakeId: plan.intake.id,
      sourceId: source.id,
      mappingId: plan.mapping?.id ?? null,
      supplySourceId: root.id,
      rootId: root.id,
      evidenceRunId: plan.run.id,
      eligible: plan.row.eligible,
      gatewayJobId: gateway.id,
      outcome: 'APPLIED',
    },
    selectedWrite: { ...writeFor(plan), sourceId: source.id, supplySourceId: root.id },
    repairContext: context,
    manifest: plan.manifest,
    sourceStateSha256: baseline.sourceStateSha256,
    sourceState: baseline.sourceState,
    workingMappingState: baseline.workingMappingState,
    organizationState: baseline.organizationState,
    rootLifecycleGeneration: root.lifecycleGeneration,
    artifactIds: plan.evidence.map((entry) => entry.artifactId).sort(),
    evidenceSnapshots: plan.evidence,
    pageSnapshots,
    policySnapshots: plan.policySnapshots,
    deploymentContract: bundle.deploymentContract,
    legacyMappingJobState: {
      status: currentJob.status,
      sourceId: currentJob.sourceId,
      mappingId: currentJob.mappingId,
      supplySourceId: currentJob.supplySourceId,
      claimedAt: currentJob.claimedAt ?? null,
      leaseExpiresAt: currentJob.leaseExpiresAt ?? null,
      workerId: currentJob.workerId ?? null,
      nextStatus: AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS,
    },
    gatewayDedupeKey: plan.gatewayDedupeKey,
    createdIds: {
      gatewayJobId: gateway.id,
      mappingJobId: plan.job.id,
      sourceId: source.id,
      supplySourceId: root.id,
      evidenceArtifactIds: artifactIds.map((id) => `intake-artifact:${id}`),
    },
  };
  const nextSummary = appendHistory(currentJob.resultSummary, audit);
  const legacyIdentityWhere = currentJob.legacyIdentityMigrationEligible === undefined
    ? {}
    : { legacyIdentityMigrationEligible: currentJob.legacyIdentityMigrationEligible };
  const jobUpdate = await requiredWriteDelegateMethod(db, 'affiliateSourceMappingJobs', 'updateMany')({
    where: {
      id: plan.job.id,
      intakeId: plan.intake.id,
      status: plan.job.status,
      sourceId: plan.job.sourceId,
      mappingId: plan.job.mappingId,
      supplySourceId: plan.job.supplySourceId,
      claimedAt: null,
      workerId: null,
      leaseExpiresAt: null,
      ...legacyIdentityWhere,
    },
    data: {
      sourceId: source.id,
      supplySourceId: root.id,
      mappingId: plan.mapping?.id ?? currentJob.mappingId,
      status: AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS,
      legacyIdentityMigrationEligible: false,
      resultSummary: asJson(nextSummary),
    },
  });
  if (jobUpdate.count !== 1) throw new AffiliateExistingDataRepairAdmissionError('MAPPING_JOB_CAS_FAILED', `Mapping job ${plan.job.id} could not be linked atomically.`);
  await requiredWriteDelegateMethod(db, 'affiliateAgentGatewayEvents', 'create')({
    data: {
      id: createId(),
      eventKey: `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${gateway.id}:created`,
      jobId: gateway.id,
      claimId: null,
      receiptId: null,
      sequence: 1,
      eventType: 'JOB_CREATED',
      actorKind: 'OPERATOR',
      actorId: operatorId,
      role: 'MAPPING_PRODUCER',
      requestHash: reportHash,
      inputHash: plan.row.stateFingerprint,
      outputHash: reportHash,
      reasonCodes: ['EXISTING_DATA_REPAIR_ADMITTED'],
      payload: asJson(audit),
      retentionClass: 'INDEFINITE',
    },
  });
  return { jobId: gateway.id, mappingJobId: plan.job.id, sourceId: source.id, supplySourceId: root.id };
};

const replayReport = async (
  client: Client,
  expectedHash: string,
  input: ApplyAffiliateExistingDataRepairAdmissionInput,
  validated: ValidatedAdmissionInput,
  parsedBundle: AffiliateAgentContractBundle,
): Promise<AffiliateExistingDataRepairAdmissionApplyReport | null> => {
  const db = client as unknown as AnyDelegate;
  const sourceMappings = validated.sourceIds?.length
    ? await snapshotRows<MappingRow>(db.affiliateScrapeMappings, {
      where: { sourceId: { in: validated.sourceIds } },
      orderBy: { id: 'asc' },
    }, SNAPSHOT_GLOBAL_LIMIT, 'replay source mappings')
    : [];
  const replayMappingIds = sortedUnique(sourceMappings.map((mapping) => mapping.id));
  const requested = await snapshotRows<MappingJobRow>(db.affiliateSourceMappingJobs, {
    where: {
      OR: [
        ...(validated.jobIds?.length ? [{ id: { in: validated.jobIds } }] : []),
        ...(validated.sourceIds?.length ? [{ sourceId: { in: validated.sourceIds } }] : []),
        ...(replayMappingIds.length ? [{ mappingId: { in: replayMappingIds } }] : []),
      ],
    },
    orderBy: { id: 'asc' },
  }, SNAPSHOT_GLOBAL_LIMIT, 'replay mapping jobs');
  const entries: JsonRecord[] = [];
  for (const job of requested as unknown as MappingJobRow[]) {
    entries.push(...admissionHistory(job.resultSummary).filter((entry) => entry.reportHash === expectedHash));
  }
  if (!entries.length) return null;
  const first = entries[0]!;
  const stored = reportSnapshot(first.reportSnapshot);
  const storedSelectedJobIds = Array.isArray(stored.selectedJobIds)
    ? stored.selectedJobIds.filter((value): value is string => typeof value === 'string')
    : [];
  const storedRows = Array.isArray(stored.rows)
    ? stored.rows as unknown as AffiliateExistingDataRepairAdmissionRow[]
    : [];
  const storedWrites = Array.isArray(stored.proposedWrites)
    ? stored.proposedWrites as unknown as AffiliateExistingDataRepairAdmissionWrite[]
    : [];
  const recomputedHash = (
    storedRows.length && storedWrites.length
      ? reportHashFor({
        contractVersion: Number(stored.contractVersion),
        contractHash: String(stored.contractHash ?? ''),
        reason: String(stored.reason ?? ''),
        operatorId: String(stored.operatorId ?? ''),
        requestedJobIds: (stored.requestedJobIds ?? null) as readonly string[] | null,
        requestedSourceIds: (stored.requestedSourceIds ?? null) as readonly string[] | null,
        evidenceSelections: (stored.evidenceSelections ?? null) as readonly ExistingDataRepairEvidenceSelection[] | null,
        selectionLimit: Number(stored.selectionLimit),
        counts: stored.counts as AffiliateExistingDataRepairAdmissionCounts,
        selectedJobIds: storedSelectedJobIds,
        rows: storedRows,
        proposedWrites: storedWrites,
      })
      : ''
  );
  const entryMappingJobIds = entries.map((entry) => text(entry.mappingJobId) ?? text(recordValue(entry.createdIds).mappingJobId) ?? '');
  const uniqueEntryMappingJobIds = sortedUnique(entryMappingJobIds);
  if (
    stored.reportHash !== expectedHash
    || recomputedHash !== expectedHash
    || stored.contractVersion !== parsedBundle.supplyContract.version
    || stored.contractHash !== parsedBundle.supplyContract.hash
    || stored.operatorId !== validated.operatorId
    || stored.reason !== validated.reason
    || !Array.isArray(stored.rows)
    || !Array.isArray(stored.proposedWrites)
    || entries.length !== storedSelectedJobIds.length
    || uniqueEntryMappingJobIds.length !== entryMappingJobIds.length
    || !sameValue(sortedUnique(storedSelectedJobIds), uniqueEntryMappingJobIds)
    || !sameValue(stored.requestedJobIds ?? null, validated.jobIds ?? null)
    || !sameValue(stored.requestedSourceIds ?? null, validated.sourceIds ?? null)
    || !sameValue(stored.evidenceSelections ?? null, validated.evidenceSelections ?? null)
    || Number(stored.selectionLimit) !== validated.limit
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'ADMISSION_REPORT_DRIFT',
      'Stored existing-data repair admission evidence is incomplete or does not match the reviewed selection.',
    );
  }
  const appliedJobs: AffiliateExistingDataRepairAppliedJob[] = [];
  for (const entry of entries) {
    if (
      entry.reportHash !== expectedHash
      || entry.operatorId !== validated.operatorId
      || entry.reason !== validated.reason
      || !sameValue(reportSnapshot(entry.reportSnapshot), stored)
      || recordValue(entry.repairContext).kind !== 'EXISTING_DATA_REPAIR'
    ) {
      throw new AffiliateExistingDataRepairAdmissionError('ADMISSION_REPORT_DRIFT', 'Stored admission actor, reason, or report snapshot was altered.');
    }
    const created = recordValue(entry.createdIds);
    const gatewayJobId = text(created.gatewayJobId) ?? text(entry.gatewayJobId);
    const mappingJobId = text(created.mappingJobId);
    const sourceId = text(created.sourceId);
    const supplySourceId = text(created.supplySourceId);
    const entryDedupeKey = text(entry.gatewayDedupeKey);
    if (!gatewayJobId || !mappingJobId || !sourceId || !supplySourceId || !entryDedupeKey) {
      throw new AffiliateExistingDataRepairAdmissionError('ADMISSION_REPORT_DRIFT', 'Stored admission identities are incomplete.');
    }
    const gateway = await readUnique(db, 'affiliateAgentGatewayJobs', { where: { id: gatewayJobId } }) as unknown as GatewayJobRow | null;
    if (
      !gateway
      || gateway.dedupeKey !== entryDedupeKey
      || gateway.subjectId !== mappingJobId
      || gateway.supplySourceId !== supplySourceId
    ) {
      throw new AffiliateExistingDataRepairAdmissionError('CLAIM_DRIFT', 'The admitted Gateway job no longer matches its immutable admission identity.');
    }
    const source = await readUnique(db, 'affiliateScrapeSources', { where: { id: sourceId } });
    const root = await readUnique(db, 'affiliateSupplySources', { where: { id: supplySourceId } });
    const sourcePending = recordValue(recordValue(source).metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY];
    const rootPending = recordValue(recordValue(root).metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY];
    if (Object.keys(recordValue(sourcePending)).length || Object.keys(recordValue(rootPending)).length) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'PENDING_REPAIR_PRESENT',
        'The admitted source or Supply Source has an outstanding repair.',
      );
    }
    const activeClaims = await delegateRows<GatewayClaimRow>(db.affiliateAgentGatewayClaims, {
      where: { jobId: gateway.id, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      take: 2,
    });
    if (activeGatewayClaim({ gatewayClaims: activeClaims } as Snapshot, gateway)) {
      throw new AffiliateExistingDataRepairAdmissionError('CLAIM_DRIFT', 'The admitted Gateway job is actively claimed.');
    }
    appliedJobs.push({ jobId: gatewayJobId, mappingJobId, sourceId, supplySourceId });
  }
  return {
    ...(stored as unknown as AffiliateExistingDataRepairAdmissionReport),
    mode: 'APPLY',
    reviewedReportHash: expectedHash,
    writeCount: 0,
    appliedJobs,
    replayed: true,
    evaluatedAt: new Date().toISOString(),
  };
};

export const previewAffiliateExistingDataRepairAdmission = async (input: PreviewAffiliateExistingDataRepairAdmissionInput): Promise<AffiliateExistingDataRepairAdmissionPreview> => {
  const parsedBundle = parseBundle(input.bundle);
  const { report } = await buildReport(input.prisma, input, parsedBundle, 'PREVIEW');
  return report as AffiliateExistingDataRepairAdmissionPreview;
};
export const applyAffiliateExistingDataRepairAdmission = async (input: ApplyAffiliateExistingDataRepairAdmissionInput): Promise<AffiliateExistingDataRepairAdmissionApplyReport> => {
  const validated = validateInput(input);
  const parsedBundle = parseBundle(input.bundle);
  const expectedHash = normalizeHash(input.expectedReportHash);
  if (!expectedHash) throw new AffiliateExistingDataRepairAdmissionError('INVALID_REPORT_HASH', 'expectedReportHash must be a SHA-256 hash.');
  const transaction = transactionFor(input.prisma);
  const execute = async (tx: Client): Promise<AffiliateExistingDataRepairAdmissionApplyReport> => {
    if (!await tryLockAffiliateRepairWrites(tx)) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'ACTIVE_SOURCE_ACTIVITY',
        'Existing-data repair admission is blocked while ordinary affiliate source activity is in progress.',
      );
    }
    await assertActiveContract(tx, parsedBundle);
    await assertNoGlobalActiveGatewayClaims(tx);
    const replay = await replayReport(tx, expectedHash, input, validated, parsedBundle);
    if (replay) return replay;
    const current = await buildReport(tx, input, parsedBundle, 'APPLY');
    if (current.snapshot.gatewayClaims.some((claim) => upper(claim.status) === 'ACTIVE')) throw new AffiliateExistingDataRepairAdmissionError('CLAIM_DRIFT', 'An active Gateway claim exists; existing-data repair admission is paused.');
    if (current.report.reportHash !== expectedHash) throw new AffiliateExistingDataRepairAdmissionError('ADMISSION_REPORT_DRIFT', 'The reviewed existing-data repair report no longer matches current state.', { expectedReportHash: expectedHash, observedReportHash: current.report.reportHash });
    const appliedJobs: AffiliateExistingDataRepairAppliedJob[] = [];
    for (const plan of current.plans) appliedJobs.push(await applyPlan(tx, plan, current.report, expectedHash, validated.operatorId, validated.reason, parsedBundle, validated.jobIds, validated.sourceIds, validated.limit));
    return { ...current.report, mode: 'APPLY', reviewedReportHash: expectedHash, writeCount: appliedJobs.length, appliedJobs, replayed: false, rows: current.report.rows.map((row) => appliedJobs.some((job) => job.mappingJobId === row.mappingJobId) ? { ...row, outcome: 'APPLIED' as const, gatewayJobId: appliedJobs.find((job) => job.mappingJobId === row.mappingJobId)!.jobId, sourceId: appliedJobs.find((job) => job.mappingJobId === row.mappingJobId)!.sourceId, supplySourceId: appliedJobs.find((job) => job.mappingJobId === row.mappingJobId)!.supplySourceId, rootId: appliedJobs.find((job) => job.mappingJobId === row.mappingJobId)!.supplySourceId } : row) };
  };
  if (typeof transaction === 'function') return transaction((tx: Client) => execute(tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 });
  return execute(input.prisma);
};
export const calculateAffiliateExistingDataRepairAdmissionReportHash = (report: Pick<AffiliateExistingDataRepairAdmissionReport, 'contractVersion' | 'contractHash' | 'reason' | 'operatorId' | 'requestedJobIds' | 'requestedSourceIds' | 'evidenceSelections' | 'selectionLimit' | 'counts' | 'selectedJobIds' | 'rows' | 'proposedWrites'>): string => reportHashFor(report);

const artifactBinding = async (
  client: Client,
  context: AffiliateAgentExistingDataRepairContext,
  manifest: AffiliateAgentEvidenceManifest,
  source: SourceRow,
  intake: IntakeRow,
  run: RunRow,
  root: RootRow,
  admissionAudit: JsonRecord | null,
): Promise<void> => {
  const db = client as unknown as AnyDelegate;
  const sourceArtifactIds = manifest.entries
    .map((entry) => entry.artifactId.startsWith('intake-artifact:') ? entry.artifactId.slice('intake-artifact:'.length) : '')
    .filter(Boolean);
  if (sourceArtifactIds.length !== manifest.entries.length) {
    bindingError('The repair claim evidence contains an invalid intake artifact identity.');
  }
  const artifacts = await delegateRows<ArtifactRow>(db.affiliateSourceIntakeArtifacts, {
    where: {
      id: { in: sourceArtifactIds },
      intakeId: intake.id,
      runId: run.id,
      kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN'] },
    },
    orderBy: { id: 'asc' },
    take: manifest.entries.length,
  });
  const files = await delegateRows<FileRow>(db.file, {
    where: { id: { in: artifacts.map((artifact) => artifact.fileId) } },
    orderBy: { id: 'asc' },
    take: manifest.entries.length,
  });
  const pageIds = sortedUnique(artifacts.map((artifact) => artifact.pageId).filter((id): id is string => Boolean(id)));
  const pages = pageIds.length
    ? await delegateRows<PageRow>(db.affiliateSourceIntakePages, {
      where: { id: { in: pageIds }, intakeId: intake.id, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      take: pageIds.length,
    })
    : [];
  const expectedOrigin = urlOrigin(source.listUrl);
  const entriesByPage = new Map<string, number>();
  const seenArtifacts = new Set<string>();
  const admissionEvidence = Array.isArray(admissionAudit?.evidenceSnapshots)
    ? admissionAudit.evidenceSnapshots.map((value) => recordValue(value))
    : [];
  const admissionPages = Array.isArray(admissionAudit?.pageSnapshots)
    ? admissionAudit.pageSnapshots.map((value) => recordValue(value))
    : [];
  for (const entry of manifest.entries) {
    const artifactId = entry.artifactId.slice('intake-artifact:'.length);
    const artifact = artifacts.find((candidate) => candidate.id === artifactId);
    const file = artifact ? files.find((candidate) => candidate.id === artifact.fileId) : null;
    const page = artifact?.pageId ? pages.find((candidate) => candidate.id === artifact.pageId) : null;
    if (!artifact || !file || !page) bindingError('The repair claim evidence is not bound to pinned source-owned artifacts.');
    const admittedArtifact = admissionEvidence.find((candidate) => candidate.artifactId === entry.artifactId);
    const pageSnapshot = {
      id: page.id,
      intakeId: page.intakeId,
      supplySourceId: page.supplySourceId,
      url: page.url,
      canonicalUrl: page.canonicalUrl,
      status: page.status,
      role: page.role ?? null,
      targetKindHints: page.targetKindHints ?? [],
      metadata: page.metadata ?? null,
    };
    const admittedPage = admissionPages.find((candidate) => candidate.id === page.id);
    if (
      seenArtifacts.has(artifact.id)
      || artifact.kind !== entry.kind
      || artifact.intakeId !== intake.id
      || artifact.runId !== run.id
      || artifact.pageId !== page.id
      || artifact.supplySourceId !== root.id
      || artifact.mimeType !== entry.mimeType
      || normalizeHash(artifact.contentHash) !== entry.sha256
      || artifact.sizeBytes !== entry.byteSize
      || !artifact.isPinned
      || !text(file.path)
      || file.mimeType !== entry.mimeType
      || file.sizeBytes !== entry.byteSize
      || !admittedArtifact
      || !sameValue(admittedArtifact, {
        kind: entry.kind,
        artifactId: entry.artifactId,
        sourceArtifactId: file.id,
        storageKey: file.path,
        sha256: entry.sha256,
        mimeType: entry.mimeType,
        byteSize: entry.byteSize,
        sourceUrl: artifact.sourceUrl,
        finalUrl: artifact.finalUrl,
        intakeArtifactId: artifact.id,
        runId: run.id,
        pageId: page.id,
      })
      || admissionPages.length > 0 && (!admittedPage || !sameValue(admittedPage, pageSnapshot))
    ) {
      bindingError('The repair claim evidence is not bound to pinned source-owned artifacts.');
    }
    const pageOrigin = urlOrigin(page.canonicalUrl);
    const urls = [artifact.sourceUrl, artifact.finalUrl].filter((value): value is string => Boolean(value));
    if (
      !expectedOrigin
      || pageOrigin !== expectedOrigin
      || !urls.length
      || urls.map(urlOrigin).some((origin) => origin !== expectedOrigin)
    ) bindingError('The repair claim evidence is not first-party source content.');
    seenArtifacts.add(artifact.id);
    entriesByPage.set(page.id, (entriesByPage.get(page.id) ?? 0) + 1);
  }
  const primaryPages = Array.from(entriesByPage.keys())
    .map((pageId) => pages.find((candidate) => candidate.id === pageId))
    .filter((page): page is PageRow => Boolean(page))
    .filter((page) => canonical(page.canonicalUrl) === canonical(source.listUrl));
  const sourceCreated = recordValue(recordValue(admissionAudit).selectedWrite).sourceAction === 'CREATE_SOURCE';
  if (
    primaryPages.length !== 1
    || sourceCreated && !SOURCE_CREATION_PRIMARY_PAGE_ROLES[upper(primaryPages[0]!.role)]
  ) {
    bindingError('The repair claim evidence is missing the exact source page.');
  }
  if (
    seenArtifacts.size !== manifest.entries.length
    || entriesByPage.size < 1
    || entriesByPage.size > 3
    || Array.from(entriesByPage.values()).some((count) => count !== 2)
  ) bindingError('The repair claim evidence must contain one HTML and one Markdown artifact for at most three pages.');
  if (
    context.intakeId !== intake.id
    || context.evidenceRunId !== run.id
    || context.sourceId !== source.id
    || context.sourceIdentityKey !== root.identityKey
    || source.supplySourceId !== root.id
    || intake.supplySourceId !== root.id
    || intake.affiliateSourceId !== source.id
    || root.liveSourceId !== source.id
    || root.intakeId !== intake.id
    || (run.supplySourceId != null && run.supplySourceId !== root.id)
    || canonical(source.listUrl) !== canonical(root.canonicalUrl)
    || root.origin !== (urlOrigin(source.listUrl) ?? '')
  ) {
    bindingError('The repair claim source, intake, run, or root links are invalid.');
  }
  await assertCurrentPolicies(client, [
    intake.baseUrl,
    source.listUrl,
    source.baseUrl,
    ...pages.map((page) => page.canonicalUrl),
    ...artifacts.flatMap((artifact) => [artifact.sourceUrl, artifact.finalUrl]),
  ]);
};

const assertPendingTransition = (
  context: AffiliateAgentExistingDataRepairContext,
  pendingManifest: AffiliateAgentEvidenceManifest,
  baseline: Baseline,
  mappingJob: MappingJobRow,
  source: SourceRow,
  root: RootRow,
  mapping: MappingRow | null,
): void => {
  const sourceMetadata = recordValue(source.metadata);
  const rootMetadata = recordValue(root.metadata);
  const sourcePending = recordValue(sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]);
  const rootPending = recordValue(rootMetadata[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]);
  const hasSourcePending = Object.keys(sourcePending).length > 0;
  const hasRootPending = Object.keys(rootPending).length > 0;
  if (hasSourcePending !== hasRootPending || !sameValue(sourcePending, rootPending)) {
    bindingError('The source and root pending mapping proofs differ.');
  }
  const rawPending = hasSourcePending ? sourcePending : null;
  const baselineMatchesContext = baseline.sourceStateSha256 === context.sourceStateSha256
    && baseline.workingMappingId === context.workingMappingId
    && baseline.isPublicReplacement === context.isPublicReplacement;
  if (!rawPending) {
    if (!baselineMatchesContext) bindingError('The protected working source state changed after admission.');
    return;
  }
  const parsedPending = affiliateExistingDataRepairPendingMappingSchema.safeParse(rawPending);
  if (!parsedPending.success) bindingError('The server-owned pending mapping proof is invalid.');
  const pending = parsedPending.data;
  const expectedRefs = pending.evidenceRefs;
  const evidenceKinds = expectedRefs.map((ref) => {
    const entry = pendingManifest.entries.find((candidate) => candidate.evidenceRef === ref);
    if (!entry) bindingError('The pending mapping references evidence outside its claim.');
    return entry.kind;
  });
  const expectedEvidenceKinds = sortedUnique(evidenceKinds);
  const expectedEvidenceHash = hash({
    manifestHash: pendingManifest.hash,
    refs: expectedRefs,
    kinds: expectedEvidenceKinds,
  });
  const mappingMetadata = recordValue(recordValue(mapping?.mapping).metadata);
  const validationOutput = recordValue(mappingMetadata.validationOutput);
  const currentWorkingHash = hash(baseline.workingMappingState ?? {});
  const currentOrganizationHash = baseline.organizationState ? hash(baseline.organizationState) : null;
  if (!mapping || mapping.isActive !== false) {
    bindingError('The pending repair mapping is not an inactive server-owned mapping.');
  }
  if (pending.mappingSha256 !== hash(mapping.mapping)) {
    bindingError('The pending repair mapping hash does not match the persisted mapping JSON.');
  }
  if (pending.admissionHash !== context.admissionHash
    || pending.sourceStateSha256 !== context.sourceStateSha256
    || pending.workingMappingId !== context.workingMappingId
    || pending.isPublicReplacement !== context.isPublicReplacement
    || pending.sourceId !== source.id
    || pending.supplySourceId !== root.id
    || pending.mappingJobId !== mappingJob.id
    || pending.mappingId !== mappingJob.mappingId
    || pending.mappingId !== mapping?.id
    || mapping?.sourceId !== source.id
    || mapping?.supplySourceId !== root.id
    || pending.packageHash !== mappingMetadata.packageHash
    || pending.candidatePackageHash !== pending.packageHash
    || pending.candidateHash !== validationOutput.candidateHash
    || pending.candidatePackageHash !== validationOutput.validatedPackageHash
    || pending.validationHash !== hash(validationOutput)
    || pending.validationReceiptId !== validationOutput.validationReceiptId
    || validationOutput.evidenceManifestHash !== pendingManifest.hash
    || !sameValue(validationOutput.evidenceRefs, expectedRefs)
    || !sameValue(validationOutput.evidenceKinds, expectedEvidenceKinds)
    || !sameValue(mappingMetadata.evidenceKinds, expectedEvidenceKinds)
    || pending.evidenceHash !== expectedEvidenceHash
    || !sameValue(mappingMetadata.evidenceRefs, expectedRefs)
    || pending.workingMappingStateSha256 !== currentWorkingHash
    || pending.organizationStateSha256 !== currentOrganizationHash
    || baseline.sourceStateSha256 !== pending.postCommitSourceStateSha256
    || currentWorkingHash !== pending.postCommitWorkingMappingStateSha256
    || currentOrganizationHash !== pending.postCommitOrganizationStateSha256) {
    bindingError('The pending mapping proof is not bound to this admission, evidence, or source lineage.');
  }
  const sourceKind = upper(source.targetKind);
  const rootKind = upper(root.targetKind);
  const allowedKinds = context.sourceKindAssessment?.allowedListingKinds ?? [];
  if (context.sourceKindAssessment) {
    if (!allowedKinds.includes(sourceKind as AffiliateAgentListingKind)
      || sourceKind !== rootKind
      || !SUPPORTED_KINDS.has(sourceKind as AffiliateAgentListingKind)) {
      bindingError('The approved source kind is outside the admitted assessment.');
    }
  } else {
    const audit = recordValue(sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
    const admittedSourceState = recordValue(recordValue(audit.baseline).sourceState);
    const admittedSourceKind = upper(admittedSourceState.targetKind);
    const admittedRootKind = upper(recordValue(admittedSourceState.root).targetKind);
    if (!admittedSourceKind || sourceKind !== admittedSourceKind || rootKind !== admittedRootKind || sourceKind !== rootKind) {
      bindingError('The approved public replacement changed the admitted source kind.');
    }
  }
};
const producerSubjectsEquivalent = (queued: JsonRecord, claimed: JsonRecord): boolean => {
  if (sameValue(queued, claimed)) return true;
  if (queued.type !== 'MAPPING_PRODUCER' || claimed.type !== 'MAPPING_PRODUCER') return false;
  if (Object.prototype.hasOwnProperty.call(queued, 'listingKind')
    || !Object.prototype.hasOwnProperty.call(claimed, 'listingKind')) return false;
  const queuedWithoutKind = { ...queued };
  const claimedWithoutKind = { ...claimed };
  delete queuedWithoutKind.listingKind;
  delete claimedWithoutKind.listingKind;
  return sameValue(queuedWithoutKind, claimedWithoutKind);
};

const manifestUnionFor = (
  producer: AffiliateAgentEvidenceManifest,
  reviewer: AffiliateAgentEvidenceManifest,
): AffiliateAgentEvidenceManifest => {
  const entriesByRef = new Map<string, AffiliateAgentEvidenceManifest['entries'][number]>();
  for (const entry of [...producer.entries, ...reviewer.entries]) {
    const prior = entriesByRef.get(entry.evidenceRef);
    if (prior && !sameValue(prior, entry)) {
      bindingError('The reviewer repair evidence contains conflicting references.');
    }
    entriesByRef.set(entry.evidenceRef, entry);
  }
  const preimage = {
    schemaVersion: 1 as const,
    entries: [...entriesByRef.values()].sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef)),
  };
  const parsed = affiliateAgentEvidenceManifestSchema.safeParse({ ...preimage, hash: hash(preimage) });
  if (!parsed.success) bindingError('The reviewer repair evidence manifest is invalid.');
  return parsed.data;
};

const decodeGatewayNode = (
  job: GatewayJobRow,
  claim: GatewayClaimRow,
  receipt: GatewayReceiptRow,
): CompletedGatewayNode | null => {
  let envelopeValue: unknown = null;
  if (upper(job.role) === 'MAPPING_PRODUCER') {
    envelopeValue = parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(claim.claimEnvelopeJson);
  } else if (upper(job.role) === 'SUPPLY_REVIEWER') {
    const parsed = affiliateAgentClaimEnvelopeSchema.safeParse(claim.claimEnvelopeJson);
    envelopeValue = parsed.success && parsed.data.role === 'SUPPLY_REVIEWER' ? parsed.data : null;
  }
  const envelope = envelopeValue ? recordValue(envelopeValue) : null;
  const parsedManifest = affiliateAgentEvidenceManifestSchema.safeParse(job.evidenceManifestJson);
  const parsedResult = affiliateAgentTerminalResultEnvelopeSchema.safeParse(job.resultJson);
  if (!envelope || !parsedManifest.success || !parsedResult.success || !text(claim.terminalReceiptId)) return null;
  const result = parsedResult.data as unknown as AffiliateAgentTerminalResultEnvelope;
  return {
    job,
    claim,
    envelope,
    subject: recordValue(envelope.subject),
    manifest: parsedManifest.data,
    result: result as unknown as JsonRecord,
    receipt,
  };
};

const loadGatewayNode = async (db: AnyDelegate, claimId: string): Promise<CompletedGatewayNode | null> => {
  const claimRaw = await readUnique(db, 'affiliateAgentGatewayClaims', { where: { id: claimId } });
  if (!claimRaw) return null;
  const claim = claimRaw as unknown as GatewayClaimRow;
  const jobId = text(claim.jobId);
  if (!jobId) return null;
  const jobRaw = await readUnique(db, 'affiliateAgentGatewayJobs', { where: { id: jobId } });
  if (!jobRaw) return null;
  const job = jobRaw as unknown as GatewayJobRow;
  const receiptId = text(claim.terminalReceiptId);
  if (!receiptId) return null;
  const receiptRaw = await readUnique(db, 'affiliateAgentGatewayOperationReceipts', { where: { id: receiptId } });
  if (!receiptRaw) return null;
  return decodeGatewayNode(job, claim, receiptRaw as unknown as GatewayReceiptRow);
};

const assertAdmittedContractBinding = (
  context: AffiliateAgentExistingDataRepairContext,
  envelope: JsonRecord,
  expectedRole: 'MAPPING_PRODUCER' | 'SUPPLY_REVIEWER',
): void => {
  const deployment = recordValue((context as unknown as JsonRecord).deploymentContract);
  const roleReference = Array.isArray(deployment.roleContracts)
    ? deployment.roleContracts
      .map((value) => recordValue(value))
      .find((value) => value.role === expectedRole)
    : null;
  const promptReference = Array.isArray(deployment.promptTemplates)
    ? deployment.promptTemplates
      .map((value) => recordValue(value))
      .find((value) => value.role === expectedRole)
    : null;
  if (
    !normalizeHash(deployment.hash)
    || !Number.isInteger(deployment.version)
    || !roleReference
    || !promptReference
    || envelope.deploymentContractVersion !== deployment.version
    || normalizeHash(envelope.deploymentContractHash) !== normalizeHash(deployment.hash)
    || envelope.supplyContractVersion !== recordValue(deployment.activeSupplyContract).version
    || normalizeHash(envelope.supplyContractHash) !== normalizeHash(recordValue(deployment.activeSupplyContract).hash)
    || envelope.roleContractVersion !== roleReference.version
    || normalizeHash(envelope.roleContractHash) !== normalizeHash(roleReference.hash)
    || envelope.promptTemplateVersion !== promptReference.version
    || normalizeHash(envelope.promptTemplateHash) !== normalizeHash(promptReference.hash)
  ) {
    bindingError('The repair claim is not bound to the admitted deployment, supply, role, and prompt contracts.');
  }
};

const assertCompletedGatewayNode = (
  node: CompletedGatewayNode,
  expectedRole: 'MAPPING_PRODUCER' | 'SUPPLY_REVIEWER',
  rootId: string,
  mappingJobId: string,
  context?: AffiliateAgentExistingDataRepairContext,
): void => {
  const { job, claim, envelope, subject, manifest, result, receipt } = node;
  if (context) assertAdmittedContractBinding(context, envelope, expectedRole);
  const expectedQueue = expectedRole === 'MAPPING_PRODUCER' ? 'AFFILIATE_MAPPING' : 'AFFILIATE_REVIEW';
  const expectedLane = expectedRole === 'MAPPING_PRODUCER' ? 'MAPPING_PRODUCTION' : 'SUPPLY_REVIEW';
  const response = recordValue(receipt.responseJson);
  const resultRefs = Array.isArray(result.evidenceRefs)
    ? result.evidenceRefs.filter((value): value is string => typeof value === 'string')
    : [];
  const envelopeHash = (() => {
    try { return hash(envelope); } catch { return null; }
  })();
  const resultHash = (() => {
    try { return hash(result); } catch { return null; }
  })();
  const responseHash = (() => {
    try { return hash(receipt.responseJson); } catch { return null; }
  })();
  if (
    upper(job.role) !== expectedRole
    || upper(job.queue) !== expectedQueue
    || upper(job.lane) !== expectedLane
    || upper(job.subjectType) !== expectedRole
    || text(job.subjectId) !== (expectedRole === 'MAPPING_PRODUCER' ? mappingJobId : rootId)
    || text(job.supplySourceId) !== rootId
    || upper(claim.status) !== 'COMPLETED'
    || upper(job.status) !== 'COMPLETED'
    || job.activeClaimId !== null
    || text(job.parentClaimId) !== text(claim.parentClaimId)
    || text(claim.jobId) !== job.id
    || upper(claim.role) !== expectedRole
    || upper(claim.queue) !== expectedQueue
    || upper(claim.lane) !== expectedLane
    || typeof claim.claimGeneration !== 'number'
    || !Number.isInteger(claim.claimGeneration)
    || claim.claimGeneration < 1
    || typeof job.claimGeneration !== 'number'
    || !Number.isInteger(job.claimGeneration)
    || job.claimGeneration !== claim.claimGeneration
    || envelope.jobId !== job.id
    || envelope.claimId !== claim.id
    || envelope.role !== expectedRole
    || envelope.queue !== expectedQueue
    || envelope.lane !== expectedLane
    || envelope.supplySourceId !== rootId
    || envelope.claimGeneration !== claim.claimGeneration
    || envelope.lifecycleGeneration !== claim.lifecycleGeneration
    || job.expectedLifecycleGeneration !== claim.lifecycleGeneration
    || envelope.workerId !== claim.workerId
    || envelope.invocationId !== claim.invocationId
    || envelope.workspaceId !== claim.workspaceId
    || !sameValue(job.evidenceManifestJson, envelope.evidenceManifest)
    || !sameValue(manifest, envelope.evidenceManifest)
    || normalizeHash(manifest.hash) !== normalizeHash(claim.evidenceManifestHash)
    || normalizeHash(envelopeHash) !== normalizeHash(claim.claimEnvelopeHash)
    || !sameValue(claim.claimEnvelopeJson, envelope)
    || job.terminalDisposition !== result.disposition
    || normalizeHash(resultHash) !== normalizeHash(job.resultHash)
    || result.jobId !== job.id
    || result.claimId !== claim.id
    || result.role !== expectedRole
    || result.claimGeneration !== claim.claimGeneration
    || result.lifecycleGeneration !== claim.lifecycleGeneration
    || result.deploymentContractVersion !== envelope.deploymentContractVersion
    || result.deploymentContractHash !== envelope.deploymentContractHash
    || result.supplyContractVersion !== envelope.supplyContractVersion
    || result.supplyContractHash !== envelope.supplyContractHash
    || result.roleContractVersion !== envelope.roleContractVersion
    || result.roleContractHash !== envelope.roleContractHash
    || result.promptTemplateVersion !== envelope.promptTemplateVersion
    || result.promptTemplateHash !== envelope.promptTemplateHash
    || result.workerId !== envelope.workerId
    || result.invocationId !== envelope.invocationId
    || !sameValue(job.resultJson, result)
    || resultRefs.some((evidenceRef) => !manifest.entries.some((entry) => entry.evidenceRef === evidenceRef))
    || text(receipt.id) !== text(claim.terminalReceiptId)
    || text(job.terminalReceiptId) !== text(receipt.id)
    || text(receipt.jobId) !== job.id
    || text(receipt.claimId) !== claim.id
    || receipt.claimGeneration !== claim.claimGeneration
    || upper(receipt.operationKind) !== 'SUBMIT_RESULT'
    || upper(receipt.status) !== 'SUCCEEDED'
    || !receipt.completedAt
    || normalizeHash(responseHash) !== normalizeHash(receipt.responseHash)
    || response.kind !== 'TERMINAL_ACCEPTED'
    || response.receiptId !== receipt.id
    || normalizeHash(response.resultHash) !== normalizeHash(resultHash)
    || response.disposition !== result.disposition
  ) {
    bindingError('The completed Gateway claim ancestry is not immutable.');
  }
  if (expectedRole === 'MAPPING_PRODUCER') {
    const payload = recordValue(result.payload);
    const packageHash = normalizeHash(payload.packageHash);
    const pass = Number(subject.pass);
    if (
      subject.type !== 'MAPPING_PRODUCER'
      || subject.mappingJobId !== mappingJobId
      || subject.supplySourceId !== rootId
      || !packageHash
      || !text(payload.commitReceiptId)
      || !['PACKAGE_COMMITTED', 'BOUNDED_REPAIR_SUBMITTED'].includes(String(result.disposition))
      || String(result.disposition) === 'BOUNDED_REPAIR_SUBMITTED'
        && (!Number.isInteger(Number(payload.repairPass)) || Number(payload.repairPass) !== pass)
    ) {
      bindingError('The completed producer claim result is not a committed repair package.');
    }
  } else {
    if (
      subject.type !== 'SUPPLY_REVIEWER'
      || subject.supplySourceId !== rootId
      || !text(subject.producerClaimId)
      || !text(subject.producerWorkerId)
      || !text(subject.producerInvocationId)
      || !text(subject.producerWorkspaceId)
      || !normalizeHash(subject.committedPackageHash)
      || !Number.isInteger(Number(subject.reviewPass))
      || Number(subject.reviewPass) < 1
      || Number(subject.reviewPass) > 3
    ) {
      bindingError('The completed reviewer claim subject is invalid.');
    }
  }
};

const assertReviewerManifestAuthorized = async (
  db: AnyDelegate | null,
  reviewer: CompletedGatewayNode,
  producer: CompletedGatewayNode,
  suppliedArtifacts?: readonly GatewayArtifactRow[],
): Promise<void> => {
  const reviewerSubject = reviewer.subject;
  const entries = reviewer.manifest.entries;
  const requiredKinds = [
    'ACTIVE_SUPPLY_CONTRACT',
    'COMMITTED_PACKAGE',
    'DETERMINISTIC_VALIDATION',
    'DURABLE_EVIDENCE',
  ] as const;
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  const producerPayload = recordValue(producer.result.payload);
  const producerPackageHash = normalizeHash(producerPayload.packageHash);
  const allowed = entries.length === requiredKinds.length
    && entries.every((entry) => requiredKinds.includes(entry.kind as typeof requiredKinds[number]))
    && requiredKinds.every((kind) => counts.get(kind) === 1);
  const activeContract = entries.find((entry) => entry.kind === 'ACTIVE_SUPPLY_CONTRACT');
  const committedPackage = entries.find((entry) => entry.kind === 'COMMITTED_PACKAGE');
  if (
    !allowed
    || !activeContract
    || !committedPackage
    || normalizeHash(activeContract.sha256) !== normalizeHash(producer.envelope.supplyContractHash)
    || normalizeHash(committedPackage.sha256) !== normalizeHash(reviewerSubject.committedPackageHash)
    || normalizeHash(committedPackage.sha256) !== producerPackageHash
  ) {
    bindingError('The reviewer evidence manifest is not authorized by its producer claim.');
  }
  const producerArtifacts = suppliedArtifacts ?? await delegateRows<GatewayArtifactRow>(db?.affiliateAgentGatewayArtifacts, {
    where: {
      claimId: producer.claim.id,
      claimGeneration: Number(producer.envelope.claimGeneration),
      creatingClaimId: producer.claim.id,
    },
  });
  for (const kind of requiredKinds.slice(1)) {
    const entry = entries.find((candidate) => candidate.kind === kind);
    const matches = producerArtifacts.filter((artifact) => {
      const owned = artifact.claimId === producer.claim.id
        && artifact.creatingClaimId === producer.claim.id;
      const row = recordValue(artifact);
      return artifact.evidenceKind === kind
        && artifact.sourceArtifactId === entry?.artifactId
        && artifact.fileId === entry?.artifactId
        && normalizeHash(artifact.contentHash) === normalizeHash(entry?.sha256)
        && artifact.mimeType === entry?.mimeType
        && artifact.byteSize === entry?.byteSize
        && owned
        && (row.isPinned === undefined || row.isPinned === true)
        && (row.retentionClass === undefined || row.retentionClass === 'INDEFINITE');
    });
    if (!entry || matches.length !== 1) {
      bindingError('The reviewer evidence artifact is not immutably owned by its producer.');
    }
  }
};

const stringArray = (value: unknown): string[] | null => (
  Array.isArray(value) && value.every((candidate) => typeof candidate === 'string')
    ? value as string[]
    : null
);

const assertOriginalAdmissionAudit = async (
  db: AnyDelegate,
  originJob: GatewayJobRow,
  originManifest: AffiliateAgentEvidenceManifest,
  originNode: CompletedGatewayNode | null,
  context: AffiliateAgentExistingDataRepairContext,
  mappingJob: MappingJobRow,
  source: SourceRow,
  intake: IntakeRow,
  run: RunRow,
  root: RootRow,
): Promise<void> => {
  const originJobId = text(originJob.id);
  const originDedupeKey = text(originJob.dedupeKey);
  if (
    !originJobId
    || !originDedupeKey?.startsWith(AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX)
    || originDedupeKey.startsWith('mapping-repair:')
    || upper(originJob.role) !== 'MAPPING_PRODUCER'
    || upper(originJob.queue) !== 'AFFILIATE_MAPPING'
    || upper(originJob.lane) !== 'MAPPING_PRODUCTION'
    || upper(originJob.subjectType) !== 'MAPPING_PRODUCER'
    || text(originJob.subjectId) !== mappingJob.id
    || text(originJob.supplySourceId) !== root.id
    || text(originJob.parentClaimId) !== null
  ) {
    bindingError('The original existing-data repair admission job is not immutable.');
  }
  const originSubject = recordValue(originJob.subjectJson);
  if (
    originSubject.type !== 'MAPPING_PRODUCER'
    || originSubject.mappingJobId !== mappingJob.id
    || originSubject.supplySourceId !== root.id
    || Number(originSubject.pass) !== 1
    || !sameValue(originSubject.repairContext, context)
    || !sameValue(originJob.evidenceManifestJson, originManifest)
  ) {
    bindingError('The original existing-data repair admission subject is not immutable.');
  }
  if (originNode) {
    if (originNode.job.id !== originJob.id || originNode.claim.parentClaimId !== null) {
      bindingError('The original producer claim parent is invalid.');
    }
  }
  const history = admissionHistory(mappingJob.resultSummary).filter((entry) => (
    normalizeHash(entry.reportHash) === context.admissionHash
    && text(entry.gatewayJobId) === originJobId
    && sameValue(entry.repairContext, context)
  ));
  if (history.length !== 1) bindingError('The original existing-data repair admission audit is missing.');
  const audit = history[0]!;
  const created = recordValue(audit.createdIds);
  const selectedRow = recordValue(audit.selectedRow);
  const selectedWrite = recordValue(audit.selectedWrite);
  const report = reportSnapshot(audit.reportSnapshot);
  const reportRows = Array.isArray(report.rows) ? report.rows.map(recordValue) : [];
  const reportWrites = Array.isArray(report.proposedWrites) ? report.proposedWrites.map(recordValue) : [];
  const reportSelectedJobIds = stringArray(report.selectedJobIds);
  const reportProposedJobIds = stringArray(report.proposedJobIds);
  const auditSelectedJobIds = stringArray(audit.selectedJobIds);
  const reportRequestedJobIdsValid = report.requestedJobIds === null || stringArray(report.requestedJobIds) !== null;
  const reportRequestedSourceIdsValid = report.requestedSourceIds === null || stringArray(report.requestedSourceIds) !== null;
  const auditRequestedJobIdsValid = audit.requestedJobIds === null || stringArray(audit.requestedJobIds) !== null;
  const auditRequestedSourceIdsValid = audit.requestedSourceIds === null || stringArray(audit.requestedSourceIds) !== null;
  const reportRequestedJobIds = report.requestedJobIds === null ? null : stringArray(report.requestedJobIds) ?? [];
  const reportRequestedSourceIds = report.requestedSourceIds === null ? null : stringArray(report.requestedSourceIds) ?? [];
  const auditRequestedJobIds = audit.requestedJobIds === null ? null : stringArray(audit.requestedJobIds) ?? [];
  const auditRequestedSourceIds = audit.requestedSourceIds === null ? null : stringArray(audit.requestedSourceIds) ?? [];
  const reportRow = reportRows.filter((row) => text(row.mappingJobId) === mappingJob.id);
  const reportWrite = reportWrites.filter((write) => text(write.mappingJobId) === mappingJob.id);
  const expectedWrite = reportWrite.length === 1
    ? { ...reportWrite[0]!, sourceId: source.id, supplySourceId: root.id }
    : null;
  let recomputedReportHash: string | null = null;
  if (
    typeof report.contractVersion === 'number'
    && text(report.contractHash)
    && reportRequestedJobIdsValid
    && reportRequestedSourceIdsValid
    && reportSelectedJobIds
    && auditSelectedJobIds
    && reportRows.length > 0
    && reportWrites.length > 0
    && report.counts
  ) {
    try {
      recomputedReportHash = reportHashFor({
        contractVersion: report.contractVersion,
        contractHash: text(report.contractHash)!,
        reason: text(report.reason)!,
        operatorId: text(report.operatorId)!,
        requestedJobIds: reportRequestedJobIds,
        requestedSourceIds: reportRequestedSourceIds,
        evidenceSelections: report.evidenceSelections as ExistingDataRepairEvidenceSelection[] | null,
        selectionLimit: Number(report.selectionLimit),
        counts: recordValue(report.counts) as unknown as AffiliateExistingDataRepairAdmissionCounts,
        selectedJobIds: reportSelectedJobIds,
        rows: reportRows as unknown as AffiliateExistingDataRepairAdmissionRow[],
        proposedWrites: reportWrites as unknown as AffiliateExistingDataRepairAdmissionWrite[],
      });
    } catch {
      recomputedReportHash = null;
    }
  }
  const reportCounts = recordValue(report.counts);
  const sourceAdmission = recordValue(recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  const rootAdmission = recordValue(recordValue(root.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  const admissionEvidence = Array.isArray(audit.evidenceSnapshots)
    ? audit.evidenceSnapshots
    : [];
  const admissionPages = Array.isArray(audit.pageSnapshots)
    ? audit.pageSnapshots
    : [];
  const admissionPolicies = Array.isArray(audit.policySnapshots)
    ? audit.policySnapshots
    : [];
  const expectedRepairReasons = sortedUnique([
    String(audit.reason ?? ''),
    ...recordedRepairReasons(mappingJob.resultSummary),
  ]);
  const sourceBaseline = recordValue(sourceAdmission.baseline);
  const auditBaselineHash = (() => {
    try {
      return hash({
        source: audit.sourceState,
        workingMapping: audit.workingMappingState,
        organization: audit.organizationState,
      });
    } catch {
      return null;
    }
  })();
  const artifactIds = stringArray(audit.artifactIds);
  const createdArtifactIds = stringArray(created.evidenceArtifactIds);
  const expectedArtifactIds = originManifest.entries.map((entry) => entry.artifactId).sort();
  const expectedCreatedArtifactIds = expectedArtifactIds.slice().sort();
  const auditIdentityValid = (
    normalizeHash(audit.reportHash) === context.admissionHash
    && text(audit.mappingJobId) === mappingJob.id
    && text(audit.intakeId) === intake.id
    && text(audit.evidenceRunId) === run.id
    && text(audit.sourceId) === source.id
    && text(audit.supplySourceId) === root.id
    && text(audit.rootId) === root.id
    && text(audit.rootIdentityKey) === root.identityKey
    && text(recordValue(audit.legacyMappingJobState).nextStatus) === AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS
    && [AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS, 'COMPLETED', 'HUMAN_REVIEW_REQUIRED'].includes(mappingJob.status)
    && (mappingJob.legacyIdentityMigrationEligible === undefined || mappingJob.legacyIdentityMigrationEligible === false)
    && text(audit.gatewayJobId) === originJobId
    && text(audit.gatewayDedupeKey) === originDedupeKey
    && text(created.gatewayJobId) === originJobId
    && text(created.mappingJobId) === mappingJob.id
    && text(created.sourceId) === source.id
    && text(created.supplySourceId) === root.id
    && text(audit.operatorId) !== null
    && text(audit.reason) !== null
    && text(audit.operatorId) === text(report.operatorId)
    && text(audit.reason) === text(report.reason)
    && sameValue(context.repairReasons, expectedRepairReasons)
    && sameValue(audit.deploymentContract, (context as unknown as JsonRecord).deploymentContract)
    && (admissionEvidence.length === 0 || sameValue(admissionEvidence, audit.evidenceSnapshots))
    && (admissionPages.length === 0 || sameValue(admissionPages, audit.pageSnapshots))
    && (admissionPolicies.length === 0 || sameValue(admissionPolicies, audit.policySnapshots))
    && sameValue(audit.repairContext, context)
    && sameValue(audit.manifest, originManifest)
    && normalizeHash(audit.sourceStateSha256) === context.sourceStateSha256
    && auditBaselineHash === context.sourceStateSha256
    && Number(audit.rootLifecycleGeneration) === Number(
      originNode ? originNode.envelope.lifecycleGeneration : originJob.expectedLifecycleGeneration,
    )
    && artifactIds !== null
    && createdArtifactIds !== null
    && sameValue(artifactIds, expectedArtifactIds)
    && sameValue(createdArtifactIds, expectedCreatedArtifactIds)
    && selectedRow.jobId === mappingJob.id
    && selectedRow.mappingJobId === mappingJob.id
    && selectedRow.intakeId === intake.id
    && selectedRow.sourceId === source.id
    && (selectedRow.mappingId ?? null) === (audit.mappingId ?? null)
    && selectedRow.supplySourceId === root.id
    && selectedRow.rootId === root.id
    && selectedRow.evidenceRunId === run.id
    && selectedRow.gatewayJobId === originJobId
    && selectedRow.eligible === true
    && selectedRow.outcome === 'APPLIED'
    && reportRequestedJobIdsValid
    && reportRequestedSourceIdsValid
    && auditRequestedJobIdsValid
    && auditRequestedSourceIdsValid
    && sameValue(auditSelectedJobIds, reportSelectedJobIds)
    && sameValue(reportProposedJobIds, reportSelectedJobIds)
    && sameValue(auditRequestedJobIds, reportRequestedJobIds)
    && sameValue(auditRequestedSourceIds, reportRequestedSourceIds)
    && Number(audit.selectionLimit) === Number(report.selectionLimit)
    && reportRow.length === 1
    && reportWrite.length === 1
    && (reportRow[0]!.mappingId ?? null) === (audit.mappingId ?? null)
    && sameValue(selectedWrite, expectedWrite)
    && reportRow[0]!.eligible === true
    && reportRow[0]!.outcome === 'APPLIED'
    && text(reportRow[0]!.stateFingerprint) !== null
    && reportWrite[0]!.gatewayDedupeKey === originDedupeKey
    && report.mode === 'APPLY'
    && normalizeHash(report.reportHash) === context.admissionHash
    && recomputedReportHash === context.admissionHash
    && report.reviewedReportHash === null
    && report.replayed === false
    && sameValue(sourceAdmission.evidenceSnapshots, audit.evidenceSnapshots)
    && sameValue(sourceAdmission.pageSnapshots, audit.pageSnapshots)
    && sameValue(sourceAdmission.policySnapshots, audit.policySnapshots)
    && sameValue(sourceAdmission.deploymentContract, (context as unknown as JsonRecord).deploymentContract)
    && Array.isArray(report.appliedJobs)
    && report.appliedJobs.length === 0
    && Number(report.writeCount) === reportSelectedJobIds?.length
    && Number(reportCounts.selected) === reportSelectedJobIds?.length
  );
  const sourceAuditValid = (
    sameValue(sourceAdmission, rootAdmission)
    && text(sourceAdmission.reportHash) === context.admissionHash
    && text(sourceAdmission.mappingJobId) === mappingJob.id
    && text(sourceAdmission.intakeId) === intake.id
    && text(sourceAdmission.evidenceRunId) === run.id
    && text(sourceAdmission.sourceId) === source.id
    && text(sourceAdmission.supplySourceId) === root.id
    && sameValue(sourceAdmission.context, context)
    && text(sourceBaseline.sourceStateSha256) === context.sourceStateSha256
    && sameValue(sourceBaseline.sourceState, audit.sourceState)
    && sameValue(sourceBaseline.workingMappingState, audit.workingMappingState)
    && sameValue(sourceBaseline.organizationState, audit.organizationState)
    && sameValue(sourceAdmission.evidenceSnapshots, audit.evidenceSnapshots)
    && sameValue(sourceAdmission.pageSnapshots, audit.pageSnapshots)
    && sameValue(sourceAdmission.policySnapshots, audit.policySnapshots)
    && sameValue(sourceAdmission.deploymentContract, (context as unknown as JsonRecord).deploymentContract)
  );
  if (
    !auditIdentityValid
    || !sourceAuditValid
    || reportSelectedJobIds === null
    || auditSelectedJobIds === null
    || reportProposedJobIds === null
    || !reportRequestedJobIdsValid
    || !reportRequestedSourceIdsValid
    || !auditRequestedJobIdsValid
    || !auditRequestedSourceIdsValid
  ) {
    bindingError('The original existing-data repair audit is not bound to the immutable admission.');
  }
  const events = await delegateRows<JsonRecord>(db.affiliateAgentGatewayEvents, {
    where: { jobId: originJobId, eventType: 'JOB_CREATED' },
    orderBy: { id: 'asc' },
    take: 2,
  });
  const event = events.length === 1 ? events[0]! : null;
  if (
    !event
    || text(event.id) === null
    || text(event.eventKey) !== `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${originJobId}:created`
    || text(event.jobId) !== originJobId
    || text(event.claimId) !== null
    || text(event.receiptId) !== null
    || Number(event.sequence) !== 1
    || upper(event.eventType) !== 'JOB_CREATED'
    || upper(event.actorKind) !== 'OPERATOR'
    || text(event.actorId) !== text(audit.operatorId)
    || upper(event.role) !== 'MAPPING_PRODUCER'
    || normalizeHash(event.requestHash) !== context.admissionHash
    || normalizeHash(event.outputHash) !== context.admissionHash
    || !sameValue(event.inputHash, reportRow[0]!.stateFingerprint)
    || !sameValue(event.payload, audit)
    || !sameValue(event.reasonCodes, ['EXISTING_DATA_REPAIR_ADMITTED'])
  ) {
    bindingError('The original existing-data repair creation audit is missing or forged.');
  }
};

const assertProducerKindBinding = (
  context: AffiliateAgentExistingDataRepairContext,
  source: SourceRow,
  root: RootRow,
  subject: JsonRecord,
  child: boolean,
  completed: CompletedGatewayNode | null,
): void => {
  const sourceKind = upper(source.targetKind);
  const rootKind = upper(root.targetKind);
  const claimedKind = text(subject.listingKind) ? upper(subject.listingKind) : null;
  if (
    (sourceKind !== 'UNCLASSIFIED' && !SUPPORTED_KINDS.has(sourceKind as AffiliateAgentListingKind))
    || (rootKind !== 'UNCLASSIFIED' && !SUPPORTED_KINDS.has(rootKind as AffiliateAgentListingKind))
    || sourceKind !== rootKind && sourceKind !== 'UNCLASSIFIED' && rootKind !== 'UNCLASSIFIED'
  ) {
    bindingError('The producer source kind is not supported or source/root kinds differ.');
  }
  if (context.sourceKindAssessment) {
    const allowed = context.sourceKindAssessment.allowedListingKinds;
    if (sourceKind === 'UNCLASSIFIED' || rootKind === 'UNCLASSIFIED') {
      if (sourceKind !== 'UNCLASSIFIED'
        || rootKind !== 'UNCLASSIFIED'
        || child
        || claimedKind && !allowed.includes(claimedKind as AffiliateAgentListingKind)) {
        bindingError('The unclassified producer source kind is outside its admitted assessment.');
      }
      return;
    }
    if (!allowed.includes(sourceKind as AffiliateAgentListingKind) || sourceKind !== rootKind) {
      bindingError('The producer source kind is outside its admitted assessment.');
    }
    if (!child) {
      const disposition = text(completed?.result.disposition);
      if (!completed || !['PACKAGE_COMMITTED', 'BOUNDED_REPAIR_SUBMITTED'].includes(disposition ?? '')) {
        bindingError('A private source kind changed outside a validated producer commit.');
      }
      if (claimedKind && claimedKind !== sourceKind) {
        bindingError('The completed producer source kind is outside its admitted assessment.');
      }
      return;
    }
    if (claimedKind && !allowed.includes(claimedKind as AffiliateAgentListingKind)) {
      bindingError('The child producer source kind is outside its admitted assessment.');
    }
    return;
  }
  if (
    sourceKind === 'UNCLASSIFIED'
    || rootKind === 'UNCLASSIFIED'
    || sourceKind !== rootKind

    || !claimedKind
    || claimedKind !== sourceKind
  ) {
    bindingError('The concrete producer source kind is not immutable.');
  }
};
const assertRepairDirectiveBinding = (
  childSubject: JsonRecord,
  reviewer: CompletedGatewayNode,
  producer: CompletedGatewayNode,
): void => {
  const parsed = affiliateAgentMappingRepairDirectiveSchema.safeParse(childSubject.repairDirective);
  if (!parsed.success) bindingError('The repair child directive is missing or malformed.');
  const reviewerResultHash = hash(reviewer.result);
  const reviewerPayload = recordValue(reviewer.result.payload);
  const committedPackageHash = normalizeHash(reviewerPayload.committedPackageHash);
  const producerPackageHash = normalizeHash(recordValue(producer.result.payload).packageHash);
  const expected = {
    schemaVersion: 1 as const,
    reviewerClaimId: reviewer.claim.id,
    reviewerResultHash,
    committedPackageHash,
    repairIssues: Array.isArray(reviewerPayload.repairIssues)
      ? sortedUnique(reviewerPayload.repairIssues.filter((value): value is string => typeof value === 'string'))
      : [],
    summary: String(reviewer.result.summary ?? ''),
  };
  if (
    !committedPackageHash
    || !producerPackageHash
    || committedPackageHash !== producerPackageHash
    || normalizeHash(reviewer.job.resultHash) !== reviewerResultHash
    || !sameValue(parsed.data, expected)
  ) {
    bindingError('The repair child directive is not an exact server-authored copy of its completed reviewer result.');
  }
};

type ExistingRepairOrigin = Readonly<{
  job: GatewayJobRow;
  manifest: AffiliateAgentEvidenceManifest;
  node: CompletedGatewayNode | null;
}>;

const resolveExistingRepairOrigin = async (
  db: AnyDelegate,
  currentJob: GatewayJobRow,
  currentSubject: JsonRecord,
  currentManifest: AffiliateAgentEvidenceManifest,
  currentNode: CompletedGatewayNode | null,
  context: AffiliateAgentExistingDataRepairContext,
  rootId: string,
  mappingJobId: string,
): Promise<ExistingRepairOrigin> => {
  const currentDedupeKey = text(currentJob.dedupeKey) ?? '';
  const isInitial = currentDedupeKey.startsWith(AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX)
    && !currentDedupeKey.startsWith('mapping-repair:');
  if (isInitial) {
    if (
      text(currentJob.parentClaimId) !== null
      || currentSubject.type !== 'MAPPING_PRODUCER'
      || currentSubject.mappingJobId !== mappingJobId
      || currentSubject.supplySourceId !== rootId
      || Number(currentSubject.pass) !== 1
    ) {
      bindingError('The original existing-data repair producer lineage is malformed.');
    }
    return { job: currentJob, manifest: currentManifest, node: currentNode };
  }
  if (!currentDedupeKey.startsWith('mapping-repair:')) {
    bindingError('The repair producer lineage has an unauthorized dedupe key.');
  }
  let childJob = currentJob;
  let childSubject = currentSubject;
  let childManifest = currentManifest;
  const visitedJobs = new Set<string>([currentJob.id]);
  const visitedClaims = new Set<string>();
  for (let depth = 0; depth < 3; depth += 1) {
    const reviewerClaimId = text(childJob.parentClaimId);
    if (!reviewerClaimId || visitedClaims.has(reviewerClaimId)) {
      bindingError('The reviewer repair ancestry is cyclic or incomplete.');
    }
    visitedClaims.add(reviewerClaimId);
    const reviewer = await loadGatewayNode(db, reviewerClaimId);
    if (!reviewer || visitedJobs.has(reviewer.job.id)) {
      bindingError('The reviewer repair ancestry is missing or cyclic.');
    }
    visitedJobs.add(reviewer.job.id);
    assertCompletedGatewayNode(reviewer, 'SUPPLY_REVIEWER', rootId, mappingJobId, context);
    const reviewerSubject = reviewer.subject;
    const producerClaimId = text(reviewerSubject.producerClaimId);
    if (!producerClaimId || visitedClaims.has(producerClaimId)) {
      bindingError('The reviewer repair producer claim ancestry is cyclic or incomplete.');
    }
    visitedClaims.add(producerClaimId);
    const producer = await loadGatewayNode(db, producerClaimId);
    if (!producer || visitedJobs.has(producer.job.id)) {
      bindingError('The reviewer repair producer ancestry is missing or cyclic.');
    }
    visitedJobs.add(producer.job.id);
    assertCompletedGatewayNode(producer, 'MAPPING_PRODUCER', rootId, mappingJobId, context);
    await assertReviewerManifestAuthorized(db, reviewer, producer);
    const producerResultPayload = recordValue(producer.result.payload);
    const reviewerResultPayload = recordValue(reviewer.result.payload);
    assertRepairDirectiveBinding(childSubject, reviewer, producer);
    const childPass = Number(childSubject.pass);
    const reviewerPass = Number(reviewerSubject.reviewPass);
    const producerPackageHash = normalizeHash(producerResultPayload.packageHash);
    if (
      text(reviewer.job.parentClaimId) !== producer.claim.id
      || reviewerSubject.type !== 'SUPPLY_REVIEWER'
      || reviewerSubject.supplySourceId !== rootId
      || reviewerSubject.producerClaimId !== producer.claim.id
      || reviewerSubject.producerWorkerId !== producer.claim.workerId
      || reviewerSubject.producerInvocationId !== producer.claim.invocationId
      || reviewerSubject.producerWorkspaceId !== producer.claim.workspaceId
      || !sameValue(reviewerSubject.repairContext, context)
      || !sameValue(producer.subject.repairContext, context)
      || upper(reviewer.result.disposition) !== 'PRODUCER_REPAIR_REQUIRED'
      || normalizeHash(reviewerResultPayload.committedPackageHash) !== normalizeHash(reviewerSubject.committedPackageHash)
      || normalizeHash(reviewerResultPayload.committedPackageHash) !== producerPackageHash
      || !Number.isInteger(reviewerPass)
      || reviewerPass < 1
      || reviewerPass > 3
      || !Number.isInteger(childPass)
      || childPass !== reviewerPass + 1
      || childPass > 3
      || text(childJob.parentClaimId) !== reviewer.claim.id
      || childSubject.type !== 'MAPPING_PRODUCER'
      || childSubject.mappingJobId !== mappingJobId
      || childSubject.supplySourceId !== rootId
      || !sameValue(childSubject.repairContext, context)
      || text(childJob.subjectId) !== mappingJobId
      || text(childJob.supplySourceId) !== rootId
      || text(childJob.dedupeKey) !== `mapping-repair:${producer.claim.id}:${reviewerSubject.committedPackageHash}:${childPass}`
      || !sameValue(childManifest, manifestUnionFor(producer.manifest, reviewer.manifest))
    ) {
      bindingError('The reviewer repair producer edge is not bound to its completed reviewer decision.');
    }
    const producerDedupeKey = text(producer.job.dedupeKey) ?? '';
    if (producerDedupeKey.startsWith(AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX)
      && !producerDedupeKey.startsWith('mapping-repair:')) {
      if (text(producer.job.parentClaimId) !== null || Number(producer.subject.pass) !== 1) {
        bindingError('The original producer parent edge is invalid.');
      }
      return { job: producer.job, manifest: producer.manifest, node: producer };
    }
    if (!producerDedupeKey.startsWith('mapping-repair:')) {
      bindingError('The reviewer repair producer parent is not an existing-data repair job.');
    }
    childJob = producer.job;
    childSubject = producer.subject;
    childManifest = producer.manifest;
  }
  bindingError('The bounded reviewer repair ancestry exceeds three passes.');
};

const pendingProducerManifestFor = async (
  db: AnyDelegate,
  source: SourceRow,
  context: AffiliateAgentExistingDataRepairContext,
  rootId: string,
  mappingJobId: string,
): Promise<AffiliateAgentEvidenceManifest | null> => {
  const sourcePending = recordValue(recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY]);
  if (!Object.keys(sourcePending).length) return null;
  const parsedPending = affiliateExistingDataRepairPendingMappingSchema.safeParse(sourcePending);
  if (!parsedPending.success) bindingError('The server-owned pending mapping proof is invalid.');
  const pending = parsedPending.data;
  const producerClaimId = text(pending.producerClaimId);
  const producerJobId = text(pending.producerJobId);
  if (!producerClaimId || !producerJobId) {
    bindingError('The pending mapping proof has no immutable producer claim.');
  }
  const producer = await loadGatewayNode(db, producerClaimId);
  if (!producer) bindingError('The pending mapping producer claim is missing.');
  assertCompletedGatewayNode(producer, 'MAPPING_PRODUCER', rootId, mappingJobId, context);
  if (
    producer.claim.id !== producerClaimId
    || producer.job.id !== producerJobId
    || normalizeHash(recordValue(producer.result.payload).packageHash) !== normalizeHash(pending.packageHash)
    || !sameValue(producer.subject.repairContext, context)
    || producer.subject.mappingJobId !== mappingJobId
    || producer.subject.supplySourceId !== rootId
  ) {
    bindingError('The pending mapping producer is not bound to its server-owned pointer.');
  }
  const reviewerClaimId = text(pending.reviewerClaimId);
  const reviewerJobId = text(pending.reviewerJobId);
  if ((reviewerClaimId === null) !== (reviewerJobId === null)) {
    bindingError('The pending mapping reviewer pointer is incomplete.');
  }
  if (reviewerClaimId) {
    const reviewer = await loadGatewayNode(db, reviewerClaimId);
    if (!reviewer) bindingError('The pending mapping reviewer claim is missing.');
    assertCompletedGatewayNode(reviewer, 'SUPPLY_REVIEWER', rootId, mappingJobId, context);
    if (
      reviewer.job.id !== reviewerJobId
      || text(producer.job.parentClaimId) !== reviewer.claim.id
      || reviewer.subject.producerClaimId === producer.claim.id
      || upper(reviewer.result.disposition) !== 'PRODUCER_REPAIR_REQUIRED'
    ) {
      bindingError('The pending mapping reviewer pointer is not immutable.');
    }
    const reviewedProducerId = text(reviewer.subject.producerClaimId);
    if (!reviewedProducerId) bindingError('The requesting reviewer has no reviewed producer.');
    const reviewedProducer = await loadGatewayNode(db, reviewedProducerId);
    if (!reviewedProducer) bindingError('The requesting reviewer producer is missing.');
    assertCompletedGatewayNode(reviewedProducer, 'MAPPING_PRODUCER', rootId, mappingJobId, context);
    if (Number(reviewedProducer.subject.pass) + 1 !== Number(producer.subject.pass)
      || !sameValue(reviewedProducer.subject.repairContext, context)) {
      bindingError('The pending mapping producer is not the next authorized repair pass.');
    }
    await assertReviewerManifestAuthorized(db, reviewer, reviewedProducer);
  } else if (text(producer.job.parentClaimId) !== null) {
    bindingError('A reviewer-created pending mapping is missing its reviewer pointer.');
  }
  return producer.manifest;
};

export const assertAffiliateExistingDataRepairClaimBinding = async (input: Readonly<{ prisma: PrismaClient | Prisma.TransactionClient; job: unknown; claim: unknown }>): Promise<void> => {
  const client = input.prisma as Client;
  const db = client as unknown as AnyDelegate;
  const submittedJob = recordValue(input.job);
  const submittedJobId = text(submittedJob.id);
  if (!submittedJobId) bindingError('The Gateway job identity is missing.');
  const persistedJobRaw = await readUnique(db, 'affiliateAgentGatewayJobs', { where: { id: submittedJobId } });
  if (!persistedJobRaw) bindingError('The Gateway job is not present in the active database.');
  const job = persistedJobRaw as unknown as GatewayJobRow;
  const dedupeKey = text(job.dedupeKey) ?? '';
  const initialDedupe = dedupeKey.startsWith(AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX);
  const childDedupe = dedupeKey.startsWith('mapping-repair:');
  if (
    upper(job.role) !== 'MAPPING_PRODUCER'
    || upper(job.subjectType) !== 'MAPPING_PRODUCER'
    || (!initialDedupe && !childDedupe)
    || text(job.id) !== submittedJobId
  ) {
    bindingError('The Gateway job is not an existing-data repair producer job.');
  }
  const parsedJobSubjectResult = affiliateAgentSubjectSchema.safeParse(job.subjectJson);
  if (!parsedJobSubjectResult.success || parsedJobSubjectResult.data.type !== 'MAPPING_PRODUCER') {
    bindingError('The repair producer subject is invalid.');
  }
  const parsedJobSubject = parsedJobSubjectResult.data;
  const context = parseContext(recordValue(parsedJobSubject.repairContext));
  const parsedManifestResult = affiliateAgentEvidenceManifestSchema.safeParse(job.evidenceManifestJson);
  if (!parsedManifestResult.success) bindingError('The repair producer evidence manifest is invalid.');
  const manifest = parsedManifestResult.data;
  const parsedClaim = parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(input.claim);
  if (!parsedClaim || parsedClaim.role !== 'MAPPING_PRODUCER') {
    bindingError('The repair producer claim envelope is invalid.');
  }
  const envelope = parsedClaim;
  const subject = recordValue(envelope.subject);
  assertAdmittedContractBinding(context, recordValue(envelope), 'MAPPING_PRODUCER');
  if (
    envelope.jobId !== submittedJobId
    || envelope.queue !== 'AFFILIATE_MAPPING'
    || envelope.lane !== 'MAPPING_PRODUCTION'
    || envelope.role !== 'MAPPING_PRODUCER'
    || envelope.subject.mappingJobId !== parsedJobSubject.mappingJobId
    || envelope.subject.supplySourceId !== parsedJobSubject.supplySourceId
    || envelope.subject.repairContext?.kind !== 'EXISTING_DATA_REPAIR'
    || !producerSubjectsEquivalent(recordValue(job.subjectJson), recordValue(envelope.subject))
    || !sameValue(envelope.evidenceManifest, manifest)
    || envelope.supplySourceId !== (text(job.supplySourceId) ?? null)
    || text(job.subjectId) !== parsedJobSubject.mappingJobId
    || upper(job.queue) !== 'AFFILIATE_MAPPING'
    || upper(job.lane) !== 'MAPPING_PRODUCTION'
  ) {
    bindingError('The repair producer claim identity is invalid.');
  }
  const isNewClaim = ['QUEUED', 'RETRY_WAIT'].includes(upper(job.status));
  if (
    text(job.activeClaimId) !== null
    || typeof job.claimGeneration !== 'number'
    || !Number.isInteger(job.claimGeneration)
    || job.claimGeneration + (isNewClaim ? 1 : 0) !== envelope.claimGeneration
    || envelope.lifecycleGeneration !== job.expectedLifecycleGeneration
  ) {
    bindingError('The repair claim generation does not match its Gateway job.');
  }
  let completedNode: CompletedGatewayNode | null = null;
  if (!isNewClaim) {
    if (upper(job.status) !== 'COMPLETED') bindingError('The repair producer is not ready for independent review.');
    completedNode = await loadGatewayNode(db, envelope.claimId);
    if (!completedNode) bindingError('The completed repair producer claim is missing.');
    if (!sameValue(completedNode.envelope, envelope)) {
      bindingError('The completed repair producer claim does not match its immutable envelope.');
    }
  }
  const mappingJob = await readUnique(db, 'affiliateSourceMappingJobs', { where: { id: parsedJobSubject.mappingJobId } }) as unknown as MappingJobRow | null;
  if (!mappingJob) bindingError('The admitted mapping job is missing.');
  const intake = await readUnique(db, 'affiliateSourceIntakes', { where: { id: mappingJob.intakeId } }) as unknown as IntakeRow | null;
  const source = await readUnique(db, 'affiliateScrapeSources', { where: { id: context.sourceId } }) as unknown as SourceRow | null;
  const root = await readUnique(db, 'affiliateSupplySources', { where: { id: parsedJobSubject.supplySourceId } }) as unknown as RootRow | null;
  const mapping = mappingJob.mappingId
    ? await readUnique(db, 'affiliateScrapeMappings', { where: { id: mappingJob.mappingId } }) as unknown as MappingRow | null
    : null;
  const run = await readUnique(db, 'affiliateSourceIntakeRuns', { where: { id: context.evidenceRunId } }) as unknown as RunRow | null;
  if (!intake || !source || !root || !run) bindingError('The repair producer source lineage is incomplete.');
  const admittedIdentity = identityForSource(source, null, intake);
  const admissionAudit = recordValue(recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  if (
    ['BLOCKED', 'EXCLUDED', 'POLICY_BLOCKED', 'REPLACED'].includes(upper(intake.status))
    || upper(intake.complianceStatus) !== 'ALLOWED'
    || root.origin !== (admittedIdentity?.origin ?? '')
    || root.pathKey !== (admittedIdentity?.pathKey ?? '')
    || !admittedIdentity
    || upper(source.targetKind) !== upper(root.targetKind)
    || mappingJob.mappingId !== null && !mapping
    || mapping && mapping.supplySourceId !== root.id
  ) {
    bindingError('The repair producer current policy, identity, or mapping ownership is invalid.');
  }
  if (
    ['BLOCKED', 'EXCLUDED', 'POLICY_BLOCKED', 'REPLACED'].includes(upper(source.status))
    || root.isExcluded === true
    || ['SOURCE_EXCLUDED', 'SUPERSEDED'].includes(upper(root.derivedStage))
    || text(root.successorId) !== null
  ) {
    bindingError('The repair producer source or Supply Source was excluded or replaced after admission.');
  }
  if (
    mappingJob.intakeId !== context.intakeId
    || mappingJob.sourceId !== source.id
    || mappingJob.supplySourceId !== root.id
    || mappingJob.mappingId !== null && !mapping
    || mapping && (mapping.sourceId !== source.id || mapping.supplySourceId !== root.id)
    || intake.id !== context.intakeId
    || intake.affiliateSourceId !== source.id
    || intake.supplySourceId !== root.id
    || source.supplySourceId !== root.id
    || root.identityKey !== context.sourceIdentityKey
    || root.liveSourceId !== source.id
    || root.intakeId !== intake.id
    || run.intakeId !== intake.id
    || !SUCCESSFUL_RUN_STATUSES.has(upper(run.status))
    || (run.supplySourceId != null && run.supplySourceId !== root.id)
    || !admittedIdentity
    || admittedIdentity.identityKey !== context.sourceIdentityKey
    || canonical(source.listUrl) !== admittedIdentity.canonicalUrl
    || canonical(root.canonicalUrl) !== admittedIdentity.canonicalUrl
    || root.origin !== admittedIdentity.origin
    || root.pathKey !== admittedIdentity.pathKey
    || upper(source.targetKind) !== upper(root.targetKind)
  ) {
    bindingError('The repair producer source lineage does not match the admitted identities.');
  }
  if (
    !sameValue(recordValue(source.metadata).existingDataRepair, context)
    || !sameValue(recordValue(root.metadata).existingDataRepair, context)
  ) {
    bindingError('The repair producer context is not the immutable server-owned context.');
  }
  if (completedNode) assertCompletedGatewayNode(completedNode, 'MAPPING_PRODUCER', root.id, mappingJob.id, context);
  const isChild = dedupeKey.startsWith('mapping-repair:');
  assertProducerKindBinding(context, source, root, subject, isChild, completedNode);
  const origin = await resolveExistingRepairOrigin(db, job, subject, manifest, completedNode, context, root.id, mappingJob.id);
  if ((context as unknown as JsonRecord).correction) {
    await assertCorrectionAdmissionAudit(db, origin.job, origin.manifest, origin.node, context, mappingJob, source, root);
  } else {
    await assertOriginalAdmissionAudit(db, origin.job, origin.manifest, origin.node, context, mappingJob, source, intake, run, root);
  }
  const pendingManifest = await pendingProducerManifestFor(db, source, context, root.id, mappingJob.id);
  assertPendingTransition(context, pendingManifest ?? origin.manifest, await loadBaseline(client, source.id), mappingJob, source, root, mapping);
  await artifactBinding(client, context, origin.manifest, source, intake, run, root, Object.keys(admissionAudit).length ? admissionAudit : null);
};

type CorrectionRelations = Readonly<{
  gatewayJobs: readonly GatewayJobRow[];
  gatewayClaims: readonly JsonRecord[];
  gatewayReceipts: readonly JsonRecord[];
  gatewayArtifacts: readonly JsonRecord[];
  gatewayEvents: readonly JsonRecord[];
}>;

type CorrectionPlan = Readonly<{
  row: AffiliateExistingDataRepairAdmissionRow;
  job: MappingJobRow;
  intake: IntakeRow;
  source: SourceRow;
  mapping: MappingRow | null;
  root: RootRow;
  identity: AffiliateSupplyIdentity;
  run: RunRow;
  page: PageRow;
  evidencePages: readonly PageRow[];
  artifacts: readonly ArtifactRow[];
  evidence: readonly ExistingDataRepairArtifact[];
  manifest: AffiliateAgentEvidenceManifest;
  baseline: AffiliateExistingDataRepairSourceState;
  sourceSportScope?: JsonRecord;
  policySnapshots: readonly DomainPolicyRow[];
  sportsCatalog: AffiliateSportsCatalogSnapshot;
  gatewayDedupeKey: string;
  prior: AffiliateExistingDataRepairCorrectionPriorState;
  priorPendingMapping: AffiliateExistingDataRepairPendingMapping | null;
  priorContext: JsonRecord;
  priorAdmissionAudit: JsonRecord | null;
  oldGatewayJobs: readonly GatewayJobRow[];
  supersededGatewayJobs: readonly GatewayJobRow[];
}>;

type CorrectionBuild = Readonly<{
  report: AffiliateExistingDataRepairCorrectionReport;
  plans: readonly CorrectionPlan[];
  relationsByMappingJobId: ReadonlyMap<string, CorrectionRelations>;
}>;

const correctionSnapshotRelationRows = async (
  client: Client,
  gatewayJobIds: readonly string[],
): Promise<CorrectionRelations> => {
  const db = client as unknown as AnyDelegate;
  const ids = sortedUnique(gatewayJobIds);
  const rowsForIds = async <T>(
    delegate: Delegate | undefined,
    values: readonly string[],
    parentField: string,
    scope: string,
    orderBy: JsonRecord | readonly JsonRecord[],
  ): Promise<T[]> => {
    const parentIds = sortedUnique(values);
    if (!parentIds.length) return [];
    const rows = await snapshotRows<T>(
      delegate,
      { where: { [parentField]: { in: parentIds } }, orderBy },
      SNAPSHOT_GLOBAL_LIMIT,
      scope,
    );
    const countsByParent = new Map<string, number>();
    for (const row of rows) {
      const parentId = text(recordValue(row)[parentField]);
      if (!parentId) continue;
      const count = (countsByParent.get(parentId) ?? 0) + 1;
      countsByParent.set(parentId, count);
      if (count > SNAPSHOT_PER_INTAKE_LIMIT) {
        throw new AffiliateExistingDataRepairAdmissionError(
          'SNAPSHOT_OVERFLOW',
          `The bounded admission snapshot is larger than the ${scope}:${parentId} limit.`,
          { scope: `${scope}:${parentId}`, limit: SNAPSHOT_PER_INTAKE_LIMIT },
        );
      }
    }
    return rows;
  };
  const gatewayJobs = ids.length
    ? await snapshotRows<GatewayJobRow>(
      db.affiliateAgentGatewayJobs,
      { where: { id: { in: ids } }, orderBy: { id: 'asc' } },
      SNAPSHOT_GLOBAL_LIMIT,
      'correction Gateway jobs',
    )
    : [];
  const gatewayClaims = await rowsForIds<JsonRecord>(
    db.affiliateAgentGatewayClaims,
    ids,
    'jobId',
    'correction Gateway claims',
    { id: 'asc' },
  );
  const claimIds = sortedUnique(gatewayClaims.map((claim) => text(claim.id)).filter((id): id is string => Boolean(id)));
  const gatewayReceipts = await rowsForIds<JsonRecord>(
    db.affiliateAgentGatewayOperationReceipts,
    ids,
    'jobId',
    'correction Gateway receipts',
    { id: 'asc' },
  );
  const gatewayArtifacts = await rowsForIds<JsonRecord>(
    db.affiliateAgentGatewayArtifacts,
    claimIds,
    'claimId',
    'correction Gateway artifacts',
    { id: 'asc' },
  );
  const gatewayEvents = await rowsForIds<JsonRecord>(
    db.affiliateAgentGatewayEvents,
    ids,
    'jobId',
    'correction Gateway events',
    [{ jobId: 'asc' }, { sequence: 'asc' }],
  );
  const relationCount = gatewayJobs.length
    + gatewayClaims.length
    + gatewayReceipts.length
    + gatewayArtifacts.length
    + gatewayEvents.length;
  if (relationCount > SNAPSHOT_GLOBAL_LIMIT) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'SNAPSHOT_OVERFLOW',
      'The bounded correction Gateway relation snapshot is larger than the global limit.',
      { scope: 'correction Gateway relations', limit: SNAPSHOT_GLOBAL_LIMIT },
    );
  }
  const byId = (left: JsonRecord, right: JsonRecord): number => (
    String(left.id ?? '').localeCompare(String(right.id ?? ''))
  );
  return {
    gatewayJobs: [...gatewayJobs].sort(compareId),
    gatewayClaims: [...gatewayClaims].sort(byId),
    gatewayReceipts: [...gatewayReceipts].sort(byId),
    gatewayArtifacts: [...gatewayArtifacts].sort(byId),
    gatewayEvents: [...gatewayEvents].sort((left, right) => (
      String(left.jobId ?? '').localeCompare(String(right.jobId ?? ''))
      || Number(left.sequence ?? 0) - Number(right.sequence ?? 0)
      || byId(left, right)
    )),
  };
};
const gatewayNodeFromRelations = (
  relations: CorrectionRelations,
  claimId: string,
): CompletedGatewayNode | null => {
  const claim = relations.gatewayClaims.find((candidate) => text(candidate.id) === claimId);
  if (!claim) return null;
  const jobId = text(claim.jobId);
  const receiptId = text(claim.terminalReceiptId);
  if (!jobId || !receiptId) return null;
  const job = relations.gatewayJobs.find((candidate) => candidate.id === jobId);
  const receipt = relations.gatewayReceipts.find((candidate) => text(candidate.id) === receiptId);
  if (!job || !receipt) return null;
  return decodeGatewayNode(
    job,
    claim as unknown as GatewayClaimRow,
    receipt as unknown as GatewayReceiptRow,
  );
};

const pendingProducerManifestFromRelations = async (
  relations: CorrectionRelations,
  pending: AffiliateExistingDataRepairPendingMapping,
  context: AffiliateAgentExistingDataRepairContext,
  baseline: AffiliateExistingDataRepairSourceState,
  mappingJob: MappingJobRow,
  source: SourceRow,
  root: RootRow,
  mapping: MappingRow | null,
): Promise<AffiliateAgentEvidenceManifest | null> => {
  try {
    const producerClaimId = text(pending.producerClaimId);
    const producerJobId = text(pending.producerJobId);
    if (!producerClaimId || !producerJobId) return null;
    const producer = gatewayNodeFromRelations(relations, producerClaimId);
    if (!producer) return null;
    assertCompletedGatewayNode(producer, 'MAPPING_PRODUCER', root.id, mappingJob.id, context);
    if (
      producer.claim.id !== producerClaimId
      || producer.job.id !== producerJobId
      || normalizeHash(recordValue(producer.result.payload).packageHash) !== normalizeHash(pending.packageHash)
      || !sameValue(producer.subject.repairContext, context)
      || producer.subject.mappingJobId !== mappingJob.id
      || producer.subject.supplySourceId !== root.id
    ) return null;

    const reviewerClaimId = text(pending.reviewerClaimId);
    const reviewerJobId = text(pending.reviewerJobId);
    if ((reviewerClaimId === null) !== (reviewerJobId === null)) return null;
    if (reviewerClaimId) {
      const reviewer = gatewayNodeFromRelations(relations, reviewerClaimId);
      if (!reviewer) return null;
      assertCompletedGatewayNode(reviewer, 'SUPPLY_REVIEWER', root.id, mappingJob.id, context);
      if (
        reviewer.job.id !== reviewerJobId
        || text(producer.job.parentClaimId) !== reviewer.claim.id
        || reviewer.subject.producerClaimId === producer.claim.id
        || upper(reviewer.result.disposition) !== 'PRODUCER_REPAIR_REQUIRED'
      ) return null;
      const reviewedProducerId = text(reviewer.subject.producerClaimId);
      if (!reviewedProducerId) return null;
      const reviewedProducer = gatewayNodeFromRelations(relations, reviewedProducerId);
      if (!reviewedProducer) return null;
      assertCompletedGatewayNode(reviewedProducer, 'MAPPING_PRODUCER', root.id, mappingJob.id, context);
      if (
        Number(reviewedProducer.subject.pass) + 1 !== Number(producer.subject.pass)
        || !sameValue(reviewedProducer.subject.repairContext, context)
      ) return null;
      const reviewedProducerArtifacts = relations.gatewayArtifacts
        .filter((artifact) => text(artifact.claimId) === reviewedProducer.claim.id)
        .map((artifact) => artifact as unknown as GatewayArtifactRow);
      await assertReviewerManifestAuthorized(null, reviewer, reviewedProducer, reviewedProducerArtifacts);
    } else if (text(producer.job.parentClaimId) !== null) {
      return null;
    }
    assertPendingTransition(context, producer.manifest, baseline, mappingJob, source, root, mapping);
    return producer.manifest;
  } catch {
    return null;
  }
};

const correctionImmutableGatewayJob = (job: GatewayJobRow): JsonRecord => ({
  id: job.id,
  dedupeKey: job.dedupeKey,
  role: job.role,
  subjectType: job.subjectType,
  subjectId: job.subjectId,
  supplySourceId: job.supplySourceId,
  expectedLifecycleGeneration: job.expectedLifecycleGeneration,
  status: job.status,
  activeClaimId: job.activeClaimId,
  parentClaimId: job.parentClaimId ?? null,
  claimGeneration: job.claimGeneration ?? null,
  terminalDisposition: job.terminalDisposition ?? null,
  terminalReceiptId: job.terminalReceiptId ?? null,
  eventSequence: job.eventSequence ?? null,
  subjectJsonHash: hash(job.subjectJson),
  evidenceManifestHash: hash(job.evidenceManifestJson),
  resultHash: job.resultHash ?? null,
  resultJsonHash: hash(job.resultJson ?? null),
  stateHash: hash(job),
});

const correctionImmutableClaim = (claim: JsonRecord): JsonRecord => ({
  id: claim.id ?? null,
  jobId: claim.jobId ?? null,
  parentClaimId: claim.parentClaimId ?? null,
  claimGeneration: claim.claimGeneration ?? null,
  status: claim.status ?? null,
  terminalReceiptId: claim.terminalReceiptId ?? null,
  claimEnvelopeHash: claim.claimEnvelopeHash ?? null,
  evidenceManifestHash: claim.evidenceManifestHash ?? null,
  deploymentContractVersion: claim.deploymentContractVersion ?? null,
  deploymentContractHash: claim.deploymentContractHash ?? null,
  roleContractVersion: claim.roleContractVersion ?? null,
  roleContractHash: claim.roleContractHash ?? null,
  promptTemplateVersion: claim.promptTemplateVersion ?? null,
  promptTemplateHash: claim.promptTemplateHash ?? null,
  supplyContractVersion: claim.supplyContractVersion ?? null,
  supplyContractHash: claim.supplyContractHash ?? null,
  stateHash: hash(claim),
});

const correctionImmutableReceipt = (receipt: JsonRecord): JsonRecord => ({
  id: receipt.id ?? null,
  claimId: receipt.claimId ?? null,
  jobId: receipt.jobId ?? null,
  claimGeneration: receipt.claimGeneration ?? null,
  operationKind: receipt.operationKind ?? null,
  commandName: receipt.commandName ?? null,
  status: receipt.status ?? null,
  requestHash: receipt.requestHash ?? null,
  responseHash: receipt.responseHash ?? null,
  safeErrorCode: receipt.safeErrorCode ?? null,
  externalOperationKey: receipt.externalOperationKey ?? null,
  stateHash: hash(receipt),
});

const correctionImmutableArtifact = (artifact: JsonRecord): JsonRecord => ({
  id: artifact.id ?? null,
  claimId: artifact.claimId ?? null,
  claimGeneration: artifact.claimGeneration ?? null,
  evidenceRef: artifact.evidenceRef ?? null,
  evidenceKind: artifact.evidenceKind ?? null,
  sourceArtifactId: artifact.sourceArtifactId ?? null,
  fileId: artifact.fileId ?? null,
  contentHash: artifact.contentHash ?? null,
  mimeType: artifact.mimeType ?? null,
  byteSize: artifact.byteSize ?? null,
  creatingClaimId: artifact.creatingClaimId ?? null,
  stateHash: hash(artifact),
});

const correctionImmutableEvent = (event: JsonRecord): JsonRecord => ({
  id: event.id ?? null,
  eventKey: event.eventKey ?? null,
  jobId: event.jobId ?? null,
  claimId: event.claimId ?? null,
  receiptId: event.receiptId ?? null,
  sequence: event.sequence ?? null,
  eventType: event.eventType ?? null,
  actorKind: event.actorKind ?? null,
  actorId: event.actorId ?? null,
  role: event.role ?? null,
  requestHash: event.requestHash ?? null,
  inputHash: event.inputHash ?? null,
  outputHash: event.outputHash ?? null,
  reasonCodes: event.reasonCodes ?? [],
  payloadHash: hash(event.payload ?? null),
  stateHash: hash(event),
});

const correctionImmutableMappingJob = (job: MappingJobRow): JsonRecord => ({
  id: job.id,
  intakeId: job.intakeId,
  sourceId: job.sourceId,
  mappingId: job.mappingId,
  supplySourceId: job.supplySourceId,
  status: job.status,
  claimedAt: job.claimedAt ?? null,
  leaseExpiresAt: job.leaseExpiresAt ?? null,
  workerId: job.workerId ?? null,
  legacyIdentityMigrationEligible: job.legacyIdentityMigrationEligible ?? null,
  resultSummaryHash: hash(job.resultSummary),
  errorMessage: job.errorMessage ?? null,
  stateHash: hash(job),
});

const correctionImmutableMapping = (mapping: MappingRow | null): JsonRecord | null => mapping ? {
  id: mapping.id,
  sourceId: mapping.sourceId,
  supplySourceId: mapping.supplySourceId,
  version: mapping.version,
  isActive: mapping.isActive,
  createdByUserId: mapping.createdByUserId ?? null,
  notes: mapping.notes ?? null,
  validatedAt: mapping.validatedAt ?? null,
  mappingSha256: hash(mapping.mapping),
  stateHash: hash(mapping),
} : null;

type CorrectionPriorContextResult = Readonly<{
  context: JsonRecord | null;
  reasonCodes: readonly string[];
}>;

const correctionPriorContextFor = (
  job: MappingJobRow,
  source: SourceRow,
  root: RootRow,
  gatewayJobs: readonly GatewayJobRow[],
): CorrectionPriorContextResult => {
  const sourceMetadata = recordValue(source.metadata);
  const rootMetadata = recordValue(root.metadata);
  const candidates: Array<{ value: unknown; required: boolean }> = [
    { value: sourceMetadata.existingDataRepair, required: true },
    { value: rootMetadata.existingDataRepair, required: true },
    ...admissionHistory(job.resultSummary)
      .flatMap((entry) => {
        if (hasOwn(entry, 'repairContext') && hasOwn(entry, 'context')) {
          return [
            { value: entry.repairContext, required: true },
            { value: entry.context, required: true },
          ];
        }
        return [{
          value: hasOwn(entry, 'repairContext') ? entry.repairContext : entry.context,
          required: true,
        }];
      }),
    ...gatewayJobs.map((gatewayJob) => {
      const subject = recordValue(gatewayJob.subjectJson);
      return {
        value: hasOwn(subject, 'repairContext') ? subject.repairContext : undefined,
        required: ['MAPPING_PRODUCER', 'SUPPLY_REVIEWER'].includes(upper(gatewayJob.role)),
      };
    }).filter((candidate) => candidate.required),
  ];
  const parsed: JsonRecord[] = [];
  let invalid = false;
  for (const candidate of candidates) {
    if (candidate.value === undefined || candidate.value === null) {
      invalid = true;
      continue;
    }
    const result = affiliateAgentExistingDataRepairContextSchema.safeParse(candidate.value);
    if (!result.success) {
      invalid = true;
      continue;
    }
    parsed.push(result.data as unknown as JsonRecord);
  }
  const reasonCodes: string[] = [];
  if (invalid) reasonCodes.push('PRIOR_REPAIR_CONTEXT_INVALID');
  if (!parsed.length) {
    reasonCodes.push('PRIOR_REPAIR_CONTEXT_MISSING_OR_CONFLICT');
    return { context: null, reasonCodes: sortedUnique(reasonCodes) };
  }
  const first = parsed[0]!;
  if (parsed.some((candidate) => !sameValue(candidate, first))) {
    reasonCodes.push('PRIOR_REPAIR_CONTEXT_CONFLICT');
  }
  return {
    context: first,
    reasonCodes: sortedUnique(reasonCodes),
  };
};

const correctionAdmissionAuditFor = (
  job: MappingJobRow,
  source: SourceRow,
  context: JsonRecord,
): JsonRecord | null => {
  const sourceAudit = recordValue(recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  const contextAdmissionHash = normalizeHash(context.admissionHash);
  const sourceAuditContext = hasOwn(sourceAudit, 'context')
    ? sourceAudit.context
    : sourceAudit.repairContext;
  if (
    !Object.keys(sourceAudit).length
    || sourceAudit.operation === 'CORRECTION'
    || !contextAdmissionHash
    || normalizeHash(sourceAudit.reportHash) !== contextAdmissionHash
    || text(sourceAudit.mappingJobId) !== job.id
    || sourceAuditContext === undefined
    || !Array.isArray(sourceAudit.evidenceSnapshots)
    || !Array.isArray(sourceAudit.pageSnapshots)
    || !Array.isArray(sourceAudit.policySnapshots)
    || !sourceAudit.deploymentContract
    || !sameValue(sourceAuditContext, context)
  ) {
    return null;
  }
  const sourceGatewayJobId = text(sourceAudit.gatewayJobId);
  const matchingHistory = admissionHistory(job.resultSummary).filter((entry) => (
    normalizeHash(entry.reportHash) === contextAdmissionHash
    && text(entry.mappingJobId) === job.id
    && text(entry.intakeId) === text(sourceAudit.intakeId)
    && text(entry.evidenceRunId) === text(sourceAudit.evidenceRunId)
    && text(entry.sourceId) === text(sourceAudit.sourceId)
    && text(entry.supplySourceId) === text(sourceAudit.supplySourceId)
    && text(entry.operatorId) === text(sourceAudit.operatorId)
    && text(entry.reason) === text(sourceAudit.reason)
    && (!sourceGatewayJobId || text(entry.gatewayJobId) === sourceGatewayJobId)
    && entry.repairContext !== undefined
    && Array.isArray(entry.evidenceSnapshots)
    && Array.isArray(entry.pageSnapshots)
    && Array.isArray(entry.policySnapshots)
    && entry.deploymentContract !== undefined
    && sameValue(entry.repairContext, context)
    && sameValue(entry.evidenceSnapshots, sourceAudit.evidenceSnapshots)
    && sameValue(entry.pageSnapshots, sourceAudit.pageSnapshots)
    && sameValue(entry.policySnapshots, sourceAudit.policySnapshots)
    && sameValue(entry.deploymentContract, sourceAudit.deploymentContract)
  ));
  return matchingHistory.length === 1 ? matchingHistory[0]! : null;
};
const admissionReportHashFromSnapshot = (report: JsonRecord): string | null => {
  const rows = Array.isArray(report.rows)
    ? report.rows.map(recordValue) as unknown as AffiliateExistingDataRepairAdmissionRow[]
    : null;
  const writes = Array.isArray(report.proposedWrites)
    ? report.proposedWrites.map(recordValue) as unknown as AffiliateExistingDataRepairAdmissionWrite[]
    : null;
  const selectedJobIds = stringArray(report.selectedJobIds);
  const requestedJobIds = report.requestedJobIds === null
    ? null
    : stringArray(report.requestedJobIds);
  const requestedSourceIds = report.requestedSourceIds === null
    ? null
    : stringArray(report.requestedSourceIds);
  if (
    !rows?.length
    || !writes?.length
    || !selectedJobIds
    || (requestedJobIds === null && report.requestedJobIds !== null)
    || (requestedSourceIds === null && report.requestedSourceIds !== null)
    || !report.counts
  ) return null;
  try {
    return reportHashFor({
      contractVersion: Number(report.contractVersion),
      contractHash: String(report.contractHash ?? ''),
      reason: String(report.reason ?? ''),
      operatorId: String(report.operatorId ?? ''),
      requestedJobIds,
      requestedSourceIds,
      evidenceSelections: Array.isArray(report.evidenceSelections)
        ? report.evidenceSelections as ExistingDataRepairEvidenceSelection[]
        : null,
      selectionLimit: Number(report.selectionLimit),
      counts: recordValue(report.counts) as unknown as AffiliateExistingDataRepairAdmissionCounts,
      selectedJobIds,
      rows,
      proposedWrites: writes,
    });
  } catch {
    return null;
  }
};

const correctionPendingStateFor = (
  job: MappingJobRow,
  source: SourceRow,
  root: RootRow,
): {
  pending: AffiliateExistingDataRepairPendingMapping | null;
  pendingHash: string;
  reasonCodes: string[];
} => {
  const sourceMetadata = recordValue(source.metadata);
  const rootMetadata = recordValue(root.metadata);
  const sourcePresent = hasOwn(sourceMetadata, AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY);
  const rootPresent = hasOwn(rootMetadata, AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY);
  const sourcePending = pendingMappingForMetadata(sourceMetadata);
  const rootPending = pendingMappingForMetadata(rootMetadata);
  const reasons: string[] = [];
  if ((sourcePresent && !sourcePending) || (rootPresent && !rootPending)) {
    reasons.push('MALFORMED_PENDING_REPAIR');
    return { pending: null, pendingHash: hash(null), reasonCodes: reasons };
  }
  if (sourcePresent !== rootPresent) {
    reasons.push('PENDING_POINTER_ONE_SIDED');
    return { pending: null, pendingHash: hash(null), reasonCodes: reasons };
  }
  if (!sourcePending && !rootPending) return { pending: null, pendingHash: hash(null), reasonCodes: reasons };
  if (!sourcePending || !rootPending) {
    reasons.push('PENDING_POINTER_MISSING');
    return { pending: null, pendingHash: hash(null), reasonCodes: reasons };
  }
  if (pendingMappingHash(sourcePending) !== pendingMappingHash(rootPending)) {
    reasons.push('PENDING_POINTER_CONFLICT');
    return { pending: null, pendingHash: hash(sourcePending), reasonCodes: reasons };
  }
  const pending = sourcePending;
  if (
    pending.mappingJobId !== job.id
    || pending.sourceId !== source.id
    || pending.supplySourceId !== root.id
    || pending.mappingId !== job.mappingId
    || !['STAGED', 'APPROVED'].includes(upper(pending.state))
  ) {
    reasons.push('PENDING_POINTER_IDENTITY_CONFLICT');
  }
  return {
    pending,
    pendingHash: pendingMappingHash(pending),
    reasonCodes: reasons,
  };
};

const correctionGatewayJobsFor = async (
  client: Client,
  snapshot: Snapshot,
  job: MappingJobRow,
  root: RootRow,
  pending: AffiliateExistingDataRepairPendingMapping | null,
): Promise<GatewayJobRow[]> => {
  const db = client as unknown as AnyDelegate;
  const pointerIds = pending
    ? [pending.producerJobId, pending.reviewerJobId].filter((id): id is string => Boolean(id))
    : [];
  const existing = snapshot.gatewayJobs.filter((candidate) => (
    pointerIds.includes(candidate.id)
    || (
      candidate.subjectId === job.id
      && candidate.supplySourceId === root.id
    )
    || (
      upper(candidate.role) === 'SUPPLY_REVIEWER'
      && candidate.subjectId === root.id
    )
  ));
  const queried = await snapshotRows<GatewayJobRow>(
    db.affiliateAgentGatewayJobs,
    {
      where: {
        OR: [
          { supplySourceId: root.id, subjectId: job.id },
          { subjectId: root.id, role: 'SUPPLY_REVIEWER' },
          ...(pointerIds.length ? [{ id: { in: pointerIds } }] : []),
        ],
      },
      orderBy: { id: 'asc' },
    },
    SNAPSHOT_GLOBAL_LIMIT,
    'correction Gateway job candidates',
  );
  return uniqueRows<GatewayJobRow>([...existing, ...queried]);
};

const correctionManifestFor = (
  audit: JsonRecord | null,
  gatewayJobs: readonly GatewayJobRow[],
): AffiliateAgentEvidenceManifest | null => {
  const candidates: unknown[] = [
    audit?.manifest,
    ...gatewayJobs
      .filter((job) => upper(job.role) === 'MAPPING_PRODUCER')
      .map((job) => job.evidenceManifestJson),
  ];
  for (const candidate of candidates) {
    const parsed = affiliateAgentEvidenceManifestSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
};

const correctionEvidenceFor = (
  audit: JsonRecord | null,
  manifest: AffiliateAgentEvidenceManifest | null,
  snapshot: Snapshot,
  reasons: string[],
): { evidence: ExistingDataRepairArtifact[]; artifacts: ArtifactRow[]; pages: PageRow[] } => {
  if (!manifest) {
    reasons.push('CORRECTION_MANIFEST_MISSING');
    return { evidence: [], artifacts: [], pages: [] };
  }
  const auditEvidence = Array.isArray(audit?.evidenceSnapshots)
    ? audit.evidenceSnapshots.map((entry) => recordValue(entry))
    : [];
  const evidence: ExistingDataRepairArtifact[] = [];
  const artifacts: ArtifactRow[] = [];
  const pages: PageRow[] = [];
  for (const entry of manifest.entries) {
    if (entry.kind !== 'PAGE_HTML' && entry.kind !== 'PAGE_MARKDOWN') continue;
    const sourceArtifactId = entry.artifactId.startsWith('intake-artifact:')
      ? entry.artifactId.slice('intake-artifact:'.length)
      : entry.artifactId;
    const artifact = snapshot.artifacts.find((candidate) => candidate.id === sourceArtifactId);
    const file = artifact ? snapshot.files.find((candidate) => candidate.id === artifact.fileId) : null;
    if (!artifact || !file) {
      reasons.push(`CORRECTION_EVIDENCE_MISSING_${sourceArtifactId}`);
      continue;
    }
    const byteSize = artifact.sizeBytes ?? file.sizeBytes;
    if (
      artifact.contentHash.toLowerCase() !== entry.sha256.toLowerCase()
      || (artifact.mimeType ?? file.mimeType ?? '') !== entry.mimeType
      || byteSize !== entry.byteSize
    ) {
      reasons.push(`CORRECTION_EVIDENCE_DRIFT_${sourceArtifactId}`);
      continue;
    }
    artifacts.push(artifact);
    const prior = auditEvidence.find((candidate) => (
      text(candidate.intakeArtifactId) === artifact.id
      || text(candidate.sourceArtifactId) === artifact.id
    ));
    evidence.push({
      kind: entry.kind,
      artifactId: entry.artifactId,
      sourceArtifactId: file.id,
      storageKey: text(prior?.storageKey) ?? file.path,
      sha256: entry.sha256,
      mimeType: entry.mimeType,
      byteSize: entry.byteSize,
      sourceUrl: artifact.sourceUrl,
      finalUrl: artifact.finalUrl,
      intakeArtifactId: artifact.id,
      runId: artifact.runId,
      pageId: artifact.pageId ?? '',
    });
    const page = artifact.pageId
      ? snapshot.pages.find((candidate) => candidate.id === artifact.pageId) ?? null
      : null;
    if (page) pages.push(page);
  }
  if (!evidence.length) reasons.push('CORRECTION_EVIDENCE_MISSING');
  return {
    evidence,
    artifacts: uniqueRows<ArtifactRow>(artifacts),
    pages: uniqueRows<PageRow>(pages),
  };
};
const validQueuedCorrectionPredecessor = async (
  client: Client,
  candidate: GatewayJobRow,
  job: MappingJobRow,
  root: RootRow,
  context: JsonRecord,
  priorAudit: JsonRecord,
): Promise<boolean> => {
  if (
    upper(candidate.role) !== 'MAPPING_PRODUCER'
    || upper(candidate.queue) !== 'AFFILIATE_MAPPING'
    || upper(candidate.lane) !== 'MAPPING_PRODUCTION'
    || candidate.subjectId !== job.id
    || candidate.supplySourceId !== root.id
    || !['QUEUED', 'RETRY_WAIT'].includes(upper(candidate.status))
  ) return false;
  const subjectResult = affiliateAgentSubjectSchema.safeParse(candidate.subjectJson);
  const manifestResult = affiliateAgentEvidenceManifestSchema.safeParse(candidate.evidenceManifestJson);
  const contextResult = affiliateAgentExistingDataRepairContextSchema.safeParse(context);
  if (!subjectResult.success || !manifestResult.success || !contextResult.success) return false;
  const subject = recordValue(subjectResult.data);
  if (
    subject.type !== 'MAPPING_PRODUCER'
    || subject.mappingJobId !== job.id
    || subject.supplySourceId !== root.id
    || !sameValue(subject.repairContext, context)
  ) return false;
  const dedupeKey = text(candidate.dedupeKey) ?? '';
  if (dedupeKey.startsWith(AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX)
    && !dedupeKey.startsWith('mapping-repair:')) {
    return text(candidate.parentClaimId) === null
      && Number(subject.pass) === 1
      && text(priorAudit.gatewayJobId) === candidate.id;
  }
  if (!dedupeKey.startsWith('mapping-repair:')) return false;
  try {
    const origin = await resolveExistingRepairOrigin(
      client as unknown as AnyDelegate,
      candidate,
      subject,
      manifestResult.data,
      null,
      contextResult.data,
      root.id,
      job.id,
    );
    return origin.job.id === text(priorAudit.gatewayJobId);
  } catch {
    return false;
  }
};

const correctionPriorStateFor = (
  job: MappingJobRow,
  source: SourceRow,
  root: RootRow,
  mapping: MappingRow | null,
  pending: AffiliateExistingDataRepairPendingMapping | null,
  pendingHash: string,
  context: JsonRecord,
  audit: JsonRecord | null,
  gatewayJobs: readonly GatewayJobRow[],
  relations: CorrectionRelations,
): AffiliateExistingDataRepairCorrectionPriorState => {
  const priorGatewayJobId = text(audit?.gatewayJobId)
    ?? pending?.producerJobId
    ?? gatewayJobs.find((candidate) => upper(candidate.role) === 'MAPPING_PRODUCER')?.id
    ?? null;
  const admissionEvent = relations.gatewayEvents.find((event) => (
    upper(event.eventType) === 'JOB_CREATED'
    && (!priorGatewayJobId || text(event.jobId) === priorGatewayJobId)
    && (!context.admissionHash || normalizeHash(event.requestHash) === normalizeHash(context.admissionHash))
  )) ?? null;
  return {
    mappingJobId: job.id,
    sourceId: source.id,
    supplySourceId: root.id,
    mappingId: mapping?.id ?? null,
    pendingMapping: pending,
    pendingMappingHash: pendingHash,
    context,
    admissionAuditReference: {
      mappingJobId: text(audit?.mappingJobId) ?? job.id,
      reportHash: normalizeHash(audit?.reportHash) ?? normalizeHash(context.admissionHash),
      gatewayJobId: priorGatewayJobId,
      auditHash: hash(audit ?? {
        reportHash: normalizeHash(context.admissionHash),
        mappingJobId: job.id,
        gatewayJobId: priorGatewayJobId,
      }),
    },
    mappingState: correctionImmutableMapping(mapping),
    mappingBytes: mapping?.mapping ?? null,
    mappingSha256: mapping ? hash(mapping.mapping) : null,
    mappingJobState: correctionImmutableMappingJob(job),
    gatewayJobs: gatewayJobs.map(correctionImmutableGatewayJob),
    gatewayClaims: relations.gatewayClaims.map(correctionImmutableClaim),
    gatewayReceipts: relations.gatewayReceipts.map(correctionImmutableReceipt),
    gatewayArtifacts: relations.gatewayArtifacts.map(correctionImmutableArtifact),
    gatewayEvents: relations.gatewayEvents.map(correctionImmutableEvent),
    admissionEventId: text(admissionEvent?.id),
  };
};

const correctionGatewayStateReasons = (
  gatewayJobs: readonly GatewayJobRow[],
  relations: CorrectionRelations,
): string[] => {
  const activeClaimIds = new Set(
    relations.gatewayClaims
      .filter((claim) => upper(claim.status) === 'ACTIVE')
      .map((claim) => text(claim.id))
      .filter((id): id is string => Boolean(id)),
  );
  const reasons: string[] = [];
  for (const job of gatewayJobs) {
    if (job.activeClaimId || activeClaimIds.has(job.id)) reasons.push('ACTIVE_GATEWAY_CLAIM');
    if (['CLAIMED', 'RECONCILIATION_REQUIRED'].includes(upper(job.status))) {
      reasons.push('ACTIVE_GATEWAY_JOB');
    }
  }
  if (relations.gatewayClaims.some((claim) => ['ACTIVE', 'RECONCILIATION_REQUIRED'].includes(upper(claim.status)))) {
    reasons.push('ACTIVE_OR_UNRESOLVED_GATEWAY_CLAIM');
  }
  if (relations.gatewayReceipts.some((receipt) => ['PENDING', 'UNKNOWN'].includes(upper(receipt.status)))) {
    reasons.push('UNRESOLVED_GATEWAY_EFFECT');
  }
  return sortedUnique(reasons);
};

const correctionHoldReasonsFor = (
  source: SourceRow,
  root: RootRow,
): string[] => {
  const sourceMetadata = recordValue(source.metadata);
  const rootMetadata = recordValue(root.metadata);
  const sourcePresent = hasOwn(sourceMetadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY);
  const rootPresent = hasOwn(rootMetadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY);
  const sourceHold = readAffiliateExistingDataRepairCorrectionHold(
    sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY],
  );
  const rootHold = readAffiliateExistingDataRepairCorrectionHold(
    rootMetadata[AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY],
  );
  const reasons: string[] = [];
  if ((sourcePresent && !sourceHold) || (rootPresent && !rootHold)) {
    reasons.push('MALFORMED_CORRECTION_HOLD');
  } else if (sourcePresent || rootPresent) {
    reasons.push('CORRECTION_HOLD_PRESENT');
    if (sourceHold && rootHold && !sameValue(sourceHold, rootHold)) {
      reasons.push('CORRECTION_HOLD_CONFLICT');
    }
  }
  if (sourcePresent !== rootPresent) reasons.push('CORRECTION_HOLD_ONE_SIDED');
  return sortedUnique(reasons);
};

const correctionSourceFor = (
  snapshot: Snapshot,
  job: MappingJobRow,
  intake: IntakeRow,
  mapping: MappingRow | null,
): SourceRow | null => {
  const ids = sortedUnique([
    job.sourceId,
    intake.affiliateSourceId,
    mapping?.sourceId ?? null,
  ].filter((id): id is string => Boolean(id)));
  const candidates = snapshot.sources.filter((source) => ids.includes(source.id));
  return candidates.length === 1 ? candidates[0]! : null;
};

const correctionRootFor = (
  snapshot: Snapshot,
  job: MappingJobRow,
  intake: IntakeRow,
  source: SourceRow,
  mapping: MappingRow | null,
  identity: AffiliateSupplyIdentity,
  expectedCohort: string,
  evidenceRootIds: readonly string[],
): { root: RootRow | null; reasons: string[] } => rootFor(
  snapshot,
  identity,
  source,
  intake,
  job,
  mapping,
  expectedCohort,
  evidenceRootIds,
);

const correctionSelectedJobsFor = (
  snapshot: Snapshot,
  validated: ValidatedAdmissionInput,
): MappingJobRow[] => {
  const requestedJobs = new Set(validated.jobIds ?? []);
  const requestedSources = new Set(validated.sourceIds ?? []);
  return snapshot.jobs.filter((job) => (
    requestedJobs.has(job.id)
    || Boolean(
      job.sourceId && requestedSources.has(job.sourceId)
      || job.mappingId && snapshot.mappings.some((mapping) => (
        mapping.id === job.mappingId && requestedSources.has(mapping.sourceId)
      ))
      || snapshot.intakes.some((intake) => (
        intake.id === job.intakeId && intake.affiliateSourceId !== null
          && requestedSources.has(intake.affiliateSourceId)
      )),
    )
  )).sort(compareId);
};

const correctionWriteFor = (
  plan: Pick<CorrectionPlan, 'job' | 'intake' | 'source' | 'root' | 'mapping' | 'baseline' | 'evidence' | 'run' | 'gatewayDedupeKey'>,
): AffiliateExistingDataRepairAdmissionWrite => ({
  mappingJobId: plan.job.id,
  intakeId: plan.intake.id,
  sourceAction: 'REUSE_SOURCE',
  rootAction: 'REUSE_ROOT',
  sourceId: plan.source.id,
  rootIdentityKey: plan.root.identityKey,
  supplySourceId: plan.root.id,
  evidenceRunId: plan.run.id,
  artifactIds: plan.evidence.map((entry) => entry.artifactId).sort(),
  gatewayDedupeKey: plan.gatewayDedupeKey,
  writes: [
    'AFFILIATE_EXISTING_REPAIR_PENDING_POINTER_RETIREMENT',
    'AFFILIATE_EXISTING_REPAIR_CORRECTION_HOLD',
    'AFFILIATE_EXISTING_REPAIR_CONTEXT',
    'AFFILIATE_EXISTING_REPAIR_AUDIT',
    'AFFILIATE_EXISTING_REPAIR_EVIDENCE_PIN',
    'AFFILIATE_EXISTING_REPAIR_GATEWAY_JOB',
    'AFFILIATE_EXISTING_REPAIR_MAPPING_JOB',
    'AFFILIATE_EXISTING_REPAIR_OLD_GATEWAY_JOB_SUPERSESSION',
  ],
});

const correctionRowFor = (input: Readonly<{
  job: MappingJobRow;
  intake: IntakeRow | null;
  source: SourceRow | null;
  mapping: MappingRow | null;
  root: RootRow | null;
  identity: AffiliateSupplyIdentity | null;
  run: RunRow | null;
  page: PageRow | null;
  evidencePages: readonly PageRow[];
  evidence: readonly ExistingDataRepairArtifact[];
  manifest: AffiliateAgentEvidenceManifest | null;
  baseline: AffiliateExistingDataRepairSourceState | null;
  sportsCatalog: AffiliateSportsCatalogSnapshot;
  stateFingerprint: string;
  gatewayDedupeKey: string | null;
  reasons: readonly string[];
  sourceKindAssessment?: AffiliateAgentSourceKindAssessment;
}>): AffiliateExistingDataRepairAdmissionRow => {
  const reasonCodes = sortedUnique([...input.reasons]);
  const eligible = reasonCodes.length === 0
    && Boolean(input.intake && input.source && input.root && input.identity && input.run && input.page && input.manifest && input.baseline && input.gatewayDedupeKey);
  return {
    jobId: input.job.id,
    mappingJobId: input.job.id,
    intakeId: input.intake?.id ?? null,
    status: input.job.status,
    sourceKey: input.intake?.sourceKey ?? null,
    sourceId: input.source?.id ?? input.job.sourceId,
    mappingId: input.mapping?.id ?? input.job.mappingId,
    supplySourceId: input.root?.id ?? input.job.supplySourceId,
    rootId: input.root?.id ?? null,
    rootIdentityKey: input.identity?.identityKey ?? null,
    sourceIdentityKey: input.identity?.identityKey ?? null,
    evidenceRunId: input.run?.id ?? null,
    evidencePageId: input.page?.id ?? null,
    evidencePageIds: input.evidencePages.map((page) => page.id).sort(),
    sportsCatalogSha256: input.sportsCatalog.sha256,
    sourceStateSha256: input.baseline?.sourceStateSha256 ?? null,
    workingMappingId: input.baseline?.workingMappingId ?? null,
    ...(input.sourceKindAssessment ? { sourceKindAssessment: input.sourceKindAssessment } : {}),
    isPublicReplacement: input.baseline?.isPublicReplacement ?? false,
    artifacts: input.evidence,
    gatewayJobId: null,
    gatewayDedupeKey: input.gatewayDedupeKey,
    stateFingerprint: input.stateFingerprint,
    eligible,
    alreadyAdmitted: false,
    reason: eligible ? 'ELIGIBLE' : (reasonCodes[0] ?? 'CORRECTION_NOT_ELIGIBLE'),
    reasonCodes,
    outcome: eligible ? 'PROPOSED' : 'HELD',
  };
};

const correctionReportHashFor = (input: Readonly<{
  contractVersion: number;
  contractHash: string;
  reason: string;
  operatorId: string;
  requestedJobIds: readonly string[] | null;
  requestedSourceIds: readonly string[] | null;
  evidenceSelections: readonly ExistingDataRepairEvidenceSelection[] | null;
  selectionLimit: number;
  counts: AffiliateExistingDataRepairAdmissionCounts;
  selectedJobIds: readonly string[];
  rows: readonly AffiliateExistingDataRepairAdmissionRow[];
  proposedWrites: readonly AffiliateExistingDataRepairAdmissionWrite[];
  supersededMappingIds: readonly string[];
  supersededGatewayJobIds: readonly string[];
  priorStates: readonly AffiliateExistingDataRepairCorrectionPriorState[];
}>): string => hash({
  operation: 'CORRECTION',
  admissionReportHash: reportHashFor(input),
  supersededMappingIds: [...input.supersededMappingIds].sort(),
  supersededGatewayJobIds: [...input.supersededGatewayJobIds].sort(),
  priorStates: [...input.priorStates].sort((left, right) => left.mappingJobId.localeCompare(right.mappingJobId)),
});

const correctionMissingRowFor = (
  jobId: string,
  sportsCatalog: AffiliateSportsCatalogSnapshot,
): AffiliateExistingDataRepairAdmissionRow => ({
  jobId,
  mappingJobId: jobId,
  intakeId: null,
  status: 'MISSING',
  sourceKey: null,
  sourceId: null,
  mappingId: null,
  supplySourceId: null,
  rootId: null,
  rootIdentityKey: null,
  sourceIdentityKey: null,
  evidenceRunId: null,
  evidencePageId: null,
  evidencePageIds: [],
  sportsCatalogSha256: sportsCatalog.sha256,
  sourceStateSha256: null,
  workingMappingId: null,
  isPublicReplacement: false,
  artifacts: [],
  gatewayJobId: null,
  gatewayDedupeKey: null,
  stateFingerprint: hash({ jobId, missing: true }),
  eligible: false,
  alreadyAdmitted: false,
  reason: 'MAPPING_JOB_MISSING',
  reasonCodes: ['MAPPING_JOB_MISSING'],
  outcome: 'HELD',
});


const correctionPlanFor = async (
  client: Client,
  snapshot: Snapshot,
  job: MappingJobRow,
  parsedBundle: AffiliateAgentContractBundle,
  input: CommonInput,
): Promise<Readonly<{
  row: AffiliateExistingDataRepairAdmissionRow;
  plan: CorrectionPlan | null;
  prior: AffiliateExistingDataRepairCorrectionPriorState | null;
  relations: CorrectionRelations;
}>> => {
  const reasons: string[] = [];
  const empty = (input: Partial<Parameters<typeof correctionRowFor>[0]> = {}) => ({
    row: correctionRowFor({
      job,
      intake: null,
      source: null,
      mapping: null,
      root: null,
      identity: null,
      run: null,
      page: null,
      evidencePages: [],
      evidence: [],
      manifest: null,
      baseline: null,
      sportsCatalog: snapshot.sportsCatalog,
      stateFingerprint: hash({ job, reasons }),
      gatewayDedupeKey: null,
      reasons,
      ...input,
    }),
    plan: null,
    prior: null,
    relations: {
      gatewayJobs: [],
      gatewayClaims: [],
      gatewayReceipts: [],
      gatewayArtifacts: [],
      gatewayEvents: [],
    },
  });
  const intake = snapshot.intakes.find((candidate) => candidate.id === job.intakeId) ?? null;
  if (!intake) {
    reasons.push('INTAKE_MISSING');
    return empty();
  }
  const mapping = job.mappingId
    ? snapshot.mappings.find((candidate) => candidate.id === job.mappingId) ?? null
    : null;
  if (job.mappingId && !mapping) reasons.push('MAPPING_MISSING');
  const source = correctionSourceFor(snapshot, job, intake, mapping);
  if (!source) {
    reasons.push('SOURCE_IDENTITY_MISSING_OR_AMBIGUOUS');
    return empty({ intake, mapping });
  }
  const identity = identityForSource(source, null, intake);
  if (!identity) {
    reasons.push('SOURCE_IDENTITY_UNVERIFIABLE');
    return empty({ intake, source, mapping });
  }
  const rootState = correctionRootFor(
    snapshot,
    job,
    intake,
    source,
    mapping,
    identity,
    cohort(parsedBundle),
    evidenceRootReferencesFor(snapshot, intake, identity, job, input),
  );
  reasons.push(...rootState.reasons);
  const root = rootState.root;
  if (!root) {
    reasons.push('ROOT_IDENTITY_MISSING_OR_AMBIGUOUS');
    return empty({ intake, source, mapping, identity });
  }
  if (intake.affiliateSourceId !== source.id) reasons.push('INTAKE_SOURCE_IDENTITY_CONFLICT');
  if (intake.supplySourceId !== root.id) reasons.push('INTAKE_ROOT_IDENTITY_CONFLICT');
  if (admissionHistoryHasMalformedEntry(job.resultSummary)) reasons.push('PRIOR_ADMISSION_HISTORY_INVALID');
  const activeIntakeRuns = snapshot.runs.filter((candidate) => (
    candidate.intakeId === intake.id
    && ACTIVE_INTAKE_RUN_STATUSES.has(upper(candidate.status))
  ));
  if (activeIntakeRuns.length) reasons.push('ACTIVE_INTAKE_RUN_PRESENT');
  const pendingState = correctionPendingStateFor(job, source, root);
  reasons.push(...pendingState.reasonCodes);
  const initialGatewayJobs = await correctionGatewayJobsFor(client, snapshot, job, root, null);
  const initialProducerJobs = initialGatewayJobs.filter((candidate) => (
    upper(candidate.role) === 'MAPPING_PRODUCER'
    && candidate.subjectId === job.id
    && candidate.supplySourceId === root.id
  ));
  const oldGatewayJobs = pendingState.pending
    ? await correctionGatewayJobsFor(client, snapshot, job, root, pendingState.pending)
    : initialGatewayJobs;
  const relations = await correctionSnapshotRelationRows(
    client,
    oldGatewayJobs.map((candidate) => candidate.id),
  );
  const relationJobs = uniqueRows<GatewayJobRow>([
    ...oldGatewayJobs,
    ...relations.gatewayJobs,
  ]);
  const queuedOldJobs = relationJobs.filter((candidate) => (
    upper(candidate.role) === 'MAPPING_PRODUCER'
    && candidate.subjectId === job.id
    && candidate.supplySourceId === root.id
    && ['QUEUED', 'RETRY_WAIT'].includes(upper(candidate.status))
  ));
  const queuedReviewerJobs = relationJobs.filter((candidate) => (
    upper(candidate.role) === 'SUPPLY_REVIEWER'
    && candidate.subjectId === root.id
    && ['QUEUED', 'RETRY_WAIT'].includes(upper(candidate.status))
  ));
  if (queuedReviewerJobs.length) reasons.push('PRIOR_PENDING_MAPPING_PROOF_INVALID');
  if (pendingState.pending) {
    if (queuedOldJobs.length > 1) reasons.push('MULTIPLE_SUPERSEDED_GATEWAY_JOBS');
    const pointers = [
      { id: pendingState.pending.producerJobId, role: 'MAPPING_PRODUCER', subjectId: job.id },
      { id: pendingState.pending.reviewerJobId, role: 'SUPPLY_REVIEWER', subjectId: root.id },
    ].filter((pointer): pointer is { id: string; role: string; subjectId: string } => Boolean(pointer.id));
    for (const pointer of pointers) {
      const pointed = relationJobs.find((candidate) => candidate.id === pointer.id);
      if (!pointed) {
        reasons.push('PENDING_GATEWAY_POINTER_MISSING');
      } else if (
        upper(pointed.role) !== pointer.role
        || pointed.subjectId !== pointer.subjectId
        || pointed.supplySourceId !== root.id
      ) {
        reasons.push('PENDING_GATEWAY_POINTER_IDENTITY_CONFLICT');
      }
    }
  } else if (queuedOldJobs.length !== 1) {
    reasons.push('OLD_GATEWAY_JOB_NOT_UNIQUE');
  }
  if (!initialProducerJobs.length && !pendingState.pending) reasons.push('OLD_GATEWAY_PRODUCER_MISSING');
  reasons.push(...correctionGatewayStateReasons(relationJobs, relations));
  if (activeLease(job)) reasons.push('MAPPING_JOB_HAS_ACTIVE_LEASE');
  const siblingJobs = snapshot.jobs.filter((candidate) => (
    candidate.id !== job.id
    && candidate.intakeId === intake.id
    && ACTIVE_JOB_STATUSES.has(upper(candidate.status))
  ));
  if (siblingJobs.length) reasons.push('ACTIVE_MAPPING_JOB_PRESENT');
  if (snapshot.approvals.some((approval) => (
    approval.subjectType === 'MAPPING_PACKAGE'
    && approval.subjectKey === job.id
    && ['QUEUED', 'CLAIMED', 'IN_PROGRESS'].includes(upper(approval.status))
  ))) reasons.push('ACTIVE_APPROVAL_PRESENT');
  reasons.push(...correctionHoldReasonsFor(source, root));
  if (upper(intake.complianceStatus) !== 'ALLOWED') reasons.push('SOURCE_POLICY_NOT_ALLOWED');
  if (['BLOCKED', 'EXCLUDED', 'POLICY_BLOCKED', 'REPLACED'].includes(upper(intake.status))) reasons.push('INTAKE_BLOCKED');
  if (['BLOCKED', 'EXCLUDED', 'POLICY_BLOCKED', 'REPLACED'].includes(upper(source.status))) reasons.push('SOURCE_EXCLUDED_OR_REPLACED');
  if (
    root.isExcluded === true
    || ['SOURCE_EXCLUDED', 'SUPERSEDED'].includes(upper(root.derivedStage))
    || text(root.successorId) !== null
  ) reasons.push('SOURCE_EXCLUDED_OR_REPLACED');
  if (upper(source.targetKind) !== upper(root.targetKind)) reasons.push('ROOT_TARGET_KIND_CONFLICT');
  if (!SUPPORTED_KINDS.has(upper(source.targetKind) as AffiliateAgentListingKind) && upper(source.targetKind) !== 'UNCLASSIFIED') {
    reasons.push('SOURCE_LISTING_KIND_UNSUPPORTED');
  }
  const priorContextState = correctionPriorContextFor(job, source, root, relationJobs);
  reasons.push(...priorContextState.reasonCodes);
  const context = priorContextState.context;
  const parsedContext = context
    ? affiliateAgentExistingDataRepairContextSchema.safeParse(context)
    : null;
  if (context && text(context.sourceIdentityKey) !== identity.identityKey) {
    reasons.push('PRIOR_SOURCE_IDENTITY_CONFLICT');
  }
  const sourceAudit = recordValue(recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  const rootAudit = recordValue(recordValue(root.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  const sourceAuditPresent = Object.keys(sourceAudit).length > 0;
  const rootAuditPresent = Object.keys(rootAudit).length > 0;
  if (!sourceAuditPresent || !rootAuditPresent) reasons.push('PRIOR_ADMISSION_AUDIT_MISSING');
  if (sourceAuditPresent && rootAuditPresent && !sameValue(sourceAudit, rootAudit)) {
    reasons.push('PRIOR_ADMISSION_AUDIT_CONFLICT');
  }
  const priorAudit = context ? correctionAdmissionAuditFor(job, source, context) : null;
  if (context && !priorAudit) reasons.push('PRIOR_ADMISSION_AUDIT_INVALID');
  if (priorAudit?.operation === 'CORRECTION') reasons.push('PRIOR_ADMISSION_AUDIT_INVALID');
  if (priorAudit && admissionReportHashFromSnapshot(reportSnapshot(priorAudit.reportSnapshot)) !== context?.admissionHash) {
    reasons.push('PRIOR_ADMISSION_AUDIT_INVALID');
  }
  const priorManifest = correctionManifestFor(priorAudit, relationJobs);
  const priorEvidenceState = correctionEvidenceFor(priorAudit, priorManifest, snapshot, reasons);
  const priorContextRunId = text(context?.evidenceRunId);
  const priorRun = priorContextRunId
    ? snapshot.runs.find((candidate) => candidate.id === priorContextRunId && candidate.intakeId === intake.id) ?? null
    : null;
  if (!priorRun) reasons.push('PRIOR_EVIDENCE_RUN_MISSING');
  if (priorRun && !SUCCESSFUL_RUN_STATUSES.has(upper(priorRun.status))) reasons.push('PRIOR_EVIDENCE_RUN_NOT_SUCCESSFUL');
  const selectedRow = recordValue(priorAudit?.selectedRow);
  const priorPrimaryPageId = text(selectedRow.evidencePageId) ?? priorEvidenceState.pages[0]?.id ?? null;
  const priorPage = priorPrimaryPageId
    ? snapshot.pages.find((candidate) => candidate.id === priorPrimaryPageId && candidate.intakeId === intake.id) ?? null
    : null;
  if (!priorPage) reasons.push('PRIOR_EVIDENCE_PAGE_MISSING');
  if (priorPage && upper(priorPage.status) !== 'ACTIVE') reasons.push('PRIOR_EVIDENCE_PAGE_NOT_ACTIVE');
  const priorGatewayJobId = text(priorAudit?.gatewayJobId);
  const priorGatewayJob = priorGatewayJobId
    ? relationJobs.find((candidate) => candidate.id === priorGatewayJobId) ?? null
    : null;
  if (!priorGatewayJob) {
    reasons.push('PRIOR_GATEWAY_JOB_MISSING');
  }
  const priorGatewayManifest = priorGatewayJob
    ? affiliateAgentEvidenceManifestSchema.safeParse(priorGatewayJob.evidenceManifestJson)
    : null;
  if (
    priorGatewayJob
    && (!priorGatewayManifest?.success
      || !priorManifest
      || !sameValue(priorGatewayManifest.data, priorManifest))
  ) {
    reasons.push('PRIOR_GATEWAY_MANIFEST_CONFLICT');
  }
  if (
    !priorAudit
    || !Array.isArray(priorAudit.evidenceSnapshots)
    || !sameValue(
      [...priorAudit.evidenceSnapshots].sort((left, right) => String(recordValue(left).artifactId).localeCompare(String(recordValue(right).artifactId))),
      [...priorEvidenceState.evidence].sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
    )
  ) {
    reasons.push('PRIOR_EVIDENCE_PROOF_INVALID');
  }
  if (priorRun && priorManifest) {
    for (const entry of priorEvidenceState.evidence) {
      const artifact = snapshot.artifacts.find((candidate) => candidate.id === entry.intakeArtifactId);
      const evidencePage = artifact?.pageId
        ? snapshot.pages.find((candidate) => candidate.id === artifact.pageId) ?? null
        : null;
      if (
        !artifact
        || artifact.intakeId !== intake.id
        || artifact.runId !== priorRun.id
        || !evidencePage
        || evidencePage.intakeId !== intake.id
        || upper(evidencePage.status) !== 'ACTIVE'
      ) {
        reasons.push('PRIOR_EVIDENCE_OWNERSHIP_CONFLICT');
      }
    }
  }
  if (priorAudit && priorGatewayJob && priorRun && priorManifest && parsedContext?.success) {
    const originClaims = relations.gatewayClaims.filter((claim) => (
      text(claim.jobId) === priorGatewayJob.id
      && claim.claimGeneration === priorGatewayJob.claimGeneration
      && upper(claim.status) === 'COMPLETED'
      && text(claim.terminalReceiptId) === text(priorGatewayJob.terminalReceiptId)
    ));
    const originClaimId = originClaims.length === 1 ? text(originClaims[0]!.id) : null;
    const originNode = upper(priorGatewayJob.status) === 'COMPLETED' && originClaimId
      ? gatewayNodeFromRelations(relations, originClaimId)
      : null;
    if (upper(priorGatewayJob.status) === 'COMPLETED' && !originNode) {
      reasons.push('PRIOR_GATEWAY_CLAIM_MISSING');
    }
    try {
      if (originNode) {
        assertCompletedGatewayNode(originNode, 'MAPPING_PRODUCER', root.id, job.id, parsedContext.data);
      }
      await assertOriginalAdmissionAudit(
        client as unknown as AnyDelegate,
        priorGatewayJob,
        priorManifest,
        originNode,
        parsedContext.data,
        job,
        source,
        intake,
        priorRun,
        root,
      );
    } catch {
      reasons.push('PRIOR_ADMISSION_PROOF_INVALID');
    }
  }
  const currentPair = identity
    ? pagePairFor(snapshot, intake, source, identity, job, input, root.id)
    : { run: null, page: null, pairs: [], artifacts: [], reasons: ['EVIDENCE_PAGE_MISSING'] };
  reasons.push(...currentPair.reasons);
  const currentEvidenceState = currentPair.run && currentPair.page
    ? await artifactManifestFor(snapshot, currentPair.pairs, job, input.artifactStore)
    : { entries: [] as ExistingDataRepairArtifact[], reasons: ['EVIDENCE_PAGE_MISSING'] };
  reasons.push(...currentEvidenceState.reasons);
  const run = currentPair.run;
  const page = currentPair.page;
  const evidencePages = uniqueRows<PageRow>(currentPair.pairs.map((pair) => pair.page));
  const evidence = currentEvidenceState.entries;
  const manifest = evidence.length ? manifestFor(evidence, job.id) : null;
  const kindState = run
    ? sourceKindAssessmentFor(intake, source, root, run, page)
    : { reasons: [] as string[] };
  reasons.push(...kindState.reasons);
  const policyUrls = [
    identity?.canonicalUrl ?? null,
    intake.baseUrl,
    source.listUrl,
    source.baseUrl,
    ...evidencePages.map((candidate) => candidate.canonicalUrl),
    ...evidence.flatMap((entry) => [entry.sourceUrl, entry.finalUrl]),
  ];
  appendCurrentPolicyReasons(snapshot, policyUrls, reasons);
  const baseline = await loadBaselineSafe(
    client,
    source.id,
    reasons,
    root as unknown as AffiliateSupplySources,
  );
  if (!baseline) reasons.push('SOURCE_STATE_UNAVAILABLE');
  if (baseline && context && !pendingState.pending) {
    if (
      baseline.sourceStateSha256 !== context.sourceStateSha256
      || baseline.workingMappingId !== context.workingMappingId
      || baseline.isPublicReplacement !== context.isPublicReplacement
    ) {
      reasons.push('PRIOR_SOURCE_STATE_CONFLICT');
    }
  }
  if (pendingState.pending) {
    const pendingProducerManifest = baseline && mapping && parsedContext?.success
      ? await pendingProducerManifestFromRelations(
        relations,
        pendingState.pending,
        parsedContext.data,
        baseline,
        job,
        source,
        root,
        mapping,
      )
      : null;
    if (!mapping || !baseline || !parsedContext?.success || !pendingProducerManifest) {
      reasons.push('PRIOR_PENDING_MAPPING_PROOF_INVALID');
    }
  }
  let supersededGatewayJobs: GatewayJobRow[] = [];
  if (queuedOldJobs.length && context && priorAudit) {
    const queuedValidity = await Promise.all(
      queuedOldJobs.map((candidate) => (
        validQueuedCorrectionPredecessor(client, candidate, job, root, context, priorAudit)
      )),
    );
    if (queuedValidity.some((valid) => !valid)) reasons.push('INVALID_QUEUED_REPAIR_PREDECESSOR');
    supersededGatewayJobs = queuedOldJobs.filter((candidate, index) => (
      queuedValidity[index] && !candidate.activeClaimId
    ));
  }
  const prior = context && baseline
    ? correctionPriorStateFor(
      job,
      source,
      root,
      mapping,
      pendingState.pending,
      pendingState.pendingHash,
      context,
      priorAudit,
      relationJobs,
      relations,
    )
    : null;
  const priorStateHash = prior ? hash(prior) : hash({ jobId: job.id, sourceId: source.id, rootId: root.id });
  const gatewayDedupeKey = identity && run && manifest
    ? `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${job.id}:${identity.identityKey}:${run.id}:${manifest.hash}:correction:${hash({
      priorStateHash,
      sportsCatalogSha256: snapshot.sportsCatalog.sha256,
      sourceStateSha256: baseline?.sourceStateSha256 ?? null,
      deploymentContract: parsedBundle.deploymentContract,
      supplyContract: {
        version: parsedBundle.supplyContract.version,
        hash: parsedBundle.supplyContract.hash,
      },
    })}`
    : null;
  const stateFingerprint = hash({
    job,
    intake,
    source,
    mapping,
    root,
    context,
    prior,
    manifest,
    evidence,
    activeIntakeRuns,
    baseline: baseline?.sourceStateSha256 ?? null,
    policies: snapshot.policies,
    sportsCatalogSha256: snapshot.sportsCatalog.sha256,
  });
  const row = correctionRowFor({
    job,
    intake,
    source,
    mapping,
    root,
    identity,
    run,
    page,
    evidencePages,
    evidence,
    manifest,
    baseline,
    sportsCatalog: snapshot.sportsCatalog,
    stateFingerprint,
    gatewayDedupeKey,
    reasons,
    ...(kindState.assessment ? { sourceKindAssessment: kindState.assessment } : {}),
  });
  if (!row.eligible || !context || !parsedContext?.success || !identity || !run || !page || !manifest || !baseline || !prior || !gatewayDedupeKey) {
    return { row, plan: null, prior, relations };
  }
  const policyKeys = sortedUnique(policyUrls.map(policyKeyForUrl).filter((key): key is string => Boolean(key)));
  const planBase: Omit<CorrectionPlan, 'row'> = {
    job,
    intake,
    source,
    mapping,
    root,
    artifacts: currentPair.artifacts,
    evidence,
    identity,
    run,
    page,
    evidencePages,
    manifest,
    baseline,
    ...(parsedContext.data.sourceSportScope ? { sourceSportScope: parsedContext.data.sourceSportScope as unknown as JsonRecord } : {}),
    policySnapshots: snapshot.policies.filter((candidate) => policyKeys.includes(candidate.policyKey)),
    sportsCatalog: snapshot.sportsCatalog,
    gatewayDedupeKey,
    prior,
    priorPendingMapping: pendingState.pending,
    priorContext: context,
    priorAdmissionAudit: priorAudit,
    oldGatewayJobs: relationJobs,
    supersededGatewayJobs,
  };
  const rowWithWrite = { ...row, write: correctionWriteFor(planBase) };
  const plan: CorrectionPlan = { ...planBase, row: rowWithWrite };
  return { row: rowWithWrite, plan, prior, relations };
};

const buildCorrectionReport = async (
  client: Client,
  input: CommonInput,
  parsedBundle: AffiliateAgentContractBundle,
  mode: 'PREVIEW' | 'APPLY',
): Promise<CorrectionBuild> => {
  const validated = validateInput(input);
  const normalizedInput: CommonInput = {
    ...input,
    jobIds: validated.jobIds,
    sourceIds: validated.sourceIds,
    evidenceSelections: validated.evidenceSelections,
  };
  const snapshot = await readSnapshot(client, validated.jobIds ?? [], validated.sourceIds ?? []);
  const candidateJobs = correctionSelectedJobsFor(snapshot, validated);
  const candidateJobIds = sortedUnique(candidateJobs.map((job) => job.id));
  const missingJobIds = (validated.jobIds ?? []).filter((id) => !candidateJobIds.includes(id));
  if (validated.evidenceSelections?.some((selection) => !candidateJobIds.includes(selection.jobId))) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'EVIDENCE_SELECTION_JOB_NOT_SELECTED',
      'Every evidence selection must identify one selected mapping job.',
    );
  }
  const evaluated = await Promise.all(
    candidateJobs.map((job) => (
      correctionPlanFor(client, snapshot, job, parsedBundle, normalizedInput)
    )),
  );
  const eligible = evaluated
    .filter((entry) => entry.row.eligible && entry.plan)
    .sort((left, right) => (left.row.jobId ?? '').localeCompare(right.row.jobId ?? ''));
  const selected = eligible.slice(0, validated.limit);
  const selectedEntryKeys = new Set(selected.map((entry) => entry.row.jobId));
  const rows = evaluated.map(({ row }) => {
    if (row.eligible && !selectedEntryKeys.has(row.jobId)) {
      const marker = 'SELECTION_LIMIT_EXCLUDED';
      return {
        ...row,
        eligible: false,
        reason: marker,
        reasonCodes: sortedUnique([...row.reasonCodes, marker]),
        outcome: 'HELD' as const,
      };
    }
    if (row.jobId !== null && selectedEntryKeys.has(row.jobId)) {
      return { ...row, outcome: mode === 'APPLY' ? 'APPLIED' as const : 'PROPOSED' as const };
    }
    return row;
  });
  rows.push(...missingJobIds.map((id) => correctionMissingRowFor(id, snapshot.sportsCatalog)));
  rows.sort((left, right) => (left.jobId ?? '').localeCompare(right.jobId ?? ''));
  const plans = selected
    .map((entry) => entry.plan!)
    .sort((left, right) => left.job.id.localeCompare(right.job.id));
  const relationEntries = selected
    .map((entry) => [entry.plan!.job.id, evaluated.find((candidate) => candidate.row.jobId === entry.plan!.job.id)!.relations] as const);
  const relationCount = relationEntries.reduce((total, [, relations]) => (
    total
    + relations.gatewayJobs.length
    + relations.gatewayClaims.length
    + relations.gatewayReceipts.length
    + relations.gatewayArtifacts.length
    + relations.gatewayEvents.length
  ), 0);
  if (relationCount > SNAPSHOT_GLOBAL_LIMIT) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'SNAPSHOT_OVERFLOW',
      'The bounded correction report relation snapshot is larger than the global limit.',
      { scope: 'correction report Gateway relations', limit: SNAPSHOT_GLOBAL_LIMIT },
    );
  }
  const relationsByMappingJobId = new Map(relationEntries);
  const selectedJobIds = plans.map((plan) => plan.job.id).sort();
  const supersededMappingIds = sortedUnique(
    plans
      .map((plan) => plan.priorPendingMapping?.mappingId ?? plan.mapping?.id ?? null)
      .filter((id): id is string => Boolean(id)),
  );
  const supersededGatewayJobIds = sortedUnique(
    plans.flatMap((plan) => plan.supersededGatewayJobs.map((job) => job.id)),
  );
  const proposedWrites = plans.map(correctionWriteFor);
  const counts: AffiliateExistingDataRepairAdmissionCounts = {
    total: rows.length,
    eligible: rows.filter((row) => row.eligible).length,
    held: rows.filter((row) => !row.eligible).length,
    selected: plans.length,
    alreadyAdmitted: 0,
  };
  const reportHash = correctionReportHashFor({
    contractVersion: parsedBundle.supplyContract.version,
    contractHash: parsedBundle.supplyContract.hash,
    reason: validated.reason,
    operatorId: validated.operatorId,
    requestedJobIds: validated.jobIds ?? null,
    requestedSourceIds: validated.sourceIds ?? null,
    evidenceSelections: validated.evidenceSelections ?? null,
    selectionLimit: validated.limit,
    counts,
    selectedJobIds,
    rows,
    proposedWrites,
    supersededMappingIds,
    supersededGatewayJobIds,
    priorStates: plans.map((plan) => plan.prior),
  });
  const report: AffiliateExistingDataRepairCorrectionReport = {
    schemaVersion: 1,
    mode,
    evaluatedAt: new Date().toISOString(),
    contractVersion: parsedBundle.supplyContract.version,
    contractHash: parsedBundle.supplyContract.hash,
    reason: validated.reason,
    operatorId: validated.operatorId,
    requestedJobIds: validated.jobIds ?? null,
    requestedSourceIds: validated.sourceIds ?? null,
    evidenceSelections: validated.evidenceSelections ?? null,
    selectionLimit: validated.limit,
    selectedJobIds,
    proposedJobIds: plans.map((plan) => plan.job.id).sort(),
    counts,
    rows,
    proposedWrites,
    reportHash,
    reviewedReportHash: null,
    writeCount: mode === 'APPLY' ? plans.length : 0,
    appliedJobs: [],
    replayed: false,
    operation: 'CORRECTION',
    supersededMappingIds,
    supersededGatewayJobIds,
    priorStates: plans.map((plan) => plan.prior),
  };
  return { report, plans, relationsByMappingJobId };
};

export type PreviewAffiliateExistingDataRepairCorrectionInput = CommonInput;
export type ApplyAffiliateExistingDataRepairCorrectionInput = CommonInput & Readonly<{
  expectedReportHash: string;
}>;

export const previewAffiliateExistingDataRepairCorrection = async (
  input: PreviewAffiliateExistingDataRepairCorrectionInput,
): Promise<AffiliateExistingDataRepairCorrectionPreview> => {
  const parsedBundle = parseBundle(input.bundle);
  const built = await buildCorrectionReport(input.prisma, input, parsedBundle, 'PREVIEW');
  return built.report as AffiliateExistingDataRepairCorrectionPreview;
};

const assertNoUnresolvedGatewayEffects = async (client: Client): Promise<void> => {
  const db = client as unknown as AnyDelegate;
  const unresolvedJobs = await delegateRows<JsonRecord>(db.affiliateAgentGatewayJobs, {
    where: { status: { in: ['CLAIMED', 'RECONCILIATION_REQUIRED'] } },
    select: { id: true, status: true, activeClaimId: true },
    orderBy: { id: 'asc' },
    take: 1,
  });
  if (unresolvedJobs.length) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      'A Gateway job has an active or unresolved effect.',
    );
  }
  const unresolvedClaims = await delegateRows<JsonRecord>(db.affiliateAgentGatewayClaims, {
    where: { status: { in: ['ACTIVE', 'RECONCILIATION_REQUIRED'] } },
    select: { id: true, jobId: true, status: true },
    orderBy: { id: 'asc' },
    take: 1,
  });
  if (unresolvedClaims.length) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      'A Gateway claim has an active or unresolved effect.',
    );
  }
  const unresolvedReceipts = await delegateRows<JsonRecord>(db.affiliateAgentGatewayOperationReceipts, {
    where: { status: { in: ['PENDING', 'UNKNOWN'] } },
    select: { id: true, jobId: true, claimId: true, status: true },
    orderBy: { id: 'asc' },
    take: 1,
  });
  if (unresolvedReceipts.length) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      'A Gateway operation receipt has an unresolved effect.',
    );
  }
};

const correctionAuditFromMetadata = (
  metadata: unknown,
  expectedReportHash: string,
): JsonRecord | null => {
  const audit = recordValue(recordValue(metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  return audit.operation === 'CORRECTION'
    && normalizeHash(audit.reportHash) === expectedReportHash
    ? audit
    : null;
};

const correctionPriorStatesFromReport = (
  report: JsonRecord,
): AffiliateExistingDataRepairCorrectionPriorState[] => (
  Array.isArray(report.priorStates)
    ? report.priorStates.filter((state): state is AffiliateExistingDataRepairCorrectionPriorState => (
      Boolean(state && typeof state === 'object' && !Array.isArray(state))
    ))
    : []
);

const correctionReplay = async (
  client: Client,
  input: ApplyAffiliateExistingDataRepairCorrectionInput,
  parsedBundle: AffiliateAgentContractBundle,
  expectedReportHash: string,
): Promise<AffiliateExistingDataRepairCorrectionApplyReport | null> => {
  const validated = validateInput(input);
  const normalizedInput: CommonInput = {
    ...input,
    jobIds: validated.jobIds,
    sourceIds: validated.sourceIds,
    evidenceSelections: validated.evidenceSelections,
  };
  const snapshot = await readSnapshot(client, validated.jobIds ?? [], validated.sourceIds ?? []);
  const selectedJobs = correctionSelectedJobsFor(snapshot, validated);
  if (!selectedJobs.length) return null;
  const entries: Array<{
    audit: JsonRecord;
    source: SourceRow;
    root: RootRow;
    mappingJob: MappingJobRow;
    gatewayJob: GatewayJobRow;
  }> = [];
  for (const job of selectedJobs) {
    const intake = snapshot.intakes.find((candidate) => candidate.id === job.intakeId) ?? null;
    const mapping = job.mappingId
      ? snapshot.mappings.find((candidate) => candidate.id === job.mappingId) ?? null
      : null;
    const source = intake ? correctionSourceFor(snapshot, job, intake, mapping) : null;
    const identity = intake && source ? identityForSource(source, null, intake) : null;
    const rootState = intake && source && identity
      ? correctionRootFor(
        snapshot,
        job,
        intake,
        source,
        mapping,
        identity,
        cohort(parsedBundle),
        evidenceRootReferencesFor(snapshot, intake, identity, job, normalizedInput),
      )
      : { root: null, reasons: [] as string[] };
    const root = rootState.root;
    if (!intake || !source || !root || !identity || rootState.reasons.length) continue;
    const audit = correctionAuditFromMetadata(source.metadata, expectedReportHash);
    if (!audit) continue;
    if (intake.affiliateSourceId !== source.id || intake.supplySourceId !== root.id) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The correction intake identity no longer points to the audited source and supply root.',
      );
    }
    if (admissionHistoryHasMalformedEntry(job.resultSummary)) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The correction admission history contains a malformed entry.',
      );
    }
    const gatewayJobId = text(recordValue(audit.createdIds).gatewayJobId);
    if (!gatewayJobId) return null;
    const gatewayJob = await readUnique(
      client as unknown as AnyDelegate,
      'affiliateAgentGatewayJobs',
      { where: { id: gatewayJobId } },
    ) as unknown as GatewayJobRow | null;
    if (!gatewayJob) return null;
    const rootAudit = recordValue(recordValue(root.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
    if (!sameValue(rootAudit, audit)) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The correction admission audits do not agree across the source and root identities.',
      );
    }
    const holdValues = [
      recordValue(source.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY],
      recordValue(root.metadata)[AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY],
    ];
    const holdPresent = [
      hasOwn(source.metadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY),
      hasOwn(root.metadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY),
    ];
    if (holdPresent[0] !== holdPresent[1]) {
      throw new AffiliateExistingDataRepairAdmissionError('CLAIM_DRIFT', 'The correction hold is one-sided.');
    }
    if (holdPresent[0]) {
      const sourceHold = affiliateExistingDataRepairCorrectionHoldSchema.safeParse(holdValues[0]);
      const rootHold = affiliateExistingDataRepairCorrectionHoldSchema.safeParse(holdValues[1]);
      if (
        !sourceHold.success
        || !rootHold.success
        || !sameValue(sourceHold.data, rootHold.data)
        || sourceHold.data.sourceId !== source.id
        || sourceHold.data.supplySourceId !== root.id
        || sourceHold.data.mappingJobId !== job.id
        || normalizeHash(sourceHold.data.admissionHash) !== expectedReportHash
      ) {
        throw new AffiliateExistingDataRepairAdmissionError('CLAIM_DRIFT', 'The correction hold identity is invalid.');
      }
    }
    if (gatewayJob.activeClaimId) {
      throw new AffiliateExistingDataRepairAdmissionError('CLAIM_DRIFT', 'The corrected Gateway job is actively claimed.');
    }
    entries.push({ audit, source, root, mappingJob: job, gatewayJob });
  }
  if (!entries.length) return null;
  const firstAudit = entries[0]?.audit;
  const stored = recordValue(firstAudit?.reportSnapshot);
  const storedSelectedJobIds = stringArray(stored.selectedJobIds);
  const priorStates = correctionPriorStatesFromReport(stored);
  const rows = Array.isArray(stored.rows)
    ? stored.rows as unknown as AffiliateExistingDataRepairAdmissionRow[]
    : [];
  const proposedWrites = Array.isArray(stored.proposedWrites)
    ? stored.proposedWrites as unknown as AffiliateExistingDataRepairAdmissionWrite[]
    : [];
  const supersededMappingIds = Array.isArray(stored.supersededMappingIds)
    ? stored.supersededMappingIds.filter((id): id is string => typeof id === 'string')
    : [];
  const supersededGatewayJobIds = Array.isArray(stored.supersededGatewayJobIds)
    ? stored.supersededGatewayJobIds.filter((id): id is string => typeof id === 'string')
    : [];
  const counts = recordValue(stored.counts) as unknown as AffiliateExistingDataRepairAdmissionCounts;
  const storedRequestedJobIds = stored.requestedJobIds === null
    ? null
    : stringArray(stored.requestedJobIds);
  const storedRequestedSourceIds = stored.requestedSourceIds === null
    ? null
    : stringArray(stored.requestedSourceIds);
  const storedEvidenceSelections = stored.evidenceSelections === null
    ? null
    : Array.isArray(stored.evidenceSelections)
      ? stored.evidenceSelections as ExistingDataRepairEvidenceSelection[]
      : null;
  const allAuditReportsMatch = entries.every((entry) => sameValue(entry.audit.reportSnapshot, stored));
  const allAuditRequestProof = entries.every((entry) => (
    String(entry.audit.operatorId ?? '') === String(stored.operatorId ?? '')
    && String(entry.audit.reason ?? '') === String(stored.reason ?? '')
    && Number(entry.audit.selectionLimit) === Number(stored.selectionLimit)
    && sameValue(entry.audit.requestedJobIds ?? null, storedRequestedJobIds)
    && sameValue(entry.audit.requestedSourceIds ?? null, storedRequestedSourceIds)
    && sameValue(entry.audit.selectedJobIds, storedSelectedJobIds)
  ));
  let recomputedReportHash: string | null = null;
  try {
    recomputedReportHash = correctionReportHashFor({
      contractVersion: Number(stored.contractVersion),
      contractHash: String(stored.contractHash ?? ''),
      reason: String(stored.reason ?? ''),
      operatorId: String(stored.operatorId ?? ''),
      requestedJobIds: storedRequestedJobIds,
      requestedSourceIds: storedRequestedSourceIds,
      evidenceSelections: storedEvidenceSelections,
      selectionLimit: Number(stored.selectionLimit),
      counts,
      selectedJobIds: storedSelectedJobIds ?? [],
      rows,
      proposedWrites,
      supersededMappingIds,
      supersededGatewayJobIds,
      priorStates,
    });
  } catch {
    recomputedReportHash = null;
  }
  const entryMappingJobIds = entries.map((entry) => entry.mappingJob.id);
  const entryMappingJobIdSet = sortedUnique(entryMappingJobIds);
  const priorStateIds = priorStates.map((state) => state.mappingJobId);
  const priorStateByMappingJobId = new Map(priorStates.map((state) => [state.mappingJobId, state]));
  const expectedRequestedJobIds = validated.jobIds ?? null;
  const expectedRequestedSourceIds = validated.sourceIds ?? null;
  const expectedEvidenceSelections = validated.evidenceSelections ?? null;
  const selectorsMatch = (
    stored.requestedJobIds !== undefined
    && stored.requestedSourceIds !== undefined
    && stored.evidenceSelections !== undefined
    && storedRequestedJobIds !== null
      ? sameValue(storedRequestedJobIds, expectedRequestedJobIds)
      : stored.requestedJobIds === null
        && storedRequestedJobIds === null
        && sameValue(expectedRequestedJobIds, null)
  ) && (
    stored.requestedSourceIds !== undefined
      && storedRequestedSourceIds !== null
      ? sameValue(storedRequestedSourceIds, expectedRequestedSourceIds)
      : stored.requestedSourceIds === null
        && storedRequestedSourceIds === null
        && sameValue(expectedRequestedSourceIds, null)
  ) && (
    stored.evidenceSelections !== undefined
      && storedEvidenceSelections !== null
      ? sameValue(storedEvidenceSelections, expectedEvidenceSelections)
      : stored.evidenceSelections === null
        && storedEvidenceSelections === null
        && sameValue(expectedEvidenceSelections, null)
  );
  const priorStatesMatch = Boolean(
    Array.isArray(stored.priorStates)
      && storedSelectedJobIds
      && priorStates.length === stored.priorStates.length
      && priorStates.length === storedSelectedJobIds.length
      && priorStates.every((state) => typeof state.mappingJobId === 'string' && state.mappingJobId.length > 0)
      && new Set(priorStateIds).size === priorStateIds.length
      && sameValue([...priorStateIds].sort(), [...storedSelectedJobIds].sort()),
  );
  const selectedRowsBindEntries = Boolean(
    storedSelectedJobIds
      && entries.every((entry) => {
        const row = rows.find((candidate) => candidate.mappingJobId === entry.mappingJob.id);
        return Boolean(
          row
            && row.sourceId === entry.source.id
            && row.rootId === entry.root.id
            && row.supplySourceId === entry.root.id
            && row.mappingJobId === entry.mappingJob.id,
        );
      }),
  );
  const priorStatesBindEntries = entries.every((entry) => {
    const prior = priorStateByMappingJobId.get(entry.mappingJob.id);
    return Boolean(
      prior
        && prior.mappingJobId === entry.mappingJob.id
        && prior.sourceId === entry.source.id
        && prior.supplySourceId === entry.root.id,
    );
  });
  const immutableEntryProof = entries.every((entry) => {
    const auditCreatedIds = recordValue(entry.audit.createdIds);
    return (
      entry.audit.operation === 'CORRECTION'
      && normalizeHash(entry.audit.reportHash) === expectedReportHash
      && text(entry.audit.mappingJobId) === entry.mappingJob.id
      && text(entry.audit.gatewayJobId) === entry.gatewayJob.id
      && text(auditCreatedIds.gatewayJobId) === entry.gatewayJob.id
      && text(auditCreatedIds.mappingJobId) === entry.mappingJob.id
      && text(auditCreatedIds.sourceId) === entry.source.id
      && text(auditCreatedIds.supplySourceId) === entry.root.id
      && sameValue(entry.audit.selectedJobIds, storedSelectedJobIds)
      && sameValue(entry.audit.requestedJobIds ?? null, expectedRequestedJobIds)
      && sameValue(entry.audit.requestedSourceIds ?? null, expectedRequestedSourceIds)
      && entry.gatewayJob.role === 'MAPPING_PRODUCER'
      && entry.gatewayJob.subjectType === 'MAPPING_PRODUCER'
      && entry.gatewayJob.subjectId === entry.mappingJob.id
      && entry.gatewayJob.supplySourceId === entry.root.id
      && entry.gatewayJob.dedupeKey === entry.audit.gatewayDedupeKey
    );
  });
  const holdProofMatchesPriorState = entries.every((entry) => {
    const sourceMetadata = recordValue(entry.source.metadata);
    const hold = readAffiliateExistingDataRepairCorrectionHold(
      sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY],
    );
    const prior = priorStateByMappingJobId.get(entry.mappingJob.id);
    return !hold || Boolean(prior && normalizeHash(hold.priorPendingMappingHash) === normalizeHash(prior.pendingMappingHash));
  });
  if (
    stored.operation !== 'CORRECTION'
    || normalizeHash(stored.reportHash) !== expectedReportHash
    || recomputedReportHash !== expectedReportHash
    || Number(stored.contractVersion) !== parsedBundle.supplyContract.version
    || String(stored.contractHash ?? '') !== parsedBundle.supplyContract.hash
    || String(stored.operatorId ?? '') !== validated.operatorId
    || String(stored.reason ?? '') !== validated.reason
    || !Array.isArray(stored.rows)
    || !Array.isArray(stored.proposedWrites)
    || !storedSelectedJobIds
    || !sameValue(storedSelectedJobIds, [...storedSelectedJobIds].sort())
    || entries.length !== storedSelectedJobIds.length
    || entryMappingJobIdSet.length !== entryMappingJobIds.length
    || !sameValue(entryMappingJobIdSet, storedSelectedJobIds)
    || Number(stored.selectionLimit) !== validated.limit
    || !allAuditReportsMatch
    || !allAuditRequestProof
    || !selectorsMatch
    || !priorStatesMatch
    || !selectedRowsBindEntries
    || !priorStatesBindEntries
    || !immutableEntryProof
    || !holdProofMatchesPriorState
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'ADMISSION_REPORT_DRIFT',
      'Stored correction admission evidence is incomplete or does not match the reviewed selection.',
    );
  }
  const appliedJobs: AffiliateExistingDataRepairAppliedJob[] = entries.map((entry) => ({
    jobId: entry.gatewayJob.id,
    mappingJobId: entry.mappingJob.id,
    sourceId: entry.source.id,
    supplySourceId: entry.root.id,
  })).sort((left, right) => left.mappingJobId.localeCompare(right.mappingJobId));
  return {
    ...(stored as unknown as AffiliateExistingDataRepairCorrectionReport),
    mode: 'APPLY',
    reviewedReportHash: expectedReportHash,
    writeCount: 0,
    appliedJobs,
    replayed: true,
  };
};

const correctionContextForApply = (
  plan: CorrectionPlan,
  reportHash: string,
  reasonText: string,
  bundle: AffiliateAgentContractBundle,
): AffiliateAgentExistingDataRepairContext => {
  const priorAdmissionHash = normalizeHash(plan.priorContext.admissionHash);
  if (!priorAdmissionHash) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'PRIOR_ADMISSION_AUDIT_MISSING',
      `Mapping job ${plan.job.id} has no valid prior admission hash.`,
    );
  }
  const kindState = upper(plan.source.targetKind) === 'UNCLASSIFIED'
    ? sourceKindAssessmentFor(plan.intake, plan.source, plan.root, plan.run, plan.page)
    : { assessment: undefined, reasons: [] as string[] };
  if (kindState.reasons.length || (upper(plan.source.targetKind) === 'UNCLASSIFIED' && !kindState.assessment)) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'SOURCE_LISTING_KIND_UNSUPPORTED',
      `The current source kind cannot be admitted for ${plan.job.id}.`,
      { reasonCodes: kindState.reasons },
    );
  }
  return parseContext({
    kind: 'EXISTING_DATA_REPAIR',
    intakeId: plan.intake.id,
    evidenceRunId: plan.run.id,
    sportsCatalog: plan.sportsCatalog,
    sourceId: plan.source.id,
    sourceIdentityKey: plan.identity.identityKey,
    admissionHash: reportHash,
    sourceStateSha256: plan.baseline.sourceStateSha256,
    workingMappingId: plan.baseline.workingMappingId,
    isPublicReplacement: plan.baseline.isPublicReplacement,
    repairReasons: sortedUnique([
      reasonText,
      ...recordedRepairReasons(plan.job.resultSummary),
    ]),
    ...(kindState.assessment ? { sourceKindAssessment: kindState.assessment } : {}),
    deploymentContract: bundle.deploymentContract,
    ...(plan.sourceSportScope ? { sourceSportScope: plan.sourceSportScope } : {}),
    correction: {
      priorAdmissionHash,
      priorPendingMappingHash: plan.prior.pendingMappingHash,
    },
  });
};

const assertCorrectionPlanCurrent = async (
  tx: Client,
  plan: CorrectionPlan,
): Promise<{ job: MappingJobRow; source: SourceRow; root: RootRow; mapping: MappingRow | null }> => {
  const db = tx as unknown as AnyDelegate;
  const currentJob = await readUnique(
    db,
    'affiliateSourceMappingJobs',
    { where: { id: plan.job.id } },
  ) as unknown as MappingJobRow | null;
  if (
    !currentJob
    || currentJob.intakeId !== plan.intake.id
    || currentJob.status !== plan.job.status
    || currentJob.sourceId !== plan.job.sourceId
    || currentJob.mappingId !== plan.job.mappingId
    || currentJob.supplySourceId !== plan.job.supplySourceId
    || activeLease(currentJob)
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'IDENTITY_DRIFT',
      `Mapping job ${plan.job.id} changed after correction preview.`,
    );
  }
  const activeRuns = await snapshotRows<RunRow>(
    db.affiliateSourceIntakeRuns,
    {
      where: { intakeId: plan.intake.id, status: { in: [...ACTIVE_INTAKE_RUN_STATUSES] } },
      orderBy: { id: 'asc' },
    },
    SNAPSHOT_PER_INTAKE_LIMIT,
    `correction active intake runs:${plan.intake.id}`,
  );
  if (activeRuns.length) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'ACTIVE_INTAKE_RUN_PRESENT',
      `Intake ${plan.intake.id} has active capture work.`,
    );
  }
  const currentIntake = await readUnique(
    db,
    'affiliateSourceIntakes',
    { where: { id: plan.intake.id } },
  ) as unknown as IntakeRow | null;
  const source = await readUnique(db, 'affiliateScrapeSources', { where: { id: plan.source.id } }) as unknown as SourceRow | null;
  const root = await readUnique(db, 'affiliateSupplySources', { where: { id: plan.root.id } }) as unknown as RootRow | null;
  const mapping = plan.mapping
    ? await readUnique(db, 'affiliateScrapeMappings', { where: { id: plan.mapping.id } }) as unknown as MappingRow | null
    : null;
  const currentIdentity = source ? identityForSource(source, null, currentIntake) : null;
  if (
    !currentIntake
    || !source
    || !root
    || !currentIdentity
    || currentIntake.id !== plan.intake.id
    || currentIntake.affiliateSourceId !== source.id
    || currentIntake.supplySourceId !== root.id
    || currentIdentity.identityKey !== plan.identity.identityKey
    || source.supplySourceId !== root.id
    || root.identityKey !== plan.identity.identityKey
    || canonical(root.canonicalUrl) !== plan.identity.canonicalUrl
    || root.origin !== plan.identity.origin
    || root.pathKey !== plan.identity.pathKey
    || root.rolloutCohort !== plan.root.rolloutCohort
    || root.intakeId !== plan.intake.id
    || root.liveSourceId !== source.id
    || source.targetKind.toUpperCase() !== root.targetKind.toUpperCase()
    || (plan.mapping && (
      !mapping
      || mapping.sourceId !== source.id
      || mapping.supplySourceId !== root.id
    ))
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'IDENTITY_DRIFT',
      `Source, Supply Source, or mapping ${plan.job.id} changed after correction preview.`,
    );
  }
  const sourceMetadata = recordValue(source.metadata);
  const rootMetadata = recordValue(root.metadata);
  const currentPending = correctionPendingStateFor(currentJob, source, root);
  if (
    currentPending.reasonCodes.length
    || currentPending.pendingHash !== plan.prior.pendingMappingHash
    || !sameValue(currentPending.pending, plan.priorPendingMapping)
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'PENDING_REPAIR_PRESENT',
      `The prior pending pointer for ${plan.job.id} changed after correction preview.`,
    );
  }
  if (plan.priorPendingMapping) {
    const pendingProducerJob = plan.priorPendingMapping.producerJobId
      ? plan.oldGatewayJobs.find((candidate) => candidate.id === plan.priorPendingMapping!.producerJobId) ?? null
      : null;
    const pendingManifest = pendingProducerJob
      ? affiliateAgentEvidenceManifestSchema.safeParse(pendingProducerJob.evidenceManifestJson)
      : null;
    const contextResult = affiliateAgentExistingDataRepairContextSchema.safeParse(plan.priorContext);
    if (!mapping || !pendingManifest?.success || !contextResult.success) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'PENDING_REPAIR_PRESENT',
        `The pending mapping proof for ${plan.job.id} is unavailable.`,
      );
    }
    try {
      assertPendingTransition(
        contextResult.data,
        pendingManifest.data,
        plan.baseline,
        currentJob,
        source,
        root,
        mapping,
      );
    } catch {
      throw new AffiliateExistingDataRepairAdmissionError(
        'PENDING_REPAIR_PRESENT',
        `The pending mapping proof for ${plan.job.id} changed after correction preview.`,
      );
    }
  }
  if (
    !sameValue(sourceMetadata.existingDataRepair, plan.priorContext)
    || !sameValue(rootMetadata.existingDataRepair, plan.priorContext)
    || !sameValue(
      sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY],
      rootMetadata[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY],
    )
    || !sameValue(
      correctionAdmissionAuditFor(currentJob, source, plan.priorContext),
      plan.priorAdmissionAudit,
    )
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'ADMISSION_REPORT_DRIFT',
      `The prior correction evidence for ${plan.job.id} changed after preview.`,
    );
  }
  const sourceHoldPresent = hasOwn(sourceMetadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY);
  const rootHoldPresent = hasOwn(rootMetadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY);
  if (sourceHoldPresent || rootHoldPresent) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CORRECTION_HOLD_PRESENT',
      `A correction hold already exists for ${plan.source.id}.`,
    );
  }
  const baseline = await loadBaseline(tx, source.id, root as unknown as AffiliateSupplySources);
  if (
    baseline.sourceStateSha256 !== plan.baseline.sourceStateSha256
    || baseline.workingMappingId !== plan.baseline.workingMappingId
    || baseline.isPublicReplacement !== plan.baseline.isPublicReplacement
    || baseline.correctionHold !== null
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'SOURCE_STATE_DRIFT',
      `Source ${plan.source.id} changed after correction preview.`,
    );
  }
  return { job: currentJob, source, root, mapping };
};

const assertCorrectionGatewayGraphCurrent = async (
  tx: Client,
  plan: CorrectionPlan,
): Promise<CorrectionRelations> => {
  const ids = plan.oldGatewayJobs.map((job) => job.id);
  const relations = await correctionSnapshotRelationRows(tx, ids);
  const currentJobs = [...relations.gatewayJobs].sort(compareId);
  const priorJobs = [...plan.prior.gatewayJobs].sort((left, right) => (
    String(recordValue(left).id).localeCompare(String(recordValue(right).id))
  ));
  if (!sameValue(currentJobs.map(correctionImmutableGatewayJob), priorJobs)) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      `Gateway job state for ${plan.job.id} changed after correction preview.`,
    );
  }
  const projections: Array<[string, readonly unknown[], readonly unknown[]]> = [
    ['claim', relations.gatewayClaims.map(correctionImmutableClaim), plan.prior.gatewayClaims],
    ['receipt', relations.gatewayReceipts.map(correctionImmutableReceipt), plan.prior.gatewayReceipts],
    ['artifact', relations.gatewayArtifacts.map(correctionImmutableArtifact), plan.prior.gatewayArtifacts],
    ['event', relations.gatewayEvents.map(correctionImmutableEvent), plan.prior.gatewayEvents],
  ];
  for (const [label, current, prior] of projections) {
    if (!sameValue(current, prior)) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'CLAIM_DRIFT',
        `Gateway ${label} state for ${plan.job.id} changed after correction preview.`,
      );
    }
  }
  const reasons = correctionGatewayStateReasons(currentJobs, relations);
  if (reasons.length) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      `Gateway activity blocks correction for ${plan.job.id}.`,
      { reasonCodes: reasons },
    );
  }
  return relations;
};

const cancelCorrectionGatewayJob = async (
  tx: Client,
  oldJob: GatewayJobRow,
  reportHash: string,
  operatorId: string,
  replacementGatewayJobId: string,
): Promise<void> => {
  const db = tx as unknown as AnyDelegate;
  const current = await readUnique(
    db,
    'affiliateAgentGatewayJobs',
    { where: { id: oldJob.id } },
  ) as unknown as GatewayJobRow | null;
  if (
    !current
    || !['QUEUED', 'RETRY_WAIT'].includes(upper(current.status))
    || current.activeClaimId
    || current.status !== oldJob.status
    || current.eventSequence !== oldJob.eventSequence
  ) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      `Gateway job ${oldJob.id} is no longer a cancellable queued correction predecessor.`,
    );
  }
  const activeClaims = await delegateRows<GatewayClaimRow>(db.affiliateAgentGatewayClaims, {
    where: { jobId: current.id, status: { in: ['ACTIVE', 'RECONCILIATION_REQUIRED'] } },
    orderBy: { id: 'asc' },
    take: 1,
  });
  if (activeClaims.length) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      `Gateway job ${oldJob.id} has an active or unresolved claim.`,
    );
  }
  const eventSequence = current.eventSequence ?? 1;
  const update = await requiredWriteDelegateMethod(db, 'affiliateAgentGatewayJobs', 'updateMany')({
    where: {
      id: current.id,
      status: current.status,
      activeClaimId: null,
      eventSequence,
    },
    data: {
      status: 'PIPELINE_BLOCKED',
      terminalDisposition: 'CORRECTION_SUPERSEDED',
      nextAttemptAt: null,
      pipelineBlockedAt: new Date(),
      eventSequence: { increment: 1 },
    },
  });
  if (update.count !== 1) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'CLAIM_DRIFT',
      `Gateway job ${oldJob.id} could not be superseded atomically.`,
    );
  }
  await requiredWriteDelegateMethod(db, 'affiliateAgentGatewayEvents', 'create')({
    data: {
      id: createId(),
      eventKey: `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${current.id}:superseded:${reportHash}`,
      jobId: current.id,
      claimId: null,
      receiptId: null,
      sequence: eventSequence + 1,
      eventType: 'JOB_SUPERSEDED',
      actorKind: 'OPERATOR',
      actorId: operatorId,
      role: current.role,
      requestHash: reportHash,
      inputHash: hash(correctionImmutableGatewayJob(oldJob)),
      outputHash: reportHash,
      reasonCodes: ['EXISTING_DATA_REPAIR_CORRECTION'],
      payload: asJson({
        operation: 'CORRECTION',
        reportHash,
        supersededByGatewayJobId: replacementGatewayJobId,
        priorStatus: oldJob.status,
      }),
      retentionClass: 'INDEFINITE',
    },
  });
};

const applyCorrectionPlan = async (
  tx: Client,
  plan: CorrectionPlan,
  report: AffiliateExistingDataRepairCorrectionReport,
  reportHash: string,
  operatorId: string,
  reasonText: string,
  bundle: AffiliateAgentContractBundle,
  requestedJobIds: readonly string[] | undefined,
  requestedSourceIds: readonly string[] | undefined,
  selectionLimit: number,
  relations: CorrectionRelations,
): Promise<AffiliateExistingDataRepairAppliedJob> => {
  const db = tx as unknown as AnyDelegate;
  const currentState = await assertCorrectionPlanCurrent(tx, plan);
  const currentRelations = await assertCorrectionGatewayGraphCurrent(tx, plan);
  const context = correctionContextForApply(plan, reportHash, reasonText, bundle);
  const now = new Date();
  const source = currentState.source;
  const root = currentState.root;
  const currentJob = currentState.job;
  const mapping = currentState.mapping;
  const hold = affiliateExistingDataRepairCorrectionHoldSchema.parse({
    schemaVersion: 1,
    sourceId: source.id,
    supplySourceId: root.id,
    mappingJobId: currentJob.id,
    admissionHash: reportHash,
    priorPendingMappingHash: plan.prior.pendingMappingHash,
  });
  const subject: AffiliateAgentSubject = upper(source.targetKind) === 'UNCLASSIFIED'
    ? {
      type: 'MAPPING_PRODUCER',
      supplySourceId: root.id,
      mappingJobId: currentJob.id,
      pass: 1,
      repairContext: context,
    }
    : {
      type: 'MAPPING_PRODUCER',
      supplySourceId: root.id,
      mappingJobId: currentJob.id,
      listingKind: upper(source.targetKind) as AffiliateAgentListingKind,
      pass: 1,
      repairContext: context,
    };
  const gatewayData = {
    id: createId(),
    dedupeKey: plan.gatewayDedupeKey,
    queue: 'AFFILIATE_MAPPING',
    lane: 'MAPPING_PRODUCTION',
    role: 'MAPPING_PRODUCER',
    subjectType: 'MAPPING_PRODUCER',
    subjectId: currentJob.id,
    subjectJson: asJson(subject),
    evidenceManifestJson: asJson(plan.manifest),
    supplySourceId: root.id,
    expectedLifecycleGeneration: root.lifecycleGeneration,
    status: 'QUEUED',
    priority: 0,
    nextAttemptAt: now,
    claimGeneration: 0,
    eventSequence: 1,
    activeClaimId: null,
    parentClaimId: null,
  };
  const gateway = await requiredWriteDelegateMethod(db, 'affiliateAgentGatewayJobs', 'create')({
    data: gatewayData as unknown as Record<string, unknown>,
  }) as unknown as GatewayJobRow;
  if (!gateway?.id) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'GATEWAY_CREATE_FAILED',
      `Correction Gateway job for ${currentJob.id} was not created.`,
    );
  }
  const sourceAudit: ExistingDataRepairAdmissionAudit = {
    schemaVersion: 1,
    operation: 'CORRECTION',
    reportHash,
    reportSnapshot: report,
    operatorId,
    reason: reasonText,
    mappingJobId: currentJob.id,
    intakeId: plan.intake.id,
    evidenceRunId: plan.run.id,
    sourceId: source.id,
    supplySourceId: root.id,
    rootId: root.id,
    rootIdentityKey: root.identityKey,
    mappingId: mapping?.id ?? currentJob.mappingId,
    gatewayJobId: gateway.id,
    gatewayDedupeKey: plan.gatewayDedupeKey,
    selectedJobIds: [...report.selectedJobIds].sort(),
    requestedJobIds: requestedJobIds ? [...requestedJobIds].sort() : null,
    requestedSourceIds: requestedSourceIds ? [...requestedSourceIds].sort() : null,
    selectionLimit,
    selectedRow: {
      jobId: currentJob.id,
      mappingJobId: currentJob.id,
      intakeId: plan.intake.id,
      sourceId: source.id,
      mappingId: mapping?.id ?? currentJob.mappingId,
      supplySourceId: root.id,
      rootId: root.id,
      gatewayJobId: gateway.id,
      evidenceRunId: plan.run.id,
      eligible: true,
      outcome: 'APPLIED',
    },
    selectedWrite: {
      ...correctionWriteFor(plan),
      sourceId: source.id,
      supplySourceId: root.id,
    },
    repairContext: context,
    manifest: plan.manifest,
    sourceStateSha256: plan.baseline.sourceStateSha256,
    sourceState: plan.baseline.sourceState,
    workingMappingState: plan.baseline.workingMappingState,
    organizationState: plan.baseline.organizationState,
    baseline: {
      sourceStateSha256: plan.baseline.sourceStateSha256,
      sourceState: plan.baseline.sourceState,
      workingMappingState: plan.baseline.workingMappingState,
      organizationState: plan.baseline.organizationState,
    },
    rootLifecycleGeneration: root.lifecycleGeneration,
    artifactIds: plan.evidence.map((entry) => entry.artifactId).sort(),
    evidenceSnapshots: plan.evidence,
    pageSnapshots: plan.evidencePages.map((page) => ({
      id: page.id,
      intakeId: page.intakeId,
      supplySourceId: page.supplySourceId,
      url: page.url,
      canonicalUrl: page.canonicalUrl,
      status: page.status,
      role: page.role ?? null,
      targetKindHints: page.targetKindHints ?? [],
      metadata: page.metadata ?? null,
    })),
    policySnapshots: plan.policySnapshots,
    deploymentContract: bundle.deploymentContract,
    legacyMappingJobState: {
      status: currentJob.status,
      sourceId: currentJob.sourceId,
      mappingId: currentJob.mappingId,
      supplySourceId: currentJob.supplySourceId,
      claimedAt: currentJob.claimedAt ?? null,
      leaseExpiresAt: currentJob.leaseExpiresAt ?? null,
      workerId: currentJob.workerId ?? null,
      nextStatus: AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS,
    },
    supersededMappingIds: report.supersededMappingIds,
    supersededGatewayJobIds: report.supersededGatewayJobIds,
    correctionPriorState: plan.prior,
    createdIds: {
      gatewayJobId: gateway.id,
      mappingJobId: currentJob.id,
      sourceId: source.id,
      supplySourceId: root.id,
      evidenceArtifactIds: plan.evidence.map((entry) => `intake-artifact:${entry.intakeArtifactId}`).sort(),
    },
  };
  const sourceMetadata = { ...recordValue(source.metadata) };
  const rootMetadata = { ...recordValue(root.metadata) };
  delete sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY];
  delete rootMetadata[AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY];
  const sourceWithHold = metadataWithExistingDataRepairCorrectionHold({
    ...sourceMetadata,
    existingDataRepair: context,
    [AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]: sourceAudit,
  }, hold);
  const rootWithHold = metadataWithExistingDataRepairCorrectionHold({
    ...rootMetadata,
    existingDataRepair: context,
    [AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]: sourceAudit,
  }, hold);
  const sourceUpdate = await requiredWriteDelegateMethod(db, 'affiliateScrapeSources', 'updateMany')({
    where: { id: source.id, supplySourceId: root.id },
    data: { metadata: asJson(sourceWithHold) },
  });
  if (sourceUpdate.count !== 1) {
    throw new AffiliateExistingDataRepairAdmissionError('SOURCE_CAS_FAILED', `Source ${source.id} changed during correction.`);
  }
  const rootUpdate = await requiredWriteDelegateMethod(db, 'affiliateSupplySources', 'updateMany')({
    where: { id: root.id, identityKey: plan.identity.identityKey },
    data: { metadata: asJson(rootWithHold) },
  });
  if (rootUpdate.count !== 1) {
    throw new AffiliateExistingDataRepairAdmissionError('ROOT_CAS_FAILED', `Supply Source ${root.id} changed during correction.`);
  }
  for (const artifact of plan.artifacts) {
    const update = await requiredWriteDelegateMethod(db, 'affiliateSourceIntakeArtifacts', 'updateMany')({
      where: {
        id: artifact.id,
        intakeId: plan.intake.id,
        runId: artifact.runId,
        pageId: artifact.pageId,
        fileId: artifact.fileId,
        supplySourceId: artifact.supplySourceId ?? null,
      },
      data: { isPinned: true, retainUntil: null, supplySourceId: root.id },
    });
    if (update.count !== 1) {
      throw new AffiliateExistingDataRepairAdmissionError('ARTIFACT_CAS_FAILED', `Artifact ${artifact.id} could not be retained.`);
    }
  }
  const nextSummary = appendHistory(currentJob.resultSummary, sourceAudit as unknown as JsonRecord);
  const jobUpdate = await requiredWriteDelegateMethod(db, 'affiliateSourceMappingJobs', 'updateMany')({
    where: {
      id: currentJob.id,
      intakeId: plan.intake.id,
      status: currentJob.status,
      sourceId: currentJob.sourceId,
      mappingId: currentJob.mappingId,
      supplySourceId: currentJob.supplySourceId,
      claimedAt: null,
      workerId: null,
      leaseExpiresAt: null,
    },
    data: {
      sourceId: source.id,
      supplySourceId: root.id,
      mappingId: mapping?.id ?? currentJob.mappingId,
      status: AFFILIATE_EXISTING_DATA_REPAIR_LEGACY_HOLD_STATUS,
      legacyIdentityMigrationEligible: false,
      resultSummary: asJson(nextSummary),
    },
  });
  if (jobUpdate.count !== 1) {
    throw new AffiliateExistingDataRepairAdmissionError('MAPPING_JOB_CAS_FAILED', `Mapping job ${currentJob.id} changed during correction.`);
  }
  await requiredWriteDelegateMethod(db, 'affiliateAgentGatewayEvents', 'create')({
    data: {
      id: createId(),
      eventKey: `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${gateway.id}:created`,
      jobId: gateway.id,
      claimId: null,
      receiptId: null,
      sequence: 1,
      eventType: 'JOB_CREATED',
      actorKind: 'OPERATOR',
      actorId: operatorId,
      role: 'MAPPING_PRODUCER',
      requestHash: reportHash,
      inputHash: plan.row.stateFingerprint,
      outputHash: reportHash,
      reasonCodes: ['EXISTING_DATA_REPAIR_CORRECTION'],
      payload: asJson(sourceAudit),
      retentionClass: 'INDEFINITE',
    },
  });
  for (const oldGatewayJob of plan.supersededGatewayJobs) {
    await cancelCorrectionGatewayJob(tx, oldGatewayJob, reportHash, operatorId, gateway.id);
  }
  void relations;
  void currentRelations;
  return {
    jobId: gateway.id,
    mappingJobId: currentJob.id,
    sourceId: source.id,
    supplySourceId: root.id,
  };
};

export const applyAffiliateExistingDataRepairCorrection = async (
  input: ApplyAffiliateExistingDataRepairCorrectionInput,
): Promise<AffiliateExistingDataRepairCorrectionApplyReport> => {
  const validated = validateInput(input);
  const parsedBundle = parseBundle(input.bundle);
  const expectedHash = normalizeHash(input.expectedReportHash);
  if (!expectedHash) {
    throw new AffiliateExistingDataRepairAdmissionError(
      'INVALID_REPORT_HASH',
      'expectedReportHash must be a SHA-256 hash.',
    );
  }
  const transaction = transactionFor(input.prisma) as unknown as ((
    callback: (tx: Client) => Promise<AffiliateExistingDataRepairCorrectionApplyReport>,
    options?: unknown,
  ) => Promise<AffiliateExistingDataRepairCorrectionApplyReport>) | null;
  const execute = async (tx: Client): Promise<AffiliateExistingDataRepairCorrectionApplyReport> => {
    if (!await tryLockAffiliateRepairWrites(tx)) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'ACTIVE_SOURCE_ACTIVITY',
        'Existing-data repair correction is blocked while ordinary affiliate source activity is in progress.',
      );
    }
    await assertActiveContract(tx, parsedBundle);
    await assertNoGlobalActiveGatewayClaims(tx);
    await assertNoUnresolvedGatewayEffects(tx);
    const replay = await correctionReplay(tx, input, parsedBundle, expectedHash);
    if (replay) return replay;
    const current = await buildCorrectionReport(tx, input, parsedBundle, 'APPLY');
    if (current.report.reportHash !== expectedHash) {
      throw new AffiliateExistingDataRepairAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The reviewed existing-data repair correction report no longer matches current state.',
        { expectedReportHash: expectedHash, observedReportHash: current.report.reportHash },
      );
    }
    const appliedJobs: AffiliateExistingDataRepairAppliedJob[] = [];
    for (const plan of current.plans) {
      const relations = current.relationsByMappingJobId.get(plan.job.id);
      if (!relations) {
        throw new AffiliateExistingDataRepairAdmissionError(
          'CLAIM_DRIFT',
          `Prior Gateway relation state for ${plan.job.id} is unavailable.`,
        );
      }
      appliedJobs.push(await applyCorrectionPlan(
        tx,
        plan,
        current.report,
        expectedHash,
        validated.operatorId,
        validated.reason,
        parsedBundle,
        validated.jobIds,
        validated.sourceIds,
        validated.limit,
        relations,
      ));
    }
    const appliedByMappingJobId = new Map(appliedJobs.map((job) => [job.mappingJobId, job]));
    return {
      ...current.report,
      mode: 'APPLY',
      reviewedReportHash: expectedHash,
      writeCount: appliedJobs.length,
      appliedJobs,
      replayed: false,
      rows: current.report.rows.map((row) => {
        const applied = row.mappingJobId ? appliedByMappingJobId.get(row.mappingJobId) : undefined;
        return applied
          ? {
            ...row,
            outcome: 'APPLIED' as const,
            gatewayJobId: applied.jobId,
            sourceId: applied.sourceId,
            supplySourceId: applied.supplySourceId,
            rootId: applied.supplySourceId,
          }
          : row;
      }),
    };
  };
  if (transaction) {
    return transaction((tx: Client) => execute(tx), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    });
  }
  return execute(input.prisma as unknown as Client);
};

export const calculateAffiliateExistingDataRepairCorrectionReportHash = (
  report: Pick<
    AffiliateExistingDataRepairCorrectionReport,
    'contractVersion'
    | 'contractHash'
    | 'reason'
    | 'operatorId'
    | 'requestedJobIds'
    | 'requestedSourceIds'
    | 'evidenceSelections'
    | 'selectionLimit'
    | 'counts'
    | 'selectedJobIds'
    | 'rows'
    | 'proposedWrites'
    | 'supersededMappingIds'
    | 'supersededGatewayJobIds'
    | 'priorStates'
  >,
): string => correctionReportHashFor(report);

const assertCorrectionAdmissionAudit = async (
  db: AnyDelegate,
  originJob: GatewayJobRow,
  originManifest: AffiliateAgentEvidenceManifest,
  originNode: CompletedGatewayNode | null,
  context: AffiliateAgentExistingDataRepairContext,
  mappingJob: MappingJobRow,
  source: SourceRow,
  root: RootRow,
): Promise<void> => {
  const contextRecord = context as unknown as JsonRecord;
  const correction = recordValue(contextRecord.correction);
  const priorAdmissionHash = normalizeHash(correction.priorAdmissionHash);
  const priorPendingMappingHash = normalizeHash(correction.priorPendingMappingHash);
  const originJobId = text(originJob.id);
  if (!priorAdmissionHash || !priorPendingMappingHash || !originJobId) {
    bindingError('The correction context does not contain immutable prior admission links.');
  }
  const sourceMetadata = recordValue(source.metadata);
  const rootMetadata = recordValue(root.metadata);
  const sourceHold = affiliateExistingDataRepairCorrectionHoldSchema.safeParse(
    sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY],
  );
  const rootHold = affiliateExistingDataRepairCorrectionHoldSchema.safeParse(
    rootMetadata[AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY],
  );
  const sourcePending = pendingMappingForMetadata(sourceMetadata);
  const rootPending = pendingMappingForMetadata(rootMetadata);
  const holdPresent = hasOwn(sourceMetadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY)
    || hasOwn(rootMetadata, AFFILIATE_EXISTING_DATA_REPAIR_CORRECTION_HOLD_METADATA_KEY);
  if (holdPresent) {
    if (
      !sourceHold.success
      || !rootHold.success
      || !sameValue(sourceHold.data, rootHold.data)
      || sourceHold.data.sourceId !== source.id
      || sourceHold.data.supplySourceId !== root.id
      || sourceHold.data.mappingJobId !== mappingJob.id
      || normalizeHash(sourceHold.data.admissionHash) !== context.admissionHash
      || normalizeHash(sourceHold.data.priorPendingMappingHash) !== priorPendingMappingHash
      || hasOwn(sourceMetadata, AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY)
      || hasOwn(rootMetadata, AFFILIATE_EXISTING_DATA_REPAIR_PENDING_MAPPING_METADATA_KEY)
    ) {
      bindingError('The correction hold is not bound to the current repair context.');
    }
  } else if (!sourcePending || !rootPending || !sameValue(sourcePending, rootPending)
    || sourcePending.admissionHash !== context.admissionHash
    || sourcePending.mappingJobId !== mappingJob.id
    || sourcePending.sourceId !== source.id
    || sourcePending.supplySourceId !== root.id) {
    bindingError('A correction requires its hold or a new pending mapping bound to the current admission.');
  }
  const sourceAudit = recordValue(sourceMetadata[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  const rootAudit = recordValue(rootMetadata[AFFILIATE_EXISTING_DATA_REPAIR_ADMISSION_METADATA_KEY]);
  const report = recordValue(sourceAudit.reportSnapshot);
  const reportRows = Array.isArray(report.rows) ? report.rows.map(recordValue) : [];
  const reportWrites = Array.isArray(report.proposedWrites) ? report.proposedWrites.map(recordValue) : [];
  const priorStates = correctionPriorStatesFromReport(report);
  const reportSelectedJobIds = stringArray(report.selectedJobIds);
  const recomputed = (
    reportSelectedJobIds
    && report.counts
    && report.operation === 'CORRECTION'
    && reportRows.length > 0
    && reportWrites.length > 0
  )
    ? correctionReportHashFor({
      contractVersion: Number(report.contractVersion),
      contractHash: String(report.contractHash ?? ''),
      reason: String(report.reason ?? ''),
      operatorId: String(report.operatorId ?? ''),
      requestedJobIds: report.requestedJobIds === null ? null : stringArray(report.requestedJobIds) ?? [],
      requestedSourceIds: report.requestedSourceIds === null ? null : stringArray(report.requestedSourceIds) ?? [],
      evidenceSelections: Array.isArray(report.evidenceSelections)
        ? report.evidenceSelections as ExistingDataRepairEvidenceSelection[]
        : null,
      selectionLimit: Number(report.selectionLimit),
      counts: recordValue(report.counts) as unknown as AffiliateExistingDataRepairAdmissionCounts,
      selectedJobIds: reportSelectedJobIds,
      rows: reportRows as unknown as AffiliateExistingDataRepairAdmissionRow[],
      proposedWrites: reportWrites as unknown as AffiliateExistingDataRepairAdmissionWrite[],
      supersededMappingIds: Array.isArray(report.supersededMappingIds)
        ? report.supersededMappingIds.filter((value): value is string => typeof value === 'string')
        : [],
      supersededGatewayJobIds: Array.isArray(report.supersededGatewayJobIds)
        ? report.supersededGatewayJobIds.filter((value): value is string => typeof value === 'string')
        : [],
      priorStates,
    })
    : null;
  const priorState = priorStates.find((candidate) => candidate.mappingJobId === mappingJob.id);
  const priorHistory = admissionHistory(mappingJob.resultSummary).filter((entry) => (
    normalizeHash(entry.reportHash) === priorAdmissionHash
    && text(entry.mappingJobId) === mappingJob.id
    && sameValue(entry.repairContext, priorState?.context)
  ));
  const currentHistory = admissionHistory(mappingJob.resultSummary).filter((entry) => (
    entry.operation === 'CORRECTION'
    && normalizeHash(entry.reportHash) === context.admissionHash
    && text(entry.mappingJobId) === mappingJob.id
    && text(entry.gatewayJobId) === originJobId
    && sameValue(entry.repairContext, context)
  ));
  const priorHistoryReferenceValid = Boolean(
    priorState
      && priorHistory.length === 1
      && normalizeHash(priorState.admissionAuditReference.reportHash) === normalizeHash(priorHistory[0]?.reportHash)
      && text(priorState.admissionAuditReference.gatewayJobId) === text(priorHistory[0]?.gatewayJobId)
      && hash(priorHistory[0]) === priorState.admissionAuditReference.auditHash,
  );
  const created = recordValue(sourceAudit.createdIds);
  const events = await delegateRows<JsonRecord>(db.affiliateAgentGatewayEvents, {
    where: { jobId: originJobId, eventType: 'JOB_CREATED' },
    orderBy: { id: 'asc' },
    take: 2,
  });
  const event = events.length === 1 ? events[0]! : null;
  if (
    sourceAudit.operation !== 'CORRECTION'
    || !sameValue(sourceAudit, rootAudit)
    || normalizeHash(sourceAudit.reportHash) !== context.admissionHash
    || !sameValue(sourceAudit.repairContext, context)
    || !sameValue(recordValue(report).operation, 'CORRECTION')
    || report.mode !== 'APPLY'
    || report.reviewedReportHash !== null
    || report.replayed !== false
    || Number(report.writeCount) !== reportSelectedJobIds?.length
    || !Array.isArray(report.appliedJobs)
    || report.appliedJobs.length !== 0
    || recomputed !== context.admissionHash
    || !priorState
    || priorState.admissionAuditReference.mappingJobId !== mappingJob.id
    || priorState.admissionAuditReference.reportHash !== priorAdmissionHash
    || priorState.pendingMappingHash !== priorPendingMappingHash
    || priorHistory.length !== 1
    || !priorHistoryReferenceValid
    || currentHistory.length !== 1
    || !sameValue(currentHistory[0], sourceAudit)
    || text(sourceAudit.gatewayJobId) !== originJobId
    || text(created.gatewayJobId) !== originJobId
    || text(created.mappingJobId) !== mappingJob.id
    || text(created.sourceId) !== source.id
    || text(created.supplySourceId) !== root.id
    || !sameValue(originJob.evidenceManifestJson, originManifest)
    || !sameValue(recordValue(originJob.subjectJson).repairContext, context)
    || (originNode && (
      originNode.job.id !== originJob.id
      || originNode.claim.parentClaimId !== null
    ))
    || !event
    || text(event.eventKey) !== `${AFFILIATE_EXISTING_REPAIR_PRODUCER_PREFIX}${originJobId}:created`
    || Number(event.sequence) !== 1
    || upper(event.actorKind) !== 'OPERATOR'
    || text(event.actorId) !== text(sourceAudit.operatorId)
    || normalizeHash(event.requestHash) !== context.admissionHash
    || normalizeHash(event.outputHash) !== context.admissionHash
    || !sameValue(event.payload, sourceAudit)
    || !sameValue(event.reasonCodes, ['EXISTING_DATA_REPAIR_CORRECTION'])
  ) {
    bindingError('The correction admission audit is not bound to the immutable correction proof.');
  }
};
