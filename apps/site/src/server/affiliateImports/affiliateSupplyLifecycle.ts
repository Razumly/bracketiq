import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  affiliateAgentSupplyContractSchema,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  type AffiliateAgentSupplyContract,
} from './agentGatewayContracts';
import {
  affiliateScrapeMappingSchema,
} from './types';
import {
  canonicalizeAffiliateIntakeUrl,
} from './sourceIntakeUrlSafety';
import {
  parseAffiliateAutomationBaseline,
  type AffiliateAutomationBaseline,
} from './automationBaseline';
export const AFFILIATE_SUPPLY_LIFECYCLE_STAGES = [
  'PRE_MAPPED',
  'MAPPED',
  'APPROVED',
  'ACTIVATED',
  'PUBLISHED',
  'SOURCE_EXCLUDED',
  'HUMAN_REVIEW_REQUIRED',
] as const;

export type AffiliateSupplyLifecycleStage = (typeof AFFILIATE_SUPPLY_LIFECYCLE_STAGES)[number];

export const AFFILIATE_SUPPLY_OUTCOMES = [
  'SOURCE_EXCLUDED',
  'HUMAN_REVIEW_REQUIRED',
  'TARGET_REJECTED',
  'AUTOMATION_HOLD',
  'REPAIR_REQUIRED',
  'NATURAL_EXPIRY',
  'VALID_EMPTY_REFRESH',
] as const;

export type AffiliateSupplyOutcome = (typeof AFFILIATE_SUPPLY_OUTCOMES)[number];
export type AffiliateSupplyLifecycleOutcome = AffiliateSupplyOutcome;

export type AffiliateSupplyFreshnessStatus = 'FRESH' | 'STALE' | 'UNKNOWN' | 'NOT_APPLICABLE';

export type AffiliateSupplyTargetEvidence = Readonly<{
  id: string;
  targetType: string;
  targetId: string;
  sourceProfile: string;
  status: string;
  marketKey?: string | null;
  sportId?: string | null;
  publishedAt?: Date | string | null;
  lastSuccessfulRefreshAt?: Date | string | null;
  freshnessExpiresAt?: Date | string | null;
  rejectedAt?: Date | string | null;
  evidenceRefs?: readonly string[];
  isReviewed?: boolean;
  metadata?: Record<string, unknown> | null;
}>;

export type AffiliateSupplyCandidateEvidence = Readonly<{
  id: string;
  status: string;
  listingKind: string;
  publishedTargetId?: string | null;
  targetType?: string | null;
  sourceProfile?: string | null;
  evidenceRefs?: readonly string[];
}>;

export type AffiliateSupplyContractTargetRule = Readonly<{
  marketKey?: string | null;
  sportId?: string | null;
  sourceProfile: string;
  minimumFreshPublishedSupply: number;
}>;

export type AffiliateSupplyContractPolicy = Readonly<{
  schemaVersion: 1;
  version: number;
  rolloutCohort: string;
  hash: string;
  freshnessWindows: readonly Readonly<{
    sourceProfile: string;
    maximumAgeHours: number;
  }>[];
  targets: readonly AffiliateSupplyContractTargetRule[];
  requiredMappingEvidenceKinds: readonly string[];
  requiredLifecycleEvidenceKinds: readonly string[];
  searchSaturationMinimumCycles?: number;
}>;

export type AffiliateSupplyContractManifest = Readonly<{
  schemaVersion: 1;
  version: number;
  rolloutCohort: string;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  supplyContract: AffiliateSupplyContractPolicy | AffiliateAgentSupplyContract;
  hash: string;
}>;

const contractPolicySchema = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  rolloutCohort: z.string().trim().min(1),
  hash: z.string().trim().min(1),
  freshnessWindows: z.array(z.object({
    sourceProfile: z.string().trim().min(1),
    maximumAgeHours: z.number().int().positive(),
  }).strict()),
  targets: z.array(z.object({
    marketKey: z.string().nullable().optional(),
    sportId: z.string().nullable().optional(),
    sourceProfile: z.string().trim().min(1),
    minimumFreshPublishedSupply: z.number().int().positive(),
  }).strict()),
  requiredMappingEvidenceKinds: z.array(z.string().trim().min(1)),
  requiredLifecycleEvidenceKinds: z.array(z.string().trim().min(1)),
  searchSaturationMinimumCycles: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  const { hash, ...preimage } = value;
  if (hashAffiliateAgentValue(preimage) !== hash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hash'],
      message: 'Supply Contract policy hash does not match its immutable preimage.',
    });
  }
});

export const affiliateSupplyContractManifestSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  rolloutCohort: z.string().trim().min(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']),
  supplyContract: z.union([contractPolicySchema, affiliateAgentSupplyContractSchema]),
  hash: z.string().trim().min(1),
}).strict().superRefine((value, context) => {
  const { hash, status: _status, ...preimage } = value;
  if (hashAffiliateAgentValue(preimage) !== hash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hash'],
      message: 'Supply Contract manifest hash does not match its immutable preimage.',
    });
  }
});

export const AFFILIATE_REPLENISHMENT_PRIORITY = {
  RESTORE_FRESH_PUBLISHED: 0,
  REPAIR_MAPPED_APPROVED: 1,
  ACTIVATION_REVIEW: 2,
  CAPTURED_MAPPING: 3,
  NEW_DISCOVERY: 4,
} as const;

export type AffiliateReplenishmentPriority = (typeof AFFILIATE_REPLENISHMENT_PRIORITY)[keyof typeof AFFILIATE_REPLENISHMENT_PRIORITY];

export type AffiliateSupplySourceEvidence = Readonly<{
  id: string;
  identityKey?: string | null;
  canonicalUrl?: string | null;
  targetKind?: string | null;
  status?: string | null;
  autoScrapeEnabled: boolean;
  isAutomationEnabled?: boolean;
  activeSupplyContractVersion?: number | null;
  activeSupplyContractHash?: string | null;
  activeMappingId?: string | null;
  lifecycleGeneration: number;
  operatorDomain?: string | null;
  isAutomationOnHold?: boolean;
  automationHoldReason?: string | null;
  isExcluded?: boolean;
  metadata?: Record<string, unknown> | null;
}>;

export type AffiliateSupplyIntakeEvidence = Readonly<{
  id: string;
  status?: string | null;
  complianceStatus?: string | null;
}>;

export type AffiliateSupplyMappingEvidence = Readonly<{
  id: string;
  version: number;
  isActive: boolean;
  validatedAt?: Date | string | null;
  isSchemaValid: boolean;
  packageHash?: string | null;
  evidenceRefs?: readonly string[];
  evidenceKinds?: readonly string[];
  mapping?: Record<string, unknown> | null;
  validationOutput?: Record<string, unknown> | null;
}>;

export type AffiliateSupplyMappingJobEvidence = Readonly<{
  id: string;
  status: string;
  sourceId?: string | null;
  mappingId?: string | null;
  resultSummary?: Record<string, unknown> | null;
  evidenceRefs?: readonly string[];
}>;

export type AffiliateSupplyApprovalEvidence = Readonly<{
  id: string;
  status: string;
  decision?: string | null;
  isIndependent: boolean;
  reviewerId?: string | null;
  reviewedPackageHash?: string | null;
  evidenceRefs?: readonly string[];
}>;

export type AffiliateSupplyRefreshEvidence = Readonly<{
  id: string;
  status: string;
  mappingId?: string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  finalUrl?: string | null;
  httpStatus?: number | null;
  itemCount: number;
  candidateCount: number;
  isEmptyStateMatched?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  evidenceRefs?: readonly string[];
  metadata?: Record<string, unknown> | null;
}>;

export type AffiliateSupplyEvidenceSnapshot = Readonly<{
  now: Date;
  contract: AffiliateSupplyContractPolicy;
  supplySourceId?: string;
  source: AffiliateSupplySourceEvidence;
  intake?: AffiliateSupplyIntakeEvidence | null;
  mapping?: AffiliateSupplyMappingEvidence | null;
  mappingJob?: AffiliateSupplyMappingJobEvidence | null;
  approval?: AffiliateSupplyApprovalEvidence | null;
  latestRun?: AffiliateSupplyRefreshEvidence | null;
  historicalRuns?: readonly AffiliateSupplyRefreshEvidence[];
  baseline?: AffiliateAutomationBaseline | null | unknown;
  lifecycleEvidenceKinds?: readonly string[];
  candidates: readonly AffiliateSupplyCandidateEvidence[];
  targets: readonly AffiliateSupplyTargetEvidence[];
  holds?: readonly string[];
  identityViolations?: readonly string[];
}>;

export type AffiliateSupplyAssessment = Readonly<{
  supplySourceId: string;
  lifecycleGeneration: number;
  stage: AffiliateSupplyLifecycleStage;
  outcome: AffiliateSupplyOutcome | null;
  freshnessStatus: AffiliateSupplyFreshnessStatus;
  targetContribution: number;
  qualifyingTargetIds: readonly string[];
  targets: readonly AffiliateSupplyTargetEvidence[];
  isAutomationEnabled: boolean;
  isTargetMet: boolean;
  targetMinimum: number;
  repairPriority: AffiliateReplenishmentPriority;
  hasRequiredLifecycleEvidence: boolean;
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  invariantViolations: readonly string[];
  automationHoldReason: string | null;
  assessedAt: string;
}>;

export type AffiliateSupplyIdentityInput = Readonly<{
  requestedUrl: string;
  resolvedCanonicalUrl?: string | null;
  isRedirectVerified?: boolean;
  operatorDomain?: string | null;
  prior?: Readonly<{
    canonicalUrl: string;
    operatorDomain?: string | null;
    identityKey?: string | null;
  }> | null;
}>;

export type AffiliateSupplyIdentity = Readonly<{
  canonicalUrl: string;
  origin: string;
  pathKey: string;
  identityKey: string;
  rootDecision: 'NEW_ROOT' | 'SAME_ROOT' | 'SUCCESSOR_REQUIRED' | 'REVIEW_REQUIRED';
  isRevalidationRequired: boolean;
  reasonCodes: readonly string[];
}>;

export type AffiliateSupplyLifecycleCommand =
  | 'CREATE_ROOT'
  | 'RECORD_MAPPING'
  | 'APPROVE'
  | 'ACTIVATE'
  | 'PUBLISH_TARGET'
  | 'RECORD_REFRESH'
  | 'RECORD_EMPTY_REFRESH'
  | 'RECORD_REFRESH_FAILURE'
  | 'REVALIDATE_IDENTITY'
  | 'EXCLUDE_SOURCE'
  | 'REJECT_TARGET'
  | 'CREATE_SUCCESSOR'
  | 'RECONCILE'
  | 'LEGACY_RECONCILED';

export const AFFILIATE_SUPPLY_REVIEWER_RECONCILE_OUTCOMES = [
  'REGRESSION_ASSESSED',
  'SOURCE_EXCLUSION_EXCLUDE',
  'SOURCE_EXCLUSION_KEEP',
  'SOURCE_EXCLUSION_HUMAN_REVIEW',
  'HUMAN_REVIEW_REQUIRED',
  'PRODUCER_REPAIR_REQUIRED',
] as const;

