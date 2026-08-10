import { prisma } from '@/lib/prisma';
import {
  loadAffiliateCoverageCityCatalog,
  type AffiliateCoverageCity,
  type AffiliateCoverageCityCatalog,
} from './coverageCityCatalog';
import {
  AFFILIATE_COVERAGE_COHORT_PRIORITY,
  calculateAffiliateCoverageGapSeverity,
  calculateAffiliateCoveragePriorityScore,
  calculateAffiliateCoverageStalenessWeight,
  compareAffiliateCoverageWork,
  requiredStrategyFamilyCountForPopulation,
  reviewIntervalDaysForPopulation,
} from './coverageGapScoring';
import {
  AFFILIATE_COVERAGE_PROFILE_BY_KEY,
  AFFILIATE_COVERAGE_PROFILES,
  type AffiliateCoverageProfileKey,
} from './coverageProfiles';

export type AffiliateCoverageStatus = 'UNASSESSED' | 'GAP' | 'COVERED';
export type AffiliateCoverageSearchStatus = 'READY' | 'SEARCHING' | 'WAITING_FOR_PIPELINE' | 'SATURATED' | 'STALE';
export type AffiliateCoverageEvidenceQuality = 'EXACT' | 'PARTIAL_HISTORY' | 'NO_EVIDENCE';

export type AffiliateCoverageInventoryFilters = {
  cohort?: 'west-coast-core' | 'west-coast-expansion' | 'national' | 'all';
  market?: string;
  city?: string;
  status?: 'gap' | 'covered' | 'saturated' | 'waiting' | 'stale';
  limit?: number;
};

export type AffiliateCoverageInventoryCell = {
  id: string;
  placeGeoid: string;
  city: string;
  state: string;
  stateCode: string;
  censusRank: number;
  cityRank: number;
  population: number;
  marketKey: string;
  marketName: string;
  cohort: AffiliateCoverageCity['cohort'];
  cohortPriority: number;
  sportId: string;
  sportName: string;
  profileKey: AffiliateCoverageProfileKey;
  coverageStatus: AffiliateCoverageStatus;
  searchStatus: AffiliateCoverageSearchStatus;
  populationWeight: number;
  gapSeverity: number;
  profileWeight: number;
  stalenessWeight: number;
  priorityScore: number;
  directPolicyKeyCount: number;
  directPolicyKeys: string[];
  approvedSourceCount: number;
  strategyFamilyCount: number;
  strategyFamilyKeys: string[];
  unresolvedLeadCount: number;
  failedCaptureCount: number;
  consecutiveNoYieldCycles: number;
  requiredStrategyFamilyCount: number;
  queryStrategyVersion: number;
  evidenceQuality: AffiliateCoverageEvidenceQuality;
  lastAssessedAt: Date | null;
  nextReviewAt: Date | null;
  partialHistory: boolean;
  waitingReason: string | null;
  evidence: Record<string, unknown>;
};

export type AffiliateCoverageInventory = {
  catalog: {
    schemaVersion: number;
    censusVintage: number;
    checksum: string;
  };
  cityCount: number;
  marketCount: number;
  sportCount: number;
  profileCount: number;
  theoreticalCellCount: number;
  stateCounts: Record<string, number>;
  coverageCounts: Record<AffiliateCoverageStatus, number>;
  searchStateCounts: Record<AffiliateCoverageSearchStatus, number>;
  partialHistoryCount: number;
  rankedCells: AffiliateCoverageInventoryCell[];
};

