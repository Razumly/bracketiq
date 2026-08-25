import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_OPERATIONS_VIEWS,
  type AffiliateOperationsContractSelection,
  type AffiliateOperationsSort,
  type AffiliateOperationsDetailType,
  type AffiliateOperationsFilters,
  type AffiliateOperationsProjection,
  type AffiliateOperationsProjectionInput,
  type AffiliateOperationsView,
  type CandidateRow,
  type CandidatesProjection,
  type CoverageCellRow,
  type CoverageProjection,
  type DemandHistoryRow,
  type CampaignRow,
  type CoverageTargetRow,
  type DiscoveryOutcomeRow,
  type CoverageMovementRow,
  type ExceptionRow,
  type FailureParetoRow,
  type IntakeProjection,
  type IntakeRow,
  type JobRow,
  type JobsProjection,
  type LifecycleCountRow,
  type MarginalYieldRow,
  type OverviewProjection,
  type PriorityWorkRow,
  type ProjectionDetail,
  type ProjectionField,
  type ProjectionHistoryRow,
  type ProjectionRelatedRow,
  type ReviewProjection,
  type ReviewRow,
  type SourceRow,
  type SourcesProjection,
  type SupplyTargetDeficitRow,
  type WipSeriesPoint,
  type WorkerHealthRow,
} from "@/types/affiliateOperations";
import {
  isAffiliateSupplyTargetFresh,
  normalizeAffiliateSupplyContractPolicy,
} from "./affiliateSupplyLifecycle";
import { affiliateDiscoveryPolicyKeyForUrl } from "./sourceDiscoveryRules";

const MAX_PAGE_SIZE = 50;
const MAX_PROJECTION_ROWS = 10_000;
const TRUNCATION_TOLERATED_COLLECTIONS = new Set([
  "transitions",
  "gatewayEvents",
  "alertDeliveries",
]);
const DEFAULT_PAGE_SIZE = 25;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const ROLLUP_MS = 15 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export class AffiliateOperationsProjectionIncompleteError extends Error {
  constructor(collections: readonly string[]) {
    super(
      `Affiliate operations projection exceeds the ${MAX_PROJECTION_ROWS.toLocaleString()}-row safety bound: ${collections.join(", ")}`,
    );
    this.name = "AffiliateOperationsProjectionIncompleteError";
  }
}
const isAffiliateOperationsView = (
  value: string,
): value is AffiliateOperationsView =>
  (AFFILIATE_OPERATIONS_VIEWS as readonly string[]).includes(value);

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => stringValue(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : [];

const providerValue = (...values: readonly unknown[]): string | null => {
  const providers = values
    .flatMap((value) => {
      if (typeof value === "string") return [value];
      const record = recordValue(value);
      return [
        record.provider,
        record.providerKey,
        record.providerOperationKey,
      ].filter((entry): entry is string => typeof entry === "string");
    })
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(providers)).join(", ") || null;
};

const numberValue = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWorkerHealthy = (
  worker: ProjectionRows["workerHealth"][number],
  now: Date,
): boolean => {
  const leaseExpiresAt = dateValue(worker.leaseExpiresAt);
  return (
    upper(worker.status) === "HEALTHY" &&
    leaseExpiresAt !== null &&
    leaseExpiresAt.getTime() > now.getTime()
  );
};

const isoValue = (value: unknown): string | null =>
  dateValue(value)?.toISOString() ?? null;

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "")
    return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized : "Not recorded";
  }
  return String(value);
};

const upper = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const targetKey = (
  marketKey: string | null,
  sportId: string | null,
  sourceProfile: string,
  rolloutCohort = "DEFAULT",
  contractVersion: number | null = null,
): string =>
  `${rolloutCohort}\u0000${contractVersion ?? ""}\u0000${marketKey ?? ""}\u0000${sportId ?? ""}\u0000${upper(sourceProfile)}`;

const targetLabel = (
  marketKey: string | null,
  sportId: string | null,
  sourceProfile: string,
): string =>
  [marketKey, sportId, upper(sourceProfile)].filter(Boolean).join(" / ") ||
  "Unclassified target";