export type AffiliateSupplyReviewerReconcileOutcome =
  (typeof AFFILIATE_SUPPLY_REVIEWER_RECONCILE_OUTCOMES)[number];

export type AffiliateSupplyCommandAuthority = 'MAPPING_PRODUCER' | 'SUPPLY_REVIEWER' | 'HUMAN_DIRECTED_EXECUTOR' | 'SYSTEM';
export type AffiliateSupplyLifecycleActorKind =
  | 'MAPPING_PRODUCER'
  | 'SUPPLY_REVIEWER'
  | 'HUMAN_DIRECTED_EXECUTOR'
  | 'SYSTEM'
  | 'HUMAN';

export type AffiliateSupplyCommandDecision = Readonly<{
  isAccepted: boolean;
  reasonCodes: readonly string[];
  nextStage: AffiliateSupplyLifecycleStage | null;
}>;

export type AffiliateSupplyCommandValidationInput = Readonly<{
  command: AffiliateSupplyLifecycleCommand;
  authority: AffiliateSupplyCommandAuthority;
  expectedLifecycleGeneration: number;
  currentLifecycleGeneration: number;
  activeContractVersion: number;
  activeContractHash: string;
  commandContractVersion: number;
  commandContractHash: string;
  evidenceRefs: readonly string[];
  reviewerOutcome?: string | null;
  assessment: AffiliateSupplyAssessment;
}>;

export type AffiliateSupplyContractImpactCell = Readonly<{
  marketKey: string | null;
  sportId: string | null;
  sourceProfile: string;
}>;

export type AffiliateSupplyContractImpactSource = Readonly<{
  id: string;
  stage: AffiliateSupplyLifecycleStage;
  targetContribution: number;
  isAutomationEnabled: boolean;
  repairPriority: number;
  freshnessStatus: AffiliateSupplyFreshnessStatus;
  targetCells?: readonly AffiliateSupplyContractImpactCell[];
  currentFreshTargetCells?: readonly AffiliateSupplyContractImpactCell[];
  nextFreshTargetCells?: readonly AffiliateSupplyContractImpactCell[];
  nextStage?: AffiliateSupplyLifecycleStage;
  nextTargetContribution?: number;
  isNextAutomationEnabled?: boolean;
  nextRepairPriority?: number;
}>;

export type AffiliateSupplyContractImpactReport = Readonly<{
  rolloutCohort: string;
  currentContractVersion: number;
  nextContractVersion: number;
  sourceCount: number;
  impactedSourceCount: number;
  currentCellCount: number;
  nextCellCount: number;
  impactedCellCount: number;
  impactedTargetCells: readonly AffiliateSupplyContractImpactCell[];
  stageRegressions: number;
  newlyDueSearches: number;
  repairWork: number;
  automationStops: number;
  targetMetChanges: number;
  affectedSourceIds: readonly string[];
}>;

export type AffiliateReplenishmentDemandEvidence = Readonly<{
  id: string;
  status: 'OPEN' | 'CLOSED' | 'PAUSED';
  priority: number;
  openedAt: Date;
  nextEligibleAt: Date | null;
  searchSaturatedUntil: Date | null;
  marketKey?: string | null;
  sportId?: string | null;
  sourceProfile?: string | null;
}>;

export type AffiliateReplenishmentCampaignEvidence = Readonly<{
  id: string;
  isEligible: boolean;
  priority: number;
  nextEligibleAt: Date | null;
  marketKey?: string | null;
  sportId?: string | null;
  sourceProfile?: string | null;
}>;

export type AffiliateReplenishmentWaveEvidence = Readonly<{
  id: string;
  status: 'PLANNED' | 'ACTIVE' | 'WAITING' | 'SUCCEEDED' | 'FAILED' | 'PAUSED';
  demandId: string;
}>;

export type AffiliateReplenishmentPlanningInput = Readonly<{
  now: Date;
  isContractSafe: boolean;
  mapping: Readonly<{
    waiting: number;
    active: number;
    activeProducerCount: number;
  }>;
  review: Readonly<{
    waiting: number;
    active: number;
    activeReviewerCount: number;
    healthyReviewerCount: number;
  }>;
  demands: readonly AffiliateReplenishmentDemandEvidence[];
  activeWaves: readonly AffiliateReplenishmentWaveEvidence[];
  campaigns: readonly AffiliateReplenishmentCampaignEvidence[];
}>;

export type AffiliateReplenishmentPlan = Readonly<{
  targetWaitingMapping: number;
  targetWaitingReview: number;
  isAdmissionHalted: boolean;
  isMappingPaused: boolean;
  isCampaignPaused: boolean;
  action: 'NONE' | 'REUSE_CAMPAIGN' | 'REQUEST_COVERAGE_PLANNING_JOB';
  selectedDemandId: string | null;
  selectedCampaignId: string | null;
  reasonCodes: readonly string[];
}>;

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizedString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const canonicalCompare = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
)).sort(canonicalCompare);

const uppercase = (value: unknown): string => normalizedString(value)?.toUpperCase() ?? '';

const targetRuleSortKey = (
  rule: AffiliateSupplyContractTargetRule,
): string => [
  rule.marketKey ?? '',
  rule.sportId ?? '',
  rule.sourceProfile,
  String(rule.minimumFreshPublishedSupply),
].join('\u0000');

const normalizeOperatorDomain = (value: string | null | undefined): string | null => {
  const normalized = normalizedString(value)?.toLowerCase().replace(/\.$/, '') ?? null;
  if (!normalized) return null;
  try {
    return new URL(normalized.includes('://') ? normalized : `https://${normalized}`).hostname.toLowerCase();
  } catch {
    return normalized;
  }
};

const normalizeSupplyUrl = (value: string): string => {
  const trimmed = value.trim();
  const httpsValue = trimmed.replace(/^http:/i, 'https:');
  return canonicalizeAffiliateIntakeUrl(httpsValue);
};
const NORMALIZED_TRACKING_QUERY_KEYS: Record<string, true> = {
  fbclid: true,
  gclid: true,
  mc_cid: true,
  mc_eid: true,
  msclkid: true,
  srsltid: true,
  dclid: true,
  twclid: true,
  ttclid: true,
  igshid: true,
  _ga: true,
  _gl: true,
};
const hasRawSupplyUrlNormalizationVariant = (value: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol.toLowerCase() === 'http:' || parsed.hash) return true;
  return [...parsed.searchParams.keys()].some((key) => {
    const normalizedKey = key.toLowerCase();
    return normalizedKey.startsWith('utm_') || Object.prototype.hasOwnProperty.call(
      NORMALIZED_TRACKING_QUERY_KEYS,
      normalizedKey,
    );
  });
};


const identityHash = (value: string): string => createHash('sha256').update(value).digest('hex');

const contractTargets = (contract: AffiliateSupplyContractPolicy): AffiliateSupplyContractTargetRule[] => (
  contract.targets.map((target) => ({
    ...target,
    marketKey: normalizedString(target.marketKey),
    sportId: normalizedString(target.sportId),
    sourceProfile: target.sourceProfile.trim().toUpperCase(),
    minimumFreshPublishedSupply: Math.max(0, Math.trunc(target.minimumFreshPublishedSupply)),
  }))
);

const matchingTargetRulesFor = (
  contract: AffiliateSupplyContractPolicy,
  target: Pick<AffiliateSupplyTargetEvidence, 'marketKey' | 'sportId' | 'sourceProfile'>,
): AffiliateSupplyContractTargetRule[] => {
  const profile = uppercase(target.sourceProfile);
  const marketKey = normalizedString(target.marketKey);
  const sportId = normalizedString(target.sportId);
  return contractTargets(contract).filter((rule) => (
    rule.sourceProfile === profile
    && (rule.marketKey === null || rule.marketKey === marketKey)
    && (rule.sportId === null || rule.sportId === sportId)
  ));
};
export const targetRulesFor = (
  contract: AffiliateSupplyContractPolicy,
  target: Pick<AffiliateSupplyTargetEvidence, 'marketKey' | 'sportId' | 'sourceProfile'>,
): AffiliateSupplyContractTargetRule[] => matchingTargetRulesFor(contract, target);

export const targetRuleFor = (
  contract: AffiliateSupplyContractPolicy,
  target: Pick<AffiliateSupplyTargetEvidence, 'marketKey' | 'sportId' | 'sourceProfile'>,
): AffiliateSupplyContractTargetRule | null => {
  const matches = matchingTargetRulesFor(contract, target);
  return matches.sort((left, right) => {
    const leftSpecificity = Number(left.marketKey !== null) + Number(left.sportId !== null);
    const rightSpecificity = Number(right.marketKey !== null) + Number(right.sportId !== null);
    return rightSpecificity - leftSpecificity
      || canonicalCompare(targetRuleSortKey(left), targetRuleSortKey(right));
  })[0] ?? null;
};

const freshnessWindowHoursFor = (contract: AffiliateSupplyContractPolicy, sourceProfile: string): number => (
  contract.freshnessWindows.find((window) => uppercase(window.sourceProfile) === uppercase(sourceProfile))?.maximumAgeHours
  ?? 24
);

type AffiliateSupplyTargetFreshnessInput = Pick<
  AffiliateSupplyTargetEvidence,
  | 'sourceProfile'
  | 'status'
  | 'lastSuccessfulRefreshAt'
  | 'freshnessExpiresAt'
  | 'rejectedAt'
  | 'metadata'
>;

const naturalTargetExpiry = (target: AffiliateSupplyTargetFreshnessInput): Date | null => {
  const value = target.metadata?.naturalExpiryAt
    ?? target.metadata?.endsAt
    ?? target.metadata?.startsAt;
  return asDate(value instanceof Date || typeof value === 'string' ? value : null);
};

export const isAffiliateSupplyTargetFresh = (
  target: AffiliateSupplyTargetFreshnessInput,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): boolean => {
  if (uppercase(target.status) !== 'PUBLISHED' || target.rejectedAt) return false;
  const naturalExpiry = naturalTargetExpiry(target);
  if (naturalExpiry && naturalExpiry.getTime() <= now.getTime()) return false;
  const expiry = asDate(target.freshnessExpiresAt);
  if (expiry) return expiry.getTime() > now.getTime();
  const refreshed = asDate(target.lastSuccessfulRefreshAt);
  if (!refreshed) return false;
  const maximumAgeHours = freshnessWindowHoursFor(contract, target.sourceProfile);
  return refreshed.getTime() + maximumAgeHours * 60 * 60 * 1000 > now.getTime();
};
const hasUsableMappingPackage = (
  mapping: AffiliateSupplyMappingEvidence | null | undefined,
): mapping is AffiliateSupplyMappingEvidence => Boolean(
  mapping
  && mapping.isSchemaValid
  && mapping.id
  && mapping.packageHash
);

const hasRequiredMappingEvidence = (
  mapping: AffiliateSupplyMappingEvidence,
  requiredKinds: readonly string[],
): boolean => {
  if (!requiredKinds.length) return true;
  const kinds = new Set((mapping.evidenceKinds ?? []).map(uppercase));
  return requiredKinds.every((kind) => kinds.has(kind));
};


