/** @jest-environment node */

import {
  BLACKLISTED_AFFILIATE_SPORT_NAMES,
  affiliateAgentCanonicalSportNames,
  assertAffiliateSourceDraftSports,
  collectAffiliateAgentSportIssues,
  isAffiliateSportBlacklisted,
  validateAffiliateAgentSportName,
} from '../affiliateSportMapping';

describe('affiliate sport mapping policy', () => {
  const injectedCatalog = [
    'Field Hockey',
    'Lacrosse',
    'Table Tennis',
    'Australian Football',
    'Ball Hockey',
    'Futsal',
    'Injected Surface Sport',
  ] as const;

  it('uses the injected catalog rather than compiled defaults', () => {
    expect(validateAffiliateAgentSportName('Injected Surface Sport', 'sportName', injectedCatalog)).toBeNull();
    expect(validateAffiliateAgentSportName('Futsal', 'sportName', ['Soccer'])).toEqual(expect.objectContaining({
      code: 'SPORT_NOT_IN_CATALOG',
      sportName: 'Futsal',
      canonicalSuggestion: null,
    }));
  });

  it('returns exact-case suggestions from the injected catalog', () => {
    expect(validateAffiliateAgentSportName('futsal', 'sportName', injectedCatalog)).toEqual({
      path: 'sportName',
      sportName: 'futsal',
      canonicalSuggestion: 'Futsal',
      code: 'SPORT_NAME_NOT_CANONICAL',
      message: 'Use the exact canonical sport name Futsal.',
    });
  });

  it('requires a nonblank sport name', () => {
    expect(validateAffiliateAgentSportName('  ', 'sportName', injectedCatalog)).toEqual({
      path: 'sportName',
      sportName: null,
      canonicalSuggestion: null,
      code: 'SPORT_NAME_REQUIRED',
      message: 'Executable affiliate mappings require an exact canonical sport name.',
    });
  });

  it.each(BLACKLISTED_AFFILIATE_SPORT_NAMES)('blacklists %s independently of catalog membership', (sportName) => {
    expect(isAffiliateSportBlacklisted(sportName)).toBe(true);
    expect(validateAffiliateAgentSportName(sportName, 'sportName', [
      ...injectedCatalog,
      sportName,
    ])).toEqual(expect.objectContaining({
      code: 'SPORT_BLACKLISTED',
      sportName,
      canonicalSuggestion: null,
      message: expect.stringContaining('blacklisted'),
    }));
  });

  it('keeps Track and Field blacklisted when an injected catalog also contains it', () => {
    expect(validateAffiliateAgentSportName(
      'Track and Field',
      'sportName',
      ['Grass Soccer', 'Track and Field'],
    )).toEqual(expect.objectContaining({
      code: 'SPORT_BLACKLISTED',
      canonicalSuggestion: null,
    }));
  });

  it('does not broaden blacklist matching beyond the exact source label', () => {
    expect(isAffiliateSportBlacklisted('Track and Field program')).toBe(false);
    expect(validateAffiliateAgentSportName(
      'Track and Field program',
      'sportName',
      injectedCatalog,
    )).toEqual(expect.objectContaining({
      code: 'SPORT_NOT_IN_CATALOG',
      canonicalSuggestion: null,
    }));
  });

  it('sorts and de-duplicates the injected names for canonical suggestions', () => {
    expect(affiliateAgentCanonicalSportNames(['Zoo', 'Alpha', 'Zoo', ' Beta '])).toEqual([
      'Alpha',
      'Beta',
      'Zoo',
    ]);
  });

  it('collects every executable sport field against the injected catalog', () => {
    const issues = collectAffiliateAgentSportIssues({
      implementationMode: 'GENERIC_MAPPING',
      expectedCandidates: [{ sportName: 'Missing Sport' }],
      mapping: {
        manualCandidates: [{ sportNames: ['Injected Surface Sport', 'futsal'] }],
        fields: {
          sportName: { mode: 'literal', value: 'futsal' },
          sportNames: { mode: 'literal', value: 'Injected Surface Sport|Missing Sport' },
        },
      },
    }, injectedCatalog);

    expect(issues).toEqual([
      expect.objectContaining({
        path: 'expectedCandidates.0.sportName',
        code: 'SPORT_NOT_IN_CATALOG',
      }),
      expect.objectContaining({
        path: 'mapping.manualCandidates.0.sportNames.1',
        code: 'SPORT_NAME_NOT_CANONICAL',
      }),
      expect.objectContaining({
        path: 'mapping.fields.sportName.value',
        code: 'SPORT_NAME_NOT_CANONICAL',
      }),
      expect.objectContaining({
        path: 'mapping.fields.sportNames.value.1',
        code: 'SPORT_NOT_IN_CATALOG',
      }),
    ]);
  });

  it('asserts injected catalog issues only at executable boundaries', () => {
    expect(() => assertAffiliateSourceDraftSports({
      implementationMode: 'GENERIC_MAPPING',
      expectedCandidates: [{ sportName: 'Missing Sport' }],
    }, injectedCatalog)).toThrow('expectedCandidates.0.sportName');

    expect(() => assertAffiliateSourceDraftSports({
      implementationMode: 'REFUSAL',
      expectedCandidates: [{ sportName: 'Missing Sport' }],
    }, injectedCatalog)).not.toThrow();
  });

  it('does not inspect sport fields for non-executable drafts', () => {
    expect(collectAffiliateAgentSportIssues({
      implementationMode: 'REFUSAL',
      expectedCandidates: [{ sportName: 'Missing Sport' }],
    }, injectedCatalog)).toEqual([]);
  });
});
