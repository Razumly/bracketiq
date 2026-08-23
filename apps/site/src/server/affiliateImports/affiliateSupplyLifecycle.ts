import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  affiliateAgentSupplyContractSchema,
  canonicalizeAffiliateAgentValue,
  hashAffiliateAgentValue,
  type AffiliateAgentSupplyContract,
} from './agentGatewayContracts';
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
  reviewed?: boolean;
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
  canonicalUrl: string;
  targetKind?: string | null;
  status?: string | null;
  autoScrapeEnabled: boolean;
  activeMappingId?: string | null;
  lifecycleGeneration: number;
  operatorDomain?: string | null;
  automationHold?: boolean;
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
  schemaValid: boolean;
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
  independent: boolean;
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
  emptyStateMatched?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  evidenceRefs?: readonly string[];
  metadata?: Record<string, unknown> | null;
}>;

export type AffiliateSupplyEvidenceSnapshot = Readonly<{
  now: Date;
  contract: AffiliateSupplyContractPolicy;
  source: AffiliateSupplySourceEvidence;
  intake?: AffiliateSupplyIntakeEvidence | null;
  mapping?: AffiliateSupplyMappingEvidence | null;
  mappingJob?: AffiliateSupplyMappingJobEvidence | null;
  approval?: AffiliateSupplyApprovalEvidence | null;
  latestRun?: AffiliateSupplyRefreshEvidence | null;
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
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  invariantViolations: readonly string[];
  automationHoldReason: string | null;
  assessedAt: string;
}>;

export type AffiliateSupplyIdentityInput = Readonly<{
  requestedUrl: string;
  resolvedCanonicalUrl?: string | null;
  redirectVerified?: boolean;
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
  reasonCodes: readonly string[];
}>;

export type AffiliateSupplyLifecycleCommand =
  | 'RECORD_MAPPING'
  | 'APPROVE'
  | 'ACTIVATE'
  | 'PUBLISH_TARGET'
  | 'RECORD_REFRESH'
  | 'RECORD_EMPTY_REFRESH'
  | 'RECORD_REFRESH_FAILURE'
  | 'EXCLUDE_SOURCE'
  | 'REJECT_TARGET'
  | 'CREATE_SUCCESSOR'
  | 'RECONCILE';

export type AffiliateSupplyCommandAuthority = 'MAPPING_PRODUCER' | 'SUPPLY_REVIEWER' | 'HUMAN_DIRECTED_EXECUTOR' | 'SYSTEM';

export type AffiliateSupplyCommandDecision = Readonly<{
  accepted: boolean;
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
  nextStage?: AffiliateSupplyLifecycleStage;
  nextTargetContribution?: number;
  nextIsAutomationEnabled?: boolean;
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
  eligible: boolean;
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

const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
)).sort();

const uppercase = (value: unknown): string => normalizedString(value)?.toUpperCase() ?? '';

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

export const targetRuleFor = (
  contract: AffiliateSupplyContractPolicy,
  target: Pick<AffiliateSupplyTargetEvidence, 'marketKey' | 'sportId' | 'sourceProfile'>,
): AffiliateSupplyContractTargetRule | null => {
  const profile = uppercase(target.sourceProfile);
  const marketKey = normalizedString(target.marketKey);
  const sportId = normalizedString(target.sportId);
  const matches = contractTargets(contract).filter((rule) => (
    rule.sourceProfile === profile
    && (rule.marketKey === null || rule.marketKey === marketKey)
    && (rule.sportId === null || rule.sportId === sportId)
  ));
  return matches.sort((left, right) => {
    const leftSpecificity = Number(left.marketKey !== null) + Number(left.sportId !== null);
    const rightSpecificity = Number(right.marketKey !== null) + Number(right.sportId !== null);
    return rightSpecificity - leftSpecificity;
  })[0] ?? null;
};

const freshnessWindowHoursFor = (contract: AffiliateSupplyContractPolicy, sourceProfile: string): number => (
  contract.freshnessWindows.find((window) => uppercase(window.sourceProfile) === uppercase(sourceProfile))?.maximumAgeHours
  ?? 24
);

