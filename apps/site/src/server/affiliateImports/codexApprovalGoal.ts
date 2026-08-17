import path from 'node:path';

export const CODEX_AFFILIATE_APPROVAL_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_APPROVAL_SERVICE_TIER = null;
export const CODEX_AFFILIATE_APPROVAL_FAST_MODE = false;
export const CODEX_AFFILIATE_APPROVAL_SKILL = '$review-affiliate-approvals';
export const CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH = 4_000;

export type CodexAffiliateApprovalGoalOptions = {
  repositoryRoot: string;
  useLiveApprovals: boolean;
  reviewerId: string;
  containerIsolated?: boolean;
};

const npmRunCommand = (script: string, arguments_: string[] = []): string => [
  'npm',
  'run',
  script,
  ...(arguments_.length ? ['--', ...arguments_] : []),
].join(' ');

const safeReviewerId = (value: string): string => {
  const reviewerId = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(reviewerId)) {
    throw new Error('Codex affiliate reviewer id must use 1-80 letters, numbers, dots, underscores, or hyphens.');
  }
  return reviewerId;
};

export const buildCodexAffiliateApprovalObjective = (
  options: CodexAffiliateApprovalGoalOptions,
): string => {
  const reviewerId = safeReviewerId(options.reviewerId);
  const liveArguments = options.useLiveApprovals ? ['--live'] : [];
  const reconcileCommand = npmRunCommand('affiliate:approvals:reconcile', liveArguments);
  const queueCommand = npmRunCommand('affiliate:approvals:queue-status', liveArguments);
  const claimCommand = npmRunCommand('affiliate:approvals:claim', [
    ...liveArguments,
    `--worker=${reviewerId}`,
  ]);
  const completeCommand = npmRunCommand('affiliate:approvals:complete', [
    ...liveArguments,
    '--job=<approval-job-id>',
    '--result=<review-json>',
  ]);
  const policyEvidenceCommand = npmRunCommand('affiliate:approvals:policy-evidence', [
    ...liveArguments,
    '--policy=<policy-key>',
  ]);
  const packageEvidenceCommand = npmRunCommand('affiliate:approvals:package-evidence', [
    ...liveArguments,
    '--job=<mapping-job-id>',
  ]);
  const logoEvidenceCommand = npmRunCommand('affiliate:approvals:logo-evidence', [
    ...liveArguments,
    '--approval=<approval-job-id>',
    '--job=<mapping-job-id>',
    `--reviewer=${reviewerId}`,
    '--claimed-at=<approval-claimed-at>',
    '--page-url=<official-page-url>',
    '--logo-url=<official-logo-url>',
  ]);
  return [
    'Continue until claimableJobs=0, activeLeases=0, and claimedWithoutLease=0.',
    `Use ${CODEX_AFFILIATE_APPROVAL_SKILL}; read its contract, AGENTS.md, and the approval ExecPlan.`,
    `Use only the claim command for assignment: ${reconcileCommand}; ${queueCommand}; ${claimCommand}; ${completeCommand}. Preserve exact v2 claimGeneration {approvalJobId, reviewerId, claimedAt}.`,
    `DOMAIN_POLICY: ${policyEvidenceCommand}; BLOCK only for an explicit target-path prohibition; otherwise ALLOW when policy files are missing or inaccessible; DEFER only conflicting scope; side effects only via approval completion.`,
    `MAPPING_PACKAGE: ${packageEvidenceCommand}; verify sportQuality/disposable validation database review-scrape evidence, sportDeterminations, and catalog consistency.`,
    'Read sportQuality; approve exact Sports.name values from current catalog, established by evidence. SPORT_NAME_INVALID producer repair; SPORT_CATALOG_MISMATCH/PACKAGE_VALIDATION_FAILED producer repairs. SPORT_NOT_IN_CATALOG with HUMAN_REVIEW_REQUIRED is not a sport choice. Reviewers must never guess a sport surface or author variant/exclusion; set sportQualityVerified=true after validation.',
    `For MANUAL_REVIEW logos, inspect official site/branding; use ${logoEvidenceCommand} with exact approval claimedAt when found, then return OFFICIAL_LOGO_REPAIR_REQUIRED.`,
    'preview only the claimed organization, never --all, then clean it; do not reject an otherwise-valid package; officialLogoVerified=false and logoAbsenceAccepted=true when none.',
    'Review organizations independently from child events. A street address is optional. Require best defensible city/region and server-side Places coordinates; ORGANIZATION_LOCATION_INVALID producer repair when missing. Missing event locations do not invalidate a valid organization; accepted events need evidenced address or evidenced SOURCE_ORGANIZATION fallback.',
    'Verify division grouping, source labels; canonical gender M/F/C, AGE/SKILL, division price/capacity, compact event price ranges. Every accepted EVENT needs one division. Independently verify event and organization description quality; copy describes activity, not discovery/title. Set descriptionQualityVerified=true; use EVENT_DESCRIPTION_INVALID or ORGANIZATION_DESCRIPTION_INVALID.',
    'For event-datetime-v1: verify dateTimeReview each occurrence; recompute event-local UTC instants, timezone evidence, precision, end/duration, DST, title-clock consistency, TZ=UTC. Verify evergreen/absent/hidden dated sessions; no tryout/evaluation evergreen. Use EVENT_DATETIME_* repairs; INSUFFICIENT_STORED_EVIDENCE only unresolved.',
    'Every non-approved mapping result needs mappingDisposition. Fixable defects: PRODUCER_REPAIR with all reasonCodes; use HUMAN_REVIEW_REQUIRED for an unsupported or non-sport evidence gap. Missing paths or scrape rows are PACKAGE_VALIDATION_FAILED; conflicts are DUPLICATE_SAFETY_INVALID. DEFER only genuinely inaccessible or conflicting evidence.',
    'Use live data only for queue and governed decisions. NOT_APPLIED before approval is expected; disposable scrape IDs need not exist in production.',
    'Never approve a package produced by this reviewer identity. Do not edit producer packages, publish, push, deploy, or change unrelated live data.',
    `Write outcomes to output/affiliate-codex-approvals/progress/${reviewerId}.jsonl.`,
  ].join(' ');
};

