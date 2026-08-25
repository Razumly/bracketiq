import { createHash } from 'crypto';
import { createId } from '@/lib/id';
import { Client } from 'pg';
import { prisma } from '@/lib/prisma';
import { resolvePrismaPgPoolConfig } from '@/lib/prismaConfig';
import type {
  AffiliateReplenishmentWaves,
  AffiliateReplenishmentDemands,
  AffiliateSourceIntakes,
  AffiliateSourceIntakeRuns,
  AffiliateSourceMappingJobs,
} from '@/generated/prisma/client';
import {
  emitAffiliateOperationalAlert,
  emitAffiliateOperationalAlerts,
  type AffiliateOperationalAlertInput,
} from './affiliateOperationalAlerts';
import type {
  AffiliateSourceCaptureClient,
  AffiliateSourceSearchClient,
} from './affiliateProviderContracts';
import {
  createAffiliateSourceSearchClient,
} from './affiliateProviderFactory';
import type { AffiliateFirecrawlClient } from './firecrawlClient';
import {
  processNextAffiliateSourceIntakeRun,
  queueAffiliateSourceIntakeRun,
  recoverStaleAffiliateSourceIntakeRuns,
  reviewAffiliateSourceIntakePolicy,
} from './sourceIntake';
import {
  fetchBoundedPublicResource,
} from './sourceIntakeUrlSafety';
import {
  AFFILIATE_DISCOVERY_AUTO_INTAKE_SCORE,
  AFFILIATE_DISCOVERY_REVIEW_SCORE,
  affiliateDiscoveryUrlKey,
  evaluateAffiliateSourceDiscoveryResult,
  generateAffiliateSourceDiscoveryQueries,
} from './sourceDiscoveryRules';
import {
  affiliateSourceDiscoveryCampaignSchema,
  affiliateSourceDomainPolicyReviewSchema,
  type AffiliateSourceDiscoveryCampaignInput,
  type AffiliateSourceDiscoveryQuery,
  type AffiliateSourceDomainPolicyReview,
} from './sourceDiscoveryTypes';
import {
  enqueueAffiliateSourceUrl,
  findAffiliateSourceUrlDuplicate,
} from './sourceUrlIntake';
import { findAffiliateIntakeIdsForPolicyKey } from './sourcePolicyIntakes';
import { loadAffiliateCoverageCityCatalog } from './coverageCityCatalog';
import type { AffiliateReplenishmentWaveExecutionResult } from './affiliateSupplyPersistence';

const DISCOVERY_LOCK_ID = 4201072126;
const MAX_AUTOMATION_DISCOVERY_RUNS = 5;
const MAX_AUTOMATION_INTAKE_RUNS = 10;
const POLICY_EXPIRY_DAYS = 180;
const DEFAULT_STALE_DISCOVERY_RUN_AGE_MS = 60 * 60 * 1000;
const MIN_STALE_DISCOVERY_RUN_AGE_MS = 20 * 60 * 1000;
const MAX_STALE_DISCOVERY_RUNS_PER_PASS = 25;
const SUPERVISOR_HEARTBEAT_LEASE_MS = 20 * 60 * 1000;
const DEFAULT_SUPERVISOR_WORKER_ID = 'affiliate-intake-supervisor';

type JsonRecord = Record<string, unknown>;
type DiscoveryDependencies = {
  searchClient?: AffiliateSourceSearchClient;
  captureClient?: AffiliateSourceCaptureClient;
  fallbackCaptureClient?: AffiliateSourceCaptureClient | null;
  /** Compatibility hook for existing tests and explicitly configured Firecrawl work. */
  firecrawlClient?: AffiliateFirecrawlClient;
  now?: () => Date;
  fetchResource?: typeof fetchBoundedPublicResource;
  workerId?: string;
};
const db = (client: unknown = prisma) => {
  const dbClient = client as Record<string, unknown>;
  return {
    campaigns: dbClient.affiliateSourceDiscoveryCampaigns as any,
    runs: dbClient.affiliateSourceDiscoveryRuns as any,
    results: dbClient.affiliateSourceDiscoveryResults as any,
    policies: dbClient.affiliateSourceDomainPolicies as any,
    intakes: dbClient.affiliateSourceIntakes as any,
    pages: dbClient.affiliateSourceIntakePages as any,
    intakeRuns: dbClient.affiliateSourceIntakeRuns as any,
    sports: dbClient.sports as any,
    queryExecutions: dbClient.affiliateSourceDiscoveryQueryExecutions as any,
    mappingJobs: dbClient.affiliateSourceMappingJobs as any,
    workerHealth: dbClient.affiliateAgentWorkerHealth as any,
  };
};

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);
const stringValues = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
);

const nextRunAt = (from: Date, intervalMinutes: number): Date => (
  new Date(from.getTime() + intervalMinutes * 60_000)
);

const profileKeyForQuery = (query: AffiliateSourceDiscoveryQuery): string => (
  stringValue(query.profileKey) ?? (query.templateKey.replace(/^PROFILE:/, '') || 'directory')
);

const strategyKeyForQuery = (query: AffiliateSourceDiscoveryQuery): string => (
  stringValue(query.strategyKey) ?? 'legacy-web-v1'
);

const strategyFamilyKeyForQuery = (query: AffiliateSourceDiscoveryQuery): string => (
  stringValue(query.strategyFamilyKey) ?? 'legacy-web'
);

const cityGeoidForQuery = (query: AffiliateSourceDiscoveryQuery): string | null => {
  if (stringValue(query.cityGeoid)) return query.cityGeoid ?? null;
  const city = stringValue(query.targetCity);
  const state = stringValue(query.targetState);
  if (!city || !state) return null;
  return loadAffiliateCoverageCityCatalog().cities.find((entry) => (
    entry.city.toLowerCase() === city.toLowerCase() && entry.state.toLowerCase() === state.toLowerCase()
  ))?.placeGeoid ?? null;
};

const queryExecutionKey = (query: AffiliateSourceDiscoveryQuery): string => createHash('sha256')
  .update(JSON.stringify({
    query: query.query,
    cityGeoid: cityGeoidForQuery(query),
    sportId: query.sportId,
    profileKey: profileKeyForQuery(query),
    strategyKey: strategyKeyForQuery(query),
  }))
  .digest('hex');

const normalizedDiscoveryErrorCode = (error: unknown): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('429')) return 'HTTP_429';
  if (message.includes('5xx') || message.includes('500') || message.includes('502') || message.includes('503')) return 'HTTP_5XX';
  if (message.includes('tls') || message.includes('certificate')) return 'TLS_ERROR';
  if (message.includes('timeout') || message.includes('network')) return 'NETWORK_ERROR';
  return 'PROVIDER_ERROR';
};

const findPreviouslyQualifiedPolicyKeys = async (query: AffiliateSourceDiscoveryQuery): Promise<Set<string>> => {
  const executions = db().queryExecutions;
  if (!executions?.findMany) return new Set<string>();
  const cityGeoid = cityGeoidForQuery(query);
  const rows = await executions.findMany({
    where: {
      cityGeoid,
      sportId: query.sportId,
      profileKey: profileKeyForQuery(query),
      status: { in: ['SUCCEEDED', 'PARTIAL'] },
    },
    select: { qualifiedPolicyKeys: true },
  });
  return new Set(rows.flatMap((row: { qualifiedPolicyKeys?: unknown }) => (
    Array.isArray(row.qualifiedPolicyKeys)
      ? row.qualifiedPolicyKeys.filter((key): key is string => typeof key === 'string' && Boolean(key.trim()))
      : []
  )));
};

