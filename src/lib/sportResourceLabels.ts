import type { Sport } from '@/types';

export type SportResourceLabels = Readonly<{
  singular: string;
  plural: string;
}>;
export type SportResourceLabelSource = {
  resourceLabelSingular?: unknown;
  resourceLabelPlural?: unknown;
};


export const GENERIC_RESOURCE_LABELS: SportResourceLabels = Object.freeze({
  singular: 'Resource',
  plural: 'Resources',
});

const RESOURCE_LABELS_BY_SPORT: Record<string, SportResourceLabels> = {
  badminton: { singular: 'Court', plural: 'Courts' },
  basketball: { singular: 'Court', plural: 'Courts' },
  futsal: { singular: 'Court', plural: 'Courts' },
  pickleball: { singular: 'Court', plural: 'Courts' },
  racquetball: { singular: 'Court', plural: 'Courts' },
  tennis: { singular: 'Court', plural: 'Courts' },
  'ball hockey': { singular: 'Rink', plural: 'Rinks' },
  hockey: { singular: 'Rink', plural: 'Rinks' },
  baseball: { singular: 'Diamond', plural: 'Diamonds' },
  softball: { singular: 'Diamond', plural: 'Diamonds' },
  'table tennis': { singular: 'Table', plural: 'Tables' },
  'australian football': { singular: 'Field', plural: 'Fields' },
  'field hockey': { singular: 'Field', plural: 'Fields' },
  'flag football': { singular: 'Field', plural: 'Fields' },
  football: { singular: 'Field', plural: 'Fields' },
  lacrosse: { singular: 'Field', plural: 'Fields' },
  'ultimate frisbee': { singular: 'Field', plural: 'Fields' },
};

const normalizeSportName = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export const getDefaultSportResourceLabels = (
  sportName: unknown,
): Pick<Sport, 'resourceLabelSingular' | 'resourceLabelPlural'> => {
  const normalizedName = normalizeSportName(sportName);
  const labels = normalizedName.includes('volleyball')
    ? { singular: 'Court', plural: 'Courts' }
    : normalizedName.includes('soccer')
      ? { singular: 'Field', plural: 'Fields' }
      : RESOURCE_LABELS_BY_SPORT[normalizedName] ?? GENERIC_RESOURCE_LABELS;
  return {
    resourceLabelSingular: labels.singular,
    resourceLabelPlural: labels.plural,
  };
};

const parseResourceLabel = (value: unknown, property: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || value.length > 40) {
    throw new Error(`${property} must be a trimmed, nonblank string with at most 40 characters.`);
  }
  return value;
};

export const getSportResourceLabels = (
  sport: SportResourceLabelSource,
): SportResourceLabels => ({
  singular: parseResourceLabel(sport.resourceLabelSingular, 'Sport.resourceLabelSingular'),
  plural: parseResourceLabel(sport.resourceLabelPlural, 'Sport.resourceLabelPlural'),
});

const uniqueIds = (values: readonly string[] | null | undefined): string[] => Array.from(new Set(
  (values ?? []).map((value) => String(value ?? '').trim()).filter(Boolean),
));

export const resolveEventResourceLabels = ({
  sportIds,
  sportsById,
  resourceSportIds,
}: {
  sportIds: readonly string[] | null | undefined;
  sportsById: ReadonlyMap<string, SportResourceLabelSource>;
  resourceSportIds?: readonly string[] | null;
}): SportResourceLabels => {
  const eventSportIds = uniqueIds(sportIds);
  const scopedSportIds = uniqueIds(resourceSportIds)
    .filter((sportId) => eventSportIds.length === 0 || eventSportIds.includes(sportId));
  const labelSportIds = scopedSportIds.length === 1
    ? scopedSportIds
    : eventSportIds.length === 1
      ? eventSportIds
      : [];
  const sport = labelSportIds.length === 1 ? sportsById.get(labelSportIds[0]) : null;
  return sport ? getSportResourceLabels(sport) : GENERIC_RESOURCE_LABELS;
};

export const resourceLabelForCount = (labels: SportResourceLabels, count: number): string => (
  count === 1 ? labels.singular : labels.plural
);


export const applySportResourceLabels = (
  message: string,
  labels: SportResourceLabels,
): string => message
  .replace(/\bResources\b/g, labels.plural)
  .replace(/\bResource\b/g, labels.singular);