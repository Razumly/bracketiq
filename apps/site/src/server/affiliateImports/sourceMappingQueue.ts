import type {
  AffiliateSupplyClient,
  AffiliateSupplyDatabase,
} from './affiliateSupplyPersistence';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  affiliateSupplyDatabase,
  ensureAffiliateSupplySource,
  executeAffiliateSupplyLifecycleCommand,
  linkAffiliateSupplyRecord,
  loadActiveAffiliateSupplyContract,
  planAffiliateReplenishmentFromDatabase,
} from './affiliateSupplyPersistence';
import {
  AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
  affiliateEventDateTimeReviewSchema,
} from './affiliateIngestionSchemas';
import {
  appendAffiliateMappingResultHistory,
} from './affiliateMappingResultHistory';
import {
  affiliateHumanSportResolutionSchema,
} from './affiliateSportDetermination';
export type AffiliateSourceMappingClaimHandle = {
  jobId: string;
  workerId: string;
  claimedAt: string;
};

export type AffiliateSourceMappingClaimEvidenceContext = {
  schemaVersion: 1;
  jobId: string;
  intakeId: string;
  workerId: string;
  claimedAt: string;
  evidenceRunId: string;
  sportsCatalogSha256: string;
  sportsCatalog: Record<string, unknown>;
  sourceEvidence: Record<string, unknown>;
  evidenceDirectory?: string | null;
  manifestPath?: string | null;
  sourceEvidencePath?: string | null;
  artifactIds: string[];
};

const claimHandleFromJob = (job: any): AffiliateSourceMappingClaimHandle => {
  if (!job?.id || !job.workerId || !(job.claimedAt instanceof Date || typeof job.claimedAt === 'string')) {
    throw new Error('Affiliate source mapping job has no active claim generation.');
  }
  return {
    jobId: String(job.id),
    workerId: String(job.workerId),
    claimedAt: new Date(job.claimedAt).toISOString(),
  };
};


const DEFAULT_LEASE_MS = 2 * 60 * 60 * 1000;
const ACTIVE_MAPPING_JOB_STATUSES = ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED'] as const;

const mappingDb = (client: unknown = prisma) => {
  const db = client as Record<string, any>;
  return {
    intakes: db.affiliateSourceIntakes,
    jobs: db.affiliateSourceMappingJobs,
    approvals: db.affiliateApprovalJobs,
    transaction: typeof db.$transaction === 'function'
      ? db.$transaction.bind(db)
      : null,
  };
};
type AffiliateMappingLifecycleReplay = Readonly<{
  supplySourceId: string;
  command: 'RECORD_MAPPING';
  authority: 'MAPPING_PRODUCER';
  expectedLifecycleGeneration: number;
  idempotencyKey: string;
  request: Record<string, unknown>;
  actorKind: 'MAPPING_PRODUCER';
  actorId: string;
  executingAgentId: string;
}>;
const LIFECYCLE_MAPPING_JOB_STATUSES = new Set([
  'REVIEW_REQUIRED',
  'EXPANDED',
  'APPROVED',
]);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const archiveClaimEvidenceContext = (
  resultSummary: unknown,
  reason: string,
  archivedAt: Date,
): Record<string, unknown> => {
  const envelope = recordValue(resultSummary);
  const active = recordValue(envelope.claimEvidenceContext);
  if (!active.jobId) return envelope;
  const history = Array.isArray(envelope.claimEvidenceHistory)
    ? envelope.claimEvidenceHistory
    : [];
  return {
    ...envelope,
    claimEvidenceContext: null,
    claimEvidenceHistory: [
      ...history,
      {
        ...active,
        archivedAt: archivedAt.toISOString(),
        archiveReason: reason,
      },
    ],
  };
};

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(stringValues);
  const single = stringValue(value);
  return single ? [single] : [];
};

const hasEventDateTimeRemediationContext = (value: unknown): boolean => {
  const envelope = recordValue(value);
  const directContexts = [
    envelope.remediationContext,
    envelope.remediationContexts,
    envelope.cohortKey,
    envelope.cohortKeys,
    recordValue(envelope.repairContext).remediationContext,
    recordValue(envelope.repairContext).remediationContexts,
    recordValue(envelope.repairContext).cohortKey,
    recordValue(envelope.repairContext).cohortKeys,
  ].flatMap(stringValues);
  if (directContexts.includes(AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT)) return true;
  return [envelope.mappingRepairHistory, envelope.mappingFullReviewHistory]
    .flatMap((history) => (Array.isArray(history) ? history : []))
    .some((entry) => {
      const record = recordValue(entry);
      return [
        record.remediationContext,
        record.remediationContexts,
        record.cohortKey,
        record.cohortKeys,
      ]
        .flatMap(stringValues)
        .includes(AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT);
    });
};

const mappingLifecycleEvidenceRefs = (
  job: Record<string, unknown>,
  resultSummary: Record<string, unknown>,
  mappingId: string,
): string[] => {
  const claimContext = recordValue(recordValue(job.resultSummary).claimEvidenceContext);
  const result = recordValue(resultSummary.result);
  return Array.from(new Set([
    ...stringValues(resultSummary.evidenceRefs),
    ...stringValues(result.evidenceRefs),
    ...stringValues(claimContext.evidenceRefs),
    ...stringValues(claimContext.artifactIds).map((artifactId) => `artifact:${artifactId}`),
    stringValue(claimContext.evidenceRunId) ? `evidence-run:${claimContext.evidenceRunId}` : null,
    `mapping-job:${String(job.id)}`,
    `intake:${String(job.intakeId)}`,
    `mapping:${mappingId}`,
  ].filter((value): value is string => Boolean(value))));
};

type TerminalMappingLifecycleReplayInput = Readonly<{
  job: Record<string, unknown>;
  claimHandle: AffiliateSourceMappingClaimHandle;
  status: string;
  sourceId: string | null;
  mappingId: string | null;
  database: AffiliateSupplyDatabase;
}>;

