import type { AffiliateCoverageCohort } from './coverageCityCatalog';

export const AFFILIATE_COVERAGE_COHORT_PRIORITY: Record<AffiliateCoverageCohort, number> = {
  WEST_COAST_CORE: 0,
  WEST_COAST_EXPANSION: 1,
  NATIONAL: 2,
};

export type AffiliateCoverageEvidence = {
  qualifiedDirectPolicyKeyCount: number;
  approvedSourceCount?: number;
  strategyFamilyCount?: number;
  evidenceQuality?: 'EXACT' | 'PARTIAL_HISTORY' | 'NO_EVIDENCE';
  stale?: boolean;
  coverageContractMet?: boolean;
};

export type AffiliateCoverageWorkForSort = {
  cohort: AffiliateCoverageCohort;
  priorityScore: number;
  censusRank: number;
  marketKey: string;
  cityRank: number;
  sportName: string;
  profileKey: string;
};

const roundSix = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export const calculateAffiliateCoverageGapSeverity = (evidence: AffiliateCoverageEvidence): number => {
  if (evidence.coverageContractMet) return 0;
  if (evidence.qualifiedDirectPolicyKeyCount === 0) return 1;
  if ((evidence.approvedSourceCount ?? 0) <= 1 || (evidence.strategyFamilyCount ?? 0) <= 1) return 0.75;
  if (evidence.stale || evidence.evidenceQuality === 'PARTIAL_HISTORY') return 0.5;
  return 0.5;
};

export const calculateAffiliateCoverageStalenessWeight = (input: {
  lastAssessedAt?: Date | null;
  nextReviewAt?: Date | null;
  reviewIntervalDays: number;
  now?: Date;
}): number => {
  const now = input.now ?? new Date();
  if (!input.lastAssessedAt || !input.nextReviewAt) return 1;
  if (input.nextReviewAt.getTime() > now.getTime()) return 0;
  const overdueMs = Math.max(0, now.getTime() - input.nextReviewAt.getTime());
  const intervalMs = Math.max(1, input.reviewIntervalDays * 86_400_000);
  return roundSix(1 + Math.min(0.5, overdueMs / intervalMs * 0.5));
};

export const calculateAffiliateCoveragePriorityScore = (components: {
  populationWeight: number;
  gapSeverity: number;
  profileWeight: number;
  stalenessWeight: number;
}): number => roundSix(
  components.populationWeight
  * components.gapSeverity
  * components.profileWeight
  * components.stalenessWeight,
);

export const reviewIntervalDaysForPopulation = (population: number): number => {
  if (population >= 1_000_000) return 30;
  if (population >= 500_000) return 45;
  if (population >= 250_000) return 60;
  return 90;
};

export const requiredStrategyFamilyCountForPopulation = (population: number): number => (
  population >= 500_000 ? 3 : 2
);

export const compareAffiliateCoverageWork = (
  left: AffiliateCoverageWorkForSort,
  right: AffiliateCoverageWorkForSort,
): number => (
  AFFILIATE_COVERAGE_COHORT_PRIORITY[left.cohort] - AFFILIATE_COVERAGE_COHORT_PRIORITY[right.cohort]
  || right.priorityScore - left.priorityScore
  || left.censusRank - right.censusRank
  || left.marketKey.localeCompare(right.marketKey)
  || left.cityRank - right.cityRank
  || left.sportName.localeCompare(right.sportName)
  || left.profileKey.localeCompare(right.profileKey)
);

export const populationWeightForPopulation = (population: number): number => {
  if (population >= 1_000_000) return 1;
  if (population >= 500_000) return 0.85;
  if (population >= 250_000) return 0.7;
  return 0.55;
};
