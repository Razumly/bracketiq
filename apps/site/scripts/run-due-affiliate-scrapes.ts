import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });
export type AffiliateDueScrapeGuardInput = Readonly<{
  nodeEnv?: string;
  argv?: readonly string[];
}>;

const hasFlag = (argv: readonly string[], name: string): boolean => (
  argv.some((argument) => argument === `--${name}` || argument.startsWith(`--${name}=`))
);

const readBooleanFlag = (argv: readonly string[], name: string): boolean => (
  argv.includes(`--${name}`) || argv.includes(`--${name}=true`)
);
export const assertLegacyDueScrapeExecutionAllowed = (
  input: AffiliateDueScrapeGuardInput = {},
): void => {
  const argv = input.argv ?? process.argv;
  const dryRun = readBooleanFlag(argv, 'dry-run');
  if (hasFlag(argv, 'live')) {
    throw new Error(
      'Legacy affiliate due-scrape execution does not accept --live. Use governed gateway admission.',
    );
  }
  if (String(input.nodeEnv ?? process.env.NODE_ENV).trim().toLowerCase() === 'production' && !dryRun) {
    throw new Error(
      'Legacy affiliate due-scrape execution is disabled for production. Use governed gateway admission or --dry-run.',
    );
  }
};

assertLegacyDueScrapeExecutionAllowed();

const parseLimit = (): number | undefined => {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  if (!limitArg) return undefined;
  const parsed = Number.parseInt(limitArg.slice('--limit='.length), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const main = async () => {
  const { runDueAffiliateScrapes } = await import('../src/server/affiliateImports/scheduledScrapes');
  const dryRun = readBooleanFlag(process.argv, 'dry-run');
  const result = await runDueAffiliateScrapes({
    dryRun,
    limit: parseLimit(),
  });
  console.log(JSON.stringify({
    startedAt: result.startedAt.toISOString(),
    finishedAt: result.finishedAt.toISOString(),
    lockAcquired: result.lockAcquired,
    dryRun: result.dryRun,
    reconciledSourceOrganizationCount: result.reconciledSourceOrganizationCount,
    dueSourceCount: result.dueSourceCount,
    lightweightSourceCount: result.lightweightSourceCount,
    results: result.results,
    lightweightResults: result.lightweightResults,
  }, null, 2));
};

if (process.argv[1]?.includes('run-due-affiliate-scrapes.ts')) {
  main().catch((error) => {
    console.error('[affiliate:scrape:due] failed', error);
    process.exitCode = 1;
  });
}
