import { apiRequest } from '@/lib/apiClient';
import { getSportResourceLabels } from '@/lib/sportResourceLabels';
import type { MatchRulesConfig, Sport, SportCategory, SportOfficialPositionTemplate } from '@/types';

const CACHE_KEY = 'sports-cache-v6';
// Sports rarely change; keep cache long-lived and refresh opportunistically.
const CACHE_DURATION_MS = 1000 * 60 * 60 * 24; // 24h

export type SportCatalog = {
  sports: Sport[];
  categories: SportCategory[];
};

let cachedCatalog: SportCatalog | null = null;
let cachedAt: number | null = null;
let inflightPromise: Promise<SportCatalog> | null = null;

const normalizeClientSportName = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

const clientSportId = (row: any): string => String(row?.id ?? row?.$id ?? '');

const clientSportCreatedAt = (row: any): number => {
  const value = row?.createdAt ?? row?.$createdAt;
  if (value == null) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

const clientSportConfigurationCount = (row: any): number => (
  row && typeof row === 'object'
    ? Object.entries(row).reduce((count, [key, value]) => (
      ['$id', 'id', 'name', '$createdAt', 'createdAt', '$updatedAt', 'updatedAt'].includes(key) || value == null
        ? count
        : count + 1
    ), 0)
    : 0
);

const dedupeClientSportRows = <T extends { name?: unknown }>(rows: readonly T[]): T[] => {
  const groups = new Map<string, { index: number; row: T }>();
  rows.forEach((row) => {
    const canonicalName = normalizeClientSportName(row.name);
    if (!canonicalName) {
      throw new Error(`Sport ${clientSportId(row)} has a blank canonical name.`);
    }

    const current = groups.get(canonicalName);
    if (!current) {
      groups.set(canonicalName, { index: groups.size, row });
      return;
    }

    const rowId = clientSportId(row);
    const currentId = clientSportId(current.row);
    const rowHasCanonicalId = normalizeClientSportName(rowId) === canonicalName;
    const currentHasCanonicalId = normalizeClientSportName(currentId) === canonicalName;
    const rowConfigurationCount = clientSportConfigurationCount(row);
    const currentConfigurationCount = clientSportConfigurationCount(current.row);
    const rowCreatedAt = clientSportCreatedAt(row);
    const currentCreatedAt = clientSportCreatedAt(current.row);
    const isPreferred = rowHasCanonicalId !== currentHasCanonicalId
      ? rowHasCanonicalId
      : rowConfigurationCount !== currentConfigurationCount
        ? rowConfigurationCount > currentConfigurationCount
        : rowCreatedAt !== currentCreatedAt
          ? rowCreatedAt < currentCreatedAt
          : rowId < currentId;
    if (isPreferred) current.row = row;
  });

  return Array.from(groups.values())
    .sort((left, right) => left.index - right.index)
    .map(({ row }) => row);
};

const normalizeOfficialPositionTemplates = (value: unknown): SportOfficialPositionTemplate[] => (
  Array.isArray(value)
    ? value.flatMap((entry) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const entryRecord = entry as { name?: unknown; count?: unknown };
      const name = String(entryRecord.name ?? '').trim();
      const numericCount = typeof entryRecord.count === 'number'
        ? entryRecord.count
        : Number(entryRecord.count);
      const count = Number.isFinite(numericCount) ? Math.max(1, Math.trunc(numericCount)) : 1;

      return name ? [{ name, count }] : [];
    })
    : []
);

const normalizeMatchRulesTemplate = (value: unknown): MatchRulesConfig | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as MatchRulesConfig) }
    : null
);

