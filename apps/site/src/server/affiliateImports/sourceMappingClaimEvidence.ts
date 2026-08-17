import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { prisma } from '@/lib/prisma';
import {
  buildAffiliateSportsCatalogSnapshot,
  loadAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import {
  affiliateHumanSportResolutionSchema,
  type AffiliateHumanSportResolution,
} from './affiliateSportDetermination';
import {
  buildAffiliateSourceEvidence,
  renderAffiliateSourceEvidenceMarkdown,
  selectAffiliateSourceIntakeExportRun,
} from './sourceIntakeExport';
import {
  claimNextAffiliateSourceIntakeForMapping,
  releaseAffiliateSourceMappingClaim,
  storeAffiliateSourceMappingClaimEvidenceContext,
  type AffiliateSourceMappingClaimEvidenceContext,
  type AffiliateSourceMappingClaimHandle,
} from './sourceMappingQueue';
import {
  getAffiliateSourceIntakeContext,
} from './sourceIntake';
import {
  readAffiliateSourceIntakeArtifact,
} from './sourceIntakeArtifacts';

type JsonRecord = Record<string, unknown>;

type SourceIntakeContext = Awaited<ReturnType<typeof getAffiliateSourceIntakeContext>>;

type ExportedArtifact = JsonRecord & {
  id: string;
  kind: string;
  contentHash: string;
  sourceUrl?: string | null;
  finalUrl?: string | null;
  localPath: string;
};

export type AffiliateSourceMappingClaimEvidenceDependencies = {
  db?: unknown;
  repositoryRoot?: string;
  outputRoot?: string;
  now?: () => Date;
  loadCatalog?: (db: unknown, capturedAt?: string) => Promise<AffiliateSportsCatalogSnapshot>;
  loadContext?: (intakeId: string, runId?: string | null, db?: unknown) => Promise<SourceIntakeContext>;
  readArtifact?: (intakeId: string, artifactId: string, db?: unknown) => Promise<Awaited<ReturnType<typeof readAffiliateSourceIntakeArtifact>>>;
  fileExists?: (filePath: string) => Promise<boolean>;
};

export type AcquireAffiliateSourceMappingClaimEvidenceInput = {
  workerId: string;
  intakeId?: string;
  runId?: string;
  leaseMs?: number;
  environment?: 'live' | 'local';
  outputDirectory?: string;
};

export type AffiliateSourceMappingClaimEvidenceResult = {
  claimHandle: AffiliateSourceMappingClaimHandle;
  jobId: string;
  intakeId: string;
  sourceKey: string;
  evidenceRunId: string;
  runId: string;
  sportsCatalog: AffiliateSportsCatalogSnapshot;
  sourceEvidence: ReturnType<typeof buildAffiliateSourceEvidence>;
  claimEvidenceContext: AffiliateSourceMappingClaimEvidenceContext;
  humanSportResolution?: AffiliateHumanSportResolution;
  outputDirectory: string;
  manifestPath: string;
  sourceEvidencePath: string;
  jobContextPath: string;
  resumed: boolean;
};

const EXPORTABLE_RUN_STATUSES = new Set(['SUCCEEDED', 'PARTIAL', 'BLOCKED']);

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const safeName = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120) || 'artifact';

