import { createHash } from 'crypto';
import type { AffiliateSourceIntakes } from '@/generated/prisma/client';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  affiliateSupplyDatabase,
  ensureAffiliateSupplySource,
} from './affiliateSupplyPersistence';
import { normalizeAffiliateSupplyIdentity } from './affiliateSupplyLifecycle';
import { hashAffiliateAgentValue } from './agentGatewayContracts';
import {
  deriveAffiliateHtmlArtifacts,
  evaluateAffiliateHtmlQuality,
  type AffiliateHtmlArtifacts,
} from './affiliateHtmlArtifacts';
import {
  affiliateSourceCaptureDeadlineAt,
  affiliateSourceCaptureTimeoutMs,
  isAffiliateSourceCaptureTimeout,
  type AffiliateProviderName,
  type AffiliateSourceCaptureClient,
  type AffiliateSourceCaptureOptions,
  type AffiliateSourcePageCapture,
  type AffiliateSourcePageScreenshotEvidence,
  type AffiliateSourceScreenshot,
  withAffiliateSourceCaptureDeadline,
} from './affiliateProviderContracts';
import {
  createAffiliateFallbackCaptureClient,
  createAffiliateSourceCaptureClient,
  resolveAffiliateIntakeProvider,
  resolveAffiliateIntakeScreenshotMode,
  type AffiliateIntakeScreenshotMode,
} from './affiliateProviderFactory';
import {
  type AffiliateFirecrawlClient,
} from './firecrawlClient';
import {
  INTAKE_RUN_ARTIFACT_LIMIT_BYTES,
  persistAffiliateSourceIntakeArtifact,
  readAffiliateSourceIntakeArtifact,
  type AffiliateSourceIntakeArtifactKind,
} from './sourceIntakeArtifacts';
import { evaluateRobotsPath } from './sourceIntakeRobots';
import {
  affiliateIntakeUrlKey,
  assertSafePublicUrl,
  canonicalizeAffiliateIntakeUrl,
  fetchBoundedPublicResource,
  type BoundedPublicResource,
} from './sourceIntakeUrlSafety';
import {
  pendingMappingForMetadata,
} from './affiliateExistingDataRepairState';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';
import {
  discoverAffiliateSourcePages,
  type AffiliateDiscoveredPage,
} from './sourcePageDiscovery';

const MAX_CAPTURE_PAGES = 10;
const MAX_DISCOVERED_URLS = 50;
const MAX_LOGO_CANDIDATES_PER_PAGE = 5;
const ROBOTS_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_ROBOTS_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_RUN_AGE_MS = 30 * 60 * 1000;

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 'P2002')
);

const robotsTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.AFFILIATE_INTAKE_ROBOTS_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 15_000 && configured <= 60_000
    ? configured
    : DEFAULT_ROBOTS_TIMEOUT_MS;
};

const staleRunAgeMs = (): number => {
  const configuredMinutes = Number.parseInt(
    process.env.AFFILIATE_INTAKE_STALE_RUN_MINUTES ?? '',
    10,
  );
  return Number.isInteger(configuredMinutes) && configuredMinutes >= 20 && configuredMinutes <= 24 * 60
    ? configuredMinutes * 60 * 1000
    : DEFAULT_STALE_RUN_AGE_MS;
};

const VALID_PAGE_ROLES = new Set([
  'HOME',
  'LISTING',
  'DETAIL',
  'REGISTRATION',
  'RENTAL',
  'DIRECTORY',
  'POLICY',
  'LOGO',
]);
const VALID_TARGET_KINDS = new Set(['EVENT', 'RENTAL', 'TEAM', 'CLUB']);
const VALID_COMPLIANCE_STATUSES = new Set(['UNREVIEWED', 'NEEDS_REVIEW', 'ALLOWED', 'BLOCKED']);
const VALID_INTAKE_STATUSES = new Set([
  'DRAFT',
  'REVIEW_REQUIRED',
  'READY',
  'BLOCKED',
  'APPROVED',
  'PROMOTED',
  'FAILED',
  'READY_FOR_MAPPING',
  'MAPPING_IN_PROGRESS',
  'EXPANDED',
]);
export const AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE =
  'EXISTING_DATA_REPAIR_EVIDENCE_ONLY' as const;

export type AffiliateExistingDataRepairEvidenceOnlyMarker = Readonly<{
  schemaVersion: 1;
  purpose: typeof AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE;
  requestHash: string;
  operatorId: string;
  intakeId: string;
  pageIds: readonly string[];
  baseline: unknown;
}>;


type JsonRecord = Record<string, unknown>;
export type AffiliateSourceIntakePageInput = {
  url: string;
  role?: string | null;
  targetKindHints?: string[] | null;
  discoverySource?: string | null;
  metadata?: JsonRecord | null;
};

export type AffiliateSourceIntakeCreateInput = {
  name: string;
  sourceKey?: string | null;
  region?: string | null;
  baseUrl?: string | null;
  targetKindHints?: string[] | null;
  notes?: string | null;
  pages: AffiliateSourceIntakePageInput[];
};

export type AffiliateSourceIntakeImportRow = AffiliateSourceIntakeCreateInput;

export type AffiliateSourceIntakeImportResult = {
  created: number;
  updated: number;
  duplicatePages: number;
  rejected: Array<{ name: string; reason: string }>;
  intakeIds: string[];
};
export type AffiliateSourcePolicyReview = {
  complianceStatus: string;
  termsUrl?: string | null;
  notes?: string | null;
};

export type AffiliateSourceIntakeRunQueueOptions = {
  db?: unknown;
  existingDataRepairEvidenceOnly?: AffiliateExistingDataRepairEvidenceOnlyMarker;
};
export type AffiliateSourceIntakeGovernedProcessIntent = Readonly<{
  purpose: typeof AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE;
  operatorId: string;
  markerSha256: string;
  /**
   * The capture owner supplies this callback after the run is claimed. It
   * closes the claim-to-provider race for marked runs.
   */
  verifyAfterClaim?: (input: Readonly<{
    database: unknown;
    run: Record<string, unknown>;
    intake: Record<string, unknown>;
    pages: readonly Record<string, unknown>[];
  }>) => Promise<void>;
}>;

export class AffiliateSourceIntakeQueueConflictError extends Error {
  readonly code = 'GOVERNED_CAPTURE_OWNERSHIP_CONFLICT';
  readonly status = 409;
}

export type AffiliateSourceIntakeProcessingDependencies = {
  db?: unknown;
  captureClient?: AffiliateSourceCaptureClient;
  fallbackCaptureClient?: AffiliateSourceCaptureClient | null;
  screenshotMode?: AffiliateIntakeScreenshotMode;
  discoverPages?: typeof discoverAffiliateSourcePages;
  /** Compatibility hook for existing tests and explicitly queued Firecrawl work. */
  firecrawlClient?: AffiliateFirecrawlClient;
  fetchResource?: typeof fetchBoundedPublicResource;
  workerId?: string;
  now?: () => Date;
};

type IntakeRunSummary = {
  warnings: string[];
  blockedPages: Array<{ pageId: string; url: string; rule: string | null }>;
  restrictedPages: Array<{ pageId: string; url: string; statusCode: number }>;
  failedPages: Array<{ pageId: string; url: string; error: string }>;
  capturedPages: Array<{
    pageId: string;
    url: string;
    finalUrl: string;
    provider: AffiliateProviderName;
    renderMode: AffiliateSourcePageCapture['renderMode'];
    estimatedCredits: number | null;
  }>;
  discoveredUrls: number;
  storedBytes: number;
  estimatedCredits: number;
  classification: AffiliateSourceClassification;
};

export type AffiliateSourceClassification = {
  type: 'EVENT_CATALOG' | 'RENTAL' | 'CLUB' | 'DIRECTORY' | 'MARKETPLACE' | 'AUTH_REQUIRED' | 'NO_CURRENT_INVENTORY' | 'UNKNOWN';
  confidence: number;
  reasons: string[];
};

const intakePrisma = (client: unknown = prisma) => {
  const dbClient = client as Record<string, unknown>;
  return {
    intakes: dbClient.affiliateSourceIntakes as any,
    pages: dbClient.affiliateSourceIntakePages as any,
    runs: dbClient.affiliateSourceIntakeRuns as any,
    artifacts: dbClient.affiliateSourceIntakeArtifacts as any,
    policies: dbClient.affiliateSourceDomainPolicies as any,
    discoveryResults: dbClient.affiliateSourceDiscoveryResults as any,
    mappingJobs: dbClient.affiliateSourceMappingJobs as any,
    sources: dbClient.affiliateScrapeSources as any,
    supplySources: dbClient.affiliateSupplySources as any,
    gatewayJobs: dbClient.affiliateAgentGatewayJobs as any,
    gatewayClaims: dbClient.affiliateAgentGatewayClaims as any,
  };
};

const withAffiliateIntakeTransaction = async <T>(
  client: any,
  callback: (transactionClient: any) => Promise<T>,
): Promise<T> => (
  typeof client?.$transaction === 'function'
    ? client.$transaction(
      (transactionClient: any) => callback(transactionClient),
      { isolationLevel: 'Serializable' },
    )
    : callback(client)
);

const linkAffiliateIntakeEvidence = async (input: Readonly<{
  intakeId: string;
  pageId: string;
  supplySourceId: string;
  expectedSupplySourceId?: string | null;
  isIntakeLinkPending: boolean;
  client?: any;
}>): Promise<string> => {
  const database = affiliateSupplyDatabase(input.client ?? prisma);
  let linkedSupplySourceId = input.supplySourceId;
  if (input.isIntakeLinkPending && database.intakes?.updateMany) {
    const updated = await database.intakes.updateMany({
      where: {
        id: input.intakeId,
        supplySourceId: input.expectedSupplySourceId ?? null,
      },
      data: { supplySourceId: input.supplySourceId },
    });
    if (updated.count !== 1 && database.intakes.findUnique) {
      const current = await database.intakes.findUnique({
        where: { id: input.intakeId },
        select: { supplySourceId: true },
      });
      const currentSupplySourceId = stringValue(current?.supplySourceId);
      if (currentSupplySourceId && currentSupplySourceId !== input.supplySourceId) {
        linkedSupplySourceId = currentSupplySourceId;
      } else if (!currentSupplySourceId) {
        const retried = await database.intakes.updateMany({
          where: { id: input.intakeId, supplySourceId: null },
          data: { supplySourceId: input.supplySourceId },
        });
        if (retried.count !== 1) {
          const afterRetry = await database.intakes.findUnique({
            where: { id: input.intakeId },
            select: { supplySourceId: true },
          });
          linkedSupplySourceId = stringValue(afterRetry?.supplySourceId) ?? input.supplySourceId;
        }
      }
    }
  }
  if (database.pages?.update) {
    await database.pages.update({
      where: { id: input.pageId },
      data: { supplySourceId: linkedSupplySourceId },
    });
  }
  if (database.artifacts?.updateMany) {
    await database.artifacts.updateMany({
      where: { pageId: input.pageId, supplySourceId: null },
      data: { supplySourceId: linkedSupplySourceId },
    });
  }
  return linkedSupplySourceId;
};