export const mappingPackageValid = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): boolean => {
  const mapping = snapshot.mapping;
  if (!hasUsableMappingPackage(mapping)) return false;
  if (!affiliateScrapeMappingSchema.safeParse(mapping.mapping).success) return false;
  if (snapshot.source.activeMappingId && snapshot.source.activeMappingId !== mapping.id) return false;
  if (mapping.validationOutput && mapping.validationOutput.isValid !== true) return false;
  return hasRequiredMappingEvidence(
    mapping,
    snapshot.contract.requiredMappingEvidenceKinds.map(uppercase),
  );
};

const lifecycleEvidenceValid = (snapshot: AffiliateSupplyEvidenceSnapshot): boolean => {
  const requiredKinds = snapshot.contract.requiredLifecycleEvidenceKinds.map(uppercase);
  if (!requiredKinds.length) return true;
  const observedKinds = new Set((snapshot.lifecycleEvidenceKinds ?? []).map(uppercase));
  return requiredKinds.every((kind) => observedKinds.has(kind));
};

const approvalValid = (snapshot: AffiliateSupplyEvidenceSnapshot): boolean => {
  const approval = snapshot.approval;
  return Boolean(
    approval
    && uppercase(approval.status) === 'APPROVED'
    && uppercase(approval.decision) === 'APPROVE'
    && approval.isIndependent
    && approval.reviewerId
    && approval.evidenceRefs?.length
    && (!approval.reviewedPackageHash || approval.reviewedPackageHash === snapshot.mapping?.packageHash),
  );
};

const hasValidatedMapping = (snapshot: AffiliateSupplyEvidenceSnapshot): boolean => {
  const mapping = snapshot.mapping;
  return Boolean(mappingPackageValid(snapshot) && mapping?.isActive && asDate(mapping.validatedAt));
};

const isExcluded = (snapshot: AffiliateSupplyEvidenceSnapshot): boolean => (
  snapshot.source.isExcluded === true
  || ['EXCLUDED', 'SOURCE_EXCLUDED', 'BLOCKED'].includes(uppercase(snapshot.source.status))
);

const mappingHasEmptyState = (snapshot: AffiliateSupplyEvidenceSnapshot): boolean => {
  const mapping = snapshot.mapping?.mapping;
  if (!mapping || typeof mapping !== 'object') return false;
  const emptyState = mapping.emptyState;
  if (!emptyState || typeof emptyState !== 'object' || Array.isArray(emptyState)) return false;
  const textIncludes = (emptyState as Record<string, unknown>).textIncludes;
  return Array.isArray(textIncludes)
    && textIncludes.some((value) => typeof value === 'string' && value.trim().length > 0);
};

const resultEvidenceRefs = (snapshot: AffiliateSupplyEvidenceSnapshot): string[] => sortedUnique([
  ...(snapshot.mapping?.evidenceRefs ?? []),
  ...(snapshot.mappingJob?.evidenceRefs ?? []),
  ...(snapshot.approval?.evidenceRefs ?? []),
  ...(snapshot.latestRun?.evidenceRefs ?? []),
  ...snapshot.targets.flatMap((target) => target.evidenceRefs ?? []),
]);

const normalizeTargets = (targets: readonly AffiliateSupplyTargetEvidence[]): AffiliateSupplyTargetEvidence[] => (
  [...targets].sort((left, right) => canonicalCompare(
    `${left.targetType}\u0000${left.targetId}\u0000${left.id}`,
    `${right.targetType}\u0000${right.targetId}\u0000${right.id}`,
  ))
);
const targetCellKey = (
  target: Pick<AffiliateSupplyTargetEvidence, 'marketKey' | 'sportId' | 'sourceProfile'>,
): string => [
  normalizedString(target.marketKey)?.toUpperCase() ?? '',
  normalizedString(target.sportId)?.toUpperCase() ?? '',
  uppercase(target.sourceProfile),
].join('\u0000');


type AffiliateSupplyAssessmentTargetData = Readonly<{
  normalizedTargets: AffiliateSupplyTargetEvidence[];
  qualifyingTargets: AffiliateSupplyTargetEvidence[];
  qualifyingFreshTargets: AffiliateSupplyTargetEvidence[];
  targetMinimum: number;
  targetMinimumMet: boolean;
  potentialTargetContribution: number;
}>;

type AffiliateSupplyAssessmentContext = Readonly<{
  snapshot: AffiliateSupplyEvidenceSnapshot;
  now: Date;
  parsedBaseline: AffiliateAutomationBaseline | null;
  lifecycleEvidenceSatisfied: boolean;
  governedAutomationEnabled: boolean;
  governedContractMatches: boolean;
  hasInvalidBaseline: boolean;
  hasBaselineMappingMismatch: boolean;
  violations: readonly string[];
  normalizedTargets: AffiliateSupplyTargetEvidence[];
  qualifyingTargets: AffiliateSupplyTargetEvidence[];
  qualifyingFreshTargets: AffiliateSupplyTargetEvidence[];
  targetMinimum: number;
  targetMinimumMet: boolean;
  potentialTargetContribution: number;
  latestRun: AffiliateSupplyEvidenceSnapshot['latestRun'];
  latestRunStatus: string;
  isTerminalRefreshFailure: boolean;
  mappingValid: boolean;
  approved: boolean;
  validated: boolean;
  activeHold: boolean;
  automationHoldReason: string | null;
  sourceExcluded: boolean;
  baseReasonCodes: readonly string[];
}>;

type AffiliateSupplyAssessmentState = Readonly<{
  stage: AffiliateSupplyLifecycleStage;
  outcome: AffiliateSupplyOutcome | null;
  freshnessStatus: AffiliateSupplyFreshnessStatus;
  isAutomationEnabled: boolean;
  repairPriority: AffiliateReplenishmentPriority;
  reasonCodes: readonly string[];
}>;

type AffiliateSupplyAssessmentTransition = (
  context: AffiliateSupplyAssessmentContext,
) => AffiliateSupplyAssessmentState | null;

const assessmentReasonIf = (condition: boolean, reason: string): readonly string[] => (
  condition ? [reason] : []
);

const activeMappingViolationReasons = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): readonly string[] => [
  ...assessmentReasonIf(
    Boolean(snapshot.source.activeMappingId && !snapshot.mapping),
    'ACTIVE_MAPPING_MISSING',
  ),
  ...assessmentReasonIf(
    Boolean(
      snapshot.source.activeMappingId
      && snapshot.mapping?.id
      && snapshot.source.activeMappingId !== snapshot.mapping.id,
    ),
    'ACTIVE_MAPPING_SOURCE_MISMATCH',
  ),
];

const mappingJobViolationReasons = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): readonly string[] => [
  ...assessmentReasonIf(
    Boolean(snapshot.mappingJob?.sourceId && snapshot.mappingJob.sourceId !== snapshot.source.id),
    'MAPPING_JOB_SOURCE_MISMATCH',
  ),
  ...assessmentReasonIf(
    Boolean(
      snapshot.mappingJob?.mappingId
      && snapshot.mapping?.id
      && snapshot.mappingJob.mappingId !== snapshot.mapping.id,
    ),
    'MAPPING_JOB_MAPPING_MISMATCH',
  ),
];

const latestRunViolationReasons = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): readonly string[] => [
  ...assessmentReasonIf(
    Boolean(
      snapshot.latestRun?.mappingId
      && snapshot.source.activeMappingId
      && snapshot.latestRun.mappingId !== snapshot.source.activeMappingId,
    ),
    'LATEST_RUN_MAPPING_MISMATCH',
  ),
  ...assessmentReasonIf(
    Boolean(
      snapshot.latestRun?.mappingId
      && snapshot.mapping?.id
      && snapshot.latestRun.mappingId !== snapshot.mapping.id,
    ),
    'LATEST_RUN_MAPPING_MISMATCH',
  ),
];

const buildAssessmentInvariantViolations = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
  hasInvalidBaseline: boolean,
  hasBaselineMappingMismatch: boolean,
  lifecycleEvidenceSatisfied: boolean,
  governedContractMatches: boolean,
): string[] => sortedUnique([
  ...(snapshot.identityViolations ?? []),
  ...activeMappingViolationReasons(snapshot),
  ...mappingJobViolationReasons(snapshot),
  ...latestRunViolationReasons(snapshot),
  ...assessmentReasonIf(hasInvalidBaseline, 'INVALID_AUTOMATION_BASELINE'),
  ...assessmentReasonIf(hasBaselineMappingMismatch, 'AUTOMATION_BASELINE_MAPPING_MISMATCH'),
  ...assessmentReasonIf(Boolean(snapshot.approval && !lifecycleEvidenceSatisfied), 'REQUIRED_LIFECYCLE_EVIDENCE_MISSING'),
  ...assessmentReasonIf(
    snapshot.source.isAutomationEnabled === true && !governedContractMatches,
    'SUPPLY_CONTRACT_STALE',
  ),
]);

const buildAssessmentTargetData = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): AffiliateSupplyAssessmentTargetData => {
  const normalizedTargets = normalizeTargets(snapshot.targets);
  const freshTargets = normalizedTargets.filter((target) => (
    isAffiliateSupplyTargetFresh(target, snapshot.contract, snapshot.now)
  ));
  const qualifyingTargets = normalizedTargets.filter((target) => (
    matchingTargetRulesFor(snapshot.contract, target).length > 0
  ));
  const qualifyingFreshTargets = freshTargets.filter((target) => (
    matchingTargetRulesFor(snapshot.contract, target).length > 0
  ));
  const matchingRules = normalizedTargets.flatMap((target) => (
    matchingTargetRulesFor(snapshot.contract, target)
  ));
  const configuredRules = contractTargets(snapshot.contract);
  const targetMinimum = Math.max(
    ...(matchingRules.length ? matchingRules : configuredRules).map((rule) => rule.minimumFreshPublishedSupply),
    0,
  );
  const sourceExcluded = isExcluded(snapshot);
  const targetCellMinimums = new Map<string, number>();
  qualifyingTargets.forEach((target) => {
    matchingTargetRulesFor(snapshot.contract, target).forEach((rule) => {
      const key = targetCellKey(rule);
      targetCellMinimums.set(key, Math.max(
        targetCellMinimums.get(key) ?? 0,
        rule.minimumFreshPublishedSupply,
      ));
    });
  });
  const freshTargetCellCounts = new Map<string, number>();
  if (!sourceExcluded) {
    qualifyingFreshTargets.forEach((target) => {
      const matchingRuleKeys = new Set(
        matchingTargetRulesFor(snapshot.contract, target).map(targetCellKey),
      );
      matchingRuleKeys.forEach((key) => {
        freshTargetCellCounts.set(key, (freshTargetCellCounts.get(key) ?? 0) + 1);
      });
    });
  }
  const targetMinimumMet = targetMinimum > 0
    && targetCellMinimums.size > 0
    && Array.from(targetCellMinimums).every(([key, minimum]) => (
      (freshTargetCellCounts.get(key) ?? 0) >= minimum
    ));
  return {
    normalizedTargets,
    qualifyingTargets,
    qualifyingFreshTargets,
    targetMinimum,
    targetMinimumMet,
    potentialTargetContribution: sourceExcluded ? 0 : qualifyingFreshTargets.length,
  };
};

