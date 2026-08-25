import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { affiliateSupplyDatabase, reconcileLegacyAffiliateSupply } from '../src/server/affiliateImports/affiliateSupplyPersistence';
import { hashAffiliateAgentValue } from '../src/server/affiliateImports/agentGatewayContracts';
import { prisma } from '../src/lib/prisma';
import type { AffiliateCutoverPreflightReport } from '../src/server/affiliateImports/affiliateFleetCutover';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const option = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value?.slice(prefix.length).trim() || undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const readPreflight = async (): Promise<Pick<AffiliateCutoverPreflightReport, 'isReady'> & Partial<Pick<AffiliateCutoverPreflightReport, 'deploymentContractVersion' | 'deploymentContractHash'>> | undefined> => {
  const path = option('preflight');
  if (!path) return undefined;
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !('isReady' in parsed) || typeof parsed.isReady !== 'boolean') {
    throw new Error('The preflight file must contain an isReady boolean.');
  }
  const record = parsed as Record<string, unknown>;
  const report = record.report && typeof record.report === 'object' && !Array.isArray(record.report)
    ? record.report as Record<string, unknown>
    : {};
  const deploymentContractVersion = record.deploymentContractVersion ?? report.deploymentContractVersion;
  const deploymentContractHash = record.deploymentContractHash ?? report.deploymentContractHash;
  if (deploymentContractVersion !== undefined && typeof deploymentContractVersion !== 'number') {
    throw new Error('The preflight deployment contract version must be a number.');
  }
  if (deploymentContractHash !== undefined && typeof deploymentContractHash !== 'string') {
    throw new Error('The preflight deployment contract hash must be a string.');
  }
  return {
    isReady: parsed.isReady,
    deploymentContractVersion: deploymentContractVersion as number | undefined,
    deploymentContractHash: deploymentContractHash as string | undefined,
  };
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
