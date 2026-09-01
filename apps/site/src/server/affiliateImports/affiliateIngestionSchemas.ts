import { z } from 'zod';
import {
  affiliateSportDeterminationSchema,
  affiliateSportDeterminationsSchema,
  affiliateSportSourceLabelUnion,
  assertAffiliateSportCompletionReady,
  assertAffiliateSportDeterminationReasonStatusConsistency,
  type AffiliateSportDetermination,
} from './affiliateSportDetermination';

const nonEmptyString = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const gitCommit = z.string().regex(/^[a-f0-9]{40}$/i);

const reviewScrapeSchema = z.object({
  runId: nonEmptyString,
  candidateCount: z.number().int().nonnegative(),
  normalizedCandidateSha256: sha256,
  passed: z.boolean(),
}).strict();

const directoryExpansionSchema = z.object({
  submitted: z.number().int().positive(),
  created: z.number().int().nonnegative(),
  reused: z.number().int().nonnegative(),
  captureQueued: z.number().int().nonnegative(),
  reviewRequired: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
}).strict();

const humanReviewRequiredSchema = z.object({
  reasonCodes: z.array(nonEmptyString).min(1),
  sourceSportLabels: z.array(nonEmptyString).min(1),
  rationale: nonEmptyString.optional(),
  blockingIssues: z.array(nonEmptyString).default([]),
  requestedNextAction: z.literal('HUMAN_REVIEW_REQUIRED').default('HUMAN_REVIEW_REQUIRED'),
}).strict();

const nonnegativeCount = z.number().int().nonnegative();
const dateTimeDisplayModeSchema = z.enum([
  'SCHEDULED',
  'DATE_ONLY',
  'NO_FIXED_DATE',
  'ONGOING',
]);

export const AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT = 'event-datetime-v1' as const;

export const affiliateEventDateTimeRepairReasonCodeSchema = z.enum([
  'EVENT_DATETIME_START_INVALID',
  'EVENT_DATETIME_TIMEZONE_INVALID',
  'EVENT_DATETIME_END_INVALID',
  'EVENT_DATETIME_DURATION_INVALID',
  'EVENT_DATETIME_DATE_ONLY_INVALID',
  'EVENT_DATETIME_HOST_TIMEZONE_DEPENDENT',
  'EVENT_DATETIME_EVERGREEN_OCCURRENCE',
  'EVENT_DATETIME_TRYOUT_EVERGREEN',
]);

const countByTimeZoneEvidenceSchema = z.object({
  SOURCE_FIELD: nonnegativeCount,
  COORDINATES: nonnegativeCount,
  EXPLICIT_OFFSET: nonnegativeCount,
  NONE: nonnegativeCount,
}).strict();

const countByStartPrecisionSchema = z.object({
  DATE_TIME: nonnegativeCount,
  DATE_ONLY: nonnegativeCount,
  NONE: nonnegativeCount,
}).strict();

const countByEndDerivationSchema = z.object({
  EXPLICIT_END: nonnegativeCount,
  EXPLICIT_DURATION: nonnegativeCount,
  NONE: nonnegativeCount,
}).strict();

const countByDisplayModeSchema = z.object({
  SCHEDULED: nonnegativeCount,
  DATE_ONLY: nonnegativeCount,
  NO_FIXED_DATE: nonnegativeCount,
  ONGOING: nonnegativeCount,
}).strict();

export const affiliateEventDateTimeReviewSchema = z.object({
  contractRevision: z.literal(AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT),
  candidateCount: nonnegativeCount,
  timeZoneEvidence: countByTimeZoneEvidenceSchema,
  startPrecision: countByStartPrecisionSchema,
  endDerivation: countByEndDerivationSchema,
  durationWarnings: nonnegativeCount,
  utcHostRegression: z.object({
    passed: z.boolean(),
    comparedCandidateCount: nonnegativeCount,
    hostTimeZones: z.array(nonEmptyString).min(2).max(4),
  }).strict(),
  displayModeCounts: countByDisplayModeSchema,
  evergreenTransitions: z.array(z.object({
    from: dateTimeDisplayModeSchema,
    to: dateTimeDisplayModeSchema,
    count: z.number().int().positive(),
  }).strict()).max(20),
  evergreenEvidence: z.object({
    scheduleTextBacked: nonnegativeCount,
    datedSessionsMappedSeparately: nonnegativeCount,
    hiddenDatedOccurrences: nonnegativeCount,
    tryoutOrEvaluationMarkedEvergreen: nonnegativeCount,
  }).strict(),
  repairReasonCodes: z.array(affiliateEventDateTimeRepairReasonCodeSchema).max(20).default([]),
  }).strict().superRefine((review, context) => {
    validateDateTimeReview(review, context);
  });