const buildAssessmentBaseReasons = (
  approved: boolean,
  hasInvalidBaseline: boolean,
  lifecycleEvidenceSatisfied: boolean,
): readonly string[] => [
  ...assessmentReasonIf(approved, 'INDEPENDENT_REVIEW_APPROVED'),
  ...assessmentReasonIf(hasInvalidBaseline, 'INVALID_AUTOMATION_BASELINE'),
  ...assessmentReasonIf(!lifecycleEvidenceSatisfied, 'REQUIRED_LIFECYCLE_EVIDENCE_MISSING'),
];

const isTerminalRefreshFailure = (
  latestRun: AffiliateSupplyEvidenceSnapshot['latestRun'],
  latestRunStatus: string,
): boolean => Boolean(
  latestRun
  && latestRun.finishedAt
  && ['FAILED', 'PARTIAL', 'ERROR', 'CANCELLED', 'ABORTED'].includes(latestRunStatus),
);

const invalidAutomationBaseline = (
  parsedBaseline: AffiliateAutomationBaseline | null,
  governedAutomationEnabled: boolean,
  baselineProvided: boolean,
): boolean => {
  if (parsedBaseline) return false;
  return governedAutomationEnabled || baselineProvided;
};

const governedContractMatches = (
  source: AffiliateSupplyEvidenceSnapshot['source'],
  contract: AffiliateSupplyContractPolicy,
): boolean => {
  const hasContractState = (
    source.activeSupplyContractVersion !== undefined
    || source.activeSupplyContractHash !== undefined
  );
  if (!hasContractState) return true;
  return (
    source.activeSupplyContractVersion === contract.version
    && source.activeSupplyContractHash === contract.hash
  );
};

const baselineMappingMismatch = (
  parsedBaseline: AffiliateAutomationBaseline | null,
  mapping: AffiliateSupplyMappingEvidence | null | undefined,
): boolean => {
  if (!parsedBaseline || !mapping) return false;
  return (
    parsedBaseline.mappingId !== mapping.id
    || parsedBaseline.mappingVersion !== mapping.version
  );
};

const buildAssessmentContext = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): AffiliateSupplyAssessmentContext => {
  const baselineProvided = snapshot.baseline !== null && snapshot.baseline !== undefined;
  const parsedBaseline = parseAffiliateAutomationBaseline(snapshot.baseline);
  const lifecycleEvidenceSatisfied = lifecycleEvidenceValid(snapshot);
  const governedContractStateMatches = governedContractMatches(snapshot.source, snapshot.contract);
  // `autoScrapeEnabled` remains a compatibility-only evidence fallback for older
  // snapshots; persisted governed state is authoritative whenever present.
  const governedAutomationEnabled = snapshot.source.isAutomationEnabled === undefined
    ? snapshot.source.autoScrapeEnabled === true
    : snapshot.source.isAutomationEnabled === true && governedContractStateMatches;
  const hasInvalidBaseline = invalidAutomationBaseline(
    parsedBaseline,
    governedAutomationEnabled,
    baselineProvided,
  );
  const hasBaselineMappingMismatch = baselineMappingMismatch(parsedBaseline, snapshot.mapping);
  const mappingValid = mappingPackageValid(snapshot);
  const approved = approvalValid(snapshot);
  const validated = hasValidatedMapping(snapshot);
  const sourceExcluded = isExcluded(snapshot);
  const activeHold = snapshot.source.isAutomationOnHold === true || Boolean(snapshot.holds?.length);
  const automationHoldReason = activeHold
    ? snapshot.source.automationHoldReason ?? 'AUTOMATION_HOLD'
    : null;
  const latestRun = snapshot.latestRun;
  const latestRunStatus = uppercase(latestRun?.status);
  const targetData = buildAssessmentTargetData(snapshot);
  return {
    snapshot,
    now: snapshot.now,
    parsedBaseline,
    lifecycleEvidenceSatisfied,
    governedAutomationEnabled,
    governedContractMatches: governedContractStateMatches,
    hasInvalidBaseline,
    hasBaselineMappingMismatch,
    violations: buildAssessmentInvariantViolations(
      snapshot,
      hasInvalidBaseline,
      hasBaselineMappingMismatch,
      lifecycleEvidenceSatisfied,
      governedContractStateMatches,
    ),
    normalizedTargets: targetData.normalizedTargets,
    qualifyingTargets: targetData.qualifyingTargets,
    qualifyingFreshTargets: targetData.qualifyingFreshTargets,
    targetMinimum: targetData.targetMinimum,
    targetMinimumMet: targetData.targetMinimumMet,
    potentialTargetContribution: targetData.potentialTargetContribution,
    latestRun,
    latestRunStatus,
    isTerminalRefreshFailure: isTerminalRefreshFailure(latestRun, latestRunStatus),
    mappingValid,
    approved,
    validated,
    activeHold,
    automationHoldReason,
    sourceExcluded,
    baseReasonCodes: buildAssessmentBaseReasons(
      approved,
      hasInvalidBaseline,
      lifecycleEvidenceSatisfied,
    ),
  };
};

const assessmentStateForViolations: AffiliateSupplyAssessmentTransition = (context) => {
  if (!context.violations.length) return null;
  const impossibleIdentity = (context.snapshot.identityViolations?.length ?? 0) > 0;
  return {
    stage: impossibleIdentity ? 'HUMAN_REVIEW_REQUIRED' : 'APPROVED',
    outcome: impossibleIdentity ? 'HUMAN_REVIEW_REQUIRED' : 'REPAIR_REQUIRED',
    freshnessStatus: 'UNKNOWN',
    isAutomationEnabled: false,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED,
    reasonCodes: [
      ...context.baseReasonCodes,
      impossibleIdentity ? 'IMPOSSIBLE_SUPPLY_ROOT' : 'INVARIANT_REPAIR_REQUIRED',
    ],
  };
};

const assessmentStateForExcluded: AffiliateSupplyAssessmentTransition = (context) => {
  if (!context.sourceExcluded) return null;
  return {
    stage: 'SOURCE_EXCLUDED',
    outcome: 'SOURCE_EXCLUDED',
    freshnessStatus: context.qualifyingTargets.length ? 'FRESH' : 'STALE',
    isAutomationEnabled: false,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY,
    reasonCodes: [...context.baseReasonCodes, 'SOURCE_EXCLUDED'],
  };
};

const assessmentStateForHumanReview: AffiliateSupplyAssessmentTransition = (context) => {
  const sourceStatus = uppercase(context.snapshot.source.status);
  // REVIEW_REQUIRED is the producer's ordinary repair queue state. The
  // reviewer dispositions that are terminal human holds persist the explicit
  // HUMAN_REVIEW_REQUIRED status; do not turn a repair-ready mapping into an
  // identity or policy hold merely because its producer job awaits review.
  if (sourceStatus !== 'HUMAN_REVIEW_REQUIRED') return null;
  return {
    stage: 'HUMAN_REVIEW_REQUIRED',
    outcome: 'HUMAN_REVIEW_REQUIRED',
    freshnessStatus: 'UNKNOWN',
    isAutomationEnabled: false,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED,
    reasonCodes: [...context.baseReasonCodes, 'HUMAN_REVIEW_REQUIRED'],
  };
};

const invalidMappingRepairPriority = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): AffiliateReplenishmentPriority => {
  if (snapshot.mapping?.id || snapshot.approval?.id) {
    return AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED;
  }
  if (snapshot.mappingJob?.id || snapshot.intake?.id) {
    return AFFILIATE_REPLENISHMENT_PRIORITY.CAPTURED_MAPPING;
  }
  return AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY;
};

const assessmentStateForInvalidMapping: AffiliateSupplyAssessmentTransition = (context) => {
  if (context.mappingValid) return null;
  return {
    stage: 'PRE_MAPPED',
    outcome: null,
    freshnessStatus: 'UNKNOWN',
    isAutomationEnabled: false,
    repairPriority: invalidMappingRepairPriority(context.snapshot),
    reasonCodes: [...context.baseReasonCodes, 'MAPPING_PACKAGE_MISSING_OR_INVALID'],
  };
};

const assessmentStateForUnapprovedMapping: AffiliateSupplyAssessmentTransition = (context) => {
  if (context.approved) return null;
  return {
    stage: 'MAPPED',
    outcome: null,
    freshnessStatus: 'UNKNOWN',
    isAutomationEnabled: false,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.ACTIVATION_REVIEW,
    reasonCodes: [...context.baseReasonCodes, 'MAPPING_PACKAGE_VALID'],
  };
};

const assessmentStateForAutomationHold: AffiliateSupplyAssessmentTransition = (context) => {
  if (!context.activeHold) return null;
  return {
    stage: 'APPROVED',
    outcome: 'AUTOMATION_HOLD',
    freshnessStatus: 'UNKNOWN',
    isAutomationEnabled: false,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED,
    reasonCodes: [...context.baseReasonCodes, 'AUTOMATION_HOLD'],
  };
};

const assessmentStateForRefreshFailure: AffiliateSupplyAssessmentTransition = (context) => {
  if (!context.isTerminalRefreshFailure) return null;
  return {
    stage: 'APPROVED',
    outcome: 'REPAIR_REQUIRED',
    freshnessStatus: 'UNKNOWN',
    isAutomationEnabled: false,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED,
    reasonCodes: [...context.baseReasonCodes, 'REFRESH_FAILED'],
  };
};

const assessmentStateForUnvalidatedAutomation: AffiliateSupplyAssessmentTransition = (context) => {
  if (context.validated && context.governedAutomationEnabled) return null;
  return {
    stage: 'APPROVED',
    outcome: null,
    freshnessStatus: 'UNKNOWN',
    isAutomationEnabled: false,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.ACTIVATION_REVIEW,
    reasonCodes: [
      ...context.baseReasonCodes,
      context.validated ? 'AUTOMATION_DISABLED' : 'MAPPING_NOT_VALIDATED',
    ],
  };
};

const assessmentStateForEmptyRefresh: AffiliateSupplyAssessmentTransition = (context) => {
  if (!context.latestRun || context.latestRunStatus !== 'SUCCEEDED' || context.latestRun.candidateCount !== 0) {
    return null;
  }
  const isValidEmptyRefresh = (
    context.latestRun.isEmptyStateMatched === true
    && mappingHasEmptyState(context.snapshot)
  );
  return isValidEmptyRefresh
    ? {
      stage: 'ACTIVATED',
      outcome: 'VALID_EMPTY_REFRESH',
      freshnessStatus: 'FRESH',
      isAutomationEnabled: true,
      repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.RESTORE_FRESH_PUBLISHED,
      reasonCodes: [...context.baseReasonCodes, 'VALID_EMPTY_REFRESH'],
    }
    : {
      stage: 'APPROVED',
      outcome: 'REPAIR_REQUIRED',
      freshnessStatus: 'UNKNOWN',
      isAutomationEnabled: false,
      repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED,
      reasonCodes: [...context.baseReasonCodes, 'UNEXPLAINED_ZERO_RESULT'],
    };
};

