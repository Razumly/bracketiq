import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  assertOpenWeightModelEligible,
  stableAgentArtifactSha256,
  type ModelRevision,
  type OpenWeightModelManifest,
} from '../src/server/affiliateImports/agentContracts';
import type { AffiliateSourceMappingClaimHandle } from '../src/server/affiliateImports/sourceMappingQueue';
import {
  buildAffiliateMappingJobContextFromExport,
} from '../src/server/affiliateImports/agentJobContext';
import {
  FixtureAffiliateMappingModelClient,
  OpenAICompatibleAffiliateMappingModelClient,
  type AffiliateMappingJobContext,
  type AffiliateMappingModelClient,
} from '../src/server/affiliateImports/agentModelClient';
import {
  createIsolatedAffiliateAgentWorktree,
  runAffiliateMappingDraftJob,
  validateAffiliateAgentWorktreeDiff,
} from '../src/server/affiliateImports/agentRunner';
import { verifyAffiliateSportCompletion } from '../src/server/affiliateImports/affiliateSportDetermination';
import { loadAffiliateSportsCatalogSnapshot } from '../src/server/affiliateImports/affiliateSportsCatalog';
import { readAffiliateSourceIntakeArtifact } from '../src/server/affiliateImports/sourceIntakeArtifacts';
import { AffiliateAgentValidationExecutor } from '../src/server/affiliateImports/agentValidation';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

const mappingDryRun = process.argv.includes('--dry-run');
if (
  process.argv.includes('--live')
  || (process.env.NODE_ENV?.trim().toLowerCase() === 'production' && !mappingDryRun)
) {
  throw new Error(
    'Legacy affiliate mapping agent is paused for production writes; use governed gateway admission.',
  );
}

const readOption = (name: string): string | undefined => {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim() || undefined;
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || undefined : undefined;
};

type RunnerFixture = {
  schemaVersion: 1;
  context: AffiliateMappingJobContext;
  model: ModelRevision;
  modelManifestSha256: string;
  draft: unknown;
};

type ClaimedMappingJob = {
  jobId: string;
  intakeId: string;
  sourceKey: string;
  workerId: string;
  claimedAt: string;
  claimHandle: AffiliateSourceMappingClaimHandle;
};
const siteRoot = process.cwd();
const repositoryRoot = path.resolve(siteRoot, '..', '..');

const readJson = async (filePath: string) => JSON.parse(
  await fs.readFile(path.resolve(filePath), 'utf8'),
);

