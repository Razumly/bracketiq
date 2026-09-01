import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import {
  affiliateCoverageCampaignProposalSchema,
  affiliateCoverageCompletionSchema,
  affiliateCoverageClaimGenerationSchema,
  type AffiliateCoverageCampaignProposal,
  type AffiliateCoverageCompletion,
  type AffiliateCoverageClaimGeneration,
} from './coverageAgentContracts';
import {
  appendAffiliateMappingHistory,
  archiveAffiliateMappingResultEnvelope,
} from './affiliateMappingResultHistory';
import { prisma } from '@/lib/prisma';
import { queueAffiliateSourceDiscoveryRun } from './sourceDiscovery';
import { AFFILIATE_COVERAGE_QUERY_STRATEGY_VERSION } from './coverageQueryStrategies';
import { US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION } from './sourceDiscoveryCampaignTemplates';
import { reconcileAffiliateCoverageCells } from './coverageInventory';
import { getAffiliateCoverageProfile } from './coverageProfiles';
import { getAffiliateCoverageQueryStrategy } from './coverageQueryStrategies';
import { canonicalizeAffiliateIntakeUrl } from './sourceIntakeUrlSafety';
import { affiliateDiscoveryPolicyKeyForUrl, affiliateDiscoveryUrlKey } from './sourceDiscoveryRules';
import { evaluateAffiliateHtmlQuality, deriveAffiliateHtmlArtifacts } from './affiliateHtmlArtifacts';
import { persistAffiliateSourceIntakeArtifact } from './sourceIntakeArtifacts';
type JsonRecord = Record<string, unknown>;


const DEFAULT_LEASE_MS = 2 * 60 * 60 * 1_000;
const DEFAULT_CAPTURE_RETRY_DELAY_MS = 30 * 60 * 1_000;
const MAX_CAPTURE_ATTEMPTS = 3;
export const AFFILIATE_COVERAGE_STRATEGY_VERSION = 1;

const CAPTURE_RETRY_REASON_CODES = new Set([
  'EVIDENCE_SIZE_LIMIT',
  'HTTP_429',
  'HTTP_5XX',
  'JAVASCRIPT_RENDER_REQUIRED',
  'NETWORK_ERROR',
  'ROBOTS_EVIDENCE_UNAVAILABLE',
  'STORED_HTML_AVAILABLE',
  'TLS_ERROR',
  'TRANSIENT_ACCESS_FAILURE',
]);

const SOURCE_EXCLUSION_REASON_CODES = new Set([
  'CAPTCHA_REQUIRED',
  'DUPLICATE_CAPTURE_TARGET',
  'EXPLICIT_PROHIBITION',
  'HELDOUT_SOURCE',
  'LOGIN_REQUIRED',
  'RETRY_EXHAUSTED',
  'SOURCE_NOT_FOUND',
  'UNRELATED_SOURCE',
  'UNSUPPORTED_SOURCE',
]);

const HUMAN_DECISION_REASON_CODES = new Set([
  'CONFLICTING_SOURCE_IDENTITY',
  'CONTRADICTORY_EVIDENCE',
  'REPLACEMENT_DOMAIN_APPROVAL',
  'REPLACEMENT_DOMAIN_APPROVAL_REQUIRED',
]);

const coverageDatabaseForClient = (client: any) => ({
  jobs: client.affiliateCoverageAgentJobs,
  campaigns: client.affiliateSourceDiscoveryCampaigns,
  discoveryRuns: client.affiliateSourceDiscoveryRuns,
  discoveryResults: client.affiliateSourceDiscoveryResults,
  intakes: client.affiliateSourceIntakes,
  pages: client.affiliateSourceIntakePages,
  intakeRuns: client.affiliateSourceIntakeRuns,
  artifacts: client.affiliateSourceIntakeArtifacts,
  mappingJobs: client.affiliateSourceMappingJobs,
  policies: client.affiliateSourceDomainPolicies,
  sports: client.sports,
  coverageCities: client.affiliateCoverageCities,
  coverageCells: client.affiliateCoverageCells,
  coverageAssessments: client.affiliateCoverageCellAssessments,
  queryExecutions: client.affiliateSourceDiscoveryQueryExecutions,
  demands: client.affiliateReplenishmentDemands,
  waves: client.affiliateReplenishmentWaves,
});

const coverageDatabase = () => {
  const database = coverageDatabaseForClient(prisma);
  return {
    ...database,
    transaction: (callback: (transactionDatabase: any) => Promise<unknown>) => (
      (prisma as any).$transaction((tx: any) => callback(coverageDatabaseForClient(tx)))
    ),
  };
};

type CoverageDatabase = ReturnType<typeof coverageDatabase>;
type CoverageDependencies = {
  database?: CoverageDatabase;
  now?: () => Date;
  createIdentifier?: () => string;
  queueCampaignRun?: typeof queueAffiliateSourceDiscoveryRun;
  persistArtifact?: typeof persistAffiliateSourceIntakeArtifact;
};

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const failedPageCount = (summary: unknown): number => {
  const pages = recordValue(summary).failedPages;
  return Array.isArray(pages) ? pages.length : 0;
};

const hasUsefulPartialFailure = (run: any): boolean => (
  run.status === 'PARTIAL' && failedPageCount(run.summary) > 0
);

const resultReasonCodes = (value: unknown): string[] => {
  const codes = recordValue(value).reasonCodes;
  return Array.isArray(codes)
    ? codes.filter((code): code is string => typeof code === 'string')
    : [];
};

const resultSummary = (value: unknown): string => stringValue(recordValue(value).summary) ?? '';

const hasReasonCode = (codes: string[], allowed: Set<string>): boolean => (
  codes.some((code) => allowed.has(code))
);

const discoveryResultNeedsPipelineResolution = (result: any): boolean => (
  result.status === 'NEW'
  && !result.matchingIntakeId
  && !result.matchingSourceId
  && !result.matchingOrganizationId
  && (
    resultReasonCodes(result).includes('AUTO_PROMOTION_ELIGIBLE')
    || recordValue(result.reasonDetails).autoPromotionEligible === true
  )
);

const captureTargetKeyForUrl = (value: unknown, intakeId: string): string => {
  const url = stringValue(value);
  if (!url) return `intake:${intakeId}`;
  try {
    const canonicalUrl = canonicalizeAffiliateIntakeUrl(url);
    const parsed = new URL(canonicalUrl);
    const normalizedTarget = [
      affiliateDiscoveryPolicyKeyForUrl(canonicalUrl),
      parsed.pathname.replace(/\/$/, '') || '/',
      parsed.search,
    ].join('|');
    return `url:${affiliateDiscoveryUrlKey(normalizedTarget)}`;
  } catch {
    return `intake:${intakeId}`;
  }
};

const retryAtForAttempt = (now: Date, attemptCount: number): Date => {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 5));
  return new Date(now.getTime() + DEFAULT_CAPTURE_RETRY_DELAY_MS * (2 ** exponent));
};

const marketSubjectKey = (campaignId: string): string => [
  campaignId,
  `query-v${US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION}`,
  `coverage-v${AFFILIATE_COVERAGE_STRATEGY_VERSION}`,
].join(':');

export const classifyLegacyAffiliateCoverageHumanReview = (job: any): {
  status: 'EXCLUDED' | 'HUMAN_REVIEW_REQUIRED' | 'RETRY_SCHEDULED' | 'WAITING_FOR_PIPELINE';
  decision: 'HUMAN_REVIEW_REQUIRED' | 'RETRY_LATER' | 'SOURCE_EXCLUDED' | 'WAITING_FOR_PIPELINE';
  reasonCodes: string[];
} => {
  const existingCodes = resultReasonCodes(job.result);
  const summary = (
    resultSummary(job.result)
    || stringValue(job.errorMessage)
    || ''
  ).toLowerCase();
  if (job.subjectType === 'MARKET_COVERAGE') {
    return {
      status: 'WAITING_FOR_PIPELINE',
      decision: 'WAITING_FOR_PIPELINE',
      reasonCodes: Array.from(new Set([...existingCodes, 'UNRESOLVED_PIPELINE_LEADS'])),
    };
  }
  if (
    hasReasonCode(existingCodes, HUMAN_DECISION_REASON_CODES)
    || /conflicting (?:source |organization )?identity|contradictory evidence|replacement domain/.test(summary)
  ) {
    return {
      status: 'HUMAN_REVIEW_REQUIRED',
      decision: 'HUMAN_REVIEW_REQUIRED',
      reasonCodes: Array.from(new Set([...existingCodes, 'CONFLICTING_SOURCE_IDENTITY'])),
    };
  }
  const explicitProhibition = !/(?:no|without) explicit (?:robots )?prohibition/.test(summary)
    && /(?:robots(?:\.txt)? (?:explicitly )?(?:disallows?|prohibits?)\b|explicit (?:robots )?prohibition (?:exists|was found|is present)|policy prohibits?\b)/.test(summary);
  const exclusionCode = /(?:requires? (?:a )?(?:log[ -]?in|sign[ -]?in|authentication|credentials?)|log[ -]?in[ -]?only|credential[ -]?gated|members only)/.test(summary)
    ? 'LOGIN_REQUIRED'
    : /(?:captcha (?:required|challenge|present)|requires? (?:a )?captcha)/.test(summary)
      ? 'CAPTCHA_REQUIRED'
      : explicitProhibition
        ? 'EXPLICIT_PROHIBITION'
        : /held[ -]?out/.test(summary)
          ? 'HELDOUT_SOURCE'
          : /(?:404|not found|no longer exists|stale source|missing website)/.test(summary)
            ? 'SOURCE_NOT_FOUND'
            : /(?:unrelated source|not a sports|unsupported source)/.test(summary)
              ? 'UNRELATED_SOURCE'
              : null;
  if (exclusionCode || hasReasonCode(existingCodes, SOURCE_EXCLUSION_REASON_CODES)) {
    return {
      status: 'EXCLUDED',
      decision: 'SOURCE_EXCLUDED',
      reasonCodes: Array.from(new Set([...existingCodes, exclusionCode ?? 'UNSUPPORTED_SOURCE'])),
    };
  }
  if (Number(job.attemptCount ?? 0) >= MAX_CAPTURE_ATTEMPTS) {
    return {
      status: 'EXCLUDED',
      decision: 'SOURCE_EXCLUDED',
      reasonCodes: Array.from(new Set([...existingCodes, 'RETRY_EXHAUSTED'])),
    };
  }
  const retryCode = /exceed(?:s|ed)?.*(?:artifact|byte|size)|too large/.test(summary)
    ? 'EVIDENCE_SIZE_LIMIT'
    : /stored (?:provider )?(?:html|evidence)|existing (?:html|evidence)/.test(summary)
      ? 'STORED_HTML_AVAILABLE'
      : /(?:tls|certificate|ssl)/.test(summary)
        ? 'TLS_ERROR'
        : /robots/.test(summary)
          ? 'ROBOTS_EVIDENCE_UNAVAILABLE'
          : /javascript|client-side|rendered/.test(summary)
            ? 'JAVASCRIPT_RENDER_REQUIRED'
            : /(?:network|timeout|timed out|connection reset|http 5\d\d|http 429|rate limit|access failure)/.test(summary)
              ? 'TRANSIENT_ACCESS_FAILURE'
              : 'TRANSIENT_ACCESS_FAILURE';
  return {
    status: 'RETRY_SCHEDULED',
    decision: 'RETRY_LATER',
    reasonCodes: Array.from(new Set([...existingCodes, retryCode])),
  };
};

