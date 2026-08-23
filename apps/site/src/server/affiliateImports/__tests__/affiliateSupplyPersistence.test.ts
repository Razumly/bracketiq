/** @jest-environment node */

import {
  buildAffiliateSupplyContractManifest,
  type AffiliateSupplyContractPolicy,
} from '../affiliateSupplyLifecycle';
import {
  activateAffiliateSupplyContract,
  createAffiliateSupplyLifecycleAuthority,
  executeAffiliateSupplyLifecycleCommand,
  loadActiveAffiliateSupplyContract,
  loadActiveAffiliateSupplyContracts,
  planAffiliateReplenishmentFromDatabase,
  reconcileAffiliateReplenishment,
  reconcileAffiliateReplenishmentDemands,
  type AffiliateSupplyDatabase,
} from '../affiliateSupplyPersistence';

import { hashAffiliateAgentValue } from '../agentGatewayContracts';
const policy: AffiliateSupplyContractPolicy = {
  schemaVersion: 1,
  version: 3,
  rolloutCohort: 'DEFAULT',
  hash: 'ignored-by-builder',
  freshnessWindows: [{ sourceProfile: 'EVENT', maximumAgeHours: 24 }],
  targets: [{
    marketKey: 'portland',
    sportId: 'soccer',
    sourceProfile: 'EVENT',
    minimumFreshPublishedSupply: 2,
  }],
  requiredMappingEvidenceKinds: ['PAGE_HTML'],
  requiredLifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
};

const manifest = buildAffiliateSupplyContractManifest({
  version: policy.version,
  rolloutCohort: policy.rolloutCohort,
  supplyContract: { ...policy, hash: undefined },
});
const impactReport = {
  rolloutCohort: manifest.rolloutCohort,
  currentContractVersion: 0,
  nextContractVersion: manifest.version,
  sourceCount: 0,
  impactedSourceCount: 0,
  currentCellCount: 0,
  nextCellCount: 1,
  impactedCellCount: 1,
  impactedTargetCells: [{
    marketKey: policy.targets[0].marketKey,
    sportId: policy.targets[0].sportId,
    sourceProfile: policy.targets[0].sourceProfile,
  }],
  stageRegressions: 0,
  newlyDueSearches: 0,
  repairWork: 0,
  automationStops: 0,
  targetMetChanges: 0,
  affectedSourceIds: [],
};

const createManifestDatabase = () => {
  let stored: Record<string, unknown> | null = null;
  const contractManifests = {
    findUnique: jest.fn(async () => stored),
    findFirst: jest.fn(async () => stored),
    updateMany: jest.fn(async () => ({ count: 1 })),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      stored = data;
      return data;
    }),
  };
  const database = {
    contractManifests,
    transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
  } as unknown as AffiliateSupplyDatabase;
  return { database, contractManifests };
};

