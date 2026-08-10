/** @jest-environment node */

import { createHash } from 'node:crypto';

import {
  getAffiliateCoverageCatalogSummary,
  loadAffiliateCoverageCityCatalog,
  validateAffiliateCoverageCityCatalog,
} from '@/server/affiliateImports/coverageCityCatalog';
import {
  AFFILIATE_COVERAGE_CAMPAIGN_TEMPLATES,
  US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES,
} from '@/server/affiliateImports/sourceDiscoveryCampaignTemplates';

describe('affiliate coverage city catalog', () => {
  const catalog = loadAffiliateCoverageCityCatalog();

  it('loads the verified 150-city Census scope and boundary rows', () => {
    const summary = getAffiliateCoverageCatalogSummary(catalog);
    expect(summary).toEqual(expect.objectContaining({
      censusVintage: 2025,
      thresholdCity: 'Eugene, Oregon',
      thresholdPopulation: 178618,
      cityCount: 150,
      westCoastCityCount: 34,
      marketCount: 129,
      californiaCityCount: 27,
      oregonCityCount: 3,
      washingtonCityCount: 4,
    }));
    expect(catalog.cities.at(-1)).toEqual(expect.objectContaining({
      rank: 150,
      city: 'Eugene',
      stateCode: 'OR',
      population: 178618,
    }));
    expect(catalog.cities.find((city) => city.city === 'Salem' && city.stateCode === 'OR')).toEqual(expect.objectContaining({
      rank: 147,
      population: 181779,
    }));
  });

  it('uses the numeric population threshold instead of named boundary cities', () => {
    const candidate = { ...catalog, thresholdPopulation: 200000 };
    const unsigned = { ...candidate };
    delete (unsigned as Record<string, unknown>).checksum;
    const invalid = {
      ...candidate,
      checksum: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'),
    };
    expect(() => validateAffiliateCoverageCityCatalog(invalid)).toThrow(
      'Coverage catalog contains a city below the configured population threshold.',
    );
  });

  it('keeps every place GEOID unique and assigns stable markets', () => {
    expect(new Set(catalog.cities.map((city) => city.placeGeoid)).size).toBe(150);
    expect(catalog.cities.find((city) => city.city === 'Portland' && city.stateCode === 'OR')).toEqual(expect.objectContaining({
      marketKey: 'portland-vancouver',
      cohort: 'WEST_COAST_CORE',
    }));
    expect(catalog.cities.find((city) => city.city === 'Seattle' && city.stateCode === 'WA')).toEqual(expect.objectContaining({
      marketKey: 'seattle-tacoma',
      cohort: 'WEST_COAST_CORE',
    }));
  });

  it('derives complete templates while preserving the original top-50 city coverage', () => {
    const covered = new Set(AFFILIATE_COVERAGE_CAMPAIGN_TEMPLATES.flatMap((template) => (
      template.coveredCities.map((city) => city.rank)
    )));
    expect(AFFILIATE_COVERAGE_CAMPAIGN_TEMPLATES).toHaveLength(129);
    expect(covered.size).toBe(150);
    expect([...covered].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 150 }, (_, index) => index + 1),
    );
    const compatibilityCovered = new Set(US_CITY_DISCOVERY_CAMPAIGN_TEMPLATES.flatMap((template) => (
      template.coveredCities.map((city) => city.rank)
    )));
    expect(compatibilityCovered).toEqual(new Set(Array.from({ length: 50 }, (_, index) => index + 1)));
  });
});