const ensureAffiliateIntakeSupplySource = async (input: Readonly<{
  intakeId: string;
  pageId: string;
  existingSupplySourceId?: string | null;
  expectedIntakeSupplySourceId?: string | null;
  pageUrl: string;
  targetKindHints?: string[] | null;
  isIntakeLinkPending?: boolean;
  isRedirectVerified?: boolean;
  db?: any;
}>): Promise<string | null> => {
  const database = affiliateSupplyDatabase(input.db ?? prisma);
  if (!database.supplySources?.findUnique || !database.supplySources?.create) return null;

  const canonicalUrl = canonicalizeAffiliateIntakeUrl(input.pageUrl);
  const operatorDomain = new URL(canonicalUrl).hostname;
  const isIntakeLinkPending = input.isIntakeLinkPending === true;
  let supplySource;
  if (input.existingSupplySourceId) {
    const existing = await database.supplySources.findUnique({
      where: { id: input.existingSupplySourceId },
    });
    if (existing) {
      const identity = normalizeAffiliateSupplyIdentity({
        requestedUrl: input.pageUrl,
        resolvedCanonicalUrl: canonicalUrl,
        isRedirectVerified: input.isRedirectVerified === true,
        operatorDomain,
        prior: {
          canonicalUrl: existing.canonicalUrl,
          operatorDomain: existing.operatorDomain,
          identityKey: existing.identityKey,
        },
      });
      if (
        identity.rootDecision === 'SAME_ROOT'
        && !identity.isRevalidationRequired
        && identity.canonicalUrl === canonicalizeAffiliateIntakeUrl(String(existing.canonicalUrl))
      ) {
        supplySource = existing;
      } else {
        const successor = await ensureAffiliateSupplySource({
          requestedUrl: input.pageUrl,
          resolvedCanonicalUrl: canonicalUrl,
          isRedirectVerified: input.isRedirectVerified === true,
          operatorDomain,
          targetKind: input.targetKindHints?.[0] ?? 'EVENT',
          intakeId: isIntakeLinkPending ? input.intakeId : null,
          expectedIntakeSupplySourceId: isIntakeLinkPending
            ? input.expectedIntakeSupplySourceId
            : undefined,
          priorSupplySourceId: existing.id,
          metadata: { sourceKey: affiliateIntakeUrlKey(canonicalUrl) },
          db: database,
        });
        supplySource = successor.supplySource;
      }
    }
  }
  if (!supplySource) {
    const created = await ensureAffiliateSupplySource({
      requestedUrl: input.pageUrl,
      resolvedCanonicalUrl: canonicalUrl,
      isRedirectVerified: input.isRedirectVerified === true,
      operatorDomain,
      targetKind: input.targetKindHints?.[0] ?? 'EVENT',
      intakeId: isIntakeLinkPending ? input.intakeId : null,
      expectedIntakeSupplySourceId: isIntakeLinkPending
        ? input.expectedIntakeSupplySourceId
        : undefined,
      metadata: { sourceKey: affiliateIntakeUrlKey(canonicalUrl) },
      db: database,
    });
    supplySource = created.supplySource;
  }
  const linkedSupplySourceId = await linkAffiliateIntakeEvidence({
    intakeId: input.intakeId,
    pageId: input.pageId,
    supplySourceId: supplySource.id,
    expectedSupplySourceId: isIntakeLinkPending
      ? input.expectedIntakeSupplySourceId
      : undefined,
    isIntakeLinkPending,
    client: input.db ?? prisma,
  });
  return linkedSupplySourceId;
};
const reconcileCapturedAffiliateSupplySource = async (
  intake: Record<string, unknown>,
  page: Record<string, unknown>,
  capture: AffiliateSourcePageCapture,
  client: unknown = prisma,
): Promise<string | null> => {
  const currentSupplySourceId = stringValue(page.supplySourceId)
    ?? stringValue(intake.supplySourceId);
  const finalUrl = stringValue(capture.finalUrl);
  if (
    !finalUrl
    || finalUrl === String(page.url ?? '').trim()
    || capture.isRedirectVerified !== true
  ) {
    return currentSupplySourceId;
  }
  await assertSafePublicUrl(finalUrl);
  const targetKindHints = normalizedTargetKinds(intake.targetKindHints);
  return ensureAffiliateIntakeSupplySource({
    intakeId: String(intake.id),
    pageId: String(page.id),
    existingSupplySourceId: currentSupplySourceId,
    expectedIntakeSupplySourceId: stringValue(intake.supplySourceId),
    pageUrl: finalUrl,
    targetKindHints: targetKindHints.length ? targetKindHints : null,
    isIntakeLinkPending: true,
    isRedirectVerified: capture.isRedirectVerified === true,
    db: client,
  });
};

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);
const existingDataRepairEvidenceMarkerFrom = (
  summary: unknown,
): AffiliateExistingDataRepairEvidenceOnlyMarker | null => {
  const candidate = recordValue(summary).existingDataRepairEvidenceOnly;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const marker = candidate as Record<string, unknown>;
  const rawPageIds = marker.pageIds;
  if (
    marker.schemaVersion !== 1
    || marker.purpose !== AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE
    || !stringValue(marker.requestHash)
    || !stringValue(marker.operatorId)
    || !stringValue(marker.intakeId)
    || !Array.isArray(rawPageIds)
    || rawPageIds.some((pageId) => !stringValue(pageId))
    || !Object.prototype.hasOwnProperty.call(marker, 'baseline')
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    purpose: AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE,
    requestHash: String(marker.requestHash),
    operatorId: String(marker.operatorId),
    intakeId: String(marker.intakeId),
    pageIds: stringArray(rawPageIds),
    baseline: marker.baseline,
  };
};

const isExistingDataRepairEvidenceOnlyRun = (run: unknown): boolean => {
  const summary = run && typeof run === 'object' && 'summary' in run
    ? run.summary
    : null;
  return recordValue(recordValue(summary).existingDataRepairEvidenceOnly).purpose
    === AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE;
};

export const isAffiliateExistingDataRepairEvidenceOnlyRun = isExistingDataRepairEvidenceOnlyRun;

const sameStringArray = (left: unknown, right: unknown): boolean => {
  const normalizedLeft = stringArray(left).sort();
  const normalizedRight = stringArray(right).sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const runSummaryWithPreservedMarker = (
  priorSummary: unknown,
  nextSummary: unknown,
): JsonRecord => {
  const prior = recordValue(priorSummary);
  const next = recordValue(nextSummary);
  const marker = prior.existingDataRepairEvidenceOnly
    ?? next.existingDataRepairEvidenceOnly;
  return marker === undefined
    ? { ...prior, ...next }
    : { ...prior, ...next, existingDataRepairEvidenceOnly: marker };
};


const stringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : []
);

const normalizedSnapshotUrl = (value: unknown): string | null => {
  const text = stringValue(value);
  if (!text) return null;
  try {
    return canonicalizeAffiliateIntakeUrl(text);
  } catch {
    return text;
  }
};

export const affiliateExistingRepairCaptureSnapshot = (
  intake: Readonly<Record<string, unknown>> | null,
  pages: readonly Readonly<Record<string, unknown>>[],
) => ({
  intake: intake ? {
    id: stringValue(intake.id),
    sourceKey: stringValue(intake.sourceKey),
    baseUrl: normalizedSnapshotUrl(intake.baseUrl),
    status: stringValue(intake.status),
    complianceStatus: stringValue(intake.complianceStatus),
    targetKindHints: Array.from(new Set(stringArray(intake.targetKindHints))).sort(),
    organizationId: stringValue(intake.organizationId),
    affiliateSourceId: stringValue(intake.affiliateSourceId),
    supplySourceId: stringValue(intake.supplySourceId),
  } : null,
  pages: pages.map((page) => ({
    id: stringValue(page.id),
    intakeId: stringValue(page.intakeId),
    supplySourceId: stringValue(page.supplySourceId),
    url: normalizedSnapshotUrl(page.url),
    canonicalUrl: normalizedSnapshotUrl(page.canonicalUrl),
    status: stringValue(page.status),
    role: stringValue(page.role),
    targetKindHints: Array.from(new Set(stringArray(page.targetKindHints))).sort(),
  })).sort((left, right) => (left.id ?? '') < (right.id ?? '') ? -1 : (left.id ?? '') > (right.id ?? '') ? 1 : 0),
});

const snapshotDate = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return stringValue(value);
};

const snapshotStringList = (value: unknown): string[] => Array.from(new Set(
  stringArray(value),
)).sort();

const snapshotSource = (source: Readonly<Record<string, unknown>> | null): Record<string, unknown> | null => (
  source
    ? {
      id: stringValue(source.id),
      name: stringValue(source.name),
      sourceKey: stringValue(source.sourceKey),
      organizationId: stringValue(source.organizationId),
      baseUrl: normalizedSnapshotUrl(source.baseUrl),
      listUrl: normalizedSnapshotUrl(source.listUrl),
      targetKind: stringValue(source.targetKind),
      status: stringValue(source.status),
      activeMappingId: stringValue(source.activeMappingId),
      supplySourceId: stringValue(source.supplySourceId),
      lastScrapeRunId: stringValue(source.lastScrapeRunId),
      lifecycleGeneration: typeof source.lifecycleGeneration === 'number' ? source.lifecycleGeneration : null,
      activeSupplyContractVersion: typeof source.activeSupplyContractVersion === 'number'
        ? source.activeSupplyContractVersion
        : null,
      activeSupplyContractHash: stringValue(source.activeSupplyContractHash),
      lastScrapedAt: snapshotDate(source.lastScrapedAt),
      autoScrapeEnabled: source.autoScrapeEnabled === true,
      scrapeIntervalMinutes: typeof source.scrapeIntervalMinutes === 'number'
        ? source.scrapeIntervalMinutes
        : null,
      notes: stringValue(source.notes),
      metadata: recordValue(source.metadata),
    }
    : null
);

const snapshotRoot = (root: Readonly<Record<string, unknown>>): Record<string, unknown> => ({
  id: stringValue(root.id),
  identityKey: stringValue(root.identityKey),
  canonicalUrl: normalizedSnapshotUrl(root.canonicalUrl),
  origin: stringValue(root.origin),
  pathKey: stringValue(root.pathKey),
  operatorDomain: stringValue(root.operatorDomain),
  targetKind: stringValue(root.targetKind),
  rolloutCohort: stringValue(root.rolloutCohort),
  intakeId: stringValue(root.intakeId),
  liveSourceId: stringValue(root.liveSourceId),
  predecessorId: stringValue(root.predecessorId),
  successorId: stringValue(root.successorId),
  lifecycleGeneration: typeof root.lifecycleGeneration === 'number' ? root.lifecycleGeneration : null,
  activeSupplyContractVersion: typeof root.activeSupplyContractVersion
    === 'number' ? root.activeSupplyContractVersion : null,
  activeSupplyContractHash: stringValue(root.activeSupplyContractHash),
  derivedStage: stringValue(root.derivedStage),
  derivedOutcome: stringValue(root.derivedOutcome),
  freshnessStatus: stringValue(root.freshnessStatus),
  targetContribution: typeof root.targetContribution === 'number' ? root.targetContribution : null,
  repairPriority: typeof root.repairPriority === 'number' ? root.repairPriority : null,
  isAutomationEnabled: root.isAutomationEnabled === true,
  isExcluded: root.isExcluded === true,
  automationHoldReason: stringValue(root.automationHoldReason),
  excludedAt: snapshotDate(root.excludedAt),
  lastSuccessfulRefreshAt: snapshotDate(root.lastSuccessfulRefreshAt),
  lastAssessmentAt: snapshotDate(root.lastAssessmentAt),
  assessmentJson: root.assessmentJson ?? null,
  invariantViolations: snapshotStringList(root.invariantViolations),
  metadata: recordValue(root.metadata),
});

const snapshotPolicy = (policy: Readonly<Record<string, unknown>>): Record<string, unknown> => ({
  id: stringValue(policy.id),
  policyKey: stringValue(policy.policyKey),
  status: stringValue(policy.status),
  reviewedByUserId: stringValue(policy.reviewedByUserId),
  reviewedAt: snapshotDate(policy.reviewedAt),
  expiresAt: snapshotDate(policy.expiresAt),
  termsUrl: normalizedSnapshotUrl(policy.termsUrl),
  restrictionNotes: stringValue(policy.restrictionNotes),
  evidence: policy.evidence ?? null,
  robotsSummary: stringValue(policy.robotsSummary),
});

export const affiliateExistingRepairAuthoritySnapshot = (
  intake: Readonly<Record<string, unknown>> | null,
  pages: readonly Readonly<Record<string, unknown>>[],
  source: Readonly<Record<string, unknown>> | null,
  roots: readonly Readonly<Record<string, unknown>>[],
  policies: readonly Readonly<Record<string, unknown>>[],
) => ({
  ...affiliateExistingRepairCaptureSnapshot(intake, pages),
  source: snapshotSource(source),
  roots: roots
    .map(snapshotRoot)
    .sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? ''))),
  policies: policies
    .map(snapshotPolicy)
    .sort((left, right) => String(left.policyKey ?? '').localeCompare(String(right.policyKey ?? ''))),
});

const captureAuthorityError = (code: string, message: string): Error & { code: string } => {
  const error = new Error(`${code}: ${message}`) as Error & { code: string };
  error.code = code;
  return error;
};

