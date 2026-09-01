const LEGACY_RETIREMENT_MESSAGE =
  'Legacy affiliate launcher is paused pending governed cohort proof; use governed gateway admission.';

console.error(LEGACY_RETIREMENT_MESSAGE);
process.exit(78);

export const CODEX_AFFILIATE_APPROVAL_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_APPROVAL_SERVICE_TIER = null;
export const CODEX_AFFILIATE_APPROVAL_FAST_MODE = false;
export const CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH = 4_000;

export type CodexAffiliateApprovalGoalOptions = {
  repositoryRoot: string;
  useLiveApprovals: boolean;
  reviewerId: string;
  containerIsolated?: boolean;
};

export declare function buildCodexAffiliateApprovalObjective(
  options: CodexAffiliateApprovalGoalOptions,
): string;
export declare function buildCodexAffiliateApprovalGoal(
  options: CodexAffiliateApprovalGoalOptions,
): string;
export declare function buildCodexAffiliateApprovalArgs(
  options: CodexAffiliateApprovalGoalOptions,
): string[];