type RefinementContext = z.RefinementCtx;
type DateTimeReview = z.infer<typeof affiliateEventDateTimeReviewSchema>;

const countReviewValues = (counts: Record<string, number>): number => (
  Object.values(counts).reduce((total, count) => total + count, 0)
);

const addDateTimeReviewIssue = (
  context: RefinementContext,
  path: (string | number)[],
  message: string,
): void => {
  context.addIssue({ code: 'custom', path, message });
};

const validateDateTimeReviewCounts = (
  review: DateTimeReview,
  context: RefinementContext,
): void => {
  const countChecks: Array<readonly [
    Record<string, number>,
    string,
    string,
  ]> = [
    [
      review.displayModeCounts,
      'displayModeCounts',
      'Datetime display-mode counts must account for every candidate.',
    ],
    [
      review.timeZoneEvidence,
      'timeZoneEvidence',
      'Datetime timezone-evidence counts must account for every candidate.',
    ],
    [
      review.startPrecision,
      'startPrecision',
      'Datetime start-precision counts must account for every candidate.',
    ],
    [
      review.endDerivation,
      'endDerivation',
      'Datetime end-derivation counts must account for every candidate.',
    ],
  ];
  countChecks.forEach(([counts, path, message]) => {
    if (countReviewValues(counts) !== review.candidateCount) {
      addDateTimeReviewIssue(context, [path], message);
    }
  });
};

const validateDateTimeReviewEvidence = (
  review: DateTimeReview,
  context: RefinementContext,
): void => {
  const evergreenCount = review.displayModeCounts.NO_FIXED_DATE
    + review.displayModeCounts.ONGOING;
  if (review.evergreenEvidence.scheduleTextBacked < evergreenCount) {
    addDateTimeReviewIssue(
      context,
      ['evergreenEvidence', 'scheduleTextBacked'],
      'Every evergreen candidate requires source-backed schedule evidence.',
    );
  }
  if (review.evergreenEvidence.hiddenDatedOccurrences > 0) {
    addDateTimeReviewIssue(
      context,
      ['evergreenEvidence', 'hiddenDatedOccurrences'],
      'Evergreen review cannot hide dated occurrences.',
    );
  }
  if (review.evergreenEvidence.tryoutOrEvaluationMarkedEvergreen > 0) {
    addDateTimeReviewIssue(
      context,
      ['evergreenEvidence', 'tryoutOrEvaluationMarkedEvergreen'],
      'Tryouts and evaluations cannot be marked evergreen.',
    );
  }
};

const validateDateTimeUtcRegression = (
  review: DateTimeReview,
  context: RefinementContext,
): void => {
  if (!review.utcHostRegression.passed) {
    addDateTimeReviewIssue(
      context,
      ['utcHostRegression'],
      'The UTC-host regression must pass before a review-ready package can complete.',
    );
  }
  if (review.utcHostRegression.comparedCandidateCount !== review.candidateCount) {
    addDateTimeReviewIssue(
      context,
      ['utcHostRegression', 'comparedCandidateCount'],
      'The UTC-host regression must cover every candidate.',
    );
  }
  if (!review.utcHostRegression.hostTimeZones.includes('UTC')) {
    addDateTimeReviewIssue(
      context,
      ['utcHostRegression', 'hostTimeZones'],
      'The UTC-host regression must include a TZ=UTC run.',
    );
  }
  if (review.utcHostRegression.hostTimeZones.every((timeZone) => timeZone === 'UTC')) {
    addDateTimeReviewIssue(
      context,
      ['utcHostRegression', 'hostTimeZones'],
      'The UTC-host regression must compare UTC with a non-UTC host.',
    );
  }
};

const validateDateTimeTransitions = (
  review: DateTimeReview,
  context: RefinementContext,
): void => {
  review.evergreenTransitions.forEach((transition, index) => {
    if (transition.from === transition.to) {
      addDateTimeReviewIssue(
        context,
        ['evergreenTransitions', index],
        'Evergreen transitions must change display mode.',
      );
    }
  });
};

const validateDateTimeReview = (
  review: DateTimeReview,
  context: RefinementContext,
): void => {
  validateDateTimeReviewCounts(review, context);
  validateDateTimeReviewEvidence(review, context);
  validateDateTimeUtcRegression(review, context);
  validateDateTimeTransitions(review, context);
};

const legacyCodexAffiliateIngestionResultSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: nonEmptyString,
  intakeId: nonEmptyString,
  sourceKey: nonEmptyString,
  workerId: nonEmptyString,
  status: z.enum(['REVIEW_REQUIRED', 'EXPANDED', 'FAILED', 'HUMAN_REVIEW_REQUIRED']),
  branch: nonEmptyString.nullable(),
  commit: gitCommit.nullable(),
  generatedPaths: z.array(nonEmptyString).default([]),
  logoDisposition: z.enum([
    'OFFICIAL_ASSET',
    'OFFICIAL_SCREENSHOT_CROP',
    'MANUAL_REVIEW',
  ]),
  candidateCount: z.number().int().nonnegative(),
  dateTimeReview: affiliateEventDateTimeReviewSchema.optional(),
  reviewScrapes: z.array(reviewScrapeSchema).max(2).default([]),
  validation: z.object({
    testsPassed: z.boolean(),
    diffCheckPassed: z.boolean(),
    duplicateSafe: z.boolean(),
    warnings: z.array(nonEmptyString).default([]),
  }).strict(),
  directoryExpansion: directoryExpansionSchema.nullable().optional(),
  humanReviewRequired: humanReviewRequiredSchema.nullable().optional(),
  errorMessage: nonEmptyString.nullable(),
}).strict().superRefine((result, context) => {
  validateLegacyResult(result, context);
});

const legacyResultHasArtifacts = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
): boolean => Boolean(
  result.branch
  || result.commit
  || result.generatedPaths.length
  || result.candidateCount !== 0
  || result.reviewScrapes.length
  || result.directoryExpansion
  || result.errorMessage
);

const legacyExpandedResultHasArtifacts = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
): boolean => Boolean(
  result.branch
  || result.commit
  || result.generatedPaths.length
  || result.candidateCount !== 0
  || result.reviewScrapes.length
  || result.errorMessage
);

const legacyExpansionOutcomesAreBalanced = (
  expansion: z.infer<typeof directoryExpansionSchema>,
): boolean => (
  expansion.created
    + expansion.reused
    + expansion.duplicate
    + expansion.rejected
    === expansion.submitted
);

const legacyExpansionHasAcceptedUrl = (
  expansion: z.infer<typeof directoryExpansionSchema>,
): boolean => (
  expansion.created + expansion.reused + expansion.duplicate > 0
);

const validateLegacyHumanReview = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  const humanReview = result.humanReviewRequired;
  if (!humanReview) {
    addDateTimeReviewIssue(
      context,
      ['humanReviewRequired'],
      'HUMAN_REVIEW_REQUIRED results require a structured human-review reason.',
    );
    return;
  }
  if (!humanReview.reasonCodes.includes('SPORT_NOT_IN_CATALOG')) {
    addDateTimeReviewIssue(
      context,
      ['humanReviewRequired', 'reasonCodes'],
      'Unsupported-sport human review results require SPORT_NOT_IN_CATALOG.',
    );
  }
  if (legacyResultHasArtifacts(result)) {
    addDateTimeReviewIssue(
      context,
      ['status'],
      'HUMAN_REVIEW_REQUIRED results cannot claim mapping artifacts, candidates, scrapes, expansion, commits, or errors.',
    );
  }
};

const validateLegacyMetadata = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  if (result.humanReviewRequired) {
    addDateTimeReviewIssue(
      context,
      ['humanReviewRequired'],
      'Structured human-review reasons are only valid for HUMAN_REVIEW_REQUIRED results.',
    );
  }
  if (
    result.dateTimeReview
    && result.dateTimeReview.candidateCount !== result.candidateCount
  ) {
    addDateTimeReviewIssue(
      context,
      ['dateTimeReview', 'candidateCount'],
      'Datetime review candidateCount must match the ingestion result.',
    );
  }
  if (result.status !== 'REVIEW_REQUIRED' && result.dateTimeReview) {
    addDateTimeReviewIssue(
      context,
      ['dateTimeReview'],
      'Datetime review evidence is only valid for REVIEW_REQUIRED mapping results.',
    );
  }
};

const validateLegacyFailed = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  if (!result.errorMessage) {
    addDateTimeReviewIssue(
      context,
      ['errorMessage'],
      'FAILED ingestion results require an error message.',
    );
  }
};

