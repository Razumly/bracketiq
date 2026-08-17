import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const identifier = nonEmptyString.max(2_000);
const reviewerId = nonEmptyString.max(80).regex(
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
  'Reviewer id contains unsupported characters.',
);
export type AffiliateApprovalClaimGeneration = {
  approvalJobId: string;
  reviewerId: string;
  claimedAt: string;
};

const claimGenerationSchema = z.object({
  approvalJobId: identifier,
  reviewerId,
  claimedAt: z.string().datetime({ offset: true }),
}).strict();

const checksSchema = z.object({
  robotsReviewed: z.boolean(),
  termsReviewed: z.boolean(),
  storedEvidenceSufficient: z.boolean(),
  identityIndependent: z.boolean(),
  packageValidationPassed: z.boolean(),
  sportQualityVerified: z.boolean(),
  descriptionQualityVerified: z.boolean(),
  dateTimeQualityVerified: z.boolean(),
  officialLogoVerified: z.boolean(),
  logoAbsenceAccepted: z.boolean(),
  duplicateSafetyVerified: z.boolean(),
}).strict();

const evidenceReferenceSchema = z.object({
  kind: nonEmptyString.max(100),
  identifier,
  finding: nonEmptyString.max(5_000),
}).strict();

const approvalReasonCodeSchema = z.enum([
  'LIVE_SETUP_UNSUPPORTED',
  'EVENT_LOCATION_INVALID',
  'ORGANIZATION_LOCATION_INVALID',
  'SPORT_NAME_INVALID',
  'SPORT_CATALOG_MISMATCH',
  // These remain parseable for schema-version 1 history. They are explicitly
  // rejected by the schema-version 2 refinement below.
  'SPORT_NOT_IN_CATALOG',
  'SPORT_VARIANT_UNRESOLVED',
  'SPORT_BLACKLISTED',
  'EVENT_DIVISION_GROUPING_INVALID',
  'EVENT_DIVISION_CLASSIFICATION_INVALID',
  'EVENT_PRICING_INVALID',
  'EVENT_CAPACITY_INVALID',
  'EVENT_DESCRIPTION_INVALID',
  'ORGANIZATION_DESCRIPTION_INVALID',
  'EVENT_DATETIME_START_INVALID',
  'EVENT_DATETIME_TIMEZONE_INVALID',
  'EVENT_DATETIME_END_INVALID',
  'EVENT_DATETIME_DURATION_INVALID',
  'EVENT_DATETIME_DATE_ONLY_INVALID',
  'EVENT_DATETIME_HOST_TIMEZONE_DEPENDENT',
  'EVENT_DATETIME_EVERGREEN_OCCURRENCE',
  'EVENT_DATETIME_TRYOUT_EVERGREEN',
  'OFFICIAL_LOGO_REPAIR_REQUIRED',
  'NO_VERIFIABLE_OFFICIAL_LOGO',
  'PACKAGE_VALIDATION_FAILED',
  'DUPLICATE_SAFETY_INVALID',
  'INSUFFICIENT_STORED_EVIDENCE',
  'CONFLICTING_LIVE_RECORD',
  'OTHER_PRODUCER_DEFECT',
  'UNCLASSIFIED_TERMINAL_FAILURE',
  'RETRY_LIMIT_EXCEEDED',
]);

export const affiliateMappingReviewDispositionSchema = z.object({
  nextAction: z.enum(['PRODUCER_REPAIR', 'HUMAN_REVIEW_REQUIRED']),
  reasonCodes: z.array(approvalReasonCodeSchema).min(1).max(20),
}).strict();

const baseApprovalResultSchema = z.object({
  approvalJobId: identifier,
  subjectType: z.enum(['DOMAIN_POLICY', 'MAPPING_PACKAGE']),
  subjectKey: identifier,
  reviewerId,
  decision: z.enum(['ALLOW', 'BLOCK', 'APPROVE', 'REJECT', 'DEFER']),
  confidence: z.number().min(0).max(1),
  rationale: nonEmptyString.max(10_000),
  evidenceReferences: z.array(evidenceReferenceSchema).min(1).max(50),
  checks: checksSchema,
  blockingIssues: z.array(nonEmptyString.max(5_000)).max(30).default([]),
  mappingDisposition: affiliateMappingReviewDispositionSchema.optional(),
}).strict();