const adminLink = (
  view: AffiliateOperationsView,
  detailType?: AffiliateOperationsDetailType,
  id?: string | null,
  extra?: Record<string, string | null | undefined>,
): string => {
  const params = new URLSearchParams({ tab: "affiliateOperations", view });
  if (detailType && id) {
    params.set("selectedType", detailType);
    params.set("selected", id);
  }
  Object.entries(extra ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/admin?${params.toString()}`;
};

const paginate = <T>(rows: readonly T[], page: number, pageSize: number) => {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSize)),
  );
  const start = (safePage - 1) * safePageSize;
  return {
    rows: rows.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total: rows.length,
  };
};

const ageMinutes = (startedAt: unknown, now: Date): number => {
  const start = dateValue(startedAt);
  return start
    ? Math.max(0, Math.floor((now.getTime() - start.getTime()) / MINUTE_MS))
    : 0;
};
const isWaitingStatus = (status: string): boolean =>
  [
    "QUEUED",
    "RETRY_WAIT",
    "DEFERRED",
    "REVIEW_REQUIRED",
    "CLAIMED",
    "ACTIVE",
    "STARTED",
    "PENDING",
  ].includes(upper(status));

const ageBandFor = (minutes: number): string => {
  if (minutes < 15) return "<15m";
  if (minutes < 60) return "15–60m";
  if (minutes < 240) return "1–4h";
  if (minutes < 1_440) return "4–24h";
  return ">24h";
};

const containsFilter = (value: unknown, filter: string): boolean =>
  !filter ||
  String(value ?? "")
    .toUpperCase()
    .includes(filter.toUpperCase());

const dateRangeCutoffFor = (range: string, now: Date): number | null => {
  if (!range) return null;
  if (range === "24h") return now.getTime() - DAY_MS;
  if (range === "7d") return now.getTime() - 7 * DAY_MS;
  if (range === "30d") return now.getTime() - 30 * DAY_MS;
  return dateValue(range)?.getTime() ?? null;
};

const matchesDateRange = (value: unknown, cutoff: number | null): boolean => {
  if (cutoff === null) return true;
  const date = dateValue(value);
  return Boolean(date && date.getTime() >= cutoff);
};

const normalizedContractPolicy = (
  contractJson: unknown,
  rolloutCohort = "DEFAULT",
): Record<string, unknown> =>
  normalizeAffiliateSupplyContractPolicy(
    recordValue(contractJson) as never,
    rolloutCohort,
  ) as unknown as Record<string, unknown>;


const parseTargetRules = (
  contractJson: unknown,
  rolloutCohort = "DEFAULT",
): Array<{
  marketKey: string | null;
  sportId: string | null;
  sourceProfile: string;
  minimumFreshPublishedSupply: number;
}> => {
  const payload = normalizedContractPolicy(contractJson, rolloutCohort);
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  return targets.map((target) => {
    const row = recordValue(target);
    return {
      marketKey: stringValue(row.marketKey),
      sportId: stringValue(row.sportId),
      sourceProfile: upper(row.sourceProfile),
      minimumFreshPublishedSupply: Math.max(
        0,
        Math.trunc(numberValue(row.minimumFreshPublishedSupply)),
      ),
    };
  });
};

const isFreshTarget = (
  target: {
    status: string;
    rejectedAt: unknown;
    freshnessExpiresAt: unknown;
    lastSuccessfulRefreshAt: unknown;
    sourceProfile: string;
    metadata: unknown;
  },
  root: { derivedStage: string; isExcluded: boolean } | undefined,
  contractJson: unknown,
  rolloutCohort: string,
  now: Date,
): boolean => {
  if (!root || upper(root.derivedStage) !== "PUBLISHED" || root.isExcluded)
    return false;
  let contract;
  try {
    contract = normalizeAffiliateSupplyContractPolicy(
      recordValue(contractJson) as never,
      rolloutCohort,
    );
  } catch {
    return false;
  }
  return isAffiliateSupplyTargetFresh(
    {
      status: target.status,
      rejectedAt: dateValue(target.rejectedAt),
      freshnessExpiresAt: dateValue(target.freshnessExpiresAt),
      lastSuccessfulRefreshAt: dateValue(target.lastSuccessfulRefreshAt),
      sourceProfile: target.sourceProfile,
      metadata: recordValue(target.metadata),
    },
    contract,
    now,
  );
};

type ProjectionRows = Awaited<ReturnType<typeof loadProjectionRows>>;
type ProjectionDimensionContext = Readonly<{
  rootsById: ReadonlyMap<string, ProjectionRows["roots"][number]>;
  targetsByRoot: ReadonlyMap<
    string,
    readonly ProjectionRows["targets"][number][]
  >;
  intakesById: ReadonlyMap<string, ProjectionRows["intakes"][number]>;
  sourcesById: ReadonlyMap<string, ProjectionRows["sources"][number]>;
  candidatesById: ReadonlyMap<string, ProjectionRows["candidates"][number]>;
  organizationsById: ReadonlyMap<
    string,
    ProjectionRows["organizations"][number]
  >;
  dateRangeCutoff: number | null;
}>;

const projectionDimensionContext = (
  rows: ProjectionRows,
  dateRangeCutoff: number | null = null,
): ProjectionDimensionContext => {
  const targetsByRoot = new Map<string, ProjectionRows["targets"][number][]>();
  rows.targets.forEach((target) => {
    const targets = targetsByRoot.get(target.supplySourceId) ?? [];
    targets.push(target);
    targetsByRoot.set(target.supplySourceId, targets);
  });
  return {
    rootsById: new Map(rows.roots.map((root) => [root.id, root])),
    targetsByRoot,
    intakesById: new Map(rows.intakes.map((intake) => [intake.id, intake])),
    sourcesById: new Map(rows.sources.map((source) => [source.id, source])),
    candidatesById: new Map(
      rows.candidates.map((candidate) => [candidate.id, candidate]),
    ),
    organizationsById: new Map(
      rows.organizations.map((organization) => [organization.id, organization]),
    ),
    dateRangeCutoff,
  };
};

const targetMatchesCity = (
  target: ProjectionRows["targets"][number],
  context: ProjectionDimensionContext,
  city: string,
): boolean => {
  if (!city) return true;
  const metadata = recordValue(target.metadata);
  const candidate = target.candidateId
    ? context.candidatesById.get(target.candidateId)
    : undefined;
  const root = context.rootsById.get(target.supplySourceId);
  const intake = root?.intakeId
    ? context.intakesById.get(root.intakeId)
    : undefined;
  const source = root?.liveSourceId
    ? context.sourcesById.get(root.liveSourceId)
    : undefined;
  const organization = source?.organizationId
    ? context.organizationsById.get(source.organizationId)
    : undefined;
  return [
    metadata.city,
    metadata.cityId,
    metadata.location,
    candidate?.city,
    intake?.region,
    organization?.location,
  ].some((value) => containsFilter(value, city));
};

const targetMatchesDimensions = (
  target: ProjectionRows["targets"][number],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean =>
  containsFilter(target.marketKey, filters.market) &&
  targetMatchesCity(target, context, filters.city) &&
  containsFilter(target.sportId, filters.sport) &&
  containsFilter(target.sourceProfile, filters.profile);

const targetMatchesFilters = (
  target: ProjectionRows["targets"][number],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean =>
  targetMatchesDimensions(target, filters, context) &&
  containsFilter(target.status, filters.status) &&
  matchesDateRange(
    target.freshnessExpiresAt ??
      target.lastSuccessfulRefreshAt ??
      target.publishedAt,
    context.dateRangeCutoff,
  );

const rootMatchesCity = (
  root: ProjectionRows["roots"][number],
  context: ProjectionDimensionContext,
  city: string,
): boolean => {
  if (!city) return true;
  const intake = root.intakeId
    ? context.intakesById.get(root.intakeId)
    : undefined;
  const source = root.liveSourceId
    ? context.sourcesById.get(root.liveSourceId)
    : undefined;
  const organization = source?.organizationId
    ? context.organizationsById.get(source.organizationId)
    : undefined;
  return (
    [intake?.region, organization?.location].some((value) =>
      containsFilter(value, city),
    ) ||
    (context.targetsByRoot.get(root.id) ?? []).some((target) =>
      targetMatchesCity(target, context, city),
    )
  );
};

const rootMatchesFilters = (
  root: ProjectionRows["roots"][number],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean => {
  const hasTargetDimensionFilter = Boolean(
    filters.market || filters.sport || filters.profile,
  );
  const rootTargets = context.targetsByRoot.get(root.id) ?? [];
  const hasMatchingTarget = rootTargets.some((target) =>
    targetMatchesFilters(target, filters, context),
  );
  if (filters.city && !rootMatchesCity(root, context, filters.city))
    return false;
  if (hasTargetDimensionFilter && !hasMatchingTarget) return false;
  const statusMatches =
    !filters.status ||
    [root.derivedStage, root.derivedOutcome, root.freshnessStatus].some(
      (value) => containsFilter(value, filters.status),
    ) ||
    rootTargets.some((target) => containsFilter(target.status, filters.status));
  const dateMatches =
    !filters.range ||
    matchesDateRange(root.lastSuccessfulRefreshAt, context.dateRangeCutoff) ||
    rootTargets.some((target) =>
      matchesDateRange(
        target.freshnessExpiresAt ??
          target.lastSuccessfulRefreshAt ??
          target.publishedAt,
        context.dateRangeCutoff,
      ),
    );
  return statusMatches && dateMatches;
};

const rootIdForSource = (
  rows: ProjectionRows,
  sourceId: string | null | undefined,
): string | null => {
  if (!sourceId) return null;
  if (rows.roots.some((root) => root.id === sourceId)) return sourceId;
  return rows.roots.find((root) => root.liveSourceId === sourceId)?.id ?? null;
};

const rootIdForScrapeRun = (
  rows: ProjectionRows,
  runId: string | null | undefined,
): string | null => {
  if (!runId) return null;
  const run = rows.scrapeRuns.find((candidate) => candidate.id === runId);
  return rootIdForSource(rows, run?.supplySourceId ?? run?.sourceId);
};

const rootIdForAlert = (
  rows: ProjectionRows,
  alert: ProjectionRows["operationalAlerts"][number],
): string | null => {
  const payload = recordValue(alert.payload);
  const directSupplySourceId =
    stringValue(alert.supplySourceId) ?? stringValue(payload.supplySourceId);
  const directRootId = rootIdForSource(rows, directSupplySourceId);
  if (directRootId) return directRootId;
  const sourceId =
    stringValue(payload.sourceId) ??
    (alert.subjectType === "AFFILIATE_SOURCE"
      ? stringValue(alert.subjectId)
      : null);
  const sourceRootId = rootIdForSource(rows, sourceId);
  if (sourceRootId) return sourceRootId;
  const runId =
    stringValue(payload.scrapeRunId ?? payload.runId) ??
    (["SOURCE_REFRESH", "AFFILIATE_SOURCE_REFRESH"].includes(
      upper(alert.subjectType),
    )
      ? stringValue(alert.subjectId)
      : null);
  const runRootId = rootIdForScrapeRun(rows, runId);
  if (runRootId) return runRootId;
  const jobId =
    stringValue(payload.gatewayJobId ?? payload.jobId) ??
    (["GATEWAY_JOB", "AGENT_GATEWAY_JOB"].includes(upper(alert.subjectType))
      ? stringValue(alert.subjectId)
      : null);
  const job = jobId
    ? rows.gatewayJobs.find((candidate) => candidate.id === jobId)
    : undefined;
  return rootIdForSource(rows, job?.supplySourceId);
};

const loadProjectionRows = async (
  client: Prisma.TransactionClient,
  selection: AffiliateOperationsContractSelection,
) => {
  const [contracts, roots, coverageCells] = await Promise.all([
    client.affiliateSupplyContractManifests.findMany({
      where: {
        status: "ACTIVE",
        rolloutCohort: selection.rolloutCohort,
        version: selection.contractVersion ?? undefined,
      },
      orderBy: { activatedAt: "desc" },
      take: 1,
      select: {
        id: true,
        rolloutCohort: true,
        version: true,
        status: true,
        contractHash: true,
        contractJson: true,
        componentHashes: true,
        activatedAt: true,
      },
    }),
    client.affiliateSupplySources.findMany({
      where: {
        rolloutCohort: selection.rolloutCohort,
        activeSupplyContractVersion: selection.contractVersion ?? undefined,
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        canonicalUrl: true,
        origin: true,
        pathKey: true,
        operatorDomain: true,
        targetKind: true,
        rolloutCohort: true,
        intakeId: true,
        liveSourceId: true,
        predecessorId: true,
        successorId: true,
        lifecycleGeneration: true,
        activeSupplyContractVersion: true,
        activeSupplyContractHash: true,
        derivedStage: true,
        derivedOutcome: true,
        freshnessStatus: true,
        targetContribution: true,
        repairPriority: true,
        isAutomationEnabled: true,
        isExcluded: true,
        automationHoldReason: true,
        excludedAt: true,
        lastSuccessfulRefreshAt: true,
        lastAssessmentAt: true,
        invariantViolations: true,
        assessmentJson: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    client.affiliateCoverageCells.findMany({
      where: { cohort: selection.rolloutCohort },
      orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        cityId: true,
        marketKey: true,
        cohort: true,
        cohortPriority: true,
        sportId: true,
        sportName: true,
        profileKey: true,
        coverageStatus: true,
        searchStatus: true,
        populationWeight: true,
        gapSeverity: true,
        profileWeight: true,
        stalenessWeight: true,
        priorityScore: true,
        directPolicyKeyCount: true,
        approvedSourceCount: true,
        strategyFamilyCount: true,
        unresolvedLeadCount: true,
        consecutiveNoYieldCycles: true,
        queryStrategyVersion: true,
        evidenceQuality: true,
        lastAssessedAt: true,
        nextReviewAt: true,
        evidence: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const scopedRootIds = roots.map((root) => root.id);
  const scopedCoverageCellIds = coverageCells.map((cell) => cell.id);
  const scopedRootIntakeIds = roots.flatMap((root) =>
    root.intakeId ? [root.intakeId] : [],
  );
  const scopedRootLiveSourceIds = roots.flatMap((root) =>
    root.liveSourceId ? [root.liveSourceId] : [],
  );
  const gatewaySubjectContractScope =
    selection.contractVersion === null
      ? {}
      : {
          AND: [
            {
              OR: [
                {
                  subjectJson: {
                    path: ["contractVersion"],
                    equals: selection.contractVersion,
                  },
                },
                {
                  subjectJson: {
                    path: ["supplyContractVersion"],
                    equals: selection.contractVersion,
                  },
                },
              ],
            },
          ],
        };
  const [
    targets,
    demands,
    transitions,
    gatewayJobs,
    coverageAssessments,
    coverageJobs,
    mappingJobs,
    approvals,
    intakes,
    pages,
    intakeRuns,
    artifacts,
    sources,
    mappings,
    scrapeRuns,
    candidates,
    workerHealth,
  ] = await Promise.all([
    client.affiliateSupplyTargets.findMany({
      where: { supplySourceId: { in: scopedRootIds } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        supplySourceId: true,
        candidateId: true,
        targetType: true,
        targetId: true,
        marketKey: true,
        sportId: true,
        sourceProfile: true,
        status: true,
        publishedAt: true,
        lastSuccessfulRefreshAt: true,
        freshnessExpiresAt: true,
        rejectedAt: true,
        rejectionReason: true,
        evidenceRefs: true,
        evidenceHash: true,
        metadata: true,
      },
    }),
    client.affiliateReplenishmentDemands.findMany({
      where: {
        rolloutCohort: selection.rolloutCohort,
        contractVersion: selection.contractVersion ?? undefined,
      },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        targetKey: true,
        marketKey: true,
        sportId: true,
        sourceProfile: true,
        rolloutCohort: true,
        contractVersion: true,
        contractHash: true,
        minimumFreshPublishedSupply: true,
        observedFreshPublishedSupply: true,
        priority: true,
        status: true,
        openedAt: true,
        closedAt: true,
        nextEligibleAt: true,
        searchSaturatedUntil: true,
        activeWaveId: true,
        generation: true,
        reasonCodes: true,
        evidenceJson: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    client.affiliateSupplyLifecycleTransitions.findMany({
      where: {
        supplySourceId: { in: scopedRootIds },
        contractVersion: selection.contractVersion ?? undefined,
      },
      orderBy: { occurredAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        supplySourceId: true,
        sequence: true,
        generation: true,
        fromStage: true,
        toStage: true,
        outcome: true,
        command: true,
        commandRef: true,
        idempotencyKey: true,
        requestHash: true,
        resultHash: true,
        contractVersion: true,
        contractHash: true,
        actorKind: true,
        actorId: true,
        executingAgentId: true,
        reasonCodes: true,
        evidenceRefs: true,
        requestJson: true,
        resultJson: true,
        occurredAt: true,
        retentionClass: true,
      },
    }),
    client.affiliateAgentGatewayJobs.findMany({
      where: {
        OR: [
          { supplySourceId: { in: scopedRootIds } },
          {
            subjectJson: {
              path: ["rolloutCohort"],
              equals: selection.rolloutCohort,
            },
            ...gatewaySubjectContractScope,
          },
          {
            subjectJson: { path: ["cohort"], equals: selection.rolloutCohort },
            ...gatewaySubjectContractScope,
          },
          ...scopedCoverageCellIds.flatMap((cellId) => [
            { subjectJson: { path: ["coverageCellId"], equals: cellId } },
            {
              subjectJson: {
                path: ["coverageCellIds"],
                array_contains: [cellId],
              },
            },
          ]),
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        queue: true,
        lane: true,
        role: true,
        subjectType: true,
        subjectId: true,
        subjectJson: true,
        evidenceManifestJson: true,
        supplySourceId: true,
        expectedLifecycleGeneration: true,
        status: true,
        priority: true,
        nextAttemptAt: true,
        claimGeneration: true,
        activeClaimId: true,
        parentClaimId: true,
        invocationFailureCount: true,
        lastInvocationFailedAt: true,
        pipelineBlockedAt: true,
        terminalDisposition: true,
        resultHash: true,
        resultJson: true,
        terminalReceiptId: true,
        finishedAt: true,
        eventSequence: true,
      },
    }),
    client.affiliateCoverageCellAssessments.findMany({
      where: { cellId: { in: scopedCoverageCellIds } },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        cellId: true,
        cycleKey: true,
        decision: true,
        campaignIds: true,
        strategyKeys: true,
        strategyFamilyKeys: true,
        newQualifiedPolicyKeyCount: true,
        unresolvedLeadCount: true,
        successfulQueryCount: true,
        failedQueryCount: true,
        queryStrategyVersion: true,
        evidence: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    client.affiliateCoverageAgentJobs.findMany({
      where:
        scopedCoverageCellIds.length > 0
          ? {
              OR: scopedCoverageCellIds.flatMap((cellId) => [
                { context: { path: ["coverageCellId"], equals: cellId } },
                {
                  context: {
                    path: ["coverageCellIds"],
                    array_contains: [cellId],
                  },
                },
              ]),
            }
          : { id: { in: [] } },
      orderBy: [
        { cohortPriority: "asc" },
        { priorityScore: "desc" },
        { createdAt: "desc" },
      ],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        subjectType: true,
        subjectKey: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        workerId: true,
        attemptCount: true,
        context: true,
        result: true,
        errorMessage: true,
        finishedAt: true,
        cohortPriority: true,
        priorityScore: true,
        priorityRank: true,
        isBlockingCoverage: true,
      },
    }),
    client.affiliateSourceMappingJobs.findMany({
      where: {
        OR: [
          { supplySourceId: { in: scopedRootIds } },
          { intakeId: { in: scopedRootIntakeIds } },
          { sourceId: { in: scopedRootLiveSourceIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        sourceId: true,
        mappingId: true,
        legacyIdentityMigrationEligible: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        workerId: true,
        attemptCount: true,
        branch: true,
        commit: true,
        resultSummary: true,
        errorMessage: true,
        finishedAt: true,
      },
    }),
    client.affiliateApprovalJobs.findMany({
      where: { supplySourceId: { in: scopedRootIds } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        subjectType: true,
        supplySourceId: true,
        subjectKey: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        reviewerId: true,
        attemptCount: true,
        decision: true,
        errorMessage: true,
        finishedAt: true,
      },
    }),
    client.affiliateSourceIntakes.findMany({
      where: {
        OR: [
          { id: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        sourceKey: true,
        region: true,
        baseUrl: true,
        status: true,
        complianceStatus: true,
        targetKindHints: true,
        notes: true,
        organizationId: true,
        affiliateSourceId: true,
        supplySourceId: true,
        lastRunId: true,
        selectedLogoArtifactId: true,
        complianceTermsUrl: true,
        complianceNotes: true,
      },
    }),
    client.affiliateSourceIntakePages.findMany({
      where: {
        OR: [
          { intakeId: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        url: true,
        canonicalUrl: true,
        role: true,
        targetKindHints: true,
        status: true,
        discoverySource: true,
        robotsStatus: true,
        robotsCheckedAt: true,
        robotsNotes: true,
        metadata: true,
      },
    }),
    client.affiliateSourceIntakeRuns.findMany({
      where: {
        OR: [
          { intakeId: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        requestedPageIds: true,
        provider: true,
        status: true,
        queuedAt: true,
        startedAt: true,
        finishedAt: true,
        claimedAt: true,
        workerId: true,
        attemptCount: true,
        providerJobIds: true,
        discoveredUrlCount: true,
        capturedPageCount: true,
        errorMessage: true,
        summary: true,
      },
    }),
    client.affiliateSourceIntakeArtifacts.findMany({
      where: {
        OR: [
          { intakeId: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        pageId: true,
        runId: true,
        kind: true,
        sourceUrl: true,
        finalUrl: true,
        provider: true,
        httpStatus: true,
        contentHash: true,
        dedupeKey: true,
        fileId: true,
        mimeType: true,
        sizeBytes: true,
        retainUntil: true,
        isPinned: true,
        metadata: true,
      },
    }),
    client.affiliateScrapeSources.findMany({
      where: {
        OR: [
          { id: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        sourceKey: true,
        organizationId: true,
        baseUrl: true,
        listUrl: true,
        targetKind: true,
        status: true,
        activeMappingId: true,
        supplySourceId: true,
        lastScrapeRunId: true,
        lifecycleGeneration: true,
        activeSupplyContractVersion: true,
        activeSupplyContractHash: true,
        lastScrapedAt: true,
        autoScrapeEnabled: true,
        scrapeIntervalMinutes: true,
        notes: true,
        metadata: true,
      },
    }),
    client.affiliateScrapeMappings.findMany({
      where: {
        OR: [
          { sourceId: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: [{ isActive: "desc" }, { version: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        supplySourceId: true,
        version: true,
        isActive: true,
        mapping: true,
        createdByUserId: true,
        notes: true,
        validatedAt: true,
      },
    }),
    client.affiliateScrapeRuns.findMany({
      where: {
        OR: [
          { sourceId: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        supplySourceId: true,
        mappingId: true,
        requestedByUserId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        fetchedUrl: true,
        finalUrl: true,
        httpStatus: true,
        itemCount: true,
        candidateCount: true,
        errorMessage: true,
        logs: true,
        metadata: true,
      },
    }),
    client.affiliateImportCandidates.findMany({
      where: {
        OR: [
          { sourceId: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        supplySourceId: true,
        runId: true,
        mappingId: true,
        listingKind: true,
        status: true,
        title: true,
        organizerName: true,
        sportName: true,
        city: true,
        venueName: true,
        startsAt: true,
        endsAt: true,
        officialActionUrl: true,
        sourceUrl: true,
        description: true,
        rawPayload: true,
        warnings: true,
        publishedEventId: true,
        publishedTeamId: true,
        publishedFacilityId: true,
        publishedOrganizationId: true,
      },
    }),
    client.affiliateAgentWorkerHealth.findMany({
      orderBy: { heartbeatAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        workerId: true,
        role: true,
        status: true,
        heartbeatAt: true,
        leaseExpiresAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const waves = await client.affiliateReplenishmentWaves.findMany({
    where: { demandId: { in: demands.map((demand) => demand.id) } },
    orderBy: { createdAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      demandId: true,
      rolloutCohort: true,
      status: true,
      campaignId: true,
      coveragePlanningJobId: true,
      provider: true,
      providerOperationKey: true,
      startedAt: true,
      terminalAt: true,
      retryAt: true,
      marginalYield: true,
      errorCode: true,
      resultJson: true,
      demandGeneration: true,
      evidenceRefs: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const assessmentCampaignIds = [
    ...new Set(
      coverageAssessments.flatMap((assessment) => assessment.campaignIds),
    ),
  ];
  const campaignMetadataScope =
    scopedCoverageCellIds.length > 0
      ? {
          OR: [
            { id: { in: assessmentCampaignIds } },
            ...scopedCoverageCellIds.map((cellId) => ({
              metadata: { path: ["coverageCellIds"], array_contains: [cellId] },
            })),
            {
              metadata: {
                path: ["rolloutCohort"],
                equals: selection.rolloutCohort,
              },
            },
            { metadata: { path: ["cohort"], equals: selection.rolloutCohort } },
          ],
        }
      : { id: { in: assessmentCampaignIds } };
  const campaigns = await client.affiliateSourceDiscoveryCampaigns.findMany({
    where: campaignMetadataScope,
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      name: true,
      region: true,
      location: true,
      sportIds: true,
      sourceTypeHints: true,
      status: true,
      lastRunAt: true,
      nextRunAt: true,
      maxQueriesPerRun: true,
      maxResultsPerQuery: true,
      queryCursor: true,
      coverageFingerprint: true,
      metadata: true,
    },
  });
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const discoveryRuns = await client.affiliateSourceDiscoveryRuns.findMany({
    where: { campaignId: { in: campaignIds } },
    orderBy: { createdAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      campaignId: true,
      requestedByUserId: true,
      status: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      claimedAt: true,
      workerId: true,
      attemptCount: true,
      generatedQueryCount: true,
      returnedResultCount: true,
      newResultCount: true,
      duplicateCount: true,
      rejectedCount: true,
      createdIntakeCount: true,
      providerJobIds: true,
      errorMessage: true,
      summary: true,
    },
  });
  const discoveryRunIds = discoveryRuns.map((run) => run.id);
  const discoveryQueries =
    await client.affiliateSourceDiscoveryQueryExecutions.findMany({
      where: {
        campaignId: { in: campaignIds },
        runId: { in: discoveryRunIds },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        runId: true,
        campaignId: true,
        queryKey: true,
        cityGeoid: true,
        targetCity: true,
        targetState: true,
        sportId: true,
        sportName: true,
        profileKey: true,
        strategyKey: true,
        strategyFamilyKey: true,
        queryText: true,
        provider: true,
        status: true,
        returnedResultCount: true,
        qualifiedDirectCount: true,
        newQualifiedPolicyKeyCount: true,
        intakeCreatedCount: true,
        duplicateCount: true,
        rejectedCount: true,
        qualifiedPolicyKeys: true,
        newQualifiedPolicyKeys: true,
        errorCode: true,
        metadata: true,
      },
    });
  const discoveryResults =
    await client.affiliateSourceDiscoveryResults.findMany({
      where: { campaignId: { in: campaignIds } },
      orderBy: { lastSeenAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        campaignId: true,
        latestRunId: true,
        originalUrl: true,
        canonicalUrl: true,
        urlKey: true,
        policyKey: true,
        title: true,
        description: true,
        latestQuery: true,
        latestRank: true,
        firstSeenAt: true,
        lastSeenAt: true,
        seenCount: true,
        score: true,
        sourceTypeHints: true,
        sportHints: true,
        status: true,
        reasonCodes: true,
        reasonDetails: true,
        matchingIntakeId: true,
        matchingSourceId: true,
        supplySourceId: true,
        matchingOrganizationId: true,
        metadata: true,
      },
    });
  const scopedPolicyKeys = [
    ...new Set([
      ...intakes.map((intake) => intake.sourceKey),
      ...discoveryQueries.flatMap((query) => [
        ...query.qualifiedPolicyKeys,
        ...query.newQualifiedPolicyKeys,
      ]),
      ...discoveryResults.map((result) => result.policyKey),
    ]),
  ];
  const domainPolicies = await client.affiliateSourceDomainPolicies.findMany({
    where: { policyKey: { in: scopedPolicyKeys } },
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      policyKey: true,
      status: true,
      reviewedByUserId: true,
      reviewedAt: true,
      expiresAt: true,
      termsUrl: true,
      robotsSummary: true,
      restrictionNotes: true,
      evidence: true,
    },
  });
  const scopedGatewayJobIds = gatewayJobs.map((job) => job.id);
  const [gatewayClaims, receipts, gatewayEvents] = await Promise.all([
    client.affiliateAgentGatewayClaims.findMany({
      where: { jobId: { in: scopedGatewayJobIds } },
      orderBy: { claimedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        jobId: true,
        parentClaimId: true,
        claimGeneration: true,
        lifecycleGeneration: true,
        queue: true,
        lane: true,
        role: true,
        workerId: true,
        invocationId: true,
        claimRequestHash: true,
        workspaceId: true,
        workspaceMode: true,
        status: true,
        claimedAt: true,
        lastHeartbeatAt: true,
        leaseExpiresAt: true,
        hardDeadlineAt: true,
        endedAt: true,
        terminalReceiptId: true,
        safeFailureCode: true,
        safeFailureSummary: true,
        diagnosticRetainUntil: true,
      },
    }),
    client.affiliateAgentGatewayOperationReceipts.findMany({
      where: { jobId: { in: scopedGatewayJobIds } },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        claimId: true,
        jobId: true,
        claimGeneration: true,
        idempotencyKey: true,
        operationKind: true,
        commandName: true,
        requestHash: true,
        status: true,
        responseHash: true,
        safeErrorCode: true,
        externalOperationKey: true,
        startedAt: true,
        completedAt: true,
        reconcileAfter: true,
        retentionClass: true,
        retentionDeadline: true,
      },
    }),
    client.affiliateAgentGatewayEvents.findMany({
      orderBy: { createdAt: "desc" },
      where: { jobId: { in: scopedGatewayJobIds } },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        eventKey: true,
        jobId: true,
        claimId: true,
        receiptId: true,
        sequence: true,
        eventType: true,
        actorKind: true,
        actorId: true,
        role: true,
        requestHash: true,
        inputHash: true,
        outputHash: true,
        reasonCodes: true,
        payload: true,
        retentionClass: true,
        retentionDeadline: true,
      },
    }),
  ]);
  const scopedDemandIds = demands.map((demand) => demand.id);
  const scopedWaveIds = waves.map((wave) => wave.id);
  const operationalAlertContractScope =
    selection.contractVersion === null
      ? { contractVersion: null }
      : {
          OR: [
            { contractVersion: null },
            { contractVersion: selection.contractVersion },
          ],
        };
  const operationalAlerts = await client.affiliateOperationalAlerts.findMany({
    where: {
      AND: [
        {
          OR: [
            { supplySourceId: { in: scopedRootIds } },
            { coverageCellId: { in: scopedCoverageCellIds } },
            { demandId: { in: scopedDemandIds } },
            { waveId: { in: scopedWaveIds } },
            { rolloutCohort: selection.rolloutCohort },
            {
              rolloutCohort: null,
              contractVersion: null,
              supplySourceId: null,
              coverageCellId: null,
              demandId: null,
              waveId: null,
            },
          ],
        },
        operationalAlertContractScope,
      ],
    },
    orderBy: { createdAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      eventKey: true,
      category: true,
      severity: true,
      title: true,
      detail: true,
      subjectType: true,
      subjectId: true,
      rolloutCohort: true,
      contractVersion: true,
      supplySourceId: true,
      coverageCellId: true,
      demandId: true,
      waveId: true,
      queue: true,
      lifecycleGeneration: true,
      claimGeneration: true,
      workerId: true,
      attempt: true,
      previousState: true,
      nextState: true,
      reasonCodes: true,
      evidenceRefs: true,
      inputHash: true,
      outputHash: true,
      payload: true,
      retentionClass: true,
      retentionDeadline: true,
    },
  });
  const scopedAlertIds = operationalAlerts.map((alert) => alert.id);
  const alertDeliveries =
    await client.affiliateOperationalAlertDeliveries.findMany({
      where: { alertId: { in: scopedAlertIds } },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        alertId: true,
        channel: true,
        status: true,
        attempt: true,
        deliveredAt: true,
        responseCode: true,
        responseBody: true,
        errorMessage: true,
      },
    });
  const scopedOrganizationIds = [
    ...new Set(
      [
        ...intakes.map((intake) => intake.organizationId),
        ...sources.map((source) => source.organizationId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const organizations = await client.organizations.findMany({
    where: { id: { in: scopedOrganizationIds } },
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      name: true,
      location: true,
      website: true,
      status: true,
      verificationStatus: true,
      originType: true,
      ownershipStatus: true,
      publicSlug: true,
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
    },
  });
  const rawRows = {
    contracts,
    roots,
    targets,
    demands,
    waves,
    transitions,
    gatewayJobs,
    gatewayClaims,
    receipts,
    gatewayEvents,
    coverageCells,
    coverageAssessments,
    coverageJobs,
    discoveryQueries,
    discoveryRuns,
    discoveryResults,
    domainPolicies,
    mappingJobs,
    approvals,
    intakes,
    pages,
    intakeRuns,
    artifacts,
    sources,
    mappings,
    scrapeRuns,
    candidates,
    campaigns,
    operationalAlerts,
    alertDeliveries,
    workerHealth,
    organizations,
  };
  const oversizedCollections = Object.entries(rawRows)
    .filter(
      ([collection, rows]) =>
        rows.length > MAX_PROJECTION_ROWS &&
        !TRUNCATION_TOLERATED_COLLECTIONS.has(collection),
    )
    .map(([collection]) => collection);
  if (oversizedCollections.length > 0) {
    throw new AffiliateOperationsProjectionIncompleteError(
      oversizedCollections,
    );
  }
  return Object.fromEntries(
    Object.entries(rawRows).map(([collection, rows]) => [
      collection,
      rows.length > MAX_PROJECTION_ROWS
        ? rows.slice(0, MAX_PROJECTION_ROWS)
        : rows,
    ]),
  ) as typeof rawRows;
};
const scopeProjectionRows = (
  rows: ProjectionRows,
  selection: AffiliateOperationsContractSelection,
): ProjectionRows => {
  const cohort = selection.rolloutCohort.trim() || "DEFAULT";
  const version = selection.contractVersion;
  const roots = rows.roots.filter(
    (root) =>
      root.rolloutCohort === cohort &&
      (version === null || root.activeSupplyContractVersion === version),
  );
  const rootIds = new Set(roots.map((root) => root.id));
  const rootIntakeIds = new Set(
    roots
      .map((root) => root.intakeId)
      .filter((id): id is string => Boolean(id)),
  );
  const rootLiveSourceIds = new Set(
    roots
      .map((root) => root.liveSourceId)
      .filter((id): id is string => Boolean(id)),
  );
  const demands = rows.demands.filter(
    (demand) =>
      demand.rolloutCohort === cohort &&
      (version === null || demand.contractVersion === version),
  );
  const demandIds = new Set(demands.map((demand) => demand.id));
  const coverageCells = rows.coverageCells.filter(
    (cell) => cell.cohort === cohort,
  );
  const coverageCellIds = new Set(coverageCells.map((cell) => cell.id));
  const coverageAssessments = rows.coverageAssessments.filter((assessment) =>
    coverageCellIds.has(assessment.cellId),
  );
  const assessmentCampaignIds = new Set(
    coverageAssessments.flatMap((assessment) => assessment.campaignIds),
  );
  const campaignMatchesScope = (
    campaign: ProjectionRows["campaigns"][number],
  ): boolean => {
    const metadata = recordValue(campaign.metadata);
    const campaignCohort = stringValue(
      metadata.rolloutCohort ?? metadata.cohort,
    );
    const campaignVersion = numberValue(
      metadata.contractVersion ?? metadata.supplyContractVersion,
      -1,
    );
    if (campaignCohort !== null || campaignVersion >= 0) {
      return (
        (campaignCohort === null || campaignCohort === cohort) &&
        (campaignVersion < 0 || version === null || campaignVersion === version)
      );
    }
    return assessmentCampaignIds.has(campaign.id);
  };
  const campaigns = rows.campaigns.filter(campaignMatchesScope);
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const discoveryRuns = rows.discoveryRuns.filter((run) =>
    campaignIds.has(run.campaignId),
  );
  const discoveryRunIds = new Set(discoveryRuns.map((run) => run.id));
  const discoveryQueries = rows.discoveryQueries.filter(
    (query) =>
      campaignIds.has(query.campaignId) && discoveryRunIds.has(query.runId),
  );
  const discoveryResults = rows.discoveryResults.filter((result) =>
    campaignIds.has(result.campaignId),
  );
  const relevantSupplySource = (
    supplySourceId: string | null | undefined,
  ): boolean => Boolean(supplySourceId && rootIds.has(supplySourceId));
  const scopedIntakes = rows.intakes.filter(
    (intake) =>
      rootIntakeIds.has(intake.id) ||
      relevantSupplySource(intake.supplySourceId),
  );
  const intakeIds = new Set(scopedIntakes.map((intake) => intake.id));
  const scopedSources = rows.sources.filter(
    (source) =>
      rootLiveSourceIds.has(source.id) ||
      relevantSupplySource(source.supplySourceId),
  );
  const sourceIds = new Set(scopedSources.map((source) => source.id));
  const pages = rows.pages.filter(
    (page) =>
      intakeIds.has(page.intakeId) || relevantSupplySource(page.supplySourceId),
  );
  const intakeRuns = rows.intakeRuns.filter(
    (run) =>
      intakeIds.has(run.intakeId) || relevantSupplySource(run.supplySourceId),
  );
  const artifacts = rows.artifacts.filter(
    (artifact) =>
      intakeIds.has(artifact.intakeId) ||
      relevantSupplySource(artifact.supplySourceId),
  );
  const coverageJobMatchesScope = (
    job: ProjectionRows["coverageJobs"][number],
  ): boolean => {
    const context = recordValue(job.context);
    const contextCellIds = new Set(stringList(context.coverageCellIds));
    const contextCellId = stringValue(context.coverageCellId);
    if (contextCellId) contextCellIds.add(contextCellId);
    return Array.from(contextCellIds).some((cellId) =>
      coverageCellIds.has(cellId),
    );
  };
  const scopedPolicyKeys = new Set([
    ...scopedIntakes.map((intake) => intake.sourceKey),
    ...discoveryQueries.flatMap((query) => [
      ...query.qualifiedPolicyKeys,
      ...query.newQualifiedPolicyKeys,
    ]),
    ...discoveryResults.map((result) => result.policyKey),
  ]);
  const jobMatchesScope = (
    job: ProjectionRows["gatewayJobs"][number],
  ): boolean => {
    if (relevantSupplySource(job.supplySourceId)) return true;
    const subject = recordValue(job.subjectJson);
    const jobCohort = stringValue(subject.rolloutCohort ?? subject.cohort);
    const jobVersion = numberValue(
      subject.contractVersion ?? subject.supplyContractVersion,
      -1,
    );
    const policyKey = stringValue(subject.policyKey ?? subject.domainPolicyKey);
    return (
      stringList(subject.coverageCellIds).some((cellId) =>
        coverageCellIds.has(cellId),
      ) ||
      stringList(subject.campaignIds).some((campaignId) =>
        campaignIds.has(campaignId),
      ) ||
      (policyKey !== null && scopedPolicyKeys.has(policyKey)) ||
      (jobCohort === cohort && (version === null || jobVersion === version))
    );
  };
  const gatewayJobs = rows.gatewayJobs.filter(jobMatchesScope);
  const gatewayJobIds = new Set(gatewayJobs.map((job) => job.id));
  const gatewayClaims = rows.gatewayClaims.filter((claim) =>
    gatewayJobIds.has(claim.jobId),
  );
  const operationalAlerts = rows.operationalAlerts.filter((alert) => {
    const payload = recordValue(alert.payload);
    const alertRootId = rootIdForAlert(rows, alert);
    const payloadCoverageCellId = stringValue(payload.coverageCellId);
    const payloadDemandId = stringValue(payload.demandId);
    const payloadWaveId = stringValue(payload.waveId);
    const hasLineage = Boolean(
      alert.supplySourceId ||
        alert.coverageCellId ||
        alert.demandId ||
        alert.waveId ||
        alertRootId ||
        payloadCoverageCellId ||
        payloadDemandId ||
        payloadWaveId ||
        payload.supplySourceId ||
        payload.sourceId ||
        payload.scrapeRunId ||
        payload.runId ||
        payload.jobId ||
        payload.gatewayJobId,
    );
    const isGlobal =
      !hasLineage &&
      alert.rolloutCohort === null &&
      alert.contractVersion === null;
    if (isGlobal) return true;
    if (alert.rolloutCohort !== null && alert.rolloutCohort !== cohort)
      return false;
    if (alert.contractVersion !== null && alert.contractVersion !== version)
      return false;
    return (
      (alertRootId !== null && rootIds.has(alertRootId)) ||
      (alert.coverageCellId !== null &&
        coverageCellIds.has(alert.coverageCellId)) ||
      (alert.demandId !== null && demandIds.has(alert.demandId)) ||
      (alert.waveId !== null &&
        rows.waves.some(
          (wave) => wave.id === alert.waveId && demandIds.has(wave.demandId),
        )) ||
      (payloadCoverageCellId !== null &&
        coverageCellIds.has(payloadCoverageCellId)) ||
      (payloadDemandId !== null && demandIds.has(payloadDemandId)) ||
      (payloadWaveId !== null &&
        rows.waves.some(
          (wave) => wave.id === payloadWaveId && demandIds.has(wave.demandId),
        ))
    );
  });
  const alertIds = new Set(operationalAlerts.map((alert) => alert.id));
  const alertDeliveries = rows.alertDeliveries.filter((delivery) =>
    alertIds.has(delivery.alertId),
  );
  const organizationIds = new Set(
    [
      ...scopedIntakes.map((intake) => intake.organizationId),
      ...scopedSources.map((source) => source.organizationId),
    ].filter((id): id is string => Boolean(id)),
  );
  const organizations = rows.organizations.filter((organization) =>
    organizationIds.has(organization.id),
  );
  return {
    ...rows,
    roots,
    targets: rows.targets.filter((target) =>
      rootIds.has(target.supplySourceId),
    ),
    demands,
    waves: rows.waves.filter(
      (wave) => demandIds.has(wave.demandId) && wave.rolloutCohort === cohort,
    ),
    transitions: rows.transitions.filter(
      (transition) =>
        rootIds.has(transition.supplySourceId) &&
        (version === null || transition.contractVersion === version),
    ),
    gatewayJobs,
    gatewayClaims,
    receipts: rows.receipts.filter((receipt) =>
      gatewayJobIds.has(receipt.jobId),
    ),
    gatewayEvents: rows.gatewayEvents.filter(
      (event) =>
        (event.jobId ? gatewayJobIds.has(event.jobId) : false) ||
        (event.claimId
          ? gatewayClaims.some((claim) => claim.id === event.claimId)
          : false),
    ),
    coverageCells,
    coverageAssessments,
    coverageJobs: rows.coverageJobs.filter(coverageJobMatchesScope),
    discoveryQueries,
    discoveryRuns,
    discoveryResults,
    domainPolicies: rows.domainPolicies.filter((policy) =>
      scopedPolicyKeys.has(policy.policyKey),
    ),
    mappingJobs: rows.mappingJobs.filter(
      (job) =>
        intakeIds.has(job.intakeId) ||
        relevantSupplySource(job.supplySourceId) ||
        (job.sourceId !== null && sourceIds.has(job.sourceId)),
    ),
    approvals: rows.approvals.filter((job) =>
      relevantSupplySource(job.supplySourceId),
    ),
    intakes: scopedIntakes,
    pages,
    intakeRuns,
    artifacts,
    sources: scopedSources,
    mappings: rows.mappings.filter(
      (mapping) =>
        relevantSupplySource(mapping.supplySourceId) ||
        (mapping.sourceId !== null && sourceIds.has(mapping.sourceId)),
    ),
    scrapeRuns: rows.scrapeRuns.filter(
      (run) =>
        relevantSupplySource(run.supplySourceId) || sourceIds.has(run.sourceId),
    ),
    candidates: rows.candidates.filter(
      (candidate) =>
        relevantSupplySource(candidate.supplySourceId) ||
        (candidate.sourceId !== null && sourceIds.has(candidate.sourceId)),
    ),
    campaigns,
    operationalAlerts,
    alertDeliveries,
    workerHealth: rows.workerHealth,
  };
};

const latestProjectionRecord = <T extends { id: string }>(
  records: readonly T[],
  timestamp: (record: T) => unknown,
): { id: string; at: string | null } | null => {
  let latest: { id: string; at: string | null; time: number } | null = null;
  for (const record of records) {
    const at = isoValue(timestamp(record));
    const time = dateValue(at)?.getTime() ?? 0;
    if (
      !latest ||
      time > latest.time ||
      (time === latest.time && record.id > latest.id)
    ) {
      latest = { id: record.id, at, time };
    }
  }
  return latest ? { id: latest.id, at: latest.at } : null;
};

const historyRevisionFor = (
  rows: ProjectionRows,
  contract: AffiliateOperationsContractSelection,
): string => {
  const newestRollups = {
    lifecycle: latestProjectionRecord(
      rows.transitions,
      (record) => record.occurredAt,
    ),
    gateway: latestProjectionRecord(
      rows.gatewayEvents,
      (record) => record.createdAt,
    ),
    capture: latestProjectionRecord(
      rows.intakeRuns,
      (record) => record.finishedAt ?? record.updatedAt ?? record.createdAt,
    ),
    discovery: latestProjectionRecord(
      rows.discoveryRuns,
      (record) => record.finishedAt ?? record.updatedAt ?? record.createdAt,
    ),
    assessment: latestProjectionRecord(
      rows.coverageAssessments,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    mapping: latestProjectionRecord(
      rows.mappingJobs,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    review: latestProjectionRecord(
      rows.approvals,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    demand: latestProjectionRecord(
      rows.demands,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    wave: latestProjectionRecord(
      rows.waves,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    refresh: latestProjectionRecord(
      rows.scrapeRuns,
      (record) => record.finishedAt ?? record.updatedAt ?? record.createdAt,
    ),
    alert: latestProjectionRecord(
      rows.operationalAlerts,
      (record) => record.createdAt,
    ),
    alertDelivery: latestProjectionRecord(
      rows.alertDeliveries,
      (record) => record.createdAt,
    ),
  };
  return createHash("sha256")
    .update(
      JSON.stringify({
        contract,
        newestRollups,
      }),
    )
    .digest("hex");
};

const buildTargetDeficits = (
  rows: ProjectionRows,
  rootsById: ReadonlyMap<string, ProjectionRows["roots"][number]>,
  contractJson: unknown,
  contract: AffiliateOperationsContractSelection,
  now: Date,
  filters: AffiliateOperationsFilters,
): SupplyTargetDeficitRow[] => {
  const dimensionContext = projectionDimensionContext(rows);
  const rules = parseTargetRules(contractJson, contract.rolloutCohort).filter(
    (rule) =>
      containsFilter(rule.marketKey, filters.market) &&
      containsFilter(rule.sportId, filters.sport) &&
      containsFilter(rule.sourceProfile, filters.profile) &&
      (!filters.city ||
        rows.targets.some(
          (target) =>
            target.marketKey === rule.marketKey &&
            target.sportId === rule.sportId &&
            upper(target.sourceProfile) === upper(rule.sourceProfile) &&
            targetMatchesCity(target, dimensionContext, filters.city),
        )),
  );
  const version = contract.contractVersion ?? 0;
  const demandByKey = new Map(
    rows.demands
      .filter(
        (demand) =>
          demand.rolloutCohort === contract.rolloutCohort &&
          (contract.contractVersion === null ||
            demand.contractVersion === contract.contractVersion),
      )
      .map((demand) => [
        targetKey(
          demand.marketKey,
          demand.sportId,
          demand.sourceProfile,
          demand.rolloutCohort,
          demand.contractVersion,
        ),
        demand,
      ]),
  );
  const ruleByKey = new Map(
    rules.map((rule) => [
      targetKey(
        rule.marketKey,
        rule.sportId,
        rule.sourceProfile,
        contract.rolloutCohort,
        version,
      ),
      rule,
    ]),
  );
  rows.demands
    .filter(
      (demand) =>
        demand.rolloutCohort === contract.rolloutCohort &&
        (contract.contractVersion === null ||
          demand.contractVersion === contract.contractVersion),
    )
    .forEach((demand) => {
      const key = targetKey(
        demand.marketKey,
        demand.sportId,
        demand.sourceProfile,
        demand.rolloutCohort,
        demand.contractVersion,
      );
      if (!ruleByKey.has(key)) {
        ruleByKey.set(key, {
          marketKey: demand.marketKey,
          sportId: demand.sportId,
          sourceProfile: upper(demand.sourceProfile),
          minimumFreshPublishedSupply: demand.minimumFreshPublishedSupply,
        });
      }
    });
  const counts = new Map<string, number>();
  rows.targets.forEach((target) => {
    const root = rootsById.get(target.supplySourceId);
    if (
      !root ||
      root.rolloutCohort !== contract.rolloutCohort ||
      (contract.contractVersion !== null &&
        root.activeSupplyContractVersion !== contract.contractVersion) ||
      !isFreshTarget(target, root, contractJson, contract.rolloutCohort, now)
    )
      return;
    const key = targetKey(
      target.marketKey,
      target.sportId,
      target.sourceProfile,
      root.rolloutCohort,
      root.activeSupplyContractVersion,
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(ruleByKey.entries())
    .map(([key, rule]) => {
      const demand = demandByKey.get(key);
      const current = counts.get(key) ?? 0;
      const target = Math.max(
        rule.minimumFreshPublishedSupply,
        demand?.minimumFreshPublishedSupply ?? 0,
      );
      const deficit = Math.max(0, target - current);
      return {
        id: demand?.id ?? `target:${key}`,
        marketKey: rule.marketKey,
        sportId: rule.sportId,
        sourceProfile: upper(rule.sourceProfile),
        rolloutCohort: contract.rolloutCohort,
        contractVersion: version,
        current,
        target,
        deficit,
        priority: demand?.priority ?? 4,
        status: demand?.status ?? (deficit > 0 ? "OPEN" : "MET"),
        href: adminLink("coverage", undefined, undefined, {
          market: rule.marketKey,
          sport: rule.sportId,
          profile: upper(rule.sourceProfile),
          rolloutCohort: contract.rolloutCohort,
          contractVersion: String(version),
        }),
      };
    })
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        right.deficit - left.deficit ||
        String(left.marketKey ?? "").localeCompare(
          String(right.marketKey ?? ""),
        ) ||
        String(left.sportId ?? "").localeCompare(String(right.sportId ?? "")) ||
        left.sourceProfile.localeCompare(right.sourceProfile),
    );
};
const buildWipSeries = (rows: ProjectionRows, now: Date): WipSeriesPoint[] => {
  const points: WipSeriesPoint[] = [];
  const lanes: WipSeriesPoint["lane"][] = ["MAPPING", "REVIEW"];
  const waitingStates = new Set([
    "QUEUED",
    "RETRY_WAIT",
    "DEFERRED",
    "REVIEW_REQUIRED",
    "PENDING",
  ]);
  const terminalEventTypes = new Set([
    "CLAIM_TERMINAL_RESULT_ACCEPTED",
    "CLAIM_TERMINAL_RESULT_REPLAYED",
  ]);
  const eventsByJob = new Map<
    string,
    ProjectionRows["gatewayEvents"][number][]
  >();
  const claimsByJob = new Map<
    string,
    ProjectionRows["gatewayClaims"][number][]
  >();
  const jobsById = new Map(rows.gatewayJobs.map((job) => [job.id, job]));
  rows.gatewayEvents.forEach((event) => {
    const events = eventsByJob.get(event.jobId) ?? [];
    events.push(event);
    eventsByJob.set(event.jobId, events);
  });
  rows.gatewayClaims.forEach((claim) => {
    const claims = claimsByJob.get(claim.jobId) ?? [];
    claims.push(claim);
    claimsByJob.set(claim.jobId, claims);
  });
  eventsByJob.forEach((events) => {
    events.sort(
      (left, right) =>
        (dateValue(right.createdAt)?.getTime() ?? 0) -
        (dateValue(left.createdAt)?.getTime() ?? 0),
    );
  });
  claimsByJob.forEach((claims) => {
    claims.sort(
      (left, right) =>
        (dateValue(left.claimedAt)?.getTime() ?? 0) -
        (dateValue(right.claimedAt)?.getTime() ?? 0),
    );
  });
  const laneFor = (value: unknown): WipSeriesPoint["lane"] | null => {
    const normalized = upper(value);
    if (normalized.includes("REVIEW")) return "REVIEW";
    if (normalized.includes("MAPPING")) return "MAPPING";
    return null;
  };
  const workerLimitFor = (lane: WipSeriesPoint["lane"]): number | null => {
    const healthyWorkers = rows.workerHealth.filter(
      (worker) => laneFor(worker.role) === lane && isWorkerHealthy(worker, now),
    ).length;
    return healthyWorkers * 2;
  };
  const stateForEvent = (
    event: ProjectionRows["gatewayEvents"][number],
  ): string => {
    const eventType = upper(event.eventType);
    if (
      eventType === "CLAIM_INVOCATION_FAILED" ||
      eventType === "CLAIM_EXPIRED"
    ) {
      return recordValue(event.payload).isPipelineBlocked === true
        ? "PIPELINE_BLOCKED"
        : "RETRY_WAIT";
    }
    if (terminalEventTypes.has(eventType)) return "COMPLETED";
    if (eventType === "CLAIM_CREATED" || eventType.startsWith("CLAIM_"))
      return "CLAIMED";
    if (
      eventType.includes("RESERVED") ||
      eventType.includes("SUCCEEDED") ||
      eventType.includes("REPLAYED")
    ) {
      return "CLAIMED";
    }
    return eventType;
  };
  const stateAt = (
    job: ProjectionRows["gatewayJobs"][number],
    at: Date,
  ): string => {
    const event = (eventsByJob.get(job.id) ?? []).find((candidate) => {
      const recordedAt = dateValue(candidate.createdAt);
      return recordedAt && recordedAt.getTime() <= at.getTime();
    });
    if (event) return stateForEvent(event);
    const firstClaimAt = dateValue(claimsByJob.get(job.id)?.[0]?.claimedAt);
    const createdAt = dateValue(job.createdAt);
    if (
      createdAt &&
      createdAt.getTime() <= at.getTime() &&
      firstClaimAt &&
      at.getTime() < firstClaimAt.getTime()
    ) {
      return "QUEUED";
    }
    return upper(job.status);
  };
  for (let index = 23; index >= 0; index -= 1) {
    const at = new Date(now.getTime() - index * HOUR_MS);
    lanes.forEach((lane) => {
      const waitingJobs = rows.gatewayJobs.filter((job) => {
        if (laneFor(job.lane ?? job.role) !== lane) return false;
        const created = dateValue(job.createdAt);
        const finished = dateValue(job.finishedAt);
        if (
          !created ||
          created.getTime() > at.getTime() ||
          (finished && finished.getTime() <= at.getTime())
        )
          return false;
        return waitingStates.has(stateAt(job, at));
      }).length;
      const activeWorkers = rows.gatewayClaims.filter((claim) => {
        const job = jobsById.get(claim.jobId);
        if (laneFor(claim.lane ?? job?.lane) !== lane) return false;
        const claimed = dateValue(claim.claimedAt);
        const ended = dateValue(claim.endedAt);
        return (
          claimed &&
          claimed.getTime() <= at.getTime() &&
          (!ended || ended.getTime() > at.getTime())
        );
      }).length;
      const replenishmentWaves =
        lane === "MAPPING"
          ? rows.waves.filter((wave) => {
              const started = dateValue(wave.startedAt);
              return (
                started &&
                started.getTime() > at.getTime() - HOUR_MS &&
                started.getTime() <= at.getTime()
              );
            }).length
          : 0;
      points.push({
        at: at.toISOString(),
        lane,
        activeWorkers,
        waitingJobs,
        workerLimit: workerLimitFor(lane),
        replenishmentWaves,
      });
    });
  }
  return points;
};
const buildLifecycleCounts = (rows: ProjectionRows): LifecycleCountRow[] => {
  const counts = new Map<string, number>();
  rows.roots.forEach((root) =>
    counts.set(
      String(root.derivedStage),
      (counts.get(String(root.derivedStage)) ?? 0) + 1,
    ),
  );
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stage, count]) => ({
      stage,
      count,
      href: adminLink("sources", undefined, undefined, { status: stage }),
    }));
};

const isSuccessfulRefreshStatus = (status: unknown): boolean =>
  ["SUCCEEDED", "SUCCESS", "COMPLETED", "PUBLISHED"].includes(upper(status));

const buildExceptions = (
  rows: ProjectionRows,
  now: Date,
  recoveryRows: ProjectionRows = rows,
): ExceptionRow[] => {
  const exceptions: ExceptionRow[] = [];
  const isRefreshRecovered = (
    run: ProjectionRows["scrapeRuns"][number],
  ): boolean => {
    const sourceId = rootIdForSource(
      recoveryRows,
      run.supplySourceId ?? run.sourceId,
    );
    const runAt =
      dateValue(run.finishedAt ?? run.updatedAt ?? run.createdAt)?.getTime() ??
      0;
    const root = sourceId
      ? recoveryRows.roots.find((candidate) => candidate.id === sourceId)
      : null;
    if (root && upper(root.freshnessStatus) === "FRESH") return true;
    return recoveryRows.scrapeRuns.some(
      (candidate) =>
        rootIdForSource(
          recoveryRows,
          candidate.supplySourceId ?? candidate.sourceId,
        ) === sourceId &&
        (dateValue(
          candidate.finishedAt ?? candidate.updatedAt ?? candidate.createdAt,
        )?.getTime() ?? 0) > runAt &&
        isSuccessfulRefreshStatus(candidate.status),
    );
  };
  rows.roots.forEach((root) => {
    root.invariantViolations.forEach((reason) =>
      exceptions.push({
        id: `source:${root.id}:${reason}`,
        kind: "INVARIANT",
        severity: "critical",
        title: "Supply Source invariant",
        detail: `${root.canonicalUrl}: ${reason}`,
        at: isoValue(root.lastAssessmentAt ?? root.updatedAt),
        href: adminLink("sources", "source", root.id),
      }),
    );
  });
  rows.gatewayJobs
    .filter((job) =>
      ["PIPELINE_BLOCKED", "RECONCILIATION_REQUIRED"].includes(
        upper(job.status),
      ),
    )
    .forEach((job) =>
      exceptions.push({
        id: `job:${job.id}`,
        kind: "GATEWAY",
        severity:
          upper(job.status) === "PIPELINE_BLOCKED" ? "critical" : "warning",
        title: `Gateway job ${String(job.status).toLowerCase().split("_").join(" ")}`,
        detail: `${job.role} / ${job.subjectId}`,
        at: isoValue(job.updatedAt),
        href: adminLink("jobs", "job", job.id),
      }),
    );
  rows.receipts
    .filter((receipt) => ["FAILED", "UNKNOWN"].includes(upper(receipt.status)))
    .forEach((receipt) => {
      const receiptAt =
        dateValue(
          receipt.completedAt ?? receipt.updatedAt ?? receipt.createdAt,
        )?.getTime() ?? 0;
      const isRecovered = recoveryRows.receipts.some(
        (candidate) =>
          candidate.jobId === receipt.jobId &&
          (dateValue(
            candidate.completedAt ?? candidate.updatedAt ?? candidate.createdAt,
          )?.getTime() ?? 0) > receiptAt &&
          isSuccessfulRefreshStatus(candidate.status),
      );
      const job = recoveryRows.gatewayJobs.find(
        (candidate) => candidate.id === receipt.jobId,
      );
      if (
        isRecovered ||
        (job &&
          ["COMPLETED", "SUCCEEDED", "SUCCESS"].includes(upper(job.status)))
      )
        return;
      exceptions.push({
        id: `receipt:${receipt.id}`,
        kind: "OPERATION",
        severity: upper(receipt.status) === "UNKNOWN" ? "critical" : "warning",
        title: `Gateway operation ${String(receipt.status).toLowerCase()}`,
        detail: `${receipt.operationKind}: ${receipt.safeErrorCode ?? "No error code"}`,
        at: isoValue(receipt.completedAt ?? receipt.updatedAt),
        href: adminLink("jobs", "operation", receipt.id),
      });
    });
  rows.workerHealth
    .filter(
      (worker) =>
        upper(worker.status) !== "HEALTHY" ||
        (dateValue(worker.leaseExpiresAt)?.getTime() ?? 0) <= now.getTime(),
    )
    .forEach((worker) =>
      exceptions.push({
        id: `worker:${worker.id}`,
        kind: "WORKER",
        severity: "critical",
        title: "Worker health exception",
        detail: `${worker.workerId} / ${worker.role}: ${worker.status}`,
        at: isoValue(worker.heartbeatAt),
        href: adminLink("jobs", "worker", worker.id),
      }),
    );
  rows.scrapeRuns
    .filter((run) => upper(run.status) === "FAILED" && !isRefreshRecovered(run))
    .forEach((run) =>
      exceptions.push({
        id: `scrape:${run.id}`,
        kind: "REFRESH",
        severity: "warning",
        title: "Source refresh failed",
        detail: run.errorMessage ?? "No error message recorded",
        at: isoValue(run.finishedAt ?? run.updatedAt),
        href: adminLink("sources", "scrapeRun", run.id),
      }),
    );
  rows.gatewayEvents
    .filter(
      (event) =>
        upper(event.eventType).includes("FAIL") ||
        upper(event.eventType).includes("ERROR") ||
        event.reasonCodes.length > 0,
    )
    .forEach((event) => {
      const laterEvent = recoveryRows.gatewayEvents.some((candidate) => {
        const sameOperation =
          candidate.jobId === event.jobId ||
          candidate.claimId === event.claimId ||
          candidate.receiptId === event.receiptId;
        const later =
          (dateValue(candidate.createdAt)?.getTime() ?? 0) >
          (dateValue(event.createdAt)?.getTime() ?? 0);
        const eventType = upper(candidate.eventType);
        return (
          candidate.id !== event.id &&
          sameOperation &&
          later &&
          !eventType.includes("FAIL") &&
          !eventType.includes("ERROR") &&
          (eventType.includes("SUCC") ||
            eventType.includes("COMPLET") ||
            eventType.includes("RECOVER") ||
            eventType.includes("REPLAY"))
        );
      });
      const job = event.jobId
        ? recoveryRows.gatewayJobs.find(
            (candidate) => candidate.id === event.jobId,
          )
        : null;
      if (
        laterEvent ||
        (job &&
          ["COMPLETED", "SUCCEEDED", "SUCCESS"].includes(upper(job.status)))
      )
        return;
      exceptions.push({
        id: `event:${event.id}`,
        kind: "EVENT",
        severity: event.reasonCodes.length > 0 ? "warning" : "info",
        title: `Gateway event ${event.eventType}`,
        detail: event.reasonCodes.join(", ") || "Recorded operational event",
        at: isoValue(event.createdAt),
        href: adminLink("jobs", "event", event.id),
      });
    });
  rows.operationalAlerts.forEach((alert) => {
    const sourceRootId = rootIdForAlert(recoveryRows, alert);
    const source = sourceRootId
      ? recoveryRows.roots.find((root) => root.id === sourceRootId)
      : null;
    const payload = recordValue(alert.payload);
    const alertJobId =
      stringValue(payload.jobId ?? payload.gatewayJobId) ??
      (["GATEWAY_JOB", "AGENT_GATEWAY_JOB"].includes(upper(alert.subjectType))
        ? stringValue(alert.subjectId)
        : null);
    const job = alertJobId
      ? recoveryRows.gatewayJobs.find(
          (candidate) => candidate.id === alertJobId,
        )
      : null;
    const workerId =
      stringValue(alert.workerId) ?? stringValue(payload.workerId);
    const worker = workerId
      ? recoveryRows.workerHealth.find(
          (candidate) => candidate.workerId === workerId,
        )
      : null;
    const category = upper(alert.category);
    const deliveryFailureRecovered =
      category === "ALERT_DELIVERY_FAILURE"
        ? (() => {
            const sourceEventKey = stringValue(payload.sourceEventKey);
            const channel = upper(payload.channel);
            const sourceAlert = sourceEventKey
              ? recoveryRows.operationalAlerts.find(
                  (candidate) => candidate.eventKey === sourceEventKey,
                )
              : null;
            return Boolean(
              sourceAlert &&
                typeof channel === "string" &&
                recoveryRows.alertDeliveries.some(
                  (delivery) =>
                    delivery.alertId === sourceAlert.id &&
                    upper(delivery.channel) === channel &&
                    upper(delivery.status) === "DELIVERED",
                ),
            );
          })()
        : false;
    const isRecovered =
      deliveryFailureRecovered ||
      (source &&
        category.includes("REFRESH") &&
        upper(source.freshnessStatus) === "FRESH") ||
      (job &&
        ["COMPLETED", "SUCCEEDED", "SUCCESS"].includes(upper(job.status))) ||
      (worker && isWorkerHealthy(worker, now));
    if (isRecovered) return;
    const severity =
      upper(alert.severity) === "CRITICAL"
        ? "critical"
        : upper(alert.severity) === "WARNING"
          ? "warning"
          : "info";
    exceptions.push({
      id: `alert:${alert.id}`,
      kind: "ALERT",
      severity,
      title: alert.title,
      detail: alert.detail,
      at: isoValue(alert.createdAt),
      href: adminLink("overview", "alert", alert.id),
    });
  });
  return exceptions
    .sort(
      (left, right) =>
        (dateValue(right.at)?.getTime() ?? 0) -
        (dateValue(left.at)?.getTime() ?? 0),
    )
    .slice(0, 50);
};

const buildPriorityWork = (
  rows: ProjectionRows,
  now: Date,
): PriorityWorkRow[] => {
  const work: PriorityWorkRow[] = [];
  rows.demands
    .filter((demand) => ["OPEN", "PAUSED"].includes(upper(demand.status)))
    .forEach((demand) =>
      work.push({
        id: demand.id,
        kind: "REPLENISHMENT_DEMAND",
        priority: demand.priority,
        title: `Restore ${targetLabel(demand.marketKey, demand.sportId, demand.sourceProfile)}`,
        status: demand.status,
        ageMinutes: ageMinutes(demand.openedAt, now),
        href: adminLink("coverage", undefined, undefined, {
          market: demand.marketKey,
          sport: demand.sportId,
          profile: demand.sourceProfile,
        }),
      }),
    );
  rows.mappingJobs
    .filter((job) => !["COMPLETED", "REJECTED"].includes(upper(job.status)))
    .forEach((job) =>
      work.push({
        id: job.id,
        kind: "MAPPING_JOB",
        priority: 1,
        title: `Mapping handoff ${job.supplySourceId ?? job.intakeId}`,
        status: job.status,
        ageMinutes: ageMinutes(job.createdAt, now),
        href: adminLink("jobs", "job", job.id),
      }),
    );
  rows.approvals
    .filter(
      (job) =>
        !["COMPLETED", "APPROVED", "REJECTED"].includes(upper(job.status)),
    )
    .forEach((job) =>
      work.push({
        id: job.id,
        kind: "REVIEW_CASE",
        priority: 2,
        title: `Review ${job.subjectType}`,
        status: job.status,
        ageMinutes: ageMinutes(job.createdAt, now),
        href: adminLink("review", "review", job.id),
      }),
    );
  return work
    .sort(
      (left, right) =>
        left.priority - right.priority || right.ageMinutes - left.ageMinutes,
    )
    .slice(0, 50);
};

const buildCoverage = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): CoverageProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const filteredCells = rows.coverageCells.filter(
    (cell) =>
      cell.cohort === input.contract.rolloutCohort &&
      containsFilter(cell.marketKey, input.filters.market) &&
      containsFilter(cell.cityId, input.filters.city) &&
      (containsFilter(cell.sportName, input.filters.sport) ||
        containsFilter(cell.sportId, input.filters.sport)) &&
      containsFilter(cell.profileKey, input.filters.profile) &&
      containsFilter(cell.coverageStatus, input.filters.status) &&
      matchesDateRange(
        cell.nextReviewAt ?? cell.lastAssessedAt,
        dateRangeCutoff,
      ),
  );
  const cellRows: CoverageCellRow[] = filteredCells
    .map((cell) => ({
      id: cell.id,
      city: cell.cityId,
      marketKey: cell.marketKey,
      sport: cell.sportName || cell.sportId,
      profile: cell.profileKey,
      coverageStatus: cell.coverageStatus,
      searchStatus: cell.searchStatus,
      priorityScore: cell.priorityScore,
      approvedSourceCount: cell.approvedSourceCount,
      unresolvedLeadCount: cell.unresolvedLeadCount,
      nextReviewAt: isoValue(cell.nextReviewAt),
      href: adminLink("coverage", "coverageCell", cell.id, {
        market: cell.marketKey,
        sport: cell.sportId,
        profile: cell.profileKey,
        range: input.filters.range || undefined,
      }),
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore);
  const cellPage = paginate(cellRows, input.page, input.pageSize);
  const dimensionContext = projectionDimensionContext(rows, dateRangeCutoff);
  const rootsBySupplySource = dimensionContext.rootsById;
  const filteredCellIds = new Set(filteredCells.map((cell) => cell.id));
  const demandMatchesDimensions = (
    demand: ProjectionRows["demands"][number],
  ): boolean => {
    if (
      !containsFilter(demand.marketKey, input.filters.market) ||
      !containsFilter(demand.sportId, input.filters.sport) ||
      !containsFilter(demand.sourceProfile, input.filters.profile)
    )
      return false;
    if (!input.filters.city) return true;
    return rows.targets.some(
      (target) =>
        target.marketKey === demand.marketKey &&
        target.sportId === demand.sportId &&
        upper(target.sourceProfile) === upper(demand.sourceProfile) &&
        targetMatchesCity(target, dimensionContext, input.filters.city),
    );
  };
  const demandMatchesFilters = (
    demand: ProjectionRows["demands"][number],
  ): boolean =>
    demandMatchesDimensions(demand) &&
    containsFilter(demand.status, input.filters.status) &&
    matchesDateRange(demand.openedAt ?? demand.updatedAt, dateRangeCutoff);
  const marginalYield: MarginalYieldRow[] = rows.coverageAssessments
    .filter((assessment) => filteredCellIds.has(assessment.cellId))
    .slice(0, 100)
    .map((assessment) => ({
      id: assessment.id,
      cycle: assessment.cycleKey,
      at: isoValue(assessment.createdAt),
      qualifiedSources: assessment.newQualifiedPolicyKeyCount,
      failedQueries: assessment.failedQueryCount,
      unresolvedLeads: assessment.unresolvedLeadCount,
      strategyFamilies:
        assessment.strategyFamilyKeys.join(", ") || "Not recorded",
      href: adminLink("coverage", undefined, undefined, {
        range: assessment.cycleKey,
      }),
    }));
  const targetKeysBySupplySource = new Map<string, Set<string>>();
  rows.targets
    .filter((target) =>
      targetMatchesFilters(target, input.filters, dimensionContext),
    )
    .forEach((target) => {
      const root = rootsBySupplySource.get(target.supplySourceId);
      if (
        !root ||
        root.rolloutCohort !== input.contract.rolloutCohort ||
        (input.contract.contractVersion !== null &&
          root.activeSupplyContractVersion !== input.contract.contractVersion)
      )
        return;
      const keys =
        targetKeysBySupplySource.get(target.supplySourceId) ??
        new Set<string>();
      keys.add(
        targetKey(
          target.marketKey,
          target.sportId,
          target.sourceProfile,
          root.rolloutCohort,
          root.activeSupplyContractVersion,
        ),
      );
      targetKeysBySupplySource.set(target.supplySourceId, keys);
    });
  const demandHistory: DemandHistoryRow[] = [];
  const demandById = new Map(rows.demands.map((demand) => [demand.id, demand]));
  for (let index = 23; index >= 0; index -= 1) {
    const at = new Date(now.getTime() - index * HOUR_MS);
    const next = new Date(at.getTime() + HOUR_MS);
    const openDemands = rows.demands.filter((demand) => {
      if (
        demand.rolloutCohort !== input.contract.rolloutCohort ||
        (input.contract.contractVersion !== null &&
          demand.contractVersion !== input.contract.contractVersion) ||
        !demandMatchesFilters(demand)
      )
        return false;
      const openedAt = dateValue(demand.openedAt);
      const closedAt = dateValue(demand.closedAt);
      return (
        openedAt &&
        openedAt.getTime() <= at.getTime() &&
        (!closedAt || closedAt.getTime() > at.getTime())
      );
    });
    const demandKeys = new Set(
      openDemands.map((demand) =>
        targetKey(
          demand.marketKey,
          demand.sportId,
          demand.sourceProfile,
          demand.rolloutCohort,
          demand.contractVersion,
        ),
      ),
    );
    const campaignStarts = rows.waves.filter((wave) => {
      const startedAt = dateValue(wave.startedAt);
      const demand = demandById.get(wave.demandId);
      return Boolean(
        demand &&
          demandKeys.has(
            targetKey(
              demand.marketKey,
              demand.sportId,
              demand.sourceProfile,
              demand.rolloutCohort,
              demand.contractVersion,
            ),
          ) &&
          startedAt &&
          startedAt.getTime() >= at.getTime() &&
          startedAt.getTime() < next.getTime(),
      );
    }).length;
    const mappingJobsProduced = rows.mappingJobs.filter((job) => {
      const createdAt = dateValue(job.createdAt);
      if (
        !createdAt ||
        createdAt.getTime() < at.getTime() ||
        createdAt.getTime() >= next.getTime() ||
        !job.supplySourceId
      )
        return false;
      const sourceKeys =
        targetKeysBySupplySource.get(job.supplySourceId) ?? new Set<string>();
      return Array.from(sourceKeys).some((key) => demandKeys.has(key));
    }).length;
    const targetRestorations = rows.demands.filter((demand) => {
      const closedAt = dateValue(demand.closedAt);
      return (
        demandMatchesFilters(demand) &&
        closedAt &&
        closedAt.getTime() >= at.getTime() &&
        closedAt.getTime() < next.getTime()
      );
    }).length;
    demandHistory.push({
      id: `demand-history:${at.toISOString()}`,
      at: at.toISOString(),
      openDemand: openDemands.length,
      campaignStarts,
      mappingJobsProduced,
      targetRestorations,
      href: adminLink("coverage", undefined, undefined, { range: "24h" }),
    });
  }
  const targetRows = rows.targets
    .filter((target) => {
      const root = rootsBySupplySource.get(target.supplySourceId);
      return Boolean(
        root &&
          root.rolloutCohort === input.contract.rolloutCohort &&
          (input.contract.contractVersion === null ||
            root.activeSupplyContractVersion ===
              input.contract.contractVersion) &&
          targetMatchesFilters(target, input.filters, dimensionContext),
      );
    })
    .map((target) => ({
      id: target.id,
      targetType: target.targetType,
      targetId: target.targetId,
      marketKey: target.marketKey,
      sportId: target.sportId,
      sourceProfile: target.sourceProfile,
      status: target.status,
      supplySourceId: target.supplySourceId,
      candidateId: target.candidateId,
      freshnessExpiresAt: isoValue(target.freshnessExpiresAt),
      href: adminLink("coverage", "target", target.id),
    }));
  const targetPage = paginate(targetRows, input.targetPage, input.pageSize);
  const campaignRows: CampaignRow[] = rows.campaigns
    .filter(
      (campaign) =>
        containsFilter(
          campaign.location ?? campaign.region,
          input.filters.market,
        ) &&
        matchesDateRange(
          campaign.lastRunAt ?? campaign.updatedAt,
          dateRangeCutoff,
        ) &&
        containsFilter(campaign.sportIds.join(" "), input.filters.sport) &&
        containsFilter(
          campaign.sourceTypeHints.join(" "),
          input.filters.profile,
        ) &&
        containsFilter(campaign.status, input.filters.status),
    )
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      region: campaign.region,
      status: campaign.status,
      lastRunAt: isoValue(campaign.lastRunAt),
      nextRunAt: isoValue(campaign.nextRunAt),
      queryLimit: campaign.maxQueriesPerRun,
      resultLimit: campaign.maxResultsPerQuery,
      href: adminLink("coverage", "campaign", campaign.id),
    }));
  const campaignPage = paginate(
    campaignRows,
    input.campaignPage,
    input.pageSize,
  );
  const discoveryRows: DiscoveryOutcomeRow[] = rows.discoveryQueries
    .filter(
      (query) =>
        containsFilter(
          query.targetCity ?? query.cityGeoid ?? query.targetState,
          input.filters.market,
        ) &&
        matchesDateRange(query.createdAt, dateRangeCutoff) &&
        (containsFilter(query.sportName, input.filters.sport) ||
          containsFilter(query.sportId, input.filters.sport)) &&
        containsFilter(query.profileKey, input.filters.profile) &&
        containsFilter(query.status, input.filters.status),
    )
    .map((query) => ({
      id: query.id,
      at: isoValue(query.createdAt),
      campaignId: query.campaignId,
      query: query.queryText,
      provider: query.provider,
      status: query.status,
      returnedResults: query.returnedResultCount,
      qualifiedSources: query.newQualifiedPolicyKeyCount,
      intakesCreated: query.intakeCreatedCount,
      failed: query.status.toUpperCase().includes("FAIL")
        ? 1
        : query.errorCode
          ? 1
          : 0,
      href: adminLink("coverage", "discoveryQuery", query.id),
    }));
  const discoveryPage = paginate(
    discoveryRows,
    input.discoveryPage,
    input.pageSize,
  );
  const saturated = filteredCells.filter((cell) =>
    upper(cell.searchStatus).includes("SATUR"),
  ).length;
  const eligible = filteredCells.filter(
    (cell) =>
      ["READY", "STALE"].includes(upper(cell.searchStatus)) &&
      upper(cell.coverageStatus) !== "COVERED" &&
      (!(cell.nextReviewAt instanceof Date) || cell.nextReviewAt <= now) &&
      cell.unresolvedLeadCount === 0,
  ).length;
  const unresolved = filteredCells.reduce(
    (sum, cell) => sum + cell.unresolvedLeadCount,
    0,
  );
  return {
    cells: cellPage,
    targets: targetPage.rows,
    targetPage: targetPage.page,
    targetPageSize: targetPage.pageSize,
    targetTotal: targetPage.total,
    campaigns: campaignPage.rows,
    campaignPage: campaignPage.page,
    campaignPageSize: campaignPage.pageSize,
    campaignTotal: campaignPage.total,
    discoveryOutcomes: discoveryPage.rows,
    discoveryPage: discoveryPage.page,
    discoveryPageSize: discoveryPage.pageSize,
    discoveryTotal: discoveryPage.total,
    marginalYield,
    demandHistory,
    saturation: {
      saturated,
      eligible,
      unresolved,
    },
  };
};

const refreshClassValue = (...values: readonly unknown[]): string | null => {
  for (const value of values) {
    const metadata = recordValue(value);
    const refreshClass = stringValue(
      metadata.refreshClass ?? metadata.refreshType ?? metadata.refreshMode,
    );
    if (refreshClass) return upper(refreshClass);
  }
  return null;
};

const buildJobRows = (
  rows: ProjectionRows,
  now: Date,
  filters: AffiliateOperationsFilters,
): JobRow[] => {
  const jobs: JobRow[] = [];
  const claimsById = new Map(
    rows.gatewayClaims.map((claim) => [claim.id, claim]),
  );
  const claimsByJob = new Map<string, ProjectionRows["gatewayClaims"]>();
  const receiptsByJob = new Map<string, ProjectionRows["receipts"]>();
  const eventsByJob = new Map<string, ProjectionRows["gatewayEvents"]>();
  rows.gatewayClaims.forEach((claim) => {
    const claims = claimsByJob.get(claim.jobId) ?? [];
    claims.push(claim);
    claimsByJob.set(claim.jobId, claims);
  });
  rows.receipts.forEach((receipt) => {
    const receipts = receiptsByJob.get(receipt.jobId) ?? [];
    receipts.push(receipt);
    receiptsByJob.set(receipt.jobId, receipts);
  });
  rows.gatewayEvents.forEach((event) => {
    const events = eventsByJob.get(event.jobId) ?? [];
    events.push(event);
    eventsByJob.set(event.jobId, events);
  });
  const discoveryProvidersByRun = new Map<string, string[]>();
  rows.discoveryQueries.forEach((query) => {
    const providers = discoveryProvidersByRun.get(query.runId) ?? [];
    if (query.provider) providers.push(query.provider);
    discoveryProvidersByRun.set(query.runId, providers);
  });
  const captureProvidersByRun = new Map(
    rows.intakeRuns.map((run) => [run.id, run.provider]),
  );
  const refreshProvidersByRun = new Map(
    rows.scrapeRuns.map((run) => [
      run.id,
      providerValue(run.metadata, run.logs),
    ]),
  );
  rows.discoveryRuns.forEach((run) => {
    const providers = discoveryProvidersByRun.get(run.id) ?? [];
    const summaryProvider = providerValue(run.summary);
    if (summaryProvider) providers.push(summaryProvider);
    discoveryProvidersByRun.set(run.id, providers);
  });
  const mappingProvidersByJob = new Map(
    rows.mappingJobs.map((job) => [job.id, providerValue(job.resultSummary)]),
  );
  const reviewProvidersByJob = new Map(
    rows.approvals.map((job) => [job.id, providerValue(job.decision)]),
  );
  const coverageProvidersByJob = new Map(
    rows.coverageJobs.map((job) => [job.id, providerValue(job.result)]),
  );

  claimsByJob.forEach((claims) => {
    claims.sort(
      (left, right) =>
        (dateValue(right.claimedAt)?.getTime() ?? 0) -
        (dateValue(left.claimedAt)?.getTime() ?? 0),
    );
  });
  rows.gatewayJobs.forEach((job) => {
    const claim =
      (job.activeClaimId ? claimsById.get(job.activeClaimId) : undefined) ??
      claimsByJob.get(job.id)?.[0];
    const receipts = receiptsByJob.get(job.id) ?? [];
    const events = eventsByJob.get(job.id) ?? [];
    const subject = recordValue(job.subjectJson);
    const provider = providerValue(
      subject,
      job.evidenceManifestJson,
      receipts[0],
    );
    const invocation =
      claim?.invocationId ??
      receipts[0]?.commandName ??
      receipts[0]?.operationKind ??
      null;
    const transition =
      events.length > 0
        ? events
            .slice(0, 3)
            .map((event) => String(event.eventType))
            .join(" → ")
        : null;
    jobs.push({
      id: job.id,
      kind: "GATEWAY",
      queue: job.queue,
      lane: job.lane,
      role: job.role,
      subjectId: job.subjectId,
      status: String(job.status),
      ageMinutes: ageMinutes(job.createdAt, now),
      retries: job.invocationFailureCount,
      failure:
        job.terminalDisposition ??
        (job.pipelineBlockedAt ? "PIPELINE_BLOCKED" : null),
      workerId: claim?.workerId ?? null,
      lineage: job.supplySourceId ?? job.parentClaimId ?? job.subjectId,
      provider,
      refreshClass: refreshClassValue(subject, job.evidenceManifestJson),
      invocation,
      transition,
      href: adminLink("jobs", "job", job.id),
    });
  });
  rows.mappingJobs.forEach((job) =>
    jobs.push({
      id: job.id,
      kind: "MAPPING",
      queue: "MAPPING",
      lane: "MAPPING_PRODUCER",
      role: "MAPPING_PRODUCER",
      subjectId: job.supplySourceId ?? job.intakeId,
      status: job.status,
      ageMinutes: ageMinutes(job.createdAt, now),
      retries: job.attemptCount,
      failure: job.errorMessage,
      provider: mappingProvidersByJob.get(job.id) ?? null,
      refreshClass: refreshClassValue(job.resultSummary),
      invocation: null,
      transition: null,
      workerId: job.workerId,
      lineage: job.supplySourceId ?? job.intakeId,
      href: adminLink("jobs", "job", job.id),
    }),
  );
  rows.approvals.forEach((job) =>
    jobs.push({
      id: job.id,
      kind: "REVIEW",
      queue: "REVIEW",
      lane: "SUPPLY_REVIEWER",
      role: "SUPPLY_REVIEWER",
      subjectId: job.supplySourceId ?? job.subjectKey,
      status: job.status,
      ageMinutes: ageMinutes(job.createdAt, now),
      retries: job.attemptCount,
      failure: job.errorMessage,
      provider: reviewProvidersByJob.get(job.id) ?? null,
      refreshClass: refreshClassValue(job.decision),
      invocation: null,
      transition: null,
      workerId: job.reviewerId,
      lineage: job.supplySourceId ?? job.subjectKey,
      href: adminLink("jobs", "job", job.id),
    }),
  );
  rows.coverageJobs.forEach((job) =>
    jobs.push({
      id: job.id,
      kind: "COVERAGE",
      queue: "COVERAGE",
      lane: "COVERAGE_PLANNER",
      role: "COVERAGE_PLANNER",
      subjectId: job.subjectKey,
      status: job.status,
      ageMinutes: ageMinutes(job.createdAt, now),
      retries: job.attemptCount,
      failure: job.errorMessage,
      provider: coverageProvidersByJob.get(job.id) ?? null,
      refreshClass: refreshClassValue(job.context, job.result),
      invocation: null,
      transition: null,
      workerId: job.workerId,
      lineage: job.subjectKey,
      href: adminLink("jobs", "job", job.id),
    }),
  );
  rows.intakeRuns.forEach((run) =>
    jobs.push({
      id: run.id,
      kind: "CAPTURE",
      queue: "SOURCE_INTAKE",
      lane: "SOURCE_INTAKE",
      role: "GATEWAY",
      subjectId: run.supplySourceId ?? run.intakeId,
      status: run.status,
      ageMinutes: ageMinutes(run.queuedAt, now),
      retries: run.attemptCount,
      failure: run.errorMessage,
      provider: run.provider,
      refreshClass: refreshClassValue(run.summary),
      invocation: null,
      transition: null,
      workerId: run.workerId,
      lineage: run.supplySourceId ?? run.intakeId,
      href: adminLink("jobs", "job", run.id),
    }),
  );
  rows.discoveryRuns.forEach((run) =>
    jobs.push({
      id: run.id,
      kind: "DISCOVERY",
      queue: "DISCOVERY",
      lane: "COVERAGE_PLANNER",
      role: "GATEWAY",
      subjectId: run.campaignId,
      status: run.status,
      ageMinutes: ageMinutes(run.queuedAt, now),
      retries: run.attemptCount,
      failure: run.errorMessage,
      provider: providerValue(discoveryProvidersByRun.get(run.id)),
      refreshClass: refreshClassValue(run.summary),
      invocation: null,
      transition: null,
      workerId: run.workerId,
      lineage: run.campaignId,
      href: adminLink("jobs", "job", run.id),
    }),
  );
  rows.scrapeRuns.forEach((run) =>
    jobs.push({
      id: run.id,
      kind: "REFRESH",
      queue: "SOURCE_REFRESH",
      lane: "SOURCE_REFRESH",
      role: "GATEWAY",
      subjectId: run.supplySourceId ?? run.sourceId,
      status: run.status,
      ageMinutes: ageMinutes(run.startedAt ?? run.createdAt, now),
      retries: 0,
      failure: run.errorMessage,
      provider: refreshProvidersByRun.get(run.id) ?? null,
      refreshClass: refreshClassValue(run.metadata) ?? "SOURCE_REFRESH",
      invocation: null,
      transition: null,
      workerId: null,
      lineage: run.supplySourceId ?? run.sourceId,
      href: adminLink("jobs", "job", run.id),
    }),
  );
  return jobs
    .filter((job) => {
      const rangeMinutes =
        filters.range === "24h"
          ? 1_440
          : filters.range === "7d"
            ? 10_080
            : filters.range === "30d"
              ? 43_200
              : null;
      return (
        containsFilter(job.lane, filters.lane) &&
        containsFilter(job.role, filters.role) &&
        containsFilter(job.status, filters.status) &&
        containsFilter(job.failure, filters.reason) &&
        (rangeMinutes === null || job.ageMinutes <= rangeMinutes)
      );
    })
    .sort(
      (left, right) =>
        right.ageMinutes - left.ageMinutes || left.id.localeCompare(right.id),
    );
};

const buildAgeBands = (jobs: readonly JobRow[]): JobsProjection["ageBands"] => {
  const labels = ["<15m", "15–60m", "1–4h", "4–24h", ">24h"];
  return labels.map((band) => ({
    band,
    count: jobs.filter(
      (job) =>
        ageBandFor(job.ageMinutes) === band && isWaitingStatus(job.status),
    ).length,
    description: `Queued or active work aged ${band}; this is a descriptive value, not a health claim.`,
  }));
};
const buildAgeByLane = (
  jobs: readonly JobRow[],
): JobsProjection["ageByLane"] => {
  const lanes = Array.from(new Set(jobs.map((job) => job.lane))).sort();
  const labels = ["<15m", "15–60m", "1–4h", "4–24h", ">24h"];
  return lanes.map((lane) => ({
    lane,
    bands: labels.map((band) => ({
      band,
      count: jobs.filter(
        (job) =>
          job.lane === lane &&
          ageBandFor(job.ageMinutes) === band &&
          isWaitingStatus(job.status),
      ).length,
      description: `Queued or active ${lane} work aged ${band}; this is a descriptive value, not a health claim.`,
    })),
  }));
};

const buildFailurePareto = (jobs: readonly JobRow[]): FailureParetoRow[] => {
  const grouped = new Map<
    string,
    { count: number; reason: string; refreshClass: string }
  >();
  jobs
    .filter((job) => job.failure)
    .forEach((job) => {
      const reason = job.failure ?? "Unknown failure";
      const refreshClass = job.refreshClass ?? job.kind;
      const key = JSON.stringify([refreshClass, reason]);
      const current = grouped.get(key) ?? { count: 0, reason, refreshClass };
      current.count += 1;
      grouped.set(key, current);
    });
  return Array.from(grouped.values())
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.reason.localeCompare(right.reason) ||
        left.refreshClass.localeCompare(right.refreshClass),
    )
    .slice(0, 25);
};

const buildWorkers = (rows: ProjectionRows, now: Date): WorkerHealthRow[] =>
  rows.workerHealth.map((worker) => {
    const leaseExpiresAt = dateValue(worker.leaseExpiresAt);
    const heartbeatAt = dateValue(worker.heartbeatAt);
    const isHealthy =
      upper(worker.status) === "HEALTHY" &&
      Boolean(leaseExpiresAt && leaseExpiresAt.getTime() > now.getTime());
    return {
      id: worker.id,
      workerId: worker.workerId,
      role: worker.role,
      status: worker.status,
      heartbeatAt: heartbeatAt?.toISOString() ?? null,
      leaseExpiresAt: leaseExpiresAt?.toISOString() ?? null,
      isHealthy,
      href: adminLink("jobs", undefined, undefined, { role: worker.role }),
    };
  });

const buildJobs = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): JobsProjection => {
  const allJobs = buildJobRows(rows, now, input.filters);
  const page = paginate(allJobs, input.page, input.pageSize);
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    ageBands: buildAgeBands(allJobs),
    ageByLane: buildAgeByLane(allJobs),
    failures: buildFailurePareto(allJobs),
    workers: buildWorkers(rows, now),
  };
};
const buildIntakes = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): IntakeProjection => {
  const pagesByIntake = new Map<string, number>();
  rows.pages.forEach((page) =>
    pagesByIntake.set(
      page.intakeId,
      (pagesByIntake.get(page.intakeId) ?? 0) + 1,
    ),
  );
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const artifactsByIntake = new Map<string, number>();
  rows.artifacts.forEach((artifact) =>
    artifactsByIntake.set(
      artifact.intakeId,
      (artifactsByIntake.get(artifact.intakeId) ?? 0) + 1,
    ),
  );
  const capturesByIntake = new Map<string, number>();
  rows.intakeRuns.forEach((run) =>
    capturesByIntake.set(
      run.intakeId,
      (capturesByIntake.get(run.intakeId) ?? 0) + run.capturedPageCount,
    ),
  );
  const mappingByIntake = new Map<
    string,
    ProjectionRows["mappingJobs"][number]
  >();
  rows.mappingJobs.forEach((job) => {
    if (!mappingByIntake.has(job.intakeId))
      mappingByIntake.set(job.intakeId, job);
  });
  const latestRunByIntake = new Map<
    string,
    ProjectionRows["intakeRuns"][number]
  >();
  rows.intakeRuns.forEach((run) => {
    if (!latestRunByIntake.has(run.intakeId))
      latestRunByIntake.set(run.intakeId, run);
  });
  const intakeRows: IntakeRow[] = rows.intakes
    .filter(
      (intake) =>
        containsFilter(intake.name, input.filters.city) &&
        containsFilter(intake.sourceKey, input.filters.profile) &&
        matchesDateRange(
          intake.updatedAt ?? intake.createdAt,
          dateRangeCutoff,
        ) &&
        containsFilter(intake.complianceStatus, input.filters.reason),
    )
    .map((intake) => ({
      id: intake.id,
      name: intake.name,
      sourceKey: intake.sourceKey,
      status: intake.status,
      complianceStatus: intake.complianceStatus,
      region: intake.region,
      supplySourceId: intake.supplySourceId,
      pageCount: pagesByIntake.get(intake.id) ?? 0,
      captureCount: capturesByIntake.get(intake.id) ?? 0,
      artifactCount: artifactsByIntake.get(intake.id) ?? 0,
      mappingJobId: mappingByIntake.get(intake.id)?.id ?? null,
      latestRunStatus: latestRunByIntake.get(intake.id)?.status ?? null,
      href: adminLink("intake", "intake", intake.id),
    }));
  const page = paginate(intakeRows, input.page, input.pageSize);
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
};

const buildReviews = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): ReviewProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const reviewRows: ReviewRow[] = rows.approvals.map((job) => {
    const decision = recordValue(job.decision);
    const caseType = upper(decision.decision ?? job.subjectType)
      .split("_")
      .join(" ");
    const evidence = stringList(
      decision.evidenceRefs ?? decision.candidateReviewEvidenceRefs,
    );
    return {
      id: job.id,
      caseType: caseType || "HUMAN REVIEW",
      subjectId: job.supplySourceId ?? job.subjectKey,
      status: job.status,
      reviewerId: job.reviewerId,
      packageHash: stringValue(decision.packageHash),
      evidenceCount: evidence.length,
      reason: stringValue(decision.reasonCode) ?? job.errorMessage,
      createdAt: isoValue(job.createdAt),
      href: adminLink("review", "review", job.id),
      detailType: "review",
      detailId: job.id,
    };
  });
  rows.gatewayJobs
    .filter((job) => upper(job.role) === "SUPPLY_REVIEWER")
    .forEach((job) =>
      reviewRows.push({
        id: job.id,
        caseType: upper(job.subjectType).split("_").join(" ") || "HUMAN REVIEW",
        subjectId: job.supplySourceId ?? job.subjectId,
        status: String(job.status),
        reviewerId:
          rows.gatewayClaims.find((claim) => claim.id === job.activeClaimId)
            ?.workerId ?? null,
        packageHash: stringValue(recordValue(job.subjectJson).packageHash),
        evidenceCount: stringList(
          recordValue(job.evidenceManifestJson).evidenceRefs,
        ).length,
        reason: job.terminalDisposition,
        createdAt: isoValue(job.createdAt),
        href: adminLink("review", "review", job.id),
        detailType: "job",
        detailId: job.id,
      }),
    );
  rows.transitions
    .filter((transition) =>
      [
        "HUMAN_REVIEW_REQUIRED",
        "TARGET_REJECTED",
        "SOURCE_EXCLUDED",
        "REPAIR_REQUIRED",
        "AUTOMATION_HOLD",
      ].includes(upper(transition.outcome)),
    )
    .forEach((transition) =>
      reviewRows.push({
        id: transition.id,
        caseType: upper(String(transition.outcome)).split("_").join(" "),
        subjectId: transition.supplySourceId,
        status: String(transition.toStage),
        reviewerId: transition.actorId,
        packageHash: null,
        evidenceCount: transition.evidenceRefs.length,
        reason: transition.reasonCodes.join(", ") || null,
        createdAt: isoValue(transition.occurredAt),
        href: adminLink("review", "transition", transition.id),
        detailType: "transition",
        detailId: transition.id,
      }),
    );
  const filtered = reviewRows
    .filter(
      (review) =>
        containsFilter(review.caseType, input.filters.role) &&
        containsFilter(review.status, input.filters.status) &&
        matchesDateRange(review.createdAt, dateRangeCutoff) &&
        containsFilter(review.reason, input.filters.reason),
    )
    .sort(
      (left, right) =>
        (dateValue(right.createdAt)?.getTime() ?? 0) -
        (dateValue(left.createdAt)?.getTime() ?? 0),
    );
  const page = paginate(filtered, input.page, input.pageSize);
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
};

const buildSources = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): SourcesProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const sourceById = new Map(rows.sources.map((source) => [source.id, source]));
  const rootIdForSourceRow = (
    sourceId: string | null | undefined,
  ): string | null =>
    sourceId
      ? (rows.roots.find((root) => root.liveSourceId === sourceId)?.id ?? null)
      : null;
  const sourceByRoot = new Map<string, ProjectionRows["sources"][number]>();
  rows.sources.forEach((source) => {
    const rootId = source.supplySourceId ?? rootIdForSourceRow(source.id);
    if (rootId) sourceByRoot.set(rootId, source);
  });
  const mappingByRoot = new Map<string, ProjectionRows["mappings"][number]>();
  rows.mappings.forEach((mapping) => {
    const rootId =
      mapping.supplySourceId ??
      (mapping.sourceId
        ? (sourceById.get(mapping.sourceId)?.supplySourceId ??
          rootIdForSourceRow(mapping.sourceId))
        : null);
    if (rootId && !mappingByRoot.has(rootId))
      mappingByRoot.set(rootId, mapping);
  });
  const dimensionContext = projectionDimensionContext(rows, dateRangeCutoff);
  const targetCountByRoot = new Map<string, number>();
  rows.targets
    .filter((target) =>
      targetMatchesFilters(target, input.filters, dimensionContext),
    )
    .forEach((target) => {
      targetCountByRoot.set(
        target.supplySourceId,
        (targetCountByRoot.get(target.supplySourceId) ?? 0) + 1,
      );
    });
  const sourceRows: SourceRow[] = rows.roots
    .filter(
      (root) =>
        rootMatchesFilters(root, input.filters, dimensionContext) &&
        containsFilter(
          root.invariantViolations.join(" "),
          input.filters.reason,
        ),
    )
    .map((root) => ({
      id: root.id,
      canonicalUrl: root.canonicalUrl,
      operatorDomain: root.operatorDomain,
      predecessorId: root.predecessorId,
      successorId: root.successorId,
      lifecycleStage: String(root.derivedStage),
      outcome: root.derivedOutcome,
      freshness: root.freshnessStatus,
      isAutomationEnabled: root.isAutomationEnabled,
      isExcluded: root.isExcluded,
      holdReason: root.automationHoldReason,
      lifecycleGeneration: root.lifecycleGeneration,
      targetContribution: root.targetContribution,
      organizationId: sourceByRoot.get(root.id)?.organizationId ?? null,
      intakeId: root.intakeId,
      liveSourceId: root.liveSourceId,
      mappingId:
        mappingByRoot.get(root.id)?.id ??
        sourceByRoot.get(root.id)?.activeMappingId ??
        null,
      targetCount: targetCountByRoot.get(root.id) ?? 0,
      lastSuccessfulRefreshAt: isoValue(root.lastSuccessfulRefreshAt),
      invariantViolations: root.invariantViolations,
      href: adminLink("sources", "source", root.id),
    }));
  const lifecycleOrder = [
    "PRE_MAPPED",
    "MAPPED",
    "APPROVED",
    "ACTIVATED",
    "PUBLISHED",
  ];
  const lifecycleMovement: CoverageMovementRow[] = rows.transitions
    .filter((transition) => {
      const root = dimensionContext.rootsById.get(transition.supplySourceId);
      return Boolean(
        root &&
          rootMatchesFilters(root, input.filters, dimensionContext) &&
          containsFilter(transition.toStage, input.filters.status) &&
          matchesDateRange(transition.occurredAt, dateRangeCutoff),
      );
    })
    .slice(0, 100)
    .map((transition) => {
      const from = transition.fromStage
        ? String(transition.fromStage)
        : "Not recorded";
      const to = String(transition.toStage);
      const fromIndex = lifecycleOrder.indexOf(from);
      const toIndex = lifecycleOrder.indexOf(to);
      return {
        id: transition.id,
        at: isoValue(transition.occurredAt),
        label: `${from} → ${to}`,
        direction:
          fromIndex < 0 || toIndex >= fromIndex ? "forward" : "regressive",
        count: 1,
        refreshClass: String(transition.command),
        reason: transition.reasonCodes.join(", ") || null,
        href: adminLink("sources", "source", transition.supplySourceId),
      };
    });
  const freshnessRuns = rows.scrapeRuns
    .filter((run) => {
      const rootId = rootIdForSource(rows, run.supplySourceId ?? run.sourceId);
      const root = rootId ? dimensionContext.rootsById.get(rootId) : undefined;
      return Boolean(
        root &&
          rootMatchesFilters(root, input.filters, dimensionContext) &&
          containsFilter(run.status, input.filters.status) &&
          matchesDateRange(
            run.finishedAt ?? run.updatedAt ?? run.createdAt,
            dateRangeCutoff,
          ),
      );
    })
    .sort(
      (left, right) =>
        (dateValue(
          left.finishedAt ?? left.updatedAt ?? left.createdAt,
        )?.getTime() ?? 0) -
        (dateValue(
          right.finishedAt ?? right.updatedAt ?? right.createdAt,
        )?.getTime() ?? 0),
    );
  const latestRunBySource = new Map<string, string>();
  freshnessRuns.forEach((run) => {
    const sourceKey =
      rootIdForSource(rows, run.supplySourceId ?? run.sourceId) ?? run.sourceId;
    latestRunBySource.set(sourceKey, run.id);
  });
  const freshnessBySource = new Map<string, string>();
  const freshnessByKey = new Map<string, CoverageMovementRow>();
  const refreshClassFor = (
    run: ProjectionRows["scrapeRuns"][number],
    sourceKey: string,
  ): string => {
    const metadata = recordValue(run.metadata);
    const explicitClass = stringValue(
      metadata.refreshClass ?? metadata.refreshType ?? metadata.refreshMode,
    );
    if (explicitClass) return upper(explicitClass);
    const root = dimensionContext.rootsById.get(sourceKey);
    const source = rows.sources.find(
      (candidate) =>
        candidate.id === run.sourceId || candidate.supplySourceId === sourceKey,
    );
    return upper(root?.targetKind ?? source?.targetKind) || "UNKNOWN";
  };
  freshnessRuns.forEach((run) => {
    const sourceKey =
      rootIdForSource(rows, run.supplySourceId ?? run.sourceId) ?? run.sourceId;
    const status = upper(run.status);
    const metadata = recordValue(run.metadata);
    const explicitTransition = upper(stringValue(metadata.freshnessTransition));
    const previousMetadata = upper(
      stringValue(metadata.previousFreshnessStatus),
    );
    const nextMetadata = upper(stringValue(metadata.nextFreshnessStatus));
    const previous =
      previousMetadata || freshnessBySource.get(sourceKey) || "UNKNOWN";
    const currentRoot = dimensionContext.rootsById.get(sourceKey);
    const isLatest = latestRunBySource.get(sourceKey) === run.id;
    const next =
      nextMetadata ||
      (isSuccessfulRefreshStatus(status)
        ? "FRESH"
        : isLatest &&
            currentRoot &&
            upper(currentRoot.freshnessStatus) !== "FRESH"
          ? upper(currentRoot.freshnessStatus)
          : previous);
    freshnessBySource.set(sourceKey, next);
    const restored =
      explicitTransition === "RESTORED" ||
      (previous === "STALE" && next === "FRESH");
    const lost =
      explicitTransition === "LOST" ||
      (previous === "FRESH" && next === "STALE");
    const label = restored
      ? "Freshness restored"
      : lost
        ? "Freshness lost"
        : status.includes("FAIL")
          ? "Refresh failed"
          : isSuccessfulRefreshStatus(status)
            ? "Refresh succeeded"
            : `Refresh ${status}`;
    const direction = restored ? "restored" : lost ? "loss" : "observed";
    const reason = run.errorMessage;
    const refreshClass = refreshClassFor(run, sourceKey);
    const at = isoValue(run.finishedAt ?? run.updatedAt);
    const rollupBucket = Math.floor(
      (dateValue(at)?.getTime() ?? 0) / ROLLUP_MS,
    );
    const groupKey = JSON.stringify([
      rollupBucket,
      refreshClass,
      label,
      direction,
      reason ?? "",
    ]);
    const current = freshnessByKey.get(groupKey);
    if (current) {
      freshnessByKey.set(groupKey, {
        ...current,
        at:
          (dateValue(at)?.getTime() ?? 0) >
          (dateValue(current.at)?.getTime() ?? 0)
            ? at
            : current.at,
        count: current.count + 1,
        href: adminLink("sources", "source", sourceKey),
      });
    } else {
      freshnessByKey.set(groupKey, {
        id: `freshness:${createHash("sha1").update(groupKey).digest("hex").slice(0, 16)}`,
        at,
        label,
        direction,
        count: 1,
        refreshClass,
        reason,
        href: adminLink("sources", "source", sourceKey),
      });
    }
  });
  const freshnessMovement: CoverageMovementRow[] = Array.from(
    freshnessByKey.values(),
  )
    .sort(
      (left, right) =>
        (dateValue(right.at)?.getTime() ?? 0) -
        (dateValue(left.at)?.getTime() ?? 0),
    )
    .slice(0, 100);
  const page = paginate(sourceRows, input.page, input.pageSize);
  return {
    rows: page.rows,
    lifecycleMovement,
    freshnessMovement,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
};
const publishedTargetIdFor = (
  candidate: ProjectionRows["candidates"][number],
): string | null =>
  candidate.publishedEventId ??
  candidate.publishedTeamId ??
  candidate.publishedFacilityId ??
  candidate.publishedOrganizationId ??
  null;

const buildCandidates = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): { candidates: CandidatesProjection } => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const targetByCandidate = new Map(
    rows.targets
      .filter((target) => target.candidateId)
      .map((target) => [target.candidateId as string, target]),
  );
  const candidateRows: CandidateRow[] = rows.candidates
    .filter(
      (candidate) =>
        (containsFilter(candidate.city, input.filters.city) ||
          containsFilter(candidate.title, input.filters.city)) &&
        containsFilter(candidate.listingKind, input.filters.profile) &&
        containsFilter(candidate.status, input.filters.status) &&
        containsFilter(candidate.sportName, input.filters.sport) &&
        matchesDateRange(
          candidate.startsAt ?? candidate.createdAt,
          dateRangeCutoff,
        ),
    )
    .map((candidate) => {
      const target = targetByCandidate.get(candidate.id);
      return {
        id: candidate.id,
        title: candidate.title,
        listingKind: candidate.listingKind,
        status: candidate.status,
        sourceId: candidate.sourceId,
        supplySourceId: candidate.supplySourceId,
        runId: candidate.runId,
        targetId: target?.targetId ?? publishedTargetIdFor(candidate),
        targetStatus: target?.status ?? null,
        rejectionReason: target?.rejectionReason ?? null,
        freshnessExpiresAt: isoValue(target?.freshnessExpiresAt),
        city: candidate.city,
        sport: candidate.sportName,
        startsAt: isoValue(candidate.startsAt),
        href: adminLink("candidates", "candidate", candidate.id),
      };
    });
  const page = paginate(candidateRows, input.page, input.pageSize);
  return {
    candidates: {
      rows: page.rows,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
    },
  };
};

const field = (
  label: string,
  value: unknown,
  href?: string | null,
): ProjectionField => ({
  label,
  value: formatValue(value),
  href: href ?? null,
});

// Persisted by scheduledScrapes.storeLightweightState into affiliateScrapeSources.metadata.
const LIGHTWEIGHT_CHECK_METADATA_KEY = "dailyLightweightCheck";

const lightweightCheckHistoryForSource = (
  rows: ProjectionRows,
  sourceId: string,
): ProjectionHistoryRow[] => {
  const liveSourceId = rows.roots.find(
    (root) => root.id === sourceId,
  )?.liveSourceId;
  const liveSource = liveSourceId
    ? rows.sources.find((item) => item.id === liveSourceId)
    : null;
  const state = recordValue(
    recordValue(liveSource?.metadata)[LIGHTWEIGHT_CHECK_METADATA_KEY],
  );
  const checkedAt = isoValue(state.checkedAt);
  const status = stringValue(state.status);
  if (!checkedAt && !status) return [];
  return [
    {
      id: `lightweight:${sourceId}`,
      kind: "LIGHTWEIGHT CHECK",
      at: checkedAt,
      status,
      reason: stringValue(state.errorMessage),
      actor: null,
      href: adminLink("sources", "source", sourceId),
    },
  ];
};

const historyForSource = (
  rows: ProjectionRows,
  sourceId: string,
): ProjectionHistoryRow[] => {
  const claimsById = new Map(
    rows.gatewayClaims.map((claim) => [claim.id, claim]),
  );
  return [
    ...rows.transitions
      .filter((transition) => transition.supplySourceId === sourceId)
      .map((transition) => ({
        id: transition.id,
        kind: `LIFECYCLE ${transition.command}`,
        at: isoValue(transition.occurredAt),
        status: String(transition.toStage),
        reason: transition.reasonCodes.join(", ") || null,
        actor: transition.actorId,
        lifecycleGeneration: transition.generation,
        contractVersion: transition.contractVersion,
        effectiveAt: isoValue(transition.occurredAt),
        recordedAt: isoValue(transition.occurredAt),
        executorId: transition.executingAgentId,
        previousState: transition.fromStage
          ? String(transition.fromStage)
          : null,
        nextState: String(transition.toStage),
        evidenceRefs: transition.evidenceRefs,
        inputHash: transition.requestHash,
        outputHash: transition.resultHash,
        href: adminLink("sources", "source", sourceId),
      })),
    ...rows.gatewayEvents
      .filter((event) => {
        const payload = recordValue(event.payload);
        const payloadSourceId = rootIdForSource(
          rows,
          stringValue(payload.supplySourceId ?? payload.sourceId),
        );
        const subjectSourceId = rootIdForSource(
          rows,
          stringValue(payload.subjectId),
        );
        const gatewayJob = rows.gatewayJobs.find(
          (job) => job.id === event.jobId,
        );
        const jobSourceId = rootIdForSource(rows, gatewayJob?.supplySourceId);
        return (
          payloadSourceId === sourceId ||
          subjectSourceId === sourceId ||
          payload.subjectId === sourceId ||
          jobSourceId === sourceId
        );
      })
      .map((event) => {
        const payload = recordValue(event.payload);
        const claim = event.claimId ? claimsById.get(event.claimId) : undefined;
        return {
          id: event.id,
          kind: `GATEWAY ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: stringValue(payload.status) ?? event.eventType,
          reason: event.reasonCodes.join(", ") || stringValue(payload.reason),
          actor: event.actorId,
          lane: event.role,
          claimGeneration:
            claim?.claimGeneration ?? numberValue(payload.claimGeneration, 0),
          recordedAt: isoValue(event.createdAt),
          workerId: claim?.workerId ?? stringValue(payload.workerId),
          executorId: event.actorId,
          previousState: stringValue(
            payload.previousState ?? payload.fromState,
          ),
          nextState: stringValue(payload.nextState ?? payload.toState),
          evidenceRefs: stringList(payload.evidenceRefs),
          inputHash: event.inputHash ?? event.requestHash,
          outputHash: event.outputHash,
          href: adminLink("jobs", "event", event.id),
        };
      }),
    ...rows.scrapeRuns
      .filter(
        (run) =>
          rootIdForSource(rows, run.supplySourceId ?? run.sourceId) ===
          sourceId,
      )
      .map((run) => ({
        id: run.id,
        kind: "SOURCE REFRESH",
        at: isoValue(run.finishedAt ?? run.createdAt),
        status: run.status,
        reason: run.errorMessage,
        actor: run.requestedByUserId,
        recordedAt: isoValue(run.createdAt),
        effectiveAt: isoValue(run.finishedAt ?? run.createdAt),
        href: adminLink("sources", "scrapeRun", run.id),
      })),
    ...lightweightCheckHistoryForSource(rows, sourceId),
  ].sort(
    (left, right) =>
      (dateValue(right.at)?.getTime() ?? 0) -
      (dateValue(left.at)?.getTime() ?? 0),
  );
};

