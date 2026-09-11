import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createId } from '@/lib/id';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  AFFILIATE_AGENT_SOURCE_EXCLUSION_REVIEWER_PREFIX,
  affiliateAgentClaimEnvelopeSchema,
  affiliateAgentContractBundleSchema,
  affiliateAgentEvidenceManifestSchema,
  affiliateAgentLegacySportRepairContextSchema,
  affiliateAgentHistoricalMappingProducerSubjectSchema,
  affiliateAgentSourceExclusionReviewerSubjectSchema,
  affiliateAgentTerminalResultEnvelopeSchema,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  type AffiliateAgentClaimEnvelope,
  type AffiliateAgentContractBundle,
  type AffiliateAgentEvidenceManifest,
  type AffiliateAgentHistoricalMappingProducerSubject,
  type AffiliateAgentProducerClaimEnvelopeForHistoricalRead,
  type AffiliateAgentSourceExclusionReviewerSubject,
  type AffiliateAgentTerminalResultEnvelope,
} from './agentGatewayContracts';
import type { AffiliateAgentArtifactStore } from './agentGatewayAdapters';
import {
  buildAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import { isAffiliateSportBlacklisted } from './affiliateSportMapping';
import { hasPublicAffiliateCandidate } from './affiliateSourcePublicationSafety';
import {
  normalizeAffiliateSupplyIdentity,
  type AffiliateSupplyIdentity,
} from './affiliateSupplyLifecycle';
import {
  affiliateSupplyDatabase,
  loadActiveAffiliateSupplyContract,
} from './affiliateSupplyPersistence';


type MappingProducerGapResult = Extract<AffiliateAgentTerminalResultEnvelope, { role: 'MAPPING_PRODUCER'; disposition: 'CONTRACT_GAP' }>;
type HistoricalProducerEnvelope = AffiliateAgentProducerClaimEnvelopeForHistoricalRead;

export const AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION = 1 as const;
export const AFFILIATE_SOURCE_EXCLUSION_ADMISSION_MAX_REASON_BYTES = 1_000;
export const AFFILIATE_SOURCE_EXCLUSION_ADMISSION_MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
export const AFFILIATE_SOURCE_EXCLUSION_ADMISSION_READ_BATCH_SIZE = 500;

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const SOURCE_EXCLUSION_OPERATION = 'SOURCE_EXCLUSION_ADMISSION';
const SOURCE_EXCLUSION_AUDIT_KIND = 'SOURCE_EXCLUSION_ADMISSION';
const PAGE_KINDS: Record<string, true> = {
  PAGE_HTML: true,
  PAGE_MARKDOWN: true,
  PAGE_SCREENSHOT: true,
};
const PUBLIC_SOURCE_STATUSES: Record<string, true> = {
  PUBLIC: true,
  PUBLISHED: true,
  LISTED: true,
  ACTIVE_PUBLIC: true,
};
const PUBLIC_TARGET_STATUSES: Record<string, true> = {
  PUBLISHED: true,
  ACTIVE: true,
  LAST_KNOWN_GOOD: true,
  PUBLIC: true,
  LISTED: true,
};
const PENDING_SOURCE_EXCLUSION_JOB_STATUSES: Record<string, true> = {
  QUEUED: true,
  CLAIMED: true,
  RETRY_WAIT: true,
  RECONCILIATION_REQUIRED: true,
};
const ACTIVE_SOURCE_JOB_STATUSES: Record<string, true> = {
  QUEUED: true,
  CLAIMED: true,
  REVIEW_REQUIRED: true,
};
const ALLOWED_PARENT_MAPPING_JOB_STATUSES: Record<string, true> = {
  REVIEW_REQUIRED: true,
  COMPLETED: true,
  CONTRACT_GAP: true,
};
const MAX_REPORT_STRING_BYTES = 2_000;

type JsonRecord = Record<string, unknown>;
type AdmissionClient = PrismaClient | Prisma.TransactionClient;

type QueryDelegate = {
  findUnique?: (args: Record<string, unknown>) => Promise<unknown>;
  findMany?: (args: Record<string, unknown>) => Promise<unknown>;
  create?: (args: Record<string, unknown>) => Promise<unknown>;
};

type GatewayJobRow = JsonRecord;
type GatewayClaimRow = JsonRecord;
type GatewayReceiptRow = JsonRecord;
type GatewayEventRow = JsonRecord;
type MappingJobRow = JsonRecord;
type IntakeRow = JsonRecord;
type SourceRow = JsonRecord;
type MappingRow = JsonRecord;
type RootRow = JsonRecord;
type RunRow = JsonRecord;
type PageRow = JsonRecord;
type ArtifactRow = JsonRecord;
type FileRow = JsonRecord;
type OrganizationRow = JsonRecord;
type CandidateRow = JsonRecord;
type TargetRow = JsonRecord;

type AdmissionParent = Readonly<{
  job: GatewayJobRow;
  claim: GatewayClaimRow;
  receipt: GatewayReceiptRow;
  envelope: HistoricalProducerEnvelope | null;
  subject: AffiliateAgentHistoricalMappingProducerSubject;
  result: MappingProducerGapResult;
  sportEvidence: JsonRecord;
  manifest: AffiliateAgentEvidenceManifest;
  mappingJob: MappingJobRow;
  intake: IntakeRow;
  source: SourceRow;
  mapping: MappingRow | null;
  root: RootRow;
  run: RunRow;
  pages: readonly PageRow[];
  artifacts: readonly ArtifactRow[];
  files: readonly FileRow[];
  organizations: readonly OrganizationRow[];
  candidates: readonly CandidateRow[];
  targets: readonly TargetRow[];
  sourceJobs: readonly MappingJobRow[];
  reviewerJobs: readonly GatewayJobRow[];
  reviewerAudits: readonly GatewayEventRow[];
  activeClaims: readonly GatewayClaimRow[];
  activePointers: readonly GatewayJobRow[];
  currentCatalog: AffiliateSportsCatalogSnapshot;
  activeContract: Readonly<{
    manifest: JsonRecord;
    policy: JsonRecord;
  }>;
  identity: AffiliateSupplyIdentity;
  pageEntries: readonly AffiliateAgentEvidenceManifest['entries'][number][];
  requestHash: string;
  dedupeKey: string;
}>;

type AdmissionInspection = Readonly<{
  gatewayJobId: string;
  requestedReason: string;
  reasons: readonly string[];
  parent: AdmissionParent | null;
  root: RootRow | null;
  currentCatalog: AffiliateSportsCatalogSnapshot | null;
  activeContract: Readonly<{ manifest: JsonRecord; policy: JsonRecord }> | null;
  reviewerJobs: readonly GatewayJobRow[];
  reviewerAudits: readonly GatewayEventRow[];
  activeClaims: readonly GatewayClaimRow[];
  activePointers: readonly GatewayJobRow[];
  proposedSubject: AffiliateAgentSourceExclusionReviewerSubject | null;
  reviewerManifest: AffiliateAgentEvidenceManifest | null;
  requestHash: string | null;
  dedupeKey: string | null;
  expectedLifecycleGeneration: number | null;
  stateFingerprint: string;
}>;

type AdmissionPlan = Readonly<{
  parent: AdmissionParent;
  subject: AffiliateAgentSourceExclusionReviewerSubject;
  manifest: AffiliateAgentEvidenceManifest;
  requestHash: string;
  dedupeKey: string;
  stateFingerprint: string;
}>;

export type AffiliateSourceExclusionAdmissionErrorDetails = Readonly<Record<string, unknown>>;

export class AffiliateSourceExclusionAdmissionError extends Error {
  readonly code: string;
  readonly details: AffiliateSourceExclusionAdmissionErrorDetails;

  constructor(
    code: string,
    message: string,
    details: AffiliateSourceExclusionAdmissionErrorDetails = {},
  ) {
    super(message);
    this.name = 'AffiliateSourceExclusionAdmissionError';
    this.code = code;
    this.details = details;
  }
}

export type AffiliateSourceExclusionAdmissionReport = Readonly<{
  schemaVersion: 1;
  mode: 'PREVIEW' | 'APPLY';
  evaluatedAt: string;
  reason: string;
  reportHash: string;
  eligible: boolean;
  reasonCodes: readonly string[];
  gatewayJobId: string;
  supplySourceId: string | null;
  proposedReviewerSubject: AffiliateAgentSourceExclusionReviewerSubject | null;
  proposedReviewerManifest: AffiliateAgentEvidenceManifest | null;
  expectedLifecycleGeneration: number | null;
  replayed: boolean;
  writeCount: number;
  reviewerJobId: string | null;
}>;

export type AffiliateSourceExclusionAdmissionPreview = AffiliateSourceExclusionAdmissionReport & {
  mode: 'PREVIEW';
};

export type AffiliateSourceExclusionAdmissionApplyReport = AffiliateSourceExclusionAdmissionReport & {
  mode: 'APPLY';
};

export type PreviewAffiliateSourceExclusionAdmissionInput = Readonly<{
  prisma: PrismaClient;
  artifactStore: AffiliateAgentArtifactStore;
  bundle: AffiliateAgentContractBundle;
  gatewayJobId: string;
  reason: string;
  operatorId: string;
}>;

export type ApplyAffiliateSourceExclusionAdmissionInput = Readonly<{
  prisma: PrismaClient;
  artifactStore: AffiliateAgentArtifactStore;
  bundle: AffiliateAgentContractBundle;
  gatewayJobId: string;
  reason: string;
  expectedReportHash: string;
  operatorId: string;
}>;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const normalizedUpper = (value: unknown): string => String(value ?? '').trim().toUpperCase();

const normalizeHash = (value: unknown): string | null => {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value.trim())) return null;
  return value.trim().toLowerCase();
};

const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
)).sort();

const sameValue = (left: unknown, right: unknown): boolean => (
  hashAffiliateAgentValue(normalizeForHash(left) ?? null)
  === hashAffiliateAgentValue(normalizeForHash(right) ?? null)
);

const normalizeForHash = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .flatMap(([key, nested]) => {
        const normalized = normalizeForHash(nested);
        return normalized === undefined ? [] : [[key, normalized]];
      }));
  }
  return undefined;
};

const stableCatalog = (catalog: AffiliateSportsCatalogSnapshot | null): unknown => catalog
  ? {
    schemaVersion: catalog.schemaVersion,
    sha256: catalog.sha256,
    sports: catalog.sports,
  }
  : null;

const stableRepairContext = (context: unknown): unknown => {
  const parsed = recordValue(context);
  return {
    kind: parsed.kind,
    intakeId: parsed.intakeId,
    evidenceRunId: parsed.evidenceRunId,
    sportsCatalog: stableCatalog(parsed.sportsCatalog as AffiliateSportsCatalogSnapshot | null),
  };
};

const stableSubject = (subject: AffiliateAgentSourceExclusionReviewerSubject | null): unknown => {
  if (!subject) return null;
  return {
    ...subject,
    repairContext: stableRepairContext(subject.repairContext),
  };
};

const delegateFor = (client: AdmissionClient, model: string): QueryDelegate => (
  (client as unknown as Record<string, unknown>)[model] as QueryDelegate | undefined ?? {}
);

const readUnique = async (
  client: AdmissionClient,
  model: string,
  args: Record<string, unknown>,
): Promise<JsonRecord | null> => {
  const delegate = delegateFor(client, model);
  if (typeof delegate.findUnique !== 'function') {
    throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_UNAVAILABLE', `The ${model}.findUnique delegate is required.`);
  }
  const row = await delegate.findUnique(args);
  if (row === null || row === undefined) return null;
  if (typeof row !== 'object' || Array.isArray(row) || !stringValue((row as JsonRecord).id)) {
    throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', `The ${model}.findUnique delegate returned a malformed row.`);
  }
  return row as JsonRecord;
};

const readMany = async (
  client: AdmissionClient,
  model: string,
  args: Record<string, unknown> = {},
): Promise<JsonRecord[]> => {
  const delegate = delegateFor(client, model);
  if (typeof delegate.findMany !== 'function') {
    throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_UNAVAILABLE', `The ${model}.findMany delegate is required.`);
  }
  const rows = await delegate.findMany(args);
  if (!Array.isArray(rows)) {
    throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', `The ${model}.findMany delegate returned an invalid collection.`);
  }
  if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', `The ${model}.findMany delegate returned a malformed row.`);
  }
  if (rows.some((row) => !stringValue((row as JsonRecord).id))) {
    throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', `The ${model}.findMany delegate returned a row without a nonblank id.`);
  }
  return rows as JsonRecord[];
};

const readBatched = async (
  client: AdmissionClient,
  model: string,
  where: Record<string, unknown>,
  select?: Record<string, unknown>,
): Promise<JsonRecord[]> => {
  const output: JsonRecord[] = [];
  const seen = new Set<string>();
  let skip = 0;
  while (true) {
    const rows = await readMany(client, model, {
      where,
      ...(select ? { select } : {}),
      orderBy: { id: 'asc' },
      skip,
      take: AFFILIATE_SOURCE_EXCLUSION_ADMISSION_READ_BATCH_SIZE,
    });
    for (const row of rows) {
      const id = stringValue(row.id);
      if (!id) {
        throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', `The ${model}.findMany delegate returned a row without a nonblank id.`);
      }
      if (seen.has(id)) {
        throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', `The ${model}.findMany delegate returned a duplicate id.`);
      }
      seen.add(id);
      output.push(row);
    }
    if (rows.length < AFFILIATE_SOURCE_EXCLUSION_ADMISSION_READ_BATCH_SIZE) break;
    skip += rows.length;
  }
  return output;
};


const compareIds = (left: JsonRecord, right: JsonRecord): number => {
  const leftId = stringValue(left.id) ?? '';
  const rightId = stringValue(right.id) ?? '';
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};

const asPrismaJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const reasonText = (value: unknown): string => {
  const reason = stringValue(value);
  if (!reason) throw new AffiliateSourceExclusionAdmissionError('REASON_REQUIRED', 'A bounded source exclusion reason is required.');
  if (Buffer.byteLength(reason, 'utf8') > AFFILIATE_SOURCE_EXCLUSION_ADMISSION_MAX_REASON_BYTES) {
    throw new AffiliateSourceExclusionAdmissionError('REASON_TOO_LONG', 'The source exclusion reason exceeds the bounded size limit.');
  }
  return reason;
};

const gatewayJobIdText = (value: unknown): string => {
  const id = stringValue(value);
  if (!id) throw new AffiliateSourceExclusionAdmissionError('GATEWAY_JOB_REQUIRED', 'gatewayJobId is required.');
  if (Buffer.byteLength(id, 'utf8') > MAX_REPORT_STRING_BYTES) {
    throw new AffiliateSourceExclusionAdmissionError('GATEWAY_JOB_INVALID', 'gatewayJobId is too long.');
  }
  return id;
};

const operatorIdText = (value: unknown): string => {
  const id = stringValue(value);
  if (!id) throw new AffiliateSourceExclusionAdmissionError('OPERATOR_REQUIRED', 'operatorId is required for source exclusion admission apply.');
  if (Buffer.byteLength(id, 'utf8') > MAX_REPORT_STRING_BYTES) {
    throw new AffiliateSourceExclusionAdmissionError('OPERATOR_INVALID', 'operatorId is too long.');
  }
  return id;
};

const expectedHashText = (value: unknown): string => {
  const hash = normalizeHash(value);
  if (!hash) throw new AffiliateSourceExclusionAdmissionError('REPORT_HASH_REQUIRED', 'expectedReportHash must be a SHA-256 hash.');
  return hash;
};

const parsedBundle = (bundle: AffiliateAgentContractBundle): AffiliateAgentContractBundle => {
  const parsed = affiliateAgentContractBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    throw new AffiliateSourceExclusionAdmissionError(
      'INVALID_CONTRACT_BUNDLE',
      `The active Affiliate Agent contract bundle is invalid: ${parsed.error.message}`,
    );
  }
  return parsed.data;
};

const contractCohort = (bundle: AffiliateAgentContractBundle): string =>
  stringValue(recordValue(bundle.supplyContract).rolloutCohort) ?? 'DEFAULT';

const currentCatalogFor = async (client: AdmissionClient): Promise<AffiliateSportsCatalogSnapshot> => {
  const rows = await readMany(client, 'sports', { select: { id: true, name: true } });
  try {
    const catalogRows = rows.map((row, index) => {
      const id = stringValue(row.id);
      const name = stringValue(row.name);
      if (!id || !name) {
        throw new AffiliateSourceExclusionAdmissionError(
          'CURRENT_CATALOG_INVALID',
          `The current sports catalog row ${index} has a blank id or name.`,
        );
      }
      return { id, name };
    });
    return buildAffiliateSportsCatalogSnapshot(catalogRows, new Date().toISOString());
  } catch (error) {
    if (error instanceof AffiliateSourceExclusionAdmissionError) throw error;
    throw new AffiliateSourceExclusionAdmissionError(
      'CURRENT_CATALOG_INVALID',
      error instanceof Error ? error.message : 'The current sports catalog is invalid.',
    );
  }
};

const activeContractFor = async (
  client: AdmissionClient,
  rolloutCohort: string | undefined,
): Promise<Readonly<{ manifest: JsonRecord; policy: JsonRecord }>> => {
  try {
    const active = await loadActiveAffiliateSupplyContract({
      db: affiliateSupplyDatabase(client),
      rolloutCohort,
    });
    return {
      manifest: active.manifest as unknown as JsonRecord,
      policy: active.policy as unknown as JsonRecord,
    };
  } catch (error) {
    throw new AffiliateSourceExclusionAdmissionError(
      'ACTIVE_CONTRACT_UNAVAILABLE',
      error instanceof Error ? error.message : 'The active Supply Contract is unavailable.',
    );
  }
};

