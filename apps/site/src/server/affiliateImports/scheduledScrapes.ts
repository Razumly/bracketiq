import { createHash } from 'crypto';
import { Client } from 'pg';
import { prisma } from '@/lib/prisma';
import { resolvePrismaPgPoolConfig } from '@/lib/prismaConfig';
import { runAffiliateSourceScrape } from './service';
import {
  AffiliatePendingRepairHoldError,
  affiliatePendingRepairReasonFor,
  readAffiliatePendingRepairSnapshot,
  type AffiliatePendingRepairDatabase,
} from './affiliatePendingRepairGuard';
import { emitAffiliateOperationalAlerts, type AffiliateOperationalAlertInput } from './affiliateOperationalAlerts';
import { withAffiliateRepairActivityLease } from './affiliateRepairActivityLease';
const MIN_INTERVAL_MINUTES = 60;
const DAILY_INTERVAL_MINUTES = 1440;
const DEFAULT_LIGHTWEIGHT_CHECK_TIMEOUT_MS = 10_000;
const MAX_LIGHTWEIGHT_BODY_BYTES = 512 * 1024;
const LIGHTWEIGHT_CHECK_CONCURRENCY = 4;
const LIGHTWEIGHT_METADATA_KEY = 'dailyLightweightCheck';
const SCHEDULER_LOCK_ID = 4201042026;

type AffiliateSourceScheduleRow = {
  id: string;
  name: string;
  sourceKey: string;
  activeMappingId?: string | null;
  organizationId?: string | null;
  supplySourceId?: string | null;
  listUrl: string;
  targetKind?: string | null;
  scrapeIntervalMinutes?: number | null;
  metadata?: unknown;
  updatedAt?: Date | string | null;
};

type AffiliateRunScheduleRow = {
  id: string;
  sourceId: string;
  status?: string | null;
  startedAt: Date | string;
};

type ScrapeRunLogSummary = {
  createdCandidateCount?: number;
  updatedCandidateCount?: number;
  rejectedCount?: number;
  automaticallyPublishedCandidateCount?: number;
  rejectionSummary?: Record<string, number>;
};

type ScheduledScrapeSuccess = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'SUCCEEDED';
  runId: string;
  createdCandidateCount: number;
  updatedCandidateCount: number;
  rejectedCount: number;
  automaticallyPublishedCandidateCount: number;
  touchedApprovalCandidateCount: number;
  pendingApprovalCandidateCount: number;
};

type ScheduledScrapeFailure = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'FAILED';
  errorMessage: string;
};

type ScheduledScrapeSkipped = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'SKIPPED';
  reason: string;
};

export type ScheduledScrapeResultRow =
  | ScheduledScrapeSuccess
  | ScheduledScrapeFailure
  | ScheduledScrapeSkipped;

export type LightweightSourceCheckResult = {
  sourceId: string;
  sourceName: string;
  sourceKey: string;
  status: 'BASELINED' | 'UNCHANGED' | 'CHANGED' | 'FAILED' | 'SKIPPED';
  checkedAt: Date;
  httpStatus?: number;
  errorMessage?: string;
  reason?: string;
};



type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type RunDueAffiliateScrapesOptions = {
  now?: Date;
  dryRun?: boolean;
  limit?: number;
  fetchImpl?: FetchLike;
};
export type RunDueAffiliateScrapesResult = {
  startedAt: Date;
  finishedAt: Date;
  reconciledSourceOrganizationCount: number;
  dueSourceCount: number;
  lightweightSourceCount: number;
  results: ScheduledScrapeResultRow[];
  lightweightResults: LightweightSourceCheckResult[];
  lockAcquired: boolean;
  dryRun: boolean;
};

type LightweightCheckMetadata = {
  checkedAt?: string;
  status?: LightweightSourceCheckResult['status'];
  fingerprint?: string;
  etag?: string;
  lastModified?: string;
  lastChangedAt?: string;
  httpStatus?: number;
  errorMessage?: string;
};

const sourceWhere = {
  status: 'ACTIVE',
  autoScrapeEnabled: true,
  activeMappingId: { not: null },
};

