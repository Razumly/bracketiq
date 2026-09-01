/** @jest-environment node */

const prismaMock = {
  affiliateSourceIntakes: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  affiliateSourceMappingJobs: {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  affiliateApprovalJobs: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  affiliateScrapeSources: {
    findUnique: jest.fn(),
  },
  affiliateSupplySources: {
    findUnique: jest.fn(),
  },
  affiliateSupplyContractManifests: {
    findFirst: jest.fn(),
  },
  affiliateSupplyLifecycleTransitions: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/id', () => ({ createId: () => 'generated_job' }));
const mockExecuteAffiliateSupplyLifecycleCommand = jest.fn();
jest.mock('@/server/affiliateImports/affiliateSupplyPersistence', () => ({
  ...jest.requireActual('@/server/affiliateImports/affiliateSupplyPersistence'),
  executeAffiliateSupplyLifecycleCommand: (...args: unknown[]) => (
    mockExecuteAffiliateSupplyLifecycleCommand(...args)
  ),
}));

import {
  claimNextAffiliateSourceIntakeForMapping,
  finishAffiliateSourceMappingClaim,
} from '@/server/affiliateImports/sourceMappingQueue';

const eventDateTimeReview = {
  contractRevision: 'event-datetime-v1',
  candidateCount: 1,
  timeZoneEvidence: { SOURCE_FIELD: 0, COORDINATES: 1, EXPLICIT_OFFSET: 0, NONE: 0 },
  startPrecision: { DATE_TIME: 1, DATE_ONLY: 0, NONE: 0 },
  endDerivation: { EXPLICIT_END: 0, EXPLICIT_DURATION: 0, NONE: 1 },
  durationWarnings: 0,
  utcHostRegression: {
    passed: true,
    comparedCandidateCount: 1,
    hostTimeZones: ['UTC', 'America/Los_Angeles'],
  },
  displayModeCounts: { SCHEDULED: 1, DATE_ONLY: 0, NO_FIXED_DATE: 0, ONGOING: 0 },
  evergreenTransitions: [],
  evergreenEvidence: {
    scheduleTextBacked: 0,
    datedSessionsMappedSeparately: 0,
    hiddenDatedOccurrences: 0,
    tryoutOrEvaluationMarkedEvergreen: 0,
  },
  repairReasonCodes: [],
};

const claimHandle = {
  jobId: 'job_1',
  workerId: 'worker-1',
  claimedAt: '2026-08-02T10:00:00.000Z',
} as const;
describe('affiliate source mapping queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T12:00:00Z'));
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    mockExecuteAffiliateSupplyLifecycleCommand.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('claims a queued mapping job once and marks the intake in progress', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'QUEUED',
      createdAt: new Date(),
      resultSummary: {
        mappingRepairHistory: [{
          repairReason: 'MANUAL_LOGO_REVIEW',
          repairReasons: ['OFFICIAL_LOGO_REPAIR_REQUIRED', 'EVENT_PRICING_INVALID'],
          queuedAt: '2026-08-01T23:00:00.000Z',
          priorMappingStatus: 'REVIEW_REQUIRED',
          priorMappingErrorMessage: 'Official logo verification failed.',
          approvalJobId: 'approval_1',
          approvalStatus: 'REJECTED',
          reviewerId: 'reviewer-1',
          decision: 'REJECT',
          rationale: 'The package needs two producer fixes.',
          blockingIssues: ['Logo invalid.', 'Prices collapsed.'],
        }],
      },
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1', sourceKey: 'river-city-soccer', status: 'READY_FOR_MAPPING',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});

    const claimed = await claimNextAffiliateSourceIntakeForMapping({
      workerId: 'worker-1',
      now: new Date('2026-07-21T12:00:00Z'),
    });

    expect(claimed).toEqual(expect.objectContaining({
      jobId: 'job_1', intakeId: 'intake_1', sourceKey: 'river-city-soccer', workerId: 'worker-1',
      repairContext: {
        repairReason: 'MANUAL_LOGO_REVIEW',
        repairReasons: ['OFFICIAL_LOGO_REPAIR_REQUIRED', 'EVENT_PRICING_INVALID'],
        queuedAt: '2026-08-01T23:00:00.000Z',
        priorMappingStatus: 'REVIEW_REQUIRED',
        priorMappingErrorMessage: 'Official logo verification failed.',
        approvalJobId: 'approval_1',
        approvalStatus: 'REJECTED',
        reviewerId: 'reviewer-1',
        decision: 'REJECT',
        rationale: 'The package needs two producer fixes.',
        blockingIssues: ['Logo invalid.', 'Prices collapsed.'],
      },
    }));
    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'job_1' }),
      data: expect.objectContaining({ status: 'CLAIMED', workerId: 'worker-1' }),
    }));
    expect(prismaMock.affiliateSourceIntakes.update).not.toHaveBeenCalled();
  });

  it('returns null when no claimable job exists', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue(null);
    expect(await claimNextAffiliateSourceIntakeForMapping({ workerId: 'worker-1' })).toBeNull();
  });

  it('preserves a direct datetime remediation context for the producer', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'QUEUED',
      createdAt: new Date(),
      resultSummary: {
        repairContext: { remediationContext: 'event-datetime-v1' },
      },
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1', sourceKey: 'rose-city-hockey', status: 'READY_FOR_MAPPING',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});

    const claim = await claimNextAffiliateSourceIntakeForMapping({ workerId: 'worker-1' });
    expect(claim).toEqual(expect.objectContaining({
      repairContext: expect.objectContaining({
        remediationContext: 'event-datetime-v1',
      }),
    }));
    expect(claim?.repairContext).not.toHaveProperty('repairReason');
    expect(claim?.repairContext).not.toHaveProperty('repairReasons');
  });

  it('resumes and renews an active claim owned by the same mapper', async () => {
    prismaMock.affiliateSourceMappingJobs.findFirst.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'CLAIMED',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      attemptCount: 1,
      resultSummary: null,
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({
      id: 'intake_1', sourceKey: 'source-1', status: 'MAPPING_IN_PROGRESS',
    });

    const claim = await claimNextAffiliateSourceIntakeForMapping({
      workerId: 'worker-1',
      now: new Date('2026-08-02T12:00:00Z'),
    });

    expect(claim).toEqual(expect.objectContaining({
      jobId: 'job_1',
      workerId: 'worker-1',
      resumed: true,
      leaseExpiresAt: new Date('2026-08-02T14:00:00Z'),
    }));
    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job_1',
        status: 'CLAIMED',
        workerId: 'worker-1',
        leaseExpiresAt: { gte: new Date('2026-08-02T12:00:00Z') },
      },
      data: { leaseExpiresAt: new Date('2026-08-02T14:00:00Z') },
    });
  });

  it('assigns concurrent mappers different jobs through conditional claims', async () => {
    const jobs = [
      { id: 'job_1', intakeId: 'intake_1', status: 'QUEUED', createdAt: new Date('2026-08-02T10:00:00Z') },
      { id: 'job_2', intakeId: 'intake_2', status: 'QUEUED', createdAt: new Date('2026-08-02T10:01:00Z') },
    ];
    const intakes = [
      { id: 'intake_1', sourceKey: 'source-1', status: 'READY_FOR_MAPPING' },
      { id: 'intake_2', sourceKey: 'source-2', status: 'READY_FOR_MAPPING' },
    ];
    prismaMock.affiliateSourceMappingJobs.findFirst.mockImplementation(async () => (
      jobs.find((job) => job.status === 'QUEUED') ?? null
    ));
    prismaMock.affiliateSourceMappingJobs.updateMany.mockImplementation(async ({ where, data }: any) => {
      const job = jobs.find((candidate) => candidate.id === where.id);
      if (!job || job.status !== 'QUEUED') return { count: 0 };
      Object.assign(job, data, { attemptCount: 1 });
      return { count: 1 };
    });
    prismaMock.affiliateSourceIntakes.findUnique.mockImplementation(async ({ where }: any) => (
      intakes.find((intake) => intake.id === where.id) ?? null
    ));
    prismaMock.affiliateSourceIntakes.update.mockImplementation(async ({ where, data }: any) => {
      const intake = intakes.find((candidate) => candidate.id === where.id);
      Object.assign(intake!, data);
      return intake;
    });

    const claims = await Promise.all([
      claimNextAffiliateSourceIntakeForMapping({ workerId: 'mapper-1' }),
      claimNextAffiliateSourceIntakeForMapping({ workerId: 'mapper-2' }),
    ]);

    expect(claims.map((claim) => claim?.jobId).sort()).toEqual(['job_1', 'job_2']);
    expect(new Set(claims.map((claim) => claim?.workerId))).toEqual(new Set(['mapper-1', 'mapper-2']));
  });

  it('uses the active-intake uniqueness conflict so concurrent exact claims share one job', async () => {
    const intake = { id: 'intake_exact', sourceKey: 'exact-source', status: 'READY_FOR_MAPPING' };
    let activeJob: any = null;
    let createAttempts = 0;
    let successfulCreates = 0;
    let releaseCreateBarrier!: () => void;
    let releaseClaimBarrier!: () => void;
    const bothCreatesStarted = new Promise<void>((resolve) => {
      releaseCreateBarrier = resolve;
    });
    const winnerClaimed = new Promise<void>((resolve) => {
      releaseClaimBarrier = resolve;
    });

    prismaMock.affiliateSourceMappingJobs.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.status === 'CLAIMED') return null;
      if (where?.status?.in) {
        await winnerClaimed;
        return activeJob;
      }
      if (where?.OR) return activeJob?.status === 'QUEUED' ? activeJob : null;
      return null;
    });
    prismaMock.affiliateSourceIntakes.findFirst.mockResolvedValue(intake);
    prismaMock.affiliateSourceMappingJobs.create.mockImplementation(async ({ data }: any) => {
      createAttempts += 1;
      if (createAttempts === 2) releaseCreateBarrier();
      await bothCreatesStarted;
      if (activeJob) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      successfulCreates += 1;
      activeJob = { ...data, createdAt: new Date(), status: 'QUEUED' };
      return activeJob;
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (!activeJob || where.id !== activeJob.id || activeJob.status !== 'QUEUED') return { count: 0 };
      Object.assign(activeJob, data);
      releaseClaimBarrier();
      return { count: 1 };
    });
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue(intake);
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});

    const claims = await Promise.all([
      claimNextAffiliateSourceIntakeForMapping({ workerId: 'mapper-exact-1', intakeId: intake.id }),
      claimNextAffiliateSourceIntakeForMapping({ workerId: 'mapper-exact-2', intakeId: intake.id }),
    ]);

    expect(successfulCreates).toBe(1);
    expect(activeJob).toEqual(expect.objectContaining({ intakeId: intake.id, status: 'CLAIMED' }));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(Array.from(new Set(claims.filter(Boolean).map((claim) => claim?.workerId)))).toHaveLength(1);
    expect(prismaMock.affiliateSourceMappingJobs.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.affiliateSourceIntakes.update).not.toHaveBeenCalled();
  });

  it('records a directory expansion as a terminal non-mapping intake result', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'CLAIMED',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'EXPANDED',
      resultSummary: { submitted: 3 },
    })).resolves.toEqual(expect.objectContaining({ status: 'CLAIMED' }));
    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'job_1', workerId: 'worker-1' }),
      data: expect.objectContaining({ status: 'EXPANDED', leaseExpiresAt: null }),
    }));
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { status: 'EXPANDED' },
    });
  });
  it('replays a terminal lifecycle completion after post-commit alert delivery fails', async () => {
    let mappingJob: Record<string, unknown> = {
      id: 'job_1',
      intakeId: 'intake_1',
      sourceId: 'source_1',
      mappingId: 'mapping_1',
      supplySourceId: 'root_1',
      status: 'CLAIMED',
      workerId: claimHandle.workerId,
      claimedAt: new Date(claimHandle.claimedAt),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {},
    };
    const mappingJobs = {
      findUnique: jest.fn(async () => mappingJob),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mappingJob = { ...mappingJob, ...data };
        return { count: 1 };
      }),
    };
    const intakes = {
      findUnique: jest.fn(async () => ({ id: 'intake_1', supplySourceId: 'root_1' })),
      update: jest.fn(async () => ({})),
    };
    const sources = {
      findUnique: jest.fn(async () => ({ id: 'source_1', supplySourceId: 'root_1' })),
      update: jest.fn(async () => ({})),
    };
    const approvals = {
      findUnique: jest.fn(async () => null),
    };
    const supplySources = {
      findUnique: jest.fn(async () => ({ id: 'root_1', lifecycleGeneration: 2 })),
    };
    const contractManifests = {
      findFirst: jest.fn(async () => ({ status: 'ACTIVE' })),
    };
    const transitions = {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
    };
    let database: Record<string, unknown>;
    database = {
      affiliateSourceMappingJobs: mappingJobs,
      affiliateSourceIntakes: intakes,
      affiliateApprovalJobs: approvals,
      affiliateSources: sources,
      affiliateScrapeSources: sources,
      affiliateSupplySources: supplySources,
      affiliateSupplyContractManifests: contractManifests,
      affiliateSupplyLifecycleTransitions: transitions,
      intakes,
      sources,
      supplySources,
      contractManifests,
      transitions,
      transaction: async (callback: (transactionDatabase: unknown) => Promise<unknown>) => (
        callback(database)
      ),
    };
    mockExecuteAffiliateSupplyLifecycleCommand
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('alert delivery unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      status: 'EXPANDED',
      sourceId: 'source_1',
      mappingId: 'mapping_1',
      resultSummary: { evidenceRefs: ['mapping-evidence'] },
      db: database,
    })).rejects.toThrow('alert delivery unavailable');
    expect(mappingJob).toEqual(expect.objectContaining({ status: 'EXPANDED' }));

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      status: 'EXPANDED',
      sourceId: 'source_1',
      mappingId: 'mapping_1',
      db: database,
    })).resolves.toEqual(expect.objectContaining({ status: 'EXPANDED' }));
    expect(mockExecuteAffiliateSupplyLifecycleCommand).toHaveBeenCalledTimes(3);
    expect(mockExecuteAffiliateSupplyLifecycleCommand).toHaveBeenLastCalledWith(expect.objectContaining({
      idempotencyKey: 'mapping:job_1:2026-08-02T10:00:00.000Z:EXPANDED',
      supplySourceId: 'root_1',
    }));
  });

  it('records unsupported sports as terminal human review without creating or reopening approval', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'CLAIMED',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
    });
    prismaMock.affiliateSourceMappingJobs.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'HUMAN_REVIEW_REQUIRED',
      resultSummary: {
        humanReviewRequired: {
          reasonCodes: ['SPORT_NOT_IN_CATALOG'],
          sourceSportLabels: ['Volleyball'],
        },
      },
    })).resolves.toEqual(expect.objectContaining({ status: 'CLAIMED' }));
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { status: 'HUMAN_REVIEW_REQUIRED' },
    });
    expect(prismaMock.affiliateApprovalJobs.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.affiliateApprovalJobs.update).not.toHaveBeenCalled();
  });

  it('requires datetime review evidence for an event-datetime remediation claim', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      status: 'CLAIMED',
      intakeId: 'intake_1',
      legacyIdentityMigrationEligible: true,
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: { remediationContext: 'event-datetime-v1' },
    });

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    })).rejects.toThrow('require a valid dateTimeReview section');
    expect(prismaMock.affiliateSourceMappingJobs.update).not.toHaveBeenCalled();
  });

  it('accepts datetime review evidence for an event-datetime remediation claim', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'CLAIMED',
      legacyIdentityMigrationEligible: true,
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {
        mappingFullReviewHistory: [{ remediationContexts: ['event-datetime-v1'] }],
      },
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'REVIEW_REQUIRED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue(null);

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: {
        result: {
          status: 'REVIEW_REQUIRED',
          dateTimeReview: eventDateTimeReview,
        },
      },
    })).resolves.toEqual(expect.objectContaining({ status: 'CLAIMED' }));
  });

  it('persists the exact source and mapping package identity at completion', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      status: 'CLAIMED',
      id: 'job_1',
      intakeId: 'intake_1',
      sourceId: null,
      mappingId: null,
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {},
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      sourceId: 'source_1',
      mappingId: 'mapping_1',
      status: 'REVIEW_REQUIRED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValueOnce({
      status: 'CLAIMED',
      id: 'job_1',
      intakeId: 'intake_1',
      sourceId: null,
      mappingId: null,
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {},
    });
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue(null);
    prismaMock.affiliateSourceIntakes.findUnique.mockResolvedValue({ id: 'intake_1', supplySourceId: 'supply-1' });
    prismaMock.affiliateSupplySources.findUnique.mockResolvedValue({
      id: 'supply-1',
      lifecycleGeneration: 0,
    });
    prismaMock.affiliateScrapeSources.findUnique.mockResolvedValue({
      id: 'source_1',
      supplySourceId: 'supply-1',
    });
    await finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      sourceId: 'source_1',
      mappingId: 'mapping_1',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    });

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceId: 'source_1', mappingId: 'mapping_1', supplySourceId: 'supply-1' }),
    }));
    expect(prismaMock.affiliateSourceMappingJobs.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: { supplySourceId: 'supply-1' },
    });
    expect(prismaMock.affiliateSourceIntakes.update).toHaveBeenCalledWith({
      where: { id: 'intake_1' },
      data: { supplySourceId: 'supply-1' },
    });
  });

  it('does not allow completion to replace an existing package identity', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'CLAIMED',
      sourceId: 'source_original',
      mappingId: 'mapping_original',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {},
    });

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      sourceId: 'source_replacement',
      mappingId: 'mapping_replacement',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    })).rejects.toThrow('cannot be replaced');
    expect(prismaMock.affiliateSourceMappingJobs.update).not.toHaveBeenCalled();
  });

  it('requires identity for a new review completion without the legacy marker', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      status: 'CLAIMED',
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {},
    });

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    })).rejects.toThrow('unless explicit legacy identity migration is enabled');
    expect(prismaMock.affiliateSourceMappingJobs.update).not.toHaveBeenCalled();
  });

  it.each(['CLAIMED'])('allows a marked pre-migration %s job to complete without identity', async (status) => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      legacyIdentityMigrationEligible: true,
      status,
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {},
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'REVIEW_REQUIRED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue(null);

    await expect(finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    })).resolves.toEqual(expect.objectContaining({ status: 'CLAIMED' }));
  });

  it('preserves datetime remediation context after completion', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      legacyIdentityMigrationEligible: true,
      status: 'CLAIMED',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {
        mappingFullReviewHistory: [{ cohortKey: 'event-datetime-v1' }],
      },
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      status: 'REVIEW_REQUIRED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue(null);

    await finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: {
        result: {
          status: 'REVIEW_REQUIRED',
          dateTimeReview: eventDateTimeReview,
        },
      },
    });

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resultSummary: expect.objectContaining({
          cohortKey: 'event-datetime-v1',
          remediationContext: 'event-datetime-v1',
          remediationContexts: ['event-datetime-v1'],
        }),
      }),
    }));
  });

  it('preserves repair history and reopens a rejected approval after a repaired package completes', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      intakeId: 'intake_1',
      legacyIdentityMigrationEligible: true,
      status: 'CLAIMED',
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {
        mappingRepairHistory: [{ repairReason: 'EVENT_LOCATION_PACKAGE_REJECTION' }],
        mappingFullReviewHistory: [{
          cohortKey: 'description-quality-v1',
          repairHistoryStartIndex: 1,
        }],
      },
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'REVIEW_REQUIRED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue({
      id: 'approval_1', status: 'REJECTED',
    });
    prismaMock.affiliateApprovalJobs.update.mockResolvedValue({});

    await finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    });

    expect(prismaMock.affiliateSourceMappingJobs.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resultSummary: expect.objectContaining({
          mappingRepairHistory: [{ repairReason: 'EVENT_LOCATION_PACKAGE_REJECTION' }],
          mappingFullReviewHistory: [{
            cohortKey: 'description-quality-v1',
            repairHistoryStartIndex: 1,
          }],
        }),
      }),
    }));
    expect(prismaMock.affiliateApprovalJobs.update).toHaveBeenCalledWith({
      where: { id: 'approval_1' },
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
  });

  it('reopens an approved review row after an operator-requested producer repair completes', async () => {
    prismaMock.affiliateSourceMappingJobs.findUnique.mockResolvedValue({
      id: 'job_1',
      status: 'CLAIMED',
      intakeId: 'intake_1',
      legacyIdentityMigrationEligible: true,
      workerId: 'worker-1',
      claimedAt: new Date('2026-08-02T10:00:00Z'),
      leaseExpiresAt: new Date('2026-08-02T13:00:00Z'),
      resultSummary: {
        mappingRepairHistory: [{
          repairReason: 'CLUB_CANONICAL_ORGANIZATION_INVALID',
        }],
      },
    });
    prismaMock.affiliateSourceMappingJobs.update.mockResolvedValue({
      id: 'job_1', intakeId: 'intake_1', status: 'REVIEW_REQUIRED',
    });
    prismaMock.affiliateSourceIntakes.update.mockResolvedValue({});
    prismaMock.affiliateApprovalJobs.findUnique.mockResolvedValue({
      id: 'approval_1', status: 'APPROVED',
    });
    prismaMock.affiliateApprovalJobs.update.mockResolvedValue({});

    await finishAffiliateSourceMappingClaim({
      claimHandle,
      jobId: 'job_1',
      status: 'REVIEW_REQUIRED',
      resultSummary: { result: { status: 'REVIEW_REQUIRED' } },
    });

    expect(prismaMock.affiliateApprovalJobs.update).toHaveBeenCalledWith({
      where: { id: 'approval_1' },
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
  });
});