const activeContractMatchesBundle = (
  active: Readonly<{ manifest: JsonRecord; policy: JsonRecord }> | null,
  bundle: AffiliateAgentContractBundle,
): boolean => {
  if (!active) return false;
  const policy = active.policy;
  const manifest = active.manifest;
  return (
    normalizedUpper(manifest.status) === 'ACTIVE'
    && Number(manifest.version) === bundle.supplyContract.version
    && stringValue(manifest.rolloutCohort) === contractCohort(bundle)
    && Number(policy.version) === bundle.supplyContract.version
    && stringValue(policy.rolloutCohort) === contractCohort(bundle)
    && normalizeHash(policy.hash) === bundle.supplyContract.hash.toLowerCase()
    && normalizeHash(manifest.hash) !== null
  );
};

const contractArtifactEntryFor = (
  bundle: AffiliateAgentContractBundle,
): AffiliateAgentEvidenceManifest['entries'][number] => {
  const { hash, ...contractPreimage } = bundle.supplyContract;
  const contractHash = hashAffiliateAgentValue(contractPreimage);
  if (contractHash !== hash.toLowerCase()) {
    throw new AffiliateSourceExclusionAdmissionError(
      'ACTIVE_CONTRACT_INVALID',
      'The Supply Contract self-hash is invalid.',
    );
  }
  const bytes = Buffer.from(canonicalizeAffiliateAgentValue(contractPreimage), 'utf8');
  return {
    evidenceRef: 'active-contract',
    kind: 'ACTIVE_SUPPLY_CONTRACT',
    artifactId: `supply-contract:${hash.toLowerCase()}`,
    sha256: hash.toLowerCase(),
    mimeType: 'application/json',
    byteSize: bytes.byteLength,
    retention: 'INDEFINITE',
  };
};

const reviewerManifestFor = (
  pageEntries: readonly AffiliateAgentEvidenceManifest['entries'][number][],
  bundle: AffiliateAgentContractBundle,
): AffiliateAgentEvidenceManifest => {
  const entries = [
    ...pageEntries,
    contractArtifactEntryFor(bundle),
  ].sort((left, right) => left.evidenceRef < right.evidenceRef ? -1 : left.evidenceRef > right.evidenceRef ? 1 : 0);
  if (new Set(entries.map((entry) => entry.evidenceRef)).size !== entries.length) {
    throw new AffiliateSourceExclusionAdmissionError('EVIDENCE_MANIFEST_CONFLICT', 'The source exclusion evidence references are not unique.');
  }
  const preimage = { schemaVersion: 1 as const, entries };
  const manifest = {
    ...preimage,
    hash: hashAffiliateAgentValue(preimage),
  };
  const parsed = affiliateAgentEvidenceManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new AffiliateSourceExclusionAdmissionError(
      'INVALID_EVIDENCE_MANIFEST',
      `The source exclusion evidence manifest is invalid: ${parsed.error.message}`,
    );
  }
  return parsed.data;
};

const requestHashFor = (input: Readonly<{
  gatewayJobId: string;
  supplySourceId: string;
  producerClaimId: string;
  producerResultHash: string;
  reason: string;
  requestedByActorId: string;
}>): string => hashAffiliateAgentValue({
  schemaVersion: AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION,
  operation: SOURCE_EXCLUSION_OPERATION,
  gatewayJobId: input.gatewayJobId,
  supplySourceId: input.supplySourceId,
  producerClaimId: input.producerClaimId,
  producerResultHash: input.producerResultHash,
  reason: input.reason,
  requestedByActorId: input.requestedByActorId,
});

const dedupeKeyFor = (supplySourceId: string, requestHash: string): string => (
  `${AFFILIATE_AGENT_SOURCE_EXCLUSION_REVIEWER_PREFIX}${supplySourceId}:${requestHash}`
);

const subjectFor = (
  parent: AdmissionParent,
  reason: string,
  requestedByActorId: string,
): AffiliateAgentSourceExclusionReviewerSubject => affiliateAgentSourceExclusionReviewerSubjectSchema.parse({
  type: 'SOURCE_EXCLUSION_REVIEW',
  supplySourceId: String(parent.root.id),
  producerClaimId: String(parent.claim.id),
  producerWorkerId: String(parent.claim.workerId),
  producerInvocationId: String(parent.claim.invocationId),
  producerWorkspaceId: String(parent.claim.workspaceId),
  producerResultHash: normalizeHash(parent.job.resultHash) ?? hashAffiliateAgentValue(parent.result),
  requestHash: parent.requestHash,
  requestedByActorId,
  requestReason: reason,
  repairContext: {
    kind: 'LEGACY_SPORT_REPAIR',
    intakeId: String(parent.intake.id),
    evidenceRunId: String(recordValue(parent.subject.repairContext).evidenceRunId),
    sportsCatalog: parent.currentCatalog,
  },
});

const sourceHoldReason = (source: SourceRow | null): string | null => {
  if (!source) return null;
  const review = recordValue(recordValue(source.metadata).automationReviewRequired);
  return review.hold === true ? stringValue(review.reason) : null;
};

const rootHoldReason = (root: RootRow | null): string | null => {
  if (!root) return null;
  const explicit = stringValue(root.automationHoldReason);
  if (explicit) return explicit;
  const review = recordValue(recordValue(root.metadata).automationReviewRequired);
  return review.hold === true ? stringValue(review.reason) : null;
};