const validateLegacyExpanded = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  const expansion = result.directoryExpansion;
  if (!expansion) {
    addDateTimeReviewIssue(
      context,
      ['directoryExpansion'],
      'EXPANDED ingestion results require a directory expansion summary.',
    );
    return;
  }
  if (!legacyExpansionOutcomesAreBalanced(expansion)) {
    addDateTimeReviewIssue(
      context,
      ['directoryExpansion'],
      'Directory expansion outcomes must account for every submitted URL.',
    );
  }
  if (!legacyExpansionHasAcceptedUrl(expansion)) {
    addDateTimeReviewIssue(
      context,
      ['directoryExpansion'],
      'EXPANDED ingestion results require at least one accepted, reused, or duplicate URL.',
    );
  }
  if (legacyExpandedResultHasArtifacts(result)) {
    addDateTimeReviewIssue(
      context,
      ['status'],
      'EXPANDED ingestion results cannot claim mapping artifacts, candidates, scrapes, commits, or errors.',
    );
  }
};

const validateLegacyReviewMetadata = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  if (result.directoryExpansion) {
    addDateTimeReviewIssue(
      context,
      ['directoryExpansion'],
      'Directory expansion summaries are only valid for EXPANDED results.',
    );
  }
  if (!result.commit) {
    addDateTimeReviewIssue(
      context,
      ['commit'],
      'REVIEW_REQUIRED ingestion results require a source-scoped commit.',
    );
  }
  if (!result.branch) {
    addDateTimeReviewIssue(
      context,
      ['branch'],
      'REVIEW_REQUIRED ingestion results require the source branch.',
    );
  }
  if (!result.generatedPaths.length) {
    addDateTimeReviewIssue(
      context,
      ['generatedPaths'],
      'REVIEW_REQUIRED ingestion results require generated source package paths.',
    );
  }
};

const validateLegacyReviewValidation = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  if (
    !result.validation.testsPassed
    || !result.validation.diffCheckPassed
    || !result.validation.duplicateSafe
  ) {
    addDateTimeReviewIssue(
      context,
      ['validation'],
      'REVIEW_REQUIRED ingestion results require passing tests, diff, and duplicate checks.',
    );
  }
};

const validateLegacyReviewScrapes = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  if (result.reviewScrapes.length !== 2 || result.reviewScrapes.some((scrape) => !scrape.passed)) {
    addDateTimeReviewIssue(
      context,
      ['reviewScrapes'],
      'REVIEW_REQUIRED ingestion results require exactly two passing review scrapes.',
    );
  }
  if (
    result.reviewScrapes.length === 2
    && (
      result.reviewScrapes[0].candidateCount !== result.reviewScrapes[1].candidateCount
      || result.reviewScrapes[0].normalizedCandidateSha256
        !== result.reviewScrapes[1].normalizedCandidateSha256
    )
  ) {
    addDateTimeReviewIssue(
      context,
      ['reviewScrapes'],
      'Review scrapes must have stable counts and normalized candidate hashes.',
    );
  }
  if (
    result.reviewScrapes.length === 2
    && result.reviewScrapes.some(
      (scrape) => scrape.candidateCount !== result.candidateCount,
    )
  ) {
    addDateTimeReviewIssue(
      context,
      ['candidateCount'],
      'Result candidate count must match both review scrapes.',
    );
  }
};

const validateLegacyReviewRequired = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  validateLegacyReviewMetadata(result, context);
  validateLegacyReviewValidation(result, context);
  validateLegacyReviewScrapes(result, context);
  if (result.errorMessage) {
    addDateTimeReviewIssue(
      context,
      ['errorMessage'],
      'REVIEW_REQUIRED ingestion results cannot include an error message.',
    );
  }
};

const validateLegacyResult = (
  result: z.infer<typeof legacyCodexAffiliateIngestionResultSchema>,
  context: RefinementContext,
): void => {
  if (result.status === 'HUMAN_REVIEW_REQUIRED') {
    validateLegacyHumanReview(result, context);
    return;
  }
  validateLegacyMetadata(result, context);
  if (result.status === 'FAILED') {
    validateLegacyFailed(result, context);
    return;
  }
  if (result.status === 'EXPANDED') {
    validateLegacyExpanded(result, context);
    return;
  }
  validateLegacyReviewRequired(result, context);
};

const sportReasonCodes = [
  'SPORT_VARIANT_UNRESOLVED',
  'SPORT_NOT_IN_CATALOG',
  'SPORT_BLACKLISTED',
] as const;

const v2HumanReviewRequiredSchema = z.object({
  reasonCodes: z.array(nonEmptyString).min(1).max(20),
  sourceSportLabels: z.array(nonEmptyString).max(20),
  rationale: nonEmptyString.optional(),
  blockingIssues: z.array(nonEmptyString).max(50).default([]),
  requestedNextAction: z.literal('HUMAN_REVIEW_REQUIRED').default('HUMAN_REVIEW_REQUIRED'),
}).strict();