type CoverageRow = Record<string, unknown>;
type CoverageModel = {
  findMany: (args?: unknown) => Promise<CoverageRow[]>;
  findUnique?: (args: unknown) => Promise<CoverageRow | null>;
  upsert?: (args: unknown) => Promise<CoverageRow>;
  updateMany?: (args: unknown) => Promise<{ count: number }>;
};
type CoverageDatabase = Record<string, CoverageModel | undefined> & {
  sports: CoverageModel;
  affiliateSourceDiscoveryCampaigns: CoverageModel;
  affiliateSourceDiscoveryRuns: CoverageModel;
  affiliateSourceDiscoveryResults: CoverageModel;
  affiliateSourceIntakes: CoverageModel;
  affiliateSourceIntakeRuns: CoverageModel;
  affiliateSourceMappingJobs: CoverageModel;
  organizations: CoverageModel;
  affiliateCoverageCities?: CoverageModel;
  affiliateCoverageCells?: CoverageModel;
  affiliateScrapeSources?: CoverageModel;
  affiliateSourceDiscoveryQueryExecutions?: CoverageModel;
};
type WritableCoverageModel = {
  upsert: (args: unknown) => Promise<CoverageRow>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};
type CoverageWriteDatabase = {
  cities: WritableCoverageModel;
  cells: WritableCoverageModel;
};

export type CoverageInventoryDependencies = {
  catalog?: AffiliateCoverageCityCatalog;
  sports?: Array<{ id: string; name: string }>;
  campaigns?: CoverageRow[];
  runs?: CoverageRow[];
  results?: CoverageRow[];
  intakes?: CoverageRow[];
  approvedSources?: CoverageRow[];
  organizations?: CoverageRow[];
  mappingJobs?: CoverageRow[];
  failedIntakeRuns?: CoverageRow[];
  queryExecutions?: CoverageRow[];
  storedCells?: CoverageRow[];
  assessments?: CoverageRow[];
  now?: Date;
  includeAllCells?: boolean;
};

export type CoverageCellReconcileDependencies = CoverageInventoryDependencies & {
  database?: CoverageWriteDatabase;
};

export type CoverageCellReconcileSummary = {
  citiesUpserted: number;
  cellsUpserted: number;
  archivedCities: number;
  changedCells: number;
  createdAssessments: number;
};

const QUERY_STRATEGY_VERSION = 1;
const PROFILE_KEYS = AFFILIATE_COVERAGE_PROFILES.map((profile) => profile.key);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const hasStringValue = (value: unknown, expected: string): boolean => (
  Array.isArray(value) && value.some((entry) => entry === expected)
);

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const normalizeLimit = (value: number | undefined): number => Math.max(1, Math.min(500, Math.trunc(value ?? 500)));

const cityMatchesText = (city: AffiliateCoverageCity, value: unknown): boolean => {
  const text = stringValue(value)?.toLowerCase() ?? '';
  return text === city.city.toLowerCase() || text === `${city.city}, ${city.state}`.toLowerCase();
};

const targetForRow = (row: Record<string, unknown>): Record<string, unknown> => ({
  ...recordValue(row.metadata),
  ...recordValue(row.reasonDetails),
  ...recordValue(recordValue(row.metadata).coverageTarget),
});

const rowCityAttribution = (row: Record<string, unknown>, city: AffiliateCoverageCity): boolean => {
  const target = targetForRow(row);
  const explicitGeoid = stringValue(row.cityGeoid) ?? stringValue(target.cityGeoid);
  if (explicitGeoid) return explicitGeoid === city.placeGeoid;
  const targetCity = target.targetCity ?? target.city ?? row.targetCity ?? target.queryTarget;
  const targetState = target.targetState ?? target.state ?? row.targetState;
  return Boolean(targetCity) && cityMatchesText(city, targetState ? `${String(targetCity)}, ${String(targetState)}` : targetCity);
};