const urlOrigin = (value: unknown): string | null => {
  const url = stringValue(value);
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

const sourceIdentityFor = (
  source: SourceRow,
  intake: IntakeRow,
): AffiliateSupplyIdentity | null => {
  const url = stringValue(source.listUrl) ?? stringValue(source.baseUrl) ?? stringValue(intake.baseUrl);
  if (!url) return null;
  try {
    return normalizeAffiliateSupplyIdentity({
      requestedUrl: url,
      resolvedCanonicalUrl: url,
      operatorDomain: new URL(url).hostname,
    });
  } catch {
    return null;
  }
};

const pageEntryArtifactId = (entry: AffiliateAgentEvidenceManifest['entries'][number]): string | null => {
  const artifactId = entry.artifactId;
  return artifactId.startsWith('intake-artifact:')
    ? artifactId.slice('intake-artifact:'.length)
    : null;
};

const artifactExpectedMime = (artifact: ArtifactRow, file: FileRow): string | null => (
  stringValue(artifact.mimeType) ?? stringValue(file.mimeType)
);

const artifactExpectedSize = (artifact: ArtifactRow, file: FileRow): number | null => {
  const value = artifact.sizeBytes ?? file.sizeBytes;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
};

const artifactExpectedHash = (artifact: ArtifactRow): string | null => normalizeHash(artifact.contentHash);

const verifyImmutableArtifact = async (
  artifactStore: AffiliateAgentArtifactStore,
  entry: AffiliateAgentEvidenceManifest['entries'][number],
  artifact: ArtifactRow | null,
  file: FileRow | null,
  expectedIntakeId: string,
  expectedRunId: string,
  ownedOrigins: ReadonlySet<string>,
  reasons: string[],
): Promise<void> => {
  if (entry.kind === 'ACTIVE_SUPPLY_CONTRACT') {
    try {
      const read = await artifactStore.readImmutable({
        fileId: entry.artifactId,
        maximumBytes: AFFILIATE_SOURCE_EXCLUSION_ADMISSION_MAX_ARTIFACT_BYTES,
      });
      const hash = createHash('sha256').update(read.bytes).digest('hex');
      if (
        read.byteSize !== entry.byteSize
        || read.bytes.byteLength !== entry.byteSize
        || read.mimeType !== entry.mimeType
        || hash !== entry.sha256.toLowerCase()
      ) reasons.push('ACTIVE_CONTRACT_ARTIFACT_MISMATCH');
      return;
    } catch {
      reasons.push('ACTIVE_CONTRACT_ARTIFACT_UNAVAILABLE');
      return;
    }
  }
  if (!artifact || !file) {
    reasons.push(`MISSING_${entry.kind}_ARTIFACT`);
    return;
  }
  const artifactHash = artifactExpectedHash(artifact);
  const artifactMimeType = stringValue(artifact.mimeType);
  const fileMimeType = stringValue(file.mimeType);
  const artifactSize = artifactExpectedSize(artifact, file);
  const fileSize = typeof file.sizeBytes === 'number' && Number.isInteger(file.sizeBytes) && file.sizeBytes >= 0
    ? file.sizeBytes
    : null;
  const sourceUrl = stringValue(artifact.sourceUrl);
  const finalUrl = stringValue(artifact.finalUrl);
  if (normalizedUpper(artifact.kind) !== normalizedUpper(entry.kind)) reasons.push(`INVALID_${entry.kind}_KIND`);
  if (artifact.isPinned !== true) reasons.push(`EVIDENCE_NOT_PINNED_${entry.kind}`);
  if (!artifactHash || artifactHash !== entry.sha256.toLowerCase()) reasons.push(`INVALID_${entry.kind}_HASH`);
  if (!stringValue(file.path)) reasons.push(`MISSING_STORAGE_FILE_${entry.kind}`);
  if (!artifactMimeType || !fileMimeType || artifactMimeType !== entry.mimeType || fileMimeType !== entry.mimeType) {
    reasons.push(`INVALID_${entry.kind}_MIME`);
  }
  if (artifactSize === null || artifactSize !== entry.byteSize || fileSize === null || fileSize !== entry.byteSize) {
    reasons.push(`INVALID_${entry.kind}_SIZE`);
  }
  if (!sourceUrl && !finalUrl) reasons.push(`MISSING_SOURCE_URL_${entry.kind}`);
  for (const url of [sourceUrl, finalUrl].filter((value): value is string => Boolean(value))) {
    const origin = urlOrigin(url);
    if (!origin || !ownedOrigins.has(origin)) reasons.push(`SOURCE_EVIDENCE_URL_NOT_OWNED_${entry.kind}`);
  }
  try {
    const read = await artifactStore.readImmutable({
      fileId: entry.artifactId,
      maximumBytes: AFFILIATE_SOURCE_EXCLUSION_ADMISSION_MAX_ARTIFACT_BYTES,
    });
    const hash = createHash('sha256').update(read.bytes).digest('hex');
    if (
      read.byteSize !== entry.byteSize
      || read.bytes.byteLength !== entry.byteSize
      || read.mimeType !== entry.mimeType
      || hash !== entry.sha256.toLowerCase()
      || read.intakeId !== expectedIntakeId
      || read.runId !== expectedRunId
      || (read.sourceUrl ?? null) !== (artifact.sourceUrl ?? null)
      || (read.finalUrl ?? null) !== (artifact.finalUrl ?? null)
    ) reasons.push(`IMMUTABLE_${entry.kind}_MISMATCH`);
  } catch {
    reasons.push(`IMMUTABLE_${entry.kind}_UNAVAILABLE`);
  }
};

const parentResultFor = (
  job: GatewayJobRow,
): Extract<AffiliateAgentTerminalResultEnvelope, { role: 'MAPPING_PRODUCER'; disposition: 'CONTRACT_GAP' }> | null => {
  const parsed = affiliateAgentTerminalResultEnvelopeSchema.safeParse(job.resultJson);
  if (!parsed.success || parsed.data.role !== 'MAPPING_PRODUCER' || parsed.data.disposition !== 'CONTRACT_GAP') return null;
  return parsed.data;
};

const parentSportEvidenceFor = (
  result: Extract<AffiliateAgentTerminalResultEnvelope, { role: 'MAPPING_PRODUCER'; disposition: 'CONTRACT_GAP' }>,
): JsonRecord | null => {
  const payload = recordValue(result.payload);
  const evidence = recordValue(payload.sportEvidence);
  return Object.keys(evidence).length > 0 ? evidence : null;
};

const parentSportEvidenceValid = (
  result: Extract<AffiliateAgentTerminalResultEnvelope, { role: 'MAPPING_PRODUCER'; disposition: 'CONTRACT_GAP' }>,
  subject: AffiliateAgentHistoricalMappingProducerSubject,
  reasons: string[],
): JsonRecord | null => {
  if (recordValue(result.payload).contractArea !== 'MAPPING_EVIDENCE') reasons.push('PARENT_CONTRACT_AREA_INVALID');
  if (!stringValue(recordValue(result.payload).requestedChange)) reasons.push('PARENT_REQUESTED_CHANGE_MISSING');
  const evidence = parentSportEvidenceFor(result);
  if (!evidence) {
    reasons.push('PARENT_SPORT_EVIDENCE_MISSING');
    return null;
  }
  const context = affiliateAgentLegacySportRepairContextSchema.safeParse(subject.repairContext);
  if (!context.success) {
    reasons.push('PARENT_REPAIR_CONTEXT_INVALID');
  } else {
    if (evidence.evidenceRunId !== context.data.evidenceRunId) reasons.push('PARENT_EVIDENCE_RUN_MISMATCH');
    if (normalizeHash(evidence.sportsCatalogSha256) !== normalizeHash(context.data.sportsCatalog.sha256)) {
      reasons.push('PARENT_CATALOG_CONTEXT_MISMATCH');
    }
  }
  const determinations = Array.isArray(evidence.sportDeterminations) ? evidence.sportDeterminations : [];
  let hasSportReason = false;
  for (const raw of determinations) {
    const determination = recordValue(raw);
    const labels = Array.isArray(determination.sourceLabels)
      ? determination.sourceLabels.filter((value): value is string => typeof value === 'string')
      : [];
    const status = normalizedUpper(determination.status);
    const basis = normalizedUpper(determination.resolutionBasis);
    const canonicalNames = Array.isArray(determination.canonicalSportNames)
      ? determination.canonicalSportNames
      : [];
    if (labels.length === 0 || labels.some((label) => !isAffiliateSportBlacklisted(label))) reasons.push('PARENT_MIXED_OR_UNBLACKLISTED_SPORT');
    if (!['BLACKLISTED', 'UNSUPPORTED'].includes(status)) reasons.push('PARENT_SPORT_STATUS_INVALID');
    if (canonicalNames.length > 0) reasons.push('PARENT_RESOLVED_SPORT_PRESENT');
    if (basis !== 'SOURCE_EVIDENCE') reasons.push('PARENT_SPORT_EVIDENCE_NOT_SOURCE_OWNED');
    if (status === 'UNSUPPORTED') {
      hasSportReason = true;
      if (!(result.reasonCodes as readonly string[]).includes('SPORT_NOT_IN_CATALOG')) reasons.push('PARENT_SPORT_REASON_MISSING');
    }
    if (status === 'BLACKLISTED') {
      hasSportReason = true;
      if (!(result.reasonCodes as readonly string[]).includes('SPORT_BLACKLISTED')) reasons.push('PARENT_SPORT_REASON_MISSING');
    }
  }
  if (!hasSportReason) reasons.push('PARENT_SPORT_REASON_MISSING');
  if (result.reasonCodes.some((code) => code === 'SPORT_VARIANT_UNRESOLVED')) reasons.push('PARENT_VARIANT_SPORT_NOT_EXCLUDABLE');
  return evidence;
};

const parentEnvelopeValid = (
  job: GatewayJobRow,
  claim: GatewayClaimRow,
  receipt: GatewayReceiptRow | null,
  reasons: string[],
): {
  envelope: HistoricalProducerEnvelope | null;
  result: MappingProducerGapResult | null;
  manifest: AffiliateAgentEvidenceManifest | null;
} => {
  if (!stringValue(job.id) || !stringValue(claim.id)) reasons.push('PARENT_IDENTITY_MISSING');
  if (normalizedUpper(job.status) !== 'COMPLETED') reasons.push('PARENT_GATEWAY_JOB_NOT_COMPLETED');
  if (stringValue(job.activeClaimId)) reasons.push('PARENT_GATEWAY_JOB_HAS_ACTIVE_POINTER');
  if (normalizedUpper(job.role) !== 'MAPPING_PRODUCER' || normalizedUpper(job.subjectType) !== 'MAPPING_PRODUCER') reasons.push('PARENT_GATEWAY_JOB_NOT_PRODUCER');
  if (!stringValue(job.queue) || !stringValue(job.lane)) reasons.push('PARENT_GATEWAY_ROUTING_MISSING');
  if (!Number.isInteger(job.claimGeneration) || Number(job.claimGeneration) < 1) reasons.push('PARENT_JOB_GENERATION_INVALID');
  if (stringValue(job.parentClaimId) !== stringValue(claim.parentClaimId)) reasons.push('PARENT_ANCESTOR_LINK_MISMATCH');
  if (normalizedUpper(claim.status) !== 'COMPLETED') reasons.push('PARENT_CLAIM_NOT_COMPLETED');
  if (claim.jobId !== job.id) reasons.push('PARENT_CLAIM_JOB_MISMATCH');
  if (normalizedUpper(claim.role) !== 'MAPPING_PRODUCER') reasons.push('PARENT_CLAIM_ROLE_INVALID');
  if (!stringValue(claim.queue) || !stringValue(claim.lane)) reasons.push('PARENT_CLAIM_ROUTING_MISSING');
  if (claim.jobId !== job.id || claim.claimGeneration !== job.claimGeneration) reasons.push('PARENT_CLAIM_GENERATION_MISMATCH');
  if (!claim.terminalReceiptId || claim.terminalReceiptId !== job.terminalReceiptId) reasons.push('PARENT_TERMINAL_RECEIPT_LINK_INVALID');
  const parsedJobSubject = affiliateAgentHistoricalMappingProducerSubjectSchema.safeParse(job.subjectJson);
  if (!parsedJobSubject.success || parsedJobSubject.data.type !== 'MAPPING_PRODUCER' || !parsedJobSubject.data.repairContext) {
    reasons.push('PARENT_SUBJECT_INVALID');
  } else {
    if (job.subjectId !== parsedJobSubject.data.mappingJobId) reasons.push('PARENT_SUBJECT_ID_MISMATCH');
    if (job.supplySourceId !== parsedJobSubject.data.supplySourceId) reasons.push('PARENT_SOURCE_IDENTITY_MISMATCH');
  }
  const envelope = parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(claim.claimEnvelopeJson);
  if (!envelope || envelope.role !== 'MAPPING_PRODUCER') {
    reasons.push('PARENT_CLAIM_ENVELOPE_INVALID');
  } else {
    if (normalizeHash(claim.claimEnvelopeHash) !== hashAffiliateAgentValue(envelope)) reasons.push('PARENT_CLAIM_ENVELOPE_HASH_MISMATCH');
    const checks: readonly [string, unknown, unknown][] = [
      ['jobId', envelope.jobId, job.id],
      ['claimId', envelope.claimId, claim.id],
      ['claimGeneration', envelope.claimGeneration, claim.claimGeneration],
      ['lifecycleGeneration', envelope.lifecycleGeneration, claim.lifecycleGeneration],
      ['workerId', envelope.workerId, claim.workerId],
      ['invocationId', envelope.invocationId, claim.invocationId],
      ['workspaceId', envelope.workspaceId, claim.workspaceId],
      ['role', envelope.role, claim.role],
      ['roleJob', envelope.role, job.role],
      ['queue', envelope.queue, claim.queue],
      ['queueJob', envelope.queue, job.queue],
      ['lane', envelope.lane, claim.lane],
      ['laneJob', envelope.lane, job.lane],
      ['supplySourceJob', envelope.supplySourceId, job.supplySourceId],
      ['supplyContractVersion', envelope.supplyContractVersion, claim.supplyContractVersion],
      ['supplyContractHash', envelope.supplyContractHash, claim.supplyContractHash],
      ['deploymentContractVersion', envelope.deploymentContractVersion, claim.deploymentContractVersion],
      ['deploymentContractHash', envelope.deploymentContractHash, claim.deploymentContractHash],
      ['roleContractVersion', envelope.roleContractVersion, claim.roleContractVersion],
      ['roleContractHash', envelope.roleContractHash, claim.roleContractHash],
      ['promptTemplateVersion', envelope.promptTemplateVersion, claim.promptTemplateVersion],
      ['promptTemplateHash', envelope.promptTemplateHash, claim.promptTemplateHash],
      ['evidenceManifestHash', envelope.evidenceManifest.hash, claim.evidenceManifestHash],
    ];
    checks.forEach(([field, expected, observed]) => {
      if (!sameValue(expected, observed)) reasons.push(`PARENT_${field.toUpperCase()}_MISMATCH`);
    });
    if (envelope.subject.type !== 'MAPPING_PRODUCER' || !envelope.subject.repairContext) reasons.push('PARENT_SUBJECT_INVALID');
    if (parsedJobSubject.success && !sameValue(envelope.subject, parsedJobSubject.data)) reasons.push('PARENT_SUBJECT_JSON_MISMATCH');
  }
  const manifest = affiliateAgentEvidenceManifestSchema.safeParse(job.evidenceManifestJson);
  if (!manifest.success) reasons.push('PARENT_EVIDENCE_MANIFEST_INVALID');
  else if (!sameValue(manifest.data, envelope?.evidenceManifest ?? null)) reasons.push('PARENT_EVIDENCE_MANIFEST_MISMATCH');
  const result = parentResultFor(job);
  if (!result) reasons.push('PARENT_RESULT_INVALID');
  else {
    const resultHash = hashAffiliateAgentValue(result);
    if (!normalizeHash(job.resultHash) || normalizeHash(job.resultHash) !== resultHash) reasons.push('PARENT_RESULT_HASH_MISMATCH');
    if (job.terminalDisposition !== result.disposition) reasons.push('PARENT_TERMINAL_DISPOSITION_MISMATCH');
    if (envelope) {
      const checks: readonly [string, unknown, unknown][] = [
        ['jobId', result.jobId, envelope.jobId],
        ['claimId', result.claimId, envelope.claimId],
        ['claimGeneration', result.claimGeneration, envelope.claimGeneration],
        ['lifecycleGeneration', result.lifecycleGeneration, envelope.lifecycleGeneration],
        ['workerId', result.workerId, envelope.workerId],
        ['invocationId', result.invocationId, envelope.invocationId],
        ['deploymentContractVersion', result.deploymentContractVersion, envelope.deploymentContractVersion],
        ['deploymentContractHash', result.deploymentContractHash, envelope.deploymentContractHash],
        ['supplyContractVersion', result.supplyContractVersion, envelope.supplyContractVersion],
        ['supplyContractHash', result.supplyContractHash, envelope.supplyContractHash],
        ['roleContractVersion', result.roleContractVersion, envelope.roleContractVersion],
        ['roleContractHash', result.roleContractHash, envelope.roleContractHash],
        ['promptTemplateVersion', result.promptTemplateVersion, envelope.promptTemplateVersion],
        ['promptTemplateHash', result.promptTemplateHash, envelope.promptTemplateHash],
      ];
      checks.forEach(([field, expected, observed]) => {
        if (!sameValue(expected, observed)) reasons.push(`PARENT_RESULT_${field.toUpperCase()}_MISMATCH`);
      });
      if (!sameValue(result.evidenceRefs, envelope.evidenceManifest.entries.map((entry) => entry.evidenceRef).filter((ref) => result.evidenceRefs.includes(ref)).sort())) {
        reasons.push('PARENT_RESULT_EVIDENCE_INVALID');
      }
    }
  }
  if (!receipt) reasons.push('PARENT_TERMINAL_RECEIPT_MISSING');
  else {
    const accepted = recordValue(receipt.responseJson);
    const responseHash = normalizeHash(receipt.responseHash);
    if (
      receipt.claimId !== claim.id
      || receipt.jobId !== job.id
      || receipt.claimGeneration !== claim.claimGeneration
    ) reasons.push('PARENT_TERMINAL_RECEIPT_IDENTITY_MISMATCH');
    if (normalizedUpper(receipt.status) !== 'SUCCEEDED' || normalizedUpper(receipt.operationKind) !== 'SUBMIT_RESULT') reasons.push('PARENT_TERMINAL_RECEIPT_NOT_SUCCEEDED');
    if (!responseHash || !receipt.completedAt) reasons.push('PARENT_TERMINAL_RECEIPT_INCOMPLETE');
    if (accepted.kind !== 'TERMINAL_ACCEPTED' || accepted.receiptId !== receipt.id || accepted.resultHash !== job.resultHash || accepted.disposition !== job.terminalDisposition) reasons.push('PARENT_TERMINAL_RECEIPT_RESPONSE_MISMATCH');
    try {
      if (!responseHash || responseHash !== hashAffiliateAgentValue(receipt.responseJson)) reasons.push('PARENT_TERMINAL_RECEIPT_RESPONSE_HASH_MISMATCH');
    } catch {
      reasons.push('PARENT_TERMINAL_RECEIPT_RESPONSE_HASH_MISMATCH');
    }
  }
  return {
    envelope,
    result,
    manifest: manifest.success ? manifest.data : null,
  };
};

const validateParentChain = async (
  client: AdmissionClient,
  job: GatewayJobRow,
  claim: GatewayClaimRow,
  reasons: string[],
): Promise<void> => {
  const seen = new Set([String(claim.id)]);
  let ancestorId = stringValue(claim.parentClaimId);
  while (ancestorId) {
    if (seen.has(ancestorId) || seen.size > 32) {
      reasons.push('PARENT_ANCESTRY_CYCLE_OR_LIMIT');
      return;
    }
    seen.add(ancestorId);
    const ancestor = await readUnique(client, 'affiliateAgentGatewayClaims', { where: { id: ancestorId } });
    const ancestorJob = ancestor ? await readUnique(client, 'affiliateAgentGatewayJobs', { where: { id: ancestor.jobId } }) : null;
    const envelope = ancestor ? parseAffiliateAgentProducerClaimEnvelopeForHistoricalRead(ancestor.claimEnvelopeJson) : null;
    const ancestorResult = ancestorJob ? parentResultFor(ancestorJob) : null;
    let valid = Boolean(ancestor && ancestorJob && envelope);
    if (ancestor && ancestorJob && envelope) {
      valid = valid
        && normalizeHash(ancestor.claimEnvelopeHash) === hashAffiliateAgentValue(envelope)
        && envelope.claimId === ancestor.id
        && envelope.jobId === ancestorJob.id
        && envelope.claimGeneration === ancestor.claimGeneration
        && ancestorJob.claimGeneration === ancestor.claimGeneration
        && envelope.workerId === ancestor.workerId
        && envelope.invocationId === ancestor.invocationId
        && envelope.workspaceId === ancestor.workspaceId
        && envelope.role === ancestor.role
        && envelope.queue === ancestor.queue
        && envelope.lane === ancestor.lane
        && envelope.supplySourceId === job.supplySourceId
        && envelope.role === ancestorJob.role
        && envelope.queue === ancestorJob.queue
        && envelope.lane === ancestorJob.lane
        && ancestorJob.subjectType === envelope.subject.type
        && envelope.subject.type === 'MAPPING_PRODUCER'
        && ancestorJob.subjectId === envelope.subject.mappingJobId
        && sameValue(envelope.subject, ancestorJob.subjectJson)
        && ancestorJob.supplySourceId === job.supplySourceId
        && stringValue(ancestor.parentClaimId) === stringValue(ancestorJob.parentClaimId)
        && normalizedUpper(ancestorJob.status) !== 'CLAIMED'
        && !stringValue(ancestorJob.activeClaimId)
        && ['COMPLETED', 'FAILED', 'EXPIRED'].includes(normalizedUpper(ancestor.status));
      if (ancestorResult) {
        valid = valid
          && normalizeHash(ancestorJob.resultHash) === hashAffiliateAgentValue(ancestorResult)
          && ancestorJob.terminalDisposition === ancestorResult.disposition;
      } else if (normalizedUpper(ancestorJob.status) === 'COMPLETED') {
        valid = false;
      }
    }
    if (!valid) {
      reasons.push('PARENT_ANCESTRY_INVALID');
      return;
    }
    ancestorId = stringValue(ancestor?.parentClaimId);
  }
};

const parentJobAndClaimFor = async (
  client: AdmissionClient,
  gatewayJobId: string,
  reasons: string[],
): Promise<Readonly<{
  job: GatewayJobRow | null;
  claim: GatewayClaimRow | null;
  receipt: GatewayReceiptRow | null;
  envelope: HistoricalProducerEnvelope | null;
  result: MappingProducerGapResult | null;
  manifest: AffiliateAgentEvidenceManifest | null;
}>> => {
  const job = await readUnique(client, 'affiliateAgentGatewayJobs', { where: { id: gatewayJobId } });
  if (!job) {
    reasons.push('PARENT_GATEWAY_JOB_MISSING');
    return { job: null, claim: null, receipt: null, envelope: null, result: null, manifest: null };
  }
  const claims = await readMany(client, 'affiliateAgentGatewayClaims', {
    where: { jobId: gatewayJobId },
    orderBy: { claimGeneration: 'desc' },
    take: 32,
  });
  const terminalClaims = stringValue(job.terminalReceiptId)
    ? claims.filter((candidate) => candidate.terminalReceiptId === job.terminalReceiptId)
    : [];
  if (!stringValue(job.terminalReceiptId) || terminalClaims.length !== 1) reasons.push('PARENT_TERMINAL_CLAIM_INVALID');
  const claim = terminalClaims[0]
    ?? claims.sort((left, right) => Number(right.claimGeneration ?? 0) - Number(left.claimGeneration ?? 0))[0]
    ?? null;
  if (!claim) reasons.push('PARENT_CLAIM_MISSING');
  const receiptId = stringValue(job.terminalReceiptId);
  const receipt = receiptId
    ? await readUnique(client, 'affiliateAgentGatewayOperationReceipts', { where: { id: receiptId } })
    : null;
  const validated = claim
    ? parentEnvelopeValid(job, claim, receipt, reasons)
    : { envelope: null, result: null, manifest: null };
  if (claim) await validateParentChain(client, job, claim, reasons);
  return {
    job,
    claim,
    receipt,
    envelope: validated.envelope,
    result: validated.result,
    manifest: validated.manifest,
  };
};

const loadChildrenAndAudits = async (
  client: AdmissionClient,
  rootId: string | null,
): Promise<Readonly<{ jobs: GatewayJobRow[]; audits: GatewayEventRow[] }>> => {
  if (!rootId) return { jobs: [], audits: [] };
  const jobs = (await readBatched(client, 'affiliateAgentGatewayJobs', { supplySourceId: rootId }))
    .filter((job) => normalizedUpper(job.role) === 'SUPPLY_REVIEWER' && normalizedUpper(job.subjectType) === 'SOURCE_EXCLUSION_REVIEW')
    .sort(compareIds);
  const ids = jobs.map((job) => stringValue(job.id)).filter((id): id is string => Boolean(id));
  if (!ids.length) return { jobs, audits: [] };
  const audits = (await readBatched(client, 'affiliateAgentGatewayEvents', {
    jobId: { in: ids },
    eventType: 'JOB_CREATED',
  })).filter((event) => normalizedUpper(event.eventType) === 'JOB_CREATED').sort(compareIds);
  return { jobs, audits };
};

const sourceArtifactRowsFor = async (
  client: AdmissionClient,
  intakeId: string,
  runId: string,
): Promise<Readonly<{ pages: PageRow[]; artifacts: ArtifactRow[]; files: FileRow[] }>> => {
  const pages = await readBatched(client, 'affiliateSourceIntakePages', { intakeId });
  const artifacts = await readBatched(client, 'affiliateSourceIntakeArtifacts', {
    intakeId,
    runId,
    kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN', 'PAGE_SCREENSHOT'] },
  });
  if (artifacts.some((artifact) => PAGE_KINDS[normalizedUpper(artifact.kind)] !== true)) {
    throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', 'The source evidence query returned an unsupported artifact kind.');
  }
  const fileIds = sortedUnique(artifacts.map((artifact) => {
    const id = stringValue(artifact.fileId);
    if (!id) throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_INVALID', 'A source evidence artifact has a blank file id.');
    return id;
  }));
  const files = fileIds.length
    ? await readBatched(client, 'file', { id: { in: fileIds } })
    : [];
  return { pages, artifacts, files };
};

const stateFingerprintFor = (input: Readonly<{
  gatewayJobId: string;
  requestedReason: string;
  parent: AdmissionParent | null;
  currentCatalog: AffiliateSportsCatalogSnapshot | null;
  activeContract: Readonly<{ manifest: JsonRecord; policy: JsonRecord }> | null;
  reviewerJobs: readonly GatewayJobRow[];
  activeClaims: readonly GatewayClaimRow[];
  activePointers: readonly GatewayJobRow[];
  reasons: readonly string[];
}>): string => hashAffiliateAgentValue(normalizeForHash({
  gatewayJobId: input.gatewayJobId,
  requestedReason: input.requestedReason,
  reasons: sortedUnique([...input.reasons]),
  parent: input.parent ? {
    job: input.parent.job,
    claim: input.parent.claim,
    receipt: input.parent.receipt,
    envelope: input.parent.envelope,
    subject: input.parent.subject,
    result: input.parent.result,
    manifest: input.parent.manifest,
    mappingJob: input.parent.mappingJob,
    intake: input.parent.intake,
    source: input.parent.source,
    mapping: input.parent.mapping,
    root: input.parent.root,
    run: input.parent.run,
    pages: input.parent.pages,
    artifacts: input.parent.artifacts,
    files: input.parent.files,
    organizations: input.parent.organizations,
    candidates: input.parent.candidates,
    targets: input.parent.targets,
    sourceJobs: input.parent.sourceJobs,
  } : null,
  currentCatalog: stableCatalog(input.currentCatalog),
  activeContract: input.activeContract ? {
    manifest: input.activeContract.manifest,
    policy: input.activeContract.policy,
  } : null,
  reviewerJobs: input.reviewerJobs.map((job) => ({
    id: job.id,
    dedupeKey: job.dedupeKey,
    subjectJson: job.subjectJson,
    evidenceManifestJson: job.evidenceManifestJson,
    parentClaimId: job.parentClaimId,
    supplySourceId: job.supplySourceId,
    expectedLifecycleGeneration: job.expectedLifecycleGeneration,
    claimGeneration: job.claimGeneration,
    status: job.status,
    activeClaimId: job.activeClaimId,
    terminalReceiptId: job.terminalReceiptId,
    resultHash: job.resultHash,
  })),
  activeClaims: input.activeClaims.map((claim) => ({ id: claim.id, jobId: claim.jobId, status: claim.status })),
  activePointers: input.activePointers.map((job) => ({ id: job.id, activeClaimId: job.activeClaimId, status: job.status })),
}) ?? null);

type MutableSafetyExpectation = Readonly<{
  lifecycleGeneration: number | null;
  supplyContractVersion: number | null;
  supplyContractHash: string | null;
  rolloutCohort?: string | null;
}>;

const mutableSafetyReasonCodesFor = (
  parent: AdmissionParent,
  expected: MutableSafetyExpectation,
): string[] => {
  const reasons: string[] = [];
  const rootId = stringValue(parent.root.id);
  const sourceId = stringValue(parent.source.id);
  const intakeId = stringValue(parent.intake.id);
  const mappingJobId = stringValue(parent.mappingJob.id);
  const mappingId = stringValue(parent.mapping?.id);
  const runId = stringValue(parent.run.id);
  if (!rootId || !sourceId || !intakeId || !mappingJobId || !runId) reasons.push('IDENTITY_ID_MISSING');
  if (!rootId || parent.subject.supplySourceId !== rootId || parent.job.supplySourceId !== rootId) reasons.push('ROOT_IDENTITY_DRIFT');
  if (!sourceId || parent.mappingJob.sourceId !== sourceId || parent.intake.affiliateSourceId !== sourceId || parent.root.liveSourceId !== sourceId) reasons.push('SOURCE_LINK_DRIFT');
  if (!rootId || parent.source.supplySourceId !== rootId || parent.mappingJob.supplySourceId !== rootId || parent.intake.supplySourceId !== rootId || parent.root.intakeId !== intakeId) reasons.push('ROOT_LINK_DRIFT');
  if (parent.mappingJob.intakeId !== intakeId) reasons.push('MAPPING_JOB_INTAKE_MISMATCH');
  if (parent.mappingJob.mappingId !== mappingId) reasons.push('MAPPING_JOB_MAPPING_MISMATCH');
  if (parent.mapping && (parent.mapping.sourceId !== sourceId || parent.mapping.supplySourceId !== rootId)) reasons.push('MAPPING_IDENTITY_DRIFT');
  if (parent.mapping && parent.mapping.validatedAt) reasons.push('VALIDATED_MAPPING_LIVE_STATE');
  if (parent.source.activeMappingId !== mappingId) reasons.push('ACTIVE_MAPPING_MISMATCH');
  if (parent.source.sourceKey !== parent.intake.sourceKey) reasons.push('SOURCE_KEY_MISMATCH');
  if (parent.run.intakeId !== intakeId) reasons.push('CAPTURE_RUN_INTAKE_MISMATCH');
  if (parent.run.supplySourceId !== null && parent.run.supplySourceId !== undefined && parent.run.supplySourceId !== rootId) reasons.push('CAPTURE_RUN_ROOT_MISMATCH');
  if (!['SUCCEEDED', 'PARTIAL'].includes(normalizedUpper(parent.run.status))) reasons.push('CAPTURE_RUN_NOT_SUCCESSFUL');
  if (parent.mappingJob.status === 'QUEUED' || parent.mappingJob.claimedAt || parent.mappingJob.workerId || parent.mappingJob.leaseExpiresAt) reasons.push('PARENT_MAPPING_JOB_NOT_HELD');
  if (!ALLOWED_PARENT_MAPPING_JOB_STATUSES[normalizedUpper(parent.mappingJob.status)]) reasons.push('PARENT_MAPPING_JOB_STATUS_INVALID');
  if (parent.source.lifecycleGeneration !== parent.root.lifecycleGeneration) reasons.push('SOURCE_GENERATION_MISMATCH');
  if (expected.lifecycleGeneration === null || parent.root.lifecycleGeneration !== expected.lifecycleGeneration) reasons.push('ROOT_GENERATION_MISMATCH');
  if (!Number.isInteger(parent.root.lifecycleGeneration) || typeof parent.root.isAutomationEnabled !== 'boolean' || typeof parent.root.isExcluded !== 'boolean') reasons.push('ROOT_STATE_SHAPE_INVALID');
  if (parent.root.isExcluded === true) reasons.push('SOURCE_ALREADY_EXCLUDED');
  if (parent.root.isAutomationEnabled === true) reasons.push('ROOT_AUTOMATION_ENABLED');
  if (!['PRE_MAPPED', 'MAPPED'].includes(normalizedUpper(parent.root.derivedStage))) reasons.push('ROOT_LIVE_STATE');
  if (normalizedUpper(parent.root.derivedStage) === 'PUBLISHED') reasons.push('ROOT_IS_PUBLISHED');
  if (rootHoldReason(parent.root) !== 'LEGACY_SPORT_REPAIR') reasons.push('ROOT_HOLD_MISSING');
  if (!Number.isInteger(parent.source.lifecycleGeneration) || typeof parent.source.autoScrapeEnabled !== 'boolean') reasons.push('SOURCE_STATE_SHAPE_INVALID');
  if (parent.source.autoScrapeEnabled === true) reasons.push('SOURCE_AUTOMATION_ENABLED');
  if (PUBLIC_SOURCE_STATUSES[normalizedUpper(parent.source.status)]) reasons.push('SOURCE_IS_PUBLIC');
  const sourceMetadata = recordValue(parent.source.metadata);
  const publicationStatus = normalizedUpper(sourceMetadata.publicationStatus ?? sourceMetadata.publicStatus ?? sourceMetadata.lifecycleStatus);
  if (PUBLIC_SOURCE_STATUSES[publicationStatus] || sourceMetadata.isPublic === true || sourceMetadata.public === true) reasons.push('SOURCE_IS_PUBLIC');
  if (normalizedUpper(parent.source.status) === 'EXCLUDED') reasons.push('SOURCE_ALREADY_EXCLUDED');
  if (sourceHoldReason(parent.source) !== 'LEGACY_SPORT_REPAIR') reasons.push('SOURCE_HOLD_MISSING');
  if (expected.supplyContractVersion !== null && parent.root.activeSupplyContractVersion !== expected.supplyContractVersion) reasons.push('ROOT_ACTIVE_CONTRACT_DRIFT');
  if (expected.supplyContractHash && normalizeHash(parent.root.activeSupplyContractHash) !== normalizeHash(expected.supplyContractHash)) reasons.push('ROOT_ACTIVE_CONTRACT_DRIFT');
  if (expected.supplyContractVersion !== null && parent.source.activeSupplyContractVersion !== null && parent.source.activeSupplyContractVersion !== expected.supplyContractVersion) reasons.push('SOURCE_ACTIVE_CONTRACT_DRIFT');
  if (expected.supplyContractHash && parent.source.activeSupplyContractHash && normalizeHash(parent.source.activeSupplyContractHash) !== normalizeHash(expected.supplyContractHash)) reasons.push('SOURCE_ACTIVE_CONTRACT_DRIFT');
  if (expected.rolloutCohort && normalizedUpper(parent.root.rolloutCohort) !== normalizedUpper(expected.rolloutCohort)) reasons.push('ROOT_ROLLOUT_COHORT_MISMATCH');
  if (normalizedUpper(parent.source.targetKind) !== normalizedUpper(parent.root.targetKind)) reasons.push('SOURCE_TARGET_KIND_MISMATCH');
  if (!parent.identity || parent.identity.identityKey !== parent.root.identityKey || parent.identity.canonicalUrl !== parent.root.canonicalUrl || parent.identity.origin !== parent.root.origin || parent.identity.pathKey !== parent.root.pathKey) reasons.push('SOURCE_IDENTITY_DRIFT');
  const organizationIds = sortedUnique([
    stringValue(parent.source.organizationId),
    stringValue(parent.intake.organizationId),
  ].filter((value): value is string => Boolean(value)));
  if (parent.organizations.length !== organizationIds.length || organizationIds.some((id) => !parent.organizations.some((organization) => organization.id === id))) reasons.push('ORGANIZATION_BINDING_DRIFT');
  for (const organization of parent.organizations) {
    if (normalizedUpper(organization.status) !== 'UNLISTED' || organization.publicPageEnabled === true || organization.publicWidgetsEnabled === true) reasons.push('ORGANIZATION_IS_PUBLIC');
  }
  for (const candidate of parent.candidates) {
    if (candidate.sourceId !== sourceId || (candidate.supplySourceId !== null && candidate.supplySourceId !== rootId) || (candidate.mappingId !== null && candidate.mappingId !== mappingId)) reasons.push('CANDIDATE_IDENTITY_MISMATCH');
    if (!stringValue(candidate.listingKind) || !stringValue(candidate.status)) reasons.push('CANDIDATE_STATE_SHAPE_INVALID');
    if (hasPublicAffiliateCandidate(candidate, parent.source.organizationId, parent.organizations)) reasons.push('PUBLIC_TARGET_PRESENT');
  }
  for (const target of parent.targets) {
    if (target.supplySourceId !== rootId) reasons.push('TARGET_IDENTITY_MISMATCH');
    if (PUBLIC_TARGET_STATUSES[normalizedUpper(target.status)]) reasons.push('PUBLIC_TARGET_PRESENT');
  }
  for (const sourceJob of parent.sourceJobs) {
    if (sourceJob.id === mappingJobId) continue;
    if (ACTIVE_SOURCE_JOB_STATUSES[normalizedUpper(sourceJob.status)]) reasons.push('ACTIVE_SOURCE_JOB_PRESENT');
    if (sourceJob.sourceId === sourceId && sourceJob.supplySourceId !== null && sourceJob.supplySourceId !== rootId) reasons.push('SOURCE_JOB_ROOT_MISMATCH');
  }
  return sortedUnique(reasons);
};

const mutableSafetyFingerprintFor = (parent: AdmissionParent): string => hashAffiliateAgentValue(normalizeForHash({
  identity: parent.identity,
  root: parent.root,
  source: parent.source,
  intake: parent.intake,
  mappingJob: parent.mappingJob,
  mapping: parent.mapping,
  run: parent.run,
  organizations: parent.organizations,
  candidates: parent.candidates,
  targets: parent.targets,
  sourceJobs: parent.sourceJobs,
  currentCatalog: stableCatalog(parent.currentCatalog),
  activeContract: {
    manifest: parent.activeContract.manifest,
    policy: parent.activeContract.policy,
  },
}));

const inspectAdmission = async (
  client: AdmissionClient,
  artifactStore: AffiliateAgentArtifactStore,
  bundle: AffiliateAgentContractBundle,
  gatewayJobId: string,
  requestedReason: string,
  requestedByActorId: string,
): Promise<AdmissionInspection> => {
  const reasons: string[] = [];
  const parentParts = await parentJobAndClaimFor(client, gatewayJobId, reasons);
  const parentJob = parentParts.job;
  const parentClaim = parentParts.claim;
  const parentEnvelope = parentParts.envelope;
  const parentResult = parentParts.result;
  const parentManifest = parentParts.manifest;
  const activeClaims = (await readBatched(client, 'affiliateAgentGatewayClaims', { status: 'ACTIVE' })).sort(compareIds);
  const activePointers = (await readBatched(client, 'affiliateAgentGatewayJobs', { activeClaimId: { not: null } })).sort(compareIds);
  if (activeClaims.length > 0 || activePointers.length > 0) reasons.push('ACTIVE_GATEWAY_CLAIM');

  let root: RootRow | null = null;
  let currentCatalog: AffiliateSportsCatalogSnapshot | null = null;
  let activeContract: Readonly<{ manifest: JsonRecord; policy: JsonRecord }> | null = null;
  let reviewerJobs: GatewayJobRow[] = [];
  let reviewerAudits: GatewayEventRow[] = [];
  let proposedSubject: AffiliateAgentSourceExclusionReviewerSubject | null = null;
  let reviewerManifest: AffiliateAgentEvidenceManifest | null = null;
  let requestHash: string | null = null;
  let dedupeKey: string | null = null;
  let expectedLifecycleGeneration: number | null = null;
  let parent: AdmissionParent | null = null;
  try { currentCatalog = await currentCatalogFor(client); } catch { reasons.push('CURRENT_CATALOG_UNAVAILABLE'); }
  try { activeContract = await activeContractFor(client, contractCohort(bundle)); } catch { reasons.push('ACTIVE_CONTRACT_UNAVAILABLE'); }

  if (parentJob && parentClaim && parentParts.receipt && parentEnvelope && parentResult && parentManifest
    && parentEnvelope.role === 'MAPPING_PRODUCER'
    && parentEnvelope.subject.type === 'MAPPING_PRODUCER') {
    const subject = parentEnvelope.subject;
    const sportEvidence = parentSportEvidenceValid(parentResult, subject, reasons);
    const rootId = stringValue(parentJob.supplySourceId) ?? subject.supplySourceId;
    root = rootId ? await readUnique(client, 'affiliateSupplySources', { where: { id: rootId } }) : null;
    if (!root) reasons.push('SUPPLY_ROOT_MISSING');
    expectedLifecycleGeneration = typeof root?.lifecycleGeneration === 'number'
      ? root.lifecycleGeneration
      : typeof parentClaim.lifecycleGeneration === 'number' ? parentClaim.lifecycleGeneration : null;
    if (root && parentClaim.lifecycleGeneration !== root.lifecycleGeneration) reasons.push('ROOT_GENERATION_MISMATCH');
    if (root && parentJob.expectedLifecycleGeneration !== root.lifecycleGeneration) reasons.push('PARENT_JOB_GENERATION_MISMATCH');
    if (root && parentEnvelope.lifecycleGeneration !== root.lifecycleGeneration) reasons.push('PARENT_ENVELOPE_GENERATION_MISMATCH');
    if (root && normalizedUpper(root.rolloutCohort) !== normalizedUpper(contractCohort(bundle))) reasons.push('ROOT_ROLLOUT_COHORT_MISMATCH');

    let mappingJob: MappingJobRow | null = null;
    let intake: IntakeRow | null = null;
    let source: SourceRow | null = null;
    let mapping: MappingRow | null = null;
    let run: RunRow | null = null;
    let pages: PageRow[] = [];
    let artifacts: ArtifactRow[] = [];
    let files: FileRow[] = [];
    let organizations: OrganizationRow[] = [];
    let candidates: CandidateRow[] = [];
    let targets: TargetRow[] = [];
    let sourceJobs: MappingJobRow[] = [];
    if (subject.mappingJobId) {
      mappingJob = await readUnique(client, 'affiliateSourceMappingJobs', { where: { id: subject.mappingJobId } });
    }
    if (!mappingJob) reasons.push('MAPPING_JOB_MISSING');
    if (mappingJob && normalizedUpper(mappingJob.status) === 'QUEUED') reasons.push('PARENT_MAPPING_JOB_NOT_HELD');
    if (mappingJob && !ALLOWED_PARENT_MAPPING_JOB_STATUSES[normalizedUpper(mappingJob.status)]) reasons.push('PARENT_MAPPING_JOB_STATUS_INVALID');
    if (mappingJob && (mappingJob.claimedAt || mappingJob.workerId || mappingJob.leaseExpiresAt)) reasons.push('PARENT_MAPPING_JOB_HAS_ACTIVE_LEASE');
    const intakeId = stringValue(recordValue(subject.repairContext).intakeId) ?? stringValue(mappingJob?.intakeId);
    intake = intakeId ? await readUnique(client, 'affiliateSourceIntakes', { where: { id: intakeId } }) : null;
    const sourceId = stringValue(mappingJob?.sourceId) ?? stringValue(intake?.affiliateSourceId);
    source = sourceId ? await readUnique(client, 'affiliateScrapeSources', { where: { id: sourceId } }) : null;
    const mappingId = stringValue(mappingJob?.mappingId);
    mapping = mappingId ? await readUnique(client, 'affiliateScrapeMappings', { where: { id: mappingId } }) : null;
    if (mappingJob && mappingJob.intakeId !== intake?.id) reasons.push('MAPPING_JOB_INTAKE_MISMATCH');
    if (mappingJob && mappingJob.supplySourceId !== root?.id) reasons.push('MAPPING_JOB_ROOT_MISMATCH');
    if (mappingJob && mappingJob.sourceId !== source?.id) reasons.push('MAPPING_JOB_SOURCE_MISMATCH');
    if (intake && normalizedUpper(intake.status) !== 'READY_FOR_MAPPING') reasons.push('INTAKE_NOT_HELD_FOR_MAPPING');
    if (intake && intake.affiliateSourceId !== source?.id) reasons.push('INTAKE_SOURCE_MISMATCH');
    if (intake && intake.supplySourceId !== root?.id) reasons.push('INTAKE_ROOT_MISMATCH');
    if (source && source.supplySourceId !== root?.id) reasons.push('SOURCE_ROOT_MISMATCH');
    if (source && intake && source.sourceKey !== intake.sourceKey) reasons.push('SOURCE_KEY_MISMATCH');
    const identity = source && intake ? sourceIdentityFor(source, intake) : null;
    if (!identity) reasons.push('SOURCE_IDENTITY_INVALID');
    if (identity && root && (
      identity.identityKey !== root.identityKey
      || identity.canonicalUrl !== root.canonicalUrl
      || identity.origin !== root.origin
      || identity.pathKey !== root.pathKey
    )) reasons.push('SOURCE_IDENTITY_DRIFT');
    if (mappingJob?.mappingId && !mapping) reasons.push('MAPPING_MISSING');
    if (mapping && mapping.sourceId !== source?.id) reasons.push('MAPPING_SOURCE_MISMATCH');
    if (mapping && mapping.supplySourceId !== root?.id) reasons.push('MAPPING_ROOT_MISMATCH');
    if (mapping && source?.activeMappingId !== mapping.id) reasons.push('ACTIVE_MAPPING_MISMATCH');
    if (mapping?.validatedAt) reasons.push('VALIDATED_MAPPING_LIVE_STATE');
    if (source && root && source.lifecycleGeneration !== root.lifecycleGeneration) reasons.push('SOURCE_GENERATION_MISMATCH');
    if (root && root.intakeId !== intake?.id) reasons.push('ROOT_INTAKE_MISMATCH');
    if (root && root.liveSourceId !== source?.id) reasons.push('ROOT_SOURCE_MISMATCH');
    if (root && root.isExcluded === true) reasons.push('SOURCE_ALREADY_EXCLUDED');
    if (root && root.isAutomationEnabled === true) reasons.push('ROOT_AUTOMATION_ENABLED');
    if (root && (!Number.isInteger(root.lifecycleGeneration) || typeof root.isAutomationEnabled !== 'boolean' || typeof root.isExcluded !== 'boolean')) reasons.push('ROOT_STATE_SHAPE_INVALID');
    if (source && root && normalizedUpper(source.targetKind) !== normalizedUpper(root.targetKind)) reasons.push('SOURCE_TARGET_KIND_MISMATCH');
    if (root && !['PRE_MAPPED', 'MAPPED'].includes(normalizedUpper(root.derivedStage))) reasons.push('ROOT_LIVE_STATE');
    if (root && normalizedUpper(root.derivedStage) === 'PUBLISHED') reasons.push('ROOT_IS_PUBLISHED');
    if (root && rootHoldReason(root) !== 'LEGACY_SPORT_REPAIR') reasons.push('ROOT_HOLD_MISSING');
    if (source && (!Number.isInteger(source.lifecycleGeneration) || typeof source.autoScrapeEnabled !== 'boolean')) reasons.push('SOURCE_STATE_SHAPE_INVALID');
    if (source && source.autoScrapeEnabled === true) reasons.push('SOURCE_AUTOMATION_ENABLED');
    if (source && PUBLIC_SOURCE_STATUSES[normalizedUpper(source.status)]) reasons.push('SOURCE_IS_PUBLIC');
    if (source) {
      const metadata = recordValue(source.metadata);
      const publicationStatus = normalizedUpper(metadata.publicationStatus ?? metadata.publicStatus ?? metadata.lifecycleStatus);
      if (PUBLIC_SOURCE_STATUSES[publicationStatus] || metadata.isPublic === true || metadata.public === true) reasons.push('SOURCE_IS_PUBLIC');
    }
    if (source && normalizedUpper(source.status) === 'EXCLUDED') reasons.push('SOURCE_ALREADY_EXCLUDED');
    if (source && sourceHoldReason(source) !== 'LEGACY_SPORT_REPAIR') reasons.push('SOURCE_HOLD_MISSING');
    if (source && source.activeSupplyContractVersion !== null && source.activeSupplyContractVersion !== undefined && source.activeSupplyContractVersion !== bundle.supplyContract.version) reasons.push('SOURCE_ACTIVE_CONTRACT_DRIFT');
    if (source && source.activeSupplyContractHash && normalizeHash(source.activeSupplyContractHash) !== bundle.supplyContract.hash.toLowerCase()) reasons.push('SOURCE_ACTIVE_CONTRACT_DRIFT');
    if (runIdFromContext(subject.repairContext) && intake) {
      run = await readUnique(client, 'affiliateSourceIntakeRuns', { where: { id: runIdFromContext(subject.repairContext) } });
    }
    if (run && run.intakeId !== intake?.id) reasons.push('CAPTURE_RUN_INTAKE_MISMATCH');
    if (run && run.supplySourceId !== null && run.supplySourceId !== undefined && run.supplySourceId !== root?.id) reasons.push('CAPTURE_RUN_ROOT_MISMATCH');
    if (!run && intake) reasons.push('CAPTURE_RUN_MISSING');
    if (intake && run) {
      const evidenceRows = await sourceArtifactRowsFor(client, String(intake.id), String(run.id));
      pages = evidenceRows.pages;
      artifacts = evidenceRows.artifacts;
      files = evidenceRows.files;
    }
    const pageIds = new Set(pages.filter((page) => page.supplySourceId === null || page.supplySourceId === root?.id).map((page) => String(page.id)));
    const artifactsById = new Map(artifacts.map((artifact) => [String(artifact.id), artifact]));
    const filesById = new Map(files.map((file) => [String(file.id), file]));
    const ownedOrigins = new Set([urlOrigin(source?.listUrl), urlOrigin(source?.baseUrl), urlOrigin(intake?.baseUrl)].filter((value): value is string => Boolean(value)));
    const pageEntries = parentManifest.entries.filter((entry) => PAGE_KINDS[entry.kind] === true);
    if (pageEntries.length === 0) reasons.push('PARENT_PAGE_EVIDENCE_MISSING');
    for (const entry of pageEntries) {
      const artifactId = pageEntryArtifactId(entry);
      const artifact = artifactId ? artifactsById.get(artifactId) ?? null : null;
      const file = artifact ? filesById.get(String(artifact.fileId)) ?? null : null;
      if (!artifactId) reasons.push('PARENT_PAGE_ARTIFACT_HANDLE_INVALID');
      if (artifact && artifact.intakeId !== intake?.id) reasons.push(`PAGE_INTAKE_MISMATCH_${entry.kind}`);
      if (artifact && artifact.runId !== run?.id) reasons.push(`PAGE_RUN_MISMATCH_${entry.kind}`);
      if (artifact && artifact.supplySourceId !== null && artifact.supplySourceId !== root?.id) reasons.push(`PAGE_ROOT_MISMATCH_${entry.kind}`);
      if (artifact?.pageId && !pageIds.has(String(artifact.pageId))) reasons.push(`PAGE_OWNERSHIP_MISMATCH_${entry.kind}`);
      await verifyImmutableArtifact(artifactStore, entry, artifact, file, String(intake?.id ?? ''), String(run?.id ?? ''), ownedOrigins, reasons);
    }
    if (parentResult && sportEvidence && Array.isArray(sportEvidence.sportDeterminations)) {
      for (const determination of sportEvidence.sportDeterminations) {
        const rawCitations = recordValue(determination).evidence;
        for (const citation of Array.isArray(rawCitations) ? rawCitations : []) {
          const citationRecord = recordValue(citation);
          const artifactId = stringValue(citationRecord.artifactId);
          const entry = artifactId ? pageEntries.find((candidate) => candidate.artifactId === artifactId) ?? null : null;
          const artifact = entry
            ? artifactsById.get(pageEntryArtifactId(entry) ?? '') ?? null
            : null;
          if (!entry || !artifactId || !artifact) {
            reasons.push('PARENT_CITATION_NOT_PAGE_EVIDENCE');
            continue;
          }
          if (
            citationRecord.artifactSha256 !== entry.sha256
            || citationRecord.artifactKind !== entry.kind
            || !parentResult.evidenceRefs.includes(entry.evidenceRef)
          ) reasons.push('PARENT_CITATION_ARTIFACT_MISMATCH');
          const citedUrl = stringValue(citationRecord.pageUrl);
          const artifactUrls = [stringValue(artifact.sourceUrl), stringValue(artifact.finalUrl)]
            .filter((url): url is string => Boolean(url));
          if (!citedUrl || artifactUrls.length === 0 || !artifactUrls.some((url) => {
            try {
              return new URL(url).toString() === new URL(citedUrl).toString();
            } catch {
              return false;
            }
          })) reasons.push('PARENT_CITATION_URL_MISMATCH');
        }
      }
    }
    const organizationIds = Array.from(new Set([
      stringValue(source?.organizationId),
      stringValue(intake?.organizationId),
    ].filter((value): value is string => Boolean(value)))).sort();
    for (const organizationId of organizationIds) {
      const organization = await readUnique(client, 'organizations', { where: { id: organizationId } });
      if (organization) organizations.push(organization);
      if (!organization) reasons.push('ORGANIZATION_MISSING');
      if (organization && (normalizedUpper(organization.status) !== 'UNLISTED' || organization.publicPageEnabled === true || organization.publicWidgetsEnabled === true)) reasons.push('ORGANIZATION_IS_PUBLIC');
    }
    const sourceIds = source?.id ? [source.id] : [];
    const mappingIds = mapping?.id ? [mapping.id] : [];
    const rootIds = root?.id ? [root.id] : [];
    if (sourceIds.length || mappingIds.length || rootIds.length) {
      candidates = await readBatched(client, 'affiliateImportCandidates', {
        OR: [
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
          ...(mappingIds.length ? [{ mappingId: { in: mappingIds } }] : []),
          ...(rootIds.length ? [{ supplySourceId: { in: rootIds } }] : []),
        ],
      });
      targets = await readBatched(client, 'affiliateSupplyTargets', { supplySourceId: root?.id });
    }
    for (const candidate of candidates) {
      if (candidate.sourceId !== source?.id || (candidate.supplySourceId !== null && candidate.supplySourceId !== root?.id)) reasons.push('CANDIDATE_IDENTITY_MISMATCH');
      if (candidate.mappingId && candidate.mappingId !== mapping?.id) reasons.push('CANDIDATE_MAPPING_MISMATCH');
      if (hasPublicAffiliateCandidate(candidate, source?.organizationId, organizations)) reasons.push('PUBLIC_TARGET_PRESENT');
    }
    if (targets.some((target) => PUBLIC_TARGET_STATUSES[normalizedUpper(target.status)])) reasons.push('PUBLIC_TARGET_PRESENT');
    if (mappingJob && intake) sourceJobs = await readBatched(client, 'affiliateSourceMappingJobs', { intakeId: intake.id });
    for (const candidate of sourceJobs) {
      if (candidate.id === mappingJob?.id) continue;
      if (ACTIVE_SOURCE_JOB_STATUSES[normalizedUpper(candidate.status)]) reasons.push('ACTIVE_SOURCE_JOB_PRESENT');
      if (candidate.sourceId === source?.id && candidate.supplySourceId && candidate.supplySourceId !== root?.id) reasons.push('SOURCE_JOB_ROOT_MISMATCH');
    }
    const children = await loadChildrenAndAudits(client, root?.id ? String(root.id) : null);
    reviewerJobs = children.jobs;
    reviewerAudits = children.audits;
    const requestedResultHash = normalizeHash(parentJob.resultHash) ?? hashAffiliateAgentValue(parentResult);
    if (parentClaim.id && root?.id) {
      requestHash = requestHashFor({
        gatewayJobId,
        supplySourceId: String(root.id),
        producerClaimId: String(parentClaim.id),
        producerResultHash: requestedResultHash,
        reason: requestedReason,
        requestedByActorId,
      });
      dedupeKey = dedupeKeyFor(String(root.id), requestHash);
    }
    if (root && identity && run && mappingJob && intake && source && currentCatalog && activeContract) {
      const parentStub = {
        job: parentJob,
        claim: parentClaim,
        receipt: parentParts.receipt,
        envelope: parentEnvelope,
        subject,
        result: parentResult,
        sportEvidence: sportEvidence ?? {},
        manifest: parentManifest,
        mappingJob,
        intake,
        source,
        mapping,
        root,
        run,
        pages,
        artifacts,
        files,
        organizations,
        candidates,
        targets,
        sourceJobs,
        reviewerJobs,
        reviewerAudits,
        activeClaims,
        activePointers,
        currentCatalog,
        activeContract,
        identity,
        pageEntries,
        requestHash: requestHash ?? '',
        dedupeKey: dedupeKey ?? '',
      } as AdmissionParent;
      reasons.push(...mutableSafetyReasonCodesFor(parentStub, {
        lifecycleGeneration: typeof root.lifecycleGeneration === 'number' ? root.lifecycleGeneration : null,
        supplyContractVersion: bundle.supplyContract.version,
        supplyContractHash: bundle.supplyContract.hash,
        rolloutCohort: contractCohort(bundle),
      }));
      if (activeContractMatchesBundle(activeContract, bundle) === false) reasons.push('ACTIVE_CONTRACT_DRIFT');
      const manifest = (() => {
        try { return reviewerManifestFor(pageEntries, bundle); } catch { return null; }
      })();
      if (manifest) {
        reviewerManifest = manifest;
        const activeEntry = manifest.entries.find((entry) => entry.kind === 'ACTIVE_SUPPLY_CONTRACT');
        if (activeEntry) await verifyImmutableArtifact(artifactStore, activeEntry, null, null, '', '', new Set(), reasons);
        if (requestHash && dedupeKey) {
          try { proposedSubject = subjectFor(parentStub, requestedReason, requestedByActorId); } catch { reasons.push('REVIEWER_SUBJECT_INVALID'); }
        }
      }
      parent = parentStub;
      if (!activeContractMatchesBundle(activeContract, bundle)) reasons.push('ACTIVE_CONTRACT_DRIFT');
      if (root.activeSupplyContractVersion !== bundle.supplyContract.version || normalizeHash(root.activeSupplyContractHash) !== bundle.supplyContract.hash.toLowerCase()) reasons.push('ROOT_ACTIVE_CONTRACT_DRIFT');
    }
    if (parent && currentCatalog && activeContract && reviewerManifest && proposedSubject) {
      // Rebuild the context with the fresh catalog. The old producer context remains immutable.
      const freshParent = {
        ...parent,
        currentCatalog,
        activeContract,
      } as AdmissionParent;
      parent = freshParent;
      try {
        proposedSubject = subjectFor(freshParent, requestedReason, requestedByActorId);
      } catch {
        reasons.push('REVIEWER_SUBJECT_INVALID');
      }
    }
  } else {
    if (!parentJob || !parentClaim || !parentEnvelope) reasons.push('PARENT_LINEAGE_INCOMPLETE');
  }

  const uniqueReasons = sortedUnique(reasons);
  const supplySourceId = root?.id ? String(root.id) : null;
  const stateFingerprint = stateFingerprintFor({
    gatewayJobId,
    requestedReason,
    parent,
    currentCatalog,
    activeContract,
    reviewerJobs,
    activeClaims,
    activePointers,
    reasons: uniqueReasons,
  });
  const reportSubject = proposedSubject;
  const reportManifest = reviewerManifest;
  const expectedGeneration = expectedLifecycleGeneration;
  return {
    gatewayJobId,
    requestedReason,
    reasons: uniqueReasons,
    parent,
    root,
    currentCatalog,
    activeContract,
    reviewerJobs,
    reviewerAudits,
    activeClaims,
    activePointers,
    proposedSubject: reportSubject,
    reviewerManifest: reportManifest,
    requestHash,
    dedupeKey,
    expectedLifecycleGeneration: expectedGeneration,
    stateFingerprint,
  };
};

const reportHashPreimageFor = (input: Readonly<{
  reason: string;
  gatewayJobId: string;
  supplySourceId: string | null;
  expectedLifecycleGeneration: number | null;
  subject: AffiliateAgentSourceExclusionReviewerSubject | null;
  manifest: AffiliateAgentEvidenceManifest | null;
  stateFingerprint: string;
  reasons: readonly string[];
  bundle: AffiliateAgentContractBundle;
}>): JsonRecord => ({
  schemaVersion: AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION,
  operation: SOURCE_EXCLUSION_OPERATION,
  gatewayJobId: input.gatewayJobId,
  reason: input.reason,
  supplySourceId: input.supplySourceId,
  expectedLifecycleGeneration: input.expectedLifecycleGeneration,
  requestHash: input.subject?.requestHash ?? null,
  subject: stableSubject(input.subject),
  manifest: input.manifest,
  stateFingerprint: input.stateFingerprint,
  reasons: sortedUnique([...input.reasons]),
  bundle: {
    schemaVersion: input.bundle.schemaVersion,
    supplyContractVersion: input.bundle.supplyContract.version,
    supplyContractHash: input.bundle.supplyContract.hash,
    deploymentContractVersion: input.bundle.deploymentContract.version,
    deploymentContractHash: input.bundle.deploymentContract.hash,
    roleContracts: input.bundle.roleContracts.map((contract) => ({ role: contract.role, version: contract.version, hash: contract.hash, promptTemplateVersion: contract.promptTemplateVersion, promptTemplateHash: contract.promptTemplateHash })),
    promptTemplates: input.bundle.promptTemplates.map((template) => ({ role: template.role, version: template.version, hash: template.hash })),
  },
});

const reportHashFor = (input: Readonly<{
  reason: string;
  gatewayJobId: string;
  supplySourceId: string | null;
  expectedLifecycleGeneration: number | null;
  subject: AffiliateAgentSourceExclusionReviewerSubject | null;
  manifest: AffiliateAgentEvidenceManifest | null;
  stateFingerprint: string;
  reasons: readonly string[];
  bundle: AffiliateAgentContractBundle;
}>): string => hashAffiliateAgentValue(reportHashPreimageFor(input));

const buildReport = (
  inspection: AdmissionInspection,
  bundle: AffiliateAgentContractBundle,
  mode: 'PREVIEW' | 'APPLY',
  reviewerJobId: string | null = null,
  replayed = false,
  writeCount = 0,
): AffiliateSourceExclusionAdmissionReport => {
  const eligible = inspection.reasons.length === 0
    && inspection.parent !== null
    && inspection.proposedSubject !== null
    && inspection.reviewerManifest !== null
    && inspection.root !== null;
  const reportHash = reportHashFor({
    reason: inspection.requestedReason,
    gatewayJobId: inspection.gatewayJobId,
    supplySourceId: inspection.root?.id ? String(inspection.root.id) : null,
    expectedLifecycleGeneration: inspection.expectedLifecycleGeneration,
    subject: inspection.proposedSubject,
    manifest: inspection.reviewerManifest,
    stateFingerprint: inspection.stateFingerprint,
    reasons: inspection.reasons,
    bundle,
  });
  return {
    schemaVersion: AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION,
    mode,
    evaluatedAt: new Date().toISOString(),
    reason: inspection.requestedReason,
    reportHash,
    eligible,
    reasonCodes: inspection.reasons,
    gatewayJobId: inspection.gatewayJobId,
    supplySourceId: inspection.root?.id ? String(inspection.root.id) : null,
    proposedReviewerSubject: inspection.proposedSubject,
    proposedReviewerManifest: inspection.reviewerManifest,
    expectedLifecycleGeneration: inspection.expectedLifecycleGeneration,
    replayed,
    writeCount,
    reviewerJobId,
  };
};

const replayReportSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['PREVIEW', 'APPLY']),
  evaluatedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(AFFILIATE_SOURCE_EXCLUSION_ADMISSION_MAX_REASON_BYTES),
  reportHash: z.string().regex(HASH_PATTERN),
  eligible: z.boolean(),
  reasonCodes: z.array(z.string().trim().min(1)).max(64),
  gatewayJobId: z.string().trim().min(1),
  supplySourceId: z.string().trim().min(1).nullable(),
  proposedReviewerSubject: affiliateAgentSourceExclusionReviewerSubjectSchema.nullable(),
  proposedReviewerManifest: affiliateAgentEvidenceManifestSchema.nullable(),
  expectedLifecycleGeneration: z.number().int().nonnegative().nullable(),
  replayed: z.boolean(),
  writeCount: z.number().int().nonnegative(),
  reviewerJobId: z.string().trim().min(1).nullable(),
}).strict();