const relatedForSource = (
  rows: ProjectionRows,
  sourceId: string,
): ProjectionRelatedRow[] => {
  const source = rows.roots.find((root) => root.id === sourceId);
  if (!source) return [];
  const related: ProjectionRelatedRow[] = [];
  if (source.intakeId)
    related.push({
      id: source.intakeId,
      kind: "INTAKE",
      label: source.intakeId,
      status:
        rows.intakes.find((intake) => intake.id === source.intakeId)?.status ??
        null,
      href: adminLink("intake", "intake", source.intakeId),
    });
  if (source.liveSourceId)
    related.push({
      id: source.liveSourceId,
      kind: "SOURCE",
      label: source.liveSourceId,
      status:
        rows.sources.find((item) => item.id === source.liveSourceId)?.status ??
        null,
      href: adminLink("sources", "source", sourceId),
    });
  rows.targets
    .filter((target) => target.supplySourceId === sourceId)
    .forEach((target) =>
      related.push({
        id: target.id,
        kind: "TARGET",
        label: target.targetId,
        status: target.status,
        href: adminLink("candidates", "target", target.id),
      }),
    );
  return related;
};

const buildSourceDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const source = rows.roots.find((root) => root.id === id);
  if (!source) return null;
  const liveSource =
    rows.sources.find((item) => item.id === source.liveSourceId) ?? null;
  const mapping =
    rows.mappings.find(
      (item) =>
        item.id === liveSource?.activeMappingId || item.supplySourceId === id,
    ) ?? null;
  return {
    id,
    kind: "source",
    title: source.canonicalUrl,
    subtitle: `Supply Source ${id}`,
    status: String(source.derivedStage),
    sections: [
      {
        title: "Header",
        fields: [
          field("Canonical URL", source.canonicalUrl),
          field("Operator domain", source.operatorDomain),
          field("Lifecycle generation", source.lifecycleGeneration),
          field("Rollout cohort", source.rolloutCohort),
        ],
      },
      {
        title: "Priority and Supply Target impact",
        fields: [
          field("Fresh target contribution", source.targetContribution),
          field("Repair priority", source.repairPriority),
          field("Freshness", source.freshnessStatus),
          field("Outcome", source.derivedOutcome),
        ],
      },
      {
        title: "Execution",
        fields: [
          field("Automation enabled", source.isAutomationEnabled),
          field("Automation hold", source.automationHoldReason),
          field("Live source", source.liveSourceId),
          field(
            "Mapping",
            mapping?.id,
            mapping?.id ? adminLink("sources", "mapping", mapping.id) : null,
          ),
          field(
            "Organization",
            liveSource?.organizationId,
            liveSource?.organizationId
              ? adminLink("sources", "organization", liveSource.organizationId)
              : null,
          ),
        ],
      },
      {
        title: "Lineage",
        fields: [
          field(
            "Intake",
            source.intakeId,
            source.intakeId
              ? adminLink("intake", "intake", source.intakeId)
              : null,
          ),
          field(
            "Predecessor",
            source.predecessorId,
            source.predecessorId
              ? adminLink("sources", "source", source.predecessorId)
              : null,
          ),
          field(
            "Successor",
            source.successorId,
            source.successorId
              ? adminLink("sources", "source", source.successorId)
              : null,
          ),
        ],
      },
      {
        title: "Evidence and result",
        fields: [
          field("Last successful refresh", source.lastSuccessfulRefreshAt),
          field("Assessment", source.lastAssessmentAt),
          field("Invariant violations", source.invariantViolations.join(", ")),
          field("Mapping validation", mapping?.validatedAt),
        ],
      },
    ],
    history: historyForSource(rows, id),
    related: relatedForSource(rows, id),
  };
};