const extensionFor = (artifact: JsonRecord): string => {
  const mime = String(artifact.mimeType ?? '').toLowerCase();
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('svg')) return '.svg';
  if (mime.includes('html')) return '.html';
  if (mime.includes('markdown')) return '.md';
  if (mime.includes('json')) return '.json';
  return '.txt';
};

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const defaultLoadContext = async (
  intakeId: string,
  runId: string | null | undefined,
  db: unknown,
): Promise<SourceIntakeContext> => {
  if (!db) return getAffiliateSourceIntakeContext(intakeId, runId);
  const client = db as JsonRecord;
  const intakes = client.affiliateSourceIntakes as any;
  const pages = client.affiliateSourceIntakePages as any;
  const runs = client.affiliateSourceIntakeRuns as any;
  const artifacts = client.affiliateSourceIntakeArtifacts as any;
  const intake = await intakes.findUnique({ where: { id: intakeId } });
  if (!intake) throw new Error('Affiliate source intake not found.');
  const [pageRows, runRows] = await Promise.all([
    pages.findMany({ where: { intakeId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] }),
    runs.findMany({ where: { intakeId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const selectedRunId = runId?.trim() || runRows[0]?.id || null;
  if (!selectedRunId) {
    return { intake, pages: pageRows, runs: runRows, selectedRunId: null, artifacts: [], policyKey: null, domainPolicy: null, relatedDiscoveryResults: [] } as SourceIntakeContext;
  }
  const selectedRun = runRows.find((row: JsonRecord) => row.id === selectedRunId);
  if (!selectedRun) throw new Error(`Affiliate intake run ${selectedRunId} was not found for intake ${intakeId}.`);
  const artifactRows = await artifacts.findMany({ where: { intakeId, runId: selectedRunId }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
  return { intake, pages: pageRows, runs: runRows, selectedRunId, artifacts: artifactRows, policyKey: null, domainPolicy: null, relatedDiscoveryResults: [] } as SourceIntakeContext;
};

const hasCompleteExport = async (
  directory: string,
  fileExists: (filePath: string) => Promise<boolean>,
): Promise<boolean> => Promise.all([
  'manifest.json',
  'source-evidence.json',
  'sports-catalog.json',
  'mapping-job-context.json',
].map((name) => fileExists(path.join(directory, name)))).then((results) => results.every(Boolean));

const artifactUrl = (artifact: JsonRecord): string | null => {
  const sourceUrl = typeof artifact.sourceUrl === 'string' ? artifact.sourceUrl : null;
  const finalUrl = typeof artifact.finalUrl === 'string' ? artifact.finalUrl : null;
  return sourceUrl || finalUrl;
};

const materializeClaimEvidence = async (
  input: {
    claimHandle: AffiliateSourceMappingClaimHandle;
    intakeId: string;
    sourceKey: string;
    pendingHumanSportResolution?: AffiliateHumanSportResolution;
    environment: 'live' | 'local';
    outputDirectory: string;
    persistedCatalog?: AffiliateSportsCatalogSnapshot;
    requestedRunId?: string;
  },
  dependencies: AffiliateSourceMappingClaimEvidenceDependencies,
): Promise<AffiliateSourceMappingClaimEvidenceResult> => {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now?.() ?? new Date();
  const loadContext = dependencies.loadContext ?? defaultLoadContext;
  const readArtifact = dependencies.readArtifact ?? (async (intakeId: string, artifactId: string) => readAffiliateSourceIntakeArtifact(intakeId, artifactId));
  const loadCatalog = dependencies.loadCatalog ?? ((queryable: unknown, capturedAt?: string) => loadAffiliateSportsCatalogSnapshot(queryable as any, capturedAt));
  const context = await loadContext(input.intakeId, input.requestedRunId, db);
  const run = selectAffiliateSourceIntakeExportRun(context.runs, input.requestedRunId);
  if (!run || !EXPORTABLE_RUN_STATUSES.has(run.status)) {
    throw new Error('No exportable affiliate intake run was found for this mapping claim.');
  }
  if (input.requestedRunId && run.id !== input.requestedRunId) {
    throw new Error(`Requested intake run ${input.requestedRunId} was not found for intake ${input.intakeId}.`);
  }
  const sportsCatalog = input.persistedCatalog ?? await loadCatalog(db, now.toISOString());
  const pendingHumanSportResolution = input.pendingHumanSportResolution
    && input.pendingHumanSportResolution.catalogSha256 === sportsCatalog.sha256
    ? input.pendingHumanSportResolution
    : undefined;
  await mkdir(input.outputDirectory, { recursive: true });
  const exportedArtifacts: ExportedArtifact[] = [];
  for (const [index, artifact] of context.artifacts.entries()) {
    const artifactRecord = artifact as unknown as JsonRecord;
    const artifactId = String(artifactRecord.id);
    const kind = String(artifactRecord.kind);
    const filename = `${String(index + 1).padStart(3, '0')}-${safeName(kind)}-${safeName(artifactId)}${extensionFor(artifactRecord)}`;
    const localPath = path.join(input.outputDirectory, filename);
    const stored = await readArtifact(input.intakeId, artifactId, db);
    await pipeline(stored.object.stream, createWriteStream(localPath));
    exportedArtifacts.push({
      ...artifactRecord,
      id: artifactId,
      kind,
      contentHash: String(artifactRecord.contentHash ?? stored.artifact.contentHash),
      localPath: filename,
      file: {
        originalName: stored.file.originalName,
        mimeType: stored.file.mimeType,
        sizeBytes: stored.file.sizeBytes,
      },
    });
  }
  const sourceEvidence = buildAffiliateSourceEvidence({
    environment: input.environment,
    intake: context.intake,
    run,
    pages: context.pages,
    artifacts: exportedArtifacts,
    sportsCatalog,
  });
  if (sourceEvidence.sportsCatalogSha256 !== sportsCatalog.sha256) {
    throw new Error('Affiliate source evidence catalog hash does not match the claim snapshot.');
  }
  const manifest = {
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    sourceEvidence,
    sportsCatalog,
    intake: context.intake,
    pages: context.pages,
    run,
    artifacts: exportedArtifacts,
  };
  const artifactIds = exportedArtifacts.map((artifact) => artifact.id).sort();
  const claimEvidenceContext: AffiliateSourceMappingClaimEvidenceContext = {
    schemaVersion: 1,
    jobId: input.claimHandle.jobId,
    intakeId: input.intakeId,
    workerId: input.claimHandle.workerId,
    claimedAt: input.claimHandle.claimedAt,
    evidenceRunId: run.id,
    sportsCatalogSha256: sportsCatalog.sha256,
    sportsCatalog: sportsCatalog as unknown as JsonRecord,
    sourceEvidence: sourceEvidence as unknown as JsonRecord,
    evidenceDirectory: input.outputDirectory,
    manifestPath: path.join(input.outputDirectory, 'manifest.json'),
    sourceEvidencePath: path.join(input.outputDirectory, 'source-evidence.json'),
    artifactIds,
  };
  const jobContext = {
    schemaVersion: 2,
    contextContractVersion: 2,
    claimHandle: input.claimHandle,
    jobId: input.claimHandle.jobId,
    intakeId: input.intakeId,
    sourceKey: input.sourceKey,
    evidenceRunId: run.id,
    sportsCatalog,
    sportsCatalogSha256: sportsCatalog.sha256,
    ...(pendingHumanSportResolution
      ? { humanSportResolution: pendingHumanSportResolution }
      : {}),
    sourceEvidence,
    artifacts: exportedArtifacts.map((artifact) => ({
      artifactId: artifact.id,
      runId: run.id,
      artifactSha256: artifact.contentHash,
      artifactKind: artifact.kind,
      pageUrl: artifactUrl(artifact),
      localPath: artifact.localPath,
    })),
  };
  await Promise.all([
    writeFile(path.join(input.outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    writeFile(path.join(input.outputDirectory, 'source-evidence.json'), `${JSON.stringify(sourceEvidence, null, 2)}\n`, 'utf8'),
    writeFile(path.join(input.outputDirectory, 'sports-catalog.json'), `${JSON.stringify(sportsCatalog, null, 2)}\n`, 'utf8'),
    writeFile(path.join(input.outputDirectory, 'SOURCE-EVIDENCE.md'), renderAffiliateSourceEvidenceMarkdown(sourceEvidence), 'utf8'),
    writeFile(path.join(input.outputDirectory, 'mapping-job-context.json'), `${JSON.stringify(jobContext, null, 2)}\n`, 'utf8'),
  ]);
  await storeAffiliateSourceMappingClaimEvidenceContext({
    claimHandle: input.claimHandle,
    context: claimEvidenceContext,
    db,
  });
  return {
    claimHandle: input.claimHandle,
    jobId: input.claimHandle.jobId,
    intakeId: input.intakeId,
    sourceKey: input.sourceKey,
    evidenceRunId: run.id,
    ...(pendingHumanSportResolution
      ? { humanSportResolution: pendingHumanSportResolution }
      : {}),
    runId: run.id,
    sportsCatalog,
    sourceEvidence,
    claimEvidenceContext,
    outputDirectory: input.outputDirectory,
    manifestPath: path.join(input.outputDirectory, 'manifest.json'),
    sourceEvidencePath: path.join(input.outputDirectory, 'source-evidence.json'),
    jobContextPath: path.join(input.outputDirectory, 'mapping-job-context.json'),
    resumed: false,
  };
};

export const acquireAffiliateSourceMappingClaimEvidence = async (
  input: AcquireAffiliateSourceMappingClaimEvidenceInput,
  dependencies: AffiliateSourceMappingClaimEvidenceDependencies = {},
): Promise<AffiliateSourceMappingClaimEvidenceResult | null> => {
  const db = dependencies.db ?? prisma;
  const claim = await claimNextAffiliateSourceIntakeForMapping({
    workerId: input.workerId,
    intakeId: input.intakeId,
    leaseMs: input.leaseMs,
    db,
  });
  if (!claim) return null;
  const claimHandle = claim.claimHandle as AffiliateSourceMappingClaimHandle;
  try {
    const sourceKey = claim.sourceKey;
    const outputDirectory = input.outputDirectory
      ?? path.resolve(dependencies.outputRoot ?? 'output', 'affiliate-intakes', safeName(sourceKey), safeName(claim.jobId));
    const fileExists = dependencies.fileExists ?? (async (filePath: string) => {
      try {
        await access(filePath);
        return true;
      } catch {
        return false;
      }
    });
    const jobs = (db as JsonRecord).affiliateSourceMappingJobs as any;
    const currentJob = await jobs.findUnique({ where: { id: claim.jobId } });
    const currentEnvelope = recordValue(currentJob?.resultSummary);
    const persistedHumanSportResolution = (() => {
      const candidate = currentEnvelope.humanSportResolution;
      if (!candidate) return undefined;
      const parsed = affiliateHumanSportResolutionSchema.parse(candidate);
      return parsed.state === 'PENDING' ? parsed : undefined;
    })();
    const persistedContext = recordValue(currentEnvelope.claimEvidenceContext) as Partial<AffiliateSourceMappingClaimEvidenceContext>;
    if (
      persistedContext.jobId
      && (persistedContext.jobId !== claimHandle.jobId
        || persistedContext.workerId !== claimHandle.workerId
        || persistedContext.claimedAt !== claimHandle.claimedAt)
    ) {
      throw new Error('Active mapping job contains evidence for a different claim generation.');
    }
    if (persistedContext.jobId) {
      const persistedCatalog = persistedContext.sportsCatalog as AffiliateSportsCatalogSnapshot | undefined;
      if (!persistedCatalog) throw new Error('Persisted claim evidence is missing its sports catalog snapshot.');
      const loadCatalog = dependencies.loadCatalog ?? ((queryable: unknown, capturedAt?: string) => loadAffiliateSportsCatalogSnapshot(queryable as any, capturedAt));
      const freshCatalog = await loadCatalog(db, (dependencies.now?.() ?? new Date()).toISOString());
      if (freshCatalog.sha256 !== persistedContext.sportsCatalogSha256) {
        await releaseAffiliateSourceMappingClaim({
          claimHandle,
          reason: 'SPORT_CATALOG_MISMATCH: claim released for fresh catalog acquisition.',
          db,
        });
        return null;
      }
      const complete = await hasCompleteExport(outputDirectory, fileExists);
      if (complete) {
        const sourceEvidence = (persistedContext.sourceEvidence ?? {}) as ReturnType<typeof buildAffiliateSourceEvidence>;
        return {
          claimHandle,
          jobId: claimHandle.jobId,
          intakeId: claim.intakeId,
          sourceKey,
          evidenceRunId: String(persistedContext.evidenceRunId),
          ...(persistedHumanSportResolution
            ? { humanSportResolution: persistedHumanSportResolution }
            : {}),
          runId: String(persistedContext.evidenceRunId),
          sportsCatalog: persistedCatalog,
          sourceEvidence,
          claimEvidenceContext: persistedContext as AffiliateSourceMappingClaimEvidenceContext,
          outputDirectory,
          manifestPath: String(persistedContext.manifestPath ?? path.join(outputDirectory, 'manifest.json')),
          sourceEvidencePath: String(persistedContext.sourceEvidencePath ?? path.join(outputDirectory, 'source-evidence.json')),
          jobContextPath: path.join(outputDirectory, 'mapping-job-context.json'),
          resumed: true,
        };
      }
      return await materializeClaimEvidence({
        claimHandle,
        intakeId: claim.intakeId,
        sourceKey,
        environment: input.environment ?? 'local',
        outputDirectory,
        pendingHumanSportResolution: persistedHumanSportResolution,
        persistedCatalog,
        requestedRunId: String(persistedContext.evidenceRunId),
      }, dependencies);
    }
    return await materializeClaimEvidence({
      claimHandle,
      intakeId: claim.intakeId,
      sourceKey,
      environment: input.environment ?? 'local',
      outputDirectory,
      pendingHumanSportResolution: persistedHumanSportResolution,
      requestedRunId: input.runId,
    }, dependencies);
  } catch (error) {
    try {
      await releaseAffiliateSourceMappingClaim({
        claimHandle,
        reason: `Claim evidence acquisition failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
        db,
      });
    } catch (releaseError) {
      throw new Error(
        `Claim evidence acquisition failed and claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
    throw error;
  }
};

export const readPersistedAffiliateSourceMappingClaimContext = async (
  directory: string,
): Promise<JsonRecord> => JSON.parse(await readFile(path.join(directory, 'mapping-job-context.json'), 'utf8')) as JsonRecord;

export { buildAffiliateSportsCatalogSnapshot, storeAffiliateSourceMappingClaimEvidenceContext };
