/** @jest-environment node */

import {
  applyAffiliateSportReconciliation,
  evaluateAffiliateSportReconciliationEligibility,
  selectAffiliateSportReconciliationRows,
} from '../affiliateSportReconciliation';

type Job = Record<string, unknown>;

const catalog = {
  schemaVersion: 1 as const,
  capturedAt: '2026-08-10T00:00:00.000Z',
  sha256: 'a'.repeat(64),
  sports: [{ id: 'sport-1', name: 'Grass Soccer' }],
};

const dbFor = (jobs: Job[], intakeById: Record<string, Job | null> = {}) => {
  const mappingJobs = {
    findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      if (where?.intakeId) return jobs.filter((job) => job.intakeId === where.intakeId);
      if (where?.id) return jobs.filter((job) => job.id === where.id);
      return jobs;
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id) ?? null),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const job = jobs.find((candidate) => candidate.id === where.id);
      if (!job || (where.status && job.status !== where.status) || job.sourceId || job.mappingId) return { count: 0 };
      Object.assign(job, data);
      return { count: 1 };
    }),
  };
  const intakes = {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => intakeById[where.id] ?? { id: where.id }),
    updateMany: jest.fn(async () => ({ count: 1 })),
    update: jest.fn(async () => ({})),
  };
  const approvals = { findMany: jest.fn(async () => []) };
  const database = { mappingJobs, intakes, approvals };
  return { database, jobs };
};

const pureJob = (overrides: Job = {}): Job => ({
  id: 'mapping-1',
  intakeId: 'intake-1',
  status: 'HUMAN_REVIEW_REQUIRED',
  sourceId: null,
  mappingId: null,
  resultSummary: {
    result: {
      humanReviewRequired: {
        reasonCodes: ['SPORT_NOT_IN_CATALOG'],
        sourceSportLabels: ['Soccer'],
      },
    },
  },
  ...overrides,
});

describe('affiliate sport reconciliation', () => {
  it('selects only an exact sole structured catalog reason and rejects mixed reasons', () => {
    const eligible = evaluateAffiliateSportReconciliationEligibility(
      pureJob(),
      { id: 'intake-1' },
      [],
      [pureJob()],
    );
    expect(eligible).toEqual(expect.objectContaining({
      eligible: true,
      reason: 'STRUCTURED_SOLE_SPORT_NOT_IN_CATALOG',
    }));
    const mixed = evaluateAffiliateSportReconciliationEligibility(
      pureJob({ resultSummary: { result: { humanReviewRequired: { reasonCodes: ['SPORT_NOT_IN_CATALOG', 'SPORT_VARIANT_UNRESOLVED'] } } } }),
      { id: 'intake-1' },
      [],
      [],
    );
    expect(mixed.eligible).toBe(false);
    expect(mixed.reason).toBe('MIXED_OR_NON_SPORT_STRUCTURED_REASON');
  });

  it('rejects package-bearing, active-approval, and active-mapping rows', () => {
    expect(evaluateAffiliateSportReconciliationEligibility(
      pureJob({ sourceId: 'source-1' }), { id: 'intake-1' }, [], [],
    ).reason).toBe('PACKAGE_OR_MAPPING_ID_PRESENT');
    expect(evaluateAffiliateSportReconciliationEligibility(
      pureJob(), { id: 'intake-1' }, [{ id: 'approval', status: 'CLAIMED' }], [],
    ).reason).toBe('ACTIVE_APPROVAL_PRESENT');
    expect(evaluateAffiliateSportReconciliationEligibility(
      pureJob(), { id: 'intake-1' }, [], [{ ...pureJob(), id: 'other', status: 'QUEUED' }],
    ).reason).toBe('ACTIVE_MAPPING_JOB_PRESENT');
  });

  it('requires labels for anchored legacy messages and does not use broad sport substrings', () => {
    const legacy = pureJob({
      resultSummary: {
        errorMessage: 'Unsupported source sports were preserved as evidence only.',
        humanReviewRequired: { sourceSportLabels: ['Unknown Sport'] },
      },
    });
    expect(evaluateAffiliateSportReconciliationEligibility(legacy, { id: 'intake-1' }, [], []).eligible).toBe(true);
    expect(evaluateAffiliateSportReconciliationEligibility(
      { ...legacy, resultSummary: { errorMessage: 'sport failure while fetching the page' } },
      { id: 'intake-1' }, [], [],
    ).eligible).toBe(false);
    expect(evaluateAffiliateSportReconciliationEligibility(
      { ...legacy, resultSummary: { errorMessage: 'Unsupported source sports were preserved as evidence only.' } },
      { id: 'intake-1' }, [], [],
    ).sourceLabelsMissing).toBe(true);
  });

  it('produces deterministic preview rows and refuses count/hash drift', async () => {
    const { database } = dbFor([pureJob()]);
    const preview = await selectAffiliateSportReconciliationRows({}, {
      database,
      loadCatalog: async () => catalog,
      now: () => new Date('2026-08-10T01:00:00.000Z'),
    });
    expect(preview.mode).toBe('DRY_RUN');
    expect(preview.writeCount).toBe(0);
    expect(preview.selectedCount).toBe(1);
    await expect(applyAffiliateSportReconciliation({
      preview,
      expectedCount: 2,
      expectedSelectionSha256: preview.selectionSha256,
    }, { database, loadCatalog: async () => catalog })).rejects.toThrow('count');
    await expect(applyAffiliateSportReconciliation({
      preview,
      expectedCount: 1,
      expectedSelectionSha256: 'b'.repeat(64),
    }, { database, loadCatalog: async () => catalog })).rejects.toThrow('hash');
  });

  it('requeues once, preserves an archived nonrecursive history entry, and is idempotent', async () => {
    const { database, jobs } = dbFor([pureJob({ resultSummary: { result: { humanReviewRequired: { reasonCodes: ['SPORT_NOT_IN_CATALOG'], sourceSportLabels: ['Soccer'] } }, mappingRepairHistory: [{ repairReasons: ['SPORT_NOT_IN_CATALOG'] }] } })]);
    const preview = await selectAffiliateSportReconciliationRows({}, { database, loadCatalog: async () => catalog });
    const applied = await applyAffiliateSportReconciliation({
      preview,
      expectedCount: 1,
      expectedSelectionSha256: preview.selectionSha256,
    }, { database, loadCatalog: async () => catalog });
    expect(jobs[0].status).toBe('QUEUED');
    const history = (jobs[0].resultSummary as Job).sportReconciliationHistory as Job[];
    expect(history).toHaveLength(1);
    expect(history[0].archivedPriorResultSummary).toEqual(expect.objectContaining({ historyPrefixes: expect.any(Array) }));
    expect((history[0].archivedPriorResultSummary as Job).mappingRepairHistory).toBeUndefined();
    const second = await selectAffiliateSportReconciliationRows({}, { database, loadCatalog: async () => catalog });
    expect(second.eligibleCount).toBe(0);
    expect(second.alreadyReconciledCount).toBe(1);
  });
});
