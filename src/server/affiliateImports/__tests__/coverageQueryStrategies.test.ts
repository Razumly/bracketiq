/** @jest-environment node */

import {
  AFFILIATE_COVERAGE_QUERY_STRATEGIES,
  AFFILIATE_COVERAGE_QUERY_STRATEGY_VERSION,
  allowedStrategiesForProfile,
  getAffiliateCoverageQueryStrategy,
  renderAffiliateCoverageQuery,
} from '@/server/affiliateImports/coverageQueryStrategies';
import { generateAffiliateSourceDiscoveryQueries } from '@/server/affiliateImports/sourceDiscoveryRules';

describe('affiliate coverage query strategies', () => {
  it('exposes only registered governed strategies for each profile', () => {
    expect(AFFILIATE_COVERAGE_QUERY_STRATEGY_VERSION).toBe(1);
    expect(AFFILIATE_COVERAGE_QUERY_STRATEGIES).toHaveLength(5);
    expect(getAffiliateCoverageQueryStrategy('not-registered')).toBeNull();
    expect(allowedStrategiesForProfile('league-operators').map((strategy) => strategy.key)).toEqual([
      'operator-web-v1',
      'governing-association-directory-v1',
      'registration-platform-v1',
    ]);
    expect(allowedStrategiesForProfile('facilities-rentals').map((strategy) => strategy.key)).toEqual([
      'operator-web-v1',
      'public-recreation-v1',
      'facility-booking-v1',
    ]);
  });

  it('renders deterministic city, sport, profile, strategy, and family fields', () => {
    const strategy = getAffiliateCoverageQueryStrategy('operator-web-v1')!;
    const query = renderAffiliateCoverageQuery({
      cityGeoid: '41060',
      city: 'Portland',
      state: 'Oregon',
      sportId: 'sport_soccer',
      sportName: 'Soccer',
      profileKey: 'league-operators',
      sourceType: 'LEAGUE',
    }, strategy);
    expect(query).toEqual(expect.objectContaining({
      query: 'Portland, Oregon Soccer league operator leagues registration association official organization operator',
      cityGeoid: '41060',
      sportId: 'sport_soccer',
      profileKey: 'league-operators',
      strategyKey: 'operator-web-v1',
      strategyFamilyKey: 'operator-web',
      sourceType: 'LEAGUE',
    }));
  });

  it('rejects forged strategy text and disallowed profile pairs', () => {
    const registered = getAffiliateCoverageQueryStrategy('operator-web-v1')!;
    expect(() => renderAffiliateCoverageQuery({
      cityGeoid: '41060', city: 'Portland', state: 'Oregon', sportId: null, sportName: null,
      profileKey: 'league-operators', sourceType: 'LEAGUE',
    }, { ...registered, queryTerms: 'arbitrary provider query text' })).toThrow('registered governed strategy');
    expect(() => renderAffiliateCoverageQuery({
      cityGeoid: '41060', city: 'Portland', state: 'Oregon', sportId: null, sportName: null,
      profileKey: 'facilities-rentals', sourceType: 'RENTAL',
    }, getAffiliateCoverageQueryStrategy('governing-association-directory-v1')!)).toThrow('not allowed');
  });

  it('limits focused generation to the selected cell and registered strategy', () => {
    const generated = generateAffiliateSourceDiscoveryQueries({
      id: 'focused',
      name: 'Portland league operators',
      region: 'Portland, Oregon',
      location: 'Portland, Oregon',
      sportIds: ['sport_soccer', 'sport_basketball'],
      sourceTypeHints: ['LEAGUE'],
      maxQueriesPerRun: 10,
      maxResultsPerQuery: 10,
      metadata: {
        coverageTargetCells: [{
          cellId: '41060:sport_soccer:league-operators',
          cityGeoid: '41060',
          city: 'Portland',
          state: 'Oregon',
          sportId: 'sport_soccer',
          sportName: 'Soccer',
          profileKey: 'league-operators',
          sourceType: 'LEAGUE',
        }],
        coverageStrategyKeys: ['operator-web-v1'],
      },
    }, [
      { id: 'sport_soccer', name: 'Soccer' },
      { id: 'sport_basketball', name: 'Basketball' },
    ]);
    expect(generated.nextCursor).toBe(0);
    expect(generated.queries).toHaveLength(1);
    expect(generated.queries[0]).toEqual(expect.objectContaining({
      cityGeoid: '41060',
      sportId: 'sport_soccer',
      profileKey: 'league-operators',
      strategyKey: 'operator-web-v1',
    }));
    expect(generated.queries[0].query).not.toContain('Basketball');
  });
});