const codexAffiliateIngestionResultV2BaseSchema = z.object({
  schemaVersion: z.literal(2),
  jobId: nonEmptyString,
  intakeId: nonEmptyString,
  sourceKey: nonEmptyString,
  workerId: nonEmptyString,
  evidenceRunId: nonEmptyString,
  sportsCatalogSha256: sha256,
  sportDeterminations: affiliateSportDeterminationsSchema,
  status: z.enum(['REVIEW_REQUIRED', 'EXPANDED', 'FAILED', 'HUMAN_REVIEW_REQUIRED']),
  branch: nonEmptyString.nullable(),
  commit: gitCommit.nullable(),
  generatedPaths: z.array(nonEmptyString).default([]),
  logoDisposition: z.enum([
    'OFFICIAL_ASSET',
    'OFFICIAL_SCREENSHOT_CROP',
    'MANUAL_REVIEW',
  ]),
  candidateCount: z.number().int().nonnegative(),
  dateTimeReview: affiliateEventDateTimeReviewSchema.optional(),
  reviewScrapes: z.array(reviewScrapeSchema).max(2).default([]),
  validation: z.object({
    testsPassed: z.boolean(),
    diffCheckPassed: z.boolean(),
    duplicateSafe: z.boolean(),
    warnings: z.array(nonEmptyString).default([]),
  }).strict(),
  directoryExpansion: directoryExpansionSchema.nullable().optional(),
  humanReviewRequired: v2HumanReviewRequiredSchema.nullable().optional(),
  errorMessage: nonEmptyString.nullable(),
}).strict();

const hasSportReasonCode = (reasonCodes: readonly string[]): boolean => (
  reasonCodes.some((reasonCode) => (sportReasonCodes as readonly string[]).includes(reasonCode))
);

export const codexAffiliateIngestionResultV2Schema =
  codexAffiliateIngestionResultV2BaseSchema.superRefine((result, context) => {
    validateV2Result(result, context);
  });

type V2Result = z.infer<typeof codexAffiliateIngestionResultV2BaseSchema>;

const v2ResultHasArtifacts = (result: V2Result): boolean => Boolean(
  result.branch
  || result.commit
  || result.generatedPaths.length
  || result.candidateCount !== 0
  || result.reviewScrapes.length
  || result.directoryExpansion
  || result.errorMessage
);

const v2ExpandedResultHasArtifacts = (result: V2Result): boolean => Boolean(
  result.branch
  || result.commit
  || result.generatedPaths.length
  || result.candidateCount !== 0
  || result.reviewScrapes.length
  || result.errorMessage
);

const v2ExpansionOutcomesAreBalanced = (
  expansion: z.infer<typeof directoryExpansionSchema>,
): boolean => (
  expansion.created
    + expansion.reused
    + expansion.duplicate
    + expansion.rejected
    === expansion.submitted
);

const validateV2SportHumanReview = (
  result: V2Result,
  humanReview: NonNullable<V2Result['humanReviewRequired']>,
  context: RefinementContext,
): void => {
  try {
    assertAffiliateSportDeterminationReasonStatusConsistency({
      determinations: result.sportDeterminations,
      reasonCodes: humanReview.reasonCodes,
    });
    if (!result.sportDeterminations.length) {
      throw new Error('Sport-coded human review requires determinations.');
    }
    const expectedLabels = affiliateSportSourceLabelUnion(result.sportDeterminations);
    if (JSON.stringify(expectedLabels) !== JSON.stringify(humanReview.sourceSportLabels)) {
      throw new Error('sourceSportLabels must equal the determination source-label union.');
    }
  } catch (error) {
    addDateTimeReviewIssue(
      context,
      ['humanReviewRequired'],
      error instanceof Error ? error.message : 'Invalid sport human-review result.',
    );
  }
};

const validateV2NonSportHumanReview = (
  result: V2Result,
  humanReview: NonNullable<V2Result['humanReviewRequired']>,
  context: RefinementContext,
): void => {
  if (humanReview.sourceSportLabels.length || result.sportDeterminations.length) {
    addDateTimeReviewIssue(
      context,
      ['humanReviewRequired', 'sourceSportLabels'],
      'Non-sport human review must not invent sport labels or determinations.',
    );
  }
};

