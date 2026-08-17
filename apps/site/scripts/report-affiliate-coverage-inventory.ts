import {
  getAffiliateCoverageCatalogSummary,
  loadAffiliateCoverageCityCatalog,
} from '../src/server/affiliateImports/coverageCityCatalog';
import {
  buildAffiliateCoverageInventory,
  type AffiliateCoverageInventoryFilters,
} from '../src/server/affiliateImports/coverageInventory';

const valueFor = (args: string[], name: string): string | undefined => {
  const prefix = `${name}=`;
  const argument = args.find((entry) => entry.startsWith(prefix));
  return argument?.slice(prefix.length);
};

const parseFilters = (args: string[]): AffiliateCoverageInventoryFilters => {
  const cohort = valueFor(args, '--cohort') as AffiliateCoverageInventoryFilters['cohort'] | undefined;
  const status = valueFor(args, '--status') as AffiliateCoverageInventoryFilters['status'] | undefined;
  const limitText = valueFor(args, '--limit');
  return {
    cohort,
    market: valueFor(args, '--market'),
    city: valueFor(args, '--city'),
    status,
    limit: limitText ? Number(limitText) : 50,
  };
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const catalog = loadAffiliateCoverageCityCatalog();
  const filters = parseFilters(args);
  if (args.includes('--catalog-only')) {
    const summary = getAffiliateCoverageCatalogSummary(catalog);
    if (valueFor(args, '--format') === 'json') console.log(JSON.stringify(summary, null, 2));
    else Object.entries(summary).forEach(([key, value]) => console.log(`${key}: ${value}`));
    return;
  }
  const inventory = await buildAffiliateCoverageInventory(filters);
  if (valueFor(args, '--format') === 'json') {
    console.log(JSON.stringify({ filters, ...inventory }, null, 2));
    return;
  }
  console.log(`censusVintage: ${inventory.catalog.censusVintage}`);
  console.log(`cityCount: ${inventory.cityCount}`);
  console.log(`marketCount: ${inventory.marketCount}`);
  console.log(`sportCount: ${inventory.sportCount}`);
  console.log(`profileCount: ${inventory.profileCount}`);
  console.log(`theoreticalCellCount: ${inventory.theoreticalCellCount}`);
  console.log(`partialHistoryCount: ${inventory.partialHistoryCount}`);
  console.log(`coverageCounts: ${JSON.stringify(inventory.coverageCounts)}`);
  console.log(`searchStateCounts: ${JSON.stringify(inventory.searchStateCounts)}`);
  inventory.rankedCells.forEach((cell, index) => {
    console.log([
      `${index + 1}.`, cell.cohort, cell.marketKey, cell.city, cell.sportName, cell.profileKey,
      `${cell.coverageStatus}/${cell.searchStatus}`,
      `score=${cell.priorityScore.toFixed(6)}`,
      `evidence=${cell.evidenceQuality}`,
    ].join(' '));
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
