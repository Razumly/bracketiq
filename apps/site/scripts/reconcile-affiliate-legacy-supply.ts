import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import {
  affiliateSupplyDatabase,
  reconcileLegacyAffiliateSupply,
  type AffiliateLegacySupplyReconciliationResult,
} from '../src/server/affiliateImports/affiliateSupplyPersistence';
import { hashAffiliateAgentValue } from '../src/server/affiliateImports/agentGatewayContracts';
import { prisma } from '../src/lib/prisma';
import {
  isAffiliateCutoverPreflightReportIntact,
  type AffiliateCutoverPreflightReport,
  type AffiliateLegacyReconciliationReport,
} from '../src/server/affiliateImports/affiliateFleetCutover';
import { readAffiliateCutoverOption } from './affiliate-cutover-cli';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

type ReconciliationPreflight = AffiliateCutoverPreflightReport;

type ReviewedReconciliationCounts = AffiliateLegacyReconciliationReport['counts'];

type ReconciliationCliOptions = Readonly<{
  isApply: boolean;
  isDryRun: boolean;
  nowValue?: string;
  preflightPath?: string;
  countsPath?: string;
  suppliedCountsHash?: string;
  rolloutCohort?: string;
  operatorId?: string;
  reportHash?: string;
  inputHash?: string;
  applyNonce?: string;
  cutoverSessionId?: string;
  cutoverSessionHash?: string;
}>;

type ReconciliationExecutionOptions = ReconciliationCliOptions & Readonly<{
  now: Date;
}>;

type ReconciliationInputs = Readonly<{
  preflight?: ReconciliationPreflight;
  expectedCounts?: ReviewedReconciliationCounts;
  expectedCountsHash?: string;
}>;

type ReconciliationResult = AffiliateLegacySupplyReconciliationResult;

const isReviewedReconciliationCounts = (
  value: unknown,
): value is ReviewedReconciliationCounts => {
  const isNonNegativeInteger = (count: unknown): count is number => (
    typeof count === 'number' && Number.isInteger(count) && count >= 0
  );
  if (!isRecord(value)) return false;
  const requiredKeys = [
    'sources',
    'roots',
    'rootsToCreate',
    'rootsToReuse',
    'successorsToCreate',
    'lineageRecords',
    'linkedRecords',
    'unresolvedRecords',
    'preservedPublicTargets',
    'lastKnownGoodTargets',
    'rejectedTargets',
    'claims',
    'activeClaims',
    'expiredClaims',
    'terminalClaims',
    'claimsToRevoke',
    'blockingFindings',
    'warningFindings',
    'recordsByKind',
  ];
  return requiredKeys.every((key) => key in value)
    && requiredKeys
      .filter((key) => key !== 'recordsByKind')
      .every((key) => isNonNegativeInteger(value[key]))
    && isRecord(value.recordsByKind)
    && Object.values(value.recordsByKind).every(isNonNegativeInteger);
};

const readReconciliationCliOptions = (): ReconciliationCliOptions => ({
  isApply: hasFlag('apply'),
  isDryRun: hasFlag('dry-run'),
  nowValue: readAffiliateCutoverOption('now'),
  preflightPath: readAffiliateCutoverOption('preflight'),
  countsPath: readAffiliateCutoverOption('counts-json'),
  suppliedCountsHash: readAffiliateCutoverOption('counts-hash'),
  rolloutCohort: readAffiliateCutoverOption('rollout-cohort'),
  operatorId: readAffiliateCutoverOption('operator'),
  reportHash: readAffiliateCutoverOption('report-hash'),
  inputHash: readAffiliateCutoverOption('input-hash'),
  applyNonce: readAffiliateCutoverOption('apply-nonce'),
  cutoverSessionId: readAffiliateCutoverOption('cutover-session-id'),
  cutoverSessionHash: readAffiliateCutoverOption('cutover-session-hash'),
});

const assertReconciliationCliOptions = (
  options: ReconciliationCliOptions,
): void => {
  if (options.isApply && options.isDryRun) {
    throw new Error('Choose either --apply or --dry-run, not both.');
  }
  if (options.isApply && options.nowValue) {
    throw new Error('--now is supported only for dry-run reconciliation.');
  }
};