const validateV2HumanReview = (
  result: V2Result,
  context: RefinementContext,
): void => {
  const humanReview = result.humanReviewRequired;
  if (!humanReview) {
    addDateTimeReviewIssue(
      context,
      ['humanReviewRequired'],
      'HUMAN_REVIEW_REQUIRED results require a structured human-review reason.',
    );
    return;
  }
  if (hasSportReasonCode(humanReview.reasonCodes)) {
    validateV2SportHumanReview(result, humanReview, context);
  } else {
    validateV2NonSportHumanReview(result, humanReview, context);
  }
  if (v2ResultHasArtifacts(result)) {
    addDateTimeReviewIssue(
      context,
      ['status'],
      'HUMAN_REVIEW_REQUIRED results cannot claim mapping artifacts, candidates, scrapes, expansion, commits, or errors.',
    );
  }
};

const validateV2Metadata = (
  result: V2Result,
  context: RefinementContext,
): void => {
  if (result.humanReviewRequired) {
    addDateTimeReviewIssue(
      context,
      ['humanReviewRequired'],
      'Structured human-review reasons are only valid for HUMAN_REVIEW_REQUIRED results.',
    );
  }
  if (result.dateTimeReview && result.dateTimeReview.candidateCount !== result.candidateCount) {
    addDateTimeReviewIssue(
      context,
      ['dateTimeReview', 'candidateCount'],
      'Datetime review candidateCount must match the ingestion result.',
    );
  }
  if (result.status !== 'REVIEW_REQUIRED' && result.dateTimeReview) {
    addDateTimeReviewIssue(
      context,
      ['dateTimeReview'],
      'Datetime review evidence is only valid for REVIEW_REQUIRED mapping results.',
    );
  }
};

const validateV2Failed = (
  result: V2Result,
  context: RefinementContext,
): void => {
  if (!result.errorMessage) {
    addDateTimeReviewIssue(
      context,
      ['errorMessage'],
      'FAILED ingestion results require an error message.',
    );
  }
};

const validateV2Expanded = (
  result: V2Result,
  context: RefinementContext,
): void => {
  const expansion = result.directoryExpansion;
  if (!expansion) {
    addDateTimeReviewIssue(
      context,
      ['directoryExpansion'],
      'EXPANDED ingestion results require a directory expansion summary.',
    );
  } else if (!v2ExpansionOutcomesAreBalanced(expansion)) {
    addDateTimeReviewIssue(
      context,
      ['directoryExpansion'],
      'Directory expansion outcomes must account for every submitted URL.',
    );
  }
  if (v2ExpandedResultHasArtifacts(result)) {
    addDateTimeReviewIssue(
      context,
      ['status'],
      'EXPANDED ingestion results cannot claim mapping artifacts, candidates, scrapes, commits, or errors.',
    );
  }
};

const validateV2ReviewMetadata = (
  result: V2Result,
  context: RefinementContext,
): void => {
  if (result.directoryExpansion) {
    addDateTimeReviewIssue(
      context,
      ['directoryExpansion'],
      'Directory expansion summaries are only valid for EXPANDED results.',
    );
  }
  if (!result.commit) {
    addDateTimeReviewIssue(
      context,
      ['commit'],
      'REVIEW_REQUIRED ingestion results require a source-scoped commit.',
    );
  }
  if (!result.branch) {
    addDateTimeReviewIssue(
      context,
      ['branch'],
      'REVIEW_REQUIRED ingestion results require the source branch.',
    );
  }
  if (!result.generatedPaths.length) {
    addDateTimeReviewIssue(
      context,
      ['generatedPaths'],
      'REVIEW_REQUIRED ingestion results require generated source package paths.',
    );
  }
};

const validateV2ReviewValidation = (
  result: V2Result,
  context: RefinementContext,
): void => {
  if (!result.validation.testsPassed || !result.validation.diffCheckPassed || !result.validation.duplicateSafe) {
    addDateTimeReviewIssue(
      context,
      ['validation'],
      'REVIEW_REQUIRED ingestion results require passing tests, diff, and duplicate checks.',
    );
  }
};

const validateV2ReviewScrapes = (
  result: V2Result,
  context: RefinementContext,
): void => {
  if (result.reviewScrapes.length !== 2 || result.reviewScrapes.some((scrape) => !scrape.passed)) {
    addDateTimeReviewIssue(
      context,
      ['reviewScrapes'],
      'REVIEW_REQUIRED ingestion results require exactly two passing review scrapes.',
    );
  }
  if (
    result.reviewScrapes.length === 2
    && (
      result.reviewScrapes[0].candidateCount !== result.reviewScrapes[1].candidateCount
      || result.reviewScrapes[0].normalizedCandidateSha256 !== result.reviewScrapes[1].normalizedCandidateSha256
    )
  ) {
    addDateTimeReviewIssue(
      context,
      ['reviewScrapes'],
      'Review scrapes must have stable counts and normalized candidate hashes.',
    );
  }
};

