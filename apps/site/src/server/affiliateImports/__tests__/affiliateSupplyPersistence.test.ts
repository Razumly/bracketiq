/** @jest-environment node */

import {
  buildAffiliateSupplyContractManifest,
  type AffiliateSupplyContractPolicy,
} from '../affiliateSupplyLifecycle';
import {
  activateAffiliateSupplyContract,
  createAffiliateSupplyLifecycleAuthority,
  ensureAffiliateSupplySource,
  executeAffiliateSupplyLifecycleCommand,
  loadActiveAffiliateSupplyContract,
  loadActiveAffiliateSupplyContracts,
  planAffiliateReplenishmentFromDatabase,
  reconcileAffiliateReplenishment,
  reconcileAffiliateReplenishmentDemands,
  reconcileLegacyAffiliateSupply,
  startAffiliateReplenishmentWave,
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
  newlyDueSearches: 1,
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

  it('pauses admission when worker health is unavailable', async () => {
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

    expect(result.reasonCodes).toContain('NO_HEALTHY_REVIEWER');
    expect(result.selectedDemandId).toBeNull();
    expect(result.action).toBe('NONE');
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
  it('converges concurrent admissions for different demands on one cohort wave', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demandsById = new Map([
      ['demand-a', {
        id: 'demand-a',
        status: 'OPEN',
        rolloutCohort: policy.rolloutCohort,
        contractVersion: policy.version,
        contractHash: policy.hash,
        generation: 0,
      }],
      ['demand-b', {
        id: 'demand-b',
        status: 'OPEN',
        rolloutCohort: policy.rolloutCohort,
        contractVersion: policy.version,
        contractHash: policy.hash,
        generation: 0,
      }],
    ]);
    type TestWave = {
      id: string;
      demandId: string;
      rolloutCohort: string;
      status: string;
      createdAt: Date;
      [key: string]: unknown;
    };
    const liveWaves: TestWave[] = [];
    let guardReads = 0;
    let releaseGuardReads = () => {};
    const guardsReady = new Promise<void>((resolve) => {
      releaseGuardReads = resolve;
    });
    const demands = {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => demandsById.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const demand = demandsById.get(where.id);
        if (!demand) throw new Error(`Demand not found: ${where.id}`);
        Object.assign(demand, data);
        return demand;
      }),
    };
    const waves = {
      findFirst: jest.fn(async (query: {
        where: {
          rolloutCohort?: string;
          demandId?: string;
          status?: { in?: readonly string[] };
        };
      }) => {
        const { where } = query;
        if (where.rolloutCohort === policy.rolloutCohort && where.demandId === undefined && guardReads < 2) {
          guardReads += 1;
          if (guardReads === 2) releaseGuardReads();
          if (guardReads < 2) await guardsReady;
        }
        const statuses = where.status?.in ?? [];
        return liveWaves.find((wave) => (
          wave.rolloutCohort === where.rolloutCohort
          && statuses.includes(wave.status)
        )) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (liveWaves.some((wave) => (
          wave.rolloutCohort === data.rolloutCohort
          && ['PLANNED', 'ACTIVE', 'WAITING'].includes(wave.status)
        ))) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
            meta: { target: ['rolloutCohort'] },
          });
        }
        const wave: TestWave = {
          ...data,
          id: String(data.id),
          demandId: String(data.demandId),
          rolloutCohort: String(data.rolloutCohort),
          status: String(data.status),
          createdAt: now,
        };
        liveWaves.push(wave);
        return wave;
      }),
    };
    let database: AffiliateSupplyDatabase;
    database = {
      demands,
      waves,
      coverageJobs: {},
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database),
    } as unknown as AffiliateSupplyDatabase;
    const planFor = (selectedDemandId: string) => ({
      targetWaitingMapping: 0,
      targetWaitingReview: 0,
      isAdmissionHalted: false,
      isMappingPaused: false,
      isCampaignPaused: false,
      action: 'REUSE_CAMPAIGN' as const,
      selectedDemandId,
      selectedCampaignId: null,
      reasonCodes: [],
    });

    const [firstWave, secondWave] = await Promise.all([
      startAffiliateReplenishmentWave({
        plan: planFor('demand-a'),
        rolloutCohort: policy.rolloutCohort,
        contract: policy,
        db: database,
        now,
      }),
      startAffiliateReplenishmentWave({
        plan: planFor('demand-b'),
        rolloutCohort: policy.rolloutCohort,
        contract: policy,
        db: database,
        now,
      }),
    ]);

    expect(firstWave?.id).toBe(secondWave?.id);
    expect(liveWaves).toHaveLength(1);
    expect(liveWaves[0]).toEqual(expect.objectContaining({
      rolloutCohort: policy.rolloutCohort,
      status: 'ACTIVE',
    }));
    expect(waves.create).toHaveBeenCalledTimes(2);
    expect(demands.update).toHaveBeenCalledTimes(1);
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
        fields: {
          title: { selector: '.title' },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href' },
        },
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
        isIndependent: true,
        reviewerId: 'reviewer-1',
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        evidenceRefs: ['run:1'],
        lifecycleEvidenceKinds: ['DURABLE_SOURCE_EVIDENCE', 'VALIDATION_OUTPUT'],
      },
    };
    const candidateReviewDecisionPayload = {
      schemaVersion: 1,
      decision: 'APPROVE',
      supplySourceId: root.id,
      mappingId: mapping.id,
      packageHash: hashAffiliateAgentValue(mapping.mapping),
      baselineHash: 'baseline-hash',
      reviewedCandidateIds: ['candidate-1'],
      candidateReviewEvidenceRefs: ['candidate-review:1'],
      targets: [{
        candidateId: 'candidate-1',
        targetType: 'EVENT',
        targetId: 'unrelated-event',
        sourceProfile: 'EVENT',
        marketKey: 'portland',
        sportId: 'soccer',
      }],
      reviewerId: 'reviewer-1',
      reviewedAt: '2026-08-22T10:00:00.000Z',
    };
    const candidateReview = {
      id: 'candidate-review-1',
      subjectType: 'CANDIDATE_REVIEW',
      subjectKey: `${root.id}:${hashAffiliateAgentValue(candidateReviewDecisionPayload)}`,
      supplySourceId: root.id,
      status: 'APPROVED',
      finishedAt: new Date('2026-08-22T10:00:00.000Z'),
      decision: {
        ...candidateReviewDecisionPayload,
        decisionHash: hashAffiliateAgentValue(candidateReviewDecisionPayload),
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
      approvals: {
        findFirst: jest.fn(async () => approval),
        findUnique: jest.fn(async ({ where }: { where: { id?: string } }) => (
          where.id === candidateReview.id ? candidateReview : null
        )),
      },
      targets,
      sources,
      mappings,
      candidates,
      intakes: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
      mappingJobs: { findFirst: jest.fn(async () => null) },
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
        sourceId: source.id,
        mappingId: mapping.id,
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        baselineHash: 'wrong-baseline-hash',
        candidateReviewId: candidateReview.id,
        evidenceRefs: ['review:1'],
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
        sourceId: source.id,
        mappingId: mapping.id,
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        baselineHash: 'baseline-hash',
        candidateReviewId: candidateReview.id,
        evidenceRefs: ['review:1'],
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
      fields: {
        title: { selector: '.title' },
        officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href' },
      },
      evidenceKinds: ['PAGE_HTML'],
    };
    const mapping = {
      id: 'mapping-approval',
      supplySourceId: 'supply-approval',
      sourceId: 'source-approval',
      version: 1,
      isActive: false,
      validatedAt: null,
      isSchemaValid: true,
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
      contractVersion: policy.version,
      contractHash: policy.hash,
      minimumFreshPublishedSupply: 2,
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
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: 'wave-1',
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
  it('persists search saturation after a successful zero-yield wave', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demand = {
      id: 'demand-saturation',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: 'DEFAULT',
      contractVersion: policy.version,
      contractHash: policy.hash,
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
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: 'wave-saturation',
        campaignId: null,
        evidenceRefs: [`demand:${demand.id}`],
      })),
      update: jest.fn(),
    };
    const demands = {
      findUnique: jest.fn(async () => demand),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async ({ create, update }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => Object.assign(demand, update ?? create)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(demand, data)),
    };
    const database = {
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      demands,
      mappingJobs: {
        count: jest.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0),
      },
      approvals: { count: jest.fn(async () => 0) },
      gatewayClaims: {
        count: jest.fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(1),
      },
      waves,
      campaigns: { findMany: jest.fn(async () => []) },
      coverageJobs: {
        upsert: jest.fn(async () => ({ id: 'coverage-job-saturation' })),
      },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishment({
      contract: { ...policy, searchSaturationMinimumCycles: 2 },
      isContractSafe: true,
      db: database,
      now,
      runWave: async () => ({
        status: 'SUCCEEDED',
        provider: 'AFFILIATE_DISCOVERY',
        marginalYield: 0,
      }),
    });

    expect(result.providerResult).toEqual(expect.objectContaining({
      status: 'SUCCEEDED',
      marginalYield: 0,
    }));
    expect(demands.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: demand.id },
      data: expect.objectContaining({
        activeWaveId: null,
        nextEligibleAt: null,
        searchSaturatedUntil: new Date('2026-08-24T12:00:00.000Z'),
      }),
    }));
  });
  it('does not rerun a waiting wave before its retry time', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demand = {
      id: 'demand-waiting-wave',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: 'DEFAULT',
      contractVersion: policy.version,
      contractHash: policy.hash,
      minimumFreshPublishedSupply: 1,
      observedFreshPublishedSupply: 0,
      reasonCodes: ['TARGET_SHORTFALL'],
      evidenceJson: { observedAt: now.toISOString(), observedFreshPublishedSupply: 0 },
      closedAt: null,
      generation: 1,
      activeWaveId: 'wave-waiting',
    };
    const waitingWave = {
      id: 'wave-waiting',
      demandId: demand.id,
      rolloutCohort: 'DEFAULT',
      status: 'WAITING',
      demandGeneration: demand.generation,
      retryAt: new Date('2026-08-22T12:15:00.000Z'),
      evidenceRefs: [`demand:${demand.id}`],
    };
    const waves = {
      findMany: jest.fn(async () => [waitingWave]),
      findFirst: jest.fn(async () => waitingWave),
      update: jest.fn(),
    };
    const demands = {
      findUnique: jest.fn(async () => demand),
      findMany: jest.fn(async () => [demand]),
      upsert: jest.fn(async ({ create, update }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => ({ ...demand, ...create, ...update })),
      update: jest.fn(),
    };
    const database = {
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      demands,
      mappingJobs: { count: jest.fn(async () => 0) },
      approvals: { count: jest.fn(async () => 0) },
      gatewayClaims: {
        count: jest.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1),
      },
      waves,
      campaigns: { findMany: jest.fn(async () => []) },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;
    const runWave = jest.fn(async () => ({
      status: 'SUCCEEDED' as const,
      provider: 'AFFILIATE_DISCOVERY',
      marginalYield: 1,
    }));

    const result = await reconcileAffiliateReplenishment({
      contract: policy,
      isContractSafe: true,
      db: database,
      now,
      runWave,
    });

    expect(result.wave).toEqual(waitingWave);
    expect(result.providerResult).toBeNull();
    expect(runWave).not.toHaveBeenCalled();
    expect(waves.update).not.toHaveBeenCalled();
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
  it('does not write an unchanged replenishment demand', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const existing = {
      id: 'demand-unchanged',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: policy.rolloutCohort,
      contractVersion: policy.version,
      contractHash: policy.hash,
      minimumFreshPublishedSupply: 2,
      observedFreshPublishedSupply: 0,
      priority: 4,
      status: 'OPEN',
      openedAt: now,
      closedAt: null,
      reasonCodes: ['TARGET_SHORTFALL'],
      evidenceJson: { observedAt: now.toISOString(), observedFreshPublishedSupply: 0 },
      generation: 1,
    };
    const demands = {
      findUnique: jest.fn(async () => existing),
      upsert: jest.fn(),
    };
    const database = {
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      demands,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishmentDemands({
      contract: policy,
      db: database,
      now,
    });

    expect(result.demands[0]).toBe(existing);
    expect(demands.upsert).not.toHaveBeenCalled();
  });
  it('preserves a paused demand during target shortfall reconciliation', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const existing = {
      id: 'demand-paused',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: policy.rolloutCohort,
      contractVersion: policy.version,
      contractHash: policy.hash,
      minimumFreshPublishedSupply: 2,
      observedFreshPublishedSupply: 0,
      priority: 4,
      status: 'PAUSED',
      openedAt: now,
      closedAt: null,
      nextEligibleAt: new Date('2026-08-23T12:00:00.000Z'),
      searchSaturatedUntil: new Date('2026-08-24T12:00:00.000Z'),
      activeWaveId: null,
      reasonCodes: ['REVIEW_CAPACITY_REACHED'],
      evidenceJson: { observedAt: now.toISOString(), observedFreshPublishedSupply: 0 },
      generation: 3,
    };
    const demands = {
      findUnique: jest.fn(async () => existing),
      upsert: jest.fn(),
    };
    const database = {
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      demands,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishmentDemands({
      contract: policy,
      db: database,
      now,
    });

    expect(result.demands[0]).toBe(existing);
    expect(demands.upsert).not.toHaveBeenCalled();
  });
  it('reopens a paused demand after its resume time', async () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    const existing = {
      id: 'demand-paused-due',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: policy.rolloutCohort,
      contractVersion: policy.version,
      contractHash: policy.hash,
      minimumFreshPublishedSupply: 2,
      observedFreshPublishedSupply: 0,
      priority: 4,
      status: 'PAUSED',
      openedAt: new Date('2026-08-22T12:00:00.000Z'),
      closedAt: null,
      nextEligibleAt: new Date('2026-08-23T12:00:00.000Z'),
      searchSaturatedUntil: new Date('2026-08-23T12:00:00.000Z'),
      activeWaveId: null,
      reasonCodes: ['SEARCH_SATURATION'],
      evidenceJson: { observedAt: '2026-08-22T12:00:00.000Z', observedFreshPublishedSupply: 0 },
      generation: 3,
    };
    const demands = {
      findUnique: jest.fn(async () => existing),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
        ...existing,
        ...create,
        ...update,
      })),
    };
    const database = {
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      demands,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishmentDemands({
      contract: policy,
      db: database,
      now,
    });

    expect(result.demands[0]).toEqual(expect.objectContaining({
      status: 'OPEN',
      reasonCodes: ['TARGET_SHORTFALL'],
      generation: 4,
    }));
    expect(demands.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'OPEN',
        reasonCodes: ['TARGET_SHORTFALL'],
      }),
    }));
  });

  it('projects every legacy public target as Last-Known-Good when evidence is missing', async () => {
    const database = {
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      candidates: {
        findMany: jest.fn(async () => [{
          id: 'legacy-candidate',
          sourceId: 'legacy-source',
          listingKind: 'EVENT',
          status: 'PUBLISHED',
          publishedEventId: 'event-legacy',
          publishedTeamId: null,
          publishedFacilityId: null,
          publishedOrganizationId: null,
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findFirst: jest.fn(async () => null) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({ db: database });

    expect(result.dryRun).toBe(true);
    expect(result.preservedTargetCount).toBe(1);
    expect(result.unverifiableTargetCount).toBe(1);
    expect(result.rows[0].targetProjections).toEqual([expect.objectContaining({
      candidateId: 'legacy-candidate',
      targetType: 'EVENT',
      targetId: 'event-legacy',
      status: 'LAST_KNOWN_GOOD',
      action: 'MARK_LAST_KNOWN_GOOD',
    })]);
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
      metadata: {
        automationBaseline: {
          schemaVersion: 1,
          mappingId: 'mapping-publish-1',
          mappingVersion: 1,
          approvedAt: now.toISOString(),
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
    const mapping = {
      id: 'mapping-publish-1',
      version: 1,
      isActive: true,
      isSchemaValid: true,
      validatedAt: now,
      packageHash: hashAffiliateAgentValue({
        kind: 'EVENT',
        listUrl: 'https://club.example/events',
        itemSelector: '.event',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href' },
        },
        evidenceKinds: ['PAGE_HTML'],
      }),
      evidenceKinds: ['PAGE_HTML'],
      validationOutput: { isValid: true },
      mapping: {
        kind: 'EVENT',
        listUrl: 'https://club.example/events',
        itemSelector: '.event',
        fields: {
          title: { selector: '.title' },
          officialActionUrl: { selector: 'a', mode: 'attribute', attribute: 'href' },
        },
        evidenceKinds: ['PAGE_HTML'],
      },
    };
    const approval = {
      id: 'approval-publish-1',
      status: 'APPROVED',
      reviewerId: 'reviewer-1',
      decision: {
        decision: 'APPROVE',
        isIndependent: true,
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
    let persistedTransition: Record<string, unknown> | null = null;
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
        findUnique: jest.fn(async () => persistedTransition),
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
      runs: {
        findFirst: jest.fn(async () => ({
          id: 'run-publish-1',
          status: 'SUCCEEDED',
          mappingId: mapping.id,
          finishedAt: now,
          candidateCount: 1,
          itemCount: 1,
          isEmptyStateMatched: false,
        })),
      },
      intakes: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
      candidates: {
        findMany: jest.fn(async () => [candidate]),
        update: jest.fn(),
      },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const commandInput = {
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
    } as const;
    const result = await executeAffiliateSupplyLifecycleCommand(commandInput);
    persistedTransition = result.transition;
    const replay = await executeAffiliateSupplyLifecycleCommand(commandInput);

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
    expect(replay.isReplayed).toBe(true);
    expect(replay.transition).toEqual(result.transition);
    expect(result.transition.command).toBe('PUBLISH_TARGET');
  });
  it('hides the exact public domain target when lifecycle rejection is recorded', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const root: Record<string, unknown> = {
      id: 'supply-reject-1',
      canonicalUrl: 'https://club.example/events',
      targetKind: 'EVENT',
      rolloutCohort: policy.rolloutCohort,
      liveSourceId: 'source-reject-1',
      intakeId: null,
      lifecycleGeneration: 4,
      derivedStage: 'PUBLISHED',
      isExcluded: false,
      operatorDomain: 'club.example',
      predecessorId: null,
      successorId: null,
    };
    const source: Record<string, unknown> = {
      id: 'source-reject-1',
      supplySourceId: root.id,
      activeMappingId: null,
      status: 'ACTIVE',
      autoScrapeEnabled: true,
      metadata: {},
      targetKind: 'EVENT',
    };
    let target: Record<string, unknown> = {
      id: 'supply-target-reject-1',
      supplySourceId: root.id,
      candidateId: 'candidate-reject-1',
      targetType: 'EVENT',
      targetId: 'event-reject-1',
      sourceProfile: 'EVENT',
      marketKey: 'portland',
      sportId: 'soccer',
      status: 'PUBLISHED',
      publishedAt: now,
      lastSuccessfulRefreshAt: now,
      freshnessExpiresAt: new Date('2026-08-23T12:00:00.000Z'),
      rejectedAt: null,
      evidenceRefs: ['publication:evidence-1'],
      metadata: {},
    };
    const events = { update: jest.fn(async () => ({ id: 'event-reject-1', state: 'UNPUBLISHED' })) };
    const targets = {
      findMany: jest.fn(async () => [target]),
      findFirst: jest.fn(async () => target),
      upsert: jest.fn(async ({
        update,
      }: {
        update: Record<string, unknown>;
      }) => {
        target = { ...target, ...update };
        return target;
      }),
    };
    const transitions = {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    };
    const emptyCollection = () => ({
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    });
    const supplySources = {
      findUnique: jest.fn(async () => root),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(root, data);
        return root;
      }),
    };
    const sources = {
      findUnique: jest.fn(async () => source),
      findFirst: jest.fn(async () => source),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(source, data);
        return source;
      }),
    };
    const database = {
      supplySources,
      sources,
      targets,
      events,
      teams: emptyCollection(),
      facilities: emptyCollection(),
      organizations: emptyCollection(),
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
      transitions,
      intakes: emptyCollection(),
      mappings: emptyCollection(),
      mappingJobs: emptyCollection(),
      approvals: emptyCollection(),
      runs: emptyCollection(),
      candidates: emptyCollection(),
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id as string,
      command: 'REJECT_TARGET',
      authority: 'SUPPLY_REVIEWER',
      actorKind: 'SUPPLY_REVIEWER',
      actorId: 'reviewer-1',
      expectedLifecycleGeneration: 4,
      idempotencyKey: 'reject-target-1',
      request: {
        target: {
          targetType: 'EVENT',
          targetId: 'event-reject-1',
          sourceProfile: 'EVENT',
          marketKey: 'portland',
          sportId: 'soccer',
        },
        evidenceRefs: ['rejection:evidence-1'],
      },
      db: database,
      now,
    });

    expect(events.update).toHaveBeenCalledWith({
      where: { id: 'event-reject-1' },
      data: { state: 'UNPUBLISHED' },
    });
    expect(targets.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'REJECTED' }),
    }));
    expect(result.assessment.targets[0]).toEqual(expect.objectContaining({ status: 'REJECTED' }));
  });
  it.each([
    ['FACILITY', 'RENTAL'],
    ['ORGANIZATION', 'CLUB'],
  ] as const)('uses the existing %s profile for top-level target rejection payloads', async (targetType, sourceProfile) => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const rejectionPolicy: AffiliateSupplyContractPolicy = {
      ...policy,
      freshnessWindows: [
        ...policy.freshnessWindows,
        { sourceProfile, maximumAgeHours: 24 },
      ],
      targets: [
        ...policy.targets,
        {
          marketKey: 'portland',
          sportId: 'soccer',
          sourceProfile,
          minimumFreshPublishedSupply: 1,
        },
      ],
    };
    const rejectionManifest = buildAffiliateSupplyContractManifest({
      version: rejectionPolicy.version,
      rolloutCohort: rejectionPolicy.rolloutCohort,
      supplyContract: { ...rejectionPolicy, hash: undefined },
    });
    const root: Record<string, unknown> = {
      id: `supply-reject-${targetType.toLowerCase()}`,
      canonicalUrl: 'https://club.example/public',
      targetKind: targetType,
      rolloutCohort: rejectionPolicy.rolloutCohort,
      liveSourceId: `source-reject-${targetType.toLowerCase()}`,
      intakeId: null,
      lifecycleGeneration: 4,
      derivedStage: 'PUBLISHED',
      isExcluded: false,
      operatorDomain: 'club.example',
      predecessorId: null,
      successorId: null,
    };
    const source: Record<string, unknown> = {
      id: root.liveSourceId,
      supplySourceId: root.id,
      activeMappingId: null,
      status: 'ACTIVE',
      autoScrapeEnabled: true,
      metadata: {},
      targetKind: targetType,
    };
    let target: Record<string, unknown> = {
      id: `supply-target-reject-${targetType.toLowerCase()}`,
      supplySourceId: root.id,
      candidateId: null,
      targetType,
      targetId: `${targetType.toLowerCase()}-reject-1`,
      sourceProfile,
      marketKey: 'portland',
      sportId: 'soccer',
      status: 'PUBLISHED',
      publishedAt: now,
      lastSuccessfulRefreshAt: now,
      freshnessExpiresAt: new Date('2026-08-23T12:00:00.000Z'),
      rejectedAt: null,
      evidenceRefs: ['publication:evidence-1'],
      metadata: {},
    };
    const domainUpdate = jest.fn(async () => ({ id: target.targetId }));
    const emptyCollection = () => ({
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    });
    const targets = {
      findMany: jest.fn(async () => [target]),
      findFirst: jest.fn(async () => target),
      upsert: jest.fn(async ({
        update,
      }: {
        update: Record<string, unknown>;
      }) => {
        target = { ...target, ...update };
        return target;
      }),
    };
    const supplySources = {
      findUnique: jest.fn(async () => root),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(root, data);
        return root;
      }),
    };
    const sources = {
      findUnique: jest.fn(async () => source),
      findFirst: jest.fn(async () => source),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(source, data);
        return source;
      }),
    };
    const database = {
      supplySources,
      sources,
      targets,
      events: emptyCollection(),
      teams: emptyCollection(),
      facilities: { update: domainUpdate },
      organizations: { update: domainUpdate },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: rejectionManifest.version,
          rolloutCohort: rejectionManifest.rolloutCohort,
          contractHash: rejectionManifest.hash,
          contractJson: rejectionManifest.supplyContract,
        })),
      },
      transitions: {
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
      intakes: emptyCollection(),
      mappings: emptyCollection(),
      mappingJobs: emptyCollection(),
      approvals: emptyCollection(),
      runs: emptyCollection(),
      candidates: emptyCollection(),
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id as string,
      command: 'REJECT_TARGET',
      authority: 'SUPPLY_REVIEWER',
      actorKind: 'SUPPLY_REVIEWER',
      actorId: 'reviewer-1',
      expectedLifecycleGeneration: 4,
      idempotencyKey: `reject-target-${targetType.toLowerCase()}-1`,
      request: {
        targetType,
        targetId: target.targetId,
        evidenceRefs: ['rejection:evidence-1'],
      },
      db: database,
      now,
    });

    expect(domainUpdate).toHaveBeenCalledWith({
      where: { id: target.targetId },
      data: targetType === 'FACILITY'
        ? { status: 'DRAFT' }
        : {
            status: 'UNLISTED',
            publicPageEnabled: false,
            publicWidgetsEnabled: false,
          },
    });
    expect(targets.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: 'REJECTED',
        sourceProfile,
      }),
    }));
  });
  it('records initial Supply Source creation through the lifecycle command', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const source = {
      id: 'source-root-1',
      supplySourceId: null,
      targetKind: 'EVENT',
      status: 'ACTIVE',
      autoScrapeEnabled: false,
      activeMappingId: null,
      metadata: {},
    };
    let root: Record<string, unknown> | null = null;
    const supplySources = {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === 'string') return root;
        if (typeof where.identityKey === 'string' && root?.identityKey === where.identityKey) return root;
        return null;
      }),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        root = {
          ...data,
          lifecycleGeneration: 0,
          derivedStage: 'PRE_MAPPED',
          derivedOutcome: null,
          freshnessStatus: 'UNKNOWN',
          targetContribution: 0,
          repairPriority: 4,
          isAutomationEnabled: false,
          isExcluded: false,
          automationHoldReason: null,
          predecessorId: null,
          successorId: null,
        };
        return root;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(root ?? {}, data);
        return root;
      }),
    };
    const transitions = {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    };
    const contractManifests = {
      findFirst: jest.fn(async () => ({
        status: 'ACTIVE',
        version: manifest.version,
        rolloutCohort: manifest.rolloutCohort,
        contractHash: manifest.hash,
        contractJson: manifest.supplyContract,
      })),
    };
    const emptyCollection = () => ({
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    });
    const sources = {
      findUnique: jest.fn(async () => source),
      findFirst: jest.fn(async () => source),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(source, data);
        return source;
      }),
    };
    const database = {
      supplySources,
      contractManifests,
      transitions,
      sources,
      intakes: emptyCollection(),
      mappings: emptyCollection(),
      mappingJobs: emptyCollection(),
      approvals: emptyCollection(),
      runs: emptyCollection(),
      candidates: emptyCollection(),
      targets: emptyCollection(),
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await ensureAffiliateSupplySource({
      requestedUrl: 'https://club.example/events',
      resolvedCanonicalUrl: 'https://club.example/events',
      isRedirectVerified: true,
      targetKind: 'EVENT',
      liveSourceId: source.id,
      db: database,
      now,
    });

    expect(result.isCreated).toBe(true);
    expect(result.identity.rootDecision).toBe('NEW_ROOT');
    expect(root).toEqual(expect.objectContaining({
      lifecycleGeneration: 1,
      derivedStage: 'PRE_MAPPED',
    }));
    expect(transitions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        command: 'CREATE_ROOT',
        actorKind: 'SYSTEM',
        generation: 1,
        evidenceRefs: expect.arrayContaining([
          `identity:${result.identity.identityKey}`,
        ]),
      }),
    }));
  });
  it('revalidates a same-root raw URL normalization variant once', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const root = {
      id: 'supply-revalidation-1',
      identityKey: 'identity-revalidation-1',
      canonicalUrl: 'https://club.example/events',
      origin: 'https://club.example',
      pathKey: 'https://club.example/events',
      operatorDomain: 'club.example',
      targetKind: 'EVENT',
      rolloutCohort: 'DEFAULT',
      lifecycleGeneration: 3,
      isAutomationEnabled: true,
      automationHoldReason: null,
      metadata: {},
    };
    const source = {
      id: 'source-revalidation-1',
      supplySourceId: root.id,
      lifecycleGeneration: 3,
      derivedStage: 'ACTIVATED',
      autoScrapeEnabled: true,
      metadata: {},
    };
    const supplySources = {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === root.id ? root : null
      )),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(root, data);
        return root;
      }),
      create: jest.fn(),
    };
    const sources = {
      findUnique: jest.fn(async () => source),
      findFirst: jest.fn(async () => source),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(source, data);
        return source;
      }),
    };
    const contractManifests = {
      findFirst: jest.fn(async () => ({
        status: 'ACTIVE',
        version: manifest.version,
        rolloutCohort: manifest.rolloutCohort,
        contractHash: manifest.hash,
        contractJson: manifest.supplyContract,
      })),
    };
    const transitions = {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    };
    const emptyCollection = () => ({
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    });
    const intakes = emptyCollection();
    const mappings = emptyCollection();
    const mappingJobs = emptyCollection();
    const approvals = emptyCollection();
    const runs = emptyCollection();
    const candidates = emptyCollection();
    const targets = emptyCollection();
    const database = {
      supplySources,
      sources,
      contractManifests,
      transitions,
      intakes,
      mappings,
      mappingJobs,
      approvals,
      runs,
      candidates,
      targets,
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await ensureAffiliateSupplySource({
      requestedUrl: 'http://club.example/events?utm_source=affiliate#section',
      resolvedCanonicalUrl: 'https://club.example/events',
      isRedirectVerified: true,
      priorSupplySourceId: root.id,
      liveSourceId: source.id,
      db: database,
      now,
    });

    expect(result.identity.rootDecision).toBe('SAME_ROOT');
    expect(result.identity.isRevalidationRequired).toBe(true);
    expect(root.lifecycleGeneration).toBe(4);
    expect(root.isAutomationEnabled).toBe(false);
    expect(root.automationHoldReason).toBe('CANONICAL_REVALIDATION_REQUIRED');
    expect(supplySources.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: root.id },
      data: expect.objectContaining({
        isAutomationEnabled: false,
        automationHoldReason: 'CANONICAL_REVALIDATION_REQUIRED',
      }),
    }));
    expect(sources.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: source.id },
      data: expect.objectContaining({ autoScrapeEnabled: false }),
    }));
  });

  it('does not revalidate an equivalent reordered query URL', async () => {
    const root = {
      id: 'supply-equivalent-1',
      identityKey: 'identity-equivalent-1',
      canonicalUrl: 'https://club.example/events?a=1&b=2',
      origin: 'https://club.example',
      pathKey: 'https://club.example/events',
      operatorDomain: 'club.example',
      targetKind: 'EVENT',
      rolloutCohort: 'DEFAULT',
      lifecycleGeneration: 3,
      isAutomationEnabled: true,
      automationHoldReason: null,
      metadata: {},
    };
    const supplySources = {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
        where.id === root.id ? root : null
      )),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...root, ...data })),
      create: jest.fn(),
    };
    const database = {
      supplySources,
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => callback(database as AffiliateSupplyDatabase),
    } as unknown as AffiliateSupplyDatabase;

    const result = await ensureAffiliateSupplySource({
      requestedUrl: 'https://club.example/events?b=2&a=1',
      priorSupplySourceId: root.id,
      db: database,
    });

    expect(result.identity.rootDecision).toBe('SAME_ROOT');
    expect(result.identity.isRevalidationRequired).toBe(false);
    expect(supplySources.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: root.id },
      data: expect.not.objectContaining({
        lifecycleGeneration: 4,
        automationHoldReason: 'CANONICAL_REVALIDATION_REQUIRED',
      }),
    }));
  });

});