const rowMatchesCell = (row: Record<string, unknown>, city: AffiliateCoverageCity, sport: { id: string; name: string }, profileKey: string): boolean => {
  if (!rowCityAttribution(row, city)) return false;
  const target = targetForRow(row);
  const rowProfile = stringValue(row.profileKey)
    ?? stringValue(target.profileKey)
    ?? stringValue(target.queryProfile)?.replace(/^PROFILE:/, '');
  if (!rowProfile || rowProfile !== profileKey) return false;
  const sportIds = [row.sportId, target.sportId].filter((value): value is string => typeof value === 'string');
  const sportNames = [row.sportName, ...(Array.isArray(row.sportHints) ? row.sportHints : []), target.sportName]
    .filter((value): value is string => typeof value === 'string');
  if (!sportIds.length && !sportNames.length) return false;
  if (sportIds.length && !sportIds.includes(sport.id)) return false;
  if (sportNames.length && !sportNames.some((name) => name.toLowerCase() === sport.name.toLowerCase())) return false;
  return true;
};

const rowIsPartialHistoryForCity = (row: Record<string, unknown>, city: AffiliateCoverageCity): boolean => (
  rowCityAttribution(row, city) && !rowMatchesCell(row, city, { id: '__unknown__', name: '__unknown__' }, '__unknown__')
);

const isDirectLinked = (row: Record<string, unknown>): boolean => Boolean(
  row.matchingIntakeId
  || row.matchingSourceId
  || row.matchingOrganizationId
  || row.publishedSourceId
  || row.approvedSourceId
  || row.affiliateSourceId
  || row.organizationId,
);

const isRejectedOrIntermediary = (row: Record<string, unknown>): boolean => (
  ['REJECTED', 'BLOCKED', 'DUPLICATE'].includes(String(row.status ?? '').toUpperCase())
  || String(recordValue(row.reasonDetails).classification ?? '').toUpperCase() === 'INTERMEDIARY'
  || String(recordValue(row.metadata).classification ?? '').toUpperCase() === 'INTERMEDIARY'
);

const policyKeyForRow = (row: Record<string, unknown>): string | null => (
  stringValue(row.policyKey) ?? stringValue(row.domainPolicyKey) ?? stringValue(row.sourcePolicyKey)
);

const rowProviderStatusIsSuccessful = (row: Record<string, unknown>): boolean => (
  ['SUCCEEDED', 'PARTIAL', 'SUCCESS', 'USEFUL_PARTIAL', 'COMPLETED'].includes(String(row.status ?? '').toUpperCase())
);


const matchesStoredCell = (row: Record<string, unknown>, city: AffiliateCoverageCity, sport: { id: string }, profileKey: string): boolean => (
  row.cityId === city.placeGeoid
  || row.placeGeoid === city.placeGeoid
  || (row.cityGeoid === city.placeGeoid && row.sportId === sport.id && row.profileKey === profileKey)
);

const cellKey = (city: AffiliateCoverageCity, sportId: string, profileKey: string): string => (
  `${city.placeGeoid}:${sportId}:${profileKey}`
);

const statusFilterMatches = (cell: AffiliateCoverageInventoryCell, status: AffiliateCoverageInventoryFilters['status']): boolean => {
  if (!status) return true;
  if (status === 'gap') return cell.coverageStatus === 'GAP';
  if (status === 'covered') return cell.coverageStatus === 'COVERED';
  if (status === 'saturated') return cell.searchStatus === 'SATURATED';
  if (status === 'waiting') return cell.searchStatus === 'WAITING_FOR_PIPELINE';
  return cell.searchStatus === 'STALE';
};