const assessmentStateForPublishedOrActivated = (
  context: AffiliateSupplyAssessmentContext,
): AffiliateSupplyAssessmentState => {
  if (context.qualifyingFreshTargets.length > 0) {
    return {
      stage: 'PUBLISHED',
      outcome: null,
      freshnessStatus: 'FRESH',
      isAutomationEnabled: true,
      repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.RESTORE_FRESH_PUBLISHED,
      reasonCodes: [...context.baseReasonCodes, 'FRESH_PUBLISHED_TARGET'],
    };
  }
  const hasQualifyingTargets = context.qualifyingTargets.length > 0;
  return {
    stage: 'ACTIVATED',
    outcome: hasQualifyingTargets ? 'NATURAL_EXPIRY' : null,
    freshnessStatus: hasQualifyingTargets ? 'STALE' : 'UNKNOWN',
    isAutomationEnabled: true,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.RESTORE_FRESH_PUBLISHED,
    reasonCodes: [
      ...context.baseReasonCodes,
      ...assessmentReasonIf(hasQualifyingTargets, 'NATURAL_EXPIRY'),
    ],
  };
};

const ASSESSMENT_TRANSITIONS: readonly AffiliateSupplyAssessmentTransition[] = [
  assessmentStateForViolations,
  assessmentStateForExcluded,
  assessmentStateForHumanReview,
  assessmentStateForInvalidMapping,
  assessmentStateForUnapprovedMapping,
  assessmentStateForAutomationHold,
  assessmentStateForRefreshFailure,
  assessmentStateForUnvalidatedAutomation,
  assessmentStateForEmptyRefresh,
];

const selectAssessmentState = (
  context: AffiliateSupplyAssessmentContext,
): AffiliateSupplyAssessmentState => {
  for (const transition of ASSESSMENT_TRANSITIONS) {
    const state = transition(context);
    if (state) return state;
  }
  return assessmentStateForPublishedOrActivated(context);
};

const applyTargetRejection = (
  context: AffiliateSupplyAssessmentContext,
  state: AffiliateSupplyAssessmentState,
): AffiliateSupplyAssessmentState => {
  const hasRejectedTarget = context.normalizedTargets.some((target) => (
    uppercase(target.status) === 'REJECTED'
  ));
  if (!hasRejectedTarget) return state;
  const canReclassify = (
    state.stage !== 'SOURCE_EXCLUDED'
    && (state.outcome === 'NATURAL_EXPIRY' || !state.outcome)
  );
  return {
    ...state,
    outcome: canReclassify ? 'TARGET_REJECTED' : state.outcome,
    reasonCodes: [...state.reasonCodes, 'TARGET_REJECTION_SCOPED'],
  };
};

const isMappingDrift = (context: AffiliateSupplyAssessmentContext): boolean => Boolean(
  context.parsedBaseline
  && context.latestRun
  && context.latestRunStatus === 'SUCCEEDED'
  && context.parsedBaseline.candidateCount > 0
  && context.latestRun.candidateCount > context.parsedBaseline.candidateCount * 2
  && context.latestRun.candidateCount >= context.parsedBaseline.candidateCount + 5
);

const applyMappingDrift = (
  context: AffiliateSupplyAssessmentContext,
  state: AffiliateSupplyAssessmentState,
): AffiliateSupplyAssessmentState => {
  if (!isMappingDrift(context)) return state;
  return {
    ...state,
    stage: 'APPROVED',
    outcome: 'REPAIR_REQUIRED',
    isAutomationEnabled: false,
    freshnessStatus: context.qualifyingFreshTargets.length ? 'FRESH' : state.freshnessStatus,
    repairPriority: AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED,
    reasonCodes: [...state.reasonCodes, 'MAPPING_DRIFT'],
  };
};

const disableApprovedAutomation = (
  context: AffiliateSupplyAssessmentContext,
  state: AffiliateSupplyAssessmentState,
): AffiliateSupplyAssessmentState => {
  if (
    state.stage !== 'APPROVED'
    || !context.governedAutomationEnabled
    || state.outcome === 'AUTOMATION_HOLD'
  ) {
    return state;
  }
  return { ...state, isAutomationEnabled: false };
};

const finalizeAssessmentState = (
  context: AffiliateSupplyAssessmentContext,
): AffiliateSupplyAssessmentState => {
  const selectedState = selectAssessmentState(context);
  const rejectionState = applyTargetRejection(context, selectedState);
  const driftState = applyMappingDrift(context, rejectionState);
  return disableApprovedAutomation(context, driftState);
};

export const deriveAffiliateSupplyAssessment = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): AffiliateSupplyAssessment => {
  const context = buildAssessmentContext(snapshot);
  const state = finalizeAssessmentState(context);
  const targetContribution = state.stage === 'PUBLISHED' ? context.potentialTargetContribution : 0;
  const isTargetMet = state.stage === 'PUBLISHED' && context.targetMinimumMet;
  return {
    supplySourceId: snapshot.supplySourceId ?? snapshot.source.id,
    lifecycleGeneration: snapshot.source.lifecycleGeneration,
    stage: state.stage,
    outcome: state.outcome,
    freshnessStatus: state.freshnessStatus,
    targetContribution,
    qualifyingTargetIds: context.qualifyingFreshTargets.map((target) => target.targetId),
    targets: context.normalizedTargets,
    isAutomationEnabled: state.isAutomationEnabled,
    isTargetMet,
    targetMinimum: context.targetMinimum,
    hasRequiredLifecycleEvidence: context.lifecycleEvidenceSatisfied,
    repairPriority: state.repairPriority,
    reasonCodes: sortedUnique(state.reasonCodes),
    evidenceRefs: resultEvidenceRefs(snapshot),
    invariantViolations: context.violations,
    automationHoldReason: context.automationHoldReason,
    assessedAt: context.now.toISOString(),
  };
};

type AffiliateSupplyIdentityDecision = Readonly<{
  rootDecision: AffiliateSupplyIdentity['rootDecision'];
  reasonCodes: readonly string[];
}>;

const identityRootRequiresSuccessor = (
  priorOrigin: string | null,
  currentOrigin: string,
  operatorDomain: string | null,
  priorOperatorDomain: string | null,
): boolean => {
  if (priorOrigin !== currentOrigin) return true;
  return operatorDomain !== null && priorOperatorDomain !== operatorDomain;
};

const decideAffiliateSupplyIdentityRoot = (input: Readonly<{
  prior?: AffiliateSupplyIdentityInput['prior'];
  canonicalUrl: string;
  priorCanonicalUrl: string | null;
  priorOrigin: string | null;
  currentOrigin: string;
  operatorDomain: string | null;
  priorOperatorDomain: string | null;
  isRedirectVerified?: boolean;
}>): AffiliateSupplyIdentityDecision => {
  if (!input.prior) return { rootDecision: 'NEW_ROOT', reasonCodes: [] };
  if (identityRootRequiresSuccessor(
    input.priorOrigin,
    input.currentOrigin,
    input.operatorDomain,
    input.priorOperatorDomain,
  )) {
    return {
      rootDecision: 'SUCCESSOR_REQUIRED',
      reasonCodes: ['ORIGIN_OR_OPERATOR_CHANGED'],
    };
  }
  if (input.canonicalUrl === input.priorCanonicalUrl || input.isRedirectVerified === true) {
    return {
      rootDecision: 'SAME_ROOT',
      reasonCodes: input.canonicalUrl !== input.priorCanonicalUrl
        ? ['VERIFIED_SAME_ORIGIN_CANONICAL_REDIRECT']
        : [],
    };
  }
  return {
    rootDecision: 'REVIEW_REQUIRED',
    reasonCodes: ['CANONICAL_CHANGE_NOT_VERIFIED'],
  };
};

const identityNeedsRevalidation = (input: Readonly<{
  prior?: AffiliateSupplyIdentityInput['prior'];
  rootDecision: AffiliateSupplyIdentity['rootDecision'];
  canonicalUrl: string;
  priorCanonicalUrl: string | null;
  requestedUrl: string;
  resolvedCanonicalUrl?: string | null;
}>): boolean => {
  if (!input.prior || input.rootDecision !== 'SAME_ROOT') return false;
  if (input.canonicalUrl !== input.priorCanonicalUrl) return true;
  if (hasRawSupplyUrlNormalizationVariant(input.requestedUrl)) return true;
  return Boolean(
    input.resolvedCanonicalUrl
    && hasRawSupplyUrlNormalizationVariant(input.resolvedCanonicalUrl),
  );
};

export const normalizeAffiliateSupplyIdentity = (
  input: AffiliateSupplyIdentityInput,
): AffiliateSupplyIdentity => {
  const canonicalUrl = normalizeSupplyUrl(input.resolvedCanonicalUrl ?? input.requestedUrl);
  const requestedUrl = normalizeSupplyUrl(input.requestedUrl);
  const parsed = new URL(canonicalUrl);
  const priorCanonicalUrl = input.prior ? normalizeSupplyUrl(input.prior.canonicalUrl) : null;
  const priorOrigin = priorCanonicalUrl ? new URL(priorCanonicalUrl).origin : null;
  const operatorDomain = normalizeOperatorDomain(input.operatorDomain);
  const priorOperatorDomain = normalizeOperatorDomain(input.prior?.operatorDomain);
  const decision = decideAffiliateSupplyIdentityRoot({
    prior: input.prior,
    canonicalUrl,
    priorCanonicalUrl,
    priorOrigin,
    currentOrigin: parsed.origin,
    operatorDomain,
    priorOperatorDomain,
    isRedirectVerified: input.isRedirectVerified,
  });
  const isRevalidationRequired = identityNeedsRevalidation({
    prior: input.prior,
    rootDecision: decision.rootDecision,
    canonicalUrl,
    priorCanonicalUrl,
    requestedUrl: input.requestedUrl,
    resolvedCanonicalUrl: input.resolvedCanonicalUrl,
  });
  const reasonCodes = [
    ...decision.reasonCodes,
    ...(isRevalidationRequired ? ['RAW_URL_NORMALIZATION_VARIANT'] : []),
    ...(requestedUrl !== canonicalUrl ? ['CANONICAL_URL_NORMALIZED'] : []),
  ];
  const pathKey = `${parsed.origin}${parsed.pathname}`;
  const identityKey = decision.rootDecision === 'SAME_ROOT' && input.prior?.identityKey
    ? input.prior.identityKey
    : identityHash(canonicalUrl);
  return {
    canonicalUrl,
    origin: parsed.origin,
    pathKey,
    identityKey,
    rootDecision: decision.rootDecision,
    isRevalidationRequired,
    reasonCodes: sortedUnique(reasonCodes),
  };
};

export const buildAffiliateSupplyContractManifest = (input: Readonly<{
  version: number;
  rolloutCohort: string;
  supplyContract: Omit<AffiliateSupplyContractPolicy, 'hash'> & Partial<Pick<AffiliateSupplyContractPolicy, 'hash'>>;
  status?: AffiliateSupplyContractManifest['status'];
}>): AffiliateSupplyContractManifest => {
  const { hash: _suppliedHash, ...contractWithoutHash } = input.supplyContract;
  const supplyContract = {
    ...contractWithoutHash,
    hash: hashAffiliateAgentValue(contractWithoutHash),
  } as AffiliateSupplyContractPolicy;
  const preimage = {
    schemaVersion: 1 as const,
    version: input.version,
    rolloutCohort: input.rolloutCohort.trim(),
    supplyContract,
  };
  return {
    ...preimage,
    status: input.status ?? 'DRAFT',
    hash: hashAffiliateAgentValue(preimage),
  };
};