const hasExactTerminalMappingCompletion = (
  input: TerminalMappingLifecycleReplayInput,
): boolean => {
  if (
    !LIFECYCLE_MAPPING_JOB_STATUSES.has(input.status)
    || input.job.status !== input.status
    || input.job.workerId !== input.claimHandle.workerId
    || !input.sourceId
    || !input.mappingId
  ) return false;
  const claimedAt = input.job.claimedAt instanceof Date
    ? input.job.claimedAt
    : new Date(String(input.job.claimedAt));
  return claimedAt.getTime() === new Date(input.claimHandle.claimedAt).getTime();
};

const terminalReplayDelegatesAvailable = (database: AffiliateSupplyDatabase): boolean => [
  database.supplySources?.findUnique,
  database.sources?.findUnique,
  database.intakes?.findUnique,
  database.contractManifests?.findFirst,
  database.transitions?.findUnique,
  database.transitions?.findFirst,
  database.transitions?.create,
].every((delegate) => typeof delegate === 'function');

const terminalReplayIntakeFor = async (
  database: AffiliateSupplyDatabase,
  intakeId: string | null,
) => {
  if (!intakeId || typeof database.intakes?.findUnique !== 'function') return null;
  return database.intakes.findUnique({ where: { id: intakeId } });
};

const terminalReplaySourceFor = async (
  database: AffiliateSupplyDatabase,
  sourceId: string,
) => {
  if (typeof database.sources?.findUnique !== 'function') return null;
  return database.sources.findUnique({ where: { id: sourceId } });
};

const terminalReplayIdentityFor = (
  input: TerminalMappingLifecycleReplayInput,
): { sourceId: string; mappingId: string } => ({
  sourceId: input.sourceId ?? '',
  mappingId: input.mappingId ?? '',
});

const terminalReplaySupplySourceIdFor = (
  job: Record<string, unknown>,
  intake: unknown,
  source: unknown,
): string | null => stringValue(job.supplySourceId)
  ?? stringValue(recordValue(intake).supplySourceId)
  ?? stringValue(recordValue(source).supplySourceId);

const buildTerminalMappingLifecycleReplay = async (
  input: TerminalMappingLifecycleReplayInput,
): Promise<AffiliateMappingLifecycleReplay | null> => {
  if (!terminalReplayDelegatesAvailable(input.database)) {
    throw new Error('Affiliate mapping completion lifecycle delegates are unavailable.');
  }
  const { sourceId, mappingId } = terminalReplayIdentityFor(input);
  const intakeId = stringValue(input.job.intakeId);
  const intake = await terminalReplayIntakeFor(input.database, intakeId);
  if (intakeId && !intake) {
    throw new Error('Affiliate source mapping intake not found for lifecycle replay.');
  }
  const source = await terminalReplaySourceFor(input.database, sourceId);
  if (!source) {
    throw new Error('Affiliate scrape source not found for lifecycle replay.');
  }
  const sourceSupplySourceId = stringValue(recordValue(source).supplySourceId);
  const intakeSupplySourceId = stringValue(recordValue(intake).supplySourceId);
  const supplySourceId = terminalReplaySupplySourceIdFor(input.job, intake, source);
  if (
    !supplySourceId
    || !sourceSupplySourceId
    || sourceSupplySourceId !== supplySourceId
    || (intakeSupplySourceId !== null && intakeSupplySourceId !== supplySourceId)
  ) {
    throw new Error('Affiliate mapping completion source is not bound to its Supply Source root.');
  }
  const root = await input.database.supplySources.findUnique({
    where: { id: supplySourceId },
  });
  if (!root) throw new Error('Affiliate Supply Source root not found for mapping completion replay.');
  const resultSummary = recordValue(input.job.resultSummary);
  return {
    supplySourceId,
    command: 'RECORD_MAPPING',
    authority: 'MAPPING_PRODUCER',
    expectedLifecycleGeneration: Number(root.lifecycleGeneration ?? 0),
    idempotencyKey: `mapping:${String(input.job.id)}:${input.claimHandle.claimedAt}:${input.status}`,
    request: {
      sourceId,
      mappingId,
      mappingJobId: String(input.job.id),
      evidenceRefs: mappingLifecycleEvidenceRefs(input.job, resultSummary, mappingId),
    },
    actorKind: 'MAPPING_PRODUCER',
    actorId: input.claimHandle.workerId,
    executingAgentId: input.claimHandle.workerId,
  };
};

const replayTerminalMappingLifecycle = async (
  input: TerminalMappingLifecycleReplayInput,
): Promise<boolean> => {
  if (!hasExactTerminalMappingCompletion(input)) return false;
  const lifecycleReplay = await buildTerminalMappingLifecycleReplay(input);
  if (!lifecycleReplay) return false;
  await executeAffiliateSupplyLifecycleCommand({
    ...lifecycleReplay,
    db: input.database,
    now: new Date(),
  });
  return true;
};

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 'P2002')
);
const supplyDatabaseForOptions = (client: unknown): AffiliateSupplyDatabase => {
  const candidate = client as Record<string, unknown> | undefined;
  return candidate?.supplySources
    ? candidate as unknown as AffiliateSupplyDatabase
    : affiliateSupplyDatabase(client as AffiliateSupplyClient | undefined);
};

const mappingAdmissionDelegatesAvailable = (database: AffiliateSupplyDatabase): boolean => [
  database.supplySources?.findMany,
  database.contractManifests?.findFirst,
  database.mappingJobs?.count,
  database.approvals?.count,
  database.gatewayClaims?.count,
  database.demands?.findMany,
  database.waves?.findMany,
  database.campaigns?.findMany,
].every((delegate) => typeof delegate === 'function');

const mappingAdmissionCohortsFor = (
  roots: readonly { rolloutCohort?: string | null }[],
): string[] => Array.from(new Set(
  roots.map((root) => root.rolloutCohort).filter(Boolean),
)) as string[];

const mappingAdmissionPlansFor = async (
  database: AffiliateSupplyDatabase,
  cohorts: readonly string[],
  now: Date,
) => {
  const activeContracts = await Promise.all(
    (cohorts.length ? cohorts : [undefined]).map((rolloutCohort) => (
      loadActiveAffiliateSupplyContract({ db: database, rolloutCohort })
    )),
  );
  const isContractSafe = process.env.AFFILIATE_SUPPLY_CONTRACT_SAFE?.trim().toLowerCase() !== 'false';
  return Promise.all(activeContracts.map((activeContract) => planAffiliateReplenishmentFromDatabase({
    contract: activeContract.policy,
    isContractSafe,
    db: database,
    now,
  })));
};

