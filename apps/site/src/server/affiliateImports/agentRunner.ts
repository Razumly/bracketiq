import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  affiliateMappingWorkerResultSchema,
  affiliateSourceDraftV2Schema,
  stableAgentArtifactSha256,
  type AffiliateMappingWorkerResult,
} from './agentContracts';
import {
  assertAffiliateMappingJobContextV2,
  type AffiliateMappingJobContext,
  type AffiliateMappingModelClient,
} from './agentModelClient';
import { assertAffiliateSourceDraftSports } from './affiliateSportMapping';
import { renderAffiliateSourceDraft, writeAffiliateGeneratedFiles } from './agentGenerator';

const execFileAsync = promisify(execFile);

export type AffiliateRunnerValidationResult = {
  testsPassed: boolean;
  scrapePassed: boolean;
  warnings: string[];
};

export type AffiliateRunnerValidator = (input: {
  worktreeRoot: string;
  generatedPaths: string[];
}) => Promise<AffiliateRunnerValidationResult>;

const isRefusalMode = (mode: string): boolean => (
  mode === 'BLOCKED' || mode === 'INSUFFICIENT_EVIDENCE'
);

export const runAffiliateMappingDraftJob = async (input: {
  context: AffiliateMappingJobContext;
  workerId: string;
  modelClient: AffiliateMappingModelClient;
  modelManifestSha256: string;
  promptContractVersion: number;
  worktreeRoot: string;
  validate?: AffiliateRunnerValidator;
}): Promise<AffiliateMappingWorkerResult> => {
  const context = assertAffiliateMappingJobContextV2(input.context);
  if (input.workerId !== context.workerId) {
    throw new Error('Runner worker id does not match the claimed v2 context.');
  }
  const startedAt = Date.now();
  const modelStartedAt = Date.now();
  const model = await input.modelClient.modelRevision();
  const rawDraft = await input.modelClient.createDraft(context);
  const modelMs = Date.now() - modelStartedAt;
  const draft = affiliateSourceDraftV2Schema.parse(rawDraft);
  const catalogNames = context.sportsCatalog.sports.map((sport) => sport.name);
  assertAffiliateSourceDraftSports(draft, catalogNames);

  const contextArtifactHashes = new Set(context.artifacts.map((artifact) => artifact.sha256));
  for (const evidence of draft.evidence) {
    if (!contextArtifactHashes.has(evidence.artifactSha256)) {
      throw new Error(`Draft cites evidence outside the job bundle: ${evidence.artifactSha256}`);
    }
  }
  if (
    draft.intakeId !== context.intakeId
    || draft.sourceKey !== context.sourceKey
    || draft.runId !== context.runId
  ) {
    throw new Error('Draft identity does not match the claimed intake job.');
  }
  if (draft.policyDisposition !== context.policyDisposition) {
    throw new Error('Draft policy disposition does not match the reviewed intake policy.');
  }

  const renderStartedAt = Date.now();
  const refusal = isRefusalMode(draft.implementationMode);
  const files = refusal ? [] : renderAffiliateSourceDraft(draft, catalogNames);
  if (files.length) {
    await writeAffiliateGeneratedFiles({
      rootDirectory: input.worktreeRoot,
      files,
    });
  }
  const renderMs = Date.now() - renderStartedAt;
  const validationStartedAt = Date.now();
  const validation = input.validate
    ? await input.validate({
        worktreeRoot: input.worktreeRoot,
        generatedPaths: files.map((file) => file.path),
      })
    : {
        testsPassed: false,
        scrapePassed: false,
        warnings: ['Validation was not executed.'],
      };
  const validationMs = Date.now() - validationStartedAt;
  const draftSha256 = stableAgentArtifactSha256(draft);
  return affiliateMappingWorkerResultSchema.parse({
    schemaVersion: 2,
    contextContractVersion: 2,
    jobId: context.jobId,
    intakeId: context.intakeId,
    status: refusal ? 'REFUSED' : 'DRAFT_READY',
    workerId: input.workerId,
    model,
    modelManifestSha256: input.modelManifestSha256,
    promptContractVersion: input.promptContractVersion,
    evidenceRunId: context.runId,
    evidenceArtifactSha256s: [...contextArtifactHashes].sort(),
    sportsCatalog: context.sportsCatalog,
    ...(context.humanSportResolution ? { humanSportResolution: context.humanSportResolution } : {}),
    draft,
    draftSha256,
    generatedFiles: files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
    })),
    validation: {
      schemaPassed: true,
      testsPassed: validation.testsPassed,
      scrapePassed: validation.scrapePassed,
      warnings: validation.warnings,
    },
    timingsMs: {
      model: modelMs,
      render: renderMs,
      validation: validationMs,
      total: Date.now() - startedAt,
    },
    errorMessage: null,
  });
};

export const createIsolatedAffiliateAgentWorktree = async (input: {
  repositoryRoot: string;
  baseCommit: string;
  parentDirectory?: string;
}): Promise<{ path: string; baseCommit: string }> => {
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const { stdout } = await execFileAsync('git', [
    'rev-parse',
    '--verify',
    `${input.baseCommit}^{commit}`,
  ], {
    cwd: repositoryRoot,
    maxBuffer: 128 * 1024,
  });
  const baseCommit = stdout.trim();
  if (!/^[a-f0-9]{40}$/i.test(baseCommit)) throw new Error('Invalid Git base commit.');
  const parentDirectory = path.resolve(
    input.parentDirectory ?? path.join(os.tmpdir(), 'bracketiq-affiliate-agent-worktrees'),
  );
  await fs.mkdir(parentDirectory, { recursive: true });
  const worktreePath = await fs.mkdtemp(path.join(parentDirectory, 'job-'));
  try {
    await execFileAsync('git', ['worktree', 'add', '--detach', worktreePath, baseCommit], {
      cwd: repositoryRoot,
      maxBuffer: 512 * 1024,
    });
  } catch (error) {
    await fs.rm(worktreePath, { recursive: true, force: true });
    throw error;
  }
  return { path: worktreePath, baseCommit };
};

export const validateAffiliateAgentWorktreeDiff = async (
  worktreeRoot: string,
): Promise<void> => {
  await execFileAsync('git', ['diff', '--check'], {
    cwd: worktreeRoot,
    maxBuffer: 512 * 1024,
  });
  const { stdout } = await execFileAsync('git', ['status', '--short'], {
    cwd: worktreeRoot,
    maxBuffer: 512 * 1024,
  });
  const allowedPrefixes = [
    'apps/site/scripts/setup-',
    'apps/site/src/server/affiliateImports/__tests__/',
    'apps/site/src/server/affiliateImports/generatedSources/',
    'docs/affiliate-source-registry-fragments/',
  ];
  const disallowed = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((relativePath) => !allowedPrefixes.some((prefix) => relativePath.startsWith(prefix)));
  if (disallowed.length) {
    throw new Error(`Agent worktree contains disallowed paths: ${disallowed.join(', ')}`);
  }
};
