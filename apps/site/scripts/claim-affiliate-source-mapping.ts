import dotenv from 'dotenv';
import path from 'path';
import { configureAffiliateLiveDatabaseEnvironment } from '../src/server/affiliateImports/agentRepository';
import type { AffiliateSourceMappingClaimHandle } from '../src/server/affiliateImports/sourceMappingQueue';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });
const LEGACY_RETIREMENT_MESSAGE =
  'Legacy affiliate launcher is paused pending governed cohort proof; use governed gateway admission.';
if (process.env.NODE_ENV === 'production' || process.argv.includes('--live')) {
  console.error(LEGACY_RETIREMENT_MESSAGE);
  process.exit(78);
}

const useLive = process.argv.includes('--live');
if (useLive) {
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  configureAffiliateLiveDatabaseEnvironment(process.env.DATABASE_URL_LIVE);
  process.env.STORAGE_PROVIDER = 'spaces';
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

const main = async () => {
  const workerId = readOption('--worker') ?? `affiliate-mapping-cli-${process.pid}`;
  const intakeId = readOption('--intake');
  const runId = readOption('--run-id');
  const { prisma } = await import('../src/lib/prisma');
  const {
    acquireAffiliateSourceMappingClaimEvidence,
  } = await import('../src/server/affiliateImports/sourceMappingClaimEvidence');
  const {
    releaseAffiliateSourceMappingClaim,
  } = await import('../src/server/affiliateImports/sourceMappingQueue');
  try {
    if (process.argv.includes('--release')) {
      const jobId = readOption('--job-id');
      const job = jobId
        ? await (prisma as any).affiliateSourceMappingJobs.findUnique({ where: { id: jobId } })
        : await (prisma as any).affiliateSourceMappingJobs.findFirst({
            where: {
              ...(intakeId ? { intakeId } : {}),
              status: 'CLAIMED',
              workerId,
            },
            orderBy: { claimedAt: 'desc' },
          });
      if (!job?.claimedAt) throw new Error('--release requires an active claimed job and its immutable claim generation.');
      const claimHandle: AffiliateSourceMappingClaimHandle = {
        jobId: job.id,
        workerId: String(job.workerId),
        claimedAt: new Date(job.claimedAt).toISOString(),
      };
      console.log(JSON.stringify(await releaseAffiliateSourceMappingClaim({
        claimHandle,
        reason: readOption('--reason') ?? 'Released by mapping claim CLI.',
        db: prisma,
      }), null, 2));
      return;
    }
    if (useLive && (!intakeId || !runId)) {
      throw new Error('--live claims require exact --intake and --run-id selectors.');
    }
    const claim = await acquireAffiliateSourceMappingClaimEvidence({
      workerId,
      intakeId,
      runId,
      environment: useLive ? 'live' : 'local',
      outputDirectory: readOption('--output') ? path.resolve(readOption('--output') as string) : undefined,
    }, { db: prisma });
    console.log(JSON.stringify({ claimed: Boolean(claim), ...(claim ?? {}) }, null, 2));
  } finally {
    await (prisma as any).$disconnect();
  }
};

main().catch((error) => {
  console.error('[affiliate:mapping:claim] failed', error);
  process.exitCode = 1;
});