const mappingAdmissionPaused = async (options: { db?: unknown; now: Date }): Promise<boolean> => {
  const database = supplyDatabaseForOptions(options.db);
  if (!mappingAdmissionDelegatesAvailable(database)) return false;
  try {
    const roots = await database.supplySources.findMany({
      where: { isExcluded: false },
      select: { rolloutCohort: true },
    });
    const cohorts = mappingAdmissionCohortsFor(roots);
    const plans = await mappingAdmissionPlansFor(database, cohorts, options.now);
    return plans.some((plan) => plan.isMappingPaused);
  } catch {
    return true;
  }
};


const intakeSupplySourceById = async (
  database: AffiliateSupplyDatabase,
  supplySourceId: string | null | undefined,
): Promise<any | null> => {
  if (!supplySourceId) return null;
  const linked = await database.supplySources.findUnique({ where: { id: supplySourceId } });
  return linked ?? null;
};

const intakeLinkedPage = async (
  database: AffiliateSupplyDatabase,
  intake: any,
) => database.pages?.findFirst
  ? database.pages.findFirst({
    where: { intakeId: intake.id, supplySourceId: { not: null }, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  })
  : null;

const createIntakeSupplySource = async (
  database: AffiliateSupplyDatabase,
  intake: any,
  linkedPage: any,
  now: Date,
) => {
  const requestedUrl = String(linkedPage?.url ?? intake?.baseUrl ?? '').trim();
  if (!requestedUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(requestedUrl);
  } catch {
    return null;
  }
  return ensureAffiliateSupplySource({
    requestedUrl,
    resolvedCanonicalUrl: requestedUrl,
    isRedirectVerified: true,
    operatorDomain: parsed.hostname,
    targetKind: Array.isArray(intake.targetKindHints) ? intake.targetKindHints[0] : null,
    intakeId: intake.id,
    db: database,
    now,
  });
};

const ensureIntakeSupplySource = async (intake: any, options: { db?: unknown; now: Date }) => {
  const database = supplyDatabaseForOptions(options.db);
  if (!database.supplySources?.findUnique || !database.supplySources?.create) return null;
  const directSupplySource = await intakeSupplySourceById(database, intake?.supplySourceId);
  if (directSupplySource) return { supplySource: directSupplySource };
  const linkedPage = await intakeLinkedPage(database, intake);
  const pageSupplySource = await intakeSupplySourceById(database, linkedPage?.supplySourceId);
  if (pageSupplySource) return { supplySource: pageSupplySource };
  return createIntakeSupplySource(database, intake, linkedPage, options.now);
};
const withMappingTransaction = async <T>(
  client: unknown,
  callback: (transactionClient: unknown) => Promise<T>,
): Promise<T> => {
  const database = supplyDatabaseForOptions(client);
  if (database.transaction) {
    return database.transaction(async (transactionDatabase) => (
      callback(transactionDatabase.rawClient ?? transactionDatabase)
    )) as Promise<T>;
  }
  return callback(client ?? prisma);
};


const latestMappingHistoryRecord = (historyValue: unknown): Record<string, unknown> => {
  if (!Array.isArray(historyValue) || historyValue.length === 0) return {};
  return recordValue(historyValue[historyValue.length - 1]);
};

const mappingRepairRemediationContexts = (
  envelope: Record<string, unknown>,
  latest: Record<string, unknown>,
  latestFullReview: Record<string, unknown>,
): string[] => {
  const repairContext = recordValue(envelope.repairContext);
  return [
    envelope.remediationContext,
    envelope.remediationContexts,
    repairContext.remediationContext,
    repairContext.remediationContexts,
    latest.remediationContext,
    latest.remediationContexts,
    latestFullReview.remediationContext,
    latestFullReview.remediationContexts,
    ...[
      envelope.cohortKey,
      envelope.cohortKeys,
      repairContext.cohortKey,
      repairContext.cohortKeys,
      latest.cohortKey,
      latest.cohortKeys,
      latestFullReview.cohortKey,
      latestFullReview.cohortKeys,
    ]
      .flatMap(stringValues)
      .filter((context) => context === AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT),
  ]
    .flatMap(stringValues);
};

const latestMappingRepairContext = (resultSummary: unknown) => {
  const envelope = recordValue(resultSummary);
  const latest = latestMappingHistoryRecord(envelope.mappingRepairHistory);
  const latestFullReview = latestMappingHistoryRecord(envelope.mappingFullReviewHistory);
  const repairReasons = stringValues(latest.repairReasons);
  const repairReason = stringValue(latest.repairReason) ?? repairReasons[0] ?? null;
  const remediationContexts = mappingRepairRemediationContexts(envelope, latest, latestFullReview);
  if (!repairReason && !remediationContexts.length) return null;
  return {
    ...(repairReason
      ? {
          repairReason,
          repairReasons: repairReasons.length ? repairReasons : [repairReason],
        }
      : {}),
    queuedAt: stringValue(latest.queuedAt),
    priorMappingStatus: stringValue(latest.priorMappingStatus),
    priorMappingErrorMessage: stringValue(latest.priorMappingErrorMessage),
    approvalJobId: stringValue(latest.approvalJobId),
    approvalStatus: stringValue(latest.approvalStatus),
    reviewerId: stringValue(latest.reviewerId),
    decision: stringValue(latest.decision),
    rationale: stringValue(latest.rationale),
    blockingIssues: stringValues(latest.blockingIssues),
    ...(remediationContexts.length
      ? {
          remediationContext: remediationContexts[0],
          remediationContexts: Array.from(new Set(remediationContexts)),
        }
      : {}),
  };
};


type MappingClaimOptions = {
  workerId: string;
  intakeId?: string;
  now?: Date;
  leaseMs?: number;
  db?: unknown;
};

const mappingClaimResult = (input: {
  job: any;
  intake: any;
  claimHandle: AffiliateSourceMappingClaimHandle;
  workerId: string;
  leaseExpiresAt: Date;
  resumed: boolean;
}) => ({
  ...input.claimHandle,
  claimHandle: input.claimHandle,
  jobId: input.job.id,
  intakeId: input.intake.id,
  sourceKey: input.intake.sourceKey,
  workerId: input.workerId,
  claimedAt: input.claimHandle.claimedAt,
  leaseExpiresAt: input.leaseExpiresAt,
  resumed: input.resumed,
  repairContext: latestMappingRepairContext(input.job.resultSummary),
});

const findActiveMappingJob = async (
  jobs: any,
  intakeId: string | undefined,
  workerId: string,
  now: Date,
) => jobs.findFirst({
  where: {
    ...(intakeId ? { intakeId } : {}),
    status: 'CLAIMED',
    workerId,
    leaseExpiresAt: { gte: now },
  },
  orderBy: { claimedAt: 'asc' },
});

const resumeMappingClaim = async (input: {
  activeJob: any;
  options: MappingClaimOptions;
  workerId: string;
  now: Date;
  leaseExpiresAt: Date;
}) => {
  const { activeJob, options, workerId, now, leaseExpiresAt } = input;
  if (
    activeJob?.status !== 'CLAIMED'
    || activeJob.workerId !== workerId
    || !(activeJob.leaseExpiresAt instanceof Date)
    || activeJob.leaseExpiresAt.getTime() < now.getTime()
  ) return null;
  const resumedClaim = await withMappingTransaction(options.db, async (transactionClient) => {
    const transactionMappingDb = mappingDb(transactionClient);
    const renewed = await transactionMappingDb.jobs.updateMany({
      where: {
        id: activeJob.id,
        status: 'CLAIMED',
        workerId,
        leaseExpiresAt: { gte: now },
      },
      data: { leaseExpiresAt },
    });
    if (renewed.count !== 1) return null;
    const intake = await transactionMappingDb.intakes.findUnique({ where: { id: activeJob.intakeId } });
    if (!intake) throw new Error('Claimed affiliate source intake not found.');
    const ensuredSupply = await ensureIntakeSupplySource(intake, { db: transactionClient, now });
    if (ensuredSupply?.supplySource?.id && transactionMappingDb.jobs.update) {
      await transactionMappingDb.jobs.update({
        where: { id: activeJob.id },
        data: { supplySourceId: ensuredSupply.supplySource.id },
      });
    }
    return { intake };
  });
  if (!resumedClaim) return null;
  const claimHandle = claimHandleFromJob({
    ...activeJob,
    workerId,
    claimedAt: activeJob.claimedAt,
  });
  return mappingClaimResult({
    job: activeJob,
    intake: resumedClaim.intake,
    claimHandle,
    workerId,
    leaseExpiresAt,
    resumed: true,
  });
};

const RETRY_MAPPING_JOB_SELECTION = Symbol('retry mapping job selection');

const mappingClaimLeaseIsValid = (job: any, now: Date): boolean => (
  job.status === 'CLAIMED'
  && job.leaseExpiresAt instanceof Date
  && job.leaseExpiresAt.getTime() >= now.getTime()
);

const createOrRecoverMappingJob = async (
  jobs: any,
  intake: any,
  now: Date,
) => {
  try {
    return await jobs.create({
      data: { id: createId(), intakeId: intake.id, status: 'QUEUED' },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existingActiveJob = await jobs.findFirst({
      where: {
        intakeId: intake.id,
        status: { in: [...ACTIVE_MAPPING_JOB_STATUSES] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!existingActiveJob) return RETRY_MAPPING_JOB_SELECTION;
    if (existingActiveJob.status === 'REVIEW_REQUIRED' || mappingClaimLeaseIsValid(existingActiveJob, now)) {
      return null;
    }
    return existingActiveJob;
  }
};

const findNextMappingJob = async (input: {
  jobs: any;
  intakes: any;
  intakeId?: string;
  now: Date;
}) => {
  const { jobs, intakes, intakeId, now } = input;
  const job = await jobs.findFirst({
    where: {
      ...(intakeId ? { intakeId } : {}),
      OR: [
        { status: 'QUEUED' },
        { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (job || !intakeId) return job;
  const intake = await intakes.findFirst({
    where: { id: intakeId, status: 'READY_FOR_MAPPING' },
  });
  if (!intake) return null;
  return createOrRecoverMappingJob(jobs, intake, now);
};

const claimMappingJob = async (input: {
  job: any;
  options: MappingClaimOptions;
  workerId: string;
  now: Date;
  leaseExpiresAt: Date;
}) => withMappingTransaction(input.options.db, async (transactionClient) => {
  const transactionMappingDb = mappingDb(transactionClient);
  const claimed = await transactionMappingDb.jobs.updateMany({
    where: {
      id: input.job.id,
      OR: [
        { status: 'QUEUED' },
        { status: 'CLAIMED', leaseExpiresAt: { lt: input.now } },
      ],
    },
    data: {
      status: 'CLAIMED',
      claimedAt: input.now,
      leaseExpiresAt: input.leaseExpiresAt,
      workerId: input.workerId,
      attemptCount: { increment: 1 },
      resultSummary: archiveClaimEvidenceContext(
        input.job.resultSummary,
        'Previous mapping claim generation expired or was replaced.',
        input.now,
      ),
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) return null;
  const intake = await transactionMappingDb.intakes.findUnique({ where: { id: input.job.intakeId } });
  if (!intake) {
    await transactionMappingDb.jobs.update({
      where: { id: input.job.id },
      data: { status: 'FAILED', finishedAt: input.now, errorMessage: 'Affiliate source intake not found.' },
    });
    return null;
  }
  const ensuredSupply = await ensureIntakeSupplySource(intake, {
    db: transactionClient,
    now: input.now,
  });
  if (ensuredSupply?.supplySource?.id && transactionMappingDb.jobs.update) {
    await transactionMappingDb.jobs.update({
      where: { id: input.job.id },
      data: { supplySourceId: ensuredSupply.supplySource.id },
    });
  }
  return { intake };
});

export const claimNextAffiliateSourceIntakeForMapping = async (options: MappingClaimOptions) => {
  const workerId = options.workerId.trim();
  if (!workerId) throw new Error('Mapping worker id is required.');
  const now = options.now ?? new Date();
  const leaseMs = Math.max(60_000, Math.min(options.leaseMs ?? DEFAULT_LEASE_MS, 24 * 60 * 60 * 1000));
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const { intakes, jobs } = mappingDb(options.db);
  const activeJob = await findActiveMappingJob(jobs, options.intakeId, workerId, now);
  const resumedClaim = await resumeMappingClaim({
    activeJob,
    options,
    workerId,
    now,
    leaseExpiresAt,
  });
  if (resumedClaim) return resumedClaim;
  if (await mappingAdmissionPaused({ db: options.db, now })) return null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const job = await findNextMappingJob({
      jobs,
      intakes,
      intakeId: options.intakeId,
      now,
    });
    if (job === RETRY_MAPPING_JOB_SELECTION) continue;
    if (!job) return null;
    const claimedJob = await claimMappingJob({
      job,
      options,
      workerId,
      now,
      leaseExpiresAt,
    });
    if (!claimedJob) continue;
    const intake = claimedJob.intake;
    const claimHandle: AffiliateSourceMappingClaimHandle = {
      jobId: job.id,
      workerId,
      claimedAt: now.toISOString(),
    };
    return mappingClaimResult({
      job,
      intake,
      claimHandle,
      workerId,
      leaseExpiresAt,
      resumed: false,
    });
  }
  return null;
};

export type ReleaseAffiliateSourceMappingClaimInput = {
  claimHandle: AffiliateSourceMappingClaimHandle;
  reason?: string | null;
  db?: unknown;
};

export const releaseAffiliateSourceMappingClaim = async (
  input: ReleaseAffiliateSourceMappingClaimInput,
) => {
  const execute = async (tx: unknown) => {
    const { intakes, jobs } = mappingDb(tx);
    const job = await jobs.findUnique({ where: { id: input.claimHandle.jobId } });
    if (!job) throw new Error('Affiliate source mapping job not found.');
    const now = new Date();
    const released = await jobs.updateMany({
      where: {
        id: input.claimHandle.jobId,
        status: 'CLAIMED',
        workerId: input.claimHandle.workerId,
        claimedAt: new Date(input.claimHandle.claimedAt),
        leaseExpiresAt: { gte: now },
      },
      data: {
        status: 'QUEUED',
        claimedAt: null,
        leaseExpiresAt: null,
        workerId: null,
        resultSummary: archiveClaimEvidenceContext(
          job.resultSummary,
          input.reason?.trim() || 'Mapping claim released.',
          now,
        ),
        errorMessage: input.reason?.trim() || null,
      },
    });
    if (released.count !== 1) {
      throw new Error('Affiliate source mapping claim is stale or no longer owned.');
    }
    await intakes.update({
      where: { id: job.intakeId },
      data: { status: 'READY_FOR_MAPPING' },
    });
    return jobs.findUnique({ where: { id: input.claimHandle.jobId } });
  };
  const client = (input.db ?? prisma) as any;
  return typeof client.$transaction === 'function'
    ? client.$transaction(execute)
    : execute(client);
};

type StoreMappingClaimEvidenceInput = {
  claimHandle: AffiliateSourceMappingClaimHandle;
  context: AffiliateSourceMappingClaimEvidenceContext;
  db?: unknown;
};

const assertMappingClaimEvidenceInput = (input: StoreMappingClaimEvidenceInput): void => {
  if (input.context.jobId !== input.claimHandle.jobId) {
    throw new Error('Claim evidence context job does not match the claim handle.');
  }
  if (input.context.workerId !== input.claimHandle.workerId
    || input.context.claimedAt !== input.claimHandle.claimedAt) {
    throw new Error('Claim evidence context claim generation does not match the claim handle.');
  }
};

const mappingClaimGenerationMatches = (
  evidence: Record<string, unknown>,
  claimHandle: AffiliateSourceMappingClaimHandle,
): boolean => evidence.jobId === claimHandle.jobId
  && evidence.workerId === claimHandle.workerId
  && evidence.claimedAt === claimHandle.claimedAt;

const storeMappingClaimEvidence = async (
  input: StoreMappingClaimEvidenceInput,
  transactionClient: unknown,
) => {
  const { jobs } = mappingDb(transactionClient);
  const job = await jobs.findUnique({ where: { id: input.claimHandle.jobId } });
  if (!job) throw new Error('Affiliate source mapping job not found.');
  const current = recordValue(job.resultSummary);
  const existing = recordValue(current.claimEvidenceContext);
  if (existing.jobId) {
    if (!mappingClaimGenerationMatches(existing, input.claimHandle)) {
      throw new Error('Affiliate source mapping claim evidence belongs to another claim generation.');
    }
    return job;
  }
  const stored = await jobs.updateMany({
    where: {
      id: input.claimHandle.jobId,
      status: 'CLAIMED',
      workerId: input.claimHandle.workerId,
      claimedAt: new Date(input.claimHandle.claimedAt),
      leaseExpiresAt: { gte: new Date() },
    },
    data: {
      resultSummary: {
        ...current,
        claimEvidenceContext: input.context,
      },
    },
  });
  if (stored.count !== 1) throw new Error('Affiliate source mapping claim is stale or no longer owned.');
  return jobs.findUnique({ where: { id: input.claimHandle.jobId } });
};

const recoverMappingClaimEvidenceAfterConflict = async (
  input: StoreMappingClaimEvidenceInput,
  error: unknown,
) => {
  if (recordValue(error).code !== 'P2034') throw error;
  const { jobs } = mappingDb(input.db);
  const job = await jobs.findUnique({ where: { id: input.claimHandle.jobId } });
  const existing = recordValue(recordValue(job?.resultSummary).claimEvidenceContext);
  if (mappingClaimGenerationMatches(existing, input.claimHandle)) return job;
  return undefined;
};

export const storeAffiliateSourceMappingClaimEvidenceContext = async (
  input: StoreMappingClaimEvidenceInput,
) => {
  assertMappingClaimEvidenceInput(input);
  const execute = (transactionClient: unknown) => storeMappingClaimEvidence(input, transactionClient);
  const client = (input.db ?? prisma) as any;
  try {
    return await (typeof client.$transaction === 'function'
      ? client.$transaction(execute, { isolationLevel: 'Serializable' })
      : execute(client));
  } catch (error) {
    return recoverMappingClaimEvidenceAfterConflict(input, error);
  }
};
type MappingCompletionIdentity = Readonly<{
  sourceId: string | null;
  mappingId: string | null;
}>;

const assertMappingIdentityPair = (
  sourceId: string | null,
  mappingId: string | null,
): void => {
  if (Boolean(sourceId) !== Boolean(mappingId)) {
    throw new Error('Affiliate mapping job package identity requires both sourceId and mappingId.');
  }
};

const hasMappingIdentityConflict = (
  storedSourceId: string | null,
  storedMappingId: string | null,
  suppliedSourceId: string | null,
  suppliedMappingId: string | null,
): boolean => {
  if (!storedSourceId || !storedMappingId) return false;
  if (suppliedSourceId && suppliedSourceId !== storedSourceId) return true;
  return Boolean(suppliedMappingId && suppliedMappingId !== storedMappingId);
};

const mappingCompletionIdentity = (
  job: any,
  input: { sourceId?: string | null; mappingId?: string | null },
): MappingCompletionIdentity => {
  const storedSourceId = stringValue(job.sourceId);
  const storedMappingId = stringValue(job.mappingId);
  assertMappingIdentityPair(storedSourceId, storedMappingId);
  const suppliedSourceId = stringValue(input.sourceId);
  const suppliedMappingId = stringValue(input.mappingId);
  assertMappingIdentityPair(suppliedSourceId, suppliedMappingId);
  if (hasMappingIdentityConflict(
    storedSourceId,
    storedMappingId,
    suppliedSourceId,
    suppliedMappingId,
  )) {
    throw new Error('Affiliate mapping job package identity cannot be replaced.');
  }
  const sourceId = storedSourceId ?? suppliedSourceId;
  const mappingId = storedMappingId ?? suppliedMappingId;
  assertMappingIdentityPair(sourceId, mappingId);
  return { sourceId, mappingId };
};

const assertMappingCompletionSubmission = (
  job: any,
  input: {
    status: string;
    sourceId?: string | null;
    mappingId?: string | null;
    resultSummary?: Record<string, unknown> | null;
  },
  identity: MappingCompletionIdentity,
): void => {
  const packageIdentityRequired = input.status === 'REVIEW_REQUIRED' || input.status === 'APPROVED';
  const isExplicitLegacyIdentityMigration = (
    input.status === 'REVIEW_REQUIRED'
    && job.legacyIdentityMigrationEligible === true
  );
  if (packageIdentityRequired && (!identity.sourceId || !identity.mappingId) && !isExplicitLegacyIdentityMigration) {
    throw new Error(
      'Affiliate mapping job completion requires sourceId and mappingId unless explicit legacy identity migration is enabled.',
    );
  }
  if (input.status !== 'REVIEW_REQUIRED' || !hasEventDateTimeRemediationContext(job.resultSummary)) return;
  const submittedResult = recordValue(recordValue(input.resultSummary).result);
  const dateTimeReview = affiliateEventDateTimeReviewSchema.safeParse(submittedResult.dateTimeReview);
  if (!dateTimeReview.success) {
    throw new Error(
      'event-datetime-v1 review-required mapping results require a valid dateTimeReview section. '
      + dateTimeReview.error.message,
    );
  }
};


type MappingCompletionTransactionState = Readonly<{
  transactionJob: any;
  transactionJobs: any;
  transactionIntakes: any;
  transactionApprovals: any;
  supplyDatabase: AffiliateSupplyDatabase;
  supplySourceId: string | null;
}>;

const loadMappingCompletionTransactionState = async (
  tx: unknown,
  input: { claimHandle: AffiliateSourceMappingClaimHandle },
  sourceId: string | null,
): Promise<MappingCompletionTransactionState> => {
  const {
    intakes: transactionIntakes,
    jobs: transactionJobs,
    approvals: transactionApprovals,
  } = mappingDb(tx);
  const supplyDatabase = affiliateSupplyDatabase(tx as AffiliateSupplyClient);
  const transactionJob = await transactionJobs.findUnique({ where: { id: input.claimHandle.jobId } });
  if (!transactionJob) throw new Error('Affiliate source mapping job not found.');
  const transactionIntake = await terminalReplayIntakeFor(
    supplyDatabase,
    stringValue(transactionJob.intakeId),
  );
  const transactionSource = sourceId
    ? await terminalReplaySourceFor(supplyDatabase, sourceId)
    : null;
  const supplySourceId = stringValue(transactionJob.supplySourceId)
    ?? stringValue(transactionIntake?.supplySourceId)
    ?? stringValue(transactionSource?.supplySourceId);
  return {
    transactionJob,
    transactionJobs,
    transactionIntakes,
    transactionApprovals,
    supplyDatabase,
    supplySourceId,
  };
};

const assertMappingCompletionClaimOwnership = (
  state: MappingCompletionTransactionState,
  claimHandle: AffiliateSourceMappingClaimHandle,
): void => {
  if (
    state.transactionJob.workerId !== claimHandle.workerId
    || new Date(state.transactionJob.claimedAt).getTime() !== new Date(claimHandle.claimedAt).getTime()
    || state.transactionJob.status !== 'CLAIMED'
  ) {
    throw new Error('Affiliate source mapping claim is stale or no longer owned.');
  }
};

const preservedMappingCompletionAuditFields = (
  previousEnvelope: Record<string, unknown>,
): Record<string, unknown> => [
  'claimEvidenceContext',
  'humanSportResolution',
  'sportResolutionHistory',
  'sportCatalogRefreshHistory',
  'sportReconciliationHistory',
  'claimEvidenceHistory',
  'approvalCycleHistory',
].reduce<Record<string, unknown>>((fields, field) => {
  if (previousEnvelope[field] !== undefined) fields[field] = previousEnvelope[field];
  return fields;
}, {});

const mappingCompletionHistoryFields = (
  previousEnvelope: Record<string, unknown>,
): Record<string, unknown> => ({
  ...(Array.isArray(previousEnvelope.mappingRepairHistory) && previousEnvelope.mappingRepairHistory.length
    ? { mappingRepairHistory: previousEnvelope.mappingRepairHistory }
    : {}),
  ...(Array.isArray(previousEnvelope.mappingFullReviewHistory) && previousEnvelope.mappingFullReviewHistory.length
    ? { mappingFullReviewHistory: previousEnvelope.mappingFullReviewHistory }
    : {}),
});

const mappingCompletionResultSummary = (
  transactionJob: any,
  submittedEnvelope: Record<string, unknown>,
): Record<string, unknown> => {
  const previousEnvelope = recordValue(transactionJob.resultSummary);
  return {
    ...submittedEnvelope,
    ...preservedMappingCompletionAuditFields(previousEnvelope),
    ...(hasEventDateTimeRemediationContext(transactionJob.resultSummary)
      ? {
          cohortKey: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
          remediationContext: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
          remediationContexts: [AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT],
        }
      : {}),
    ...mappingCompletionHistoryFields(previousEnvelope),
  };
};

const consumeMappingHumanSportResolution = (
  status: string,
  resultSummary: Record<string, unknown>,
  now: Date,
): Record<string, unknown> => {
  const submittedResult = recordValue(resultSummary.result);
  const submittedDeterminations = Array.isArray(submittedResult.sportDeterminations)
    ? submittedResult.sportDeterminations
    : [];
  const userDecisionHashes = submittedDeterminations
    .filter((determination) => recordValue(determination).resolutionBasis === 'USER_DECISION')
    .map((determination) => stringValue(recordValue(determination).resolvedFromDeterminationSha256))
    .filter((hash): hash is string => Boolean(hash))
    .sort();
  const pendingHumanResolution = resultSummary.humanSportResolution
    ? affiliateHumanSportResolutionSchema.parse(resultSummary.humanSportResolution)
    : null;
  if (status !== 'REVIEW_REQUIRED' || pendingHumanResolution?.state !== 'PENDING' || !userDecisionHashes.length) {
    return resultSummary;
  }
  const resolutionHashes = pendingHumanResolution.resolutions
    .map((resolution) => resolution.determinationSha256.toLowerCase())
    .sort();
  if (JSON.stringify(resolutionHashes) !== JSON.stringify(userDecisionHashes)) {
    throw new Error('Human sport resolution coverage does not match the USER_DECISION determinations.');
  }
  return {
    ...resultSummary,
    humanSportResolution: {
      ...pendingHumanResolution,
      state: 'CONSUMED',
      consumedAt: now.toISOString(),
      consumedDeterminationSha256s: userDecisionHashes,
    },
  };
};

const isMappingApprovalCycleStatus = (status: unknown): boolean => (
  ['APPROVED', 'REJECTED', 'DEFERRED'].includes(String(status))
);

const loadMappingCompletionApproval = async (
  state: MappingCompletionTransactionState,
  status: string,
): Promise<any> => status === 'REVIEW_REQUIRED'
  ? state.transactionApprovals.findUnique({
      where: {
        subjectType_subjectKey: {
          subjectType: 'MAPPING_PACKAGE',
          subjectKey: state.transactionJob.id,
        },
      },
    })
  : null;

const appendMappingApprovalCycle = (
  resultSummary: Record<string, unknown>,
  approval: any,
): Record<string, unknown> => {
  if (!approval || !isMappingApprovalCycleStatus(approval.status)) return resultSummary;
  return appendAffiliateMappingResultHistory({
    envelope: resultSummary,
    field: 'approvalCycleHistory',
    entry: {
      id: approval.id,
      status: approval.status,
      claimedAt: approval.claimedAt ?? null,
      leaseExpiresAt: approval.leaseExpiresAt ?? null,
      reviewerId: approval.reviewerId ?? null,
      attemptCount: approval.attemptCount ?? null,
      decision: approval.decision ?? null,
      errorMessage: approval.errorMessage ?? null,
      finishedAt: approval.finishedAt ?? null,
    },
  });
};

type MappingCompletionPersistenceInput = Readonly<{
  claimHandle: AffiliateSourceMappingClaimHandle;
  status: string;
  sourceId: string | null;
  mappingId: string | null;
  branch?: string | null;
  commit?: string | null;
  errorMessage?: string | null;
  resultSummary?: Record<string, unknown> | null;
}>;

const mappingCompletionJobData = (
  state: MappingCompletionTransactionState,
  input: MappingCompletionPersistenceInput,
  resultSummary: Record<string, unknown>,
  now: Date,
): Record<string, unknown> => ({
  ...(input.sourceId && input.mappingId ? { sourceId: input.sourceId, mappingId: input.mappingId } : {}),
  ...(state.supplySourceId ? { supplySourceId: state.supplySourceId } : {}),
  status: input.status,
  branch: input.branch?.trim() || null,
  commit: input.commit?.trim() || null,
  resultSummary,
  errorMessage: input.errorMessage?.trim() || null,
  finishedAt: now,
  leaseExpiresAt: null,
});

const persistMappingCompletionStatus = async (
  state: MappingCompletionTransactionState,
  input: MappingCompletionPersistenceInput,
  resultSummary: Record<string, unknown>,
  now: Date,
): Promise<void> => {
  const finished = await state.transactionJobs.updateMany({
    where: {
      id: input.claimHandle.jobId,
      status: 'CLAIMED',
      workerId: input.claimHandle.workerId,
      claimedAt: new Date(input.claimHandle.claimedAt),
      leaseExpiresAt: { gte: now },
    },
    data: mappingCompletionJobData(state, input, resultSummary, now),
  });
  if (finished.count !== 1) {
    throw new Error('Affiliate source mapping claim is stale or no longer owned.');
  }
  await state.transactionIntakes.update({
    where: { id: state.transactionJob.intakeId },
    data: { status: input.status === 'APPROVED' ? 'PROMOTED' : input.status },
  });
  if (!state.supplySourceId) return;
  await linkAffiliateSupplyRecord({
    supplySourceId: state.supplySourceId,
    intakeId: state.transactionJob.intakeId,
    sourceId: input.sourceId,
    mappingId: input.mappingId,
    mappingJobId: state.transactionJob.id,
    db: state.supplyDatabase,
  });
};

const hasMappingLifecycleDelegates = (database: AffiliateSupplyDatabase): boolean => (
  typeof database.supplySources?.findUnique === 'function'
  && typeof database.contractManifests?.findFirst === 'function'
  && typeof database.transitions?.findUnique === 'function'
  && typeof database.transitions?.findFirst === 'function'
  && typeof database.transitions?.create === 'function'
);

const buildMappingCompletionLifecycleReplay = async (
  state: MappingCompletionTransactionState,
  input: { claimHandle: AffiliateSourceMappingClaimHandle; status: string; sourceId: string | null; mappingId: string | null },
  resultSummary: Record<string, unknown>,
): Promise<AffiliateMappingLifecycleReplay | null> => {
  if (
    !input.sourceId
    || !input.mappingId
    || !LIFECYCLE_MAPPING_JOB_STATUSES.has(input.status)
  ) return null;
  if (!state.supplySourceId) {
    throw new Error('Affiliate mapping completion has no Supply Source root for lifecycle replay.');
  }
  if (!hasMappingLifecycleDelegates(state.supplyDatabase)) {
    throw new Error('Affiliate mapping completion lifecycle delegates are unavailable.');
  }
  const sourceId = input.sourceId;
  const mappingId = input.mappingId;
  const lifecycleSource = await state.supplyDatabase.sources.findUnique({
    where: { id: sourceId },
  });
  if (!lifecycleSource) {
    throw new Error('Affiliate scrape source not found for mapping completion lifecycle replay.');
  }
  if (stringValue(lifecycleSource.supplySourceId) !== state.supplySourceId) {
    throw new Error('Affiliate mapping completion source is not bound to its Supply Source root.');
  }
  const lifecycleRoot = await state.supplyDatabase.supplySources.findUnique({
    where: { id: state.supplySourceId },
  });
  if (!lifecycleRoot) throw new Error('Affiliate Supply Source root not found for mapping completion.');
  return {
    supplySourceId: state.supplySourceId,
    command: 'RECORD_MAPPING',
    authority: 'MAPPING_PRODUCER',
    expectedLifecycleGeneration: Number(lifecycleRoot.lifecycleGeneration ?? 0),
    idempotencyKey: `mapping:${state.transactionJob.id}:${input.claimHandle.claimedAt}:${input.status}`,
    request: {
      sourceId,
      mappingId,
      mappingJobId: state.transactionJob.id,
      evidenceRefs: mappingLifecycleEvidenceRefs(state.transactionJob, resultSummary, mappingId),
    },
    actorKind: 'MAPPING_PRODUCER',
    actorId: input.claimHandle.workerId,
    executingAgentId: input.claimHandle.workerId,
  };
};

const resetMappingCompletionApproval = async (
  state: MappingCompletionTransactionState,
  approval: any,
): Promise<void> => {
  if (!approval || !isMappingApprovalCycleStatus(approval.status)) return;
  await state.transactionApprovals.update({
    where: { id: approval.id },
    data: {
      status: 'QUEUED',
      claimedAt: null,
      leaseExpiresAt: null,
      reviewerId: null,
      decision: null,
      errorMessage: null,
      finishedAt: null,
    },
  });
};

type MappingCompletionTransactionResult = Readonly<{
  job: any;
  lifecycleReplay: AffiliateMappingLifecycleReplay | null;
}>;

const finalizeMappingCompletion = async (
  tx: unknown,
  input: MappingCompletionPersistenceInput,
): Promise<MappingCompletionTransactionResult> => {
  const state = await loadMappingCompletionTransactionState(tx, input, input.sourceId);
  assertMappingCompletionClaimOwnership(state, input.claimHandle);
  const now = new Date();
  let resultSummary = consumeMappingHumanSportResolution(
    input.status,
    mappingCompletionResultSummary(state.transactionJob, recordValue(input.resultSummary)),
    now,
  );
  const approval = await loadMappingCompletionApproval(state, input.status);
  if (approval?.status === 'CLAIMED') {
    throw new Error('Affiliate mapping approval is actively claimed and completion cannot replace it.');
  }
  resultSummary = appendMappingApprovalCycle(resultSummary, approval);
  const lifecycleReplay = await buildMappingCompletionLifecycleReplay(state, input, resultSummary);
  await persistMappingCompletionStatus(state, input, resultSummary, now);
  if (lifecycleReplay) {
    await executeAffiliateSupplyLifecycleCommand({
      ...lifecycleReplay,
      db: state.supplyDatabase,
      now,
    });
  }
  await resetMappingCompletionApproval(state, approval);
  return {
    job: await state.transactionJobs.findUnique({ where: { id: input.claimHandle.jobId } }),
    lifecycleReplay,
  };
};
export const finishAffiliateSourceMappingClaim = async (input: {
  claimHandle: AffiliateSourceMappingClaimHandle;
  status: 'REVIEW_REQUIRED' | 'EXPANDED' | 'APPROVED' | 'FAILED' | 'HUMAN_REVIEW_REQUIRED';
  sourceId?: string | null;
  mappingId?: string | null;
  branch?: string | null;
  commit?: string | null;
  resultSummary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  db?: unknown;
}) => {
  const client: unknown = input.db ?? prisma;
  const database = supplyDatabaseForOptions(client);
  const { jobs } = mappingDb(input.db);
  const job = await jobs.findUnique({ where: { id: input.claimHandle.jobId } });
  if (!job) throw new Error('Affiliate source mapping job not found.');
  const identity = mappingCompletionIdentity(job, input);
  const isExactTerminalCompletion = hasExactTerminalMappingCompletion({
    job,
    claimHandle: input.claimHandle,
    status: input.status,
    sourceId: identity.sourceId,
    mappingId: identity.mappingId,
    database,
  });
  if (isExactTerminalCompletion) {
    await replayTerminalMappingLifecycle({
      job,
      claimHandle: input.claimHandle,
      status: input.status,
      sourceId: identity.sourceId,
      mappingId: identity.mappingId,
      database,
    });
    return job;
  }
  assertMappingCompletionSubmission(job, input, identity);
  const transactionResult = await withMappingTransaction(client, (tx) => finalizeMappingCompletion(tx, {
    ...input,
    sourceId: identity.sourceId,
    mappingId: identity.mappingId,
  }));
  if (typeof database.transaction === 'function' && transactionResult.lifecycleReplay) {
    await executeAffiliateSupplyLifecycleCommand({
      ...transactionResult.lifecycleReplay,
      db: database,
    });
  }
  return transactionResult.job;
};
