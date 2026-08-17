/** @jest-environment node */

import {
  AFFILIATE_COVERAGE_COHORT_PRIORITY,
  calculateAffiliateCoverageGapSeverity,
  calculateAffiliateCoveragePriorityScore,
  compareAffiliateCoverageWork,
  requiredStrategyFamilyCountForPopulation,
  reviewIntervalDaysForPopulation,
} from '@/server/affiliateImports/coverageGapScoring';

describe('affiliate coverage gap scoring', () => {
  it('orders cohorts before population and then ranks equally weak cities by Census rank', () => {
    const portland = {
      cohort: 'WEST_COAST_CORE' as const,
      priorityScore: 0.25,
      censusRank: 28,
      marketKey: 'portland-vancouver',
      cityRank: 28,
      sportName: 'Soccer',
      profileKey: 'clubs-programs',
    };
    const seattle = { ...portland, censusRank: 18, cityRank: 18, marketKey: 'seattle-tacoma' };
    const losAngeles = {
      ...portland,
      cohort: 'WEST_COAST_EXPANSION' as const,
      priorityScore: 1,
      censusRank: 2,
      cityRank: 2,
      marketKey: 'greater-los-angeles',
    };
    expect(AFFILIATE_COVERAGE_COHORT_PRIORITY.WEST_COAST_CORE).toBeLessThan(
      AFFILIATE_COVERAGE_COHORT_PRIORITY.WEST_COAST_EXPANSION,
    );
    expect(compareAffiliateCoverageWork(portland, losAngeles)).toBeLessThan(0);
    expect(compareAffiliateCoverageWork(seattle, portland)).toBeLessThan(0);
  });

  it('uses bounded population bands and never a raw population ratio', () => {
    expect(reviewIntervalDaysForPopulation(1_000_000)).toBe(30);
    expect(reviewIntervalDaysForPopulation(500_000)).toBe(45);
    expect(reviewIntervalDaysForPopulation(250_000)).toBe(60);
    expect(reviewIntervalDaysForPopulation(178_618)).toBe(90);
    expect(requiredStrategyFamilyCountForPopulation(500_000)).toBe(3);
    expect(requiredStrategyFamilyCountForPopulation(499_999)).toBe(2);
    expect(calculateAffiliateCoveragePriorityScore({
      populationWeight: 0.85,
      gapSeverity: 1,
      profileWeight: 1,
      stalenessWeight: 1,
    })).toBe(0.85);
    expect(calculateAffiliateCoveragePriorityScore({
      populationWeight: 1,
      gapSeverity: 1,
      profileWeight: 1,
      stalenessWeight: 1,
    })).toBe(1);
  });

  it('separates no evidence, weak evidence, and a met coverage contract', () => {
    expect(calculateAffiliateCoverageGapSeverity({ qualifiedDirectPolicyKeyCount: 0 })).toBe(1);
    expect(calculateAffiliateCoverageGapSeverity({
      qualifiedDirectPolicyKeyCount: 1,
      approvedSourceCount: 1,
      strategyFamilyCount: 1,
    })).toBe(0.75);
    expect(calculateAffiliateCoverageGapSeverity({
      qualifiedDirectPolicyKeyCount: 1,
      approvedSourceCount: 3,
      strategyFamilyCount: 3,
      coverageContractMet: true,
    })).toBe(0);
  });
});