const exactRecordKeys = (record: JsonRecord, keys: readonly string[]): boolean => {
  const expected = [...keys].sort();
  const observed = Object.keys(record).sort();
  return sameValue(observed, expected);
};

const replaySnapshotFor = (
  payload: JsonRecord,
  child: GatewayJobRow,
  expectedReportHash: string,
): z.infer<typeof replayReportSnapshotSchema> | null => {
  const parsed = replayReportSnapshotSchema.safeParse(payload.reportSnapshot);
  if (!parsed.success) return null;
  const snapshot = parsed.data;
  if (
    snapshot.reportHash.toLowerCase() !== expectedReportHash
    || snapshot.mode !== 'APPLY'
    || snapshot.replayed !== false
    || snapshot.writeCount !== 1
    || snapshot.reviewerJobId !== child.id
    || snapshot.gatewayJobId !== payload.parentGatewayJobId
    || snapshot.gatewayJobId === child.id
    || snapshot.supplySourceId !== child.supplySourceId
    || snapshot.expectedLifecycleGeneration !== child.expectedLifecycleGeneration
    || snapshot.eligible !== true
    || !snapshot.proposedReviewerSubject
    || !snapshot.proposedReviewerManifest
  ) return null;
  return snapshot;
};
const planFor = (
  inspection: AdmissionInspection,
): AdmissionPlan | null => {

  if (!inspection.parent || !inspection.proposedSubject || !inspection.reviewerManifest || !inspection.requestHash || !inspection.dedupeKey) return null;
  if (inspection.reasons.length > 0) return null;
  return {
    parent: inspection.parent,
    subject: inspection.proposedSubject,
    manifest: inspection.reviewerManifest,
    requestHash: inspection.requestHash,
    dedupeKey: inspection.dedupeKey,
    stateFingerprint: inspection.stateFingerprint,
  };
};