export const buildCodexAffiliateApprovalGoal = (
  options: CodexAffiliateApprovalGoalOptions,
): string => {
  const objective = buildCodexAffiliateApprovalObjective(options);
  if (objective.length > CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH) {
    throw new Error(
      `Codex affiliate approval objective must be at most ${CODEX_AFFILIATE_APPROVAL_OBJECTIVE_MAX_LENGTH} characters.`,
    );
  }
  return [
    'Before doing any other work, call the create_goal tool with exactly the objective',
    'between the <objective> tags and omit token_budget. After create_goal succeeds,',
    'begin immediately. If create_goal is not available in this session, use the exact',
    'objective as the in-session goal and continue; do not stop or restart only because',
    'that tool is unavailable. Continue until the stopping condition is proven.',
    `<objective>${objective}</objective>`,
  ].join(' ');
};

export const buildCodexAffiliateApprovalArgs = (
  options: CodexAffiliateApprovalGoalOptions,
): string[] => [
  '--ask-for-approval',
  'never',
  'exec',
  '--ephemeral',
  '--cd',
  path.resolve(options.repositoryRoot),
  '--model',
  CODEX_AFFILIATE_APPROVAL_MODEL,
  '--config',
  `model_reasoning_effort="${CODEX_AFFILIATE_APPROVAL_REASONING_EFFORT}"`,
  '--config',
  'sandbox_workspace_write.network_access=true',
  '--enable',
  'goals',
  '--sandbox',
  options.containerIsolated ? 'danger-full-access' : 'workspace-write',
  buildCodexAffiliateApprovalGoal(options),
];