const readAffiliateSupplyContractPayload = (component: unknown): Record<string, unknown> => {
  if (!component || typeof component !== 'object' || !('payload' in component)) return {};
  const payload = component.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
};

const readAffiliateSupplyContractRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const legacyContractComponentsByName = (input: AffiliateAgentSupplyContract) => new Map(
  input.components.map((component) => [component.name, component]),
);

const legacyApplicabilityByProfile = (
  componentByName: ReadonlyMap<string, unknown>,
): Map<string, string[]> => {
  const applicabilityByProfile = new Map<string, string[]>();
  const applicability = readAffiliateSupplyContractPayload(
    componentByName.get('COVERAGE_APPLICABILITY'),
  ).applicability;
  if (!Array.isArray(applicability)) return applicabilityByProfile;
  for (const value of applicability) {
    const record = readAffiliateSupplyContractRecord(value);
    const sourceProfile = String(record.sourceProfile ?? '').trim().toUpperCase();
    const sportIds = Array.isArray(record.sportIds)
      ? sortedUnique(record.sportIds.map(String))
      : [];
    if (sourceProfile) applicabilityByProfile.set(sourceProfile, sportIds);
  }
  return applicabilityByProfile;
};

const legacyFreshnessWindows = (
  componentByName: ReadonlyMap<string, unknown>,
): AffiliateSupplyContractPolicy['freshnessWindows'] => {
  const value = readAffiliateSupplyContractPayload(componentByName.get('FRESHNESS')).windows;
  const windows = Array.isArray(value) ? value as unknown[] : [];
  return windows.map((window) => {
    const record = readAffiliateSupplyContractRecord(window);
    return {
      sourceProfile: String(record.sourceProfile ?? ''),
      maximumAgeHours: Number(record.maximumAgeHours ?? 24),
    };
  });
};

const legacySupplyTargets = (
  componentByName: ReadonlyMap<string, unknown>,
  applicabilityByProfile: Map<string, string[]>,
): AffiliateSupplyContractTargetRule[] => {
  const value = readAffiliateSupplyContractPayload(
    componentByName.get('SUPPLY_TARGETS_AND_MARKET_TIERS'),
  ).tiers;
  const targetTiers = Array.isArray(value) ? value as unknown[] : [];
  return targetTiers.flatMap((tier) => {
    const tierRecord = readAffiliateSupplyContractRecord(tier);
    const marketKey = String(tierRecord.tier ?? '');
    const tierTargets = Array.isArray(tierRecord.targets) ? tierRecord.targets as unknown[] : [];
    return tierTargets.flatMap((target) => {
      const targetRecord = readAffiliateSupplyContractRecord(target);
      const sourceProfile = String(targetRecord.sourceProfile ?? '');
      const applicableSportIds = applicabilityByProfile.get(sourceProfile.toUpperCase()) ?? [];
      const sportIds: readonly (string | null)[] = applicableSportIds.length
        ? applicableSportIds
        : [null];
      return sportIds.map((sportId) => ({
        sourceProfile,
        minimumFreshPublishedSupply: Number(targetRecord.minimumFreshPublishedSupply ?? 0),
        marketKey,
        sportId,
      }));
    });
  }).sort((left, right) => canonicalCompare(
    targetRuleSortKey(left),
    targetRuleSortKey(right),
  ));
};

const legacySearchSaturationMinimumCycles = (
  componentByName: ReadonlyMap<string, unknown>,
): number => {
  const value = readAffiliateSupplyContractPayload(componentByName.get('SEARCH_STRATEGIES')).families;
  const searchFamilies = (Array.isArray(value) ? value as unknown[] : [])
    .map(readAffiliateSupplyContractRecord);
  return Math.max(
    ...searchFamilies.map((family) => Number(family.minimumDistinctCycles ?? 0)),
    1,
  );
};

const legacyRequiredEvidenceKinds = (
  componentByName: ReadonlyMap<string, unknown>,
  componentName: 'MAPPING_EVIDENCE' | 'LIFECYCLE_EVIDENCE',
): string[] => {
  const values = readAffiliateSupplyContractPayload(componentByName.get(componentName)).requiredEvidenceKinds;
  return Array.isArray(values) ? values.map(String) : [];
};

const normalizeLegacyAffiliateSupplyContractPolicy = (
  input: AffiliateAgentSupplyContract,
  rolloutCohort: string,
): AffiliateSupplyContractPolicy => {
  const componentByName = legacyContractComponentsByName(input);
  const applicabilityByProfile = legacyApplicabilityByProfile(componentByName);
  const targets = legacySupplyTargets(componentByName, applicabilityByProfile);
  return {
    schemaVersion: 1,
    version: input.version,
    rolloutCohort,
    hash: input.hash,
    freshnessWindows: legacyFreshnessWindows(componentByName),
    targets,
    requiredMappingEvidenceKinds: legacyRequiredEvidenceKinds(componentByName, 'MAPPING_EVIDENCE'),
    requiredLifecycleEvidenceKinds: legacyRequiredEvidenceKinds(componentByName, 'LIFECYCLE_EVIDENCE'),
    searchSaturationMinimumCycles: legacySearchSaturationMinimumCycles(componentByName),
  };
};

const isAffiliateSupplyContractPolicy = (
  input: AffiliateSupplyContractPolicy | AffiliateAgentSupplyContract,
): input is AffiliateSupplyContractPolicy => 'freshnessWindows' in input && 'targets' in input;

export const normalizeAffiliateSupplyContractPolicy = (
  input: AffiliateSupplyContractPolicy | AffiliateAgentSupplyContract,
  rolloutCohort = 'DEFAULT',
): AffiliateSupplyContractPolicy => {
  if (isAffiliateSupplyContractPolicy(input)) return input;
  return normalizeLegacyAffiliateSupplyContractPolicy(input, rolloutCohort);
};

type AffiliateSupplyImpactTarget = Readonly<{
  marketKey?: string | null;
  sportId?: string | null;
  sourceProfile: string;
}>;

type AffiliateSupplyImpactCellKey = (target: AffiliateSupplyImpactTarget) => string;

const addFreshSupplyContribution = (
  counts: Map<string, number>,
  target: AffiliateSupplyImpactTarget,
  contribution: number,
  targetCellKey: AffiliateSupplyImpactCellKey,
): void => {
  const key = targetCellKey(target);
  counts.set(key, (counts.get(key) ?? 0) + Math.max(0, contribution));
};

const addCurrentFreshSupplyForSource = (
  source: AffiliateSupplyContractImpactSource,
  policy: AffiliateSupplyContractPolicy,
  counts: Map<string, number>,
  targetCellKey: AffiliateSupplyImpactCellKey,
  addFreshSupply: (
    targetCounts: Map<string, number>,
    cells: readonly AffiliateSupplyContractImpactCell[],
  ) => void,
): void => {
  if (source.currentFreshTargetCells) {
    addFreshSupply(counts, source.currentFreshTargetCells);
    return;
  }
  if (!source.targetCells?.length && policy.targets.length === 1) {
    addFreshSupplyContribution(counts, policy.targets[0], source.targetContribution, targetCellKey);
  }
};

const addNextFreshSupplyForSource = (
  source: AffiliateSupplyContractImpactSource,
  policy: AffiliateSupplyContractPolicy,
  counts: Map<string, number>,
  targetCellKey: AffiliateSupplyImpactCellKey,
  addFreshSupply: (
    targetCounts: Map<string, number>,
    cells: readonly AffiliateSupplyContractImpactCell[],
  ) => void,
): void => {
  if (source.nextFreshTargetCells) {
    addFreshSupply(counts, source.nextFreshTargetCells);
    return;
  }
  if (source.currentFreshTargetCells) {
    addFreshSupply(counts, source.currentFreshTargetCells);
    return;
  }
  if (!source.targetCells?.length && policy.targets.length === 1) {
    addFreshSupplyContribution(counts, policy.targets[0], source.targetContribution, targetCellKey);
  }
};

const minimumForImpactSource = (
  source: AffiliateSupplyContractImpactSource,
  policy: AffiliateSupplyContractPolicy,
  fallback: number,
  targetCellKey: AffiliateSupplyImpactCellKey,
): number => {
  if (!source.targetCells?.length) return fallback;
  const sourceCellKeys = new Set(source.targetCells.map(targetCellKey));
  return Math.max(
    ...policy.targets
      .filter((target) => sourceCellKeys.has(targetCellKey(target)))
      .map((target) => target.minimumFreshPublishedSupply),
    0,
  );
};

const requiresImpactSourceEvaluation = (
  source: AffiliateSupplyContractImpactSource,
  contractChanged: boolean,
  impactedCellKeys: Set<string>,
  targetCellKey: AffiliateSupplyImpactCellKey,
): boolean => {
  const sourceCellKeys = source.targetCells?.map(targetCellKey) ?? [];
  const sourceHasImpactedCell = sourceCellKeys.some((key) => impactedCellKeys.has(key));
  return contractChanged || !source.targetCells?.length || sourceHasImpactedCell;
};

const impactSourceNextStage = (
  source: AffiliateSupplyContractImpactSource,
  isEvaluationRequired: boolean,
  nextMinimum: number,
): AffiliateSupplyLifecycleStage => {
  if (!isEvaluationRequired) return source.stage;
  if (source.nextStage !== undefined && source.nextStage !== null) return source.nextStage;
  return source.stage === 'PUBLISHED' && nextMinimum > source.targetContribution
    ? 'ACTIVATED'
    : source.stage;
};

const impactSourceNextTargetContribution = (
  source: AffiliateSupplyContractImpactSource,
  isEvaluationRequired: boolean,
): number => {
  if (!isEvaluationRequired) return source.targetContribution;
  return source.nextTargetContribution ?? source.targetContribution;
};

const impactSourceNextAutomationEnabled = (
  source: AffiliateSupplyContractImpactSource,
  isEvaluationRequired: boolean,
): boolean => {
  if (!isEvaluationRequired) return source.isAutomationEnabled;
  if (source.isNextAutomationEnabled !== undefined && source.isNextAutomationEnabled !== null) {
    return source.isNextAutomationEnabled;
  }
  return source.freshnessStatus !== 'FRESH' ? false : source.isAutomationEnabled;
};

const impactSourceNextRepairPriority = (
  source: AffiliateSupplyContractImpactSource,
  isEvaluationRequired: boolean,
): number => {
  if (!isEvaluationRequired) return source.repairPriority;
  return source.nextRepairPriority ?? source.repairPriority;
};

const impactSourceTargetMet = (
  isEvaluationRequired: boolean,
  supplyCount: number,
  minimum: number,
): boolean => isEvaluationRequired && minimum > 0 && supplyCount >= minimum;