const jobLineageRelated = (
  rows: ProjectionRows,
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
): ProjectionRelatedRow[] => {
  const related: ProjectionRelatedRow[] = [];
  const seen = new Set<string>();
  const add = (
    kind: string,
    id: string | null | undefined,
    label: string | null | undefined,
    href: string,
    status: string | null = null,
  ) => {
    if (!id || seen.has(`${kind}:${id}`)) return;
    seen.add(`${kind}:${id}`);
    related.push({ id, kind, label: label || id, status, href });
  };
  const addSource = (candidateId: string | null | undefined) => {
    const root = candidateId
      ? (rows.roots.find(
          (item) =>
            item.id === candidateId ||
            item.liveSourceId === candidateId ||
            item.intakeId === candidateId,
        ) ?? null)
      : null;
    if (root)
      add(
        "SOURCE",
        root.id,
        root.canonicalUrl,
        adminLink("sources", "source", root.id),
        String(root.derivedStage),
      );
  };
  const addSubject = (
    subjectType: string,
    subjectId: string | null | undefined,
  ) => {
    if (!subjectId) return;
    if (subjectType.includes("COVERAGE")) {
      const cell = rows.coverageCells.find(
        (candidate) => candidate.id === subjectId,
      );
      if (cell)
        add(
          "COVERAGE CELL",
          cell.id,
          `${cell.cityId} / ${cell.sportName || cell.sportId}`,
          adminLink("coverage", "coverageCell", cell.id),
          cell.coverageStatus,
        );
      return;
    }
    if (subjectType.includes("DEMAND")) {
      const demand = rows.demands.find(
        (candidate) => candidate.id === subjectId,
      );
      if (demand)
        add(
          "DEMAND",
          demand.id,
          targetLabel(demand.marketKey, demand.sportId, demand.sourceProfile),
          adminLink("coverage", "demand", demand.id),
          demand.status,
        );
      return;
    }
    if (subjectType.includes("WAVE")) {
      const wave = rows.waves.find((candidate) => candidate.id === subjectId);
      if (wave)
        add(
          "WAVE",
          wave.id,
          wave.id,
          adminLink("coverage", "wave", wave.id),
          wave.status,
        );
      return;
    }
    if (subjectType.includes("CAMPAIGN")) {
      const campaign = rows.campaigns.find(
        (candidate) => candidate.id === subjectId,
      );
      if (campaign)
        add(
          "CAMPAIGN",
          campaign.id,
          campaign.name,
          adminLink("coverage", "campaign", campaign.id),
          campaign.status,
        );
      return;
    }
    if (subjectType.includes("DISCOVERY")) {
      const run = rows.discoveryRuns.find(
        (candidate) => candidate.id === subjectId,
      );
      if (run)
        add(
          "DISCOVERY RUN",
          run.id,
          run.id,
          adminLink("coverage", "discoveryRun", run.id),
          run.status,
        );
      return;
    }
    if (subjectType.includes("INTAKE")) {
      const intake = rows.intakes.find(
        (candidate) => candidate.id === subjectId,
      );
      if (intake)
        add(
          "INTAKE",
          intake.id,
          intake.name,
          adminLink("intake", "intake", intake.id),
          intake.status,
        );
      return;
    }
    if (subjectType.includes("SCRAPE") || subjectType.includes("REFRESH")) {
      const run = rows.scrapeRuns.find(
        (candidate) => candidate.id === subjectId,
      );
      if (run)
        add(
          "REFRESH",
          run.id,
          run.id,
          adminLink("sources", "scrapeRun", run.id),
          run.status,
        );
      return;
    }
    addSource(subjectId);
  };

  if (row.kind === "GATEWAY") {
    addSource(gatewayJob?.supplySourceId);
    addSubject(
      upper(gatewayJob?.subjectType ?? ""),
      gatewayJob?.subjectId ?? row.subjectId,
    );
    if (gatewayJob?.parentClaimId)
      add(
        "CLAIM",
        gatewayJob.parentClaimId,
        gatewayJob.parentClaimId,
        adminLink("jobs", "claim", gatewayJob.parentClaimId),
      );
  } else if (row.kind === "MAPPING") {
    const job = rows.mappingJobs.find((candidate) => candidate.id === row.id);
    addSource(job?.supplySourceId);
    if (!job?.supplySourceId && job?.intakeId) {
      const intake = rows.intakes.find(
        (candidate) => candidate.id === job.intakeId,
      );
      if (intake)
        add(
          "INTAKE",
          intake.id,
          intake.name,
          adminLink("intake", "intake", intake.id),
          intake.status,
        );
    }
  } else if (row.kind === "REVIEW") {
    const job = rows.approvals.find((candidate) => candidate.id === row.id);
    addSource(job?.supplySourceId);
    if (job)
      add(
        "REVIEW",
        job.id,
        job.subjectType,
        adminLink("review", "review", job.id),
        job.status,
      );
  } else if (row.kind === "COVERAGE") {
    addSubject("COVERAGE", row.subjectId);
    addSubject("DEMAND", row.subjectId);
    addSubject("CAMPAIGN", row.subjectId);
  } else if (row.kind === "CAPTURE") {
    const run = rows.intakeRuns.find((candidate) => candidate.id === row.id);
    addSource(run?.supplySourceId);
    const intake = rows.intakes.find(
      (candidate) => candidate.id === run?.intakeId,
    );
    if (intake)
      add(
        "INTAKE",
        intake.id,
        intake.name,
        adminLink("intake", "intake", intake.id),
        intake.status,
      );
  } else if (row.kind === "DISCOVERY") {
    const run = rows.discoveryRuns.find((candidate) => candidate.id === row.id);
    const campaign = rows.campaigns.find(
      (candidate) => candidate.id === run?.campaignId,
    );
    if (campaign)
      add(
        "CAMPAIGN",
        campaign.id,
        campaign.name,
        adminLink("coverage", "campaign", campaign.id),
        campaign.status,
      );
  } else if (row.kind === "REFRESH") {
    const run = rows.scrapeRuns.find((candidate) => candidate.id === row.id);
    addSource(run?.supplySourceId);
  }
  const packageHash =
    row.kind === "GATEWAY"
      ? stringValue(recordValue(gatewayJob?.subjectJson).packageHash)
      : row.kind === "REVIEW"
        ? stringValue(
            recordValue(
              rows.approvals.find((candidate) => candidate.id === row.id)
                ?.decision,
            ).packageHash,
          )
        : null;
  if (packageHash)
    add(
      "PACKAGE",
      packageHash,
      packageHash,
      adminLink("review", "package", packageHash),
    );
  return related;
};

