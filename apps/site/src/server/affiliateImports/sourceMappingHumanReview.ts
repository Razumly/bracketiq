import { prisma } from '@/lib/prisma';
import { stableAgentArtifactSha256 } from './agentContracts';
import {
  archiveAffiliateMappingResultEnvelope,
} from './affiliateMappingResultHistory';
import {
  affiliateHumanSportResolutionSchema,
  affiliateSportDeterminationSha256,
  affiliateSportDeterminationSchema,
  affiliateSportSourceLabelUnion,
  type AffiliateHumanSportResolution,
  type AffiliateSportDetermination,
} from './affiliateSportDetermination';
import {
  affiliateSportsCatalogSnapshotSchema,
  compareAffiliateCatalogCodeUnits,
  loadAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import {
  BLACKLISTED_AFFILIATE_SPORT_NAMES,
  isAffiliateSportBlacklisted,
} from './affiliateSportMapping';

type JsonRecord = Record<string, unknown>;

type HumanReviewJobRow = {
  id: string;
  intakeId: string;
  status: string;
  updatedAt: Date | string;
  finishedAt?: Date | string | null;
  attemptCount?: number | null;
  errorMessage?: string | null;
  resultSummary?: unknown;
};

type HumanReviewIntakeRow = {
  id: string;
  name: string;
  sourceKey: string;
  region?: string | null;
  baseUrl?: string | null;
  status: string;
  complianceStatus: string;
  selectedLogoArtifactId?: string | null;
};

export type AffiliateMappingReviewOwner = 'USER' | 'MAPPING_AGENT' | 'SYSTEM';

export type AffiliateMappingSportReviewDetermination = AffiliateSportDetermination & {
  determinationSha256: string;
};

export type AffiliateMappingHumanReviewRow = {
  jobId: string;
  intakeId: string;
  intakeName: string;
  sourceKey: string;
  region: string | null;
  baseUrl: string | null;
  intakeStatus: string;
  complianceStatus: string;
  attemptCount: number;
  markedAt: string;
  errorMessage: string | null;
  source: string | null;
  requestedNextAction: string | null;
  reasonCodes: string[];
  sourceSportLabels: string[];
  rationale: string | null;
  blockingIssues: string[];
  hasSelectedLogo: boolean;
  reviewOwner: AffiliateMappingReviewOwner;
  reviewQuestion: string;
  recommendedAction: string;
  claimCatalogSha256?: string | null;
  sportsCatalogSha256?: string | null;
  currentCatalogSha256?: string | null;
  catalogCurrent?: boolean | null;
  sportDeterminations?: AffiliateMappingSportReviewDetermination[];
  humanSportResolution?: AffiliateHumanSportResolution | null;
};

export type AffiliateMappingHumanReviewListMetadata = {
  currentCatalog: AffiliateSportsCatalogSnapshot | null;
  currentCatalogSha256: string | null;
  catalogSha256: string | null;
};

export type AffiliateMappingHumanReviewRows = AffiliateMappingHumanReviewRow[] & {
  metadata?: AffiliateMappingHumanReviewListMetadata;
};
type ReviewGuidance = Pick<
  AffiliateMappingHumanReviewRow,
  'reviewOwner' | 'reviewQuestion' | 'recommendedAction'
>;
type HumanReviewDatabaseModel = {
  findMany: (args: unknown) => Promise<unknown[]>;
  findUnique?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<{ count: number }>;
};

type HumanReviewDatabase = {
  affiliateSourceMappingJobs: HumanReviewDatabaseModel;
  affiliateSourceIntakes: HumanReviewDatabaseModel;
  affiliateApprovalJobs?: HumanReviewDatabaseModel;
  sports?: {
    findMany: (args: { select: { id: true; name: true } }) => Promise<readonly { id: string; name: string }[]>;
  };
  $transaction?: <T>(callback: (transaction: HumanReviewDatabase) => Promise<T>) => Promise<T>;
};

const reviewDb = (): HumanReviewDatabase => prisma as unknown as HumanReviewDatabase;

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringValues = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.map(stringValue).filter((entry): entry is string => Boolean(entry))))
    : []
);