const currentMarketUnresolvedLeadCount = async (
  database: CoverageDatabase,
  job: any,
): Promise<number> => {
  const campaignId = stringValue(recordValue(job.context).campaignId);
  if (!campaignId) return 0;
  const parent = await database.campaigns.findUnique({ where: { id: campaignId } });
  if (!parent) return 0;
  const neighbors = await database.campaigns.findMany({
    where: { region: parent.region },
    select: { id: true, metadata: true },
  });
  const campaignIds = [
    campaignId,
    ...neighbors.flatMap((campaign: any) => (
      stringValue(recordValue(campaign.metadata).coverageParentCampaignId) === campaignId
        ? [campaign.id]
        : []
    )),
  ];
  const results = await database.discoveryResults.findMany({
    where: { campaignId: { in: Array.from(new Set(campaignIds)) } },
    select: {
      status: true,
      reasonCodes: true,
      reasonDetails: true,
      matchingIntakeId: true,
      matchingSourceId: true,
      matchingOrganizationId: true,
    },
  });
  return results.filter(discoveryResultNeedsPipelineResolution).length;
};
const jobIsClaimable = (job: any, now: Date): boolean => (
  job.status === 'QUEUED'
  || (job.status === 'CLAIMED' && job.leaseExpiresAt instanceof Date && job.leaseExpiresAt < now)
);
const claimGenerationDate = (generation: AffiliateCoverageClaimGeneration): Date => {
  const claimedAt = new Date(generation.claimedAt);
  if (Number.isNaN(claimedAt.getTime())) throw new Error('Coverage claim generation timestamp is invalid.');
  return claimedAt;
};

const coverageClaimWhere = (
  generation: AffiliateCoverageClaimGeneration,
  now: Date,
) => ({
  id: generation.jobId,
  status: 'CLAIMED',
  workerId: generation.agentId,
  claimedAt: claimGenerationDate(generation),
  leaseExpiresAt: { gte: now },
});

const assertActiveClaim = (
  job: any,
  generation: AffiliateCoverageClaimGeneration,
  now: Date,
): void => {
  affiliateCoverageClaimGenerationSchema.parse(generation);
  if (!job || job.id !== generation.jobId || job.status !== 'CLAIMED' || job.workerId !== generation.agentId) {
    throw new Error('Coverage job is not claimed by this agent generation.');
  }
  if (!(job.claimedAt instanceof Date) || job.claimedAt.getTime() !== claimGenerationDate(generation).getTime()) {
    throw new Error('Coverage job claim generation is stale.');
  }
  if (!(job.leaseExpiresAt instanceof Date) || job.leaseExpiresAt < now) {
    throw new Error('Coverage job lease has expired.');
  }
};

const withCoverageTransaction = async <T>(
  database: CoverageDatabase,
  callback: (transactionDatabase: CoverageDatabase) => Promise<T>,
): Promise<T> => {
  if (database.transaction) return database.transaction(callback) as Promise<T>;
  return callback(database);
};

type CoverageRepairResult = {
  mappingJobId: string;
  coverageJob: unknown;
};