const PRODUCER_REASON_CODES: Record<string, true> = {
  LIVE_SETUP_UNSUPPORTED: true,
  EVENT_LOCATION_INVALID: true,
  ORGANIZATION_LOCATION_INVALID: true,
  SPORT_NAME_INVALID: true,
  SPORT_CATALOG_MISMATCH: true,
  EVENT_DIVISION_GROUPING_INVALID: true,
  EVENT_DIVISION_CLASSIFICATION_INVALID: true,
  EVENT_PRICING_INVALID: true,
  EVENT_CAPACITY_INVALID: true,
  EVENT_DESCRIPTION_INVALID: true,
  ORGANIZATION_DESCRIPTION_INVALID: true,
  EVENT_DATETIME_START_INVALID: true,
  EVENT_DATETIME_TIMEZONE_INVALID: true,
  EVENT_DATETIME_END_INVALID: true,
  EVENT_DATETIME_DURATION_INVALID: true,
  EVENT_DATETIME_DATE_ONLY_INVALID: true,
  EVENT_DATETIME_HOST_TIMEZONE_DEPENDENT: true,
  EVENT_DATETIME_EVERGREEN_OCCURRENCE: true,
  EVENT_DATETIME_TRYOUT_EVERGREEN: true,
  OFFICIAL_LOGO_REPAIR_REQUIRED: true,
  PACKAGE_VALIDATION_FAILED: true,
  DUPLICATE_SAFETY_INVALID: true,
  OTHER_PRODUCER_DEFECT: true,
};

const applyCommonApprovalRules = (
  result: z.infer<typeof baseApprovalResultSchema>,
  context: z.RefinementCtx,
  options: { version: 1 | 2 },
): void => {
  const domainDecisions: Record<string, true> = { ALLOW: true, BLOCK: true, DEFER: true };
  const mappingDecisions: Record<string, true> = { APPROVE: true, REJECT: true, DEFER: true };
  if (result.subjectType === 'DOMAIN_POLICY' && !domainDecisions[result.decision]) {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'Domain policy reviews may only ALLOW, BLOCK, or DEFER.' });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && !mappingDecisions[result.decision]) {
    context.addIssue({ code: 'custom', path: ['decision'], message: 'Mapping package reviews may only APPROVE, REJECT, or DEFER.' });
  }
  if (result.subjectType === 'DOMAIN_POLICY' && result.decision !== 'DEFER'
    && (!result.checks.robotsReviewed || !result.checks.termsReviewed || !result.checks.storedEvidenceSufficient)) {
    context.addIssue({
      code: 'custom',
      path: ['checks'],
      message: 'A terminal domain decision requires reviewed robots, terms, and sufficient stored evidence.',
    });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && result.decision === 'APPROVE'
    && (!result.checks.identityIndependent
      || !result.checks.packageValidationPassed
      || !result.checks.sportQualityVerified
      || !result.checks.descriptionQualityVerified
      || !result.checks.dateTimeQualityVerified
      || (!result.checks.officialLogoVerified && !result.checks.logoAbsenceAccepted)
      || !result.checks.duplicateSafetyVerified
      || !result.checks.storedEvidenceSufficient)) {
    context.addIssue({
      code: 'custom',
      path: ['checks'],
      message: 'Mapping approval requires independent identity, evidence, package, sport and description validation, datetime validation, an official logo or accepted logo absence, and duplicate-safety checks.',
    });
  }
  if (result.checks.officialLogoVerified && result.checks.logoAbsenceAccepted) {
    context.addIssue({
      code: 'custom',
      path: ['checks', 'logoAbsenceAccepted'],
      message: 'A review cannot both verify an official logo and accept that no official logo is present.',
    });
  }
  if (result.checks.logoAbsenceAccepted
    && (result.subjectType !== 'MAPPING_PACKAGE' || result.decision !== 'APPROVE')) {
    context.addIssue({
      code: 'custom',
      path: ['checks', 'logoAbsenceAccepted'],
      message: 'Logo absence may be accepted only for an approved mapping package.',
    });
  }
  if (result.subjectType === 'DOMAIN_POLICY' && result.mappingDisposition) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition'],
      message: 'Domain policy reviews cannot contain a mapping disposition.',
    });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && result.decision === 'APPROVE' && result.mappingDisposition) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition'],
      message: 'Approved mapping packages cannot contain a follow-up disposition.',
    });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && result.decision !== 'APPROVE' && !result.mappingDisposition) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition'],
      message: 'Rejected or deferred mapping packages require a producer-repair or human-review disposition.',
    });
  }
  if (result.subjectType === 'MAPPING_PACKAGE' && result.decision === 'DEFER'
    && result.mappingDisposition?.nextAction !== 'HUMAN_REVIEW_REQUIRED') {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition', 'nextAction'],
      message: 'Deferred mapping packages must stop for human review.',
    });
  }
  if (result.mappingDisposition?.nextAction === 'PRODUCER_REPAIR'
    && result.mappingDisposition.reasonCodes.some((reasonCode) => !PRODUCER_REASON_CODES[reasonCode])) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition', 'reasonCodes'],
      message: 'Producer repair may contain only concrete producer-defect reason codes.',
    });
  }
  if (result.mappingDisposition?.nextAction === 'HUMAN_REVIEW_REQUIRED'
    && result.mappingDisposition.reasonCodes.some((reasonCode) => PRODUCER_REASON_CODES[reasonCode])) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition', 'reasonCodes'],
      message: 'Human review may contain only evidence, conflict, retry-limit, or unclassified reason codes.',
    });
  }
  if (options.version === 2 && result.mappingDisposition?.reasonCodes.some((reasonCode) => (
    ['SPORT_NOT_IN_CATALOG', 'SPORT_VARIANT_UNRESOLVED', 'SPORT_BLACKLISTED'].includes(reasonCode)
  ))) {
    context.addIssue({
      code: 'custom',
      path: ['mappingDisposition', 'reasonCodes'],
      message: 'Schema-version-2 approval results cannot author sport selection or exclusion decisions.',
    });
  }
  if (['ALLOW', 'APPROVE'].includes(result.decision) && result.blockingIssues.length) {
    context.addIssue({ code: 'custom', path: ['blockingIssues'], message: 'Positive approvals cannot contain blocking issues.' });
  }
  if (['BLOCK', 'REJECT', 'DEFER'].includes(result.decision) && !result.blockingIssues.length) {
    context.addIssue({ code: 'custom', path: ['blockingIssues'], message: 'Blocked, rejected, or deferred reviews require at least one concrete issue.' });
  }
};