const readBoundedIntegerOption = (
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number => {
  const raw = readOption(name);
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
};

const createValidation = (input: {
  worktreePath: string;
  sourceKey: string;
}) => {
  const runTests = !process.argv.includes('--no-tests');
  const runReviewScrape = process.argv.includes('--review-scrape');
  const validationExecutor = new AffiliateAgentValidationExecutor({
    worktreeRoot: path.join(input.worktreePath, 'apps', 'site'),
    toolchainRoot: siteRoot,
    allowReviewScrape: runReviewScrape,
  });
  return async ({ generatedPaths }: { generatedPaths: string[] }) => {
    const warnings: string[] = [];
    let testsPassed = false;
    let scrapePassed = false;
    if (runTests && generatedPaths.length) {
      await validationExecutor.runFocusedTest('agent-contracts');
      await validationExecutor.runFocusedTest(`generated-source:${input.sourceKey}`);
      testsPassed = true;
    } else if (!generatedPaths) {
      testsPassed = true;
      scrapePassed = true;
    } else {
      warnings.push('Focused tests were skipped by --no-tests.');
    }
    await validationExecutor.runDiffCheck();
    if (runReviewScrape && generatedPaths.length) {
      await validationExecutor.runReviewScrape(input.sourceKey);
      scrapePassed = true;
    } else if (generatedPaths.length) {
      warnings.push(
        'Review scrape was not executed; use --review-scrape only with a local disposable database.',
      );
    }
    return { testsPassed, scrapePassed, warnings };
  };
};

const runInWorktree = async (input: {
  context: AffiliateMappingJobContext;
  modelClient: AffiliateMappingModelClient;
  workerId: string;
  modelManifestSha256: string;
}) => {
  const baseCommit = readOption('--base')
    ?? execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
  const worktree = await createIsolatedAffiliateAgentWorktree({
    repositoryRoot,
    baseCommit,
    parentDirectory: readOption('--worktree-parent'),
  });
  const result = await runAffiliateMappingDraftJob({
    context: input.context,
    workerId: input.workerId,
    modelClient: input.modelClient,
    modelManifestSha256: input.modelManifestSha256,
    promptContractVersion: 2,
    worktreeRoot: worktree.path,
    validate: createValidation({
      worktreePath: worktree.path,
      sourceKey: input.context.sourceKey,
    }),
  });
  await validateAffiliateAgentWorktreeDiff(worktree.path);
  const artifactDirectory = path.dirname(worktree.path);
  const resultPath = path.join(artifactDirectory, `${path.basename(worktree.path)}-result.json`);
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const summary = {
    jobId: result.jobId,
    status: result.status,
    worktree: worktree.path,
    baseCommit: worktree.baseCommit,
    resultPath,
    generatedFiles: result.generatedFiles,
    validation: result.validation,
    retainedForReview: true,
  };
  return { result, summary };
};

const runFixture = async (fixturePath: string) => {
  if (process.argv.includes('--live')) {
    throw new Error('The fixture runner never accepts --live.');
  }
  const fixture = await readJson(fixturePath) as RunnerFixture;
  if (fixture.schemaVersion !== 1) throw new Error('Unsupported runner fixture version.');
  return runInWorktree({
    context: fixture.context,
    workerId: readOption('--worker') ?? `fixture-worker-${process.pid}`,
    modelClient: new FixtureAffiliateMappingModelClient(
      fixture.model,
      new Map([[fixture.context.jobId, fixture.draft]]),
    ),
    modelManifestSha256: fixture.modelManifestSha256,
  });
};

const configureDatabaseEnvironment = (useLive: boolean) => {
  if (!useLive) return;
  if (!process.env.DATABASE_URL_LIVE?.trim()) {
    throw new Error('DATABASE_URL_LIVE is required with --live.');
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL_LIVE;
  process.env.PG_SSL_REJECT_UNAUTHORIZED = 'false';
  process.env.STORAGE_PROVIDER = 'spaces';
};


const modelRevisionFromManifest = (
  manifest: OpenWeightModelManifest,
  modelId: string,
): ModelRevision => ({
  family: manifest.modelFamily,
  upstreamRepository: manifest.upstreamRepository,
  upstreamRevision: manifest.upstreamRevision,
  artifactSha256: manifest.quantization.artifactSha256,
  adapterRevision: modelId === manifest.modelFamily ? null : modelId,
  promptTemplateRevision: manifest.promptTemplateRevision,
});

const runModelWorker = async () => {
  const useLive = process.argv.includes('--live');
  const dryRun = process.argv.includes('--dry-run');
  configureDatabaseEnvironment(useLive);
  const modelEndpoint = readOption('--model-endpoint');
  const modelId = readOption('--model-id');
  const modelManifestPath = readOption('--model-manifest');
  if (!modelEndpoint || !modelId || !modelManifestPath) {
    throw new Error(
      '--model-endpoint, --model-id, and --model-manifest are required without --fixture.',
    );
  }
  const manifest = assertOpenWeightModelEligible(await readJson(modelManifestPath), {
    requireOfflineColdStart: true,
  });
  const modelManifestSha256 = stableAgentArtifactSha256(manifest);
  const workerId = readOption('--worker') ?? `affiliate-open-weight-${process.pid}`;
  let claim: ClaimedMappingJob | null = null;
  let claimEvidence: any = null;
  let prisma: any = null;
  let finishClaim: null | ((input: {
    claimHandle: AffiliateSourceMappingClaimHandle;
    status: 'REVIEW_REQUIRED' | 'EXPANDED' | 'APPROVED' | 'FAILED' | 'HUMAN_REVIEW_REQUIRED';
    resultSummary?: Record<string, unknown> | null;
    errorMessage?: string | null;
    db?: unknown;
  }) => Promise<unknown>) = null;
  let releaseClaim: null | ((input: {
    claimHandle: AffiliateSourceMappingClaimHandle;
    reason?: string | null;
    db?: unknown;
  }) => Promise<unknown>) = null;
  try {
    let sourceKey: string;
    let jobId: string;
    let evidenceDirectory: string;
    let evidenceRunId: string;
    if (dryRun) {
      sourceKey = readOption('--source-key') ?? '';
      if (!sourceKey) throw new Error('--source-key is required with --dry-run.');
      const configuredEvidenceDirectory = readOption('--evidence-dir');
      if (!configuredEvidenceDirectory) throw new Error('--evidence-dir is required with --dry-run.');
      evidenceDirectory = path.resolve(configuredEvidenceDirectory);
      const dryRunManifest = await readJson(path.join(evidenceDirectory, 'manifest.json')) as {
        sourceEvidence?: { runId?: string };
      };
      evidenceRunId = dryRunManifest.sourceEvidence?.runId ?? readOption('--run-id') ?? '';
      if (!evidenceRunId) throw new Error('Dry-run evidence manifest has no run id.');
      jobId = `dry-run-${sourceKey}`;
    } else {
      ({ prisma } = await import('../src/lib/prisma'));
      const queue = await import('../src/server/affiliateImports/sourceMappingQueue');
      const evidence = await import('../src/server/affiliateImports/sourceMappingClaimEvidence');
      finishClaim = queue.finishAffiliateSourceMappingClaim;
      releaseClaim = queue.releaseAffiliateSourceMappingClaim;
      claimEvidence = await evidence.acquireAffiliateSourceMappingClaimEvidence({
        workerId,
        intakeId: readOption('--intake'),
        runId: readOption('--run-id'),
        environment: useLive ? 'live' : 'local',
      }, { db: prisma });
      if (!claimEvidence) {
        return { result: null, summary: { claimed: false, workerId } };
      }
      claim = {
        jobId: claimEvidence.jobId,
        intakeId: claimEvidence.intakeId,
        sourceKey: claimEvidence.sourceKey,
        workerId: claimEvidence.claimHandle.workerId,
        claimedAt: claimEvidence.claimHandle.claimedAt,
        claimHandle: claimEvidence.claimHandle,
      };
      sourceKey = claim.sourceKey;
      jobId = claim.jobId;
      evidenceDirectory = claimEvidence.outputDirectory;
      evidenceRunId = claimEvidence.evidenceRunId;
    }
    const { context } = await buildAffiliateMappingJobContextFromExport({
      jobId,
      evidenceDirectory,
      repositoryRoot,
      instructionsRevision: 'affiliate-source-mapping-contract-v2',
      workerId: claim?.workerId ?? workerId,
      claimedAt: claim?.claimedAt ?? new Date().toISOString(),
    });
    if (claim && (
      context.intakeId !== claim.intakeId
      || context.runId !== evidenceRunId
      || context.sportsCatalog.sha256 !== claimEvidence.claimEvidenceContext.sportsCatalogSha256
    )) {
      throw new Error('Exported mapping context does not match the claimed evidence generation.');
    }
    const modelClient = new OpenAICompatibleAffiliateMappingModelClient({
      endpoint: modelEndpoint,
      bearerToken: process.env.AFFILIATE_MAPPING_MODEL_TOKEN ?? '',
      model: modelId,
      revision: modelRevisionFromManifest(manifest, modelId),
      timeoutMs: readBoundedIntegerOption(
        '--model-timeout-ms',
        20 * 60 * 1000,
        1_000,
        90 * 60 * 1000,
      ),
    });
    const run = await runInWorktree({
      context,
      modelClient,
      workerId,
      modelManifestSha256,
    });
    if (claim) {
      if (run.result.status === 'DRAFT_READY') {
        if (!releaseClaim) {
          throw new Error('DRAFT_READY model output cannot be terminalized without the claim release service.');
        }
        if (run.result.validation.testsPassed && run.result.validation.scrapePassed) {
          const draft = run.result.draft;
          if (!draft) throw new Error('DRAFT_READY model output has no draft.');
          const completionResult = {
            ...draft,
            status: 'REVIEW_REQUIRED' as const,
            evidenceRunId: run.result.evidenceRunId,
            sportsCatalogSha256: run.result.sportsCatalog.sha256,
            sportDeterminations: draft.sportDeterminations,
            ...(run.result.humanSportResolution
              ? { humanSportResolution: run.result.humanSportResolution }
              : {}),
          };
          const verified = await verifyAffiliateSportCompletion({
            result: completionResult,
            resultKind: 'REVIEW_REQUIRED',
            claimEvidenceContext: claimEvidence.claimEvidenceContext,
            expectedIntakeId: claim.intakeId,
            humanResolution: claimEvidence.humanSportResolution,
          }, {
            loadCurrentCatalog: async () => loadAffiliateSportsCatalogSnapshot(prisma),
            readArtifact: async (_runId, artifactId) => {
              const stored = await readAffiliateSourceIntakeArtifact(claim!.intakeId, artifactId);
              const chunks: Buffer[] = [];
              for await (const chunk of stored.object.stream) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              const artifactWithFinalUrl = stored.artifact as (
                typeof stored.artifact & { finalUrl?: string | null }
              );
              return {
                artifactId: stored.artifact.id,
                intakeId: stored.artifact.intakeId,
                runId: stored.artifact.runId,
                kind: stored.artifact.kind as 'PAGE_HTML' | 'PAGE_MARKDOWN' | 'PAGE_SCREENSHOT',
                sourceUrl: stored.artifact.sourceUrl,
                finalUrl: artifactWithFinalUrl.finalUrl ?? null,
                contentHash: stored.artifact.contentHash,
                bytes: Buffer.concat(chunks),
              };
            },
          });
          await releaseClaim({
            claimHandle: claim.claimHandle,
            reason: `DRAFT_READY evidence verified (${verified.sportDeterminations.length} determinations), but model completion has no package identity; no terminal mapping write was performed.`,
            db: prisma,
          });
        } else {
          await releaseClaim({
            claimHandle: claim.claimHandle,
            reason: run.result.validation.scrapePassed
              ? 'DRAFT_READY requires disposable package identity and completion verification; no terminal mapping write was performed.'
              : 'DRAFT_READY validation did not complete the disposable review scrape; no terminal mapping write was performed.',
            db: prisma,
          });
        }
      } else if (run.result.status === 'REFUSED' && finishClaim) {
        const determinations = run.result.draft?.sportDeterminations ?? [];
        const reasonCodes = Array.from(new Set(determinations.flatMap((determination) => (
          determination.status === 'VARIANT_UNRESOLVED'
            ? ['SPORT_VARIANT_UNRESOLVED']
            : determination.status === 'UNSUPPORTED'
              ? ['SPORT_NOT_IN_CATALOG']
              : determination.status === 'BLACKLISTED'
                ? ['SPORT_BLACKLISTED']
                : []
        ))));
        const completionResult = {
          status: 'HUMAN_REVIEW_REQUIRED' as const,
          evidenceRunId: run.result.evidenceRunId,
          sportsCatalogSha256: run.result.sportsCatalog.sha256,
          sportDeterminations: determinations,
          humanReviewRequired: {
            reasonCodes,
            sourceSportLabels: Array.from(
              new Set(determinations.flatMap((determination) => determination.sourceLabels)),
            ).sort(),
          },
        };
        const persistedHumanResolution = claimEvidence.humanSportResolution;
        if (run.result.humanSportResolution
          && JSON.stringify(run.result.humanSportResolution) !== JSON.stringify(persistedHumanResolution)) {
          throw new Error('Model human sport resolution does not match the authenticated persisted resolution.');
        }
        const verified = await verifyAffiliateSportCompletion({
          result: completionResult,
          resultKind: 'HUMAN_REVIEW_REQUIRED',
          claimEvidenceContext: claimEvidence.claimEvidenceContext,
          expectedIntakeId: claim.intakeId,
          humanResolution: persistedHumanResolution,
        }, {
          loadCurrentCatalog: async () => loadAffiliateSportsCatalogSnapshot(prisma),
          readArtifact: async (_runId, artifactId) => {
            const stored = await readAffiliateSourceIntakeArtifact(claim!.intakeId, artifactId);
            const chunks: Buffer[] = [];
            for await (const chunk of stored.object.stream) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return {
              artifactId: stored.artifact.id,
              intakeId: stored.artifact.intakeId,
              runId: stored.artifact.runId,
              kind: stored.artifact.kind as 'PAGE_HTML' | 'PAGE_MARKDOWN' | 'PAGE_SCREENSHOT',
              sourceUrl: stored.artifact.sourceUrl,
              finalUrl: (
                stored.artifact as typeof stored.artifact & { finalUrl?: string | null }
              ).finalUrl ?? null,
              contentHash: stored.artifact.contentHash,
              bytes: Buffer.concat(chunks),
            };
          },
        });
        await finishClaim({
          claimHandle: claim.claimHandle,
          status: 'HUMAN_REVIEW_REQUIRED',
          resultSummary: {
            ...run.result,
            claimEvidenceContext: claimEvidence.claimEvidenceContext,
            workerResultSha256: stableAgentArtifactSha256(run.result),
            worktree: run.summary.worktree,
            resultPath: run.summary.resultPath,
            verification: verified,
            authority: 'human-review-required',
          },
          db: prisma,
        });
      }
    }
    return run;
  } catch (error) {
    if (claim && claimEvidence && (finishClaim || releaseClaim)) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && error.name === 'SPORT_CATALOG_MISMATCH' && releaseClaim) {
        await releaseClaim({
          claimHandle: claim.claimHandle,
          reason: errorMessage,
          db: prisma,
        });
      } else if (finishClaim) {
        await finishClaim({
          claimHandle: claim.claimHandle,
          status: 'FAILED',
          errorMessage,
          db: prisma,
        });
      }
    }
    throw error;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
};

const main = async () => {
  const fixturePath = readOption('--fixture');
  const run = fixturePath ? await runFixture(fixturePath) : await runModelWorker();
  console.log(JSON.stringify(run.summary, null, 2));
};

main().catch((error) => {
  console.error('[affiliate:mapping:agent] failed', error);
  process.exitCode = 1;
});