const persistQueryExecution = async (input: {
  run: { id: string; campaignId: string };
  query: AffiliateSourceDiscoveryQuery;
  provider: string;
  status: string;
  returnedResultCount: number;
  qualifiedPolicyKeys: string[];
  newQualifiedPolicyKeys: string[];
  intakeCreatedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> => {
  const executions = db().queryExecutions;
  if (!executions?.upsert) return;
  const cityGeoid = cityGeoidForQuery(input.query);
  const profileKey = profileKeyForQuery(input.query);
  const strategyKey = strategyKeyForQuery(input.query);
  const queryKey = queryExecutionKey(input.query);
  await executions.upsert({
    where: { runId_queryKey: { runId: input.run.id, queryKey } },
    create: {
      id: createId(),
      runId: input.run.id,
      campaignId: input.run.campaignId,
      queryKey,
      cityGeoid,
      targetCity: input.query.targetCity ?? null,
      targetState: input.query.targetState ?? null,
      sportId: input.query.sportId,
      sportName: input.query.sportName,
      profileKey,
      strategyKey,
      strategyFamilyKey: strategyFamilyKeyForQuery(input.query),
      queryText: input.query.query,
      provider: input.provider,
      status: input.status,
      returnedResultCount: input.returnedResultCount,
      qualifiedDirectCount: input.qualifiedPolicyKeys.length,
      newQualifiedPolicyKeyCount: input.newQualifiedPolicyKeys.length,
      intakeCreatedCount: input.intakeCreatedCount,
      duplicateCount: input.duplicateCount,
      rejectedCount: input.rejectedCount,
      qualifiedPolicyKeys: input.qualifiedPolicyKeys,
      newQualifiedPolicyKeys: input.newQualifiedPolicyKeys,
      errorCode: input.errorCode ?? null,
      metadata: input.metadata ?? null,
    },
    update: {
      status: input.status,
      returnedResultCount: input.returnedResultCount,
      qualifiedDirectCount: input.qualifiedPolicyKeys.length,
      newQualifiedPolicyKeyCount: input.newQualifiedPolicyKeys.length,
      intakeCreatedCount: input.intakeCreatedCount,
      duplicateCount: input.duplicateCount,
      rejectedCount: input.rejectedCount,
      qualifiedPolicyKeys: input.qualifiedPolicyKeys,
      newQualifiedPolicyKeys: input.newQualifiedPolicyKeys,
      errorCode: input.errorCode ?? null,
      metadata: input.metadata ?? null,
    },
  });
};
const policyExpiry = (now: Date): Date => new Date(now.getTime() + POLICY_EXPIRY_DAYS * 86_400_000);

export const createAffiliateSourceDiscoveryCampaign = async (
  input: AffiliateSourceDiscoveryCampaignInput,
  userId: string,
) => {
  const parsed = affiliateSourceDiscoveryCampaignSchema.parse(input);
  const uniqueSportIds = Array.from(new Set(parsed.sportIds));
  const existingSports = await db().sports.findMany({
    where: { id: { in: uniqueSportIds } },
    select: { id: true },
  });
  if (existingSports.length !== uniqueSportIds.length) {
    throw new Error('One or more selected sports do not exist.');
  }
  return db().campaigns.create({
    data: {
      id: createId(),
      ...parsed,
      sportIds: uniqueSportIds,
      sourceTypeHints: Array.from(new Set(parsed.sourceTypeHints)),
      createdByUserId: userId,
      nextRunAt: parsed.status === 'ACTIVE' ? new Date() : null,
    },
  });
};

export const updateAffiliateSourceDiscoveryCampaign = async (
  campaignId: string,
  input: AffiliateSourceDiscoveryCampaignInput,
) => {
  const parsed = affiliateSourceDiscoveryCampaignSchema.parse(input);
  const existing = await db().campaigns.findUnique({ where: { id: campaignId } });
  if (!existing) throw new Error('Affiliate source discovery campaign not found.');
  const sports = await db().sports.count({ where: { id: { in: Array.from(new Set(parsed.sportIds)) } } });
  if (sports !== new Set(parsed.sportIds).size) throw new Error('One or more selected sports do not exist.');
  return db().campaigns.update({
    where: { id: campaignId },
    data: {
      ...parsed,
      sportIds: Array.from(new Set(parsed.sportIds)),
      sourceTypeHints: Array.from(new Set(parsed.sourceTypeHints)),
      nextRunAt: parsed.status === 'ACTIVE'
        ? existing.nextRunAt ?? new Date()
        : null,
    },
  });
};

export const listAffiliateSourceDiscoveryCampaigns = async () => {
  const { campaigns, results, runs } = db();
  const rows = await campaigns.findMany({ orderBy: { name: 'asc' } });
  rows.sort((left: any, right: any) => {
    const leftRank = Number(left.metadata?.priorityRank ?? Number.MAX_SAFE_INTEGER);
    const rightRank = Number(right.metadata?.priorityRank ?? Number.MAX_SAFE_INTEGER);
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
  if (!rows.length) return [];
  const campaignIds = rows.map((row: any) => row.id);
  const [resultCounts, latestRuns] = await Promise.all([
    results.groupBy({
      by: ['campaignId', 'status'],
      where: { campaignId: { in: campaignIds } },
      _count: { _all: true },
    }),
    runs.findMany({ where: { campaignId: { in: campaignIds } }, orderBy: { createdAt: 'desc' } }),
  ]);
  const statusCountsByCampaignId = new Map<string, Record<string, number>>();
  for (const row of resultCounts) {
    const counts = statusCountsByCampaignId.get(row.campaignId) ?? {};
    counts[row.status] = Number(row._count?._all ?? 0);
    statusCountsByCampaignId.set(row.campaignId, counts);
  }
  const latestRunByCampaignId = new Map<string, any>();
  for (const run of latestRuns) {
    if (!latestRunByCampaignId.has(run.campaignId)) latestRunByCampaignId.set(run.campaignId, run);
  }
  return rows.map((campaign: any) => {
    return {
      ...campaign,
      statusCounts: statusCountsByCampaignId.get(campaign.id) ?? {},
      latestRun: latestRunByCampaignId.get(campaign.id) ?? null,
    };
  });
};

export const queueAffiliateSourceDiscoveryRun = async (
  campaignId: string,
  userId?: string | null,
  requestedRunId?: string | null,
) => {
  const campaign = await db().campaigns.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === 'ARCHIVED') {
    throw new Error('Affiliate source discovery campaign not found or archived.');
  }
  const runId = stringValue(requestedRunId);
  if (runId) {
    const existing = await db().runs.findUnique({ where: { id: runId } });
    if (existing) {
      if (existing.campaignId !== campaignId) {
        throw new Error('Affiliate source discovery run id belongs to another campaign.');
      }
      return existing;
    }
  } else {
    const active = await db().runs.findFirst({
      where: { campaignId, status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: { queuedAt: 'asc' },
    });
    if (active) return active;
  }
  try {
    return await db().runs.create({
      data: {
        id: runId ?? createId(),
        campaignId,
        requestedByUserId: userId ?? null,
        status: 'QUEUED',
        queuedAt: new Date(),
      },
    });
  } catch (error) {
    if (runId) {
      const existing = await db().runs.findUnique({ where: { id: runId } });
      if (existing?.campaignId === campaignId) return existing;
    }
    throw error;
  }
};

const claimDiscoveryRun = async (runId: string | undefined, workerId: string, now: Date) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const queued = runId
      ? await db().runs.findFirst({ where: { id: runId, status: 'QUEUED' } })
      : await db().runs.findFirst({ where: { status: 'QUEUED' }, orderBy: { queuedAt: 'asc' } });
    if (!queued) return null;
    const updated = await db().runs.updateMany({
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
    if (updated.count === 1) return db().runs.findUnique({ where: { id: queued.id } });
    if (runId) return null;
  }
  return null;
};

const exactUrlVariants = (value: string): string[] => {
  const parsed = new URL(value);
  parsed.hash = '';
  const canonical = parsed.toString();
  const variants = new Set([
    canonical,
    canonical.replace(/\/$/, ''),
  ]);
  if ((parsed.pathname === '/' || !parsed.pathname) && !parsed.search) {
    variants.add(parsed.origin);
    variants.add(`${parsed.origin}/`);
  }
  return Array.from(variants);
};

const findSiteIntake = async (
  policyKey: string,
  canonicalUrl: string,
  campaignId: string,
  campaignRegion: string,
) => {
  const linked = await db().results.findFirst({
    where: { campaignId, policyKey, matchingIntakeId: { not: null } },
    orderBy: { score: 'desc' },
    select: { matchingIntakeId: true },
  });
  if (linked?.matchingIntakeId) {
    return db().intakes.findUnique({ where: { id: linked.matchingIntakeId } });
  }
  if (policyKey.includes('/')) return null;
  const origin = new URL(canonicalUrl).origin;
  return db().intakes.findFirst({
    where: {
      region: campaignRegion,
      baseUrl: { in: exactUrlVariants(origin) },
    },
    orderBy: { createdAt: 'asc' },
  });
};

const queueAllowedIntake = async (
  intakeId: string,
  userId: string,
  client: unknown = prisma,
): Promise<void> => {
  const intakeDb = db(client);
  const active = await intakeDb.intakeRuns.findFirst({
    where: { intakeId, status: { in: ['QUEUED', 'RUNNING'] } },
  });
  if (active) return;
  const pages = await intakeDb.pages.findMany({
    where: { intakeId, status: 'ACTIVE' },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    take: 10,
    select: { id: true },
  });
  if (pages.length) {
    await queueAffiliateSourceIntakeRun(
      intakeId,
      pages.map((page: any) => page.id),
      userId,
      { db: client },
    );
  }
};

const promoteDiscoveryResult = async (
  resultId: string,
  userId: string,
  dependencies: Pick<DiscoveryDependencies, 'fetchResource' | 'now'> = {},
  requestedIntakeId?: string | null,
) => {
  const result = await db().results.findUnique({ where: { id: resultId } });
  if (!result) throw new Error('Affiliate source discovery result not found.');
  if (!['NEW', 'REVIEW_REQUIRED'].includes(result.status)) {
    if (result.matchingIntakeId) return db().intakes.findUnique({ where: { id: result.matchingIntakeId } });
    throw new Error(`Discovery result cannot create an intake from status ${result.status}.`);
  }
  const campaign = await db().campaigns.findUnique({ where: { id: result.campaignId } });
  if (!campaign) throw new Error('Affiliate source discovery campaign not found.');
  const resultMetadata = recordValue(result.metadata);
  const discoveryProvider = stringValue(resultMetadata.provider)?.toUpperCase();
  const existingIntake = requestedIntakeId
    ? await db().intakes.findUnique({ where: { id: requestedIntakeId } })
    : result.matchingIntakeId
      ? await db().intakes.findUnique({ where: { id: result.matchingIntakeId } })
      : await findSiteIntake(
        result.policyKey,
        result.canonicalUrl,
        campaign.id,
        campaign.region,
      );
  if (requestedIntakeId && !existingIntake) {
    throw new Error('Requested affiliate source intake not found.');
  }
  const host = new URL(result.canonicalUrl).hostname.replace(/^www\./, '');
  const proposedName = stringValue(result.title)?.replace(/\s+[|–—-]\s+.*$/, '').trim() || host;
  const outcome = await enqueueAffiliateSourceUrl({
    url: result.canonicalUrl,
    organizationName: proposedName,
    region: campaign.region,
    targetKindHints: result.sourceTypeHints,
    sportHints: result.sportHints,
    evidenceUrl: null,
    depth: 0,
  }, {
    userId,
    requestedIntakeId: existingIntake?.id ?? null,
    discoverySource: discoveryProvider === 'SCRAPINGDOG'
      ? 'SCRAPINGDOG_SEARCH'
      : discoveryProvider === 'FIRECRAWL'
        ? 'FIRECRAWL_SEARCH'
        : 'PROVIDER_SEARCH',
    metadata: {
      campaignId: result.campaignId,
      discoveryRunId: result.latestRunId,
      query: result.latestQuery,
      rank: result.latestRank,
      score: result.score,
      reasonCodes: result.reasonCodes,
    },
  }, dependencies);
  const resultStatus = outcome.action.endsWith('BLOCKED')
    ? 'BLOCKED'
    : outcome.action.endsWith('REVIEW_REQUIRED')
      ? 'REVIEW_REQUIRED'
      : outcome.action === 'DUPLICATE'
        ? 'DUPLICATE'
        : 'INTAKE_CREATED';
  await db().results.update({
    where: { id: result.id },
    data: {
      status: resultStatus,
      matchingIntakeId: outcome.intakeId,
      matchingSourceId: outcome.matchingSourceId,
      matchingOrganizationId: outcome.matchingOrganizationId,
    },
  });
  if (!outcome.intakeId) {
    throw new Error(`Discovery result resolved to ${outcome.reason ?? outcome.action} without an intake.`);
  }
  const intake = await db().intakes.findUnique({ where: { id: outcome.intakeId } });
  if (!intake) throw new Error('Promoted affiliate source intake not found.');
  return intake;
};

export const promoteAffiliateSourceDiscoveryResult = async (resultId: string, userId: string) => (
  promoteDiscoveryResult(resultId, userId)
);

export const addAffiliateSourceDiscoveryResultToIntake = async (
  resultId: string,
  intakeId: string,
  userId: string,
) => promoteDiscoveryResult(resultId, userId, {}, intakeId);

export const applyAffiliateSourceDomainPolicy = async (
  policyKey: string,
  input: AffiliateSourceDomainPolicyReview,
  userId: string,
  options: { db?: unknown } = {},
) => {
  const review = affiliateSourceDomainPolicyReviewSchema.parse(input);
  const policyClient = options.db ?? prisma;
  const policyDb = db(policyClient);
  const now = new Date();
  const previousPolicy = await policyDb.policies.findUnique({ where: { policyKey } });
  const previousEvidence = recordValue(previousPolicy?.evidence);
  const reviewHistory = Array.isArray(previousEvidence.reviewHistory) ? previousEvidence.reviewHistory : [];
  const evidence = {
    ...previousEvidence,
    ...recordValue(review.evidence),
    reviewHistory: [...reviewHistory, {
      reviewedAt: now.toISOString(),
      reviewedByUserId: userId,
      previousStatus: previousPolicy?.status ?? null,
      status: review.status,
      termsUrl: review.termsUrl ?? null,
      robotsSummary: review.robotsSummary ?? null,
      restrictionNotes: review.restrictionNotes ?? null,
    }].slice(-20),
  };
  const policy = await policyDb.policies.upsert({
    where: { policyKey },
    create: {
      id: createId(),
      policyKey,
      ...review,
      expiresAt: review.status === 'ALLOWED' ? review.expiresAt ?? policyExpiry(now) : review.expiresAt,
      reviewedByUserId: userId,
      reviewedAt: now,
      evidence,
    },
    update: {
      ...review,
      expiresAt: review.status === 'ALLOWED' ? review.expiresAt ?? policyExpiry(now) : review.expiresAt,
      reviewedByUserId: userId,
      reviewedAt: now,
      evidence,
    },
  });
  const resultRows = await policyDb.results.findMany({
    where: { policyKey, matchingIntakeId: { not: null } },
    select: { id: true, matchingIntakeId: true },
  });
  const directIntakeIds = await findAffiliateIntakeIdsForPolicyKey(policyClient as any, policyKey);
  const intakeIds = Array.from(new Set([
    ...resultRows.map((row: any) => row.matchingIntakeId).filter(Boolean),
    ...directIntakeIds,
  ])).sort() as string[];
  for (const intakeId of intakeIds) {
    await reviewAffiliateSourceIntakePolicy(intakeId, {
      complianceStatus: review.status,
      termsUrl: review.termsUrl,
      notes: review.restrictionNotes,
    }, userId, { db: policyClient });
    if (review.status === 'ALLOWED') await queueAllowedIntake(intakeId, userId, policyClient);
  }
  const reviewableStatuses = ['NEW', 'INTAKE_CREATED', 'REVIEW_REQUIRED', 'BLOCKED'];
  if (review.status === 'BLOCKED') {
    await policyDb.results.updateMany({ where: { policyKey, status: { in: reviewableStatuses } }, data: { status: 'BLOCKED' } });
  } else if (review.status === 'NEEDS_REVIEW') {
    await policyDb.results.updateMany({ where: { policyKey, status: { in: reviewableStatuses } }, data: { status: 'REVIEW_REQUIRED' } });
  } else {
    await policyDb.results.updateMany({ where: { policyKey, matchingIntakeId: { not: null }, status: { in: reviewableStatuses } }, data: { status: 'INTAKE_CREATED' } });
    await policyDb.results.updateMany({ where: { policyKey, matchingIntakeId: null, status: { in: reviewableStatuses } }, data: { status: 'NEW' } });
  }
  return { policy, intakeIds, queuedIntakeCount: review.status === 'ALLOWED' ? intakeIds.length : 0 };
};

const persistDiscoveryResult = async (input: {
  campaign: any;
  run: any;
  query: any;
  rank: number;
  row: any;
  evaluation: ReturnType<typeof evaluateAffiliateSourceDiscoveryResult>;
  now: Date;
}) => {
  const { campaign, run, query, rank, row, evaluation, now } = input;
  const originalUrl = stringValue(row.url) ?? 'missing-url';
  const fallbackCanonical = evaluation.canonicalUrl
    ?? `https://invalid-source.invalid/${affiliateDiscoveryUrlKey(originalUrl)}`;
  const urlKey = affiliateDiscoveryUrlKey(fallbackCanonical);
  const duplicate = evaluation.canonicalUrl && evaluation.policyKey
    ? await findAffiliateSourceUrlDuplicate(evaluation.canonicalUrl)
    : null;
  const siteIntake = !duplicate && evaluation.canonicalUrl && evaluation.policyKey
    ? await findSiteIntake(
      evaluation.policyKey,
      evaluation.canonicalUrl,
      campaign.id,
      campaign.region,
    )
    : null;
  const status = duplicate?.status ?? evaluation.status;
  const reasonCodes = duplicate
    ? Array.from(new Set([...evaluation.reasonCodes, duplicate.reason]))
    : evaluation.reasonCodes;
  const existing = await db().results.findUnique({
    where: { campaignId_urlKey: { campaignId: campaign.id, urlKey } },
  });
  const incomingEvaluation = {
    latestQuery: query.query,
    latestRank: rank,
    score: evaluation.score,
    sourceTypeHints: evaluation.sourceTypeHints,
    sportHints: evaluation.sportHints,
    status,
    reasonCodes,
    reasonDetails: {
      reasons: evaluation.reasons,
      classification: evaluation.classification,
      autoPromotionEligible: evaluation.autoPromotionEligible,
      queryProfile: query.templateKey ?? null,
      queryTarget: query.targetCity ?? campaign.location ?? campaign.region,
    },
    metadata: {
      category: row.category ?? null,
      provider: stringValue(row.provider)?.toUpperCase() ?? null,
      estimatedCredits: typeof row.estimatedCredits === 'number' ? row.estimatedCredits : null,
      classification: evaluation.classification,
      autoPromotionEligible: evaluation.autoPromotionEligible,
    },
  };
  const statusPriority: Record<string, number> = {
    NEW: 3,
    REVIEW_REQUIRED: 2,
    REJECTED: 1,
  };
  const existingIsStrongerInThisRun = Boolean(
    existing
    && existing.latestRunId === run.id
    && !duplicate
    && (
      existing.score > evaluation.score
      || (
        existing.score === evaluation.score
        && (statusPriority[existing.status] ?? 0) > (statusPriority[status] ?? 0)
      )
    ),
  );
  const retainedEvaluation = existingIsStrongerInThisRun
    ? {
      latestQuery: existing.latestQuery,
      latestRank: existing.latestRank,
      score: existing.score,
      sourceTypeHints: existing.sourceTypeHints,
      sportHints: existing.sportHints,
      status: existing.status,
      reasonCodes: existing.reasonCodes,
      reasonDetails: existing.reasonDetails,
      metadata: existing.metadata,
    }
    : incomingEvaluation;
  const common = {
    latestRunId: run.id,
    originalUrl: row.url,
    canonicalUrl: fallbackCanonical,
    policyKey: evaluation.policyKey ?? 'invalid-source.invalid',
    title: stringValue(row.title),
    description: stringValue(row.description),
    lastSeenAt: now,
    ...retainedEvaluation,
    matchingIntakeId: duplicate?.matchingIntakeId ?? siteIntake?.id ?? existing?.matchingIntakeId ?? null,
    matchingSourceId: duplicate?.matchingSourceId ?? existing?.matchingSourceId ?? null,
    matchingOrganizationId: duplicate?.matchingOrganizationId ?? existing?.matchingOrganizationId ?? null,
  };
  const saved = existing
    ? await db().results.update({
      where: { id: existing.id },
      data: { ...common, seenCount: { increment: 1 } },
    })
    : await db().results.create({
      data: {
        id: createId(),
        campaignId: campaign.id,
        urlKey,
        firstSeenAt: now,
        seenCount: 1,
        ...common,
      },
    });
  return {
    saved,
    isNew: !existing,
    duplicate: Boolean(duplicate),
    autoPromotionEligible: Boolean(
      recordValue(saved.reasonDetails).autoPromotionEligible,
    ),
  };
};

export const processNextAffiliateSourceDiscoveryRun = async (
  options: { runId?: string; workerId?: string; maxQueries?: number; maxResultsPerQuery?: number } = {},
  dependencies: DiscoveryDependencies = {},
) => {
  const now = dependencies.now?.() ?? new Date();
  const workerId = dependencies.workerId ?? options.workerId ?? `affiliate-discovery-${process.pid}`;
  const run = await claimDiscoveryRun(stringValue(options.runId) ?? undefined, workerId, now);
  if (!run) return null;
  const campaign = await db().campaigns.findUnique({ where: { id: run.campaignId } });
  if (!campaign) {
    return db().runs.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: now, errorMessage: 'Campaign not found.' } });
  }
  const unorderedSports = await db().sports.findMany({
    where: { id: { in: campaign.sportIds } },
    select: { id: true, name: true },
  });
  const sports = campaign.sportIds.flatMap((sportId: string) => {
    const sport = unorderedSports.find((row: { id: string }) => row.id === sportId);
    return sport ? [sport] : [];
  });
  const maxQueries = Number.isInteger(options.maxQueries)
    ? Math.max(1, Math.min(50, Number(options.maxQueries)))
    : campaign.maxQueriesPerRun;
  const maxResultsPerQuery = Number.isInteger(options.maxResultsPerQuery)
    ? Math.max(1, Math.min(20, Number(options.maxResultsPerQuery)))
    : campaign.maxResultsPerQuery;
  const generated = generateAffiliateSourceDiscoveryQueries(
    { ...campaign, maxQueriesPerRun: maxQueries },
    sports,
    campaign.queryCursor ?? 0,
  );
  const client: AffiliateSourceSearchClient | AffiliateFirecrawlClient = dependencies.searchClient
    ?? dependencies.firecrawlClient
    ?? createAffiliateSourceSearchClient();
  const providerJobIds: string[] = [];
  const requestSummaries: JsonRecord[] = [];
  let estimatedCredits = 0;
  let returnedResultCount = 0;
  let newResultCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  let createdIntakeCount = 0;
  const outcomes = {
    newEligible: 0,
    newReview: 0,
    newRejected: 0,
    duplicate: 0,
    existingUpdated: 0,
    autoIntakeCreated: 0,
  };
  const errors: string[] = [];

  for (const query of generated.queries) {
    const priorPolicyKeys = await findPreviouslyQualifiedPolicyKeys(query);
    const qualifiedPolicyKeys = new Set<string>();
    let queryIntakeCreatedCount = 0;
    let queryDuplicateCount = 0;
    let queryRejectedCount = 0;
    let queryReturnedResultCount = 0;
    const providerName = (): string => (
      'provider' in client && typeof client.provider === 'string' ? client.provider : 'FIRECRAWL'
    );
    try {
      const search = await client.searchSources(query.query, {
        limit: maxResultsPerQuery,
        location: [query.targetCity, query.targetState].filter(Boolean).join(', ')
          || campaign.location
          || campaign.region,
      });
      queryReturnedResultCount = search.rows.length;
      returnedResultCount += search.rows.length;
      if (search.providerJobId) providerJobIds.push(search.providerJobId);
      estimatedCredits += search.estimatedCredits ?? 0;
      requestSummaries.push({
        provider: search.provider ?? providerName(),
        estimatedCredits: search.estimatedCredits ?? null,
        request: search.request,
        response: search.response,
      });
      for (const [index, row] of search.rows.entries()) {
        const evaluation = evaluateAffiliateSourceDiscoveryResult({
          ...row,
          query,
          campaignRegion: campaign.region,
          selectedSports: sports,
          currentYear: now.getFullYear(),
          now,
        });
        const isQualifiedDirect = (
          evaluation.classification === 'DIRECT_SOURCE'
          && evaluation.score >= AFFILIATE_DISCOVERY_REVIEW_SCORE
          && Boolean(evaluation.policyKey)
        );
        const persisted = await persistDiscoveryResult({
          campaign,
          run,
          query,
          rank: index + 1,
          row: {
            ...row,
            provider: search.provider ?? providerName(),
            estimatedCredits: search.estimatedCredits ?? null,
          },
          evaluation,
          now,
        });
        let linkedQualifiedPolicyKey = Boolean(
          isQualifiedDirect
          && (
            persisted.saved.matchingIntakeId
            || persisted.saved.matchingSourceId
            || persisted.saved.matchingOrganizationId
          )
          && evaluation.policyKey,
        );
        if (persisted.duplicate) {
          queryDuplicateCount += 1;
          duplicateCount += 1;
        }
        if (persisted.saved.status === 'REJECTED') {
          queryRejectedCount += 1;
          rejectedCount += 1;
        }
        const shouldAutoPromote = (
          campaign.autoCreateIntakes
          && persisted.saved.status === 'NEW'
          && persisted.saved.score >= AFFILIATE_DISCOVERY_AUTO_INTAKE_SCORE
          && persisted.autoPromotionEligible
        );
        if (shouldAutoPromote) {
          await promoteDiscoveryResult(
            persisted.saved.id,
            run.requestedByUserId ?? 'affiliate-discovery',
            dependencies,
          );
          queryIntakeCreatedCount += 1;
          createdIntakeCount += 1;
          outcomes.autoIntakeCreated += 1;
          linkedQualifiedPolicyKey = isQualifiedDirect;
        } else if (persisted.duplicate) {
          outcomes.duplicate += 1;
        } else if (!persisted.isNew) {
          outcomes.existingUpdated += 1;
        } else if (persisted.saved.status === 'REJECTED') {
          outcomes.newRejected += 1;
        } else if (persisted.saved.status === 'NEW') {
          outcomes.newEligible += 1;
        } else {
          outcomes.newReview += 1;
        }
        if (linkedQualifiedPolicyKey && evaluation.policyKey) qualifiedPolicyKeys.add(evaluation.policyKey);
      }
      const newQualifiedPolicyKeys = [...qualifiedPolicyKeys].filter((key) => !priorPolicyKeys.has(key));
      await persistQueryExecution({
        run,
        query,
        provider: search.provider ?? providerName(),
        status: 'SUCCEEDED',
        returnedResultCount: queryReturnedResultCount,
        qualifiedPolicyKeys: [...qualifiedPolicyKeys].sort(),
        newQualifiedPolicyKeys: newQualifiedPolicyKeys.sort(),
        intakeCreatedCount: queryIntakeCreatedCount,
        duplicateCount: queryDuplicateCount,
        rejectedCount: queryRejectedCount,
        metadata: { providerJobId: search.providerJobId ?? null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown search failure';
      const errorCode = normalizedDiscoveryErrorCode(error);
      errors.push(`${query.query}: ${message}`);
      await persistQueryExecution({
        run,
        query,
        provider: providerName(),
        status: 'FAILED',
        returnedResultCount: queryReturnedResultCount,
        qualifiedPolicyKeys: [],
        newQualifiedPolicyKeys: [],
        intakeCreatedCount: queryIntakeCreatedCount,
        duplicateCount: queryDuplicateCount,
        rejectedCount: queryRejectedCount,
        errorCode,
      });
    }
  }
  const finishedAt = dependencies.now?.() ?? new Date();
  const status = errors.length === generated.queries.length
    ? 'FAILED'
    : errors.length ? 'PARTIAL' : 'SUCCEEDED';
  newResultCount = outcomes.newEligible
    + outcomes.newReview
    + outcomes.newRejected
    + outcomes.autoIntakeCreated;
  duplicateCount = outcomes.duplicate;
  rejectedCount = outcomes.newRejected;
  const summary = {
    queries: generated.queries,
    executionLimits: { maxQueries, maxResultsPerQuery },
    estimatedCredits,
    outcomes,
    provider: requestSummaries.slice(0, 50),
    errors,
  };
  const updated = await db().runs.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt,
      generatedQueryCount: generated.queries.length,
      returnedResultCount,
      newResultCount,
      duplicateCount,
      rejectedCount,
      createdIntakeCount,
      providerJobIds: Array.from(new Set(providerJobIds)),
      errorMessage: status === 'FAILED' ? errors[0] ?? 'Discovery failed.' : null,
      summary,
    },
  });
  await db().campaigns.update({
    where: { id: campaign.id },
    data: {
      lastRunAt: finishedAt,
      nextRunAt: campaign.status === 'ACTIVE'
        ? status !== 'FAILED' && generated.nextCursor !== 0
          ? finishedAt
          : nextRunAt(finishedAt, campaign.searchIntervalMinutes)
        : null,
      queryCursor: status === 'FAILED' ? campaign.queryCursor ?? 0 : generated.nextCursor,
    },
  });
  return { run: updated, summary };
};
const REPLENISHMENT_RETRY_MS = 15 * 60 * 1000;
const ACTIVE_CAPTURE_RUN_STATUSES = new Set(['QUEUED', 'RUNNING', 'CLAIMED']);

export type AffiliateReplenishmentCampaignWaveDependencies = Readonly<{
  searchClient?: AffiliateSourceSearchClient;
  firecrawlClient?: AffiliateFirecrawlClient;
  captureClient?: AffiliateSourceCaptureClient;
  fallbackCaptureClient?: AffiliateSourceCaptureClient | null;
  fetchResource?: typeof fetchBoundedPublicResource;
  now?: () => Date;
  workerId?: string;
}>;

const replenishmentEvidenceRefs = (values: readonly (string | null | undefined)[]): string[] => (
  Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
);

const latestRowsByIntakeId = (rows: readonly any[]): Map<string, any> => {
  const latest = new Map<string, any>();
  for (const row of rows) {
    const intakeId = stringValue(row.intakeId);
    if (intakeId && !latest.has(intakeId)) latest.set(intakeId, row);
  }
  return latest;
};

type AffiliateReplenishmentHandoffRows = Readonly<{
  intakeRows: Array<Pick<AffiliateSourceIntakes, 'id' | 'status'>>;
  captureRows: Array<Pick<AffiliateSourceIntakeRuns, 'id' | 'intakeId' | 'status' | 'errorMessage'>>;
  mappingRows: Array<Pick<AffiliateSourceMappingJobs, 'id' | 'intakeId' | 'status'>>;
}>;

const loadAffiliateReplenishmentHandoffRows = async (
  intakeIds: readonly string[],
): Promise<AffiliateReplenishmentHandoffRows> => {
  const [intakeRows, captureRows, mappingRows] = await Promise.all([
    db().intakes.findMany({
      where: { id: { in: intakeIds } },
      select: { id: true, status: true },
    }),
    db().intakeRuns.findMany({
      where: { intakeId: { in: intakeIds } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, intakeId: true, status: true, errorMessage: true },
    }),
    db().mappingJobs.findMany({
      where: { intakeId: { in: intakeIds } },
      select: { id: true, intakeId: true, status: true },
    }),
  ]);
  return {
    intakeRows,
    captureRows,
    mappingRows,
  };
};
/**
 * Execute one bounded discovery wave and wait for its capture-to-mapping handoff.
 *
 * The wave stores the discovery run id in its result. Later reconciliations
 * resume that run and never create a second run for the same wave.
 */
export const runAffiliateReplenishmentCampaignWave = async (
  input: Readonly<{
    wave: AffiliateReplenishmentWaves;
    demand: AffiliateReplenishmentDemands;
    contract: unknown;
  }>,
  dependencies: AffiliateReplenishmentCampaignWaveDependencies = {},
): Promise<AffiliateReplenishmentWaveExecutionResult> => {
  const now = dependencies.now?.() ?? new Date();
  const waveResult = recordValue(input.wave?.resultJson);
  const evidenceRefs = replenishmentEvidenceRefs([
    `demand:${stringValue(input.demand?.id) ?? 'unknown'}`,
    `wave:${stringValue(input.wave?.id) ?? 'unknown'}`,
    stringValue(input.wave?.campaignId) ? `campaign:${String(input.wave.campaignId)}` : null,
    stringValue(waveResult.discoveryRunId) ? `discovery-run:${String(waveResult.discoveryRunId)}` : null,
  ]);
  let campaignId = stringValue(input.wave?.campaignId);
  let coveragePlanningJob: {
    status?: string | null;
    result?: unknown;
    errorMessage?: string | null;
  } | null = null;
  let coveragePlanningJobId = stringValue(input.wave?.coveragePlanningJobId);

  if (!campaignId && coveragePlanningJobId) {
    coveragePlanningJob = await (prisma as any).affiliateCoverageAgentJobs?.findUnique?.({
      where: { id: coveragePlanningJobId },
    });
    const coverageResult = recordValue(coveragePlanningJob?.result);
    campaignId = stringValue(
      coverageResult.campaignId
      ?? coverageResult.selectedCampaignId
      ?? recordValue(coverageResult.campaign).id,
    );
    if (campaignId && (prisma as any).affiliateReplenishmentWaves?.update) {
      await (prisma as any).affiliateReplenishmentWaves.update({
        where: { id: input.wave.id },
        data: { campaignId },
      });
    }
  }

  if (!campaignId) {
    const coverageStatus = coveragePlanningJob
      ? String(coveragePlanningJob.status ?? 'QUEUED').toUpperCase()
      : 'MISSING';
    const coverageResult = recordValue(coveragePlanningJob?.result);
    const coverageDecision = String(coverageResult.decision ?? '').toUpperCase();
    const coverageRetryValue = coverageResult.retryAt ?? coverageResult.nextEligibleAt;
    const parsedRetryAt = coverageRetryValue instanceof Date
      ? coverageRetryValue
      : typeof coverageRetryValue === 'string'
        ? new Date(coverageRetryValue)
        : null;
    const retryAt = parsedRetryAt && !Number.isNaN(parsedRetryAt.getTime())
      ? parsedRetryAt
      : null;
    const coverageEvidenceRefs = replenishmentEvidenceRefs([
      ...evidenceRefs,
      coveragePlanningJobId ? `coverage-job:${coveragePlanningJobId}` : null,
      ...stringValues(coverageResult.evidenceRefs),
    ]);
    const baseResult = {
      coveragePlanningJobId,
      status: coverageStatus,
      decision: coverageDecision || null,
      errorMessage: coveragePlanningJob?.errorMessage ?? null,
    };
    if (['QUEUED', 'RUNNING', 'CLAIMED'].includes(coverageStatus)) {
      return {
        status: 'WAITING',
        provider: 'COVERAGE_PLANNER',
        providerOperationKey: coveragePlanningJobId
          ? `affiliate-replenishment:coverage:${coveragePlanningJobId}`
          : `affiliate-replenishment:wave:${String(input.wave?.id ?? 'unknown')}`,
        retryAt,
        result: baseResult,
        evidenceRefs: coverageEvidenceRefs,
      };
    }
    if (
      ['FAILED', 'RETRY_SCHEDULED'].includes(coverageStatus)
      || coverageDecision === 'RETRY_LATER'
    ) {
      return {
        status: 'FAILED',
        provider: 'COVERAGE_PLANNER',
        providerOperationKey: coveragePlanningJobId
          ? `affiliate-replenishment:coverage:${coveragePlanningJobId}`
          : `affiliate-replenishment:wave:${String(input.wave?.id ?? 'unknown')}`,
        retryAt: retryAt ?? new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
        marginalYield: null,
        errorCode: 'COVERAGE_PLANNING_RETRY',
        result: baseResult,
        evidenceRefs: coverageEvidenceRefs,
      };
    }
    if (coverageDecision === 'SATURATED_NO_YIELD') {
      return {
        status: 'SUCCEEDED',
        provider: 'COVERAGE_PLANNER',
        providerOperationKey: coveragePlanningJobId
          ? `affiliate-replenishment:coverage:${coveragePlanningJobId}`
          : `affiliate-replenishment:wave:${String(input.wave?.id ?? 'unknown')}`,
        searchSaturatedUntil: retryAt ?? new Date(now.getTime() + 24 * 60 * 60 * 1000),
        marginalYield: 0,
        result: baseResult,
        evidenceRefs: coverageEvidenceRefs,
      };
    }
    if (coverageDecision === 'WAITING_FOR_PIPELINE') {
      return {
        status: 'WAITING',
        provider: 'COVERAGE_PLANNER',
        providerOperationKey: coveragePlanningJobId
          ? `affiliate-replenishment:coverage:${coveragePlanningJobId}`
          : `affiliate-replenishment:wave:${String(input.wave?.id ?? 'unknown')}`,
        retryAt: retryAt ?? new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
        result: baseResult,
        evidenceRefs: coverageEvidenceRefs,
      };
    }
    return {
      status: 'PAUSED',
      provider: 'COVERAGE_PLANNER',
      providerOperationKey: coveragePlanningJobId
        ? `affiliate-replenishment:coverage:${coveragePlanningJobId}`
        : `affiliate-replenishment:wave:${String(input.wave?.id ?? 'unknown')}`,
      errorCode: coverageDecision === 'HUMAN_REVIEW_REQUIRED'
        ? 'COVERAGE_PLANNING_HUMAN_REVIEW_REQUIRED'
        : coverageDecision === 'SOURCE_EXCLUDED' || coverageStatus === 'EXCLUDED'
          ? 'COVERAGE_PLANNING_SOURCE_EXCLUDED'
          : 'COVERAGE_PLANNING_NO_CAMPAIGN',
      result: baseResult,
      evidenceRefs: coverageEvidenceRefs,
    };
  }

  let discoveryRunId = stringValue(waveResult.discoveryRunId);
  if (!discoveryRunId) {
    try {
      const deterministicRunId = `affiliate-replenishment-discovery-${input.wave.id}`;
      const queued = await queueAffiliateSourceDiscoveryRun(
        campaignId,
        'affiliate-replenishment',
        deterministicRunId,
      );
      discoveryRunId = String(queued.id);
      const waves = (prisma as any).affiliateReplenishmentWaves;
      if (waves?.updateMany) {
        const persisted = await waves.updateMany({
          where: { id: input.wave.id, providerOperationKey: null },
          data: {
            providerOperationKey: `affiliate-replenishment:wave:${input.wave.id}:discovery`,
            resultJson: { ...waveResult, discoveryRunId },
          },
        });
        if (persisted.count !== 1 && waves.findUnique) {
          const currentWave = await waves.findUnique({ where: { id: input.wave.id } });
          const currentDiscoveryRunId = stringValue(
            recordValue(currentWave?.resultJson).discoveryRunId,
          );
          if (currentDiscoveryRunId) discoveryRunId = currentDiscoveryRunId;
        }
      } else if (waves?.update) {
        await waves.update({
          where: { id: input.wave.id },
          data: { resultJson: { ...waveResult, discoveryRunId } },
        });
      }
      if (String(queued.status).toUpperCase() === 'QUEUED') {
        await processNextAffiliateSourceDiscoveryRun(
          { runId: discoveryRunId, workerId: dependencies.workerId },
          {
            ...(dependencies.searchClient ? { searchClient: dependencies.searchClient } : {}),
            ...(dependencies.firecrawlClient ? { firecrawlClient: dependencies.firecrawlClient } : {}),
            ...(dependencies.now ? { now: dependencies.now } : {}),
            ...(dependencies.workerId ? { workerId: dependencies.workerId } : {}),
          },
        );
      }
    } catch (error) {
      return {
        status: 'FAILED',
        provider: 'AFFILIATE_DISCOVERY',
        providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId ?? campaignId}`,
        retryAt: new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
        marginalYield: null,
        errorCode: 'DISCOVERY_PROVIDER_FAILURE',
        result: {
          campaignId,
          discoveryRunId,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        evidenceRefs,
      };
    }
  }

  const discoveryRun = await db().runs.findUnique({ where: { id: discoveryRunId } });
  const runStatus = String(discoveryRun?.status ?? '').toUpperCase();
  const runEvidenceRefs = replenishmentEvidenceRefs([
    ...evidenceRefs,
    `discovery-run:${discoveryRunId}`,
  ]);
  if (!discoveryRun) {
    return {
      status: 'FAILED',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
      retryAt: new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
      marginalYield: null,
      errorCode: 'DISCOVERY_RUN_NOT_FOUND',
      result: { discoveryRunId, campaignId },
      evidenceRefs: runEvidenceRefs,
    };
  }
  if (['QUEUED', 'RUNNING'].includes(runStatus)) {
    return {
      status: 'WAITING',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
      result: { discoveryRunId, campaignId, status: runStatus },
      evidenceRefs: runEvidenceRefs,
    };
  }
  if (runStatus === 'FAILED') {
    return {
      status: 'FAILED',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
      retryAt: new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
      marginalYield: null,
      errorCode: 'DISCOVERY_PROVIDER_FAILURE',
      result: { discoveryRunId, campaignId, errorMessage: discoveryRun.errorMessage ?? null },
      evidenceRefs: runEvidenceRefs,
    };
  }

  const resultRows = await db().results.findMany({
    where: { latestRunId: discoveryRunId },
    select: { matchingIntakeId: true, status: true },
  });
  const intakeIds: string[] = Array.from(new Set<string>(
    resultRows
      .map((row: any) => stringValue(row.matchingIntakeId))
      .filter((value: string | null): value is string => Boolean(value)),
  ));
  const summary = recordValue(discoveryRun.summary);
  const providerErrors = Array.isArray(summary.errors) ? summary.errors : [];
  if (runStatus === 'PARTIAL' && providerErrors.length > 0) {
    return {
      status: 'FAILED',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
      retryAt: new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
      marginalYield: null,
      errorCode: 'DISCOVERY_PROVIDER_FAILURE',
      result: { discoveryRunId, campaignId, intakeIds, errors: providerErrors },
      evidenceRefs: runEvidenceRefs,
    };
  }

  if (intakeIds.length === 0) {
    return {
      status: 'SUCCEEDED',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
      marginalYield: 0,
      result: { discoveryRunId, campaignId, intakeIds: [], mappingJobIds: [] },
      evidenceRefs: runEvidenceRefs,
    };
  }

  let { intakeRows, captureRows, mappingRows } = await loadAffiliateReplenishmentHandoffRows(intakeIds);
  const queuedCapture = captureRows.find((row: any) => (
    intakeIds.includes(String(row.intakeId))
    && String(row.status ?? '').toUpperCase() === 'QUEUED'
  ));
  if (queuedCapture) {
    try {
      await processNextAffiliateSourceIntakeRun(
        {
          runId: String(queuedCapture.id),
          ...(dependencies.workerId ? { workerId: dependencies.workerId } : {}),
        },
        {
          ...(dependencies.captureClient ? { captureClient: dependencies.captureClient } : {}),
          ...(dependencies.fallbackCaptureClient !== undefined
            ? { fallbackCaptureClient: dependencies.fallbackCaptureClient }
            : {}),
          ...(dependencies.fetchResource ? { fetchResource: dependencies.fetchResource } : {}),
          ...(dependencies.now ? { now: dependencies.now } : {}),
          ...(dependencies.workerId ? { workerId: dependencies.workerId } : {}),
        },
      );
    } catch (error) {
      return {
        status: 'FAILED',
        provider: 'AFFILIATE_CAPTURE',
        providerOperationKey: `affiliate-replenishment:capture:${queuedCapture.id}`,
        retryAt: new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
        marginalYield: null,
        errorCode: 'CAPTURE_PROVIDER_FAILURE',
        result: {
          discoveryRunId,
          campaignId,
          intakeIds,
          captureRunId: queuedCapture.id,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        evidenceRefs: replenishmentEvidenceRefs([
          ...runEvidenceRefs,
          `capture-run:${queuedCapture.id}`,
        ]),
      };
    }
    const refreshedHandoffRows = await loadAffiliateReplenishmentHandoffRows(intakeIds);
    intakeRows = refreshedHandoffRows.intakeRows;
    captureRows = refreshedHandoffRows.captureRows;
    mappingRows = refreshedHandoffRows.mappingRows;
  }
  const latestCaptureByIntake = latestRowsByIntakeId(captureRows);
  const activeCapture = intakeIds.find((intakeId) => (
    ACTIVE_CAPTURE_RUN_STATUSES.has(String(latestCaptureByIntake.get(intakeId)?.status ?? '').toUpperCase())
    || ['QUEUED', 'CAPTURING'].includes(String(intakeRows.find((row: any) => row.id === intakeId)?.status ?? '').toUpperCase())
  ));
  if (activeCapture) {
    return {
      status: 'WAITING',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
      result: {
        discoveryRunId,
        campaignId,
        intakeIds,
        mappingJobIds: mappingRows.map((row: any) => row.id),
        waitingFor: `capture:${activeCapture}`,
      },
      evidenceRefs: replenishmentEvidenceRefs([
        ...runEvidenceRefs,
        `intake:${activeCapture}`,
      ]),
    };
  }
  const failedCapture = intakeIds
    .map((intakeId) => latestCaptureByIntake.get(intakeId))
    .find((row) => ['FAILED', 'BLOCKED'].includes(String(row?.status ?? '').toUpperCase()));
  if (failedCapture) {
    return {
      status: 'FAILED',
      provider: 'AFFILIATE_DISCOVERY',
      providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
      retryAt: new Date(now.getTime() + REPLENISHMENT_RETRY_MS),
      marginalYield: null,
      errorCode: String(failedCapture.status).toUpperCase() === 'BLOCKED'
        ? 'CAPTURE_BLOCKED'
        : 'CAPTURE_PROVIDER_FAILURE',
      result: {
        discoveryRunId,
        campaignId,
        intakeIds,
        errorMessage: failedCapture.errorMessage ?? null,
      },
      evidenceRefs: runEvidenceRefs,
    };
  }

  const mappingJobIds: string[] = mappingRows.map((row: any) => String(row.id));
  return {
    status: 'SUCCEEDED',
    provider: 'AFFILIATE_DISCOVERY',
    providerOperationKey: `affiliate-replenishment:discovery:${discoveryRunId}`,
    marginalYield: mappingJobIds.length,
    result: {
      discoveryRunId,
      campaignId,
      intakeIds,
      mappingJobIds,
      demandId: stringValue(input.demand?.id),
    },
    evidenceRefs: replenishmentEvidenceRefs([
      ...runEvidenceRefs,
      ...intakeIds.map((intakeId) => `intake:${intakeId}`),
      ...mappingJobIds.map((mappingJobId) => `mapping-job:${mappingJobId}`),
    ]),
  };
};

export const listAffiliateSourceDiscoveryResults = async (filters: {
  campaignId?: string | null;
  status?: string | null;
  query?: string | null;
  policyKey?: string | null;
  sourceType?: string | null;
  sportHint?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  page?: number;
  pageSize?: number;
} = {}) => {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 50));
  const where: JsonRecord = {
    ...(stringValue(filters.campaignId) ? { campaignId: stringValue(filters.campaignId) } : {}),
    ...(stringValue(filters.status) ? { status: stringValue(filters.status)?.toUpperCase() } : {}),
    ...(stringValue(filters.policyKey) ? { policyKey: stringValue(filters.policyKey) } : {}),
    ...(stringValue(filters.sourceType) ? { sourceTypeHints: { has: stringValue(filters.sourceType)?.toUpperCase() } } : {}),
    ...(stringValue(filters.sportHint) ? { sportHints: { has: stringValue(filters.sportHint) } } : {}),
    ...((typeof filters.minScore === 'number' && Number.isFinite(filters.minScore))
      || (typeof filters.maxScore === 'number' && Number.isFinite(filters.maxScore)) ? {
        score: {
          ...(typeof filters.minScore === 'number' && Number.isFinite(filters.minScore) ? { gte: filters.minScore } : {}),
          ...(typeof filters.maxScore === 'number' && Number.isFinite(filters.maxScore) ? { lte: filters.maxScore } : {}),
        },
      } : {}),
    ...(stringValue(filters.query) ? {
      OR: [
        { title: { contains: stringValue(filters.query), mode: 'insensitive' } },
        { description: { contains: stringValue(filters.query), mode: 'insensitive' } },
        { canonicalUrl: { contains: stringValue(filters.query), mode: 'insensitive' } },
      ],
    } : {}),
  };
  const [rows, total] = await Promise.all([
    db().results.findMany({
      where,
      orderBy: [{ score: 'desc' }, { lastSeenAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db().results.count({ where }),
  ]);
  return { rows, total, page, pageSize, hasMore: page * pageSize < total };
};

export const updateAffiliateSourceDiscoveryResult = async (
  resultId: string,
  input: { action: 'REJECT' | 'RETRY_CLASSIFICATION' },
) => {
  const result = await db().results.findUnique({ where: { id: resultId } });
  if (!result) throw new Error('Affiliate source discovery result not found.');
  return db().results.update({
    where: { id: resultId },
    data: input.action === 'REJECT'
      ? { status: 'REJECTED', reasonCodes: Array.from(new Set([...result.reasonCodes, 'ADMIN_REJECTED'])) }
      : { status: 'REVIEW_REQUIRED', reasonCodes: result.reasonCodes.filter((code: string) => code !== 'ADMIN_REJECTED') },
  });
};

export const bulkUpdateAffiliateSourceDiscoveryResults = async (
  resultIds: string[],
  action: 'REJECT' | 'PROMOTE',
  userId: string,
) => {
  const ids = Array.from(new Set(resultIds.map((value) => value.trim()).filter(Boolean))).slice(0, 100);
  if (!ids.length) throw new Error('Select at least one discovery result.');
  const results: Array<{ id: string; status: string; intakeId?: string }> = [];
  for (const id of ids) {
    if (action === 'REJECT') {
      const row = await updateAffiliateSourceDiscoveryResult(id, { action: 'REJECT' });
      results.push({ id, status: row.status });
    } else {
      const intake = await promoteDiscoveryResult(id, userId);
      results.push({ id, status: 'INTAKE_CREATED', intakeId: intake.id });
    }
  }
  return results;
};

export const getAffiliateSourceDiscoveryRunContext = async (runId: string) => {
  const run = await db().runs.findUnique({ where: { id: runId } });
  if (!run) throw new Error('Affiliate source discovery run not found.');
  const [campaign, results] = await Promise.all([
    db().campaigns.findUnique({ where: { id: run.campaignId } }),
    db().results.findMany({ where: { latestRunId: runId }, orderBy: [{ score: 'desc' }, { latestRank: 'asc' }] }),
  ]);
  return { run, campaign, results };
};

export type RecoveredAffiliateSourceDiscoveryRun = {
  discoveryRunId: string;
  campaignId: string;
  workerId: string | null;
  startedAt: Date | null;
  recoveredAt: Date;
  reason: string;
};

export const recoverStaleAffiliateSourceDiscoveryRuns = async (options: {
  now?: Date;
  maxAgeMs?: number;
  limit?: number;
} = {}): Promise<RecoveredAffiliateSourceDiscoveryRun[]> => {
  const now = options.now ?? new Date();
  const requestedMaxAgeMs = options.maxAgeMs ?? DEFAULT_STALE_DISCOVERY_RUN_AGE_MS;
  const maxAgeMs = Number.isFinite(requestedMaxAgeMs)
    ? Math.max(MIN_STALE_DISCOVERY_RUN_AGE_MS, requestedMaxAgeMs)
    : DEFAULT_STALE_DISCOVERY_RUN_AGE_MS;
  const staleBefore = new Date(now.getTime() - maxAgeMs);
  const requestedLimit = options.limit ?? MAX_STALE_DISCOVERY_RUNS_PER_PASS;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.trunc(requestedLimit), MAX_STALE_DISCOVERY_RUNS_PER_PASS))
    : MAX_STALE_DISCOVERY_RUNS_PER_PASS;
  const staleRuns = await db().runs.findMany({
    where: {
      status: 'RUNNING',
      startedAt: { lt: staleBefore },
    },
    orderBy: { startedAt: 'asc' },
    take: limit,
  });
  const recovered: RecoveredAffiliateSourceDiscoveryRun[] = [];
  for (const run of staleRuns) {
    const reason = [
      'Recovered stale affiliate source discovery run',
      run.workerId ? `owned by ${run.workerId}` : 'with no recorded worker',
      `after exceeding the ${Math.round(maxAgeMs / 60_000)} minute limit.`,
    ].join(' ');
    const updated = await db().runs.updateMany({
      where: { id: run.id, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: now,
        errorMessage: reason,
        summary: {
          ...recordValue(run.summary),
          recovery: {
            reason,
            recoveredAt: now.toISOString(),
          },
        },
      },
    });
    if (updated.count !== 1) continue;
    await db().campaigns.updateMany({
      where: { id: run.campaignId },
      data: { nextRunAt: now },
    });
    recovered.push({
      discoveryRunId: run.id,
      campaignId: run.campaignId,
      workerId: stringValue(run.workerId),
      startedAt: run.startedAt ?? null,
      recoveredAt: now,
      reason,
    });
  }
  return recovered;
};

export const queueDueAffiliateSourceDiscoveryRuns = async (now = new Date()): Promise<number> => {
  const campaigns = await db().campaigns.findMany({
    where: { status: 'ACTIVE', OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] },
  });
  campaigns.sort((left: any, right: any) => {
    const leftRank = Number(left.metadata?.priorityRank ?? Number.MAX_SAFE_INTEGER);
    const rightRank = Number(right.metadata?.priorityRank ?? Number.MAX_SAFE_INTEGER);
    const leftNextRunAt = left.nextRunAt ? new Date(left.nextRunAt).getTime() : 0;
    const rightNextRunAt = right.nextRunAt ? new Date(right.nextRunAt).getTime() : 0;
    return leftRank - rightRank || leftNextRunAt - rightNextRunAt || left.name.localeCompare(right.name);
  });
  for (const campaign of campaigns) {
    const prior = await db().runs.findFirst({
      where: { campaignId: campaign.id, status: { in: ['QUEUED', 'RUNNING'] } },
    });
    if (prior) continue;
    await queueAffiliateSourceDiscoveryRun(campaign.id, null);
    return 1;
  }
  return 0;
};

type AutomationLock = { release: () => Promise<void> };
const acquireAutomationLock = async (): Promise<AutomationLock | null> => {
  const { max: _poolMax, ...config } = resolvePrismaPgPoolConfig();
  const client = new Client(config);
  await client.connect();
  const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [DISCOVERY_LOCK_ID]);
  if (!result.rows.some((row) => row.locked)) {
    await client.end();
    return null;
  }
  return {
    release: async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [DISCOVERY_LOCK_ID]);
      } finally {
        await client.end();
      }
    },
  };
};

export const runAffiliateIntakeAutomation = async (options: {
  discoveryLimit?: number;
  intakeLimit?: number;
  isDemandDriven?: boolean;
} = {}, dependencies: DiscoveryDependencies = {}) => {
  const startedAt = dependencies.now?.() ?? new Date();
  const supervisorWorkerId = process.env.AFFILIATE_AUTOMATION_SUPERVISOR_ID?.trim()
    || DEFAULT_SUPERVISOR_WORKER_ID;
  const lock = await acquireAutomationLock();
  if (!lock) return {
    lockAcquired: false,
    startedAt,
    finishedAt: new Date(),
    queuedCampaigns: 0,
    recoveredDiscoveryRuns: [],
    recoveredIntakeRuns: [],
    discoveryRuns: [],
    intakeRuns: [],
    alertCount: 0,
  };
  try {
  const supervisorHealth = db().workerHealth;
  let isSupervisorHeartbeatLost = false;
  if (supervisorHealth?.findUnique && supervisorHealth?.upsert) {
    const previous = await supervisorHealth.findUnique({
      where: {
        workerId_role: {
          workerId: supervisorWorkerId,
          role: 'AUTOMATION_SUPERVISOR',
        },
      },
    });
    isSupervisorHeartbeatLost = Boolean(
      previous
      && (
        String(previous.status).toUpperCase() !== 'HEALTHY'
        || !previous.leaseExpiresAt
        || new Date(previous.leaseExpiresAt).getTime() <= startedAt.getTime()
      ),
    );
    const leaseExpiresAt = new Date(startedAt.getTime() + SUPERVISOR_HEARTBEAT_LEASE_MS);
    await supervisorHealth.upsert({
      where: {
        workerId_role: {
          workerId: supervisorWorkerId,
          role: 'AUTOMATION_SUPERVISOR',
        },
      },
      create: {
        id: createId(),
        workerId: supervisorWorkerId,
        role: 'AUTOMATION_SUPERVISOR',
        status: 'HEALTHY',
        heartbeatAt: startedAt,
        leaseExpiresAt,
        metadata: { cadence: '15m', component: 'affiliate-intake-automation' },
      },
      update: {
        status: 'HEALTHY',
        heartbeatAt: startedAt,
        leaseExpiresAt,
        metadata: { cadence: '15m', component: 'affiliate-intake-automation' },
      },
    });
  }
    const recoveredDiscoveryRuns = await recoverStaleAffiliateSourceDiscoveryRuns({
      now: dependencies.now?.() ?? new Date(),
    });
    const recoveredIntakeRuns = await recoverStaleAffiliateSourceIntakeRuns({
      now: dependencies.now?.() ?? new Date(),
    });
    let queuedCampaigns = 0;
    const discoveryRuns: any[] = [];
    for (let index = 0; index < Math.min(options.discoveryLimit ?? MAX_AUTOMATION_DISCOVERY_RUNS, 25); index += 1) {
      if (!options.isDemandDriven) {
        queuedCampaigns += await queueDueAffiliateSourceDiscoveryRuns(dependencies.now?.() ?? new Date());
      }
      const result = await processNextAffiliateSourceDiscoveryRun({}, dependencies);
      if (!result) break;
      discoveryRuns.push(result);
    }
    const intakeRuns: any[] = [];
    for (let index = 0; index < Math.min(options.intakeLimit ?? MAX_AUTOMATION_INTAKE_RUNS, 50); index += 1) {
      const result = await processNextAffiliateSourceIntakeRun({}, {
        workerId: dependencies.workerId ?? `affiliate-intake-automation-${process.pid}`,
        ...(dependencies.captureClient ? { captureClient: dependencies.captureClient } : {}),
        ...(dependencies.fallbackCaptureClient !== undefined
          ? { fallbackCaptureClient: dependencies.fallbackCaptureClient }
          : {}),
        ...(dependencies.firecrawlClient ? { firecrawlClient: dependencies.firecrawlClient } : {}),
        ...(dependencies.fetchResource ? { fetchResource: dependencies.fetchResource } : {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
      });
      if (!result) break;
      intakeRuns.push(result);
    }
    const finishedAt = dependencies.now?.() ?? new Date();
    const failedRuns = [
      ...discoveryRuns.map((entry) => ({ entry, kind: 'DISCOVERY' })),
      ...intakeRuns.map((entry) => ({ entry, kind: 'INTAKE' })),
    ].filter(({ entry }) => {
      const status = String(entry.run?.status ?? entry.status ?? '').toUpperCase();
      return ['FAILED', 'PARTIAL', 'BLOCKED'].includes(status);
    });
    const alertInputs: AffiliateOperationalAlertInput[] = failedRuns.map(({ entry, kind }) => {
      const run = entry.run ?? entry;
      const runId = String(run.id ?? entry.id ?? 'unknown');
      const status = String(run.status ?? entry.status ?? 'FAILED').toUpperCase();
      const errorMessage = String(run.errorMessage ?? entry.errorMessage ?? 'No error recorded');
      const lowerError = errorMessage.toLowerCase();
      const category = lowerError.includes('out of memory') || lowerError.includes('oom')
        ? 'WORKER_OOM'
        : lowerError.includes('sigterm') || lowerError.includes('terminated')
          ? 'WORKER_TERMINATION'
          : lowerError.includes('disk') || lowerError.includes('memory')
            ? 'RESOURCE_THRESHOLD'
            : kind === 'DISCOVERY'
              ? 'DISCOVERY_PROVIDER_FAILURE'
              : 'AUTOMATIC_CAPTURE_FAILURE';
      return {
        eventKey: `affiliate-intake-automation:${kind.toLowerCase()}:${runId}:${status}`,
        category,
        severity: status === 'BLOCKED' ? 'critical' as const : 'warning' as const,
        title: `${kind} automation ${status.toLowerCase()}`,
        detail: errorMessage,
        subjectType: `${kind}_RUN`,
        subjectId: runId,
        reasonCodes: [status, category],
        payload: { runId, kind, status, errorMessage },
      };
    });
    if (isSupervisorHeartbeatLost) {
      alertInputs.push({
        eventKey: `affiliate-intake-automation:supervisor-heartbeat-loss:${startedAt.toISOString()}`,
        category: 'SUPERVISOR_HEARTBEAT_LOSS',
        severity: 'critical' as const,
        title: 'Affiliate automation supervisor heartbeat lost',
        detail: 'The prior supervisor lease expired before this automation run.',
        subjectType: 'AUTOMATION_SUPERVISOR',
        subjectId: supervisorWorkerId,
        reasonCodes: ['HEARTBEAT_LOST', 'LEASE_EXPIRED'],
        payload: { workerId: supervisorWorkerId, startedAt },
      });
    }
    if (recoveredDiscoveryRuns.length > 0 || recoveredIntakeRuns.length > 0) {
      alertInputs.push({
        eventKey: `affiliate-intake-automation:stale-recovery:${finishedAt.toISOString()}`,
        category: 'STALE_WORK_RECOVERY',
        severity: 'warning' as const,
        title: 'Affiliate automation recovered stale work',
        detail: `${recoveredDiscoveryRuns.length} discovery and ${recoveredIntakeRuns.length} intake runs were recovered after lease expiry.`,
        subjectType: 'AUTOMATION_SUPERVISOR',
        reasonCodes: ['STALE_RUN_RECOVERED'],
        payload: { recoveredDiscoveryRuns, recoveredIntakeRuns },
      });
    }
    if (alertInputs.length > 0) {
      try {
        await emitAffiliateOperationalAlerts(alertInputs, { now: () => finishedAt });
      } catch (error) {
        console.error('[affiliate:intake:automation] failed to emit operational alert', error);
      }
    }
    return {
      lockAcquired: true,
      startedAt,
      finishedAt,
      queuedCampaigns,
      recoveredDiscoveryRuns,
      recoveredIntakeRuns,
      discoveryRuns,
      intakeRuns,
      alertCount: alertInputs.length,
    };
  } catch (error) {
    try {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);
      await emitAffiliateOperationalAlert({
        eventKey: `affiliate-intake-automation:orchestration-failure:${startedAt.toISOString()}`,
        category: 'AUTOMATION_ORCHESTRATION_FAILURE',
        severity: 'critical',
        title: 'Affiliate intake automation failed',
        detail: errorMessage,
        subjectType: 'AUTOMATION_SUPERVISOR',
        subjectId: supervisorWorkerId,
        reasonCodes: ['AUTOMATION_ORCHESTRATION_FAILURE'],
        payload: {
          errorName,
          errorMessage,
          startedAt: startedAt.toISOString(),
        },
      });
    } catch (alertError) {
      console.error('[affiliate:intake:automation] failed to persist top-level operational alert', alertError);
    }
    throw error;
  } finally {
    await lock.release();
  }
};

export const dryRunAffiliateSourceDiscoveryCampaign = async (
  campaignId: string,
  options: { maxQueries?: number } = {},
) => {
  const campaign = await db().campaigns.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Affiliate source discovery campaign not found.');
  const unorderedSports = await db().sports.findMany({ where: { id: { in: campaign.sportIds } }, select: { id: true, name: true } });
  const sports = campaign.sportIds.flatMap((sportId: string) => {
    const sport = unorderedSports.find((row: { id: string }) => row.id === sportId);
    return sport ? [sport] : [];
  });
  const maxQueries = Number.isInteger(options.maxQueries)
    ? Math.max(1, Math.min(50, Number(options.maxQueries)))
    : campaign.maxQueriesPerRun;
  const generated = generateAffiliateSourceDiscoveryQueries(
    { ...campaign, maxQueriesPerRun: maxQueries },
    sports,
    campaign.queryCursor ?? 0,
  );
  return {
    lockAcquired: true,
    providerQueries: 0,
    plannedQueries: generated.queries.length,
    databaseWrites: 0,
    queries: generated.queries,
  };
};