const validateV2ReviewDeterminations = (
  result: V2Result,
  context: RefinementContext,
): void => {
  try {
    if (!result.sportDeterminations.some((determination) => determination.status === 'RESOLVED')) {
      throw new Error('Review-ready mappings require at least one resolved determination.');
    }
    if (result.sportDeterminations.some(
      (determination) => !['RESOLVED', 'BLACKLISTED'].includes(determination.status),
    )) {
      throw new Error('Review-ready mappings cannot contain unresolved or unsupported determinations.');
    }
  } catch (error) {
    addDateTimeReviewIssue(
      context,
      ['sportDeterminations'],
      error instanceof Error ? error.message : 'Invalid review-ready determinations.',
    );
  }
};

const validateV2ReviewRequired = (
  result: V2Result,
  context: RefinementContext,
): void => {
  validateV2ReviewMetadata(result, context);
  validateV2ReviewValidation(result, context);
  validateV2ReviewScrapes(result, context);
  if (result.errorMessage) {
    addDateTimeReviewIssue(
      context,
      ['errorMessage'],
      'REVIEW_REQUIRED ingestion results cannot include an error message.',
    );
  }
  validateV2ReviewDeterminations(result, context);
};

const validateV2Result = (
  result: V2Result,
  context: RefinementContext,
): void => {
  if (result.status === 'HUMAN_REVIEW_REQUIRED') {
    validateV2HumanReview(result, context);
    return;
  }
  validateV2Metadata(result, context);
  if (result.status === 'FAILED') {
    validateV2Failed(result, context);
    return;
  }
  if (result.status === 'EXPANDED') {
    validateV2Expanded(result, context);
    return;
  }
  validateV2ReviewRequired(result, context);
};

export type CodexAffiliateIngestionResultV1 = z.infer<
  typeof legacyCodexAffiliateIngestionResultSchema
>;
export type CodexAffiliateIngestionResultV2 = z.infer<
  typeof codexAffiliateIngestionResultV2Schema
>;

export const codexAffiliateIngestionResultSchema = z.union([
  legacyCodexAffiliateIngestionResultSchema,
  codexAffiliateIngestionResultV2Schema,
]);

export type CodexAffiliateIngestionResult = z.infer<
  typeof codexAffiliateIngestionResultSchema
>;


export const buildCodexAffiliateDirectoryExpansionResult = (input: {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  directoryExpansion: z.infer<typeof directoryExpansionSchema>;
  warnings?: string[];
}): CodexAffiliateIngestionResult => codexAffiliateIngestionResultSchema.parse({
  schemaVersion: 1,
  jobId: input.jobId,
  intakeId: input.intakeId,
  sourceKey: input.sourceKey,
  workerId: input.workerId,
  status: 'EXPANDED',
  branch: null,
  commit: null,
  generatedPaths: [],
  logoDisposition: 'MANUAL_REVIEW',
  candidateCount: 0,
  reviewScrapes: [],
  validation: {
    testsPassed: true,
    diffCheckPassed: true,
    duplicateSafe: true,
    warnings: input.warnings ?? [],
  },
  directoryExpansion: input.directoryExpansion,
  errorMessage: null,
});

export const buildCodexAffiliateUnsupportedSportHumanReviewResult = (input: {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  sourceSportLabels: string[];
  rationale?: string;
  blockingIssues?: string[];
}): CodexAffiliateIngestionResult => codexAffiliateIngestionResultSchema.parse({
  schemaVersion: 1,
  jobId: input.jobId,
  intakeId: input.intakeId,
  sourceKey: input.sourceKey,
  workerId: input.workerId,
  status: 'HUMAN_REVIEW_REQUIRED',
  branch: null,
  commit: null,
  generatedPaths: [],
  logoDisposition: 'MANUAL_REVIEW',
  candidateCount: 0,
  reviewScrapes: [],
  validation: {
    testsPassed: true,
    diffCheckPassed: true,
    duplicateSafe: true,
    warnings: ['Unsupported source sports were preserved as evidence only.'],
  },
  humanReviewRequired: {
    reasonCodes: ['SPORT_NOT_IN_CATALOG'],
    sourceSportLabels: Array.from(new Set(input.sourceSportLabels.map((label) => label.trim()).filter(Boolean))),
    rationale: input.rationale
      ?? 'The source sport is not an exact current BracketIQ Sports catalog name.',
    blockingIssues: input.blockingIssues ?? [],
    requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
  },
  errorMessage: null,
});