const jobHistory = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const gatewayJob = rows.gatewayJobs.find((job) => job.id === id);
  const provider = providerValue(
    gatewayJob?.subjectJson,
    gatewayJob?.evidenceManifestJson,
  );
  const claimsById = new Map(
    rows.gatewayClaims.map((claim) => [claim.id, claim]),
  );
  return [
    ...rows.gatewayClaims
      .filter((claim) => claim.jobId === id)
      .map((claim) => ({
        id: claim.id,
        kind: "CLAIM",
        at: isoValue(claim.claimedAt),
        status: String(claim.status),
        reason: claim.safeFailureCode,
        actor: claim.workerId,
        provider,
        claimGeneration: claim.claimGeneration,
        lifecycleGeneration: claim.lifecycleGeneration,
        queuedAt: isoValue(claim.createdAt),
        startedAt: isoValue(claim.claimedAt),
        heartbeatAt: isoValue(claim.lastHeartbeatAt),
        finishedAt: isoValue(claim.endedAt),
        effectiveAt: isoValue(claim.claimedAt),
        recordedAt: isoValue(claim.createdAt),
        workerId: claim.workerId,
        executorId: claim.workerId,
        attempt: claim.claimGeneration,
        inputHash: claim.claimRequestHash,
        href: adminLink("jobs", "claim", claim.id),
      })),
    ...rows.receipts
      .filter((receipt) => receipt.jobId === id)
      .map((receipt) => ({
        id: receipt.id,
        kind: `RECEIPT ${receipt.operationKind}`,
        at: isoValue(receipt.completedAt ?? receipt.startedAt),
        status: String(receipt.status),
        reason: receipt.safeErrorCode,
        actor: null,
        provider,
        claimGeneration: receipt.claimGeneration,
        queuedAt: isoValue(receipt.createdAt),
        startedAt: isoValue(receipt.startedAt),
        finishedAt: isoValue(receipt.completedAt),
        effectiveAt: isoValue(receipt.completedAt ?? receipt.startedAt),
        recordedAt: isoValue(receipt.createdAt),
        inputHash: receipt.requestHash,
        outputHash: receipt.responseHash,
        href: adminLink("jobs", "operation", receipt.id),
      })),
    ...rows.gatewayEvents
      .filter((event) => event.jobId === id)
      .map((event) => {
        const payload = recordValue(event.payload);
        const claim = event.claimId ? claimsById.get(event.claimId) : undefined;
        return {
          id: event.id,
          kind: `EVENT ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: stringValue(payload.status) ?? event.eventType,
          reason: event.reasonCodes.join(", ") || stringValue(payload.reason),
          actor: event.actorId,
          provider,
          lane: event.role,
          claimGeneration:
            claim?.claimGeneration ?? numberValue(payload.claimGeneration, 0),
          queuedAt: isoValue(claim?.createdAt),
          startedAt: isoValue(claim?.claimedAt),
          heartbeatAt: isoValue(claim?.lastHeartbeatAt),
          effectiveAt: isoValue(event.createdAt),
          recordedAt: isoValue(event.createdAt),
          workerId: claim?.workerId ?? stringValue(payload.workerId),
          executorId: event.actorId,
          previousState: stringValue(
            payload.previousState ?? payload.fromState,
          ),
          nextState: stringValue(payload.nextState ?? payload.toState),
          evidenceRefs: stringList(payload.evidenceRefs),
          inputHash: event.inputHash ?? event.requestHash,
          outputHash: event.outputHash,
          href: adminLink("jobs", "event", event.id),
        };
      }),
  ].sort(
    (left, right) =>
      (dateValue(right.at)?.getTime() ?? 0) -
      (dateValue(left.at)?.getTime() ?? 0),
  );
};

type JobLifecycleHistoryEntry = Readonly<{
  id: string;
  kind: string;
  at: unknown;
  status: unknown;
  reason?: unknown;
  actor?: unknown;
  provider?: string | null;
  href: string;
}>;

const buildJobLifecycleHistory = (
  entries: readonly JobLifecycleHistoryEntry[],
): ProjectionHistoryRow[] =>
  entries
    .filter((entry) => dateValue(entry.at))
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      at: isoValue(entry.at),
      status:
        entry.status === null || entry.status === undefined
          ? null
          : String(entry.status),
      reason:
        entry.reason === null || entry.reason === undefined
          ? null
          : String(entry.reason),
      provider: entry.provider ?? null,
      actor:
        entry.actor === null || entry.actor === undefined
          ? null
          : String(entry.actor),
      href: entry.href,
    }));
const buildJobDetail = (
  rows: ProjectionRows,
  id: string,
  now: Date,
): ProjectionDetail | null => {
  const jobs = buildJobRows(rows, now, {
    market: "",
    city: "",
    sport: "",
    profile: "",
    range: "",
    status: "",
    lane: "",
    role: "",
    reason: "",
  });
  const row = jobs.find((job) => job.id === id);
  if (!row) return null;
  const gatewayJob =
    row.kind === "GATEWAY"
      ? (rows.gatewayJobs.find((job) => job.id === id) ?? null)
      : null;
  const gatewayClaim = gatewayJob?.activeClaimId
    ? (rows.gatewayClaims.find(
        (claim) => claim.id === gatewayJob.activeClaimId,
      ) ?? null)
    : null;
  const history =
    row.kind === "GATEWAY"
      ? jobHistory(rows, id)
      : row.kind === "MAPPING"
        ? (() => {
            const job = rows.mappingJobs.find(
              (candidate) => candidate.id === id,
            );
            return job
              ? buildJobLifecycleHistory([
                  {
                    id: `${id}:created`,
                    kind: "MAPPING CREATED",
                    at: job.createdAt,
                    status: "CREATED",
                    href: adminLink("jobs", "job", id),
                  },
                  {
                    id: `${id}:claimed`,
                    kind: "MAPPING CLAIMED",
                    at: job.claimedAt,
                    status: "CLAIMED",
                    actor: job.workerId,
                    href: adminLink("jobs", "job", id),
                  },
                  {
                    id: `${id}:finished`,
                    kind: "MAPPING FINISHED",
                    at: job.finishedAt,
                    status: job.status,
                    reason: job.errorMessage,
                    actor: job.workerId,
                    href: adminLink("jobs", "job", id),
                  },
                ])
              : [];
          })()
        : row.kind === "REVIEW"
          ? (() => {
              const job = rows.approvals.find(
                (candidate) => candidate.id === id,
              );
              return job
                ? buildJobLifecycleHistory([
                    {
                      id: `${id}:created`,
                      kind: "REVIEW CREATED",
                      at: job.createdAt,
                      status: "CREATED",
                      href: adminLink("jobs", "job", id),
                    },
                    {
                      id: `${id}:claimed`,
                      kind: "REVIEW CLAIMED",
                      at: job.claimedAt,
                      status: "CLAIMED",
                      actor: job.reviewerId,
                      href: adminLink("jobs", "job", id),
                    },
                    {
                      id: `${id}:finished`,
                      kind: "REVIEW FINISHED",
                      at: job.finishedAt,
                      status: job.status,
                      reason: job.errorMessage,
                      actor: job.reviewerId,
                      href: adminLink("jobs", "job", id),
                    },
                  ])
                : [];
            })()
          : row.kind === "COVERAGE"
            ? (() => {
                const job = rows.coverageJobs.find(
                  (candidate) => candidate.id === id,
                );
                return job
                  ? buildJobLifecycleHistory([
                      {
                        id: `${id}:created`,
                        kind: "COVERAGE CREATED",
                        at: job.createdAt,
                        status: "CREATED",
                        href: adminLink("jobs", "job", id),
                      },
                      {
                        id: `${id}:claimed`,
                        kind: "COVERAGE CLAIMED",
                        at: job.claimedAt,
                        status: "CLAIMED",
                        actor: job.workerId,
                        href: adminLink("jobs", "job", id),
                      },
                      {
                        id: `${id}:finished`,
                        kind: "COVERAGE FINISHED",
                        at: job.finishedAt,
                        status: job.status,
                        reason: job.errorMessage,
                        actor: job.workerId,
                        href: adminLink("jobs", "job", id),
                      },
                    ])
                  : [];
              })()
            : row.kind === "CAPTURE"
              ? (() => {
                  const run = rows.intakeRuns.find(
                    (candidate) => candidate.id === id,
                  );
                  return run
                    ? buildJobLifecycleHistory([
                        {
                          id: `${id}:queued`,
                          kind: "CAPTURE QUEUED",
                          at: run.queuedAt,
                          status: "QUEUED",
                          href: adminLink("intake", "intakeRun", id),
                        },
                        {
                          id: `${id}:started`,
                          kind: "CAPTURE STARTED",
                          at: run.startedAt,
                          status: "STARTED",
                          actor: run.workerId,
                          href: adminLink("intake", "intakeRun", id),
                        },
                        {
                          id: `${id}:claimed`,
                          kind: "CAPTURE CLAIMED",
                          at: run.claimedAt,
                          status: "CLAIMED",
                          actor: run.workerId,
                          href: adminLink("intake", "intakeRun", id),
                        },
                        {
                          id: `${id}:finished`,
                          kind: "CAPTURE FINISHED",
                          at: run.finishedAt,
                          status: run.status,
                          reason: run.errorMessage,
                          actor: run.workerId,
                          href: adminLink("intake", "intakeRun", id),
                        },
                      ])
                    : [];
                })()
              : row.kind === "DISCOVERY"
                ? (() => {
                    const run = rows.discoveryRuns.find(
                      (candidate) => candidate.id === id,
                    );
                    return run
                      ? buildJobLifecycleHistory([
                          {
                            id: `${id}:queued`,
                            kind: "DISCOVERY QUEUED",
                            at: run.queuedAt,
                            status: "QUEUED",
                            href: adminLink("coverage", "discoveryRun", id),
                          },
                          {
                            id: `${id}:started`,
                            kind: "DISCOVERY STARTED",
                            at: run.startedAt,
                            status: "STARTED",
                            actor: run.workerId,
                            href: adminLink("coverage", "discoveryRun", id),
                          },
                          {
                            id: `${id}:claimed`,
                            kind: "DISCOVERY CLAIMED",
                            at: run.claimedAt,
                            status: "CLAIMED",
                            actor: run.workerId,
                            href: adminLink("coverage", "discoveryRun", id),
                          },
                          {
                            id: `${id}:finished`,
                            kind: "DISCOVERY FINISHED",
                            at: run.finishedAt,
                            status: run.status,
                            reason: run.errorMessage,
                            actor: run.workerId,
                            href: adminLink("coverage", "discoveryRun", id),
                          },
                        ])
                      : [];
                  })()
                : row.kind === "REFRESH"
                  ? (() => {
                      const run = rows.scrapeRuns.find(
                        (candidate) => candidate.id === id,
                      );
                      return run
                        ? buildJobLifecycleHistory([
                            {
                              id: `${id}:created`,
                              kind: "REFRESH CREATED",
                              at: run.createdAt,
                              status: "CREATED",
                              href: adminLink("sources", "scrapeRun", id),
                            },
                            {
                              id: `${id}:started`,
                              kind: "REFRESH STARTED",
                              at: run.startedAt,
                              status: "STARTED",
                              href: adminLink("sources", "scrapeRun", id),
                            },
                            {
                              id: `${id}:finished`,
                              kind: "REFRESH FINISHED",
                              at: run.finishedAt,
                              status: run.status,
                              reason: run.errorMessage,
                              actor: run.requestedByUserId,
                              href: adminLink("sources", "scrapeRun", id),
                            },
                          ])
                        : [];
                    })()
                  : [];
  const historyWithProvider = history.map((entry) => ({
    ...entry,
    provider: entry.provider ?? row.provider,
  }));
  const recordedExecution =
    row.kind === "GATEWAY"
      ? [
          field("Created", gatewayJob?.createdAt),
          field("Updated", gatewayJob?.updatedAt),
          field("Finished", gatewayJob?.finishedAt),
          field(
            "Expected lifecycle generation",
            gatewayJob?.expectedLifecycleGeneration,
          ),
          field("Invocation failures", gatewayJob?.invocationFailureCount),
          field("Terminal disposition", gatewayJob?.terminalDisposition),
          field(
            "Terminal receipt",
            gatewayJob?.terminalReceiptId,
            gatewayJob?.terminalReceiptId
              ? adminLink("jobs", "operation", gatewayJob.terminalReceiptId)
              : null,
          ),
        ]
      : row.kind === "MAPPING"
        ? (() => {
            const job = rows.mappingJobs.find(
              (candidate) => candidate.id === id,
            );
            return [
              field("Created", job?.createdAt),
              field("Claimed", job?.claimedAt),
              field("Finished", job?.finishedAt),
              field("Attempt", job?.attemptCount),
              field("Branch", job?.branch),
              field("Commit", job?.commit),
            ];
          })()
        : row.kind === "REVIEW"
          ? (() => {
              const job = rows.approvals.find(
                (candidate) => candidate.id === id,
              );
              return [
                field("Created", job?.createdAt),
                field("Claimed", job?.claimedAt),
                field("Finished", job?.finishedAt),
                field("Attempt", job?.attemptCount),
                field("Decision", recordValue(job?.decision)),
              ];
            })()
          : row.kind === "COVERAGE"
            ? (() => {
                const job = rows.coverageJobs.find(
                  (candidate) => candidate.id === id,
                );
                return [
                  field("Created", job?.createdAt),
                  field("Claimed", job?.claimedAt),
                  field("Finished", job?.finishedAt),
                  field("Attempt", job?.attemptCount),
                  field("Priority", job?.priorityScore),
                ];
              })()
            : row.kind === "CAPTURE"
              ? (() => {
                  const run = rows.intakeRuns.find(
                    (candidate) => candidate.id === id,
                  );
                  return [
                    field("Queued", run?.queuedAt),
                    field("Started", run?.startedAt),
                    field("Claimed", run?.claimedAt),
                    field("Finished", run?.finishedAt),
                    field("Attempt", run?.attemptCount),
                  ];
                })()
              : row.kind === "DISCOVERY"
                ? (() => {
                    const run = rows.discoveryRuns.find(
                      (candidate) => candidate.id === id,
                    );
                    return [
                      field("Queued", run?.queuedAt),
                      field("Started", run?.startedAt),
                      field("Claimed", run?.claimedAt),
                      field("Finished", run?.finishedAt),
                      field("Attempt", run?.attemptCount),
                    ];
                  })()
                : row.kind === "REFRESH"
                  ? (() => {
                      const run = rows.scrapeRuns.find(
                        (candidate) => candidate.id === id,
                      );
                      return [
                        field("Created", run?.createdAt),
                        field("Started", run?.startedAt),
                        field("Finished", run?.finishedAt),
                        field("Requested by", run?.requestedByUserId),
                      ];
                    })()
                  : [];
  const generationFields = gatewayJob
    ? [
        field("Subject", row.subjectId),
        field("Lineage", row.lineage),
        field("Claim generation", gatewayJob.claimGeneration),
        field(
          "Active claim",
          gatewayJob.activeClaimId,
          gatewayJob.activeClaimId
            ? adminLink("jobs", "claim", gatewayJob.activeClaimId)
            : null,
        ),
        field(
          "Parent claim",
          gatewayJob.parentClaimId,
          gatewayJob.parentClaimId
            ? adminLink("jobs", "claim", gatewayJob.parentClaimId)
            : null,
        ),
        field("Claim lifecycle generation", gatewayClaim?.lifecycleGeneration),
        field("Claim worker", gatewayClaim?.workerId),
      ]
    : [field("Subject", row.subjectId), field("Lineage", row.lineage)];
  return {
    id,
    kind: "job",
    title: `${row.kind} ${row.id}`,
    subtitle: `${row.queue} / ${row.lane}`,
    status: row.status,
    sections: [
      {
        title: "Header",
        fields: [
          field("Kind", row.kind),
          field("Queue", row.queue),
          field("Lane", row.lane),
          field("Role", row.role),
          field("Provider", row.provider),
        ],
      },
      {
        title: "Execution",
        fields: [
          field("Status", row.status),
          field("Age", `${row.ageMinutes} minutes`),
          field("Retries", row.retries),
          field("Worker", row.workerId),
          field("Invocation", row.invocation),
          field("Transition", row.transition),
          ...recordedExecution,
        ],
      },
      { title: "Generations", fields: generationFields },
      {
        title: "Evidence and result",
        fields: [
          field("Failure", row.failure),
          field("Operation history", row.id),
          ...(gatewayJob
            ? [
                field("Subject payload", gatewayJob.subjectJson),
                field("Evidence manifest", gatewayJob.evidenceManifestJson),
                field("Result hash", gatewayJob.resultHash),
                field("Result", gatewayJob.resultJson),
                field(
                  "Terminal receipt",
                  gatewayJob.terminalReceiptId,
                  gatewayJob.terminalReceiptId
                    ? adminLink(
                        "jobs",
                        "operation",
                        gatewayJob.terminalReceiptId,
                      )
                    : null,
                ),
                field("Event sequence", gatewayJob.eventSequence),
              ]
            : []),
        ],
      },
    ],
    history: historyWithProvider,
    related: jobLineageRelated(rows, row, gatewayJob),
  };
};

const policyKeysForIntake = (
  intake: ProjectionRows["intakes"][number],
): Set<string> => {
  const keys = new Set<string>();
  [intake.sourceKey, intake.baseUrl].forEach((value) => {
    const string = stringValue(value);
    if (!string) return;
    keys.add(string);
    try {
      keys.add(affiliateDiscoveryPolicyKeyForUrl(string));
    } catch {
      // The source key may not be a URL. Keep the direct key.
    }
  });
  return keys;
};

const buildIntakeDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const intake = rows.intakes.find((item) => item.id === id);
  if (!intake) return null;
  const pages = rows.pages.filter((page) => page.intakeId === id);
  const runs = rows.intakeRuns.filter((run) => run.intakeId === id);
  const artifacts = rows.artifacts.filter(
    (artifact) => artifact.intakeId === id,
  );
  const mapping = rows.mappingJobs.find((job) => job.intakeId === id);
  const policy = rows.domainPolicies.find((candidate) =>
    policyKeysForIntake(intake).has(candidate.policyKey),
  );
  const policyEvidence = recordValue(policy?.evidence);
  return {
    id,
    kind: "intake",
    title: intake.name,
    subtitle: `Source Intake ${intake.sourceKey}`,
    status: intake.status,
    sections: [
      {
        title: "Header",
        fields: [
          field("Name", intake.name),
          field("Source key", intake.sourceKey),
          field("Region", intake.region),
          field("Status", intake.status),
        ],
      },
      {
        title: "Policy and capture",
        fields: [
          field("Compliance", intake.complianceStatus),
          field("Compliance notes", intake.complianceNotes),
          field("Policy key", policy?.policyKey),
          field("Policy status", policy?.status),
          field("Policy terms URL", policy?.termsUrl),
          field("Policy robots summary", policy?.robotsSummary),
          field("Policy restrictions", policy?.restrictionNotes),
          field("Policy reviewer", policy?.reviewedByUserId),
          field("Policy reviewed at", policy?.reviewedAt),
          field("Policy expires at", policy?.expiresAt),
          field("Policy evidence", policyEvidence),
          field("Pages", pages.length),
          field("Capture runs", runs.length),
        ],
      },
      {
        title: "Lineage",
        fields: [
          field(
            "Mapping job",
            mapping?.id,
            mapping?.id ? adminLink("jobs", "job", mapping.id) : null,
          ),
          field("Mapping status", mapping?.status),
          field("Mapping source", mapping?.supplySourceId ?? mapping?.sourceId),
        ],
      },
    ],
    history: runs.map((run) => ({
      id: run.id,
      kind: "CAPTURE",
      at: isoValue(run.finishedAt ?? run.createdAt),
      status: run.status,
      reason: run.errorMessage,
      actor: run.workerId,
      href: adminLink("intake", "intakeRun", run.id),
    })),
    related: [
      ...(mapping
        ? [
            {
              id: mapping.id,
              kind: "MAPPING",
              label: mapping.id,
              status: mapping.status,
              href: adminLink("jobs", "job", mapping.id),
            },
          ]
        : []),
      ...pages.map((page) => ({
        id: page.id,
        kind: "PAGE",
        label: page.canonicalUrl,
        status: page.status,
        href: adminLink("intake", "page", page.id),
      })),
      ...artifacts.map((artifact) => ({
        id: artifact.id,
        kind: `ARTIFACT ${artifact.kind}`,
        label: artifact.contentHash,
        status: artifact.isPinned ? "PINNED" : "RETAINED",
        href: adminLink("intake", "artifact", artifact.id),
      })),
    ],
  };
};

const buildReviewDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const review = rows.approvals.find((item) => item.id === id);
  if (review) {
    const decision = recordValue(review.decision);
    const executionHistory: ProjectionHistoryRow[] = [
      {
        id: `${review.id}:created`,
        kind: "REVIEW CREATED",
        at: isoValue(review.createdAt),
        status: "QUEUED",
        reason: null,
        actor: null,
        attempt: review.attemptCount,
        href: adminLink("review", "review", review.id),
      },
      ...(review.claimedAt
        ? [
            {
              id: `${review.id}:claimed`,
              kind: "REVIEW CLAIMED",
              at: isoValue(review.claimedAt),
              status: "CLAIMED",
              reason: null,
              actor: review.reviewerId,
              attempt: review.attemptCount,
              href: adminLink("review", "review", review.id),
            },
          ]
        : []),
      ...(review.finishedAt
        ? [
            {
              id: `${review.id}:finished`,
              kind: "REVIEW FINISHED",
              at: isoValue(review.finishedAt),
              status: review.status,
              reason: review.errorMessage,
              actor: review.reviewerId,
              attempt: review.attemptCount,
              href: adminLink("review", "review", review.id),
            },
          ]
        : []),
    ];
    return {
      id,
      kind: "review",
      title: `${review.subjectType} review`,
      subtitle: review.subjectKey,
      status: review.status,
      sections: [
        {
          title: "Header",
          fields: [
            field("Case type", review.subjectType),
            field("Subject", review.subjectKey),
            field("Status", review.status),
            field("Reviewer", review.reviewerId),
          ],
        },
        {
          title: "Lineage",
          fields: [
            field(
              "Supply Source",
              review.supplySourceId,
              review.supplySourceId
                ? adminLink("sources", "source", review.supplySourceId)
                : null,
            ),
            field("Package hash", decision.packageHash),
            field("Baseline hash", decision.baselineHash),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Created", review.createdAt),
            field("Claimed", review.claimedAt),
            field("Finished", review.finishedAt),
            field("Attempts", review.attemptCount),
            field("Reviewer", review.reviewerId),
            field("Error", review.errorMessage),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Decision", decision.decision),
            field(
              "Evidence references",
              stringList(
                decision.evidenceRefs ?? decision.candidateReviewEvidenceRefs,
              ).join(", "),
            ),
            field("Reason", decision.reasonCode ?? review.errorMessage),
          ],
        },
      ],
      history: [
        ...executionHistory,
        ...rows.transitions
          .filter(
            (transition) => transition.supplySourceId === review.supplySourceId,
          )
          .map((transition) => ({
            id: transition.id,
            kind: `LIFECYCLE ${transition.command}`,
            at: isoValue(transition.occurredAt),
            status: String(transition.toStage),
            reason: transition.reasonCodes.join(", ") || null,
            actor: transition.actorId,
            href: adminLink("sources", "source", transition.supplySourceId),
          })),
      ],
      related: [
        ...(review.supplySourceId
          ? [
              {
                id: review.supplySourceId,
                kind: "SOURCE",
                label: review.supplySourceId,
                status: null,
                href: adminLink("sources", "source", review.supplySourceId),
              },
            ]
          : []),
        ...(stringValue(decision.packageHash)
          ? [
              {
                id: String(decision.packageHash),
                kind: "PACKAGE",
                label: String(decision.packageHash),
                status: null,
                href: adminLink(
                  "review",
                  "package",
                  String(decision.packageHash),
                ),
              },
            ]
          : []),
      ],
    };
  }
  const job = rows.gatewayJobs.find((item) => item.id === id);
  if (job) return buildJobDetail(rows, id, new Date());
  const transition = rows.transitions.find((item) => item.id === id);
  if (!transition) return null;
  return {
    id,
    kind: "review",
    title: `Review case: ${String(transition.outcome)}`,
    subtitle: `Supply Source ${transition.supplySourceId}`,
    status: String(transition.toStage),
    sections: [
      {
        title: "Header",
        fields: [
          field("Case type", transition.outcome),
          field(
            "Supply Source",
            transition.supplySourceId,
            adminLink("sources", "source", transition.supplySourceId),
          ),
          field("Status", transition.toStage),
        ],
      },
      {
        title: "Priority and Supply Target impact",
        fields: [
          field("Command", transition.command),
          field("Generation", transition.generation),
          field("Sequence", transition.sequence),
        ],
      },
      {
        title: "Evidence and result",
        fields: [
          field("Reason codes", transition.reasonCodes.join(", ")),
          field("Evidence references", transition.evidenceRefs.join(", ")),
          field("Request hash", transition.requestHash),
          field("Result hash", transition.resultHash),
          field("Result", transition.resultJson),
        ],
      },
    ],
    history: [],
    related: [
      {
        id: transition.supplySourceId,
        kind: "SOURCE",
        label: transition.supplySourceId,
        status: String(transition.toStage),
        href: adminLink("sources", "source", transition.supplySourceId),
      },
    ],
  };
};

const buildCandidateDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const candidate = rows.candidates.find((item) => item.id === id);
  if (!candidate) return null;
  const target = rows.targets.find((item) => item.candidateId === id);
  const sourceRootId = rootIdForSource(rows, candidate.sourceId);
  const supplyRootId =
    rootIdForSource(rows, candidate.supplySourceId) ?? sourceRootId;
  return {
    id,
    kind: "candidate",
    title: candidate.title,
    subtitle: `${candidate.listingKind} candidate`,
    status: candidate.status,
    sections: [
      {
        title: "Header",
        fields: [
          field("Title", candidate.title),
          field("Listing kind", candidate.listingKind),
          field("Status", candidate.status),
          field("Sport", candidate.sportName),
          field("City", candidate.city),
        ],
      },
      {
        title: "Priority and target impact",
        fields: [
          field(
            "Target ID",
            target?.targetId,
            target ? adminLink("candidates", "target", target.id) : null,
          ),
          field("Target status", target?.status),
          field("Rejection reason", target?.rejectionReason),
          field("Freshness expiry", target?.freshnessExpiresAt),
        ],
      },
      {
        title: "Lineage",
        fields: [
          field(
            "Source",
            candidate.sourceId,
            sourceRootId ? adminLink("sources", "source", sourceRootId) : null,
          ),
          field(
            "Supply Source",
            supplyRootId,
            supplyRootId ? adminLink("sources", "source", supplyRootId) : null,
          ),
          field(
            "Run",
            candidate.runId,
            adminLink("sources", "scrapeRun", candidate.runId),
          ),
          field(
            "Mapping",
            candidate.mappingId,
            candidate.mappingId
              ? adminLink("sources", "mapping", candidate.mappingId)
              : null,
          ),
        ],
      },
      {
        title: "Evidence and result",
        fields: [
          field("Official action URL", candidate.officialActionUrl),
          field("Source URL", candidate.sourceUrl),
          field("Warnings", candidate.warnings.join(", ")),
        ],
      },
    ],
    history: rows.scrapeRuns
      .filter((run) => run.id === candidate.runId)
      .map((run) => ({
        id: run.id,
        kind: "REFRESH",
        at: isoValue(run.finishedAt ?? run.createdAt),
        status: run.status,
        reason: run.errorMessage,
        actor: run.requestedByUserId,
        href: adminLink("sources", "scrapeRun", run.id),
      })),
    related: [
      ...(supplyRootId
        ? [
            {
              id: supplyRootId,
              kind: "SOURCE",
              label: supplyRootId,
              status: null,
              href: adminLink("sources", "source", supplyRootId),
            },
          ]
        : []),
      ...(target
        ? [
            {
              id: target.id,
              kind: "TARGET",
              label: target.targetId,
              status: target.status,
              href: adminLink("candidates", "target", target.id),
            },
          ]
        : []),
    ],
  };
};
const buildAdditionalDetail = (
  rows: ProjectionRows,
  type: AffiliateOperationsDetailType,
  id: string,
): ProjectionDetail | null => {
  const create = (
    kind: AffiliateOperationsDetailType,
    title: string,
    subtitle: string,
    status: string | null,
    sections: ProjectionDetail["sections"],
    history: readonly ProjectionHistoryRow[],
    related: readonly ProjectionRelatedRow[] = [],
  ): ProjectionDetail => ({
    id,
    kind,
    title,
    subtitle,
    status,
    sections,
    history,
    related,
  });

  if (type === "scrapeRun") {
    const run = rows.scrapeRuns.find((item) => item.id === id);
    if (!run) return null;
    const candidates = rows.candidates.filter(
      (candidate) => candidate.runId === id,
    );
    const supplyRootId = rootIdForSource(
      rows,
      run.supplySourceId ?? run.sourceId,
    );
    return create(
      type,
      `Source refresh ${id}`,
      `Source ${run.sourceId}`,
      run.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Source",
              run.sourceId,
              supplyRootId
                ? adminLink("sources", "source", supplyRootId)
                : null,
            ),
            field(
              "Supply Source",
              supplyRootId,
              supplyRootId
                ? adminLink("sources", "source", supplyRootId)
                : null,
            ),
            field(
              "Mapping",
              run.mappingId,
              run.mappingId
                ? adminLink("sources", "mapping", run.mappingId)
                : null,
            ),
            field("Status", run.status),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Requested by", run.requestedByUserId),
            field("Started", run.startedAt),
            field("Finished", run.finishedAt),
            field("HTTP status", run.httpStatus),
            field("Item count", run.itemCount),
            field("Candidate count", run.candidateCount),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Fetched URL", run.fetchedUrl),
            field("Final URL", run.finalUrl),
            field("Error", run.errorMessage),
            field("Logs", run.logs),
            field("Metadata", run.metadata),
          ],
        },
      ],
      candidates.map((candidate) => ({
        id: candidate.id,
        kind: "CANDIDATE",
        at: isoValue(candidate.updatedAt),
        status: candidate.status,
        reason: candidate.warnings.join(", ") || null,
        actor: null,
        href: adminLink("candidates", "candidate", candidate.id),
      })),
      [
        ...(supplyRootId
          ? [
              {
                id: supplyRootId,
                kind: "SOURCE",
                label: supplyRootId,
                status: null,
                href: adminLink("sources", "source", supplyRootId),
              },
            ]
          : []),
        ...(run.mappingId
          ? [
              {
                id: run.mappingId,
                kind: "MAPPING",
                label: run.mappingId,
                status: null,
                href: adminLink("sources", "mapping", run.mappingId),
              },
            ]
          : []),
      ],
    );
  }

  if (type === "intakeRun") {
    const run = rows.intakeRuns.find((item) => item.id === id);
    if (!run) return null;
    const pages = rows.pages.filter((page) =>
      run.requestedPageIds.includes(page.id),
    );
    const artifacts = rows.artifacts.filter(
      (artifact) => artifact.runId === id,
    );
    return create(
      type,
      `Capture run ${id}`,
      `Source Intake ${run.intakeId}`,
      run.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Intake",
              run.intakeId,
              adminLink("intake", "intake", run.intakeId),
            ),
            field(
              "Supply Source",
              run.supplySourceId,
              run.supplySourceId
                ? adminLink("sources", "source", run.supplySourceId)
                : null,
            ),
            field("Provider", run.provider),
            field("Status", run.status),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Queued", run.queuedAt),
            field("Started", run.startedAt),
            field("Claimed", run.claimedAt),
            field("Finished", run.finishedAt),
            field("Worker", run.workerId),
            field("Attempt", run.attemptCount),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Requested pages", run.requestedPageIds),
            field("Discovered URLs", run.discoveredUrlCount),
            field("Captured pages", run.capturedPageCount),
            field("Provider jobs", run.providerJobIds),
            field("Error", run.errorMessage),
            field("Summary", run.summary),
          ],
        },
      ],
      [],
      [
        {
          id: run.intakeId,
          kind: "INTAKE",
          label: run.intakeId,
          status: null,
          href: adminLink("intake", "intake", run.intakeId),
        },
        ...pages.map((page) => ({
          id: page.id,
          kind: "PAGE",
          label: page.canonicalUrl ?? page.url,
          status: page.status,
          href: adminLink("intake", "page", page.id),
        })),
        ...artifacts.map((artifact) => ({
          id: artifact.id,
          kind: "ARTIFACT",
          label: artifact.contentHash,
          status: artifact.isPinned ? "PINNED" : "RETAINED",
          href: adminLink("intake", "artifact", artifact.id),
        })),
      ],
    );
  }

  if (type === "page") {
    const page = rows.pages.find((item) => item.id === id);
    if (!page) return null;
    return create(
      type,
      page.canonicalUrl ?? page.url,
      `Captured page ${id}`,
      page.status,
      [
        {
          title: "Header",
          fields: [
            field("URL", page.url),
            field("Canonical URL", page.canonicalUrl),
            field("Role", page.role),
            field("Status", page.status),
            field("Discovery source", page.discoverySource),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Robots status", page.robotsStatus),
            field("Robots checked", page.robotsCheckedAt),
            field("Robots notes", page.robotsNotes),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Target kind hints", page.targetKindHints),
            field("Metadata", page.metadata),
          ],
        },
      ],
      [],
      [
        {
          id: page.intakeId,
          kind: "INTAKE",
          label: page.intakeId,
          status: null,
          href: adminLink("intake", "intake", page.intakeId),
        },
        ...rows.intakeRuns
          .filter((run) => run.requestedPageIds.includes(id))
          .map((run) => ({
            id: run.id,
            kind: "CAPTURE",
            label: run.id,
            status: run.status,
            href: adminLink("intake", "intakeRun", run.id),
          })),
        ...rows.artifacts
          .filter((artifact) => artifact.pageId === id)
          .map((artifact) => ({
            id: artifact.id,
            kind: "ARTIFACT",
            label: artifact.contentHash,
            status: artifact.isPinned ? "PINNED" : "RETAINED",
            href: adminLink("intake", "artifact", artifact.id),
          })),
      ],
    );
  }

  if (type === "artifact") {
    const artifact = rows.artifacts.find((item) => item.id === id);
    if (!artifact) return null;
    return create(
      type,
      `${artifact.kind} artifact`,
      `Intake artifact ${id}`,
      artifact.isPinned ? "PINNED" : "RETAINED",
      [
        {
          title: "Header",
          fields: [
            field("Kind", artifact.kind),
            field("Provider", artifact.provider),
            field("Source URL", artifact.sourceUrl),
            field("Final URL", artifact.finalUrl),
            field("HTTP status", artifact.httpStatus),
          ],
        },
        {
          title: "Execution",
          fields: [
            field(
              "Intake",
              artifact.intakeId,
              artifact.intakeId
                ? adminLink("intake", "intake", artifact.intakeId)
                : null,
            ),
            field(
              "Page",
              artifact.pageId,
              artifact.pageId
                ? adminLink("intake", "page", artifact.pageId)
                : null,
            ),
            field(
              "Run",
              artifact.runId,
              artifact.runId
                ? adminLink("intake", "intakeRun", artifact.runId)
                : null,
            ),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Content hash", artifact.contentHash),
            field("Dedupe key", artifact.dedupeKey),
            field("File ID", artifact.fileId),
            field("MIME type", artifact.mimeType),
            field("Size bytes", artifact.sizeBytes),
            field("Retain until", artifact.retainUntil),
            field("Metadata", artifact.metadata),
          ],
        },
      ],
      [],
      artifact.supplySourceId
        ? [
            {
              id: artifact.supplySourceId,
              kind: "SOURCE",
              label: artifact.supplySourceId,
              status: null,
              href: adminLink("sources", "source", artifact.supplySourceId),
            },
          ]
        : [],
    );
  }

  if (type === "organization") {
    const organization = rows.organizations.find((item) => item.id === id);
    if (!organization) {
      return create(
        type,
        `Organization ${id}`,
        "Organization evidence",
        null,
        [
          { title: "Header", fields: [field("Organization ID", id)] },
          {
            title: "Evidence and result",
            fields: [field("Organization record", "Not recorded")],
          },
        ],
        [],
      );
    }
    const intakes = rows.intakes.filter(
      (intake) => intake.organizationId === id,
    );
    const liveSources = rows.sources.filter(
      (source) => source.organizationId === id,
    );
    const rootIds = new Set(
      liveSources
        .map((source) => source.supplySourceId)
        .filter((sourceId): sourceId is string => Boolean(sourceId)),
    );
    const transitions = rows.transitions.filter((transition) =>
      rootIds.has(transition.supplySourceId),
    );
    return create(
      type,
      organization.name,
      `Organization ${id}`,
      String(organization.status),
      [
        {
          title: "Header",
          fields: [
            field("Name", organization.name),
            field("Location", organization.location),
            field("Website", organization.website),
            field("Status", organization.status),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Origin", organization.originType),
            field("Ownership", organization.ownershipStatus),
            field("Verification", organization.verificationStatus),
          ],
        },
        {
          title: "Lineage",
          fields: [
            field("Source records", liveSources.length),
            field("Source Intakes", intakes.length),
            field("Lifecycle transitions", transitions.length),
            field("Supply roots", rootIds.size),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Public slug", organization.publicSlug),
            field("Public page enabled", organization.publicPageEnabled),
            field("Public widgets enabled", organization.publicWidgetsEnabled),
            field("Created", organization.createdAt),
            field("Updated", organization.updatedAt),
          ],
        },
      ],
      [
        ...transitions.map((transition) => ({
          id: transition.id,
          kind: `LIFECYCLE ${transition.command}`,
          at: isoValue(transition.occurredAt),
          status: String(transition.toStage),
          reason: transition.reasonCodes.join(", ") || null,
          actor: transition.actorId,
          href: adminLink("sources", "source", transition.supplySourceId),
        })),
        ...intakes.map((intake) => ({
          id: intake.id,
          kind: "INTAKE",
          at: isoValue(intake.updatedAt ?? intake.createdAt),
          status: intake.status,
          reason: intake.complianceStatus,
          actor: null,
          href: adminLink("intake", "intake", intake.id),
        })),
      ],
      [
        ...Array.from(rootIds).map((rootId) => ({
          id: rootId,
          kind: "SOURCE",
          label: rootId,
          status: null,
          href: adminLink("sources", "source", rootId),
        })),
        ...intakes.map((intake) => ({
          id: intake.id,
          kind: "INTAKE",
          label: intake.name,
          status: intake.status,
          href: adminLink("intake", "intake", intake.id),
        })),
      ],
    );
  }

  if (type === "package") {
    const matchingReviews = rows.approvals.filter(
      (approval) => recordValue(approval.decision).packageHash === id,
    );
    const matchingJobs = rows.gatewayJobs.filter(
      (job) => recordValue(job.subjectJson).packageHash === id,
    );
    const evidenceReferences = [
      ...matchingReviews.flatMap((review) =>
        stringList(
          recordValue(review.decision).evidenceRefs ??
            recordValue(review.decision).candidateReviewEvidenceRefs,
        ),
      ),
      ...matchingJobs.flatMap((job) =>
        stringList(recordValue(job.evidenceManifestJson).evidenceRefs),
      ),
    ];
    return create(
      type,
      `Review package ${id}`,
      "Immutable package evidence",
      matchingReviews.length ? matchingReviews[0].status : null,
      [
        {
          title: "Header",
          fields: [
            field("Package hash", id),
            field("Review records", matchingReviews.length),
            field("Review jobs", matchingJobs.length),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field(
              "Package record",
              matchingReviews.length || matchingJobs.length
                ? "Recorded"
                : "Not recorded",
            ),
            field("Evidence references", evidenceReferences),
            field(
              "Approval decision payloads",
              matchingReviews.map((review) => review.decision),
            ),
            field(
              "Gateway evidence manifests",
              matchingJobs.map((job) => job.evidenceManifestJson),
            ),
            field(
              "Gateway results",
              matchingJobs.map((job) => job.resultJson),
            ),
          ],
        },
      ],
      matchingReviews.map((review) => ({
        id: review.id,
        kind: "REVIEW",
        at: isoValue(review.updatedAt),
        status: review.status,
        reason: review.errorMessage,
        actor: review.reviewerId,
        href: adminLink("review", "review", review.id),
      })),
    );
  }

  if (type === "event") {
    const event = rows.gatewayEvents.find((item) => item.id === id);
    if (!event) return null;
    return create(
      type,
      `Gateway event ${event.eventType}`,
      `Event ${id}`,
      event.eventType,
      [
        {
          title: "Header",
          fields: [
            field("Event key", event.eventKey),
            field("Event type", event.eventType),
            field("Actor kind", event.actorKind),
            field("Actor", event.actorId),
            field("Role", event.role),
          ],
        },
        {
          title: "Generations",
          fields: [
            field("Sequence", event.sequence),
            field(
              "Claim",
              event.claimId,
              event.claimId ? adminLink("jobs", "claim", event.claimId) : null,
            ),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Reason codes", event.reasonCodes),
            field("Request hash", event.requestHash),
            field("Input hash", event.inputHash),
            field("Output hash", event.outputHash),
            field("Payload", event.payload),
            field("Retention class", event.retentionClass),
            field("Retention deadline", event.retentionDeadline),
          ],
        },
      ],
      [],
      [
        ...(event.jobId
          ? [
              {
                id: event.jobId,
                kind: "JOB",
                label: event.jobId,
                status: null,
                href: adminLink("jobs", "job", event.jobId),
              },
            ]
          : []),
        ...(event.receiptId
          ? [
              {
                id: event.receiptId,
                kind: "OPERATION",
                label: event.receiptId,
                status: null,
                href: adminLink("jobs", "operation", event.receiptId),
              },
            ]
          : []),
      ],
    );
  }

  if (type === "coverageCell") {
    const cell = rows.coverageCells.find((item) => item.id === id);
    if (!cell) return null;
    const assessments = rows.coverageAssessments.filter(
      (item) => item.cellId === id,
    );
    return create(
      type,
      `${cell.cityId} / ${cell.sportName || cell.sportId}`,
      `Coverage Cell ${id}`,
      cell.coverageStatus,
      [
        {
          title: "Header",
          fields: [
            field("City", cell.cityId),
            field("Market", cell.marketKey),
            field("Sport", cell.sportName || cell.sportId),
            field("Profile", cell.profileKey),
            field("Cohort", cell.cohort),
          ],
        },
        {
          title: "Coverage state",
          fields: [
            field("Coverage status", cell.coverageStatus),
            field("Search status", cell.searchStatus),
            field("Gap severity", cell.gapSeverity),
            field("Priority score", cell.priorityScore),
            field("Population weight", cell.populationWeight),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Approved sources", cell.approvedSourceCount),
            field("Direct policy keys", cell.directPolicyKeyCount),
            field("Strategy families", cell.strategyFamilyCount),
            field("Unresolved leads", cell.unresolvedLeadCount),
            field("Next review", cell.nextReviewAt),
            field("Evidence", cell.evidence),
          ],
        },
      ],
      assessments.map((assessment) => ({
        id: assessment.id,
        kind: "ASSESSMENT",
        at: isoValue(assessment.createdAt),
        status: assessment.decision,
        reason: assessment.strategyFamilyKeys.join(", ") || null,
        actor: null,
        href: adminLink("coverage", "coverageCell", id),
        evidenceRefs: assessment.strategyKeys,
      })),
      [],
    );
  }

  if (type === "demand") {
    const demand = rows.demands.find((item) => item.id === id);
    if (!demand) return null;
    const waves = rows.waves.filter((wave) => wave.demandId === id);
    return create(
      type,
      targetLabel(demand.marketKey, demand.sportId, demand.sourceProfile),
      `Replenishment Demand ${id}`,
      demand.status,
      [
        {
          title: "Header",
          fields: [
            field("Target key", demand.targetKey),
            field("Market", demand.marketKey),
            field("Sport", demand.sportId),
            field("Source profile", demand.sourceProfile),
          ],
        },
        {
          title: "Contract and priority",
          fields: [
            field("Rollout cohort", demand.rolloutCohort),
            field("Contract version", demand.contractVersion),
            field(
              "Minimum fresh published supply",
              demand.minimumFreshPublishedSupply,
            ),
            field(
              "Observed fresh published supply",
              demand.observedFreshPublishedSupply,
            ),
            field("Priority", demand.priority),
          ],
        },
        {
          title: "Eligibility and evidence",
          fields: [
            field("Status", demand.status),
            field("Opened", demand.openedAt),
            field("Closed", demand.closedAt),
            field("Next eligible", demand.nextEligibleAt),
            field("Search saturated until", demand.searchSaturatedUntil),
            field("Reason codes", demand.reasonCodes.join(", ")),
            field("Evidence", demand.evidenceJson),
          ],
        },
      ],
      waves.map((wave) => ({
        id: wave.id,
        kind: "REPLENISHMENT WAVE",
        at: isoValue(wave.startedAt ?? wave.createdAt),
        status: wave.status,
        reason: wave.errorCode,
        actor: null,
        href: adminLink("coverage", "wave", wave.id),
        evidenceRefs: wave.evidenceRefs,
      })),
      waves.map((wave) => ({
        id: wave.id,
        kind: "WAVE",
        label: wave.id,
        status: wave.status,
        href: adminLink("coverage", "wave", wave.id),
      })),
    );
  }

  if (type === "wave") {
    const wave = rows.waves.find((item) => item.id === id);
    if (!wave) return null;
    return create(
      type,
      `Replenishment Wave ${id}`,
      `Demand ${wave.demandId}`,
      wave.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Demand",
              wave.demandId,
              adminLink("coverage", "demand", wave.demandId),
            ),
            field("Cohort", wave.rolloutCohort),
            field("Status", wave.status),
            field("Generation", wave.demandGeneration),
          ],
        },
        {
          title: "Execution",
          fields: [
            field(
              "Campaign",
              wave.campaignId,
              adminLink("coverage", "campaign", wave.campaignId),
            ),
            field(
              "Coverage planning job",
              wave.coveragePlanningJobId,
              adminLink("jobs", "job", wave.coveragePlanningJobId),
            ),
            field("Provider", wave.provider),
            field("Provider operation key", wave.providerOperationKey),
            field("Retry at", wave.retryAt),
            field("Terminal at", wave.terminalAt),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Marginal yield", wave.marginalYield),
            field("Error code", wave.errorCode),
            field("Evidence references", wave.evidenceRefs.join(", ")),
            field("Result", wave.resultJson),
          ],
        },
      ],
      rows.gatewayEvents
        .filter((event) => recordValue(event.payload).waveId === id)
        .map((event) => ({
          id: event.id,
          kind: `GATEWAY ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: null,
          reason: event.reasonCodes.join(", ") || null,
          actor: event.actorId,
          href: adminLink("jobs", "job", event.jobId),
          inputHash: event.inputHash,
          outputHash: event.outputHash,
        })),
      [
        {
          id: wave.demandId,
          kind: "DEMAND",
          label: wave.demandId,
          status: null,
          href: adminLink("coverage", "demand", wave.demandId),
        },
        ...(wave.campaignId
          ? [
              {
                id: wave.campaignId,
                kind: "CAMPAIGN",
                label: wave.campaignId,
                status: null,
                href: adminLink("coverage", "campaign", wave.campaignId),
              },
            ]
          : []),
      ],
    );
  }

  if (type === "campaign") {
    const campaign = rows.campaigns.find((item) => item.id === id);
    if (!campaign) return null;
    const runs = rows.discoveryRuns.filter((run) => run.campaignId === id);
    return create(
      type,
      campaign.name,
      `Discovery Campaign ${id}`,
      campaign.status,
      [
        {
          title: "Header",
          fields: [
            field("Name", campaign.name),
            field("Region", campaign.region),
            field("Location", campaign.location),
            field("Sport IDs", campaign.sportIds),
          ],
        },
        {
          title: "Schedule and limits",
          fields: [
            field("Status", campaign.status),
            field("Last run", campaign.lastRunAt),
            field("Next run", campaign.nextRunAt),
            field("Queries per run", campaign.maxQueriesPerRun),
            field("Results per query", campaign.maxResultsPerQuery),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Source type hints", campaign.sourceTypeHints),
            field("Coverage fingerprint", campaign.coverageFingerprint),
            field("Query cursor", campaign.queryCursor),
            field("Metadata", campaign.metadata),
          ],
        },
      ],
      runs.map((run) => ({
        id: run.id,
        kind: "DISCOVERY RUN",
        at: isoValue(run.finishedAt ?? run.createdAt),
        status: run.status,
        reason: run.errorMessage,
        actor: run.workerId,
        href: adminLink("coverage", "discoveryRun", run.id),
      })),
    );
  }

  if (type === "discoveryRun") {
    const run = rows.discoveryRuns.find((item) => item.id === id);
    if (!run) return null;
    const queries = rows.discoveryQueries.filter((query) => query.runId === id);
    return create(
      type,
      `Discovery Run ${id}`,
      `Campaign ${run.campaignId}`,
      run.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Campaign",
              run.campaignId,
              adminLink("coverage", "campaign", run.campaignId),
            ),
            field("Status", run.status),
            field("Requested by", run.requestedByUserId),
            field("Worker", run.workerId),
          ],
        },
        {
          title: "Timing and retry",
          fields: [
            field("Queued", run.queuedAt),
            field("Started", run.startedAt),
            field("Finished", run.finishedAt),
            field("Claimed", run.claimedAt),
            field("Attempt", run.attemptCount),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Generated queries", run.generatedQueryCount),
            field("Returned results", run.returnedResultCount),
            field("New results", run.newResultCount),
            field("Duplicates", run.duplicateCount),
            field("Rejected", run.rejectedCount),
            field("Created intakes", run.createdIntakeCount),
            field("Provider job IDs", run.providerJobIds),
            field("Error", run.errorMessage),
            field("Summary", run.summary),
          ],
        },
      ],
      queries.map((query) => ({
        id: query.id,
        kind: "QUERY",
        at: isoValue(query.createdAt),
        status: query.status,
        reason: query.errorCode,
        actor: query.provider,
        href: adminLink("coverage", "discoveryQuery", query.id),
      })),
    );
  }
  if (type === "discoveryQuery") {
    const query = rows.discoveryQueries.find((item) => item.id === id);
    if (!query) return null;
    const results = rows.discoveryResults.filter(
      (result) =>
        result.campaignId === query.campaignId &&
        result.latestRunId === query.runId &&
        result.latestQuery === query.queryText,
    );
    return create(
      type,
      query.queryText,
      `Discovery Query ${id}`,
      query.status,
      [
        {
          title: "Lineage",
          fields: [
            field(
              "Campaign",
              query.campaignId,
              adminLink("coverage", "campaign", query.campaignId),
            ),
            field(
              "Run",
              query.runId,
              adminLink("coverage", "discoveryRun", query.runId),
            ),
            field("Query key", query.queryKey),
          ],
        },
        {
          title: "Target",
          fields: [
            field("City", query.targetCity),
            field("State", query.targetState),
            field("Sport", query.sportName || query.sportId),
            field("Profile", query.profileKey),
            field("Strategy", query.strategyKey),
            field("Strategy family", query.strategyFamilyKey),
          ],
        },
        {
          title: "Provider result",
          fields: [
            field("Provider", query.provider),
            field("Status", query.status),
            field("Returned results", query.returnedResultCount),
            field("Qualified direct sources", query.qualifiedDirectCount),
            field(
              "New qualified policy keys",
              query.newQualifiedPolicyKeyCount,
            ),
            field("Intakes created", query.intakeCreatedCount),
            field("Duplicates", query.duplicateCount),
            field("Rejected", query.rejectedCount),
            field("Error", query.errorCode),
          ],
        },
        {
          title: "Evidence",
          fields: [
            field("Qualified policy keys", query.qualifiedPolicyKeys),
            field("New qualified policy keys", query.newQualifiedPolicyKeys),
            field("Metadata", query.metadata),
            field("Created", query.createdAt),
            field("Updated", query.updatedAt),
          ],
        },
      ],
      [],
      results.map((result) => ({
        id: result.id,
        kind: "RESULT",
        label: result.canonicalUrl,
        status: result.status,
        href: adminLink("coverage", "discoveryResult", result.id),
      })),
    );
  }

  if (type === "discoveryResult") {
    const result = rows.discoveryResults.find((item) => item.id === id);
    if (!result) return null;
    const matchingSourceRootId = rootIdForSource(rows, result.matchingSourceId);
    const supplyRootId =
      rootIdForSource(rows, result.supplySourceId) ?? matchingSourceRootId;
    return create(
      type,
      result.title ?? result.canonicalUrl,
      `Discovery Result ${id}`,
      result.status,
      [
        {
          title: "Identity",
          fields: [
            field("Original URL", result.originalUrl),
            field("Canonical URL", result.canonicalUrl),
            field("Policy key", result.policyKey),
            field("Title", result.title),
            field("Description", result.description),
          ],
        },
        {
          title: "Discovery evidence",
          fields: [
            field(
              "Latest run",
              result.latestRunId,
              adminLink("coverage", "discoveryRun", result.latestRunId),
            ),
            field("Latest query", result.latestQuery),
            field("First seen", result.firstSeenAt),
            field("Last seen", result.lastSeenAt),
            field("Seen count", result.seenCount),
            field("Rank", result.latestRank),
            field("Score", result.score),
            field("Reason codes", result.reasonCodes),
            field("Reason details", result.reasonDetails),
          ],
        },
        {
          title: "Lineage and result",
          fields: [
            field(
              "Matching intake",
              result.matchingIntakeId,
              adminLink("intake", "intake", result.matchingIntakeId),
            ),
            field(
              "Matching source",
              result.matchingSourceId,
              matchingSourceRootId
                ? adminLink("sources", "source", matchingSourceRootId)
                : null,
            ),
            field(
              "Supply Source",
              supplyRootId,
              supplyRootId
                ? adminLink("sources", "source", supplyRootId)
                : null,
            ),
            field(
              "Organization",
              result.matchingOrganizationId,
              result.matchingOrganizationId
                ? adminLink(
                    "sources",
                    "organization",
                    result.matchingOrganizationId,
                  )
                : null,
            ),
            field("Status", result.status),
            field("Metadata", result.metadata),
          ],
        },
      ],
      [],
    );
  }

  if (type === "target") {
    const target = rows.targets.find((item) => item.id === id);
    if (!target) return null;
    return create(
      type,
      target.targetId ?? target.targetType,
      `Supply Target ${id}`,
      target.status,
      [
        {
          title: "Identity",
          fields: [
            field("Target type", target.targetType),
            field("Target ID", target.targetId),
            field("Market", target.marketKey),
            field("Sport", target.sportId),
            field("Source profile", target.sourceProfile),
          ],
        },
        {
          title: "Publication and freshness",
          fields: [
            field("Status", target.status),
            field("Published at", target.publishedAt),
            field("Last successful refresh", target.lastSuccessfulRefreshAt),
            field("Freshness expires", target.freshnessExpiresAt),
            field("Rejected at", target.rejectedAt),
            field("Rejection reason", target.rejectionReason),
          ],
        },
        {
          title: "Lineage and evidence",
          fields: [
            field(
              "Supply Source",
              target.supplySourceId,
              adminLink("sources", "source", target.supplySourceId),
            ),
            field(
              "Candidate",
              target.candidateId,
              adminLink("candidates", "candidate", target.candidateId),
            ),
            field("Evidence references", target.evidenceRefs.join(", ")),
            field("Evidence hash", target.evidenceHash),
            field("Metadata", target.metadata),
          ],
        },
      ],
      rows.transitions
        .filter(
          (transition) => transition.supplySourceId === target.supplySourceId,
        )
        .map((transition) => ({
          id: transition.id,
          kind: `LIFECYCLE ${transition.command}`,
          at: isoValue(transition.occurredAt),
          status: String(transition.toStage),
          reason: transition.reasonCodes.join(", ") || null,
          actor: transition.actorId,
          href: adminLink("sources", "source", target.supplySourceId),
          evidenceRefs: transition.evidenceRefs,
        })),
    );
  }

  if (type === "mapping") {
    const mapping = rows.mappings.find((item) => item.id === id);
    if (!mapping) return null;
    const jobs = rows.mappingJobs.filter((job) => job.mappingId === id);
    return create(
      type,
      `Mapping ${id}`,
      `Source ${mapping.sourceId}`,
      mapping.isActive ? "ACTIVE" : "RETIRED",
      [
        {
          title: "Header",
          fields: [
            field("Source", mapping.sourceId),
            field(
              "Supply Source",
              mapping.supplySourceId,
              adminLink("sources", "source", mapping.supplySourceId),
            ),
            field("Version", mapping.version),
            field("Active", mapping.isActive),
            field("Created by", mapping.createdByUserId),
            field("Validated at", mapping.validatedAt),
          ],
        },
        {
          title: "Mapping and evidence",
          fields: [
            field("Mapping", mapping.mapping),
            field("Notes", mapping.notes),
          ],
        },
      ],
      jobs.map((job) => ({
        id: job.id,
        kind: "MAPPING JOB",
        at: isoValue(job.finishedAt ?? job.createdAt),
        status: job.status,
        reason: job.errorMessage,
        actor: job.workerId,
        href: adminLink("jobs", "job", job.id),
      })),
    );
  }

  if (type === "claim") {
    const claim = rows.gatewayClaims.find((item) => item.id === id);
    if (!claim) return null;
    return create(
      type,
      `Claim ${id}`,
      `Job ${claim.jobId}`,
      String(claim.status),
      [
        {
          title: "Header",
          fields: [
            field("Job", claim.jobId, adminLink("jobs", "job", claim.jobId)),
            field("Queue", claim.queue),
            field("Lane", claim.lane),
            field("Role", claim.role),
            field("Worker", claim.workerId),
            field("Invocation", claim.invocationId),
          ],
        },
        {
          title: "Generations and lease",
          fields: [
            field("Claim generation", claim.claimGeneration),
            field("Lifecycle generation", claim.lifecycleGeneration),
            field("Status", claim.status),
            field("Claimed", claim.claimedAt),
            field("Last heartbeat", claim.lastHeartbeatAt),
            field("Lease expires", claim.leaseExpiresAt),
            field("Hard deadline", claim.hardDeadlineAt),
            field("Ended", claim.endedAt),
          ],
        },
        {
          title: "Safe failure",
          fields: [
            field("Failure code", claim.safeFailureCode),
            field("Failure summary", claim.safeFailureSummary),
            field("Terminal receipt", claim.terminalReceiptId),
          ],
        },
      ],
      rows.gatewayEvents
        .filter((event) => event.claimId === id)
        .map((event) => ({
          id: event.id,
          kind: `EVENT ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: null,
          reason: event.reasonCodes.join(", ") || null,
          actor: event.actorId,
          href: adminLink("jobs", "job", claim.jobId),
          claimGeneration: event.sequence,
          inputHash: event.inputHash,
          outputHash: event.outputHash,
        })),
    );
  }

  if (type === "worker") {
    const worker = rows.workerHealth.find((item) => item.id === id);
    if (!worker) return null;
    const claims = rows.gatewayClaims.filter(
      (claim) => claim.workerId === worker.workerId,
    );
    return create(
      type,
      worker.workerId,
      `Worker ${worker.role}`,
      worker.status,
      [
        {
          title: "Health",
          fields: [
            field("Worker ID", worker.workerId),
            field("Role", worker.role),
            field("Status", worker.status),
            field("Heartbeat", worker.heartbeatAt),
            field("Lease expires", worker.leaseExpiresAt),
          ],
        },
        {
          title: "Metadata",
          fields: [
            field("Metadata", worker.metadata),
            field("Created", worker.createdAt),
            field("Updated", worker.updatedAt),
          ],
        },
      ],
      claims.map((claim) => ({
        id: claim.id,
        kind: "CLAIM",
        at: isoValue(claim.claimedAt),
        status: String(claim.status),
        reason: claim.safeFailureCode,
        actor: claim.workerId,
        href: adminLink("jobs", "claim", claim.id),
      })),
    );
  }

  if (type === "operation") {
    const receipt = rows.receipts.find((item) => item.id === id);
    if (!receipt) return null;
    return create(
      type,
      `${receipt.operationKind} operation`,
      `Receipt ${id}`,
      String(receipt.status),
      [
        {
          title: "Header",
          fields: [
            field("Operation kind", receipt.operationKind),
            field("Command", receipt.commandName),
            field(
              "Job",
              receipt.jobId,
              adminLink("jobs", "job", receipt.jobId),
            ),
            field(
              "Claim",
              receipt.claimId,
              adminLink("jobs", "claim", receipt.claimId),
            ),
            field("Claim generation", receipt.claimGeneration),
          ],
        },
        {
          title: "Hashes and external operation",
          fields: [
            field("Idempotency key", receipt.idempotencyKey),
            field("Request hash", receipt.requestHash),
            field("Response hash", receipt.responseHash),
            field("External operation key", receipt.externalOperationKey),
          ],
        },
        {
          title: "Timing and result",
          fields: [
            field("Status", receipt.status),
            field("Started", receipt.startedAt),
            field("Completed", receipt.completedAt),
            field("Reconcile after", receipt.reconcileAfter),
            field("Safe error code", receipt.safeErrorCode),
            field("Retention class", receipt.retentionClass),
            field("Retention deadline", receipt.retentionDeadline),
          ],
        },
      ],
      rows.gatewayEvents
        .filter((event) => event.receiptId === id)
        .map((event) => ({
          id: event.id,
          kind: `EVENT ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: null,
          reason: event.reasonCodes.join(", ") || null,
          actor: event.actorId,
          href: adminLink("jobs", "operation", id),
          inputHash: event.inputHash,
          outputHash: event.outputHash,
        })),
    );
  }

  if (type === "transition") {
    const transition = rows.transitions.find((item) => item.id === id);
    if (!transition) return null;
    return create(
      type,
      `Lifecycle ${transition.command}`,
      `Supply Source ${transition.supplySourceId}`,
      String(transition.toStage),
      [
        {
          title: "Transition",
          fields: [
            field(
              "Supply Source",
              transition.supplySourceId,
              adminLink("sources", "source", transition.supplySourceId),
            ),
            field("Sequence", transition.sequence),
            field("Generation", transition.generation),
            field("From", transition.fromStage),
            field("To", transition.toStage),
            field("Outcome", transition.outcome),
          ],
        },
        {
          title: "Command and actor",
          fields: [
            field("Command", transition.command),
            field("Command reference", transition.commandRef),
            field("Actor kind", transition.actorKind),
            field("Actor", transition.actorId),
            field("Executing agent", transition.executingAgentId),
            field("Contract version", transition.contractVersion),
          ],
        },
        {
          title: "Evidence and hashes",
          fields: [
            field("Reason codes", transition.reasonCodes.join(", ")),
            field("Evidence references", transition.evidenceRefs.join(", ")),
            field("Request hash", transition.requestHash),
            field("Result hash", transition.resultHash),
            field("Request", transition.requestJson),
            field("Result", transition.resultJson),
          ],
        },
      ],
      [],
      [
        {
          id: transition.supplySourceId,
          kind: "SOURCE",
          label: transition.supplySourceId,
          status: String(transition.toStage),
          href: adminLink("sources", "source", transition.supplySourceId),
        },
      ],
    );
  }

  if (type === "alert") {
    const alert = rows.operationalAlerts.find((item) => item.id === id);
    if (!alert) return null;
    const deliveries = rows.alertDeliveries.filter(
      (delivery) => delivery.alertId === id,
    );
    return create(
      type,
      alert.title,
      `Operational alert ${id}`,
      alert.severity,
      [
        {
          title: "Header",
          fields: [
            field("Category", alert.category),
            field("Event key", alert.eventKey),
            field("Severity", alert.severity),
            field("Created", alert.createdAt),
            field("Subject type", alert.subjectType),
            field("Subject ID", alert.subjectId),
          ],
        },
        {
          title: "Contract and lineage",
          fields: [
            field("Rollout cohort", alert.rolloutCohort),
            field("Contract version", alert.contractVersion),
            field(
              "Supply Source",
              alert.supplySourceId,
              alert.supplySourceId
                ? adminLink("sources", "source", alert.supplySourceId)
                : null,
            ),
            field(
              "Coverage Cell",
              alert.coverageCellId,
              alert.coverageCellId
                ? adminLink("coverage", "coverageCell", alert.coverageCellId)
                : null,
            ),
            field(
              "Demand",
              alert.demandId,
              alert.demandId
                ? adminLink("coverage", "demand", alert.demandId)
                : null,
            ),
            field(
              "Wave",
              alert.waveId,
              alert.waveId ? adminLink("coverage", "wave", alert.waveId) : null,
            ),
          ],
        },
        {
          title: "Delivery",
          fields:
            deliveries.length === 0
              ? [field("Delivery status", "Not recorded")]
              : deliveries.map((delivery) =>
                  field(
                    `${delivery.channel} attempt ${delivery.attempt}`,
                    `${delivery.status}${delivery.responseCode ? ` (${delivery.responseCode})` : ""}${delivery.errorMessage ? `: ${delivery.errorMessage}` : ""}`,
                  ),
                ),
        },
        {
          title: "Evidence and result",
          fields: [
            field("Detail", alert.detail),
            field("Reason codes", alert.reasonCodes.join(", ")),
            field("Evidence references", alert.evidenceRefs.join(", ")),
            field("Input hash", alert.inputHash),
            field("Output hash", alert.outputHash),
            field("Payload", alert.payload),
            field("Retention class", alert.retentionClass),
            field("Retention deadline", alert.retentionDeadline),
          ],
        },
      ],
      deliveries.map((delivery) => ({
        id: delivery.id,
        kind: "ALERT_DELIVERY",
        at: isoValue(delivery.createdAt),
        status: delivery.status,
        reason: delivery.errorMessage,
        actor: delivery.channel,
        href: adminLink("overview", "alert", id),
      })),
    );
  }

  return null;
};