describe('affiliate supply persistence seams', () => {
  it('loads one active Supply Contract per rollout cohort', async () => {
    const expansionManifest = buildAffiliateSupplyContractManifest({
      version: manifest.version,
      rolloutCohort: 'EXPANSION',
      supplyContract: {
        ...policy,
        rolloutCohort: 'EXPANSION',
        hash: undefined,
      },
      status: 'ACTIVE',
    });
    const database = {
      contractManifests: {
        findMany: jest.fn(async () => [
          {
            status: 'ACTIVE',
            version: expansionManifest.version,
            rolloutCohort: expansionManifest.rolloutCohort,
            contractHash: expansionManifest.hash,
            contractJson: expansionManifest.supplyContract,
          },
          {
            status: 'ACTIVE',
            version: manifest.version,
            rolloutCohort: manifest.rolloutCohort,
            contractHash: manifest.hash,
            contractJson: manifest.supplyContract,
          },
        ]),
      },
    } as unknown as AffiliateSupplyDatabase;

    await expect(loadActiveAffiliateSupplyContracts({ db: database })).resolves.toEqual([
      expect.objectContaining({ manifest: expect.objectContaining({ rolloutCohort: 'EXPANSION' }) }),
      expect.objectContaining({ manifest: expect.objectContaining({ rolloutCohort: 'DEFAULT' }) }),
    ]);
  });
  it('counts healthy idle workers separately from active claims', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const database = {
      mappingJobs: {
        count: jest.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
      },
      approvals: { count: jest.fn(async () => 0) },
      gatewayClaims: { count: jest.fn(async () => 0) },
      demands: {
        findMany: jest.fn(async () => [{
          id: 'demand-idle-worker',
          status: 'OPEN',
          priority: 1,
          openedAt: now,
          nextEligibleAt: null,
          searchSaturatedUntil: null,
          marketKey: 'portland',
          sportId: 'soccer',
          sourceProfile: 'EVENT',
        }]),
      },
      waves: { findMany: jest.fn(async () => []) },
      campaigns: { findMany: jest.fn(async () => []) },
      workerHealth: {
        findMany: jest.fn(async () => [
          { role: 'MAPPING_PRODUCER', status: 'HEALTHY' },
          { role: 'SUPPLY_REVIEWER', status: 'HEALTHY' },
        ]),
      },
    } as unknown as AffiliateSupplyDatabase;

    const result = await planAffiliateReplenishmentFromDatabase({
      contract: policy,
      isContractSafe: true,
      db: database,
      now,
    });

    expect(result.targetWaitingMapping).toBe(2);
    expect(result.reasonCodes).not.toContain('NO_HEALTHY_REVIEWER');
    expect(result.selectedDemandId).toBe('demand-idle-worker');
  });

  it('uses active claims until current worker health is available', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const database = {
      mappingJobs: {
        count: jest.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
      },
      approvals: { count: jest.fn(async () => 0) },
      gatewayClaims: {
        count: jest.fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
      },
      demands: {
        findMany: jest.fn(async () => [{
          id: 'demand-health-fallback',
          status: 'OPEN',
          priority: 1,
          openedAt: now,
          nextEligibleAt: null,
          searchSaturatedUntil: null,
          marketKey: 'portland',
          sportId: 'soccer',
          sourceProfile: 'EVENT',
        }]),
      },
      waves: { findMany: jest.fn(async () => []) },
      campaigns: { findMany: jest.fn(async () => []) },
      workerHealth: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await planAffiliateReplenishmentFromDatabase({
      contract: policy,
      isContractSafe: true,
      db: database,
      now,
    });

    expect(result.reasonCodes).not.toContain('NO_HEALTHY_REVIEWER');
    expect(result.selectedDemandId).toBe('demand-health-fallback');
  });

  it('activates one immutable contract version and replays the same hash', async () => {
    const { database, contractManifests } = createManifestDatabase();

    await activateAffiliateSupplyContract({
      manifest,
      userId: 'admin-1',
      db: database,
      impactReport,
    });
    const replay = await activateAffiliateSupplyContract({
      manifest,
      userId: 'admin-2',
      db: database,
      impactReport,
    });

    expect(replay.status).toBe('ACTIVE');
    expect(contractManifests.create).toHaveBeenCalledTimes(1);
    expect(contractManifests.updateMany).toHaveBeenCalledTimes(1);

    const changedManifest = buildAffiliateSupplyContractManifest({
      version: manifest.version,
      rolloutCohort: manifest.rolloutCohort,
      supplyContract: {
        ...policy,
        targets: [{ ...policy.targets[0], minimumFreshPublishedSupply: 3 }],
        hash: undefined,
      },
    });
    await expect(activateAffiliateSupplyContract({
      manifest: changedManifest,
      userId: 'admin-3',
      db: database,
      impactReport,
    })).rejects.toThrow('versions are immutable');
    expect(contractManifests.create).toHaveBeenCalledTimes(1);
  });

  it('retries serializable lifecycle transactions before surfacing a conflict', async () => {
    const { database } = createManifestDatabase();
    const originalTransaction = database.transaction!;
    let attempts = 0;
    (database as any).transaction = async (
      callback: (db: AffiliateSupplyDatabase) => Promise<unknown>,
      options?: unknown,
    ) => {
      attempts += 1;
      if (attempts === 1) throw { code: 'P2034' };
      return originalTransaction(callback, options);
    };

    await activateAffiliateSupplyContract({
      manifest,
      userId: 'admin-1',
      db: database,
      impactReport,
    });

    expect(attempts).toBe(2);
  });

  it('rejects an active contract row whose stored hash is not its content hash', async () => {
    const { database, contractManifests } = createManifestDatabase();
    await activateAffiliateSupplyContract({
      manifest,
      userId: 'admin-1',
      db: database,
      impactReport,
    });
    contractManifests.findFirst.mockResolvedValueOnce({
      status: 'ACTIVE',
      version: manifest.version,
      rolloutCohort: manifest.rolloutCohort,
      contractHash: 'wrong-hash',
      contractJson: manifest.supplyContract,
    });

    await expect(loadActiveAffiliateSupplyContract({ db: database })).rejects.toThrow('hash does not match');
  });

  it('checks the exact baseline before activation writes', async () => {
    const activeManifest = buildAffiliateSupplyContractManifest({
      version: policy.version,
      rolloutCohort: policy.rolloutCohort,
      status: 'ACTIVE',
      supplyContract: { ...policy, hash: undefined },
    });
    const mapping = {
      id: 'mapping-1',
      version: 1,
      isActive: true,
      validatedAt: null,
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://club.example/events',
        itemSelector: '.event',
        evidenceKinds: ['PAGE_HTML'],
      },
    };
    const source = {
      id: 'source-1',
      supplySourceId: 'supply-1',
      activeMappingId: mapping.id,
      autoScrapeEnabled: false,
      status: 'ACTIVE',
      metadata: {
        automationBaseline: {
          schemaVersion: 1,
          mappingId: mapping.id,
          mappingVersion: mapping.version,
          approvedAt: '2026-08-22T10:00:00.000Z',
          candidateCount: 1,
          rejectedCount: 0,
          listingKinds: ['EVENT'],
          criticalMissingCount: 0,
          criticalMissingRate: 0,
          normalizedFieldsHash: 'baseline-hash',
        },
      },
      targetKind: 'EVENT',
    };
    const root = {
      id: 'supply-1',
      canonicalUrl: 'https://club.example/events',
      targetKind: 'EVENT',
      rolloutCohort: 'DEFAULT',
      liveSourceId: source.id,
      intakeId: null,
      lifecycleGeneration: 0,
      derivedStage: 'APPROVED',
      isExcluded: false,
      operatorDomain: 'club.example',
    };
    const approval = {
      id: 'approval-1',
      status: 'APPROVED',
      reviewerId: 'reviewer-1',
      decision: {
        decision: 'APPROVE',
        independent: true,
        reviewerId: 'reviewer-1',
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        evidenceRefs: ['run:1'],
        lifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
      },
    };
    const candidates = {
      findMany: jest.fn(async () => [{ id: 'candidate-1', status: 'DISCOVERED', listingKind: 'EVENT', publishedEventId: 'event-1' }]),
      update: jest.fn(),
    };
    const targets = {
      findMany: jest.fn(async () => []),
      upsert: jest.fn(),
      count: jest.fn(async () => 0),
    };
    const sources = {
      findUnique: jest.fn(async () => source),
      findFirst: jest.fn(async () => source),
      update: jest.fn(),
    };
    const mappings = {
      findUnique: jest.fn(async () => mapping),
      findFirst: jest.fn(async () => mapping),
      update: jest.fn(),
    };
    const database = {
      supplySources: {
        findUnique: jest.fn(async () => root),
        update: jest.fn(),
      },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: activeManifest.version,
          rolloutCohort: activeManifest.rolloutCohort,
          contractHash: activeManifest.hash,
          contractJson: activeManifest.supplyContract,
        })),
      },
      transitions: {
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async () => null),
        create: jest.fn(),
      },
      targets,
      sources,
      mappings,
      candidates,
      intakes: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
      mappingJobs: { findFirst: jest.fn(async () => null) },
      approvals: { findFirst: jest.fn(async () => approval) },
      runs: { findFirst: jest.fn(async () => null) },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    await expect(executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id,
      command: 'ACTIVATE',
      authority: 'HUMAN_DIRECTED_EXECUTOR',
      expectedLifecycleGeneration: 0,
      actorKind: 'HUMAN_DIRECTED_EXECUTOR',
      actorId: 'reviewer-1',
      idempotencyKey: 'activate-1',
      request: {
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        baselineHash: 'wrong-baseline-hash',
        reviewedCandidateIds: ['candidate-1'],
        candidateReviewEvidenceRefs: ['candidate-review:1'],
        evidenceRefs: ['review:1'],
        targets: [{
          candidateId: 'candidate-1',
          targetType: 'EVENT',
          targetId: 'event-1',
          sourceProfile: 'EVENT',
          marketKey: 'portland',
          sportId: 'soccer',
        }],
      },
      db: database,
    })).rejects.toThrow('exact reviewed automation baseline');
    expect(candidates.update).not.toHaveBeenCalled();
    expect(targets.upsert).not.toHaveBeenCalled();
    expect(sources.update).not.toHaveBeenCalled();
    expect(mappings.update).not.toHaveBeenCalled();

    await expect(executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id,
      command: 'ACTIVATE',
      authority: 'HUMAN_DIRECTED_EXECUTOR',
      expectedLifecycleGeneration: 0,
      actorKind: 'HUMAN_DIRECTED_EXECUTOR',
      actorId: 'reviewer-1',
      idempotencyKey: 'activate-target-mismatch',
      request: {
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        baselineHash: 'baseline-hash',
        reviewedCandidateIds: ['candidate-1'],
        candidateReviewEvidenceRefs: ['candidate-review:1'],
        evidenceRefs: ['review:1'],
        targets: [{
          candidateId: 'candidate-1',
          targetType: 'EVENT',
          targetId: 'unrelated-event',
          sourceProfile: 'EVENT',
          marketKey: 'portland',
          sportId: 'soccer',
        }],
      },
      db: database,
    })).rejects.toThrow('must match reviewed candidate targets');
    expect(candidates.update).not.toHaveBeenCalled();
    expect(targets.upsert).not.toHaveBeenCalled();
  });

  it('keeps approval quarantined until activation', async () => {
    const mappingPackage = {
      kind: 'EVENT',
      listUrl: 'https://club.example/events',
      itemSelector: '.event',
      evidenceKinds: ['PAGE_HTML'],
    };
    const mapping = {
      id: 'mapping-approval',
      supplySourceId: 'supply-approval',
      sourceId: 'source-approval',
      version: 1,
      isActive: false,
      validatedAt: null,
      schemaValid: true,
      packageHash: hashAffiliateAgentValue(mappingPackage),
      mapping: mappingPackage,
    };
    const baseline = {
      schemaVersion: 1,
      mappingId: mapping.id,
      mappingVersion: mapping.version,
      approvedAt: '2026-08-22T10:00:00.000Z',
      candidateCount: 1,
      rejectedCount: 0,
      listingKinds: ['EVENT'],
      criticalMissingCount: 0,
      criticalMissingRate: 0,
      normalizedFieldsHash: 'baseline-approval',
    };
    const source = {
      id: 'source-approval',
      supplySourceId: 'supply-approval',
      activeMappingId: mapping.id,
      autoScrapeEnabled: false,
      status: 'ACTIVE',
      targetKind: 'EVENT',
      metadata: {},
    };
    const root = {
      id: 'supply-approval',
      canonicalUrl: 'https://club.example/events',
      origin: 'https://club.example',
      pathKey: '/events',
      identityKey: 'approval-root',
      targetKind: 'EVENT',
      rolloutCohort: 'DEFAULT',
      liveSourceId: source.id,
      intakeId: null,
      lifecycleGeneration: 0,
      derivedStage: 'MAPPED',
      isExcluded: false,
    };
    let approval: Record<string, unknown> | null = null;
    let transition: Record<string, unknown> | null = null;
    const database = {
      supplySources: {
        findUnique: jest.fn(async () => root),
        findMany: jest.fn(async () => [root]),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(root, data)),
      },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
      sources: {
        findUnique: jest.fn(async () => source),
        findFirst: jest.fn(async () => source),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(source, data)),
      },
      mappings: {
        findUnique: jest.fn(async () => mapping),
        findFirst: jest.fn(async () => mapping),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(mapping, data)),
      },
      mappingJobs: { findFirst: jest.fn(async () => null) },
      approvals: {
        findFirst: jest.fn(async () => approval),
        upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          approval = { ...(approval ?? create), ...update };
          return approval;
        }),
      },
      runs: { findFirst: jest.fn(async () => null) },
      candidates: { findMany: jest.fn(async () => []) },
      targets: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
        upsert: jest.fn(),
      },
      transitions: {
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          transition = data;
          return data;
        }),
      },
      intakes: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id,
      command: 'APPROVE',
      authority: 'SUPPLY_REVIEWER',
      expectedLifecycleGeneration: 0,
      actorKind: 'SUPPLY_REVIEWER',
      actorId: 'reviewer-approval',
      idempotencyKey: 'approve-approval',
      request: {
        mappingId: mapping.id,
        packageHash: mapping.packageHash,
        baseline,
        lifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
        evidenceRefs: ['review:approval'],
      },
      db: database,
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(result.assessment.stage).toBe('APPROVED');
    expect(result.assessment.targetContribution).toBe(0);
    expect(result.assessment.isAutomationEnabled).toBe(false);
    expect(source.autoScrapeEnabled).toBe(false);
    expect(mapping.isActive).toBe(false);
    expect(database.targets.upsert).not.toHaveBeenCalled();
    expect(approval).toEqual(expect.objectContaining({
      status: 'APPROVED',
      supplySourceId: root.id,
    }));
    expect((approval?.decision as Record<string, unknown>).lifecycleEvidenceKinds).toEqual([
      'DURABLE_SOURCE_EVIDENCE',
      'VALIDATION_OUTPUT',
    ]);
    expect(transition).toEqual(expect.objectContaining({
      fromStage: 'MAPPED',
      toStage: 'APPROVED',
      generation: 1,
      command: 'APPROVE',
    }));
  });

  it('records provider failure as retryable wave state without zero yield', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const root = {
      id: 'supply-replenishment',
      canonicalUrl: 'https://club.example/events',
      origin: 'https://club.example',
      pathKey: '/events',
      identityKey: 'replenishment-root',
      targetKind: 'EVENT',
      rolloutCohort: 'DEFAULT',
      liveSourceId: null,
      intakeId: null,
      lifecycleGeneration: 0,
      derivedStage: 'PRE_MAPPED',
      isExcluded: false,
    };
    const demand = {
      id: 'demand-1',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: 'DEFAULT',
      status: 'OPEN',
      priority: 4,
      openedAt: now,
      nextEligibleAt: null,
      searchSaturatedUntil: null,
      generation: 0,
      activeWaveId: null,
    };
    const waves = {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({
        id: 'wave-1',
        demandId: demand.id,
        status: 'ACTIVE',
        demandGeneration: demand.generation,
        evidenceRefs: [`demand:${demand.id}`],
      })),
      update: jest.fn(),
    };
    const supplySources = {
      findMany: jest.fn(async () => [root]),
      findUnique: jest.fn(async () => root),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(root, data)),
    };
    const demands = {
      findMany: jest.fn(async () => [demand]),
      findUnique: jest.fn(async () => demand),
      upsert: jest.fn(async ({ update }: { update: Record<string, unknown> }) => Object.assign(demand, update)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(demand, data)),
    };
    const database = {
      supplySources,
      sources: { findFirst: jest.fn(async () => null) },
      intakes: { findFirst: jest.fn(async () => null) },
      mappings: { findFirst: jest.fn(async () => null) },
      mappingJobs: {
        findFirst: jest.fn(async () => null),
        count: jest.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
      },
      approvals: {
        findFirst: jest.fn(async () => null),
        count: jest.fn(async () => 0),
      },
      runs: { findFirst: jest.fn(async () => null) },
      candidates: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      gatewayClaims: {
        count: jest.fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1),
      },
      campaigns: { findMany: jest.fn(async () => []) },
      demands,
      waves,
      coverageJobs: {
        upsert: jest.fn(async () => ({ id: 'coverage-job-1' })),
      },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishment({
      contract: policy,
      isContractSafe: true,
      db: database,
      now,
      runWave: async () => {
        throw new Error('provider unavailable');
      },
    });

    expect(result.plan.action).toBe('REQUEST_COVERAGE_PLANNING_JOB');
    expect(result.wave).toEqual(expect.objectContaining({ id: 'wave-1' }));
    expect(result.providerResult).toEqual(expect.objectContaining({
      status: 'FAILED',
      errorCode: 'PROVIDER_FAILURE',
    }));
    expect(waves.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wave-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        marginalYield: null,
        errorCode: 'PROVIDER_FAILURE',
      }),
    }));
    expect(demands.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: demand.id },
      data: expect.objectContaining({
        activeWaveId: null,
        nextEligibleAt: new Date('2026-08-22T12:15:00.000Z'),
      }),
    }));
  });
  it('projects dry-run demand decisions without persistence writes', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demands = {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(),
    };
    const database = {
      supplySources: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
      targets: { findMany: jest.fn(async () => []) },
      demands,
      mappingJobs: { count: jest.fn(async () => 0) },
      approvals: { count: jest.fn(async () => 0) },
      gatewayClaims: { count: jest.fn(async () => 0) },
      waves: { findMany: jest.fn(async () => []) },
      campaigns: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishment({
      contract: policy,
      isContractSafe: true,
      db: database,
      now,
      dryRun: true,
    });

    expect(result.opened).toBe(1);
    expect(result.plan.reasonCodes).toContain('NO_HEALTHY_REVIEWER');
    expect(result.plan.selectedDemandId).toBeNull();
    expect(result.plan.action).toBe('NONE');
    expect(result.demands).toHaveLength(1);
    expect(result.demands[0].id).toMatch(/^dry-run-demand-/);
    expect(demands.upsert).not.toHaveBeenCalled();
    expect(database.supplySources.update).not.toHaveBeenCalled();
  });

  it('persists the active contract hash and observed fresh supply on demand upserts', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demands = {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
        ...create,
        ...update,
      })),
    };
    const database = {
      supplySources: {
        findMany: jest.fn(async () => [
          {
            id: 'supply-1',
            isExcluded: false,
            derivedOutcome: null,
            derivedStage: 'PUBLISHED',
            repairPriority: 1,
          },
          {
            id: 'supply-activated',
            isExcluded: false,
            derivedOutcome: null,
            derivedStage: 'ACTIVATED',
            repairPriority: 2,
          },
        ]),
      },
      targets: {
        findMany: jest.fn(async () => [
          {
            supplySourceId: 'supply-1',
            marketKey: 'portland',
            sportId: 'soccer',
            sourceProfile: 'EVENT',
            status: 'PUBLISHED',
            rejectedAt: null,
            freshnessExpiresAt: new Date('2026-08-23T12:00:00.000Z'),
            lastSuccessfulRefreshAt: now,
          },
          {
            supplySourceId: 'supply-activated',
            marketKey: 'portland',
            sportId: 'soccer',
            sourceProfile: 'EVENT',
            status: 'PUBLISHED',
            rejectedAt: null,
            freshnessExpiresAt: new Date('2026-08-23T12:00:00.000Z'),
            lastSuccessfulRefreshAt: now,
          },
        ]),
      },
      demands,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishmentDemands({
      contract: policy,
      db: database,
      now,
    });

    expect(result.demands[0]).toEqual(expect.objectContaining({
      rolloutCohort: policy.rolloutCohort,
      contractHash: policy.hash,
      priority: 1,
      observedFreshPublishedSupply: 1,
    }));
    expect(demands.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        rolloutCohort: policy.rolloutCohort,
        contractHash: policy.hash,
        priority: 1,
        observedFreshPublishedSupply: 1,
      }),
      update: expect.objectContaining({
        rolloutCohort: policy.rolloutCohort,
        contractHash: policy.hash,
        priority: 1,
        observedFreshPublishedSupply: 1,
      }),
    }));
  });

  it('does not count stale published targets toward replenishment demand', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demands = {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
        ...create,
        ...update,
      })),
    };
    const database = {
      supplySources: {
        findMany: jest.fn(async () => [{
          id: 'supply-stale',
          isExcluded: false,
          derivedOutcome: null,
          derivedStage: 'PUBLISHED',
          repairPriority: 1,
        }]),
      },
      targets: {
        findMany: jest.fn(async () => [{
          supplySourceId: 'supply-stale',
          marketKey: 'portland',
          sportId: 'soccer',
          sourceProfile: 'EVENT',
          status: 'PUBLISHED',
          rejectedAt: null,
          freshnessExpiresAt: new Date('2026-08-22T11:59:00.000Z'),
          lastSuccessfulRefreshAt: new Date('2026-08-21T12:00:00.000Z'),
        }]),
      },
      demands,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishmentDemands({
      contract: policy,
      db: database,
      now,
    });

    expect(result.demands[0]).toEqual(expect.objectContaining({
      status: 'OPEN',
      observedFreshPublishedSupply: 0,
    }));
  });

  it('resolves recorded human decisions and recovers durable lifecycle receipts', async () => {
    const decision = {
      command: 'RECONCILE',
      reviewerId: 'human-1',
      evidenceRefs: ['review:evidence-1'],
    };
    const transition = {
      generation: 8,
      commandRef: 'decision-1',
      requestJson: decision,
      requestHash: hashAffiliateAgentValue(decision),
      resultJson: { stage: 'APPROVED' },
    };
    const database = {
      supplySources: { findUnique: jest.fn(async () => ({ lifecycleGeneration: 7 })) },
      approvals: { findUnique: jest.fn(async () => null) },
      transitions: {
        findFirst: jest.fn(async () => transition),
        findUnique: jest.fn(async () => ({ ...transition, idempotencyKey: 'receipt-1' })),
      },
    } as unknown as AffiliateSupplyDatabase;
    const authority = createAffiliateSupplyLifecycleAuthority({ db: database });
    const identity = {
      caseId: 'supply-1',
      decisionHash: hashAffiliateAgentValue(decision),
      recordedHumanActorId: 'human-1',
      commandRef: 'decision-1',
    };

    await expect(authority.currentGeneration('supply-1')).resolves.toBe(7);
    await expect(authority.resolveRecordedCommand(identity)).resolves.toEqual(identity);
    await expect(authority.execute({
      receiptId: 'receipt-1',
      expectedGeneration: 7,
      inputHash: 'command-input-hash',
      identity,
    })).resolves.toMatchObject({ receiptId: 'receipt-1', lifecycleGeneration: 8, stage: 'APPROVED' });
    await expect(authority.recover('receipt-1')).resolves.toMatchObject({
      receiptId: 'receipt-1',
      lifecycleGeneration: 8,
      stage: 'APPROVED',
    });
  });
  it('runs admitted target publication inside the lifecycle command transaction', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const root = {
      id: 'supply-publish-1',
      canonicalUrl: 'https://club.example/events',
      targetKind: 'EVENT',
      rolloutCohort: policy.rolloutCohort,
      liveSourceId: 'source-publish-1',
      intakeId: null,
      lifecycleGeneration: 4,
      derivedStage: 'ACTIVATED',
      isExcluded: false,
      operatorDomain: 'club.example',
    };
    const source = {
      id: 'source-publish-1',
      supplySourceId: root.id,
      activeMappingId: 'mapping-publish-1',
      status: 'ACTIVE',
      autoScrapeEnabled: true,
      metadata: {},
      targetKind: 'EVENT',
    };
    const mapping = {
      id: 'mapping-publish-1',
      version: 1,
      isActive: true,
      validatedAt: now,
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://club.example/events',
        itemSelector: '.event',
        evidenceKinds: ['PAGE_HTML'],
      },
    };
    const approval = {
      id: 'approval-publish-1',
      status: 'APPROVED',
      reviewerId: 'reviewer-1',
      decision: {
        decision: 'APPROVE',
        independent: true,
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        evidenceRefs: ['review:evidence-1'],
        lifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
      },
    };
    const candidate = {
      id: 'candidate-publish-1',
      sourceId: source.id,
      supplySourceId: root.id,
      status: 'DISCOVERED',
      listingKind: 'EVENT',
      publishedEventId: null,
      publishedTeamId: null,
      publishedFacilityId: null,
      publishedOrganizationId: null,
      rawPayload: { evidenceRefs: ['candidate:evidence-1'] },
    };
    const targets = {
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => create),
      count: jest.fn(async () => 0),
    };
    const targetWriter = jest.fn(async () => ({
      candidateId: candidate.id,
      targetType: 'EVENT',
      targetId: 'event-publish-1',
      sourceProfile: 'EVENT',
      evidenceRefs: ['target:evidence-1'],
    }));
    const database = {
      supplySources: {
        findUnique: jest.fn(async () => root),
        update: jest.fn(),
      },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
      transitions: {
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
      targets,
      sources: {
        findUnique: jest.fn(async () => source),
        findFirst: jest.fn(async () => source),
        update: jest.fn(),
      },
      mappings: { findUnique: jest.fn(async () => mapping), findFirst: jest.fn(async () => mapping) },
      mappingJobs: { findFirst: jest.fn(async () => null) },
      approvals: { findFirst: jest.fn(async () => approval) },
      runs: { findFirst: jest.fn(async () => null) },
      intakes: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
      candidates: {
        findMany: jest.fn(async () => [candidate]),
        update: jest.fn(),
      },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id,
      command: 'PUBLISH_TARGET',
      authority: 'HUMAN_DIRECTED_EXECUTOR',
      actorKind: 'HUMAN_DIRECTED_EXECUTOR',
      actorId: 'human-1',
      expectedLifecycleGeneration: root.lifecycleGeneration,
      idempotencyKey: 'publish-target-1',
      request: {
        candidateId: candidate.id,
        evidenceRefs: ['publication:evidence-1'],
      },
      targetWriter,
      db: database,
      now,
    });

    expect(targetWriter).toHaveBeenCalledWith(expect.objectContaining({
      contract: manifest.supplyContract,
      request: expect.objectContaining({ candidateId: candidate.id }),
      now,
    }));
    expect(targets.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        candidateId: candidate.id,
        targetId: 'event-publish-1',
        marketKey: 'portland',
        sportId: 'soccer',
        status: 'PUBLISHED',
      }),
    }));
    expect(result.transition.command).toBe('PUBLISH_TARGET');
  });

});