const normalizeIntervalMinutes = (value: number | null | undefined): number => (
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_INTERVAL_MINUTES ? value : 1440
);

const toDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const readNumber = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const readLogs = (value: unknown): ScrapeRunLogSummary => (
  value && typeof value === 'object' ? value as ScrapeRunLogSummary : {}
);

const readRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);



const lightweightCheckTimeoutMs = (): number => {
  const configured = Number.parseInt(process.env.AFFILIATE_LIGHTWEIGHT_CHECK_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured >= 1_000 && configured <= 60_000
    ? configured
    : DEFAULT_LIGHTWEIGHT_CHECK_TIMEOUT_MS;
};


export const isAffiliateSourceDue = (
  source: Pick<AffiliateSourceScheduleRow, 'scrapeIntervalMinutes'>,
  latestRun: Pick<AffiliateRunScheduleRow, 'startedAt'> | null | undefined,
  now: Date,
): boolean => {
  const intervalMs = normalizeIntervalMinutes(source.scrapeIntervalMinutes) * 60 * 1000;
  const latestStartedAt = toDate(latestRun?.startedAt);
  if (!latestStartedAt) return true;
  return now.getTime() - latestStartedAt.getTime() >= intervalMs;
};

type SchedulerLockLease = {
  release: () => Promise<void>;
};

const acquireSchedulerLock = async (): Promise<SchedulerLockLease | null> => {
  // Session advisory locks belong to one PostgreSQL connection. A Prisma raw
  // query may use any pooled connection, so keep a dedicated client checked out
  // for the entire scheduler run and release the lock through that same client.
  const { max: _poolMax, ...clientConfig } = resolvePrismaPgPoolConfig();
  const client = new Client(clientConfig);

  try {
    await client.connect();
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [SCHEDULER_LOCK_ID],
    );
    const locked = result.rows.some((row) => row.locked === true);
    if (!locked) {
      await client.end();
      return null;
    }

    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        try {
          const unlockResult = await client.query<{ unlocked: boolean }>(
            'SELECT pg_advisory_unlock($1) AS unlocked',
            [SCHEDULER_LOCK_ID],
          );
          if (!unlockResult.rows.some((row) => row.unlocked === true)) {
            throw new Error('Affiliate scrape scheduler advisory lock was not owned by its dedicated connection');
          }
        } finally {
          // Closing the connection also releases the session lock if PostgreSQL
          // rejected the explicit unlock or the connection became unhealthy.
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
};
type SchedulerDatabase = {
  affiliateImportCandidates: {
    findMany: (args: unknown) => Promise<readonly { sourceId: string }[]>;
  };
  affiliateScrapeSources: {
    findMany: (args: unknown) => Promise<readonly AffiliateSourceScheduleRow[]>;
    findUnique?: (args: unknown) => Promise<AffiliateSourceScheduleRow | null>;
    update: (args: unknown) => Promise<unknown>;
    updateMany?: (args: unknown) => Promise<{ count?: number }>;
  };
  affiliateScrapeMappings?: {
    findUnique?: (args: unknown) => Promise<unknown>;
  };
  affiliateSupplySources?: {
    findMany?: (args: unknown) => Promise<readonly { id: string; metadata?: unknown }[]>;
    findUnique?: (args: unknown) => Promise<{ id: string; metadata?: unknown } | null>;
  };
  organizations: {
    updateMany: (args: unknown) => Promise<{ count?: number }>;
  };
};

type SchedulerTransactionalClient = {
  $transaction?: (
    callback: (client: unknown) => Promise<unknown>,
    options?: unknown,
  ) => Promise<unknown>;
};

const schedulerDatabaseFor = (client: unknown): SchedulerDatabase => (
  client as SchedulerDatabase
);

const withSchedulerTransaction = async <T>(
  callback: (database: SchedulerDatabase) => Promise<T>,
): Promise<T> => {
  const transaction = (prisma as unknown as SchedulerTransactionalClient).$transaction;
  if (!transaction) return callback(schedulerDatabaseFor(prisma));
  const result = await transaction.call(prisma,
    (client) => callback(schedulerDatabaseFor(client)),
    { isolationLevel: 'Serializable' },
  );
  return result as T;
};

const repairSnapshotForSource = async (
  database: SchedulerDatabase,
  source: AffiliateSourceScheduleRow,
) => readAffiliatePendingRepairSnapshot({
  database: database as unknown as AffiliatePendingRepairDatabase,
  sourceId: source.id,
  expectedSupplySourceId: source.supplySourceId,
  fallbackSource: source,
});

const pendingRepairReasonFor = (
  source: {
    id: string;
    supplySourceId?: string | null;
    metadata?: unknown;
  },
  root?: { id: string; metadata?: unknown } | null,
): string | null => affiliatePendingRepairReasonFor({
  sourceId: source.id,
  supplySourceId: source.supplySourceId,
  rootId: root?.id ?? source.supplySourceId,
  sourceMetadata: source.metadata,
  rootMetadata: root?.metadata,
});


const latestRunForSource = async (sourceId: string): Promise<AffiliateRunScheduleRow | null> => (
  (prisma as any).affiliateScrapeRuns.findFirst({
    // A failed attempt must remain due so the next scheduler invocation retries it.
    where: { sourceId, status: 'SUCCEEDED' },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      sourceId: true,
      status: true,
      startedAt: true,
    },
  })
);

const pendingApprovalCountForSource = async (sourceId: string): Promise<number> => (
  prisma.affiliateImportCandidates.count({
    where: {
      sourceId,
      NOT: { status: 'PUBLISHED' },
    },
  })
);

const reconcilePublishedSourceOrganizations = async (): Promise<number> => {
  try {
    return await withAffiliateRepairActivityLease(
      'scheduled:published-source-organization-reconciliation',
      () => withSchedulerTransaction(async (database) => {
        const publishedCandidates = await database.affiliateImportCandidates.findMany({
          where: {
            status: 'PUBLISHED',
            listingKind: { in: ['EVENT', 'RENTAL'] },
          },
          select: { sourceId: true },
          distinct: ['sourceId'],
        });
        const sourceIds = Array.from(new Set(
          publishedCandidates.map((candidate) => candidate.sourceId),
        ));
        if (!sourceIds.length) return 0;

        const candidateSources = await database.affiliateScrapeSources.findMany({
          where: { id: { in: sourceIds } },
          select: {
            id: true,
            organizationId: true,
            supplySourceId: true,
            metadata: true,
          },
        });
        const organizationIds = Array.from(new Set(
          candidateSources
            .map((source) => source.organizationId?.trim())
            .filter((organizationId): organizationId is string => Boolean(organizationId)),
        ));
        if (!organizationIds.length) return 0;

        const allOrganizationSources = await database.affiliateScrapeSources.findMany({
          where: { organizationId: { in: organizationIds } },
          select: {
            id: true,
            organizationId: true,
            supplySourceId: true,
            metadata: true,
          },
        });
        const rootIds = Array.from(new Set(
          allOrganizationSources
            .map((source) => source.supplySourceId)
            .filter((supplySourceId): supplySourceId is string => Boolean(supplySourceId)),
        ));
        const roots = rootIds.length && database.affiliateSupplySources?.findMany
          ? await database.affiliateSupplySources.findMany({
            where: { id: { in: rootIds } },
            select: { id: true, metadata: true },
          })
          : rootIds.length && database.affiliateSupplySources?.findUnique
            ? (await Promise.all(rootIds.map((id) => (
              database.affiliateSupplySources?.findUnique?.({
                where: { id },
                select: { id: true, metadata: true },
              })
            )))).filter((root): root is { id: string; metadata?: unknown } => root !== null)
            : [];
        const rootsById = new Map(roots.map((root) => [root.id, root]));
        const blockedOrganizationIds = new Set(
          allOrganizationSources
            .filter((source) => Boolean(pendingRepairReasonFor(
              source,
              rootsById.get(source.supplySourceId ?? ''),
            )))
            .map((source) => source.organizationId?.trim())
            .filter((organizationId): organizationId is string => Boolean(organizationId)),
        );
        const reconciledOrganizationIds = organizationIds.filter(
          (organizationId) => !blockedOrganizationIds.has(organizationId),
        );
        if (!reconciledOrganizationIds.length) return 0;

        const result = await database.organizations.updateMany({
          where: {
            id: { in: reconciledOrganizationIds },
            status: { not: 'LISTED' },
          },
          data: {
            status: 'LISTED',
            updatedAt: new Date(),
          },
        });
        return typeof result?.count === 'number' ? result.count : 0;
      }),
    );
  } catch (error) {
    if (error instanceof AffiliatePendingRepairHoldError) return 0;
    throw error;
  }
};

const loadScheduledSources = async (
  now: Date,
  limit?: number,
): Promise<{
  dueSources: AffiliateSourceScheduleRow[];
  lightweightSources: AffiliateSourceScheduleRow[];
  skippedSources: ScheduledScrapeSkipped[];
}> => {
  const sources: AffiliateSourceScheduleRow[] = await (prisma as any).affiliateScrapeSources.findMany({
    where: sourceWhere,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      sourceKey: true,
      activeMappingId: true,
      supplySourceId: true,
      listUrl: true,
      targetKind: true,
      scrapeIntervalMinutes: true,
      metadata: true,
      updatedAt: true,
    },
  });
  const dueSources: AffiliateSourceScheduleRow[] = [];
  const lightweightSources: AffiliateSourceScheduleRow[] = [];
  const skippedSources: ScheduledScrapeSkipped[] = [];
  const schedulerDatabase = schedulerDatabaseFor(prisma);
  for (const source of sources) {
    const pendingReason = (await repairSnapshotForSource(schedulerDatabase, source)).reason;
    if (pendingReason) {
      skippedSources.push({
        sourceId: source.id,
        sourceName: source.name,
        sourceKey: source.sourceKey,
        status: 'SKIPPED',
        reason: pendingReason,
      });
      continue;
    }
    const activeMappingId = source.activeMappingId ?? `mapping_${source.id}`;
    const activeMapping = await (prisma as any).affiliateScrapeMappings.findUnique({
      where: { id: activeMappingId },
      select: { id: true, sourceId: true, validatedAt: true },
    });
    if (!activeMapping?.validatedAt || activeMapping.sourceId !== source.id) continue;
    const latestRun = await latestRunForSource(source.id);
    if (isAffiliateSourceDue(source, latestRun, now)) {
      if (!limit || dueSources.length < limit) dueSources.push(source);
      continue;
    }
    if (normalizeIntervalMinutes(source.scrapeIntervalMinutes) > DAILY_INTERVAL_MINUTES) {
      lightweightSources.push(source);
    }
  }
  return { dueSources, lightweightSources, skippedSources };
};

