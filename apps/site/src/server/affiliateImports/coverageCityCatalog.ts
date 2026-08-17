import { createHash } from 'node:crypto';
import catalogSnapshot from '../../../data/affiliate-coverage/us-incorporated-cities-2025.json';

export type AffiliateCoverageCohort =
  | 'WEST_COAST_CORE'
  | 'WEST_COAST_EXPANSION'
  | 'NATIONAL';

export type AffiliateCoverageCity = {
  placeGeoid: string;
  rank: number;
  censusName: string;
  city: string;
  state: string;
  stateCode: string;
  population: number;
  marketKey: string;
  marketName: string;
  cohort: AffiliateCoverageCohort;
  populationWeight: number;
};

export type AffiliateCoverageCityCatalog = {
  schemaVersion: number;
  censusVintage: number;
  estimateDate: string;
  thresholdCity: string;
  thresholdPopulation: number;
  source: {
    workbookUrl: string;
    gazetteerUrl: string;
  };
  checksum: string;
  cities: AffiliateCoverageCity[];
};

const EXPECTED_SCHEMA_VERSION = 1;
const EXPECTED_CENSUS_VINTAGE = 2025;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const canonicalJson = (value: unknown): string => JSON.stringify(value);

const checksumFor = (value: Record<string, unknown>): string => {
  const { checksum: _checksum, ...withoutChecksum } = value;
  return createHash('sha256').update(canonicalJson(withoutChecksum)).digest('hex');
};

const assertString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Coverage catalog ${label} must be a non-empty string.`);
  return value;
};

const assertFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Coverage catalog ${label} must be a finite number.`);
  return value;
};

const parseCity = (value: unknown, index: number): AffiliateCoverageCity => {
  if (!isRecord(value)) throw new Error(`Coverage catalog city ${index + 1} must be an object.`);
  const cohort = assertString(value.cohort, `city ${index + 1} cohort`);
  if (!['WEST_COAST_CORE', 'WEST_COAST_EXPANSION', 'NATIONAL'].includes(cohort)) {
    throw new Error(`Coverage catalog city ${index + 1} has an invalid cohort.`);
  }
  return {
    placeGeoid: assertString(value.placeGeoid, `city ${index + 1} placeGeoid`),
    rank: assertFiniteNumber(value.rank, `city ${index + 1} rank`),
    censusName: assertString(value.censusName, `city ${index + 1} censusName`),
    city: assertString(value.city, `city ${index + 1} city`),
    state: assertString(value.state, `city ${index + 1} state`),
    stateCode: assertString(value.stateCode, `city ${index + 1} stateCode`),
    population: assertFiniteNumber(value.population, `city ${index + 1} population`),
    marketKey: assertString(value.marketKey, `city ${index + 1} marketKey`),
    marketName: assertString(value.marketName, `city ${index + 1} marketName`),
    cohort: cohort as AffiliateCoverageCohort,
    populationWeight: assertFiniteNumber(value.populationWeight, `city ${index + 1} populationWeight`),
  };
};

export const validateAffiliateCoverageCityCatalog = (input: unknown): AffiliateCoverageCityCatalog => {
  if (!isRecord(input)) throw new Error('Coverage catalog must be an object.');
  if (input.schemaVersion !== EXPECTED_SCHEMA_VERSION) throw new Error('Coverage catalog schema version is unsupported.');
  if (input.censusVintage !== EXPECTED_CENSUS_VINTAGE) throw new Error('Coverage catalog Census vintage must be 2025.');
  const thresholdCity = assertString(input.thresholdCity, 'thresholdCity');
  const thresholdPopulation = assertFiniteNumber(input.thresholdPopulation, 'thresholdPopulation');
  if (thresholdPopulation <= 0) throw new Error('Coverage catalog threshold population must be positive.');
  const citiesInput = input.cities;
  if (!Array.isArray(citiesInput)) throw new Error('Coverage catalog cities must be an array.');
  const cities = citiesInput.map(parseCity).sort((left, right) => left.rank - right.rank);
  if (cities.length === 0) throw new Error('Coverage catalog must contain at least one city.');
  if (assertString(input.checksum, 'checksum') !== checksumFor(input)) throw new Error('Coverage catalog checksum is invalid.');
  const ranks = new Set(cities.map((city) => city.rank));
  const placeGeoids = new Set(cities.map((city) => city.placeGeoid));
  if (
    ranks.size !== cities.length
    || cities.some((city, index) => city.rank !== index + 1)
  ) {
    throw new Error(`Coverage catalog ranks must contain each value from 1 through ${cities.length} exactly once.`);
  }
  if (placeGeoids.size !== cities.length) throw new Error('Coverage catalog place GEOIDs must be unique.');
  if (cities.some((city) => city.population < thresholdPopulation)) {
    throw new Error('Coverage catalog contains a city below the configured population threshold.');
  }
  if (cities.some((city) => !city.marketKey || !city.marketName || !city.cohort)) {
    throw new Error('Coverage catalog cities must have market and cohort assignments.');
  }
  const source = input.source;
  if (!isRecord(source)) throw new Error('Coverage catalog source metadata is missing.');
  return {
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    censusVintage: EXPECTED_CENSUS_VINTAGE,
    estimateDate: assertString(input.estimateDate, 'estimateDate'),
    thresholdCity,
    thresholdPopulation,
    source: {
      workbookUrl: assertString(source.workbookUrl, 'source workbookUrl'),
      gazetteerUrl: assertString(source.gazetteerUrl, 'source gazetteerUrl'),
    },
    checksum: assertString(input.checksum, 'checksum'),
    cities,
  };
};

let cachedCatalog: AffiliateCoverageCityCatalog | null = null;

export const loadAffiliateCoverageCityCatalog = (): AffiliateCoverageCityCatalog => {
  if (!cachedCatalog) cachedCatalog = validateAffiliateCoverageCityCatalog(catalogSnapshot);
  return cachedCatalog;
};

export const getAffiliateCoverageCatalogSummary = (catalog = loadAffiliateCoverageCityCatalog()) => ({
  schemaVersion: catalog.schemaVersion,
  censusVintage: catalog.censusVintage,
  thresholdCity: catalog.thresholdCity,
  thresholdPopulation: catalog.thresholdPopulation,
  cityCount: catalog.cities.length,
  westCoastCityCount: catalog.cities.filter((city) => city.cohort !== 'NATIONAL').length,
  marketCount: new Set(catalog.cities.map((city) => city.marketKey)).size,
  californiaCityCount: catalog.cities.filter((city) => city.stateCode === 'CA').length,
  oregonCityCount: catalog.cities.filter((city) => city.stateCode === 'OR').length,
  washingtonCityCount: catalog.cities.filter((city) => city.stateCode === 'WA').length,
});