const auditPayloadMatches = (
  audit: GatewayEventRow,
  child: GatewayJobRow,
  expectedReportHash: string,
  requestedReason: string,
  operatorId: string,
  parent: AdmissionParent | null,
): boolean => {
  try {
    if (!parent) return false;
    const payload = recordValue(audit.payload);
    const childSubject = affiliateAgentSourceExclusionReviewerSubjectSchema.safeParse(child.subjectJson);
    const childManifest = affiliateAgentEvidenceManifestSchema.safeParse(child.evidenceManifestJson);
    if (!childSubject.success || !childManifest.success) return false;
    const snapshot = replaySnapshotFor(payload, child, expectedReportHash);
    const preimage = recordValue(payload.reportHashPreimage);
    const preimageBundle = recordValue(preimage.bundle);
    const contractScope = recordValue(payload.contractScope);
    const reviewerContract = Array.isArray(preimageBundle.roleContracts)
      ? preimageBundle.roleContracts.map(recordValue).find((contract) => contract.role === 'SUPPLY_REVIEWER') ?? null
      : null;
    const manifestArtifactIds = childManifest.data.entries.map((entry) => entry.artifactId).sort();
    const activeContractEntry = childManifest.data.entries.find((entry) => entry.kind === 'ACTIVE_SUPPLY_CONTRACT');
    const payloadKeys = [
      'operation', 'kind', 'schemaVersion', 'requestHash', 'reportHash', 'stateFingerprint', 'mutableSafetyFingerprint',
      'contractScope', 'gatewayJobId', 'dedupeKey', 'parentGatewayJobId', 'parentClaimId', 'parentResultHash',
      'parentTerminalReceiptId', 'rootId', 'supplySourceId', 'sourceId', 'mappingJobId', 'mappingId', 'intakeId',
      'runId', 'evidenceRunId', 'expectedLifecycleGeneration', 'childClaimGeneration', 'requestedByActorId',
      'operatorId', 'requestReason', 'activeSupplyContractVersion', 'activeSupplyContractHash', 'reportSnapshot',
      'subject', 'manifest', 'manifestHash', 'artifactIds', 'reportHashPreimage',
    ] as const;
    const preimageKeys = [
      'schemaVersion', 'operation', 'gatewayJobId', 'reason', 'supplySourceId', 'expectedLifecycleGeneration',
      'requestHash', 'subject', 'manifest', 'stateFingerprint', 'reasons', 'bundle',
    ] as const;
    const bundleKeys = [
      'schemaVersion', 'supplyContractVersion', 'supplyContractHash', 'deploymentContractVersion',
      'deploymentContractHash', 'roleContracts', 'promptTemplates',
    ] as const;
    const contractScopeKeys = [
      'deploymentContractVersion', 'deploymentContractHash', 'supplyContractVersion', 'supplyContractHash',
      'roleContractVersion', 'roleContractHash', 'promptTemplateVersion', 'promptTemplateHash',
    ] as const;
    if (
      !snapshot
      || !exactRecordKeys(payload, payloadKeys)
      || !exactRecordKeys(preimage, preimageKeys)
      || !exactRecordKeys(preimageBundle, bundleKeys)
      || !exactRecordKeys(contractScope, contractScopeKeys)
      || !reviewerContract
      || !normalizeHash(audit.inputHash) || normalizeHash(audit.inputHash) !== expectedReportHash
      || !normalizeHash(audit.outputHash) || audit.outputHash !== hashAffiliateAgentValue(payload)
      || normalizedUpper(audit.eventType) !== 'JOB_CREATED'
      || audit.actorKind !== 'OPERATOR'
      || audit.actorId !== operatorId
      || audit.role !== 'SUPPLY_REVIEWER'
      || audit.requestHash !== childSubject.data.requestHash
      || audit.jobId !== child.id
      || audit.claimId !== null
      || audit.receiptId !== null
      || audit.sequence !== 1
      || child.role !== 'SUPPLY_REVIEWER'
      || child.queue !== 'AFFILIATE_REVIEW'
      || child.lane !== 'SUPPLY_REVIEW'
      || child.subjectType !== 'SOURCE_EXCLUSION_REVIEW'
      || child.subjectId !== child.supplySourceId
      || child.claimGeneration !== 0 && child.claimGeneration !== 1
      || child.dedupeKey !== payload.dedupeKey
      || child.dedupeKey !== dedupeKeyFor(String(child.supplySourceId), childSubject.data.requestHash)
      || payload.operation !== SOURCE_EXCLUSION_OPERATION
      || payload.kind !== SOURCE_EXCLUSION_AUDIT_KIND
      || payload.schemaVersion !== AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION
      || payload.reportHash !== expectedReportHash
      || payload.requestReason !== requestedReason
      || payload.operatorId !== operatorId
      || payload.requestedByActorId !== operatorId
      || payload.requestHash !== childSubject.data.requestHash
      || payload.requestHash !== audit.requestHash
      || !sameValue(payload.subject, childSubject.data)
      || !sameValue(payload.manifest, childManifest.data)
      || payload.manifestHash !== childManifest.data.hash
      || !sameValue(payload.artifactIds, manifestArtifactIds)
      || payload.gatewayJobId !== child.id
      || payload.parentClaimId !== child.parentClaimId
      || payload.supplySourceId !== child.supplySourceId
      || payload.expectedLifecycleGeneration !== child.expectedLifecycleGeneration
      || payload.parentGatewayJobId !== parent.job.id
      || payload.parentClaimId !== parent.claim.id
      || normalizeHash(payload.parentResultHash) !== normalizeHash(parent.job.resultHash)
      || payload.parentTerminalReceiptId !== parent.claim.terminalReceiptId
      || payload.intakeId !== parent.intake.id
      || payload.runId !== parent.run.id
      || payload.evidenceRunId !== parent.run.id
      || payload.sourceId !== parent.source.id
      || payload.mappingJobId !== parent.mappingJob.id
      || payload.mappingId !== (parent.mapping?.id ?? null)
      || payload.rootId !== parent.root.id
      || payload.activeSupplyContractVersion !== preimageBundle.supplyContractVersion
      || payload.activeSupplyContractHash !== activeContractEntry?.sha256
      || payload.childClaimGeneration !== 0
      || payload.reportSnapshot !== undefined && !sameValue(payload.reportSnapshot, snapshot)
      || payload.reportHashPreimage !== undefined && hashAffiliateAgentValue(preimage) !== expectedReportHash
      || preimage.schemaVersion !== AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION
      || preimage.operation !== SOURCE_EXCLUSION_OPERATION
      || preimage.gatewayJobId !== snapshot.gatewayJobId
      || preimage.reason !== snapshot.reason
      || preimage.supplySourceId !== snapshot.supplySourceId
      || preimage.expectedLifecycleGeneration !== snapshot.expectedLifecycleGeneration
      || preimage.requestHash !== childSubject.data.requestHash
      || !sameValue(preimage.subject, stableSubject(snapshot.proposedReviewerSubject))
      || !sameValue(preimage.manifest, snapshot.proposedReviewerManifest)
      || preimage.stateFingerprint !== payload.stateFingerprint
      || preimageBundle.schemaVersion !== 1
      || !normalizeHash(payload.mutableSafetyFingerprint)
      || preimageBundle.supplyContractVersion !== contractScope.supplyContractVersion
      || preimageBundle.supplyContractHash !== contractScope.supplyContractHash
      || preimageBundle.deploymentContractVersion !== contractScope.deploymentContractVersion
      || preimageBundle.deploymentContractHash !== contractScope.deploymentContractHash
      || reviewerContract.version !== contractScope.roleContractVersion
      || reviewerContract.hash !== contractScope.roleContractHash
      || reviewerContract.promptTemplateVersion !== contractScope.promptTemplateVersion
      || reviewerContract.promptTemplateHash !== contractScope.promptTemplateHash
    ) return false;
    return true;
  } catch {
    return false;
  }
};

