/** @jest-environment node */

import { loadAffiliateCoverageCityCatalog } from '@/server/affiliateImports/coverageCityCatalog';
import { buildAffiliateCoverageInventory } from '@/server/affiliateImports/coverageInventory';

const catalog = loadAffiliateCoverageCityCatalog();
const portland = catalog.cities.find((city) => city.city === 'Portland' && city.stateCode === 'OR')!;
const seattle = catalog.cities.find((city) => city.city === 'Seattle' && city.stateCode === 'WA')!;
const sports = Array.from({ length: 14 }, (_, index) => ({
  id: `sport_${index + 1}`,
  name: `Sport ${index + 1}`,
}));
const soccer = sports[0];

const cellEvidence = {
  cityGeoid: portland.placeGeoid,
  sportId: soccer.id,
  sportName: soccer.name,
  profileKey: 'clubs-programs',
};

describe('affiliate coverage inventory', () => {
  it('builds the full 14-sport theoretical inventory and Pacific Coast subset', async () => {
    const inventory = await buildAffiliateCoverageInventory({}, {
      catalog,
      sports,
      includeAllCells: true,
    });

    expect(inventory.theoreticalCellCount).toBe(14_700);
    expect(inventory.rankedCells).toHaveLength(14_700);
    expect(inventory.rankedCells.filter((cell) => ['CA', 'OR', 'WA'].includes(cell.stateCode))).toHaveLength(3_332);
    expect(inventory.cityCount).toBe(150);
    expect(inventory.marketCount).toBe(129);
    expect(inventory.profileCount).toBe(7);
  });

  it('keeps direct evidence, pipeline blockers, exclusions, failed queries, and partial history distinct', async () => {
    const inventory = await buildAffiliateCoverageInventory({}, {
      catalog,
      sports,
      includeAllCells: true,
      now: new Date('2026-08-09T00:00:00.000Z'),
      results: [
        {
          ...cellEvidence,
          id: 'result-direct',
          status: 'NEW',
          policyKey: 'direct.example',
          matchingIntakeId: 'intake-direct',
          reasonDetails: { autoPromotionEligible: true },
        },
        {
          ...cellEvidence,
          id: 'result-unresolved',
          status: 'NEW',
          policyKey: 'unresolved.example',
          reasonDetails: { autoPromotionEligible: true },
        },
        {
          ...cellEvidence,
          profileKey: 'facilities-rentals',
          id: 'result-intermediary',
          status: 'NEW',
          policyKey: 'directory.example',
          reasonDetails: { classification: 'INTERMEDIARY' },
        },
        {
          ...cellEvidence,
          profileKey: 'facilities-rentals',
          id: 'result-rejected',
          status: 'REJECTED',
          policyKey: 'rejected.example',
        },
        {
          cityGeoid: seattle.placeGeoid,
          id: 'result-partial-history',
          status: 'REVIEW_REQUIRED',
          policyKey: 'historical.example',
        },
      ],
      intakes: [{
        ...cellEvidence,
        id: 'intake-approved',
        affiliateSourceId: 'source-approved',
        policyKey: 'approved.example',
      }],
      queryExecutions: [
        {
          ...cellEvidence,
          id: 'query-success',
          status: 'SUCCEEDED',
          strategyFamilyKey: 'operator-web',
          qualifiedPolicyKeys: ['direct.example'],
        },
        {
          ...cellEvidence,
          id: 'query-failed',
          status: 'FAILED',
          strategyFamilyKey: 'operator-web',
          qualifiedPolicyKeys: [],
          errorCode: 'HTTP_5XX',
        },
      ],
      failedIntakeRuns: [{
        ...cellEvidence,
        id: 'capture-excluded',
        status: 'EXCLUDED',
      }],
    });

    const clubs = inventory.rankedCells.find((cell) => (
      cell.placeGeoid === portland.placeGeoid
      && cell.sportId === soccer.id
      && cell.profileKey === 'clubs-programs'
    ));
    expect(clubs).toEqual(expect.objectContaining({
      directPolicyKeyCount: 2,
      approvedSourceCount: 1,
      unresolvedLeadCount: 1,
      failedCaptureCount: 0,
      evidenceQuality: 'EXACT',
      searchStatus: 'WAITING_FOR_PIPELINE',
    }));
    expect(clubs?.directPolicyKeys).toEqual(['approved.example', 'direct.example']);
    expect(clubs?.evidence).toEqual(expect.objectContaining({
      successfulQueryCount: 1,
      failedQueryCount: 1,
    }));

    const facilities = inventory.rankedCells.find((cell) => (
      cell.placeGeoid === portland.placeGeoid
      && cell.sportId === soccer.id
      && cell.profileKey === 'facilities-rentals'
    ));
    expect(facilities).toEqual(expect.objectContaining({
      directPolicyKeyCount: 0,
      approvedSourceCount: 0,
      evidenceQuality: 'PARTIAL_HISTORY',
      coverageStatus: 'GAP',
    }));

    const partial = inventory.rankedCells.find((cell) => (
      cell.placeGeoid === seattle.placeGeoid
      && cell.sportId === soccer.id
      && cell.profileKey === 'clubs-programs'
    ));
    expect(partial).toEqual(expect.objectContaining({
      directPolicyKeyCount: 0,
      evidenceQuality: 'PARTIAL_HISTORY',
      partialHistory: true,
    }));
    expect(inventory.partialHistoryCount).toBeGreaterThan(0);
  });
});
