import dotenv from 'dotenv';
import { generateAffiliateSourceDiscoveryQueries } from '../src/server/affiliateImports/sourceDiscoveryRules';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const argument = (name: string): string | null => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
};

const main = async () => {
  const campaignId = argument('campaign');
  const campaignName = argument('name');
  if (!campaignId && !campaignName) throw new Error('Pass --campaign=<id> or --name=<campaign name>.');
  // Prisma must load after dotenv so local connection settings are available.
  const { prisma: db } = await import('../src/lib/prisma');
  try {
    const campaign = await db.affiliateSourceDiscoveryCampaigns.findFirst({
      where: campaignId ? { id: campaignId } : { name: campaignName ?? '' },
    });
    if (!campaign) throw new Error('Coverage campaign was not found.');
    const sports = await db.sports.findMany({
      where: { id: { in: campaign.sportIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const generated = generateAffiliateSourceDiscoveryQueries(campaign, sports, campaign.queryCursor ?? 0);
    console.log(JSON.stringify({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        region: campaign.region,
        location: campaign.location,
        sportIds: campaign.sportIds,
        sourceTypeHints: campaign.sourceTypeHints,
        metadata: campaign.metadata,
        maxQueriesPerRun: campaign.maxQueriesPerRun,
      },
      queries: generated.queries.map((query, index) => ({ index: index + 1, ...query })),
      nextCursor: generated.nextCursor,
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:coverage:query-preview] failed', error);
  process.exitCode = 1;
});