const replayReportFor = (
  audit: GatewayEventRow,
  child: GatewayJobRow,
  expectedReportHash: string,
  operatorId: string,
): AffiliateSourceExclusionAdmissionApplyReport => {
  const payload = recordValue(audit.payload);
  const snapshot = replaySnapshotFor(payload, child, expectedReportHash);
  if (!snapshot) {
    throw new AffiliateSourceExclusionAdmissionError(
      'ADMISSION_REPORT_DRIFT',
      'The stored source exclusion admission report is incomplete and cannot be replayed safely.',
    );
  }
  if (payload.operatorId !== operatorId) {
    throw new AffiliateSourceExclusionAdmissionError('ACTOR_MISMATCH', 'The source exclusion request belongs to another operator.');
  }
  return {
    ...snapshot,
    mode: 'APPLY',
    replayed: true,
    writeCount: 0,
    reviewerJobId: String(child.id),
  };
};

const replayImmutableDriftCodes = (reasons: readonly string[]): string[] => reasons.filter((code) => {
  if ([
    'PARENT_JOB_GENERATION_MISMATCH',
    'PARENT_ENVELOPE_GENERATION_MISMATCH',
    'PARENT_MAPPING_JOB_NOT_HELD',
    'PARENT_MAPPING_JOB_STATUS_INVALID',
    'PARENT_MAPPING_JOB_HAS_ACTIVE_LEASE',
  ].includes(code)) return false;
  return (
    code.startsWith('PARENT_')
    || code.startsWith('PAGE_')
    || code.startsWith('INVALID_PAGE')
    || code.startsWith('MISSING_PAGE')
    || code.startsWith('IMMUTABLE_')
    || code.startsWith('EVIDENCE_NOT_PINNED')
    || code.startsWith('SOURCE_EVIDENCE')
    || code.startsWith('PARENT_CITATION')
    || code.startsWith('CAPTURE_RUN_')
    || code.startsWith('MAPPING_JOB_')
    || code.startsWith('MAPPING_')
    || code.startsWith('ROOT_LINK_')
    || code.startsWith('SOURCE_LINK_')
    || code.startsWith('IDENTITY_')
    || code.startsWith('CANDIDATE_IDENTITY_')
    || code.startsWith('CANDIDATE_MAPPING_')
    || code.startsWith('TARGET_IDENTITY_')
    || code.startsWith('SOURCE_JOB_ROOT_')
    || [
      'ROOT_INTAKE_MISMATCH',
      'ROOT_SOURCE_MISMATCH',
      'SOURCE_ROOT_MISMATCH',
      'INTAKE_SOURCE_MISMATCH',
      'INTAKE_ROOT_MISMATCH',
      'ACTIVE_MAPPING_MISMATCH',
      'SOURCE_TARGET_KIND_MISMATCH',
      'ORGANIZATION_BINDING_DRIFT',
    ].includes(code)
    || code === 'SOURCE_KEY_MISMATCH'
    || code === 'ORGANIZATION_MISSING'
    || code === 'SOURCE_IDENTITY_DRIFT'
  );
});

const findReplay = (
  inspection: AdmissionInspection,
  expectedReportHash: string,
  requestedReason: string,
  operatorId: string,
): AffiliateSourceExclusionAdmissionApplyReport | null => {
  for (const child of inspection.reviewerJobs) {
    const audits = inspection.reviewerAudits.filter((audit) => audit.jobId === child.id && normalizedUpper(audit.eventType) === 'JOB_CREATED');
    const matchingAudits = audits.filter((audit) => recordValue(audit.payload).reportHash === expectedReportHash);
    if (matchingAudits.length === 0) continue;
    if (audits.length !== 1 || matchingAudits.length !== 1) {
      throw new AffiliateSourceExclusionAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The source exclusion admission audit is not unique.',
      );
    }
    const audit = matchingAudits[0]!;
    const immutableDrift = replayImmutableDriftCodes(inspection.reasons);
    if (immutableDrift.length > 0) {
      throw new AffiliateSourceExclusionAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The stored source exclusion admission report no longer matches immutable source evidence.',
        { reasonCodes: immutableDrift.slice(0, 64) },
      );
    }
    const payload = recordValue(audit.payload);
    if (
      payload.operation === SOURCE_EXCLUSION_OPERATION
      && payload.requestReason === requestedReason
      && inspection.parent
      && payload.parentGatewayJobId === inspection.parent.job.id
      && payload.operatorId !== operatorId
    ) {
      throw new AffiliateSourceExclusionAdmissionError('ACTOR_MISMATCH', 'The source exclusion request belongs to another operator.');
    }
    if (!auditPayloadMatches(audit, child, expectedReportHash, requestedReason, operatorId, inspection.parent)) {
      throw new AffiliateSourceExclusionAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The source exclusion admission audit no longer matches its immutable reviewer job.',
      );
    }
    return replayReportFor(audit, child, expectedReportHash, operatorId);
  }
  return null;
};

const assertNoConflictingChildren = (
  inspection: AdmissionInspection,
  plan: AdmissionPlan,
): void => {
  for (const child of inspection.reviewerJobs) {
    if (child.dedupeKey === plan.dedupeKey) {
      throw new AffiliateSourceExclusionAdmissionError('ADMISSION_REPORT_DRIFT', 'An existing source exclusion job did not match the exact audited replay.');
    }
    if (PENDING_SOURCE_EXCLUSION_JOB_STATUSES[normalizedUpper(child.status)]) {
      throw new AffiliateSourceExclusionAdmissionError('PENDING_SOURCE_EXCLUSION_JOB', 'Another source exclusion review is pending for this Supply Source.');
    }
  }
};

const assertNoActiveClaimsOrPointers = (inspection: AdmissionInspection): void => {
  if (inspection.activeClaims.length > 0 || inspection.activePointers.length > 0) {
    throw new AffiliateSourceExclusionAdmissionError('CLAIM_DRIFT', 'An active Gateway claim or retained claim pointer blocks source exclusion admission.');
  }
};

