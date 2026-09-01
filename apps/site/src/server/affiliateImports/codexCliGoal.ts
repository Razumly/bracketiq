const LEGACY_RETIREMENT_MESSAGE =
  'Legacy affiliate launcher is paused pending governed cohort proof; use governed gateway admission.';

console.error(LEGACY_RETIREMENT_MESSAGE);
process.exit(78);

export const CODEX_AFFILIATE_INGESTION_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_INGESTION_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_INGESTION_SERVICE_TIER = null;
export const CODEX_AFFILIATE_INGESTION_FAST_MODE = false;

export type CodexAffiliateGoalOptions = {
  repositoryRoot: string;
  useLiveIntakes: boolean;
  workerId: string;
  containerIsolated?: boolean;
};

export declare function buildCodexAffiliateIngestionObjective(
  options: CodexAffiliateGoalOptions,
): string;
export declare function buildCodexAffiliateIngestionGoal(
  options: CodexAffiliateGoalOptions,
): string;
export declare function buildCodexAffiliateIngestionArgs(
  options: CodexAffiliateGoalOptions,
): string[];