const mapRowToSport = (row: any): Sport => {
  if (!row) {
    throw new Error('Unable to map sport from empty record.');
  }
  const resourceLabels = getSportResourceLabels(row);

  return {
    $id: String(row.id ?? row.$id ?? ''),
    name: String(row.name ?? ''),
    resourceLabelSingular: resourceLabels.singular,
    resourceLabelPlural: resourceLabels.plural,
    officialPositionTemplates: normalizeOfficialPositionTemplates(row.officialPositionTemplates),
    matchRulesTemplate: normalizeMatchRulesTemplate(row.matchRulesTemplate),
    usePointsForWin: Boolean(row.usePointsForWin),
    usePointsForDraw: Boolean(row.usePointsForDraw),
    usePointsForLoss: Boolean(row.usePointsForLoss),
    usePointsForForfeitWin: Boolean(row.usePointsForForfeitWin),
    usePointsForForfeitLoss: Boolean(row.usePointsForForfeitLoss),
    usePointsPerSetWin: Boolean(row.usePointsPerSetWin),
    usePointsPerSetLoss: Boolean(row.usePointsPerSetLoss),
    usePointsPerGameWin: Boolean(row.usePointsPerGameWin),
    usePointsPerGameLoss: Boolean(row.usePointsPerGameLoss),
    usePointsPerGoalScored: Boolean(row.usePointsPerGoalScored),
    usePointsPerGoalConceded: Boolean(row.usePointsPerGoalConceded),
    useMaxGoalBonusPoints: Boolean(row.useMaxGoalBonusPoints),
    useMinGoalBonusThreshold: Boolean(row.useMinGoalBonusThreshold),
    usePointsForShutout: Boolean(row.usePointsForShutout),
    usePointsForCleanSheet: Boolean(row.usePointsForCleanSheet),
    useApplyShutoutOnlyIfWin: Boolean(row.useApplyShutoutOnlyIfWin),
    usePointsPerGoalDifference: Boolean(row.usePointsPerGoalDifference),
    useMaxGoalDifferencePoints: Boolean(row.useMaxGoalDifferencePoints),
    usePointsPenaltyPerGoalDifference: Boolean(row.usePointsPenaltyPerGoalDifference),
    usePointsForParticipation: Boolean(row.usePointsForParticipation),
    usePointsForNoShow: Boolean(row.usePointsForNoShow),
    usePointsForWinStreakBonus: Boolean(row.usePointsForWinStreakBonus),
    useWinStreakThreshold: Boolean(row.useWinStreakThreshold),
    usePointsForOvertimeWin: Boolean(row.usePointsForOvertimeWin),
    usePointsForOvertimeLoss: Boolean(row.usePointsForOvertimeLoss),
    useOvertimeEnabled: Boolean(row.useOvertimeEnabled),
    usePointsPerRedCard: Boolean(row.usePointsPerRedCard),
    usePointsPerYellowCard: Boolean(row.usePointsPerYellowCard),
    usePointsPerPenalty: Boolean(row.usePointsPerPenalty),
    useMaxPenaltyDeductions: Boolean(row.useMaxPenaltyDeductions),
    useMaxPointsPerMatch: Boolean(row.useMaxPointsPerMatch),
    useMinPointsPerMatch: Boolean(row.useMinPointsPerMatch),
    useGoalDifferenceTiebreaker: Boolean(row.useGoalDifferenceTiebreaker),
    useHeadToHeadTiebreaker: Boolean(row.useHeadToHeadTiebreaker),
    useTotalGoalsTiebreaker: Boolean(row.useTotalGoalsTiebreaker),
    useEnableBonusForComebackWin: Boolean(row.useEnableBonusForComebackWin),
    useBonusPointsForComebackWin: Boolean(row.useBonusPointsForComebackWin),
    useEnableBonusForHighScoringMatch: Boolean(row.useEnableBonusForHighScoringMatch),
    useHighScoringThreshold: Boolean(row.useHighScoringThreshold),
    useBonusPointsForHighScoringMatch: Boolean(row.useBonusPointsForHighScoringMatch),
    useEnablePenaltyUnsporting: Boolean(row.useEnablePenaltyUnsporting),
    usePenaltyPointsUnsporting: Boolean(row.usePenaltyPointsUnsporting),
    usePointPrecision: Boolean(row.usePointPrecision),
    $createdAt: String(row.createdAt ?? row.$createdAt ?? ''),
    $updatedAt: String(row.updatedAt ?? row.$updatedAt ?? ''),
  };
};

