import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { affiliateSupplyDatabase, reconcileLegacyAffiliateSupply } from '../src/server/affiliateImports/affiliateSupplyPersistence';
import { hashAffiliateAgentValue } from '../src/server/affiliateImports/agentGatewayContracts';
import { prisma } from '../src/lib/prisma';
import {
  isAffiliateCutoverPreflightReportIntact,
  type AffiliateCutoverPreflightReport,
} from '../src/server/affiliateImports/affiliateFleetCutover';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const option = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value?.slice(prefix.length).trim() || undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

type ReconciliationPreflight = AffiliateCutoverPreflightReport;

const readPreflight = async (): Promise<ReconciliationPreflight | undefined> => {
  const path = option('preflight');
  if (!path) return undefined;
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('The preflight file must contain a report object.');
  }
  if (parsed.report !== undefined && !isRecord(parsed.report)) {
    throw new Error('The preflight report field must be an object.');
  }
  const candidate = (parsed.report as Record<string, unknown> | undefined) ?? parsed;
  const requiredArrays = ['blockingFindings', 'warnings', 'resolutions'];
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.evaluatedAt !== 'string'
    || typeof candidate.isReady !== 'boolean'
    || typeof candidate.inputHash !== 'string'
    || typeof candidate.reportHash !== 'string'
    || !Number.isInteger(candidate.supplyContractVersion)
    || typeof candidate.supplyContractHash !== 'string'
    || !Number.isInteger(candidate.deploymentContractVersion)
    || typeof candidate.deploymentContractHash !== 'string'
    || !Number.isInteger(candidate.gatewayVersion)
    || !isRecord(candidate.counts)
    || requiredArrays.some((key) => !Array.isArray(candidate[key]))
  ) {
    throw new Error('The preflight file must contain a complete preflight report.');
  }
  if (parsed.report !== undefined && parsed.isReady !== undefined && parsed.isReady !== candidate.isReady) {
    throw new Error('The preflight wrapper and report readiness values must match.');
  }
  const report = candidate as unknown as AffiliateCutoverPreflightReport;
  if (!isAffiliateCutoverPreflightReportIntact(report)) {
    throw new Error('The preflight report hash is invalid.');
  }
  return report;
};

const main = async (): Promise<void> => {
  const isApply = hasFlag('apply');
  if (isApply && hasFlag('dry-run')) {
    throw new Error('Choose either --apply or --dry-run, not both.');
  }
  const nowValue = option('now');
  const now = nowValue ? new Date(nowValue) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${nowValue}`);
  const preflight = await readPreflight();
  const countsPath = option('counts-json');
  const expectedCountsHash = option('counts-hash')
    ?? (countsPath
      ? hashAffiliateAgentValue(JSON.parse(await readFile(countsPath, 'utf8')))
      : undefined);
  const result = await reconcileLegacyAffiliateSupply({
    db: affiliateSupplyDatabase(prisma),
    dryRun: !isApply,
    now,
    rolloutCohort: option('rollout-cohort'),
    operatorId: option('operator'),
    expectedReportHash: option('report-hash'),
    expectedInputHash: option('input-hash'),
    expectedCountsHash,
    applyNonce: option('apply-nonce'),
    preflight,
  });
  console.log(JSON.stringify({
    schemaVersion: 1,
    mode: result.mode,
    dryRun: result.dryRun,
    inputHash: result.inputHash,
    outputHash: result.outputHash,
    reportHash: result.reportHash,
    counts: result.report.counts,
    failedInvariants: result.report.blockingFindings.map((finding) => finding.code),
    resolutions: result.report.resolutions,
    claimsToRevoke: result.claimsToRevoke,
    rows: result.rows,
    report: result.report,
  }, null, 2));
  if (!result.report.isApplySafe) process.exitCode = 2;
};

main()
  .catch((error) => {
    console.error('[affiliate:cutover:reconcile] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