const normalizeProjectionDetail = (
  detail: ProjectionDetail,
): ProjectionDetail => {
  const requiredSections = [
    { title: "Header", aliases: ["Header"] },
    { title: "Subject", aliases: ["Subject"] },
    {
      title: "Priority and Supply Target impact",
      aliases: [
        "Priority and Supply Target impact",
        "Priority and target impact",
      ],
    },
    { title: "Execution", aliases: ["Execution"] },
    { title: "Generations", aliases: ["Generations", "Generations and lease"] },
    { title: "Lineage", aliases: ["Lineage"] },
    {
      title: "Evidence/result",
      aliases: [
        "Evidence/result",
        "Evidence and result",
        "Evidence and hashes",
        "Evidence and target impact",
      ],
    },
  ] as const;
  const consumed = new Set<string>();
  const sections = requiredSections.map(({ title, aliases }) => {
    const match = detail.sections.find((section) =>
      aliases.includes(section.title as never),
    );
    if (match) consumed.add(match.title);
    return match
      ? { ...match, title }
      : { title, fields: [field("Value", "Not recorded")] };
  });
  return {
    ...detail,
    sections: [
      ...sections,
      ...detail.sections.filter(
        (section) =>
          !consumed.has(section.title) &&
          !requiredSections.some(({ aliases }) =>
            aliases.includes(section.title as never),
          ),
      ),
    ],
  };
};
const paginateProjectionDetail = (
  detail: ProjectionDetail,
  input: AffiliateOperationsProjectionInput,
): ProjectionDetail => {
  const historyPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.historyPageSize || DEFAULT_PAGE_SIZE)),
  );
  const historyTotal = detail.history.length;
  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyTotal / historyPageSize),
  );
  const historyPage = Math.min(
    historyTotalPages,
    Math.max(1, Math.trunc(input.historyPage || 1)),
  );
  const start = (historyPage - 1) * historyPageSize;
  return {
    ...detail,
    history: detail.history.slice(start, start + historyPageSize),
    historyPage,
    historyPageSize,
    historyTotal,
    historyTotalPages,
  };
};