const normalizeLightweightBody = (body: string): string => body
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\s(?:nonce|data-nonce|csrf-token)=(['"])[\s\S]*?\1/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const fingerprintLightweightBody = (body: string): string => createHash('sha256')
  .update(normalizeLightweightBody(body))
  .digest('hex');

const readBoundedResponseText = async (response: Response): Promise<string> => {
  if (!response.body?.getReader) {
    return (await response.text()).slice(0, MAX_LIGHTWEIGHT_BODY_BYTES);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  while (byteCount < MAX_LIGHTWEIGHT_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const remaining = MAX_LIGHTWEIGHT_BODY_BYTES - byteCount;
    const chunk = value.length > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    byteCount += chunk.length;
    if (value.length > remaining) {
      await reader.cancel();
      break;
    }
  }
  const combined = new Uint8Array(byteCount);
  let offset = 0;
  chunks.forEach((chunk) => {
    combined.set(chunk, offset);
    offset += chunk.length;
  });
  return new TextDecoder().decode(combined);
};

const lightweightStateForSource = (source: Pick<AffiliateSourceScheduleRow, 'metadata'>): LightweightCheckMetadata => {
  const metadata = readRecord(source.metadata);
  return readRecord(metadata[LIGHTWEIGHT_METADATA_KEY]) as LightweightCheckMetadata;
};

type LightweightStoreResult = Readonly<{
  stored: boolean;
  reason?: string;
}>;

const storeLightweightState = async (
  source: AffiliateSourceScheduleRow,
  state: LightweightCheckMetadata,
): Promise<LightweightStoreResult> => {
  const persistedState = Object.fromEntries(
    Object.entries(state).filter(([, value]) => value !== undefined),
  );
  return withSchedulerTransaction(async (database) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const snapshot = await repairSnapshotForSource(database, source);
      if (snapshot.reason) return { stored: false, reason: snapshot.reason };
      const currentSource = snapshot.source ?? source;
      const metadata = {
        ...readRecord(currentSource.metadata),
        [LIGHTWEIGHT_METADATA_KEY]: persistedState,
      };
      const sourceDelegate = database.affiliateScrapeSources;
      if (
        sourceDelegate.updateMany
        && currentSource.updatedAt !== undefined
        && currentSource.updatedAt !== null
      ) {
        const result = await sourceDelegate.updateMany({
          where: { id: source.id, updatedAt: currentSource.updatedAt },
          data: { metadata },
        });
        if (result.count === 1) {
          source.metadata = metadata;
          source.updatedAt = new Date();
          return { stored: true };
        }
        continue;
      }
      await sourceDelegate.update({
        where: { id: source.id },
        data: { metadata },
      });
      source.metadata = metadata;
      return { stored: true };
    }
    return { stored: false, reason: 'LIGHTWEIGHT_METADATA_CONCURRENT_UPDATE' };
  });
};

const lightweightResult = (
  source: AffiliateSourceScheduleRow,
  checkedAt: Date,
  status: LightweightSourceCheckResult['status'],
  details: Pick<LightweightSourceCheckResult, 'httpStatus' | 'errorMessage' | 'reason'> = {},
): LightweightSourceCheckResult => ({
  sourceId: source.id,
  sourceName: source.name,
  sourceKey: source.sourceKey,
  status,
  checkedAt,
  ...details,
});

const checkSourceForLightweightChanges = async (
  source: AffiliateSourceScheduleRow,
  checkedAt: Date,
  fetchImpl: FetchLike,
): Promise<LightweightSourceCheckResult> => {
  try {
    return await withAffiliateRepairActivityLease(source.id, async () => {
      const initialSnapshot = await repairSnapshotForSource(
        schedulerDatabaseFor(prisma),
        source,
      );
      if (initialSnapshot.reason) {
        return lightweightResult(source, checkedAt, 'SKIPPED', {
          reason: initialSnapshot.reason,
        });
      }
      const currentSource = initialSnapshot.source ?? source;
      const previous = lightweightStateForSource(currentSource);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), lightweightCheckTimeoutMs());
      try {
        const beforeFetch = await repairSnapshotForSource(
          schedulerDatabaseFor(prisma),
          source,
        );
        if (beforeFetch.reason) {
          return lightweightResult(source, checkedAt, 'SKIPPED', {
            reason: beforeFetch.reason,
          });
        }
        const url = new URL(source.listUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error(`Unsupported source protocol: ${url.protocol}`);
        }
        const headers: Record<string, string> = {
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5',
          Range: `bytes=0-${MAX_LIGHTWEIGHT_BODY_BYTES - 1}`,
          'User-Agent': 'BracketIQAffiliateMonitor/1.0 (+https://bracket-iq.com)',
        };
        const etag = readString(previous.etag);
        const lastModified = readString(previous.lastModified);
        if (etag) headers['If-None-Match'] = etag;
        if (lastModified) headers['If-Modified-Since'] = lastModified;

        const response = await fetchImpl(url, {
          method: 'GET',
          headers,
          redirect: 'follow',
          signal: controller.signal,
        });
        if (response.status === 304) {
          const stored = await storeLightweightState(source, {
            ...previous,
            checkedAt: checkedAt.toISOString(),
            status: 'UNCHANGED',
            httpStatus: response.status,
            errorMessage: undefined,
          });
          if (!stored.stored) {
            return lightweightResult(source, checkedAt, 'SKIPPED', { reason: stored.reason });
          }
          return lightweightResult(source, checkedAt, 'UNCHANGED', { httpStatus: response.status });
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = await readBoundedResponseText(response);
        const fingerprint = fingerprintLightweightBody(body);
        const status: LightweightSourceCheckResult['status'] = previous.fingerprint
          ? previous.fingerprint === fingerprint ? 'UNCHANGED' : 'CHANGED'
          : 'BASELINED';
        const stored = await storeLightweightState(source, {
          checkedAt: checkedAt.toISOString(),
          status,
          fingerprint,
          etag: readString(response.headers.get('etag')),
          lastModified: readString(response.headers.get('last-modified')),
          lastChangedAt: status === 'CHANGED'
            ? checkedAt.toISOString()
            : readString(previous.lastChangedAt),
          httpStatus: response.status,
          errorMessage: undefined,
        });
        if (!stored.stored) {
          return lightweightResult(source, checkedAt, 'SKIPPED', { reason: stored.reason });
        }
        return lightweightResult(source, checkedAt, status, { httpStatus: response.status });
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.name === 'AbortError' ? 'Lightweight check timed out' : error.message
          : 'Unknown lightweight check failure';
        try {
          const stored = await storeLightweightState(source, {
            ...previous,
            checkedAt: checkedAt.toISOString(),
            status: 'FAILED',
            errorMessage,
          });
          if (!stored.stored) {
            return lightweightResult(source, checkedAt, 'SKIPPED', { reason: stored.reason });
          }
        } catch {
          // The result still reports the original source check failure when metadata persistence also fails.
        }
        return lightweightResult(source, checkedAt, 'FAILED', { errorMessage });
      } finally {
        clearTimeout(timeout);
      }
    });
  } catch (error) {
    if (error instanceof AffiliatePendingRepairHoldError) {
      return lightweightResult(source, checkedAt, 'SKIPPED', { reason: error.reason });
    }
    throw error;
  }
};

