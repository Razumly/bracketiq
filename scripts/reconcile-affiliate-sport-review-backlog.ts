import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import {
  applyAffiliateSportReconciliation,
  selectAffiliateSportReconciliationRows,
  type AffiliateSportReconciliationPreview,
} from '../src/server/affiliateImports/affiliateSportReconciliation';

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};
const writeOutput = async (outputPath: string | undefined, value: unknown): Promise<void> => {
  if (!outputPath) return;
  const resolved = path.resolve(outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const parsePositiveInteger = (name: string): number | undefined => {
  const value = readOption(name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
};

const main = async () => {
  const useLive = process.argv.includes('--live');
  const apply = process.argv.includes('--apply');
  if (apply && !useLive) throw new Error('--apply requires --live.');
  if (useLive) configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  const limit = parsePositiveInteger('--limit');
  const expectedCount = parsePositiveInteger('--expected-count');
  const expectedSelectionSha256 = readOption('--expected-selection-sha256');
  if (apply && expectedCount === undefined) throw new Error('--apply requires --expected-count=<n>.');
  if (apply && !expectedSelectionSha256) throw new Error('--apply requires --expected-selection-sha256=<hash>.');
  const outputPath = readOption('--output');
  const { prisma } = await import('../src/lib/prisma');
  try {
    const preview = await selectAffiliateSportReconciliationRows({ jobId: readOption('--job'), limit });
    let output: AffiliateSportReconciliationPreview;
    try {
      output = apply
        ? await applyAffiliateSportReconciliation({
            preview,
            expectedCount: expectedCount as number,
            expectedSelectionSha256: expectedSelectionSha256 as string,
          })
        : preview;
    } catch (error) {
      if (error && typeof error === 'object' && 'reconciliation' in error) {
        await writeOutput(outputPath, error.reconciliation);
      }
      throw error;
    }
    await writeOutput(outputPath, output);
    console.log(JSON.stringify({
      mode: output.mode,
      eligibleCount: output.eligibleCount,
      selectedCount: output.selectedCount,
      writeCount: output.writeCount,
      selectionSha256: output.selectionSha256,
    }));
  } finally {
    await (prisma as { $disconnect: () => Promise<void> }).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:sport-reconciliation] failed', error);
  process.exitCode = 1;
});