const buildSelectedDetail = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): ProjectionDetail | null => {
  if (!input.selectedId || !input.selectedType) return null;
  const detail =
    input.selectedType === "source"
      ? buildSourceDetail(rows, input.selectedId)
      : input.selectedType === "intake"
        ? buildIntakeDetail(rows, input.selectedId)
        : input.selectedType === "review"
          ? buildReviewDetail(rows, input.selectedId)
          : input.selectedType === "candidate"
            ? buildCandidateDetail(rows, input.selectedId)
            : input.selectedType === "job"
              ? buildJobDetail(rows, input.selectedId, now)
              : buildAdditionalDetail(
                  rows,
                  input.selectedType,
                  input.selectedId,
                );
  return detail
    ? paginateProjectionDetail(normalizeProjectionDetail(detail), input)
    : null;
};

const scopeOverviewRows = (
  rows: ProjectionRows,
  filters: AffiliateOperationsFilters,
  now: Date,
): ProjectionRows => {
  const dateRangeCutoff = dateRangeCutoffFor(filters.range, now);
  const hasDimensionFilter = Boolean(
    filters.market || filters.sport || filters.profile || filters.city,
  );
  const dimensionContext = projectionDimensionContext(rows, dateRangeCutoff);
  const targetMatches = (target: ProjectionRows["targets"][number]): boolean =>
    targetMatchesFilters(target, filters, dimensionContext);
  const roots = rows.roots.filter((root) =>
    rootMatchesFilters(root, filters, dimensionContext),
  );
  const rootIds = new Set(roots.map((root) => root.id));
  const targets = rows.targets.filter(
    (target) => rootIds.has(target.supplySourceId) && targetMatches(target),
  );
  const demands = rows.demands.filter(
    (demand) =>
      (!filters.city ||
        targets.some(
          (target) =>
            target.marketKey === demand.marketKey &&
            target.sportId === demand.sportId &&
            upper(target.sourceProfile) === upper(demand.sourceProfile),
        )) &&
      containsFilter(demand.marketKey, filters.market) &&
      containsFilter(demand.sportId, filters.sport) &&
      containsFilter(demand.sourceProfile, filters.profile) &&
      containsFilter(demand.status, filters.status) &&
      matchesDateRange(demand.openedAt ?? demand.updatedAt, dateRangeCutoff),
  );
  const demandIds = new Set(demands.map((demand) => demand.id));
  const coverageCells = rows.coverageCells.filter(
    (cell) =>
      containsFilter(cell.marketKey, filters.market) &&
      containsFilter(cell.cityId, filters.city) &&
      (containsFilter(cell.sportId, filters.sport) ||
        containsFilter(cell.sportName, filters.sport)) &&
      containsFilter(cell.profileKey, filters.profile) &&
      containsFilter(cell.coverageStatus, filters.status) &&
      matchesDateRange(
        cell.lastAssessedAt ?? cell.nextReviewAt ?? cell.updatedAt,
        dateRangeCutoff,
      ),
  );
  const coverageCellIds = new Set(coverageCells.map((cell) => cell.id));
  const waves = rows.waves.filter(
    (wave) =>
      demandIds.has(wave.demandId) &&
      containsFilter(wave.status, filters.status) &&
      matchesDateRange(wave.startedAt ?? wave.createdAt, dateRangeCutoff),
  );
  const waveIds = new Set(waves.map((wave) => wave.id));
  const intakeBelongsToRoot = (
    intake: ProjectionRows["intakes"][number],
  ): boolean =>
    rootIds.has(intake.supplySourceId ?? "") ||
    roots.some((root) => root.intakeId === intake.id);
  const intakeIds = new Set(
    rows.intakes
      .filter(
        (intake) =>
          intakeBelongsToRoot(intake) &&
          containsFilter(intake.status, filters.status) &&
          matchesDateRange(
            intake.updatedAt ?? intake.createdAt,
            dateRangeCutoff,
          ),
      )
      .map((intake) => intake.id),
  );
  const linkedJob = (job: ProjectionRows["gatewayJobs"][number]): boolean =>
    !hasDimensionFilter ||
    rootIds.has(job.supplySourceId ?? "") ||
    rootIds.has(job.subjectId ?? "") ||
    demandIds.has(job.subjectId ?? "") ||
    waveIds.has(job.subjectId ?? "") ||
    coverageCellIds.has(job.subjectId ?? "");
  const gatewayJobs = rows.gatewayJobs.filter(
    (job) =>
      linkedJob(job) &&
      containsFilter(job.status, filters.status) &&
      matchesDateRange(job.updatedAt ?? job.createdAt, dateRangeCutoff),
  );
  const gatewayJobIds = new Set(gatewayJobs.map((job) => job.id));
  const gatewayClaims = rows.gatewayClaims.filter(
    (claim) =>
      gatewayJobIds.has(claim.jobId) &&
      containsFilter(claim.status, filters.status) &&
      matchesDateRange(claim.updatedAt ?? claim.claimedAt, dateRangeCutoff),
  );
  const claimIds = new Set(gatewayClaims.map((claim) => claim.id));
  const receipts = rows.receipts.filter(
    (receipt) =>
      gatewayJobIds.has(receipt.jobId) &&
      containsFilter(receipt.status, filters.status) &&
      matchesDateRange(receipt.updatedAt ?? receipt.createdAt, dateRangeCutoff),
  );
  const receiptIds = new Set(receipts.map((receipt) => receipt.id));
  const gatewayEvents = rows.gatewayEvents.filter((event) => {
    const payload = recordValue(event.payload);
    const linked =
      !hasDimensionFilter ||
      gatewayJobIds.has(event.jobId ?? "") ||
      claimIds.has(event.claimId ?? "") ||
      receiptIds.has(event.receiptId ?? "") ||
      rootIds.has(
        rootIdForSource(
          rows,
          stringValue(payload.supplySourceId ?? payload.sourceId),
        ) ?? "",
      ) ||
      rootIds.has(stringValue(payload.subjectId) ?? "") ||
      demandIds.has(stringValue(payload.demandId) ?? "") ||
      waveIds.has(stringValue(payload.waveId) ?? "") ||
      coverageCellIds.has(stringValue(payload.coverageCellId) ?? "");
    return (
      linked &&
      containsFilter(event.eventType, filters.status) &&
      matchesDateRange(event.createdAt, dateRangeCutoff)
    );
  });
  const transitions = rows.transitions.filter(
    (transition) =>
      rootIds.has(transition.supplySourceId) &&
      containsFilter(transition.toStage, filters.status) &&
      matchesDateRange(transition.occurredAt, dateRangeCutoff),
  );
  const scrapeRuns = rows.scrapeRuns.filter(
    (run) =>
      rootIds.has(
        rootIdForSource(rows, run.supplySourceId ?? run.sourceId) ?? "",
      ) &&
      containsFilter(run.status, filters.status) &&
      matchesDateRange(
        run.finishedAt ?? run.updatedAt ?? run.createdAt,
        dateRangeCutoff,
      ),
  );
  const sourceBelongsToRoot = (
    source: ProjectionRows["sources"][number],
  ): boolean =>
    rootIds.has(source.supplySourceId ?? "") ||
    roots.some((root) => root.liveSourceId === source.id);
  const sources = rows.sources.filter(sourceBelongsToRoot);
  const sourceIds = new Set(sources.map((source) => source.id));
  const mappings = rows.mappings.filter(
    (mapping) =>
      rootIds.has(mapping.supplySourceId ?? "") ||
      (mapping.sourceId !== null && sourceIds.has(mapping.sourceId)),
  );
  const mappingJobs = rows.mappingJobs.filter(
    (job) =>
      (rootIds.has(job.supplySourceId ?? "") || intakeIds.has(job.intakeId)) &&
      containsFilter(job.status, filters.status) &&
      matchesDateRange(job.updatedAt ?? job.createdAt, dateRangeCutoff),
  );
  const intakes = rows.intakes.filter((intake) => intakeIds.has(intake.id));
  const pages = rows.pages.filter((page) => intakeIds.has(page.intakeId));
  const intakeRuns = rows.intakeRuns.filter((run) =>
    intakeIds.has(run.intakeId),
  );
  const artifacts = rows.artifacts.filter((artifact) =>
    intakeIds.has(artifact.intakeId),
  );
  const approvals = rows.approvals.filter(
    (approval) =>
      rootIds.has(approval.supplySourceId ?? "") &&
      containsFilter(approval.status, filters.status) &&
      matchesDateRange(
        approval.updatedAt ?? approval.createdAt,
        dateRangeCutoff,
      ),
  );
  const candidates = rows.candidates.filter(
    (candidate) =>
      rootIds.has(candidate.supplySourceId ?? "") &&
      containsFilter(candidate.status, filters.status) &&
      matchesDateRange(
        candidate.updatedAt ?? candidate.createdAt,
        dateRangeCutoff,
      ),
  );
  const coverageJobs = rows.coverageJobs.filter(
    (job) =>
      (!hasDimensionFilter || coverageCellIds.has(job.subjectKey)) &&
      containsFilter(job.status, filters.status) &&
      matchesDateRange(job.updatedAt ?? job.createdAt, dateRangeCutoff),
  );
  const coverageAssessments = rows.coverageAssessments.filter(
    (assessment) =>
      coverageCellIds.has(assessment.cellId) &&
      matchesDateRange(
        assessment.updatedAt ?? assessment.createdAt,
        dateRangeCutoff,
      ),
  );
  const discoveryQueries = rows.discoveryQueries.filter(
    (query) =>
      containsFilter(
        query.targetCity ?? query.cityGeoid ?? query.targetState,
        filters.market,
      ) &&
      containsFilter(query.targetCity ?? query.cityGeoid, filters.city) &&
      (containsFilter(query.sportId, filters.sport) ||
        containsFilter(query.sportName, filters.sport)) &&
      containsFilter(query.profileKey, filters.profile) &&
      containsFilter(query.status, filters.status) &&
      matchesDateRange(query.updatedAt ?? query.createdAt, dateRangeCutoff),
  );
  const discoveryQueryIds = new Set(discoveryQueries.map((query) => query.id));
  const discoveryRuns = rows.discoveryRuns.filter(
    (run) =>
      rows.discoveryQueries.some(
        (query) => query.runId === run.id && discoveryQueryIds.has(query.id),
      ) &&
      containsFilter(run.status, filters.status) &&
      matchesDateRange(
        run.finishedAt ?? run.updatedAt ?? run.createdAt,
        dateRangeCutoff,
      ),
  );
  const discoveryRunIds = new Set(discoveryRuns.map((run) => run.id));
  const discoveryResults = rows.discoveryResults.filter(
    (result) =>
      discoveryRunIds.has(result.latestRunId) &&
      containsFilter(result.status, filters.status) &&
      matchesDateRange(
        result.lastSeenAt ?? result.updatedAt ?? result.createdAt,
        dateRangeCutoff,
      ),
  );
  const campaigns = rows.campaigns.filter(
    (campaign) =>
      (waves.some((wave) => wave.campaignId === campaign.id) ||
        discoveryRuns.some((run) => run.campaignId === campaign.id)) &&
      containsFilter(campaign.location ?? campaign.region, filters.market) &&
      containsFilter(campaign.location, filters.city) &&
      containsFilter(campaign.sportIds.join(" "), filters.sport) &&
      containsFilter(campaign.sourceTypeHints.join(" "), filters.profile) &&
      containsFilter(campaign.status, filters.status) &&
      matchesDateRange(
        campaign.updatedAt ?? campaign.createdAt,
        dateRangeCutoff,
      ),
  );
  const operationalAlerts = rows.operationalAlerts.filter((alert) => {
    const payload = recordValue(alert.payload);
    const alertRootId = rootIdForAlert(rows, alert);
    const payloadCoverageCellId = stringValue(payload.coverageCellId);
    const payloadDemandId = stringValue(payload.demandId);
    const payloadWaveId = stringValue(payload.waveId);
    const hasLineage = Boolean(
      alert.supplySourceId ||
        alert.coverageCellId ||
        alert.demandId ||
        alert.waveId ||
        alertRootId ||
        payloadCoverageCellId ||
        payloadDemandId ||
        payloadWaveId ||
        payload.supplySourceId ||
        payload.sourceId ||
        payload.scrapeRunId ||
        payload.runId ||
        payload.jobId ||
        payload.gatewayJobId,
    );
    const linked =
      (!hasDimensionFilter && !hasLineage) ||
      (alertRootId !== null && rootIds.has(alertRootId)) ||
      demandIds.has(alert.demandId ?? "") ||
      waveIds.has(alert.waveId ?? "") ||
      coverageCellIds.has(alert.coverageCellId ?? "") ||
      (payloadCoverageCellId !== null &&
        coverageCellIds.has(payloadCoverageCellId)) ||
      (payloadDemandId !== null && demandIds.has(payloadDemandId)) ||
      (payloadWaveId !== null && waveIds.has(payloadWaveId));
    return (
      linked &&
      containsFilter(alert.severity, filters.status) &&
      matchesDateRange(alert.createdAt, dateRangeCutoff)
    );
  });
  const alertIds = new Set(operationalAlerts.map((alert) => alert.id));
  const alertDeliveries = rows.alertDeliveries.filter((delivery) =>
    alertIds.has(delivery.alertId),
  );
  const workerHealth = rows.workerHealth.filter(
    (worker) =>
      containsFilter(worker.status, filters.status) &&
      matchesDateRange(worker.heartbeatAt ?? worker.updatedAt, dateRangeCutoff),
  );
  return {
    ...rows,
    roots,
    targets,
    demands,
    waves,
    transitions,
    gatewayJobs,
    gatewayClaims,
    receipts,
    gatewayEvents,
    coverageCells,
    coverageAssessments,
    coverageJobs,
    discoveryQueries,
    discoveryRuns,
    discoveryResults,
    mappingJobs,
    approvals,
    intakes,
    pages,
    intakeRuns,
    artifacts,
    sources,
    mappings,
    scrapeRuns,
    candidates,
    campaigns,
    operationalAlerts,
    alertDeliveries,
    workerHealth,
  };
};