const authoritySnapshotFor = async (
  database: Record<string, unknown>,
  intake: Record<string, unknown>,
  pages: readonly Record<string, unknown>[],
) => {
  const tables = intakePrisma(database);
  if (!tables.sources?.findMany || !tables.supplySources?.findMany
    || !tables.policies?.findMany || !tables.runs?.findMany) {
    throw captureAuthorityError(
      'PERSISTENCE_UNAVAILABLE',
      'Existing repair capture authority tables are unavailable after claim.',
    );
  }
  const explicitSourceId = stringValue(intake.affiliateSourceId);
  const sourceKey = stringValue(intake.sourceKey);
  const sourceRows = explicitSourceId
    ? await tables.sources.findMany({ where: { id: explicitSourceId } })
    : await tables.sources.findMany({ where: { sourceKey } });
  const sourceMatches = Array.isArray(sourceRows)
    ? sourceRows.filter((row: unknown) => row && typeof row === 'object')
    : [];
  const source = sourceMatches.length === 1 ? sourceMatches[0] as Record<string, unknown> : null;
  const sourceRootId = source ? stringValue(source.supplySourceId) : null;
  const rootIds = Array.from(new Set([
    stringValue(intake.supplySourceId),
    sourceRootId,
    ...pages.map((page) => stringValue(page.supplySourceId)),
  ].filter((value): value is string => Boolean(value))));
  const roots = rootIds.length
    ? await tables.supplySources.findMany({ where: { id: { in: rootIds } } })
    : [];
  const policyUrls = [
    stringValue(intake.baseUrl),
    ...pages.map((page) => stringValue(page.canonicalUrl) ?? stringValue(page.url)),
  ].filter((value): value is string => Boolean(value));
  const policyKeys = Array.from(new Set(policyUrls.map((url) => {
    try {
      return affiliateDiscoveryPolicyKeyForUrl(url);
    } catch {
      return null;
    }
  }).filter((value): value is string => Boolean(value))));
  const policies = policyKeys.length
    ? await tables.policies.findMany({ where: { policyKey: { in: policyKeys } } })
    : [];
  return {
    source,
    roots: Array.isArray(roots) ? roots : [],
    policies: Array.isArray(policies) ? policies : [],
    activeRuns: (await tables.runs.findMany({ where: { intakeId: intake.id } }))
      .filter((run: unknown) => {
        if (!run || typeof run !== 'object') return false;
        const row = run as Record<string, unknown>;
        return row.id !== undefined
          && ['QUEUED', 'RUNNING', 'CLAIMED'].includes(String(row.status).toUpperCase());
      }),
  };
};

const hasAuthoritySnapshot = (baseline: unknown): boolean => {
  const value = recordValue(baseline);
  return Boolean(
    value.authoritySnapshot
    && typeof value.authoritySnapshot === 'object'
    && typeof value.authorityFingerprint === 'string',
  );
};

const verifyExistingRepairCaptureAfterClaim = async (
  database: Record<string, unknown>,
  run: Record<string, unknown>,
  intake: Record<string, unknown>,
  pages: readonly Record<string, unknown>[],
  marker: AffiliateExistingDataRepairEvidenceOnlyMarker,
): Promise<void> => {
  const baseline = recordValue(marker.baseline);
  if (!hasAuthoritySnapshot(marker.baseline)) {
    throw captureAuthorityError(
      'CAPTURE_INTENT_INVALID',
      'The admitted capture marker does not contain a complete authority snapshot.',
    );
  }
  const current = await authoritySnapshotFor(database, intake, pages);
  const currentAuthoritySnapshot = affiliateExistingRepairAuthoritySnapshot(
    intake,
    pages,
    current.source,
    current.roots,
    current.policies,
  );
  const expectedAuthorityFingerprint = stringValue(baseline.authorityFingerprint);
  if (
    !expectedAuthorityFingerprint
    || hashAffiliateAgentValue(currentAuthoritySnapshot) !== expectedAuthorityFingerprint
  ) {
    throw captureAuthorityError(
      'CAPTURE_INTENT_DRIFT',
      'The reviewed source, root, or domain policy state changed after claim.',
    );
  }
  for (const value of current.policies) {
    const policy = recordValue(value);
    const expiresAt = snapshotDate(policy.expiresAt);
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (policy.status !== 'ALLOWED'
      || (policy.expiresAt != null && (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()))) {
      throw captureAuthorityError('CAPTURE_POLICY_NOT_ALLOWED', 'The current source policy does not permit capture.');
    }
  }
  for (const value of current.roots) {
    const root = recordValue(value);
    const sourceId = stringValue(current.source?.id);
    const isPrimarySourceRoot = root.id === stringValue(current.source?.supplySourceId);
    if (stringValue(root.intakeId) !== String(intake.id)
      || (isPrimarySourceRoot && stringValue(root.liveSourceId) !== sourceId)
      || (stringValue(root.liveSourceId) !== null && stringValue(root.liveSourceId) !== sourceId)) {
      throw captureAuthorityError('CAPTURE_OWNERSHIP_CONFLICT', 'The selected root does not belong to the reviewed intake and source.');
    }
    if (Object.prototype.hasOwnProperty.call(recordValue(root.metadata), 'pendingMapping')) {
      throw captureAuthorityError('CAPTURE_OWNERSHIP_CONFLICT', 'A root pending repair blocks evidence capture.');
    }
  }
  const activeRuns = current.activeRuns.filter((candidate: Record<string, unknown>) => (
    String(candidate.id) !== String(run.id)
  ));
  if (activeRuns.length) {
    throw captureAuthorityError(
      'CAPTURE_OWNERSHIP_CONFLICT',
      'Another intake capture run is active for this source.',
    );
  }
  const sourceMetadata = recordValue(current.source?.metadata);
  if (Object.prototype.hasOwnProperty.call(sourceMetadata, 'pendingMapping')
    && !pendingMappingForMetadata(current.source?.metadata)) {
    throw captureAuthorityError(
      'CAPTURE_OWNERSHIP_CONFLICT',
      'The source has a malformed pending repair pointer.',
    );
  }
  if (pendingMappingForMetadata(current.source?.metadata)) {
    throw captureAuthorityError(
      'CAPTURE_OWNERSHIP_CONFLICT',
      'A staged or approved mapping repair blocks evidence capture.',
    );
  }
  const rootIds = current.roots
    .map((root: unknown) => String(recordValue(root).id ?? ''))
    .filter(Boolean);
  if (rootIds.length && !tablesHaveGatewayDelegates(database)) {
    throw captureAuthorityError(
      'PERSISTENCE_UNAVAILABLE',
      'Gateway ownership tables are unavailable after claim.',
    );
  }
  if (rootIds.length) {
    const tables = intakePrisma(database);
    const jobs = await tables.gatewayJobs.findMany({ where: { supplySourceId: { in: rootIds } } });
    if (Array.isArray(jobs) && jobs.some((job: unknown) => stringValue(recordValue(job).activeClaimId) !== null)) {
      throw captureAuthorityError('CAPTURE_OWNERSHIP_CONFLICT', 'An active Gateway pointer blocks evidence capture.');
    }
    const jobIds = Array.isArray(jobs)
      ? jobs.map((job: unknown) => String(recordValue(job).id ?? '')).filter(Boolean)
      : [];
    if (jobIds.length) {
      const claims = await tables.gatewayClaims.findMany({
        where: { jobId: { in: jobIds }, status: 'ACTIVE' },
      });
      if (Array.isArray(claims) && claims.length) {
        throw captureAuthorityError(
          'CAPTURE_OWNERSHIP_CONFLICT',
          'An active Gateway owner blocks evidence capture.',
        );
      }
    }
  }
};

const tablesHaveGatewayDelegates = (database: Record<string, unknown>): boolean => {
  const tables = intakePrisma(database);
  return Boolean(tables.gatewayJobs?.findMany && tables.gatewayClaims?.findMany);
};
const normalizedTargetKinds = (value: unknown): string[] => Array.from(new Set(
  stringArray(value)
    .map((entry) => entry.toUpperCase())
    .filter((entry) => VALID_TARGET_KINDS.has(entry)),
));

const normalizedRole = (value: unknown): string => {
  const role = stringValue(value)?.toUpperCase() ?? 'LISTING';
  if (!VALID_PAGE_ROLES.has(role)) throw new Error(`Unsupported intake page role: ${role}`);
  return role;
};

const sourceKeyFor = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100);

const deriveSourceKey = (input: AffiliateSourceIntakeCreateInput): string => {
  const requested = stringValue(input.sourceKey);
  const key = sourceKeyFor(requested ?? input.name);
  if (!key) throw new Error('Affiliate source intake requires a source key.');
  return key;
};

const jsonBuffer = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

const upsertIntakePage = async (
  intakeId: string,
  input: AffiliateSourceIntakePageInput,
  discoverySource = 'MANUAL',
  client: any = prisma,
) => {
  const { pages } = intakePrisma(client);
  const url = stringValue(input.url);
  if (!url) throw new Error('Affiliate source intake page URL is required.');
  await assertSafePublicUrl(url);
  const canonicalUrl = canonicalizeAffiliateIntakeUrl(url);
  const urlKey = affiliateIntakeUrlKey(canonicalUrl);
  const existing = await pages.findUnique({ where: { urlKey } });
  if (existing && existing.intakeId !== intakeId) {
    throw new Error(`Source page already belongs to another intake: ${canonicalUrl}`);
  }
  const data = {
    url,
    canonicalUrl,
    urlKey,
    role: normalizedRole(input.role),
    targetKindHints: normalizedTargetKinds(input.targetKindHints),
    discoverySource: stringValue(input.discoverySource) ?? discoverySource,
    status: 'ACTIVE',
    metadata: input.metadata ? recordValue(input.metadata) : existing?.metadata ?? undefined,
  };
  if (existing) {
    return pages.update({ where: { id: existing.id }, data });
  }
  return pages.create({ data: { id: createId(), intakeId, ...data } });
};
const upsertAffiliateIntakePages = async (input: Readonly<{
  intakeId: string;
  pages: readonly AffiliateSourceIntakePageInput[];
  targetKindHints: string[] | null;
  initialSupplySourceId?: string | null;
  isIntakeLinkPending: boolean;
  client: any;
}>): Promise<string | null> => {
  let supplySourceId = input.initialSupplySourceId ?? null;
  let isIntakeLinkPending = input.isIntakeLinkPending;
  for (const pageInput of input.pages) {
    const page = await upsertIntakePage(input.intakeId, pageInput, 'MANUAL', input.client);
    const pageSupplySourceId = await ensureAffiliateIntakeSupplySource({
      intakeId: input.intakeId,
      pageId: page.id,
      existingSupplySourceId: page.supplySourceId,
      expectedIntakeSupplySourceId: isIntakeLinkPending
        ? input.initialSupplySourceId ?? null
        : undefined,
      pageUrl: pageInput.url,
      targetKindHints: input.targetKindHints,
      isIntakeLinkPending,
      db: input.client,
    });
    if (!supplySourceId && pageSupplySourceId) supplySourceId = pageSupplySourceId;
    isIntakeLinkPending = false;
  }
  return supplySourceId;
};

export const createAffiliateSourceIntake = async (
  input: AffiliateSourceIntakeCreateInput,
  userId: string,
): Promise<AffiliateSourceIntakes> => {
  const name = stringValue(input.name);
  if (!name) throw new Error('Affiliate source intake name is required.');
  if (!input.pages?.length) throw new Error('Affiliate source intake requires at least one page URL.');
  const sourceKey = deriveSourceKey(input);
  return withAffiliateIntakeTransaction(prisma, async (transactionClient) => {
    const { intakes } = intakePrisma(transactionClient);
    const existing = await intakes.findUnique({ where: { sourceKey } });
    if (existing) {
      const supplySourceId = await upsertAffiliateIntakePages({
        intakeId: existing.id,
        pages: input.pages,
        targetKindHints: normalizedTargetKinds(input.targetKindHints),
        initialSupplySourceId: existing.supplySourceId,
        isIntakeLinkPending: existing.supplySourceId === null,
        client: transactionClient,
      });
      const updated = await intakes.update({
        where: { id: existing.id },
        data: {
          name,
          region: stringValue(input.region),
          baseUrl: stringValue(input.baseUrl) ?? existing.baseUrl,
          targetKindHints: normalizedTargetKinds(input.targetKindHints),
          notes: stringValue(input.notes),
        },
      });
      return supplySourceId ? { ...updated, supplySourceId } : updated;
    }

    const firstCanonicalUrl = canonicalizeAffiliateIntakeUrl(input.pages[0].url);
    const intake = await intakes.create({
      data: {
        id: createId(),
        name,
        sourceKey,
        region: stringValue(input.region),
        baseUrl: stringValue(input.baseUrl) ?? new URL(firstCanonicalUrl).origin,
        status: 'REVIEW_REQUIRED',
        complianceStatus: 'UNREVIEWED',
        targetKindHints: normalizedTargetKinds(input.targetKindHints),
        notes: stringValue(input.notes),
        createdByUserId: userId,
      },
    });
    const supplySourceId = await upsertAffiliateIntakePages({
      intakeId: intake.id,
      pages: input.pages,
      targetKindHints: normalizedTargetKinds(input.targetKindHints),
      isIntakeLinkPending: true,
      client: transactionClient,
    });
    return supplySourceId ? { ...intake, supplySourceId } : intake;
  });
};