const loadDefaultDependencies = async (catalog: AffiliateCoverageCityCatalog): Promise<CoverageInventoryDependencies> => {
  const database = prisma as unknown as CoverageDatabase;
  const [sportsRows, campaigns, runs, results, intakes, approvedSources, organizations, mappingJobs, failedIntakeRuns, queryExecutions, storedCells, assessments] = await Promise.all([
    database.sports.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    database.affiliateSourceDiscoveryCampaigns.findMany({ select: { id: true, metadata: true, region: true, location: true } }),
    database.affiliateSourceDiscoveryRuns.findMany({ select: { id: true, campaignId: true, status: true, summary: true, createdAt: true, finishedAt: true } }),
    database.affiliateSourceDiscoveryResults.findMany({ select: { id: true, campaignId: true, status: true, policyKey: true, reasonCodes: true, reasonDetails: true, metadata: true, matchingIntakeId: true, matchingSourceId: true, matchingOrganizationId: true, updatedAt: true, latestRunId: true, sportHints: true } }),
    database.affiliateSourceIntakes.findMany({ select: { id: true, sourceKey: true, region: true, baseUrl: true, status: true, organizationId: true, affiliateSourceId: true, suggestedClassification: true, lastRunId: true, updatedAt: true } }),
    database.affiliateScrapeSources ? database.affiliateScrapeSources.findMany({ select: { id: true, sourceKey: true, organizationId: true, baseUrl: true, status: true, metadata: true, updatedAt: true } }) : [],
    database.organizations.findMany({ select: { id: true, website: true, location: true, address: true, sports: true, status: true, updatedAt: true } }),
    database.affiliateSourceMappingJobs.findMany({ select: { id: true, intakeId: true, status: true, updatedAt: true } }),
    database.affiliateSourceIntakeRuns.findMany({ select: { id: true, intakeId: true, status: true, summary: true, createdAt: true, finishedAt: true } }),
    database.affiliateSourceDiscoveryQueryExecutions ? database.affiliateSourceDiscoveryQueryExecutions.findMany() : [],
    database.affiliateCoverageCells ? database.affiliateCoverageCells.findMany() : [],
    database.affiliateCoverageCellAssessments ? database.affiliateCoverageCellAssessments.findMany() : [],
  ]);
  const sports = sportsRows.flatMap((row) => {
    const id = stringValue(row.id);
    const name = stringValue(row.name);
    return id && name ? [{ id, name }] : [];
  });
  return { catalog, sports, campaigns, runs, results, intakes, approvedSources, organizations, mappingJobs, failedIntakeRuns, queryExecutions, storedCells, assessments };
};

