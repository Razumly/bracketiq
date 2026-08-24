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
} from './codexIngestionResult';
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

const mappingAdmissionPaused = async (options: { db?: unknown; now: Date }): Promise<boolean> => {
  const database = supplyDatabaseForOptions(options.db);
  if (
    typeof database.supplySources?.findMany !== 'function'
    || typeof database.contractManifests?.findFirst !== 'function'
    || typeof database.mappingJobs?.count !== 'function'
    || typeof database.approvals?.count !== 'function'
    || typeof database.gatewayClaims?.count !== 'function'
    || typeof database.demands?.findMany !== 'function'
    || typeof database.waves?.findMany !== 'function'
    || typeof database.campaigns?.findMany !== 'function'
  ) return false;
  try {
    const roots = await database.supplySources.findMany({
      where: { isExcluded: false },
      select: { rolloutCohort: true },
    });
    const cohorts = Array.from(new Set(
      roots.map((root: { rolloutCohort?: string | null }) => root.rolloutCohort).filter(Boolean),
    )) as string[];
    const activeContracts = await Promise.all(
      (cohorts.length ? cohorts : [undefined]).map((rolloutCohort) => (
        loadActiveAffiliateSupplyContract({ db: database, rolloutCohort })
      )),
    );
    const isContractSafe = process.env.AFFILIATE_SUPPLY_CONTRACT_SAFE?.trim().toLowerCase() !== 'false';
    const plans = await Promise.all(activeContracts.map((activeContract) => planAffiliateReplenishmentFromDatabase({
      contract: activeContract.policy,
      isContractSafe,
      db: database,
      now: options.now,
    })));
    return plans.some((plan) => plan.isMappingPaused);
  } catch {
    return true;
  }
};

const ensureIntakeSupplySource = async (intake: any, options: { db?: unknown; now: Date }) => {
  const database = supplyDatabaseForOptions(options.db);
  if (!database.supplySources?.findUnique || !database.supplySources?.create) return null;
  if (intake?.supplySourceId) {
    const linked = await database.supplySources.findUnique({ where: { id: intake.supplySourceId } });
    if (linked) return { supplySource: linked };
  }
  const linkedPage = database.pages?.findFirst
    ? await database.pages.findFirst({
      where: { intakeId: intake.id, supplySourceId: { not: null }, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    })
    : null;
  if (linkedPage?.supplySourceId) {
    const linked = await database.supplySources.findUnique({ where: { id: linkedPage.supplySourceId } });
    if (linked) return { supplySource: linked };
  }
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
    now: options.now,
  });
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