const sourceOrigin = (source: AffiliateSourceScheduleRow): string => {
  try {
    return new URL(source.listUrl).origin;
  } catch {
    return `invalid:${source.id}`;
  }
};

const runLightweightChecks = async (
  sources: AffiliateSourceScheduleRow[],
  checkedAt: Date,
  fetchImpl: FetchLike,
): Promise<LightweightSourceCheckResult[]> => {
  const groups = new Map<string, AffiliateSourceScheduleRow[]>();
  sources.forEach((source) => {
    const origin = sourceOrigin(source);
    groups.set(origin, [...(groups.get(origin) ?? []), source]);
  });
  const sourceGroups = Array.from(groups.values());
  const results: LightweightSourceCheckResult[] = [];
  let nextGroupIndex = 0;
  const worker = async () => {
    while (nextGroupIndex < sourceGroups.length) {
      const group = sourceGroups[nextGroupIndex];
      nextGroupIndex += 1;
      for (const source of group) {
        results.push(await checkSourceForLightweightChanges(source, checkedAt, fetchImpl));
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(LIGHTWEIGHT_CHECK_CONCURRENCY, sourceGroups.length) },
    () => worker(),
  ));
  return results.sort((left, right) => left.sourceName.localeCompare(right.sourceName));
};

const summarizeRunResult = async (
  source: AffiliateSourceScheduleRow,
  scrapeResult: Awaited<ReturnType<typeof runAffiliateSourceScrape>>,
): Promise<ScheduledScrapeResultRow> => {
  const logs = readLogs((scrapeResult.run as any).logs);
  const pendingApprovalCandidateCount = await pendingApprovalCountForSource(source.id);
  const touchedApprovalCandidateCount = scrapeResult.candidates.filter((candidate) => (
    String((candidate as any).status ?? '').toUpperCase() !== 'PUBLISHED'
  )).length;
  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceKey: source.sourceKey,
    status: 'SUCCEEDED',
    runId: (scrapeResult.run as any).id,
    createdCandidateCount: readNumber(logs.createdCandidateCount),
    updatedCandidateCount: readNumber(logs.updatedCandidateCount),
    rejectedCount: readNumber(logs.rejectedCount),
    automaticallyPublishedCandidateCount: readNumber(logs.automaticallyPublishedCandidateCount),
    touchedApprovalCandidateCount,
    pendingApprovalCandidateCount,
  };
};