const mapRowToSportCategory = (row: any): SportCategory | null => {
  const id = String(row?.id ?? row?.$id ?? '').trim();
  const name = String(row?.name ?? '').trim();
  if (!id || !name) return null;
  const sportIds: string[] = Array.isArray(row?.sportIds)
    ? Array.from(new Set(
      row.sportIds
        .filter((sportId: unknown): sportId is string => typeof sportId === 'string')
        .map((sportId: string) => sportId.trim())
        .filter(Boolean),
    ))
    : [];
  const numericDisplayOrder = Number(row?.displayOrder);
  return {
    $id: id,
    name,
    sportIds,
    displayOrder: Number.isInteger(numericDisplayOrder) && numericDisplayOrder >= 0
      ? numericDisplayOrder
      : 0,
    $createdAt: String(row?.createdAt ?? row?.$createdAt ?? ''),
    $updatedAt: String(row?.updatedAt ?? row?.$updatedAt ?? ''),
  };
};

const mapResponseToCatalog = (response: { sports?: any[]; categories?: any[] }): SportCatalog => {
  const sports = dedupeClientSportRows(response.sports || []).map(mapRowToSport);
  const validSportIds = new Set(sports.map((sport) => sport.$id));
  const categories = (Array.isArray(response.categories) ? response.categories : [])
    .flatMap((row) => {
      const category = mapRowToSportCategory(row);
      if (!category) return [];
      return [{
        ...category,
        sportIds: category.sportIds.filter((sportId) => validSportIds.has(sportId)),
      }];
    });
  return { sports, categories };
};

const loadFromStorage = (options?: { allowStale?: boolean }) => {
  if (typeof window === 'undefined' || cachedCatalog) {
    return;
  }

  const allowStale = Boolean(options?.allowStale);

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as { timestamp: number; sports: any[]; categories: any[] };
    if (
      !parsed
      || typeof parsed.timestamp !== 'number'
      || !Array.isArray(parsed.sports)
      || !Array.isArray(parsed.categories)
    ) {
      return;
    }

    const isExpired = Date.now() - parsed.timestamp > CACHE_DURATION_MS;
    if (isExpired && !allowStale) return;

    cachedCatalog = mapResponseToCatalog(parsed);
    cachedAt = parsed.timestamp;
  } catch {
    // Ignore storage parsing errors
  }
};

const saveToStorage = (catalog: SportCatalog) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), ...catalog }),
    );
  } catch {
    // Ignore quota/storage errors
  }
};

const shouldUseCache = () => {
  if (!cachedCatalog || cachedAt === null) {
    return false;
  }
  return Date.now() - cachedAt < CACHE_DURATION_MS;
};

const fetchCatalogFromApi = async (): Promise<SportCatalog> => {
  const response = await apiRequest<{ sports?: any[]; categories?: any[] }>('/api/sports');
  return mapResponseToCatalog(response);
};

export const sportsService = {
  getCached(options?: { allowStale?: boolean }): Sport[] | null {
    loadFromStorage({ allowStale: options?.allowStale });
    return cachedCatalog?.sports ?? null;
  },
  getCachedCatalog(options?: { allowStale?: boolean }): SportCatalog | null {
    loadFromStorage({ allowStale: options?.allowStale });
    return cachedCatalog;
  },
  async getCatalog(forceRefresh: boolean = false): Promise<SportCatalog> {
    if (!forceRefresh) {
      if (shouldUseCache()) {
        return cachedCatalog as SportCatalog;
      }
      loadFromStorage();
      if (shouldUseCache()) {
        return cachedCatalog as SportCatalog;
      }
    }

    if (inflightPromise) {
      return inflightPromise;
    }

    inflightPromise = fetchCatalogFromApi()
      .then((catalog) => {
        cachedCatalog = catalog;
        cachedAt = Date.now();
        saveToStorage(catalog);
        return catalog;
      })
      .finally(() => {
        inflightPromise = null;
      });

    return inflightPromise;
  },
  async getAll(forceRefresh: boolean = false): Promise<Sport[]> {
    const catalog = await this.getCatalog(forceRefresh);
    return catalog.sports;
  },
};