const queueCoverageMappingRepair = async (options: {
  database: CoverageDatabase;
  intakeId: string;
  job: any;
  result: AffiliateCoverageCompletion;
  now: Date;
  createIdentifier: () => string;
  finalData: Record<string, unknown>;
}): Promise<CoverageRepairResult> => {
  const { database, intakeId, job, result, now, createIdentifier, finalData } = options;
  const intake = await database.intakes.findUnique({ where: { id: intakeId } });
  const supplySourceId = stringValue(intake?.supplySourceId);
  const pending = await database.mappingJobs.findFirst({
    where: { intakeId, status: { in: ['QUEUED', 'CLAIMED'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (
    pending?.status === 'CLAIMED'
    && pending.leaseExpiresAt instanceof Date
    && pending.leaseExpiresAt >= now
  ) {
    throw new Error('The mapping repair job is already claimed by a mapper. Retry coverage completion after its lease ends.');
  }
  const repairEntry = {
    queuedAt: now.toISOString(),
    repairReason: result.summary,
    repairReasons: result.reasonCodes.length ? result.reasonCodes : ['COVERAGE_CAPTURE_REPAIR'],
    coverageJobId: job.id,
    claimGeneration: result.claimGeneration,
    priorMappingStatus: pending?.status ?? null,
    priorMappingClaimGeneration: pending?.status === 'CLAIMED'
      ? {
          workerId: pending.workerId ?? null,
          claimedAt: pending.claimedAt instanceof Date ? pending.claimedAt.toISOString() : null,
          leaseExpiresAt: pending.leaseExpiresAt instanceof Date ? pending.leaseExpiresAt.toISOString() : null,
        }
      : null,
  };
  return withCoverageTransaction(database, async (transactionDatabase) => {
    const claim = await transactionDatabase.jobs.updateMany({
      where: coverageClaimWhere(result.claimGeneration, now),
      data: { errorMessage: null },
    });
    if (claim.count !== 1) throw new Error('STALE_COVERAGE_CLAIM');

    let mappingJobId: string;
    if (pending) {
      const envelope = recordValue(pending.resultSummary);
      const nextEnvelope = appendAffiliateMappingHistory({
        envelope: {
          ...envelope,
          ...(
            Object.prototype.hasOwnProperty.call(envelope, 'mappingRepairHistory')
              ? {}
              : { mappingRepairHistory: [] }
          ),
        },
        field: 'mappingRepairHistory',
        entry: {
          ...repairEntry,
          archivedPriorResultSummary: archiveAffiliateMappingResultEnvelope(envelope),
        },
      });
      const where = pending.status === 'QUEUED'
        ? { id: pending.id, status: 'QUEUED' }
        : {
            id: pending.id,
            status: 'CLAIMED',
            workerId: pending.workerId,
            claimedAt: pending.claimedAt,
            leaseExpiresAt: { lt: now },
          };
      const updated = await transactionDatabase.mappingJobs.updateMany({
        where,
        data: {
          status: 'QUEUED',
          claimedAt: null,
          leaseExpiresAt: null,
          workerId: null,
          branch: null,
          commit: null,
          errorMessage: null,
          finishedAt: null,
          resultSummary: nextEnvelope,
        },
      });
      if (updated.count !== 1) throw new Error('SKIPPED_CONCURRENT_MAPPING_RECLAIM');
      mappingJobId = pending.id;
    } else {
      try {
        const created = await transactionDatabase.mappingJobs.create({
          data: {
            id: createIdentifier(),
            intakeId,
            supplySourceId,
            status: 'QUEUED',
            resultSummary: {
              mappingRepairHistory: [{
                ...repairEntry,
                archivedPriorResultSummary: null,
              }],
            },
          },
        });
        mappingJobId = created.id;
      } catch {
        throw new Error('SKIPPED_CONCURRENT_MAPPING_INSERT');
      }
    }
    await transactionDatabase.intakes.update({
      where: { id: intakeId },
      data: { status: 'READY_FOR_MAPPING' },
    });
    const completed = await transactionDatabase.jobs.updateMany({
      where: coverageClaimWhere(result.claimGeneration, now),
      data: {
        ...finalData,
        result: { ...(finalData.result as Record<string, unknown>), repairMappingJobId: mappingJobId },
      },
    });
    if (completed.count !== 1) throw new Error('STALE_COVERAGE_CLAIM');
    const coverageJob = await transactionDatabase.jobs.findUnique({ where: { id: job.id } });
    return { mappingJobId, coverageJob };
  });
};
const marketCoveragePriority = async (
  database: CoverageDatabase,
  campaign: any,
  now: Date,
) => {
  if (!database.coverageCells?.findMany) return null;
  const metadata = recordValue(campaign.metadata);
  const marketKey = stringValue(metadata.marketKey);
  if (!marketKey) return null;
  const cells = await database.coverageCells.findMany({
    where: { marketKey },
    select: {
      id: true,
      cohortPriority: true,
      priorityScore: true,
      priorityRank: true,
      searchStatus: true,
      coverageStatus: true,
      nextReviewAt: true,
      unresolvedLeadCount: true,
    },
  });
  const eligible = cells.filter((cell: any) => (
    ['READY', 'STALE'].includes(String(cell.searchStatus))
    && String(cell.coverageStatus) !== 'COVERED'
    && (!(cell.nextReviewAt instanceof Date) || cell.nextReviewAt <= now)
    && Number(cell.unresolvedLeadCount ?? 0) === 0
  )).sort((left: any, right: any) => (
    Number(left.cohortPriority ?? 2) - Number(right.cohortPriority ?? 2)
    || Number(right.priorityScore ?? 0) - Number(left.priorityScore ?? 0)
    || Number(left.priorityRank ?? 2_147_483_647) - Number(right.priorityRank ?? 2_147_483_647)
    || String(left.id).localeCompare(String(right.id))
  ));
  const highest = eligible[0] ?? null;
  return {
    cohortPriority: Number(highest?.cohortPriority ?? 2),
    priorityScore: Number(highest?.priorityScore ?? 0),
    priorityRank: Number(highest?.priorityRank ?? 2_147_483_647),
    isBlockingCoverage: false,
    coverageCellIds: eligible.slice(0, 50).map((cell: any) => cell.id),
  };
};


export const reconcileAffiliateCoverageJobs = async (
  options: { now?: Date } = {},
  dependencies: CoverageDependencies = {},
) => {
  const database = dependencies.database ?? coverageDatabase();
  const now = options.now ?? dependencies.now?.() ?? new Date();
  const createIdentifier = dependencies.createIdentifier ?? createId;
  const existingJobs = await database.jobs.findMany({ orderBy: { createdAt: 'asc' } });
  let legacyHumanReviewsReclassified = 0;
  let legacyRetriesScheduled = 0;
  let waitingJobsRequeued = 0;
  let retryJobsRequeued = 0;
  let sourcesExcluded = 0;
  const coverageCellSummary = !dependencies.database
    && database.coverageCities?.upsert
    && database.coverageCells?.upsert
    ? await reconcileAffiliateCoverageCells(
      { now },
      {
        database: { cities: database.coverageCities, cells: database.coverageCells },
        now,
      } as any,
    )
    : null;
  for (const job of existingJobs) {
    if (job.status === 'HUMAN_REVIEW_REQUIRED') {
      const classification = classifyLegacyAffiliateCoverageHumanReview(job);
      if (classification.status === 'HUMAN_REVIEW_REQUIRED') continue;
      let status: string = classification.status;
      if (
        status === 'WAITING_FOR_PIPELINE'
        && await currentMarketUnresolvedLeadCount(database, job) === 0
      ) {
        status = 'QUEUED';
        waitingJobsRequeued += 1;
      } else if (status === 'RETRY_SCHEDULED') {
        legacyRetriesScheduled += 1;
      } else if (status === 'EXCLUDED') {
        sourcesExcluded += 1;
      }
      await database.jobs.update({
        where: { id: job.id },
        data: {
          status,
          result: {
            ...recordValue(job.result),
            decision: classification.decision,
            reasonCodes: classification.reasonCodes,
            reclassifiedAt: now.toISOString(),
            ...(status === 'RETRY_SCHEDULED' ? {
              retryAt: retryAtForAttempt(now, Number(job.attemptCount ?? 1)).toISOString(),
            } : {}),
          },
          errorMessage: null,
          finishedAt: status === 'EXCLUDED' ? now : null,
          claimedAt: null,
          workerId: null,
          leaseExpiresAt: null,
        },
      });
      legacyHumanReviewsReclassified += 1;
      continue;
    }
    if (job.status === 'WAITING_FOR_PIPELINE') {
      if (await currentMarketUnresolvedLeadCount(database, job) === 0) {
        await database.jobs.update({
          where: { id: job.id },
          data: {
            status: 'QUEUED',
            errorMessage: null,
            finishedAt: null,
            claimedAt: null,
            workerId: null,
            leaseExpiresAt: null,
          },
        });
        waitingJobsRequeued += 1;
      }
      continue;
    }
    if (job.status === 'RETRY_SCHEDULED') {
      const retryAtText = stringValue(recordValue(job.result).retryAt);
      const retryAt = retryAtText ? new Date(retryAtText) : now;
      if (!Number.isNaN(retryAt.getTime()) && retryAt <= now) {
        await database.jobs.update({
          where: { id: job.id },
          data: {
            status: 'QUEUED',
            errorMessage: null,
            finishedAt: null,
            claimedAt: null,
            workerId: null,
            leaseExpiresAt: null,
          },
        });
        retryJobsRequeued += 1;
      }
    }
  }
  const campaigns = await database.campaigns.findMany({ orderBy: { createdAt: 'asc' } });
  const templateCampaigns = campaigns.filter((campaign: any) => recordValue(campaign.metadata).template === true);
  let marketJobsCreated = 0;
  for (const campaign of templateCampaigns) {
    const priority = await marketCoveragePriority(database, campaign, now);
    const existing = await database.jobs.findUnique({
      where: {
        subjectType_subjectKey: {
          subjectType: 'MARKET_COVERAGE',
          subjectKey: marketSubjectKey(campaign.id),
        },
      },
    });
    const context = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      region: campaign.region,
      queryStrategyVersion: US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
      coverageStrategyVersion: AFFILIATE_COVERAGE_STRATEGY_VERSION,
      ...(priority ? { coverageCellIds: priority.coverageCellIds } : {}),
    };
    if (existing) {
      if (
        priority
        && !(existing.status === 'CLAIMED' && existing.leaseExpiresAt instanceof Date && existing.leaseExpiresAt >= now)
      ) {
        await database.jobs.update({
          where: { id: existing.id },
          data: {
            cohortPriority: priority.cohortPriority,
            priorityScore: priority.priorityScore,
            priorityRank: priority.priorityRank,
            isBlockingCoverage: priority.isBlockingCoverage,
            context: { ...recordValue(existing.context), ...context },
            ...(existing.status === 'COMPLETED' ? { status: 'QUEUED', finishedAt: null } : {}),
          },
        });
      }
      continue;
    }
    await database.jobs.create({
      data: {
        id: createIdentifier(),
        subjectType: 'MARKET_COVERAGE',
        subjectKey: marketSubjectKey(campaign.id),
        status: 'QUEUED',
        cohortPriority: priority?.cohortPriority ?? 2,
        priorityScore: priority?.priorityScore ?? 0,
        priorityRank: priority?.priorityRank ?? 2_147_483_647,
        isBlockingCoverage: priority?.isBlockingCoverage ?? false,
        context,
      },
    });
    marketJobsCreated += 1;
  }

  const intakeRuns = await database.intakeRuns.findMany({
    orderBy: [{ intakeId: 'asc' }, { createdAt: 'desc' }],
  });
  const latestByIntake = new Map<string, any>();
  for (const run of intakeRuns) {
    if (!latestByIntake.has(run.intakeId)) latestByIntake.set(run.intakeId, run);
  }
  const captureJobs = existingJobs
    .filter((job: any) => job.subjectType === 'FAILED_INTAKE_CAPTURE')
    .sort((left: any, right: any) => left.createdAt.getTime() - right.createdAt.getTime());
  const intakeIds = Array.from(new Set([
    ...latestByIntake.keys(),
    ...captureJobs.flatMap((job: any) => {
      const intakeId = stringValue(recordValue(job.context).intakeId);
      return intakeId ? [intakeId] : [];
    }),
  ]));
  const intakeRows = intakeIds.length
    ? await database.intakes.findMany({
        where: { id: { in: intakeIds } },
        select: { id: true, baseUrl: true },
      })
    : [];
  const intakeById = new Map<string, any>(
    intakeRows.map((intake: any) => [intake.id, intake]),
  );
  const jobsByCaptureTarget = new Map<string, any>();
  let duplicateCaptureJobsExcluded = 0;
  for (const job of captureJobs) {
    const context = recordValue(job.context);
    const intakeId = stringValue(context.intakeId);
    if (!intakeId) continue;
    const targetKey = stringValue(context.captureTargetKey)
      ?? captureTargetKeyForUrl(intakeById.get(intakeId)?.baseUrl, intakeId);
    const representative = jobsByCaptureTarget.get(targetKey);
    if (!representative) {
      jobsByCaptureTarget.set(targetKey, job);
      if (!stringValue(context.captureTargetKey)) {
        await database.jobs.update({
          where: { id: job.id },
          data: { context: { ...context, captureTargetKey: targetKey } },
        });
      }
      continue;
    }
    if (job.status === 'CLAIMED' || job.status === 'EXCLUDED') continue;
    await database.jobs.update({
      where: { id: job.id },
      data: {
        status: 'EXCLUDED',
        result: {
          schemaVersion: 1,
          jobId: job.id,
          agentId: 'coverage-reconcile',
          decision: 'SOURCE_EXCLUDED',
          summary: `Duplicate failed-capture target already belongs to coverage job ${representative.id}.`,
          campaignIds: [],
          manualRunId: null,
          coverageEvidence: null,
          reasonCodes: ['DUPLICATE_CAPTURE_TARGET'],
          canonicalCoverageJobId: representative.id,
        },
        context: { ...context, captureTargetKey: targetKey },
        errorMessage: null,
        finishedAt: now,
        claimedAt: null,
        workerId: null,
        leaseExpiresAt: null,
      },
    });
    duplicateCaptureJobsExcluded += 1;
  }
  let failedCaptureJobsCreated = 0;
  for (const run of latestByIntake.values()) {
    if (run.status !== 'FAILED' && !hasUsefulPartialFailure(run)) continue;
    const targetKey = captureTargetKeyForUrl(
      intakeById.get(run.intakeId)?.baseUrl,
      run.intakeId,
    );
    const representative = jobsByCaptureTarget.get(targetKey);
    if (representative) {
      const context = recordValue(representative.context);
      if (
        stringValue(context.runId) !== run.id
        && representative.status === 'COMPLETED'
      ) {
        await database.jobs.update({
          where: { id: representative.id },
          data: {
            status: 'QUEUED',
            context: {
              ...context,
              intakeId: run.intakeId,
              runId: run.id,
              runStatus: run.status,
              failedPageCount: failedPageCount(run.summary),
              captureTargetKey: targetKey,
              reconciledAt: now.toISOString(),
            },
            result: null,
            errorMessage: null,
            finishedAt: null,
            claimedAt: null,
            workerId: null,
            leaseExpiresAt: null,
          },
        });
      }
      continue;
    }
    const existing = await database.jobs.findUnique({
      where: {
        subjectType_subjectKey: {
          subjectType: 'FAILED_INTAKE_CAPTURE',
          subjectKey: targetKey,
        },
      },
    });
    if (existing) continue;
    const provenance = recordValue(run.summary);
    const provenCohortPriority = Number(provenance.cohortPriority);
    const provenPriorityScore = Number(provenance.priorityScore);
    const provenPriorityRank = Number(provenance.priorityRank);
    const hasProvenPriority = Number.isFinite(provenCohortPriority)
      && Number.isFinite(provenPriorityScore)
      && Number.isFinite(provenPriorityRank);
    await database.jobs.create({
      data: {
        id: createIdentifier(),
        subjectType: 'FAILED_INTAKE_CAPTURE',
        subjectKey: targetKey,
        status: 'QUEUED',
        cohortPriority: hasProvenPriority ? provenCohortPriority : 2,
        priorityScore: hasProvenPriority ? provenPriorityScore : 0,
        priorityRank: hasProvenPriority ? provenPriorityRank : 2_147_483_647,
        isBlockingCoverage: Boolean(provenance.coverageCellId),
        context: {
          intakeId: run.intakeId,
          runId: run.id,
          runStatus: run.status,
          failedPageCount: failedPageCount(run.summary),
          captureTargetKey: targetKey,
          ...(stringValue(provenance.coverageCellId) ? { coverageCellId: provenance.coverageCellId } : {}),
          reconciledAt: now.toISOString(),
        },
      },
    });
    jobsByCaptureTarget.set(targetKey, { id: run.id, subjectKey: targetKey });
    failedCaptureJobsCreated += 1;
  }
  return {
    marketJobsCreated,
    failedCaptureJobsCreated,
    totalCreated: marketJobsCreated + failedCaptureJobsCreated,
    legacyHumanReviewsReclassified,
    legacyRetriesScheduled,
    waitingJobsRequeued,
    retryJobsRequeued,
    sourcesExcluded,
    duplicateCaptureJobsExcluded,
    coverageCellSummary,
  };
};

export const summarizeAffiliateCoverageQueue = async (
  options: { now?: Date } = {},
  dependencies: CoverageDependencies = {},
) => {
  const database = dependencies.database ?? coverageDatabase();
  const now = options.now ?? dependencies.now?.() ?? new Date();
  const jobs = await database.jobs.findMany({ orderBy: { createdAt: 'asc' } });
  const statusCounts = jobs.reduce((counts: Record<string, number>, job: any) => ({
    ...counts,
    [job.status]: (counts[job.status] ?? 0) + 1,
  }), {});
  const typeCounts = jobs.reduce((counts: Record<string, number>, job: any) => ({
    ...counts,
    [job.subjectType]: (counts[job.subjectType] ?? 0) + 1,
  }), {});
  const coverageCells = database.coverageCells?.findMany
    ? await database.coverageCells.findMany({ select: { cohort: true, coverageStatus: true, searchStatus: true, nextReviewAt: true } })
    : [];
  const cohortCounts = coverageCells.reduce((counts: Record<string, number>, cell: any) => ({
    ...counts,
    [cell.cohort]: (counts[cell.cohort] ?? 0) + 1,
  }), {});
  const coverageStatusCounts = coverageCells.reduce((counts: Record<string, number>, cell: any) => ({
    ...counts,
    [cell.coverageStatus]: (counts[cell.coverageStatus] ?? 0) + 1,
  }), {});
  const searchStatusCounts = coverageCells.reduce((counts: Record<string, number>, cell: any) => ({
    ...counts,
    [cell.searchStatus]: (counts[cell.searchStatus] ?? 0) + 1,
  }), {});
  return {
    totalJobs: jobs.length,
    claimableJobs: jobs.filter((job: any) => jobIsClaimable(job, now)).length,
    activeLeases: jobs.filter((job: any) => (
      job.status === 'CLAIMED'
      && job.leaseExpiresAt instanceof Date
      && job.leaseExpiresAt >= now
    )).length,
    claimedWithoutLease: jobs.filter((job: any) => (
      job.status === 'CLAIMED' && !(job.leaseExpiresAt instanceof Date)
    )).length,
    statusCounts,
    typeCounts,
    cohortCounts,
    coverageStatusCounts,
    searchStatusCounts,
    saturatedReviewDates: coverageCells
      .filter((cell: any) => cell.searchStatus === 'SATURATED' && cell.nextReviewAt)
      .map((cell: any) => cell.nextReviewAt),
  };
};

const marketCoverageContext = async (database: CoverageDatabase, job: any) => {
  const campaignId = stringValue(recordValue(job.context).campaignId);
  if (!campaignId) throw new Error('Coverage market job has no campaign id.');
  const campaign = await database.campaigns.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Coverage campaign was not found.');
  const [sports, neighboringCampaigns] = await Promise.all([
    database.sports.findMany({
      where: { id: { in: campaign.sportIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    database.campaigns.findMany({
      where: { region: campaign.region },
      select: {
        id: true,
        name: true,
        status: true,
        sportIds: true,
        sourceTypeHints: true,
        coverageFingerprint: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const focusedCampaignIds = neighboringCampaigns
    .filter((neighbor: any) => (
      stringValue(recordValue(neighbor.metadata).coverageParentCampaignId) === campaignId
    ))
    .map((neighbor: any) => neighbor.id);
  const assessedCampaignIds = Array.from(new Set([campaignId, ...focusedCampaignIds]));
  const [recentRuns, results] = await Promise.all([
    database.discoveryRuns.findMany({
      where: { campaignId: { in: assessedCampaignIds } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    database.discoveryResults.findMany({
      where: { campaignId: { in: assessedCampaignIds } },
      select: {
        campaignId: true,
        status: true,
        sourceTypeHints: true,
        sportHints: true,
        score: true,
        policyKey: true,
        reasonCodes: true,
        reasonDetails: true,
        matchingIntakeId: true,
        matchingSourceId: true,
        matchingOrganizationId: true,
      },
    }),
  ]);
  const statusCounts: Record<string, number> = {};
  const sourceTypeCounts: Record<string, number> = {};
  const sportCounts: Record<string, number> = {};
  const canonicalDomains = new Set<string>();
  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    for (const type of result.sourceTypeHints) sourceTypeCounts[type] = (sourceTypeCounts[type] ?? 0) + 1;
    for (const sport of result.sportHints) sportCounts[sport] = (sportCounts[sport] ?? 0) + 1;
    canonicalDomains.add(result.policyKey);
  }
  return {
    campaign,
    sports,
    assessedCampaignIds,
    recentRuns,
    resultSummary: {
      total: results.length,
      uniquePolicyKeys: canonicalDomains.size,
      statusCounts,
      sourceTypeCounts,
      sportCounts,
      unresolvedLeadCount: results.filter(discoveryResultNeedsPipelineResolution).length,
    },
    neighboringCampaigns,
  };
};

const failedCaptureContext = async (database: CoverageDatabase, job: any) => {
  const base = recordValue(job.context);
  const intakeId = stringValue(base.intakeId);
  const runId = stringValue(base.runId) ?? job.subjectKey;
  if (!intakeId) throw new Error('Coverage capture job has no intake id.');
  const [intake, run, pages, artifacts] = await Promise.all([
    database.intakes.findUnique({ where: { id: intakeId } }),
    database.intakeRuns.findUnique({ where: { id: runId } }),
    database.pages.findMany({ where: { intakeId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] }),
    database.artifacts.findMany({
      where: { intakeId, runId },
      select: {
        id: true,
        pageId: true,
        kind: true,
        sourceUrl: true,
        finalUrl: true,
        provider: true,
        httpStatus: true,
        contentHash: true,
        mimeType: true,
        sizeBytes: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  if (!intake || !run) throw new Error('Coverage capture intake or run was not found.');
  return { intake, run, pages, artifacts };
};

const supplyReplenishmentContext = async (database: CoverageDatabase, job: any) => {
  const demandId = stringValue(recordValue(job.context).demandId) ?? job.subjectKey;
  const demand = await database.demands.findUnique({ where: { id: demandId } });
  if (!demand) throw new Error('Supply replenishment demand was not found.');
  const wave = database.waves?.findFirst
    ? await database.waves.findFirst({
      where: { coveragePlanningJobId: job.id },
      orderBy: { createdAt: 'desc' },
    })
    : null;
  return { demand, wave };
};

const contextForAffiliateCoverageJob = async (database: CoverageDatabase, job: any) => {
  if (job.subjectType === 'MARKET_COVERAGE') return marketCoverageContext(database, job);
  if (job.subjectType === 'SUPPLY_REPLENISHMENT') return supplyReplenishmentContext(database, job);
  return failedCaptureContext(database, job);
};

export const claimNextAffiliateCoverageJob = async (
  options: { agentId: string; now?: Date; leaseMs?: number },
  dependencies: CoverageDependencies = {},
) => {
  const agentId = options.agentId.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(agentId)) {
    throw new Error('Coverage agent id is invalid.');
  }
  const database = dependencies.database ?? coverageDatabase();
  const now = options.now ?? dependencies.now?.() ?? new Date();
  const leaseMs = Math.max(60_000, Math.min(options.leaseMs ?? DEFAULT_LEASE_MS, 24 * 60 * 60 * 1_000));
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const active = await database.jobs.findFirst({
    where: {
      status: 'CLAIMED',
      workerId: agentId,
      leaseExpiresAt: { gte: now },
    },
    orderBy: { claimedAt: 'asc' },
  });
  if (active) {
    const renewed = await database.jobs.updateMany({
      where: {
        id: active.id,
        status: 'CLAIMED',
        workerId: agentId,
        leaseExpiresAt: { gte: now },
      },
      data: { leaseExpiresAt },
    });
    if (renewed.count === 1) {
      const claimedAt = active.claimedAt instanceof Date ? active.claimedAt : now;
      const claimGeneration = {
        jobId: active.id,
        agentId,
        claimedAt: claimedAt.toISOString(),
      };
      return {
        job: { ...active, leaseExpiresAt, claimedAt },
        claimGeneration,
        resumed: true,
        context: await contextForAffiliateCoverageJob(database, active),
      };
    }
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const job = await database.jobs.findFirst({
      where: {
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [
        { cohortPriority: 'asc' },
        { isBlockingCoverage: 'desc' },
        { priorityScore: 'desc' },
        { priorityRank: 'asc' },
        { subjectType: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    if (!job) return null;
    const claimed = await database.jobs.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'CLAIMED',
        claimedAt: now,
        leaseExpiresAt,
        workerId: agentId,
        attemptCount: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count !== 1) continue;
    const claimedJob = { ...job, status: 'CLAIMED', claimedAt: now, leaseExpiresAt, workerId: agentId };
    const claimGeneration = {
      jobId: job.id,
      agentId,
      claimedAt: now.toISOString(),
    };
    return {
      job: claimedJob,
      claimGeneration,
      resumed: false,
      context: await contextForAffiliateCoverageJob(database, claimedJob),
    };
  }
  return null;
};

const normalizedFingerprint = (proposal: AffiliateCoverageCampaignProposal, parentCampaignId: string): string => (
  createHash('sha256').update(JSON.stringify({
    parentCampaignId,
    region: proposal.region.trim().toLowerCase(),
    location: proposal.location?.trim().toLowerCase() ?? null,
    sportIds: [...new Set(proposal.sportIds)].sort(),
    sourceTypeHints: [...new Set(proposal.sourceTypeHints)].sort(),
    coverageArchetypes: [...new Set(proposal.coverageArchetypes)].sort(),
    coverageCellIds: [...new Set(proposal.coverageCellIds)].sort(),
    strategyKeys: [...new Set(proposal.strategyKeys)].sort(),
    queryStrategyVersion: proposal.strategyKeys.length
      ? AFFILIATE_COVERAGE_QUERY_STRATEGY_VERSION
      : US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
  })).digest('hex')
);

export const createAffiliateCoverageCampaign = async (
  input: AffiliateCoverageCampaignProposal,
  dependencies: CoverageDependencies = {},
) => {
  const proposal = affiliateCoverageCampaignProposalSchema.parse(input);
  if (proposal.coverageCellIds.length > 0 && proposal.strategyKeys.length === 0) {
    throw new Error('Focused coverage campaigns require at least one governed strategy key.');
  }
  if (proposal.strategyKeys.length > 0 && proposal.coverageCellIds.length === 0) {
    throw new Error('Governed strategy keys require focused coverage cells.');
  }
  if (new Set(proposal.coverageCellIds).size !== proposal.coverageCellIds.length) {
    throw new Error('Focused coverage cell IDs must be unique.');
  }
  if (new Set(proposal.strategyKeys).size !== proposal.strategyKeys.length) {
    throw new Error('Governed strategy keys must be unique.');
  }
  for (const strategyKey of proposal.strategyKeys) {
    if (!getAffiliateCoverageQueryStrategy(strategyKey)) {
      throw new Error(`Unknown governed coverage strategy ${strategyKey}.`);
    }
  }
  const database = dependencies.database ?? coverageDatabase();
  const now = dependencies.now?.() ?? new Date();
  const job = await database.jobs.findUnique({ where: { id: proposal.jobId } });
  assertActiveClaim(job, proposal.claimGeneration, now);
  const campaignClaim = await database.jobs.updateMany({
    where: coverageClaimWhere(proposal.claimGeneration, now),
    data: { errorMessage: null },
  });
  if (campaignClaim.count !== 1) throw new Error('STALE_COVERAGE_CLAIM');
  const isSupplyReplenishment = job.subjectType === 'SUPPLY_REPLENISHMENT';
  if (job.subjectType !== 'MARKET_COVERAGE' && !isSupplyReplenishment) {
    throw new Error('Only a market coverage or supply replenishment job can create discovery campaigns.');
  }
  const replenishmentDemand = isSupplyReplenishment
    ? await database.demands.findUnique({
      where: { id: stringValue(recordValue(job.context).demandId) ?? job.subjectKey },
    })
    : null;
  const replenishmentWave = isSupplyReplenishment && database.waves?.findFirst
    ? await database.waves.findFirst({
      where: {
        coveragePlanningJobId: job.id,
        demandId: replenishmentDemand?.id ?? job.subjectKey,
      },
      orderBy: { createdAt: 'desc' },
    })
    : null;
  if (isSupplyReplenishment && !replenishmentDemand) {
    throw new Error('Supply replenishment demand was not found.');
  }
  const parentCampaignId = stringValue(recordValue(job.context).campaignId)
    ?? (replenishmentDemand ? `demand:${replenishmentDemand.id}` : null);
  if (!parentCampaignId) throw new Error('Coverage job has no parent campaign or replenishment demand.');
  const parent = parentCampaignId.startsWith('demand:')
    ? null
    : await database.campaigns.findUnique({ where: { id: parentCampaignId } });
  if (!parent && !replenishmentDemand) throw new Error('Parent discovery campaign was not found.');
  const parentMetadata = recordValue(parent?.metadata);
  const coveredCities = Array.isArray(parentMetadata.coveredCities) ? parentMetadata.coveredCities : [];
  const allowedRegions = new Set<string>([
    stringValue(parentMetadata.anchorState),
    ...coveredCities.map((entry: unknown) => stringValue(recordValue(entry).state)),
    stringValue(parent?.location),
    stringValue(parent?.region),
  ].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()));
  const proposedScope = `${proposal.region} ${proposal.location ?? ''}`.toLowerCase();
  if (parent && !Array.from(allowedRegions).some((value) => proposedScope.includes(value))) {
    throw new Error('Coverage campaign region must remain within the claimed market or state.');
  }
  const sportIds = [...new Set(proposal.sportIds)];
  if (parent && sportIds.some((sportId) => !parent.sportIds.includes(sportId))) {
    throw new Error('Coverage campaign sports must belong to the claimed market campaign.');
  }
  if (replenishmentDemand && !sportIds.includes(replenishmentDemand.sportId)) {
    throw new Error('Coverage campaign sports must include the replenishment demand sport.');
  }
  if (
    replenishmentDemand
    && replenishmentDemand.sourceProfile
    && proposal.sourceTypeHints.length > 0
    && !proposal.sourceTypeHints.includes(replenishmentDemand.sourceProfile)
  ) {
    throw new Error('Coverage campaign source types must include the replenishment demand profile.');
  }
  const sportCount = await database.sports.count({ where: { id: { in: sportIds } } });
  if (sportCount !== sportIds.length) throw new Error('One or more coverage campaign sports do not exist.');
  let coverageTargetCells: Array<Record<string, unknown>> = [];
  if (proposal.coverageCellIds.length > 0) {
    if (!database.coverageCells?.findMany || !database.coverageCities?.findMany) {
      throw new Error('Focused coverage requires persisted coverage cells and cities.');
    }
    const cellIds = [...new Set(proposal.coverageCellIds)];
    const cells = await database.coverageCells.findMany({
      where: { id: { in: cellIds } },
      select: {
        id: true,
        cityId: true,
        marketKey: true,
        sportId: true,
        sportName: true,
        profileKey: true,
        searchStatus: true,
        nextReviewAt: true,
      },
    });
    if (cells.length !== cellIds.length) throw new Error('Every proposed coverage cell must exist.');
    const cityIds = [...new Set(cells.map((cell: any) => cell.cityId))];
    const cities = await database.coverageCities.findMany({
      where: { placeGeoid: { in: cityIds }, active: true },
      select: { placeGeoid: true, city: true, state: true, marketKey: true },
    });
    const cityByGeoid = new Map<string, any>(cities.map((city: any) => [city.placeGeoid, city]));
    const coveredCityKeys = new Set(coveredCities.map((entry: unknown) => {
      const value = recordValue(entry);
      return `${stringValue(value.city)?.toLowerCase()}, ${stringValue(value.state)?.toLowerCase()}`;
    }));
    for (const cell of cells) {
      const city = cityByGeoid.get(cell.cityId);
      const profile = getAffiliateCoverageProfile(String(cell.profileKey));
      if (!city || !profile) throw new Error('Every proposed coverage cell must resolve to an active catalog city and profile.');
      if (parent && parentMetadata.marketKey && cell.marketKey !== parentMetadata.marketKey) {
        throw new Error('Every proposed coverage cell must belong to the claimed market.');
      }
      if (parent && !parentMetadata.marketKey && !coveredCityKeys.has(`${city.city.toLowerCase()}, ${city.state.toLowerCase()}`)) {
        throw new Error('Every proposed coverage cell must belong to the claimed market.');
      }
      if (replenishmentDemand && cell.marketKey !== replenishmentDemand.marketKey) {
        throw new Error('Every proposed coverage cell must belong to the replenishment demand market.');
      }
      if (
        ['WAITING_FOR_PIPELINE', 'SATURATED'].includes(String(cell.searchStatus))
        && cell.nextReviewAt instanceof Date
        && cell.nextReviewAt > now
      ) {
        throw new Error('A waiting or saturated coverage cell is not eligible before its review date.');
      }
      for (const strategyKey of proposal.strategyKeys) {
        const strategy = getAffiliateCoverageQueryStrategy(strategyKey);
        if (!strategy || !strategy.allowedProfiles.includes(profile.key)) {
          throw new Error(`Strategy ${strategyKey} is not allowed for profile ${profile.key}.`);
        }
      }
      coverageTargetCells.push({
        cellId: cell.id,
        cityGeoid: city.placeGeoid,
        city: city.city,
        state: city.state,
        sportId: cell.sportId,
        sportName: cell.sportName,
        profileKey: profile.key,
        sourceType: profile.sourceTypes[0],
      });
    }
    coverageTargetCells = coverageTargetCells.sort((left, right) => (
      String(left.cityGeoid).localeCompare(String(right.cityGeoid))
      || String(left.sportId).localeCompare(String(right.sportId))
      || String(left.profileKey).localeCompare(String(right.profileKey))
    ));
  }
  const replenishmentGeneration = replenishmentDemand
    ? Number(replenishmentWave?.demandGeneration ?? replenishmentDemand.generation)
    : Number.NaN;
  const replenishmentContractVersion = replenishmentDemand
    ? Number(replenishmentDemand.contractVersion)
    : Number.NaN;
  const replenishmentRolloutCohort = replenishmentDemand?.rolloutCohort;
  const replenishmentContractHash = replenishmentDemand?.contractHash;
  const replenishmentLineageMetadata = replenishmentDemand
    && Number.isSafeInteger(replenishmentGeneration)
    && replenishmentGeneration >= 0
    && Number.isSafeInteger(replenishmentContractVersion)
    && typeof replenishmentRolloutCohort === 'string'
    && replenishmentRolloutCohort.trim().length > 0
    && typeof replenishmentContractHash === 'string'
    && replenishmentContractHash.trim().length > 0
    ? {
      coverageAssessmentCycleId: `${replenishmentDemand.id}:generation:${replenishmentGeneration}`,
      coverageRolloutCohort: replenishmentRolloutCohort,
      coverageContractVersion: replenishmentContractVersion,
      coverageContractHash: replenishmentContractHash,
      coverageWaveId: replenishmentWave?.id ?? replenishmentDemand.activeWaveId ?? null,
    }
    : {};
  const coverageFingerprint = normalizedFingerprint(proposal, parentCampaignId);
  let campaign = await database.campaigns.findUnique({ where: { coverageFingerprint } });
  let created = false;
  if (!campaign) {
    campaign = await database.campaigns.create({
      data: {
        id: (dependencies.createIdentifier ?? createId)(),
        name: proposal.name,
        region: proposal.region,
        location: proposal.location ?? null,
        sportIds,
        sourceTypeHints: [...new Set(proposal.sourceTypeHints)],
        autoCreateIntakes: true,
        searchIntervalMinutes: proposal.searchIntervalMinutes,
        nextRunAt: now,
        maxQueriesPerRun: proposal.maxQueriesPerRun,
        maxResultsPerQuery: proposal.maxResultsPerQuery,
        queryCursor: 0,
        coverageFingerprint,
        createdByUserId: `coverage-agent:${proposal.agentId}`,
        metadata: {
          coverageAgent: true,
          coverageParentCampaignId: parent?.id ?? null,
          coverageDemandId: replenishmentDemand?.id ?? null,
          coverageJobId: job.id,
          ...replenishmentLineageMetadata,
          coverageArchetypes: proposal.coverageArchetypes,
          coverageCellIds: proposal.coverageCellIds,
          coverageTargetCells,
          coverageStrategyKeys: proposal.strategyKeys,
          strategyKeys: proposal.strategyKeys,
          rationale: proposal.rationale,
          queryStrategyVersion: proposal.strategyKeys.length
            ? AFFILIATE_COVERAGE_QUERY_STRATEGY_VERSION
            : US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION,
        },
      },
    });
    created = true;
  }
  const queuedRun = await (dependencies.queueCampaignRun ?? queueAffiliateSourceDiscoveryRun)(
    campaign.id,
    `coverage-agent:${proposal.agentId}`,
  );
  return { campaign, created, queuedRunId: queuedRun.id, coverageFingerprint };
};

export const storeAffiliateManualBrowserEvidence = async (input: {
  jobId: string;
  agentId: string;
  claimGeneration: AffiliateCoverageClaimGeneration;
  pageId: string;
  sourceUrl: string;
  finalUrl?: string | null;
  html: Buffer;
  screenshot?: Buffer | null;
  screenshotMimeType?: string | null;
  notes: string;
}, dependencies: CoverageDependencies = {}) => {
  const database = dependencies.database ?? coverageDatabase();
  const now = dependencies.now?.() ?? new Date();
  const job = await database.jobs.findUnique({ where: { id: input.jobId } });
  if (input.jobId !== input.claimGeneration.jobId || input.agentId.trim() !== input.claimGeneration.agentId) {
    throw new Error('Manual evidence input does not match its claim generation.');
  }
  assertActiveClaim(job, input.claimGeneration, now);
  if (job.subjectType !== 'FAILED_INTAKE_CAPTURE') {
    throw new Error('Only a failed intake capture job can store manual browser evidence.');
  }
  const context = recordValue(job.context);
  const intakeId = stringValue(context.intakeId);
  if (!intakeId) throw new Error('Coverage job has no intake id.');
  const [intake, page] = await Promise.all([
    database.intakes.findUnique({ where: { id: intakeId } }),
    database.pages.findUnique({ where: { id: input.pageId } }),
  ]);
  if (!intake || !page || page.intakeId !== intakeId) {
    throw new Error('Manual evidence page does not belong to the failed intake.');
  }
  const supplySourceId = stringValue(page.supplySourceId) ?? stringValue(intake.supplySourceId);
  if (
    supplySourceId
    && !page.supplySourceId
    && typeof database.pages.update === 'function'
  ) {
    await database.pages.update({
      where: { id: page.id },
      data: { supplySourceId },
    });
    page.supplySourceId = supplySourceId;
  }
  if (intake.complianceStatus !== 'ALLOWED' || page.robotsStatus === 'DISALLOWED') {
    throw new Error('Manual evidence requires an allowed intake policy and no robots prohibition.');
  }
  if (input.html.length === 0) throw new Error('Manual browser HTML is empty.');
  const sourceUrl = canonicalizeAffiliateIntakeUrl(input.sourceUrl);
  const finalUrl = canonicalizeAffiliateIntakeUrl(input.finalUrl ?? input.sourceUrl);
  if (
    captureTargetKeyForUrl(sourceUrl, intakeId)
    !== captureTargetKeyForUrl(page.canonicalUrl, intakeId)
  ) {
    throw new Error('Manual evidence source URL must be the claimed failed page or its safe canonical host variant.');
  }
  const expectedPolicyKey = affiliateDiscoveryPolicyKeyForUrl(page.canonicalUrl);
  if (
    affiliateDiscoveryPolicyKeyForUrl(sourceUrl) !== expectedPolicyKey
    || affiliateDiscoveryPolicyKeyForUrl(finalUrl) !== expectedPolicyKey
  ) {
    throw new Error('Manual evidence URLs must remain within the claimed source policy.');
  }
  const html = input.html.toString('utf8');
  const quality = evaluateAffiliateHtmlQuality(html, finalUrl);
  if (!quality.accepted) {
    throw new Error(`Manual browser HTML quality was rejected: ${quality.reasons.join('; ')}`);
  }
  const derived = deriveAffiliateHtmlArtifacts(html, finalUrl);
  const manualRunId = `coverage_manual_${createHash('sha256').update(JSON.stringify({
    jobId: input.claimGeneration.jobId,
    agentId: input.claimGeneration.agentId,
    claimedAt: input.claimGeneration.claimedAt,
    captureStartedAt: now.toISOString(),
  })).digest('hex').slice(0, 24)}`;
  const priorRun = await database.intakeRuns.findUnique({ where: { id: manualRunId } });
  const claimAcquired = await database.jobs.updateMany({
    where: coverageClaimWhere(input.claimGeneration, now),
    data: { errorMessage: null },
  });
  if (claimAcquired.count !== 1) throw new Error('STALE_COVERAGE_CLAIM');
  if (!priorRun) {
    await database.intakeRuns.create({
      data: {
        id: manualRunId,
        intakeId,
        supplySourceId,
        requestedPageIds: [page.id],
        requestedByUserId: `coverage-agent:${input.agentId}`,
        provider: 'MANUAL_BROWSER',
        status: 'RUNNING',
        queuedAt: now,
        startedAt: now,
        claimedAt: now,
        workerId: input.agentId,
        attemptCount: 1,
      },
    });
  }
  const persist = dependencies.persistArtifact ?? persistAffiliateSourceIntakeArtifact;
  const claimMetadata = {
    jobId: input.claimGeneration.jobId,
    agentId: input.claimGeneration.agentId,
    claimedAt: input.claimGeneration.claimedAt,
  };
  const artifactMetadata = {
    coverageJobId: job.id,
    claimGeneration: claimMetadata,
    captureMethod: 'MANUAL_BROWSER',
    notes: input.notes.trim(),
    quality,
    extractorVersion: derived.extractorVersion,
  };
  const base = {
    intakeId,
    supplySourceId,
    pageId: page.id,
    runId: manualRunId,
    sourceUrl,
    finalUrl,
    provider: 'MANUAL_BROWSER',
    httpStatus: 200,
    metadata: artifactMetadata,
    now,
  };
  const artifacts = [];
  artifacts.push(await persist({
    ...base,
    kind: 'PROVIDER_SCRAPE_REQUEST_JSON',
    data: Buffer.from(JSON.stringify({ method: 'MANUAL_BROWSER', sourceUrl, notes: input.notes.trim() })),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({
    ...base,
    kind: 'PROVIDER_SCRAPE_RESPONSE_JSON',
    data: Buffer.from(JSON.stringify({ finalUrl, statusCode: 200, quality })),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({ ...base, kind: 'PAGE_HTML', data: input.html, mimeType: 'text/html; charset=utf-8' }));
  if (derived.markdown) {
    artifacts.push(await persist({
      ...base,
      kind: 'PAGE_MARKDOWN',
      data: Buffer.from(derived.markdown, 'utf8'),
      mimeType: 'text/markdown; charset=utf-8',
    }));
  }
  artifacts.push(await persist({
    ...base,
    kind: 'PAGE_LINKS',
    data: Buffer.from(JSON.stringify(derived.links)),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({
    ...base,
    kind: 'PAGE_IMAGES',
    data: Buffer.from(JSON.stringify(derived.images)),
    mimeType: 'application/json',
  }));
  artifacts.push(await persist({
    ...base,
    kind: 'PAGE_BRANDING',
    data: Buffer.from(JSON.stringify(derived.branding)),
    mimeType: 'application/json',
  }));
  if (input.screenshot?.length) {
    artifacts.push(await persist({
      ...base,
      kind: 'PAGE_SCREENSHOT',
      data: input.screenshot,
      mimeType: input.screenshotMimeType?.trim() || 'image/png',
    }));
  }
  let mappingJob: { id: string } | null = null;
  try {
    mappingJob = await withCoverageTransaction(database, async (transactionDatabase) => {
      const claim = await transactionDatabase.jobs.updateMany({
        where: coverageClaimWhere(input.claimGeneration, now),
        data: { errorMessage: null },
      });
      if (claim.count !== 1) throw new Error('STALE_COVERAGE_CLAIM');
      await transactionDatabase.intakeRuns.update({
        where: { id: manualRunId },
        data: {
          status: 'SUCCEEDED',
          finishedAt: now,
          capturedPageCount: 1,
          providerJobIds: [],
          errorMessage: null,
          summary: {
            coverageJobId: job.id,
            claimGeneration: claimMetadata,
            captureMethod: 'MANUAL_BROWSER',
            sourceUrl,
            finalUrl,
            artifactCount: artifacts.length,
            notes: input.notes.trim(),
          },
        },
      });
      await transactionDatabase.intakes.update({
        where: { id: intakeId },
        data: {
          lastRunId: manualRunId,
          status: intake.affiliateSourceId ? 'REVIEW_REQUIRED' : 'READY_FOR_MAPPING',
        },
      });
      let current = await transactionDatabase.mappingJobs.findFirst({
        where: { intakeId, status: { in: ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED', 'APPROVED'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (!intake.affiliateSourceId && !current) {
        try {
          current = await transactionDatabase.mappingJobs.create({
            data: {
              id: (dependencies.createIdentifier ?? createId)(),
              intakeId,
              status: 'QUEUED',
              resultSummary: { coverageEvidenceGeneration: claimMetadata },
            },
          });
        } catch {
          throw new Error('SKIPPED_CONCURRENT_MAPPING_INSERT');
        }
      }
      const completed = await transactionDatabase.jobs.updateMany({
        where: coverageClaimWhere(input.claimGeneration, now),
        data: { errorMessage: null },
      });
      if (completed.count !== 1) throw new Error('STALE_COVERAGE_CLAIM');
      return current ? { id: current.id } : null;
    });
  } catch (error) {
    if (String(error instanceof Error ? error.message : error) === 'STALE_COVERAGE_CLAIM') {
      await database.intakeRuns.update({
        where: { id: manualRunId },
        data: {
          status: 'FAILED',
          finishedAt: now,
          errorMessage: 'STALE_COVERAGE_CLAIM',
          summary: {
            coverageJobId: job.id,
            claimGeneration: claimMetadata,
            captureMethod: 'MANUAL_BROWSER',
            sourceUrl,
            finalUrl,
            artifactCount: artifacts.length,
            notes: input.notes.trim(),
          },
        },
      });
    }
    throw error;
  }
  return {
    jobId: job.id,
    intakeId,
    manualRunId,
    artifactCount: artifacts.length,
    mappingJobId: mappingJob?.id ?? null,
  };
};

const validateFocusedCoverageEvidence = async (
  database: CoverageDatabase,
  job: any,
  result: AffiliateCoverageCompletion,
): Promise<void> => {
  if (!['COVERED', 'SATURATED_NO_YIELD'].includes(result.decision)) return;
  const context = recordValue(job.context);
  const expectedCellIds = Array.isArray(context.coverageCellIds)
    ? context.coverageCellIds.filter((value): value is string => typeof value === 'string')
    : [];
  if (!expectedCellIds.length) return;
  const evidence = result.coverageEvidence;
  if (!evidence) throw new Error(`${result.decision} requires coverage evidence.`);
  if (
    evidence.cellIds.length === 0
    || evidence.cellIds.some((cellId) => !expectedCellIds.includes(cellId))
    || evidence.strategyKeys.length === 0
    || evidence.strategyKeys.length > 3
    || !evidence.cycleKey
    || evidence.successfulQueryExecutionIds.length === 0
  ) {
    throw new Error(`${result.decision} requires bounded cell, strategy, cycle, and query execution evidence.`);
  }
  for (const strategyKey of evidence.strategyKeys) getAffiliateCoverageQueryStrategy(strategyKey);
  if (database.queryExecutions?.findMany) {
    const executionIds = [
      ...evidence.successfulQueryExecutionIds,
      ...evidence.failedQueryExecutionIds,
    ];
    const executions = await database.queryExecutions.findMany({
      where: { id: { in: executionIds } },
      select: { id: true, status: true },
    });
    if (executions.length !== new Set(executionIds).size) {
      throw new Error(`${result.decision} cites query execution evidence that does not exist.`);
    }
    const byId = new Map<string, string>(executions.map((execution: { id: string; status: string }) => [execution.id, execution.status]));
    if (evidence.successfulQueryExecutionIds.some((id) => !['SUCCEEDED', 'SUCCESS', 'PARTIAL'].includes(String(byId.get(id) ?? '')))) {
      throw new Error(`${result.decision} cites a non-successful query execution as successful.`);
    }
    if (evidence.failedQueryExecutionIds.some((id) => !['FAILED', 'ERROR'].includes(String(byId.get(id) ?? '')))) {
      throw new Error(`${result.decision} cites a non-failed query execution as failed.`);
    }
  }
  if (result.decision === 'SATURATED_NO_YIELD') {
    if (
      evidence.failedQueryExecutionIds.length > 0
      || evidence.recentNewDomainYields.some((yieldCount) => yieldCount > 0)
      || evidence.newQualifiedPolicyKeyCount > 0
      || evidence.unresolvedLeadCount !== 0
    ) {
      throw new Error('SATURATED_NO_YIELD requires completed strategy runs with zero new yields and zero unresolved leads.');
    }
  }
};

export const completeAffiliateCoverageJob = async (
  input: AffiliateCoverageCompletion,
  dependencies: CoverageDependencies = {},
) => {
  const result = affiliateCoverageCompletionSchema.parse(input);
  const database = dependencies.database ?? coverageDatabase();
  const now = dependencies.now?.() ?? new Date();
  const job = await database.jobs.findUnique({ where: { id: result.jobId } });
  assertActiveClaim(job, result.claimGeneration, now);
  await validateFocusedCoverageEvidence(database, job, result);
  if (job.subjectType === 'MARKET_COVERAGE' || job.subjectType === 'SUPPLY_REPLENISHMENT') {
    if (result.decision === 'CAMPAIGNS_CREATED' && result.campaignIds.length === 0) {
      throw new Error('CAMPAIGNS_CREATED requires at least one campaign id.');
    }
    if (result.decision === 'CAMPAIGNS_CREATED') {
      const campaigns = await database.campaigns.findMany({
        where: { id: { in: result.campaignIds } },
        select: { id: true, metadata: true },
      });
      if (campaigns.length !== new Set(result.campaignIds).size) {
        throw new Error('One or more created coverage campaigns do not exist.');
      }
      if (campaigns.some((campaign: any) => (
        stringValue(recordValue(campaign.metadata).coverageJobId) !== job.id
      ))) {
        throw new Error('Created campaigns must belong to the claimed coverage job.');
      }
      if (job.subjectType === 'MARKET_COVERAGE') {
        const terminalRuns = await database.discoveryRuns.findMany({
          where: {
            campaignId: { in: result.campaignIds },
          },
          select: { campaignId: true, status: true },
          orderBy: { createdAt: 'desc' },
        });
        const latestStatusByCampaign = new Map<string, string>();
        for (const run of terminalRuns) {
          if (!latestStatusByCampaign.has(run.campaignId)) {
            latestStatusByCampaign.set(run.campaignId, run.status);
          }
        }
        if (result.campaignIds.some((campaignId) => (
          !['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(latestStatusByCampaign.get(campaignId) ?? '')
        ))) {
          throw new Error('Run each created campaign before returning the market job to the queue.');
        }
      }
    }
    if (job.subjectType === 'MARKET_COVERAGE' && result.decision === 'COVERED') {
      const evidence = result.coverageEvidence;
      if (
        !evidence
        || evidence.sourceFamilies.length < 2
        || evidence.completedQueryProfiles.length === 0
        || evidence.recentNewDomainYields.length < 2
        || evidence.unresolvedLeadCount !== 0
      ) {
        throw new Error('COVERED requires two source families, completed query profiles, two recent yields, and zero unresolved leads.');
      }
      const parentCampaignId = stringValue(recordValue(job.context).campaignId);
      if (!parentCampaignId) throw new Error('Coverage job has no parent campaign.');
      const campaignIds = Array.from(new Set([parentCampaignId, ...result.campaignIds]));
      const [currentResults, completedRuns] = await Promise.all([
        database.discoveryResults.findMany({
          where: { campaignId: { in: campaignIds } },
          select: {
            status: true,
            reasonCodes: true,
            reasonDetails: true,
            matchingIntakeId: true,
            matchingSourceId: true,
            matchingOrganizationId: true,
          },
        }),
        database.discoveryRuns.findMany({
          where: {
            campaignId: { in: campaignIds },
            status: { in: ['SUCCEEDED', 'PARTIAL'] },
          },
          select: { summary: true },
        }),
      ]);
      const currentUnresolvedLeadCount = currentResults
        .filter(discoveryResultNeedsPipelineResolution).length;
      if (currentUnresolvedLeadCount !== 0) {
        throw new Error(`COVERED cannot pass while ${currentUnresolvedLeadCount} current leads remain unresolved.`);
      }
      const executedProfiles = new Set(completedRuns.flatMap((run: any) => {
        const queries = recordValue(run.summary).queries;
        return Array.isArray(queries)
          ? queries.flatMap((query) => {
              const templateKey = stringValue(recordValue(query).templateKey);
              return templateKey ? [templateKey.replace(/^PROFILE:/, '')] : [];
            })
          : [];
      }));
      const unsupportedProfiles = evidence.completedQueryProfiles.filter((profile) => !executedProfiles.has(profile));
      if (unsupportedProfiles.length) {
        throw new Error(`COVERED cites query profiles with no successful run evidence: ${unsupportedProfiles.join(', ')}.`);
      }
    }
    if (job.subjectType === 'MARKET_COVERAGE' && result.decision === 'WAITING_FOR_PIPELINE') {
      const currentUnresolvedLeadCount = await currentMarketUnresolvedLeadCount(database, job);
      if (
        !result.coverageEvidence
        || result.coverageEvidence.unresolvedLeadCount !== currentUnresolvedLeadCount
        || currentUnresolvedLeadCount === 0
      ) {
        throw new Error('WAITING_FOR_PIPELINE requires the current nonzero unresolved automatic lead count.');
      }
    }
    if (
      job.subjectType === 'MARKET_COVERAGE'
      && ['CAPTURE_RECOVERED', 'MAPPER_REPAIR_REQUIRED', 'RETRY_LATER', 'SOURCE_EXCLUDED'].includes(result.decision)
    ) {
      throw new Error('Market coverage jobs cannot use a capture repair decision.');
    }
    if (
      job.subjectType === 'SUPPLY_REPLENISHMENT'
      && !['CAMPAIGNS_CREATED', 'HUMAN_REVIEW_REQUIRED', 'RETRY_LATER', 'SATURATED_NO_YIELD', 'SOURCE_EXCLUDED'].includes(result.decision)
    ) {
      throw new Error('Supply replenishment jobs require a campaign, retry, exclusion, or human review decision.');
    }
  } else {
    if (result.decision === 'CAPTURE_RECOVERED') {
      if (!result.manualRunId) throw new Error('CAPTURE_RECOVERED requires a manual run id.');
      const run = await database.intakeRuns.findUnique({ where: { id: result.manualRunId } });
      if (!run || run.status !== 'SUCCEEDED') throw new Error('Manual recovery run was not completed.');
      const artifactCount = await database.artifacts.count({
        where: { runId: result.manualRunId, kind: { in: ['PAGE_HTML', 'PAGE_MARKDOWN'] } },
      });
      if (artifactCount === 0) throw new Error('Manual recovery run has no HTML or Markdown evidence.');
    }
    if (result.decision === 'RETRY_LATER' && !hasReasonCode(result.reasonCodes, CAPTURE_RETRY_REASON_CODES)) {
      throw new Error('RETRY_LATER requires a recognized transient capture reason code.');
    }
    if (result.decision === 'SOURCE_EXCLUDED' && !hasReasonCode(result.reasonCodes, SOURCE_EXCLUSION_REASON_CODES)) {
      throw new Error('SOURCE_EXCLUDED requires a recognized deterministic exclusion reason code.');
    }
    if (['CAMPAIGNS_CREATED', 'COVERED', 'WAITING_FOR_PIPELINE'].includes(result.decision)) {
      throw new Error('Failed capture jobs cannot use a market coverage decision.');
    }
  }
  if (
    result.decision === 'HUMAN_REVIEW_REQUIRED'
    && !hasReasonCode(result.reasonCodes, HUMAN_DECISION_REASON_CODES)
  ) {
    throw new Error('HUMAN_REVIEW_REQUIRED requires conflicting identity, contradictory evidence, or replacement-domain approval.');
  }
  const retryBudget = MAX_CAPTURE_ATTEMPTS;
  const retryExhausted = result.decision === 'RETRY_LATER'
    && Number(job.attemptCount ?? 0) >= retryBudget;
  const retryAt = result.decision === 'RETRY_LATER' && !retryExhausted
    ? retryAtForAttempt(now, Number(job.attemptCount ?? 1))
    : null;
  const storedResult = retryExhausted
    ? {
        ...result,
        decision: 'SOURCE_EXCLUDED',
        summary: `${result.summary} The bounded coverage retry budget is exhausted.`,
        reasonCodes: Array.from(new Set([...result.reasonCodes, 'RETRY_EXHAUSTED'])),
      }
    : retryAt
      ? { ...result, retryAt: retryAt.toISOString() }
      : result;
  const persistedResult = (
    job.subjectType === 'SUPPLY_REPLENISHMENT'
    && result.decision === 'CAMPAIGNS_CREATED'
  )
    ? { ...storedResult, campaignId: result.campaignIds[0] }
    : storedResult;
  let status = 'COMPLETED';
  if (result.decision === 'HUMAN_REVIEW_REQUIRED') status = 'HUMAN_REVIEW_REQUIRED';
  if (result.decision === 'CAMPAIGNS_CREATED') {
    status = job.subjectType === 'SUPPLY_REPLENISHMENT' ? 'COMPLETED' : 'QUEUED';
  }
  if (result.decision === 'WAITING_FOR_PIPELINE') status = 'WAITING_FOR_PIPELINE';
  if (result.decision === 'RETRY_LATER') {
    status = retryExhausted ? 'EXCLUDED' : 'RETRY_SCHEDULED';
  }
  if (result.decision === 'SOURCE_EXCLUDED') status = 'EXCLUDED';
  const releasesClaim = ['QUEUED', 'WAITING_FOR_PIPELINE', 'RETRY_SCHEDULED'].includes(status);
  const finalData: Record<string, unknown> = {
    status,
    result: persistedResult,
    errorMessage: status === 'HUMAN_REVIEW_REQUIRED' ? result.summary : null,
    finishedAt: releasesClaim ? null : now,
    claimedAt: releasesClaim ? null : job.claimedAt,
    workerId: releasesClaim ? null : job.workerId,
    leaseExpiresAt: null,
  };
  if (result.decision === 'MAPPER_REPAIR_REQUIRED') {
    const intakeId = stringValue(recordValue(job.context).intakeId);
    if (!intakeId) throw new Error('Coverage capture job has no intake id for mapper repair.');
    const repair = await queueCoverageMappingRepair({
      database,
      intakeId,
      job,
      result,
      now,
      createIdentifier: dependencies.createIdentifier ?? createId,
      finalData,
    });
    return repair.coverageJob;
  }
  return withCoverageTransaction(database, async (transactionDatabase) => {
    const isSupplyReplenishment = job.subjectType === 'SUPPLY_REPLENISHMENT';
    if (
      isSupplyReplenishment
      && transactionDatabase.waves?.findFirst
      && transactionDatabase.waves?.update
    ) {
      const wave = await transactionDatabase.waves.findFirst({
        where: { coveragePlanningJobId: job.id },
        orderBy: { createdAt: 'desc' },
      });
      if (wave) {
        const effectiveDecision = String(persistedResult.decision).toUpperCase();
        const isHumanReview = effectiveDecision === 'HUMAN_REVIEW_REQUIRED';
        const isSourceExcluded = effectiveDecision === 'SOURCE_EXCLUDED';
        const isSaturated = effectiveDecision === 'SATURATED_NO_YIELD';
        const isRetry = effectiveDecision === 'RETRY_LATER';
        const saturationUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const waveData: Record<string, unknown> = {
          resultJson: persistedResult,
          evidenceRefs: [`coverage-job:${job.id}`],
        };
        if (effectiveDecision === 'CAMPAIGNS_CREATED') {
          waveData.campaignId = result.campaignIds[0];
          waveData.status = 'ACTIVE';
          waveData.provider = 'COVERAGE_PLANNER';
          waveData.evidenceRefs = [`coverage-job:${job.id}`, `campaign:${result.campaignIds[0]}`];
        } else if (isHumanReview || isSourceExcluded) {
          waveData.status = 'PAUSED';
          waveData.terminalAt = now;
          waveData.retryAt = null;
          waveData.marginalYield = null;
          waveData.errorCode = isHumanReview
            ? 'COVERAGE_PLANNING_HUMAN_REVIEW_REQUIRED'
            : 'COVERAGE_PLANNING_SOURCE_EXCLUDED';
        } else if (isSaturated) {
          waveData.status = 'SUCCEEDED';
          waveData.terminalAt = now;
          waveData.retryAt = saturationUntil;
          waveData.marginalYield = 0;
          waveData.errorCode = null;
        } else if (isRetry) {
          waveData.status = 'WAITING';
          waveData.terminalAt = null;
          waveData.retryAt = retryAt ?? new Date(now.getTime() + DEFAULT_CAPTURE_RETRY_DELAY_MS);
          waveData.marginalYield = null;
          waveData.errorCode = 'COVERAGE_PLANNING_RETRY';
        }
        await transactionDatabase.waves.update({
          where: { id: wave.id },
          data: waveData,
        });
        if (isHumanReview || isSourceExcluded || isSaturated) {
          const demand = await transactionDatabase.demands.findUnique({
            where: { id: wave.demandId },
          });
          if (demand) {
            const reasonCode = isHumanReview
              ? 'COVERAGE_PLANNING_HUMAN_REVIEW_REQUIRED'
              : isSourceExcluded
                ? 'COVERAGE_PLANNING_SOURCE_EXCLUDED'
                : 'SEARCH_SATURATION';
            await transactionDatabase.demands.update({
              where: { id: demand.id },
              data: {
                ...(isHumanReview || isSourceExcluded ? { status: 'PAUSED' } : { status: 'OPEN' }),
                activeWaveId: null,
                nextEligibleAt: isSaturated ? saturationUntil : null,
                ...(isSaturated ? { searchSaturatedUntil: saturationUntil } : {}),
                generation: Number(demand.generation ?? 0) + 1,
                reasonCodes: Array.from(new Set([
                  ...(Array.isArray(demand.reasonCodes) ? demand.reasonCodes : []),
                  reasonCode,
                ])),
              },
            });
          }
        }
      }
    }
    const completed = await transactionDatabase.jobs.updateMany({
      where: coverageClaimWhere(result.claimGeneration, now),
      data: finalData,
    });
    if (completed.count !== 1) throw new Error('STALE_COVERAGE_CLAIM');
    return transactionDatabase.jobs.findUnique({ where: { id: job.id } });
  });
};