const alertInputForScrapeFailure = (
  result: ScheduledScrapeResultRow | LightweightSourceCheckResult,
  now: Date,
): AffiliateOperationalAlertInput | null => {
  if (result.status !== 'FAILED') return null;
  return {
    eventKey: `affiliate-source-refresh-failed:${result.sourceId}:${now.toISOString()}`,
    category: 'AUTOMATIC_REFRESH_FAILURE',
    severity: 'warning',
    title: 'Affiliate source refresh failed',
    detail: `${result.sourceName} (${result.sourceKey}): ${result.errorMessage ?? 'No error recorded'}`,
    subjectType: 'AFFILIATE_SOURCE',
    subjectId: result.sourceId,
    reasonCodes: ['SOURCE_REFRESH_FAILED'],
    payload: {
      sourceId: result.sourceId,
      sourceKey: result.sourceKey,
      status: result.status,
    },
  };
};


export const runDueAffiliateScrapes = async (
  options: RunDueAffiliateScrapesOptions = {},
): Promise<RunDueAffiliateScrapesResult> => {
  const startedAt = options.now ?? new Date();
  const schedulerLock = await acquireSchedulerLock();
  if (!schedulerLock) {
    const finishedAt = new Date();
    return {
      startedAt,
      finishedAt,
      reconciledSourceOrganizationCount: 0,
      dueSourceCount: 0,
      lightweightSourceCount: 0,
      results: [],
      lightweightResults: [],
      lockAcquired: false,
      dryRun: options.dryRun === true,
    };
  }

  try {
    const { dueSources, lightweightSources, skippedSources } = await loadScheduledSources(startedAt, options.limit);
    const reconciledSourceOrganizationCount = options.dryRun
      ? 0
      : await reconcilePublishedSourceOrganizations();
    const results: ScheduledScrapeResultRow[] = [...skippedSources];
    for (const source of dueSources) {
      if (options.dryRun) {
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceKey: source.sourceKey,
          status: 'SKIPPED',
          reason: 'dry run',
        });
        continue;
      }
      try {
        const scrapeResult = await runAffiliateSourceScrape(source.id, {
          requestedByUserId: null,
          importMode: 'AUTOMATIC',
        });
        results.push(await summarizeRunResult(source, scrapeResult));
      } catch (error) {
        if (error instanceof AffiliatePendingRepairHoldError) {
          results.push({ sourceId: source.id, sourceName: source.name, sourceKey: source.sourceKey, status: 'SKIPPED', reason: error.reason });
          continue;
        }
        results.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceKey: source.sourceKey,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown scrape failure',
        });
      }
    }

    const lightweightResults = options.dryRun
      ? []
      : await runLightweightChecks(
        lightweightSources,
        startedAt,
        options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      );

    const alertInputs = [...results, ...lightweightResults]
      .map((result) => alertInputForScrapeFailure(result, startedAt))
      .filter((input): input is AffiliateOperationalAlertInput => input !== null);
    if (alertInputs.length > 0) {
      try {
        await emitAffiliateOperationalAlerts(alertInputs);
      } catch (error) {
        console.error('[affiliate:scrape] failed to persist operational alerts', error);
      }
    }
    const finishedAt = new Date();
    const result: RunDueAffiliateScrapesResult = {
      startedAt,
      finishedAt,
      reconciledSourceOrganizationCount,
      dueSourceCount: dueSources.length,
      lightweightSourceCount: lightweightSources.length,
      results,
      lightweightResults,
      lockAcquired: true,
      dryRun: options.dryRun === true,
    };
    return result;
  } finally {
    await schedulerLock.release();
  }
};