const impactSourceIsAffected = (
  isEvaluationRequired: boolean,
  nextStage: AffiliateSupplyLifecycleStage,
  sourceStage: AffiliateSupplyLifecycleStage,
  isCurrentTargetMet: boolean,
  isNextTargetMet: boolean,
): boolean => {
  if (!isEvaluationRequired) return false;
  return nextStage !== sourceStage || isCurrentTargetMet !== isNextTargetMet;
};

type AffiliateSupplyImpactSourceEvaluation = Readonly<{
  isAffected: boolean;
  stageRegressed: boolean;
  needsRepairWork: boolean;
  automationStopped: boolean;
}>;

const evaluateImpactSource = (input: Readonly<{
  source: AffiliateSupplyContractImpactSource;
  contractChanged: boolean;
  impactedCellKeys: Set<string>;
  currentPolicy: AffiliateSupplyContractPolicy;
  nextPolicy: AffiliateSupplyContractPolicy;
  currentMinimum: number;
  nextMinimum: number;
  currentFreshSupplyByCell: Map<string, number>;
  nextFreshSupplyByCell: Map<string, number>;
  targetCellKey: AffiliateSupplyImpactCellKey;
}>): AffiliateSupplyImpactSourceEvaluation => {
  const {
    source,
    contractChanged,
    impactedCellKeys,
    currentPolicy,
    nextPolicy,
    currentMinimum,
    nextMinimum,
    currentFreshSupplyByCell,
    nextFreshSupplyByCell,
    targetCellKey,
  } = input;
  const isSourceEvaluationRequired = requiresImpactSourceEvaluation(
    source,
    contractChanged,
    impactedCellKeys,
    targetCellKey,
  );
  const sourceCurrentMinimum = minimumForImpactSource(
    source,
    currentPolicy,
    currentMinimum,
    targetCellKey,
  );
  const sourceNextMinimum = minimumForImpactSource(
    source,
    nextPolicy,
    nextMinimum,
    targetCellKey,
  );
  const nextStage = impactSourceNextStage(source, isSourceEvaluationRequired, sourceNextMinimum);
  const nextTargetContribution = impactSourceNextTargetContribution(source, isSourceEvaluationRequired);
  const isNextAutomationEnabled = impactSourceNextAutomationEnabled(source, isSourceEvaluationRequired);
  const nextRepairPriority = impactSourceNextRepairPriority(source, isSourceEvaluationRequired);
  const currentSupplyCount = source.currentFreshTargetCells?.length ?? source.targetContribution;
  const nextSupplyCount = source.nextFreshTargetCells?.length ?? nextTargetContribution;
  const isCurrentTargetMet = impactSourceTargetMet(
    isSourceEvaluationRequired,
    currentSupplyCount,
    sourceCurrentMinimum,
  );
  const isNextTargetMet = impactSourceTargetMet(
    isSourceEvaluationRequired,
    nextSupplyCount,
    sourceNextMinimum,
  );
  return {
    isAffected: impactSourceIsAffected(
      isSourceEvaluationRequired,
      nextStage,
      source.stage,
      isCurrentTargetMet,
      isNextTargetMet,
    ),
    stageRegressed: source.stage === 'PUBLISHED' && nextStage !== 'PUBLISHED',
    needsRepairWork: (
      source.repairPriority < AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY
      && nextRepairPriority < AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY
      && nextStage === 'ACTIVATED'
    ),
    automationStopped: source.isAutomationEnabled && !isNextAutomationEnabled,
  };
};

