/** @jest-environment node */

import {
  buildAffiliateSportsCatalogSnapshot,
} from '../affiliateSportsCatalog';
import {
  analyzeAffiliateSportQuality,
  inspectAffiliateSportQuality,
} from '../sportQuality';

const catalog = [
  { id: 'Beach Volleyball', name: 'Beach Volleyball' },
  { id: 'Grass Volleyball', name: 'Grass Volleyball' },
  { id: 'Indoor Volleyball', name: 'Indoor Volleyball' },
];

const candidate = (sportName: string | null) => ({
  id: 'candidate-1',
  listingKind: 'EVENT',
  title: 'Summer Program',
  sportName,
});

const organization = (sports: string[]) => ({
  id: 'organization-1',
  name: 'Example Club',
  sports,
});

describe('affiliate sport quality', () => {
  it('accepts exact candidate and organization catalog names', () => {
    expect(analyzeAffiliateSportQuality({
      candidates: [candidate('Indoor Volleyball')],
      organization: organization(['Indoor Volleyball']),
      catalog,
    })).toEqual(expect.objectContaining({
      passed: true,
      issueCount: 0,
      unsupportedSportNames: [],
    }));
  });

  it.each(['Volleyball', 'Soccer', 'Badminton'])(
    'routes unsupported source sport %s to catalog review',
    (sportName) => {
      const result = analyzeAffiliateSportQuality({
        candidates: [candidate(sportName)],
        organization: organization([sportName]),
        catalog,
      });
      expect(result.passed).toBe(false);
      expect(result.unsupportedSportNames).toEqual([sportName]);
      expect(result.issues.every((issue) => issue.code === 'SPORT_NOT_IN_CATALOG')).toBe(true);
    },
  );

  it('routes blacklisted sports to exclusion review even when the source label is exact', () => {
    const result = analyzeAffiliateSportQuality({
      candidates: [candidate('Track and Field')],
      organization: organization(['Track and Field']),
      catalog: [...catalog, { id: 'Track and Field', name: 'Track and Field' }],
    });
    expect(result.passed).toBe(false);
    expect(result.unsupportedSportNames).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SPORT_BLACKLISTED',
        sportName: 'Track and Field',
        canonicalSuggestion: null,
        message: expect.stringContaining('blacklisted'),
      }),
    ]));
  });

  it('reports a deterministic repair when only canonical spelling or casing is wrong', () => {
    const result = analyzeAffiliateSportQuality({
      candidates: [candidate('indoor volleyball')],
      organization: organization(['Indoor Volleyball']),
      catalog,
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'SPORT_NAME_NOT_CANONICAL',
        sportName: 'indoor volleyball',
        canonicalSuggestion: 'Indoor Volleyball',
      }),
    ]);
  });

  it('requires a sport for every candidate and source organization', () => {
    const result = analyzeAffiliateSportQuality({
      candidates: [candidate(null)],
      organization: organization([]),
      catalog,
    });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'SPORT_NAME_REQUIRED',
      'SPORT_NAME_REQUIRED',
    ]);
  });

  it('reads candidates, the source organization, and the current catalog from one database', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [candidate('Indoor Volleyball')] })
      .mockResolvedValueOnce({ rows: [organization(['Indoor Volleyball'])] })
      .mockResolvedValueOnce({ rows: catalog });

    await expect(inspectAffiliateSportQuality({
      queryable: { query },
      sourceId: 'source-1',
    })).resolves.toEqual(expect.objectContaining({ passed: true }));
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][1]).toEqual(['source-1']);
    expect(query.mock.calls[1][1]).toEqual(['source-1']);
  });
  it('validates against the injected claim catalog without querying disposable Sports', async () => {
    const snapshot = buildAffiliateSportsCatalogSnapshot([
      { id: 'fresh-1', name: 'New Surface Sport' },
    ], '2026-08-10T00:00:00.000Z');
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [candidate('New Surface Sport')] })
      .mockResolvedValueOnce({ rows: [organization(['New Surface Sport'])] });

    const result = await inspectAffiliateSportQuality({
      queryable: { query },
      sourceId: 'source-1',
      catalogSnapshot: snapshot,
      catalogSha256: snapshot.sha256,
    });

    expect(result).toEqual(expect.objectContaining({
      passed: true,
      catalogSha256: snapshot.sha256,
      catalogHashMatched: true,
      expectedSportNames: [],
      observedSportNames: ['New Surface Sport'],
    }));
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([text]) => !String(text).includes('FROM "Sports"'))).toBe(true);
  });
});