const applyPlan = async (
  transaction: Prisma.TransactionClient,
  plan: AdmissionPlan,
  report: AffiliateSourceExclusionAdmissionReport,
  operatorId: string,
  bundle: AffiliateAgentContractBundle,
): Promise<Readonly<{ reviewerJobId: string; report: AffiliateSourceExclusionAdmissionApplyReport }>> => {
  const reviewerRole = bundle.roleContracts.find((contract) => contract.role === 'SUPPLY_REVIEWER')!;
  const childId = createId();
  const childSubject = {
    ...plan.subject,
    requestedByActorId: operatorId,
  } satisfies AffiliateAgentSourceExclusionReviewerSubject;
  const childReport: AffiliateSourceExclusionAdmissionApplyReport = {
    ...report,
    mode: 'APPLY',
    proposedReviewerSubject: childSubject,
    reviewerJobId: childId,
    replayed: false,
    writeCount: 1,
  };
  const reportHashPreimage = reportHashPreimageFor({
    reason: report.reason,
    gatewayJobId: report.gatewayJobId,
    supplySourceId: report.supplySourceId,
    expectedLifecycleGeneration: report.expectedLifecycleGeneration,
    subject: childSubject,
    manifest: plan.manifest,
    stateFingerprint: plan.stateFingerprint,
    reasons: report.reasonCodes,
    bundle,
  });
  const existing = await readUnique(transaction, 'affiliateAgentGatewayJobs', { where: { dedupeKey: plan.dedupeKey } });
  if (existing) {
    throw new AffiliateSourceExclusionAdmissionError('PENDING_SOURCE_EXCLUSION_JOB', 'A source exclusion reviewer already exists for this request.');
  }
  const now = new Date();
  const jobDelegate = delegateFor(transaction, 'affiliateAgentGatewayJobs');
  if (typeof jobDelegate.create !== 'function') throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_UNAVAILABLE', 'Gateway job persistence is unavailable.');
  await jobDelegate.create({
    data: {
      id: childId,
      dedupeKey: plan.dedupeKey,
      queue: 'AFFILIATE_REVIEW',
      lane: 'SUPPLY_REVIEW',
      role: 'SUPPLY_REVIEWER',
      subjectType: 'SOURCE_EXCLUSION_REVIEW',
      subjectId: String(plan.parent.root.id),
      subjectJson: asPrismaJson(childSubject),
      evidenceManifestJson: asPrismaJson(plan.manifest),
      supplySourceId: String(plan.parent.root.id),
      expectedLifecycleGeneration: plan.parent.root.lifecycleGeneration,
      status: 'QUEUED',
      priority: 0,
      nextAttemptAt: now,
      claimGeneration: 0,
      activeClaimId: null,
      parentClaimId: String(plan.parent.claim.id),
      eventSequence: 1,
    },
  });
  const payload = {
    operation: SOURCE_EXCLUSION_OPERATION,
    kind: SOURCE_EXCLUSION_AUDIT_KIND,
    schemaVersion: AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION,
    requestHash: childSubject.requestHash,
    reportHash: report.reportHash,
    stateFingerprint: plan.stateFingerprint,
    mutableSafetyFingerprint: mutableSafetyFingerprintFor(plan.parent),
    reportHashPreimage,
    contractScope: {
      deploymentContractVersion: bundle.deploymentContract.version,
      deploymentContractHash: bundle.deploymentContract.hash,
      supplyContractVersion: bundle.supplyContract.version,
      supplyContractHash: bundle.supplyContract.hash,
      roleContractVersion: reviewerRole.version,
      roleContractHash: reviewerRole.hash,
      promptTemplateVersion: reviewerRole.promptTemplateVersion,
      promptTemplateHash: reviewerRole.promptTemplateHash,
    },
    gatewayJobId: childId,
    dedupeKey: plan.dedupeKey,
    parentGatewayJobId: plan.parent.job.id,
    parentClaimId: plan.parent.claim.id,
    parentResultHash: plan.parent.job.resultHash,
    parentTerminalReceiptId: plan.parent.claim.terminalReceiptId,
    rootId: plan.parent.root.id,
    supplySourceId: plan.parent.root.id,
    sourceId: plan.parent.source.id,
    mappingJobId: plan.parent.mappingJob.id,
    mappingId: plan.parent.mapping?.id ?? null,
    intakeId: plan.parent.intake.id,
    runId: plan.parent.run.id,
    evidenceRunId: plan.parent.run.id,
    expectedLifecycleGeneration: plan.parent.root.lifecycleGeneration,
    childClaimGeneration: 0,
    requestedByActorId: operatorId,
    operatorId,
    requestReason: report.reason,
    activeSupplyContractVersion: plan.parent.activeContract.policy.version,
    activeSupplyContractHash: report.proposedReviewerManifest?.entries.find((entry) => entry.kind === 'ACTIVE_SUPPLY_CONTRACT')?.sha256 ?? null,
    reportSnapshot: childReport,
    subject: childSubject,
    manifest: plan.manifest,
    manifestHash: plan.manifest.hash,
    artifactIds: plan.manifest.entries.map((entry) => entry.artifactId).sort(),
  };
  const eventDelegate = delegateFor(transaction, 'affiliateAgentGatewayEvents');
  if (typeof eventDelegate.create !== 'function') throw new AffiliateSourceExclusionAdmissionError('PERSISTENCE_UNAVAILABLE', 'Gateway event persistence is unavailable.');
  await eventDelegate.create({
    data: {
      id: createId(),
      eventKey: `source-exclusion-admission:${childId}`,
      jobId: childId,
      claimId: null,
      receiptId: null,
      sequence: 1,
      eventType: 'JOB_CREATED',
      actorKind: 'OPERATOR',
      actorId: operatorId,
      role: 'SUPPLY_REVIEWER',
      requestHash: childSubject.requestHash,
      inputHash: report.reportHash,
      outputHash: hashAffiliateAgentValue(payload),
      reasonCodes: [...report.reasonCodes],
      payload: asPrismaJson(payload),
      retentionClass: 'INDEFINITE',
    },
  });
  return { reviewerJobId: childId, report: childReport };
};

const withSerializableTransaction = async <T>(
  prisma: PrismaClient,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => prisma.$transaction(callback, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 120_000,
});

export const previewAffiliateSourceExclusionAdmission = async (
  input: PreviewAffiliateSourceExclusionAdmissionInput,
): Promise<AffiliateSourceExclusionAdmissionPreview> => {
  const bundle = parsedBundle(input.bundle);
  const gatewayJobId = gatewayJobIdText(input.gatewayJobId);
  const reason = reasonText(input.reason);
  const operatorId = operatorIdText(input.operatorId);
  if (!input.artifactStore || typeof input.artifactStore.readImmutable !== 'function') {
    throw new AffiliateSourceExclusionAdmissionError('ARTIFACT_STORE_REQUIRED', 'An immutable artifact store is required for source exclusion admission.');
  }
  const inspection = await inspectAdmission(input.prisma, input.artifactStore, bundle, gatewayJobId, reason, operatorId);
  return buildReport(inspection, bundle, 'PREVIEW') as AffiliateSourceExclusionAdmissionPreview;
};

export const applyAffiliateSourceExclusionAdmission = async (
  input: ApplyAffiliateSourceExclusionAdmissionInput,
): Promise<AffiliateSourceExclusionAdmissionApplyReport> => {
  const bundle = parsedBundle(input.bundle);
  const gatewayJobId = gatewayJobIdText(input.gatewayJobId);
  const reason = reasonText(input.reason);
  const operatorId = operatorIdText(input.operatorId);
  const expectedReportHash = expectedHashText(input.expectedReportHash);
  if (!input.artifactStore || typeof input.artifactStore.readImmutable !== 'function') {
    throw new AffiliateSourceExclusionAdmissionError('ARTIFACT_STORE_REQUIRED', 'An immutable artifact store is required for source exclusion admission.');
  }
  return withSerializableTransaction(input.prisma, async (transaction) => {
    const inspection = await inspectAdmission(transaction, input.artifactStore, bundle, gatewayJobId, reason, operatorId);
    const replay = findReplay(inspection, expectedReportHash, reason, operatorId);
    if (replay) return replay;
    assertNoActiveClaimsOrPointers(inspection);
    if (inspection.reasons.some((code) => code === 'ACTIVE_CONTRACT_DRIFT' || code === 'ROOT_ACTIVE_CONTRACT_DRIFT' || code === 'ROOT_ROLLOUT_COHORT_MISMATCH')) {
      throw new AffiliateSourceExclusionAdmissionError('ACTIVE_CONTRACT_DRIFT', 'The current active Supply Contract no longer matches the reviewed admission.');
    }
    const report = buildReport(inspection, bundle, 'APPLY');
    if (report.reportHash !== expectedReportHash) {
      throw new AffiliateSourceExclusionAdmissionError(
        'ADMISSION_REPORT_DRIFT',
        'The reviewed source exclusion admission report no longer matches current state.',
        { expectedReportHash, observedReportHash: report.reportHash },
      );
    }
    const plan = planFor(inspection);
    if (!plan || !report.eligible) {
      throw new AffiliateSourceExclusionAdmissionError(
        'SOURCE_EXCLUSION_NOT_ELIGIBLE',
        'The completed producer hold is not eligible for source exclusion review.',
        { reasonCodes: report.reasonCodes },
      );
    }
    assertNoConflictingChildren(inspection, plan);
    const applied = await applyPlan(transaction, plan, report, operatorId, bundle);
    return applied.report;
  });
};

export const calculateAffiliateSourceExclusionAdmissionReportHash = (
  report: Pick<AffiliateSourceExclusionAdmissionReport, 'reason' | 'gatewayJobId' | 'supplySourceId' | 'expectedLifecycleGeneration' | 'proposedReviewerSubject' | 'proposedReviewerManifest' | 'reasonCodes'> & Readonly<{ stateFingerprint?: string; bundle: AffiliateAgentContractBundle }>,
): string => reportHashFor({
  reason: report.reason,
  gatewayJobId: report.gatewayJobId,
  supplySourceId: report.supplySourceId,
  expectedLifecycleGeneration: report.expectedLifecycleGeneration,
  subject: report.proposedReviewerSubject,
  manifest: report.proposedReviewerManifest,
  stateFingerprint: report.stateFingerprint ?? '',
  reasons: report.reasonCodes,
  bundle: parsedBundle(report.bundle),
});

function bindingError(message: string, details: JsonRecord = {}): never {
  throw new AffiliateSourceExclusionAdmissionError('CLAIM_BINDING_INVALID', message, details);
}

const bindingEqual = (field: string, expected: unknown, observed: unknown): void => {
  if (!sameValue(expected, observed)) bindingError(`Source exclusion claim binding field ${field} does not match.`, { field, expected, observed });
};

