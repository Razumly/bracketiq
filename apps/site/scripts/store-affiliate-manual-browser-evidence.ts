import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const inputSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
  claimGeneration: z.object({
    jobId: z.string().trim().min(1),
    agentId: z.string().trim().min(1),
    claimedAt: z.string().datetime({ offset: true }),
  }).strict(),
  pageId: z.string().trim().min(1),
  sourceUrl: z.string().trim().url(),
  finalUrl: z.string().trim().url().nullable().optional(),
  htmlPath: z.string().trim().min(1),
  screenshotPath: z.string().trim().min(1).nullable().optional(),
  screenshotMimeType: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().min(10).max(4_000),
}).superRefine((value, context) => {
  if (value.claimGeneration.jobId !== value.jobId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['claimGeneration', 'jobId'], message: 'Claim generation job id must match jobId.' });
  }
  if (value.claimGeneration.agentId !== value.agentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['claimGeneration', 'agentId'], message: 'Claim generation agent id must match agentId.' });
  }
});
const useLive = process.argv.includes('--live');
if (useLive) {
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const main = async () => {
  const inputPath = readOption('--input');
  if (!inputPath) throw new Error('--input=<manual-evidence-json> is required.');
  const parsed = inputSchema.parse(JSON.parse(await readFile(path.resolve(inputPath), 'utf8')));
  const html = await readFile(path.resolve(parsed.htmlPath));
  const screenshot = parsed.screenshotPath ? await readFile(path.resolve(parsed.screenshotPath)) : null;
  const { prisma } = await import('../src/lib/prisma');
  const { storeAffiliateManualBrowserEvidence } = await import('../src/server/affiliateImports/coverageAgentQueue');
  try {
    console.log(JSON.stringify(await storeAffiliateManualBrowserEvidence({
      jobId: parsed.jobId,
      agentId: parsed.agentId,
      claimGeneration: parsed.claimGeneration,
      pageId: parsed.pageId,
      sourceUrl: parsed.sourceUrl,
      finalUrl: parsed.finalUrl,
      html,
      screenshot,
      screenshotMimeType: parsed.screenshotMimeType,
      notes: parsed.notes,
    }), null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:coverage:manual-evidence] failed', error);
  process.exitCode = 1;
});
