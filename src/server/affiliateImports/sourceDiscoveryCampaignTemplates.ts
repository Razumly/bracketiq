import { loadAffiliateCoverageCityCatalog } from './coverageCityCatalog';
import type { AffiliateCoverageCity } from './coverageCityCatalog';

export type AffiliateSourceDiscoveryCampaignTemplate = {
  priorityRank: number;
  marketKey: string;
  name: string;
  region: string;
  location: string;
  anchorCity: string;
  anchorState: string;
  anchorPopulation: number;
  coveredCities: Array<{
    rank: number;
    city: string;
    state: string;
    population: number;
  }>;
};

export const US_CITY_DISCOVERY_QUERY_STRATEGY_VERSION = 5;

const MARKET_OVERRIDES: Record<string, Partial<Pick<
  AffiliateSourceDiscoveryCampaignTemplate,
  'name' | 'region' | 'location'
>>> = {
  'greater-los-angeles': {
    name: 'Los Angeles Metro Sports Sources',
    region: 'Greater Los Angeles, California',
    location: 'Los Angeles, California',
  },
  'dallas-fort-worth': {
    name: 'Dallas-Fort Worth Metro Sports Sources',
    region: 'Dallas-Fort Worth metropolitan area, Texas',
    location: 'Dallas, Texas',
  },
  'san-francisco-bay': {
    name: 'San Francisco Bay Area Sports Sources',
    region: 'San Francisco Bay Area, California',
    location: 'San Francisco, California',
  },
  'washington-dc': {
    name: 'Washington DC Metro Sports Sources',
    region: 'Washington, DC metropolitan area',
    location: 'Washington, DC',
  },
  'portland-vancouver': {
    name: 'Portland Metro Sports Sources',
    region: 'Portland, Oregon metropolitan area',
    location: 'Portland, Oregon',
  },
  'hampton-roads': {
    name: 'Hampton Roads Metro Sports Sources',
    region: 'Hampton Roads metropolitan area, Virginia',
    location: 'Virginia Beach, Virginia',
  },
  'minneapolis-st-paul': {
    name: 'Minneapolis-St. Paul Metro Sports Sources',
    region: 'Minneapolis-St. Paul metropolitan area, Minnesota',
    location: 'Minneapolis, Minnesota',
  },
};

const buildTemplate = (
  marketKey: string,
  cities: AffiliateCoverageCity[],
): AffiliateSourceDiscoveryCampaignTemplate => {
  const orderedCities = [...cities].sort((left, right) => left.rank - right.rank);
  const anchor = orderedCities[0];
  const override = MARKET_OVERRIDES[marketKey] ?? {};
  const defaultName = cities[0].marketName;
  return {
    priorityRank: anchor.rank,
    marketKey,
    name: override.name ?? defaultName,
    region: override.region ?? `${anchor.city}, ${anchor.state} metropolitan area`,
    location: override.location ?? `${anchor.city}, ${anchor.state}`,
    anchorCity: anchor.city,
    anchorState: anchor.state,
    anchorPopulation: anchor.population,
    coveredCities: orderedCities.map((city) => ({
      rank: city.rank,
      city: city.city,
      state: city.state,
      population: city.population,
    })),
  };
};

const catalog = loadAffiliateCoverageCityCatalog();
const citiesByMarket = catalog.cities.reduce<Record<string, AffiliateCoverageCity[]>>((markets, city) => ({
  ...markets,
  [city.marketKey]: [...(markets[city.marketKey] ?? []), city],
}), {});

export const AFFILIATE_COVERAGE_CAMPAIGN_TEMPLATES: AffiliateSourceDiscoveryCampaignTemplate[] = Object.entries(citiesByMarket)
  .map(([marketKey, cities]) => buildTemplate(marketKey, cities))
  .sort((left, right) => left.priorityRank - right.priorityRank);

// Compatibility export for the original top-50 setup command. The complete
// catalog is available through AFFILIATE_COVERAGE_CAMPAIGN_TEMPLATES; trim
// shared metros so the compatibility export covers exactly ranks 1-50.
export const US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES = AFFILIATE_COVERAGE_CAMPAIGN_TEMPLATES
  .map((template) => ({
    ...template,
    coveredCities: template.coveredCities.filter((city) => city.rank <= 50),
  }))
  .filter((template) => template.priorityRank <= 50 && template.coveredCities.length > 0);

export const CENSUS_CITY_CAMPAIGN_SOURCE = {
  vintage: 2025,
  estimateDate: '2025-07-01',
  sourceUrl: 'https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-cities-and-towns.html',
} as const;
