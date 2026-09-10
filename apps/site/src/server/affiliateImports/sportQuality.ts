import { isAffiliateSportBlacklisted } from './affiliateSportMapping';
import {
  affiliateSportsCatalogSnapshotSchema,
  compareAffiliateCatalogCodeUnits,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import {
  resolvedAffiliateSportNameUnion,
  type AffiliateSportDetermination,
} from './affiliateSportDetermination';
export type AffiliateSportCatalogRow = {
  id: string;
  name: string;
};

export type AffiliateSportCandidateRow = {
  id: string;
  listingKind: string;
  title: string;
  sportName: string | null;
};

export type AffiliateSportOrganizationRow = {
  id: string;
  name: string;
  sports: string[];
};
export type AffiliateSportQualityIssue = {
  subjectType: 'CANDIDATE' | 'ORGANIZATION' | 'DETERMINATION';
  subjectId: string;
  subjectName: string;
  listingKind: string | null;
  sportName: string | null;
  canonicalSuggestion: string | null;
  code:
    | 'SPORT_NAME_REQUIRED'
    | 'SPORT_NAME_NOT_CANONICAL'
    | 'SPORT_NOT_IN_CATALOG'
    | 'SPORT_BLACKLISTED'
    | 'SPORT_DETERMINATION_MISMATCH';
  message: string;
};

export type AffiliateSportQuality = {
  checkedCandidateCount: number;
  checkedOrganizationSportCount: number;
  canonicalSportNames: string[];
  unsupportedSportNames: string[];
  catalogSha256: string | null;
  catalogHashMatched: boolean;
  determinationCoveragePassed: boolean;
  expectedSportNames: string[];
  observedSportNames: string[];
  issueCount: number;
  passed: boolean;
  issues: AffiliateSportQualityIssue[];
};

const nonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

export const analyzeAffiliateSportQuality = (input: {
  candidates: AffiliateSportCandidateRow[];
  organization: AffiliateSportOrganizationRow | null;
  catalog: AffiliateSportCatalogRow[];
  catalogSnapshot?: AffiliateSportsCatalogSnapshot;
  catalogSha256?: string;
  sportDeterminations?: readonly AffiliateSportDetermination[];
}): AffiliateSportQuality => {
  const canonicalSportNames = Array.from(new Set(
    input.catalog.map((sport) => nonEmptyString(sport.name)).filter((name): name is string => Boolean(name)),
  )).sort(compareAffiliateCatalogCodeUnits);
  const exactNames = new Set(canonicalSportNames);
  const namesByLowercase = new Map<string, string[]>();
  canonicalSportNames.forEach((name) => {
    const key = name.toLowerCase();
    namesByLowercase.set(key, [...(namesByLowercase.get(key) ?? []), name]);
  });

  const issues: AffiliateSportQualityIssue[] = [];
  const inspect = (subject: {
    subjectType: 'CANDIDATE' | 'ORGANIZATION';
    subjectId: string;
    subjectName: string;
    listingKind: string | null;
    sportName: unknown;
  }) => {
    const sportName = nonEmptyString(subject.sportName);
    if (!sportName) {
      issues.push({
        ...subject,
        sportName: null,
        canonicalSuggestion: null,
        code: 'SPORT_NAME_REQUIRED',
        message: 'Every affiliate candidate and source organization requires a sport name.',
      });
      return;
    }
    if (isAffiliateSportBlacklisted(sportName)) {
      issues.push({
        ...subject,
        sportName,
        canonicalSuggestion: null,
        code: 'SPORT_BLACKLISTED',
        message: `The sport ${sportName} is blacklisted because BracketIQ does not support tournament or league scoring for it.`,
      });
      return;
    }
    if (exactNames.has(sportName) && subject.sportName === sportName) return;

    const suggestions = namesByLowercase.get(sportName.toLowerCase()) ?? [];
    if (suggestions.length === 1) {
      issues.push({
        ...subject,
        sportName,
        canonicalSuggestion: suggestions[0],
        code: 'SPORT_NAME_NOT_CANONICAL',
        message: `Use the exact canonical sport name ${suggestions[0]}.`,
      });
      return;
    }

    issues.push({
      ...subject,
      sportName,
      canonicalSuggestion: null,
      code: 'SPORT_NOT_IN_CATALOG',
      message: `The sport ${sportName} is not in the BracketIQ sports catalog.`,
    });
  };

  input.candidates.forEach((candidate) => inspect({
    subjectType: 'CANDIDATE',
    subjectId: candidate.id,
    subjectName: candidate.title,
    listingKind: candidate.listingKind,
    sportName: candidate.sportName,
  }));
  input.organization?.sports.forEach((sportName) => inspect({
    subjectType: 'ORGANIZATION',
    subjectId: input.organization!.id,
    subjectName: input.organization!.name,
    listingKind: null,
    sportName,
  }));
  if (input.organization && input.organization.sports.length === 0) {
    inspect({
      subjectType: 'ORGANIZATION',
      subjectId: input.organization.id,
      subjectName: input.organization.name,
      listingKind: null,
      sportName: null,
    });
  }

  const unsupportedSportNames = Array.from(new Set(
    issues
      .filter((issue) => issue.code === 'SPORT_NOT_IN_CATALOG')
      .map((issue) => issue.sportName)
      .filter((name): name is string => Boolean(name)),
  )).sort(compareAffiliateCatalogCodeUnits);
  const observedSportNames = Array.from(new Set([
    ...input.candidates.map((candidate) => nonEmptyString(candidate.sportName)),
    ...(input.organization?.sports ?? []).map((sportName) => nonEmptyString(sportName)),
  ].filter((name): name is string => Boolean(name)))).sort(compareAffiliateCatalogCodeUnits);
  const expectedSportNames = input.sportDeterminations
    ? resolvedAffiliateSportNameUnion(input.sportDeterminations)
    : [];
  const determinationCoveragePassed = !input.sportDeterminations
    || (
      expectedSportNames.length === observedSportNames.length
      && expectedSportNames.every((name, index) => name === observedSportNames[index])
    );
  if (!determinationCoveragePassed) {
    issues.push({
      subjectType: 'DETERMINATION',
      subjectId: 'sport-union',
      subjectName: 'sport union',
      listingKind: null,
      sportName: null,
      canonicalSuggestion: null,
      code: 'SPORT_DETERMINATION_MISMATCH',
      message: `Observed candidate and organization sports must exactly equal resolved determination names (${expectedSportNames.join(', ')}).`,
    });
  }
  const catalogHashMatched = !input.catalogSnapshot
    || !input.catalogSha256
    || input.catalogSnapshot.sha256.toLowerCase() === input.catalogSha256.toLowerCase();

  return {
    checkedCandidateCount: input.candidates.length,
    checkedOrganizationSportCount: input.organization?.sports.length ?? 0,
    canonicalSportNames,
    unsupportedSportNames,
    catalogSha256: input.catalogSnapshot?.sha256 ?? input.catalogSha256 ?? null,
    catalogHashMatched,
    determinationCoveragePassed,
    expectedSportNames,
    observedSportNames,
    issueCount: issues.length,
    passed: issues.length === 0 && catalogHashMatched && determinationCoveragePassed,
    issues,
  };
};

export const inspectAffiliateSportQuality = async (input: {
  queryable: {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: T[] }>;
  };
  sourceId: string;
  catalogSnapshot?: AffiliateSportsCatalogSnapshot;
  sportsCatalog?: AffiliateSportsCatalogSnapshot;
  catalog?: AffiliateSportsCatalogSnapshot;
  catalogSha256?: string;
  sportsCatalogSha256?: string;
  sportDeterminations?: readonly AffiliateSportDetermination[];
}): Promise<AffiliateSportQuality> => {
  const injectedSnapshot = input.catalogSnapshot ?? input.sportsCatalog ?? input.catalog;
  if (injectedSnapshot) {
    const snapshot = affiliateSportsCatalogSnapshotSchema.parse(injectedSnapshot);
    const [candidateResult, organizationResult] = await Promise.all([
      input.queryable.query<AffiliateSportCandidateRow>(
        `SELECT id, "listingKind", title, "sportName"
           FROM "AffiliateImportCandidates"
          WHERE "sourceId" = $1
          ORDER BY "dedupeKey" ASC`,
        [input.sourceId],
      ),
      input.queryable.query<AffiliateSportOrganizationRow>(
        `SELECT organization.id, organization.name, organization.sports
           FROM "AffiliateScrapeSources" source
           JOIN "Organizations" organization ON organization.id = source."organizationId"
          WHERE source.id = $1
          LIMIT 1`,
        [input.sourceId],
      ),
    ]);
    return analyzeAffiliateSportQuality({
      candidates: candidateResult.rows,
      organization: organizationResult.rows[0] ?? null,
      catalog: snapshot.sports,
      catalogSnapshot: snapshot,
      catalogSha256: input.catalogSha256 ?? input.sportsCatalogSha256,
      sportDeterminations: input.sportDeterminations,
    });
  }

  const [candidateResult, organizationResult, catalogResult] = await Promise.all([
    input.queryable.query<AffiliateSportCandidateRow>(
      `SELECT id, "listingKind", title, "sportName"
         FROM "AffiliateImportCandidates"
        WHERE "sourceId" = $1
        ORDER BY "dedupeKey" ASC`,
      [input.sourceId],
    ),
    input.queryable.query<AffiliateSportOrganizationRow>(
      `SELECT organization.id, organization.name, organization.sports
         FROM "AffiliateScrapeSources" source
         JOIN "Organizations" organization ON organization.id = source."organizationId"
        WHERE source.id = $1
        LIMIT 1`,
      [input.sourceId],
    ),
    input.queryable.query<AffiliateSportCatalogRow>(
      `SELECT id, name
         FROM "Sports"
        ORDER BY name ASC`,
    ),
  ]);

  return analyzeAffiliateSportQuality({
    candidates: candidateResult.rows,
    organization: organizationResult.rows[0] ?? null,
    catalog: catalogResult.rows,
  });
};
