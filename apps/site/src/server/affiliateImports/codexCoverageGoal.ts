const LEGACY_RETIREMENT_MESSAGE =
  'Legacy affiliate launcher is paused pending governed cohort proof; use governed gateway admission.';

console.error(LEGACY_RETIREMENT_MESSAGE);
process.exit(78);

export const CODEX_AFFILIATE_COVERAGE_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_COVERAGE_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_COVERAGE_SERVICE_TIER = null;
export const CODEX_AFFILIATE_COVERAGE_FAST_MODE = false;
export const CODEX_AFFILIATE_COVERAGE_OBJECTIVE_MAX_LENGTH = 4_000;

export type CodexAffiliateCoverageGoalOptions = {
  repositoryRoot: string;
  useLiveCoverage: boolean;
  agentId: string;
  containerIsolated?: boolean;
};

export declare function buildCodexAffiliateCoverageObjective(
  options: CodexAffiliateCoverageGoalOptions,
): string;
export declare function buildCodexAffiliateCoverageGoal(
  options: CodexAffiliateCoverageGoalOptions,
): string;
export declare function buildCodexAffiliateCoverageArgs(
  options: CodexAffiliateCoverageGoalOptions,
): string[];