const buildCell = (
  city: AffiliateCoverageCity,
  sport: { id: string; name: string },
  profileKey: AffiliateCoverageProfileKey,
  dependencies: CoverageInventoryDependencies,
): AffiliateCoverageInventoryCell => {
  const now = dependencies.now ?? new Date();
  const stored = (dependencies.storedCells ?? []).find((row) => matchesStoredCell(row, city, sport, profileKey));
  const executions = (dependencies.queryExecutions ?? []).filter((row) => rowMatchesCell(row, city, sport, profileKey));
  const historicalResults = (dependencies.results ?? []).filter((row) => rowMatchesCell(row, city, sport, profileKey));
  const allHistoricalResults = (dependencies.results ?? []).filter((row) => rowCityAttribution(row, city));
  const directPolicyKeys = new Set<string>();
  const strategyFamilyKeys = new Set<string>();
  const successfulExecutions = executions.filter(rowProviderStatusIsSuccessful);
  const failedExecutions = executions.filter((row) => String(row.status ?? '').toUpperCase() === 'FAILED');
  const linkedHistoricalResults = historicalResults.filter((row) => isDirectLinked(row) && !isRejectedOrIntermediary(row));
  const approvedEvidence = [
    ...(dependencies.intakes ?? []),
    ...(dependencies.approvedSources ?? []),
    ...(dependencies.organizations ?? []),
  ].filter((row) => rowMatchesCell(row, city, sport, profileKey) && isDirectLinked(row));
  const linkedPolicyKeys = new Set<string>();
  for (const row of linkedHistoricalResults) {
    const policyKey = policyKeyForRow(row);
    if (policyKey) linkedPolicyKeys.add(policyKey);
  }
  for (const row of approvedEvidence) {
    const policyKey = policyKeyForRow(row) ?? stringValue(recordValue(row.metadata).policyKey);
    if (policyKey) linkedPolicyKeys.add(policyKey);
  }
  for (const row of successfulExecutions) {
    for (const key of Array.isArray(row.qualifiedPolicyKeys) ? row.qualifiedPolicyKeys : []) {
      if (typeof key === 'string' && key.trim() && linkedPolicyKeys.has(key.trim())) directPolicyKeys.add(key.trim());
    }
    const family = stringValue(row.strategyFamilyKey);
    if (family) strategyFamilyKeys.add(family);
  }
  for (const key of linkedPolicyKeys) directPolicyKeys.add(key);
  const unresolvedLeadCount = historicalResults.filter((row) => (
    String(row.status ?? '').toUpperCase() === 'NEW'
    && !isRejectedOrIntermediary(row)
    && !isDirectLinked(row)
    && (recordValue(row.reasonDetails).autoPromotionEligible === true || hasStringValue(row.reasonCodes, 'AUTO_PROMOTION_ELIGIBLE'))
  )).length;
  const failedCaptureCount = (dependencies.failedIntakeRuns ?? []).filter((row) => (
    !rowMatchesCell(row, city, sport, profileKey) ? false : !['SUCCEEDED', 'PARTIAL', 'EXCLUDED'].includes(String(row.status ?? '').toUpperCase())
  )).length;
  const lastExecutionAt = [...executions]
    .map((row) => dateValue(row.finishedAt ?? row.updatedAt ?? row.createdAt))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const lastAssessedAt = dateValue(stored?.lastAssessedAt) ?? lastExecutionAt;
  const reviewIntervalDays = reviewIntervalDaysForPopulation(city.population);
  const nextReviewAt = dateValue(stored?.nextReviewAt)
    ?? (lastAssessedAt ? new Date(lastAssessedAt.getTime() + reviewIntervalDays * 86_400_000) : null);
  const partialHistory = executions.length === 0 && allHistoricalResults.some((row) => rowIsPartialHistoryForCity(row, city));
  const evidenceQuality: AffiliateCoverageEvidenceQuality = executions.length > 0
    ? 'EXACT'
    : partialHistory ? 'PARTIAL_HISTORY' : 'NO_EVIDENCE';
  const strategyFamilyCount = strategyFamilyKeys.size || Number(stored?.strategyFamilyCount ?? 0);
  const requiredFamilies = requiredStrategyFamilyCountForPopulation(city.population);
  const coverageContractMet = directPolicyKeys.size > 0
    && strategyFamilyCount >= requiredFamilies
    && unresolvedLeadCount === 0
    && failedCaptureCount === 0;
  const coverageStatus: AffiliateCoverageStatus = coverageContractMet
    ? 'COVERED'
    : directPolicyKeys.size === 0 && !partialHistory ? 'UNASSESSED' : 'GAP';
  const storedSearchStatus = stringValue(stored?.searchStatus) as AffiliateCoverageSearchStatus | null;
  const due = !nextReviewAt || nextReviewAt.getTime() <= now.getTime();
  const searchStatus: AffiliateCoverageSearchStatus = unresolvedLeadCount > 0
    ? 'WAITING_FOR_PIPELINE'
    : storedSearchStatus === 'SATURATED' && !due
      ? 'SATURATED'
      : storedSearchStatus === 'SATURATED' && due
        ? 'STALE'
        : storedSearchStatus === 'SEARCHING' && executions.length === 0
          ? 'SEARCHING'
          : failedExecutions.length > 0 && executions.length > 0
            ? 'READY'
            : due && storedSearchStatus === 'STALE' ? 'STALE' : 'READY';
  const gapSeverity = calculateAffiliateCoverageGapSeverity({
    qualifiedDirectPolicyKeyCount: directPolicyKeys.size,
    approvedSourceCount: approvedEvidence.length,
    strategyFamilyCount,
    evidenceQuality,
    stale: searchStatus === 'STALE',
    coverageContractMet,
  });
  const stalenessWeight = calculateAffiliateCoverageStalenessWeight({ lastAssessedAt, nextReviewAt, reviewIntervalDays, now });
  const profileWeight = AFFILIATE_COVERAGE_PROFILE_BY_KEY[profileKey].weight;
  const priorityScore = calculateAffiliateCoveragePriorityScore({
    populationWeight: city.populationWeight,
    gapSeverity,
    profileWeight,
    stalenessWeight,
  });
  const consecutiveNoYieldCycles = Number(stored?.consecutiveNoYieldCycles ?? 0);
  return {
    id: stringValue(stored?.id) ?? cellKey(city, sport.id, profileKey),
    placeGeoid: city.placeGeoid,
    city: city.city,
    state: city.state,
    stateCode: city.stateCode,
    censusRank: city.rank,
    cityRank: city.rank,
    population: city.population,
    marketKey: city.marketKey,
    marketName: city.marketName,
    cohort: city.cohort,
    cohortPriority: AFFILIATE_COVERAGE_COHORT_PRIORITY[city.cohort],
    sportId: sport.id,
    sportName: sport.name,
    profileKey,
    coverageStatus,
    searchStatus,
    populationWeight: city.populationWeight,
    gapSeverity,
    profileWeight,
    stalenessWeight,
    priorityScore,
    directPolicyKeyCount: directPolicyKeys.size,
    directPolicyKeys: [...directPolicyKeys].sort(),
    approvedSourceCount: approvedEvidence.length,
    strategyFamilyCount,
    strategyFamilyKeys: [...strategyFamilyKeys].sort(),
    unresolvedLeadCount,
    failedCaptureCount,
    consecutiveNoYieldCycles,
    requiredStrategyFamilyCount: requiredFamilies,
    queryStrategyVersion: Number(stored?.queryStrategyVersion ?? QUERY_STRATEGY_VERSION),
    evidenceQuality,
    lastAssessedAt,
    nextReviewAt,
    partialHistory,
    waitingReason: unresolvedLeadCount > 0 ? 'Automatically promotable direct result is not linked to the intake pipeline.' : null,
    evidence: {
      historicalResultCount: historicalResults.length,
      exactQueryExecutionCount: executions.length,
      successfulQueryCount: successfulExecutions.length,
      failedQueryCount: failedExecutions.length,
      linkedHistoricalResultCount: linkedHistoricalResults.length,
      approvedEvidenceCount: approvedEvidence.length,
      partialHistory,
    },
  };
};