const targetFreshness = (
  target: AffiliateSupplyTargetEvidence,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): boolean => {
  if (uppercase(target.status) !== 'PUBLISHED' || target.rejectedAt) return false;
  const expiry = asDate(target.freshnessExpiresAt);
  if (expiry) return expiry.getTime() > now.getTime();
  const refreshed = asDate(target.lastSuccessfulRefreshAt);
  if (!refreshed) return false;
  const maximumAgeHours = freshnessWindowHoursFor(contract, target.sourceProfile);
  return refreshed.getTime() + maximumAgeHours * 60 * 60 * 1000 > now.getTime();
};
export const mappingPackageValid = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): boolean => {
  const mapping = snapshot.mapping;
  if (!mapping || !mapping.schemaValid || !mapping.id || !mapping.packageHash) return false;
  if (snapshot.source.activeMappingId && snapshot.source.activeMappingId !== mapping.id) return false;
  if (mapping.validationOutput && mapping.validationOutput.isValid !== true) return false;
  const requiredKinds = snapshot.contract.requiredMappingEvidenceKinds.map(uppercase);
  if (requiredKinds.length) {
    const kinds = new Set((mapping.evidenceKinds ?? []).map(uppercase));
    if (requiredKinds.some((kind) => !kinds.has(kind))) return false;
  }
  return true;
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
    && approval.independent
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
  [...targets].sort((left, right) => `${left.targetType}:${left.targetId}`.localeCompare(`${right.targetType}:${right.targetId}`))
);