const assertSourceArtifactBinding = async (
  client: AdmissionClient,
  parentSubject: AffiliateAgentHistoricalMappingProducerSubject,
  parentJob: GatewayJobRow,
  childManifest: AffiliateAgentEvidenceManifest,
): Promise<Readonly<{
  mappingJobId: string;
  mappingId: string | null;
  intakeId: string;
  runId: string;
  sourceId: string;
  rootId: string;
}>> => {
  const mappingJob = await readUnique(client, 'affiliateSourceMappingJobs', { where: { id: parentSubject.mappingJobId } });
  if (!mappingJob) bindingError('The source exclusion parent Mapping Job is missing.');
  const intakeId = stringValue(recordValue(parentSubject.repairContext).intakeId);
  const runId = stringValue(recordValue(parentSubject.repairContext).evidenceRunId);
  const rootId = stringValue(parentJob.supplySourceId) ?? parentSubject.supplySourceId;
  if (!intakeId || !runId || mappingJob.intakeId !== intakeId) bindingError('The source exclusion parent intake binding is invalid.');
  const intake = await readUnique(client, 'affiliateSourceIntakes', { where: { id: intakeId } });
  const sourceId = stringValue(mappingJob.sourceId) ?? stringValue(intake?.affiliateSourceId);
  const source = sourceId ? await readUnique(client, 'affiliateScrapeSources', { where: { id: sourceId } }) : null;
  const root = await readUnique(client, 'affiliateSupplySources', { where: { id: rootId } });
  const mapping = stringValue(mappingJob.mappingId)
    ? await readUnique(client, 'affiliateScrapeMappings', { where: { id: mappingJob.mappingId } })
    : null;
  const run = await readUnique(client, 'affiliateSourceIntakeRuns', { where: { id: runId } });
  const identity = source && intake ? sourceIdentityFor(source, intake) : null;
  if (
    !intake || !source || !root || !run
    || source.supplySourceId !== rootId
    || intake.supplySourceId !== rootId
    || intake.affiliateSourceId !== source.id
    || root.intakeId !== intake.id
    || root.liveSourceId !== source.id
    || mappingJob.sourceId !== source.id
    || mappingJob.supplySourceId !== rootId
    || mappingJob.mappingId !== (mapping?.id ?? null)
    || mapping && (mapping.sourceId !== source.id || mapping.supplySourceId !== rootId)
    || run.intakeId !== intake.id
    || run.supplySourceId !== null && run.supplySourceId !== rootId
    || !identity
    || identity.identityKey !== root.identityKey
    || identity.canonicalUrl !== root.canonicalUrl
    || identity.origin !== root.origin
    || identity.pathKey !== root.pathKey
  ) bindingError('The source exclusion source, intake, mapping, run, and root links are invalid.');
  if (parentJob.supplySourceId !== rootId || mappingJob.supplySourceId !== rootId) bindingError('The source exclusion parent root binding is invalid.');
  const parentManifest = affiliateAgentEvidenceManifestSchema.safeParse(parentJob.evidenceManifestJson);
  if (!parentManifest.success) bindingError('The parent evidence manifest is invalid.');
  const parentPages = parentManifest.data.entries.filter((entry) => PAGE_KINDS[entry.kind] === true);
  const childPages = childManifest.entries.filter((entry) => PAGE_KINDS[entry.kind] === true);
  if (!sameValue(parentPages, childPages)) bindingError('The source exclusion reviewer did not copy the parent PAGE evidence.');
  const artifacts = await readBatched(client, 'affiliateSourceIntakeArtifacts', { intakeId, runId, kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN', 'PAGE_SCREENSHOT'] } });
  const fileIds = sortedUnique(artifacts.map((artifact) => {
    const id = stringValue(artifact.fileId);
    if (!id) bindingError('The source exclusion reviewer artifact file id is missing.');
    return id;
  }));
  const files = fileIds.length ? await readBatched(client, 'file', { id: { in: fileIds } }) : [];
  const filesById = new Map(files.map((file) => [String(file.id), file]));
  const ownedOrigins = new Set([urlOrigin(source.listUrl), urlOrigin(source.baseUrl), urlOrigin(intake.baseUrl)].filter((value): value is string => Boolean(value)));
  for (const entry of childPages) {
    const artifactId = pageEntryArtifactId(entry);
    const artifact = artifactId ? artifacts.find((candidate) => String(candidate.id) === artifactId) ?? null : null;
    const file = artifact ? filesById.get(String(artifact.fileId)) ?? null : null;
    const sourceUrl = stringValue(artifact?.sourceUrl);
    const finalUrl = stringValue(artifact?.finalUrl);
    const fileSize = typeof file?.sizeBytes === 'number' && Number.isInteger(file.sizeBytes) ? file.sizeBytes : null;
    if (
      !artifact || !file
      || normalizedUpper(artifact.kind) !== normalizedUpper(entry.kind)
      || artifact.intakeId !== intakeId
      || artifact.runId !== runId
      || (artifact.supplySourceId !== null && artifact.supplySourceId !== rootId)
      || artifact.isPinned !== true
      || !file.path
      || !stringValue(file.mimeType)
      || file.mimeType !== entry.mimeType
      || artifact.mimeType !== entry.mimeType
      || artifactExpectedHash(artifact) !== entry.sha256
      || artifact.sizeBytes !== entry.byteSize
      || fileSize !== entry.byteSize
      || (!sourceUrl && !finalUrl)
      || [sourceUrl, finalUrl].filter((value): value is string => Boolean(value)).some((url) => {
        const origin = urlOrigin(url);
        return !origin || !ownedOrigins.has(origin);
      })
    ) bindingError('The source exclusion reviewer artifact metadata is not bound to the manifest.');
  }
  const parentResult = parentResultFor(parentJob);
  const sportEvidence = parentResult ? recordValue(recordValue(parentResult.payload).sportEvidence) : {};
  if (!parentResult) bindingError('The source exclusion parent result is invalid.');
  for (const determination of Array.isArray(sportEvidence.sportDeterminations) ? sportEvidence.sportDeterminations : []) {
    for (const citation of Array.isArray(recordValue(determination).evidence) ? recordValue(determination).evidence as unknown[] : []) {
      const citationRecord = recordValue(citation);
      const artifactId = stringValue(citationRecord.artifactId);
      const entry = artifactId ? parentPages.find((candidate) => candidate.artifactId === artifactId) ?? null : null;
      const artifact = entry ? artifacts.find((candidate) => String(candidate.id) === pageEntryArtifactId(entry)) ?? null : null;
      const citedUrl = stringValue(citationRecord.pageUrl);
      const artifactUrls = [stringValue(artifact?.sourceUrl), stringValue(artifact?.finalUrl)]
        .filter((url): url is string => Boolean(url));
      if (
        !entry
        || !artifact
        || citationRecord.artifactSha256 !== entry.sha256
        || citationRecord.artifactKind !== entry.kind
        || !parentResult.evidenceRefs.includes(entry.evidenceRef)
        || !citedUrl
        || !artifactUrls.some((url) => {
          try {
            return new URL(url).toString() === new URL(citedUrl).toString();
          } catch {
            return false;
          }
        })
      ) bindingError('The source exclusion citation is not bound to source-owned evidence.');
    }
  }
  const contractEntries = childManifest.entries.filter((entry) => entry.kind === 'ACTIVE_SUPPLY_CONTRACT');
  if (contractEntries.length !== 1 || childManifest.entries.length !== childPages.length + 1) bindingError('The source exclusion reviewer must carry exactly the copied PAGE evidence and one active Supply Contract entry.');
  return {
    mappingJobId: String(mappingJob.id),
    mappingId: stringValue(mappingJob.mappingId),
    intakeId,
    runId,
    sourceId: String(source.id),
    rootId: String(root.id),
  };
};

const assertParentImmutableBinding = async (
  client: AdmissionClient,
  child: GatewayJobRow,
  subject: AffiliateAgentSourceExclusionReviewerSubject,
): Promise<Readonly<{ parentJob: GatewayJobRow; parentClaim: GatewayClaimRow; parentEnvelope: HistoricalProducerEnvelope; parentResult: MappingProducerGapResult }>> => {
  const parentClaim = await readUnique(client, 'affiliateAgentGatewayClaims', { where: { id: subject.producerClaimId } });
  if (!parentClaim) bindingError('The source exclusion producer claim is missing.');
  const parentJob = await readUnique(client, 'affiliateAgentGatewayJobs', { where: { id: parentClaim.jobId } });
  if (!parentJob) bindingError('The source exclusion producer Gateway job is missing.');
  const reasons: string[] = [];
  const validated = parentEnvelopeValid(parentJob, parentClaim, parentClaim.terminalReceiptId ? await readUnique(client, 'affiliateAgentGatewayOperationReceipts', { where: { id: parentClaim.terminalReceiptId } }) : null, reasons);
  await validateParentChain(client, parentJob, parentClaim, reasons);
  if (reasons.length) bindingError('The source exclusion producer lineage is not immutable.', { reasonCodes: reasons });
  const parentEnvelope = validated.envelope;
  const parentResult = validated.result;
  if (!parentEnvelope || parentEnvelope.role !== 'MAPPING_PRODUCER' || parentEnvelope.subject.type !== 'MAPPING_PRODUCER' || !parentResult) bindingError('The source exclusion producer lineage is not a completed Mapping Producer gap.');
  bindingEqual('parent claim id', parentEnvelope.claimId, subject.producerClaimId);
  bindingEqual('parent worker id', parentEnvelope.workerId, subject.producerWorkerId);
  bindingEqual('parent invocation id', parentEnvelope.invocationId, subject.producerInvocationId);
  bindingEqual('parent workspace id', parentEnvelope.workspaceId, subject.producerWorkspaceId);
  bindingEqual('parent Supply Source id', parentEnvelope.subject.supplySourceId, subject.supplySourceId);
  bindingEqual('parent result hash', hashAffiliateAgentValue(parentResult), subject.producerResultHash);
  if (child.parentClaimId !== parentClaim.id || child.supplySourceId !== subject.supplySourceId || child.subjectId !== subject.supplySourceId) bindingError('The source exclusion reviewer parent or source identity is invalid.');
  return { parentJob, parentClaim, parentEnvelope, parentResult };
};

export const assertAffiliateSourceExclusionClaimBinding = async (input: Readonly<{
  prisma: PrismaClient | Prisma.TransactionClient;
  job: unknown;
  claim: unknown;
}>): Promise<void> => {
  const client = input.prisma;
  const job = recordValue(input.job);
  const claim = recordValue(input.claim);
  if (normalizedUpper(job.role) !== 'SUPPLY_REVIEWER' || normalizedUpper(job.subjectType) !== 'SOURCE_EXCLUSION_REVIEW') bindingError('The Gateway job is not a source exclusion reviewer job.');
  if (!String(job.dedupeKey ?? '').startsWith(AFFILIATE_AGENT_SOURCE_EXCLUSION_REVIEWER_PREFIX)) bindingError('The source exclusion reviewer job does not use the bounded single-claim prefix.');
  if (job.claimGeneration !== 0 && job.claimGeneration !== 1) bindingError('The source exclusion reviewer generation is invalid.');
  const parsedSubject = affiliateAgentSourceExclusionReviewerSubjectSchema.safeParse(job.subjectJson);
  const parsedManifest = affiliateAgentEvidenceManifestSchema.safeParse(job.evidenceManifestJson);
  if (!parsedSubject.success || !parsedManifest.success) bindingError('The source exclusion reviewer subject or manifest is invalid.');
  const subject = parsedSubject.data;
  const manifest = parsedManifest.data;
  if (job.supplySourceId !== subject.supplySourceId || job.subjectId !== subject.supplySourceId || job.parentClaimId !== subject.producerClaimId) bindingError('The source exclusion reviewer job binding is invalid.');
  const parsedClaim = affiliateAgentClaimEnvelopeSchema.safeParse(input.claim);
  if (!parsedClaim.success || parsedClaim.data.role !== 'SUPPLY_REVIEWER' || parsedClaim.data.subject.type !== 'SOURCE_EXCLUSION_REVIEW') bindingError('The source exclusion reviewer claim envelope is invalid.');
  const envelope = parsedClaim.data;
  bindingEqual('claim job id', envelope.jobId, job.id);
  bindingEqual('job queue', envelope.queue, job.queue);
  bindingEqual('job lane', envelope.lane, job.lane);
  bindingEqual('job role', envelope.role, job.role);
  bindingEqual('job expected lifecycle generation', envelope.lifecycleGeneration, job.expectedLifecycleGeneration);
  if (envelope.claimGeneration !== 1 || (job.claimGeneration !== 0 && job.claimGeneration !== envelope.claimGeneration)) {
    bindingError('The source exclusion claim generation does not match its single-claim job.');
  }
  bindingEqual('claim Supply Source id', envelope.supplySourceId, subject.supplySourceId);
  bindingEqual('claim subject', envelope.subject, subject);
  bindingEqual('claim manifest', envelope.evidenceManifest, manifest);
  const activeEntry = manifest.entries.find((entry) => entry.kind === 'ACTIVE_SUPPLY_CONTRACT');
  if (!activeEntry || activeEntry.artifactId !== `supply-contract:${envelope.supplyContractHash}` || activeEntry.sha256 !== envelope.supplyContractHash) bindingError('The source exclusion active Supply Contract artifact is not bound to the claim.');
  if (envelope.executionBudget !== 'SINGLE_CLAIM') bindingError('The source exclusion reviewer claim is not single-claim bounded.');
  if (envelope.workerId === subject.requestedByActorId) bindingError('The source exclusion reviewer worker must differ from the requesting operator.');
  const parent = await assertParentImmutableBinding(client, job, subject);
  if (parent.parentEnvelope?.subject.type !== 'MAPPING_PRODUCER') bindingError('The source exclusion parent subject is invalid.');
  const expectedRequestHash = requestHashFor({
    gatewayJobId: String(parent.parentJob.id),
    supplySourceId: subject.supplySourceId,
    producerClaimId: subject.producerClaimId,
    producerResultHash: subject.producerResultHash,
    reason: subject.requestReason,
    requestedByActorId: subject.requestedByActorId,
  });
  bindingEqual('request hash', expectedRequestHash, subject.requestHash);
  bindingEqual('reviewer dedupe key', dedupeKeyFor(subject.supplySourceId, subject.requestHash), job.dedupeKey);
  if (job.expectedLifecycleGeneration !== envelope.lifecycleGeneration) bindingError('The source exclusion reviewer lifecycle generation binding is invalid.');
  const sourceBinding = await assertSourceArtifactBinding(client, parent.parentEnvelope.subject, parent.parentJob, manifest);
  const audits = (await readBatched(client, 'affiliateAgentGatewayEvents', { jobId: job.id, eventType: 'JOB_CREATED' }))
    .filter((event) => normalizedUpper(event.eventType) === 'JOB_CREATED');
  if (audits.length !== 1) bindingError('The source exclusion reviewer must have one immutable operator audit.');
  const audit = audits[0]!;
  const payload = recordValue(audit.payload);
  const contractScope = recordValue(payload.contractScope);
  for (const field of [
    'deploymentContractVersion', 'deploymentContractHash',
    'supplyContractVersion', 'supplyContractHash',
    'roleContractVersion', 'roleContractHash',
    'promptTemplateVersion', 'promptTemplateHash',
  ] as const) {
    bindingEqual(`reviewed ${field}`, contractScope[field], envelope[field]);
  }
  const reportHash = normalizeHash(payload.reportHash);
  const replaySnapshot = reportHash ? replaySnapshotFor(payload, job, reportHash) : null;
  if (
    !replaySnapshot
    || !normalizeHash(audit.inputHash)
    || audit.inputHash !== payload.reportHash
    || !normalizeHash(audit.outputHash)
    || audit.outputHash !== hashAffiliateAgentValue(payload)
    || audit.actorId !== subject.requestedByActorId
    || audit.actorKind !== 'OPERATOR'
    || audit.role !== 'SUPPLY_REVIEWER'
    || audit.requestHash !== subject.requestHash
    || audit.jobId !== job.id
    || audit.claimId !== null
    || audit.receiptId !== null
    || audit.sequence !== 1
    || payload.operation !== SOURCE_EXCLUSION_OPERATION
    || payload.kind !== SOURCE_EXCLUSION_AUDIT_KIND
    || payload.schemaVersion !== AFFILIATE_SOURCE_EXCLUSION_ADMISSION_SCHEMA_VERSION
    || payload.requestHash !== subject.requestHash
    || payload.requestReason !== subject.requestReason
    || payload.requestedByActorId !== subject.requestedByActorId
    || payload.operatorId !== subject.requestedByActorId
    || !sameValue(payload.subject, subject)
    || !sameValue(payload.manifest, manifest)
    || payload.manifestHash !== manifest.hash
    || payload.gatewayJobId !== job.id
    || payload.parentGatewayJobId !== parent.parentJob.id
    || payload.parentClaimId !== parent.parentClaim.id
    || normalizeHash(payload.parentResultHash) !== normalizeHash(subject.producerResultHash)
    || payload.rootId !== subject.supplySourceId
    || payload.supplySourceId !== sourceBinding.rootId
    || payload.sourceId !== sourceBinding.sourceId
    || payload.mappingJobId !== sourceBinding.mappingJobId
    || payload.mappingId !== sourceBinding.mappingId
    || payload.activeSupplyContractVersion !== envelope.supplyContractVersion
    || payload.runId !== sourceBinding.runId
    || payload.evidenceRunId !== sourceBinding.runId
    || payload.expectedLifecycleGeneration !== job.expectedLifecycleGeneration
    || payload.activeSupplyContractHash !== manifest.entries.find((entry) => entry.kind === 'ACTIVE_SUPPLY_CONTRACT')?.sha256
    || payload.childClaimGeneration !== 0
    || !normalizeHash(payload.mutableSafetyFingerprint)
  ) bindingError('The source exclusion reviewer operator audit is not bound to the claim.');
};

const runIdFromContext = (context: unknown): string | null => stringValue(recordValue(context).evidenceRunId);
const executionStateDrift = (reasonCodes: readonly string[] = []): AffiliateSourceExclusionAdmissionError => (
  new AffiliateSourceExclusionAdmissionError(
    'EXECUTION_STATE_DRIFT',
    'The source exclusion execution state is no longer safe.',
    { reasonCodes: sortedUnique([...reasonCodes]).slice(0, 64) },
  )
);

const executionParentFor = async (
  client: AdmissionClient,
  child: GatewayJobRow,
  parentJob: GatewayJobRow,
  parentClaim: GatewayClaimRow,
  parentEnvelope: HistoricalProducerEnvelope,
  parentResult: MappingProducerGapResult,
): Promise<AdmissionParent> => {
  const subject = parentEnvelope.subject;
  if (subject.type !== 'MAPPING_PRODUCER') throw executionStateDrift(['PARENT_SUBJECT_INVALID']);
  const rootId = stringValue(child.supplySourceId) ?? stringValue(parentJob.supplySourceId) ?? subject.supplySourceId;
  const mappingJobId = stringValue(subject.mappingJobId);
  const intakeId = stringValue(recordValue(subject.repairContext).intakeId);
  const runId = stringValue(recordValue(subject.repairContext).evidenceRunId);
  if (!rootId || !mappingJobId || !intakeId || !runId) throw executionStateDrift(['EXECUTION_IDENTITY_MISSING']);
  const root = await readUnique(client, 'affiliateSupplySources', { where: { id: rootId } });
  const mappingJob = await readUnique(client, 'affiliateSourceMappingJobs', { where: { id: mappingJobId } });
  const intake = await readUnique(client, 'affiliateSourceIntakes', { where: { id: intakeId } });
  const sourceId = stringValue(mappingJob?.sourceId) ?? stringValue(intake?.affiliateSourceId);
  const source = sourceId ? await readUnique(client, 'affiliateScrapeSources', { where: { id: sourceId } }) : null;
  const mapping = stringValue(mappingJob?.mappingId)
    ? await readUnique(client, 'affiliateScrapeMappings', { where: { id: mappingJob?.mappingId } })
    : null;
  const run = await readUnique(client, 'affiliateSourceIntakeRuns', { where: { id: runId } });
  const parentManifest = affiliateAgentEvidenceManifestSchema.safeParse(parentJob.evidenceManifestJson);
  if (!root || !mappingJob || !intake || !source || !run || !parentManifest.success) {
    throw executionStateDrift(['EXECUTION_LINEAGE_MISSING']);
  }
  const evidenceRows = await sourceArtifactRowsFor(client, intakeId, runId);
  const organizationIds = sortedUnique([
    stringValue(source.organizationId),
    stringValue(intake.organizationId),
  ].filter((value): value is string => Boolean(value)));
  const organizations: OrganizationRow[] = [];
  for (const organizationId of organizationIds) {
    const organization = await readUnique(client, 'organizations', { where: { id: organizationId } });
    if (!organization) throw executionStateDrift(['ORGANIZATION_MISSING']);
    organizations.push(organization);
  }
  const candidates = await readBatched(client, 'affiliateImportCandidates', {
    OR: [
      { sourceId: { in: [String(source.id)] } },
      ...(mapping ? [{ mappingId: { in: [String(mapping.id)] } }] : []),
      { supplySourceId: { in: [String(root.id)] } },
    ],
  });
  const targets = await readBatched(client, 'affiliateSupplyTargets', { supplySourceId: root.id });
  const sourceJobs = await readBatched(client, 'affiliateSourceMappingJobs', { intakeId: intake.id });
  const children = await loadChildrenAndAudits(client, String(root.id));
  const currentCatalog = await currentCatalogFor(client);
  const activeContract = await activeContractFor(client, stringValue(root.rolloutCohort) ?? undefined);
  const identity = sourceIdentityFor(source, intake);
  if (!identity) throw executionStateDrift(['SOURCE_IDENTITY_INVALID']);
  const pageEntries = parentManifest.data.entries.filter((entry) => PAGE_KINDS[entry.kind] === true);
  const parentReceipt = parentClaim.terminalReceiptId
    ? await readUnique(client, 'affiliateAgentGatewayOperationReceipts', { where: { id: parentClaim.terminalReceiptId } })
    : null;
  if (!parentReceipt) throw executionStateDrift(['PARENT_TERMINAL_RECEIPT_MISSING']);
  const activeClaims = (await readBatched(client, 'affiliateAgentGatewayClaims', { status: 'ACTIVE' })).sort(compareIds);
  const activePointers = (await readBatched(client, 'affiliateAgentGatewayJobs', { activeClaimId: { not: null } })).sort(compareIds);
  return {
    job: parentJob,
    claim: parentClaim,
    receipt: parentReceipt,
    envelope: parentEnvelope,
    subject,
    result: parentResult,
    sportEvidence: parentSportEvidenceFor(parentResult) ?? {},
    manifest: parentManifest.data,
    mappingJob,
    intake,
    source,
    mapping,
    root,
    run,
    ...evidenceRows,
    organizations,
    candidates,
    targets,
    sourceJobs,
    reviewerJobs: children.jobs,
    reviewerAudits: children.audits,
    activeClaims,
    activePointers,
    currentCatalog,
    activeContract,
    identity,
    pageEntries,
    requestHash: stringValue(recordValue(child.subjectJson).requestHash) ?? '',
    dedupeKey: stringValue(child.dedupeKey) ?? '',
  };
};

export const assertAffiliateSourceExclusionExecutionReady = async (input: Readonly<{
  prisma: PrismaClient | Prisma.TransactionClient;
  job: unknown;
  claim: unknown;
}>): Promise<void> => {
  try {
    const job = recordValue(input.job);
    const claim = recordValue(input.claim);
    await assertAffiliateSourceExclusionClaimBinding({
      prisma: input.prisma,
      job,
      claim,
    });
    const parsedSubject = affiliateAgentSourceExclusionReviewerSubjectSchema.safeParse(job.subjectJson);
    const parsedClaim = affiliateAgentClaimEnvelopeSchema.safeParse(claim);
    if (!parsedSubject.success || !parsedClaim.success || parsedClaim.data.subject.type !== 'SOURCE_EXCLUSION_REVIEW') {
      throw executionStateDrift(['EXECUTION_SUBJECT_INVALID']);
    }
    const subject = parsedSubject.data;
    const parentClaim = await readUnique(input.prisma, 'affiliateAgentGatewayClaims', { where: { id: subject.producerClaimId } });
    const parentJob = parentClaim ? await readUnique(input.prisma, 'affiliateAgentGatewayJobs', { where: { id: parentClaim.jobId } }) : null;
    if (!parentClaim || !parentJob) throw executionStateDrift(['PARENT_LINEAGE_MISSING']);
    const parent = await assertParentImmutableBinding(input.prisma, job, subject);
    const mutableParent = await executionParentFor(input.prisma, job, parent.parentJob, parent.parentClaim, parent.parentEnvelope, parent.parentResult);
    const reasons = mutableSafetyReasonCodesFor(mutableParent, {
      lifecycleGeneration: typeof job.expectedLifecycleGeneration === 'number' ? job.expectedLifecycleGeneration : null,
      supplyContractVersion: typeof claim.supplyContractVersion === 'number' ? claim.supplyContractVersion : null,
      supplyContractHash: normalizeHash(claim.supplyContractHash),
      rolloutCohort: stringValue(mutableParent.root.rolloutCohort),
    });
    if (mutableParent.root.lifecycleGeneration !== job.expectedLifecycleGeneration || parsedClaim.data.lifecycleGeneration !== mutableParent.root.lifecycleGeneration) {
      reasons.push('ROOT_GENERATION_MISMATCH');
    }
    const activePolicy = recordValue(mutableParent.activeContract.policy);
    const activeManifestContract = recordValue(mutableParent.activeContract.manifest.supplyContract);
    if (
      normalizedUpper(mutableParent.activeContract.manifest.status) !== 'ACTIVE'
      || Number(activePolicy.version) !== claim.supplyContractVersion
      || normalizeHash(activePolicy.hash) !== normalizeHash(claim.supplyContractHash)
      || normalizeHash(activeManifestContract.hash) !== normalizeHash(claim.supplyContractHash)
    ) reasons.push('ACTIVE_CONTRACT_DRIFT');
    const audits = mutableParent.reviewerAudits.filter((audit) => audit.jobId === job.id && normalizedUpper(audit.eventType) === 'JOB_CREATED');
    if (audits.length !== 1) reasons.push('ADMISSION_AUDIT_INVALID');
    else {
      const payload = recordValue(audits[0]!.payload);
      const mutableFingerprint = normalizeHash(payload.mutableSafetyFingerprint);
      if (!mutableFingerprint || mutableFingerprint !== mutableSafetyFingerprintFor(mutableParent)) reasons.push('MUTABLE_SAFETY_FINGERPRINT_DRIFT');
      if (payload.gatewayJobId !== job.id || payload.requestHash !== subject.requestHash || !sameValue(payload.subject, job.subjectJson) || !sameValue(payload.manifest, job.evidenceManifestJson)) reasons.push('ADMISSION_AUDIT_IDENTITY_DRIFT');
    }
    const otherClaims = mutableParent.activeClaims.filter((activeClaim) => activeClaim.id !== parsedClaim.data.claimId);
    const otherPointers = mutableParent.activePointers.filter((pointer) => pointer.id !== job.id || pointer.activeClaimId !== parsedClaim.data.claimId);
    if (otherClaims.length > 0 || otherPointers.length > 0) reasons.push('ACTIVE_GATEWAY_CLAIM');
    if (reasons.length > 0) throw executionStateDrift(reasons);
  } catch (error) {
    if (error instanceof AffiliateSourceExclusionAdmissionError && error.code === 'EXECUTION_STATE_DRIFT') throw error;
    const reasonCodes = error instanceof AffiliateSourceExclusionAdmissionError
      ? [error.code]
      : ['EXECUTION_STATE_DRIFT'];
    throw executionStateDrift(reasonCodes);
  }
};