export const buildAffiliateCoverageInventory = async (
  filters: AffiliateCoverageInventoryFilters = {},
  dependencies: CoverageInventoryDependencies = {},
): Promise<AffiliateCoverageInventory> => {
  const catalog = dependencies.catalog ?? loadAffiliateCoverageCityCatalog();
  const resolved = dependencies.sports ? dependencies : { ...await loadDefaultDependencies(catalog), ...dependencies };
  const sports = [...(resolved.sports ?? [])].sort((left, right) => left.name.localeCompare(right.name));
  const cells = catalog.cities.flatMap((city) => sports.flatMap((sport) => (
    PROFILE_KEYS.map((profileKey) => buildCell(city, sport, profileKey, resolved))
  ))).sort(compareAffiliateCoverageWork);
  const cohort = filters.cohort && filters.cohort !== 'all' ? ({
    'west-coast-core': 'WEST_COAST_CORE',
    'west-coast-expansion': 'WEST_COAST_EXPANSION',
    national: 'NATIONAL',
  } as const)[filters.cohort] : null;
  const filtered = cells.filter((cell) => (
    (!cohort || cell.cohort === cohort)
    && (!filters.market || cell.marketKey === filters.market)
    && (!filters.city || cell.placeGeoid === filters.city || cell.city.toLowerCase() === filters.city.toLowerCase())
    && statusFilterMatches(cell, filters.status)
  ));
  const stateCounts = catalog.cities.reduce<Record<string, number>>((counts, city) => ({
    ...counts,
    [city.stateCode]: (counts[city.stateCode] ?? 0) + 1,
  }), {});
  const coverageCounts = cells.reduce<Record<AffiliateCoverageStatus, number>>((counts, cell) => ({ ...counts, [cell.coverageStatus]: counts[cell.coverageStatus] + 1 }), { UNASSESSED: 0, GAP: 0, COVERED: 0 });
  const searchStateCounts = cells.reduce<Record<AffiliateCoverageSearchStatus, number>>((counts, cell) => ({ ...counts, [cell.searchStatus]: counts[cell.searchStatus] + 1 }), { READY: 0, SEARCHING: 0, WAITING_FOR_PIPELINE: 0, SATURATED: 0, STALE: 0 });
  return {
    catalog: { schemaVersion: catalog.schemaVersion, censusVintage: catalog.censusVintage, checksum: catalog.checksum },
    cityCount: catalog.cities.length,
    marketCount: new Set(catalog.cities.map((city) => city.marketKey)).size,
    sportCount: sports.length,
    profileCount: PROFILE_KEYS.length,
    theoreticalCellCount: catalog.cities.length * sports.length * PROFILE_KEYS.length,
    stateCounts,
    coverageCounts,
    searchStateCounts,
    partialHistoryCount: cells.filter((cell) => cell.partialHistory).length,
    rankedCells: dependencies.includeAllCells ? filtered : filtered.slice(0, normalizeLimit(filters.limit)),
  };
};