export const buildAffiliateSupplyContractImpactReport = (input: Readonly<{
  currentManifest: AffiliateSupplyContractManifest;
  sources: readonly AffiliateSupplyContractImpactSource[];
  nextPolicy: AffiliateSupplyContractPolicy;
}>): AffiliateSupplyContractImpactReport => {
  const currentPolicy = normalizeAffiliateSupplyContractPolicy(
    input.currentManifest.supplyContract,
    input.currentManifest.rolloutCohort,
  );
  const targetCellKey = (target: Readonly<{
    marketKey?: string | null;
    sportId?: string | null;
    sourceProfile: string;
  }>): string => (
    `${target.marketKey ?? ''}\u0000${target.sportId ?? ''}\u0000${target.sourceProfile}`
  );
  const parseTargetCellKey = (key: string): AffiliateSupplyContractImpactCell => {
    const [marketKey, sportId, sourceProfile] = key.split('\u0000');
    return {
      marketKey: marketKey || null,
      sportId: sportId || null,
      sourceProfile,
    };
  };
  const currentCells = new Map(
    currentPolicy.targets.map((target) => [targetCellKey(target), hashAffiliateAgentValue(target)]),
  );
  const nextCells = new Map(
    input.nextPolicy.targets.map((target) => [targetCellKey(target), hashAffiliateAgentValue(target)]),
  );
  const impactedCellKeys = new Set(
    Array.from(new Set([...currentCells.keys(), ...nextCells.keys()]))
      .filter((key) => currentCells.get(key) !== nextCells.get(key)),
  );
  const impactedTargetCells = Array.from(impactedCellKeys)
    .sort()
    .map(parseTargetCellKey);
  const affectedSourceIds: string[] = [];
  let stageRegressions = 0;
  let repairWork = 0;
  let automationStops = 0;
  const currentMinimum = Math.max(...currentPolicy.targets.map((target) => target.minimumFreshPublishedSupply), 0);
  const nextMinimum = Math.max(...input.nextPolicy.targets.map((target) => target.minimumFreshPublishedSupply), 0);
  const contractChanged = currentPolicy.version !== input.nextPolicy.version
    || currentPolicy.hash !== input.nextPolicy.hash;
  const currentRuleByCell = new Map(
    currentPolicy.targets.map((target) => [targetCellKey(target), target]),
  );
  const nextRuleByCell = new Map(
    input.nextPolicy.targets.map((target) => [targetCellKey(target), target]),
  );
  const currentFreshSupplyByCell = new Map<string, number>();
  const nextFreshSupplyByCell = new Map<string, number>();
  const addFreshSupply = (
    counts: Map<string, number>,
    cells: readonly AffiliateSupplyContractImpactCell[],
  ): void => {
    cells.forEach((cell) => {
      const key = targetCellKey(cell);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  };
  input.sources.forEach((source) => {
    addCurrentFreshSupplyForSource(
      source,
      currentPolicy,
      currentFreshSupplyByCell,
      targetCellKey,
      addFreshSupply,
    );
    addNextFreshSupplyForSource(
      source,
      input.nextPolicy,
      nextFreshSupplyByCell,
      targetCellKey,
      addFreshSupply,
    );
  });
  const newlyDueSearches = Array.from(nextRuleByCell.entries()).filter(([key, nextRule]) => {
    const currentRule = currentRuleByCell.get(key);
    const currentOpen = currentRule
      ? (currentFreshSupplyByCell.get(key) ?? 0) < currentRule.minimumFreshPublishedSupply
      : false;
    const nextOpen = (nextFreshSupplyByCell.get(key) ?? 0) < nextRule.minimumFreshPublishedSupply;
    return nextOpen && !currentOpen;
  }).length;
  let targetMetChanges = 0;
  for (const key of new Set([...currentRuleByCell.keys(), ...nextRuleByCell.keys()])) {
    const currentRule = currentRuleByCell.get(key);
    const nextRule = nextRuleByCell.get(key);
    const isCurrentTargetMet = Boolean(
      currentRule
      && (currentFreshSupplyByCell.get(key) ?? 0) >= currentRule.minimumFreshPublishedSupply,
    );
    const isNextTargetMet = Boolean(
      nextRule
      && (nextFreshSupplyByCell.get(key) ?? 0) >= nextRule.minimumFreshPublishedSupply,
    );
    if (isCurrentTargetMet !== isNextTargetMet) targetMetChanges += 1;
  }
  input.sources.forEach((source) => {
    const evaluation = evaluateImpactSource({
      source,
      contractChanged,
      impactedCellKeys,
      currentPolicy,
      nextPolicy: input.nextPolicy,
      currentMinimum,
      nextMinimum,
      currentFreshSupplyByCell,
      nextFreshSupplyByCell,
      targetCellKey,
    });
    if (evaluation.isAffected) affectedSourceIds.push(source.id);
    if (evaluation.stageRegressed) stageRegressions += 1;
    if (evaluation.needsRepairWork) repairWork += 1;
    if (evaluation.automationStopped) automationStops += 1;
  });
  return {
    rolloutCohort: input.currentManifest.rolloutCohort,
    currentContractVersion: input.currentManifest.version,
    nextContractVersion: input.nextPolicy.version,
    sourceCount: input.sources.length,
    impactedSourceCount: new Set(affectedSourceIds).size,
    currentCellCount: currentCells.size,
    nextCellCount: nextCells.size,
    impactedCellCount: impactedTargetCells.length,
    impactedTargetCells,
    stageRegressions,
    newlyDueSearches,
    repairWork,
    automationStops,
    targetMetChanges,
    affectedSourceIds: sortedUnique(affectedSourceIds),
  };
};

const AFFILIATE_SUPPLY_COMMAND_AUTHORITIES: Readonly<
  Record<AffiliateSupplyLifecycleCommand, readonly AffiliateSupplyCommandAuthority[]>
> = {
  CREATE_ROOT: ['SYSTEM'],
  RECORD_MAPPING: ['MAPPING_PRODUCER', 'SYSTEM'],
  APPROVE: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
  ACTIVATE: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
  PUBLISH_TARGET: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
  RECORD_REFRESH: ['SYSTEM'],
  RECORD_EMPTY_REFRESH: ['SYSTEM'],
  RECORD_REFRESH_FAILURE: ['SYSTEM'],
  REVALIDATE_IDENTITY: ['SYSTEM'],
  EXCLUDE_SOURCE: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
  REJECT_TARGET: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
  CREATE_SUCCESSOR: ['SYSTEM', 'SUPPLY_REVIEWER'],
  RECONCILE: ['SYSTEM', 'SUPPLY_REVIEWER'],
  LEGACY_RECONCILED: ['SYSTEM'],
};


const commandLifecycleValidationReasons = (
  input: AffiliateSupplyCommandValidationInput,
): readonly string[] => [
  ...assessmentReasonIf(
    input.expectedLifecycleGeneration !== input.currentLifecycleGeneration,
    'LIFECYCLE_GENERATION_STALE',
  ),
  ...assessmentReasonIf(
    input.activeContractVersion !== input.commandContractVersion
    || input.activeContractHash !== input.commandContractHash,
    'SUPPLY_CONTRACT_STALE',
  ),
  ...assessmentReasonIf(
    !AFFILIATE_SUPPLY_COMMAND_AUTHORITIES[input.command].includes(input.authority),
    'COMMAND_AUTHORITY_NOT_PERMITTED',
  ),
  ...assessmentReasonIf(
    input.command === 'LEGACY_RECONCILED',
    'LEGACY_RECONCILIATION_WRITER_REQUIRED',
  ),
];

const commandReviewerValidationReasons = (
  input: AffiliateSupplyCommandValidationInput,
): readonly string[] => [
  ...assessmentReasonIf(
    input.command === 'RECONCILE'
    && input.authority === 'SUPPLY_REVIEWER'
    && !AFFILIATE_SUPPLY_REVIEWER_RECONCILE_OUTCOMES.some((outcome) => outcome === input.reviewerOutcome),
    'REVIEWER_OUTCOME_NOT_PERMITTED',
  ),
];

const isRefreshAllowed = (assessment: AffiliateSupplyAssessment): boolean => (
  ['ACTIVATED', 'PUBLISHED'].includes(assessment.stage)
  || (
    !assessment.isAutomationEnabled
    && ['PRE_MAPPED', 'MAPPED', 'APPROVED'].includes(assessment.stage)
  )
  || (assessment.stage === 'APPROVED' && assessment.outcome === 'AUTOMATION_HOLD')
);

const refreshPreconditionReasons = (
  input: AffiliateSupplyCommandValidationInput,
  command: 'RECORD_REFRESH' | 'RECORD_EMPTY_REFRESH',
  reason: string,
): readonly string[] => {
  if (input.command !== command || isRefreshAllowed(input.assessment)) return [];
  return [reason];
};

const commandPreconditionValidationReasons = (
  input: AffiliateSupplyCommandValidationInput,
): readonly string[] => {
  const stage = input.assessment.stage;
  const hasRejectableTarget = input.assessment.targets.some((target) => (
    ['PUBLISHED', 'LAST_KNOWN_GOOD'].includes(target.status.toUpperCase())
  ));
  const lifecycleEvidenceMissing = input.assessment.hasRequiredLifecycleEvidence !== true;
  return [
    ...assessmentReasonIf(input.evidenceRefs.length === 0, 'EVIDENCE_REQUIRED'),
    ...assessmentReasonIf(
      input.command === 'APPROVE' && stage !== 'MAPPED',
      'APPROVAL_PRECONDITION_FAILED',
    ),
    ...assessmentReasonIf(
      input.command === 'APPROVE' && lifecycleEvidenceMissing,
      'APPROVAL_LIFECYCLE_EVIDENCE_MISSING',
    ),
    ...assessmentReasonIf(
      input.command === 'ACTIVATE'
      && (stage !== 'APPROVED' || input.assessment.invariantViolations.length > 0),
      'ACTIVATION_PRECONDITION_FAILED',
    ),
    ...assessmentReasonIf(
      input.command === 'PUBLISH_TARGET' && !['ACTIVATED', 'PUBLISHED'].includes(stage),
      'PUBLICATION_PRECONDITION_FAILED',
    ),
    ...assessmentReasonIf(
      input.command === 'REJECT_TARGET' && !hasRejectableTarget,
      'TARGET_REJECTION_PRECONDITION_FAILED',
    ),
    ...refreshPreconditionReasons(
      input,
      'RECORD_REFRESH',
      'REFRESH_PRECONDITION_FAILED',
    ),
    ...refreshPreconditionReasons(
      input,
      'RECORD_EMPTY_REFRESH',
      'EMPTY_REFRESH_PRECONDITION_FAILED',
    ),
  ];
};

export const validateAffiliateSupplyCommand = (
  input: AffiliateSupplyCommandValidationInput,
): AffiliateSupplyCommandDecision => {
  const reasons = [
    ...commandLifecycleValidationReasons(input),
    ...commandReviewerValidationReasons(input),
    ...commandPreconditionValidationReasons(input),
  ];
  const isAccepted = reasons.length === 0;
  return {
    isAccepted,
    reasonCodes: sortedUnique(reasons),
    nextStage: isAccepted ? input.assessment.stage : null,
  };
};

type AffiliateReplenishmentReviewState = Readonly<{
  reviewPressure: boolean;
  isAdmissionHalted: boolean;
  isMappingPaused: boolean;
  isCampaignPaused: boolean;
  reasonCodes: readonly string[];
}>;

const buildReplenishmentReviewState = (
  input: AffiliateReplenishmentPlanningInput,
  targetWaitingReview: number,
): AffiliateReplenishmentReviewState => {
  const noHealthyReviewer = input.review.healthyReviewerCount <= 0;
  const reviewCapacityReached = input.review.waiting >= targetWaitingReview;
  const reviewPressure = noHealthyReviewer || reviewCapacityReached;
  return {
    reviewPressure,
    isAdmissionHalted: noHealthyReviewer,
    isMappingPaused: reviewPressure,
    isCampaignPaused: reviewPressure,
    reasonCodes: [
      ...assessmentReasonIf(noHealthyReviewer, 'NO_HEALTHY_REVIEWER'),
      ...assessmentReasonIf(reviewCapacityReached, 'REVIEW_CAPACITY_REACHED'),
    ],
  };
};

const replenishmentBufferReasons = (
  input: AffiliateReplenishmentPlanningInput,
  targetWaitingMapping: number,
  reasonCodes: readonly string[],
): readonly string[] => {
  const validOvershoot = input.mapping.waiting > targetWaitingMapping;
  return [
    ...reasonCodes,
    ...assessmentReasonIf(validOvershoot, 'VALID_OVERSHOOT_RETAINED'),
    ...assessmentReasonIf(
      input.mapping.waiting >= targetWaitingMapping
      && !validOvershoot
      && reasonCodes.length === 0,
      'MAPPING_BUFFER_MET',
    ),
  ];
};

const buildNoActionReplenishmentPlan = (input: Readonly<{
  targetWaitingMapping: number;
  targetWaitingReview: number;
  isAdmissionHalted: boolean;
  isMappingPaused: boolean;
  isCampaignPaused: boolean;
  reasonCodes: readonly string[];
}>): AffiliateReplenishmentPlan => ({
  targetWaitingMapping: input.targetWaitingMapping,
  targetWaitingReview: input.targetWaitingReview,
  isAdmissionHalted: input.isAdmissionHalted,
  isMappingPaused: input.isMappingPaused,
  isCampaignPaused: input.isCampaignPaused,
  action: 'NONE',
  selectedDemandId: null,
  selectedCampaignId: null,
  reasonCodes: sortedUnique(input.reasonCodes),
});

const eligibleReplenishmentDemands = (
  input: AffiliateReplenishmentPlanningInput,
): AffiliateReplenishmentDemandEvidence[] => input.demands
  .filter((demand) => demand.status === 'OPEN')
  .filter((demand) => !demand.nextEligibleAt || demand.nextEligibleAt.getTime() <= input.now.getTime())
  .filter((demand) => !demand.searchSaturatedUntil || demand.searchSaturatedUntil.getTime() <= input.now.getTime())
  .sort((left, right) => (
    left.priority - right.priority
    || left.openedAt.getTime() - right.openedAt.getTime()
    || canonicalCompare(left.id, right.id)
  ));

const replenishmentSearchSaturated = (
  input: AffiliateReplenishmentPlanningInput,
): boolean => input.demands.some((demand) => (
  demand.status === 'OPEN'
  && demand.searchSaturatedUntil
  && demand.searchSaturatedUntil.getTime() > input.now.getTime()
));

const replenishmentDimensionMatches = (
  candidateValue: string | null | undefined,
  demandValue: string | null | undefined,
): boolean => {
  const candidate = normalizedString(candidateValue);
  const demand = normalizedString(demandValue);
  return !candidate || (demand !== null && candidate.toUpperCase() === demand.toUpperCase());
};

const eligibleCampaignForDemand = (
  input: AffiliateReplenishmentPlanningInput,
  selectedDemand: AffiliateReplenishmentDemandEvidence,
): AffiliateReplenishmentCampaignEvidence | undefined => input.campaigns
  .filter((candidate) => candidate.isEligible)
  .filter((candidate) => (
    replenishmentDimensionMatches(candidate.marketKey, selectedDemand.marketKey)
    && replenishmentDimensionMatches(candidate.sportId, selectedDemand.sportId)
    && replenishmentDimensionMatches(candidate.sourceProfile, selectedDemand.sourceProfile)
  ))
  .sort((left, right) => (
    left.priority - right.priority || canonicalCompare(left.id, right.id)
  ))[0];

export const planAffiliateReplenishment = (
  input: AffiliateReplenishmentPlanningInput,
): AffiliateReplenishmentPlan => {
  const targetWaitingMapping = Math.max(0, input.mapping.activeProducerCount * 2);
  const targetWaitingReview = Math.max(0, input.review.activeReviewerCount * 2);
  if (!input.isContractSafe) {
    return buildNoActionReplenishmentPlan({
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: true,
      isMappingPaused: true,
      isCampaignPaused: true,
      reasonCodes: ['UNSAFE_ACTIVE_CONTRACT'],
    });
  }
  const reviewState = buildReplenishmentReviewState(input, targetWaitingReview);
  const reasons = replenishmentBufferReasons(
    input,
    targetWaitingMapping,
    reviewState.reasonCodes,
  );
  if (input.mapping.waiting >= targetWaitingMapping) {
    return buildNoActionReplenishmentPlan({
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: reviewState.isAdmissionHalted,
      isMappingPaused: reviewState.isMappingPaused,
      isCampaignPaused: reviewState.isCampaignPaused,
      reasonCodes: reasons,
    });
  }
  if (reviewState.reviewPressure) {
    return buildNoActionReplenishmentPlan({
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: reviewState.isAdmissionHalted,
      isMappingPaused: reviewState.isMappingPaused,
      isCampaignPaused: reviewState.isCampaignPaused,
      reasonCodes: reasons,
    });
  }
  const activeWave = input.activeWaves.find((wave) => (
    ['PLANNED', 'ACTIVE', 'WAITING'].includes(wave.status)
  ));
  if (activeWave) {
    return buildNoActionReplenishmentPlan({
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: false,
      isMappingPaused: false,
      isCampaignPaused: false,
      reasonCodes: [...reasons, 'ACTIVE_WAVE'],
    });
  }
  const eligibleDemands = eligibleReplenishmentDemands(input);
  if (!eligibleDemands.length) {
    return buildNoActionReplenishmentPlan({
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: false,
      isMappingPaused: false,
      isCampaignPaused: false,
      reasonCodes: [
        ...reasons,
        replenishmentSearchSaturated(input)
          ? 'SEARCH_SATURATION_NOT_ELIGIBLE'
          : 'NO_ELIGIBLE_REPLENISHMENT_DEMAND',
      ],
    });
  }
  const selectedDemand = eligibleDemands[0];
  const campaign = eligibleCampaignForDemand(input, selectedDemand);
  return {
    targetWaitingMapping,
    targetWaitingReview,
    isAdmissionHalted: false,
    isMappingPaused: false,
    isCampaignPaused: false,
    action: campaign ? 'REUSE_CAMPAIGN' : 'REQUEST_COVERAGE_PLANNING_JOB',
    selectedDemandId: selectedDemand.id,
    selectedCampaignId: campaign?.id ?? null,
    reasonCodes: sortedUnique(reasons),
  };
};

export const hashAffiliateSupplyCommand = (value: unknown): string => (
  createHash('sha256').update(canonicalizeAffiliateAgentValue(value)).digest('hex')
);

export const affiliateSupplyPathKey = (url: string): string => {
  const parsed = new URL(normalizeSupplyUrl(url));
  return `${parsed.origin}${parsed.pathname}`;
};

export const affiliateSupplyIdentityKey = (url: string): string => identityHash(normalizeSupplyUrl(url));