export const bulkUpsertAffiliateSourceIntakes = async (
  rows: AffiliateSourceIntakeImportRow[],
  userId: string,
): Promise<AffiliateSourceIntakeImportResult> => {
  const { intakes, pages } = intakePrisma();
  const result: AffiliateSourceIntakeImportResult = {
    created: 0,
    updated: 0,
    duplicatePages: 0,
    rejected: [],
    intakeIds: [],
  };

  for (const row of rows) {
    try {
      const sourceKey = deriveSourceKey(row);
      const before = await intakes.findUnique({ where: { sourceKey } });
      const priorPageCount = before
        ? await pages.count({ where: { intakeId: before.id } })
        : 0;
      const intake = await createAffiliateSourceIntake(row, userId);
      const nextPageCount = await pages.count({ where: { intakeId: intake.id } });
      if (before) result.updated += 1;
      else result.created += 1;
      result.duplicatePages += Math.max(0, row.pages.length - (nextPageCount - priorPageCount));
      result.intakeIds.push(intake.id);
    } catch (error) {
      result.rejected.push({
        name: stringValue(row.name) ?? 'Unnamed source',
        reason: error instanceof Error ? error.message : 'Unknown import error',
      });
    }
  }
  result.intakeIds = Array.from(new Set(result.intakeIds));
  return result;
};

export const addAffiliateSourceIntakePage = async (intakeId: string, input: AffiliateSourceIntakePageInput) => (
  withAffiliateIntakeTransaction(prisma, async (transactionClient) => {
    const intake = await intakePrisma(transactionClient).intakes.findUnique({ where: { id: intakeId } });
    if (!intake) throw new Error('Affiliate source intake not found.');
    const page = await upsertIntakePage(intakeId, input, 'MANUAL', transactionClient);
    await ensureAffiliateIntakeSupplySource({
      intakeId,
      pageId: page.id,
      existingSupplySourceId: page.supplySourceId,
      expectedIntakeSupplySourceId: intake.supplySourceId ?? null,
      pageUrl: input.url,
      targetKindHints: input.targetKindHints ?? intake.targetKindHints,
      isIntakeLinkPending: intake.supplySourceId === null,
      db: transactionClient,
    });
    return page;
  })
);

export const reviewAffiliateSourceIntakePolicy = async (
  intakeId: string,
  review: AffiliateSourcePolicyReview,
  userId: string,
  options: { queueCaptureOnAllow?: boolean; db?: unknown } = {},
) => {
  const complianceStatus = stringValue(review.complianceStatus)?.toUpperCase() ?? '';
  if (!VALID_COMPLIANCE_STATUSES.has(complianceStatus)) {
    throw new Error('Unsupported affiliate source compliance status.');
  }
  return withAffiliateIntakeTransaction(options.db ?? prisma, async (transactionClient) => {
    const { intakes, pages, policies, discoveryResults } = intakePrisma(transactionClient);
    const intake = await intakes.findUnique({ where: { id: intakeId } });
    if (!intake) throw new Error('Affiliate source intake not found.');
    const status = complianceStatus === 'ALLOWED'
      ? 'READY'
      : complianceStatus === 'BLOCKED'
        ? 'BLOCKED'
        : 'REVIEW_REQUIRED';
    const reviewedAt = new Date();
    const updated = await intakes.update({
      where: { id: intakeId },
      data: {
        complianceStatus,
        status,
        complianceReviewedByUserId: userId,
        complianceReviewedAt: reviewedAt,
        complianceTermsUrl: stringValue(review.termsUrl),
        complianceNotes: stringValue(review.notes),
      },
    });
    const policyUrl = stringValue(intake.baseUrl)
      ?? (await pages.findFirst({ where: { intakeId }, orderBy: { createdAt: 'asc' }, select: { canonicalUrl: true } }))?.canonicalUrl
      ?? null;
    if (policyUrl) {
      const policyKey = affiliateDiscoveryPolicyKeyForUrl(policyUrl);
      const existingPolicy = await policies.findUnique({ where: { policyKey } });
      const existingEvidence = recordValue(existingPolicy?.evidence);
      const reviewHistory = Array.isArray(existingEvidence.reviewHistory)
        ? existingEvidence.reviewHistory
        : [];
      const evidence = {
        ...existingEvidence,
        reviewHistory: [
          ...reviewHistory,
          {
            reviewedAt: reviewedAt.toISOString(),
            reviewedByUserId: userId,
            previousStatus: existingPolicy?.status ?? null,
            status: complianceStatus === 'UNREVIEWED' ? 'NEEDS_REVIEW' : complianceStatus,
            termsUrl: stringValue(review.termsUrl),
            restrictionNotes: stringValue(review.notes),
          },
        ].slice(-20),
      };
      await policies.upsert({
        where: { policyKey },
        create: {
          id: createId(),
          policyKey,
          status: complianceStatus === 'UNREVIEWED' ? 'NEEDS_REVIEW' : complianceStatus,
          reviewedByUserId: userId,
          reviewedAt,
          expiresAt: complianceStatus === 'ALLOWED'
            ? new Date(reviewedAt.getTime() + 180 * 86_400_000)
            : null,
          termsUrl: stringValue(review.termsUrl),
          restrictionNotes: stringValue(review.notes),
          evidence,
          robotsSummary: existingPolicy?.robotsSummary ?? undefined,
        },
        update: {
          status: complianceStatus === 'UNREVIEWED' ? 'NEEDS_REVIEW' : complianceStatus,
          reviewedByUserId: userId,
          reviewedAt,
          expiresAt: complianceStatus === 'ALLOWED'
            ? new Date(reviewedAt.getTime() + 180 * 86_400_000)
            : null,
          termsUrl: stringValue(review.termsUrl),
          restrictionNotes: stringValue(review.notes),
          evidence,
        },
      });
      await discoveryResults.updateMany({
        where: { policyKey, matchingIntakeId: intakeId },
        data: {
          status: complianceStatus === 'BLOCKED'
            ? 'BLOCKED'
            : complianceStatus === 'ALLOWED' ? 'INTAKE_CREATED' : 'REVIEW_REQUIRED',
        },
      });
    }
    if (complianceStatus === 'ALLOWED' && options.queueCaptureOnAllow !== false) {
      const selectedPages = await pages.findMany({
        where: { intakeId, status: 'ACTIVE' },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        take: MAX_CAPTURE_PAGES,
        select: { id: true },
      });
      if (selectedPages.length) {
        await queueAffiliateSourceIntakeRun(
          intakeId,
          selectedPages.map((page: { id: string }) => page.id),
          userId,
          { db: transactionClient },
        );
      }
    }
    return updated;
  });
};

export const updateAffiliateSourceIntake = async (
  intakeId: string,
  input: { status?: string; notes?: string | null; selectedLogoArtifactId?: string | null },
) => {
  const { intakes, artifacts } = intakePrisma();
  const intake = await intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  const status = input.status ? input.status.trim().toUpperCase() : undefined;
  if (status && !VALID_INTAKE_STATUSES.has(status)) throw new Error('Unsupported affiliate source intake status.');
  if (input.selectedLogoArtifactId) {
    const logo = await artifacts.findFirst({
      where: { id: input.selectedLogoArtifactId, intakeId, kind: 'LOGO_CANDIDATE' },
    });
    if (!logo) throw new Error('Selected logo artifact does not belong to this intake.');
  }
  return intakes.update({
    where: { id: intakeId },
    data: {
      ...(status ? { status } : {}),
      ...(input.notes !== undefined ? { notes: stringValue(input.notes) } : {}),
      ...(input.selectedLogoArtifactId !== undefined
        ? { selectedLogoArtifactId: stringValue(input.selectedLogoArtifactId) }
        : {}),
    },
  });
};

export type AffiliateSourceIntakeListOptions = {
  page?: number;
  pageSize?: number;
  query?: string | null;
};