export const reconcileAffiliateCoverageCells = async (
  options: { now?: Date } = {},
  dependencies: CoverageCellReconcileDependencies = {},
): Promise<CoverageCellReconcileSummary> => {
  const database = dependencies.database ?? (() => {
    const source = prisma as unknown as CoverageDatabase;
    if (!source.affiliateCoverageCities || !source.affiliateCoverageCells) {
      throw new Error('Affiliate coverage Prisma models are unavailable; run prisma generate after the additive migration.');
    }
    return {
      cities: source.affiliateCoverageCities as unknown as WritableCoverageModel,
      cells: source.affiliateCoverageCells as unknown as WritableCoverageModel,
    };
  })();
  const now = options.now ?? dependencies.now ?? new Date();
  const catalog = dependencies.catalog ?? loadAffiliateCoverageCityCatalog();
  const inventory = await buildAffiliateCoverageInventory({}, { ...dependencies, catalog, now, includeAllCells: true });
  let citiesUpserted = 0;
  let cellsUpserted = 0;
  let changedCells = 0;
  for (const city of catalog.cities) {
    await database.cities.upsert({
      where: { placeGeoid: city.placeGeoid },
      create: {
        id: `coverage_city_${city.placeGeoid}`,
        censusVintage: catalog.censusVintage,
        placeGeoid: city.placeGeoid,
        rank: city.rank,
        city: city.city,
        censusName: city.censusName,
        state: city.state,
        stateCode: city.stateCode,
        population: city.population,
        marketKey: city.marketKey,
        marketName: city.marketName,
        cohort: city.cohort,
        populationWeight: city.populationWeight,
        active: true,
      },
      update: {
        censusVintage: catalog.censusVintage,
        rank: city.rank,
        city: city.city,
        censusName: city.censusName,
        state: city.state,
        stateCode: city.stateCode,
        population: city.population,
        marketKey: city.marketKey,
        marketName: city.marketName,
        cohort: city.cohort,
        populationWeight: city.populationWeight,
        active: true,
      },
    });
    citiesUpserted += 1;
  }
  const activeGeoids = catalog.cities.map((city) => city.placeGeoid);
  const archived = await database.cities.updateMany({ where: { placeGeoid: { notIn: activeGeoids }, active: true }, data: { active: false } });
  for (const cell of inventory.rankedCells) {
    const result = await database.cells.upsert({
      where: { cityId_sportId_profileKey: { cityId: cell.placeGeoid, sportId: cell.sportId, profileKey: cell.profileKey } },
      create: {
        id: cell.id,
        cityId: cell.placeGeoid,
        marketKey: cell.marketKey,
        cohort: cell.cohort,
        cohortPriority: cell.cohortPriority,
        sportId: cell.sportId,
        profileKey: cell.profileKey,
        sportName: cell.sportName,
        coverageStatus: cell.coverageStatus,
        searchStatus: cell.searchStatus,
        populationWeight: cell.populationWeight,
        gapSeverity: cell.gapSeverity,
        profileWeight: cell.profileWeight,
        stalenessWeight: cell.stalenessWeight,
        priorityScore: cell.priorityScore,
        directPolicyKeyCount: cell.directPolicyKeyCount,
        approvedSourceCount: cell.approvedSourceCount,
        strategyFamilyCount: cell.strategyFamilyCount,
        unresolvedLeadCount: cell.unresolvedLeadCount,
        consecutiveNoYieldCycles: cell.consecutiveNoYieldCycles,
        queryStrategyVersion: cell.queryStrategyVersion,
        evidenceQuality: cell.evidenceQuality,
        lastAssessedAt: cell.lastAssessedAt,
        nextReviewAt: cell.nextReviewAt,
        evidence: { ...cell.evidence, directPolicyKeys: cell.directPolicyKeys, strategyFamilyKeys: cell.strategyFamilyKeys },
      },
      update: {
        marketKey: cell.marketKey,
        cohort: cell.cohort,
        sportName: cell.sportName,
        cohortPriority: cell.cohortPriority,
        coverageStatus: cell.coverageStatus,
        searchStatus: cell.searchStatus,
        populationWeight: cell.populationWeight,
        gapSeverity: cell.gapSeverity,
        profileWeight: cell.profileWeight,
        stalenessWeight: cell.stalenessWeight,
        priorityScore: cell.priorityScore,
        directPolicyKeyCount: cell.directPolicyKeyCount,
        approvedSourceCount: cell.approvedSourceCount,
        strategyFamilyCount: cell.strategyFamilyCount,
        unresolvedLeadCount: cell.unresolvedLeadCount,
        consecutiveNoYieldCycles: cell.consecutiveNoYieldCycles,
        queryStrategyVersion: cell.queryStrategyVersion,
        evidenceQuality: cell.evidenceQuality,
        lastAssessedAt: cell.lastAssessedAt,
        nextReviewAt: cell.nextReviewAt,
        evidence: { ...cell.evidence, directPolicyKeys: cell.directPolicyKeys, strategyFamilyKeys: cell.strategyFamilyKeys },
      },
    });
    cellsUpserted += 1;
    if (dateValue(result.createdAt)?.getTime() === dateValue(result.updatedAt)?.getTime()) changedCells += 1;
  }
  return { citiesUpserted, cellsUpserted, archivedCities: archived.count ?? 0, changedCells, createdAssessments: 0 };
};

export const getAffiliateCoverageMarketContext = async (
  marketKey: string,
  options: { now?: Date; limit?: number } = {},
  dependencies: CoverageInventoryDependencies = {},
) => {
  const inventory = await buildAffiliateCoverageInventory({ market: marketKey, limit: options.limit ?? 500 }, { ...dependencies, now: options.now ?? dependencies.now });
  return {
    marketKey,
    marketName: inventory.rankedCells[0]?.marketName ?? null,
    cohort: inventory.rankedCells[0]?.cohort ?? null,
    cityCount: new Set(inventory.rankedCells.map((cell) => cell.placeGeoid)).size,
    cells: inventory.rankedCells,
    summary: {
      coverageCounts: inventory.coverageCounts,
      searchStateCounts: inventory.searchStateCounts,
      partialHistoryCount: inventory.partialHistoryCount,
    },
  };
};
