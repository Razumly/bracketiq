/** @jest-environment node */

import {
  buildAffiliateSupplyContractManifest,
  normalizeAffiliateSupplyIdentity,
  type AffiliateSupplyContractPolicy,
} from '../affiliateSupplyLifecycle';
import {
  activateAffiliateSupplyContract,
  createAffiliateSupplyLifecycleAuthority,
  ensureAffiliateSupplySource,
  executeAffiliateSupplyLifecycleCommand,
  loadActiveAffiliateSupplyContract,
  loadActiveAffiliateSupplyContracts,
  materializeAffiliateCoverageDiscoveryResult,
  planAffiliateReplenishmentFromDatabase,
  reconcileAffiliateReplenishment,
  reconcileAffiliateReplenishmentDemands,
  deriveAffiliateLegacyStageFromEvidence,
  readAffiliateCutoverRollbackEvidence,
  reconcileLegacyAffiliateSupply,
  persistAffiliateCutoverRollbackDecision,
  persistAffiliateCutoverSession,
  startAffiliateReplenishmentWave,
  type AffiliateLegacySupplyReconciliationResult,
  type AffiliateSupplyDatabase,
} from '../affiliateSupplyPersistence';
import {
  buildAffiliateCutoverPreflightReport,
  hashAffiliateLegacyProcessManifest,
  hashAffiliateCutoverProcessInventory,
  type AffiliateCutoverPreflightReport,
  type AffiliateCutoverPreflightInput,
} from '../affiliateFleetCutover';
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

const rollbackProcessInventory = [
  {
    kind: 'LEGACY' as const,
    id: 'legacy-goal',
    processClass: 'GOAL',
    command: 'legacy-goal',
    status: 'STOPPED',
  },
  {
    kind: 'LEGACY' as const,
    id: 'legacy-loop',
    processClass: 'MAPPING',
    command: 'legacy-loop',
    status: 'STOPPED',
  },
  {
    kind: 'GOVERNED' as const,
    id: 'mapper-1',
    role: 'MAPPING_PRODUCER',
    workerId: 'mapping-1',
    command: 'affiliate:agent:supervisor',
    status: 'STOPPED',
  },
  {
    kind: 'GOVERNED' as const,
    id: 'mapper-2',
    role: 'MAPPING_PRODUCER',
    workerId: 'mapping-2',
    command: 'affiliate:agent:supervisor',
    status: 'STOPPED',
  },
  {
    kind: 'GOVERNED' as const,
    id: 'reviewer-1',
    role: 'SUPPLY_REVIEWER',
    workerId: 'reviewer-1',
    command: 'affiliate:agent:supervisor',
    status: 'STOPPED',
  },
  {
    kind: 'GOVERNED' as const,
    id: 'reviewer-2',
    role: 'SUPPLY_REVIEWER',
    workerId: 'reviewer-2',
    command: 'affiliate:agent:supervisor',
    status: 'STOPPED',
  },
  {
    kind: 'GOVERNED' as const,
    id: 'coverage-1',
    role: 'COVERAGE_PLANNER',
    workerId: 'coverage-1',
    command: 'affiliate:agent:supervisor',
    status: 'STOPPED',
  },
] as const;
type RollbackProcessRecordLike = Readonly<{
  id: string;
  kind: string;
  role?: string;
  workerId?: string;
  processClass?: string;
  command: string;
  status: string;
}>;
const codeUnitCompare = (left: string, right: string): number => (
  left === right ? 0 : left < right ? -1 : 1
);
const normalizedRollbackOptional = (value: string | undefined, uppercase = false): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return uppercase ? trimmed.toUpperCase() : trimmed;
};
const rollbackProcessInventoryKey = (process: RollbackProcessRecordLike): string => JSON.stringify({
  id: normalizedRollbackOptional(process.id) ?? '',
  kind: normalizedRollbackOptional(process.kind, true),
  role: normalizedRollbackOptional(process.role, true),
  workerId: normalizedRollbackOptional(process.workerId),
  processClass: normalizedRollbackOptional(process.processClass, true),
  command: normalizedRollbackOptional(process.command) ?? '',
  status: normalizedRollbackOptional(process.status, true),
});
const canonicalRollbackProcessInventory = <T extends RollbackProcessRecordLike>(
  processes: readonly T[],
): T[] => [...processes].sort((left, right) => codeUnitCompare(
  rollbackProcessInventoryKey(left),
  rollbackProcessInventoryKey(right),
));
const rollbackProcessInventoryHash = hashAffiliateCutoverProcessInventory(rollbackProcessInventory);
const rollbackSystemdUnits = [
  { processId: 'legacy-goal', unitId: 'bracketiq-affiliate-intake-automation.timer' },
  { processId: 'legacy-loop', unitId: 'bracketiq-affiliate-scrape-daily.timer' },
] as const;
const rollbackLegacyServiceUnits = [
  { id: 'bracketiq-affiliate-intake-automation.timer', isEnabled: 'DISABLED', isActive: 'INACTIVE' },
  { id: 'bracketiq-affiliate-scrape-daily.timer', isEnabled: 'MASKED', isActive: 'INACTIVE' },
] as const;
const preflightCounts = {
  mappingProducers: 2,
  supplyReviewers: 2,
  coveragePlanners: 1,
  stoppedLegacyProcesses: 2,
  runningLegacyProcesses: 0,
  liveLegacyClaims: 0,
  unsafeContainers: 0,
} as const;
const reviewedLegacyProcessManifestHash = hashAffiliateLegacyProcessManifest([
  { id: 'legacy-goal', processClass: 'GOAL' },
  { id: 'legacy-loop', processClass: 'MAPPING' },
], rollbackSystemdUnits);
const preflightHashInput = {
  schemaVersion: 1 as const,
  inputHash: 'preflight-input-hash',
  supplyContractVersion: manifest.version,
  supplyContractHash: manifest.supplyContract.hash,
  deploymentContractVersion: 2,
  deploymentContractHash: 'b'.repeat(64),
  gatewayVersion: 9,
  reviewedLegacyProcessManifestHash,
  reviewedLegacyProcessManifestCount: 2,
  reviewedLegacyProcessManifestArtifactId: 'reviewed-process-manifest-2026-08-25',
  reviewedSystemdUnits: rollbackSystemdUnits,
  processInventoryArtifactId: 'observed-process-inventory-2026-08-25',
  processInventoryHash: rollbackProcessInventoryHash,
  processInventoryCount: rollbackProcessInventory.length,
  legacyServiceUnits: rollbackLegacyServiceUnits,
  reviewedAgentNetwork: 'affiliate_gateway_internal',
  counts: preflightCounts,
  blockingFindings: [],
  warnings: [],
  resolutions: [],
};
const readyPreflight = {
  ...preflightHashInput,
  evaluatedAt: '2026-08-25T12:00:00.000Z',
  isReady: true,
  reportHash: hashAffiliateAgentValue({
    ...preflightHashInput,
    evaluatedAt: '2026-08-25T12:00:00.000Z',
  }),
} satisfies AffiliateCutoverPreflightReport;
const rollbackReviewedManifest = {
  schemaVersion: 1 as const,
  artifactId: 'reviewed-process-manifest-2026-08-25',
  processes: [
    { id: 'legacy-goal', processClass: 'GOAL' },
    { id: 'legacy-loop', processClass: 'MAPPING' },
  ],
  processCount: 2,
  manifestHash: reviewedLegacyProcessManifestHash,
  inventoryArtifactId: 'observed-process-inventory-2026-08-25',
  inventoryHash: rollbackProcessInventoryHash,
  inventoryCount: rollbackProcessInventory.length,
  reviewedAt: '2026-08-25T11:00:00.000Z',
  reviewedBy: 'reviewer-1',
  systemdUnits: rollbackSystemdUnits,
};
const rollbackRuntimeProcessEvidence = {
  artifactId: 'runtime-process-inventory-2026-08-25',
  capturedAt: '2026-08-25T12:05:00.000Z',
  processInventory: rollbackProcessInventory,
  controlPlaneProcesses: [
    { id: 'affiliate-gateway', status: 'STOPPED' },
    { id: 'affiliate-agent-runner', status: 'STOPPED' },
    { id: 'affiliate-replenishment-controller', status: 'STOPPED' },
  ],
  legacyServiceUnits: rollbackLegacyServiceUnits,
} as const;

const rollbackSessionPayloadFor = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const payload = {
    schemaVersion: 1,
    kind: 'AFFILIATE_CUTOVER_SESSION',
    sessionId: 'session-1',
    rolloutCohort: 'DEFAULT',
    recordedStartAt: '2026-08-25T12:00:00.000Z',
    reviewedLegacyProcessManifest: rollbackReviewedManifest,
    reviewedLegacyProcessManifestHash,
    reviewedLegacyProcessManifestArtifactId: rollbackReviewedManifest.artifactId,
    processInventory: canonicalRollbackProcessInventory(rollbackProcessInventory),
    legacyServiceUnits: rollbackLegacyServiceUnits,
    preflightReportHash: readyPreflight.reportHash,
    preflightReport: readyPreflight,
    deploymentContractVersion: readyPreflight.deploymentContractVersion,
    deploymentContractHash: readyPreflight.deploymentContractHash,
    ...overrides,
  };
  return {
    ...payload,
    sessionHash: hashAffiliateAgentValue(payload),
  };
};
const durableCutoverSessionId = 'session-1';
const durableCutoverSessionPayload = rollbackSessionPayloadFor();
const durableCutoverSessionHash = durableCutoverSessionPayload.sessionHash as string;
const createActiveContractManifestDelegate = () => ({
  findFirst: jest.fn(async () => ({
    status: 'ACTIVE',
    version: manifest.version,
    rolloutCohort: manifest.rolloutCohort,
    contractHash: manifest.hash,
    contractJson: manifest.supplyContract,
  })),
});

