import fs from 'node:fs/promises';
import path from 'node:path';
import { AffiliateAgentToolbox } from './agentTooling';
import {
  affiliateMappingJobContextV2Schema,
  assertAffiliateMappingJobContextV2,
  type AffiliateMappingJobContext,
  type AffiliateMappingJobContextV2,
} from './agentModelClient';
import {
  isAffiliateAgentTargetKind,
} from './agentContracts';
import {
  affiliateHumanSportResolutionSchema,
  type AffiliateHumanSportResolution,
} from './affiliateSportDetermination';
import {
  affiliateSportsCatalogSnapshotSchema,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';

type ExportManifest = {
  contextContractVersion?: number;
  sportsCatalog?: unknown;
  sourceEvidence?: {
    intakeId?: string;
    intakeSourceKey?: string;
    runId?: string;
    sportsCatalogSha256?: string;
    complianceStatus?: string | null;
  };
  intake?: {
    id?: string;
    sourceKey?: string;
    complianceStatus?: string | null;
    targetKindHints?: string[];
  };
  artifacts?: Array<{
    id?: string;
    contentHash?: string;
    kind?: string;
    sourceUrl?: string | null;
    finalUrl?: string | null;
  }>;
};
const readManifest = async (directory: string): Promise<ExportManifest> => (
  JSON.parse(await fs.readFile(path.join(path.resolve(directory), 'manifest.json'), 'utf8')) as ExportManifest
);

const reviewedPolicy = (
  value: string | null | undefined,
): 'ALLOWED' | 'BLOCKED' | 'NEEDS_REVIEW' => {
  if (value === 'ALLOWED') return 'ALLOWED';
  if (value === 'BLOCKED') return 'BLOCKED';
  return 'NEEDS_REVIEW';
};

const redactAffiliatePromptExcerpt = (content: string): {
  content: string;
  redacted: boolean;
} => {
  const redacted = content
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      '[redacted-email]',
    )
    .replace(
      /\b(?:sk-|AKIA)[A-Za-z0-9_-]{12,}/g,
      '[redacted-provider-key]',
    )
    .replace(
      /[?&](?:x-amz-[^=&\s]*|sig|signature|token|api[_-]?key|access[_-]?key|auth)=[^&\s"'<>\\)]+/gi,
      '[redacted-signed-parameter]',
    );
  return {
    content: redacted,
    redacted: redacted !== content,
  };
};
export const buildAffiliateMappingJobContextFromExport = async (input: {
  jobId: string;
  evidenceDirectory: string;
  repositoryRoot: string;
  instructionsRevision: string;
  workerId?: string;
  claimedAt?: string;
  pendingHumanSportResolution?: AffiliateHumanSportResolution;
}): Promise<{
  context: AffiliateMappingJobContextV2;
  toolbox: AffiliateAgentToolbox;
}> => {
  const legacy = await buildAffiliateMappingTrainingContextFromExports({
    jobId: input.jobId,
    evidenceDirectories: [input.evidenceDirectory],
    repositoryRoot: input.repositoryRoot,
    instructionsRevision: input.instructionsRevision,
  });
  const manifest = await readManifest(input.evidenceDirectory);
  const sportsCatalog = affiliateSportsCatalogSnapshotSchema.parse(manifest.sportsCatalog);
  if (manifest.sourceEvidence?.sportsCatalogSha256 !== sportsCatalog.sha256) {
    throw new Error('Evidence manifest catalog hash does not match source-evidence provenance.');
  }
  const claimPath = path.join(path.resolve(input.evidenceDirectory), 'mapping-job-context.json');
  let persistedClaim: {
    contextContractVersion?: number;
    jobId?: string;
    intakeId?: string;
    workerId?: string;
    claimedAt?: string;
    evidenceRunId?: string;
    sportsCatalog?: unknown;
    humanSportResolution?: unknown;
  } = {};
  try {
    persistedClaim = JSON.parse(await fs.readFile(claimPath, 'utf8')) as typeof persistedClaim;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const workerId = input.workerId ?? persistedClaim.workerId;
  const claimedAt = input.claimedAt ?? persistedClaim.claimedAt;
  if (!workerId || !claimedAt) {
    throw new Error('A v2 mapping context requires an immutable worker id and claimedAt.');
  }
  if (persistedClaim.jobId && persistedClaim.jobId !== input.jobId) {
    throw new Error('Mapping job context id does not match the requested job.');
  }
  if (persistedClaim.evidenceRunId && persistedClaim.evidenceRunId !== legacy.context.runId) {
    throw new Error('Mapping job context run id does not match the evidence manifest.');
  }
  if (persistedClaim.sportsCatalog) {
    const persistedCatalog = affiliateSportsCatalogSnapshotSchema.parse(persistedClaim.sportsCatalog);
    if (persistedCatalog.sha256 !== sportsCatalog.sha256) {
      throw new Error('Mapping job context catalog does not match the evidence manifest.');
    }
  }
  const artifacts = legacy.context.artifacts.map((artifact) => {
    if (!artifact.artifactId || !artifact.intakeId || !artifact.runId) {
      throw new Error('Every v2 context artifact requires artifactId, intakeId, and runId provenance.');
    }
    return {
      ...artifact,
      artifactId: artifact.artifactId,
      intakeId: artifact.intakeId,
      runId: artifact.runId,
    };
  });
  const candidateContext = {
    ...legacy.context,
    contextContractVersion: 2 as const,
    workerId,
    claimedAt,
    evidenceRunIds: [legacy.context.runId] as [string],
    sportsCatalog,
    ...(input.pendingHumanSportResolution
      ? { humanSportResolution: affiliateHumanSportResolutionSchema.parse(input.pendingHumanSportResolution) }
      : persistedClaim.humanSportResolution
        ? { humanSportResolution: affiliateHumanSportResolutionSchema.parse(persistedClaim.humanSportResolution) }
        : {}),
    artifacts,
  };
  return {
    context: assertAffiliateMappingJobContextV2(candidateContext),
    toolbox: legacy.toolbox,
  };
};

/**
 * Multi-export context materialization is training-only. It intentionally
 * returns a legacy context and is never accepted by the live runner.
 */
export const buildAffiliateMappingTrainingContextFromExports = async (input: {
  jobId: string;
  evidenceDirectories: string[];
  repositoryRoot: string;
  instructionsRevision: string;
}): Promise<{
  context: AffiliateMappingJobContext;
  toolbox: AffiliateAgentToolbox;
}> => {

  if (input.evidenceDirectories.length === 0) {
    throw new Error('At least one evidence export is required.');
  }
  const exports = await Promise.all(input.evidenceDirectories.map(async (evidenceDirectory) => {
    const toolbox = new AffiliateAgentToolbox({
      evidenceDirectory,
      repositoryRoot: input.repositoryRoot,
      writableRoot: input.repositoryRoot,
      allowedRepositoryRoots: [
        'apps/site/src/server/affiliateImports/types.ts',
        'docs/admin-affiliate-scrape-sources.md',
        'docs/admin-affiliate-scraping-execplan.md',
        'docs/affiliate-source-mapping-slm-execplan.md',
      ],
      maxArtifactReadBytes: 3 * 1024,
      maxRepositoryReadBytes: 2 * 1024,
    });
    const [manifest, artifacts] = await Promise.all([
      readManifest(evidenceDirectory),
      toolbox.verifyEvidenceBundle(),
    ]);
    const sourceEvidence = manifest.sourceEvidence ?? {};
    const intake = manifest.intake ?? {};
    const intakeId = sourceEvidence.intakeId ?? intake.id;
    const sourceKey = sourceEvidence.intakeSourceKey ?? intake.sourceKey;
    const runId = sourceEvidence.runId;
    if (!intakeId || !sourceKey || !runId) {
      throw new Error('Evidence export is missing intake id, source key, or run id.');
    }
    return {
      toolbox,
      manifest,
      intakeId,
      sourceKey,
      runId,
      artifacts,
    };
  }));
  const primary = exports[0];
  const toolbox = primary.toolbox;
  const sourceEvidence = primary.manifest.sourceEvidence ?? {};
  const intake = primary.manifest.intake ?? {};
  const intakeId = sourceEvidence.intakeId ?? intake.id;
  const sourceKey = sourceEvidence.intakeSourceKey ?? intake.sourceKey;
  const runId = sourceEvidence.runId;
  if (!intakeId || !sourceKey || !runId) {
    throw new Error('Evidence export is missing intake id, source key, or run id.');
  }

  const artifacts = Array.from(new Map(
    exports.flatMap((exported) => exported.artifacts.map((artifact) => ({
      artifact,
      toolbox: exported.toolbox,
      intakeId: exported.intakeId,
      runId: exported.runId,
    }))).map((row) => [
      [
        row.artifact.kind,
        row.artifact.sha256,
        row.artifact.sourceUrl ?? row.artifact.finalUrl ?? '',
        row.intakeId,
        row.runId,
      ].join('|'),
      row,
    ]),
  ).values());
  const policyEvidence = artifacts
    .filter(({ artifact }) => artifact.kind === 'POLICY_NOTE' || artifact.kind === 'ROBOTS')
    .sort((left, right) => (
      left.artifact.kind.localeCompare(right.artifact.kind)
      || left.artifact.sha256.localeCompare(right.artifact.sha256)
    ))
    .slice(0, 2);
  const contentEvidence = Array.from(new Map(
    artifacts
      .filter(({ artifact }) => (
        artifact.kind === 'PAGE_MARKDOWN' || artifact.kind === 'PAGE_HTML'
      ))
      .sort((left, right) => (
        Number(right.artifact.kind === 'PAGE_HTML') - Number(left.artifact.kind === 'PAGE_HTML')
        || (left.artifact.sourceUrl ?? left.artifact.finalUrl ?? '').localeCompare(
          right.artifact.sourceUrl ?? right.artifact.finalUrl ?? '',
        )
        || left.artifact.sha256.localeCompare(right.artifact.sha256)
      ))
      .map((row) => [
        row.artifact.sourceUrl ?? row.artifact.finalUrl ?? row.artifact.sha256,
        row,
      ]),
  ).values()).slice(0, 9);
  const selected = Array.from(new Map(
    [...policyEvidence, ...contentEvidence].map((row) => [row.artifact.sha256, row]),
  ).values());
  const evidenceExcerpts = [];
  for (const { artifact, toolbox: artifactToolbox } of selected) {
    try {
      const excerpt = await artifactToolbox.readEvidenceArtifact({
        artifactSha256: artifact.sha256,
        length: artifact.kind === 'PAGE_HTML' ? 3 * 1024 : 2 * 1024,
      });
      const promptExcerpt = redactAffiliatePromptExcerpt(excerpt.content);
      evidenceExcerpts.push({
        kind: artifact.kind,
        sha256: artifact.sha256,
        pageUrl: artifact.sourceUrl ?? artifact.finalUrl ?? '',
        content: promptExcerpt.content,
        truncated: excerpt.truncated || promptExcerpt.redacted,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Binary evidence')) throw error;
    }
  }

  const repositoryPaths = [
    'apps/site/src/server/affiliateImports/types.ts',
    'docs/admin-affiliate-scraping-execplan.md',
    'docs/affiliate-source-mapping-slm-execplan.md',
  ];
  const repositoryExcerpts = [];
  for (const repositoryPath of repositoryPaths) {
    try {
      const excerpt = await toolbox.readRepositoryFile({
        relativePath: repositoryPath,
        length: 2 * 1024,
      });
      repositoryExcerpts.push({
        path: repositoryPath,
        content: excerpt.content,
        truncated: excerpt.truncated,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  return {
    context: {
      jobId: input.jobId,
      intakeId,
      sourceKey,
      runId,
      evidenceRunIds: Array.from(new Set(exports.map((exported) => exported.runId))).sort(),
      policyDisposition: reviewedPolicy(
        sourceEvidence.complianceStatus ?? intake.complianceStatus,
      ),
      targetKindHints: (intake.targetKindHints ?? [])
        .filter(isAffiliateAgentTargetKind),
      artifacts: artifacts.map((row) => ({
        artifactId: row.artifact.artifactId ?? '',
        kind: row.artifact.kind,
        sha256: row.artifact.sha256,
        pageUrl: row.artifact.sourceUrl ?? row.artifact.finalUrl ?? '',
        byteLength: row.artifact.sizeBytes ?? undefined,
        intakeId: row.intakeId,
        runId: row.runId,
      })),
      evidenceExcerpts,
      repositoryExcerpts,
      instructionsRevision: input.instructionsRevision,
    },
    toolbox,
  };
};

/**
 * Live model execution accepts one exact export only. Multi-export
 * materialization must call buildAffiliateMappingTrainingContextFromExports.
 */
export const buildAffiliateMappingJobContextFromExports = async (input: {
  jobId: string;
  evidenceDirectories: string[];
  repositoryRoot: string;
  instructionsRevision: string;
  workerId?: string;
  claimedAt?: string;
}): Promise<{
  context: AffiliateMappingJobContextV2;
  toolbox: AffiliateAgentToolbox;
}> => {
  if (input.evidenceDirectories.length !== 1) {
    throw new Error('Live v2 mapping context requires exactly one evidence export.');
  }
  return buildAffiliateMappingJobContextFromExport({
    ...input,
    evidenceDirectory: input.evidenceDirectories[0],
  });
};
