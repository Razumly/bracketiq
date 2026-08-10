import path from 'node:path';

export const CODEX_AFFILIATE_COVERAGE_MODEL = 'gpt-5.6-luna';
export const CODEX_AFFILIATE_COVERAGE_REASONING_EFFORT = 'max';
export const CODEX_AFFILIATE_COVERAGE_SERVICE_TIER = null;
export const CODEX_AFFILIATE_COVERAGE_FAST_MODE = false;
export const CODEX_AFFILIATE_COVERAGE_SKILL = '$plan-affiliate-discovery-campaigns';
export const CODEX_AFFILIATE_COVERAGE_OBJECTIVE_MAX_LENGTH = 4_000;

export type CodexAffiliateCoverageGoalOptions = {
  repositoryRoot: string;
  useLiveCoverage: boolean;
  agentId: string;
  containerIsolated?: boolean;
};

const npmRunCommand = (script: string, arguments_: string[] = []): string => [
  'npm',
  'run',
  script,
  ...(arguments_.length ? ['--', ...arguments_] : []),
].join(' ');

const safeAgentId = (value: string): string => {
  const agentId = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(agentId)) {
    throw new Error('Codex affiliate coverage agent id must use 1-80 letters, numbers, dots, underscores, or hyphens.');
  }
  return agentId;
};