const durableCutoverSessionRow = (): Record<string, unknown> => ({
  id: durableCutoverSessionId,
  createdAt: new Date('2026-08-25T12:00:00.000Z'),
  mode: 'CUTOVER_SESSION',
  status: 'READY',
  operatorId: null,
  rolloutCohort: 'DEFAULT',
  supplyContractVersion: readyPreflight.supplyContractVersion,
  supplyContractHash: readyPreflight.supplyContractHash,
  deploymentContractVersion: readyPreflight.deploymentContractVersion,
  deploymentContractHash: readyPreflight.deploymentContractHash,
  inputHash: durableCutoverSessionHash,
  outputHash: durableCutoverSessionHash,
  reportHash: durableCutoverSessionHash,
  counts: {
    processInventory: rollbackProcessInventory.length,
    reviewedLegacyProcesses: rollbackReviewedManifest.processCount,
  },
  failedInvariants: [],
  resolutionRefs: [],
  reportJson: durableCutoverSessionPayload,
  appliedAt: null,
  appliedBy: null,
  applyNonceHash: null,
});
const findDurableCutoverSession = () => jest.fn(async ({
  where,
}: {
  where: Record<string, unknown>;
}) => (
  where.id === durableCutoverSessionId ? durableCutoverSessionRow() : null
));
const createRollbackDatabase = (input: Readonly<{
  sessionPayload?: Record<string, unknown>;
  receipts?: readonly unknown[];
  events?: readonly unknown[];
  demands?: readonly unknown[];
  waves?: readonly unknown[];
  supplySources?: readonly unknown[];
  supplyTargets?: readonly unknown[];
  appliedRuns?: readonly unknown[];
  mappingJobs?: readonly unknown[];
  approvalJobs?: readonly unknown[];
  intakeRuns?: readonly unknown[];
  discoveryRuns?: readonly unknown[];
  coverageJobs?: readonly unknown[];
  gatewayClaims?: readonly unknown[];
  gatewayJobs?: readonly unknown[];
  priorSessions?: readonly unknown[];
}> = {}) => {
  const sessionPayload = input.sessionPayload ?? rollbackSessionPayloadFor();
  const upsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => create);
  const findUnique = jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
    where.id === 'session-1'
      ? {
          id: 'session-1',
          createdAt: new Date('2026-08-25T12:00:00.000Z'),
          mode: 'CUTOVER_SESSION',
          status: 'READY',
          rolloutCohort: 'DEFAULT',
          deploymentContractVersion: readyPreflight.deploymentContractVersion,
          deploymentContractHash: readyPreflight.deploymentContractHash,
          reportJson: sessionPayload,
          reportHash: sessionPayload.sessionHash,
        }
      : null
  ));
  const findMany = jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
    if (where?.status === 'APPLIED') {
      const boundaryConditions = Array.isArray(where.OR) ? where.OR : null;
      return (input.appliedRuns ?? []).filter((row) => {
        if (!boundaryConditions) return true;
        if (!row || typeof row !== 'object') return false;
        return boundaryConditions.some((condition) => {
          if (!condition || typeof condition !== 'object') return false;
          const [field, predicate] = Object.entries(condition)[0] ?? [];
          if (!field || !predicate || typeof predicate !== 'object') return false;
          const value = Reflect.get(row, field);
          const gte = Reflect.get(predicate, 'gte');
          return value instanceof Date && gte instanceof Date && value >= gte;
        });
      });
    }
    if (where?.mode === 'CUTOVER_SESSION') {
      return (input.priorSessions ?? []).filter((session) => (
        where.rolloutCohort === undefined
          || (session && typeof session === 'object' && session.rolloutCohort === where.rolloutCohort)
      ));
    }
    return [];
  });
  const evidence = {
    findMany: jest.fn(async () => []),
  };
  const rowsFor = (rows: readonly unknown[] = []) => ({
    findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => (
      rows.filter((row) => (
        where?.rolloutCohort === undefined
          || (row && typeof row === 'object' && row.rolloutCohort === where.rolloutCohort)
      ))
    )),
  });
  const gatewayReceipts = rowsFor(input.receipts);
  const gatewayEvents = rowsFor(input.events);
  const demands = rowsFor(input.demands);
  const waves = rowsFor(input.waves);
  const supplySources = rowsFor(input.supplySources);
  const supplyTargets = rowsFor(input.supplyTargets);
  const mappingJobs = rowsFor(input.mappingJobs);
  const approvalJobs = rowsFor(input.approvalJobs);
  const intakeRuns = rowsFor(input.intakeRuns);
  const discoveryRuns = rowsFor(input.discoveryRuns);
  const coverageJobs = rowsFor(input.coverageJobs);
  const gatewayClaims = rowsFor(input.gatewayClaims);
  const gatewayJobs = rowsFor(input.gatewayJobs);
  let database: AffiliateSupplyDatabase;
  database = {
    reconciliationRuns: { findUnique, findMany, upsert },
    gatewayReceipts,
    gatewayEvents,
    transitions: evidence,
    demands,
    waves,
    supplySources,
    targets: supplyTargets,
    mappingJobs,
    approvals: approvalJobs,
    intakeRuns,
    discoveryRuns,
    coverageJobs,
    gatewayClaims,
    gatewayJobs,
    transaction: async (callback: (transactionDatabase: AffiliateSupplyDatabase) => Promise<unknown>) => (
      callback(database)
    ),
  } as unknown as AffiliateSupplyDatabase;
  return {
    database,
    findUnique,
    findMany,
    upsert,
    gatewayReceipts,
    gatewayEvents,
    demands,
    waves,
    supplySources,
    approvalJobs,
  };
};
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
  it('does not infer lifecycle stage from timestamps, job completion, or persisted projections', () => {
    const evidence = {
      sourceId: 'source-1',
      rootId: 'root-1',
      intakeIds: new Set<string>(),
      root: {
        id: 'root-1',
        derivedStage: 'ACTIVATED',
        status: 'ACTIVE',
        finishedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
      source: {
        id: 'source-1',
        status: 'COMPLETED',
        finishedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
      mappings: [],
      approvals: [],
      candidates: [],
      targets: [],
    };

    expect(deriveAffiliateLegacyStageFromEvidence({
      ...evidence,
      mappings: [{ sourceId: 'source-1', isActive: true, validatedAt: '2026-08-20T10:00:00.000Z' }],
    })).toBe('MAPPED');
    expect(deriveAffiliateLegacyStageFromEvidence({
      ...evidence,
      source: { ...evidence.source, autoScrapeEnabled: true },
      mappings: [{ sourceId: 'source-1', isActive: true, validatedAt: '2026-08-20T10:00:00.000Z' }],
      approvals: [{ sourceId: 'source-1', subjectType: 'MAPPING_PACKAGE', status: 'APPROVED' }],
    })).toBe('ACTIVATED');
  });
  it('does not treat a DOMAIN_POLICY approval as mapping authority', () => {
    const evidence = {
      sourceId: 'source-domain-policy',
      rootId: null,
      intakeIds: new Set<string>(),
      root: null,
      source: { id: 'source-domain-policy', status: 'ACTIVE' },
      mappings: [{
        sourceId: 'source-domain-policy',
        isActive: true,
        validatedAt: '2026-08-20T10:00:00.000Z',
      }],
      approvals: [{
        sourceId: 'source-domain-policy',
        subjectType: 'DOMAIN_POLICY',
        status: 'APPROVED',
        decision: 'APPROVE',
      }],
      candidates: [],
      targets: [],
    };

    expect(deriveAffiliateLegacyStageFromEvidence(evidence)).toBe('MAPPED');
  });

  it('blocks contradictory mapping approval state in the dry-run report', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'source-contradictory',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      mappings: {
        findMany: jest.fn(async () => [{
          id: 'mapping-contradictory',
          sourceId: 'source-contradictory',
          isActive: true,
          validatedAt: '2026-08-20T10:00:00.000Z',
        }]),
      },
      approvals: {
        findMany: jest.fn(async () => [{
          id: 'approval-contradictory',
          sourceId: 'source-contradictory',
          subjectType: 'MAPPING_PACKAGE',
          subjectKey: 'mapping-contradictory',
          status: 'APPROVED',
          decision: 'REJECT',
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({ db: database });

    expect(result.report.roots[0]?.derivedStage).toBe('HUMAN_REVIEW_REQUIRED');
    expect(result.report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONTRADICTORY_APPROVAL_STATE',
        severity: 'BLOCKING',
        recordIds: expect.arrayContaining(['approval-contradictory']),
      }),
    ]));
  });


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


  it('creates one schema-valid gateway coverage planner job for a replenishment wave', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demand = {
      id: 'demand-gateway',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: policy.rolloutCohort,
      contractVersion: policy.version,
      contractHash: policy.hash,
      status: 'OPEN',
      priority: 4,
      generation: 0,
    };
    let liveWave: Record<string, unknown> | null = null;
    const demands = {
      findUnique: jest.fn(async () => demand),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(demand, data);
        return demand;
      }),
    };
    const waves = {
      findFirst: jest.fn(async () => liveWave),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        liveWave = { ...data, id: 'wave-gateway' };
        return liveWave;
      }),
    };
    const gatewayJobs = {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        ...create,
        id: 'gateway-coverage-job',
      })),
    };
    let database: AffiliateSupplyDatabase;
    database = {
      demands,
      waves,
      gatewayJobs,
      coverageJobs: {},
      transaction: async (
        callback: (transactionDatabase: AffiliateSupplyDatabase) => Promise<unknown>,
      ) => callback(database),
    } as unknown as AffiliateSupplyDatabase;
    const plan = {
      targetWaitingMapping: 0,
      targetWaitingReview: 0,
      isAdmissionHalted: false,
      isMappingPaused: false,
      isCampaignPaused: false,
      action: 'REQUEST_COVERAGE_PLANNING_JOB' as const,
      selectedDemandId: demand.id,
      selectedCampaignId: null,
      reasonCodes: [],
    };

    const firstWave = await startAffiliateReplenishmentWave({
      plan,
      rolloutCohort: policy.rolloutCohort,
      contract: policy,
      db: database,
      now,
    });
    const secondWave = await startAffiliateReplenishmentWave({
      plan,
      rolloutCohort: policy.rolloutCohort,
      contract: policy,
      db: database,
      now,
    });

    expect(firstWave).toEqual(expect.objectContaining({
      id: 'wave-gateway',
      coveragePlanningJobId: 'gateway-coverage-job',
      demandGeneration: 1,
    }));
    expect(secondWave).toEqual(firstWave);
    expect(gatewayJobs.upsert).toHaveBeenCalledTimes(1);
    expect(gatewayJobs.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        dedupeKey: `coverage-planning:${demand.id}:1:${policy.version}:${policy.hash}`,
      },
      create: expect.objectContaining({
        queue: 'AFFILIATE_COVERAGE',
        lane: 'COVERAGE_PLANNING',
        role: 'COVERAGE_PLANNER',
        subjectType: 'COVERAGE_PLANNER',
        subjectId: demand.targetKey,
        subjectJson: {
          type: 'COVERAGE_PLANNER',
          coverageCellId: demand.targetKey,
          assessmentCycleId: `${demand.id}:generation:1`,
        },
        evidenceManifestJson: expect.objectContaining({
          schemaVersion: 1,
          entries: expect.arrayContaining([
            expect.objectContaining({
              evidenceRef: 'coverage-strategy',
              kind: 'REVIEWER_EVIDENCE',
              byteSize: expect.any(Number),
              sha256: expect.any(String),
            }),
            expect.objectContaining({
              evidenceRef: 'coverage-query',
              kind: 'REVIEWER_EVIDENCE',
            }),
            expect.objectContaining({
              evidenceRef: 'coverage-capture-profile',
              kind: 'REVIEWER_EVIDENCE',
            }),
          ]),
          hash: expect.any(String),
        }),
        status: 'QUEUED',
        claimGeneration: 0,
        nextAttemptAt: now,
      }),
      update: {},
    }));
  });
  it('materializes claim-owned discovery output without inventing invalid sources', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const demand = {
      id: 'demand-materialization',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: 'DEFAULT',
      contractVersion: policy.version,
      contractHash: policy.hash,
    };
    const wave = {
      id: 'wave-materialization',
      demandId: demand.id,
      coveragePlanningJobId: 'gateway-materialization-job',
      demandGeneration: 1,
      campaignId: null,
    };
    const campaigns: Record<string, Record<string, unknown>> = {};
    const discoveryRuns: Record<string, Record<string, unknown>> = {};
    const discoveryResults: Record<string, Record<string, unknown>> = {};
    const intakes: Record<string, Record<string, unknown>> = {};
    const sources: Record<string, Record<string, unknown>> = {};
    const supplySources: Record<string, Record<string, unknown>> = {};
    const database = {
      demands: {
        findUnique: jest.fn(async () => demand),
      },
      waves: {
        findFirst: jest.fn(async () => wave),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(wave, data);
          return wave;
        }),
      },
      campaigns: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (
          campaigns[where.id] ?? null
        )),
        upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => {
          campaigns[String(create.id)] = { ...create };
          return campaigns[String(create.id)];
        }),
        update: jest.fn(async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          campaigns[where.id] = { ...campaigns[where.id], ...data };
          return campaigns[where.id];
        }),
      },
      discoveryRuns: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (
          discoveryRuns[where.id] ?? null
        )),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          discoveryRuns[String(data.id)] = { ...data };
          return discoveryRuns[String(data.id)];
        }),
        update: jest.fn(async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          discoveryRuns[where.id] = { ...discoveryRuns[where.id], ...data };
          return discoveryRuns[where.id];
        }),
      },
      discoveryResults: {
        findUnique: jest.fn(async ({
          where,
        }: {
          where: { campaignId_urlKey: { campaignId: string; urlKey: string } };
        }) => {
          const key = `${where.campaignId_urlKey.campaignId}:${where.campaignId_urlKey.urlKey}`;
          return discoveryResults[key] ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const key = `${data.campaignId}:${data.urlKey}`;
          discoveryResults[key] = { ...data };
          return discoveryResults[key];
        }),
        update: jest.fn(async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const found = Object.values(discoveryResults).find(
            (entry) => entry.id === where.id,
          );
          if (!found) throw new Error('discovery result not found');
          Object.assign(found, data);
          return found;
        }),
      },
      intakes: {
        findUnique: jest.fn(async ({ where }: { where: { sourceKey: string } }) => (
          intakes[where.sourceKey] ?? null
        )),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          intakes[String(data.sourceKey)] = { ...data };
          return intakes[String(data.sourceKey)];
        }),
        update: jest.fn(async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const found = Object.values(intakes).find((entry) => entry.id === where.id);
          if (!found) throw new Error('intake not found');
          Object.assign(found, data);
          return found;
        }),
      },
      sources: {
        findUnique: jest.fn(async ({ where }: {
          where: { sourceKey?: string; id?: string };
        }) => (
          where.sourceKey
            ? sources[where.sourceKey] ?? null
            : Object.values(sources).find((entry) => entry.id === where.id) ?? null
        )),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          sources[String(data.sourceKey)] = { ...data };
          return sources[String(data.sourceKey)];
        }),
        update: jest.fn(async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const found = Object.values(sources).find((entry) => entry.id === where.id);
          if (!found) throw new Error('source not found');
          Object.assign(found, data);
          return found;
        }),
      },
      supplySources: {
        findUnique: jest.fn(async ({
          where,
        }: {
          where: { identityKey?: string; id?: string };
        }) => (
          where.identityKey
            ? supplySources[where.identityKey] ?? null
            : Object.values(supplySources).find((entry) => entry.id === where.id) ?? null
        )),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          supplySources[String(data.identityKey)] = { ...data };
          return supplySources[String(data.identityKey)];
        }),
        update: jest.fn(async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const found = Object.values(supplySources).find((entry) => entry.id === where.id);
          if (!found) throw new Error('Supply Source not found');
          Object.assign(found, data);
          return found;
        }),
      },
    } as unknown as AffiliateSupplyDatabase;

    const materialized = await materializeAffiliateCoverageDiscoveryResult({
      database,
      gatewayJobId: wave.coveragePlanningJobId,
      claimId: 'discovery-claim',
      claimGeneration: 1,
      receiptId: 'discovery-receipt',
      provider: 'TEST_PROVIDER',
      query: 'portland soccer events',
      providerOutput: {
        provider: 'TEST_PROVIDER',
        providerJobId: 'provider-job',
        request: { query: 'portland soccer events' },
        response: { resultCount: 1 },
        rows: [
          {
            url: 'https://club.example/events#tracking',
            title: 'Club events',
            description: 'Upcoming events',
            category: 'events',
          },
          { url: 'mailto:invalid@example.test', title: 'Invalid' },
        ],
      },
      evidenceManifest: { schemaVersion: 1, entries: [] },
      providerEvidence: {
        evidenceRef: 'provider-result',
        artifactId: 'provider-artifact',
        sha256: 'a'.repeat(64),
        mimeType: 'application/json',
        byteSize: 128,
      },
      now,
    });

    expect(materialized).toEqual(expect.objectContaining({
      campaignId: 'gateway-campaign:gateway-materialization-job',
      discoveryRunId: 'gateway-discovery-run:discovery-receipt',
      discoveryResultIds: [expect.any(String)],
    }));
    expect(wave.campaignId).toBe(materialized?.campaignId);
    expect(Object.values(discoveryRuns)).toEqual([
      expect.objectContaining({
        campaignId: materialized?.campaignId,
        status: 'SUCCEEDED',
        returnedResultCount: 1,
      }),
    ]);
    expect(Object.values(discoveryResults)).toEqual([
      expect.objectContaining({
        canonicalUrl: 'https://club.example/events',
        sourceTypeHints: ['EVENT'],
        latestRunId: materialized?.discoveryRunId,
        supplySourceId: expect.any(String),
      }),
    ]);
    expect(Object.values(sources)).toHaveLength(1);
    expect(Object.values(supplySources)).toHaveLength(1);
    expect(Object.values(intakes)).toHaveLength(1);
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
    const supplySources = {
      findUnique: jest.fn(async () => root),
      update: jest.fn(),
    };
    const database = {
      supplySources,
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
    const reviewedTargets = candidateReview.decision.targets.map((target) => ({
      ...target,
      targetId: 'event-1',
    }));
    const reviewedDecision = { ...candidateReview.decision, targets: reviewedTargets };
    const { decisionHash: _decisionHash, ...reviewPayload } = reviewedDecision;
    candidateReview.decision = {
      ...reviewedDecision,
      decisionHash: hashAffiliateAgentValue(reviewPayload),
    };
    await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id,
      command: 'ACTIVATE',
      authority: 'HUMAN_DIRECTED_EXECUTOR',
      expectedLifecycleGeneration: 0,
      actorKind: 'HUMAN_DIRECTED_EXECUTOR',
      actorId: 'reviewer-1',
      idempotencyKey: 'activate-valid',
      request: {
        sourceId: source.id,
        mappingId: mapping.id,
        packageHash: hashAffiliateAgentValue(mapping.mapping),
        baselineHash: 'baseline-hash',
        candidateReviewId: candidateReview.id,
        evidenceRefs: ['review:1'],
      },
      db: database,
    });
    expect(supplySources.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: root.id },
      data: expect.objectContaining({
        isAutomationEnabled: true,
        activeSupplyContractVersion: activeManifest.version,
        activeSupplyContractHash: activeManifest.supplyContract.hash,
      }),
    }));
    expect(sources.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: source.id },
      data: expect.objectContaining({
        autoScrapeEnabled: true,
        activeSupplyContractVersion: activeManifest.version,
        activeSupplyContractHash: activeManifest.supplyContract.hash,
      }),
    }));
  });
  it('rejects a lifecycle command whose supplied cohort belongs to another root', async () => {
    const root = {
      id: 'root-cohort',
      rolloutCohort: 'DEFAULT',
      lifecycleGeneration: 0,
      liveSourceId: null,
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
    const database = {
      supplySources: {
        findUnique: jest.fn(async () => root),
      },
      transitions: {
        findUnique: jest.fn(async () => null),
      },
      contractManifests,
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => (
        callback(database as unknown as AffiliateSupplyDatabase)
      ),
    } as unknown as AffiliateSupplyDatabase;

    await expect(executeAffiliateSupplyLifecycleCommand({
      supplySourceId: root.id,
      command: 'RECORD_REFRESH',
      authority: 'SYSTEM',
      expectedLifecycleGeneration: 0,
      actorKind: 'SYSTEM',
      actorId: 'cohort-test',
      idempotencyKey: 'cohort-mismatch',
      rolloutCohort: 'FOREIGN',
      db: database,
    })).rejects.toThrow('rollout cohort does not match the Supply Source root');
    expect(contractManifests.findFirst).not.toHaveBeenCalled();
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
      updateMany: jest.fn(async () => ({ count: 1 })),
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
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(demand, data);
        return demand;
      }),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(demand, data);
        return { count: 1 };
      }),
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
    expect(waves.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wave-1', demandGeneration: 2 },
      data: expect.objectContaining({
        status: 'FAILED',
        marginalYield: null,
        errorCode: 'PROVIDER_FAILURE',
      }),
    }));
    expect(demands.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: demand.id,
        generation: 2,
        activeWaveId: 'wave-1',
      }),
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
      updateMany: jest.fn(async () => ({ count: 1 })),
    };
    const demands = {
      findUnique: jest.fn(async () => demand),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async ({ create, update }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => Object.assign(demand, update ?? create)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(demand, data);
        return demand;
      }),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(demand, data);
        return { count: 1 };
      }),
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
    expect(demands.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: demand.id,
        generation: 2,
        activeWaveId: 'wave-saturation',
      }),
      data: expect.objectContaining({
        activeWaveId: null,
        nextEligibleAt: null,
        searchSaturatedUntil: new Date('2026-08-24T12:00:00.000Z'),
      }),
    }));
  });
  it('marks an in-flight provider outcome stale when a newer wave advances demand', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const oldDemand = {
      id: 'demand-in-flight',
      targetKey: 'portland:soccer:event',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      rolloutCohort: policy.rolloutCohort,
      contractVersion: policy.version,
      contractHash: policy.hash,
      status: 'OPEN',
      priority: 4,
      openedAt: now,
      nextEligibleAt: null,
      searchSaturatedUntil: null,
      generation: 1,
      activeWaveId: 'wave-old',
    };
    const newerDemand = {
      ...oldDemand,
      generation: 2,
      activeWaveId: 'wave-newer',
    };
    const newerDemandBeforeProviderResult = { ...newerDemand };
    const oldWave = {
      id: oldDemand.activeWaveId,
      demandId: oldDemand.id,
      rolloutCohort: policy.rolloutCohort,
      status: 'ACTIVE',
      demandGeneration: oldDemand.generation,
      retryAt: null,
      campaignId: null,
      evidenceRefs: [`demand:${oldDemand.id}`],
    };
    let currentDemand = oldDemand;
    let demandReads = 0;
    let markProviderStarted = () => {};
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    let releaseProvider = () => {};
    const providerReleased = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const demands = {
      findUnique: jest.fn(async () => {
        demandReads += 1;
        return demandReads <= 2 ? oldDemand : currentDemand;
      }),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async ({ where, data }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const matchesCurrentDemand = currentDemand.id === where.id
          && Number(currentDemand.generation) === Number(where.generation)
          && currentDemand.activeWaveId === where.activeWaveId;
        if (!matchesCurrentDemand) return { count: 0 };
        Object.assign(currentDemand, data);
        return { count: 1 };
      }),
    };
    const waves = {
      findMany: jest.fn(async () => [oldWave]),
      findFirst: jest.fn(async () => oldWave),
      updateMany: jest.fn(async () => ({ count: 1 })),
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
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1),
      },
      waves,
      campaigns: { findMany: jest.fn(async () => []) },
      transaction: async (callback: (db: AffiliateSupplyDatabase) => Promise<unknown>) => (
        callback(database as AffiliateSupplyDatabase)
      ),
    } as unknown as AffiliateSupplyDatabase;
    const runWave = jest.fn(async () => {
      markProviderStarted();
      await providerReleased;
      return {
        status: 'SUCCEEDED' as const,
        provider: 'AFFILIATE_DISCOVERY',
        marginalYield: 1,
      };
    });

    const reconciliation = reconcileAffiliateReplenishment({
      contract: policy,
      isContractSafe: true,
      db: database,
      now,
      runWave,
    });
    await providerStarted;
    currentDemand = newerDemand;
    releaseProvider();
    const result = await reconciliation;

    expect(result.providerResult).toEqual(expect.objectContaining({
      status: 'PAUSED',
      errorCode: 'STALE_DEMAND_GENERATION',
    }));
    expect(newerDemand).toEqual(newerDemandBeforeProviderResult);
    expect(newerDemand.activeWaveId).toBe('wave-newer');
    expect(newerDemand.generation).toBe(2);
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
      isDryRun: true,
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
  it('counts fresh targets into every matching replenishment demand cell', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z');
    const overlapContract = {
      ...policy,
      targets: [
        {
          marketKey: null,
          sportId: null,
          sourceProfile: 'EVENT',
          minimumFreshPublishedSupply: 2,
        },
        {
          marketKey: 'portland',
          sportId: 'soccer',
          sourceProfile: 'EVENT',
          minimumFreshPublishedSupply: 1,
        },
      ],
    };
    const demands = {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async ({ create, update }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => ({ ...create, ...update })),
    };
    const database = {
      supplySources: {
        findMany: jest.fn(async () => [{
          id: 'supply-overlap',
          isExcluded: false,
          derivedOutcome: null,
          derivedStage: 'PUBLISHED',
          repairPriority: 1,
          targetKind: 'EVENT',
          metadata: null,
        }]),
      },
      targets: {
        findMany: jest.fn(async () => [
          {
            supplySourceId: 'supply-overlap',
            marketKey: 'portland',
            sportId: 'soccer',
            sourceProfile: 'EVENT',
            status: 'PUBLISHED',
            rejectedAt: null,
            freshnessExpiresAt: new Date('2026-08-23T12:00:00.000Z'),
            lastSuccessfulRefreshAt: now,
            metadata: null,
          },
          {
            supplySourceId: 'supply-overlap',
            marketKey: 'seattle',
            sportId: 'baseball',
            sourceProfile: 'EVENT',
            status: 'PUBLISHED',
            rejectedAt: null,
            freshnessExpiresAt: new Date('2026-08-23T12:00:00.000Z'),
            lastSuccessfulRefreshAt: now,
            metadata: null,
          },
        ]),
      },
      demands,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileAffiliateReplenishmentDemands({
      contract: overlapContract,
      db: database,
      now,
    });

    expect(result.demands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetKey: 'default:all:event',
        minimumFreshPublishedSupply: 2,
        observedFreshPublishedSupply: 2,
        status: 'CLOSED',
      }),
      expect.objectContaining({
        targetKey: 'portland:soccer:event',
        minimumFreshPublishedSupply: 1,
        observedFreshPublishedSupply: 1,
        status: 'CLOSED',
      }),
    ]));
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

  it('persists a dry-run report without changing legacy rows', async () => {
    let persistedRun: Record<string, unknown> | null = null;
    const reconciliationRuns = {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
        where.reportHash === persistedRun?.reportHash ? persistedRun : null
      )),
      upsert: jest.fn(async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const payload = persistedRun ? update : create;
        persistedRun = { ...(persistedRun ?? {}), ...payload };
        return payload;
      }),
    };
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

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
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
      reconciliationRuns,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.mode).toBe('DRY_RUN');
    expect(result.isApplied).toBe(false);
    expect(result.report.isApplySafe).toBe(true);
    expect(reconciliationRuns.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { reportHash: result.reportHash },
      create: expect.objectContaining({
        mode: 'DRY_RUN',
        inputHash: result.inputHash,
        outputHash: result.outputHash,
      }),
    }));
    persistedRun = {
      ...(persistedRun ?? {}),
      mode: 'APPLY',
      status: 'APPLIED',
      appliedAt: new Date('2026-08-25T12:00:00.000Z'),
      appliedBy: 'operator-1',
    };
    const laterDryRun = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    expect(laterDryRun.reportHash).toBe(result.reportHash);
    expect(persistedRun.status).toBe('APPLIED');
    expect(reconciliationRuns.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'APPLIED' }),
    }));
  });
  it('persists non-ASCII finding resolutions with code-unit ordering', async () => {
    const reconciliationRuns = {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => create),
    };
    const duplicateSourceRows = ['a', 'ä', 'z'].flatMap((id) => [
      {
        id,
        listUrl: `https://${id}.example/events`,
        canonicalUrl: `https://${id}.example/events`,
        targetKind: 'EVENT',
      },
      {
        id,
        listUrl: `https://${id}.example/events`,
        canonicalUrl: `https://${id}.example/events`,
        targetKind: 'TEAM',
      },
    ]);
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: { findMany: jest.fn(async () => duplicateSourceRows) },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
      reconciliationRuns,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.report.resolutions.map((finding) => (
      finding.detail.match(/^Legacy source (\S+)/)?.[1]
    ))).toEqual([
      'a',
      'z',
      'ä',
    ]);
    expect(reconciliationRuns.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { reportHash: result.reportHash },
    }));
  });
  it('blocks conflicting intake identities for one source without order dependence', async () => {
    const intakes = [
      {
        id: 'intake-é',
        affiliateSourceId: 'legacy-source',
        baseUrl: 'https://legacy.example/events',
      },
      {
        id: 'intake-Ω',
        affiliateSourceId: 'legacy-source',
        baseUrl: 'https://other.example/events',
      },
    ];
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      intakes: { findMany: jest.fn(async () => intakes) },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const first = await reconcileLegacyAffiliateSupply({ db: database });
    intakes.reverse();
    const second = await reconcileLegacyAffiliateSupply({ db: database });

    expect(first.report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SOURCE_IDENTITY_CONFLICT',
        recordIds: ['legacy-source'],
      }),
    ]));
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.reportHash).toBe(second.reportHash);
  });
  it('uses authoritative source identity for linked pre-redirect intake evidence', async () => {
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/old-events',
      resolvedCanonicalUrl: 'https://legacy.example/events',
      isRedirectVerified: true,
    });
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/old-events',
          canonicalUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
          supplySourceId: 'root-1',
        }]),
      },
      intakes: {
        findMany: jest.fn(async () => [{
          id: 'intake-1',
          affiliateSourceId: 'legacy-source',
          baseUrl: 'https://legacy.example/old-events',
        }]),
      },
      supplySources: {
        findMany: jest.fn(async () => [{
          id: 'root-1',
          identityKey: identity.identityKey,
          canonicalUrl: identity.canonicalUrl,
          origin: identity.origin,
          pathKey: identity.pathKey,
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.report.isApplySafe).toBe(true);
    expect(result.report.blockingFindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SOURCE_IDENTITY_CONFLICT',
        recordIds: ['legacy-source'],
      }),
    ]));
    expect(result.report.roots[0]).toEqual(expect.objectContaining({
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      existingRootId: 'root-1',
    }));
  });

  it('links mapping-package approval evidence through its subject job', async () => {
    const reconciliationRuns = {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => create),
    };
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      mappings: {
        findMany: jest.fn(async () => [{
          id: 'mapping-id',
          sourceId: 'legacy-source',
          isActive: true,
          validatedAt: new Date('2026-08-24T12:00:00.000Z'),
        }]),
      },
      mappingJobs: {
        findMany: jest.fn(async () => [{
          id: 'mapping-job',
          sourceId: 'legacy-source',
          status: 'COMPLETED',
        }]),
      },
      approvals: {
        findMany: jest.fn(async () => [{
          id: 'approval-job',
          subjectType: 'MAPPING_PACKAGE',
          subjectKey: 'mapping-job',
          status: 'APPROVED',
          decision: 'APPROVE',
        }]),
      },
      candidates: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
      reconciliationRuns,
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.report.counts.recordsByKind).toEqual(expect.objectContaining({
      MAPPING: 1,
      MAPPING_JOB: 1,
      APPROVAL_JOB: 1,
    }));
    expect(result.report.roots[0]?.recordIds).toEqual(expect.arrayContaining([
      'mapping-id',
      'mapping-job',
      'approval-job',
    ]));
    expect(result.report.counts.unresolvedRecords).toBe(0);
  });

  it('allows expired legacy claims with no live lease or token to be revoked', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      mappingJobs: {
        findMany: jest.fn(async () => [{
          id: 'mapping-job',
          sourceId: 'legacy-source',
          status: 'CLAIMED',
          workerId: 'legacy-worker',
          leaseExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.report.counts.expiredClaims).toBe(1);
    expect(result.claimsToRevoke).toBe(1);
    expect(result.report.claimActions).toEqual([expect.objectContaining({
      id: 'mapping-job',
      action: 'REVOKE_EXPIRED',
    })]);
    expect(result.report.isApplySafe).toBe(true);
    expect(result.report.blockingFindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TERMINAL_CLAIM_WITH_LIVE_EVIDENCE',
        recordIds: ['mapping-job'],
      }),
    ]));
  });
  it('blocks an active gateway claim when its token expires before its lease', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      gatewayClaims: {
        findMany: jest.fn(async () => [{
          id: 'gateway-claim',
          jobId: 'gateway-job',
          claimGeneration: 4,
          status: 'ACTIVE',
          leaseExpiresAt: new Date('2026-08-25T13:00:00.000Z'),
          tokenExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
        }]),
      },
      gatewayJobs: {
        findMany: jest.fn(async () => [{
          id: 'gateway-job',
          status: 'CLAIMED',
          activeClaimId: null,
          claimGeneration: 4,
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.report.counts.expiredClaims).toBe(1);
    expect(result.claimsToRevoke).toBe(1);
    expect(result.report.claimActions).toEqual([expect.objectContaining({
      id: 'gateway-claim',
      action: 'REVOKE_EXPIRED',
    })]);
    expect(result.report.isApplySafe).toBe(false);
    expect(result.report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'GATEWAY_CLAIM_JOB_MISMATCH',
        recordIds: ['gateway-claim', 'gateway-job'],
      }),
    ]));
  });

  it('blocks a claimed gateway job without a matching active claim', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      gatewayJobs: {
        findMany: jest.fn(async () => [{
          id: 'orphan-gateway-job',
          status: 'CLAIMED',
          activeClaimId: null,
          claimGeneration: 6,
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.report.isApplySafe).toBe(false);
    expect(result.report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'GATEWAY_CLAIM_JOB_MISMATCH',
        recordIds: ['orphan-gateway-job'],
      }),
    ]));
  });

  it('rejects apply when the reviewed report hash changed', async () => {
    const database = {
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      reconciliationRuns: { findUnique: findDurableCutoverSession() },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
    } as unknown as AffiliateSupplyDatabase;

    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: 'wrong-report-hash',
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
      preflight: readyPreflight,
    })).rejects.toThrow('report hash does not match');
  });
  it('rejects apply when durable cutover session evidence is missing', async () => {
    const database = {
      sources: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
    })).rejects.toThrow('requires a durable cutover session ID and hash');
  });
  it('rejects apply when durable cutover session hash mismatches', async () => {
    const database = {
      sources: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      reconciliationRuns: { findUnique: findDurableCutoverSession() },
    } as unknown as AffiliateSupplyDatabase;

    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: '0'.repeat(64),
    })).rejects.toThrow('cutover session hash does not match the durable session');
  });
  it('rejects apply when the reviewed input hash is missing', async () => {
    const database = {
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      reconciliationRuns: { findUnique: findDurableCutoverSession() },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
    } as unknown as AffiliateSupplyDatabase;
    const dryRun = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
      preflight: readyPreflight,
    })).rejects.toThrow('requires the reviewed input hash');
  });
  it('rejects apply when the stopped-fleet preflight is stale', async () => {
    const transaction = jest.fn();
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      reconciliationRuns: { findUnique: findDurableCutoverSession() },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
      transaction,
    } as unknown as AffiliateSupplyDatabase;

    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: 'reviewed-report',
      preflight: {
        ...readyPreflight,
        evaluatedAt: '2026-08-25T10:00:00.000Z',
      },
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    })).rejects.toThrow('verified, fresh preflight');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects apply when the reviewed report contains blocking findings', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      mappingJobs: {
        findMany: jest.fn(async () => [{
          id: 'active-mapping-job',
          sourceId: 'legacy-source',
          status: 'CLAIMED',
          workerId: 'legacy-worker',
          leaseExpiresAt: new Date('2026-08-25T13:00:00.000Z'),
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      reconciliationRuns: { findUnique: findDurableCutoverSession() },
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
      transaction: jest.fn(),
    } as unknown as AffiliateSupplyDatabase;

    const dryRun = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(dryRun.report.isApplySafe).toBe(false);
    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      preflight: readyPreflight,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    })).rejects.toThrow('without blocking findings');
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it('rejects APPLY before writes when lifecycle delegates are unavailable', async () => {
    const transaction = jest.fn();
    const findUnique = jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
      where.id === durableCutoverSessionId ? durableCutoverSessionRow() : null
    ));
    const upsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => create);
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
        }]),
      },
      supplySources: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      reconciliationRuns: { findUnique, upsert },
      transaction,
    } as unknown as AffiliateSupplyDatabase;
    const dryRun = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      preflight: readyPreflight,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    })).rejects.toThrow('lifecycle persistence delegates are unavailable');
    expect(transaction).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });
  it('rejects APPLY before roots when a required record-link delegate is unavailable', async () => {
    const transaction = jest.fn();
    const findUnique = jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
      where.id === durableCutoverSessionId ? durableCutoverSessionRow() : null
    ));
    const upsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => create);
    const source = {
      id: 'legacy-source',
      listUrl: 'https://legacy.example/events',
      canonicalUrl: 'https://legacy.example/events',
      targetKind: 'EVENT',
      status: 'ACTIVE',
      supplySourceId: 'root-1',
    };
    const root = {
      id: 'root-1',
      identityKey: normalizeAffiliateSupplyIdentity({
        requestedUrl: source.listUrl,
        resolvedCanonicalUrl: source.canonicalUrl,
        isRedirectVerified: true,
      }).identityKey,
      canonicalUrl: source.canonicalUrl,
      origin: 'https://legacy.example',
      pathKey: '/events',
      predecessorId: null,
      successorId: null,
      derivedStage: 'PRE_MAPPED',
      derivedOutcome: null,
      lifecycleGeneration: 0,
      isAutomationEnabled: false,
      targetKind: 'EVENT',
      intakeId: null,
      liveSourceId: source.id,
      operatorDomain: 'legacy.example',
      metadata: null,
    };
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: { findMany: jest.fn(async () => [source]) },
      mappingJobs: {
        findMany: jest.fn(async () => [{
          id: 'mapping-job',
          sourceId: source.id,
          status: 'COMPLETED',
        }]),
      },
      supplySources: {
        findMany: jest.fn(async () => [root]),
        findUnique: jest.fn(async () => root),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => root),
        update: jest.fn(async () => root),
      },
      targets: { findMany: jest.fn(async () => []) },
      transitions: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async () => ({})),
      },
      reconciliationRuns: { findUnique, upsert },
      transaction,
    } as unknown as AffiliateSupplyDatabase;
    const dryRun = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-25T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      preflight: readyPreflight,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    })).rejects.toThrow('record kind SOURCE');
    expect(transaction).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });




  it('replays an applied report without reapplying writes', async () => {
    let persistedRun: Record<string, unknown> | null = null;
    const findUnique = jest.fn(async ({
      where,
    }: {
      where: Record<string, unknown>;
    }) => {
      if (where.id === durableCutoverSessionId) return durableCutoverSessionRow();
      if (where.reportHash === persistedRun?.reportHash) return persistedRun;
      return null;
    });
    const reconciliationRuns = {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => {
        persistedRun = { ...create };
        return create;
      }),
      findUnique,
    };
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

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
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
      reconciliationRuns,
      contractManifests: {
        findFirst: jest.fn(async () => ({
          status: 'ACTIVE',
          version: manifest.version,
          rolloutCohort: manifest.rolloutCohort,
          contractHash: manifest.hash,
          contractJson: manifest.supplyContract,
        })),
      },
    } as unknown as AffiliateSupplyDatabase;

    const dryRun = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    const appliedReport = {
      ...dryRun.report,
      postApplyLegacySnapshotHash: dryRun.report.legacySnapshotHash,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    };
    persistedRun = {
      mode: 'APPLY',
      status: 'APPLIED',
      reportJson: appliedReport,
      inputHash: dryRun.inputHash,
      outputHash: dryRun.outputHash,
      reportHash: dryRun.reportHash,
      counts: dryRun.report.counts,
      failedInvariants: [],
      resolutionRefs: [],
      operatorId: 'operator-1',
      rolloutCohort: manifest.rolloutCohort,
      supplyContractVersion: manifest.version,
      supplyContractHash: manifest.supplyContract.hash,
      deploymentContractVersion: readyPreflight.deploymentContractVersion,
      deploymentContractHash: readyPreflight.deploymentContractHash,
      applyNonceHash: hashAffiliateAgentValue('nonce-1'),
      appliedAt: new Date('2026-08-25T12:00:00.000Z'),
      appliedBy: 'operator-1',
    };

    const replay = await reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-26T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
      preflight: readyPreflight,
    });
    expect(replay.isApplied).toBe(true);
    expect(replay.report).toEqual(dryRun.report);
  });
  const createReplayLifecycleFixture = async (
    rootOverrides: Record<string, unknown>,
  ): Promise<{
    database: AffiliateSupplyDatabase;
    dryRun: AffiliateLegacySupplyReconciliationResult;
  }> => {
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/events',
      resolvedCanonicalUrl: 'https://legacy.example/events',
      isRedirectVerified: true,
    });
    const root = {
      id: 'root-replay-guard',
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
      predecessorId: null,
      successorId: null,
      derivedStage: 'PRE_MAPPED',
      derivedOutcome: null,
      lifecycleGeneration: 0,
      isAutomationEnabled: false,
      targetKind: 'EVENT',
      intakeId: null,
      liveSourceId: 'legacy-source',
      operatorDomain: 'legacy.example',
      metadata: null,
      ...rootOverrides,
    };
    let persistedRun: Record<string, unknown> | null = null;
    const transitions = {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    };
    const supplySources = {
      findMany: jest.fn(async () => [root]),
      update: jest.fn(async () => root),
      create: jest.fn(async () => root),
    };
    const reconciliationRuns = {
      findUnique: jest.fn(async ({
        where,
      }: {
        where: Record<string, unknown>;
      }) => {
        if (where.id === durableCutoverSessionId) return durableCutoverSessionRow();
        if (where.reportHash === persistedRun?.reportHash) return persistedRun;
        return null;
      }),
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => {
        persistedRun = { ...create };
        return create;
      }),
    };
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          canonicalUrl: 'https://legacy.example/events',
          targetKind: 'EVENT',
          status: 'ACTIVE',
          supplySourceId: root.id,
        }]),
      },
      candidates: { findMany: jest.fn(async () => []) },
      targets: { findMany: jest.fn(async () => []) },
      supplySources,
      transitions,
      reconciliationRuns,
    } as unknown as AffiliateSupplyDatabase;
    const dryRun = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    persistedRun = {
      mode: 'APPLY',
      status: 'APPLIED',
      reportJson: {
        ...dryRun.report,
        postApplyLegacySnapshotHash: dryRun.report.legacySnapshotHash,
        cutoverSessionId: durableCutoverSessionId,
        cutoverSessionHash: durableCutoverSessionHash,
      },
      inputHash: dryRun.inputHash,
      outputHash: dryRun.outputHash,
      reportHash: dryRun.reportHash,
      counts: dryRun.report.counts,
      failedInvariants: [],
      resolutionRefs: [],
      operatorId: 'operator-1',
      rolloutCohort: manifest.rolloutCohort,
      supplyContractVersion: manifest.version,
      supplyContractHash: manifest.supplyContract.hash,
      deploymentContractVersion: readyPreflight.deploymentContractVersion,
      deploymentContractHash: readyPreflight.deploymentContractHash,
      applyNonceHash: hashAffiliateAgentValue('nonce-1'),
      appliedAt: new Date('2026-08-25T12:00:00.000Z'),
      appliedBy: 'operator-1',
    };
    supplySources.update.mockClear();
    supplySources.create.mockClear();
    transitions.create.mockClear();
    reconciliationRuns.upsert.mockClear();
    return { database, dryRun };
  };

  it('rejects applied replay when the stored lifecycle assessment has invariant violations', async () => {
    const { database, dryRun } = await createReplayLifecycleFixture({
      invariantViolations: ['MAPPING_JOB_MAPPING_MISMATCH'],
    });
    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-26T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
      preflight: readyPreflight,
    })).rejects.toThrow('invariant violations');
    expect(database.supplySources.update).not.toHaveBeenCalled();
    expect(database.transitions.create).not.toHaveBeenCalled();
    expect(database.reconciliationRuns.upsert).not.toHaveBeenCalled();
  });

  it('rejects applied replay when a nonzero lifecycle generation has no transition history', async () => {
    const { database, dryRun } = await createReplayLifecycleFixture({
      lifecycleGeneration: 3,
    });
    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: new Date('2026-08-26T12:00:00.000Z'),
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
      preflight: readyPreflight,
    })).rejects.toThrow('missing transition history');
    expect(database.supplySources.update).not.toHaveBeenCalled();
    expect(database.transitions.create).not.toHaveBeenCalled();
    expect(database.reconciliationRuns.upsert).not.toHaveBeenCalled();
  });
  it('applies the reviewed report in one transaction and replays it idempotently', async () => {
    const now = new Date('2026-08-25T12:00:00.000Z');
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/events',
      resolvedCanonicalUrl: 'https://legacy.example/events',
      isRedirectVerified: true,
    });
    let root: Record<string, unknown> = {
      id: 'root-1',
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
      predecessorId: null,
      successorId: null,
      derivedStage: 'PRE_MAPPED',
      derivedOutcome: null,
      lifecycleGeneration: 0,
      isAutomationEnabled: false,
      targetKind: 'EVENT',
      rolloutCohort: 'DEFAULT',
      intakeId: null,
      liveSourceId: 'legacy-source',
      operatorDomain: 'legacy.example',
      metadata: null,
    };
    let source: Record<string, unknown> = {
      id: 'legacy-source',
      listUrl: 'https://legacy.example/events',
      canonicalUrl: 'https://legacy.example/events',
      targetKind: 'EVENT',
      status: 'ACTIVE',
      supplySourceId: 'root-1',
    };
    let candidate: Record<string, unknown> = {
      id: 'legacy-candidate',
      sourceId: 'legacy-source',
      listingKind: 'EVENT',
      status: 'PUBLISHED',
      publishedEventId: 'event-legacy',
      supplySourceId: null,
    };
    let target: Record<string, unknown> | null = {
      id: `canonical-public:${identity.identityKey}:EVENT:event-legacy`,
      sourceId: 'legacy-source',
      supplySourceId: 'root-1',
      candidateId: 'legacy-candidate',
      targetType: 'EVENT',
      targetId: 'event-legacy',
      marketKey: 'portland',
      sportId: 'soccer',
      sourceProfile: 'EVENT',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-22T10:00:00.000Z'),
      lastSuccessfulRefreshAt: new Date('2026-08-22T10:00:00.000Z'),
      freshnessExpiresAt: new Date('2026-08-23T10:00:00.000Z'),
      rejectedAt: null,
      rejectionReason: 'reviewed-target-rejection',
      evidenceRefs: ['reviewed-target-evidence'],
      evidenceHash: 'reviewed-target-hash',
      metadata: { reviewed: true, market: 'portland' },
    };
    let persistedRun: Record<string, unknown> | null = null;
    const emptyDelegate = () => ({
      findMany: jest.fn(async () => []),
    });
    let gatewayClaim: Record<string, unknown> = {
      id: 'gateway-claim-expired',
      supplySourceId: 'root-1',
      jobId: 'gateway-job',
      claimGeneration: 1,
      status: 'EXPIRED',
      leaseExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
      tokenExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
    };
    let gatewayClaimSnapshot = { ...gatewayClaim };
    const gatewayClaims = {
      findMany: jest.fn(async () => [gatewayClaimSnapshot]),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        gatewayClaim = { ...gatewayClaim, ...data };
        gatewayClaimSnapshot = { ...gatewayClaim };
        return { count: 1 };
      }),
    };
    let gatewayJob: Record<string, unknown> = {
      id: 'gateway-job',
      status: 'RETRY_WAIT',
      activeClaimId: null,
      claimGeneration: 1,
    };
    let gatewayJobSnapshot = { ...gatewayJob };
    const gatewayJobs = {
      findMany: jest.fn(async () => [gatewayJobSnapshot]),
      updateMany: jest.fn(async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (
          where.id === gatewayJob.id
          && where.status === gatewayJob.status
          && where.claimGeneration === gatewayJob.claimGeneration
          && (where.activeClaimId === undefined || where.activeClaimId === gatewayJob.activeClaimId)
        ) {
          gatewayJob = { ...gatewayJob, ...data };
          gatewayJobSnapshot = { ...gatewayJob };
        }
        return { count: 0 };
      }),
    };
    let mappingJob: Record<string, unknown> = {
      id: 'mapping-job',
      sourceId: 'legacy-source',
      status: 'CLAIMED',
      leaseExpiresAt: new Date('2026-08-25T11:00:00.000Z'),
    };
    const mappingJobs = {
      findMany: jest.fn(async () => [mappingJob]),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mappingJob = { ...mappingJob, ...data };
        return { count: 1 };
      }),
    };
    const sources = {
      findMany: jest.fn(async () => [source]),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        source = { ...source, ...data };
        return source;
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    };
    const candidates = {
      findMany: jest.fn(async () => [candidate]),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (candidate.supplySourceId !== null) return { count: 0 };
        candidate = { ...candidate, ...data };
        return { count: 1 };
      }),
    };
    const events = {
      findMany: jest.fn(async () => [{
        id: 'event-legacy',
        sourceId: 'legacy-candidate',
        sourceType: 'AFFILIATE_IMPORT',
      }]),
      updateMany: jest.fn(),
    };
    const targets = {
      findMany: jest.fn(async () => (target ? [target] : [])),
      upsert: jest.fn(async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        target = { ...(target ?? create), ...(target ? update : create) };
        return target;
      }),
    };
    const supplySources = {
      findMany: jest.fn(async () => [root]),
      findUnique: jest.fn(async () => root),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => root),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        root = { ...root, ...data };
        return root;
      }),
    };
    const transitionRows: Record<string, unknown>[] = [];
    const transitions = {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => transitionRows),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        transitionRows.push(data);
        return data;
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
    const reconciliationRuns = {
      findUnique: jest.fn(async ({
        where,
      }: {
        where: Record<string, unknown>;
      }) => {
        if (where.id === durableCutoverSessionId) return durableCutoverSessionRow();
        if (where.reportHash === persistedRun?.reportHash) return persistedRun;
        return null;
      }),
      upsert: jest.fn(async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const payload = persistedRun ? update : create;
        const appliedRow = payload.status === 'APPLIED'
          ? {
            mode: 'APPLY',
            failedInvariants: [],
            resolutionRefs: [],
          }
          : {};
        persistedRun = { ...(persistedRun ?? {}), ...payload, ...appliedRow };
        return payload;
      }),
    };
    let database: AffiliateSupplyDatabase;
    const transaction = jest.fn(async (callback: (transactionDatabase: AffiliateSupplyDatabase) => Promise<unknown>) => (
      callback(database)
    ));
    database = {
      sources,
      candidates,
      targets,
      supplySources,
      transitions,
      contractManifests,
      reconciliationRuns,
      intakes: emptyDelegate(),
      pages: emptyDelegate(),
      intakeRuns: emptyDelegate(),
      artifacts: emptyDelegate(),
      discoveryResults: emptyDelegate(),
      mappings: emptyDelegate(),
      runs: emptyDelegate(),
      mappingJobs,
      approvals: emptyDelegate(),
      gatewayClaims,
      coverageJobs: emptyDelegate(),
      gatewayJobs,
      campaigns: emptyDelegate(),
      organizations: emptyDelegate(),
      events,
      teams: emptyDelegate(),
      facilities: emptyDelegate(),
      workerHealth: emptyDelegate(),
      transaction,
    } as unknown as AffiliateSupplyDatabase;

    const dryRun = await reconcileLegacyAffiliateSupply({ db: database, now });
    expect(dryRun.report.roots[0].derivedStage).toBe('PRE_MAPPED');
    const changedManifest = buildAffiliateSupplyContractManifest({
      version: manifest.version + 1,
      rolloutCohort: manifest.rolloutCohort,
      supplyContract: {
        ...policy,
        version: manifest.version + 1,
        hash: undefined,
      },
      status: 'ACTIVE',
    });
    contractManifests.findFirst
      .mockResolvedValueOnce({
        status: 'ACTIVE',
        version: manifest.version,
        rolloutCohort: manifest.rolloutCohort,
        contractHash: manifest.hash,
        contractJson: manifest.supplyContract,
      })
      .mockResolvedValueOnce({
        status: 'ACTIVE',
        version: manifest.version,
        rolloutCohort: manifest.rolloutCohort,
        contractHash: manifest.hash,
        contractJson: manifest.supplyContract,
      })
      .mockResolvedValueOnce({
        status: 'ACTIVE',
        version: changedManifest.version,
        rolloutCohort: changedManifest.rolloutCohort,
        contractHash: changedManifest.hash,
        contractJson: changedManifest.supplyContract,
      });
    await expect(reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now,
      operatorId: 'operator-1',
      applyNonce: 'stale-contract',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      preflight: readyPreflight,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    })).rejects.toThrow('active Supply Contract changed before writes');
    expect(targets.upsert).not.toHaveBeenCalled();
    expect(transitions.create).not.toHaveBeenCalled();
    contractManifests.findFirst.mockResolvedValue({
      status: 'ACTIVE',
      version: manifest.version,
      rolloutCohort: manifest.rolloutCohort,
      contractHash: manifest.hash,
      contractJson: manifest.supplyContract,
    });

    const applied = await reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now,
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      preflight: readyPreflight,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    });
    expect(gatewayClaims.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'REVOKED',
        endedAt: now,
        tokenInvalidatedAt: now,
      }),
    }));
    const gatewayResetData = gatewayClaims.updateMany.mock.calls[0]?.[0]?.data;
    expect(gatewayResetData).not.toHaveProperty('leaseExpiresAt');
    expect(gatewayClaim.leaseExpiresAt).toEqual(new Date('2026-08-25T11:00:00.000Z'));
    const replayWithCurrentState = (replayNow: Date) => reconcileLegacyAffiliateSupply({
      db: database,
      isDryRun: false,
      now: replayNow,
      operatorId: 'operator-1',
      applyNonce: 'nonce-1',
      expectedReportHash: dryRun.reportHash,
      expectedInputHash: dryRun.inputHash,
      expectedCountsHash: hashAffiliateAgentValue(dryRun.report.counts),
      preflight: readyPreflight,
      cutoverSessionId: durableCutoverSessionId,
      cutoverSessionHash: durableCutoverSessionHash,
    });
    const replay = await replayWithCurrentState(new Date('2026-08-26T12:00:00.000Z'));
    expect(mappingJob.status).toBe('QUEUED');

    expect(dryRun.report.isApplySafe).toBe(true);
    expect(applied.isApplied).toBe(true);
    expect(replay.reportHash).toBe(applied.reportHash);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: 'Serializable',
        maxWait: 10_000,
        timeout: 120_000,
      }),
    );
    expect(candidates.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { supplySourceId: 'root-1' },
    }));
    expect(transitions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requestJson: expect.objectContaining({
          publicRecordIds: expect.arrayContaining(['event-legacy']),
        }),
      }),
    }));
    expect(targets.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        candidateId: 'legacy-candidate',
        marketKey: 'portland',
        sportId: 'soccer',
        sourceProfile: 'EVENT',
        publishedAt: '2026-08-22T10:00:00.000Z',
        lastSuccessfulRefreshAt: '2026-08-22T10:00:00.000Z',
        freshnessExpiresAt: '2026-08-23T10:00:00.000Z',
        rejectedAt: null,
        rejectionReason: 'reviewed-target-rejection',
        evidenceHash: 'reviewed-target-hash',
        evidenceRefs: expect.arrayContaining(['reviewed-target-evidence']),
        metadata: { reviewed: true, market: 'portland' },
        status: 'LAST_KNOWN_GOOD',
      }),
    }));
    expect(targets.upsert).toHaveBeenCalledTimes(1);
    expect(transitions.create).toHaveBeenCalledTimes(1);
    expect(reconciliationRuns.upsert).toHaveBeenCalledTimes(2);
    expect(reconciliationRuns.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        deploymentContractVersion: 2,
        deploymentContractHash: 'b'.repeat(64),
      }),
    }));
    expect(persistedRun?.reportJson).toEqual(expect.objectContaining({
      postApplyLegacySnapshotHash: expect.any(String),
    }));
    if (!target) throw new Error('Expected APPLY to persist a target before immutable-drift replay.');
    target = { ...target, status: 'EXPIRED' };
    await expect(replayWithCurrentState(new Date('2026-08-26T12:00:00.000Z')))
      .rejects.toThrow('snapshot changed after the report was applied');
    target = { ...target, status: 'LAST_KNOWN_GOOD' };

    gatewayClaim = { ...gatewayClaim, leaseExpiresAt: null };
    gatewayClaimSnapshot = { ...gatewayClaim };
    await expect(replayWithCurrentState(new Date('2026-08-26T12:00:00.000Z')))
      .rejects.toThrow('snapshot changed after the report was applied');
    gatewayClaim = { ...gatewayClaim, leaseExpiresAt: new Date('2026-08-25T11:00:00.000Z') };
    gatewayClaimSnapshot = { ...gatewayClaim };

    gatewayJob = { ...gatewayJob, status: 'COMPLETED' };
    gatewayJobSnapshot = { ...gatewayJob };
    await expect(replayWithCurrentState(new Date('2026-08-26T12:00:00.000Z')))
      .rejects.toThrow('snapshot changed after the report was applied');

    gatewayJob = { ...gatewayJob, status: 'QUEUED' };
    gatewayJobSnapshot = { ...gatewayJob };
    const originalSourceStatus = source.status;
    source = { ...source, status: 'REVIEW_REQUIRED' };
    await expect(replayWithCurrentState(new Date('2026-08-26T12:00:00.000Z')))
      .rejects.toThrow('snapshot changed after the report was applied');
    source = { ...source, status: originalSourceStatus };

    target = { ...target, metadata: { reviewed: true, market: 'metadata-mutated-after-apply' } };
    await expect(replayWithCurrentState(new Date('2026-08-26T12:00:00.000Z')))
      .rejects.toThrow('snapshot changed after the report was applied');
    target = { ...target, metadata: { reviewed: true, market: 'portland' } };

    target = { ...target, marketKey: 'market-mutated-after-apply' };
    await expect(replayWithCurrentState(new Date('2026-08-26T12:00:00.000Z')))
      .rejects.toThrow('snapshot changed after the report was applied');
  });


  it('projects every legacy public target as Last-Known-Good when evidence is missing', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

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

    expect(result.isDryRun).toBe(true);
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
  it('collects affiliate-backed organizations, events, teams, and facilities as public targets', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source',
          listUrl: 'https://legacy.example/events',
          organizationId: 'organization-1',
          targetKind: 'EVENT',
        }]),
      },
      candidates: {
        findMany: jest.fn(async () => [{
          id: 'candidate-1',
          sourceId: 'legacy-source',
          listingKind: 'EVENT',
          status: 'PUBLISHED',
          publishedEventId: 'event-1',
        }]),
      },
      organizations: {
        findMany: jest.fn(async () => [{
          id: 'organization-1',
          originType: 'AFFILIATE_IMPORTED',
        }]),
      },
      events: {
        findMany: jest.fn(async () => [{
          id: 'event-1',
          sourceId: 'candidate-1',
          sourceType: 'AFFILIATE_IMPORT',
        }]),
      },
      teams: {
        findMany: jest.fn(async () => [{
          id: 'team-1',
          sourceId: 'legacy-source',
          sourceType: 'AFFILIATE',
        }]),
      },
      facilities: {
        findMany: jest.fn(async () => [{
          id: 'facility-1',
          organizationId: 'organization-1',
          affiliateUrl: 'https://legacy.example/facility',
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(result.report.counts.recordsByKind).toEqual(expect.objectContaining({
      ORGANIZATION: 1,
      EVENT: 1,
      TEAM: 1,
      FACILITY: 1,
    }));
    expect(result.report.blockingFindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MISSING_LINEAGE',
        recordIds: expect.arrayContaining(['event-1']),
      }),
    ]));
    expect(result.rows[0].targetProjections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetType: 'ORGANIZATION',
        targetId: 'organization-1',
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
      expect.objectContaining({
        targetType: 'EVENT',
        targetId: 'event-1',
        candidateId: 'candidate-1',
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
      expect.objectContaining({
        targetType: 'TEAM',
        targetId: 'team-1',
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
      expect.objectContaining({
        targetType: 'FACILITY',
        targetId: 'facility-1',
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }),
    ]));
  });
  it('keeps the same public target projected once per source identity', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [
          { id: 'legacy-source-a', listUrl: 'https://legacy.example/a', targetKind: 'EVENT' },
          { id: 'legacy-source-b', listUrl: 'https://legacy.example/b', targetKind: 'EVENT' },
        ]),
      },
      candidates: {
        findMany: jest.fn(async () => [
          {
            id: 'candidate-a',
            sourceId: 'legacy-source-a',
            listingKind: 'EVENT',
            status: 'PUBLISHED',
            publishedEventId: 'event-shared',
          },
          {
            id: 'candidate-b',
            sourceId: 'legacy-source-b',
            listingKind: 'EVENT',
            status: 'PUBLISHED',
            publishedEventId: 'event-shared',
          },
        ]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({ db: database });
    const projections = result.rows.flatMap((row) => row.targetProjections);

    expect(result.rows).toHaveLength(2);
    expect(projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceTargetId: 'candidate-public:candidate-a:EVENT:event-shared',
        candidateId: 'candidate-a',
      }),
      expect.objectContaining({
        sourceTargetId: 'candidate-public:candidate-b:EVENT:event-shared',
        candidateId: 'candidate-b',
      }),
    ]));
  });
  it('blocks conflicting source identities without choosing a winner', async () => {
    const sourceRows = [
      {
        id: 'same-source',
        listUrl: 'https://legacy.example/a',
        targetKind: 'EVENT',
      },
      {
        id: 'same-source',
        listUrl: 'https://legacy.example/b',
        targetKind: 'EVENT',
      },
    ];
    const databaseFor = (rows: readonly Record<string, unknown>[]) => ({
      contractManifests: createActiveContractManifestDelegate(),

      sources: { findMany: jest.fn(async () => rows) },
      supplySources: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase);

    const first = await reconcileLegacyAffiliateSupply({
      db: databaseFor(sourceRows),
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    const second = await reconcileLegacyAffiliateSupply({
      db: databaseFor([...sourceRows].reverse()),
      now: new Date('2026-08-25T12:00:00.000Z'),
    });

    expect(second.report.inputHash).toBe(first.report.inputHash);
    expect(second.report.outputHash).toBe(first.report.outputHash);
    expect(second.report.reportHash).toBe(first.report.reportHash);
    expect(first.report.blockingFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SOURCE_IDENTITY_CONFLICT',
        recordIds: ['same-source'],
      }),
    ]));
  });
  it('preserves canonical event lineage for every publishing source root', async () => {
    const identityA = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/a',
      resolvedCanonicalUrl: 'https://legacy.example/a',
      isRedirectVerified: true,
    });
    const identityB = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/b',
      resolvedCanonicalUrl: 'https://legacy.example/b',
      isRedirectVerified: true,
    });
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [
          { id: 'legacy-source-a', listUrl: 'https://legacy.example/a', canonicalUrl: 'https://legacy.example/a', targetKind: 'EVENT' },
          { id: 'legacy-source-b', listUrl: 'https://legacy.example/b', canonicalUrl: 'https://legacy.example/b', targetKind: 'EVENT' },
        ]),
      },
      candidates: {
        findMany: jest.fn(async () => [
          {
            id: 'candidate-a',
            sourceId: 'legacy-source-a',
            listingKind: 'EVENT',
            status: 'PUBLISHED',
            publishedEventId: 'event-shared',
          },
          {
            id: 'candidate-b',
            sourceId: 'legacy-source-b',
            listingKind: 'EVENT',
            status: 'PUBLISHED',
            publishedEventId: 'event-shared',
          },
        ]),
      },
      events: {
        findMany: jest.fn(async () => [{
          id: 'event-shared',
          sourceId: 'candidate-a',
          sourceType: 'AFFILIATE_IMPORT',
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({ db: database });
    const projections = result.rows.flatMap((row) => row.targetProjections)
      .filter((projection) => projection.targetType === 'EVENT');
    const eventRecordIds = result.report.roots.flatMap((root) => root.recordIds)
      .filter((recordId) => recordId === 'event-shared');

    expect(eventRecordIds).toEqual(['event-shared', 'event-shared']);
    expect(projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceTargetId: `canonical-public:${identityA.identityKey}:EVENT:event-shared`,
        candidateId: 'candidate-a',
      }),
      expect.objectContaining({
        sourceTargetId: `canonical-public:${identityB.identityKey}:EVENT:event-shared`,
        candidateId: 'candidate-b',
      }),
    ]));
  });
  it('projects shared public entities once per resolved source root', async () => {
    const identityA = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/a',
      resolvedCanonicalUrl: 'https://legacy.example/a',
      isRedirectVerified: true,
    });
    const identityB = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/b',
      resolvedCanonicalUrl: 'https://legacy.example/b',
      isRedirectVerified: true,
    });
    const database = {
      contractManifests: createActiveContractManifestDelegate(),

      sources: {
        findMany: jest.fn(async () => [
          {
            id: 'legacy-source-a',
            listUrl: 'https://legacy.example/a',
            canonicalUrl: 'https://legacy.example/a',
            supplySourceId: 'root-a',
            organizationId: 'organization-shared',
            targetKind: 'EVENT',
          },
          {
            id: 'legacy-source-b',
            listUrl: 'https://legacy.example/b',
            canonicalUrl: 'https://legacy.example/b',
            supplySourceId: 'root-b',
            organizationId: 'organization-shared',
            targetKind: 'EVENT',
          },
        ]),
      },
      organizations: {
        findMany: jest.fn(async () => [{
          id: 'organization-shared',
          originType: 'AFFILIATE_IMPORTED',
        }]),
      },
      events: {
        findMany: jest.fn(async () => [{
          id: 'event-shared',
          organizationId: 'organization-shared',
          sourceType: 'AFFILIATE_IMPORT',
        }]),
      },
      teams: {
        findMany: jest.fn(async () => [{
          id: 'team-shared',
          organizationId: 'organization-shared',
          sourceType: 'AFFILIATE_IMPORT',
        }]),
      },
      facilities: {
        findMany: jest.fn(async () => [{
          id: 'facility-shared',
          organizationId: 'organization-shared',
          affiliateUrl: 'https://legacy.example/facility',
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: {
        findMany: jest.fn(async () => [
          {
            id: 'root-a',
            identityKey: identityA.identityKey,
            canonicalUrl: identityA.canonicalUrl,
            origin: identityA.origin,
            pathKey: identityA.pathKey,
          },
          {
            id: 'root-b',
            identityKey: identityB.identityKey,
            canonicalUrl: identityB.canonicalUrl,
            origin: identityB.origin,
            pathKey: identityB.pathKey,
          },
        ]),
      },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({ db: database });
    const projections = result.rows.flatMap((row) => row.targetProjections);
    const organizationProjections = projections.filter((projection) => projection.targetType === 'ORGANIZATION');
    const eventProjections = projections.filter((projection) => projection.targetType === 'EVENT');
    const teamProjections = projections.filter((projection) => projection.targetType === 'TEAM');
    const facilityProjections = projections.filter((projection) => projection.targetType === 'FACILITY');

    expect(result.rows).toHaveLength(2);
    expect(result.report.counts.recordsByKind.ORGANIZATION).toBe(2);
    expect(organizationProjections.map((projection) => projection.sourceTargetId).sort()).toEqual([
      `canonical-public:${identityA.identityKey}:ORGANIZATION:organization-shared`,
      `canonical-public:${identityB.identityKey}:ORGANIZATION:organization-shared`,
    ]);
    expect(facilityProjections.map((projection) => projection.sourceTargetId).sort()).toEqual([
      `canonical-public:${identityA.identityKey}:FACILITY:facility-shared`,
      `canonical-public:${identityB.identityKey}:FACILITY:facility-shared`,
    ]);
    expect(eventProjections.map((projection) => projection.sourceTargetId).sort()).toEqual([
      `canonical-public:${identityA.identityKey}:EVENT:event-shared`,
      `canonical-public:${identityB.identityKey}:EVENT:event-shared`,
    ]);
    expect(teamProjections.map((projection) => projection.sourceTargetId).sort()).toEqual([
      `canonical-public:${identityA.identityKey}:TEAM:team-shared`,
      `canonical-public:${identityB.identityKey}:TEAM:team-shared`,
    ]);
  });
  it('keeps canonical evidence IDs and target IDs stable after root creation', async () => {
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/stable',
      resolvedCanonicalUrl: 'https://legacy.example/stable',
      isRedirectVerified: true,
    });
    let source: Record<string, unknown> = {
      id: 'legacy-source-stable',
      listUrl: 'https://legacy.example/stable',
      canonicalUrl: 'https://legacy.example/stable',
      organizationId: 'organization-stable',
      targetKind: 'EVENT',
    };
    let roots: Record<string, unknown>[] = [];
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: { findMany: jest.fn(async () => [source]) },
      organizations: {
        findMany: jest.fn(async () => [{
          id: 'organization-stable',
          originType: 'AFFILIATE_IMPORTED',
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => roots) },
    } as unknown as AffiliateSupplyDatabase;

    const beforeRoot = await reconcileLegacyAffiliateSupply({ db: database });
    source = { ...source, supplySourceId: 'persisted-root' };
    roots = [{
      id: 'persisted-root',
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
    }];
    const afterRoot = await reconcileLegacyAffiliateSupply({ db: database });

    expect(beforeRoot.report.roots.flatMap((root) => root.recordIds)).toContain('organization-stable');
    expect(afterRoot.report.roots.flatMap((root) => root.recordIds)).toContain('organization-stable');
    expect(beforeRoot.report.roots.flatMap((root) => root.targetProjections.map((target) => target.sourceTargetId)))
      .toEqual(afterRoot.report.roots.flatMap((root) => root.targetProjections.map((target) => target.sourceTargetId)));
  });


  it('resolves discovery organization lineage before projecting facilities', async () => {
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      sources: {
        findMany: jest.fn(async () => [{
          id: 'legacy-source-discovery',
          listUrl: 'https://legacy.example/discovery',
          canonicalUrl: 'https://legacy.example/discovery',
          targetKind: 'EVENT',
        }]),
      },
      discoveryResults: {
        findMany: jest.fn(async () => [{
          id: 'discovery-result-1',
          matchingSourceId: 'legacy-source-discovery',
          matchingOrganizationId: 'organization-discovered',
        }]),
      },
      organizations: {
        findMany: jest.fn(async () => [{
          id: 'organization-discovered',
          originType: 'AFFILIATE_IMPORTED',
        }]),
      },
      facilities: {
        findMany: jest.fn(async () => [{
          id: 'facility-discovered',
          organizationId: 'organization-discovered',
          affiliateUrl: 'https://legacy.example/facility',
        }]),
      },
      targets: { findMany: jest.fn(async () => []) },
      supplySources: { findMany: jest.fn(async () => []) },
    } as unknown as AffiliateSupplyDatabase;

    const result = await reconcileLegacyAffiliateSupply({ db: database });
    const projections = result.rows.flatMap((row) => row.targetProjections);

    expect(result.report.blockingFindings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MISSING_LINEAGE',
        recordIds: expect.arrayContaining(['facility-discovered']),
      }),
    ]));
    expect(projections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        targetType: 'ORGANIZATION',
        targetId: 'organization-discovered',
      }),
      expect.objectContaining({
        targetType: 'FACILITY',
        targetId: 'facility-discovered',
      }),
    ]));
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

  it('persists rollback drill decisions bound to a durable cutover session', async () => {
    const reviewedLegacyProcessManifest = {
      schemaVersion: 1 as const,
      artifactId: 'reviewed-process-manifest-2026-08-25',
      processes: [
        { id: 'legacy-goal', processClass: 'GOAL' },
        { id: 'legacy-loop', processClass: 'MAPPING' },
      ],
      processCount: 2,
      manifestHash: reviewedLegacyProcessManifestHash,
      inventoryArtifactId: 'observed-process-inventory-2026-08-25',
      inventoryHash: rollbackProcessInventoryHash,
      inventoryCount: 7,
      reviewedAt: '2026-08-25T11:00:00.000Z',
      reviewedBy: 'reviewer-1',
      systemdUnits: rollbackSystemdUnits,
    };
    const processInventory = [
      {
        kind: 'LEGACY' as const,
        id: 'legacy-goal',
        processClass: 'GOAL',
        command: 'legacy-goal',
        status: 'STOPPED',
      },
      {
        kind: 'LEGACY' as const,
        id: 'legacy-loop',
        processClass: 'MAPPING',
        command: 'legacy-loop',
        status: 'STOPPED',
      },
      {
        kind: 'GOVERNED' as const,
        id: 'mapper-1',
        role: 'MAPPING_PRODUCER',
        workerId: 'mapping-1',
        command: 'affiliate:agent:supervisor',
        status: 'STOPPED',
      },
      {
        kind: 'GOVERNED' as const,
        id: 'mapper-2',
        role: 'MAPPING_PRODUCER',
        workerId: 'mapping-2',
        command: 'affiliate:agent:supervisor',
        status: 'STOPPED',
      },
      {
        kind: 'GOVERNED' as const,
        id: 'reviewer-1',
        role: 'SUPPLY_REVIEWER',
        workerId: 'reviewer-1',
        command: 'affiliate:agent:supervisor',
        status: 'STOPPED',
      },
      {
        kind: 'GOVERNED' as const,
        id: 'reviewer-2',
        role: 'SUPPLY_REVIEWER',
        workerId: 'reviewer-2',
        command: 'affiliate:agent:supervisor',
        status: 'STOPPED',
      },
      {
        kind: 'GOVERNED' as const,
        id: 'coverage-1',
        role: 'COVERAGE_PLANNER',
        workerId: 'coverage-1',
        command: 'affiliate:agent:supervisor',
        status: 'STOPPED',
      },
    ];
    const sessionPreimage = {
      schemaVersion: 1,
      kind: 'AFFILIATE_CUTOVER_SESSION',
      sessionId: 'session-1',
      rolloutCohort: 'DEFAULT',
      recordedStartAt: '2026-08-25T12:00:00.000Z',
      reviewedLegacyProcessManifest,
      reviewedLegacyProcessManifestHash,
      reviewedLegacyProcessManifestArtifactId: reviewedLegacyProcessManifest.artifactId,
      processInventory: canonicalRollbackProcessInventory(processInventory),
      legacyServiceUnits: rollbackLegacyServiceUnits,
      preflightReportHash: readyPreflight.reportHash,
      preflightReport: readyPreflight,
      deploymentContractVersion: readyPreflight.deploymentContractVersion,
      deploymentContractHash: readyPreflight.deploymentContractHash,
    };
    const sessionPayload = {
      ...sessionPreimage,
      sessionHash: hashAffiliateAgentValue(sessionPreimage),
    };
    const upsert = jest.fn(async ({ create }: { create: Record<string, unknown> }) => create);
    const findUnique = jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
      where.id === 'session-1'
        ? {
            id: 'session-1',
            createdAt: new Date('2026-08-25T12:00:00.000Z'),
            mode: 'CUTOVER_SESSION',
            status: 'READY',
            rolloutCohort: 'DEFAULT',
            deploymentContractVersion: readyPreflight.deploymentContractVersion,
            deploymentContractHash: readyPreflight.deploymentContractHash,
            reportJson: sessionPayload,
            reportHash: sessionPayload.sessionHash,
          }
        : null
    ));
    const emptyEvidenceDelegate = {
      findMany: jest.fn(async () => []),
    };
    const database = {
      reconciliationRuns: { findUnique, findMany: emptyEvidenceDelegate.findMany, upsert },
      gatewayReceipts: emptyEvidenceDelegate,
      transitions: emptyEvidenceDelegate,
      demands: emptyEvidenceDelegate,
      waves: emptyEvidenceDelegate,
      supplySources: emptyEvidenceDelegate,
      targets: emptyEvidenceDelegate,
      mappingJobs: emptyEvidenceDelegate,
      approvals: emptyEvidenceDelegate,
      intakeRuns: emptyEvidenceDelegate,
      discoveryRuns: emptyEvidenceDelegate,
      coverageJobs: emptyEvidenceDelegate,
      gatewayClaims: emptyEvidenceDelegate,
      gatewayJobs: emptyEvidenceDelegate,
    } as unknown as AffiliateSupplyDatabase;

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision.mode).toBe('BINARY_ROLLBACK_ALLOWED');
    expect(result.record?.reportHash).toHaveLength(64);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        mode: 'ROLLBACK_DRILL',
        status: 'BINARY_ROLLBACK_ALLOWED',
        deploymentContractVersion: readyPreflight.deploymentContractVersion,
        deploymentContractHash: readyPreflight.deploymentContractHash,
        inputHash: result.record?.inputHash,
        outputHash: result.record?.outputHash,
        reportHash: result.record?.reportHash,
        counts: {
          processInventory: 7,
          governedReceipts: 0,
          governedLifecycleTransitions: 0,
          governedDemandOrWaveEvents: 0,
          governedAuthoritativeWrites: 0,
        },
        reportJson: expect.objectContaining({
          kind: 'AFFILIATE_CUTOVER_ROLLBACK_DRILL',
          sessionId: 'session-1',
          preflightReportHash: readyPreflight.reportHash,
        }),
      }),
    }));
  });
  it('forces forward-only when an applied reconciliation crosses the boundary by appliedAt', async () => {
    const { database, findMany } = createRollbackDatabase({
      appliedRuns: [{
        id: 'applied-at-only-reconciliation',
        mode: 'APPLY',
        status: 'APPLIED',
        reportHash: 'a'.repeat(64),
        appliedAt: new Date('2026-08-25T12:01:00.000Z'),
        appliedBy: 'operator-1',
        createdAt: new Date('2026-08-25T11:59:00.000Z'),
        updatedAt: new Date('2026-08-25T11:59:00.000Z'),
      }],
    });

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision).toEqual(expect.objectContaining({
      mode: 'FORWARD_ONLY',
      reasonCode: 'FORWARD_ONLY_BOUNDARY_REACHED',
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'APPLIED',
        OR: expect.arrayContaining([{
          appliedAt: { gte: new Date('2026-08-25T12:00:00.000Z') },
        }]),
      }),
    }));
  });
  it('forces forward-only after an applied reconciliation or legacy claim mutation', async () => {
    const { database } = createRollbackDatabase({
      appliedRuns: [{
        id: 'applied-claim-only-reconciliation',
        mode: 'APPLY',
        status: 'APPLIED',
        reportHash: 'a'.repeat(64),
        appliedAt: new Date('2026-08-25T12:01:00.000Z'),
        appliedBy: 'operator-1',
        createdAt: new Date('2026-08-25T11:59:00.000Z'),
        updatedAt: new Date('2026-08-25T11:59:00.000Z'),
      }],
      gatewayClaims: [{
        id: 'legacy-gateway-claim',
        jobId: 'legacy-gateway-job',
        status: 'REVOKED',
        claimGeneration: 2,
        updatedAt: new Date('2026-08-25T12:02:00.000Z'),
      }],
      gatewayJobs: [{
        id: 'legacy-gateway-job',
        status: 'QUEUED',
        activeClaimId: null,
        claimGeneration: 2,
        updatedAt: new Date('2026-08-25T12:02:00.000Z'),
      }],
    });

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision).toEqual(expect.objectContaining({
      mode: 'FORWARD_ONLY',
      reasonCode: 'FORWARD_ONLY_BOUNDARY_REACHED',
    }));
  });
  it('uses the earliest durable cutover boundary across rollout cohorts', async () => {
    const contractSnapshot = {
      supplyContractVersion: manifest.version,
      supplyContractHash: manifest.supplyContract.hash,
      deploymentContractVersion: 2,
      deploymentContractHash: 'b'.repeat(64),
      gatewayVersion: 9,
      roleContractHashes: {
        COVERAGE_PLANNER: 'c'.repeat(64),
        MAPPING_PRODUCER: 'd'.repeat(64),
        SUPPLY_REVIEWER: 'e'.repeat(64),
        HUMAN_DIRECTED_EXECUTOR: 'f'.repeat(64),
      },
      promptTemplateHashes: {
        COVERAGE_PLANNER: '1'.repeat(64),
        MAPPING_PRODUCER: '2'.repeat(64),
        SUPPLY_REVIEWER: '3'.repeat(64),
        HUMAN_DIRECTED_EXECUTOR: '4'.repeat(64),
      },
    };
    const governedContainers = rollbackProcessInventory
      .filter((process) => process.kind === 'GOVERNED')
      .map((process) => ({
        id: process.id,
        user: '1001:1001',
        hasReadonlyRootFilesystem: true,
        privileged: false,
        environment: [
          'AFFILIATE_AGENT_GATEWAY_ADDRESS=http://gateway:8080',
          'AFFILIATE_AGENT_RUNNER_SOCKET=/workspaces/.runner.sock',
          'AFFILIATE_AGENT_WORKSPACE_SIGNING_KEY=redacted',
        ],
        networks: ['affiliate_gateway_internal'],
        isNetworkInternal: true,
        capDrop: ['ALL'],
        capAdd: [],
        groupAdd: [],
        securityOptions: ['no-new-privileges:true'],
      }));
    const preflightInput: AffiliateCutoverPreflightInput = {
      now: new Date('2026-08-25T12:00:00.000Z'),
      expected: contractSnapshot,
      observed: contractSnapshot,
      reviewedLegacyProcessManifest: rollbackReviewedManifest,
      processInventoryArtifactId: 'observed-process-inventory-2026-08-25',
      processInventoryHash: rollbackProcessInventoryHash,
      processInventoryCount: rollbackProcessInventory.length,
      processInventory: rollbackProcessInventory,
      controlPlaneProcesses: [
        { id: 'affiliate-gateway', status: 'STOPPED' },
        { id: 'affiliate-agent-runner', status: 'RUNNING' },
        { id: 'affiliate-agent-downstream-ready', status: 'COMPLETED' },
        { id: 'affiliate-replenishment-controller', status: 'STOPPED' },
      ],

      legacyServiceUnits: rollbackLegacyServiceUnits,
      legacyClaims: [],
      databasePermissions: {
        isAgentAllowedToConnectProductionDatabase: false,
        isAgentAllowedToWriteProductionDatabase: false,
        isAgentAllowedToReadObjectStorage: false,
        isAgentAllowedToWriteObjectStorage: false,
        isAgentAllowedToCallProviders: false,
        isGatewayAllowedToWriteProductionDatabase: true,
      },
      reviewedAgentNetwork: 'affiliate_gateway_internal',
      runnerContainer: {
        id: 'agent-runner',
        user: '0:0',
        hasReadonlyRootFilesystem: true,
        privileged: false,
        tmpfs: {
          '/tmp': 'rw,noexec,nosuid,nodev,size=256m,uid=0,gid=0,mode=0755',
          '/dev/shm': 'rw,noexec,nosuid,nodev,size=64m,uid=0,gid=0,mode=0755',
        },
        environment: ['AFFILIATE_AGENT_MODEL_CREDENTIAL=redacted'],
        networks: ['affiliate_gateway_internal'],
        isNetworkInternal: true,
        capDrop: ['ALL'],
        capAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL', 'SETGID', 'SETUID'],
        groupAdd: ['1001'],
        cgroupNamespace: 'private',
        cgroupMountWritable: true,
        cgroupRelativePath: 'affiliate-agent-runner',
        childUid: 1002,
        childGid: 1001,
        supervisorUid: 1001,
        securityOptions: ['no-new-privileges:true', 'writable-cgroups=true'],
        ipcMode: 'none',
      },
      containers: governedContainers,
      auxiliaryContainers: [
        {
          ...governedContainers[0],
          id: 'affiliate-agent-downstream-ready',
        },
        {
          ...governedContainers[0],
          id: 'affiliate-replenishment-controller',
          environment: [
            ...governedContainers[0].environment,
            'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN=redacted',
          ],
        },
      ],
    };
    const preflightReport = buildAffiliateCutoverPreflightReport(preflightInput);
    expect(preflightReport.isReady).toBe(true);
    const {
      database,
      demands,
      waves,
      supplySources,
    } = createRollbackDatabase({
      priorSessions: [{
        id: 'other-cohort-session',
        mode: 'CUTOVER_SESSION',
        rolloutCohort: 'OTHER',
        recordedStartAt: new Date('2026-08-25T11:00:00.000Z'),
      }],
      demands: [{
        id: 'demand-after-earliest-boundary',
        rolloutCohort: 'OTHER',
        createdAt: new Date('2026-08-25T11:30:00.000Z'),
      }],
      waves: [{
        id: 'wave-after-earliest-boundary',
        rolloutCohort: 'OTHER',
        createdAt: new Date('2026-08-25T11:30:00.000Z'),
      }],
      supplySources: [{
        id: 'source-after-earliest-boundary',
        rolloutCohort: 'OTHER',
        createdAt: new Date('2026-08-25T11:30:00.000Z'),
      }],
    });

    await expect(persistAffiliateCutoverSession({
      database,
      sessionId: 'new-session',
      rolloutCohort: 'DEFAULT',
      clock: () => new Date('2026-08-25T12:00:00.000Z'),
      reviewedLegacyProcessManifest: rollbackReviewedManifest,
      preflightInput,
      preflightReport,
    })).rejects.toThrow('cannot reset the rollback boundary');
    const expectedBoundary = new Date('2026-08-25T11:00:00.000Z');
    for (const delegate of [demands, waves, supplySources]) {
      expect(delegate.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{
            createdAt: { gte: expectedBoundary },
          }]),
        }),
      }));
      expect(delegate.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('rolloutCohort');
    }
    const {
      database: approvalOnlyDatabase,
      approvalJobs,
    } = createRollbackDatabase({
      approvalJobs: [{
        id: 'candidate-review-after-boundary',
        subjectType: 'MAPPING_PACKAGE',
        supplySourceId: 'root-1',
        subjectKey: 'candidate-1',
        status: 'REVIEW_REQUIRED',
        createdAt: new Date('2026-08-25T12:01:00.000Z'),
        updatedAt: new Date('2026-08-25T12:01:00.000Z'),
      }],
    });
    await expect(persistAffiliateCutoverSession({
      database: approvalOnlyDatabase,
      sessionId: 'approval-only-session',
      rolloutCohort: 'DEFAULT',
      clock: () => new Date('2026-08-25T12:00:00.000Z'),
      reviewedLegacyProcessManifest: rollbackReviewedManifest,
      preflightInput,
      preflightReport,
    })).rejects.toThrow('cannot reset the rollback boundary');
    expect(approvalJobs.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { createdAt: { gte: new Date('2026-08-25T12:00:00.000Z') } },
          { updatedAt: { gte: new Date('2026-08-25T12:00:00.000Z') } },
        ],
      },
    }));
    const {
      database: appliedAtOnlyDatabase,
      findMany: reconciliationRunsFindMany,
    } = createRollbackDatabase({
      appliedRuns: [{
        id: 'applied-at-only-session-boundary',
        mode: 'APPLY',
        status: 'APPLIED',
        reportHash: 'b'.repeat(64),
        appliedAt: new Date('2026-08-25T12:01:00.000Z'),
        appliedBy: 'operator-1',
        createdAt: new Date('2026-08-25T11:59:00.000Z'),
        updatedAt: new Date('2026-08-25T11:59:00.000Z'),
      }],
    });
    await expect(persistAffiliateCutoverSession({
      database: appliedAtOnlyDatabase,
      sessionId: 'applied-at-only-session',
      rolloutCohort: 'DEFAULT',
      clock: () => new Date('2026-08-25T12:00:00.000Z'),
      reviewedLegacyProcessManifest: rollbackReviewedManifest,
      preflightInput,
      preflightReport,
    })).rejects.toThrow('cannot reset the rollback boundary');
    expect(reconciliationRunsFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'APPLIED',
        OR: expect.arrayContaining([{
          appliedAt: { gte: new Date('2026-08-25T12:00:00.000Z') },
        }]),
      }),
    }));
    const omittedTableWrites = [
      {
        key: 'mappingJobs',
        row: { id: 'mapping-job-after-boundary', createdAt: new Date('2026-08-25T12:01:00.000Z') },
      },
      {
        key: 'intakeRuns',
        row: { id: 'intake-run-after-boundary', createdAt: new Date('2026-08-25T12:01:00.000Z') },
      },
      {
        key: 'discoveryRuns',
        row: { id: 'discovery-run-after-boundary', createdAt: new Date('2026-08-25T12:01:00.000Z') },
      },
      {
        key: 'coverageJobs',
        row: { id: 'coverage-job-after-boundary', updatedAt: new Date('2026-08-25T12:01:00.000Z') },
      },
      {
        key: 'gatewayClaims',
        row: { id: 'gateway-claim-after-boundary', updatedAt: new Date('2026-08-25T12:01:00.000Z') },
      },
      {
        key: 'gatewayJobs',
        row: { id: 'gateway-job-after-boundary', updatedAt: new Date('2026-08-25T12:01:00.000Z') },
      },
    ] as const;
    for (const { key, row } of omittedTableWrites) {
      const { database: omittedWriteDatabase } = createRollbackDatabase({
        [key]: [row],
      });
      await expect(persistAffiliateCutoverSession({
        database: omittedWriteDatabase,
        sessionId: `${key}-only-session`,
        rolloutCohort: 'DEFAULT',
        clock: () => new Date('2026-08-25T12:00:00.000Z'),
        reviewedLegacyProcessManifest: rollbackReviewedManifest,
        preflightInput,
        preflightReport,
      })).rejects.toThrow('cannot reset the rollback boundary');
    }
  });
  it('accepts Compose legacy processes without requiring systemd mappings', async () => {
    const mixedProcessInventory = [
      ...rollbackProcessInventory,
      {
        kind: 'LEGACY' as const,
        id: 'legacy-compose',
        processClass: 'MAPPING',
        command: 'docker compose run affiliate-mapper',
        status: 'STOPPED',
      },
    ];
    const mixedManifestProcesses = [
      ...rollbackReviewedManifest.processes,
      { id: 'legacy-compose', processClass: 'MAPPING' },
    ];
    const mixedManifest = {
      ...rollbackReviewedManifest,
      processes: mixedManifestProcesses,
      processCount: mixedManifestProcesses.length,
      manifestHash: hashAffiliateLegacyProcessManifest(
        mixedManifestProcesses,
        rollbackSystemdUnits,
      ),
      inventoryHash: hashAffiliateCutoverProcessInventory(mixedProcessInventory),
      inventoryCount: mixedProcessInventory.length,
    };
    const session = {
      sessionId: durableCutoverSessionId,
      rolloutCohort: 'DEFAULT',
      recordedStartAt: '2026-08-25T12:00:00.000Z',
      reviewedLegacyProcessManifest: mixedManifest,
      reviewedLegacyProcessManifestHash: mixedManifest.manifestHash,
      reviewedLegacyProcessManifestArtifactId: mixedManifest.artifactId,
      processInventory: mixedProcessInventory,
      legacyServiceUnits: rollbackLegacyServiceUnits,
      preflightReport: readyPreflight,
      preflightReportHash: readyPreflight.reportHash,
      deploymentContractVersion: readyPreflight.deploymentContractVersion,
      deploymentContractHash: readyPreflight.deploymentContractHash,
    } as Parameters<typeof readAffiliateCutoverRollbackEvidence>[1];
    const { database } = createRollbackDatabase();
    const evidence = await readAffiliateCutoverRollbackEvidence(
      database,
      session,
      {
        ...rollbackRuntimeProcessEvidence,
        processInventory: mixedProcessInventory,
      },
      new Date('2026-08-25T12:05:00.000Z'),
    );

    expect(evidence.isComplete).toBe(true);
    expect(evidence.invalidReasons).not.toContain(
      'current process evidence does not prove every reviewed legacy service and timer is disabled and inactive',
    );
  });
  it('blocks rollback while a governed control-plane process is still running', async () => {
    const { database } = createRollbackDatabase();
    const runtimeProcessEvidence = {
      ...rollbackRuntimeProcessEvidence,
      controlPlaneProcesses: [
        { id: 'affiliate-gateway', status: 'RUNNING' },
        { id: 'affiliate-agent-runner', status: 'STOPPED' },
        { id: 'affiliate-replenishment-controller', status: 'STOPPED' },
      ],
    };

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision).toEqual(expect.objectContaining({
      mode: 'BLOCKED',
      reasonCode: 'GOVERNED_FLEET_NOT_STOPPED',
    }));
  });
  it('blocks rollback while the replenishment controller is still running', async () => {
    const { database } = createRollbackDatabase();
    const runtimeProcessEvidence = {
      ...rollbackRuntimeProcessEvidence,
      controlPlaneProcesses: [
        { id: 'affiliate-gateway', status: 'STOPPED' },
        { id: 'affiliate-agent-runner', status: 'STOPPED' },
        { id: 'affiliate-replenishment-controller', status: 'RUNNING' },
      ],
    };

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision).toEqual(expect.objectContaining({
      mode: 'BLOCKED',
      reasonCode: 'GOVERNED_FLEET_NOT_STOPPED',
    }));
  });
  it('fails clearly when the durable rollback session is missing', async () => {
    const database = {
      reconciliationRuns: {
        findUnique: jest.fn(async () => null),
      },
    } as unknown as AffiliateSupplyDatabase;

    await expect(persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'missing-session',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      isDryRun: true,
    })).rejects.toThrow('session "missing-session" was not found');
  });

  it('forces forward-only when durable session process evidence is malformed', async () => {
    const { database, upsert } = createRollbackDatabase({
      sessionPayload: rollbackSessionPayloadFor({
        reviewedLegacyProcessManifest: {
          ...rollbackReviewedManifest,
          processes: [null],
          processCount: 1,
        },
      }),
    });

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision.mode).toBe('FORWARD_ONLY');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'FORWARD_ONLY' }),
    }));
  });

  it('forces forward-only when the durable session manifest hash is mismatched', async () => {
    const { database, upsert } = createRollbackDatabase({
      sessionPayload: rollbackSessionPayloadFor({
        reviewedLegacyProcessManifestHash: 'c'.repeat(64),
      }),
    });

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision.mode).toBe('FORWARD_ONLY');
    expect(result.record?.sessionId).toBe('session-1');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: 'FORWARD_ONLY',
        reportJson: expect.objectContaining({
          evidenceComplete: false,
          sessionId: 'session-1',
        }),
      }),
    }));
    expect(upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'BINARY_ROLLBACK_ALLOWED' }),
    }));
  });

  it('forces forward-only when the durable manifest inventory binding is mismatched', async () => {
    const { database, upsert } = createRollbackDatabase({
      sessionPayload: rollbackSessionPayloadFor({
        reviewedLegacyProcessManifest: {
          ...rollbackReviewedManifest,
          inventoryHash: 'd'.repeat(64),
        },
      }),
    });

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision.mode).toBe('FORWARD_ONLY');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'FORWARD_ONLY' }),
    }));
  });

  it('forces forward-only when any governed evidence is recorded after the session boundary', async () => {
    const receipt = {
      id: 'receipt-after-cutover',
      operationKind: 'CLAIM',
      status: 'COMPLETED',
      createdAt: new Date('2026-08-25T12:01:00.000Z'),
    };
    const { database, gatewayReceipts, upsert } = createRollbackDatabase({
      receipts: [receipt],
    });

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      now: new Date('2026-08-25T12:05:00.000Z'),
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision.mode).toBe('FORWARD_ONLY');
    expect(result.decision.reasonCode).toBe('FORWARD_ONLY_BOUNDARY_REACHED');
    expect(gatewayReceipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { createdAt: { gte: new Date('2026-08-25T12:00:00.000Z') } },
          { updatedAt: { gte: new Date('2026-08-25T12:00:00.000Z') } },
        ],
      },
    }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'FORWARD_ONLY' }),
    }));
  });
  it('treats evidence recorded exactly at the session boundary as governed activity', async () => {
    const receipt = {
      id: 'receipt-at-cutover',
      operationKind: 'CLAIM',
      status: 'COMPLETED',
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
      updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    };
    const { database, gatewayReceipts } = createRollbackDatabase({
      receipts: [receipt],
    });

    const result = await persistAffiliateCutoverRollbackDecision({
      database,
      sessionId: 'session-1',
      operatorId: 'operator-1',
      runtimeProcessEvidence: rollbackRuntimeProcessEvidence,
      clock: () => new Date('2026-08-25T12:05:00.000Z'),
    });

    expect(result.decision).toEqual(expect.objectContaining({
      mode: 'FORWARD_ONLY',
      reasonCode: 'FORWARD_ONLY_BOUNDARY_REACHED',
    }));
    expect(gatewayReceipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { createdAt: { gte: new Date('2026-08-25T12:00:00.000Z') } },
          { updatedAt: { gte: new Date('2026-08-25T12:00:00.000Z') } },
        ],
      },
    }));
  });
  it('retains the first persisted dry-run report when evaluation time changes', async () => {
    let persistedRun: Record<string, unknown> | null = null;
    const reconciliationRuns = {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => (
        persistedRun && where.reportHash === persistedRun.reportHash ? persistedRun : null
      )),
      upsert: jest.fn(async ({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        persistedRun = persistedRun
          ? { ...persistedRun, ...update }
          : { ...create };
        return persistedRun;
      }),
    };
    const emptyDelegate = {
      findMany: jest.fn(async () => []),
    };
    const database = {
      contractManifests: createActiveContractManifestDelegate(),
      reconciliationRuns,
      sources: emptyDelegate,
      intakes: emptyDelegate,
      pages: emptyDelegate,
      intakeRuns: emptyDelegate,
      artifacts: emptyDelegate,
      discoveryResults: emptyDelegate,
      mappings: emptyDelegate,
      runs: emptyDelegate,
      mappingJobs: emptyDelegate,
      approvals: emptyDelegate,
      candidates: emptyDelegate,
      discoveryRuns: emptyDelegate,
      coverageJobs: emptyDelegate,
      gatewayClaims: emptyDelegate,
      gatewayJobs: emptyDelegate,
      supplySources: emptyDelegate,
      targets: emptyDelegate,
      organizations: emptyDelegate,
      events: emptyDelegate,
      teams: emptyDelegate,
      facilities: emptyDelegate,
      campaigns: emptyDelegate,
    } as unknown as AffiliateSupplyDatabase;

    const first = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    const firstStoredReport = persistedRun?.reportJson;
    const second = await reconcileLegacyAffiliateSupply({
      db: database,
      now: new Date('2026-08-26T12:00:00.000Z'),
    });

    expect(second.reportHash).toBe(first.reportHash);
    expect(second.report.evaluatedAt).not.toBe(first.report.evaluatedAt);
    expect(persistedRun?.reportJson).toBe(firstStoredReport);
    expect(reconciliationRuns.upsert).toHaveBeenCalledTimes(2);
  });

  it('keeps published target projections only for live public canonical records', async () => {
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: 'https://legacy.example/events',
      resolvedCanonicalUrl: 'https://legacy.example/events',
      isRedirectVerified: true,
    });
    const targetDatabaseFor = (
      targetType: string,
      targetId: string,
      canonicalRows: Readonly<{
        organizations?: readonly Record<string, unknown>[];
        events?: readonly Record<string, unknown>[];
        teams?: readonly Record<string, unknown>[];
        facilities?: readonly Record<string, unknown>[];
      }> = {},
    ) => {
      const emptyDelegate = { findMany: jest.fn(async () => []) };
      return {
        contractManifests: createActiveContractManifestDelegate(),
        sources: {
          findMany: jest.fn(async () => [{
            id: 'source-1',
            listUrl: 'https://legacy.example/events',
            canonicalUrl: 'https://legacy.example/events',
            supplySourceId: 'root-1',
            targetKind: targetType,
          }]),
        },
        supplySources: {
          findMany: jest.fn(async () => [{
            id: 'root-1',
            identityKey: identity.identityKey,
            canonicalUrl: identity.canonicalUrl,
            origin: identity.origin,
            pathKey: identity.pathKey,
          }]),
        },
        targets: {
          findMany: jest.fn(async () => [{
            id: 'target-1',
            supplySourceId: 'root-1',
            targetType,
            targetId,
            status: 'PUBLISHED',
            evidenceRefs: ['legacy-target:target-1'],
          }]),
        },
        organizations: {
          findMany: jest.fn(async () => canonicalRows.organizations ?? []),
        },
        events: {
          findMany: jest.fn(async () => canonicalRows.events ?? []),
        },
        teams: {
          findMany: jest.fn(async () => canonicalRows.teams ?? []),
        },
        facilities: {
          findMany: jest.fn(async () => canonicalRows.facilities ?? []),
        },
        intakes: emptyDelegate,
        pages: emptyDelegate,
        intakeRuns: emptyDelegate,
        artifacts: emptyDelegate,
        discoveryResults: emptyDelegate,
        mappings: emptyDelegate,
        runs: emptyDelegate,
        mappingJobs: emptyDelegate,
        approvals: emptyDelegate,
        candidates: emptyDelegate,
        discoveryRuns: emptyDelegate,
        coverageJobs: emptyDelegate,
        gatewayClaims: emptyDelegate,
        gatewayJobs: emptyDelegate,
        campaigns: emptyDelegate,
      } as unknown as AffiliateSupplyDatabase;
    };
    const missingCases = [
      ['EVENT', 'event-missing'],
      ['TEAM', 'team-missing'],
      ['FACILITY', 'facility-missing'],
      ['ORGANIZATION', 'organization-missing'],
    ] as const;

    for (const [targetType, targetId] of missingCases) {
      const result = await reconcileLegacyAffiliateSupply({
        db: targetDatabaseFor(targetType, targetId),
        now: new Date('2026-08-25T12:00:00.000Z'),
      });
      const projection = result.report.roots.flatMap((root) => root.targetProjections)
        .find((target) => target.targetId === targetId);

      expect(projection).toEqual(expect.objectContaining({
        status: 'LAST_KNOWN_GOOD',
        action: 'MARK_LAST_KNOWN_GOOD',
      }));
      expect(result.report.roots.flatMap((root) => root.targetProjections)
        .filter((target) => target.status === 'PUBLISHED')).toHaveLength(0);
    }

    const liveEvent = await reconcileLegacyAffiliateSupply({
      db: targetDatabaseFor('EVENT', 'event-live', {
        events: [{ id: 'event-live', state: 'PUBLISHED', archivedAt: null }],
      }),
      now: new Date('2026-08-25T12:00:00.000Z'),
    });
    expect(liveEvent.report.roots.flatMap((root) => root.targetProjections))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          targetId: 'event-live',
          status: 'PUBLISHED',
          action: 'PRESERVE_PUBLIC_TARGET',
        }),
      ]));
    const liveCases = [
      ['TEAM', 'team-live', { teams: [{ id: 'team-live', visibility: 'PUBLIC', archivedAt: null }] }],
      ['FACILITY', 'facility-live', { facilities: [{ id: 'facility-live', status: 'ACTIVE' }] }],
      ['ORGANIZATION', 'organization-live', {
        organizations: [{ id: 'organization-live', status: 'LISTED', publicPageEnabled: true }],
      }],
    ] as const;
    for (const [targetType, targetId, canonicalRows] of liveCases) {
      const result = await reconcileLegacyAffiliateSupply({
        db: targetDatabaseFor(targetType, targetId, canonicalRows),
        now: new Date('2026-08-25T12:00:00.000Z'),
      });
      expect(result.report.roots.flatMap((root) => root.targetProjections))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({
            targetId,
            status: 'PUBLISHED',
            action: 'PRESERVE_PUBLIC_TARGET',
          }),
        ]));
    }
  });

  it('rejects lifecycle commands before writes when no transaction capability is available', async () => {
    const sourceUpdate = jest.fn();
    const targetUpsert = jest.fn();
    const targetWriter = jest.fn();
    const database = {
      sources: { update: sourceUpdate },
      targets: { upsert: targetUpsert },
    } as unknown as AffiliateSupplyDatabase;

    await expect(executeAffiliateSupplyLifecycleCommand({
      supplySourceId: 'supply-source-1',
      command: 'PUBLISH_TARGET',
      authority: 'HUMAN_DIRECTED_EXECUTOR',
      expectedLifecycleGeneration: 0,
      idempotencyKey: 'publish-without-transaction',
      actorKind: 'HUMAN_DIRECTED_EXECUTOR',
      actorId: 'operator-1',
      targetWriter,
      db: database,
      now: new Date('2026-08-25T12:00:00.000Z'),
    })).rejects.toThrow('require a database transaction');
    expect(sourceUpdate).not.toHaveBeenCalled();
    expect(targetUpsert).not.toHaveBeenCalled();
    expect(targetWriter).not.toHaveBeenCalled();
  });

});