const buildOverview = (
  rows: ProjectionRows,
  rootsById: ReadonlyMap<string, ProjectionRows["roots"][number]>,
  contractJson: unknown,
  contract: AffiliateOperationsContractSelection,
  now: Date,
  filters: AffiliateOperationsFilters,
  recoveryRows: ProjectionRows,
): OverviewProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(filters.range, now);
  const targetDeficits = buildTargetDeficits(
    rows,
    rootsById,
    contractJson,
    contract,
    now,
    filters,
  ).filter(
    (row) =>
      containsFilter(row.status, filters.status) &&
      (!filters.range ||
        rows.demands.some(
          (demand) =>
            demand.marketKey === row.marketKey &&
            demand.sportId === row.sportId &&
            upper(demand.sourceProfile) === upper(row.sourceProfile) &&
            matchesDateRange(
              demand.openedAt ?? demand.updatedAt,
              dateRangeCutoff,
            ),
        )),
  );
  const activeJobs = rows.gatewayJobs.filter((job) =>
    ["CLAIMED", "RETRY_WAIT", "RECONCILIATION_REQUIRED"].includes(
      upper(job.status),
    ),
  ).length;
  const waitingJobs = rows.gatewayJobs.filter((job) =>
    ["QUEUED", "RETRY_WAIT"].includes(upper(job.status)),
  ).length;
  const activeWorkers = rows.workerHealth.filter((worker) =>
    isWorkerHealthy(worker, now),
  ).length;
  const stoppedWorkers = rows.workerHealth.length - activeWorkers;
  return {
    targetDeficits,
    wipSeries: buildWipSeries(rows, now),
    lifecycleCounts: buildLifecycleCounts(rows),
    exceptions: buildExceptions(rows, now, recoveryRows),
    priorityWork: buildPriorityWork(rows, now),
    counts: {
      supplySources: rows.roots.length,
      openDemands: rows.demands.filter((demand) =>
        ["OPEN", "PAUSED"].includes(upper(demand.status)),
      ).length,
      activeJobs,
      waitingJobs,
      activeWorkers,
      stoppedWorkers,
      starvationCells: rows.coverageCells.filter(
        (cell) =>
          upper(cell.searchStatus) === "WAITING_FOR_PIPELINE" &&
          cell.unresolvedLeadCount > 0,
      ).length,
      backpressureJobs:
        rows.coverageJobs.filter((job) => job.isBlockingCoverage).length +
        rows.gatewayJobs.filter((job) => Boolean(job.pipelineBlockedAt)).length,
      totalTargetDeficit: targetDeficits.reduce(
        (sum, row) => sum + row.deficit,
        0,
      ),
    },
  };
};
export const loadAffiliateOperationsProjection = async (
  input: AffiliateOperationsProjectionInput,
): Promise<AffiliateOperationsProjection> => {
  const view = isAffiliateOperationsView(input.view) ? input.view : "overview";
  const page = Math.max(1, Math.trunc(input.page || 1));
  const targetPage = Math.max(1, Math.trunc(input.targetPage || 1));
  const campaignPage = Math.max(1, Math.trunc(input.campaignPage || 1));
  const discoveryPage = Math.max(1, Math.trunc(input.discoveryPage || 1));
  const historyPage = Math.max(1, Math.trunc(input.historyPage || 1));
  const historyPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.historyPageSize || DEFAULT_PAGE_SIZE)),
  );
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize || DEFAULT_PAGE_SIZE)),
  );
  const now = new Date();
  return prisma.$transaction(
    async (client) => {
      const requestedCohort = input.contract.rolloutCohort.trim() || "DEFAULT";
      const requestedVersion = input.contract.contractVersion;
      const contract = await client.affiliateSupplyContractManifests.findFirst({
        where: {
          status: "ACTIVE",
          rolloutCohort: requestedCohort,
          version: requestedVersion ?? undefined,
        },
        orderBy: { activatedAt: "desc" },
        select: {
          id: true,
          rolloutCohort: true,
          version: true,
          status: true,
          contractHash: true,
          contractJson: true,
          componentHashes: true,
          activatedAt: true,
        },
      });
      if (!contract) {
        throw new Error(
          `Supply Contract ${requestedCohort} / v${requestedVersion ?? "latest"} is not available.`,
        );
      }
      const contractSelection: AffiliateOperationsContractSelection = {
        rolloutCohort: contract.rolloutCohort,
        contractVersion: contract.version,
      };
      const rows = await loadProjectionRows(client, contractSelection);
      const scopedRows = scopeProjectionRows(rows, contractSelection);
      const overviewRows = scopeOverviewRows(scopedRows, input.filters, now);
      const rootsById = new Map(
        overviewRows.roots.map((root) => [root.id, root]),
      );
      const overview = buildOverview(
        overviewRows,
        rootsById,
        contract?.contractJson,
        contractSelection,
        now,
        input.filters,
        rows,
      );
      const normalizedInput: AffiliateOperationsProjectionInput = {
        ...input,
        view,
        page,
        pageSize,
        targetPage,
        campaignPage,
        discoveryPage,
        historyPage,
        historyPageSize,
        contract: contractSelection,
      };
      const coverage = buildCoverage(scopedRows, normalizedInput, now);
      const jobs = buildJobs(scopedRows, normalizedInput, now);
      const intake = buildIntakes(scopedRows, normalizedInput, now);
      const review = buildReviews(scopedRows, normalizedInput, now);
      const sources = buildSources(scopedRows, normalizedInput, now);
      const { candidates } = buildCandidates(scopedRows, normalizedInput, now);
      const historyRevision = historyRevisionFor(scopedRows, contractSelection);
      return {
        schemaVersion: 2,
        asOf: now.toISOString(),
        historyRevision,
        stale: false,
        view,
        filters: input.filters,
        contract: contractSelection,
        sort: input.sort,
        overview,
        coverage,
        jobs,
        intake,
        review,
        sources,
        candidates,
        selected: buildSelectedDetail(scopedRows, normalizedInput, now),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 20_000,
    },
  );
};

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