const parseReconciliationNow = (nowValue: string | undefined): Date => {
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowValue}`);
  return now;
};

const readReconciliationExecutionOptions = (): ReconciliationExecutionOptions => {
  const options = readReconciliationCliOptions();
  assertReconciliationCliOptions(options);
  return { ...options, now: parseReconciliationNow(options.nowValue) };
};

const readReviewedCounts = async (
  path: string | undefined,
): Promise<ReviewedReconciliationCounts | undefined> => {
  if (!path) return undefined;
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('The reviewed counts file must contain a JSON object.');
  }
  const counts = isRecord(parsed.counts) ? parsed.counts : parsed;
  if (!isReviewedReconciliationCounts(counts)) {
    throw new Error('The reviewed counts file must contain complete reconciliation counts.');
  }
  return counts;
};

const isSha256String = (value: unknown): value is string => (
  typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && Boolean(value.trim())
);

const isPreflightReportMetadataComplete = (
  candidate: Record<string, unknown>,
): boolean => [
  candidate.schemaVersion === 1,
  typeof candidate.evaluatedAt === 'string',
  typeof candidate.isReady === 'boolean',
  typeof candidate.inputHash === 'string',
  typeof candidate.reportHash === 'string',
  Number.isInteger(candidate.supplyContractVersion),
  typeof candidate.supplyContractHash === 'string',
  Number.isInteger(candidate.deploymentContractVersion),
  typeof candidate.deploymentContractHash === 'string',
  Number.isInteger(candidate.gatewayVersion),
  isSha256String(candidate.reviewedLegacyProcessManifestHash),
  Number.isInteger(candidate.reviewedLegacyProcessManifestCount),
  isNonEmptyString(candidate.reviewedLegacyProcessManifestArtifactId),
  isNonEmptyString(candidate.processInventoryArtifactId),
  isSha256String(candidate.processInventoryHash),
  Number.isInteger(candidate.processInventoryCount),
  isRecord(candidate.counts),
].every(Boolean);

const selectPreflightReport = (
  parsed: Record<string, unknown>,
): Record<string, unknown> => {
  if (parsed.report === undefined) return parsed;
  const report = parsed.report;
  if (!isRecord(report)) {
    throw new Error('The preflight report field must be an object.');
  }
  return report;
};

const assertCompletePreflightReport: (
  candidate: Record<string, unknown>,
) => asserts candidate is ReconciliationPreflight = (candidate) => {
  if (!isPreflightReportMetadataComplete(candidate)) {
    throw new Error('The preflight file must contain a complete preflight report.');
  }
};

const assertPreflightReadinessMatches = (
  parsed: Record<string, unknown>,
  candidate: ReconciliationPreflight,
): void => {
  if (parsed.report !== undefined && parsed.isReady !== undefined && parsed.isReady !== candidate.isReady) {
    throw new Error('The preflight wrapper and report readiness values must match.');
  }
};

const readPreflight = async (
  path: string | undefined,
): Promise<ReconciliationPreflight | undefined> => {
  if (!path) return undefined;
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('The preflight file must contain a report object.');
  }
  const candidate = selectPreflightReport(parsed);
  assertCompletePreflightReport(candidate);
  assertPreflightReadinessMatches(parsed, candidate);
  if (!isAffiliateCutoverPreflightReportIntact(candidate)) {
    throw new Error('The preflight report hash is invalid.');
  }
  return candidate;
};

const assertReviewedCountsHashMatches = (
  suppliedCountsHash: string | undefined,
  expectedCountsHash: string | undefined,
): void => {
  if (suppliedCountsHash && expectedCountsHash !== suppliedCountsHash) {
    throw new Error('The reviewed counts hash does not match the reviewed counts JSON.');
  }
};

const readReconciliationInputs = async (
  options: ReconciliationCliOptions,
): Promise<ReconciliationInputs> => {
  const preflight = await readPreflight(options.preflightPath);
  const expectedCounts = await readReviewedCounts(options.countsPath);
  const expectedCountsHash = expectedCounts
    ? hashAffiliateAgentValue(expectedCounts)
    : options.suppliedCountsHash;
  assertReviewedCountsHashMatches(options.suppliedCountsHash, expectedCountsHash);
  return { preflight, expectedCounts, expectedCountsHash };
};

const buildReconciliationInput = (
  options: ReconciliationExecutionOptions,
  inputs: ReconciliationInputs,
) => ({
  db: affiliateSupplyDatabase(prisma),
  isDryRun: !options.isApply,
  now: options.now,
  rolloutCohort: options.rolloutCohort,
  operatorId: options.operatorId,
  expectedReportHash: options.reportHash,
  expectedInputHash: options.inputHash,
  expectedCounts: inputs.expectedCounts,
  expectedCountsHash: inputs.expectedCountsHash,
  applyNonce: options.applyNonce,
  cutoverSessionId: options.cutoverSessionId,
  cutoverSessionHash: options.cutoverSessionHash,
  preflight: inputs.preflight,
});

const reconciliationCliPayload = (result: ReconciliationResult) => ({
  isApplied: result.isApplied,
  schemaVersion: 1,
  mode: result.mode,
  isDryRun: result.isDryRun,
  inputHash: result.inputHash,
  outputHash: result.outputHash,
  reportHash: result.reportHash,
  countsHash: hashAffiliateAgentValue(result.report.counts),
  failedInvariants: result.report.blockingFindings.map((finding) => finding.code),
  resolutions: result.report.resolutions,
  claimsToRevoke: result.claimsToRevoke,
  rows: result.rows,
  report: result.report,
});

const printReconciliationResult = (result: ReconciliationResult): void => {
  console.log(JSON.stringify(reconciliationCliPayload(result), null, 2));
  if (!result.report.isApplySafe) process.exitCode = 2;
};

const main = async (): Promise<void> => {
  const options = readReconciliationExecutionOptions();
  const inputs = await readReconciliationInputs(options);
  const result = await reconcileLegacyAffiliateSupply(
    buildReconciliationInput(options, inputs),
  );
  printReconciliationResult(result);
};

main()
  .catch((error) => {
    console.error('[affiliate:cutover:reconcile] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