export const affiliateApprovalResultV1Schema = baseApprovalResultSchema.extend({
  schemaVersion: z.literal(1),
}).superRefine((result, context) => applyCommonApprovalRules(result, context, { version: 1 }));

export const affiliateApprovalResultV2Schema = baseApprovalResultSchema.extend({
  schemaVersion: z.literal(2),
  claimGeneration: claimGenerationSchema,
}).superRefine((result, context) => {
  applyCommonApprovalRules(result, context, { version: 2 });
  if (result.claimGeneration.approvalJobId !== result.approvalJobId) {
    context.addIssue({ code: 'custom', path: ['claimGeneration', 'approvalJobId'], message: 'Approval claim generation job id must match the result.' });
  }
  if (result.claimGeneration.reviewerId !== result.reviewerId) {
    context.addIssue({ code: 'custom', path: ['claimGeneration', 'reviewerId'], message: 'Approval claim generation reviewer must match the result.' });
  }
});

/** Parses both persisted history (v1) and current completions (v2). */
export const affiliateApprovalResultSchema = z.union([
  affiliateApprovalResultV2Schema,
  affiliateApprovalResultV1Schema,
]);

export type AffiliateApprovalResultV1 = z.infer<typeof affiliateApprovalResultV1Schema>;
export type AffiliateApprovalResultV2 = z.infer<typeof affiliateApprovalResultV2Schema>;
export type AffiliateApprovalResult = AffiliateApprovalResultV1 | AffiliateApprovalResultV2;
export type AffiliateMappingReviewDisposition = z.infer<typeof affiliateMappingReviewDispositionSchema>;

export const isAffiliateApprovalResultV2 = (
  result: AffiliateApprovalResult,
): result is AffiliateApprovalResultV2 => result.schemaVersion === 2;