const buildCodexAffiliateV2HumanReviewBase = (input: {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  evidenceRunId: string;
  sportsCatalogSha256: string;
  sportDeterminations: AffiliateSportDetermination[];
  reasonCodes: string[];
  sourceSportLabels: string[];
  rationale: string;
  blockingIssues?: string[];
}): Record<string, unknown> => ({
  schemaVersion: 2,
  jobId: input.jobId,
  intakeId: input.intakeId,
  sourceKey: input.sourceKey,
  workerId: input.workerId,
  evidenceRunId: input.evidenceRunId,
  sportsCatalogSha256: input.sportsCatalogSha256,
  sportDeterminations: input.sportDeterminations,
  status: 'HUMAN_REVIEW_REQUIRED',
  branch: null,
  commit: null,
  generatedPaths: [],
  logoDisposition: 'MANUAL_REVIEW',
  candidateCount: 0,
  reviewScrapes: [],
  validation: {
    testsPassed: true,
    diffCheckPassed: true,
    duplicateSafe: true,
    warnings: input.reasonCodes.length
      ? [`Human review required: ${input.reasonCodes.join(', ')}`]
      : ['Human review is required before mapping can proceed.'],
  },
  humanReviewRequired: {
    reasonCodes: input.reasonCodes,
    sourceSportLabels: input.sourceSportLabels,
    rationale: input.rationale,
    blockingIssues: input.blockingIssues ?? [],
    requestedNextAction: 'HUMAN_REVIEW_REQUIRED',
  },
  errorMessage: null,
});

export const buildCodexAffiliateSportHumanReviewResult = (input: {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  evidenceRunId: string;
  sportsCatalogSha256: string;
  sportDeterminations: AffiliateSportDetermination[];
  rationale?: string;
  blockingIssues?: string[];
  catalog?: readonly string[];
}): CodexAffiliateIngestionResultV2 => {
  const determinations = input.sportDeterminations.map((determination) => (
    affiliateSportDeterminationSchema.parse(determination)
  ));
  const reasonCodes = Array.from(new Set(determinations.flatMap((determination) => {
    if (determination.status === 'VARIANT_UNRESOLVED') return ['SPORT_VARIANT_UNRESOLVED'];
    if (determination.status === 'UNSUPPORTED') return ['SPORT_NOT_IN_CATALOG'];
    if (determination.status === 'BLACKLISTED') return ['SPORT_BLACKLISTED'];
    return [];
  }))).sort();
  if (!reasonCodes.length) {
    throw new Error('Sport human review requires an unresolved, unsupported, or blacklisted determination.');
  }
  if (input.catalog) {
    assertAffiliateSportCompletionReady({
      determinations,
      catalog: input.catalog,
      resultKind: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes,
    });
  } else {
    assertAffiliateSportDeterminationReasonStatusConsistency({
      determinations,
      reasonCodes,
    });
  }
  const rationale = input.rationale?.trim()
    || determinations.map((determination) => determination.rationale).join(' ');
  return codexAffiliateIngestionResultV2Schema.parse(buildCodexAffiliateV2HumanReviewBase({
    jobId: input.jobId,
    intakeId: input.intakeId,
    sourceKey: input.sourceKey,
    workerId: input.workerId,
    evidenceRunId: input.evidenceRunId,
    sportsCatalogSha256: input.sportsCatalogSha256,
    sportDeterminations: determinations,
    reasonCodes,
    sourceSportLabels: affiliateSportSourceLabelUnion(determinations),
    rationale: rationale || 'Stored source evidence requires human sport review.',
    blockingIssues: input.blockingIssues,
  }));
};

export const buildCodexAffiliateNonSportHumanReviewResult = (input: {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  evidenceRunId: string;
  sportsCatalogSha256: string;
  reasonCodes: string[];
  rationale: string;
  blockingIssues?: string[];
}): CodexAffiliateIngestionResultV2 => {
  if (input.reasonCodes.some((reasonCode) => (sportReasonCodes as readonly string[]).includes(reasonCode))) {
    throw new Error('Non-sport human review cannot contain sport reason codes.');
  }
  return codexAffiliateIngestionResultV2Schema.parse(buildCodexAffiliateV2HumanReviewBase({
    ...input,
    sportDeterminations: [],
    sourceSportLabels: [],
  }));
};
