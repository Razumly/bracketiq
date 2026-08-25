import { readFile } from 'node:fs/promises';
import { buildAffiliateCutoverPreflightReport, type AffiliateCutoverPreflightInput } from '../src/server/affiliateImports/affiliateFleetCutover';

const option = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value?.slice(prefix.length).trim() || undefined;
};

const readInventory = async (): Promise<AffiliateCutoverPreflightInput> => {
  const path = option('inventory') ?? option('input');
  if (!path) throw new Error('Provide --inventory=/path/to/cutover-inventory.json.');
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The cutover inventory must be a JSON object.');
  }
  const fields = parsed as Record<string, unknown>;
  const requiredKeys = [
    'now',
    'expected',
    'observed',
    'processInventory',
    'legacyClaims',
    'databasePermissions',
    'containers',
  ];
  for (const key of requiredKeys) {
    if (!(key in fields)) throw new Error(`The cutover inventory is missing ${key}.`);
  }
  if (typeof fields.now !== 'string' || Number.isNaN(new Date(fields.now).getTime())) {
    throw new Error('The cutover inventory now field must be an ISO date string.');
  }
  if (!Array.isArray(fields.processInventory) || !Array.isArray(fields.legacyClaims) || !Array.isArray(fields.containers)) {
    throw new Error('The cutover inventory process, claim, and container fields must be arrays.');
  }
  if (
    !fields.expected
    || typeof fields.expected !== 'object'
    || Array.isArray(fields.expected)
    || !fields.observed
    || typeof fields.observed !== 'object'
    || Array.isArray(fields.observed)
    || !fields.databasePermissions
    || typeof fields.databasePermissions !== 'object'
    || Array.isArray(fields.databasePermissions)
  ) {
    throw new Error('The cutover inventory contract and permission fields must be objects.');
  }
  const inventory = parsed as AffiliateCutoverPreflightInput;
  return {
    ...inventory,
    now: new Date(inventory.now),
  };
};

const main = async (): Promise<void> => {
  const report = buildAffiliateCutoverPreflightReport(await readInventory());
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion,
    isReady: report.isReady,
    inputHash: report.inputHash,
    reportHash: report.reportHash,
    deploymentContractVersion: report.deploymentContractVersion,
    deploymentContractHash: report.deploymentContractHash,
    counts: report.counts,
    failedInvariants: report.blockingFindings.map((finding) => finding.code),
    resolutions: report.resolutions,
    report,
  }, null, 2));
  if (!report.isReady) process.exitCode = 2;
};

main().catch((error) => {
  console.error('[affiliate:cutover:preflight] failed', error);
  process.exitCode = 1;
});