const isoValue = (value: Date | string | null | undefined): string => {
  const parsed = value instanceof Date ? value : new Date(value ?? 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
};

const producerRepairReasonCodes = new Set([
  'LIVE_SETUP_UNSUPPORTED',
  'EVENT_LOCATION_INVALID',
  'ORGANIZATION_LOCATION_INVALID',
  'SPORT_NAME_INVALID',
  'EVENT_DIVISION_GROUPING_INVALID',
  'EVENT_DIVISION_CLASSIFICATION_INVALID',
  'EVENT_PRICING_INVALID',
  'EVENT_CAPACITY_INVALID',
  'EVENT_DESCRIPTION_INVALID',
  'ORGANIZATION_DESCRIPTION_INVALID',
  'OFFICIAL_LOGO_REPAIR_REQUIRED',
  'PACKAGE_VALIDATION_FAILED',
  'DUPLICATE_SAFETY_INVALID',
  'OTHER_PRODUCER_DEFECT',
]);

const producerHandoffPattern = /(?:(?:producer|package[- ]evidence|exact[- ]commit|producer-workspace|repository|commit).{0,160}(?:unavailable|inaccessible|missing|cannot|could not|not resolve|not reachable)|(?:unavailable|inaccessible|missing|cannot|could not|not resolve|not reachable).{0,160}(?:producer|package[- ]evidence|exact[- ]commit|producer-workspace|repository|commit))/i;

const allSourceLabelsBlacklisted = (sourceLabels: readonly string[]): boolean => (
  sourceLabels.length > 0 && sourceLabels.every(isAffiliateSportBlacklisted)
);

const exclusionGuidance: ReviewGuidance = {
  reviewOwner: 'USER',
  reviewQuestion: 'Should this blacklisted source activity remain excluded?',
  recommendedAction: 'Confirm the exact blacklisted determinations when the source must remain excluded. Blacklisted activities cannot become executable sports.',
};

export const affiliateMappingReviewGuidance = (input: {
  requestedNextAction?: string | null;
  reasonCodes?: string[];
  sourceSportLabels?: string[];
  rationale?: string | null;
  blockingIssues?: string[];
  errorMessage?: string | null;
}): ReviewGuidance => {
  const reasonCodes = input.reasonCodes ?? [];
  const evidence = [
    input.rationale,
    ...(input.blockingIssues ?? []),
    input.errorMessage,
  ].filter((value): value is string => Boolean(value)).join(' ');

  if (producerHandoffPattern.test(evidence)) {
    return {
      reviewOwner: 'SYSTEM',
      reviewQuestion: 'Can the producer package and exact-commit evidence handoff be restored?',
      recommendedAction: 'Repair the producer workspace or commit handoff, then return this job to review. Do not judge the source content yet.',
    };
  }
  const substantiveReasonCodes = reasonCodes.filter((reasonCode) => reasonCode !== 'RETRY_LIMIT_EXCEEDED');
  const logoAbsenceOnly = substantiveReasonCodes.length > 0
    && substantiveReasonCodes.every((reasonCode) => reasonCode === 'NO_VERIFIABLE_OFFICIAL_LOGO');
  if (logoAbsenceOnly) {
    return {
      reviewOwner: 'MAPPING_AGENT',
      reviewQuestion: 'Can this mapping proceed with no official logo?',
      recommendedAction: 'Accept the missing logo and return the package to automated review. A missing logo alone must not block the mapping.',
    };
  }
  const hasProducerRepair = input.requestedNextAction === 'PRODUCER_REPAIR'
    || reasonCodes.some((reasonCode) => producerRepairReasonCodes.has(reasonCode));
  if (hasProducerRepair) {
    return {
      reviewOwner: 'MAPPING_AGENT',
      reviewQuestion: 'What must the mapping agent repair before this package can pass review?',
      recommendedAction: 'Use the reason codes and blocking issues as repair instructions, then return the corrected package to review.',
    };
  }
  if (reasonCodes.includes('CONFLICTING_LIVE_RECORD')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Is this source the same as the conflicting live record, or should both records remain separate?',
      recommendedAction: 'Compare the source identity with the live record. Choose whether to merge, replace, keep separate, or stop this source.',
    };
  }
  const sourceSportLabels = input.sourceSportLabels ?? [];
  const sportReasonCodes: Record<string, true> = {
    SPORT_VARIANT_UNRESOLVED: true,
    SPORT_NOT_IN_CATALOG: true,
    SPORT_BLACKLISTED: true,
  };
  if (
    allSourceLabelsBlacklisted(sourceSportLabels)
    && substantiveReasonCodes.length > 0
    && substantiveReasonCodes.every((reasonCode) => sportReasonCodes[reasonCode] === true)
  ) {
    return exclusionGuidance;
  }
  if (reasonCodes.includes('SPORT_VARIANT_UNRESOLVED')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Which exact catalog sport does the stored source evidence establish?',
      recommendedAction: 'Review each determination and choose only exact, fully configured catalog sports supported by the cited evidence.',
    };
  }
  if (reasonCodes.includes('SPORT_NOT_IN_CATALOG')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Should this sport be added to the BracketIQ sports catalog?',
      recommendedAction: 'Review the source sport below. Add a fully configured canonical sport only when BracketIQ should support it; otherwise leave this mapping stopped.',
    };
  }
  if (reasonCodes.includes('SPORT_BLACKLISTED')) {
    return exclusionGuidance;
  }
  if (reasonCodes.includes('RETRY_LIMIT_EXCEEDED')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Should this source receive another repair attempt, or should automatic retries stop?',
      recommendedAction: 'Review the last failure below. Requeue only when the failure is repairable; otherwise leave it stopped for a later manual check.',
    };
  }
  if (reasonCodes.includes('INSUFFICIENT_STORED_EVIDENCE')) {
    return {
      reviewOwner: 'USER',
      reviewQuestion: 'Is there another official public page or stored capture that proves this source identity?',
      recommendedAction: 'Provide or capture the missing first-party evidence. Stop the source if no reliable evidence is available.',
    };
  }
  return {
    reviewOwner: 'USER',
    reviewQuestion: 'Should this source be repaired and retried, or should it remain stopped for manual review?',
    recommendedAction: 'Use the recorded concern below to choose whether to retry, supply evidence, or stop this source.',
  };
};