const latestMappingRepairContext = (resultSummary: unknown) => {
  const envelope = recordValue(resultSummary);
  const history = envelope.mappingRepairHistory;
  const latest = Array.isArray(history) && history.length > 0
    ? recordValue(history[history.length - 1])
    : {};
  const fullReviewHistory = envelope.mappingFullReviewHistory;
  const latestFullReview = Array.isArray(fullReviewHistory) && fullReviewHistory.length > 0
    ? recordValue(fullReviewHistory[fullReviewHistory.length - 1])
    : {};
  const repairReasons = stringValues(latest.repairReasons);
  const repairReason = stringValue(latest.repairReason) ?? repairReasons[0] ?? null;
  const remediationContexts = [
    envelope.remediationContext,
    envelope.remediationContexts,
    recordValue(envelope.repairContext).remediationContext,
    recordValue(envelope.repairContext).remediationContexts,
    latest.remediationContext,
    latest.remediationContexts,
    latestFullReview.remediationContext,
    latestFullReview.remediationContexts,
    ...[
      envelope.cohortKey,
      envelope.cohortKeys,
      recordValue(envelope.repairContext).cohortKey,
      recordValue(envelope.repairContext).cohortKeys,
      latest.cohortKey,
      latest.cohortKeys,
      latestFullReview.cohortKey,
      latestFullReview.cohortKeys,
    ]
      .flatMap(stringValues)
      .filter((context) => context === AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT),
  ]
    .flatMap(stringValues);
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

export const claimNextAffiliateSourceIntakeForMapping = async (options: {
  workerId: string;
  intakeId?: string;
  now?: Date;
  leaseMs?: number;
  db?: unknown;
}) => {
  const workerId = options.workerId.trim();
  if (!workerId) throw new Error('Mapping worker id is required.');
  const now = options.now ?? new Date();
  const leaseMs = Math.max(60_000, Math.min(options.leaseMs ?? DEFAULT_LEASE_MS, 24 * 60 * 60 * 1000));
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const { intakes, jobs } = mappingDb(options.db);

  const activeJob = await jobs.findFirst({
    where: {
      ...(options.intakeId ? { intakeId: options.intakeId } : {}),
      status: 'CLAIMED',
      workerId,
      leaseExpiresAt: { gte: now },
    },
    orderBy: { claimedAt: 'asc' },
  });
  if (
    activeJob?.status === 'CLAIMED'
    && activeJob.workerId === workerId
    && activeJob.leaseExpiresAt instanceof Date
    && activeJob.leaseExpiresAt.getTime() >= now.getTime()
  ) {
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
    if (resumedClaim) {
      const intake = resumedClaim.intake;
      const claimHandle = claimHandleFromJob({
        ...activeJob,
        workerId,
        claimedAt: activeJob.claimedAt,
      });
      return {
        ...claimHandle,
        claimHandle,
        jobId: activeJob.id,
        intakeId: intake.id,
        sourceKey: intake.sourceKey,
        workerId,
        claimedAt: claimHandle.claimedAt,
        leaseExpiresAt,
        resumed: true,
        repairContext: latestMappingRepairContext(activeJob.resultSummary),
      };
    }
  }
  if (await mappingAdmissionPaused({ db: options.db, now })) return null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let job = await jobs.findFirst({
      where: {
        ...(options.intakeId ? { intakeId: options.intakeId } : {}),
        OR: [
          { status: 'QUEUED' },
          { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!job && options.intakeId) {
      const intake = await intakes.findFirst({
        where: { id: options.intakeId, status: 'READY_FOR_MAPPING' },
      });
      if (intake) {
        try {
          job = await jobs.create({
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
          if (!existingActiveJob) continue;

          const existingLeaseIsValid = existingActiveJob.status === 'CLAIMED'
            && existingActiveJob.leaseExpiresAt instanceof Date
            && existingActiveJob.leaseExpiresAt.getTime() >= now.getTime();
          if (existingActiveJob.status === 'REVIEW_REQUIRED' || existingLeaseIsValid) return null;
          job = existingActiveJob;
        }
      }
    }
    if (!job) return null;
    const claimedJob = await withMappingTransaction(options.db, async (transactionClient) => {
      const transactionMappingDb = mappingDb(transactionClient);
      const claimed = await transactionMappingDb.jobs.updateMany({
        where: {
          id: job.id,
          OR: [
            { status: 'QUEUED' },
            { status: 'CLAIMED', leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: 'CLAIMED',
          claimedAt: now,
          leaseExpiresAt,
          workerId,
          attemptCount: { increment: 1 },
          resultSummary: archiveClaimEvidenceContext(
            job.resultSummary,
            'Previous mapping claim generation expired or was replaced.',
            now,
          ),
          errorMessage: null,
        },
      });
      if (claimed.count !== 1) return null;
      const intake = await transactionMappingDb.intakes.findUnique({ where: { id: job.intakeId } });
      if (!intake) {
        await transactionMappingDb.jobs.update({
          where: { id: job.id },
          data: { status: 'FAILED', finishedAt: now, errorMessage: 'Affiliate source intake not found.' },
        });
        return null;
      }
      const ensuredSupply = await ensureIntakeSupplySource(intake, { db: transactionClient, now });
      if (ensuredSupply?.supplySource?.id && transactionMappingDb.jobs.update) {
        await transactionMappingDb.jobs.update({
          where: { id: job.id },
          data: { supplySourceId: ensuredSupply.supplySource.id },
        });
      }
      return { intake };
    });
    if (!claimedJob) continue;
    const intake = claimedJob.intake;
    const claimHandle: AffiliateSourceMappingClaimHandle = {
      jobId: job.id,
      workerId,
      claimedAt: now.toISOString(),
    };
    return {
      ...claimHandle,
      claimHandle,
      jobId: job.id,
      intakeId: intake.id,
      sourceKey: intake.sourceKey,
      workerId,
      claimedAt: claimHandle.claimedAt,
      leaseExpiresAt,
      resumed: false,
      repairContext: latestMappingRepairContext(job.resultSummary),
    };
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

export const storeAffiliateSourceMappingClaimEvidenceContext = async (input: {
  claimHandle: AffiliateSourceMappingClaimHandle;
  context: AffiliateSourceMappingClaimEvidenceContext;
  db?: unknown;
}) => {
  if (input.context.jobId !== input.claimHandle.jobId) {
    throw new Error('Claim evidence context job does not match the claim handle.');
  }
  if (input.context.workerId !== input.claimHandle.workerId
    || input.context.claimedAt !== input.claimHandle.claimedAt) {
    throw new Error('Claim evidence context claim generation does not match the claim handle.');
  }
  const execute = async (tx: unknown) => {
    const { jobs } = mappingDb(tx);
    const job = await jobs.findUnique({ where: { id: input.claimHandle.jobId } });
    if (!job) throw new Error('Affiliate source mapping job not found.');
    const current = recordValue(job.resultSummary);
    const existing = recordValue(current.claimEvidenceContext);
    if (existing.jobId) {
      if (
        existing.jobId !== input.claimHandle.jobId
        || existing.workerId !== input.claimHandle.workerId
        || existing.claimedAt !== input.claimHandle.claimedAt
      ) {
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
  const client = (input.db ?? prisma) as any;
  try {
    return await (typeof client.$transaction === 'function'
      ? client.$transaction(execute, { isolationLevel: 'Serializable' })
      : execute(client));
  } catch (error) {
    const errorRecord = recordValue(error);
    if (errorRecord.code === 'P2034') {
      const { jobs } = mappingDb(input.db);
      const job = await jobs.findUnique({ where: { id: input.claimHandle.jobId } });
      const existing = recordValue(recordValue(job?.resultSummary).claimEvidenceContext);
      if (
        existing.jobId === input.claimHandle.jobId
        && existing.workerId === input.claimHandle.workerId
        && existing.claimedAt === input.claimHandle.claimedAt
      ) return job;
    }
    throw error;
  }
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
  const { jobs } = mappingDb(input.db);
  const { intakes, approvals } = mappingDb(input.db);
  const job = await jobs.findUnique({ where: { id: input.claimHandle.jobId } });
  if (!job) throw new Error('Affiliate source mapping job not found.');
  const storedSourceId = stringValue(job.sourceId);
  const storedMappingId = stringValue(job.mappingId);
  if (Boolean(storedSourceId) !== Boolean(storedMappingId)) {
    throw new Error('Affiliate mapping job package identity requires both sourceId and mappingId.');
  }
  const suppliedSourceId = stringValue(input.sourceId);
  const suppliedMappingId = stringValue(input.mappingId);
  if (Boolean(suppliedSourceId) !== Boolean(suppliedMappingId)) {
    throw new Error('Affiliate mapping job package identity requires both sourceId and mappingId.');
  }
  if (
    storedSourceId
    && storedMappingId
    && ((suppliedSourceId && suppliedSourceId !== storedSourceId)
      || (suppliedMappingId && suppliedMappingId !== storedMappingId))
  ) {
    throw new Error('Affiliate mapping job package identity cannot be replaced.');
  }
  const sourceId = storedSourceId ?? suppliedSourceId;
  const mappingId = storedMappingId ?? suppliedMappingId;
  if (Boolean(sourceId) !== Boolean(mappingId)) {
    throw new Error('Affiliate mapping job package identity requires both sourceId and mappingId.');
  }
  const packageIdentityRequired = input.status === 'REVIEW_REQUIRED' || input.status === 'APPROVED';
  const isExplicitLegacyIdentityMigration = (
    input.status === 'REVIEW_REQUIRED'
    && job.legacyIdentityMigrationEligible === true
  );
  if (packageIdentityRequired && (!sourceId || !mappingId) && !isExplicitLegacyIdentityMigration) {
    throw new Error(
      'Affiliate mapping job completion requires sourceId and mappingId unless explicit legacy identity migration is enabled.',
    );
  }
  if (
    input.status === 'REVIEW_REQUIRED'
    && hasEventDateTimeRemediationContext(job.resultSummary)
  ) {
    const submittedResult = recordValue(recordValue(input.resultSummary).result);
    const dateTimeReview = affiliateEventDateTimeReviewSchema.safeParse(submittedResult.dateTimeReview);
    if (!dateTimeReview.success) {
      throw new Error(
        'event-datetime-v1 review-required mapping results require a valid dateTimeReview section. '
        + dateTimeReview.error.message,
      );
    }
  }
  const submittedEnvelope = recordValue(input.resultSummary);
  const finalize = async (tx: unknown) => {
    const { intakes: transactionIntakes, jobs: transactionJobs, approvals: transactionApprovals } = mappingDb(tx);
    const supplyDatabase = affiliateSupplyDatabase(tx as AffiliateSupplyClient);
    const transactionJob = await transactionJobs.findUnique({ where: { id: input.claimHandle.jobId } });
    if (!transactionJob) throw new Error('Affiliate source mapping job not found.');
    const transactionIntake = supplyDatabase.intakes?.findUnique
      ? await supplyDatabase.intakes.findUnique({ where: { id: transactionJob.intakeId } })
      : null;
    const transactionSource = sourceId && supplyDatabase.sources?.findUnique
      ? await supplyDatabase.sources.findUnique({ where: { id: sourceId } })
      : null;
    const supplySourceId = stringValue(transactionJob.supplySourceId)
      ?? stringValue(transactionIntake?.supplySourceId)
      ?? stringValue(transactionSource?.supplySourceId);
    if (
      transactionJob.workerId !== input.claimHandle.workerId
      || new Date(transactionJob.claimedAt).getTime() !== new Date(input.claimHandle.claimedAt).getTime()
      || transactionJob.status !== 'CLAIMED'
    ) {
      throw new Error('Affiliate source mapping claim is stale or no longer owned.');
    }
    const now = new Date();
    const transactionPreviousEnvelope = recordValue(transactionJob.resultSummary);
    const transactionPreservedAuditFields = [
      'claimEvidenceContext',
      'humanSportResolution',
      'sportResolutionHistory',
      'sportCatalogRefreshHistory',
      'sportReconciliationHistory',
      'claimEvidenceHistory',
      'approvalCycleHistory',
    ].reduce<Record<string, unknown>>((fields, field) => {
      if (transactionPreviousEnvelope[field] !== undefined) {
        fields[field] = transactionPreviousEnvelope[field];
      }
      return fields;
    }, {});
    const transactionRepairHistory = Array.isArray(transactionPreviousEnvelope.mappingRepairHistory)
      ? transactionPreviousEnvelope.mappingRepairHistory
      : [];
    const transactionFullReviewHistory = Array.isArray(transactionPreviousEnvelope.mappingFullReviewHistory)
      ? transactionPreviousEnvelope.mappingFullReviewHistory
      : [];
    let transactionResultSummary: Record<string, unknown> = {
      ...submittedEnvelope,
      ...transactionPreservedAuditFields,
      ...(hasEventDateTimeRemediationContext(transactionJob.resultSummary)
        ? {
            cohortKey: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
            remediationContext: AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT,
            remediationContexts: [AFFILIATE_EVENT_DATETIME_REMEDIATION_CONTEXT],
          }
        : {}),
      ...(transactionRepairHistory.length ? { mappingRepairHistory: transactionRepairHistory } : {}),
      ...(transactionFullReviewHistory.length ? { mappingFullReviewHistory: transactionFullReviewHistory } : {}),
    };
    const submittedResult = recordValue(transactionResultSummary.result);
    const submittedDeterminations = Array.isArray(submittedResult.sportDeterminations)
      ? submittedResult.sportDeterminations
      : [];
    const userDecisionHashes = submittedDeterminations
      .filter((determination) => (
        recordValue(determination).resolutionBasis === 'USER_DECISION'
      ))
      .map((determination) => stringValue(recordValue(determination).resolvedFromDeterminationSha256))
      .filter((hash): hash is string => Boolean(hash))
      .sort();
    const pendingHumanResolution = transactionResultSummary.humanSportResolution
      ? affiliateHumanSportResolutionSchema.parse(transactionResultSummary.humanSportResolution)
      : null;
    if (input.status === 'REVIEW_REQUIRED' && pendingHumanResolution?.state === 'PENDING' && userDecisionHashes.length) {
      const resolutionHashes = pendingHumanResolution.resolutions
        .map((resolution) => resolution.determinationSha256.toLowerCase())
        .sort();
      if (JSON.stringify(resolutionHashes) !== JSON.stringify(userDecisionHashes)) {
        throw new Error('Human sport resolution coverage does not match the USER_DECISION determinations.');
      }
      transactionResultSummary = {
        ...transactionResultSummary,
        humanSportResolution: {
          ...pendingHumanResolution,
          state: 'CONSUMED',
          consumedAt: now.toISOString(),
          consumedDeterminationSha256s: userDecisionHashes,
        },
      };
    }
    const approval = input.status === 'REVIEW_REQUIRED'
      ? await transactionApprovals.findUnique({
          where: {
            subjectType_subjectKey: {
              subjectType: 'MAPPING_PACKAGE',
              subjectKey: transactionJob.id,
            },
          },
        })
      : null;
    if (approval?.status === 'CLAIMED') {
      throw new Error('Affiliate mapping approval is actively claimed and completion cannot replace it.');
    }
    if (approval && ['APPROVED', 'REJECTED', 'DEFERRED'].includes(approval.status)) {
      const priorApproval = {
        id: approval.id,
        status: approval.status,
        claimedAt: approval.claimedAt ?? null,
        leaseExpiresAt: approval.leaseExpiresAt ?? null,
        reviewerId: approval.reviewerId ?? null,
        attemptCount: approval.attemptCount ?? null,
        decision: approval.decision ?? null,
        errorMessage: approval.errorMessage ?? null,
        finishedAt: approval.finishedAt ?? null,
      };
      transactionResultSummary = appendAffiliateMappingResultHistory({
        envelope: transactionResultSummary,
        field: 'approvalCycleHistory',
        entry: priorApproval,
      });
    }
    const finished = await transactionJobs.updateMany({
      where: {
        id: input.claimHandle.jobId,
        status: 'CLAIMED',
        workerId: input.claimHandle.workerId,
        claimedAt: new Date(input.claimHandle.claimedAt),
        leaseExpiresAt: { gte: now },
      },
      data: {
        ...(sourceId && mappingId ? { sourceId, mappingId } : {}),
        ...(supplySourceId ? { supplySourceId } : {}),
        status: input.status,
        branch: input.branch?.trim() || null,
        commit: input.commit?.trim() || null,
        resultSummary: transactionResultSummary,
        errorMessage: input.errorMessage?.trim() || null,
        finishedAt: now,
        leaseExpiresAt: null,
      },
    });
    if (finished.count !== 1) {
      throw new Error('Affiliate source mapping claim is stale or no longer owned.');
    }
    await transactionIntakes.update({
      where: { id: transactionJob.intakeId },
      data: { status: input.status === 'APPROVED' ? 'PROMOTED' : input.status },
    });
    if (supplySourceId) {
      await linkAffiliateSupplyRecord({
        supplySourceId,
        intakeId: transactionJob.intakeId,
        sourceId,
        mappingId,
        mappingJobId: transactionJob.id,
        db: supplyDatabase,
      });
    }
    if (
      supplySourceId
      && mappingId
      && ['EXPANDED', 'REVIEW_REQUIRED', 'APPROVED'].includes(input.status)
      && typeof supplyDatabase.supplySources?.findUnique === 'function'
      && typeof supplyDatabase.contractManifests?.findFirst === 'function'
      && typeof supplyDatabase.transitions?.findUnique === 'function'
      && typeof supplyDatabase.transitions?.findFirst === 'function'
      && typeof supplyDatabase.transitions?.create === 'function'
    ) {
      const lifecycleRoot = await supplyDatabase.supplySources.findUnique({
        where: { id: supplySourceId },
      });
      if (!lifecycleRoot) throw new Error('Affiliate Supply Source root not found for mapping completion.');
      await executeAffiliateSupplyLifecycleCommand({
        supplySourceId,
        command: 'RECORD_MAPPING',
        authority: 'MAPPING_PRODUCER',
        expectedLifecycleGeneration: Number(lifecycleRoot.lifecycleGeneration ?? 0),
        idempotencyKey: `mapping:${transactionJob.id}:${input.claimHandle.claimedAt}:${input.status}`,
        request: {
          sourceId,
          mappingId,
          mappingJobId: transactionJob.id,
          evidenceRefs: mappingLifecycleEvidenceRefs(
            transactionJob,
            transactionResultSummary,
            mappingId,
          ),
        },
        actorKind: 'MAPPING_PRODUCER',
        actorId: input.claimHandle.workerId,
        executingAgentId: input.claimHandle.workerId,
        db: supplyDatabase,
        now,
      });
    }
    if (approval && ['APPROVED', 'REJECTED', 'DEFERRED'].includes(approval.status)) {
      await transactionApprovals.update({
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
    }
    return transactionJobs.findUnique({ where: { id: input.claimHandle.jobId } });
  };
  const client = (input.db ?? prisma) as any;
  return typeof client.$transaction === 'function'
    ? client.$transaction(finalize, { isolationLevel: 'Serializable' })
    : finalize(client);
};