export type AffiliateSourceIntakeListResult = {
  intakes: any[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export const listAffiliateSourceIntakes = async (
  options: AffiliateSourceIntakeListOptions = {},
): Promise<AffiliateSourceIntakeListResult> => {
  const { intakes, pages, runs, artifacts } = intakePrisma();
  const requestedPageSize = Number.isFinite(options.pageSize) ? Number(options.pageSize) : 50;
  const requestedPage = Number.isFinite(options.page) ? Number(options.page) : 1;
  const pageSize = Math.max(1, Math.min(100, Math.trunc(requestedPageSize)));
  const page = Math.max(1, Math.trunc(requestedPage));
  const query = stringValue(options.query);
  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sourceKey: { contains: query, mode: 'insensitive' } },
          { region: { contains: query, mode: 'insensitive' } },
          { baseUrl: { contains: query, mode: 'insensitive' } },
        ],
      }
    : {};
  const [total, intakeRows] = await Promise.all([
    intakes.count({ where }),
    intakes.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (!intakeRows.length) {
    return {
      intakes: [],
      pagination: { page, pageSize, total, totalPages },
    };
  }
  const intakeIds = intakeRows.map((row: any) => row.id);
  const [pageCounts, runRows, artifactCounts] = await Promise.all([
    pages.groupBy({
      by: ['intakeId'],
      where: { intakeId: { in: intakeIds } },
      _count: { _all: true },
    }),
    runs.findMany({
      where: { intakeId: { in: intakeIds } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        intakeId: true,
        status: true,
        createdAt: true,
        capturedPageCount: true,
        discoveredUrlCount: true,
        summary: true,
        errorMessage: true,
      },
    }),
    artifacts.groupBy({
      by: ['intakeId'],
      where: { intakeId: { in: intakeIds } },
      _count: { _all: true },
    }),
  ]);
  const pageCountByIntakeId = new Map(
    pageCounts.map((row: any) => [row.intakeId, Number(row._count?._all ?? 0)]),
  );
  const artifactCountByIntakeId = new Map(
    artifactCounts.map((row: any) => [row.intakeId, Number(row._count?._all ?? 0)]),
  );
  const latestRunByIntakeId = new Map<string, any>();
  for (const run of runRows) {
    if (!latestRunByIntakeId.has(run.intakeId)) latestRunByIntakeId.set(run.intakeId, run);
  }
  return {
    intakes: intakeRows.map((intake: any) => ({
      ...intake,
      pageCount: pageCountByIntakeId.get(intake.id) ?? 0,
      artifactCount: artifactCountByIntakeId.get(intake.id) ?? 0,
      latestRun: latestRunByIntakeId.get(intake.id) ?? null,
    })),
    pagination: { page, pageSize, total, totalPages },
  };
};

export const getAffiliateSourceIntakeContext = async (intakeId: string, runId?: string | null) => {
  const { intakes, pages, runs, artifacts, policies, discoveryResults } = intakePrisma();
  const intake = await intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  const [pageRows, runRows] = await Promise.all([
    pages.findMany({ where: { intakeId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] }),
    runs.findMany({ where: { intakeId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const selectedRunId = stringValue(runId) ?? runRows[0]?.id ?? null;
  const artifactRows = selectedRunId
    ? await artifacts.findMany({ where: { intakeId, runId: selectedRunId }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] })
    : [];
  const policyUrl = stringValue(intake.baseUrl) ?? pageRows[0]?.canonicalUrl ?? null;
  const policyKey = policyUrl ? affiliateDiscoveryPolicyKeyForUrl(policyUrl) : null;
  const [domainPolicy, relatedDiscoveryResults] = policyKey
    ? await Promise.all([
      policies.findUnique({ where: { policyKey } }),
      discoveryResults.findMany({ where: { policyKey }, orderBy: { score: 'desc' }, take: 25 }),
    ])
    : [null, []];
  return {
    intake,
    pages: pageRows,
    runs: runRows,
    selectedRunId,
    artifacts: artifactRows,
    policyKey,
    domainPolicy,
    relatedDiscoveryResults,
  };
};
export const assertOrdinaryAffiliateSourceIntakeQueueOwnership = async (
  intakeId: string,
  database: unknown = prisma,
): Promise<void> => {
  const runs = intakePrisma(database).runs;
  const activeRuns = typeof runs.findMany === 'function'
    ? await runs.findMany({
      where: { intakeId, status: { in: ['QUEUED', 'RUNNING', 'CLAIMED'] } },
      orderBy: { queuedAt: 'asc' },
    })
    : [];
  const governedRun = Array.isArray(activeRuns)
    ? activeRuns.find((candidate: unknown) => isExistingDataRepairEvidenceOnlyRun(candidate))
    : null;
  if (governedRun) {
    throw new AffiliateSourceIntakeQueueConflictError(
      'An existing-data repair capture owns this intake. Use the governed capture process.',
    );
  }
};

export const queueAffiliateSourceIntakeRun = async (
  intakeId: string,
  requestedPageIds: string[],
  userId: string,
  options: AffiliateSourceIntakeRunQueueOptions = {},
) => (
  withAffiliateIntakeTransaction(options.db ?? prisma, async (transactionClient) => {
    const { intakes, pages, runs } = intakePrisma(transactionClient);
    const intake = await intakes.findUnique({ where: { id: intakeId } });
    if (!intake) throw new Error('Affiliate source intake not found.');
    if (intake.complianceStatus !== 'ALLOWED') {
      throw new Error('Affiliate source policy must be reviewed and allowed before inspection.');
    }
    const pageIds = Array.from(new Set(stringArray(requestedPageIds)));
    if (!pageIds.length) throw new Error('Select at least one source page to inspect.');
    if (pageIds.length > MAX_CAPTURE_PAGES) throw new Error(`At most ${MAX_CAPTURE_PAGES} source pages may be inspected per run.`);
    const selectedPages = await pages.findMany({
      where: { id: { in: pageIds }, intakeId, status: 'ACTIVE' },
    });
    if (selectedPages.length !== pageIds.length) throw new Error('One or more selected pages do not belong to this intake.');

    const marker = options.existingDataRepairEvidenceOnly;
    if (marker) {
      if (
        marker.intakeId !== intakeId
        || !sameStringArray(marker.pageIds, pageIds)
        || marker.operatorId !== userId
      ) {
        throw new Error('Existing data repair evidence marker does not match the queued intake run.');
      }
      const priorRunsResult = typeof runs.findMany === 'function'
        ? await runs.findMany({ where: { intakeId }, orderBy: { createdAt: 'desc' } })
        : [];
      const priorRuns = Array.isArray(priorRunsResult) ? priorRunsResult : [];
      const exactRun = priorRuns.find((candidate: unknown) => {
        const candidateMarker = existingDataRepairEvidenceMarkerFrom(
          recordValue(candidate).summary,
        );
        return candidateMarker
          && candidateMarker.requestHash === marker.requestHash
          && candidateMarker.operatorId === marker.operatorId
          && candidateMarker.intakeId === marker.intakeId
          && sameStringArray(candidateMarker.pageIds, marker.pageIds);
      });
      if (exactRun) return exactRun;
      const activeRun = priorRuns.find((candidate: unknown) => (
        ['QUEUED', 'RUNNING', 'CLAIMED'].includes(String(recordValue(candidate).status).toUpperCase())
      ));
      if (activeRun) {
        throw new AffiliateSourceIntakeQueueConflictError(
          'An active affiliate source intake run already exists.',
        );
      }
      const activeRunFromIndex = await runs.findFirst({
        where: { intakeId, status: { in: ['QUEUED', 'RUNNING', 'CLAIMED'] } },
        orderBy: { queuedAt: 'asc' },
      });
      if (activeRunFromIndex) {
        throw new AffiliateSourceIntakeQueueConflictError(
          'An active affiliate source intake run already exists.',
        );
      }
    } else {
      await assertOrdinaryAffiliateSourceIntakeQueueOwnership(intakeId, transactionClient);
      const activeRun = await runs.findFirst({
        where: { intakeId, status: { in: ['QUEUED', 'RUNNING', 'CLAIMED'] } },
        orderBy: { queuedAt: 'asc' },
      });
      if (activeRun) {
        if (isAffiliateExistingDataRepairEvidenceOnlyRun(activeRun)) {
          throw new AffiliateSourceIntakeQueueConflictError('A governed capture owns this intake.');
        }
        return activeRun;
      }
    }

    return runs.create({
      data: {
        id: createId(),
        intakeId,
        ...(intake.supplySourceId ? { supplySourceId: intake.supplySourceId } : {}),
        requestedPageIds: pageIds,
        requestedByUserId: userId,
        provider: resolveAffiliateIntakeProvider(),
        status: 'QUEUED',
        queuedAt: new Date(),
        ...(marker ? { summary: { existingDataRepairEvidenceOnly: marker } } : {}),
      },
    });
  })
);

const inferDiscoveredPageRole = (url: string): string => {
  const path = new URL(url).pathname.toLowerCase();
  if (/terms|privacy|legal|polic/.test(path)) return 'POLICY';
  if (/rent|book|reserv/.test(path)) return 'RENTAL';
  if (/register|signup|tryout/.test(path)) return 'REGISTRATION';
  if (/director|find-a-club|clubs/.test(path)) return 'DIRECTORY';
  if (/event|league|tournament|program|schedule|camp|clinic/.test(path)) return 'LISTING';
  return 'DETAIL';
};

const persistDiscoveredPages = async (
  intakeId: string,
  sourceUrl: string,
  links: AffiliateDiscoveredPage[],
): Promise<{ stored: number; warnings: string[] }> => {
  const sourceOrigin = new URL(sourceUrl).origin;
  let stored = 0;
  const warnings: string[] = [];
  for (const link of links.slice(0, MAX_DISCOVERED_URLS)) {
    try {
      if (new URL(link.url).origin !== sourceOrigin) continue;
      await upsertIntakePage(intakeId, {
        url: link.url,
        role: inferDiscoveredPageRole(link.url),
      }, link.discoveryMethod);
      stored += 1;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Failed to store discovered URL: ${link.url}`);
    }
  }
  return { stored, warnings };
};

const candidateLogoUrls = (
  capture: AffiliateSourcePageCapture,
  artifacts: AffiliateHtmlArtifacts,
): Array<{ url: string; reason: string }> => {
  const branding = recordValue(capture.providerArtifacts?.branding);
  const brandingImages = recordValue(branding.images);
  const metadata = recordValue(capture.providerArtifacts?.metadata);
  const candidates = [
    ...artifacts.branding.candidates,
    { url: stringValue(branding.logo), reason: `${capture.provider} branding logo` },
    { url: stringValue(brandingImages.logo), reason: `${capture.provider} branding image logo` },
    { url: stringValue(brandingImages.ogImage), reason: `${capture.provider} branding Open Graph image` },
    { url: stringValue(metadata.ogImage), reason: 'Page Open Graph image' },
    { url: stringValue(brandingImages.favicon), reason: `${capture.provider} branding favicon` },
    { url: stringValue(metadata.favicon), reason: 'Page favicon' },
    ...artifacts.images
      .filter((url) => /logo|brand|crest|mark/i.test(url))
      .map((url) => ({ url, reason: 'Page image URL contains a logo or brand label' })),
    ...(capture.providerArtifacts?.images ?? [])
      .filter((url) => /logo|brand|crest|mark/i.test(url))
      .map((url) => ({ url, reason: `${capture.provider} image URL contains a logo or brand label` })),
  ].filter((candidate): candidate is { url: string; reason: string } => Boolean(candidate.url));
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    let protocol: string;
    try {
      protocol = new URL(candidate.url).protocol;
    } catch {
      return false;
    }
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  }).slice(0, MAX_LOGO_CANDIDATES_PER_PAGE);
};

export const classifyAffiliateSourceEvidence = (
  evidence: string,
  urls: string[] = [],
): AffiliateSourceClassification => {
  const text = `${evidence}\n${urls.join('\n')}`.toLowerCase();
  const reasons: string[] = [];
  const score = (pattern: RegExp, reason: string): number => {
    if (!pattern.test(text)) return 0;
    reasons.push(reason);
    return 1;
  };
  const auth = score(/sign in|log in|required account|members only/, 'Page appears to require authentication.');
  const directory = score(/find a club|club directory|member clubs|directory/, 'Page contains directory language.');
  const strongRental = score(/reserve a (field|court|gym)|book a (field|court|gym)|facility reservation/, 'Page contains a specific rental or reservation action.');
  const rental = strongRental ? 0 : score(/rent(al)?/, 'Page contains rental language.');
  const events = score(/event|league|tournament|tryout|open gym|camp|clinic|schedule/, 'Page contains event or program language.');
  const club = score(/academy|soccer club|volleyball club|basketball club|our teams|competitive program/, 'Page contains club or academy language.');
  const marketplace = score(/marketplace|search providers|browse venues|multiple organizers/, 'Page appears to aggregate third-party inventory.');
  const noInventory = score(/no events|nothing scheduled|check back|coming soon|loading\.\.\./, 'Page does not expose current inventory.');
  const scores: Array<[AffiliateSourceClassification['type'], number]> = [
    ['AUTH_REQUIRED', auth * 4],
    ['DIRECTORY', directory * 3],
    ['MARKETPLACE', marketplace * 3],
    ['RENTAL', strongRental * 4 + rental],
    ['EVENT_CATALOG', events * 3],
    ['CLUB', club * 2],
    ['NO_CURRENT_INVENTORY', noInventory * 2],
  ];
  scores.sort((left, right) => right[1] - left[1]);
  const [type, bestScore] = scores[0];
  if (!bestScore) return { type: 'UNKNOWN', confidence: 0, reasons: ['No classification signals were found.'] };
  return { type, confidence: Math.min(1, 0.45 + bestScore * 0.12), reasons };
};

const claimQueuedRun = async (
  runId: string | undefined,
  workerId: string,
  now: Date,
  client: unknown = prisma,
  governedProcessIntent?: AffiliateSourceIntakeGovernedProcessIntent,
) => {
  const { runs } = intakePrisma(client);
  const allowsEvidenceRun = (candidate: unknown): boolean => {
    if (!isExistingDataRepairEvidenceOnlyRun(candidate)) return true;
    const marker = existingDataRepairEvidenceMarkerFrom(recordValue(candidate).summary);
    return Boolean(
      governedProcessIntent
      && governedProcessIntent.purpose === AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE
      && marker
      && marker.operatorId === governedProcessIntent.operatorId
      && hashAffiliateAgentValue(marker) === governedProcessIntent.markerSha256,
    );
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let queued = runId
      ? await runs.findFirst({ where: { id: runId, status: 'QUEUED' } })
      : await runs.findFirst({ where: { status: 'QUEUED' }, orderBy: { queuedAt: 'asc' } });
    if (!queued) return null;
    if (!allowsEvidenceRun(queued)) {
      if (runId || typeof runs.findMany !== 'function') return null;
      const candidates = await runs.findMany({
        where: { status: 'QUEUED' },
        orderBy: { queuedAt: 'asc' },
      });
      queued = Array.isArray(candidates)
        ? candidates.find((candidate: unknown) => allowsEvidenceRun(candidate)) ?? null
        : null;
      if (!queued) return null;
    }
    const claimed = await runs.updateMany({
      where: { id: queued.id, status: 'QUEUED' },
      data: {
        status: 'RUNNING',
        startedAt: now,
        claimedAt: now,
        workerId,
        attemptCount: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count === 1) return runs.findUnique({ where: { id: queued.id } });
    if (runId) return null;
  }
  return null;
};

const completeClaimedRun = async (
  run: { id: string; summary?: unknown },
  workerId: string,
  data: Record<string, unknown>,
  client: unknown = prisma,
) => {
  const { runs } = intakePrisma(client);
  const dataToPersist = {
    ...data,
    ...(run.summary !== undefined || data.summary !== undefined
      ? { summary: runSummaryWithPreservedMarker(run.summary, data.summary) }
      : {}),
  };
  const updated = await runs.updateMany({
    where: { id: run.id, status: 'RUNNING', workerId },
    data: dataToPersist,
  });
  if (updated.count !== 1) return null;
  return { ...run, ...dataToPersist };
};
export type StaleAffiliateSourceIntakeRun = {
  id: string;
  intakeId: string;
  supplySourceId?: string | null;
  requestedPageIds: string[];
  requestedByUserId: string | null;
  provider: string;
  claimedAt: Date | null;
  startedAt: Date | null;
  workerId: string | null;
  attemptCount: number;
  summary: unknown;
};

export type RecoveredAffiliateSourceIntakeRun = {
  staleRunId: string;
  replacementRunId: string;
  intakeId: string;
};

export const findStaleAffiliateSourceIntakeRuns = async (options: {
  db?: unknown;
  runIds?: string[];
  now?: Date;
  maxAgeMs?: number;
} = {}): Promise<StaleAffiliateSourceIntakeRun[]> => {
  const now = options.now ?? new Date();
  const maxAgeMs = Math.max(20 * 60 * 1000, options.maxAgeMs ?? staleRunAgeMs());
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const runIds = Array.from(new Set(stringArray(options.runIds)));
  return intakePrisma(options.db).runs.findMany({
    where: {
      status: 'RUNNING',
      ...(runIds.length ? { id: { in: runIds } } : {}),
      OR: [
        { claimedAt: { lte: cutoff } },
        { claimedAt: null, startedAt: { lte: cutoff } },
      ],
    },
    orderBy: { startedAt: 'asc' },
  });
};

export const recoverStaleAffiliateSourceIntakeRuns = async (options: {
  db?: unknown;
  runIds?: string[];
  now?: Date;
  maxAgeMs?: number;
} = {}): Promise<RecoveredAffiliateSourceIntakeRun[]> => {
  const now = options.now ?? new Date();
  const maxAgeMs = Math.max(20 * 60 * 1000, options.maxAgeMs ?? staleRunAgeMs());
  const staleRuns = await findStaleAffiliateSourceIntakeRuns({ ...options, now, maxAgeMs });
  const maxAgeMinutes = Math.round(maxAgeMs / 60_000);
  const recovered: RecoveredAffiliateSourceIntakeRun[] = [];
  await withAffiliateIntakeTransaction(options.db ?? prisma, async (transactionClient) => {
    const { runs } = intakePrisma(transactionClient);
    for (const staleRun of staleRuns) {
      const otherActiveRun = await runs.findFirst({
        where: {
          intakeId: staleRun.intakeId,
          id: { not: staleRun.id },
          status: { in: ['QUEUED', 'RUNNING', 'CLAIMED'] },
        },
        orderBy: { queuedAt: 'asc' },
      });
      if (isExistingDataRepairEvidenceOnlyRun(staleRun) && otherActiveRun) continue;
      const replacementRunId = otherActiveRun?.id ?? createId();
      const priorSummary = recordValue(staleRun.summary);
      const marked = await runs.updateMany({
        where: {
          id: staleRun.id,
          status: 'RUNNING',
          workerId: staleRun.workerId,
          claimedAt: staleRun.claimedAt,
        },
        data: {
          status: 'FAILED',
          finishedAt: now,
          errorMessage: otherActiveRun
            ? `Capture worker lease exceeded ${maxAgeMinutes} minutes; active replacement run ${replacementRunId} already exists.`
            : `Capture worker lease exceeded ${maxAgeMinutes} minutes; replacement run ${replacementRunId} was queued.`,
          summary: {
            ...priorSummary,
            recovery: {
              ...recordValue(priorSummary.recovery),
              reason: 'STALE_WORKER_LEASE',
              recoveredAt: now.toISOString(),
              maxAgeMinutes,
              staleWorkerId: staleRun.workerId,
              replacementRunId,
            },
          },
        },
      });
      if (marked.count !== 1) continue;
      if (!otherActiveRun) {
        await runs.create({
          data: {
            id: replacementRunId,
            intakeId: staleRun.intakeId,
            ...(staleRun.supplySourceId ? { supplySourceId: staleRun.supplySourceId } : {}),
            requestedPageIds: staleRun.requestedPageIds,
            requestedByUserId: staleRun.requestedByUserId,
            provider: staleRun.provider,
            status: 'QUEUED',
            queuedAt: now,
            summary: {
              ...priorSummary,
              recovery: {
                reason: 'STALE_WORKER_LEASE_REPLACEMENT',
                replacesRunId: staleRun.id,
                recoveredAt: now.toISOString(),
              },
            },
          },
        });
      }
      recovered.push({
        staleRunId: staleRun.id,
        replacementRunId,
        intakeId: staleRun.intakeId,
      });
    }
  });
  return recovered;
};

const robotsUrlFor = (pageUrl: string): string => new URL('/robots.txt', new URL(pageUrl).origin).toString();

const persistCaptureArtifact = async (
  input: Parameters<typeof persistAffiliateSourceIntakeArtifact>[0],
  state: { storedBytes: number; warnings: string[] },
) => {
  if (state.storedBytes + input.data.length > INTAKE_RUN_ARTIFACT_LIMIT_BYTES) {
    state.warnings.push(`Skipped ${input.kind}: run storage limit would be exceeded.`);
    return null;
  }
  const artifact = await persistAffiliateSourceIntakeArtifact(input);
  state.storedBytes += input.data.length;
  return artifact;
};

type IntakeCaptureClient = AffiliateSourceCaptureClient | AffiliateFirecrawlClient;

const isProviderName = (value: unknown): value is AffiliateProviderName => (
  value === 'SCRAPINGDOG' || value === 'FIRECRAWL'
);

const providerForClient = (client: IntakeCaptureClient): AffiliateProviderName => {
  const provider = 'provider' in client ? client.provider : null;
  return isProviderName(provider) ? provider : 'FIRECRAWL';
};

const captureWithClient = async (
  client: IntakeCaptureClient,
  url: string,
  captureOptions: AffiliateSourceCaptureOptions = {},
): Promise<AffiliateSourcePageCapture> => {
  if ('captureSourcePage' in client) return client.captureSourcePage(url, captureOptions);
  const startedAt = Date.now();
  const legacy = await client.scrapeSourcePage(url, captureOptions);
  return {
    provider: 'FIRECRAWL',
    request: legacy.request,
    response: legacy.response,
    requestedUrl: url,
    finalUrl: legacy.normalized.finalUrl,
    isRedirectVerified: false,
    inferredCanonicalUrl: null,
    providerStatusCode: 200,
    targetStatusCode: legacy.normalized.statusCode,
    rawHtml: legacy.normalized.rawHtml ?? '',
    renderMode: 'JAVASCRIPT',
    elapsedMs: Date.now() - startedAt,
    estimatedCredits: null,
    warnings: legacy.normalized.warnings,
    providerJobId: legacy.providerJobId,
    providerArtifacts: {
      markdown: legacy.normalized.markdown,
      links: legacy.normalized.links,
      images: legacy.normalized.images,
      branding: legacy.normalized.branding,
      screenshotUrl: legacy.normalized.screenshotUrl,
      screenshotEvidence: legacy.normalized.screenshotEvidence,
      metadata: legacy.normalized.metadata,
    },
  };
};

const providerArtifactsWithScreenshot = (
  capture: AffiliateSourcePageCapture,
  screenshot: AffiliateSourceScreenshot,
): AffiliateSourcePageCapture => {
  const providerArtifacts = capture.providerArtifacts ?? {
    markdown: null,
    links: [],
    images: [],
    branding: null,
    screenshotUrl: null,
    metadata: {},
  };
  const screenshotEvidence: AffiliateSourcePageScreenshotEvidence = {
    data: screenshot.data,
    mimeType: screenshot.mimeType,
    sourceUrl: screenshot.sourceUrl,
    finalUrl: screenshot.finalUrl,
    statusCode: screenshot.providerStatusCode,
  };
  const captureCredits = capture.estimatedCredits;
  const screenshotCredits = screenshot.estimatedCredits;
  return {
    ...capture,
    elapsedMs: capture.elapsedMs + screenshot.elapsedMs,
    estimatedCredits: captureCredits === null && screenshotCredits === null
      ? null
      : (captureCredits ?? 0) + (screenshotCredits ?? 0),
    providerArtifacts: {
      ...providerArtifacts,
      screenshotUrl: null,
      screenshotEvidence,
      metadata: {
        ...recordValue(providerArtifacts.metadata),
        screenshotRequest: screenshot.request,
        screenshotResponse: screenshot.response,
        screenshotProviderStatusCode: screenshot.providerStatusCode,
        screenshotElapsedMs: screenshot.elapsedMs,
        screenshotEstimatedCredits: screenshot.estimatedCredits,
      },
    },
  };
};

type AffiliateSourceCaptureBudget = Readonly<{
  timeoutMs: number;
  deadlineAt: number;
}>;

const captureBudgetFor = (
  captureOptions: AffiliateSourceCaptureOptions,
): AffiliateSourceCaptureBudget => {
  const timeoutMs = affiliateSourceCaptureTimeoutMs(captureOptions.profile);
  return {
    timeoutMs,
    deadlineAt: affiliateSourceCaptureDeadlineAt(captureOptions),
  };
};

const captureOptionsFor = (
  captureOptions: AffiliateSourceCaptureOptions,
  budget: AffiliateSourceCaptureBudget,
  captureScreenshot: boolean,
): AffiliateSourceCaptureOptions => ({
  ...captureOptions,
  captureScreenshot,
  deadlineAt: budget.deadlineAt,
});

const captureWithDeferredScreenshot = async (
  capture: AffiliateSourcePageCapture,
  client: IntakeCaptureClient,
  url: string,
  captureOptions: AffiliateSourceCaptureOptions,
  budget: AffiliateSourceCaptureBudget,
): Promise<AffiliateSourcePageCapture> => {
  if (captureOptions.captureScreenshot !== true) return capture;
  if (capture.providerArtifacts?.screenshotEvidence) return capture;
  const screenshotTarget = capture.isRedirectVerified === true && stringValue(capture.finalUrl)
    ? capture.finalUrl
    : url;
  const providerArtifacts = capture.providerArtifacts ?? {
    markdown: null,
    links: [],
    images: [],
    branding: null,
    screenshotUrl: null,
    metadata: {},
  };
  const captureScreenshot = typeof client.captureScreenshot === 'function'
    ? client.captureScreenshot.bind(client)
    : null;
  if (!captureScreenshot) {
    return {
      ...capture,
      warnings: [...capture.warnings, `Screenshot capture unavailable for ${url}.`],
      providerArtifacts: {
        ...providerArtifacts,
        screenshotUrl: null,
        screenshotEvidence: null,
      },
    };
  }
  try {
    let reviewedScreenshotUrl = screenshotTarget;
    if (capture.isRedirectVerified === true) {
      const validated = await withAffiliateSourceCaptureDeadline(
        () => assertSafePublicUrl(screenshotTarget),
        budget.deadlineAt,
        budget.timeoutMs,
      );
      reviewedScreenshotUrl = validated.url.toString();
    }
    const screenshot = await withAffiliateSourceCaptureDeadline(
      () => captureScreenshot(
        reviewedScreenshotUrl,
        captureOptionsFor(captureOptions, budget, true),
      ),
      budget.deadlineAt,
      budget.timeoutMs,
    );
    return providerArtifactsWithScreenshot(capture, screenshot);
  } catch (error) {
    return {
      ...capture,
      warnings: [
        ...capture.warnings,
        `Screenshot capture failed for ${url}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      ],
      providerArtifacts: {
        ...providerArtifacts,
        screenshotUrl: null,
        screenshotEvidence: null,
      },
    };
  }
};

const captureWithFallback = async (
  primaryClient: IntakeCaptureClient,
  fallbackClient: AffiliateSourceCaptureClient | null,
  url: string,
  captureOptions: AffiliateSourceCaptureOptions,
  state: IntakeRunSummary,
): Promise<{
  capture: AffiliateSourcePageCapture;
  client: IntakeCaptureClient;
  budget: AffiliateSourceCaptureBudget;
}> => {
  const budget = captureBudgetFor(captureOptions);
  const htmlCaptureOptions = captureOptionsFor(captureOptions, budget, false);
  const capture = (client: IntakeCaptureClient): Promise<AffiliateSourcePageCapture> => (
    withAffiliateSourceCaptureDeadline(
      () => captureWithClient(client, url, htmlCaptureOptions),
      budget.deadlineAt,
      budget.timeoutMs,
    )
  );
  try {
    const primaryCapture = await capture(primaryClient);
    const quality = evaluateAffiliateHtmlQuality(primaryCapture.rawHtml, primaryCapture.finalUrl || url);
    if (!quality.accepted && fallbackClient) {
      state.warnings.push(
        `${providerForClient(primaryClient)} capture quality was rejected for ${url}; `
        + `${fallbackClient.provider} fallback was attempted: ${quality.reasons.join('; ')}`,
      );
      return {
        capture: await capture(fallbackClient),
        client: fallbackClient,
        budget,
      };
    }
    return { capture: primaryCapture, client: primaryClient, budget };
  } catch (primaryError) {
    if (isAffiliateSourceCaptureTimeout(primaryError) || !fallbackClient) throw primaryError;
    state.warnings.push(
      `${providerForClient(primaryClient)} capture failed for ${url}; `
      + `${fallbackClient.provider} fallback was attempted: `
      + `${primaryError instanceof Error ? primaryError.message : 'unknown error'}`,
    );
    return {
      capture: await capture(fallbackClient),
      client: fallbackClient,
      budget,
    };
  }
};


const processCapturePage = async (
  intake: any,
  run: any,
  page: any,
  primaryClient: IntakeCaptureClient,
  fallbackClient: AffiliateSourceCaptureClient | null,
  fetchResource: typeof fetchBoundedPublicResource,
  state: IntakeRunSummary,
  captureScreenshot: boolean,
  client: unknown = prisma,
  evidenceOnly = false,
): Promise<{
  capture: AffiliateSourcePageCapture | null;
  artifacts: AffiliateHtmlArtifacts | null;
  robotsText: string;
  providerJobId: string | null;
}> => {
  const robotsUrl = robotsUrlFor(page.url);
  let robots: BoundedPublicResource;
  try {
    robots = await fetchResource(robotsUrl, { maxBytes: ROBOTS_MAX_BYTES, timeoutMs: robotsTimeoutMs() });
  } catch (error) {
    if (!evidenceOnly) {
      await intakePrisma(client).pages.update({
        where: { id: page.id },
        data: {
          robotsStatus: 'UNCLEAR',
          robotsCheckedAt: new Date(),
          robotsNotes: error instanceof Error ? error.message : 'Failed to retrieve robots.txt.',
        },
      });
    }
    state.failedPages.push({
      pageId: page.id,
      url: page.url,
      error: `Robots check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
    return { capture: null, artifacts: null, robotsText: '', providerJobId: null };
  }

  await persistCaptureArtifact({
    intakeId: intake.id,
    supplySourceId: page.supplySourceId ?? intake.supplySourceId ?? null,
    pageId: page.id,
    runId: run.id,
    kind: 'ROBOTS',
    data: robots.body,
    sourceUrl: robotsUrl,
    finalUrl: robots.finalUrl,
    provider: 'DIRECT',
    httpStatus: robots.statusCode,
    mimeType: robots.contentType ?? 'text/plain',
  }, state);
  const robotsText = robots.statusCode >= 200 && robots.statusCode < 300
    ? robots.body.toString('utf8')
    : '';
  const decision = evaluateRobotsPath(robotsText, page.url);
  if (!evidenceOnly) {
    await intakePrisma(client).pages.update({
      where: { id: page.id },
      data: {
        robotsStatus: decision.status,
        robotsCheckedAt: new Date(),
        robotsNotes: decision.matchedRule ?? (robotsText ? 'No blocking rule matched.' : `robots.txt returned HTTP ${robots.statusCode}.`),
      },
    });
  }
  if (decision.status === 'DISALLOWED') {
    state.blockedPages.push({ pageId: page.id, url: page.url, rule: decision.matchedRule });
    return { capture: null, artifacts: null, robotsText, providerJobId: null };
  }

  if (page.role === 'REGISTRATION') {
    let accessResponse: BoundedPublicResource | null = null;
    try {
      accessResponse = await fetchResource(page.url, {
        maxBytes: 256 * 1024,
        timeoutMs: robotsTimeoutMs(),
      });
    } catch {
      // Use the configured provider when the direct preflight cannot identify an access gate.
    }
    if (accessResponse && evidenceOnly
      && canonicalizeAffiliateIntakeUrl(accessResponse.finalUrl) !== canonicalizeAffiliateIntakeUrl(page.canonicalUrl ?? page.url)) {
      const message = `Registration preflight redirected away from the reviewed source identity: ${page.url} -> ${accessResponse.finalUrl}.`;
      await persistCaptureArtifact({
        intakeId: intake.id,
        supplySourceId: page.supplySourceId ?? intake.supplySourceId ?? null,
        pageId: page.id,
        runId: run.id,
        kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
        data: jsonBuffer({
          requestedUrl: page.url,
          finalUrl: accessResponse.finalUrl,
          statusCode: accessResponse.statusCode,
          disposition: 'REDIRECT_IDENTITY_DRIFT',
        }),
        sourceUrl: page.url,
        finalUrl: accessResponse.finalUrl,
        provider: 'DIRECT',
        httpStatus: accessResponse.statusCode,
        mimeType: 'application/json',
        metadata: { identityDrift: true },
      }, state);
      state.failedPages.push({ pageId: page.id, url: page.url, error: message });
      state.warnings.push(message);
      return { capture: null, artifacts: null, robotsText, providerJobId: null };
    }
    if (accessResponse && (accessResponse.statusCode === 401 || accessResponse.statusCode === 403)) {
      await persistCaptureArtifact({
        intakeId: intake.id,
        supplySourceId: page.supplySourceId ?? intake.supplySourceId ?? null,
        pageId: page.id,
        runId: run.id,
        kind: 'PAGE_ACCESS_STATUS',
        data: jsonBuffer({
          statusCode: accessResponse.statusCode,
          disposition: 'AUTHENTICATION_REQUIRED',
        }),
        sourceUrl: page.url,
        finalUrl: accessResponse.finalUrl,
        provider: 'DIRECT',
        httpStatus: accessResponse.statusCode,
        mimeType: 'application/json',
      }, state);
      state.restrictedPages.push({ pageId: page.id, url: page.url, statusCode: accessResponse.statusCode });
      return { capture: null, artifacts: null, robotsText, providerJobId: null };
    }
  }

  try {
    const captured = await captureWithFallback(
      primaryClient,
      fallbackClient,
      page.url,
      { captureScreenshot },
      state,
    );
    let capture = captured.capture;
    const requestedIdentity = canonicalizeAffiliateIntakeUrl(page.canonicalUrl ?? page.url);
    let finalIdentity: string | null = null;
    try {
      finalIdentity = capture.finalUrl ? canonicalizeAffiliateIntakeUrl(capture.finalUrl) : null;
    } catch {
      finalIdentity = null;
    }
    if (evidenceOnly && finalIdentity !== requestedIdentity) {
      const driftMessage = `Capture redirected away from the reviewed source identity: ${page.url} -> ${capture.finalUrl || 'unknown final URL'}.`;
      const driftMetadata = {
        captureUrl: capture.requestedUrl,
        finalUrl: capture.finalUrl,
        identityDrift: true,
        requestedIdentity,
        finalIdentity,
        providerStatusCode: capture.providerStatusCode,
      };
      const driftBaseArtifact = {
        intakeId: intake.id,
        supplySourceId: page.supplySourceId ?? intake.supplySourceId ?? null,
        pageId: page.id,
        runId: run.id,
        sourceUrl: page.url,
        finalUrl: capture.finalUrl,
        provider: capture.provider,
        httpStatus: capture.targetStatusCode ?? capture.providerStatusCode,
      };
      await persistCaptureArtifact({
        ...driftBaseArtifact,
        kind: 'PROVIDER_SCRAPE_REQUEST_JSON',
        data: jsonBuffer(capture.request),
        mimeType: 'application/json',
        metadata: driftMetadata,
      }, state);
      await persistCaptureArtifact({
        ...driftBaseArtifact,
        kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
        data: jsonBuffer(capture.response),
        mimeType: 'application/json',
        metadata: driftMetadata,
      }, state);
      state.failedPages.push({ pageId: page.id, url: page.url, error: driftMessage });
      state.warnings.push(driftMessage);
      return { capture: null, artifacts: null, robotsText, providerJobId: capture.providerJobId ?? null };
    }
    capture = await captureWithDeferredScreenshot(
      capture,
      captured.client,
      page.url,
      { captureScreenshot },
      captured.budget,
    );
    const capturedSupplySourceId = evidenceOnly
      ? page.supplySourceId ?? intake.supplySourceId ?? null
      : await reconcileCapturedAffiliateSupplySource(intake, page, capture, client);
    const artifacts = deriveAffiliateHtmlArtifacts(capture.rawHtml, capture.finalUrl || page.url);
    const provider = capture.provider;
    const artifactMetadata = {
      extractorVersion: artifacts.extractorVersion,
      renderMode: capture.renderMode,
      elapsedMs: capture.elapsedMs,
      estimatedCredits: capture.estimatedCredits,
      attempts: capture.attempts ?? [],
      quality: artifacts.quality,
      captureUrl: capture.requestedUrl,
      isRedirectVerified: capture.isRedirectVerified,
      inferredCanonicalUrl: artifacts.inferredCanonicalUrl ?? capture.inferredCanonicalUrl ?? null,
    };
    const providerArtifactsMetadata = recordValue(capture.providerArtifacts?.metadata);
    const baseArtifact = {
      intakeId: intake.id,
      supplySourceId: capturedSupplySourceId,
      pageId: page.id,
      runId: run.id,
      sourceUrl: page.url,
      finalUrl: capture.finalUrl,
      provider,
      httpStatus: capture.targetStatusCode ?? capture.providerStatusCode,
    };
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PROVIDER_SCRAPE_REQUEST_JSON',
      data: jsonBuffer(capture.request),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
      data: jsonBuffer(capture.response),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    const markdown = artifacts.markdown || capture.providerArtifacts?.markdown || '';
    if (markdown) {
      await persistCaptureArtifact({
        ...baseArtifact,
        kind: 'PAGE_MARKDOWN',
        data: Buffer.from(markdown, 'utf8'),
        mimeType: 'text/markdown; charset=utf-8',
        metadata: artifactMetadata,
      }, state);
    }
    if (capture.rawHtml) {
      await persistCaptureArtifact({
        ...baseArtifact,
        kind: 'PAGE_HTML',
        data: Buffer.from(capture.rawHtml, 'utf8'),
        mimeType: 'text/html; charset=utf-8',
        metadata: artifactMetadata,
      }, state);
    }
    const links = Array.from(new Set([
      ...artifacts.links,
      ...(capture.providerArtifacts?.links ?? []),
    ]));
    const images = Array.from(new Set([
      ...artifacts.images,
      ...(capture.providerArtifacts?.images ?? []),
    ]));
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_LINKS',
      data: jsonBuffer(links),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_IMAGES',
      data: jsonBuffer(images),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    await persistCaptureArtifact({
      ...baseArtifact,
      kind: 'PAGE_BRANDING',
      data: jsonBuffer({
        ...artifacts.branding,
        providerBranding: capture.providerArtifacts?.branding ?? null,
      }),
      mimeType: 'application/json',
      metadata: artifactMetadata,
    }, state);
    const screenshotEvidence = capture.providerArtifacts?.screenshotEvidence ?? null;
    if (captureScreenshot && screenshotEvidence) {
      try {
        await persistCaptureArtifact({
          ...baseArtifact,
          kind: 'PAGE_SCREENSHOT',
          data: screenshotEvidence.data,
          sourceUrl: screenshotEvidence.sourceUrl,
          finalUrl: screenshotEvidence.finalUrl,
          httpStatus: screenshotEvidence.statusCode,
          mimeType: screenshotEvidence.mimeType,
          metadata: {
            ...artifactMetadata,
            providerArtifactsMetadata,
          },
        }, state);
      } catch (error) {
        state.warnings.push(
          `Screenshot persistence failed for ${page.url}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    if (!evidenceOnly) {
      for (const candidate of candidateLogoUrls(capture, artifacts)) {
      try {
        const logo = await fetchResource(candidate.url, { maxBytes: 3 * 1024 * 1024 });
        if (!logo.contentType?.toLowerCase().startsWith('image/')) {
          state.warnings.push(`Skipped non-image logo candidate: ${candidate.url}`);
          continue;
        }
        await persistCaptureArtifact({
          ...baseArtifact,
          kind: 'LOGO_CANDIDATE',
          data: logo.body,
          sourceUrl: candidate.url,
          finalUrl: logo.finalUrl,
          provider,
          httpStatus: logo.statusCode,
          mimeType: logo.contentType,
          metadata: { ...artifactMetadata, reason: candidate.reason },
        }, state);
      } catch (error) {
        state.warnings.push(`Logo candidate download failed for ${candidate.url}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    }
    state.warnings.push(...capture.warnings);
    state.estimatedCredits += capture.estimatedCredits ?? 0;
    state.capturedPages.push({
      pageId: page.id,
      url: page.url,
      finalUrl: capture.finalUrl,
      provider,
      renderMode: capture.renderMode,
      estimatedCredits: capture.estimatedCredits,
    });
    return {
      capture: {
        ...capture,
        providerArtifacts: {
          markdown,
          links,
          images,
          branding: {
            ...artifacts.branding,
            providerBranding: capture.providerArtifacts?.branding ?? null,
          },
          screenshotUrl: capture.providerArtifacts?.screenshotUrl ?? null,
          screenshotEvidence: capture.providerArtifacts?.screenshotEvidence ?? null,
          metadata: {
            ...recordValue(capture.providerArtifacts?.metadata),
            ...artifacts.metadata,
            extractorVersion: artifacts.extractorVersion,
            quality: artifacts.quality,
          },
        },
      },
      artifacts,
      robotsText,
      providerJobId: capture.providerJobId ?? null,
    };
  } catch (error) {
    state.failedPages.push({
      pageId: page.id,
      url: page.url,
      error: error instanceof Error ? error.message : 'Unknown affiliate capture error',
    });
    return { capture: null, artifacts: null, robotsText, providerJobId: null };
  }
};
export const processNextAffiliateSourceIntakeRun = async (
  options: {
    runId?: string;
    workerId?: string;
    governedProcessIntent?: AffiliateSourceIntakeGovernedProcessIntent;
  } = {},
  dependencies: AffiliateSourceIntakeProcessingDependencies = {},
) => {
  const now = dependencies.now?.() ?? new Date();
  const workerId = dependencies.workerId ?? options.workerId ?? `affiliate-intake-${process.pid}`;
  const databaseClient = dependencies.db ?? prisma;
  const run = await claimQueuedRun(
    stringValue(options.runId) ?? undefined,
    workerId,
    now,
    databaseClient,
    options.governedProcessIntent,
  );
  if (!run) return null;
  const evidenceOnly = isExistingDataRepairEvidenceOnlyRun(run);
  const { intakes, pages, runs, artifacts, mappingJobs } = intakePrisma(databaseClient);
  const intake = await intakes.findUnique({ where: { id: run.intakeId } });
  if (!intake) {
    const updated = await completeClaimedRun(run, workerId, {
      status: 'FAILED',
      finishedAt: now,
      errorMessage: 'Affiliate source intake not found.',
    }, databaseClient);
    if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
    return { runId: run.id, status: 'FAILED', errorMessage: 'Affiliate source intake not found.' };
  }
  if (intake.complianceStatus !== 'ALLOWED') {
    const updated = await completeClaimedRun(run, workerId, {
      status: 'BLOCKED',
      finishedAt: now,
      errorMessage: 'Source policy is not allowed.',
    }, databaseClient);
    if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
    return { runId: run.id, status: 'BLOCKED', errorMessage: 'Source policy is not allowed.' };
  }

  const selectedPages = await pages.findMany({
    where: { id: { in: run.requestedPageIds }, intakeId: intake.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!selectedPages.length) {
    const updated = await completeClaimedRun(run, workerId, {
      status: 'FAILED',
      finishedAt: now,
      errorMessage: 'No active intake pages were selected.',
    }, databaseClient);
    if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
    return { runId: run.id, status: 'FAILED', errorMessage: 'No active intake pages were selected.' };
  }
  if (evidenceOnly) {
    const marker = existingDataRepairEvidenceMarkerFrom(run.summary);
    const markerMatches = marker
      && options.governedProcessIntent?.markerSha256 === hashAffiliateAgentValue(marker)
      && marker.operatorId === run.requestedByUserId
      && marker.intakeId === intake.id
      && marker.pageIds.length >= 1
      && marker.pageIds.length <= 3
      && sameStringArray(marker.pageIds, run.requestedPageIds)
      && sameStringArray(marker.pageIds, selectedPages.map((page: { id: string }) => page.id))
      && recordValue(marker.baseline).recordFingerprint === hashAffiliateAgentValue(
        affiliateExistingRepairCaptureSnapshot(intake, selectedPages),
      );
    if (!markerMatches) {
      const errorMessage = 'CAPTURE_INTENT_DRIFT: The reviewed intake or page scope changed before capture.';
      const updated = await completeClaimedRun(run, workerId, {
        status: 'FAILED',
        finishedAt: now,
        errorMessage,
      }, databaseClient);
      if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
      return { run: updated, status: 'FAILED', errorMessage };
    }
    try {
      await verifyExistingRepairCaptureAfterClaim(
        databaseClient as Record<string, unknown>,
        run as Record<string, unknown>,
        intake as Record<string, unknown>,
        selectedPages as Record<string, unknown>[],
        marker as AffiliateExistingDataRepairEvidenceOnlyMarker,
      );
      if (options.governedProcessIntent?.verifyAfterClaim) {
        await options.governedProcessIntent.verifyAfterClaim({
          database: databaseClient,
          run: run as Record<string, unknown>,
          intake: intake as Record<string, unknown>,
          pages: selectedPages as Record<string, unknown>[],
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'CAPTURE_INTENT_DRIFT: Reviewed capture authority changed after claim.';
      const updated = await completeClaimedRun(run, workerId, {
        status: 'FAILED',
        finishedAt: now,
        errorMessage,
      }, databaseClient);
      if (!updated) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true };
      return { run: updated, status: 'FAILED', errorMessage };
    }
  }

  const queuedProvider = isProviderName(run.provider)
    ? run.provider
    : resolveAffiliateIntakeProvider();
  const primaryClient: IntakeCaptureClient = dependencies.captureClient
    ?? dependencies.firecrawlClient
    ?? createAffiliateSourceCaptureClient(queuedProvider);
  const fallbackClient = dependencies.fallbackCaptureClient !== undefined
    ? dependencies.fallbackCaptureClient
    : createAffiliateFallbackCaptureClient(providerForClient(primaryClient));
  const screenshotMode = dependencies.screenshotMode ?? resolveAffiliateIntakeScreenshotMode();
  const discoverPages = dependencies.discoverPages ?? discoverAffiliateSourcePages;
  const fetchResource = dependencies.fetchResource ?? fetchBoundedPublicResource;
  const summary: IntakeRunSummary = {
    warnings: [],
    blockedPages: [],
    restrictedPages: [],
    failedPages: [],
    capturedPages: [],
    discoveredUrls: 0,
    storedBytes: 0,
    estimatedCredits: 0,
    classification: { type: 'UNKNOWN', confidence: 0, reasons: [] },
  };
  const providerJobIds: string[] = [];
  const captures: AffiliateSourcePageCapture[] = [];

  try {
    const discoveryPage = selectedPages[0];
    const firstPage = await processCapturePage(
      intake,
      run,
      discoveryPage,
      primaryClient,
      fallbackClient,
      fetchResource,
      summary,
      screenshotMode === 'all' || screenshotMode === 'first',
      databaseClient,
      evidenceOnly,
    );
    if (firstPage.capture) {
      captures.push(firstPage.capture);
      if (firstPage.providerJobId) providerJobIds.push(firstPage.providerJobId);
      if (!evidenceOnly) {
        try {
        const mapped = await discoverPages({
          sourceUrl: discoveryPage.url,
          robotsText: firstPage.robotsText,
          capturedLinks: firstPage.artifacts?.links ?? [],
          fetchResource,
          limit: MAX_DISCOVERED_URLS,
        });
        if (mapped.providerJobId) providerJobIds.push(mapped.providerJobId);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'PROVIDER_MAP_REQUEST_JSON',
          data: jsonBuffer(mapped.request),
          sourceUrl: discoveryPage.url,
          provider: 'LOCAL',
          mimeType: 'application/json',
        }, summary);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'PROVIDER_MAP_RESPONSE_JSON',
          data: jsonBuffer(mapped.response),
          sourceUrl: discoveryPage.url,
          provider: 'LOCAL',
          mimeType: 'application/json',
        }, summary);
        await persistCaptureArtifact({
          intakeId: intake.id,
          pageId: discoveryPage.id,
          runId: run.id,
          kind: 'DISCOVERED_URLS',
          data: jsonBuffer(mapped.links),
          sourceUrl: discoveryPage.url,
          provider: 'LOCAL',
          mimeType: 'application/json',
        }, summary);
        const discovered = await persistDiscoveredPages(intake.id, discoveryPage.url, mapped.links);
        summary.discoveredUrls = discovered.stored;
        summary.warnings.push(...discovered.warnings);
      } catch (error) {
        summary.warnings.push(`URL discovery failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
      }

    for (const page of selectedPages.slice(1, MAX_CAPTURE_PAGES)) {
      const processed = await processCapturePage(
        intake,
        run,
        page,
        primaryClient,
        fallbackClient,
        fetchResource,
        summary,
        screenshotMode === 'all',
        databaseClient,
        evidenceOnly,
      );
      if (processed.capture) captures.push(processed.capture);
      if (processed.providerJobId) providerJobIds.push(processed.providerJobId);
    }

    const evidence = captures.map((capture) => capture.providerArtifacts?.markdown ?? '').join('\n');
    const urls = captures.flatMap((capture) => capture.providerArtifacts?.links ?? []);
    summary.classification = summary.capturedPages.length === 0 && summary.restrictedPages.length > 0
      ? {
        type: 'AUTH_REQUIRED',
        confidence: 1,
        reasons: ['Selected registration pages require authentication.'],
      }
      : classifyAffiliateSourceEvidence(evidence, urls);
    const hasRecordedEvidence = summary.capturedPages.length > 0 || summary.restrictedPages.length > 0;
    const status = !hasRecordedEvidence && summary.blockedPages.length > 0 && summary.failedPages.length === 0
      ? 'BLOCKED'
      : !hasRecordedEvidence
        ? 'FAILED'
        : summary.failedPages.length || summary.blockedPages.length || summary.warnings.length
          ? 'PARTIAL'
          : 'SUCCEEDED';
    const finishedAt = dependencies.now?.() ?? new Date();
    const updatedRun = await completeClaimedRun(run, workerId, {
      status,
      finishedAt,
      providerJobIds: Array.from(new Set(providerJobIds)),
      discoveredUrlCount: summary.discoveredUrls,
      capturedPageCount: summary.capturedPages.length,
      errorMessage: status === 'FAILED' ? summary.failedPages[0]?.error ?? 'No pages were captured.' : null,
      summary,
    }, databaseClient);
    if (!updatedRun) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true, summary };
    if (evidenceOnly) return { run: updatedRun, summary };
    const hasMappingEvidence = ['SUCCEEDED', 'PARTIAL'].includes(status)
      && await artifacts.count({
        where: { intakeId: intake.id, runId: run.id, kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN'] } },
      }) > 0;
    const nextIntakeStatus = status === 'BLOCKED'
      ? 'BLOCKED'
      : status === 'FAILED'
        ? 'FAILED'
        : hasMappingEvidence && !intake.affiliateSourceId
          ? 'READY_FOR_MAPPING'
          : 'REVIEW_REQUIRED';
    await intakes.update({
      where: { id: intake.id },
      data: {
        lastRunId: run.id,
        status: nextIntakeStatus,
        suggestedClassification: summary.classification,
      },
    });
    if (nextIntakeStatus === 'READY_FOR_MAPPING') {
      const activeJob = await mappingJobs.findFirst({
        where: { intakeId: intake.id, status: { in: ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED'] } },
      });
      if (!activeJob) {
        try {
          await mappingJobs.create({
            data: {
              id: createId(),
              intakeId: intake.id,
              ...(intake.supplySourceId ? { supplySourceId: intake.supplySourceId } : {}),
              status: 'QUEUED',
            },
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          const jobCreatedByAnotherWorker = await mappingJobs.findFirst({
            where: {
              intakeId: intake.id,
              status: { in: ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED'] },
            },
          });
          if (!jobCreatedByAnotherWorker) throw error;
        }
      }
    }
    return { run: updatedRun, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown intake processing error';
    const finishedAt = dependencies.now?.() ?? new Date();
    const failedRun = await completeClaimedRun(run, workerId, {
      status: 'FAILED',
      finishedAt,
      errorMessage: message,
      summary,
    }, databaseClient);
    if (!failedRun) return { runId: run.id, status: 'LEASE_LOST', leaseLost: true, summary };
    if (!evidenceOnly) {
      await intakes.update({ where: { id: intake.id }, data: { lastRunId: run.id, status: 'FAILED' } });
    }
    return { run: failedRun, summary };
  }
};

export { readAffiliateSourceIntakeArtifact };