const resultEnvelopeFor = (value: unknown): JsonRecord => {
  const envelope = recordValue(value);
  const nestedResult = recordValue(envelope.result);
  return Object.keys(nestedResult).length ? nestedResult : envelope;
};

const humanReviewFor = (value: unknown): JsonRecord => {
  const envelope = recordValue(value);
  const nestedResult = recordValue(envelope.result);
  const direct = recordValue(envelope.humanReviewRequired);
  return Object.keys(direct).length ? direct : recordValue(nestedResult.humanReviewRequired);
};

const sportDeterminationsFor = (value: unknown): AffiliateMappingSportReviewDetermination[] => {
  const envelope = recordValue(value);
  const nestedResult = resultEnvelopeFor(value);
  const humanReview = humanReviewFor(value);
  const raw = [
    envelope.sportDeterminations,
    nestedResult.sportDeterminations,
    humanReview.sportDeterminations,
  ].find((candidate) => Array.isArray(candidate));
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate) => {
    const parsed = affiliateSportDeterminationSchema.safeParse(candidate);
    if (!parsed.success) return [];
    return [{
      ...parsed.data,
      determinationSha256: affiliateSportDeterminationSha256(parsed.data),
    }];
  });
};

const humanSportResolutionFor = (value: unknown): AffiliateHumanSportResolution | null => {
  const envelope = recordValue(value);
  const nestedResult = resultEnvelopeFor(value);
  const candidate = envelope.humanSportResolution ?? nestedResult.humanSportResolution;
  const parsed = affiliateHumanSportResolutionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

const claimCatalogFor = (value: unknown): AffiliateSportsCatalogSnapshot | null => {
  const context = recordValue(recordValue(value).claimEvidenceContext);
  const candidate = recordValue(context.sportsCatalog);
  const parsed = affiliateSportsCatalogSnapshotSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

const catalogDetailsFor = (
  resultSummary: unknown,
  currentCatalog: AffiliateSportsCatalogSnapshot | null,
): Pick<
  AffiliateMappingHumanReviewRow,
  'claimCatalogSha256' | 'currentCatalogSha256' | 'catalogCurrent' | 'sportDeterminations' | 'humanSportResolution'
> => {
  const claimCatalog = claimCatalogFor(resultSummary);
  const determinations = sportDeterminationsFor(resultSummary);
  const humanSportResolution = humanSportResolutionFor(resultSummary);
  if (!claimCatalog && !determinations.length && !humanSportResolution) return {};
  const currentCatalogSha256 = currentCatalog?.sha256 ?? null;
  return {
    claimCatalogSha256: claimCatalog?.sha256 ?? null,
    currentCatalogSha256,
    catalogCurrent: claimCatalog ? Boolean(currentCatalog && claimCatalog.sha256 === currentCatalog.sha256) : null,
    sportDeterminations: determinations,
    humanSportResolution,
  };
};

export const listAffiliateMappingHumanReviewJobs = async (
  options: { limit?: number } = {},
): Promise<AffiliateMappingHumanReviewRows> => {
  const requestedLimit = Number.isFinite(options.limit) ? Number(options.limit) : 250;
  const limit = Math.max(1, Math.min(250, Math.trunc(requestedLimit)));
  const database = reviewDb();
  const jobs = database.affiliateSourceMappingJobs;
  const intakes = database.affiliateSourceIntakes;
  const currentCatalog = database.sports
    ? await loadAffiliateSportsCatalogSnapshot({ sports: database.sports })
    : null;
  const jobRows = (await jobs.findMany({
    where: { status: 'HUMAN_REVIEW_REQUIRED' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      intakeId: true,
      status: true,
      updatedAt: true,
      finishedAt: true,
      attemptCount: true,
      errorMessage: true,
      resultSummary: true,
    },
  })) as unknown as HumanReviewJobRow[];
  const metadata: AffiliateMappingHumanReviewListMetadata = {
    currentCatalog,
    currentCatalogSha256: currentCatalog?.sha256 ?? null,
    catalogSha256: currentCatalog?.sha256 ?? null,
  };
  const rows: AffiliateMappingHumanReviewRows = [];
  if (!jobRows.length) {
    Object.defineProperty(rows, 'metadata', { value: metadata, enumerable: false });
    return rows;
  }
  const intakeRows = (await intakes.findMany({
    where: { id: { in: Array.from(new Set(jobRows.map((job) => job.intakeId))) } },
    select: {
      id: true,
      name: true,
      sourceKey: true,
      region: true,
      baseUrl: true,
      status: true,
      complianceStatus: true,
      selectedLogoArtifactId: true,
    },
  })) as unknown as HumanReviewIntakeRow[];
  const intakeById = new Map(intakeRows.map((intake) => [intake.id, intake]));
  for (const job of jobRows) {
    const intake = intakeById.get(job.intakeId);
    const humanReview = humanReviewFor(job.resultSummary);
    const reasonCodes = stringValues(humanReview.reasonCodes);
    const rationale = stringValue(humanReview.rationale);
    const blockingIssues = stringValues(humanReview.blockingIssues);
    const errorMessage = stringValue(job.errorMessage);
    const requestedNextAction = stringValue(humanReview.requestedNextAction);
    const details = catalogDetailsFor(job.resultSummary, currentCatalog);
    const sourceSportLabels = details.sportDeterminations?.length
      ? affiliateSportSourceLabelUnion(details.sportDeterminations)
      : stringValues(humanReview.sourceSportLabels);
    const staleCatalog = details.catalogCurrent === false;
    const pureBlacklistedSourceReview = allSourceLabelsBlacklisted(sourceSportLabels);
    const guidance = affiliateMappingReviewGuidance({
      requestedNextAction,
      reasonCodes,
      sourceSportLabels,
      rationale,
      blockingIssues,
      errorMessage,
    });
    rows.push({
      jobId: job.id,
      intakeId: job.intakeId,
      intakeName: intake?.name ?? 'Missing intake',
      sourceKey: intake?.sourceKey ?? job.intakeId,
      region: stringValue(intake?.region),
      baseUrl: stringValue(intake?.baseUrl),
      intakeStatus: intake?.status ?? 'MISSING',
      complianceStatus: intake?.complianceStatus ?? 'UNKNOWN',
      attemptCount: typeof job.attemptCount === 'number' ? job.attemptCount : 0,
      markedAt: isoValue(stringValue(humanReview.markedAt) ?? job.finishedAt ?? job.updatedAt),
      errorMessage,
      source: stringValue(humanReview.source),
      requestedNextAction,
      reasonCodes,
      sourceSportLabels,
      rationale,
      blockingIssues,
      hasSelectedLogo: Boolean(intake?.selectedLogoArtifactId),
      ...(staleCatalog && !pureBlacklistedSourceReview
        ? {
          reviewOwner: 'SYSTEM' as const,
          reviewQuestion: 'Is the claim-time sport catalog stale?',
          recommendedAction: 'Refresh the catalog and requeue this source before making a product sport choice.',
        }
        : guidance),
      ...details,
      ...(details.claimCatalogSha256 ? { sportsCatalogSha256: details.claimCatalogSha256 } : {}),
    });
  }
  Object.defineProperty(rows, 'metadata', { value: metadata, enumerable: false });
  return rows;
};
export type AffiliateMappingSportResolutionAction =
  | {
    action: 'REFRESH_CATALOG';
    jobId: string;
    actorUserId: string;
  }
  | {
    action: 'SELECT_SPORTS';
    jobId: string;
    actorUserId: string;
    expectedCatalogSha256: string;
    resolutions: Array<{
      determinationSha256: string;
      canonicalSportNames: string[];
    }>;
    rationale: string;
  }
  | {
    action: 'CONFIRM_EXCLUSIONS';
    jobId: string;
    actorUserId: string;
    determinationSha256s: string[];
    rationale: string;
  };

export class AffiliateMappingSportResolutionInputError extends Error {
  readonly status = 400;
}

export class AffiliateMappingSportResolutionConflictError extends Error {
  readonly status = 409;
}

export type AffiliateMappingSportResolutionDependencies = {
  database?: HumanReviewDatabase;
  catalogLoader?: (database: HumanReviewDatabase) => Promise<AffiliateSportsCatalogSnapshot>;
  now?: () => Date;
  blacklistPolicyHash?: string;
};

const databaseFor = (dependencies: AffiliateMappingSportResolutionDependencies): HumanReviewDatabase => (
  dependencies.database ?? reviewDb()
);

const transactionFor = async <T>(
  database: HumanReviewDatabase,
  callback: (transaction: HumanReviewDatabase) => Promise<T>,
): Promise<T> => (
  database.$transaction ? database.$transaction(callback) : callback(database)
);

const historyArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const historyEnvelopeFor = (value: unknown): JsonRecord => {
  const envelope = recordValue(value);
  const result: JsonRecord = {};
  for (const [key, nested] of Object.entries(envelope)) {
    if (/History$/.test(key) && Array.isArray(nested)) result[key] = nested;
  }
  return result;
};
const matchingCatalogNames = (catalog: AffiliateSportsCatalogSnapshot): Set<string> => (
  new Set(catalog.sports.map((sport) => sport.name))
);

const determinationByHashFor = (
  resultSummary: unknown,
): Map<string, AffiliateMappingSportReviewDetermination> => (
  new Map((sportDeterminationsFor(resultSummary)).map((determination) => [
    determination.determinationSha256.toLowerCase(),
    determination,
  ]))
);

const assertActiveQueueOwnership = async (
  transaction: HumanReviewDatabase,
  jobId: string,
  intakeId: string,
): Promise<void> => {
  const activeJobs = await transaction.affiliateSourceMappingJobs.findMany({
    where: {
      intakeId,
      status: { in: ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED'] },
      NOT: { id: jobId },
    },
    select: { id: true },
  });
  if (activeJobs.length > 0) {
    throw new AffiliateMappingSportResolutionConflictError(
      'Another active mapping job already owns this source intake.',
    );
  }
  const approvals = transaction.affiliateApprovalJobs;
  if (!approvals?.findUnique) return;
  const approval = recordValue(await approvals.findUnique({
    where: { subjectType_subjectKey: { subjectType: 'MAPPING_PACKAGE', subjectKey: jobId } },
    select: { id: true, status: true },
  }));
  if (['QUEUED', 'CLAIMED'].includes(stringValue(approval.status) ?? '')) {
    throw new AffiliateMappingSportResolutionConflictError(
      'An active approval claim already owns this mapping package.',
    );
  }
};

const priorArchiveFor = (resultSummary: unknown): {
  archived: ReturnType<typeof archiveAffiliateMappingResultEnvelope>;
  sha256: string;
} => {
  const envelope = recordValue(resultSummary);
  return {
    archived: archiveAffiliateMappingResultEnvelope(envelope),
    sha256: stableAgentArtifactSha256(envelope),
  };
};

const clearForRequeue = (resultSummary: unknown, historyField: string, entry: unknown): JsonRecord => {
  const prior = recordValue(resultSummary);
  const next: JsonRecord = {};
  for (const [key, nested] of Object.entries(prior)) {
    if (key !== 'historyPrefixes' && !/History$/.test(key)) next[key] = nested;
    if (/History$/.test(key) && Array.isArray(nested)) next[key] = [...nested];
  }
  next[historyField] = [...historyArray(next[historyField]), entry];
  return next;
};

const assertReviewableSportJob = (job: JsonRecord): void => {
  if (stringValue(job.status) !== 'HUMAN_REVIEW_REQUIRED') {
    throw new AffiliateMappingSportResolutionConflictError(
      `Mapping job is no longer human-reviewable (status ${stringValue(job.status) ?? 'unknown'}).`,
    );
  }
  if (job.sourceId || job.mappingId) {
    throw new AffiliateMappingSportResolutionConflictError(
      'A mapping with a source or mapping identity cannot receive a human sport resolution.',
    );
  }
};

export const resolveAffiliateMappingSportDecision = async (
  input: AffiliateMappingSportResolutionAction,
  dependencies: AffiliateMappingSportResolutionDependencies = {},
): Promise<unknown> => {
  const jobId = input.jobId.trim();
  const actorUserId = input.actorUserId.trim();
  if (!jobId || !actorUserId) {
    throw new AffiliateMappingSportResolutionInputError('A mapping job id and authenticated user id are required.');
  }
  const now = dependencies.now?.() ?? new Date();
  const currentCatalog = await (dependencies.catalogLoader
    ? dependencies.catalogLoader(databaseFor(dependencies))
    : loadAffiliateSportsCatalogSnapshot({
      sports: databaseFor(dependencies).sports
        ?? (() => {
          throw new AffiliateMappingSportResolutionInputError('The live sports catalog is unavailable.');
        })(),
    }));
  const catalogNames = matchingCatalogNames(currentCatalog);
  if (!currentCatalog.sha256 || catalogNames.size === 0) {
    throw new AffiliateMappingSportResolutionInputError('The live sports catalog is empty.');
  }

  const database = databaseFor(dependencies);
  return transactionFor(database, async (transaction) => {
    const findUnique = transaction.affiliateSourceMappingJobs.findUnique;
    if (!findUnique) throw new Error('Mapping job lookup is unavailable.');
    const job = recordValue(await findUnique({
      where: { id: jobId },
      select: {
        id: true,
        intakeId: true,
        status: true,
        sourceId: true,
        mappingId: true,
        resultSummary: true,
      },
    }));
    if (!Object.keys(job).length) {
      throw new AffiliateMappingSportResolutionConflictError('Affiliate mapping job was not found.');
    }
    assertReviewableSportJob(job);
    const resultSummary = job.resultSummary;
    const humanReview = humanReviewFor(resultSummary);
    const reasonCodes = stringValues(humanReview.reasonCodes);
    const substantiveReasonCodes = reasonCodes.filter((reasonCode) => reasonCode !== 'RETRY_LIMIT_EXCEEDED');
    const sportReasonCodes: Record<string, true> = {
      SPORT_VARIANT_UNRESOLVED: true,
      SPORT_NOT_IN_CATALOG: true,
      SPORT_BLACKLISTED: true,
    };
    if (substantiveReasonCodes.some((reasonCode) => sportReasonCodes[reasonCode] !== true)) {
      throw new AffiliateMappingSportResolutionConflictError(
        'A human sport resolution cannot mutate a row with non-sport review reasons.',
      );
    }
    const determinations = sportDeterminationsFor(resultSummary);
    const determinationsByHash = determinationByHashFor(resultSummary);
    const determinationLabels = determinations.flatMap((determination) => determination.sourceLabels);
    const pureBlacklistedSourceReview = allSourceLabelsBlacklisted(
      determinationLabels.length ? determinationLabels : stringValues(humanReview.sourceSportLabels),
    );
    if (input.action === 'REFRESH_CATALOG' && pureBlacklistedSourceReview) {
      throw new AffiliateMappingSportResolutionInputError(
        'A mapping with only blacklisted source activities cannot refresh or add a catalog sport.',
      );
    }
    const claimCatalog = claimCatalogFor(resultSummary);
    const prior = priorArchiveFor(resultSummary);
    await assertActiveQueueOwnership(transaction, jobId, stringValue(job.intakeId) ?? '');

    if (input.action === 'REFRESH_CATALOG') {
      if (!claimCatalog || claimCatalog.sha256 === currentCatalog.sha256) {
        throw new AffiliateMappingSportResolutionConflictError(
          'The claim-time catalog is already current; refresh is not needed.',
        );
      }
      const nextSummary = clearForRequeue(resultSummary, 'sportCatalogRefreshHistory', {
        schemaVersion: 1,
        action: 'REFRESH_CATALOG',
        refreshedAt: now.toISOString(),
        decidedByUserId: actorUserId,
        priorCatalogSha256: claimCatalog.sha256,
        currentCatalogSha256: currentCatalog.sha256,
        priorResultSummarySha256: prior.sha256,
        priorResultSummary: prior.archived,
      });
      const preservedResolution = humanSportResolutionFor(resultSummary);
      if (preservedResolution) nextSummary.humanSportResolution = preservedResolution;
      const update = transaction.affiliateSourceMappingJobs.updateMany;
      if (!update) throw new Error('Mapping job update is unavailable.');
      const changed = await update({
        where: { id: jobId, status: 'HUMAN_REVIEW_REQUIRED', sourceId: null, mappingId: null },
        data: {
          status: 'QUEUED',
          claimedAt: null,
          leaseExpiresAt: null,
          workerId: null,
          branch: null,
          commit: null,
          errorMessage: null,
          finishedAt: null,
          resultSummary: nextSummary,
        },
      });
      if (changed.count !== 1) throw new AffiliateMappingSportResolutionConflictError('Mapping job changed during catalog refresh.');
      await transaction.affiliateSourceIntakes.update?.({
        where: { id: job.intakeId },
        data: { status: 'READY_FOR_MAPPING' },
      });
      return transaction.affiliateSourceMappingJobs.findUnique
        ? transaction.affiliateSourceMappingJobs.findUnique({ where: { id: jobId } })
        : nextSummary;
    }

    if (input.action === 'SELECT_SPORTS' && (!claimCatalog || claimCatalog.sha256 !== currentCatalog.sha256)) {
      throw new AffiliateMappingSportResolutionConflictError(
        'The claim-time catalog is stale. Refresh the catalog before choosing a sport.',
      );
    }

    if (input.action === 'SELECT_SPORTS') {
      if (input.expectedCatalogSha256.toLowerCase() !== currentCatalog.sha256) {
        throw new AffiliateMappingSportResolutionConflictError('The expected catalog is stale.');
      }
      if (!input.rationale.trim()) {
        throw new AffiliateMappingSportResolutionInputError('A rationale is required for a sport selection.');
      }
      const selectable = determinations.filter((determination) => (
        determination.status === 'VARIANT_UNRESOLVED' || determination.status === 'UNSUPPORTED'
      ));
      if (!selectable.length || input.resolutions.length !== selectable.length) {
        throw new AffiliateMappingSportResolutionInputError(
          'Exactly one sport resolution is required for every unresolved or unsupported determination.',
        );
      }
      if (selectable.some((determination) => (
        determination.status === 'VARIANT_UNRESOLVED' && !reasonCodes.includes('SPORT_VARIANT_UNRESOLVED')
      ) || (
        determination.status === 'UNSUPPORTED' && !reasonCodes.includes('SPORT_NOT_IN_CATALOG')
      ))) {
        throw new AffiliateMappingSportResolutionInputError(
          'Sport reason codes must match every unresolved or unsupported determination.',
        );
      }
      const seen = new Set<string>();
      const resolutions = input.resolutions.map((resolution) => {
        const determinationSha256 = resolution.determinationSha256.toLowerCase();
        if (seen.has(determinationSha256)) {
          throw new AffiliateMappingSportResolutionInputError('A determination may only be resolved once.');
        }
        seen.add(determinationSha256);
        const determination = determinationsByHash.get(determinationSha256);
        if (!determination || !['VARIANT_UNRESOLVED', 'UNSUPPORTED'].includes(determination.status)) {
          throw new AffiliateMappingSportResolutionInputError(
            `Unknown or non-selectable determination ${resolution.determinationSha256}.`,
          );
        }
        const blacklistedSourceLabels = determination.sourceLabels.filter(isAffiliateSportBlacklisted);
        if (blacklistedSourceLabels.length > 0) {
          throw new AffiliateMappingSportResolutionInputError(
            `Cannot select canonical sports for blacklisted source label(s): ${blacklistedSourceLabels.join(', ')}.`,
          );
        }
        const rawNames = resolution.canonicalSportNames.map((name) => name.trim());
        if (new Set(rawNames).size !== rawNames.length) {
          throw new AffiliateMappingSportResolutionInputError(
            `Selections for ${resolution.determinationSha256} must not repeat a catalog name.`,
          );
        }
        const names = rawNames.sort(compareAffiliateCatalogCodeUnits);
        if (!names.length || names.some((name) => !catalogNames.has(name) || isAffiliateSportBlacklisted(name))) {
          throw new AffiliateMappingSportResolutionInputError(
            `Selections for ${resolution.determinationSha256} must be exact nonblacklisted catalog names.`,
          );
        }
        return {
          determinationSha256,
          sourceLabels: [...determination.sourceLabels],
          canonicalSportNames: names,
        };
      }).sort((left, right) => compareAffiliateCatalogCodeUnits(left.determinationSha256, right.determinationSha256));
      if (seen.size !== selectable.length || selectable.some((determination) => (
        !seen.has(determination.determinationSha256.toLowerCase())
      ))) {
        throw new AffiliateMappingSportResolutionInputError(
          'The submitted resolutions do not cover every unresolved or unsupported determination.',
        );
      }
      const resolution = affiliateHumanSportResolutionSchema.parse({
        schemaVersion: 1,
        state: 'PENDING',
        decidedAt: now.toISOString(),
        decidedByUserId: actorUserId,
        catalogSha256: currentCatalog.sha256,
        priorResultSummarySha256: prior.sha256,
        rationale: input.rationale.trim(),
        resolutions,
      });
      const nextSummary = clearForRequeue(resultSummary, 'sportResolutionHistory', {
        schemaVersion: 1,
        action: 'SELECT_SPORTS',
        decidedAt: now.toISOString(),
        decidedByUserId: actorUserId,
        priorResultSummarySha256: prior.sha256,
        priorResultSummary: prior.archived,
        humanSportResolution: resolution,
      });
      nextSummary.humanSportResolution = resolution;
      const update = transaction.affiliateSourceMappingJobs.updateMany;
      if (!update) throw new Error('Mapping job update is unavailable.');
      const changed = await update({
        where: { id: jobId, status: 'HUMAN_REVIEW_REQUIRED', sourceId: null, mappingId: null },
        data: {
          status: 'QUEUED',
          claimedAt: null,
          leaseExpiresAt: null,
          workerId: null,
          branch: null,
          commit: null,
          errorMessage: null,
          finishedAt: null,
          resultSummary: nextSummary,
        },
      });
      if (changed.count !== 1) throw new AffiliateMappingSportResolutionConflictError('Mapping job changed during sport selection.');
      await transaction.affiliateSourceIntakes.update?.({
        where: { id: job.intakeId },
        data: { status: 'READY_FOR_MAPPING' },
      });
      return transaction.affiliateSourceMappingJobs.findUnique
        ? transaction.affiliateSourceMappingJobs.findUnique({ where: { id: jobId } })
        : nextSummary;
    }

    if (!reasonCodes.includes('SPORT_BLACKLISTED')) {
      throw new AffiliateMappingSportResolutionInputError(
        'Exclusion confirmation requires the SPORT_BLACKLISTED reason code.',
      );
    }
    if (!input.rationale.trim()) {
      throw new AffiliateMappingSportResolutionInputError('A rationale is required to confirm exclusions.');
    }
    if (!determinations.length || determinations.some((determination) => determination.status !== 'BLACKLISTED')) {
      throw new AffiliateMappingSportResolutionInputError(
        'Exclusion confirmation is allowed only when every determination is blacklisted.',
      );
    }
    const expectedHashes = determinations.map((determination) => determination.determinationSha256.toLowerCase())
      .sort(compareAffiliateCatalogCodeUnits);
    const submittedHashes = input.determinationSha256s.map((hash) => hash.toLowerCase());
    if (new Set(submittedHashes).size !== submittedHashes.length) {
      throw new AffiliateMappingSportResolutionInputError('Exclusion determination hashes must be unique.');
    }
    const actualHashes = [...submittedHashes].sort(compareAffiliateCatalogCodeUnits);
    if (JSON.stringify(expectedHashes) !== JSON.stringify(actualHashes)
      || determinations.some((determination) => determination.sourceLabels.some((label) => !isAffiliateSportBlacklisted(label)))) {
      throw new AffiliateMappingSportResolutionInputError('The exclusion determination hashes or blacklist policy do not match.');
    }
    const nextSummary = clearForRequeue(resultSummary, 'sportResolutionHistory', {
      schemaVersion: 1,
      action: 'EXCLUSIONS_CONFIRMED',
      decidedAt: now.toISOString(),
      decidedByUserId: actorUserId,
      rationale: input.rationale.trim(),
      policyHash: dependencies.blacklistPolicyHash
        ?? stableAgentArtifactSha256([...BLACKLISTED_AFFILIATE_SPORT_NAMES]),
      determinationSha256s: expectedHashes,
      priorResultSummarySha256: prior.sha256,
      priorResultSummary: prior.archived,
    });
    const update = transaction.affiliateSourceMappingJobs.updateMany;
    if (!update) throw new Error('Mapping job update is unavailable.');
    const changed = await update({
      where: { id: jobId, status: 'HUMAN_REVIEW_REQUIRED', sourceId: null, mappingId: null },
      data: { resultSummary: nextSummary },
    });
    if (changed.count !== 1) throw new AffiliateMappingSportResolutionConflictError('Mapping job changed during exclusion confirmation.');
    return transaction.affiliateSourceMappingJobs.findUnique
      ? transaction.affiliateSourceMappingJobs.findUnique({ where: { id: jobId } })
      : nextSummary;
  });

};