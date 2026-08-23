import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

if (process.argv.includes('--live')) {
  const liveDatabaseUrl = process.env.DATABASE_URL_LIVE?.trim()
    || (process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL?.trim() : '');
  if (!liveDatabaseUrl) throw new Error('DATABASE_URL_LIVE is required with --live outside the production container.');
  process.env.DATABASE_URL = liveDatabaseUrl;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
}

const readInteger = (name: string, fallback: number): number => {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  const parsed = Number.parseInt(arg?.slice(name.length + 1) ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const applyProviderOption = (option: string, envName: string): void => {
  const value = readOption(option);
  if (value) process.env[envName] = value;
};

applyProviderOption('--discovery-provider', 'AFFILIATE_DISCOVERY_PROVIDER');
applyProviderOption('--intake-provider', 'AFFILIATE_INTAKE_PROVIDER');
applyProviderOption('--fallback-provider', 'AFFILIATE_PROVIDER_FALLBACK');
applyProviderOption('--screenshot-mode', 'AFFILIATE_INTAKE_SCREENSHOT_MODE');
applyProviderOption('--scrapingdog-timeout', 'SCRAPINGDOG_TIMEOUT_MS');
applyProviderOption('--dynamic-wait', 'SCRAPINGDOG_DYNAMIC_WAIT_MS');

const main = async () => {
  // Load after dotenv setup so Prisma and provider clients receive the selected environment.
  const { prisma } = await import('../src/lib/prisma');
  const {
    runAffiliateIntakeAutomation,
    runAffiliateReplenishmentCampaignWave,
  } = await import('../src/server/affiliateImports/sourceDiscovery');
  const {
    affiliateSupplyDatabase,
    loadActiveAffiliateSupplyContracts,
    reconcileAffiliateReplenishment,
  } = await import('../src/server/affiliateImports/affiliateSupplyPersistence');
  try {
    const supplyDatabase = affiliateSupplyDatabase(prisma);
    let activeContracts: Awaited<ReturnType<typeof loadActiveAffiliateSupplyContracts>> = [];
    try {
      activeContracts = await loadActiveAffiliateSupplyContracts({ db: supplyDatabase });
    } catch (error) {
      console.error(
        '[affiliate:intake:automation] Supply Contracts are not active; replenishment admission is halted.',
        error instanceof Error ? error.message : error,
      );
    }
    const result = await runAffiliateIntakeAutomation({
      discoveryLimit: readInteger('--discovery-limit', 5),
      intakeLimit: readInteger('--intake-limit', 10),
      sendSummary: process.argv.includes('--send-email') && !process.argv.includes('--no-email'),
      isDemandDriven: true,
    });
    const isContractSafe = process.env.AFFILIATE_SUPPLY_CONTRACT_SAFE?.trim().toLowerCase() !== 'false';
    const replenishments = await Promise.all(activeContracts.map((activeContract) => (
      reconcileAffiliateReplenishment({
        contract: activeContract.policy,
        rolloutCohort: activeContract.policy.rolloutCohort,
        isContractSafe,
        db: supplyDatabase,
        runWave: ({ wave, demand, contract }) => runAffiliateReplenishmentCampaignWave({
          wave,
          demand,
          contract,
        }, {
          workerId: process.env.AFFILIATE_REPLENISHMENT_WORKER_ID?.trim()
            || `affiliate-replenishment-${process.pid}`,
        }),
      })
    )));
    const replenishment = replenishments.length === 1
      ? replenishments[0]
      : activeContracts.length === 0
        ? {
            skipped: true,
            reason: 'UNSAFE_ACTIVE_CONTRACT',
          }
        : {
            cohorts: replenishments,
          };
    console.log(JSON.stringify({ ...result, replenishment }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:intake:automation] failed', error);
  process.exitCode = 1;
});