export const deriveAffiliateSupplyAssessment = (
  snapshot: AffiliateSupplyEvidenceSnapshot,
): AffiliateSupplyAssessment => {
  const now = snapshot.now;
  const reasons: string[] = [];
  const baselineProvided = snapshot.baseline !== null && snapshot.baseline !== undefined;
  const parsedBaseline = parseAffiliateAutomationBaseline(snapshot.baseline);
  const lifecycleEvidenceSatisfied = lifecycleEvidenceValid(snapshot);
  const violations = sortedUnique([
    ...(snapshot.identityViolations ?? []),
    ...(snapshot.source.activeMappingId && !snapshot.mapping
      ? ['ACTIVE_MAPPING_MISSING']
      : []),
    ...(snapshot.source.activeMappingId && snapshot.mapping?.id && snapshot.source.activeMappingId !== snapshot.mapping.id
      ? ['ACTIVE_MAPPING_SOURCE_MISMATCH']
      : []),
    ...(snapshot.mappingJob?.sourceId && snapshot.mappingJob.sourceId !== snapshot.source.id
      ? ['MAPPING_JOB_SOURCE_MISMATCH']
      : []),
    ...(snapshot.mappingJob?.mappingId && snapshot.mapping?.id && snapshot.mappingJob.mappingId !== snapshot.mapping.id
      ? ['MAPPING_JOB_MAPPING_MISMATCH']
      : []),
    ...(snapshot.latestRun?.mappingId && snapshot.source.activeMappingId
      && snapshot.latestRun.mappingId !== snapshot.source.activeMappingId
      ? ['LATEST_RUN_MAPPING_MISMATCH']
      : []),
    ...(snapshot.latestRun?.mappingId && snapshot.mapping?.id
      && snapshot.latestRun.mappingId !== snapshot.mapping.id
      ? ['LATEST_RUN_MAPPING_MISMATCH']
      : []),
    ...(baselineProvided && !parsedBaseline ? ['INVALID_AUTOMATION_BASELINE'] : []),
    ...(snapshot.approval && !lifecycleEvidenceSatisfied ? ['REQUIRED_LIFECYCLE_EVIDENCE_MISSING'] : []),
  ]);
  const normalizedTargets = normalizeTargets(snapshot.targets);
  const freshTargets = normalizedTargets.filter((target) => targetFreshness(target, snapshot.contract, now));
  const qualifyingTargets = normalizedTargets.filter((target) => Boolean(targetRuleFor(snapshot.contract, target)));
  const qualifyingFreshTargets = freshTargets.filter((target) => Boolean(targetRuleFor(snapshot.contract, target)));
  const matchingRules = normalizedTargets
    .map((target) => targetRuleFor(snapshot.contract, target))
    .filter((rule): rule is AffiliateSupplyContractTargetRule => Boolean(rule));
  const configuredRules = contractTargets(snapshot.contract);
  const targetMinimum = Math.max(
    ...(matchingRules.length ? matchingRules : configuredRules).map((rule) => rule.minimumFreshPublishedSupply),
    0,
  );
  const potentialTargetContribution = isExcluded(snapshot) ? 0 : qualifyingFreshTargets.length;
  const latestRun = snapshot.latestRun;
  const latestRunStatus = uppercase(latestRun?.status);
  const mappingValid = mappingPackageValid(snapshot);
  const approved = approvalValid(snapshot);
  const validated = hasValidatedMapping(snapshot);
  if (approved) reasons.push('INDEPENDENT_REVIEW_APPROVED');
  if (baselineProvided && !parsedBaseline) reasons.push('INVALID_AUTOMATION_BASELINE');
  if (!lifecycleEvidenceSatisfied) reasons.push('REQUIRED_LIFECYCLE_EVIDENCE_MISSING');

  const sourceAutomationEnabled = snapshot.source.autoScrapeEnabled === true;
  const activeHold = snapshot.source.automationHold === true || Boolean(snapshot.holds?.length);
  const automationHoldReason = snapshot.source.automationHoldReason
    ?? snapshot.holds?.[0]
    ?? null;

  let stage: AffiliateSupplyLifecycleStage = 'PRE_MAPPED';
  let outcome: AffiliateSupplyOutcome | null = null;
  let freshnessStatus: AffiliateSupplyFreshnessStatus = 'UNKNOWN';
  let isAutomationEnabled = false;
  let repairPriority: AffiliateReplenishmentPriority = AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY;

  if (violations.length) {
    stage = 'HUMAN_REVIEW_REQUIRED';
    outcome = 'HUMAN_REVIEW_REQUIRED';
    reasons.push('IMPOSSIBLE_SUPPLY_ROOT');
    repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED;
  } else if (isExcluded(snapshot)) {
    stage = 'SOURCE_EXCLUDED';
    outcome = 'SOURCE_EXCLUDED';
    reasons.push('SOURCE_EXCLUDED');
    freshnessStatus = qualifyingFreshTargets.length ? 'FRESH' : 'STALE';
  } else if (snapshot.source.status && ['HUMAN_REVIEW_REQUIRED', 'REVIEW_REQUIRED'].includes(uppercase(snapshot.source.status))) {
    stage = 'HUMAN_REVIEW_REQUIRED';
    outcome = 'HUMAN_REVIEW_REQUIRED';
    reasons.push('HUMAN_REVIEW_REQUIRED');
    repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED;
  } else if (!mappingValid) {
    stage = 'PRE_MAPPED';
    reasons.push('MAPPING_PACKAGE_MISSING_OR_INVALID');
  } else if (!approved) {
    stage = 'MAPPED';
    reasons.push('MAPPING_PACKAGE_VALID');
    repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.ACTIVATION_REVIEW;
  } else if (activeHold) {
    stage = 'APPROVED';
    outcome = 'AUTOMATION_HOLD';
    reasons.push('AUTOMATION_HOLD');
    repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED;
  } else if (latestRunStatus && !['SUCCEEDED', 'SUCCESS', 'COMPLETED'].includes(latestRunStatus)) {
    stage = 'APPROVED';
    outcome = 'REPAIR_REQUIRED';
    reasons.push('REFRESH_FAILED');
    repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED;
  } else if (!validated || !sourceAutomationEnabled) {
    stage = 'APPROVED';
    reasons.push(!validated ? 'MAPPING_NOT_VALIDATED' : 'AUTOMATION_DISABLED');
    repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.ACTIVATION_REVIEW;
  } else if (latestRun && latestRunStatus === 'SUCCEEDED' && latestRun.candidateCount === 0) {
    if (latestRun.emptyStateMatched === true && mappingHasEmptyState(snapshot)) {
      stage = 'ACTIVATED';
      outcome = 'VALID_EMPTY_REFRESH';
      reasons.push('VALID_EMPTY_REFRESH');
      freshnessStatus = 'FRESH';
      isAutomationEnabled = true;
      repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.RESTORE_FRESH_PUBLISHED;
    } else {
      stage = 'APPROVED';
      outcome = 'REPAIR_REQUIRED';
      reasons.push('UNEXPLAINED_ZERO_RESULT');
      repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED;
    }
  } else {
    isAutomationEnabled = true;
    if (qualifyingFreshTargets.length > 0) {
      stage = 'PUBLISHED';
      freshnessStatus = 'FRESH';
      reasons.push('FRESH_PUBLISHED_TARGET');
      repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.RESTORE_FRESH_PUBLISHED;
    } else {
      stage = 'ACTIVATED';
      freshnessStatus = qualifyingTargets.length ? 'STALE' : 'UNKNOWN';
      outcome = qualifyingTargets.length ? 'NATURAL_EXPIRY' : null;
      if (qualifyingTargets.length) reasons.push('NATURAL_EXPIRY');
      repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.RESTORE_FRESH_PUBLISHED;
    }
  }
  const hasRejectedTarget = normalizedTargets.some((target) => uppercase(target.status) === 'REJECTED');
  if (hasRejectedTarget) {
    reasons.push('TARGET_REJECTION_SCOPED');
    if (
      stage !== 'SOURCE_EXCLUDED'
      && (outcome === 'NATURAL_EXPIRY' || !outcome)
    ) {
      outcome = 'TARGET_REJECTED';
    }
  }
  if (parsedBaseline && latestRun && latestRunStatus === 'SUCCEEDED') {
    if (
      parsedBaseline.candidateCount > 0
      && latestRun.candidateCount > parsedBaseline.candidateCount * 2
      && latestRun.candidateCount >= parsedBaseline.candidateCount + 5
    ) {
      stage = 'APPROVED';
      outcome = 'REPAIR_REQUIRED';
      isAutomationEnabled = false;
      freshnessStatus = qualifyingFreshTargets.length ? 'FRESH' : freshnessStatus;
      reasons.push('MAPPING_DRIFT');
      repairPriority = AFFILIATE_REPLENISHMENT_PRIORITY.REPAIR_MAPPED_APPROVED;
    }
  }
  if (stage === 'APPROVED' && sourceAutomationEnabled && !['AUTOMATION_HOLD'].includes(outcome ?? '')) {
    isAutomationEnabled = false;
  }
  const targetContribution = stage === 'PUBLISHED' ? potentialTargetContribution : 0;
  const isTargetMet = targetMinimum > 0 && targetContribution >= targetMinimum;

  return {
    supplySourceId: snapshot.source.id,
    lifecycleGeneration: snapshot.source.lifecycleGeneration,
    stage,
    outcome,
    freshnessStatus,
    targetContribution,
    qualifyingTargetIds: qualifyingFreshTargets.map((target) => target.targetId),
    targets: normalizedTargets,
    isAutomationEnabled,
    isTargetMet,
    targetMinimum,
    repairPriority,
    reasonCodes: sortedUnique(reasons),
    evidenceRefs: resultEvidenceRefs(snapshot),
    invariantViolations: violations,
    automationHoldReason,
    assessedAt: now.toISOString(),
  };
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

  let rootDecision: AffiliateSupplyIdentity['rootDecision'] = 'NEW_ROOT';
  const reasonCodes: string[] = [];

  if (input.prior) {
    if (priorOrigin !== parsed.origin || (priorOperatorDomain && operatorDomain && priorOperatorDomain !== operatorDomain)) {
      rootDecision = 'SUCCESSOR_REQUIRED';
      reasonCodes.push('ORIGIN_OR_OPERATOR_CHANGED');
    } else if (canonicalUrl === priorCanonicalUrl || input.redirectVerified === true) {
      rootDecision = 'SAME_ROOT';
      if (canonicalUrl !== priorCanonicalUrl) reasonCodes.push('VERIFIED_SAME_ORIGIN_CANONICAL_REDIRECT');
    } else {
      rootDecision = 'REVIEW_REQUIRED';
      reasonCodes.push('CANONICAL_CHANGE_NOT_VERIFIED');
    }
  }
  if (requestedUrl !== canonicalUrl) reasonCodes.push('CANONICAL_URL_NORMALIZED');
  const pathKey = `${parsed.origin}${parsed.pathname}`;
  const identityKey = rootDecision === 'SAME_ROOT' && input.prior?.identityKey
    ? input.prior.identityKey
    : identityHash(canonicalUrl);
  return {
    canonicalUrl,
    origin: parsed.origin,
    pathKey,
    identityKey,
    rootDecision,
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

export const normalizeAffiliateSupplyContractPolicy = (
  input: AffiliateSupplyContractPolicy | AffiliateAgentSupplyContract,
  rolloutCohort = 'DEFAULT',
): AffiliateSupplyContractPolicy => {
  if ('freshnessWindows' in input && 'targets' in input) return input;
  const componentByName = new Map(input.components.map((component) => [component.name, component]));
  const readPayload = (component: unknown): Record<string, unknown> => {
    if (!component || typeof component !== 'object' || !('payload' in component)) return {};
    const payload = component.payload;
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  };
  const readRecord = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  );
  const freshnessWindows = (Array.isArray(readPayload(componentByName.get('FRESHNESS')).windows)
    ? readPayload(componentByName.get('FRESHNESS')).windows as unknown[]
    : []
  ).map((window) => {
    const record = readRecord(window);
    return {
      sourceProfile: String(record.sourceProfile ?? ''),
      maximumAgeHours: Number(record.maximumAgeHours ?? 24),
    };
  });
  const targetTiers = (Array.isArray(readPayload(componentByName.get('SUPPLY_TARGETS_AND_MARKET_TIERS')).tiers)
    ? readPayload(componentByName.get('SUPPLY_TARGETS_AND_MARKET_TIERS')).tiers as unknown[]
    : []
  );
  const targetRules = targetTiers.flatMap((tier) => {
    const tierRecord = readRecord(tier);
    const targets = Array.isArray(tierRecord.targets) ? tierRecord.targets as unknown[] : [];
    return targets.map((target) => {
      const targetRecord = readRecord(target);
      return {
        sourceProfile: String(targetRecord.sourceProfile ?? ''),
        minimumFreshPublishedSupply: Number(targetRecord.minimumFreshPublishedSupply ?? 0),
        marketKey: String(tierRecord.tier ?? ''),
        sportId: null,
      };
    });
  });
  const readStringArray = (componentName: 'MAPPING_EVIDENCE' | 'LIFECYCLE_EVIDENCE'): string[] => {
    const values = readPayload(componentByName.get(componentName)).requiredEvidenceKinds;
    return Array.isArray(values) ? values.map(String) : [];
  };
  return {
    schemaVersion: 1,
    version: input.version,
    rolloutCohort,
    hash: input.hash,
    freshnessWindows,
    targets: targetRules,
    requiredMappingEvidenceKinds: readStringArray('MAPPING_EVIDENCE'),
    requiredLifecycleEvidenceKinds: readStringArray('LIFECYCLE_EVIDENCE'),
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
  let targetMetChanges = 0;
  const currentMinimum = Math.max(...currentPolicy.targets.map((target) => target.minimumFreshPublishedSupply), 0);
  const nextMinimum = Math.max(...input.nextPolicy.targets.map((target) => target.minimumFreshPublishedSupply), 0);
  const minimumForSource = (
    source: AffiliateSupplyContractImpactSource,
    policy: AffiliateSupplyContractPolicy,
    fallback: number,
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
  input.sources.forEach((source) => {
    const sourceCellKeys = source.targetCells?.map(targetCellKey) ?? [];
    const sourceHasImpactedCell = sourceCellKeys.some((key) => impactedCellKeys.has(key));
    const shouldEvaluateSource = !source.targetCells?.length || sourceHasImpactedCell;
    const sourceCurrentMinimum = minimumForSource(source, currentPolicy, currentMinimum);
    const sourceNextMinimum = minimumForSource(source, input.nextPolicy, nextMinimum);
    const nextStage = shouldEvaluateSource
      ? source.nextStage
        ?? (
          source.stage === 'PUBLISHED'
          && sourceNextMinimum > source.targetContribution
            ? 'ACTIVATED'
            : source.stage
        )
      : source.stage;
    const nextTargetContribution = shouldEvaluateSource
      ? source.nextTargetContribution ?? source.targetContribution
      : source.targetContribution;
    const nextIsAutomationEnabled = shouldEvaluateSource
      ? source.nextIsAutomationEnabled
        ?? (source.freshnessStatus !== 'FRESH' ? false : source.isAutomationEnabled)
      : source.isAutomationEnabled;
    const nextRepairPriority = shouldEvaluateSource
      ? source.nextRepairPriority ?? source.repairPriority
      : source.repairPriority;
    const currentTargetMet = shouldEvaluateSource
      && sourceCurrentMinimum > 0
      && source.targetContribution >= sourceCurrentMinimum;
    const nextTargetMet = shouldEvaluateSource
      && sourceNextMinimum > 0
      && nextTargetContribution >= sourceNextMinimum;
    if (shouldEvaluateSource && (nextStage !== source.stage || currentTargetMet !== nextTargetMet)) {
      affectedSourceIds.push(source.id);
    }
    if (source.stage === 'PUBLISHED' && nextStage !== 'PUBLISHED') stageRegressions += 1;
    if (
      source.repairPriority < AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY
      && nextRepairPriority < AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY
      && nextStage === 'ACTIVATED'
    ) repairWork += 1;
    if (source.isAutomationEnabled && !nextIsAutomationEnabled) automationStops += 1;
    if (currentTargetMet !== nextTargetMet) targetMetChanges += 1;
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
    newlyDueSearches: input.nextPolicy.version === input.currentManifest.version ? 0 : input.sources.filter((source) => source.freshnessStatus !== 'FRESH').length,
    repairWork,
    automationStops,
    targetMetChanges,
    affectedSourceIds: sortedUnique(affectedSourceIds),
  };
};

export const validateAffiliateSupplyCommand = (
  input: AffiliateSupplyCommandValidationInput,
): AffiliateSupplyCommandDecision => {
  const reasons: string[] = [];
  const authorityByCommand: Record<AffiliateSupplyLifecycleCommand, AffiliateSupplyCommandAuthority[]> = {
    RECORD_MAPPING: ['MAPPING_PRODUCER', 'SYSTEM'],
    APPROVE: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
    ACTIVATE: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
    PUBLISH_TARGET: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
    RECORD_REFRESH: ['SYSTEM'],
    RECORD_EMPTY_REFRESH: ['SYSTEM'],
    RECORD_REFRESH_FAILURE: ['SYSTEM'],
    EXCLUDE_SOURCE: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
    REJECT_TARGET: ['SUPPLY_REVIEWER', 'HUMAN_DIRECTED_EXECUTOR'],
    CREATE_SUCCESSOR: ['SYSTEM', 'SUPPLY_REVIEWER'],
    RECONCILE: ['SYSTEM'],
  };
  if (input.expectedLifecycleGeneration !== input.currentLifecycleGeneration) reasons.push('LIFECYCLE_GENERATION_STALE');
  if (input.activeContractVersion !== input.commandContractVersion || input.activeContractHash !== input.commandContractHash) reasons.push('SUPPLY_CONTRACT_STALE');
  if (!authorityByCommand[input.command].includes(input.authority)) reasons.push('COMMAND_AUTHORITY_NOT_PERMITTED');
  if (input.command !== 'RECONCILE' && input.command !== 'RECORD_REFRESH_FAILURE' && input.evidenceRefs.length === 0) reasons.push('EVIDENCE_REQUIRED');
  const stage = input.assessment.stage;
  const canRecordNonAutomatedRefresh = (
    !input.assessment.isAutomationEnabled
    && ['PRE_MAPPED', 'MAPPED', 'APPROVED'].includes(stage)
  );
  if (input.command === 'APPROVE' && stage !== 'MAPPED') reasons.push('APPROVAL_PRECONDITION_FAILED');
  if (input.command === 'ACTIVATE' && (stage !== 'APPROVED' || input.assessment.invariantViolations.length > 0)) reasons.push('ACTIVATION_PRECONDITION_FAILED');
  if (input.command === 'PUBLISH_TARGET' && !['ACTIVATED', 'PUBLISHED'].includes(stage)) {
    reasons.push('PUBLICATION_PRECONDITION_FAILED');
  }
  if (input.command === 'REJECT_TARGET' && !input.assessment.qualifyingTargetIds.length && stage !== 'PUBLISHED') reasons.push('TARGET_REJECTION_PRECONDITION_FAILED');
  if (
    input.command === 'RECORD_REFRESH'
    && !['ACTIVATED', 'PUBLISHED'].includes(stage)
    && !canRecordNonAutomatedRefresh
    && !(stage === 'APPROVED' && input.assessment.outcome === 'AUTOMATION_HOLD')
  ) reasons.push('REFRESH_PRECONDITION_FAILED');
  if (
    input.command === 'RECORD_EMPTY_REFRESH'
    && !['ACTIVATED', 'PUBLISHED'].includes(stage)
    && !canRecordNonAutomatedRefresh
    && !(stage === 'APPROVED' && input.assessment.outcome === 'AUTOMATION_HOLD')
  ) reasons.push('EMPTY_REFRESH_PRECONDITION_FAILED');
  const accepted = reasons.length === 0;
  return {
    accepted,
    reasonCodes: sortedUnique(reasons),
    nextStage: accepted ? input.assessment.stage : null,
  };
};

export const planAffiliateReplenishment = (
  input: AffiliateReplenishmentPlanningInput,
): AffiliateReplenishmentPlan => {
  const targetWaitingMapping = Math.max(0, input.mapping.activeProducerCount * 2);
  const targetWaitingReview = Math.max(0, input.review.activeReviewerCount * 2);
  const reasons: string[] = [];
  if (!input.isContractSafe) {
    return {
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: true,
      isMappingPaused: true,
      isCampaignPaused: true,
      action: 'NONE',
      selectedDemandId: null,
      selectedCampaignId: null,
      reasonCodes: ['UNSAFE_ACTIVE_CONTRACT'],
    };
  }
  const reviewPressure = input.review.healthyReviewerCount <= 0 || input.review.waiting >= targetWaitingReview;
  const isAdmissionHalted = input.review.healthyReviewerCount <= 0;
  if (input.review.healthyReviewerCount <= 0) reasons.push('NO_HEALTHY_REVIEWER');
  if (input.review.waiting >= targetWaitingReview) reasons.push('REVIEW_CAPACITY_REACHED');
  const isMappingPaused = reviewPressure;
  const isCampaignPaused = reviewPressure;
  if (input.mapping.waiting > targetWaitingMapping) reasons.push('VALID_OVERSHOOT_RETAINED');
  if (input.mapping.waiting >= targetWaitingMapping) {
    if (!reasons.length) reasons.push('MAPPING_BUFFER_MET');
    return {
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted,
      isMappingPaused,
      isCampaignPaused,
      action: 'NONE',
      selectedDemandId: null,
      selectedCampaignId: null,
      reasonCodes: sortedUnique(reasons),
    };
  }
  if (reviewPressure) {
    return {
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted,
      isMappingPaused,
      isCampaignPaused,
      action: 'NONE',
      selectedDemandId: null,
      selectedCampaignId: null,
      reasonCodes: sortedUnique(reasons),
    };
  }
  const activeWave = input.activeWaves.find((wave) => ['PLANNED', 'ACTIVE', 'WAITING'].includes(wave.status));
  if (activeWave) {
    reasons.push('ACTIVE_WAVE');
    return {
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: false,
      isMappingPaused: false,
      isCampaignPaused: false,
      action: 'NONE',
      selectedDemandId: null,
      selectedCampaignId: null,
      reasonCodes: sortedUnique(reasons),
    };
  }
  const eligibleDemands = input.demands
    .filter((demand) => demand.status === 'OPEN')
    .filter((demand) => !demand.nextEligibleAt || demand.nextEligibleAt.getTime() <= input.now.getTime())
    .filter((demand) => !demand.searchSaturatedUntil || demand.searchSaturatedUntil.getTime() <= input.now.getTime())
    .sort((left, right) => left.priority - right.priority || left.openedAt.getTime() - right.openedAt.getTime() || left.id.localeCompare(right.id));
  const saturatedDemand = input.demands.some((demand) => (
    demand.status === 'OPEN'
    && demand.searchSaturatedUntil
    && demand.searchSaturatedUntil.getTime() > input.now.getTime()
  ));
  if (!eligibleDemands.length) {
    if (saturatedDemand) reasons.push('SEARCH_SATURATION_NOT_ELIGIBLE');
    else reasons.push('NO_ELIGIBLE_REPLENISHMENT_DEMAND');
    return {
      targetWaitingMapping,
      targetWaitingReview,
      isAdmissionHalted: false,
      isMappingPaused: false,
      isCampaignPaused: false,
      action: 'NONE',
      selectedDemandId: null,
      selectedCampaignId: null,
      reasonCodes: sortedUnique(reasons),
    };
  }
  const selectedDemand = eligibleDemands[0];
  const dimensionMatches = (candidateValue: string | null | undefined, demandValue: string | null | undefined): boolean => {
    const candidate = normalizedString(candidateValue);
    const demand = normalizedString(demandValue);
    return !candidate || (demand !== null && candidate.toUpperCase() === demand.toUpperCase());
  };
  const campaign = input.campaigns
    .filter((candidate) => candidate.eligible && (!candidate.nextEligibleAt || candidate.nextEligibleAt.getTime() <= input.now.getTime()))
    .filter((candidate) => (
      dimensionMatches(candidate.marketKey, selectedDemand.marketKey)
      && dimensionMatches(candidate.sportId, selectedDemand.sportId)
      && dimensionMatches(candidate.sourceProfile, selectedDemand.sourceProfile)
    ))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))[0];
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