export const buildCodexAffiliateCoverageObjective = (
  options: CodexAffiliateCoverageGoalOptions,
): string => {
  const agentId = safeAgentId(options.agentId);
  const liveArguments = options.useLiveCoverage ? ['--live'] : [];
  const reconcileCommand = npmRunCommand('affiliate:coverage:reconcile', liveArguments);
  const queueCommand = npmRunCommand('affiliate:coverage:queue-status', liveArguments);
  const claimCommand = npmRunCommand('affiliate:coverage:claim', [
    ...liveArguments,
    `--worker=${agentId}`,
  ]);
  const createCampaignCommand = npmRunCommand('affiliate:coverage:create-campaign', [
    ...liveArguments,
    '--input=<campaign-proposal-json>',
  ]);
  const manualEvidenceCommand = npmRunCommand('affiliate:coverage:manual-evidence', [
    ...liveArguments,
    '--input=<manual-evidence-json>',
  ]);
  const completeCommand = npmRunCommand('affiliate:coverage:complete', [
    ...liveArguments,
    '--result=<coverage-result-json>',
  ]);
  const intakeExportCommand = npmRunCommand('affiliate:intake:export', [
    ...liveArguments,
    '--source-key=<source-key>',
    '--run-id=<failed-run-id>',
  ]);
  const runCampaignCommand = npmRunCommand('affiliate:discovery:run', [
    ...liveArguments,
    '--campaign=<campaign-id>',
    '--max-queries=10',
    '--max-results=10',
    '--summary',
  ]);
  const queryPreviewCommand = npmRunCommand('affiliate:coverage:query-preview', [
    ...liveArguments,
    '--campaign=<campaign-id>',
  ]);
  return [
    'Drain the eligible ranked BracketIQ affiliate coverage queue until claimableJobs=0,',
    'activeLeases=0, and claimedWithoutLease=0. Saturated cells may be due for later review.',
    `Use ${CODEX_AFFILIATE_COVERAGE_SKILL}; read its SKILL.md, completion contract,`,
    'AGENTS.md, and docs/affiliate-coverage-agent-execplan.md before acting.',
    `Use agent id ${agentId}. Reconcile with ${reconcileCommand}.`,
    `Inspect inventory and query preview with ${queryPreviewCommand}.`,
    `Check progress with ${queueCommand} and claim one job with ${claimCommand}.`,
    'Carry unchanged claimGeneration {jobId,agentId,claimedAt} from claim output into every action; lease is the boundary.',
    'For MARKET_COVERAGE, inspect selected cell IDs, prior strategy families, query',
    'executions, linked policy keys, unresolved leads, marginal yield, and pipeline blockers.',
    'Keep league operators and tournament hosts separate coverage paths.',
    'Review-only intermediary leads do not block coverage.',
    'Use only governed strategy keys. When evidence shows a gap, write a schema-version-1',
    'proposal for one through twenty eligible cells and one through three allowed strategies.',
    `Preview it with ${queryPreviewCommand}, create it with ${createCampaignCommand}, and run`,
    `each created campaign through ${runCampaignCommand}; never call the provider outside that runner.`,
    'Complete CAMPAIGNS_CREATED to return the same market job to the queue and continue.',
    'Use COVERED only when the persisted cell contract is met. Use WAITING_FOR_PIPELINE only',
    'for current unresolved automatically promotable leads. Use SATURATED_NO_YIELD only after',
    'two zero-yield cycles with different governed strategies, required families, successful',
    'terminal queries, no unresolved leads, no active capture failures, and a current strategy version.',
    'Saturation preserves GAP coverage and sets a future review date; it is not coverage.',
    'For FAILED_INTAKE_CAPTURE, export stored evidence first with',
    `${intakeExportCommand}. Inspect the stored failure before one bounded manual public-page`,
    'pass. Do not bypass explicit robots prohibitions,',
    'authentication, CAPTCHA, access controls, or login-only pages. If the public page is',
    'readable, save the final HTML and optional screenshot locally, write the manual evidence',
    `JSON including the exact claimGeneration, and persist it with ${manualEvidenceCommand}. Record CAPTURE_RECOVERED only after`,
    'the command creates durable MANUAL_BROWSER HTML or Markdown evidence. Route broken',
    'approved-source selectors to the mapper. A same-policy-key www redirect and stored public',
    'HTML from the failed page are valid evidence when provenance is recorded. Use RETRY_LATER',
    'for a transient access, TLS, robots-evidence, JavaScript-render, rate, or size failure.',
    'Use SOURCE_EXCLUDED for login, CAPTCHA, explicit prohibition, heldout, missing, unrelated,',
    'or unsupported sources. Use HUMAN_REVIEW_REQUIRED only for conflicting identity,',
    'contradictory evidence, or replacement-domain approval. Never invent an alternate site.',
    `Complete every job with ${completeCommand}, carrying the exact claimGeneration, reconcile, check the queue, and continue.`,
    'Do not map sources, approve packages, publish organizations or events, enable mapped',
    'source automation, alter domain policy, push, deploy, or change unrelated live data.',
    `Keep output/affiliate-coverage-agent/progress/${agentId}.jsonl current and report`,
    'campaigns created, manual recoveries, mapper repairs, human-review items, and final status.',
  ].join(' ');
};

export const buildCodexAffiliateCoverageGoal = (
  options: CodexAffiliateCoverageGoalOptions,
): string => {
  const objective = buildCodexAffiliateCoverageObjective(options);
  if (objective.length > CODEX_AFFILIATE_COVERAGE_OBJECTIVE_MAX_LENGTH) {
    throw new Error(
      `Codex affiliate coverage objective must be at most ${CODEX_AFFILIATE_COVERAGE_OBJECTIVE_MAX_LENGTH} characters.`,
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

export const buildCodexAffiliateCoverageArgs = (
  options: CodexAffiliateCoverageGoalOptions,
): string[] => [
  '--ask-for-approval',
  'never',
  'exec',
  '--ephemeral',
  '--cd',
  path.resolve(options.repositoryRoot),
  '--model',
  CODEX_AFFILIATE_COVERAGE_MODEL,
  '--config',
  `model_reasoning_effort="${CODEX_AFFILIATE_COVERAGE_REASONING_EFFORT}"`,
  '--config',
  'sandbox_workspace_write.network_access=true',
  '--enable',
  'goals',
  '--sandbox',
  options.containerIsolated ? 'danger-full-access' : 'workspace-write',
  buildCodexAffiliateCoverageGoal(options),
];
