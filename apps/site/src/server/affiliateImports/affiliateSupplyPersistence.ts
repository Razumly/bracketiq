import { Prisma } from '@/generated/prisma/client';
import type {
  AffiliateScrapeSources,
  AffiliateScrapeMappings,
  AffiliateScrapeRuns,
  AffiliateSourceIntakes,
  AffiliateSourceIntakePages,
  AffiliateSourceIntakeRuns,
  AffiliateSourceIntakeArtifacts,
  AffiliateSourceDiscoveryResults,
  AffiliateSourceDiscoveryRuns,
  AffiliateSourceMappingJobs,
  AffiliateApprovalJobs,
  AffiliateImportCandidates,
  AffiliateAgentGatewayClaims,
  AffiliateAgentGatewayJobs,
  AffiliateCoverageAgentJobs,
  AffiliateSupplySources,
  AffiliateSupplyTargets,
  AffiliateSupplyLifecycleTransitions,
  AffiliateReplenishmentDemands,
  AffiliateReplenishmentWaves,
  AffiliateSupplyReconciliationRuns,
  AffiliateSupplyContractManifests,
  Organizations,
  Events,
  CanonicalTeams,
  Facilities,
  PrismaClient,
  AffiliateAgentWorkerHealth,
} from '@/generated/prisma/client';
import { createId } from '@/lib/id';
import { prisma } from '@/lib/prisma';
import {
  AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY,
  parseAffiliateAutomationBaseline,
} from './automationBaseline';
import {
  AFFILIATE_REPLENISHMENT_PRIORITY,
  affiliateSupplyContractManifestSchema,
  buildAffiliateSupplyContractImpactReport,
  deriveAffiliateSupplyAssessment,
  mappingPackageValid,
  normalizeAffiliateSupplyContractPolicy,
  normalizeAffiliateSupplyIdentity,
  planAffiliateReplenishment,
  targetRuleFor,
  validateAffiliateSupplyCommand,
  targetRulesFor,
  type AffiliateReplenishmentDemandEvidence,
  type AffiliateReplenishmentPlan,
  type AffiliateSupplyAssessment,
  type AffiliateSupplyCommandAuthority,
  type AffiliateSupplyContractImpactCell,
  type AffiliateSupplyContractImpactSource,
  type AffiliateSupplyContractManifest,
  type AffiliateSupplyContractPolicy,
  type AffiliateSupplyEvidenceSnapshot,
  type AffiliateSupplyFreshnessStatus,
  type AffiliateSupplyIdentity,
  type AffiliateSupplyLifecycleActorKind,
  type AffiliateSupplyLifecycleCommand,
  type AffiliateSupplyLifecycleOutcome,
  type AffiliateSupplyLifecycleStage,
  AFFILIATE_SUPPLY_LIFECYCLE_STAGES,
  AFFILIATE_SUPPLY_OUTCOMES,
  AFFILIATE_SUPPLY_REVIEWER_RECONCILE_OUTCOMES,

} from './affiliateSupplyLifecycle';
import {
  AFFILIATE_GOVERNED_CONTROL_PLANE_IDS,
  buildAffiliateCutoverPreflightReport,
  buildAffiliateCutoverRollbackInput,
  buildAffiliateLegacyReconciliationReport,
  decideAffiliateCutoverRollback,
  hashAffiliateCutoverProcessInventory,
  hashAffiliateLegacyProcessManifest,
  isAffiliateCutoverPreflightApplySafe,
  isAffiliateCutoverPreflightReportIntact,
  isAffiliateCutoverPreflightFresh,
  type AffiliateCutoverFinding,
  type AffiliateCutoverPreflightInput,
  type AffiliateCutoverPreflightReport,
  type AffiliateCutoverProcessRecord,
  type AffiliateCutoverRollbackInput,
  type AffiliateCutoverRollbackDecision,
  type AffiliateCutoverRollbackEvidenceInput,
  type AffiliateLegacyClaimAction,
  type AffiliateLegacyClaimEvidence,
  type AffiliateLegacyLineageRecord,
  type AffiliateLegacyProcessManifest,
  type AffiliateLegacyRecordKind,
  type AffiliateLegacyReconciliationInput,
  type AffiliateLegacyReconciliationReport,
  type AffiliateLegacyRootEvidence,
  type AffiliateLegacySourceEvidence,
  type AffiliateLegacyTargetEvidence,
  type AffiliateLegacyTargetProjection,
} from './affiliateFleetCutover';
import type {
  AffiliateAgentActiveContractRegistry,
  AffiliateAgentLifecycleAuthority,
} from './agentGatewayAdapters';
import { canonicalizeAffiliateAgentValue, hashAffiliateAgentValue } from './agentGatewayContracts';
import {
  affiliateDiscoveryPolicyKeyForUrl,
  affiliateDiscoveryUrlKey,
} from './sourceDiscoveryRules';
import { affiliateScrapeMappingSchema } from './types';
import {
  emitAffiliateOperationalAlerts,
  type AffiliateOperationalAlertInput,
} from './affiliateOperationalAlerts';
const upper = (value: unknown): string => String(value ?? '').trim().toUpperCase();
const codeUnitCompare = (left: string, right: string): number => (
  left === right ? 0 : left < right ? -1 : 1
);
const AFFILIATE_RECONCILIATION_QUERY_BATCH_SIZE = 500;
const chunksOf = <T>(
  values: readonly T[],
  size: number,
): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};
export type AffiliateSupplyClient = PrismaClient | Prisma.TransactionClient;
export type AffiliateSupplyOperationalAlertWriter = (
  inputs: readonly AffiliateOperationalAlertInput[],
) => Promise<void>;
type AffiliateSupplyDelegate<Name extends keyof PrismaClient> = PrismaClient[Name];
type AffiliateSupplyDemandSourceRow = Pick<
  AffiliateSupplySources,
  'id' | 'isExcluded' | 'derivedOutcome' | 'derivedStage' | 'repairPriority' | 'targetKind' | 'metadata'
>;
type AffiliateSupplyContractImpactSourceRow = Pick<
  AffiliateSupplySources,
  'id' | 'derivedStage' | 'targetContribution' | 'isAutomationEnabled' | 'repairPriority' | 'freshnessStatus'
>;
type AffiliateSupplyContractImpactTargetRow = Pick<
  AffiliateSupplyTargets,
  'supplySourceId' | 'marketKey' | 'sportId' | 'sourceProfile'
>;
type AffiliateSupplyDemandTargetRow = Pick<
  AffiliateSupplyTargets,
  'supplySourceId' | 'marketKey' | 'sportId' | 'sourceProfile' | 'status'
  | 'rejectedAt' | 'freshnessExpiresAt' | 'lastSuccessfulRefreshAt' | 'metadata'
>;
type AffiliateSupplyLegacyCandidateRow = Pick<
  AffiliateImportCandidates,
  'id' | 'sourceId' | 'listingKind' | 'status'
  | 'publishedEventId' | 'publishedTeamId' | 'publishedFacilityId' | 'publishedOrganizationId'
>;
type AffiliateLegacySupplyTargetRow = Pick<
  AffiliateSupplyTargets,
  'id' | 'candidateId' | 'supplySourceId' | 'targetType' | 'targetId'
    | 'marketKey' | 'sportId' | 'sourceProfile'
    | 'publishedAt' | 'lastSuccessfulRefreshAt' | 'freshnessExpiresAt' | 'rejectedAt'
    | 'rejectionReason' | 'metadata' | 'evidenceRefs' | 'evidenceHash' | 'status'
> & Readonly<{
  sourceId?: string | null;
}>;
type AffiliateReplenishmentDemandResultRow = Readonly<{
  id: string;
  targetKey: string;
  marketKey: string;
  sportId: string;
  sourceProfile: string;
  rolloutCohort: string;
  contractVersion: number;
  contractHash: string;
  minimumFreshPublishedSupply: number;
  observedFreshPublishedSupply: number;
  priority: number;
  status: 'OPEN' | 'CLOSED' | 'PAUSED';
  openedAt: Date;
  closedAt: Date | null;
  nextEligibleAt: Date | null;
  searchSaturatedUntil: Date | null;
  activeWaveId: string | null;
  generation: number;
  reasonCodes: readonly string[];
  evidenceJson: unknown;
}>;

export type AffiliateSupplyDatabase = Readonly<{
  supplySources: AffiliateSupplyDelegate<'affiliateSupplySources'>;
  contractManifests: AffiliateSupplyDelegate<'affiliateSupplyContractManifests'>;
  transitions: AffiliateSupplyDelegate<'affiliateSupplyLifecycleTransitions'>;
  reconciliationRuns: AffiliateSupplyDelegate<'affiliateSupplyReconciliationRuns'>;
  targets: AffiliateSupplyDelegate<'affiliateSupplyTargets'>;
  demands: AffiliateSupplyDelegate<'affiliateReplenishmentDemands'>;
  waves: AffiliateSupplyDelegate<'affiliateReplenishmentWaves'>;
  sources: AffiliateSupplyDelegate<'affiliateScrapeSources'>;
  organizations: AffiliateSupplyDelegate<'organizations'>;
  events: AffiliateSupplyDelegate<'events'>;
  teams: AffiliateSupplyDelegate<'canonicalTeams'>;
  facilities: AffiliateSupplyDelegate<'facilities'>;
  mappings: AffiliateSupplyDelegate<'affiliateScrapeMappings'>;
  runs: AffiliateSupplyDelegate<'affiliateScrapeRuns'>;
  intakes: AffiliateSupplyDelegate<'affiliateSourceIntakes'>;
  pages: AffiliateSupplyDelegate<'affiliateSourceIntakePages'>;
  intakeRuns: AffiliateSupplyDelegate<'affiliateSourceIntakeRuns'>;
  artifacts: AffiliateSupplyDelegate<'affiliateSourceIntakeArtifacts'>;
  discoveryRuns: AffiliateSupplyDelegate<'affiliateSourceDiscoveryRuns'>;
  discoveryResults: AffiliateSupplyDelegate<'affiliateSourceDiscoveryResults'>;
  mappingJobs: AffiliateSupplyDelegate<'affiliateSourceMappingJobs'>;
  approvals: AffiliateSupplyDelegate<'affiliateApprovalJobs'>;
  candidates: AffiliateSupplyDelegate<'affiliateImportCandidates'>;
  gatewayReceipts?: AffiliateSupplyDelegate<'affiliateAgentGatewayOperationReceipts'>;
  gatewayEvents?: AffiliateSupplyDelegate<'affiliateAgentGatewayEvents'>;
  gatewayClaims: AffiliateSupplyDelegate<'affiliateAgentGatewayClaims'>;
  gatewayJobs: AffiliateSupplyDelegate<'affiliateAgentGatewayJobs'>;
  coverageJobs?: Prisma.AffiliateCoverageAgentJobsDelegate;
  campaigns: AffiliateSupplyDelegate<'affiliateSourceDiscoveryCampaigns'>;
  workerHealth: AffiliateSupplyDelegate<'affiliateAgentWorkerHealth'>;
  rawClient?: AffiliateSupplyClient;
  transaction?: (
    callback: (transactionDatabase: AffiliateSupplyDatabase) => Promise<unknown>,
    options?: unknown,
  ) => Promise<unknown>;
}>;
const affiliateSupplyExistingTransaction = Symbol('affiliateSupplyExistingTransaction');
type AffiliateSupplyDatabaseWithTransactionState = AffiliateSupplyDatabase & {
  readonly [affiliateSupplyExistingTransaction]?: boolean;
};

const affiliateSupplyClientHasNestedTransaction = (
  client: AffiliateSupplyClient,
): boolean => (
  typeof client === 'object'
  && client !== null
  && '$transaction' in client
  && typeof client.$transaction === 'function'
);

const affiliateSupplyDatabaseHasExistingTransaction = (
  database: AffiliateSupplyDatabase,
): boolean => (
  (database as AffiliateSupplyDatabaseWithTransactionState)[affiliateSupplyExistingTransaction] === true
);

type AffiliateSupplyTransactionResolution = Readonly<{
  execute: AffiliateSupplyTransaction;
  joinsExistingTransaction: boolean;
}>;


const supplyDatabaseForClient = (client: AffiliateSupplyClient): AffiliateSupplyDatabase => {
  const modelNames = {
    supplySources: 'affiliateSupplySources',
    contractManifests: 'affiliateSupplyContractManifests',
    transitions: 'affiliateSupplyLifecycleTransitions',
    reconciliationRuns: 'affiliateSupplyReconciliationRuns',
    gatewayReceipts: 'affiliateAgentGatewayOperationReceipts',
    targets: 'affiliateSupplyTargets',
    demands: 'affiliateReplenishmentDemands',
    waves: 'affiliateReplenishmentWaves',
    sources: 'affiliateScrapeSources',
    organizations: 'organizations',
    events: 'events',
    teams: 'canonicalTeams',
    facilities: 'facilities',
    mappings: 'affiliateScrapeMappings',
    runs: 'affiliateScrapeRuns',
    intakes: 'affiliateSourceIntakes',
    pages: 'affiliateSourceIntakePages',
    intakeRuns: 'affiliateSourceIntakeRuns',
    artifacts: 'affiliateSourceIntakeArtifacts',
    discoveryRuns: 'affiliateSourceDiscoveryRuns',
    discoveryResults: 'affiliateSourceDiscoveryResults',
    mappingJobs: 'affiliateSourceMappingJobs',
    approvals: 'affiliateApprovalJobs',
    candidates: 'affiliateImportCandidates',
    gatewayClaims: 'affiliateAgentGatewayClaims',
    gatewayJobs: 'affiliateAgentGatewayJobs',
    gatewayEvents: 'affiliateAgentGatewayEvents',
    coverageJobs: 'affiliateCoverageAgentJobs',
    campaigns: 'affiliateSourceDiscoveryCampaigns',
    workerHealth: 'affiliateAgentWorkerHealth',
  } as const;

  const modelClient = client as unknown as Record<string, unknown>;
  return Object.defineProperties({}, Object.fromEntries(
    Object.entries(modelNames).map(([name, modelName]) => [
      name,
      {
        enumerable: true,
        get: () => modelClient[modelName],
      },
    ]),
  )) as AffiliateSupplyDatabase;
};
export const affiliateSupplyDatabase = (
  client: AffiliateSupplyClient = prisma,
): AffiliateSupplyDatabase => {
  const database = supplyDatabaseForClient(client);
  Object.defineProperty(database, 'rawClient', {
    enumerable: false,
    value: client,
  });
  Object.defineProperty(database, affiliateSupplyExistingTransaction, {
    enumerable: false,
    value: !affiliateSupplyClientHasNestedTransaction(client),
  });
  Object.defineProperty(database, 'transaction', {
    enumerable: true,
    get: () => {
      const transaction = (client as unknown as {
        $transaction?: (
          callback: (transactionClient: AffiliateSupplyClient) => Promise<unknown>,
          options?: unknown,
        ) => Promise<unknown>;
      }).$transaction;
      return typeof transaction === 'function'
        ? (callback: (database: AffiliateSupplyDatabase) => Promise<unknown>, options: unknown) => transaction.call(
          client,
          (transactionClient) => callback(affiliateSupplyDatabase(transactionClient)),
          options,
        )
        : undefined;
    },
  });
  return database;
};

export type AffiliateAgentWorkerHeartbeatInput = Readonly<{
  workerId: string;
  role: string;
  status?: string;
  now?: Date;
  leaseExpiresAt?: Date;
  leaseDurationMs?: number;
  metadata?: Record<string, unknown> | null;
}>;

type PreparedAffiliateAgentWorkerHeartbeat = Readonly<{
  workerId: string;
  role: string;
  status: string;
  now: Date;
  leaseExpiresAt: Date;
}>;

const prepareAffiliateAgentWorkerHeartbeat = (
  input: AffiliateAgentWorkerHeartbeatInput,
): PreparedAffiliateAgentWorkerHeartbeat => {
  const workerId = input.workerId.trim();
  const role = input.role.trim().toUpperCase();
  if (!workerId || !role) throw new Error('Affiliate worker heartbeats require a worker ID and role.');
  const now = input.now ?? new Date();
  const leaseExpiresAt = input.leaseExpiresAt ?? new Date(
    now.getTime() + Math.max(15_000, input.leaseDurationMs ?? 90_000),
  );
  return {
    workerId,
    role,
    status: input.status?.trim().toUpperCase() || 'HEALTHY',
    now,
    leaseExpiresAt,
  };
};

export const recordAffiliateAgentWorkerHeartbeat = async (
  input: AffiliateAgentWorkerHeartbeatInput,
  database: AffiliateSupplyDatabase = affiliateSupplyDatabase(),
): Promise<AffiliateAgentWorkerHealth | null> => {
  if (!database.workerHealth?.upsert) return null;
  const heartbeat = prepareAffiliateAgentWorkerHeartbeat(input);
  return database.workerHealth.upsert({
    where: { workerId_role: { workerId: heartbeat.workerId, role: heartbeat.role } },
    create: {
      id: createId(),
      workerId: heartbeat.workerId,
      role: heartbeat.role,
      status: heartbeat.status,
      heartbeatAt: heartbeat.now,
      leaseExpiresAt: heartbeat.leaseExpiresAt,
      metadata: prismaNullableJsonValue(input.metadata),
    },
    update: {
      status: heartbeat.status,
      heartbeatAt: heartbeat.now,
      leaseExpiresAt: heartbeat.leaseExpiresAt,
      metadata: input.metadata == null ? undefined : prismaJsonValue(input.metadata),
    },
  });
};

type AffiliateSupplyPrismaTransactionOptions = Readonly<{
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}>;

type AffiliateSupplyTransactionOptions = Readonly<{
  requireTransaction?: boolean;
  prisma?: AffiliateSupplyPrismaTransactionOptions;
}>;

const AFFILIATE_SUPPLY_APPLY_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
  isolationLevel: 'Serializable' as const,
};

type AffiliateSupplyTransaction = (
  callback: (transactionDatabase: AffiliateSupplyDatabase) => Promise<unknown>,
  options: unknown,
) => Promise<unknown>;

type AffiliateSupplyRawTransactionalClient = AffiliateSupplyClient & {
  $transaction?: (
    callback: (transactionClient: AffiliateSupplyClient) => Promise<unknown>,
    options?: unknown,
  ) => Promise<unknown>;
};

const transactionForSupplyDatabase = (
  database: AffiliateSupplyDatabase,
): AffiliateSupplyTransactionResolution | undefined => {
  if (affiliateSupplyDatabaseHasExistingTransaction(database)) {
    return {
      execute: (callback) => callback(database),
      joinsExistingTransaction: true,
    };
  }
  const databaseTransaction = database.transaction;
  if (typeof databaseTransaction === 'function') {
    return {
      execute: (callback, options) => databaseTransaction(callback, options),
      joinsExistingTransaction: false,
    };
  }
  const rawClient = database.rawClient;
  if (!rawClient) return undefined;
  if (!affiliateSupplyClientHasNestedTransaction(rawClient)) return undefined;
  const transaction = rawClient.$transaction;
  if (typeof transaction !== 'function') return undefined;
  return {
    execute: (callback, options) => transaction.call(
      rawClient,
      (transactionClient) => callback(affiliateSupplyDatabase(transactionClient)),
      options as AffiliateSupplyPrismaTransactionOptions,
    ),
    joinsExistingTransaction: false,
  };
};

const transactionErrorCode = (error: unknown): string => (
  error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
);

const withSupplyTransaction = async <T>(
  database: AffiliateSupplyDatabase,
  callback: (transactionDatabase: AffiliateSupplyDatabase) => Promise<T>,
  options: AffiliateSupplyTransactionOptions = {},
): Promise<T> => {
  let attempt = 0;
  const transaction = transactionForSupplyDatabase(database);
  while (true) {
    try {
      if (transaction) {
        return await transaction.execute(callback, {
          isolationLevel: 'Serializable',
          ...options.prisma,
        }) as T;
      }
      if (options.requireTransaction) {
        throw new Error('Affiliate Supply writes require a database transaction.');
      }
      return await callback(database);
    } catch (error) {
      if (
        transaction?.joinsExistingTransaction
        || !['P2002', 'P2034'].includes(transactionErrorCode(error))
        || attempt >= 2
      ) throw error;
      attempt += 1;
    }
  }
};

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const prismaJsonValue = (value: unknown): Prisma.InputJsonValue => (
  value as Prisma.InputJsonValue
);
const prismaNullableJsonValue = (
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue => (
  value == null ? Prisma.JsonNull : prismaJsonValue(value)
);
const normalizeAffiliateLifecycleJson = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => (
      entry === undefined ? null : normalizeAffiliateLifecycleJson(entry)
    ));
  }
  if (!value || typeof value !== 'object') return value;
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Affiliate lifecycle values must use plain JSON objects.');
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, normalizeAffiliateLifecycleJson(entry)]),
  );
};

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
);

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSuccessStatus = (value: unknown): boolean => (
  ['SUCCEEDED', 'SUCCESS', 'COMPLETED'].includes(String(value ?? '').toUpperCase())
);

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002')
);

const currentSupplySource = async (
  database: AffiliateSupplyDatabase,
  supplySourceId: string,
) => database.supplySources.findUnique({ where: { id: supplySourceId } });

const linkSupplySource = async (
  model: {
    update?: (args: {
      where: { id: string };
      data: { supplySourceId: string };
    }) => Promise<unknown>;
    updateMany?: (args: {
      where: { id: string; supplySourceId: string | null };
      data: { supplySourceId: string };
    }) => Promise<{ count: number }>;
  } | null | undefined,
  id: string | null | undefined,
  supplySourceId: string,
  expectedSupplySourceId?: string | null,
): Promise<boolean> => {
  if (!id) return false;
  if (expectedSupplySourceId !== undefined && model?.updateMany) {
    const result = await model.updateMany({
      where: { id, supplySourceId: expectedSupplySourceId },
      data: { supplySourceId },
    });
    return result.count === 1;
  }
  if (!model?.update) return false;
  await model.update({ where: { id }, data: { supplySourceId } });
  return true;
};
type CreateAffiliateSupplySourceInput = Readonly<{
  database: AffiliateSupplyDatabase;
  identity: AffiliateSupplyIdentity;
  targetKind?: string | null;
  operatorDomain?: string | null;
  rolloutCohort?: string;
  intakeId?: string | null;
  expectedIntakeSupplySourceId?: string | null;
  liveSourceId?: string | null;
  predecessorId?: string | null;
  metadata?: Record<string, unknown> | null;
  now: Date;
}>;
type AffiliateSupplySourceLinkInput = Readonly<{
  database: AffiliateSupplyDatabase;
  intakeId?: string | null;
  expectedIntakeSupplySourceId?: string | null;
  liveSourceId?: string | null;
}>;

const linkCreatedAffiliateSupplySource = async (
  input: AffiliateSupplySourceLinkInput,
  supplySourceId: string,
): Promise<void> => {
  await Promise.all([
    linkSupplySource(
      input.database.intakes,
      input.intakeId,
      supplySourceId,
      input.expectedIntakeSupplySourceId,
    ),
    linkSupplySource(input.database.sources, input.liveSourceId, supplySourceId),
  ]);
};

const markAffiliateSuccessorSourceForRevalidation = async (
  input: CreateAffiliateSupplySourceInput,
): Promise<void> => {
  if (
    !input.predecessorId
    || !input.liveSourceId
    || !input.database.sources?.findUnique
    || !input.database.sources?.update
  ) return;
  const successorSource = await input.database.sources.findUnique({ where: { id: input.liveSourceId } });
  if (!successorSource) return;
  await input.database.sources.update({
    where: { id: input.liveSourceId },
    data: {
      activeMappingId: null,
      autoScrapeEnabled: false,
      metadata: {
        ...recordValue(successorSource.metadata),
        automationReviewRequired: {
          hold: true,
          reason: 'SUCCESSOR_REVALIDATION_REQUIRED',
        },
      },
    },
  });
};

const createAffiliateSupplySource = async (
  input: CreateAffiliateSupplySourceInput,
) => {
  const supplySourceId = createId();
  const created = await input.database.supplySources.create({
    data: {
      id: supplySourceId,
      identityKey: input.identity.identityKey,
      canonicalUrl: input.identity.canonicalUrl,
      origin: input.identity.origin,
      pathKey: input.identity.pathKey,
      operatorDomain: input.operatorDomain ?? null,
      targetKind: input.targetKind?.trim().toUpperCase() || 'EVENT',
      rolloutCohort: input.rolloutCohort?.trim() || 'DEFAULT',
      intakeId: input.intakeId ?? null,
      liveSourceId: input.liveSourceId ?? null,
      predecessorId: input.predecessorId ?? null,
      metadata: prismaNullableJsonValue(input.metadata),
      createdAt: input.now,
      updatedAt: input.now,
    },
  });
  if (input.predecessorId) {
    await input.database.supplySources.update({
      where: { id: input.predecessorId },
      data: { successorId: created.id, updatedAt: input.now },
    });
  }
  await linkCreatedAffiliateSupplySource(input, created.id);
  await markAffiliateSuccessorSourceForRevalidation(input);
  return created;
};

export type AffiliateSupplySourceIndexes = Readonly<{
  byId: Map<string, AffiliateSupplySources>;
  byIdentityKey: Map<string, AffiliateSupplySources>;
  byPathKey: Map<string, AffiliateSupplySources>;
}>;

const supplySourceCreatedAt = (source: AffiliateSupplySources): number => {
  const createdAt = source.createdAt;
  if (createdAt instanceof Date) {
    const timestamp = createdAt.getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Number.POSITIVE_INFINITY;
};

const isEarlierSupplySource = (
  current: AffiliateSupplySources | undefined,
  candidate: AffiliateSupplySources,
): boolean => {
  if (!current) return true;
  const currentTime = supplySourceCreatedAt(current);
  const candidateTime = supplySourceCreatedAt(candidate);
  return candidateTime < currentTime
    || (candidateTime === currentTime && codeUnitCompare(candidate.id, current.id) < 0);
};

const indexSupplySource = (
  indexes: AffiliateSupplySourceIndexes,
  source: AffiliateSupplySources,
): void => {
  indexes.byId.set(source.id, source);
  const identitySource = indexes.byIdentityKey.get(source.identityKey);
  if (isEarlierSupplySource(identitySource, source)) {
    indexes.byIdentityKey.set(source.identityKey, source);
  }
  const pathSource = indexes.byPathKey.get(source.pathKey);
  if (isEarlierSupplySource(pathSource, source)) {
    indexes.byPathKey.set(source.pathKey, source);
  }
};

export const indexAffiliateSupplySources = (
  sources: readonly AffiliateSupplySources[],
): AffiliateSupplySourceIndexes => {
  const indexes: AffiliateSupplySourceIndexes = {
    byId: new Map(),
    byIdentityKey: new Map(),
    byPathKey: new Map(),
  };
  sources.forEach((source) => indexSupplySource(indexes, source));
  return indexes;
};

const rememberIndexedSupplySource = (
  indexes: AffiliateSupplySourceIndexes | undefined,
  source: AffiliateSupplySources,
): void => {
  if (indexes) indexSupplySource(indexes, source);
};

export type EnsureAffiliateSupplySourceInput = Readonly<{
  requestedUrl: string;
  resolvedCanonicalUrl?: string | null;
  isRedirectVerified?: boolean;
  operatorDomain?: string | null;
  targetKind?: string | null;
  rolloutCohort?: string;
  intakeId?: string | null;
  expectedIntakeSupplySourceId?: string | null;
  liveSourceId?: string | null;
  priorSupplySourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  preloadedSupplySources?: readonly AffiliateSupplySources[];
  preloadedSupplySourceIndexes?: AffiliateSupplySourceIndexes;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>;

export type EnsureAffiliateSupplySourceResult = Readonly<{
  supplySource: AffiliateSupplySources;
  identity: AffiliateSupplyIdentity;
  isCreated: boolean;
  isSuccessorCreated: boolean;
  predecessorId: string | null;
}>;

type EnsureAffiliateSupplySourceTransactionInput = Readonly<{
  database: AffiliateSupplyDatabase;
  input: EnsureAffiliateSupplySourceInput;
  now: Date;
  indexes: AffiliateSupplySourceIndexes | undefined;
}>;

type EnsureAffiliateSupplySourceState = Readonly<{
  prior: AffiliateSupplySources | null;
  initialIdentity: AffiliateSupplyIdentity;
  existing: AffiliateSupplySources | null;
  existingByPath: AffiliateSupplySources | null;
  linkedSuccessor: AffiliateSupplySources | null;
}>;

type EnsureAffiliateSupplySourcePersistedResult = EnsureAffiliateSupplySourceResult & Readonly<{
  isRevalidationRequired?: boolean;
  isSuccessorCommandRequired?: boolean;
}>;

const lookupEnsureAffiliateSupplySource = async (
  database: AffiliateSupplyDatabase,
  indexes: AffiliateSupplySourceIndexes | undefined,
  id: string | null | undefined,
): Promise<AffiliateSupplySources | null> => {
  if (!id) return null;
  return indexes?.byId.get(id) ?? currentSupplySource(database, id);
};

const lookupEnsureAffiliateSupplySourceByIdentity = async (
  database: AffiliateSupplyDatabase,
  indexes: AffiliateSupplySourceIndexes | undefined,
  identityKey: string,
): Promise<AffiliateSupplySources | null> => (
  indexes?.byIdentityKey.get(identityKey)
    ?? database.supplySources.findUnique({ where: { identityKey } })
);

const lookupEnsureAffiliateSupplySourceByPath = async (
  database: AffiliateSupplyDatabase,
  indexes: AffiliateSupplySourceIndexes | undefined,
  identityKey: string,
  pathKey: string,
  existing: AffiliateSupplySources | null,
): Promise<AffiliateSupplySources | null> => {
  if (existing) return null;
  if (indexes) return indexes.byPathKey.get(pathKey) ?? null;
  if (!database.supplySources.findFirst) return null;
  return database.supplySources.findFirst({
    where: { pathKey },
    orderBy: { createdAt: 'asc' },
  });
};

const loadEnsureAffiliateSupplySourceState = async (
  context: EnsureAffiliateSupplySourceTransactionInput,
): Promise<EnsureAffiliateSupplySourceState> => {
  const { database, input, indexes } = context;
  const prior = await lookupEnsureAffiliateSupplySource(database, indexes, input.priorSupplySourceId);
  const initialIdentity = normalizeAffiliateSupplyIdentity({
    requestedUrl: input.requestedUrl,
    resolvedCanonicalUrl: input.resolvedCanonicalUrl,
    isRedirectVerified: input.isRedirectVerified,
    operatorDomain: input.operatorDomain,
    prior: prior
      ? { canonicalUrl: prior.canonicalUrl, operatorDomain: prior.operatorDomain, identityKey: prior.identityKey }
      : null,
  });
  const existing = await lookupEnsureAffiliateSupplySourceByIdentity(
    database,
    indexes,
    initialIdentity.identityKey,
  );
  const existingByPath = await lookupEnsureAffiliateSupplySourceByPath(
    database,
    indexes,
    initialIdentity.identityKey,
    initialIdentity.pathKey,
    existing,
  );
  const linkedSuccessor = await lookupEnsureAffiliateSupplySource(
    database,
    indexes,
    prior?.successorId,
  );
  return { prior, initialIdentity, existing, existingByPath, linkedSuccessor };
};

const ensureAffiliateSuccessorLinkMismatch = (
  state: EnsureAffiliateSupplySourceState,
): EnsureAffiliateSupplySourcePersistedResult | null => {
  const { prior, initialIdentity, linkedSuccessor } = state;
  if (
    !prior?.successorId
    || (linkedSuccessor && linkedSuccessor.identityKey === initialIdentity.identityKey)
  ) return null;
  const linkedSupplySource = linkedSuccessor ?? prior;
  return {
    supplySource: linkedSupplySource,
    identity: {
      ...initialIdentity,
      rootDecision: 'REVIEW_REQUIRED',
      reasonCodes: [
        ...initialIdentity.reasonCodes,
        linkedSuccessor ? 'SUCCESSOR_ALREADY_LINKED' : 'SUCCESSOR_LINK_MISSING',
      ],
    },
    isCreated: false,
    isSuccessorCreated: false,
    predecessorId: prior.id,
  };
};

type EnsureAffiliateSupplySourceDecision = Readonly<{
  current: AffiliateSupplySources | null;
  existingSuccessor: AffiliateSupplySources | null;
  identity: AffiliateSupplyIdentity;
  predecessorId: string | null;
}>;

const ensureAffiliateIdentityForDecision = (
  input: EnsureAffiliateSupplySourceInput,
  state: EnsureAffiliateSupplySourceState,
  current: AffiliateSupplySources | null,
): AffiliateSupplyIdentity => {
  if (!current || state.prior) return state.initialIdentity;
  return normalizeAffiliateSupplyIdentity({
    requestedUrl: input.requestedUrl,
    resolvedCanonicalUrl: input.resolvedCanonicalUrl,
    isRedirectVerified: input.isRedirectVerified,
    operatorDomain: input.operatorDomain,
    prior: {
      canonicalUrl: current.canonicalUrl,
      operatorDomain: current.operatorDomain,
      identityKey: current.identityKey,
    },
  });
};

const ensureAffiliateExistingSuccessorForDecision = (
  state: EnsureAffiliateSupplySourceState,
): AffiliateSupplySources | null => (
  state.prior && state.existing && state.existing.id !== state.prior.id
    ? state.existing
    : state.linkedSuccessor
);

const ensureAffiliatePredecessorId = (
  identity: AffiliateSupplyIdentity,
  state: EnsureAffiliateSupplySourceState,
  current: AffiliateSupplySources | null,
): string | null => (
  identity.rootDecision === 'SUCCESSOR_REQUIRED'
    ? state.prior?.id ?? current?.id ?? null
    : null
);

const ensureAffiliateSupplySourceDecision = (
  input: EnsureAffiliateSupplySourceInput,
  state: EnsureAffiliateSupplySourceState,
): EnsureAffiliateSupplySourceDecision => {
  const current = state.prior ?? state.existing ?? state.existingByPath;
  const existingSuccessor = ensureAffiliateExistingSuccessorForDecision(state);
  const identity = ensureAffiliateIdentityForDecision(input, state, current);
  const predecessorId = ensureAffiliatePredecessorId(identity, state, current);
  return { current, existingSuccessor, identity, predecessorId };
};


const ensureAffiliateExistingSuccessorMismatch = (
  decision: EnsureAffiliateSupplySourceDecision,
): EnsureAffiliateSupplySourcePersistedResult | null => {
  const { existingSuccessor, identity, predecessorId } = decision;
  if (
    !existingSuccessor
    || !predecessorId
    || !existingSuccessor.predecessorId
    || existingSuccessor.predecessorId === predecessorId
  ) return null;
  return {
    supplySource: existingSuccessor,
    identity: {
      ...identity,
      rootDecision: 'REVIEW_REQUIRED',
      reasonCodes: [...identity.reasonCodes, 'SUCCESSOR_PREDECESSOR_MISMATCH'],
    },
    isCreated: false,
    isSuccessorCreated: false,
    predecessorId,
  };
};

const ensureAffiliateSuccessorCommand = (
  decision: EnsureAffiliateSupplySourceDecision,
): EnsureAffiliateSupplySourcePersistedResult | null => {
  if (!decision.predecessorId) return null;
  const predecessorSource = decision.current ?? decision.existingSuccessor;
  if (!predecessorSource) {
    throw new Error('Affiliate Supply Source successor command requires a persisted predecessor.');
  }
  return {
    supplySource: predecessorSource,
    identity: decision.identity,
    isCreated: false,
    isSuccessorCreated: false,
    predecessorId: decision.predecessorId,
    isSuccessorCommandRequired: true,
  };
};

const ensureAffiliateReviewRequired = (
  decision: EnsureAffiliateSupplySourceDecision,
): EnsureAffiliateSupplySourcePersistedResult | null => {
  if (!decision.current || decision.identity.rootDecision !== 'REVIEW_REQUIRED') return null;
  return {
    supplySource: decision.current,
    identity: decision.identity,
    isCreated: false,
    isSuccessorCreated: false,
    predecessorId: null,
  };
};

const ensureAffiliateSourceNeedsRevalidation = (
  current: AffiliateSupplySources,
  identity: AffiliateSupplyIdentity,
): boolean => {
  const hasExistingRevalidationHold = current.canonicalUrl === identity.canonicalUrl
    && current.automationHoldReason === 'CANONICAL_REVALIDATION_REQUIRED'
    && current.isAutomationEnabled !== true;
  return (
    current.canonicalUrl !== identity.canonicalUrl
    || identity.isRevalidationRequired
  ) && !hasExistingRevalidationHold;
};

const ensureAffiliateSourceFields = (
  identity: AffiliateSupplyIdentity,
  now: Date,
): Record<string, unknown> => ({
  canonicalUrl: identity.canonicalUrl,
  origin: identity.origin,
  pathKey: identity.pathKey,
  updatedAt: now,
});

const ensureAffiliateSourceDefaults = (
  input: EnsureAffiliateSupplySourceInput,
  current: AffiliateSupplySources,
): Record<string, unknown> => ({
  operatorDomain: input.operatorDomain ?? current.operatorDomain ?? null,
  targetKind: input.targetKind?.trim().toUpperCase() || current.targetKind || 'EVENT',
  rolloutCohort: input.rolloutCohort?.trim() || current.rolloutCohort || 'DEFAULT',
});

const ensureAffiliateSourceAssociations = (
  input: EnsureAffiliateSupplySourceInput,
  current: AffiliateSupplySources,
): Record<string, unknown> => ({
  intakeId: input.intakeId ?? current.intakeId ?? null,
  liveSourceId: input.liveSourceId ?? current.liveSourceId ?? null,
  metadata: prismaNullableJsonValue(input.metadata ?? current.metadata),
});

const ensureAffiliateSourceUpdateData = (
  input: EnsureAffiliateSupplySourceInput,
  current: AffiliateSupplySources,
  identity: AffiliateSupplyIdentity,
  now: Date,
): Record<string, unknown> => ({
  ...ensureAffiliateSourceFields(identity, now),
  ...ensureAffiliateSourceDefaults(input, current),
  ...ensureAffiliateSourceAssociations(input, current),
});

const updateExistingAffiliateSupplySource = async (
  context: EnsureAffiliateSupplySourceTransactionInput,
  decision: EnsureAffiliateSupplySourceDecision,
): Promise<EnsureAffiliateSupplySourcePersistedResult | null> => {
  const { current, identity } = decision;
  if (!current) return null;
  if (ensureAffiliateSourceNeedsRevalidation(current, identity)) {
    return {
      supplySource: current,
      identity: { ...identity, identityKey: current.identityKey, rootDecision: 'SAME_ROOT' },
      isCreated: false,
      isSuccessorCreated: false,
      predecessorId: null,
      isRevalidationRequired: true,
    };
  }
  const { input, database, now } = context;
  const updated = await database.supplySources.update({
    where: { id: current.id },
    data: ensureAffiliateSourceUpdateData(input, current, identity, now),
  });
  await linkCreatedAffiliateSupplySource(context, current.id);
  return {
    supplySource: updated,
    identity: { ...identity, identityKey: current.identityKey, rootDecision: 'SAME_ROOT' },
    isCreated: false,
    isSuccessorCreated: false,
    predecessorId: null,
  };
};

const createAffiliateRootEvidenceRefs = (
  input: EnsureAffiliateSupplySourceInput,
  identity: AffiliateSupplyIdentity,
): string[] => [
  `identity:${identity.identityKey}`,
  `canonical-url:${hashAffiliateAgentValue({
    requestedUrl: input.requestedUrl,
    resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
  })}`,
];

const createAffiliateRootLifecycleRequest = (
  input: EnsureAffiliateSupplySourceInput,
  identity: AffiliateSupplyIdentity,
  evidenceRefs: readonly string[],
): Record<string, unknown> => ({
  requestedUrl: input.requestedUrl,
  resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
  isRedirectVerified: input.isRedirectVerified === true,
  operatorDomain: input.operatorDomain ?? null,
  targetKind: input.targetKind ?? null,
  intakeId: input.intakeId ?? null,
  liveSourceId: input.liveSourceId ?? null,
  identityKey: identity.identityKey,
  evidenceRefs,
});

const createAndAssessAffiliateSupplyRoot = async (
  context: EnsureAffiliateSupplySourceTransactionInput,
  identity: AffiliateSupplyIdentity,
): Promise<EnsureAffiliateSupplySourcePersistedResult> => {
  const { database, input, now } = context;
  const created = await createAffiliateSupplySource({
    database,
    identity,
    targetKind: input.targetKind,
    operatorDomain: input.operatorDomain,
    rolloutCohort: input.rolloutCohort,
    intakeId: input.intakeId,
    expectedIntakeSupplySourceId: input.expectedIntakeSupplySourceId,
    liveSourceId: input.liveSourceId,
    predecessorId: null,
    metadata: input.metadata,
    now,
  });
  const rootEvidenceRefs = createAffiliateRootEvidenceRefs(input, identity);
  const lifecycleRequest = createAffiliateRootLifecycleRequest(input, identity, rootEvidenceRefs);
  await executeAffiliateLifecycleInTransaction(
    database,
    database,
    {
      supplySourceId: created.id,
      command: 'CREATE_ROOT',
      authority: 'SYSTEM',
      expectedLifecycleGeneration: 0,
      idempotencyKey: `root-creation:${identity.identityKey}`,
      request: lifecycleRequest,
      actorKind: 'SYSTEM',
      actorId: 'affiliate-supply-identity',
      rolloutCohort: created.rolloutCohort,
      now,
    },
    lifecycleRequest,
    now,
  );
  const assessed = await database.supplySources.findUnique({ where: { id: created.id } });
  return {
    supplySource: assessed ?? created,
    identity,
    isCreated: true,
    isSuccessorCreated: false,
    predecessorId: null,
  };
};

const ensureAffiliateSuccessorDecisionResult = (
  decision: EnsureAffiliateSupplySourceDecision,
): EnsureAffiliateSupplySourcePersistedResult | null => (
  ensureAffiliateExistingSuccessorMismatch(decision)
    ?? ensureAffiliateSuccessorCommand(decision)
);

const ensureAffiliateSupplySourceInTransaction = async (
  context: EnsureAffiliateSupplySourceTransactionInput,
): Promise<EnsureAffiliateSupplySourcePersistedResult> => {
  const state = await loadEnsureAffiliateSupplySourceState(context);
  const linkedMismatch = ensureAffiliateSuccessorLinkMismatch(state);
  if (linkedMismatch) return linkedMismatch;
  const decision = ensureAffiliateSupplySourceDecision(context.input, state);
  const successorResult = ensureAffiliateSuccessorDecisionResult(decision);
  if (successorResult) return successorResult;
  const reviewRequired = ensureAffiliateReviewRequired(decision);
  if (reviewRequired) return reviewRequired;
  const updated = await updateExistingAffiliateSupplySource(context, decision);
  if (updated) return updated;
  return createAndAssessAffiliateSupplyRoot(context, decision.identity);
};

const ensureAffiliateSupplyRequestFields = (
  input: EnsureAffiliateSupplySourceInput,
  evidenceRefs: readonly string[],
): Record<string, unknown> => ({
  requestedUrl: input.requestedUrl,
  resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
  isRedirectVerified: input.isRedirectVerified === true,
  operatorDomain: input.operatorDomain ?? null,
  targetKind: input.targetKind ?? null,
  intakeId: input.intakeId ?? null,
  liveSourceId: input.liveSourceId ?? null,
  evidenceRefs,
});

const ensureAffiliateExpectedIntakeFields = (
  input: EnsureAffiliateSupplySourceInput,
): Record<string, unknown> => (
  input.expectedIntakeSupplySourceId === undefined
    ? {}
    : { expectedIntakeSupplySourceId: input.expectedIntakeSupplySourceId }
);

const buildEnsureAffiliateSuccessorRequest = (
  input: EnsureAffiliateSupplySourceInput,
  evidenceRefs: readonly string[],
): Record<string, unknown> => ({
  ...ensureAffiliateSupplyRequestFields(input, evidenceRefs),
  ...ensureAffiliateExpectedIntakeFields(input),
});

const requireAffiliateSuccessorSupplySource = async (
  database: AffiliateSupplyDatabase,
  predecessorId: string,
): Promise<AffiliateSupplySources> => {
  const predecessor = await database.supplySources.findUnique({ where: { id: predecessorId } });
  const successorId = stringValue(predecessor?.successorId);
  if (!successorId) {
    throw new Error('Affiliate successor creation did not produce a linked successor root.');
  }
  const successor = await database.supplySources.findUnique({ where: { id: successorId } });
  if (!successor) {
    throw new Error('Affiliate successor creation produced a missing successor root.');
  }
  return successor;
};

const ensureAffiliateEvidenceHash = (
  input: EnsureAffiliateSupplySourceInput,
): string => hashAffiliateAgentValue({
  requestedUrl: input.requestedUrl,
  resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
});

const ensureAffiliateSuccessorResult = async (
  input: EnsureAffiliateSupplySourceInput,
  database: AffiliateSupplyDatabase,
  now: Date,
  indexes: AffiliateSupplySourceIndexes | undefined,
  persisted: EnsureAffiliateSupplySourcePersistedResult,
): Promise<EnsureAffiliateSupplySourceResult> => {
  const evidenceHash = ensureAffiliateEvidenceHash(input);
  const evidenceRefs = [
    `supply-source:${persisted.supplySource.id}`,
    `identity:${persisted.identity.identityKey}`,
    `canonical-url:${evidenceHash}`,
  ];
  await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: String(persisted.supplySource.id),
    command: 'CREATE_SUCCESSOR',
    authority: 'SYSTEM',
    expectedLifecycleGeneration: Number(persisted.supplySource.lifecycleGeneration ?? 0),
    idempotencyKey: `successor-creation:${persisted.supplySource.id}:${evidenceHash}`,
    request: buildEnsureAffiliateSuccessorRequest(input, evidenceRefs),
    actorKind: 'SYSTEM',
    actorId: 'affiliate-supply-identity',
    rolloutCohort: input.rolloutCohort ?? persisted.supplySource.rolloutCohort,
    db: database,
    now,
  });
  const successor = await requireAffiliateSuccessorSupplySource(
    database,
    persisted.supplySource.id,
  );
  const result = {
    ...persisted,
    supplySource: successor,
    identity: {
      ...persisted.identity,
      identityKey: successor.identityKey,
      rootDecision: 'SUCCESSOR_REQUIRED' as const,
    },
    isCreated: false,
    isSuccessorCreated: true,
    predecessorId: persisted.supplySource.id,
  };
  rememberIndexedSupplySource(indexes, result.supplySource);
  return result;
};

const ensureAffiliateRevalidatedResult = async (
  input: EnsureAffiliateSupplySourceInput,
  database: AffiliateSupplyDatabase,
  now: Date,
  indexes: AffiliateSupplySourceIndexes | undefined,
  persisted: EnsureAffiliateSupplySourcePersistedResult,
): Promise<EnsureAffiliateSupplySourceResult> => {
  const evidenceHash = ensureAffiliateEvidenceHash(input);
  const evidenceRefs = [
    `supply-source:${persisted.supplySource.id}`,
    `identity:${persisted.identity.identityKey}`,
    `canonical-url:${evidenceHash}`,
  ];
  await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: String(persisted.supplySource.id),
    command: 'REVALIDATE_IDENTITY',
    authority: 'SYSTEM',
    expectedLifecycleGeneration: Number(persisted.supplySource.lifecycleGeneration ?? 0),
    idempotencyKey: `identity-revalidation:${persisted.supplySource.id}:${evidenceHash}`,
    request: {
      requestedUrl: input.requestedUrl,
      resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
      isRedirectVerified: input.isRedirectVerified === true,
      operatorDomain: input.operatorDomain ?? null,
      intakeId: input.intakeId ?? null,
      liveSourceId: input.liveSourceId ?? null,
      ...(input.expectedIntakeSupplySourceId !== undefined
        ? { expectedIntakeSupplySourceId: input.expectedIntakeSupplySourceId }
        : {}),
      evidenceRefs,
    },
    actorKind: 'SYSTEM',
    actorId: 'affiliate-supply-identity',
    rolloutCohort: input.rolloutCohort ?? persisted.supplySource.rolloutCohort,
    db: database,
    now,
  });
  const refreshedSupplySource = await database.supplySources.findUnique({
    where: { id: persisted.supplySource.id },
  });
  const result = {
    ...persisted,
    supplySource: refreshedSupplySource ?? persisted.supplySource,
  };
  rememberIndexedSupplySource(indexes, result.supplySource);
  return result;
};

const resolveEnsureAffiliateSupplySourceResult = async (
  input: EnsureAffiliateSupplySourceInput,
  database: AffiliateSupplyDatabase,
  now: Date,
  indexes: AffiliateSupplySourceIndexes | undefined,
  persisted: EnsureAffiliateSupplySourcePersistedResult,
): Promise<EnsureAffiliateSupplySourceResult> => {
  rememberIndexedSupplySource(indexes, persisted.supplySource);
  if (persisted.isSuccessorCommandRequired) {
    return ensureAffiliateSuccessorResult(input, database, now, indexes, persisted);
  }
  if (!persisted.isRevalidationRequired) return persisted;
  return ensureAffiliateRevalidatedResult(input, database, now, indexes, persisted);
};

export const ensureAffiliateSupplySource = async (
  input: EnsureAffiliateSupplySourceInput,
): Promise<EnsureAffiliateSupplySourceResult> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  if (!database.supplySources?.findUnique || !database.supplySources?.create) {
    throw new Error('Affiliate Supply Source persistence is not available. Apply the lifecycle migration first.');
  }
  const indexes = input.preloadedSupplySourceIndexes
    ?? (input.preloadedSupplySources
      ? indexAffiliateSupplySources(input.preloadedSupplySources)
      : undefined);
  const persisted = await withSupplyTransaction<EnsureAffiliateSupplySourcePersistedResult>(
    database,
    (transactionDatabase) => ensureAffiliateSupplySourceInTransaction({
      database: transactionDatabase,
      input,
      now,
      indexes,
    }),
  );
  return resolveEnsureAffiliateSupplySourceResult(input, database, now, indexes, persisted);
};

export const linkAffiliateSupplyRecord = async (input: Readonly<{
  supplySourceId: string;
  intakeId?: string | null;
  pageId?: string | null;
  intakeRunId?: string | null;
  artifactId?: string | null;
  sourceId?: string | null;
  mappingId?: string | null;
  mappingJobId?: string | null;
  approvalId?: string | null;
  runId?: string | null;
  candidateId?: string | null;
  db?: AffiliateSupplyDatabase;
}>): Promise<void> => {
  const database = input.db ?? affiliateSupplyDatabase();
  await withSupplyTransaction(database, async (transactionDatabase) => {
    await Promise.all([
      linkSupplySource(transactionDatabase.intakes, input.intakeId, input.supplySourceId),
      linkSupplySource(transactionDatabase.pages, input.pageId, input.supplySourceId),
      linkSupplySource(transactionDatabase.intakeRuns, input.intakeRunId, input.supplySourceId),
      linkSupplySource(transactionDatabase.artifacts, input.artifactId, input.supplySourceId),
      linkSupplySource(transactionDatabase.sources, input.sourceId, input.supplySourceId),
      linkSupplySource(transactionDatabase.mappings, input.mappingId, input.supplySourceId),
      linkSupplySource(transactionDatabase.mappingJobs, input.mappingJobId, input.supplySourceId),
      linkSupplySource(transactionDatabase.approvals, input.approvalId, input.supplySourceId),
      linkSupplySource(transactionDatabase.runs, input.runId, input.supplySourceId),
      linkSupplySource(transactionDatabase.candidates, input.candidateId, input.supplySourceId),
    ]);
  });
};

export type ActiveAffiliateSupplyContractResult = Readonly<{
  manifest: AffiliateSupplyContractManifest;
  policy: AffiliateSupplyContractPolicy;
}>;
const parseActiveAffiliateSupplyContractRow = (row: AffiliateSupplyContractManifests): ActiveAffiliateSupplyContractResult => {
  const preimage = {
    schemaVersion: 1 as const,
    version: row.version,
    rolloutCohort: row.rolloutCohort,
    supplyContract: row.contractJson,
  };
  if (row.contractHash !== hashAffiliateAgentValue(preimage)) {
    throw new Error('Stored Affiliate Supply Contract hash does not match its immutable content.');
  }
  const manifest = affiliateSupplyContractManifestSchema.parse({
    ...preimage,
    status: row.status,
    hash: row.contractHash,
  });
  return {
    manifest,
    policy: normalizeAffiliateSupplyContractPolicy(manifest.supplyContract, manifest.rolloutCohort),
  };
};

export const loadActiveAffiliateSupplyContracts = async (input: Readonly<{
  db?: AffiliateSupplyDatabase;
}> = {}): Promise<ActiveAffiliateSupplyContractResult[]> => {
  const database = input.db ?? affiliateSupplyDatabase();
  if (!database.contractManifests?.findMany) {
    throw new Error('Affiliate Supply Contract persistence is not available. Apply the lifecycle migration first.');
  }
  const rows = await database.contractManifests.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ rolloutCohort: 'asc' }, { version: 'desc' }],
  });
  const seenCohorts = new Set<string>();
  return rows
    .filter((row) => {
      const cohort = String(row.rolloutCohort);
      if (seenCohorts.has(cohort)) return false;
      seenCohorts.add(cohort);
      return true;
    })
    .map(parseActiveAffiliateSupplyContractRow);
};

export const loadActiveAffiliateSupplyContract = async (input: Readonly<{
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
}> = {}): Promise<ActiveAffiliateSupplyContractResult> => {
  const database = input.db ?? affiliateSupplyDatabase();
  if (!database.contractManifests?.findFirst) {
    throw new Error('Affiliate Supply Contract persistence is not available. Apply the lifecycle migration first.');
  }
  const row = await database.contractManifests.findFirst({
    where: {
      status: 'ACTIVE',
      ...(input.rolloutCohort ? { rolloutCohort: input.rolloutCohort } : {}),
    },
    orderBy: { version: 'desc' },
  });
  if (!row) throw new Error('No active Affiliate Supply Contract is published for this rollout cohort.');
  return parseActiveAffiliateSupplyContractRow(row);
};
const emptyAffiliateSupplyContractManifest = (
  rolloutCohort: string,
): AffiliateSupplyContractManifest => ({
  schemaVersion: 1,
  version: 0,
  rolloutCohort,
  supplyContract: {
    schemaVersion: 1,
    version: 0,
    rolloutCohort,
    hash: '',
    freshnessWindows: [],
    targets: [],
    requiredMappingEvidenceKinds: [],
    requiredLifecycleEvidenceKinds: [],
  },
  status: 'ACTIVE',
  hash: '',
} as AffiliateSupplyContractManifest);

const loadAffiliateActivationManifest = async (
  database: AffiliateSupplyDatabase,
  rolloutCohort: string,
): Promise<AffiliateSupplyContractManifest> => {
  const activeRow = database.contractManifests?.findFirst
    ? await database.contractManifests.findFirst({
      where: { status: 'ACTIVE', rolloutCohort },
      orderBy: { version: 'desc' },
    })
    : null;
  if (!activeRow) return emptyAffiliateSupplyContractManifest(rolloutCohort);
  return parseActiveAffiliateSupplyContractRow(activeRow).manifest;
};

const loadAffiliateActivationSources = async (
  database: AffiliateSupplyDatabase,
  rolloutCohort: string,
): Promise<AffiliateSupplySources[]> => (
  database.supplySources?.findMany
    ? database.supplySources.findMany({ where: { rolloutCohort } })
    : []
);

const buildAffiliateActivationTargetCells = (
  targetRows: readonly AffiliateSupplyContractImpactTargetRow[],
): Map<string, AffiliateSupplyContractImpactCell[]> => {
  const targetCellsBySource = new Map<string, AffiliateSupplyContractImpactCell[]>();
  for (const target of targetRows) {
    const cells = targetCellsBySource.get(target.supplySourceId) ?? [];
    cells.push({
      marketKey: target.marketKey ?? null,
      sportId: target.sportId ?? null,
      sourceProfile: String(target.sourceProfile ?? ''),
    });
    targetCellsBySource.set(target.supplySourceId, cells);
  }
  return targetCellsBySource;
};

const loadAffiliateActivationTargetCells = async (
  database: AffiliateSupplyDatabase,
  sources: readonly AffiliateSupplySources[],
): Promise<Map<string, AffiliateSupplyContractImpactCell[]>> => {
  if (typeof database.targets?.findMany !== 'function' || sources.length === 0) {
    return new Map();
  }
  const targetRows = await database.targets.findMany({
    where: { supplySourceId: { in: sources.map((source) => source.id) } },
    select: { supplySourceId: true, marketKey: true, sportId: true, sourceProfile: true },
  });
  return buildAffiliateActivationTargetCells(targetRows);
};

const hasAffiliateFindMany = (delegate: unknown): boolean => (
  Boolean(delegate && typeof delegate === 'object' && typeof Reflect.get(delegate, 'findMany') === 'function')
);

const canLoadAffiliateActivationAssessments = (
  database: AffiliateSupplyDatabase,
  sources: readonly AffiliateSupplySources[],
): boolean => sources.length > 0 && [
  database.sources,
  database.intakes,
  database.mappings,
  database.mappingJobs,
  database.approvals,
  database.runs,
  database.candidates,
  database.targets,
  database.supplySources,
].every(hasAffiliateFindMany);

const addAffiliateActivationAssessments = (
  source: AffiliateSupplySources,
  currentSnapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot>,
  nextSnapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot>,
  currentAssessments: Map<string, AffiliateSupplyAssessment>,
  nextAssessments: Map<string, AffiliateSupplyAssessment>,
): void => {
  const currentSnapshot = currentSnapshots.get(source.id);
  const nextSnapshot = nextSnapshots.get(source.id);
  if (currentSnapshot) {
    currentAssessments.set(source.id, deriveAffiliateSupplyAssessment(currentSnapshot));
  }
  if (nextSnapshot) {
    nextAssessments.set(source.id, deriveAffiliateSupplyAssessment(nextSnapshot));
  }
};

const loadAffiliateActivationAssessments = async (
  input: Readonly<{
    database: AffiliateSupplyDatabase;
    sources: readonly AffiliateSupplySources[];
    currentPolicy: AffiliateSupplyContractPolicy;
    nextPolicy: AffiliateSupplyContractPolicy;
    now: Date;
  }>,
): Promise<Readonly<{
  currentAssessments: Map<string, AffiliateSupplyAssessment>;
  nextAssessments: Map<string, AffiliateSupplyAssessment>;
}>> => {
  const currentAssessments = new Map<string, AffiliateSupplyAssessment>();
  const nextAssessments = new Map<string, AffiliateSupplyAssessment>();
  if (!canLoadAffiliateActivationAssessments(input.database, input.sources)) {
    return { currentAssessments, nextAssessments };
  }
  const roots = input.sources;
  const [currentSnapshots, nextSnapshots] = await Promise.all([
    loadSnapshots(input.database, roots, input.currentPolicy, input.now),
    loadSnapshots(input.database, roots, input.nextPolicy, input.now),
  ]);
  input.sources.forEach((source) => addAffiliateActivationAssessments(
    source,
    currentSnapshots,
    nextSnapshots,
    currentAssessments,
    nextAssessments,
  ));

  return { currentAssessments, nextAssessments };
};

const knownAffiliateFreshnessStatus = (
  value: unknown,
): AffiliateSupplyFreshnessStatus => (
  ['FRESH', 'STALE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(String(value))
    ? value as AffiliateSupplyFreshnessStatus
    : 'UNKNOWN'
);

const activationFreshnessStatus = (
  source: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment | undefined,
): AffiliateSupplyFreshnessStatus => assessment?.freshnessStatus
  ?? knownAffiliateFreshnessStatus(source.freshnessStatus);
const activationNextAssessmentFields = (
  assessment: AffiliateSupplyAssessment | undefined,
): Partial<Pick<AffiliateSupplyContractImpactSource, 'nextStage' | 'nextTargetContribution' | 'isNextAutomationEnabled' | 'nextRepairPriority'>> => (
  assessment
    ? {
      nextStage: assessment.stage,
      nextTargetContribution: assessment.targetContribution,
      isNextAutomationEnabled: assessment.isAutomationEnabled,
      nextRepairPriority: assessment.repairPriority,
    }
    : {}
);
const activationFreshTargetFields = (
  assessment: AffiliateSupplyAssessment | undefined,
  isNext: boolean,
): Partial<Pick<AffiliateSupplyContractImpactSource, 'currentFreshTargetCells' | 'nextFreshTargetCells'>> => (
  assessment
    ? { [isNext ? 'nextFreshTargetCells' : 'currentFreshTargetCells']: freshTargetCellsForAssessment(assessment) }
    : {}
);
const activationCurrentAssessmentFields = (
  source: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment | undefined,
): Pick<AffiliateSupplyContractImpactSource, 'stage' | 'targetContribution' | 'isAutomationEnabled' | 'repairPriority' | 'freshnessStatus'> => ({
  stage: assessment?.stage ?? source.derivedStage,
  targetContribution: assessment?.targetContribution ?? source.targetContribution,
  isAutomationEnabled: assessment?.isAutomationEnabled ?? source.isAutomationEnabled,
  repairPriority: assessment?.repairPriority ?? source.repairPriority,
  freshnessStatus: activationFreshnessStatus(source, assessment),
});
const activationTargetCellFields = (
  source: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment | undefined,
  targetCellsBySource: ReadonlyMap<string, AffiliateSupplyContractImpactCell[]>,
): Pick<AffiliateSupplyContractImpactSource, 'targetCells'> => ({
  targetCells: assessment
    ? targetCellsForAssessment(assessment)
    : targetCellsBySource.get(source.id) ?? [],
});
const buildAffiliateActivationSourceRow = (
  source: AffiliateSupplySources,
  currentAssessments: ReadonlyMap<string, AffiliateSupplyAssessment>,
  nextAssessments: ReadonlyMap<string, AffiliateSupplyAssessment>,
  targetCellsBySource: ReadonlyMap<string, AffiliateSupplyContractImpactCell[]>,
): AffiliateSupplyContractImpactSource => {
  const currentAssessment = currentAssessments.get(source.id);
  const nextAssessment = nextAssessments.get(source.id);
  return {
    id: source.id,
    ...activationCurrentAssessmentFields(source, currentAssessment),
    ...activationNextAssessmentFields(nextAssessment),
    ...activationTargetCellFields(source, currentAssessment, targetCellsBySource),
    ...activationFreshTargetFields(currentAssessment, false),
    ...activationFreshTargetFields(nextAssessment, true),
  };
};

const buildAffiliateSupplyContractActivationImpact = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  nextPolicy: AffiliateSupplyContractPolicy;
  rolloutCohort: string;
  now?: Date;
}>): Promise<ReturnType<typeof buildAffiliateSupplyContractImpactReport>> => {
  const currentManifest = await loadAffiliateActivationManifest(input.database, input.rolloutCohort);
  const sources = await loadAffiliateActivationSources(input.database, input.rolloutCohort);
  const targetCellsBySource = await loadAffiliateActivationTargetCells(input.database, sources);
  const currentPolicy = normalizeAffiliateSupplyContractPolicy(
    currentManifest.supplyContract,
    currentManifest.rolloutCohort,
  );
  const assessments = await loadAffiliateActivationAssessments({
    database: input.database,
    sources,
    currentPolicy,
    nextPolicy: input.nextPolicy,
    now: input.now ?? new Date(),
  });
  return buildAffiliateSupplyContractImpactReport({
    currentManifest,
    sources: sources.map((source) => buildAffiliateActivationSourceRow(
      source,
      assessments.currentAssessments,
      assessments.nextAssessments,
      targetCellsBySource,
    )),
    nextPolicy: input.nextPolicy,
  });
};


export const activateAffiliateSupplyContract = async (input: Readonly<{
  manifest: AffiliateSupplyContractManifest;
  userId: string;
  impactReport?: Record<string, unknown> | null;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>): Promise<AffiliateSupplyContractManifests> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const parsed = affiliateSupplyContractManifestSchema.parse(input.manifest);
  const now = input.now ?? new Date();
  if (!database.contractManifests?.create) {
    throw new Error('Affiliate Supply Contract persistence is not available.');
  }
  return withSupplyTransaction(database, async (transactionDatabase) => {
    const existing = transactionDatabase.contractManifests.findUnique
      ? await transactionDatabase.contractManifests.findUnique({
          where: {
            rolloutCohort_version: {
              rolloutCohort: parsed.rolloutCohort,
              version: parsed.version,
            },
          },
        })
      : null;
    if (existing) {
      if (existing.status === 'ACTIVE' && existing.contractHash === parsed.hash) {
        return existing;
      }
      throw new Error('Affiliate Supply Contract versions are immutable.');
    }
    if (!input.impactReport || Object.keys(input.impactReport).length === 0) {
      throw new Error('Affiliate Supply Contract activation requires an impact report.');
    }
    const expectedImpactReport = await buildAffiliateSupplyContractActivationImpact({
      now: input.now,
      database: transactionDatabase,
      nextPolicy: normalizeAffiliateSupplyContractPolicy(parsed.supplyContract, parsed.rolloutCohort),
      rolloutCohort: parsed.rolloutCohort,
    });
    if (hashAffiliateAgentValue(input.impactReport) !== hashAffiliateAgentValue(expectedImpactReport)) {
      throw new Error('Affiliate Supply Contract impact report does not match the current evidence baseline.');
    }
    await transactionDatabase.contractManifests.updateMany({
      where: { rolloutCohort: parsed.rolloutCohort, status: 'ACTIVE' },
      data: { status: 'RETIRED', retiredAt: now, updatedAt: now },
    });
    return transactionDatabase.contractManifests.create({
      data: {
        id: createId(),
        rolloutCohort: parsed.rolloutCohort,
        version: parsed.version,
        status: 'ACTIVE',
        contractHash: parsed.hash,
        contractJson: parsed.supplyContract,
        componentHashes: 'components' in parsed.supplyContract
          ? parsed.supplyContract.components.map((component) => component.hash)
          : [],
        activatedByUserId: input.userId,
        activatedAt: now,
        impactReport: prismaJsonValue(input.impactReport),
      },
    });
  });
};
type AffiliateSupplySnapshotRows = Readonly<{
  root: AffiliateSupplySources;
  source: AffiliateScrapeSources | null;
  intake: AffiliateSourceIntakes | null;
  predecessor?: AffiliateSupplySources | null;
  successor?: AffiliateSupplySources | null;
  mapping: AffiliateScrapeMappings | null;
  mappingJob: AffiliateSourceMappingJobs | null;
  approval: AffiliateApprovalJobs | null;
  latestRun: AffiliateScrapeRuns | null;
  candidates: AffiliateImportCandidates[];
  targets: AffiliateSupplyTargets[];
  contract: AffiliateSupplyContractPolicy;
  now: Date;
}>;

const snapshotViolationRules = (
  input: AffiliateSupplySnapshotRows,
  supplySourceId: string,
): readonly (readonly [string, () => boolean])[] => {
  const {
    root,
    source,
    intake,
    predecessor,
    successor,
    mapping,
    mappingJob,
    latestRun,
    candidates,
  } = input;
  return [
    ['ROOT_LIVE_SOURCE_MISSING', () => Boolean(root.liveSourceId) && !source],
    ['ROOT_INTAKE_MISSING', () => Boolean(root.intakeId) && !intake],
    ['SOURCE_SUPPLY_ROOT_MISMATCH', () => Boolean(root.liveSourceId && source && source.supplySourceId !== supplySourceId)],
    ['INTAKE_SUPPLY_ROOT_MISMATCH', () => Boolean(root.intakeId && intake && intake.supplySourceId !== supplySourceId)],
    ['PREDECESSOR_MISSING', () => Boolean(root.predecessorId) && !predecessor],
    ['PREDECESSOR_LINK_MISMATCH', () => Boolean(
      root.predecessorId
      && predecessor
      && String(predecessor.successorId ?? '') !== supplySourceId,
    )],
    ['SUCCESSOR_MISSING', () => Boolean(root.successorId) && !successor],
    ['SUCCESSOR_LINK_MISMATCH', () => Boolean(
      root.successorId
      && successor
      && String(successor.predecessorId ?? '') !== supplySourceId,
    )],
    ['MAPPING_SUPPLY_ROOT_MISMATCH', () => Boolean(mapping?.supplySourceId && mapping.supplySourceId !== supplySourceId)],
    ['MAPPING_SOURCE_MISMATCH', () => Boolean(mapping?.sourceId && source?.id && mapping.sourceId !== source.id)],
    ['MAPPING_JOB_SUPPLY_ROOT_MISMATCH', () => Boolean(mappingJob?.supplySourceId && mappingJob.supplySourceId !== supplySourceId)],
    ['RUN_SUPPLY_ROOT_MISMATCH', () => Boolean(latestRun?.supplySourceId && latestRun.supplySourceId !== supplySourceId)],
    ['CANDIDATE_SUPPLY_ROOT_MISMATCH', () => candidates.some((candidate) => (
      Boolean(candidate.supplySourceId) && candidate.supplySourceId !== supplySourceId
    ))],
  ] as const;
};

const buildAffiliateSnapshotIdentityViolations = (
  input: AffiliateSupplySnapshotRows,
  supplySourceId: string,
): string[] => snapshotViolationRules(input, supplySourceId)
  .filter(([, matches]) => matches())
  .map(([code]) => code);

const snapshotValidationOutput = (
  mapping: AffiliateScrapeMappings,
  mappingJson: Record<string, unknown>,
  mappingMetadata: Record<string, unknown>,
): Record<string, unknown> | null => (
  Object.keys(recordValue(mappingMetadata.validationOutput)).length
    ? recordValue(mappingMetadata.validationOutput)
    : Object.keys(recordValue(mappingJson.validationOutput)).length
      ? recordValue(mappingJson.validationOutput)
      : mapping.validatedAt ? { isValid: true } : null
);

const buildAffiliateSnapshotMapping = (
  mapping: AffiliateScrapeMappings | null,
): AffiliateSupplyEvidenceSnapshot['mapping'] => {
  if (!mapping) return null;
  const mappingJson = recordValue(mapping.mapping);
  const mappingMetadata = recordValue(mappingJson.metadata);
  const mappingEvidence = recordValue(mappingJson.evidence);
  return {
    id: mapping.id,
    version: mapping.version,
    isActive: mapping.isActive,
    validatedAt: mapping.validatedAt,
    isSchemaValid: affiliateScrapeMappingSchema.safeParse(mappingJson).success,
    packageHash: stringValue(mappingMetadata.packageHash)
      ?? stringValue(mappingJson.packageHash)
      ?? hashAffiliateAgentValue(mappingJson),
    evidenceRefs: stringArray(mappingMetadata.evidenceRefs ?? mappingEvidence.evidenceRefs ?? mappingJson.evidenceRefs),
    evidenceKinds: stringArray(mappingMetadata.evidenceKinds ?? mappingEvidence.evidenceKinds ?? mappingJson.evidenceKinds),
    mapping: mappingJson,
    validationOutput: snapshotValidationOutput(mapping, mappingJson, mappingMetadata),
  };
};

const buildAffiliateSnapshotSourceIdentity = (
  input: AffiliateSupplySnapshotRows,
  supplySourceId: string,
): Pick<AffiliateSupplyEvidenceSnapshot['source'], 'id' | 'canonicalUrl' | 'targetKind' | 'status'> => {
  const { root, source } = input;
  return {
    id: source?.id ?? root.liveSourceId ?? `supply-source:${supplySourceId}`,
    canonicalUrl: root.canonicalUrl,
    targetKind: source?.targetKind ?? root.targetKind,
    status: source?.status ?? (root.isExcluded ? 'EXCLUDED' : 'ACTIVE'),
  };
};

const buildAffiliateSnapshotSourceAutomation = (
  input: AffiliateSupplySnapshotRows,
  sourceMetadata: Record<string, unknown>,
  mapping: AffiliateScrapeMappings | null,
): Pick<
  AffiliateSupplyEvidenceSnapshot['source'],
  | 'autoScrapeEnabled'
  | 'isAutomationEnabled'
  | 'activeSupplyContractVersion'
  | 'activeSupplyContractHash'
  | 'activeMappingId'
  | 'isAutomationOnHold'
  | 'automationHoldReason'
  | 'lifecycleGeneration'
  | 'operatorDomain'
> => {
  const { root, source } = input;
  const automationReview = recordValue(sourceMetadata.automationReviewRequired);
  return {
    autoScrapeEnabled: source?.autoScrapeEnabled === true,
    isAutomationEnabled: root.isAutomationEnabled,
    activeSupplyContractVersion: root.activeSupplyContractVersion,
    activeSupplyContractHash: root.activeSupplyContractHash,
    activeMappingId: source?.activeMappingId ?? mapping?.id ?? null,
    isAutomationOnHold: Boolean(automationReview.hold),
    automationHoldReason: stringValue(automationReview.reason),
    lifecycleGeneration: root.lifecycleGeneration,
    operatorDomain: root.operatorDomain,
  };
};

const buildAffiliateSnapshotSource = (
  input: AffiliateSupplySnapshotRows,
  supplySourceId: string,
  sourceMetadata: Record<string, unknown>,
  mapping: AffiliateScrapeMappings | null,
): AffiliateSupplyEvidenceSnapshot['source'] => ({
  ...buildAffiliateSnapshotSourceIdentity(input, supplySourceId),
  ...buildAffiliateSnapshotSourceAutomation(input, sourceMetadata, mapping),
  isExcluded: input.root.isExcluded,
  metadata: sourceMetadata,
});


const buildAffiliateSnapshotMappingJob = (
  mappingJob: AffiliateSourceMappingJobs | null,
): AffiliateSupplyEvidenceSnapshot['mappingJob'] => (
  mappingJob
    ? {
      id: mappingJob.id,
      status: mappingJob.status,
      sourceId: mappingJob.sourceId,
      mappingId: mappingJob.mappingId,
      resultSummary: recordValue(mappingJob.resultSummary),
      evidenceRefs: stringArray(recordValue(mappingJob.resultSummary).evidenceRefs),
    }
    : null
);

const buildAffiliateSnapshotApproval = (
  approval: AffiliateApprovalJobs | null,
): AffiliateSupplyEvidenceSnapshot['approval'] => {
  if (!approval) return null;
  const decision = recordValue(approval.decision);
  const decisionValue = decision.decision ?? approval.decision;
  return {
    id: approval.id,
    status: approval.status,
    decision: typeof decisionValue === 'string' ? decisionValue : null,
    isIndependent: decision.isIndependent === true || decision.independent === true,
    reviewerId: approval.reviewerId,
    reviewedPackageHash: stringValue(decision.packageHash),
    evidenceRefs: stringArray(decision.evidenceRefs),
  };
};

const buildAffiliateSnapshotRun = (
  latestRun: AffiliateScrapeRuns | null,
  runLogs: Record<string, unknown>,
): AffiliateSupplyEvidenceSnapshot['latestRun'] => (
  latestRun
    ? {
      id: latestRun.id,
      status: latestRun.status,
      mappingId: latestRun.mappingId,
      startedAt: latestRun.startedAt,
      finishedAt: latestRun.finishedAt,
      finalUrl: latestRun.finalUrl,
      httpStatus: latestRun.httpStatus,
      itemCount: latestRun.itemCount ?? 0,
      candidateCount: latestRun.candidateCount ?? 0,
      isEmptyStateMatched: runLogs.isEmptyStateMatched === true || runLogs.emptyStateMatched === true,
      errorCode: stringValue(runLogs.errorCode),
      errorMessage: latestRun.errorMessage,
      evidenceRefs: stringArray(runLogs.evidenceRefs),
      metadata: recordValue(latestRun.metadata),
    }
    : null
);

const snapshotCandidateTargetType = (listingKind: string): string => (
  listingKind === 'RENTAL'
    ? 'FACILITY'
    : listingKind === 'CLUB'
      ? 'ORGANIZATION'
      : listingKind
);

const buildAffiliateSnapshotCandidates = (
  candidates: readonly AffiliateImportCandidates[],
): AffiliateSupplyEvidenceSnapshot['candidates'] => candidates.map((candidate) => ({
  id: candidate.id,
  status: candidate.status,
  listingKind: candidate.listingKind,
  publishedTargetId: candidate.publishedEventId
    ?? candidate.publishedTeamId
    ?? candidate.publishedFacilityId
    ?? candidate.publishedOrganizationId,
  targetType: snapshotCandidateTargetType(candidate.listingKind),
  sourceProfile: candidate.listingKind,
  evidenceRefs: stringArray(recordValue(candidate.rawPayload).evidenceRefs),
}));

const snapshotTargetDate = (value: Date | null): string | Date | null | undefined => (
  value?.toISOString?.() ?? value
);

const buildAffiliateSnapshotTargets = (
  targets: readonly AffiliateSupplyTargets[],
): AffiliateSupplyEvidenceSnapshot['targets'] => targets.map((target) => ({
  id: target.id,
  targetType: target.targetType,
  targetId: target.targetId,
  sourceProfile: target.sourceProfile,
  status: target.status,
  marketKey: target.marketKey,
  sportId: target.sportId,
  publishedAt: snapshotTargetDate(target.publishedAt),
  lastSuccessfulRefreshAt: snapshotTargetDate(target.lastSuccessfulRefreshAt),
  freshnessExpiresAt: snapshotTargetDate(target.freshnessExpiresAt),
  rejectedAt: snapshotTargetDate(target.rejectedAt),
  evidenceRefs: target.evidenceRefs,
  metadata: recordValue(target.metadata),
}));

const buildAffiliateSupplySnapshot = (input: AffiliateSupplySnapshotRows): AffiliateSupplyEvidenceSnapshot => {
  const {
    root,
    source,
    intake,
    predecessor,
    successor,
    mapping,
    mappingJob,
    approval,
    latestRun,
    candidates,
    targets,
    contract,
    now,
  } = input;
  const mappingJson = recordValue(mapping?.mapping);
  const mappingMetadata = recordValue(mappingJson.metadata);
  const mappingEvidence = recordValue(mappingJson.evidence);
  const mappingJobSummary = recordValue(mappingJob?.resultSummary);
  const approvalDecision = recordValue(approval?.decision);
  const runLogs = recordValue(latestRun?.logs);
  const sourceMetadata = recordValue(source?.metadata);
  const lifecycleEvidenceKinds = Array.from(new Set([
    ...stringArray(sourceMetadata.lifecycleEvidenceKinds),
    ...stringArray(sourceMetadata.evidenceKinds),
    ...stringArray(mappingJobSummary.lifecycleEvidenceKinds),
    ...stringArray(mappingJobSummary.evidenceKinds),
    ...stringArray(approvalDecision.lifecycleEvidenceKinds),
    ...stringArray(approvalDecision.evidenceKinds),
    ...stringArray(runLogs.lifecycleEvidenceKinds),
    ...stringArray(runLogs.evidenceKinds),
  ]));
  const supplySourceId = String(root.id);
  return {
    now,
    contract,
    supplySourceId,
    source: buildAffiliateSnapshotSource(input, supplySourceId, sourceMetadata, mapping),
    intake: intake
      ? { id: intake.id, status: intake.status, complianceStatus: intake.complianceStatus }
      : null,
    mapping: buildAffiliateSnapshotMapping(mapping),
    mappingJob: buildAffiliateSnapshotMappingJob(mappingJob),
    approval: buildAffiliateSnapshotApproval(approval),
    latestRun: buildAffiliateSnapshotRun(latestRun, runLogs),
    baseline: sourceMetadata[AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY] ?? null,
    lifecycleEvidenceKinds,
    identityViolations: buildAffiliateSnapshotIdentityViolations(input, supplySourceId),
    candidates: buildAffiliateSnapshotCandidates(candidates),
    targets: buildAffiliateSnapshotTargets(targets),
  };
};
const targetCellsForAssessment = (
  assessment: AffiliateSupplyAssessment,
): AffiliateSupplyContractImpactCell[] => assessment.targets.map((target) => ({
  marketKey: target.marketKey ?? null,
  sportId: target.sportId ?? null,
  sourceProfile: String(target.sourceProfile ?? ''),
}));

const freshTargetCellsForAssessment = (
  assessment: AffiliateSupplyAssessment,
): AffiliateSupplyContractImpactCell[] => {
  if (assessment.stage !== 'PUBLISHED') return [];
  const qualifyingTargetIds = new Set(assessment.qualifyingTargetIds);
  return assessment.targets
    .filter((target) => qualifyingTargetIds.has(target.targetId))
    .map((target) => ({
      marketKey: target.marketKey ?? null,
      sportId: target.sportId ?? null,
      sourceProfile: String(target.sourceProfile ?? ''),
    }));
};

type AffiliateSnapshotLineage = Readonly<{
  source: AffiliateScrapeSources | null;
  intake: AffiliateSourceIntakes | null;
  predecessor: AffiliateSupplySources | null;
  successor: AffiliateSupplySources | null;
}>;

const loadSnapshotLineage = async (
  database: AffiliateSupplyDatabase,
  root: AffiliateSupplySources,
  supplySourceId: string,
): Promise<AffiliateSnapshotLineage> => {
  const [source, intake, predecessor, successor] = await Promise.all([
    root.liveSourceId
      ? database.sources.findUnique({ where: { id: root.liveSourceId } })
      : database.sources.findFirst({
        where: { supplySourceId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    root.intakeId
      ? database.intakes.findUnique({ where: { id: root.intakeId } })
      : database.intakes.findFirst({
        where: { supplySourceId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    root.predecessorId
      ? database.supplySources.findUnique({ where: { id: root.predecessorId } })
      : Promise.resolve(null),
    root.successorId
      ? database.supplySources.findUnique({ where: { id: root.successorId } })
      : Promise.resolve(null),
  ]);
  return { source, intake, predecessor, successor };
};

type AffiliateSnapshotRecords = Readonly<{
  mapping: AffiliateScrapeMappings | null;
  mappingJob: AffiliateSourceMappingJobs | null;
  approval: AffiliateApprovalJobs | null;
  latestRun: AffiliateScrapeRuns | null;
  candidates: AffiliateImportCandidates[];
  targets: AffiliateSupplyTargets[];
}>;

const loadSnapshotRecords = async (
  database: AffiliateSupplyDatabase,
  supplySourceId: string,
  sourceId: string,
  activeMappingId?: string | null,
  excludeRunId?: string | null,
): Promise<AffiliateSnapshotRecords> => {
  const [mapping, mappingJob, approval, latestRun, candidates, targets] = await Promise.all([
    activeMappingId
      ? database.mappings.findUnique({ where: { id: activeMappingId } })
      : database.mappings.findFirst({
        where: { supplySourceId },
        orderBy: [{ isActive: 'desc' }, { version: 'desc' }, { id: 'asc' }],
      }),
    database.mappingJobs.findFirst({
      where: { OR: [{ supplySourceId }, { sourceId }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    database.approvals.findFirst({
      where: { supplySourceId, subjectType: 'MAPPING_PACKAGE' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
    database.runs.findFirst({
      where: {
        AND: [
          { OR: [{ supplySourceId }, { sourceId }] },
          ...(excludeRunId ? [{ NOT: { id: excludeRunId } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    database.candidates.findMany({
      where: { OR: [{ supplySourceId }, { sourceId }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    database.targets.findMany({
      where: { supplySourceId },
      orderBy: [{ targetType: 'asc' }, { targetId: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return { mapping, mappingJob, approval, latestRun, candidates, targets };
};

const loadSnapshot = async (
  database: AffiliateSupplyDatabase,
  supplySourceId: string,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
  excludeRunId?: string | null,
): Promise<AffiliateSupplyEvidenceSnapshot> => {
  const root = await database.supplySources.findUnique({ where: { id: supplySourceId } });
  if (!root) throw new Error('Affiliate Supply Source not found.');
  const lineage = await loadSnapshotLineage(database, root, supplySourceId);
  const sourceId = lineage.source?.id ?? root.liveSourceId ?? `supply-source:${supplySourceId}`;
  const records = await loadSnapshotRecords(
    database,
    supplySourceId,
    sourceId,
    lineage.source?.activeMappingId,
    excludeRunId,
  );
  return buildAffiliateSupplySnapshot({
    root,
    ...lineage,
    ...records,
    contract,
    now,
  });
};
type AffiliateSnapshotBatchRows = Readonly<{
  sources: AffiliateScrapeSources[];
  intakes: AffiliateSourceIntakes[];
  mappings: AffiliateScrapeMappings[];
  mappingJobs: AffiliateSourceMappingJobs[];
  approvals: AffiliateApprovalJobs[];
  runs: AffiliateScrapeRuns[];
  candidates: AffiliateImportCandidates[];
  targets: AffiliateSupplyTargets[];
  linkedRoots: AffiliateSupplySources[];
}>;

const affiliateSnapshotUniqueIds = (
  values: readonly (string | null | undefined)[],
): string[] => Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const loadSnapshotBatchRows = async (
  database: AffiliateSupplyDatabase,
  roots: readonly AffiliateSupplySources[],
): Promise<AffiliateSnapshotBatchRows> => {
  const supplySourceIds = affiliateSnapshotUniqueIds(roots.map((root) => String(root.id)));
  const sourceIds = affiliateSnapshotUniqueIds(roots.map((root) => root.liveSourceId));
  const intakeIds = affiliateSnapshotUniqueIds(roots.map((root) => root.intakeId));
  const predecessorIds = affiliateSnapshotUniqueIds(roots.map((root) => root.predecessorId));
  const successorIds = affiliateSnapshotUniqueIds(roots.map((root) => root.successorId));
  const linkedRootIds = affiliateSnapshotUniqueIds([...predecessorIds, ...successorIds]);
  const [sources, intakes, mappings, mappingJobs, approvals, runs, candidates, targets, linkedRoots] = await Promise.all([
    database.sources.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ id: { in: sourceIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    database.intakes.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(intakeIds.length ? [{ id: { in: intakeIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    database.mappings.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      orderBy: [{ isActive: 'desc' }, { version: 'desc' }, { id: 'asc' }],
    }),
    database.mappingJobs.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    database.approvals.findMany({
      where: { supplySourceId: { in: supplySourceIds }, subjectType: 'MAPPING_PACKAGE' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
    database.runs.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    database.candidates.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    database.targets.findMany({
      where: { supplySourceId: { in: supplySourceIds } },
      orderBy: [{ targetType: 'asc' }, { targetId: 'asc' }, { id: 'asc' }],
    }),
    database.supplySources.findMany({
      where: { id: { in: linkedRootIds } },
    }),
  ]);
  return { sources, intakes, mappings, mappingJobs, approvals, runs, candidates, targets, linkedRoots };
};

const firstAffiliateSnapshotRow = <T>(
  rows: readonly T[],
  predicate: (row: T) => boolean,
): T | null => rows.find(predicate) ?? null;

const affiliateSnapshotValueAt = (row: unknown, field: string): unknown => (
  row && typeof row === 'object' && field in row
    ? (row as Record<string, unknown>)[field]
    : undefined
);

const affiliateSnapshotDateValue = (value: unknown): number => (
  value instanceof Date
    ? value.getTime()
    : value ? new Date(String(value)).getTime() : Number.NEGATIVE_INFINITY
);

const sortAffiliateSnapshotDateDesc = <T>(
  left: T,
  right: T,
  field: string,
): number => {
  const timeOrder = affiliateSnapshotDateValue(affiliateSnapshotValueAt(right, field))
    - affiliateSnapshotDateValue(affiliateSnapshotValueAt(left, field));
  return timeOrder || codeUnitCompare(
    String(affiliateSnapshotValueAt(left, 'id') ?? ''),
    String(affiliateSnapshotValueAt(right, 'id') ?? ''),
  );
};

const sortAffiliateSnapshotDateAsc = <T>(
  left: T,
  right: T,
  field: string,
): number => {
  const timeOrder = affiliateSnapshotDateValue(affiliateSnapshotValueAt(left, field))
    - affiliateSnapshotDateValue(affiliateSnapshotValueAt(right, field));
  return timeOrder || codeUnitCompare(
    String(affiliateSnapshotValueAt(left, 'id') ?? ''),
    String(affiliateSnapshotValueAt(right, 'id') ?? ''),
  );
};

const sortAffiliateSnapshotMappings = (
  left: AffiliateScrapeMappings,
  right: AffiliateScrapeMappings,
): number => Number(right.isActive) - Number(left.isActive)
  || Number(right.version ?? 0) - Number(left.version ?? 0)
  || codeUnitCompare(String(left.id), String(right.id));

const sortAffiliateSnapshotCandidates = (
  left: AffiliateImportCandidates,
  right: AffiliateImportCandidates,
): number => sortAffiliateSnapshotDateAsc(left, right, 'createdAt')
  || codeUnitCompare(String(left.id), String(right.id));

const sortAffiliateSnapshotTargets = (
  left: AffiliateSupplyTargets,
  right: AffiliateSupplyTargets,
): number => codeUnitCompare(String(left.targetType), String(right.targetType))
  || codeUnitCompare(String(left.targetId), String(right.targetId))
  || codeUnitCompare(String(left.id), String(right.id));

type AffiliateSnapshotBatchSelection = Readonly<{
  source: AffiliateScrapeSources | null;
  intake: AffiliateSourceIntakes | null;
  predecessor: AffiliateSupplySources | null;
  successor: AffiliateSupplySources | null;
  mapping: AffiliateScrapeMappings | null;
  mappingJob: AffiliateSourceMappingJobs | null;
  approval: AffiliateApprovalJobs | null;
  latestRun: AffiliateScrapeRuns | null;
  candidates: AffiliateImportCandidates[];
  targets: AffiliateSupplyTargets[];
}>;

const selectAffiliateSnapshotBatchLineage = (
  root: AffiliateSupplySources,
  rows: AffiliateSnapshotBatchRows,
  rootId: string,
): Pick<AffiliateSnapshotBatchSelection, 'source' | 'intake' | 'predecessor' | 'successor'> => ({
  source: root.liveSourceId
    ? firstAffiliateSnapshotRow(rows.sources, (row) => row.id === root.liveSourceId)
    : firstAffiliateSnapshotRow(rows.sources, (row) => row.supplySourceId === rootId),
  intake: root.intakeId
    ? firstAffiliateSnapshotRow(rows.intakes, (row) => row.id === root.intakeId)
    : firstAffiliateSnapshotRow(rows.intakes, (row) => row.supplySourceId === rootId),
  predecessor: root.predecessorId
    ? firstAffiliateSnapshotRow(rows.linkedRoots, (row) => row.id === root.predecessorId)
    : null,
  successor: root.successorId
    ? firstAffiliateSnapshotRow(rows.linkedRoots, (row) => row.id === root.successorId)
    : null,
});

const selectAffiliateSnapshotBatchRecords = (
  root: AffiliateSupplySources,
  rows: AffiliateSnapshotBatchRows,
  rootId: string,
  sourceId: string,
): Pick<AffiliateSnapshotBatchSelection, 'mapping' | 'mappingJob' | 'approval' | 'latestRun' | 'candidates' | 'targets'> => {
  const rootMappings = rows.mappings
    .filter((row) => row.supplySourceId === rootId || row.sourceId === sourceId)
    .sort(sortAffiliateSnapshotMappings);
  const mapping = root.liveSourceId
    ? firstAffiliateSnapshotRow(rootMappings, (row) => row.id === rows.sources.find((source) => source.id === root.liveSourceId)?.activeMappingId)
    : rootMappings[0] ?? null;
  const mappingJobs = rows.mappingJobs
    .filter((row) => row.supplySourceId === rootId || row.sourceId === sourceId)
    .sort((left, right) => sortAffiliateSnapshotDateDesc(left, right, 'createdAt'));
  const approvals = rows.approvals
    .filter((row) => row.supplySourceId === rootId && row.subjectType === 'MAPPING_PACKAGE')
    .sort((left, right) => sortAffiliateSnapshotDateDesc(left, right, 'updatedAt'));
  const runs = rows.runs
    .filter((row) => row.supplySourceId === rootId || row.sourceId === sourceId)
    .sort((left, right) => sortAffiliateSnapshotDateDesc(left, right, 'createdAt'));
  const candidates = rows.candidates
    .filter((row) => row.supplySourceId === rootId || row.sourceId === sourceId)
    .sort(sortAffiliateSnapshotCandidates);
  const targets = rows.targets
    .filter((row) => row.supplySourceId === rootId)
    .sort(sortAffiliateSnapshotTargets);
  return {
    mapping,
    mappingJob: mappingJobs[0] ?? null,
    approval: approvals[0] ?? null,
    latestRun: runs[0] ?? null,
    candidates,
    targets,
  };
};

const buildAffiliateSnapshotBatchRoot = (
  root: AffiliateSupplySources,
  rows: AffiliateSnapshotBatchRows,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): AffiliateSupplyEvidenceSnapshot => {
  const rootId = String(root.id);
  const lineage = selectAffiliateSnapshotBatchLineage(root, rows, rootId);
  const sourceId = lineage.source?.id ?? root.liveSourceId ?? `supply-source:${rootId}`;
  const records = selectAffiliateSnapshotBatchRecords(root, rows, rootId, sourceId);
  return buildAffiliateSupplySnapshot({
    root,
    ...lineage,
    ...records,
    contract,
    now,
  });
};

const loadSnapshotBatch = async (
  database: AffiliateSupplyDatabase,
  roots: readonly AffiliateSupplySources[],
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): Promise<Map<string, AffiliateSupplyEvidenceSnapshot>> => {
  const rows = await loadSnapshotBatchRows(database, roots);
  const snapshots = new Map<string, AffiliateSupplyEvidenceSnapshot>();
  for (const root of roots) {
    const snapshot = buildAffiliateSnapshotBatchRoot(root, rows, contract, now);
    snapshots.set(String(root.id), snapshot);
  }
  return snapshots;
};

const hasSnapshotBatchDelegates = (database: AffiliateSupplyDatabase): boolean => [
  database.sources?.findMany,
  database.intakes?.findMany,
  database.mappings?.findMany,
  database.mappingJobs?.findMany,
  database.approvals?.findMany,
  database.runs?.findMany,
  database.candidates?.findMany,
  database.supplySources?.findMany,
].every((delegate) => typeof delegate === 'function');

const loadSnapshots = async (
  database: AffiliateSupplyDatabase,
  roots: readonly AffiliateSupplySources[],
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): Promise<Map<string, AffiliateSupplyEvidenceSnapshot>> => {
  if (!roots.length) return new Map();
  const orderedRoots = [...roots].sort((left, right) => codeUnitCompare(String(left.id), String(right.id)));
  if (!hasSnapshotBatchDelegates(database)) {
    const snapshots = await Promise.all(orderedRoots.map((root) => loadSnapshot(
      database,
      root.id,
      contract,
      now,
    )));
    return new Map(orderedRoots.map((root, index) => [String(root.id), snapshots[index]]));
  }
  const snapshots = new Map<string, AffiliateSupplyEvidenceSnapshot>();
  for (const rootBatch of chunksOf(orderedRoots, AFFILIATE_RECONCILIATION_QUERY_BATCH_SIZE)) {
    const batchSnapshots = await loadSnapshotBatch(database, rootBatch, contract, now);
    batchSnapshots.forEach((snapshot, rootId) => snapshots.set(rootId, snapshot));
  }
  return snapshots;
};

type AffiliateSupplyInvariantAlertContract = Pick<
  AffiliateSupplyContractPolicy,
  'rolloutCohort' | 'version' | 'hash'
>;

const invariantAlertInputsFor = (
  assessment: AffiliateSupplyAssessment,
  contract: AffiliateSupplyInvariantAlertContract,
): AffiliateOperationalAlertInput[] => assessment.invariantViolations.map((reason) => ({
  eventKey: `affiliate-supply-invariant:${assessment.supplySourceId}:${assessment.lifecycleGeneration}:${reason}`,
  category: 'SUPPLY_SOURCE_INVARIANT',
  severity: 'critical',
  title: 'Affiliate Supply Source invariant violation',
  detail: `Supply Source ${assessment.supplySourceId} recorded invariant violation: ${reason}`,
  subjectType: 'AFFILIATE_SUPPLY_SOURCE',
  subjectId: assessment.supplySourceId,
  rolloutCohort: contract.rolloutCohort,
  contractVersion: contract.version,
  lifecycleGeneration: assessment.lifecycleGeneration,
  reasonCodes: [reason],
  evidenceRefs: assessment.evidenceRefs,
  payload: {
    contractHash: contract.hash,
    assessedAt: assessment.assessedAt,
    invariantViolation: reason,
  },
}));

const emitPersistedInvariantAlerts = async (
  assessment: AffiliateSupplyAssessment,
  contract: AffiliateSupplyInvariantAlertContract,
  writer: AffiliateSupplyOperationalAlertWriter | undefined,
): Promise<void> => {
  const inputs = invariantAlertInputsFor(assessment, contract);
  if (inputs.length === 0) return;
  await (writer ?? emitAffiliateOperationalAlerts)(inputs);
};

export const emitAffiliateSupplyLifecycleTransitionAlerts = async (
  transition: Pick<
    AffiliateSupplyLifecycleTransitions,
    "requestJson" | "resultJson"
  >,
  writer: AffiliateSupplyOperationalAlertWriter | undefined,
): Promise<void> => {
  if (!writer) return;
  const alertContract = readAffiliateLifecycleAlertContractIntent(
    recordValue(transition.requestJson),
  );
  if (!alertContract) return;
  const assessment = recordValue(transition.resultJson) as unknown as AffiliateSupplyAssessment;
  await emitPersistedInvariantAlerts(assessment, alertContract, writer);
};
const persistAffiliateSupplyAssessment = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  snapshot: AffiliateSupplyEvidenceSnapshot;
  assessment: AffiliateSupplyAssessment;
  contract: AffiliateSupplyContractPolicy;
  now: Date;
  isOperationalAlertEmissionEnabled?: boolean;
  operationalAlert?: AffiliateSupplyOperationalAlertWriter;
}>): Promise<AffiliateSupplyAssessment> => {
  if (!input.database.supplySources?.update) return input.assessment;
  await input.database.supplySources.update({
    where: { id: input.assessment.supplySourceId },
    data: {
      derivedStage: input.assessment.stage,
      derivedOutcome: input.assessment.outcome,
      freshnessStatus: input.assessment.freshnessStatus,
      targetContribution: input.assessment.targetContribution,
      repairPriority: input.assessment.repairPriority,
      isAutomationEnabled: input.assessment.isAutomationEnabled,
      isExcluded: input.assessment.stage === 'SOURCE_EXCLUDED',
      automationHoldReason: input.assessment.automationHoldReason,
      lastSuccessfulRefreshAt: input.snapshot.latestRun && isSuccessStatus(input.snapshot.latestRun.status)
        ? toDate(input.snapshot.latestRun.finishedAt)
        : undefined,
      lastAssessmentAt: input.now,
      assessmentJson: prismaJsonValue(input.assessment),
      invariantViolations: [...input.assessment.invariantViolations],
      activeSupplyContractVersion: input.contract.version,
      activeSupplyContractHash: input.contract.hash,
    },
  });
  if (input.isOperationalAlertEmissionEnabled !== false) {
    await emitPersistedInvariantAlerts(
      input.assessment,
      input.contract,
      input.operationalAlert,
    );
  }
  return input.assessment;
};

export const deriveAndPersistAffiliateSupplyAssessment = async (input: Readonly<{
  supplySourceId: string;
  contract?: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  isOperationalAlertEmissionEnabled?: boolean;
  operationalAlert?: AffiliateSupplyOperationalAlertWriter;
}>): Promise<AffiliateSupplyAssessment> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const contractResult = input.contract
    ? { policy: input.contract }
    : await (async () => {
      const source = await database.supplySources.findUnique({
        where: { id: input.supplySourceId },
        select: { rolloutCohort: true },
      });
      if (!source) throw new Error('Affiliate Supply Source not found.');
      return loadActiveAffiliateSupplyContract({
        db: database,
        rolloutCohort: source.rolloutCohort,
      });
    })();
  const snapshot = await loadSnapshot(database, input.supplySourceId, contractResult.policy, now);
  const assessment = deriveAffiliateSupplyAssessment(snapshot);
  return persistAffiliateSupplyAssessment({
    database,
    snapshot,
    assessment,
    contract: contractResult.policy,
    now,
    isOperationalAlertEmissionEnabled: input.isOperationalAlertEmissionEnabled,
    operationalAlert: input.operationalAlert,
  });
};

export const reconcileAffiliateSupplySource = deriveAndPersistAffiliateSupplyAssessment;

type AffiliateSupplyReviewedTargetProjection = Pick<
  AffiliateLegacyTargetProjection,
  | 'candidateId'
  | 'sourceProfile'
  | 'marketKey'
  | 'sportId'
  | 'publishedAt'
  | 'lastSuccessfulRefreshAt'
  | 'freshnessExpiresAt'
  | 'rejectedAt'
  | 'rejectionReason'
  | 'metadata'
  | 'evidenceHash'
  | 'evidenceRefs'
>;

type AffiliateSupplyTargetUpsertInput = Readonly<{
  id?: string;
  supplySourceId: string;
  targetType: string;
  targetId: string;
  sourceProfile: string;
  candidateId?: string | null;
  marketKey?: string | null;
  sportId?: string | null;
  status?: 'PUBLISHED' | 'LAST_KNOWN_GOOD' | 'REJECTED' | 'EXPIRED';
  refreshedAt?: Date | null;
  evidenceRefs?: readonly string[];
  rejectionReason?: string | null;
  metadata?: Record<string, unknown> | null;
  reviewedProjection?: AffiliateSupplyReviewedTargetProjection;
  contract?: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
}>;

const affiliateTargetFreshnessExpiry = (
  status: AffiliateSupplyTargetUpsertInput['status'],
  refreshedAt: Date,
  maximumAgeHours: number,
): Date | null => status === 'PUBLISHED'
  ? new Date(refreshedAt.getTime() + maximumAgeHours * 60 * 60 * 1000)
  : null;

const affiliateTargetCreateIdentityData = (
  input: AffiliateSupplyTargetUpsertInput,
  reviewed: AffiliateSupplyReviewedTargetProjection | undefined,
) => ({
  candidateId: reviewed ? reviewed.candidateId : input.candidateId ?? null,
  targetType: input.targetType,
  targetId: input.targetId,
  marketKey: reviewed ? reviewed.marketKey : input.marketKey ?? null,
  sportId: reviewed ? reviewed.sportId : input.sportId ?? null,
});

const affiliateTargetCreateDates = (
  status: NonNullable<AffiliateSupplyTargetUpsertInput['status']>,
  reviewed: AffiliateSupplyReviewedTargetProjection | undefined,
  refreshedAt: Date,
  maximumAgeHours: number,
): Record<string, Date | string | null> => {
  if (reviewed) {
    return {
      publishedAt: reviewed.publishedAt,
      lastSuccessfulRefreshAt: reviewed.lastSuccessfulRefreshAt,
      freshnessExpiresAt: reviewed.freshnessExpiresAt,
      rejectedAt: reviewed.rejectedAt,
    };
  }
  return {
    publishedAt: status === 'PUBLISHED' ? refreshedAt : null,
    lastSuccessfulRefreshAt: status === 'PUBLISHED' ? refreshedAt : null,
    freshnessExpiresAt: affiliateTargetFreshnessExpiry(status, refreshedAt, maximumAgeHours),
    rejectedAt: status === 'REJECTED' ? refreshedAt : null,
  };
};

const affiliateTargetCreateReviewData = (
  input: AffiliateSupplyTargetUpsertInput,
  reviewed: AffiliateSupplyReviewedTargetProjection | undefined,
): Record<string, unknown> => ({
  rejectionReason: reviewed ? reviewed.rejectionReason : input.rejectionReason ?? null,
  evidenceRefs: Array.from(new Set(reviewed?.evidenceRefs ?? input.evidenceRefs ?? [])),
  evidenceHash: reviewed?.evidenceHash ?? null,
  metadata: prismaNullableJsonValue(reviewed ? reviewed.metadata : input.metadata),
});

const buildAffiliateTargetCreateData = (
  input: AffiliateSupplyTargetUpsertInput,
  status: NonNullable<AffiliateSupplyTargetUpsertInput['status']>,
  refreshedAt: Date,
  maximumAgeHours: number,
) => {
  const reviewed = input.reviewedProjection;
  return {
    id: input.id ?? createId(),
    supplySourceId: input.supplySourceId,
    ...affiliateTargetCreateIdentityData(input, reviewed),
    sourceProfile: reviewed?.sourceProfile ?? input.sourceProfile,
    status,
    ...affiliateTargetCreateDates(status, reviewed, refreshedAt, maximumAgeHours),
    ...affiliateTargetCreateReviewData(input, reviewed),
  };
};
const affiliateTargetUpdateDates = (
  input: AffiliateSupplyTargetUpsertInput,
  status: NonNullable<AffiliateSupplyTargetUpsertInput['status']>,
  refreshedAt: Date,
  maximumAgeHours: number,
): {
  publishedAt: Date | string | null | undefined;
  lastSuccessfulRefreshAt: Date | string | null | undefined;
  freshnessExpiresAt: Date | string | null | undefined;
  rejectedAt: Date | string | null | undefined;
} => input.reviewedProjection
  ? {
    publishedAt: input.reviewedProjection.publishedAt,
    lastSuccessfulRefreshAt: input.reviewedProjection.lastSuccessfulRefreshAt,
    freshnessExpiresAt: input.reviewedProjection.freshnessExpiresAt,
    rejectedAt: input.reviewedProjection.rejectedAt,
  }
  : {
    publishedAt: status === 'PUBLISHED' ? refreshedAt : undefined,
    lastSuccessfulRefreshAt: status === 'PUBLISHED' ? refreshedAt : undefined,
    freshnessExpiresAt: status === 'PUBLISHED'
      ? affiliateTargetFreshnessExpiry(status, refreshedAt, maximumAgeHours) ?? undefined
      : undefined,
    rejectedAt: status === 'REJECTED' ? refreshedAt : undefined,
  };

const affiliateTargetUpdateIdentityData = (
  input: AffiliateSupplyTargetUpsertInput,
  reviewed: AffiliateSupplyReviewedTargetProjection | undefined,
): Record<string, unknown> => ({
  candidateId: reviewed ? reviewed.candidateId : input.candidateId ?? undefined,
  marketKey: reviewed ? reviewed.marketKey : input.marketKey ?? undefined,
  sportId: reviewed ? reviewed.sportId : input.sportId ?? undefined,
  sourceProfile: reviewed ? reviewed.sourceProfile ?? input.sourceProfile : undefined,
});

const affiliateTargetUpdateReviewData = (
  input: AffiliateSupplyTargetUpsertInput,
  reviewed: AffiliateSupplyReviewedTargetProjection | undefined,
): Record<string, unknown> => ({
  rejectionReason: reviewed ? reviewed.rejectionReason : input.rejectionReason ?? undefined,
  evidenceRefs: Array.from(new Set(reviewed?.evidenceRefs ?? input.evidenceRefs ?? [])),
  evidenceHash: reviewed ? reviewed.evidenceHash : undefined,
  metadata: reviewed
    ? prismaNullableJsonValue(reviewed.metadata)
    : input.metadata == null ? undefined : prismaJsonValue(input.metadata),
});

const buildAffiliateTargetUpdateData = (
  input: AffiliateSupplyTargetUpsertInput,
  status: NonNullable<AffiliateSupplyTargetUpsertInput['status']>,
  refreshedAt: Date,
  maximumAgeHours: number,
) => {
  const reviewed = input.reviewedProjection;
  return {
    ...affiliateTargetUpdateIdentityData(input, reviewed),
    status,
    ...affiliateTargetUpdateDates(input, status, refreshedAt, maximumAgeHours),
    ...affiliateTargetUpdateReviewData(input, reviewed),
  };
};


export const upsertAffiliateSupplyTarget = async (
  input: AffiliateSupplyTargetUpsertInput,
): Promise<AffiliateSupplyTargets | null> => {
  const database = input.db ?? affiliateSupplyDatabase();
  if (!database.targets?.upsert) return null;
  const refreshedAt = input.refreshedAt ?? new Date();
  const maximumAgeHours = input.contract?.freshnessWindows.find(
    (window) => window.sourceProfile.toUpperCase() === input.sourceProfile.toUpperCase(),
  )?.maximumAgeHours ?? 24;
  const status = input.status ?? 'PUBLISHED';
  return database.targets.upsert({
    where: {
      supplySourceId_targetType_targetId: {
        supplySourceId: input.supplySourceId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    },
    create: buildAffiliateTargetCreateData(input, status, refreshedAt, maximumAgeHours),
    update: buildAffiliateTargetUpdateData(input, status, refreshedAt, maximumAgeHours),
  });
};

export type AffiliateSupplyTransitionInput = Readonly<{
  supplySourceId: string;
  command: AffiliateSupplyLifecycleCommand;
  idempotencyKey: string;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  expectedGeneration: number;
  contractVersion: number;
  contractHash: string;
  actorKind: AffiliateSupplyLifecycleActorKind;
  actorId: string;
  executingAgentId?: string | null;
  fromStage?: AffiliateSupplyLifecycleStage | null;
  toStage: AffiliateSupplyLifecycleStage;
  outcome?: AffiliateSupplyLifecycleOutcome | null;
  reasonCodes?: readonly string[];
  evidenceRefs?: readonly string[];
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>;
const AFFILIATE_LIFECYCLE_ALERT_INTENT_KEY = '__affiliateInvariantAlertContract';

const affiliateLifecycleRequestWithoutAlertIntent = (
  request: Record<string, unknown>,
): Record<string, unknown> => {
  const requestWithoutAlertIntent = { ...request };
  delete requestWithoutAlertIntent[AFFILIATE_LIFECYCLE_ALERT_INTENT_KEY];
  return requestWithoutAlertIntent;
};

const readAffiliateLifecycleAlertContractIntent = (
  request: Record<string, unknown>,
): AffiliateSupplyInvariantAlertContract | null => {
  const intent = recordValue(request)[AFFILIATE_LIFECYCLE_ALERT_INTENT_KEY];
  const object = recordValue(intent);
  const rolloutCohort = stringValue(object.rolloutCohort);
  const hash = stringValue(object.hash);
  const version = object.version;
  if (
    !rolloutCohort
    || !hash
    || typeof version !== 'number'
    || !Number.isInteger(version)
    || version <= 0
  ) return null;
  return { rolloutCohort, version, hash };
};

const affiliateLifecycleAlertContractFallback = async (
  transactionDatabase: AffiliateSupplyDatabase,
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
  existing: AffiliateSupplyLifecycleTransitions,
  result: AffiliateSupplyAssessment,
): Promise<AffiliateSupplyInvariantAlertContract | null> => {
  if (!result.invariantViolations.length) return null;
  const requestRolloutCohort = stringValue(request.rolloutCohort);
  const inputRolloutCohort = stringValue(input.rolloutCohort);
  const root = !requestRolloutCohort && !inputRolloutCohort
    && transactionDatabase.supplySources?.findUnique
    ? await transactionDatabase.supplySources.findUnique({
      where: { id: existing.supplySourceId ?? input.supplySourceId },
      select: { rolloutCohort: true },
    })
    : null;
  const rolloutCohort = inputRolloutCohort
    ?? requestRolloutCohort
    ?? stringValue(recordValue(root).rolloutCohort);
  if (!rolloutCohort) return null;
  return {
    rolloutCohort,
    version: Number(existing.contractVersion),
    hash: String(existing.contractHash),
  };
};

const affiliateLifecycleRequestHash = (input: Readonly<{
  supplySourceId: string;
  command: AffiliateSupplyLifecycleCommand;
  contractVersion: number;
  contractHash: string;
  request: Record<string, unknown>;
}>): string => hashAffiliateAgentValue({
  supplySourceId: input.supplySourceId,
  command: input.command,
  contractVersion: input.contractVersion,
  contractHash: input.contractHash,
  request: normalizeAffiliateLifecycleJson(
    affiliateLifecycleRequestWithoutAlertIntent(input.request),
  ),
});
const replayAffiliateSupplyTransition = (
  existing: AffiliateSupplyLifecycleTransitions,
  input: AffiliateSupplyTransitionInput,
  requestHash: string,
  resultHash: string,
): { transition: AffiliateSupplyLifecycleTransitions; isReplayed: boolean } => {
  const storedRequestHash = affiliateLifecycleRequestHash({
    supplySourceId: String(existing.supplySourceId ?? input.supplySourceId),
    command: String(existing.command ?? input.command) as AffiliateSupplyLifecycleCommand,
    contractVersion: Number(existing.contractVersion ?? input.contractVersion),
    contractHash: String(existing.contractHash ?? input.contractHash),
    request: recordValue(existing.requestJson),
  });
  if (storedRequestHash !== requestHash || existing.resultHash !== resultHash) {
    throw new Error('Affiliate lifecycle idempotency key was reused with a different request or result.');
  }
  return { transition: existing, isReplayed: true };
};

const buildAffiliateSupplyTransitionData = (
  input: AffiliateSupplyTransitionInput,
  source: AffiliateSupplySources,
  latest: AffiliateSupplyLifecycleTransitions | null,
  request: Record<string, unknown>,
  requestHash: string,
  resultHash: string,
  now: Date,
) => ({
  id: createId(),
  supplySourceId: input.supplySourceId,
  sequence: (latest?.sequence ?? 0) + 1,
  generation: source.lifecycleGeneration + 1,
  command: input.command,
  contractVersion: input.contractVersion,
  resultHash,
  requestHash,
  outcome: input.outcome ?? null,
  fromStage: (input.fromStage ?? source.derivedStage) as AffiliateSupplyLifecycleStage,
  toStage: input.toStage as AffiliateSupplyLifecycleStage,
  commandRef: stringValue(request.commandRef),
  idempotencyKey: input.idempotencyKey,
  contractHash: input.contractHash,
  actorKind: input.actorKind,
  actorId: input.actorId,
  executingAgentId: input.executingAgentId ?? null,
  reasonCodes: Array.from(new Set(input.reasonCodes ?? [])),
  evidenceRefs: Array.from(new Set(input.evidenceRefs ?? [])),
  requestJson: prismaJsonValue(request),
  resultJson: prismaJsonValue(
    normalizeAffiliateLifecycleJson(input.result) as Record<string, unknown>,
  ),
  occurredAt: now,
});

const persistAffiliateSupplyTransitionInTransaction = async (
  transactionDatabase: AffiliateSupplyDatabase,
  input: AffiliateSupplyTransitionInput,
  request: Record<string, unknown>,
  requestHash: string,
  resultHash: string,
  now: Date,
): Promise<{ transition: AffiliateSupplyLifecycleTransitions; isReplayed: boolean }> => {
  const source = await transactionDatabase.supplySources.findUnique({
    where: { id: input.supplySourceId },
  });
  if (!source) throw new Error('Affiliate Supply Source not found.');
  if (source.lifecycleGeneration !== input.expectedGeneration) {
    throw new Error('Affiliate Supply Source lifecycle generation is stale.');
  }
  const latest = await transactionDatabase.transitions.findFirst({
    where: { supplySourceId: input.supplySourceId },
    orderBy: { sequence: 'desc' },
  });
  const transitionData = buildAffiliateSupplyTransitionData(
    input,
    source,
    latest,
    request,
    requestHash,
    resultHash,
    now,
  );
  const transition = await transactionDatabase.transitions.create({ data: transitionData });
  await transactionDatabase.supplySources.update({
    where: { id: input.supplySourceId },
    data: {
      lifecycleGeneration: source.lifecycleGeneration + 1,
      derivedStage: input.toStage as AffiliateSupplyLifecycleStage,
      derivedOutcome: input.outcome ?? null,
      lastAssessmentAt: now,
      activeSupplyContractVersion: input.contractVersion,
      activeSupplyContractHash: input.contractHash,
      assessmentJson: prismaJsonValue(
        normalizeAffiliateLifecycleJson(input.result) as Record<string, unknown>,
      ),
    },
  });
  return { transition, isReplayed: false };
};

const persistAffiliateSupplyTransition = async (
  database: AffiliateSupplyDatabase,
  input: AffiliateSupplyTransitionInput,
  request: Record<string, unknown>,
  requestHash: string,
  resultHash: string,
  now: Date,
): Promise<{ transition: AffiliateSupplyLifecycleTransitions; isReplayed: boolean }> => withSupplyTransaction(
  database,
  (transactionDatabase) => persistAffiliateSupplyTransitionInTransaction(
    transactionDatabase,
    input,
    request,
    requestHash,
    resultHash,
    now,
  ),
);

const recordAffiliateSupplyTransitionInTransaction = async (
  transactionDatabase: AffiliateSupplyDatabase,
  input: AffiliateSupplyTransitionInput,
  request: Record<string, unknown>,
  requestHash: string,
  resultHash: string,
  now: Date,
): Promise<{ transition: AffiliateSupplyLifecycleTransitions; isReplayed: boolean }> => {
  const existing = await transactionDatabase.transitions.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return replayAffiliateSupplyTransition(existing, input, requestHash, resultHash);
  return persistAffiliateSupplyTransitionInTransaction(
    transactionDatabase,
    input,
    request,
    requestHash,
    resultHash,
    now,
  );
};

export const recordAffiliateSupplyLifecycleTransition = async (
  input: AffiliateSupplyTransitionInput,
): Promise<{ transition: AffiliateSupplyLifecycleTransitions; isReplayed: boolean }> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const request = normalizeAffiliateLifecycleJson(input.request) as Record<string, unknown>;
  const result = normalizeAffiliateLifecycleJson(input.result) as Record<string, unknown>;
  const requestHash = affiliateLifecycleRequestHash({ ...input, request });
  const resultHash = hashAffiliateAgentValue(result);
  return withSupplyTransaction(
    database,
    (transactionDatabase) => recordAffiliateSupplyTransitionInTransaction(
      transactionDatabase,
      input,
      request,
      requestHash,
      resultHash,
      now,
    ),
  );
};

export type AffiliateSupplyLifecycleTargetWrite = Readonly<{
  targetType: string;
  targetId: string;
  sourceProfile: string;
  candidateId: string;
  evidenceRefs?: readonly string[];
  marketKey?: string | null;
  sportId?: string | null;
}>;
export type ExecuteAffiliateSupplyLifecycleCommandInput = Readonly<{
  supplySourceId: string;
  command: AffiliateSupplyLifecycleCommand;
  authority: AffiliateSupplyCommandAuthority;
  expectedLifecycleGeneration: number;
  idempotencyKey: string;
  request?: Record<string, unknown>;
  actorKind: AffiliateSupplyLifecycleActorKind;
  actorId: string;
  executingAgentId?: string | null;
  supplyContractVersion?: number;
  supplyContractHash?: string;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  operationalAlert?: AffiliateSupplyOperationalAlertWriter;
  targetWriter?: (input: Readonly<{
    database: AffiliateSupplyDatabase;
    client: AffiliateSupplyClient;
    contract: AffiliateSupplyContractPolicy;
    request: Record<string, unknown>;
    now: Date;
  }>) => Promise<AffiliateSupplyLifecycleTargetWrite>;
  activationTargetWriter?: (input: Readonly<{
    database: AffiliateSupplyDatabase;
    client: AffiliateSupplyClient;
    contract: AffiliateSupplyContractPolicy;
    request: Record<string, unknown>;
    target: Record<string, unknown>;
    candidate: Record<string, unknown>;
    now: Date;
  }>) => Promise<AffiliateSupplyLifecycleTargetWrite>;
}>;
export type AffiliateSupplyLifecycleCommandResult = Readonly<{
  assessment: AffiliateSupplyAssessment;
  transition: AffiliateSupplyLifecycleTransitions;
  isReplayed: boolean;
}>;

const commandTargets = (request: Record<string, unknown>): Record<string, unknown>[] => (
  Array.isArray(request.targets)
    ? request.targets.filter((target): target is Record<string, unknown> => (
        Boolean(target && typeof target === 'object' && !Array.isArray(target))
      ))
    : []
);

const fallbackAffiliateTargetRule = (
  contract: AffiliateSupplyContractPolicy,
  sourceProfile: string,
  marketKey: string | null,
  sportId: string | null,
): ReturnType<typeof targetRuleFor> => {
  const hasTargetCell = Boolean(marketKey || sportId);
  const candidates = contract.targets.filter((rule) => (
    rule.sourceProfile.toUpperCase() === sourceProfile.toUpperCase()
    && (!hasTargetCell || (
      (rule.marketKey == null || rule.marketKey === marketKey)
      && (rule.sportId == null || rule.sportId === sportId)
    ))
  ));
  return candidates.length === 1 ? candidates[0] : null;
};

const resolveAffiliateTargetRule = (
  contract: AffiliateSupplyContractPolicy | undefined,
  target: Record<string, unknown>,
  sourceProfile: string,
): ReturnType<typeof targetRuleFor> => {
  if (!contract) return null;
  const marketKey = stringValue(target.marketKey);
  const sportId = stringValue(target.sportId);
  return targetRuleFor(contract, { marketKey, sportId, sourceProfile })
    ?? fallbackAffiliateTargetRule(contract, sourceProfile, marketKey, sportId);
};

type AffiliateCommandTargetIdentity = Readonly<{
  targetType: string;
  targetId: string;
  sourceProfile: string;
}>;

const affiliateCommandTargetIdentity = (
  target: Record<string, unknown>,
): AffiliateCommandTargetIdentity => {
  const targetType = stringValue(target.targetType);
  const targetId = stringValue(target.targetId);
  const sourceProfile = stringValue(target.sourceProfile) ?? targetType;
  if (!targetType || !targetId || !sourceProfile) {
    throw new Error('Affiliate lifecycle target writes require target type, target ID, and source profile.');
  }
  return { targetType, targetId, sourceProfile };
};

const buildAffiliateCommandTargetUpsertInput = (
  identity: AffiliateCommandTargetIdentity,
  supplySourceId: string,
  target: Record<string, unknown>,
  targetRule: ReturnType<typeof targetRuleFor>,
  now: Date,
  defaultEvidenceRefs: readonly string[],
  contract?: AffiliateSupplyContractPolicy,
): AffiliateSupplyTargetUpsertInput => ({
  supplySourceId,
  targetType: identity.targetType,
  targetId: identity.targetId,
  sourceProfile: identity.sourceProfile,
  candidateId: stringValue(target.candidateId),
  marketKey: stringValue(target.marketKey) ?? targetRule?.marketKey ?? null,
  sportId: stringValue(target.sportId) ?? targetRule?.sportId ?? null,
  status: (stringValue(target.status)?.toUpperCase() as 'PUBLISHED' | 'LAST_KNOWN_GOOD' | 'REJECTED' | 'EXPIRED' | null) ?? 'PUBLISHED',
  refreshedAt: now,
  evidenceRefs: [
    ...defaultEvidenceRefs,
    ...stringArray(target.evidenceRefs),
  ],
  rejectionReason: stringValue(target.rejectionReason),
  metadata: recordValue(target.metadata),
  contract,
});
const affiliateCommandTargetTypeForSourceProfile = (sourceProfile: string): string | null => (
  ({
    EVENT: 'EVENT',
    TEAM: 'TEAM',
    RENTAL: 'FACILITY',
    CLUB: 'ORGANIZATION',
  } as Readonly<Record<string, string>>)[sourceProfile.toUpperCase()] ?? null
);

const assertAffiliateCommandTargetProjection = (
  identity: AffiliateCommandTargetIdentity,
): void => {
  const expectedTargetType = affiliateCommandTargetTypeForSourceProfile(identity.sourceProfile);
  if (!expectedTargetType || identity.targetType.toUpperCase() !== expectedTargetType) {
    throw new Error('Affiliate lifecycle target writes require a supported target type for the source profile.');
  }
};

const applyCommandTarget = async (
  database: AffiliateSupplyDatabase,
  supplySourceId: string,
  target: Record<string, unknown>,
  now: Date,
  defaultEvidenceRefs: readonly string[],
  contract?: AffiliateSupplyContractPolicy,
): Promise<void> => {
  const identity = affiliateCommandTargetIdentity(target);
  assertAffiliateCommandTargetProjection(identity);
  const targetRule = resolveAffiliateTargetRule(contract, target, identity.sourceProfile);
  if (contract && !targetRule) {
    throw new Error('Affiliate lifecycle target writes require a matching Supply Contract target cell.');
  }
  await upsertAffiliateSupplyTarget({
    ...buildAffiliateCommandTargetUpsertInput(
      identity,
      supplySourceId,
      target,
      targetRule,
      now,
      defaultEvidenceRefs,
      contract,
    ),
    db: database,
  });
};

type AffiliateDomainTargetIdentity = Readonly<{
  targetType: string;
  targetId: string;
}>;

const affiliateDomainTargetIdentity = (
  target: Record<string, unknown>,
): AffiliateDomainTargetIdentity | null => {
  const targetType = stringValue(target.targetType)?.toUpperCase();
  const targetId = stringValue(target.targetId);
  if (!targetType || !targetId) return null;
  return { targetType, targetId };
};

const publishAffiliateDomainTargetMutation = (
  database: AffiliateSupplyDatabase,
  targetType: string,
  targetId: string,
): (() => Promise<unknown>) | undefined => {
  const eventUpdate = database.events?.update;
  const teamUpdate = database.teams?.update;
  const facilityUpdate = database.facilities?.update;
  const organizationUpdate = database.organizations?.update;
  const mutations: Record<string, (() => Promise<unknown>) | undefined> = {
    EVENT: eventUpdate
      ? () => eventUpdate({ where: { id: targetId }, data: { state: 'PUBLISHED', archivedAt: null } })
      : undefined,
    TEAM: teamUpdate
      ? () => teamUpdate({ where: { id: targetId }, data: { visibility: 'PUBLIC', archivedAt: null } })
      : undefined,
    FACILITY: facilityUpdate
      ? () => facilityUpdate({ where: { id: targetId }, data: { status: 'ACTIVE' } })
      : undefined,
    ORGANIZATION: organizationUpdate
      ? () => organizationUpdate({
        where: { id: targetId },
        data: {
          status: 'LISTED',
          publicPageEnabled: true,
          publicWidgetsEnabled: true,
        },
      })
      : undefined,
  };
  return mutations[targetType];
};

const publishAffiliateDomainTarget = async (
  database: AffiliateSupplyDatabase,
  target: Record<string, unknown>,
): Promise<void> => {
  const identity = affiliateDomainTargetIdentity(target);
  if (!identity) return;
  await publishAffiliateDomainTargetMutation(database, identity.targetType, identity.targetId)?.();
};

const rejectAffiliateDomainTargetMutation = (
  database: AffiliateSupplyDatabase,
  targetType: string,
  targetId: string,
): (() => Promise<unknown>) | undefined => {
  const eventUpdate = database.events?.update;
  const teamUpdate = database.teams?.update;
  const facilityUpdate = database.facilities?.update;
  const organizationUpdate = database.organizations?.update;
  const mutations: Record<string, (() => Promise<unknown>) | undefined> = {
    EVENT: eventUpdate
      ? () => eventUpdate({ where: { id: targetId }, data: { state: 'UNPUBLISHED' } })
      : undefined,
    TEAM: teamUpdate
      ? () => teamUpdate({ where: { id: targetId }, data: { visibility: 'ADMIN_ONLY' } })
      : undefined,
    FACILITY: facilityUpdate
      ? () => facilityUpdate({ where: { id: targetId }, data: { status: 'DRAFT' } })
      : undefined,
    ORGANIZATION: organizationUpdate
      ? () => organizationUpdate({
        where: { id: targetId },
        data: {
          status: 'UNLISTED',
          publicPageEnabled: false,
          publicWidgetsEnabled: false,
        },
      })
      : undefined,
  };
  return mutations[targetType];
};
const rejectAffiliateDomainTarget = async (
  database: AffiliateSupplyDatabase,
  target: Record<string, unknown>,
): Promise<void> => {
  const identity = affiliateDomainTargetIdentity(target);
  if (!identity) return;
  await rejectAffiliateDomainTargetMutation(database, identity.targetType, identity.targetId)?.();
};

export type AffiliateCandidateReviewInput = Readonly<{
  supplySourceId: string;
  mappingId: string;
  packageHash: string;
  baselineHash: string;
  reviewedCandidateIds: readonly string[];
  candidateReviewEvidenceRefs: readonly string[];
  targets: readonly Readonly<Record<string, unknown>>[];
  reviewerId: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>;

export const recordAffiliateCandidateReview = async (
  input: AffiliateCandidateReviewInput,
): Promise<AffiliateApprovalJobs> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const reviewedCandidateIds = Array.from(new Set(input.reviewedCandidateIds));
  const candidateReviewEvidenceRefs = Array.from(new Set(input.candidateReviewEvidenceRefs));
  if (!reviewedCandidateIds.length || !candidateReviewEvidenceRefs.length || !input.targets.length) {
    throw new Error('Affiliate candidate review requires candidates, targets, and evidence.');
  }
  if (!database.approvals?.create || !database.approvals?.findUnique) {
    throw new Error('Affiliate candidate review persistence is not available.');
  }
  return withSupplyTransaction(database, async (transactionDatabase) => {
    const decisionPayload = {
      schemaVersion: 1,
      decision: 'APPROVE',
      supplySourceId: input.supplySourceId,
      mappingId: input.mappingId,
      packageHash: input.packageHash,
      baselineHash: input.baselineHash,
      reviewedCandidateIds,
      candidateReviewEvidenceRefs,
      targets: input.targets.map((target) => ({ ...target })),
      reviewerId: input.reviewerId,
      reviewedAt: now.toISOString(),
    };
    const decisionHash = hashAffiliateAgentValue(decisionPayload);
    const subjectKey = `${input.supplySourceId}:${decisionHash}`;
    const existing = await transactionDatabase.approvals.findUnique({
      where: {
        subjectType_subjectKey: {
          subjectType: 'CANDIDATE_REVIEW',
          subjectKey,
        },
      },
    });
    if (existing) {
      return existing;
    }
    return transactionDatabase.approvals.create({
      data: {
        id: createId(),
        subjectType: 'CANDIDATE_REVIEW',
        subjectKey,
        supplySourceId: input.supplySourceId,
        status: 'APPROVED',
        reviewerId: input.reviewerId,
        decision: prismaJsonValue({
          ...decisionPayload,
          decisionHash,
        }),
        finishedAt: now,
      },
    });
  });
};

type AffiliateLifecycleCommandContext = Readonly<{
  database: AffiliateSupplyDatabase;
  transactionDatabase: AffiliateSupplyDatabase;
  input: ExecuteAffiliateSupplyLifecycleCommandInput;
  root: AffiliateSupplySources;
  source: AffiliateScrapeSources | null;
  request: Record<string, unknown>;
  now: Date;
  evidenceRefs: string[];
  refreshFailureRunId: string | null;
  mappingId: string | null;
  contract: ActiveAffiliateSupplyContractResult;
  snapshotBefore: AffiliateSupplyEvidenceSnapshot;
  assessmentBefore: AffiliateSupplyAssessment;
  commandContractVersion: number;
  commandContractHash: string;
}>;

const affiliateSuccessorExpectedIntakeId = (
  successorRequest: Record<string, unknown>,
  request: Record<string, unknown>,
): string | undefined => {
  if (Object.prototype.hasOwnProperty.call(successorRequest, 'expectedIntakeSupplySourceId')) {
    return stringValue(successorRequest.expectedIntakeSupplySourceId) ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(request, 'expectedIntakeSupplySourceId')) {
    return stringValue(request.expectedIntakeSupplySourceId) ?? undefined;
  }
  return undefined;
};

const affiliateSuccessorRequestValue = (
  successorRequest: Record<string, unknown>,
  request: Record<string, unknown>,
  field: string,
): unknown => successorRequest[field] ?? request[field];

type AffiliateSuccessorRequest = Readonly<{
  values: Record<string, unknown>;
  identity: ReturnType<typeof normalizeAffiliateSupplyIdentity>;
  expectedIntakeSupplySourceId: string | undefined;
  operatorDomain: string;
}>;

const resolveAffiliateSuccessorRequest = (
  context: AffiliateLifecycleCommandContext,
): AffiliateSuccessorRequest => {
  const successorRequest = recordValue(context.request.successor);
  const requestedUrl = stringValue(affiliateSuccessorRequestValue(successorRequest, context.request, 'requestedUrl'));
  if (!requestedUrl) {
    throw new Error('Affiliate successor creation requires a requested URL.');
  }
  const resolvedCanonicalUrl = stringValue(
    affiliateSuccessorRequestValue(successorRequest, context.request, 'resolvedCanonicalUrl'),
  ) ?? requestedUrl;
  let operatorDomain = stringValue(
    affiliateSuccessorRequestValue(successorRequest, context.request, 'operatorDomain'),
  );
  try {
    operatorDomain ??= new URL(resolvedCanonicalUrl).hostname;
  } catch {
    throw new Error('Affiliate successor creation requires a valid canonical URL.');
  }
  const identity = normalizeAffiliateSupplyIdentity({
    requestedUrl,
    resolvedCanonicalUrl,
    isRedirectVerified: successorRequest.isRedirectVerified === true
      || context.request.isRedirectVerified === true,
    operatorDomain,
  });
  return {
    values: successorRequest,
    identity,
    expectedIntakeSupplySourceId: affiliateSuccessorExpectedIntakeId(successorRequest, context.request),
    operatorDomain,
  };
};

const updateAffiliateExistingSuccessor = async (
  transactionDatabase: AffiliateSupplyDatabase,
  root: AffiliateSupplySources,
  existingSuccessor: AffiliateSupplySources,
  request: AffiliateSuccessorRequest,
  fallbackRequest: Record<string, unknown>,
  now: Date,
): Promise<AffiliateSupplySources> => transactionDatabase.supplySources.update({
  where: { id: existingSuccessor.id },
  data: {
    predecessorId: root.id,
    intakeId: stringValue(affiliateSuccessorRequestValue(request.values, fallbackRequest, 'intakeId'))
      ?? existingSuccessor.intakeId
      ?? null,
    liveSourceId: stringValue(affiliateSuccessorRequestValue(request.values, fallbackRequest, 'liveSourceId'))
      ?? existingSuccessor.liveSourceId
      ?? null,
    updatedAt: now,
  },
});

const createAffiliateSuccessor = async (
  transactionDatabase: AffiliateSupplyDatabase,
  root: AffiliateSupplySources,
  request: AffiliateSuccessorRequest,
  context: AffiliateLifecycleCommandContext,
): Promise<AffiliateSupplySources> => createAffiliateSupplySource({
  database: transactionDatabase,
  identity: request.identity,
  targetKind: stringValue(affiliateSuccessorRequestValue(
    request.values,
    context.request,
    'targetKind',
  )) ?? root.targetKind,
  operatorDomain: request.operatorDomain,
  rolloutCohort: root.rolloutCohort,
  intakeId: stringValue(affiliateSuccessorRequestValue(request.values, context.request, 'intakeId'))
    ?? root.intakeId,
  expectedIntakeSupplySourceId: request.expectedIntakeSupplySourceId,
  liveSourceId: stringValue(affiliateSuccessorRequestValue(request.values, context.request, 'liveSourceId')),
  predecessorId: root.id,
  metadata: recordValue(affiliateSuccessorRequestValue(request.values, context.request, 'metadata')),
  now: context.now,
});

const assertAffiliateSuccessorIdentityAvailable = (
  root: AffiliateSupplySources,
  existingSuccessor: AffiliateSupplySources | null,
  identity: ReturnType<typeof normalizeAffiliateSupplyIdentity>,
): void => {
  if (existingSuccessor?.id === root.id) {
    throw new Error('Affiliate successor identity resolves to its predecessor root.');
  }
  if (existingSuccessor?.predecessorId && existingSuccessor.predecessorId !== root.id) {
    throw new Error('Affiliate successor identity is already linked to another predecessor.');
  }
  if (root.successorId && (
    !existingSuccessor
    || existingSuccessor.identityKey !== identity.identityKey
  )) {
    throw new Error('Affiliate Supply Source already has a different successor.');
  }
};

const persistAffiliateSuccessorLink = async (
  context: AffiliateLifecycleCommandContext,
  request: AffiliateSuccessorRequest,
): Promise<void> => {
  const { transactionDatabase, root, now } = context;
  const existingSuccessor = root.successorId
    ? await transactionDatabase.supplySources.findUnique({ where: { id: root.successorId } })
    : await transactionDatabase.supplySources.findUnique({
      where: { identityKey: request.identity.identityKey },
    });
  assertAffiliateSuccessorIdentityAvailable(root, existingSuccessor, request.identity);
  if (root.successorId) return;
  const successor = existingSuccessor
    ? await updateAffiliateExistingSuccessor(
      transactionDatabase,
      root,
      existingSuccessor,
      request,
      context.request,
      now,
    )
    : await createAffiliateSuccessor(transactionDatabase, root, request, context);
  await transactionDatabase.supplySources.update({
    where: { id: root.id },
    data: { successorId: successor.id, updatedAt: now },
  });
  await Promise.all([
    linkSupplySource(
      transactionDatabase.intakes,
      stringValue(affiliateSuccessorRequestValue(request.values, context.request, 'intakeId'))
        ?? successor.intakeId,
      successor.id,
      request.expectedIntakeSupplySourceId,
    ),
    linkSupplySource(
      transactionDatabase.sources,
      stringValue(affiliateSuccessorRequestValue(request.values, context.request, 'liveSourceId')),
      successor.id,
    ),
  ]);
};

const executeAffiliateCreateSuccessor = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const request = resolveAffiliateSuccessorRequest(context);
  await persistAffiliateSuccessorLink(context, request);
};

const affiliateRevalidationExpectedIntakeId = (
  request: Record<string, unknown>,
): string | undefined => Object.prototype.hasOwnProperty.call(request, 'expectedIntakeSupplySourceId')
  ? stringValue(request.expectedIntakeSupplySourceId) ?? undefined
  : undefined;

type AffiliateIdentityRevalidation = Readonly<{
  identity: ReturnType<typeof normalizeAffiliateSupplyIdentity>;
  expectedIntakeSupplySourceId: string | undefined;
}>;

const resolveAffiliateIdentityRevalidation = (
  root: AffiliateSupplySources,
  request: Record<string, unknown>,
): AffiliateIdentityRevalidation => {
  const requestedUrl = stringValue(request.requestedUrl);
  const resolvedCanonicalUrl = stringValue(request.resolvedCanonicalUrl) ?? requestedUrl;
  if (!requestedUrl || !resolvedCanonicalUrl) {
    throw new Error('Affiliate identity revalidation requires requested and resolved URLs.');
  }
  const identity = normalizeAffiliateSupplyIdentity({
    requestedUrl,
    resolvedCanonicalUrl,
    isRedirectVerified: request.isRedirectVerified === true,
    operatorDomain: stringValue(request.operatorDomain) ?? root.operatorDomain,
    prior: {
      canonicalUrl: root.canonicalUrl,
      operatorDomain: root.operatorDomain,
      identityKey: root.identityKey,
    },
  });
  const priorIdentity = normalizeAffiliateSupplyIdentity({
    requestedUrl: root.canonicalUrl,
    resolvedCanonicalUrl: root.canonicalUrl,
    operatorDomain: root.operatorDomain,
  });
  if (
    identity.rootDecision !== 'SAME_ROOT'
    || (identity.canonicalUrl === priorIdentity.canonicalUrl && !identity.isRevalidationRequired)
  ) {
    throw new Error('Affiliate identity revalidation requires a verified same-root change.');
  }
  return {
    identity,
    expectedIntakeSupplySourceId: affiliateRevalidationExpectedIntakeId(request),
  };
};

const persistAffiliateIdentityRevalidation = async (
  context: AffiliateLifecycleCommandContext,
  revalidation: AffiliateIdentityRevalidation,
): Promise<void> => {
  const { transactionDatabase, input, root, source, request, now } = context;
  const { identity, expectedIntakeSupplySourceId } = revalidation;
  await transactionDatabase.supplySources.update({
    where: { id: input.supplySourceId },
    data: {
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
      operatorDomain: stringValue(request.operatorDomain) ?? root.operatorDomain ?? null,
      intakeId: stringValue(request.intakeId) ?? root.intakeId ?? null,
      liveSourceId: stringValue(request.liveSourceId) ?? root.liveSourceId ?? null,
      isAutomationEnabled: false,
      automationHoldReason: 'CANONICAL_REVALIDATION_REQUIRED',
      updatedAt: now,
    },
  });
  await Promise.all([
    linkSupplySource(
      transactionDatabase.intakes,
      stringValue(request.intakeId),
      input.supplySourceId,
      expectedIntakeSupplySourceId,
    ),
    linkSupplySource(transactionDatabase.sources, stringValue(request.liveSourceId), input.supplySourceId),
  ]);
  if (!source?.id) return;
  await transactionDatabase.sources.update({
    where: { id: source.id },
    data: {
      autoScrapeEnabled: false,
      metadata: prismaJsonValue({
        ...recordValue(source.metadata),
        automationReviewRequired: {
          hold: true,
          reason: 'CANONICAL_REVALIDATION_REQUIRED',
        },
      }),
    },
  });
};

const executeAffiliateRevalidateIdentity = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const revalidation = resolveAffiliateIdentityRevalidation(context.root, context.request);
  await persistAffiliateIdentityRevalidation(context, revalidation);
};

const loadAffiliateMappingForLifecycle = async (
  context: AffiliateLifecycleCommandContext,
): Promise<AffiliateScrapeMappings> => {
  if (!context.mappingId) {
    throw new Error('Affiliate mapping lifecycle command requires a mapping package.');
  }
  const mapping = context.transactionDatabase.mappings?.findUnique
    ? await context.transactionDatabase.mappings.findUnique({ where: { id: context.mappingId } })
    : null;
  if (!mapping) {
    throw new Error('Affiliate mapping lifecycle command requires an existing mapping package.');
  }
  return mapping;
};

const affiliateMappingEvidenceKinds = (
  mapping: AffiliateScrapeMappings,
): Set<string> => {
  const mappingJson = recordValue(mapping.mapping);
  const mappingMetadata = recordValue(mappingJson.metadata);
  return new Set(stringArray(
    mappingMetadata.evidenceKinds
    ?? mappingJson.evidenceKinds
    ?? recordValue(mappingJson.evidence).evidenceKinds,
  ).map((kind) => kind.toUpperCase()));
};

const assertAffiliateMappingOwnership = (
  context: AffiliateLifecycleCommandContext,
  mapping: AffiliateScrapeMappings,
): void => {
  if (context.source?.id && mapping.sourceId && mapping.sourceId !== context.source.id) {
    throw new Error('Affiliate mapping lifecycle command mapping does not belong to the live source.');
  }
  if (mapping.supplySourceId && mapping.supplySourceId !== context.input.supplySourceId) {
    throw new Error('Affiliate mapping lifecycle command mapping does not belong to the Supply Source.');
  }
};

const assertAffiliateMappingLifecycleReady = (
  context: AffiliateLifecycleCommandContext,
  mapping: AffiliateScrapeMappings,
): void => {
  const mappingJson = recordValue(mapping.mapping);
  if (!affiliateScrapeMappingSchema.safeParse(mappingJson).success) {
    throw new Error('Affiliate mapping lifecycle command requires a schema-valid declarative package.');
  }
  const evidenceKinds = affiliateMappingEvidenceKinds(mapping);
  if (context.contract.policy.requiredMappingEvidenceKinds.some(
    (kind) => !evidenceKinds.has(kind.toUpperCase()),
  )) {
    throw new Error('Affiliate mapping lifecycle command is missing required mapping evidence.');
  }
  assertAffiliateMappingOwnership(context, mapping);
};

const persistAffiliateMappingLifecycle = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const { transactionDatabase, input, source, request, mappingId } = context;
  await linkAffiliateSupplyRecord({
    supplySourceId: input.supplySourceId,
    sourceId: source?.id,
    mappingId,
    mappingJobId: stringValue(request.mappingJobId),
    db: transactionDatabase,
  });
  if (source?.id) {
    await transactionDatabase.sources.update({
      where: { id: source.id },
      data: { activeMappingId: mappingId, autoScrapeEnabled: false },
    });
  }
  if (transactionDatabase.mappings?.update) {
    await transactionDatabase.mappings.update({
      where: { id: mappingId ?? undefined },
      data: { isActive: false, validatedAt: null },
    });
  }
};

const executeAffiliateRecordMapping = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const mapping = await loadAffiliateMappingForLifecycle(context);
  assertAffiliateMappingLifecycleReady(context, mapping);
  await persistAffiliateMappingLifecycle(context);
};

type AffiliateApprovalContext = Readonly<{
  source: AffiliateScrapeSources;
  mapping: AffiliateScrapeMappings;
  mappingId: string;
  baseline: Record<string, unknown> | undefined;
}>;

const loadAffiliateApprovalContext = async (
  context: AffiliateLifecycleCommandContext,
): Promise<AffiliateApprovalContext> => {
  const source = context.source;
  if (!source?.id) throw new Error('Affiliate lifecycle approval requires a live source.');
  const baseline = context.request.baseline && typeof context.request.baseline === 'object'
    ? context.request.baseline as Record<string, unknown>
    : undefined;
  const mappingId = context.mappingId ?? source.activeMappingId;
  if (!mappingId) {
    throw new Error('Affiliate lifecycle approval requires a mapping package.');
  }
  const mapping = context.transactionDatabase.mappings?.findUnique
    ? await context.transactionDatabase.mappings.findUnique({ where: { id: mappingId } })
    : null;
  if (!mapping) throw new Error('Affiliate lifecycle approval requires the exact mapping package.');
  return { source, mapping, mappingId, baseline };
};

const affiliateApprovalPackageHash = (mapping: AffiliateScrapeMappings): string => {
  const mappingJson = recordValue(mapping.mapping);
  const metadata = recordValue(mappingJson.metadata);
  return stringValue(metadata.packageHash)
    ?? stringValue(mappingJson.packageHash)
    ?? hashAffiliateAgentValue(mappingJson);
};

const assertAffiliateApprovalMapping = (
  context: AffiliateLifecycleCommandContext,
  approval: AffiliateApprovalContext,
): void => {
  const { mapping, source, mappingId } = approval;
  const packageHash = affiliateApprovalPackageHash(mapping);
  if (
    (mapping.sourceId && mapping.sourceId !== source.id)
    || (mapping.supplySourceId && mapping.supplySourceId !== context.input.supplySourceId)
    || stringValue(context.request.packageHash) !== packageHash
  ) {
    throw new Error('Affiliate lifecycle approval requires the exact mapping package.');
  }
  if (!mappingId) throw new Error('Affiliate lifecycle approval requires a mapping package.');
};

const persistAffiliateApproval = async (
  context: AffiliateLifecycleCommandContext,
  approval: AffiliateApprovalContext,
): Promise<void> => {
  const {
    transactionDatabase,
    input,
    request,
    now,
    evidenceRefs,
  } = context;
  const decision = {
    decision: 'APPROVE',
    isIndependent: true,
    reviewerId: input.actorId,
    packageHash: stringValue(request.packageHash),
    evidenceRefs,
    lifecycleEvidenceKinds: stringArray(request.lifecycleEvidenceKinds),
  };
  await transactionDatabase.approvals.upsert({
    where: {
      subjectType_subjectKey: {
        subjectType: 'MAPPING_PACKAGE',
        subjectKey: approval.mappingId,
      },
    },
    create: {
      id: createId(),
      subjectType: 'MAPPING_PACKAGE',
      subjectKey: approval.mappingId,
      supplySourceId: input.supplySourceId,
      status: 'APPROVED',
      reviewerId: input.actorId,
      decision,
      finishedAt: now,
    },
    update: {
      supplySourceId: input.supplySourceId,
      status: 'APPROVED',
      reviewerId: input.actorId,
      decision,
      finishedAt: now,
      errorMessage: null,
    },
  });
  if (transactionDatabase.mappings?.update) {
    await transactionDatabase.mappings.update({
      where: { id: approval.mappingId },
      data: { isActive: false, validatedAt: now },
    });
  }
  await transactionDatabase.sources.update({
    where: { id: approval.source.id },
    data: {
      autoScrapeEnabled: false,
      metadata: prismaJsonValue({
        ...recordValue(approval.source.metadata),
        ...(approval.baseline ? { [AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY]: approval.baseline } : {}),
        automationReviewRequired: null,
      }),
    },
  });
  if (approval.source.organizationId && transactionDatabase.organizations?.update) {
    await transactionDatabase.organizations.update({
      where: { id: approval.source.organizationId },
      data: {
        status: 'UNLISTED',
        publicPageEnabled: false,
        publicWidgetsEnabled: false,
      },
    });
  }
};

const executeAffiliateApprove = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const approval = await loadAffiliateApprovalContext(context);
  assertAffiliateApprovalMapping(context, approval);
  await persistAffiliateApproval(context, approval);
};

type AffiliateActivationMapping = NonNullable<AffiliateSupplyEvidenceSnapshot['mapping']>;
type AffiliateActivationCandidate = Readonly<{
  id: string;
  status: string;
  targetType?: string | null;
  publishedTargetId?: string | null;
}> & Record<string, unknown>;
type AffiliateActivationContract = Readonly<{
  mapping: AffiliateActivationMapping;
  baseline: NonNullable<ReturnType<typeof parseAffiliateAutomationBaseline>>;
  packageHash: string;
}>;
const assertAffiliateActivationMapping = (
  context: AffiliateLifecycleCommandContext,
  mapping: AffiliateActivationMapping | null | undefined,
  packageHash: string | null,
): AffiliateActivationMapping => {
  if (!mapping) {
    throw new Error('Affiliate lifecycle activation requires the exact validated mapping package.');
  }
  if (!mappingPackageValid(context.snapshotBefore)) {
    throw new Error('Affiliate lifecycle activation requires the exact validated mapping package.');
  }
  if (!mapping.packageHash) {
    throw new Error('Affiliate lifecycle activation requires the exact validated mapping package.');
  }
  if (packageHash !== mapping.packageHash) {
    throw new Error('Affiliate lifecycle activation requires the exact validated mapping package.');
  }
  return mapping;
};

const assertAffiliateActivationBaseline = (
  mapping: AffiliateActivationMapping,
  baseline: NonNullable<ReturnType<typeof parseAffiliateAutomationBaseline>>,
  baselineHash: string | null,
): void => {
  if (baselineHash !== baseline.normalizedFieldsHash) {
    throw new Error('Affiliate lifecycle activation requires the exact reviewed automation baseline.');
  }
  if (baseline.mappingId !== mapping.id) {
    throw new Error('Affiliate lifecycle activation requires the exact reviewed automation baseline.');
  }
  if (baseline.mappingVersion !== mapping.version) {
    throw new Error('Affiliate lifecycle activation requires the exact reviewed automation baseline.');
  }
};

const resolveAffiliateActivationContract = (
  context: AffiliateLifecycleCommandContext,
): AffiliateActivationContract => {
  if (!context.source?.id) {
    throw new Error('Affiliate lifecycle activation requires a live source.');
  }
  const mapping = context.snapshotBefore.mapping;
  const baseline = parseAffiliateAutomationBaseline(context.snapshotBefore.baseline);
  const packageHash = stringValue(context.request.packageHash);
  const baselineHash = stringValue(context.request.baselineHash)
    ?? stringValue(context.request.baselineNormalizedFieldsHash);
  const validatedMapping = assertAffiliateActivationMapping(context, mapping, packageHash);
  if (!baseline) {
    throw new Error('Affiliate lifecycle activation requires the exact reviewed automation baseline.');
  }
  assertAffiliateActivationBaseline(validatedMapping, baseline, baselineHash);
  return { mapping: validatedMapping, baseline, packageHash: validatedMapping.packageHash ?? '' };
};

type AffiliateCandidateReviewContext = Readonly<{
  review: AffiliateApprovalJobs;
  decision: Record<string, unknown>;
  evidenceRefs: string[];
  reviewedCandidateIds: string[];
}>;

const loadAffiliateCandidateReview = async (
  context: AffiliateLifecycleCommandContext,
): Promise<AffiliateApprovalJobs | null> => {
  const candidateReviewId = stringValue(context.request.candidateReviewId);
  if (!candidateReviewId || !context.transactionDatabase.approvals?.findUnique) return null;
  return context.transactionDatabase.approvals.findUnique({ where: { id: candidateReviewId } });
};

const assertAffiliateCandidateReviewRecord = (
  context: AffiliateLifecycleCommandContext,
  candidateReview: AffiliateApprovalJobs | null,
): AffiliateApprovalJobs => {
  if (!candidateReview) {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  if (candidateReview.subjectType !== 'CANDIDATE_REVIEW') {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  if (!String(candidateReview.subjectKey ?? '').startsWith(`${context.input.supplySourceId}:`)) {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  if (candidateReview.supplySourceId !== context.input.supplySourceId) {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  if (!['APPROVED', 'COMPLETED'].includes(String(candidateReview.status).toUpperCase())) {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  if (!candidateReview.finishedAt) {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  return candidateReview;
};

const resolveAffiliateCandidateReviewDecision = (
  candidateReview: AffiliateApprovalJobs,
): Record<string, unknown> => {
  const decision = recordValue(candidateReview.decision);
  if (decision.decision !== 'APPROVE') {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  const decisionHash = stringValue(decision.decisionHash);
  const reviewPayload = { ...decision };
  delete reviewPayload.decisionHash;
  if (decisionHash !== hashAffiliateAgentValue(reviewPayload)) {
    throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
  }
  return decision;
};

const assertAffiliateCandidateReviewFresh = (
  activation: AffiliateActivationContract,
  decision: Record<string, unknown>,
): void => {
  if (stringValue(decision.mappingId) !== activation.mapping.id) {
    throw new Error('Affiliate lifecycle activation candidate review is stale.');
  }
  if (stringValue(decision.packageHash) !== activation.packageHash) {
    throw new Error('Affiliate lifecycle activation candidate review is stale.');
  }
  if (stringValue(decision.baselineHash) !== activation.baseline.normalizedFieldsHash) {
    throw new Error('Affiliate lifecycle activation candidate review is stale.');
  }
};
const assertAffiliateCandidateReview = (
  context: AffiliateLifecycleCommandContext,
  activation: AffiliateActivationContract,
  candidateReview: AffiliateApprovalJobs | null,
): AffiliateCandidateReviewContext => {
  const review = assertAffiliateCandidateReviewRecord(context, candidateReview);
  const decision = resolveAffiliateCandidateReviewDecision(review);
  assertAffiliateCandidateReviewFresh(activation, decision);
  return {
    review,
    decision,
    evidenceRefs: stringArray(decision.candidateReviewEvidenceRefs),
    reviewedCandidateIds: stringArray(decision.reviewedCandidateIds),
  };
};

const resolveAffiliateCandidateReview = async (
  context: AffiliateLifecycleCommandContext,
  activation: AffiliateActivationContract,
): Promise<AffiliateCandidateReviewContext> => {
  const candidateReview = await loadAffiliateCandidateReview(context);
  return assertAffiliateCandidateReview(context, activation, candidateReview);
};

const resolveAffiliateReviewedCandidates = (
  context: AffiliateLifecycleCommandContext,
  review: AffiliateCandidateReviewContext,
): Map<string, AffiliateActivationCandidate> => {
  if (!review.evidenceRefs.length || !review.reviewedCandidateIds.length) {
    throw new Error('Affiliate lifecycle activation requires reviewed candidate identities and evidence.');
  }
  const reviewedCandidateIdSet = new Set(review.reviewedCandidateIds);
  const reviewedCandidates = context.snapshotBefore.candidates.filter((candidate) => (
    reviewedCandidateIdSet.has(candidate.id) && candidate.status.toUpperCase() !== 'REJECTED'
  ));
  if (reviewedCandidates.length !== review.reviewedCandidateIds.length) {
    throw new Error('Affiliate lifecycle activation requires reviewed candidate identities and evidence.');
  }
  return new Map(
    reviewedCandidates.map((candidate) => [
      candidate.id,
      candidate as AffiliateActivationCandidate,
    ]),
  );
};

const assertAffiliateActivationTargetCandidate = (
  candidate: AffiliateActivationCandidate | undefined,
  candidateId: string | undefined,
  targetType: string | undefined,
): void => {
  if (!candidate || !candidateId || !targetType || candidate.targetType?.toUpperCase() !== targetType) {
    throw new Error('Affiliate lifecycle activation targets must match reviewed candidate targets.');
  }
};

const assertAffiliateActivationTargetKind = (
  targetType: string,
  targetStatus: string,
): void => {
  if (!['EVENT', 'TEAM', 'FACILITY', 'ORGANIZATION'].includes(targetType)) {
    throw new Error('Affiliate lifecycle activation requires a supported target type.');
  }
  if (!['PUBLISHED', 'LAST_KNOWN_GOOD', 'REJECTED', 'EXPIRED'].includes(targetStatus)) {
    throw new Error('Affiliate lifecycle activation requires a supported target status.');
  }
};

const assertAffiliateActivationTargetIdentity = (
  target: Record<string, unknown>,
  candidate: AffiliateActivationCandidate,
): void => {
  const requestedTargetId = stringValue(target.targetId);
  if (candidate.publishedTargetId && requestedTargetId && candidate.publishedTargetId !== requestedTargetId) {
    throw new Error('Affiliate lifecycle activation targets must match reviewed candidate targets.');
  }
};

const assertAffiliateActivationTargetShape = (
  target: Record<string, unknown>,
  candidate: AffiliateActivationCandidate | undefined,
  candidateId: string | undefined,
  targetType: string | undefined,
  targetStatus: string,
): void => {
  assertAffiliateActivationTargetCandidate(candidate, candidateId, targetType);
  assertAffiliateActivationTargetKind(targetType as string, targetStatus);
  assertAffiliateActivationTargetIdentity(target, candidate as AffiliateActivationCandidate);
};

const createAffiliateActivationTarget = async (
  context: AffiliateLifecycleCommandContext,
  target: Record<string, unknown>,
  candidate: AffiliateActivationCandidate,
  candidateId: string,
  targetType: string,
  targetStatus: string,
  resolvedTarget: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (targetStatus !== 'PUBLISHED') {
    throw new Error('Affiliate lifecycle activation requires a published reviewed target.');
  }
  if (!context.input.activationTargetWriter) {
    throw new Error('Affiliate lifecycle activation requires an admitted target writer for quarantined candidates.');
  }
  const createdTarget = await context.input.activationTargetWriter({
    database: context.transactionDatabase,
    client: context.transactionDatabase.rawClient ?? context.database.rawClient ?? prisma,
    contract: context.contract.policy,
    request: context.request,
    target,
    candidate,
    now: context.now,
  });
  if (createdTarget.candidateId !== candidateId || !createdTarget.targetId) {
    throw new Error('Affiliate lifecycle activation target writer returned an invalid target.');
  }
  if (createdTarget.targetType.toUpperCase() !== targetType) {
    throw new Error('Affiliate lifecycle activation target writer returned the wrong target type.');
  }
  return { ...resolvedTarget, ...createdTarget, status: 'PUBLISHED' };
};

const resolveAffiliateActivationTarget = async (
  context: AffiliateLifecycleCommandContext,
  target: Record<string, unknown>,
  candidateById: Map<string, AffiliateActivationCandidate>,
): Promise<Record<string, unknown>> => {
  const candidateId = stringValue(target.candidateId);
  const candidate = candidateId ? candidateById.get(candidateId) : undefined;
  const targetType = stringValue(target.targetType)?.toUpperCase();
  const requestedTargetId = stringValue(target.targetId);
  const targetStatus = stringValue(target.status)?.toUpperCase() ?? 'PUBLISHED';
  assertAffiliateActivationTargetShape(target, candidate, candidateId ?? undefined, targetType, targetStatus);
  const reviewedCandidate = candidate as AffiliateActivationCandidate;
  const resolvedTarget = {
    ...target,
    targetId: requestedTargetId ?? reviewedCandidate.publishedTargetId,
    status: targetStatus,
  };
  const createdTarget = reviewedCandidate.publishedTargetId
    ? resolvedTarget
    : await createAffiliateActivationTarget(
      context,
      target,
      reviewedCandidate,
      candidateId as string,
      targetType as string,
      targetStatus,
      resolvedTarget,
    );
  if (!stringValue(createdTarget.targetId)) {
    throw new Error('Affiliate lifecycle activation requires a reviewed target identity.');
  }
  return createdTarget;
};

const resolveAffiliateActivationTargets = async (
  context: AffiliateLifecycleCommandContext,
  review: AffiliateCandidateReviewContext,
  candidateById: Map<string, AffiliateActivationCandidate>,
): Promise<Record<string, unknown>[]> => {
  const targetRows = commandTargets(review.decision);
  if (!targetRows.length) {
    throw new Error('Affiliate lifecycle activation requires reviewed target rows.');
  }
  const resolvedTargetRows: Record<string, unknown>[] = [];
  for (const target of targetRows) {
    resolvedTargetRows.push(await resolveAffiliateActivationTarget(context, target, candidateById));
  }
  if (!resolvedTargetRows.some((target) => stringValue(target.status)?.toUpperCase() === 'PUBLISHED')) {
    throw new Error('Affiliate lifecycle activation requires one published reviewed target.');
  }
  return resolvedTargetRows;
};

const persistAffiliateActivation = async (
  context: AffiliateLifecycleCommandContext,
  activation: AffiliateActivationContract,
  review: AffiliateCandidateReviewContext,
  resolvedTargetRows: readonly Record<string, unknown>[],
): Promise<void> => {
  const publishedCandidateIds = new Set(
    resolvedTargetRows
      .filter((target) => stringValue(target.status)?.toUpperCase() === 'PUBLISHED')
      .map((target) => stringValue(target.candidateId))
      .filter((candidateId): candidateId is string => Boolean(candidateId)),
  );
  for (const candidateId of publishedCandidateIds) {
    await context.transactionDatabase.candidates.update({
      where: { id: candidateId },
      data: { status: 'PUBLISHED' },
    });
  }
  for (const target of resolvedTargetRows) {
    await applyCommandTarget(
      context.transactionDatabase,
      context.input.supplySourceId,
      {
        ...target,
        evidenceRefs: [...review.evidenceRefs, ...stringArray(target.evidenceRefs)],
      },
      context.now,
      context.evidenceRefs,
      context.contract.policy,
    );
    if ((stringValue(target.status)?.toUpperCase() ?? 'PUBLISHED') === 'PUBLISHED') {
      await publishAffiliateDomainTarget(context.transactionDatabase, target);
    }
  }
  await context.transactionDatabase.mappings.update({
    where: { id: activation.mapping.id },
    data: { isActive: true, validatedAt: context.now },
  });
  await context.transactionDatabase.supplySources.update({
    where: { id: context.input.supplySourceId },
    data: {
      isAutomationEnabled: true,
      activeSupplyContractVersion: context.commandContractVersion,
      activeSupplyContractHash: context.commandContractHash,
    },
  });
  await context.transactionDatabase.sources.update({
    where: { id: context.source?.id as string },
    data: {
      autoScrapeEnabled: true,
      status: 'ACTIVE',
      activeSupplyContractVersion: context.commandContractVersion,
      activeSupplyContractHash: context.commandContractHash,
    },
  });
};

const executeAffiliateActivate = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const activation = resolveAffiliateActivationContract(context);
  const review = await resolveAffiliateCandidateReview(context, activation);
  const candidateById = resolveAffiliateReviewedCandidates(context, review);
  const targetRows = await resolveAffiliateActivationTargets(context, review, candidateById);
  await persistAffiliateActivation(context, activation, review, targetRows);
};

const resolveAffiliatePublicationCandidate = (
  context: AffiliateLifecycleCommandContext,
): AffiliateActivationCandidate => {
  const candidateId = stringValue(context.request.candidateId);
  const candidate = candidateId
    ? context.snapshotBefore.candidates.find((row) => row.id === candidateId)
    : null;
  if (!candidateId || !candidate || candidate.status.toUpperCase() === 'REJECTED') {
    throw new Error('Affiliate lifecycle publication requires an eligible candidate.');
  }
  return candidate as AffiliateActivationCandidate;
};

const persistAffiliatePublication = async (
  context: AffiliateLifecycleCommandContext,
  candidate: AffiliateActivationCandidate,
): Promise<void> => {
  if (!context.input.targetWriter) {
    throw new Error('Affiliate lifecycle publication requires an admitted target writer.');
  }
  const target = await context.input.targetWriter({
    database: context.transactionDatabase,
    client: context.transactionDatabase.rawClient ?? context.database.rawClient ?? prisma,
    contract: context.contract.policy,
    request: context.request,
    now: context.now,
  });
  if (target.candidateId !== candidate.id) {
    throw new Error('Affiliate lifecycle publication target does not match the candidate.');
  }
  await applyCommandTarget(
    context.transactionDatabase,
    context.input.supplySourceId,
    {
      ...target,
      status: 'PUBLISHED',
      evidenceRefs: [
        ...stringArray(candidate.evidenceRefs),
        ...stringArray(target.evidenceRefs),
      ],
    },
    context.now,
    context.evidenceRefs,
    context.contract.policy,
  );
};

const executeAffiliatePublishTarget = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  if (context.input.command !== 'PUBLISH_TARGET') return;
  const candidate = resolveAffiliatePublicationCandidate(context);
  await persistAffiliatePublication(context, candidate);
};

const isAffiliateRefreshCommand = (
  command: AffiliateSupplyLifecycleCommand,
): boolean => [
  'RECORD_REFRESH',
  'RECORD_EMPTY_REFRESH',
  'RECORD_REFRESH_FAILURE',
].includes(command);

const affiliateRefreshRunStatus = (
  command: AffiliateSupplyLifecycleCommand,
): 'FAILED' | 'SUCCEEDED' => command === 'RECORD_REFRESH_FAILURE' ? 'FAILED' : 'SUCCEEDED';

const affiliateRefreshCount = (value: unknown): number | undefined => (
  typeof value === 'number' ? Math.max(0, Math.trunc(value)) : undefined
);

const persistAffiliateRefreshRun = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const { transactionDatabase, request, input, now, evidenceRefs } = context;
  const runId = stringValue(request.runId);
  if (!runId || !transactionDatabase.runs?.update) return;
  const run = await transactionDatabase.runs.findUnique({ where: { id: runId } });
  await transactionDatabase.runs.update({
    where: { id: runId },
    data: {
      status: affiliateRefreshRunStatus(input.command),
      finishedAt: now,
      finalUrl: stringValue(request.finalUrl),
      httpStatus: affiliateRefreshCount(request.httpStatus),
      itemCount: affiliateRefreshCount(request.itemCount),
      candidateCount: affiliateRefreshCount(request.candidateCount),
      errorMessage: input.command === 'RECORD_REFRESH_FAILURE'
        ? stringValue(request.errorMessage)
        : null,
      logs: {
        ...recordValue(run?.logs),
        ...recordValue(request.runLogs),
        isEmptyStateMatched: request.isEmptyStateMatched === true
          || input.command === 'RECORD_EMPTY_REFRESH',
        evidenceRefs,
      },
    },
  });
};

const persistAffiliateRefreshTargets = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  for (const target of commandTargets(context.request)) {
    await applyCommandTarget(
      context.transactionDatabase,
      context.input.supplySourceId,
      target,
      context.now,
      context.evidenceRefs,
      context.contract.policy,
    );
  }
};

const shouldHoldAffiliateRefreshAutomation = (
  command: AffiliateSupplyLifecycleCommand,
  candidateCount: number | null,
  hasRequestedAutomationHold: boolean,
): boolean => {
  if (command === 'RECORD_REFRESH_FAILURE') return true;
  if (candidateCount === 0 && command !== 'RECORD_EMPTY_REFRESH') return true;
  return hasRequestedAutomationHold;
};

const affiliateRefreshSourceData = (
  context: AffiliateLifecycleCommandContext,
  runId: string | null,
  shouldHoldAutomation: boolean,
  hasRequestedAutomationHold: boolean,
  automationReview: Record<string, unknown>,
): Record<string, unknown> => {
  const { input, request, now, source } = context;
  const failedRefresh = input.command === 'RECORD_REFRESH_FAILURE';
  const reviewValue = shouldHoldAutomation
    ? (hasRequestedAutomationHold
      ? automationReview
      : {
          hold: true,
          reason: failedRefresh
            ? stringValue(request.errorMessage)
            : 'UNEXPLAINED_ZERO_RESULT',
        })
    : null;
  return {
    ...(runId && !failedRefresh ? { lastScrapeRunId: runId, lastScrapedAt: now } : {}),
    autoScrapeEnabled: shouldHoldAutomation ? false : source?.autoScrapeEnabled,
    metadata: prismaJsonValue({
      ...recordValue(source?.metadata),
      automationReviewRequired: reviewValue,
    }),
  };
};

const persistAffiliateRefreshSource = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const { transactionDatabase, source, request, input } = context;
  if (!source?.id) return;
  const runId = stringValue(request.runId);
  const candidateCount = typeof request.candidateCount === 'number'
    ? Math.trunc(request.candidateCount)
    : null;
  const automationReview = recordValue(request.automationReviewRequired);
  const hasRequestedAutomationHold = Object.keys(automationReview).length > 0;
  const shouldHoldAutomation = shouldHoldAffiliateRefreshAutomation(
    input.command,
    candidateCount,
    hasRequestedAutomationHold,
  );
  await transactionDatabase.sources.update({
    where: { id: source.id },
    data: affiliateRefreshSourceData(
      context,
      runId,
      shouldHoldAutomation,
      hasRequestedAutomationHold,
      automationReview,
    ),
  });
};

const executeAffiliateRefresh = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  if (!isAffiliateRefreshCommand(context.input.command)) return;
  await persistAffiliateRefreshRun(context);
  await persistAffiliateRefreshTargets(context);
  await persistAffiliateRefreshSource(context);
};

const executeAffiliateExclude = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  const {
    transactionDatabase,
    input,
    source,
    now,
  } = context;
    if (input.command === 'EXCLUDE_SOURCE') {
      await transactionDatabase.supplySources.update({
        where: { id: input.supplySourceId },
        data: { isExcluded: true, excludedAt: now },
      });
      if (source?.id) {
        await transactionDatabase.sources.update({
          where: { id: source.id },
          data: { status: 'EXCLUDED', autoScrapeEnabled: false },
        });
      }
    }
};

type AffiliateReviewerDisposition = Readonly<{
  automationReviewRequired: Record<string, unknown> | null;
  sourceStatus?: string;
}>;

const resolveAffiliateRegressionDisposition = (
  assessment: string,
  evidenceRefs: readonly string[],
): AffiliateReviewerDisposition => {
  if (!['PASS', 'FAIL'].includes(assessment)) {
    throw new Error('Supply Reviewer regression reconciliation requires PASS or FAIL.');
  }
  return {
    automationReviewRequired: assessment === 'FAIL'
      ? {
          hold: true,
          reason: 'REVIEWER_REGRESSION_ASSESSED',
          evidenceRefs,
        }
      : null,
  };
};

const resolveAffiliateExclusionDisposition = (
  outcome: string,
  recommendation: string,
  evidenceRefs: readonly string[],
): AffiliateReviewerDisposition => {
  const expectedRecommendation = outcome === 'SOURCE_EXCLUSION_EXCLUDE' ? 'EXCLUDE' : (
    outcome === 'SOURCE_EXCLUSION_KEEP' ? 'KEEP' : 'HUMAN_REVIEW'
  );
  if (recommendation !== expectedRecommendation) {
    throw new Error(`Supply Reviewer exclusion reconciliation requires ${expectedRecommendation}.`);
  }
  if (outcome === 'SOURCE_EXCLUSION_EXCLUDE') {
    return { automationReviewRequired: null, sourceStatus: 'EXCLUDED' };
  }
  if (outcome === 'SOURCE_EXCLUSION_HUMAN_REVIEW') {
    return {
      automationReviewRequired: {
        hold: true,
        reason: 'SOURCE_EXCLUSION_HUMAN_REVIEW',
        evidenceRefs,
      },
      sourceStatus: 'HUMAN_REVIEW_REQUIRED',
    };
  }
  return { automationReviewRequired: null };
};

const resolveAffiliateHumanReviewDisposition = (
  caseReason: string | null,
  evidenceRefs: readonly string[],
): AffiliateReviewerDisposition => {
  if (!caseReason) {
    throw new Error('Supply Reviewer human-review reconciliation requires a case reason.');
  }
  return {
    automationReviewRequired: {
      hold: true,
      reason: caseReason,
      evidenceRefs,
    },
    sourceStatus: 'HUMAN_REVIEW_REQUIRED',
  };
};

const persistAffiliateProducerRepair = async (
  context: AffiliateLifecycleCommandContext,
  repairIssues: readonly string[],
  evidenceRefs: readonly string[],
): Promise<AffiliateReviewerDisposition> => {
  const producerClaimId = stringValue(context.request.producerClaimId);
  const producerClaim = producerClaimId && context.transactionDatabase.gatewayClaims?.findUnique
    ? await context.transactionDatabase.gatewayClaims.findUnique({ where: { id: producerClaimId } })
    : null;
  const producerEnvelope = recordValue(producerClaim?.claimEnvelopeJson);
  const mappingJobId = stringValue(recordValue(producerEnvelope.subject).mappingJobId);
  if (!producerClaim || !mappingJobId) {
    throw new Error('Supply Reviewer repair reconciliation requires the producer subject mapping job.');
  }
  if (!repairIssues.length) {
    throw new Error('Supply Reviewer repair reconciliation requires repair issues.');
  }
  const updated = await context.transactionDatabase.mappingJobs.updateMany({
    where: { id: mappingJobId },
    data: {
      status: 'REVIEW_REQUIRED',
      errorMessage: repairIssues.join(', '),
    },
  });
  if (updated.count !== 1) {
    throw new Error('Supply Reviewer repair reconciliation must update exactly one Mapping Job.');
  }
  return {
    automationReviewRequired: {
      hold: true,
      reason: 'PRODUCER_REPAIR_REQUIRED',
      evidenceRefs,
    },
    sourceStatus: 'REVIEW_REQUIRED',
  };
};

const resolveAffiliateReviewerDisposition = async (
  context: AffiliateLifecycleCommandContext,
): Promise<AffiliateReviewerDisposition & {
  reviewerOutcome: string;
  assessment: string;
  recommendation: string;
  caseReason: string | null;
  repairIssues: string[];
}> => {
  const { request, input, evidenceRefs } = context;
  const reviewerOutcome = upper(request.reviewerOutcome);
  if (!(AFFILIATE_SUPPLY_REVIEWER_RECONCILE_OUTCOMES as readonly string[]).includes(reviewerOutcome)) {
    throw new Error('Supply Reviewer reconciliation requires a supported reviewer outcome.');
  }
  const assessment = upper(request.assessment);
  const recommendation = upper(request.recommendation);
  const caseReason = stringValue(request.caseReason);
  const repairIssues = stringArray(request.repairIssues);
  let disposition: AffiliateReviewerDisposition;
  switch (reviewerOutcome) {
    case 'REGRESSION_ASSESSED':
      disposition = resolveAffiliateRegressionDisposition(assessment, evidenceRefs);
      break;
    case 'SOURCE_EXCLUSION_EXCLUDE':
    case 'SOURCE_EXCLUSION_KEEP':
    case 'SOURCE_EXCLUSION_HUMAN_REVIEW':
      disposition = resolveAffiliateExclusionDisposition(reviewerOutcome, recommendation, evidenceRefs);
      break;
    case 'HUMAN_REVIEW_REQUIRED':
      disposition = resolveAffiliateHumanReviewDisposition(caseReason, evidenceRefs);
      break;
    default:
      disposition = await persistAffiliateProducerRepair(context, repairIssues, evidenceRefs);
      break;
  }
  return {
    ...disposition,
    reviewerOutcome,
    assessment,
    recommendation,
    caseReason,
    repairIssues,
  };
};

const affiliateReviewerExceptionHistory = (
  sourceMetadata: Record<string, unknown>,
): Record<string, unknown>[] => {
  if (!Array.isArray(sourceMetadata.exceptionHistory)) return [];
  return sourceMetadata.exceptionHistory.filter((item): item is Record<string, unknown> => (
    Boolean(item && typeof item === 'object' && !Array.isArray(item))
  ));
};

const persistAffiliateReviewerDispositionSource = async (
  context: AffiliateLifecycleCommandContext,
  disposition: Awaited<ReturnType<typeof resolveAffiliateReviewerDisposition>>,
): Promise<void> => {
  const { transactionDatabase, source, input, now, evidenceRefs } = context;
  if (!source?.id) return;
  const sourceMetadata = recordValue(source.metadata);
  const exceptionEntry = {
    type: 'SUPPLY_REVIEWER_DISPOSITION',
    outcome: disposition.reviewerOutcome,
    assessment: disposition.assessment || null,
    recommendation: disposition.recommendation || null,
    caseReason: disposition.caseReason,
    repairIssues: disposition.repairIssues,
    reviewerId: input.actorId,
    evidenceRefs,
    occurredAt: now.toISOString(),
  };
  await transactionDatabase.sources.update({
    where: { id: source.id },
    data: {
      ...(disposition.sourceStatus ? { status: disposition.sourceStatus } : {}),
      autoScrapeEnabled: disposition.automationReviewRequired === null
        ? source.autoScrapeEnabled
        : false,
      metadata: prismaJsonValue({
        ...sourceMetadata,
        automationReviewRequired: disposition.automationReviewRequired,
        exceptionHistory: [
          ...affiliateReviewerExceptionHistory(sourceMetadata),
          exceptionEntry,
        ].slice(-64),
      }),
    },
  });
};

const executeAffiliateReconcile = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  if (context.input.command !== 'RECONCILE' || context.input.authority !== 'SUPPLY_REVIEWER') return;
  const disposition = await resolveAffiliateReviewerDisposition(context);
  await persistAffiliateReviewerDispositionSource(context, disposition);
};

const prepareAffiliateRejectedTarget = (
  context: AffiliateLifecycleCommandContext,
): Record<string, unknown> => {
  const target = recordValue(context.request.target);
  if (!Object.keys(target).length) {
    target.targetType = stringValue(context.request.targetType) ?? '';
    target.targetId = stringValue(context.request.targetId) ?? '';
  }
  return target;
};

const findAffiliateRejectedTarget = async (
  context: AffiliateLifecycleCommandContext,
  targetType: string | null,
  targetId: string | null,
) => targetType && targetId && context.transactionDatabase.targets?.findFirst
  ? context.transactionDatabase.targets.findFirst({
      where: {
        supplySourceId: context.input.supplySourceId,
        targetType,
        targetId,
      },
    })
  : null;

const resolveAffiliateRejectedTarget = async (
  context: AffiliateLifecycleCommandContext,
): Promise<Record<string, unknown>> => {
  const target = prepareAffiliateRejectedTarget(context);
  const targetType = stringValue(target.targetType);
  const targetId = stringValue(target.targetId);
  const existingTarget = await findAffiliateRejectedTarget(context, targetType, targetId);
  if (!existingTarget) {
    throw new Error('Affiliate target rejection requires an existing target identity.');
  }
  return {
    ...target,
    targetType: target.targetType ?? existingTarget.targetType,
    targetId: target.targetId ?? existingTarget.targetId,
    sourceProfile: target.sourceProfile ?? existingTarget.sourceProfile,
    marketKey: target.marketKey ?? existingTarget.marketKey,
    sportId: target.sportId ?? existingTarget.sportId,
    status: 'REJECTED',
    rejectedAt: context.now.toISOString(),
  };
};

const persistAffiliateRejectedTarget = async (
  context: AffiliateLifecycleCommandContext,
  target: Record<string, unknown>,
): Promise<void> => {
  await applyCommandTarget(
    context.transactionDatabase,
    context.input.supplySourceId,
    target,
    context.now,
    context.evidenceRefs,
    context.contract.policy,
  );
  await rejectAffiliateDomainTarget(context.transactionDatabase, target);
};

const executeAffiliateRejectTarget = async (
  context: AffiliateLifecycleCommandContext,
): Promise<void> => {
  if (context.input.command !== 'REJECT_TARGET') return;
  const target = await resolveAffiliateRejectedTarget(context);
  await persistAffiliateRejectedTarget(context, target);
};

type AffiliateLifecycleCommandHandler = (
  context: AffiliateLifecycleCommandContext,
) => Promise<void>;

const AFFILIATE_LIFECYCLE_COMMAND_HANDLERS: Partial<
  Record<AffiliateSupplyLifecycleCommand, AffiliateLifecycleCommandHandler>
> = {
  CREATE_SUCCESSOR: executeAffiliateCreateSuccessor,
  REVALIDATE_IDENTITY: executeAffiliateRevalidateIdentity,
  RECORD_MAPPING: executeAffiliateRecordMapping,
  APPROVE: executeAffiliateApprove,
  ACTIVATE: executeAffiliateActivate,
  PUBLISH_TARGET: executeAffiliatePublishTarget,
  RECORD_REFRESH: executeAffiliateRefresh,
  RECORD_EMPTY_REFRESH: executeAffiliateRefresh,
  RECORD_REFRESH_FAILURE: executeAffiliateRefresh,
  EXCLUDE_SOURCE: executeAffiliateExclude,
  RECONCILE: executeAffiliateReconcile,
  REJECT_TARGET: executeAffiliateRejectTarget,
};
const buildAffiliateLifecycleRequest = (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
): Record<string, unknown> => ({
  ...(input.request ?? {}),
  ...(input.supplyContractVersion === undefined
    ? {}
    : { supplyContractVersion: input.supplyContractVersion }),
  ...(input.supplyContractHash === undefined
    ? {}
    : { supplyContractHash: input.supplyContractHash }),
});

type AffiliateLifecycleReplay = Readonly<{
  result: AffiliateSupplyLifecycleCommandResult;
  alertContract: AffiliateSupplyInvariantAlertContract | null;
}>;

const replayAffiliateLifecycleCommand = async (
  transactionDatabase: AffiliateSupplyDatabase,
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
): Promise<AffiliateLifecycleReplay | null> => {
  const existing = await transactionDatabase.transitions.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (!existing) return null;
  const replayHash = affiliateLifecycleRequestHash({
    supplySourceId: String(existing.supplySourceId ?? input.supplySourceId),
    command: String(existing.command ?? input.command) as AffiliateSupplyLifecycleCommand,
    contractVersion: Number(existing.contractVersion),
    contractHash: String(existing.contractHash),
    request: recordValue(existing.requestJson),
  });
  const currentRequestHash = affiliateLifecycleRequestHash({
    supplySourceId: input.supplySourceId,
    command: input.command,
    contractVersion: Number(existing.contractVersion),
    contractHash: String(existing.contractHash),
    request,
  });
  if (replayHash !== currentRequestHash) {
    throw new Error('Affiliate lifecycle idempotency key was reused with a different request.');
  }
  const result = existing.resultJson as unknown as AffiliateSupplyAssessment;
  const storedRequest = recordValue(existing.requestJson);
  const alertContract = readAffiliateLifecycleAlertContractIntent(storedRequest)
    ?? await affiliateLifecycleAlertContractFallback(
      transactionDatabase,
      input,
      request,
      existing,
      result,
    );
  return {
    result: {
      assessment: result,
      transition: existing,
      isReplayed: true,
    },
    alertContract,
  };
};

const assertAffiliateCreateRootReady = async (
  transactionDatabase: AffiliateSupplyDatabase,
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  root: AffiliateSupplySources,
  request: Record<string, unknown>,
): Promise<void> => {
  if (input.command !== 'CREATE_ROOT') return;
  const latestTransition = transactionDatabase.transitions.findFirst
    ? await transactionDatabase.transitions.findFirst({
      where: { supplySourceId: input.supplySourceId },
      orderBy: { sequence: 'desc' },
    })
    : null;
  if (Number(root.lifecycleGeneration ?? 0) !== 0 || latestTransition) {
    throw new Error('Affiliate Supply Source root creation requires an uninitialized lifecycle.');
  }
  const requestedIdentityKey = stringValue(request.identityKey);
  if (requestedIdentityKey && requestedIdentityKey !== root.identityKey) {
    throw new Error('Affiliate Supply Source root creation identity does not match the root.');
  }
};
const assertAffiliateLifecycleRolloutCohort = (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  root: AffiliateSupplySources,
): void => {
  const requestedRolloutCohort = input.rolloutCohort?.trim();
  if (
    input.rolloutCohort !== undefined
    && requestedRolloutCohort !== root.rolloutCohort
  ) {
    throw new Error('Affiliate lifecycle command rollout cohort does not match the Supply Source root.');
  }
};

const refreshFailureCommand = 'RECORD_REFRESH_FAILURE' as const;

const refreshFailureRunIdFor = (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
): string | null => input.command === refreshFailureCommand ? stringValue(request.runId) : null;

const loadAffiliateRefreshFailureRun = async (
  transactionDatabase: AffiliateSupplyDatabase,
  runId: string | null,
): Promise<AffiliateScrapeRuns | null> => (
  runId && transactionDatabase.runs?.findUnique
    ? transactionDatabase.runs.findUnique({ where: { id: runId } })
    : null
);

const assertAffiliateRefreshFailureRun = (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  root: AffiliateSupplySources,
  runId: string | null,
  run: AffiliateScrapeRuns | null,
): void => {
  if (input.command !== refreshFailureCommand) return;
  if (!runId || !run) {
    throw new Error('Affiliate refresh failure requires a durable scrape invocation.');
  }
  const runStatus = String(run.status ?? '').toUpperCase();
  if (['SUCCEEDED', 'SUCCESS', 'COMPLETED'].includes(runStatus)) {
    throw new Error('Affiliate refresh failure cannot replace a successful scrape invocation.');
  }
  const runMatchesRoot = run.supplySourceId === input.supplySourceId
    || Boolean(root.liveSourceId && run.sourceId === root.liveSourceId);
  if (!runMatchesRoot) {
    throw new Error('Affiliate refresh failure invocation does not belong to the Supply Source.');
  }
};

const commandContractVersionFor = (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
  contract: ActiveAffiliateSupplyContractResult,
): number => {
  const requestedVersion = typeof request.supplyContractVersion === 'number'
    && Number.isInteger(request.supplyContractVersion)
    ? request.supplyContractVersion
    : null;
  return input.supplyContractVersion ?? requestedVersion ?? contract.policy.version;
};

const commandContractHashFor = (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
  contract: ActiveAffiliateSupplyContractResult,
): string => input.supplyContractHash
  ?? stringValue(request.supplyContractHash)
  ?? contract.policy.hash;

const lifecycleSnapshotExcludeRunId = (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
): string | null => (
  new Set<AffiliateSupplyLifecycleCommand>([
    'RECORD_REFRESH',
    'RECORD_EMPTY_REFRESH',
    'RECORD_REFRESH_FAILURE',
  ]).has(input.command)
    ? stringValue(request.runId)
    : null
);

const loadAffiliateLifecycleSource = async (
  transactionDatabase: AffiliateSupplyDatabase,
  root: AffiliateSupplySources,
  supplySourceId: string,
): Promise<AffiliateScrapeSources | null> => root.liveSourceId
  ? transactionDatabase.sources.findUnique({ where: { id: root.liveSourceId } })
  : transactionDatabase.sources.findFirst({
    where: { supplySourceId },
    orderBy: { createdAt: 'asc' },
  });

const prepareAffiliateLifecycleCommandContext = async (
  database: AffiliateSupplyDatabase,
  transactionDatabase: AffiliateSupplyDatabase,
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
  now: Date,
): Promise<AffiliateLifecycleCommandContext> => {
  const root = await transactionDatabase.supplySources.findUnique({
    where: { id: input.supplySourceId },
  });
  if (!root) throw new Error('Affiliate Supply Source not found.');
  assertAffiliateLifecycleRolloutCohort(input, root);
  await assertAffiliateCreateRootReady(transactionDatabase, input, root, request);
  const refreshFailureRunId = refreshFailureRunIdFor(input, request);
  const refreshFailureRun = await loadAffiliateRefreshFailureRun(transactionDatabase, refreshFailureRunId);
  assertAffiliateRefreshFailureRun(input, root, refreshFailureRunId, refreshFailureRun);
  const contract = await loadActiveAffiliateSupplyContract({
    db: transactionDatabase,
    rolloutCohort: input.rolloutCohort ?? root.rolloutCohort,
  });
  const commandContractVersion = commandContractVersionFor(input, request, contract);
  const commandContractHash = commandContractHashFor(input, request, contract);
  const snapshotBefore = await loadSnapshot(
    transactionDatabase,
    input.supplySourceId,
    contract.policy,
    now,
    lifecycleSnapshotExcludeRunId(input, request),
  );
  const assessmentBefore = deriveAffiliateSupplyAssessment(snapshotBefore);
  const commandDecision = validateAffiliateSupplyCommand({
    command: input.command,
    authority: input.authority,
    expectedLifecycleGeneration: input.expectedLifecycleGeneration,
    currentLifecycleGeneration: root.lifecycleGeneration,
    activeContractVersion: contract.policy.version,
    activeContractHash: contract.policy.hash,
    commandContractVersion,
    commandContractHash,
    evidenceRefs: stringArray(request.evidenceRefs),
    reviewerOutcome: stringValue(request.reviewerOutcome),
    assessment: assessmentBefore,
  });
  if (!commandDecision.isAccepted) {
    throw new Error(`Affiliate lifecycle command rejected: ${commandDecision.reasonCodes.join(', ')}`);
  }
  const source = await loadAffiliateLifecycleSource(
    transactionDatabase,
    root,
    input.supplySourceId,
  );
  const mappingId = stringValue(request.mappingId);
  const evidenceRefs = [
    ...stringArray(request.evidenceRefs),
    ...(refreshFailureRunId ? [`scrape-run:${refreshFailureRunId}`] : []),
    `supply-source:${input.supplySourceId}`,
  ];
  return {
    database,
    transactionDatabase,
    input,
    root,
    source,
    request,
    now,
    evidenceRefs,
    refreshFailureRunId,
    mappingId,
    contract,
    snapshotBefore,
    assessmentBefore,
    commandContractVersion,
    commandContractHash,
  };
};

const refreshAffiliateLifecycleAssessment = async (
  context: AffiliateLifecycleCommandContext,
  assessment: AffiliateSupplyAssessment,
): Promise<AffiliateSupplyAssessment> => {
  if (!assessment.isAutomationEnabled || context.source?.autoScrapeEnabled !== true || !context.source.id) {
    return assessment;
  }
  await context.transactionDatabase.sources.update({
    where: { id: context.source.id },
    data: { autoScrapeEnabled: false },
  });
  return deriveAndPersistAffiliateSupplyAssessment({
    supplySourceId: context.input.supplySourceId,
    contract: context.contract.policy,
    db: context.transactionDatabase,
    now: context.now,
    isOperationalAlertEmissionEnabled: false,
  });
};

const persistAffiliateLifecycleAssessment = async (
  context: AffiliateLifecycleCommandContext,
): Promise<AffiliateSupplyAssessment> => {
  const assessment = await deriveAndPersistAffiliateSupplyAssessment({
    supplySourceId: context.input.supplySourceId,
    contract: context.contract.policy,
    db: context.transactionDatabase,
    now: context.now,
    isOperationalAlertEmissionEnabled: false,
  });
  return refreshAffiliateLifecycleAssessment(context, assessment);
};

const updateAffiliateLifecycleContractFields = async (
  context: AffiliateLifecycleCommandContext,
  result: AffiliateSupplyAssessment,
): Promise<void> => {
  await context.transactionDatabase.supplySources.update({
    where: { id: context.input.supplySourceId },
    data: {
      lifecycleGeneration: result.lifecycleGeneration,
      activeSupplyContractVersion: context.commandContractVersion,
      activeSupplyContractHash: context.commandContractHash,
    },
  });
  if (!context.source?.id || !context.transactionDatabase.sources?.update) return;
  await context.transactionDatabase.sources.update({
    where: { id: context.source.id },
    data: {
      lifecycleGeneration: result.lifecycleGeneration,
      activeSupplyContractVersion: context.commandContractVersion,
      activeSupplyContractHash: context.commandContractHash,
    },
  });
};

const finalizeAffiliateLifecycleCommand = async (
  context: AffiliateLifecycleCommandContext,
): Promise<AffiliateSupplyLifecycleCommandResult> => {
  const assessment = await persistAffiliateLifecycleAssessment(context);
  const current = await context.transactionDatabase.supplySources.findUnique({
    where: { id: context.input.supplySourceId },
  });
  if (!current) throw new Error('Affiliate Supply Source not found after lifecycle command.');
  const result: AffiliateSupplyAssessment = {
    ...assessment,
    lifecycleGeneration: current.lifecycleGeneration + 1,
  };
  const transitionRequestBase = affiliateLifecycleRequestWithoutAlertIntent(context.request);
  const transitionRequest = result.invariantViolations.length > 0
    ? {
        ...transitionRequestBase,
        [AFFILIATE_LIFECYCLE_ALERT_INTENT_KEY]: {
          rolloutCohort: context.contract.policy.rolloutCohort,
          version: context.commandContractVersion,
          hash: context.commandContractHash,
        },
      }
    : transitionRequestBase;
  const transitionInput: AffiliateSupplyTransitionInput = {
    supplySourceId: context.input.supplySourceId,
    command: context.input.command,
    idempotencyKey: context.input.idempotencyKey,
    request: transitionRequest,
    result,
    expectedGeneration: context.input.expectedLifecycleGeneration,
    contractVersion: context.commandContractVersion,
    contractHash: context.commandContractHash,
    actorKind: context.input.actorKind,
    actorId: context.input.actorId,
    executingAgentId: context.input.executingAgentId,
    fromStage: context.assessmentBefore.stage,
    toStage: result.stage,
    outcome: result.outcome,
    reasonCodes: result.reasonCodes,
    evidenceRefs: Array.from(new Set([...result.evidenceRefs, ...context.evidenceRefs])),
    now: context.now,
  };
  const normalizedRequest = normalizeAffiliateLifecycleJson(transitionRequest) as Record<string, unknown>;
  const normalizedResult = normalizeAffiliateLifecycleJson(result) as Record<string, unknown>;
  const transitionResult = await recordAffiliateSupplyTransitionInTransaction(
    context.transactionDatabase,
    transitionInput,
    normalizedRequest,
    affiliateLifecycleRequestHash({
      supplySourceId: transitionInput.supplySourceId,
      command: transitionInput.command,
      contractVersion: transitionInput.contractVersion,
      contractHash: transitionInput.contractHash,
      request: normalizedRequest,
    }),
    hashAffiliateAgentValue(normalizedResult),
    context.now,
  );
  await updateAffiliateLifecycleContractFields(context, result);
  return {
    assessment: result,
    transition: transitionResult.transition,
    isReplayed: transitionResult.isReplayed,
  };
};

type AffiliateLifecycleTransactionResult = Readonly<{
  result: AffiliateSupplyLifecycleCommandResult;
  alertContract: AffiliateSupplyInvariantAlertContract | null;
}>;

const executeAffiliateLifecycleInTransaction = async (
  database: AffiliateSupplyDatabase,
  transactionDatabase: AffiliateSupplyDatabase,
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
  request: Record<string, unknown>,
  now: Date,
): Promise<AffiliateLifecycleTransactionResult> => {
  const replay = await replayAffiliateLifecycleCommand(transactionDatabase, input, request);
  if (replay) return replay;
  const context = await prepareAffiliateLifecycleCommandContext(
    database,
    transactionDatabase,
    input,
    request,
    now,
  );
  await AFFILIATE_LIFECYCLE_COMMAND_HANDLERS[input.command]?.(context);
  return {
    result: await finalizeAffiliateLifecycleCommand(context),
    alertContract: context.contract.policy,
  };
};


export const executeAffiliateSupplyLifecycleCommand = async (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
): Promise<AffiliateSupplyLifecycleCommandResult> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const request = buildAffiliateLifecycleRequest(input);
  const now = input.now ?? new Date();
  const transaction = await withSupplyTransaction(
    database,
    (transactionDatabase) => executeAffiliateLifecycleInTransaction(
      database,
      transactionDatabase,
      input,
      request,
      now,
    ),
    {
      requireTransaction: true,
    },
  );
  if (
    !affiliateSupplyDatabaseHasExistingTransaction(database)
    && transaction.alertContract
    && (input.operationalAlert || database.rawClient)
  ) {
    await emitPersistedInvariantAlerts(
      transaction.result.assessment,
      transaction.alertContract,
      input.operationalAlert,
    );
  }
  return transaction.result;
};
const AFFILIATE_LIFECYCLE_COMMANDS: readonly AffiliateSupplyLifecycleCommand[] = [
  'CREATE_ROOT',
  'RECORD_MAPPING',
  'APPROVE',
  'ACTIVATE',
  'PUBLISH_TARGET',
  'RECORD_REFRESH',
  'RECORD_EMPTY_REFRESH',
  'RECORD_REFRESH_FAILURE',
  'REVALIDATE_IDENTITY',
  'EXCLUDE_SOURCE',
  'REJECT_TARGET',
  'CREATE_SUCCESSOR',
  'RECONCILE',
];

const lifecycleCommandFromDecision = (
  decision: Record<string, unknown>,
): AffiliateSupplyLifecycleCommand | null => {
  const value = String(decision.command ?? '').trim().toUpperCase();
  return AFFILIATE_LIFECYCLE_COMMANDS.includes(value as AffiliateSupplyLifecycleCommand)
    ? value as AffiliateSupplyLifecycleCommand
    : null;
};

type AffiliateRecordedDecisionIdentity = Readonly<{
  caseId: string;
  decisionHash: string;
  recordedHumanActorId: string;
  commandRef: string;
}>;

type AffiliateRecordedDecision = Readonly<{
  decision: Record<string, unknown>;
  transition?: AffiliateSupplyLifecycleTransitions;
}>;

const findAffiliateRecordedApproval = async (
  database: AffiliateSupplyDatabase,
  identity: AffiliateRecordedDecisionIdentity,
) => {
  const approvalJob = database.approvals?.findUnique
    ? await database.approvals.findUnique({ where: { id: identity.commandRef } })
    : database.approvals?.findFirst
      ? await database.approvals.findFirst({
        where: {
          supplySourceId: identity.caseId,
          subjectKey: identity.commandRef,
        },
        orderBy: { updatedAt: 'desc' },
      })
      : null;
  if (
    approvalJob
    && (
      approvalJob.supplySourceId !== identity.caseId
      || !['APPROVED', 'COMPLETED'].includes(String(approvalJob.status).toUpperCase())
    )
  ) return null;
  return approvalJob;
};

const findAffiliateRecordedTransition = async (
  database: AffiliateSupplyDatabase,
  identity: AffiliateRecordedDecisionIdentity,
) => database.transitions?.findFirst
  ? database.transitions.findFirst({
      where: {
        supplySourceId: identity.caseId,
        commandRef: identity.commandRef,
      },
      orderBy: { occurredAt: 'desc' },
    })
  : null;

const selectAffiliateRecordedDecision = (
  approvalJob: AffiliateApprovalJobs | null,
  transition: AffiliateSupplyLifecycleTransitions | null,
): Record<string, unknown> => {
  const approvalDecision = recordValue(approvalJob?.decision);
  const transitionDecision = recordValue(transition?.requestJson);
  return Object.keys(transitionDecision).length ? transitionDecision : approvalDecision;
};

const affiliateRecordedDecisionActorId = (
  approvalJob: AffiliateApprovalJobs | null,
  transition: AffiliateSupplyLifecycleTransitions | null,
  decision: Record<string, unknown>,
): string | null => stringValue(
  decision.recordedHumanActorId
  ?? decision.reviewerId
  ?? approvalJob?.reviewerId
  ?? transition?.actorId,
);

const affiliateRecordedDecisionHash = (
  transition: AffiliateSupplyLifecycleTransitions | null,
  decision: Record<string, unknown>,
): string | null => stringValue(decision.decisionHash) ?? transition?.requestHash ?? null;

const affiliateRecordedTransitionMatchesIdentity = (
  transition: AffiliateSupplyLifecycleTransitions | null,
  identity: AffiliateRecordedDecisionIdentity,
): boolean => !transition || [
  stringValue(transition.supplySourceId),
  stringValue(transition.commandRef),
].every((value, index) => (
  value === null
  || value === (index === 0 ? identity.caseId : identity.commandRef)
));

const affiliateRecordedDecisionMatchesIdentity = (
  identity: AffiliateRecordedDecisionIdentity,
  approvalJob: AffiliateApprovalJobs | null,
  transition: AffiliateSupplyLifecycleTransitions | null,
  decision: Record<string, unknown>,
): boolean => {
  const recordedCommandRef = stringValue(
    decision.commandRef ?? decision.lifecycleCommandRef,
  );
  const actorId = affiliateRecordedDecisionActorId(approvalJob, transition, decision);
  return Object.keys(decision).length > 0
    && [stringValue(decision.caseId), stringValue(decision.supplySourceId)]
      .every((value) => value === null || value === identity.caseId)
    && (recordedCommandRef === null || recordedCommandRef === identity.commandRef)
    && actorId === identity.recordedHumanActorId
    && affiliateRecordedDecisionHash(transition, decision) === identity.decisionHash;
};

const resolveAffiliateRecordedDecision = async (
  database: AffiliateSupplyDatabase,
  identity: AffiliateRecordedDecisionIdentity,
): Promise<AffiliateRecordedDecision | null> => {
  const approvalJob = await findAffiliateRecordedApproval(database, identity);
  const transition = await findAffiliateRecordedTransition(database, identity);
  if (!affiliateRecordedTransitionMatchesIdentity(transition, identity)) return null;
  const recordedDecision = selectAffiliateRecordedDecision(approvalJob, transition);
  if (
    !affiliateRecordedDecisionMatchesIdentity(
      identity,
      approvalJob,
      transition,
      recordedDecision,
    )
  ) return null;
  return {
    decision: recordedDecision,
    ...(transition ? { transition } : {}),
  };
};

export const createAffiliateSupplyLifecycleAuthority = (input: Readonly<{
  db?: AffiliateSupplyDatabase;
  clock?: () => Date;
  contractRegistry?: AffiliateAgentActiveContractRegistry;
}> = {}): AffiliateAgentLifecycleAuthority => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.clock ?? (() => new Date());
  const assertGatewayContract = async (contract: AffiliateSupplyContractPolicy): Promise<void> => {
    if (!input.contractRegistry) return;
    const bundle = recordValue(await input.contractRegistry.loadActiveBundle());
    const activeSupplyContract = recordValue(bundle.supplyContract);
    if (
      Number(activeSupplyContract.version) !== contract.version
      || String(activeSupplyContract.hash ?? '') !== contract.hash
    ) {
      throw new Error('Gateway and lifecycle Supply Contracts do not match.');
    }
  };


  const findTransitionByReceipt = async (receiptId: string): Promise<AffiliateSupplyLifecycleTransitions | null> => (
    database.transitions?.findUnique
      ? database.transitions.findUnique({ where: { idempotencyKey: receiptId } })
      : null
  );

  return {
    kind: 'AVAILABLE',
    currentGeneration: async (supplySourceId) => {
      const root = await database.supplySources.findUnique({ where: { id: supplySourceId } });
      if (!root) throw new Error('Affiliate Supply Source not found.');
      return root.lifecycleGeneration;
    },
    resolveRecordedCommand: async (identity) => (
      (await resolveAffiliateRecordedDecision(database, identity)) ? identity : null
    ),
    execute: async (execution) => {
      const recorded = await resolveAffiliateRecordedDecision(database, execution.identity);
      if (!recorded) throw new Error('The recorded human lifecycle decision was not found.');
      const expectedInputHash = stringValue(recorded.decision.commandHash);
      if (expectedInputHash && expectedInputHash !== execution.inputHash) {
        throw new Error('The lifecycle command input hash does not match the recorded decision.');
      }
      if (recorded.transition) {
        if (recorded.transition.generation !== execution.expectedGeneration + 1) {
          throw new Error('The recorded lifecycle transition generation is stale.');
        }
        return {
          receiptId: execution.receiptId,
          lifecycleGeneration: recorded.transition.generation,
          ...recordValue(recorded.transition.resultJson),
        };
      }
      const command = lifecycleCommandFromDecision(recorded.decision);
      if (!command) throw new Error('The recorded human lifecycle decision has no executable command.');
      const lifecycleRoot = await database.supplySources.findUnique({
        where: { id: execution.identity.caseId },
      });
      const activeContract = await loadActiveAffiliateSupplyContract({
        db: database,
        rolloutCohort: lifecycleRoot?.rolloutCohort,
      });
      await assertGatewayContract(activeContract.policy);
      const decisionRequest = recordValue(recorded.decision.request ?? recorded.decision.payload);
      const evidenceRefs = Array.from(new Set([
        ...stringArray(recorded.decision.evidenceRefs),
        ...stringArray(recorded.decision.reviewerEvidenceRefs),
        `lifecycle-command:${execution.identity.commandRef}`,
      ]));
      const result = await executeAffiliateSupplyLifecycleCommand({
        supplySourceId: execution.identity.caseId,
        command,
        authority: 'HUMAN_DIRECTED_EXECUTOR',
        expectedLifecycleGeneration: execution.expectedGeneration,
        supplyContractVersion: execution.supplyContractVersion,
        supplyContractHash: execution.supplyContractHash,
        actorKind: 'HUMAN_DIRECTED_EXECUTOR',
        actorId: execution.identity.recordedHumanActorId,
        executingAgentId: execution.invocationId,
        idempotencyKey: execution.receiptId,
        request: {
          ...decisionRequest,
          commandRef: execution.identity.commandRef,
          decisionHash: execution.identity.decisionHash,
          evidenceRefs,
        },
        db: database,
        now: now(),
      });
      return {
        ...result.assessment,
        receiptId: execution.receiptId,
      };
    },
    recover: async (receiptId) => {
      const transition = await findTransitionByReceipt(receiptId);
      if (!transition) return null;
      return {
        receiptId,
        lifecycleGeneration: transition.generation,
        ...recordValue(transition.resultJson),
      };
    },
  };
};


const loadAffiliateContractImpactTargets = async (
  database: AffiliateSupplyDatabase,
  sources: readonly AffiliateSupplySources[],
): Promise<AffiliateSupplyContractImpactTargetRow[]> => {
  if (typeof database.targets?.findMany !== 'function' || !sources.length) return [];
  return database.targets.findMany({
    where: { supplySourceId: { in: sources.map((source) => source.id) } },
    select: { supplySourceId: true, marketKey: true, sportId: true, sourceProfile: true },
  });
};

const indexAffiliateContractImpactTargets = (
  targetRows: readonly AffiliateSupplyContractImpactTargetRow[],
): Map<string, AffiliateSupplyContractImpactCell[]> => {
  const targetCellsBySource = new Map<string, AffiliateSupplyContractImpactCell[]>();
  for (const target of targetRows) {
    const sourceCells = targetCellsBySource.get(target.supplySourceId) ?? [];
    sourceCells.push({
      marketKey: target.marketKey ?? null,
      sportId: target.sportId ?? null,
      sourceProfile: String(target.sourceProfile ?? ''),
    });
    targetCellsBySource.set(target.supplySourceId, sourceCells);
  }
  return targetCellsBySource;
};

const affiliateDelegateHasFindMany = (delegate: unknown): boolean => (
  Boolean(
    delegate
    && typeof delegate === 'object'
    && 'findMany' in delegate
    && typeof (delegate as { findMany?: unknown }).findMany === 'function',
  )
);

const hasAffiliateAssessmentLoaders = (
  database: AffiliateSupplyDatabase,
  sources: readonly AffiliateSupplySources[],
): boolean => Boolean(
  sources.length
  && [
    database.sources,
    database.intakes,
    database.mappings,
    database.mappingJobs,
    database.approvals,
    database.runs,
    database.candidates,
    database.targets,
    database.supplySources,
  ].every(affiliateDelegateHasFindMany),
);

type AffiliateContractImpactAssessments = Readonly<{
  current: Map<string, AffiliateSupplyAssessment>;
  next: Map<string, AffiliateSupplyAssessment>;
}>;

const loadAffiliateContractImpactAssessments = async (
  database: AffiliateSupplyDatabase,
  sources: readonly AffiliateSupplySources[],
  currentPolicy: AffiliateSupplyContractPolicy,
  nextPolicy: AffiliateSupplyContractPolicy,
): Promise<AffiliateContractImpactAssessments> => {
  const current = new Map<string, AffiliateSupplyAssessment>();
  const next = new Map<string, AffiliateSupplyAssessment>();
  if (!hasAffiliateAssessmentLoaders(database, sources)) return { current, next };
  const now = new Date();
  const roots = sources as AffiliateSupplySources[];
  const [currentSnapshots, nextSnapshots] = await Promise.all([
    loadSnapshots(database, roots, currentPolicy, now),
    loadSnapshots(database, roots, nextPolicy, now),
  ]);
  for (const source of sources) {
    const currentSnapshot = currentSnapshots.get(source.id);
    const nextSnapshot = nextSnapshots.get(source.id);
    if (currentSnapshot) current.set(source.id, deriveAffiliateSupplyAssessment(currentSnapshot));
    if (nextSnapshot) next.set(source.id, deriveAffiliateSupplyAssessment(nextSnapshot));
  }
  return { current, next };
};
const affiliateContractImpactCurrentFields = (
  source: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment | undefined,
): Pick<AffiliateSupplyContractImpactSource, 'stage' | 'targetContribution' | 'isAutomationEnabled' | 'repairPriority' | 'freshnessStatus'> => ({
  stage: assessment?.stage ?? source.derivedStage,
  targetContribution: assessment?.targetContribution ?? source.targetContribution,
  isAutomationEnabled: assessment?.isAutomationEnabled ?? source.isAutomationEnabled,
  repairPriority: assessment?.repairPriority ?? source.repairPriority,
  freshnessStatus: affiliateContractImpactFreshness(source, assessment),
});

const affiliateContractImpactTargetCells = (
  source: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment | undefined,
  fallback: ReadonlyMap<string, AffiliateSupplyContractImpactCell[]>,
) => assessment
  ? targetCellsForAssessment(assessment)
  : fallback.get(source.id) ?? [];

const affiliateContractImpactNextFields = (
  assessment: AffiliateSupplyAssessment | undefined,
): Partial<Pick<AffiliateSupplyContractImpactSource, 'nextStage' | 'nextTargetContribution' | 'isNextAutomationEnabled' | 'nextRepairPriority'>> => assessment
  ? {
      nextStage: assessment.stage,
      nextTargetContribution: assessment.targetContribution,
      isNextAutomationEnabled: assessment.isAutomationEnabled,
      nextRepairPriority: assessment.repairPriority,
    }
  : {};

const affiliateContractImpactFreshFields = (
  currentAssessment: AffiliateSupplyAssessment | undefined,
  nextAssessment: AffiliateSupplyAssessment | undefined,
): Partial<Pick<AffiliateSupplyContractImpactSource, 'currentFreshTargetCells' | 'nextFreshTargetCells'>> => ({
  ...(currentAssessment
    ? { currentFreshTargetCells: freshTargetCellsForAssessment(currentAssessment) }
    : {}),
  ...(nextAssessment
    ? { nextFreshTargetCells: freshTargetCellsForAssessment(nextAssessment) }
    : {}),
});

const buildAffiliateContractImpactSource = (
  source: AffiliateSupplySources,
  currentAssessment: AffiliateSupplyAssessment | undefined,
  nextAssessment: AffiliateSupplyAssessment | undefined,
  targetCellsBySource: ReadonlyMap<string, AffiliateSupplyContractImpactCell[]>,
): AffiliateSupplyContractImpactSource => ({
  id: source.id,
  ...affiliateContractImpactCurrentFields(source, currentAssessment),
  ...affiliateContractImpactNextFields(nextAssessment),
  targetCells: affiliateContractImpactTargetCells(source, currentAssessment, targetCellsBySource),
  ...affiliateContractImpactFreshFields(currentAssessment, nextAssessment),
});

const affiliateContractImpactFreshness = (
  source: AffiliateSupplySources,
  currentAssessment: AffiliateSupplyAssessment | undefined,
): AffiliateSupplyFreshnessStatus => {
  if (currentAssessment?.freshnessStatus) return currentAssessment.freshnessStatus;
  return ['FRESH', 'STALE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(source.freshnessStatus)
    ? source.freshnessStatus as AffiliateSupplyFreshnessStatus
    : 'UNKNOWN';
};


export const reconcileAffiliateSupplyContractImpact = async (input: Readonly<{
  nextPolicy: AffiliateSupplyContractPolicy;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
}>): Promise<ReturnType<typeof buildAffiliateSupplyContractImpactReport>> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const active = await loadActiveAffiliateSupplyContract({ db: database, rolloutCohort: input.rolloutCohort });
  const sources = await database.supplySources.findMany({
    where: { rolloutCohort: input.rolloutCohort ?? active.manifest.rolloutCohort },
  });
  const targetRows = await loadAffiliateContractImpactTargets(database, sources);
  const targetCellsBySource = indexAffiliateContractImpactTargets(targetRows);
  const currentPolicy = normalizeAffiliateSupplyContractPolicy(
    active.manifest.supplyContract,
    active.manifest.rolloutCohort,
  );
  const assessments = await loadAffiliateContractImpactAssessments(
    database,
    sources,
    currentPolicy,
    input.nextPolicy,
  );
  return buildAffiliateSupplyContractImpactReport({
    currentManifest: active.manifest,
    sources: sources.map((source) => buildAffiliateContractImpactSource(
      source,
      assessments.current.get(source.id),
      assessments.next.get(source.id),
      targetCellsBySource,
    )),
    nextPolicy: input.nextPolicy,
  });
};

const targetKeyFor = (target: Readonly<{ marketKey: string; sportId: string; sourceProfile: string }>): string => `${target.marketKey}:${target.sportId}:${target.sourceProfile}`.toLowerCase();

const affiliateTargetNaturalExpiry = (
  target: Readonly<{ metadata?: unknown }>,
): Date | null => {
  const metadata = recordValue(target.metadata);
  return toDate(metadata.naturalExpiryAt ?? metadata.endsAt ?? metadata.startsAt);
};

const affiliateTargetMaximumAgeHours = (
  target: Readonly<{ sourceProfile?: string | null }>,
  contract: AffiliateSupplyContractPolicy,
): number => contract.freshnessWindows.find((window) => (
  window.sourceProfile.toUpperCase() === String(target.sourceProfile ?? '').toUpperCase()
))?.maximumAgeHours ?? 24;

const isFreshTargetForDemand = (
  target: Readonly<{
    status?: unknown;
    rejectedAt?: Date | string | null;
    freshnessExpiresAt?: Date | string | null;
    lastSuccessfulRefreshAt?: Date | string | null;
    metadata?: unknown;
    sourceProfile?: string | null;
  }>,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): boolean => {
  if (String(target.status ?? '').toUpperCase() !== 'PUBLISHED') return false;
  const naturalExpiry = affiliateTargetNaturalExpiry(target);
  if (naturalExpiry && naturalExpiry.getTime() <= now.getTime()) return false;
  if (toDate(target.rejectedAt)) return false;
  const expiresAt = toDate(target.freshnessExpiresAt);
  if (expiresAt) return expiresAt.getTime() > now.getTime();
  const refreshedAt = toDate(target.lastSuccessfulRefreshAt);
  if (!refreshedAt) return false;
  const maximumAgeHours = affiliateTargetMaximumAgeHours(target, contract);
  return refreshedAt.getTime() + maximumAgeHours * 60 * 60 * 1000 > now.getTime();
};

type AffiliateDemandObservationState = Readonly<{
  observed: Map<string, number>;
  priorityByTargetKey: Map<string, number>;
}>;

const loadAffiliateDemandSources = async (
  database: AffiliateSupplyDatabase,
  rolloutCohort: string,
): Promise<AffiliateSupplyDemandSourceRow[]> => {
  if (!database.supplySources?.findMany) return [];
  return database.supplySources.findMany({
    where: { rolloutCohort },
    select: {
      id: true,
      isExcluded: true,
      derivedOutcome: true,
      derivedStage: true,
      repairPriority: true,
      targetKind: true,
      metadata: true,
    },
  });
};

const loadAffiliateDemandTargets = async (
  database: AffiliateSupplyDatabase,
  hasAssessments: boolean,
): Promise<AffiliateSupplyDemandTargetRow[]> => {
  if (hasAssessments) return [];
  return database.targets.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      supplySourceId: true,
      marketKey: true,
      sportId: true,
      sourceProfile: true,
      status: true,
      rejectedAt: true,
      freshnessExpiresAt: true,
      lastSuccessfulRefreshAt: true,
      metadata: true,
    },
  });
};

const recordAffiliateDemandPriority = (
  priorityByTargetKey: Map<string, number>,
  key: string,
  priority: unknown,
): void => {
  const sourcePriority = Number(priority);
  if (!Number.isFinite(sourcePriority)) return;
  const currentPriority = priorityByTargetKey.get(key);
  if (currentPriority === undefined || sourcePriority < currentPriority) {
    priorityByTargetKey.set(key, sourcePriority);
  }
};

const affiliateDemandTargetKeys = (
  contract: AffiliateSupplyContractPolicy,
  target: Readonly<{
    marketKey?: string | null;
    sportId?: string | null;
    sourceProfile?: string | null;
  }>,
): string[] => Array.from(new Set(
  targetRulesFor(contract, {
    marketKey: target.marketKey ?? null,
    sportId: target.sportId ?? null,
    sourceProfile: target.sourceProfile ?? '',
  }).map((matchingTarget) => targetKeyFor({
    marketKey: matchingTarget.marketKey ?? 'DEFAULT',
    sportId: matchingTarget.sportId ?? 'ALL',
    sourceProfile: matchingTarget.sourceProfile,
  })),
));

const recordAffiliateDemandTargetPriority = (
  contract: AffiliateSupplyContractPolicy,
  priorityByTargetKey: Map<string, number>,
  target: Readonly<{
    marketKey?: string | null;
    sportId?: string | null;
    sourceProfile?: string | null;
  }>,
  priority: unknown,
): void => {
  for (const key of affiliateDemandTargetKeys(contract, target)) {
    recordAffiliateDemandPriority(priorityByTargetKey, key, priority);
  }
};

const observeAffiliateDemandTarget = (
  contract: AffiliateSupplyContractPolicy,
  now: Date,
  sourcesById: ReadonlyMap<string, AffiliateSupplyDemandSourceRow>,
  observed: Map<string, number>,
  priorityByTargetKey: Map<string, number>,
  sourceId: string,
  target: Readonly<{
    marketKey?: string | null;
    sportId?: string | null;
    sourceProfile?: string | null;
    status?: unknown;
    rejectedAt?: Date | string | null;
    freshnessExpiresAt?: Date | string | null;
    lastSuccessfulRefreshAt?: Date | string | null;
    metadata?: unknown;
  }>,
  priority: unknown,
): void => {
  const source = sourcesById.get(sourceId);
  if (!source || !isFreshTargetForDemand(target, contract, now)) return;
  for (const key of affiliateDemandTargetKeys(contract, target)) {
    observed.set(key, (observed.get(key) ?? 0) + 1);
    recordAffiliateDemandPriority(priorityByTargetKey, key, priority);
  }
};

const observeAffiliateDemandAssessment = (
  contract: AffiliateSupplyContractPolicy,
  now: Date,
  sourcesById: ReadonlyMap<string, AffiliateSupplyDemandSourceRow>,
  state: AffiliateDemandObservationState,
  assessment: AffiliateSupplyAssessment,
): void => {
  const sourceId = String(assessment.supplySourceId);
  const source = sourcesById.get(sourceId);
  if (!source || source.isExcluded === true || assessment.outcome === 'SOURCE_EXCLUDED') return;
  if (assessment.targets.length) {
    for (const target of assessment.targets) {
      recordAffiliateDemandTargetPriority(contract, state.priorityByTargetKey, target, assessment.repairPriority);
      if (assessment.stage === 'PUBLISHED') {
        observeAffiliateDemandTarget(
          contract,
          now,
          sourcesById,
          state.observed,
          state.priorityByTargetKey,
          sourceId,
          target,
          assessment.repairPriority,
        );
      }
    }
    return;
  }
  const metadata = recordValue(source.metadata);
  recordAffiliateDemandTargetPriority(contract, state.priorityByTargetKey, {
    sourceProfile: stringValue(source.targetKind ?? metadata.sourceProfile),
    marketKey: stringValue(metadata.marketKey),
    sportId: stringValue(metadata.sportId),
  }, assessment.repairPriority);
};

const observeAffiliateDemandSource = (
  contract: AffiliateSupplyContractPolicy,
  state: AffiliateDemandObservationState,
  source: AffiliateSupplyDemandSourceRow,
): void => {
  if (source.isExcluded === true || source.derivedOutcome === 'SOURCE_EXCLUDED') return;
  const metadata = recordValue(source.metadata);
  const sourceProfile = stringValue(source.targetKind ?? metadata.sourceProfile);
  if (!sourceProfile) return;
  recordAffiliateDemandTargetPriority(contract, state.priorityByTargetKey, {
    sourceProfile,
    marketKey: stringValue(metadata.marketKey),
    sportId: stringValue(metadata.sportId),
  }, source.repairPriority);
};

const observeAffiliateDemandPublishedTarget = (
  contract: AffiliateSupplyContractPolicy,
  now: Date,
  sourcesById: ReadonlyMap<string, AffiliateSupplyDemandSourceRow>,
  state: AffiliateDemandObservationState,
  target: AffiliateSupplyDemandTargetRow,
): void => {
  const sourceId = target.supplySourceId ? String(target.supplySourceId) : null;
  const source = sourceId ? sourcesById.get(sourceId) : undefined;
  if (
    !sourceId
    || !source
    || source.isExcluded === true
    || source.derivedOutcome === 'SOURCE_EXCLUDED'
    || String(source.derivedStage ?? '').toUpperCase() !== 'PUBLISHED'
  ) return;
  observeAffiliateDemandTarget(
    contract,
    now,
    sourcesById,
    state.observed,
    state.priorityByTargetKey,
    sourceId,
    target,
    source.repairPriority,
  );
};

const collectAffiliateDemandObservations = (
  input: Readonly<{
    contract: AffiliateSupplyContractPolicy;
    now: Date;
    assessments?: readonly AffiliateSupplyAssessment[];
  }>,
  sourceRows: readonly AffiliateSupplyDemandSourceRow[],
  targets: readonly AffiliateSupplyDemandTargetRow[],
): AffiliateDemandObservationState => {
  const sourcesById = new Map(sourceRows.map((source) => [String(source.id), source]));
  const state: AffiliateDemandObservationState = {
    observed: new Map(),
    priorityByTargetKey: new Map(),
  };
  if (input.assessments) {
    for (const assessment of input.assessments) {
      observeAffiliateDemandAssessment(input.contract, input.now, sourcesById, state, assessment);
    }
    return state;
  }
  for (const source of sourceRows) observeAffiliateDemandSource(input.contract, state, source);
  for (const target of targets) {
    observeAffiliateDemandPublishedTarget(input.contract, input.now, sourcesById, state, target);
  }
  return state;
};

const loadAffiliateExistingDemands = async (
  database: AffiliateSupplyDatabase,
  input: Readonly<{
    contract: AffiliateSupplyContractPolicy;
    rolloutCohort: string;
  }>,
  targetKeys: string[],
): Promise<AffiliateReplenishmentDemands[]> => {
  if (!database.demands?.findMany || !targetKeys.length) return [];
  return database.demands.findMany({
    where: {
      rolloutCohort: input.rolloutCohort,
      contractVersion: input.contract.version,
      contractHash: input.contract.hash,
      targetKey: { in: targetKeys },
    },
  });
};

const affiliateDemandField = (
  value: Readonly<Record<string, unknown>>,
  key: string,
  fallback: unknown,
): unknown => value[key] == null ? fallback : value[key];

const affiliateDemandDateOr = (value: unknown, fallback: Date): Date => (
  toDate(value) ?? fallback
);

const affiliateDemandResultStatus = (
  statusValue: string,
): AffiliateReplenishmentDemandResultRow['status'] => (
  statusValue === 'CLOSED' || statusValue === 'PAUSED' ? statusValue : 'OPEN'
);

const affiliateDemandResultRow = (
  row: unknown,
  rolloutCohort: string,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): AffiliateReplenishmentDemandResultRow => {
  const value = recordValue(row);
  return {
    id: String(affiliateDemandField(value, 'id', '')),
    targetKey: String(affiliateDemandField(value, 'targetKey', '')),
    marketKey: String(affiliateDemandField(value, 'marketKey', '')),
    sportId: String(affiliateDemandField(value, 'sportId', '')),
    sourceProfile: String(affiliateDemandField(value, 'sourceProfile', '')),
    rolloutCohort: String(affiliateDemandField(value, 'rolloutCohort', rolloutCohort)),
    contractVersion: Number(affiliateDemandField(value, 'contractVersion', contract.version)),
    contractHash: String(affiliateDemandField(value, 'contractHash', contract.hash)),
    minimumFreshPublishedSupply: Number(affiliateDemandField(value, 'minimumFreshPublishedSupply', 0)),
    observedFreshPublishedSupply: Number(affiliateDemandField(value, 'observedFreshPublishedSupply', 0)),
    priority: Number(affiliateDemandField(value, 'priority', AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY)),
    status: affiliateDemandResultStatus(
      String(affiliateDemandField(value, 'status', 'OPEN')).toUpperCase(),
    ),
    openedAt: affiliateDemandDateOr(affiliateDemandField(value, 'openedAt', now), now),
    closedAt: toDate(affiliateDemandField(value, 'closedAt', null)),
    nextEligibleAt: toDate(affiliateDemandField(value, 'nextEligibleAt', null)),
    searchSaturatedUntil: toDate(affiliateDemandField(value, 'searchSaturatedUntil', null)),
    activeWaveId: stringValue(affiliateDemandField(value, 'activeWaveId', null)),
    generation: Number(affiliateDemandField(value, 'generation', 0)),
    reasonCodes: stringArray(affiliateDemandField(value, 'reasonCodes', [])),
    evidenceJson: affiliateDemandField(value, 'evidenceJson', null),
  };
};

const findAffiliateExistingDemand = async (
  database: AffiliateSupplyDatabase,
  input: Readonly<{
    contract: AffiliateSupplyContractPolicy;
    rolloutCohort: string;
  }>,
  targetKey: string,
  existingDemandsByTargetKey: ReadonlyMap<string, AffiliateReplenishmentDemands>,
  canBatchLoadExistingDemands: boolean,
): Promise<AffiliateReplenishmentDemands | null> => {
  const existing = existingDemandsByTargetKey.get(targetKey);
  if (existing || canBatchLoadExistingDemands || !database.demands?.findUnique) {
    return existing ?? null;
  }
  return database.demands.findUnique({
    where: {
      rolloutCohort_targetKey_contractVersion_contractHash: {
        rolloutCohort: input.rolloutCohort,
        targetKey,
        contractVersion: input.contract.version,
        contractHash: input.contract.hash,
      },
    },
  });
};

const affiliateDemandStatus = (
  satisfied: boolean,
  pausedUntilResume: boolean,
): 'OPEN' | 'CLOSED' | 'PAUSED' => satisfied
  ? 'CLOSED'
  : pausedUntilResume ? 'PAUSED' : 'OPEN';

const affiliateDemandStateUnchanged = (
  existing: AffiliateReplenishmentDemands | null,
  status: string,
  target: Readonly<{ minimumFreshPublishedSupply: number }>,
  count: number,
  priority: number,
): boolean => Boolean(
  existing
  && existing.status === status
  && Number(existing.minimumFreshPublishedSupply) === target.minimumFreshPublishedSupply
  && Number(existing.observedFreshPublishedSupply) === count
  && Number(existing.priority) === priority,
);

const affiliateDemandStatusDelta = (
  existing: AffiliateReplenishmentDemands | null,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
): { opened: number; closed: number } => {
  if (existing?.status === status) return { opened: 0, closed: 0 };
  return status === 'OPEN' ? { opened: 1, closed: 0 } : { opened: 0, closed: 1 };
};

const affiliateDemandDates = (
  existing: AffiliateReplenishmentDemands | null,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
  stateUnchanged: boolean,
  now: Date,
): { openedAt: Date; closedAt: Date | null } => ({
  openedAt: existing?.status === status ? existing.openedAt : now,
  closedAt: status === 'CLOSED'
    ? stateUnchanged ? existing?.closedAt ?? now : now
    : null,
});

const affiliateDemandReasonCodes = (
  satisfied: boolean,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
  existing: AffiliateReplenishmentDemands | null,
): string[] => satisfied
  ? ['TARGET_MET']
  : status === 'PAUSED'
    ? stringArray(existing?.reasonCodes)
    : ['TARGET_SHORTFALL'];

const affiliateDemandEvidence = (
  existing: AffiliateReplenishmentDemands | null,
  stateUnchanged: boolean,
  count: number,
  now: Date,
): Record<string, unknown> => stateUnchanged
  ? recordValue(existing?.evidenceJson ?? { observedAt: now.toISOString(), observedFreshPublishedSupply: count })
  : { observedAt: now.toISOString(), observedFreshPublishedSupply: count };

type AffiliateDemandCreateData = (
  | Prisma.AffiliateReplenishmentDemandsCreateInput
  | Prisma.AffiliateReplenishmentDemandsUncheckedCreateInput
);
type AffiliateDemandUpdateData = (
  | Prisma.AffiliateReplenishmentDemandsUpdateInput
  | Prisma.AffiliateReplenishmentDemandsUncheckedUpdateInput
);
type AffiliateDemandUpsertPlan = Readonly<{
  createData: AffiliateDemandCreateData;
  updateData: AffiliateDemandUpdateData;
  where: Prisma.AffiliateReplenishmentDemandsWhereUniqueInput;
  stateUnchanged: boolean;
}>;

type AffiliateDemandPlanInput = Readonly<{
  contract: AffiliateSupplyContractPolicy;
  rolloutCohort: string;
  isDryRun?: boolean;
}>;

const affiliateDemandGeneration = (
  existing: AffiliateReplenishmentDemands | null,
  stateUnchanged: boolean,
): number => stateUnchanged
  ? existing?.generation ?? 0
  : (existing?.generation ?? 0) + 1;

const affiliateDemandActiveWaveId = (
  existing: AffiliateReplenishmentDemands | null,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
): string | null => status === 'CLOSED' ? null : existing?.activeWaveId ?? null;

const affiliateDemandBaseData = (
  input: AffiliateDemandPlanInput,
  target: Readonly<{
    marketKey?: string | null;
    sportId?: string | null;
    sourceProfile: string;
    minimumFreshPublishedSupply: number;
  }>,
  targetKey: string,
  existing: AffiliateReplenishmentDemands | null,
  count: number,
  priority: number,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
  stateUnchanged: boolean,
  now: Date,
): Record<string, unknown> => {
  const dates = affiliateDemandDates(existing, status, stateUnchanged, now);
  const satisfied = count >= target.minimumFreshPublishedSupply;
  const reasonCodes = affiliateDemandReasonCodes(satisfied, status, existing);
  const evidenceJson = affiliateDemandEvidence(existing, stateUnchanged, count, now);
  return {
    targetKey,
    marketKey: target.marketKey ?? 'DEFAULT',
    sportId: target.sportId ?? 'ALL',
    sourceProfile: target.sourceProfile,
    rolloutCohort: input.rolloutCohort,
    contractVersion: input.contract.version,
    contractHash: input.contract.hash,
    minimumFreshPublishedSupply: target.minimumFreshPublishedSupply,
    observedFreshPublishedSupply: count,
    priority,
    status,
    openedAt: dates.openedAt,
    closedAt: dates.closedAt,
    activeWaveId: affiliateDemandActiveWaveId(existing, status),
    reasonCodes,
    evidenceJson: prismaNullableJsonValue(evidenceJson),
    generation: affiliateDemandGeneration(existing, stateUnchanged),
  };
};

const affiliateDemandCreateId = (
  input: AffiliateDemandPlanInput,
  targetKey: string,
): string => input.isDryRun
  ? `dry-run-demand-${hashAffiliateAgentValue({
      rolloutCohort: input.rolloutCohort,
      targetKey,
      contractVersion: input.contract.version,
      contractHash: input.contract.hash,
    })}`
  : createId();

const affiliateDemandWhere = (
  input: AffiliateDemandPlanInput,
  targetKey: string,
): Prisma.AffiliateReplenishmentDemandsWhereUniqueInput => ({
  rolloutCohort_targetKey_contractVersion_contractHash: {
    rolloutCohort: input.rolloutCohort,
    targetKey,
    contractVersion: input.contract.version,
    contractHash: input.contract.hash,
  },
});

const buildAffiliateDemandUpsertPlan = (
  input: AffiliateDemandPlanInput,
  target: Readonly<{
    marketKey?: string | null;
    sportId?: string | null;
    sourceProfile: string;
    minimumFreshPublishedSupply: number;
  }>,
  targetKey: string,
  existing: AffiliateReplenishmentDemands | null,
  count: number,
  priority: number,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
  stateUnchanged: boolean,
  now: Date,
): AffiliateDemandUpsertPlan => {
  const baseData = affiliateDemandBaseData(
    input,
    target,
    targetKey,
    existing,
    count,
    priority,
    status,
    stateUnchanged,
    now,
  );
  return {
    createData: { id: affiliateDemandCreateId(input, targetKey), ...baseData } as AffiliateDemandCreateData,
    updateData: baseData as AffiliateDemandUpdateData,
    where: affiliateDemandWhere(input, targetKey),
    stateUnchanged,
  };
};

const persistAffiliateDemandPlan = async (
  database: AffiliateSupplyDatabase,
  input: Readonly<{ isDryRun?: boolean }>,
  plan: AffiliateDemandUpsertPlan,
  existing: AffiliateReplenishmentDemands | null,
  resultRow: (
    row: unknown,
  ) => AffiliateReplenishmentDemandResultRow,
): Promise<AffiliateReplenishmentDemandResultRow> => {
  if (!input.isDryRun && plan.stateUnchanged && existing) return existing as AffiliateReplenishmentDemandResultRow;
  const row = input.isDryRun
    ? { ...(existing ?? {}), ...plan.createData, ...plan.updateData, id: existing?.id ?? plan.createData.id }
    : plan.stateUnchanged
      ? existing
      : await database.demands.upsert({
          where: plan.where,
          create: plan.createData,
          update: plan.updateData,
        });
  return resultRow(row);
};

type AffiliateDemandTarget = AffiliateSupplyContractPolicy['targets'][number];

const isAffiliateDemandPausedUntilResume = (
  existing: AffiliateReplenishmentDemands | null,
  now: Date,
): boolean => {
  if (existing?.status !== 'PAUSED') return false;
  const pauseResumeAt = toDate(existing.nextEligibleAt) ?? toDate(existing.searchSaturatedUntil);
  return !pauseResumeAt || pauseResumeAt.getTime() > now.getTime();
};

const reconcileAffiliateDemandTarget = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  contract: AffiliateSupplyContractPolicy;
  rolloutCohort: string;
  now: Date;
  isDryRun?: boolean;
  target: AffiliateDemandTarget;
  observations: AffiliateDemandObservationState;
  existingDemandsByTargetKey: ReadonlyMap<string, AffiliateReplenishmentDemands>;
  canBatchLoadExistingDemands: boolean;
}>): Promise<{
  row: AffiliateReplenishmentDemandResultRow;
  opened: number;
  closed: number;
}> => {
  const marketKey = input.target.marketKey ?? 'DEFAULT';
  const sportId = input.target.sportId ?? 'ALL';
  const sourceProfile = input.target.sourceProfile.toUpperCase();
  const targetKey = targetKeyFor({ marketKey, sportId, sourceProfile });
  const count = input.observations.observed.get(targetKey) ?? 0;
  const demandPriority = input.observations.priorityByTargetKey.get(targetKey)
    ?? AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY;
  const existing = await findAffiliateExistingDemand(
    input.database,
    { contract: input.contract, rolloutCohort: input.rolloutCohort },
    targetKey,
    input.existingDemandsByTargetKey,
    input.canBatchLoadExistingDemands,
  );
  const pausedUntilResume = isAffiliateDemandPausedUntilResume(existing, input.now);
  const status = affiliateDemandStatus(
    count >= input.target.minimumFreshPublishedSupply,
    pausedUntilResume,
  );
  const stateUnchanged = affiliateDemandStateUnchanged(
    existing,
    status,
    input.target,
    count,
    demandPriority,
  );
  const delta = affiliateDemandStatusDelta(existing, status);
  const plan = buildAffiliateDemandUpsertPlan(
    {
      contract: input.contract,
      rolloutCohort: input.rolloutCohort,
      isDryRun: input.isDryRun,
    },
    {
      marketKey,
      sportId,
      sourceProfile,
      minimumFreshPublishedSupply: input.target.minimumFreshPublishedSupply,
    },
    targetKey,
    existing,
    count,
    demandPriority,
    status,
    stateUnchanged,
    input.now,
  );
  const row = await persistAffiliateDemandPlan(
    input.database,
    { isDryRun: input.isDryRun },
    plan,
    existing,
    (value) => affiliateDemandResultRow(
      value,
      input.rolloutCohort,
      input.contract,
      input.now,
    ),
  );
  return { row, opened: delta.opened, closed: delta.closed };
};

const reconcileAffiliateDemandTargets = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  contract: AffiliateSupplyContractPolicy;
  rolloutCohort: string;
  now: Date;
  isDryRun?: boolean;
  observations: AffiliateDemandObservationState;
  existingDemandsByTargetKey: ReadonlyMap<string, AffiliateReplenishmentDemands>;
  canBatchLoadExistingDemands: boolean;
}>): Promise<{
  rows: AffiliateReplenishmentDemandResultRow[];
  opened: number;
  closed: number;
}> => {
  const rows: AffiliateReplenishmentDemandResultRow[] = [];
  let opened = 0;
  let closed = 0;
  for (const target of input.contract.targets) {
    const result = await reconcileAffiliateDemandTarget({ ...input, target });
    rows.push(result.row);
    opened += result.opened;
    closed += result.closed;
  }
  return { rows, opened, closed };
};
export const reconcileAffiliateReplenishmentDemands = async (input: Readonly<{
  contract: AffiliateSupplyContractPolicy;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  isDryRun?: boolean;
  assessments?: readonly AffiliateSupplyAssessment[];
}>): Promise<{ opened: number; closed: number; demands: AffiliateReplenishmentDemandResultRow[] }> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  if (!database.demands?.upsert) return { opened: 0, closed: 0, demands: [] };
  const rolloutCohort = input.rolloutCohort ?? input.contract.rolloutCohort;
  const sourceRows = await loadAffiliateDemandSources(database, rolloutCohort);
  const targets = await loadAffiliateDemandTargets(database, Boolean(input.assessments));
  const observations = collectAffiliateDemandObservations({
    contract: input.contract,
    now,
    assessments: input.assessments,
  }, sourceRows, targets);
  const targetKeys = input.contract.targets.map((target) => targetKeyFor({
    marketKey: target.marketKey ?? 'DEFAULT',
    sportId: target.sportId ?? 'ALL',
    sourceProfile: target.sourceProfile.toUpperCase(),
  }));
  const canBatchLoadExistingDemands = typeof database.demands.findMany === 'function';
  const existingDemands = await loadAffiliateExistingDemands(database, {
    contract: input.contract,
    rolloutCohort,
  }, targetKeys);
  const existingDemandsByTargetKey = new Map(
    existingDemands.map((demand) => [demand.targetKey, demand]),
  );
  const targetResults = await reconcileAffiliateDemandTargets({
    database,
    contract: input.contract,
    rolloutCohort,
    now,
    isDryRun: input.isDryRun,
    observations,
    existingDemandsByTargetKey,
    canBatchLoadExistingDemands,
  });
  return {
    opened: targetResults.opened,
    closed: targetResults.closed,
    demands: targetResults.rows,
  };
};

const replenishmentDemandWhere = (
  demandRolloutCohort: string | undefined,
  contract: AffiliateSupplyContractPolicy | undefined,
): Record<string, unknown> => ({
  status: 'OPEN',
  ...(demandRolloutCohort ? { rolloutCohort: demandRolloutCohort } : {}),
  ...(contract ? { contractVersion: contract.version, contractHash: contract.hash } : {}),
});

const replenishmentWaveWhere = (
  demandRolloutCohort: string | undefined,
): Record<string, unknown> => ({
  status: { in: ['PLANNED', 'ACTIVE', 'WAITING'] },
  ...(demandRolloutCohort ? { rolloutCohort: demandRolloutCohort } : {}),
});

const loadAffiliateReplenishmentCounts = async (
  database: AffiliateSupplyDatabase,
  now: Date,
) => {
  const [
    waitingMapping,
    activeMapping,
    waitingReview,
    activeReviewerClaims,
    activeProducerClaims,
  ] = await Promise.all([
    database.mappingJobs.count({ where: { status: 'QUEUED' } }),
    database.mappingJobs.count({ where: { status: 'CLAIMED' } }),
    database.approvals.count({ where: { status: { in: ['QUEUED', 'DEFERRED', 'REVIEW_REQUIRED'] } } }),
    database.gatewayClaims.count({
      where: { role: 'SUPPLY_REVIEWER', status: 'ACTIVE', leaseExpiresAt: { gt: now } },
    }),
    database.gatewayClaims.count({
      where: { role: 'MAPPING_PRODUCER', status: 'ACTIVE', leaseExpiresAt: { gt: now } },
    }),
  ]);
  return {
    waitingMapping,
    activeMapping,
    waitingReview,
    activeReviewerClaims,
    activeProducerClaims,
  };
};

const loadAffiliateReplenishmentDemands = async (
  input: Readonly<{
    demands?: readonly AffiliateReplenishmentDemandEvidence[];
    database: AffiliateSupplyDatabase;
    demandRolloutCohort: string | undefined;
    contract?: AffiliateSupplyContractPolicy;
  }>,
): Promise<readonly AffiliateReplenishmentDemandEvidence[]> => input.demands
  ?? input.database.demands.findMany({
    where: replenishmentDemandWhere(input.demandRolloutCohort, input.contract),
  });

const loadAffiliateReplenishmentWorkerRows = (
  database: AffiliateSupplyDatabase,
  now: Date,
) => typeof database.workerHealth?.findMany === 'function'
  ? database.workerHealth.findMany({
    where: {
      role: { in: ['MAPPING_PRODUCER', 'SUPPLY_REVIEWER'] },
      heartbeatAt: { lte: now },
      leaseExpiresAt: { gt: now },
    },
    select: { role: true, status: true },
  })
  : Promise.resolve(null);

const loadAffiliateReplenishmentRows = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  demands?: readonly AffiliateReplenishmentDemandEvidence[];
  demandRolloutCohort: string | undefined;
  contract?: AffiliateSupplyContractPolicy;
  now: Date;
}>) => {
  const [demands, activeWaves, campaigns, healthyWorkers] = await Promise.all([
    loadAffiliateReplenishmentDemands(input),
    input.database.waves.findMany({
      where: replenishmentWaveWhere(input.demandRolloutCohort),
    }),
    input.database.campaigns.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, nextRunAt: true, metadata: true },
    }),
    loadAffiliateReplenishmentWorkerRows(input.database, input.now),
  ]);
  return { demands, activeWaves, campaigns, healthyWorkers };
};

const healthyReplenishmentWorkerCount = (
  workers: readonly { role: string; status: string }[],
  role: string,
): number => workers.filter((worker) => (
  worker.role === role && worker.status === 'HEALTHY'
)).length;

const replenishmentWorkerCounts = (
  healthyWorkers: unknown,
  activeReviewerClaims: number,
  activeProducerClaims: number,
): { healthyReviewerCount: number; healthyProducerCount: number } => {
  if (!Array.isArray(healthyWorkers)) {
    return {
      healthyReviewerCount: activeReviewerClaims,
      healthyProducerCount: activeProducerClaims,
    };
  }
  return {
    healthyReviewerCount: healthyReplenishmentWorkerCount(healthyWorkers, 'SUPPLY_REVIEWER'),
    healthyProducerCount: healthyReplenishmentWorkerCount(healthyWorkers, 'MAPPING_PRODUCER'),
  };
};

export const planAffiliateReplenishmentFromDatabase = async (input: Readonly<{
  contract?: AffiliateSupplyContractPolicy;
  isContractSafe?: boolean;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  demands?: readonly AffiliateReplenishmentDemandEvidence[];
}> = {}): Promise<AffiliateReplenishmentPlan> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const contract = input.contract;
  const demandRolloutCohort = input.rolloutCohort ?? contract?.rolloutCohort;
  const now = input.now ?? new Date();
  const [counts, rows] = await Promise.all([
    loadAffiliateReplenishmentCounts(database, now),
    loadAffiliateReplenishmentRows({
      database,
      demands: input.demands,
      demandRolloutCohort,
      contract,
      now,
    }),
  ]);
  const workers = replenishmentWorkerCounts(
    rows.healthyWorkers,
    counts.activeReviewerClaims,
    counts.activeProducerClaims,
  );
  return planAffiliateReplenishment({
    now,
    isContractSafe: input.isContractSafe === true,
    mapping: {
      waiting: counts.waitingMapping,
      active: counts.activeMapping,
      activeProducerCount: workers.healthyProducerCount,
    },
    review: {
      waiting: counts.waitingReview,
      active: counts.activeReviewerClaims,
      activeReviewerCount: workers.healthyReviewerCount,
      healthyReviewerCount: workers.healthyReviewerCount,
    },
    demands: rows.demands.map((demand) => ({
      id: demand.id,
      status: demand.status,
      priority: demand.priority,
      openedAt: demand.openedAt,
      nextEligibleAt: demand.nextEligibleAt,
      searchSaturatedUntil: demand.searchSaturatedUntil,
      marketKey: demand.marketKey,
      sportId: demand.sportId,
      sourceProfile: demand.sourceProfile,
    })),
    activeWaves: rows.activeWaves.map((wave) => ({
      id: wave.id,
      status: wave.status,
      demandId: wave.demandId,
    })),
    campaigns: (rows.campaigns ?? []).map((campaign) => ({
      id: campaign.id,
      // Demand retry and Search Saturation timestamps are the only admission clocks.
      isEligible: true,
      priority: Number(recordValue(campaign.metadata).priority ?? 2),
      nextEligibleAt: null,
      marketKey: stringValue(recordValue(campaign.metadata).marketKey),
      sportId: stringValue(recordValue(campaign.metadata).sportId),
      sourceProfile: stringValue(recordValue(campaign.metadata).sourceProfile),
    })),
  });
};

const isReplenishmentWaveCohortUniqueConflict = (error: unknown): boolean => {
  if (!isUniqueConstraintError(error) || !error || typeof error !== 'object' || !('meta' in error)) {
    return false;
  }
  const meta = error.meta;
  if (!meta || typeof meta !== 'object' || !('target' in meta)) return false;
  const target = meta.target;
  const targets = typeof target === 'string'
    ? [target]
    : Array.isArray(target)
      ? target.filter((value): value is string => typeof value === 'string')
      : [];
  return targets.some((value) => (
    value === 'rolloutCohort'
    || value === 'AffiliateReplenishmentWaves_one_live_per_cohort'
  ));
};

const isAffiliateReplenishmentDemandEligible = (
  demand: AffiliateReplenishmentDemands | null,
  rolloutCohort: string,
  contract: AffiliateSupplyContractPolicy,
): demand is AffiliateReplenishmentDemands => Boolean(
  demand
  && demand.status === 'OPEN'
  && demand.rolloutCohort === rolloutCohort
  && demand.contractVersion === contract.version
  && demand.contractHash === contract.hash
);

type CoveragePlannerCommandEvidence = Readonly<{
  strategy: Record<string, unknown>;
  query: Record<string, unknown>;
  captureProfile: Record<string, unknown>;
}>;

const coveragePlannerCommandEvidenceFor = (
  demand: AffiliateReplenishmentDemands,
  campaign: Record<string, unknown> | null,
): CoveragePlannerCommandEvidence => {
  const metadata = recordValue(campaign?.metadata);
  const strategyKeys = stringArray(
    metadata.coverageStrategyKeys ?? metadata.strategyKeys,
  );
  const strategyKey = strategyKeys[0] ?? `coverage-${demand.sourceProfile.toLowerCase()}`;
  const query = stringValue(metadata.query)
    ?? stringValue(metadata.queryTerms)
    ?? `${demand.marketKey} ${demand.sourceProfile}`;
  return {
    strategy: {
      schemaVersion: 1,
      strategyKey,
      profileKey: demand.sourceProfile,
      queryTerms: query,
    },
    query: {
      schemaVersion: 1,
      query,
    },
    captureProfile: {
      schemaVersion: 1,
      profileKey: demand.sourceProfile,
      renderMode: 'AUTO',
      waitMs: 0,
    },
  };
};

const coveragePlannerEvidenceManifestFor = (
  demand: AffiliateReplenishmentDemands,
  campaign: Record<string, unknown> | null,
): Readonly<{
  manifest: Record<string, unknown>;
  commandEvidence: CoveragePlannerCommandEvidence;
}> => {
  const commandEvidence = coveragePlannerCommandEvidenceFor(demand, campaign);
  const definitions = [
    ['coverage-strategy', 'strategy', commandEvidence.strategy],
    ['coverage-query', 'query', commandEvidence.query],
    ['coverage-capture-profile', 'capture-profile', commandEvidence.captureProfile],
  ] as const;
  const entries = definitions
    .map(([evidenceRef, suffix, value]) => {
      const serialized = canonicalizeAffiliateAgentValue(value);
      return {
        evidenceRef,
        kind: 'REVIEWER_EVIDENCE' as const,
        artifactId: `gateway-command:coverage-planning:${demand.id}:${suffix}`,
        sha256: hashAffiliateAgentValue(value),
        mimeType: 'application/json',
        byteSize: Buffer.byteLength(serialized, 'utf8'),
        retention: 'INDEFINITE' as const,
      };
    })
    .sort((left, right) => left.evidenceRef.localeCompare(right.evidenceRef));
  const preimage = { schemaVersion: 1 as const, entries };
  return {
    manifest: {
      ...preimage,
      hash: hashAffiliateAgentValue(preimage),
    },
    commandEvidence,
  };
};

export type AffiliateCoverageDiscoveryMaterialization = Readonly<{
  campaignId: string;
  discoveryRunId: string;
  discoveryResultIds: readonly string[];
}>;

type AffiliateCoverageDiscoveryMaterializationInput = Readonly<{
  database: AffiliateSupplyDatabase;
  gatewayJobId: string;
  claimId: string;
  claimGeneration: number;
  receiptId: string;
  provider: string;
  query: string;
  providerOutput: unknown;
  evidenceManifest: Record<string, unknown>;
  providerEvidence: Readonly<{
    evidenceRef: string;
    artifactId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
  }>;
  now: Date;
}>;

const materializationRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const materializationString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const materializationTargetKind = (value: unknown): string => {
  const targetKind = materializationString(value)?.toUpperCase();
  if (!targetKind || !['EVENT', 'RENTAL', 'TEAM', 'CLUB'].includes(targetKind)) {
    throw new Error('The discovery demand has an unsupported source profile.');
  }
  return targetKind;
};

const materializationCanonicalUrl = (value: unknown): string | null => {
  const originalUrl = materializationString(value);
  if (!originalUrl) return null;
  try {
    const parsed = new URL(originalUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

type AffiliateCoverageDiscoveryMaterializationRow = Readonly<{
  originalUrl: string;
  canonicalUrl: string;
  title: string | null;
  description: string | null;
  category: string | null;
}>;

const assertCoverageDiscoveryMaterializationDelegates = (
  database: AffiliateSupplyDatabase,
): void => {
  const delegates: readonly unknown[] = [
    database.demands.findUnique,
    database.campaigns.findUnique,
    database.campaigns.upsert,
    database.campaigns.update,
    database.waves.update,
    database.discoveryRuns.findUnique,
    database.discoveryRuns.create,
    database.discoveryRuns.update,
    database.discoveryResults.findUnique,
    database.discoveryResults.create,
    database.discoveryResults.update,
    database.intakes.findUnique,
    database.intakes.create,
    database.intakes.update,
    database.sources.findUnique,
    database.sources.create,
    database.sources.update,
    database.supplySources.findUnique,
    database.supplySources.update,
  ];
  if (delegates.some((delegate) => typeof delegate !== 'function')) {
    throw new Error('Coverage discovery materialization requires complete durable delegates.');
  }
};

const coverageDiscoveryRowsFor = (
  providerOutput: unknown,
): AffiliateCoverageDiscoveryMaterializationRow[] => {
  const output = materializationRecord(providerOutput);
  const rawRows = Array.isArray(output.rows) ? output.rows : [];
  const rows = rawRows.flatMap((rawRow): AffiliateCoverageDiscoveryMaterializationRow[] => {
    const row = materializationRecord(rawRow);
    const originalUrl = materializationString(row.url);
    const canonicalUrl = materializationCanonicalUrl(originalUrl);
    if (!originalUrl || !canonicalUrl) return [];
    return [{
      originalUrl,
      canonicalUrl,
      title: materializationString(row.title),
      description: materializationString(row.description),
      category: materializationString(row.category),
    }];
  });
  return Array.from(
    new Map(rows.map((row) => [affiliateDiscoveryUrlKey(row.canonicalUrl), row])).values(),
  );
};

const coverageDiscoveryCampaignFor = async (
  database: AffiliateSupplyDatabase,
  input: AffiliateCoverageDiscoveryMaterializationInput,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  targetKind: string,
): Promise<string> => {
  const existingCampaignId = materializationString(wave.campaignId);
  let campaignId = existingCampaignId;
  let campaign = existingCampaignId
    ? materializationRecord(await database.campaigns.findUnique({ where: { id: existingCampaignId } }))
    : {};
  if (existingCampaignId && !Object.keys(campaign).length) {
    throw new Error('Coverage discovery materialization references a missing campaign.');
  }
  if (!campaignId) {
    campaignId = `gateway-campaign:${input.gatewayJobId}`;
    campaign = materializationRecord(await database.campaigns.upsert({
      where: { id: campaignId },
      create: {
        id: campaignId,
        name: campaignId,
        region: demand.marketKey,
        location: demand.targetKey,
        sportIds: [demand.sportId],
        sourceTypeHints: [targetKind],
        status: 'PAUSED',
        autoCreateIntakes: false,
        metadata: prismaJsonValue({}),
      },
      update: {},
    }));
    if (!Object.keys(campaign).length) {
      throw new Error('Coverage discovery materialization could not create a campaign.');
    }
    await database.waves.update({
      where: { id: wave.id },
      data: { campaignId },
    });
  }
  const existingCampaignMetadata = materializationRecord(campaign.metadata);
  const expectedCampaignLineage = {
    demandId: demand.id,
    coverageCellId: demand.targetKey,
    assessmentCycleId: `${demand.id}:generation:${String(wave.demandGeneration)}`,
    rolloutCohort: demand.rolloutCohort,
    contractVersion: demand.contractVersion,
    contractHash: demand.contractHash,
    waveId: wave.id,
  };
  if (Object.entries(expectedCampaignLineage).some(([key, expected]) => (
    existingCampaignMetadata[key] != null
    && String(existingCampaignMetadata[key]) !== String(expected)
  ))) {
    throw new Error('Coverage discovery materialization conflicts with campaign lineage.');
  }
  await database.campaigns.update({
    where: { id: campaignId },
    data: {
      metadata: prismaJsonValue({
        ...existingCampaignMetadata,
        ...expectedCampaignLineage,
        coverageLineage: {
          gatewayJobId: input.gatewayJobId,
          providerReceiptId: input.receiptId,
          providerEvidence: input.providerEvidence,
        },
        evidenceManifest: input.evidenceManifest,
      }),
    },
  });
  return campaignId;
};

const coverageDiscoveryRunFor = async (
  database: AffiliateSupplyDatabase,
  input: AffiliateCoverageDiscoveryMaterializationInput,
  campaignId: string,
  provider: string,
  query: string,
  providerJobId: string | null,
  resultCount: number,
): Promise<string> => {
  const discoveryRunId = `gateway-discovery-run:${input.receiptId}`;
  const existingRun = await database.discoveryRuns.findUnique({
    where: { id: discoveryRunId },
  });
  if (
    existingRun
    && (
      existingRun.campaignId !== campaignId
      || existingRun.status !== 'SUCCEEDED'
    )
  ) {
    throw new Error('Coverage discovery materialization conflicts with an existing run.');
  }
  if (!existingRun) {
    await database.discoveryRuns.create({
      data: {
        id: discoveryRunId,
        campaignId,
        requestedByUserId: null,
        status: 'SUCCEEDED',
        queuedAt: input.now,
        startedAt: input.now,
        finishedAt: input.now,
        generatedQueryCount: 1,
        returnedResultCount: resultCount,
        newResultCount: resultCount,
        providerJobIds: providerJobId ? [providerJobId] : [],
        summary: prismaJsonValue({
          provider,
          query,
          gatewayClaimId: input.claimId,
          gatewayClaimGeneration: input.claimGeneration,
          gatewayReceiptId: input.receiptId,
          evidence: input.providerEvidence,
        }),
      },
    });
  }
  return discoveryRunId;
};

type AffiliateCoverageDiscoveryMaterializationContext = Readonly<{
  database: AffiliateSupplyDatabase;
  input: AffiliateCoverageDiscoveryMaterializationInput;
  provider: string;
  query: string;
  demand: AffiliateReplenishmentDemands;
  targetKind: string;
  campaignId: string;
  discoveryRunId: string;
  row: AffiliateCoverageDiscoveryMaterializationRow;
  index: number;
}>;

type AffiliateCoverageDiscoverySupplySourceResult = Readonly<{
  policyKey: string;
  supplySource: AffiliateSupplySources;
}>;

const coverageDiscoveryIntakeFor = async (
  database: AffiliateSupplyDatabase,
  sourceKey: string,
  row: AffiliateCoverageDiscoveryMaterializationRow,
  demand: AffiliateReplenishmentDemands,
  targetKind: string,
): Promise<AffiliateSourceIntakes> => {
  const existing = await database.intakes.findUnique({ where: { sourceKey } });
  if (existing) return existing;
  return database.intakes.create({
    data: {
      id: createId(),
      name: row.title ?? new URL(row.canonicalUrl).hostname,
      sourceKey,
      region: demand.marketKey,
      baseUrl: row.canonicalUrl,
      status: 'DRAFT',
      complianceStatus: 'UNREVIEWED',
      targetKindHints: [targetKind],
      notes: 'Materialized from a claim-owned discovery provider result.',
      organizationId: null,
      affiliateSourceId: null,
      supplySourceId: null,
    },
  });
};

const coverageDiscoverySupplySourceFor = async (
  database: AffiliateSupplyDatabase,
  input: AffiliateCoverageDiscoveryMaterializationInput,
  demand: AffiliateReplenishmentDemands,
  targetKind: string,
  row: AffiliateCoverageDiscoveryMaterializationRow,
  intake: AffiliateSourceIntakes,
): Promise<AffiliateCoverageDiscoverySupplySourceResult> => {
  const policyKey = affiliateDiscoveryPolicyKeyForUrl(row.canonicalUrl);
  const identity = normalizeAffiliateSupplyIdentity({
    requestedUrl: row.originalUrl,
    resolvedCanonicalUrl: row.canonicalUrl,
    isRedirectVerified: false,
    operatorDomain: policyKey,
  });
  let supplySource = await database.supplySources.findUnique({
    where: { identityKey: identity.identityKey },
  });
  if (!supplySource) {
    supplySource = await createAffiliateSupplySource({
      database,
      identity,
      targetKind,
      operatorDomain: policyKey,
      rolloutCohort: demand.rolloutCohort,
      intakeId: intake.id,
      metadata: {
        materializedFrom: {
          gatewayJobId: input.gatewayJobId,
          claimId: input.claimId,
          receiptId: input.receiptId,
          evidenceRef: input.providerEvidence.evidenceRef,
        },
      },
      now: input.now,
    });
  } else if (supplySource.targetKind !== targetKind) {
    throw new Error('Coverage discovery materialization conflicts with source kind.');
  } else if (supplySource.intakeId && supplySource.intakeId !== intake.id) {
    throw new Error('Coverage discovery materialization conflicts with intake lineage.');
  }
  return { policyKey, supplySource };
};

const coverageDiscoveryScrapeSourceFor = async (
  database: AffiliateSupplyDatabase,
  input: AffiliateCoverageDiscoveryMaterializationInput,
  targetKind: string,
  row: AffiliateCoverageDiscoveryMaterializationRow,
  sourceKey: string,
  supplySource: AffiliateSupplySources,
): Promise<AffiliateScrapeSources> => {
  const source = await database.sources.findUnique({ where: { sourceKey } });
  let scrapeSource = source;
  if (
    scrapeSource
    && (
      (
        scrapeSource.supplySourceId
        && scrapeSource.supplySourceId !== supplySource.id
      )
      || String(scrapeSource.targetKind).toUpperCase() !== targetKind
    )
  ) {
    throw new Error('Coverage discovery materialization conflicts with scrape source lineage.');
  }
  if (!scrapeSource) {
    scrapeSource = await database.sources.create({
      data: {
        id: createId(),
        name: row.title ?? new URL(row.canonicalUrl).hostname,
        sourceKey,
        organizationId: null,
        baseUrl: row.canonicalUrl,
        listUrl: row.canonicalUrl,
        targetKind,
        status: 'ACTIVE',
        activeMappingId: null,
        supplySourceId: supplySource.id,
        lifecycleGeneration: 0,
        activeSupplyContractVersion: null,
        activeSupplyContractHash: null,
        autoScrapeEnabled: false,
        scrapeIntervalMinutes: 1440,
        notes: 'Materialized from a claim-owned discovery provider result.',
        metadata: prismaJsonValue({
          materializedFrom: {
            gatewayJobId: input.gatewayJobId,
            claimId: input.claimId,
            receiptId: input.receiptId,
            evidenceRef: input.providerEvidence.evidenceRef,
          },
        }),
      },
    });
  }
  if (!scrapeSource.supplySourceId) {
    scrapeSource = await database.sources.update({
      where: { id: scrapeSource.id },
      data: { supplySourceId: supplySource.id },
    });
  }
  return scrapeSource;
};

const coverageDiscoveryLinkedSupplySourceFor = async (
  database: AffiliateSupplyDatabase,
  supplySource: AffiliateSupplySources,
  scrapeSource: AffiliateScrapeSources,
): Promise<AffiliateSupplySources> => {
  if (supplySource.liveSourceId && supplySource.liveSourceId !== scrapeSource.id) {
    throw new Error('Coverage discovery materialization conflicts with live source lineage.');
  }
  if (!supplySource.liveSourceId) {
    return database.supplySources.update({
      where: { id: supplySource.id },
      data: { liveSourceId: scrapeSource.id },
    });
  }
  return supplySource;
};

const linkCoverageDiscoveryIntake = async (
  database: AffiliateSupplyDatabase,
  intake: AffiliateSourceIntakes,
  supplySource: AffiliateSupplySources,
  scrapeSource: AffiliateScrapeSources,
): Promise<void> => {
  if (
    intake.affiliateSourceId
    && intake.affiliateSourceId !== scrapeSource.id
  ) {
    throw new Error('Coverage discovery materialization conflicts with intake source lineage.');
  }
  if (intake.supplySourceId && intake.supplySourceId !== supplySource.id) {
    throw new Error('Coverage discovery materialization conflicts with intake Supply Source lineage.');
  }
  await database.intakes.update({
    where: { id: intake.id },
    data: {
      affiliateSourceId: scrapeSource.id,
      supplySourceId: supplySource.id,
    },
  });
};

const coverageDiscoveryResultIdFor = async (
  context: AffiliateCoverageDiscoveryMaterializationContext,
  policyKey: string,
  intake: AffiliateSourceIntakes,
  supplySource: AffiliateSupplySources,
  scrapeSource: AffiliateScrapeSources,
): Promise<string> => {
  const {
    database,
    input,
    provider,
    query,
    demand,
    row,
    campaignId,
    discoveryRunId,
    index,
  } = context;
  const existingResult = await database.discoveryResults.findUnique({
    where: {
      campaignId_urlKey: {
        campaignId,
        urlKey: affiliateDiscoveryUrlKey(row.canonicalUrl),
      },
    },
  });
  const resultMetadata = {
    provider,
    evidenceManifest: input.evidenceManifest,
    gatewayLineage: {
      claimId: input.claimId,
      claimGeneration: input.claimGeneration,
      receiptId: input.receiptId,
      evidence: input.providerEvidence,
    },
    profileKey: demand.sourceProfile,
  };
  const resultData = {
    latestRunId: discoveryRunId,
    originalUrl: row.originalUrl,
    canonicalUrl: row.canonicalUrl,
    policyKey,
    title: row.title,
    description: row.description,
    latestQuery: query,
    latestRank: index + 1,
    lastSeenAt: input.now,
    score: existingResult?.score ?? 0,
    sourceTypeHints: [context.targetKind],
    sportHints: [demand.sportId],
    status: existingResult?.status ?? 'NEW',
    reasonCodes: existingResult?.reasonCodes ?? [],
    reasonDetails: prismaJsonValue({
      materializedFrom: 'GATEWAY_PROVIDER_RESULT',
      category: row.category,
    }),
    matchingIntakeId: intake.id,
    matchingSourceId: scrapeSource.id,
    supplySourceId: supplySource.id,
    matchingOrganizationId: null,
    metadata: prismaJsonValue(resultMetadata),
  };
  const saved = existingResult
    ? await database.discoveryResults.update({
      where: { id: existingResult.id },
      data: {
        ...resultData,
        seenCount: Number(existingResult.seenCount ?? 0) + 1,
      },
    })
    : await database.discoveryResults.create({
      data: {
        id: createId(),
        campaignId,
        urlKey: affiliateDiscoveryUrlKey(row.canonicalUrl),
        firstSeenAt: input.now,
        seenCount: 1,
        ...resultData,
      },
    });
  return saved.id;
};

const materializeAffiliateCoverageDiscoveryRow = async (
  context: AffiliateCoverageDiscoveryMaterializationContext,
): Promise<string> => {
  const {
    database,
    input,
    demand,
    targetKind,
    campaignId,
    row,
  } = context;
  const urlKey = affiliateDiscoveryUrlKey(row.canonicalUrl);
  const sourceKey = `gateway-discovery:${campaignId}:${urlKey}`;
  const intake = await coverageDiscoveryIntakeFor(
    database,
    sourceKey,
    row,
    demand,
    targetKind,
  );
  const { policyKey, supplySource: initialSupplySource } =
    await coverageDiscoverySupplySourceFor(
      database,
      input,
      demand,
      targetKind,
      row,
      intake,
    );
  const scrapeSource = await coverageDiscoveryScrapeSourceFor(
    database,
    input,
    targetKind,
    row,
    sourceKey,
    initialSupplySource,
  );
  const supplySource = await coverageDiscoveryLinkedSupplySourceFor(
    database,
    initialSupplySource,
    scrapeSource,
  );
  await linkCoverageDiscoveryIntake(database, intake, supplySource, scrapeSource);
  return coverageDiscoveryResultIdFor(
    context,
    policyKey,
    intake,
    supplySource,
    scrapeSource,
  );
};

export const materializeAffiliateCoverageDiscoveryResult = async (
  input: AffiliateCoverageDiscoveryMaterializationInput,
): Promise<AffiliateCoverageDiscoveryMaterialization | null> => {
  const { database } = input;
  if (!database.waves?.findFirst) return null;
  const wave = await database.waves.findFirst({
    where: { coveragePlanningJobId: input.gatewayJobId },
    orderBy: { createdAt: 'desc' },
  });
  if (!wave) return null;
  assertCoverageDiscoveryMaterializationDelegates(database);
  const demand = await database.demands.findUnique({ where: { id: wave.demandId } });
  if (!demand) throw new Error('Coverage discovery materialization references a missing demand.');
  const targetKind = materializationTargetKind(demand.sourceProfile);
  const provider = materializationString(input.provider);
  const query = materializationString(input.query);
  if (!provider || !query) {
    throw new Error('Coverage discovery materialization requires provider and query identity.');
  }
  const dedupedRows = coverageDiscoveryRowsFor(input.providerOutput);
  const campaignId = await coverageDiscoveryCampaignFor(
    database,
    input,
    wave,
    demand,
    targetKind,
  );
  const providerJobId = materializationString(
    materializationRecord(input.providerOutput).providerJobId,
  );
  const discoveryRunId = await coverageDiscoveryRunFor(
    database,
    input,
    campaignId,
    provider,
    query,
    providerJobId,
    dedupedRows.length,
  );
  const discoveryResultIds: string[] = [];
  for (const [index, row] of dedupedRows.entries()) {
    discoveryResultIds.push(await materializeAffiliateCoverageDiscoveryRow({
      database,
      input,
      provider,
      query,
      demand,
      targetKind,
      campaignId,
      discoveryRunId,
      row,
      index,
    }));
  }
  await database.discoveryRuns.update({
    where: { id: discoveryRunId },
    data: {
      returnedResultCount: dedupedRows.length,
      newResultCount: discoveryResultIds.length,
      summary: prismaJsonValue({
        provider,
        query,
        gatewayClaimId: input.claimId,
        gatewayClaimGeneration: input.claimGeneration,
        gatewayReceiptId: input.receiptId,
        evidence: input.providerEvidence,
        discoveryResultIds,
      }),
    },
  });
  return { campaignId, discoveryRunId, discoveryResultIds };
};

const createGatewayCoveragePlanningJob = async (
  transactionDatabase: AffiliateSupplyDatabase,
  plan: AffiliateReplenishmentPlan,
  demand: AffiliateReplenishmentDemands,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): Promise<string> => {
  const generation = Number(demand.generation ?? 0) + 1;
  const coverageCellId = demand.targetKey || demand.id;
  const assessmentCycleId = `${demand.id}:generation:${generation}`;
  const campaign = plan.selectedCampaignId
    ? await transactionDatabase.campaigns.findUnique({
        where: { id: plan.selectedCampaignId },
        select: { id: true, name: true, metadata: true },
      })
    : null;
  if (plan.selectedCampaignId && !campaign) {
    throw new Error('The selected coverage campaign is no longer persisted.');
  }
  const { manifest } = coveragePlannerEvidenceManifestFor(
    demand,
    campaign
      ? { id: campaign.id, name: campaign.name, metadata: campaign.metadata }
      : null,
  );
  const job = await transactionDatabase.gatewayJobs!.upsert!({
    where: {
      dedupeKey: `coverage-planning:${demand.id}:${generation}:${contract.version}:${contract.hash}`,
    },
    create: {
      id: createId(),
      dedupeKey: `coverage-planning:${demand.id}:${generation}:${contract.version}:${contract.hash}`,
      queue: 'AFFILIATE_COVERAGE',
      lane: 'COVERAGE_PLANNING',
      role: 'COVERAGE_PLANNER',
      subjectType: 'COVERAGE_PLANNER',
      subjectId: coverageCellId,
      subjectJson: prismaJsonValue({
        type: 'COVERAGE_PLANNER',
        coverageCellId,
        assessmentCycleId,
      }),
      evidenceManifestJson: prismaJsonValue(manifest),
      supplySourceId: null,
      expectedLifecycleGeneration: null,
      status: 'QUEUED',
      priority: Number.isFinite(Number(demand.priority))
        ? Math.trunc(Number(demand.priority))
        : 0,
      nextAttemptAt: now,
      claimGeneration: 0,
      activeClaimId: null,
      parentClaimId: null,
      invocationFailureCount: 0,
      lastInvocationFailedAt: null,
      pipelineBlockedAt: null,
      terminalDisposition: null,
      resultHash: null,
      terminalReceiptId: null,
      finishedAt: null,
      eventSequence: 0,
    },
    update: {},
  });
  return job.id;
};

const createLegacyCoveragePlanningJob = async (
  transactionDatabase: AffiliateSupplyDatabase,
  demand: AffiliateReplenishmentDemands,
  rolloutCohort: string,
  contract: AffiliateSupplyContractPolicy,
): Promise<string | null> => {
  if (!transactionDatabase.coverageJobs?.upsert) return null;
  const job = await transactionDatabase.coverageJobs.upsert({
    where: {
      subjectType_subjectKey: {
        subjectType: 'SUPPLY_REPLENISHMENT',
        subjectKey: demand.id,
      },
    },
    create: {
      id: createId(),
      subjectType: 'SUPPLY_REPLENISHMENT',
      subjectKey: demand.id,
      status: 'QUEUED',
      context: prismaJsonValue({
        demandId: demand.id,
        marketKey: demand.marketKey,
        sportId: demand.sportId,
        sourceProfile: demand.sourceProfile,
        rolloutCohort,
        contractVersion: contract.version,
        contractHash: contract.hash,
      }),
      cohortPriority: 0,
      priorityScore: Number(demand.priority),
      isBlockingCoverage: true,
    },
    update: { status: 'QUEUED', errorMessage: null, finishedAt: null },
  });
  return job.id;
};

const createAffiliateCoveragePlanningJob = async (
  transactionDatabase: AffiliateSupplyDatabase,
  plan: AffiliateReplenishmentPlan,
  demand: AffiliateReplenishmentDemands,
  rolloutCohort: string,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): Promise<string | null> => {
  const gatewayJobs = transactionDatabase.gatewayJobs as Partial<
    AffiliateSupplyDelegate<'affiliateAgentGatewayJobs'>
  >;
  if (gatewayJobs?.upsert) {
    return createGatewayCoveragePlanningJob(
      transactionDatabase,
      plan,
      demand,
      contract,
      now,
    );
  }
  return createLegacyCoveragePlanningJob(
    transactionDatabase,
    demand,
    rolloutCohort,
    contract,
  );
};


const createAffiliateReplenishmentWaveInTransaction = async (
  transactionDatabase: AffiliateSupplyDatabase,
  input: Readonly<{
    plan: AffiliateReplenishmentPlan;
    rolloutCohort: string;
    contract: AffiliateSupplyContractPolicy;
    now: Date;
    selectedDemandId: string;
    liveWaveWhere: Prisma.AffiliateReplenishmentWavesWhereInput;
  }>,
): Promise<AffiliateReplenishmentWaves | null> => {
  const demand = await transactionDatabase.demands.findUnique({
    where: { id: input.selectedDemandId },
  });
  if (!isAffiliateReplenishmentDemandEligible(demand, input.rolloutCohort, input.contract)) {
    return null;
  }
  const existingWave = await transactionDatabase.waves.findFirst({
    where: input.liveWaveWhere,
    orderBy: { createdAt: 'asc' },
  });
  if (existingWave) return existingWave;
  const coveragePlanningJobId = await createAffiliateCoveragePlanningJob(
    transactionDatabase,
    input.plan,
    demand,
    input.rolloutCohort,
    input.contract,
    input.now,
  );
  if (
    input.plan.action === 'REUSE_CAMPAIGN'
    && input.plan.selectedCampaignId
    && !coveragePlanningJobId
  ) {
    throw new Error('A reused coverage campaign requires a bound planning job.');
  }
  const wave = await transactionDatabase.waves.create({
    data: {
      id: createId(),
      demandId: demand.id,
      rolloutCohort: input.rolloutCohort,
      status: 'ACTIVE',
      campaignId: input.plan.selectedCampaignId ?? undefined,
      coveragePlanningJobId,
      startedAt: input.now,
      demandGeneration: Number(demand.generation ?? 0) + 1,
      evidenceRefs: [`demand:${demand.id}`],
    },
  });
  await transactionDatabase.demands.update({
    where: { id: demand.id },
    data: { activeWaveId: wave.id, generation: demand.generation + 1 },
  });
  return wave;
};

type AffiliateReplenishmentWaveStartInput = Readonly<{
  plan: AffiliateReplenishmentPlan;
  rolloutCohort: string;
  contract: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>;

type AffiliateReplenishmentWaveStart = Readonly<{
  database: AffiliateSupplyDatabase;
  plan: AffiliateReplenishmentPlan;
  rolloutCohort: string;
  contract: AffiliateSupplyContractPolicy;
  now: Date;
  selectedDemandId: string;
  liveWaveWhere: Prisma.AffiliateReplenishmentWavesWhereInput;
}>;

const prepareAffiliateReplenishmentWaveStart = (
  input: AffiliateReplenishmentWaveStartInput,
): AffiliateReplenishmentWaveStart | null => {
  const selectedDemandId = input.plan.selectedDemandId;
  if (input.plan.action === 'NONE' || !selectedDemandId) return null;
  const database = input.db ?? affiliateSupplyDatabase();
  if (!database.waves?.create) return null;
  const now = input.now ?? new Date();
  const rolloutCohort = input.rolloutCohort ?? input.contract.rolloutCohort;
  return {
    database,
    plan: input.plan,
    rolloutCohort,
    contract: input.contract,
    now,
    selectedDemandId,
    liveWaveWhere: {
      rolloutCohort,
      status: { in: ['PLANNED', 'ACTIVE', 'WAITING'] },
    } as Prisma.AffiliateReplenishmentWavesWhereInput,
  };
};

const recoverAffiliateReplenishmentWaveConflict = async (
  error: unknown,
  database: AffiliateSupplyDatabase,
  liveWaveWhere: Prisma.AffiliateReplenishmentWavesWhereInput,
): Promise<AffiliateReplenishmentWaves> => {
  const concurrentWave = await withSupplyTransaction(database, async (transactionDatabase) => (
    transactionDatabase.waves.findFirst({
      where: liveWaveWhere,
      orderBy: { createdAt: 'asc' },
    })
  ));
  if (concurrentWave) return concurrentWave;
  throw error;
};

export const startAffiliateReplenishmentWave = async (
  input: AffiliateReplenishmentWaveStartInput,
): Promise<AffiliateReplenishmentWaves | null> => {
  const start = prepareAffiliateReplenishmentWaveStart(input);
  if (!start) return null;
  try {
    return await withSupplyTransaction(start.database, (transactionDatabase) => (
      createAffiliateReplenishmentWaveInTransaction(transactionDatabase, start)
    ));
  } catch (error) {
    if (!isReplenishmentWaveCohortUniqueConflict(error)) throw error;
    return recoverAffiliateReplenishmentWaveConflict(
      error,
      start.database,
      start.liveWaveWhere,
    );
  }
};

export type AffiliateLegacySupplyTargetProjection = AffiliateLegacyTargetProjection;

export type AffiliateLegacySupplyReconciliationRow = Readonly<{
  sourceId: string;
  identityKey: string;
  action: 'CREATE_ROOT' | 'REUSE_ROOT' | 'CREATE_SUCCESSOR' | 'REVIEW_REQUIRED';
  publishedCandidateCount: number;
  preservedTargetCount: number;
  unverifiableTargetCount: number;
  targetProjections: readonly AffiliateLegacySupplyTargetProjection[];
  evidenceRefs: readonly string[];
}>;

export type AffiliateLegacySupplyReconciliationResult = Readonly<{
  isDryRun: boolean;
  mode: 'DRY_RUN' | 'APPLY';
  isApplied: boolean;
  report: AffiliateLegacyReconciliationReport;
  counts: AffiliateLegacyReconciliationReport['counts'];
  failedInvariants: readonly string[];
  resolutions: AffiliateLegacyReconciliationReport['resolutions'];
  rows: readonly AffiliateLegacySupplyReconciliationRow[];
  preservedTargetCount: number;
  unverifiableTargetCount: number;
  claimsToRevoke: number;
  inputHash: string;
  outputHash: string;
  reportHash: string;
}>;
type AffiliateLegacyEvidenceFields = Readonly<{
  evidenceRefs?: readonly string[];
}>;

type AffiliateLegacySourceRow = Pick<
  AffiliateScrapeSources,
  'id' | 'organizationId' | 'baseUrl' | 'listUrl' | 'targetKind' | 'status' | 'supplySourceId' | 'autoScrapeEnabled'
> & AffiliateLegacyEvidenceFields & Readonly<{
  canonicalUrl?: string | null;
  operatorDomain?: string | null;
  sourceId?: string | null;
  url?: string | null;
  isExcluded?: boolean | null;
}>;

type AffiliateLegacyMappingRow = Pick<
  AffiliateScrapeMappings,
  'id' | 'sourceId' | 'supplySourceId' | 'isActive' | 'validatedAt'
> & AffiliateLegacyEvidenceFields & Readonly<{
  status?: string | null;
  finishedAt?: Date | string | null;
}>;

type AffiliateLegacyScrapeRunRow = Pick<
  AffiliateScrapeRuns,
  'id' | 'sourceId' | 'supplySourceId' | 'status' | 'finishedAt'
> & AffiliateLegacyEvidenceFields;

type AffiliateLegacyIntakeRow = Pick<
  AffiliateSourceIntakes,
  'id' | 'baseUrl' | 'status' | 'suggestedClassification' | 'organizationId'
    | 'affiliateSourceId' | 'supplySourceId' | 'targetKindHints'
> & AffiliateLegacyEvidenceFields & Readonly<{
  sourceId?: string | null;
  targetKind?: string | null;
  targetKindHint?: string | null;
  url?: string | null;
}>;

type AffiliateLegacyIntakePageRow = Pick<
  AffiliateSourceIntakePages,
  'id' | 'intakeId' | 'supplySourceId' | 'url' | 'canonicalUrl' | 'status'
> & AffiliateLegacyEvidenceFields;

type AffiliateLegacyIntakeRunRow = Pick<
  AffiliateSourceIntakeRuns,
  'id' | 'intakeId' | 'supplySourceId' | 'status' | 'finishedAt' | 'workerId'
> & AffiliateLegacyEvidenceFields & Readonly<{
  leaseExpiresAt?: Date | string | null;
}>;

type AffiliateLegacyIntakeArtifactRow = Pick<
  AffiliateSourceIntakeArtifacts,
  'id' | 'intakeId' | 'supplySourceId' | 'pageId' | 'runId' | 'sourceUrl' | 'finalUrl'
> & AffiliateLegacyEvidenceFields & Readonly<{
  status?: string | null;
}>;

type AffiliateLegacyDiscoveryResultRow = Pick<
  AffiliateSourceDiscoveryResults,
  'id' | 'matchingSourceId' | 'matchingIntakeId' | 'supplySourceId'
    | 'matchingOrganizationId' | 'status'
> & AffiliateLegacyEvidenceFields;

type AffiliateLegacyDiscoveryRunRow = Pick<
  AffiliateSourceDiscoveryRuns,
  'id' | 'status' | 'finishedAt' | 'claimedAt' | 'workerId'
> & AffiliateLegacyEvidenceFields & Readonly<{
  sourceId?: string | null;
  supplySourceId?: string | null;
  leaseExpiresAt?: Date | string | null;
}>;

type AffiliateLegacyMappingJobRow = Pick<
  AffiliateSourceMappingJobs,
  'id' | 'intakeId' | 'supplySourceId' | 'sourceId' | 'mappingId' | 'status'
    | 'leaseExpiresAt' | 'finishedAt' | 'workerId'
> & AffiliateLegacyEvidenceFields;

type AffiliateLegacyApprovalRow = Pick<
  AffiliateApprovalJobs,
  'id' | 'subjectType' | 'supplySourceId' | 'subjectKey' | 'status'
    | 'leaseExpiresAt' | 'finishedAt' | 'reviewerId' | 'decision'
> & AffiliateLegacyEvidenceFields;

type AffiliateLegacyCandidateRow = Pick<
  AffiliateImportCandidates,
  'id' | 'sourceId' | 'supplySourceId' | 'listingKind' | 'status'
    | 'publishedEventId' | 'publishedTeamId' | 'publishedFacilityId'
    | 'publishedOrganizationId'
> & AffiliateLegacyEvidenceFields;

type AffiliateLegacyCoverageJobRow = Pick<
  AffiliateCoverageAgentJobs,
  'id' | 'subjectType' | 'subjectKey' | 'status' | 'leaseExpiresAt'
    | 'workerId' | 'finishedAt'
> & AffiliateLegacyEvidenceFields & Readonly<{
  sourceId?: string | null;
  supplySourceId?: string | null;
}>;

type AffiliateLegacyGatewayClaimRow = Pick<
  AffiliateAgentGatewayClaims,
  'id' | 'jobId' | 'claimGeneration' | 'role' | 'workerId' | 'status' | 'leaseExpiresAt'
    | 'tokenExpiresAt' | 'endedAt' | 'tokenInvalidatedAt' | 'claimEnvelopeJson'
> & AffiliateLegacyEvidenceFields & Readonly<{
  sourceId?: string | null;
  supplySourceId?: string | null;
}>;

type AffiliateLegacyGatewayJobRow = Pick<
  AffiliateAgentGatewayJobs,
  'id' | 'status' | 'claimGeneration' | 'activeClaimId'
>;

type AffiliateLegacySupplySourceRow = Pick<
  AffiliateSupplySources,
  'id' | 'identityKey' | 'canonicalUrl' | 'origin' | 'pathKey' | 'operatorDomain'
    | 'targetKind' | 'predecessorId' | 'successorId' | 'derivedStage'
    | 'isAutomationEnabled'
> & AffiliateLegacyEvidenceFields & Readonly<{
  status?: string | null;
  isExcluded?: boolean | null;
}>;


type AffiliateLegacyOrganizationRow = Pick<
  Organizations,
  'id' | 'originType' | 'status' | 'publicPageEnabled'
> & AffiliateLegacyEvidenceFields & Readonly<{
  affiliateUrl?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  supplySourceId?: string | null;
}>;

type AffiliateLegacyEventRow = Pick<
  Events,
  'id' | 'organizationId' | 'affiliateUrl' | 'sourceType' | 'sourceId'
    | 'state' | 'archivedAt'
> & AffiliateLegacyEvidenceFields & Readonly<{
  supplySourceId?: string | null;
}>;

type AffiliateLegacyTeamRow = Pick<
  CanonicalTeams,
  'id' | 'organizationId' | 'affiliateUrl' | 'sourceType' | 'sourceId'
    | 'visibility' | 'archivedAt'
> & AffiliateLegacyEvidenceFields & Readonly<{
  supplySourceId?: string | null;
}>;

type AffiliateLegacyFacilityRow = Pick<
  Facilities,
  'id' | 'organizationId' | 'affiliateUrl' | 'status'
> & AffiliateLegacyEvidenceFields & Readonly<{
  sourceType?: string | null;
  sourceId?: string | null;
  supplySourceId?: string | null;
}>;

type AffiliateLegacyRow =
  | AffiliateLegacySourceRow
  | AffiliateLegacyMappingRow
  | AffiliateLegacyScrapeRunRow
  | AffiliateLegacyIntakeRow
  | AffiliateLegacyIntakePageRow
  | AffiliateLegacyIntakeRunRow
  | AffiliateLegacyIntakeArtifactRow
  | AffiliateLegacyDiscoveryResultRow
  | AffiliateLegacyDiscoveryRunRow
  | AffiliateLegacyMappingJobRow
  | AffiliateLegacyApprovalRow
  | AffiliateLegacyCandidateRow
  | AffiliateLegacyCoverageJobRow
  | AffiliateLegacyGatewayClaimRow
  | AffiliateLegacySupplySourceRow
  | AffiliateLegacySupplyTargetRow
  | AffiliateLegacyOrganizationRow
  | AffiliateLegacyEventRow
  | AffiliateLegacyTeamRow
  | AffiliateLegacyFacilityRow;

const hasAffiliateLegacyRowId = (
  value: unknown,
): value is { id: string } => (
  Boolean(
    value
    && typeof value === 'object'
    && 'id' in value
    && typeof value.id === 'string',
  )
);
const readAffiliateLegacyRows = async <TRow extends { id: string }>(
  delegate: unknown,
): Promise<TRow[]> => {
  const findMany = delegate && typeof delegate === 'object' && 'findMany' in delegate
    ? (delegate as { findMany?: (args?: unknown) => Promise<unknown> }).findMany
    : undefined;
  if (typeof findMany !== 'function') return [];
  const result = await findMany.call(delegate, {});
  return Array.isArray(result)
    ? result.filter(hasAffiliateLegacyRowId) as TRow[]
    : [];
};
type AffiliateLegacyDatabaseSnapshot = Readonly<{
  sources: AffiliateLegacySourceRow[];
  intakes: AffiliateLegacyIntakeRow[];
  pages: AffiliateLegacyIntakePageRow[];
  intakeRuns: AffiliateLegacyIntakeRunRow[];
  artifacts: AffiliateLegacyIntakeArtifactRow[];
  discoveryResults: AffiliateLegacyDiscoveryResultRow[];
  mappings: AffiliateLegacyMappingRow[];
  runs: AffiliateLegacyScrapeRunRow[];
  mappingJobs: AffiliateLegacyMappingJobRow[];
  approvals: AffiliateLegacyApprovalRow[];
  candidates: AffiliateLegacyCandidateRow[];
  discoveryRuns: AffiliateLegacyDiscoveryRunRow[];
  coverageJobs: AffiliateLegacyCoverageJobRow[];
  gatewayClaims: AffiliateLegacyGatewayClaimRow[];
  gatewayJobs: AffiliateLegacyGatewayJobRow[];
  supplySources: AffiliateLegacySupplySourceRow[];
  targets: AffiliateLegacySupplyTargetRow[];
  organizations: AffiliateLegacyOrganizationRow[];
  events: AffiliateLegacyEventRow[];
  teams: AffiliateLegacyTeamRow[];
  facilities: AffiliateLegacyFacilityRow[];
}>;

const readAffiliateLegacyDatabaseSnapshot = async (
  database: AffiliateSupplyDatabase,
): Promise<AffiliateLegacyDatabaseSnapshot> => ({
  sources: await readAffiliateLegacyRows<AffiliateLegacySourceRow>(database.sources),
  intakes: await readAffiliateLegacyRows<AffiliateLegacyIntakeRow>(database.intakes),
  pages: await readAffiliateLegacyRows<AffiliateLegacyIntakePageRow>(database.pages),
  intakeRuns: await readAffiliateLegacyRows<AffiliateLegacyIntakeRunRow>(database.intakeRuns),
  artifacts: await readAffiliateLegacyRows<AffiliateLegacyIntakeArtifactRow>(database.artifacts),
  discoveryResults: await readAffiliateLegacyRows<AffiliateLegacyDiscoveryResultRow>(database.discoveryResults),
  mappings: await readAffiliateLegacyRows<AffiliateLegacyMappingRow>(database.mappings),
  runs: await readAffiliateLegacyRows<AffiliateLegacyScrapeRunRow>(database.runs),
  mappingJobs: await readAffiliateLegacyRows<AffiliateLegacyMappingJobRow>(database.mappingJobs),
  approvals: await readAffiliateLegacyRows<AffiliateLegacyApprovalRow>(database.approvals),
  candidates: await readAffiliateLegacyRows<AffiliateLegacyCandidateRow>(database.candidates),
  discoveryRuns: await readAffiliateLegacyRows<AffiliateLegacyDiscoveryRunRow>(database.discoveryRuns),
  coverageJobs: await readAffiliateLegacyRows<AffiliateLegacyCoverageJobRow>(database.coverageJobs),
  gatewayClaims: await readAffiliateLegacyRows<AffiliateLegacyGatewayClaimRow>(database.gatewayClaims),
  gatewayJobs: await readAffiliateLegacyRows<AffiliateLegacyGatewayJobRow>(database.gatewayJobs),
  supplySources: await readAffiliateLegacyRows<AffiliateLegacySupplySourceRow>(database.supplySources),
  targets: await readAffiliateLegacyRows<AffiliateLegacySupplyTargetRow>(database.targets),
  organizations: await readAffiliateLegacyRows<AffiliateLegacyOrganizationRow>(database.organizations),
  events: await readAffiliateLegacyRows<AffiliateLegacyEventRow>(database.events),
  teams: await readAffiliateLegacyRows<AffiliateLegacyTeamRow>(database.teams),
  facilities: await readAffiliateLegacyRows<AffiliateLegacyFacilityRow>(database.facilities),
});

const compareAffiliateLegacySnapshotStrings = (
  left: string,
  right: string,
): number => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const normalizeAffiliateLegacySnapshotNotPrimitive = Symbol('not-primitive');

const normalizeAffiliateLegacySnapshotPrimitive = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return value.toString();
  return normalizeAffiliateLegacySnapshotNotPrimitive;
};

const normalizeAffiliateLegacySnapshotArray = (value: readonly unknown[]): unknown[] => (
  value.map(normalizeAffiliateLegacySnapshotValue)
);

const normalizeAffiliateLegacySnapshotObject = (
  value: Record<string, unknown>,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(value)
    .sort(([left], [right]) => compareAffiliateLegacySnapshotStrings(left, right))
    .flatMap(([key, nested]) => {
      const normalized = normalizeAffiliateLegacySnapshotValue(nested);
      return normalized === undefined ? [] : [[key, normalized]];
    }),
);

const normalizeAffiliateLegacySnapshotValue = (value: unknown): unknown => {
  const primitive = normalizeAffiliateLegacySnapshotPrimitive(value);
  if (primitive !== normalizeAffiliateLegacySnapshotNotPrimitive) return primitive;
  if (Array.isArray(value)) return normalizeAffiliateLegacySnapshotArray(value);
  if (value && typeof value === 'object') {
    return normalizeAffiliateLegacySnapshotObject(value as Record<string, unknown>);
  }
  return undefined;
};

const affiliateLegacySnapshotJson = (value: unknown): string => (
  JSON.stringify(value) ?? ''
);
const compareAffiliateLegacySnapshotValues = (
  left: unknown,
  right: unknown,
): number => compareAffiliateLegacySnapshotStrings(
  affiliateLegacySnapshotJson(left),
  affiliateLegacySnapshotJson(right),
);

const hashAffiliateLegacyDatabaseSnapshot = (
  snapshot: AffiliateLegacyDatabaseSnapshot,
): string => hashAffiliateAgentValue(
  Object.fromEntries(
    Object.entries(snapshot).map(([table, rows]) => [
      table,
      rows
        .map((row) => normalizeAffiliateLegacySnapshotValue(row))
        .sort(compareAffiliateLegacySnapshotValues),
    ]),
  ),
);

const affiliateLegacyRowValue = (row: object, key: string): unknown => (
  Reflect.get(row, key)
);

const affiliateLegacyRowString = (
  row: object,
  ...keys: readonly string[]
): string | null => {
  for (const key of keys) {
    const value = stringValue(affiliateLegacyRowValue(row, key));
    if (value) return value;
  }
  return null;
};

const affiliateLegacyRowEvidenceRefs = (
  kind: AffiliateLegacyRecordKind,
  row: AffiliateLegacyRow,
): string[] => [
  `legacy:${kind}:${row.id}`,
  ...(row.evidenceRefs ?? []),
];


const affiliateLegacyRecord = (
  kind: AffiliateLegacyRecordKind,
  row: AffiliateLegacyRow,
  sourceId?: string | null,
  supplySourceId?: string | null,
  associationKey?: string | null,
): AffiliateLegacyLineageRecord => ({
  kind,
  id: row.id,
  sourceId: sourceId ?? affiliateLegacyRowString(row, 'sourceId'),
  supplySourceId: supplySourceId ?? affiliateLegacyRowString(row, 'supplySourceId'),
  ...(associationKey ? { associationKey } : {}),
  evidenceRefs: affiliateLegacyRowEvidenceRefs(kind, row),
});

const affiliateLegacyTargetTypeForListing = (value: unknown): string | null => {
  const kind = String(value ?? '').trim().toUpperCase();
  const normalized = kind === 'RENTAL'
    ? 'FACILITY'
    : kind === 'CLUB'
      ? 'ORGANIZATION'
      : kind;
  return ['EVENT', 'TEAM', 'FACILITY', 'ORGANIZATION'].includes(normalized) ? normalized : null;
};

const affiliateLegacyClaimStatus = (row: AffiliateLegacyRow): string => (
  affiliateLegacyRowString(row, 'status') ?? 'TERMINAL'
);

const affiliateLegacyJsonObject = (value: unknown): Prisma.JsonObject => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {}
);

export type AffiliateLegacyStageEvidenceRow = Readonly<{
  id?: string;
  sourceId?: string | null;
  affiliateSourceId?: string | null;
  supplySourceId?: string | null;
  intakeId?: string | null;
  status?: string | null;
  subjectType?: string | null;
  subjectKey?: string | null;
  isExcluded?: boolean | null;
  autoScrapeEnabled?: boolean | null;
  isActive?: boolean | null;
  validatedAt?: Date | string | null;
  decision?: Prisma.JsonValue | null;
  outcome?: string | null;
  listingKind?: string | null;
  publishedEventId?: string | null;
  publishedTeamId?: string | null;
  publishedFacilityId?: string | null;
  publishedOrganizationId?: string | null;
  evidenceRefs?: readonly string[];
  isEvidenceVerifiable?: boolean;
}>;
export type AffiliateLegacyStageEvidenceInput = Readonly<{
  sourceId: string;
  rootId?: string | null;
  intakeIds: readonly string[];
  root: AffiliateLegacyStageEvidenceRow | null;
  source: AffiliateLegacyStageEvidenceRow | null;
  mappings: readonly AffiliateLegacyStageEvidenceRow[];
  approvals: readonly AffiliateLegacyStageEvidenceRow[];
  candidates: readonly AffiliateLegacyStageEvidenceRow[];
  targets: readonly AffiliateLegacyStageEvidenceRow[];
}>;
type AffiliateLegacyApprovalDecisionState = Readonly<{
  status: string;
  decision: string | null;
  isApprovedStatus: boolean;
  isApproveDecision: boolean;
  isContradictory: boolean;
}>;

const affiliateLegacyApprovalDecisionState = (
  row: AffiliateLegacyStageEvidenceRow,
): AffiliateLegacyApprovalDecisionState => {
  const decisionObject = affiliateLegacyJsonObject(affiliateLegacyRowValue(row, 'decision'));
  const explicitDecision = affiliateLegacyRowString(row, 'decision', 'outcome')
    ?? affiliateLegacyRowString(decisionObject, 'decision', 'outcome', 'status');
  const status = upper(affiliateLegacyRowString(row, 'status'));
  const decision = explicitDecision ? upper(explicitDecision) : null;
  const isApprovedStatus = status === 'APPROVED';
  const isApproveDecision = decision !== null
    && ['APPROVE', 'APPROVED'].includes(decision);
  return {
    status,
    decision,
    isApprovedStatus,
    isApproveDecision,
    isContradictory: decision !== null && isApprovedStatus !== isApproveDecision,
  };
};

const isAffiliateLegacyMappingPackageApproval = (
  row: AffiliateLegacyStageEvidenceRow,
): boolean => upper(affiliateLegacyRowString(row, 'subjectType')) === 'MAPPING_PACKAGE';

const isAffiliateLegacyApprovedMappingPackageApproval = (
  row: AffiliateLegacyStageEvidenceRow,
): boolean => {
  const state = affiliateLegacyApprovalDecisionState(row);
  return state.isApprovedStatus && (state.decision === null || state.isApproveDecision);
};

const isAffiliateLegacyContradictoryMappingPackageApproval = (
  row: AffiliateLegacyStageEvidenceRow,
): boolean => (
  isAffiliateLegacyMappingPackageApproval(row)
  && affiliateLegacyApprovalDecisionState(row).isContradictory
);

const affiliateLegacyContradictoryApprovalFinding = (
  row: AffiliateLegacyStageEvidenceRow,
): AffiliateCutoverFinding | null => {
  if (!isAffiliateLegacyContradictoryMappingPackageApproval(row)) return null;
  const state = affiliateLegacyApprovalDecisionState(row);
  const subjectKey = affiliateLegacyRowString(row, 'subjectKey');
  return {
    code: 'CONTRADICTORY_APPROVAL_STATE',
    severity: 'BLOCKING',
    detail: `Mapping-package approval ${row.id ?? 'unknown'} has contradictory status ${state.status || 'MISSING'} and decision ${state.decision ?? 'MISSING'}.`,
    recordIds: [row.id ?? '', ...(subjectKey ? [subjectKey] : [])].filter(Boolean),
    resolution: 'Resolve the mapping-package approval status and decision to one consistent reviewed outcome before apply.',
  };
};

const affiliateLegacyContradictoryApprovalFindings = (
  rows: readonly AffiliateLegacyStageEvidenceRow[],
): AffiliateCutoverFinding[] => rows
  .map(affiliateLegacyContradictoryApprovalFinding)
  .filter((finding): finding is AffiliateCutoverFinding => finding !== null);

const affiliateLegacyStageLineageIds = (
  input: AffiliateLegacyStageEvidenceInput,
): Set<string> => new Set([
  input.sourceId,
  ...(input.rootId ? [input.rootId] : []),
  ...input.intakeIds,
]);

const affiliateLegacyStageMatchesLineage = (
  row: AffiliateLegacyStageEvidenceRow,
  lineageIds: ReadonlySet<string>,
): boolean => (['sourceId', 'affiliateSourceId', 'supplySourceId', 'intakeId'] as const).some((key) => (
  lineageIds.has(affiliateLegacyRowString(row, key) ?? '')
));

const affiliateLegacyStageStatus = (
  input: AffiliateLegacyStageEvidenceInput,
): string => upper(
  affiliateLegacyRowString(input.source ?? {}, 'status')
    ?? affiliateLegacyRowString(input.root ?? {}, 'status'),
);

const affiliateLegacyStageIsExcluded = (
  input: AffiliateLegacyStageEvidenceInput,
  status: string,
): boolean => affiliateLegacyRowValue(input.source ?? {}, 'isExcluded') === true
  || affiliateLegacyRowValue(input.root ?? {}, 'isExcluded') === true
  || ['EXCLUDED', 'SOURCE_EXCLUDED', 'BLOCKED'].includes(status);

const affiliateLegacyStageNeedsReview = (status: string): boolean => [
  'HUMAN_REVIEW_REQUIRED',
  'REVIEW_REQUIRED',
  'NEEDS_REVIEW',
].includes(status);

const affiliateLegacyStageFromEvidenceFlags = (flags: Readonly<{
  excluded: boolean;
  needsReview: boolean;
  hasPublishedTarget: boolean;
  hasContradictoryApproval: boolean;
  hasApprovedDecision: boolean;
  hasMappedEvidence: boolean;
  hasActivatedEvidence: boolean;
}>): AffiliateSupplyLifecycleStage => {
  if (flags.excluded) return 'SOURCE_EXCLUDED';
  if (flags.needsReview || flags.hasContradictoryApproval) return 'HUMAN_REVIEW_REQUIRED';
  if (flags.hasPublishedTarget) return 'PUBLISHED';
  if (flags.hasActivatedEvidence && flags.hasApprovedDecision && flags.hasMappedEvidence) {
    return 'ACTIVATED';
  }
  if (flags.hasApprovedDecision) return 'APPROVED';
  if (flags.hasMappedEvidence) return 'MAPPED';
  return 'PRE_MAPPED';
};

export const deriveAffiliateLegacyStageFromEvidence = (
  input: AffiliateLegacyStageEvidenceInput,
): AffiliateSupplyLifecycleStage => {
  const lineageIds = affiliateLegacyStageLineageIds(input);
  const matching = (rows: readonly AffiliateLegacyStageEvidenceRow[]): AffiliateLegacyStageEvidenceRow[] => (
    rows.filter((row) => affiliateLegacyStageMatchesLineage(row, lineageIds))
  );
  const sourceStatus = affiliateLegacyStageStatus(input);
  const matchingTargets = matching(input.targets);
  const mappingPackageApprovals = matching(input.approvals)
    .filter(isAffiliateLegacyMappingPackageApproval);
  return affiliateLegacyStageFromEvidenceFlags({
    excluded: affiliateLegacyStageIsExcluded(input, sourceStatus),
    needsReview: affiliateLegacyStageNeedsReview(sourceStatus),
    hasPublishedTarget: matchingTargets.some((row) => (
      upper(affiliateLegacyRowString(row, 'status')) === 'PUBLISHED'
      && affiliateLegacyRowValue(row, 'isEvidenceVerifiable') !== false
    )),
    hasContradictoryApproval: mappingPackageApprovals.some(
      isAffiliateLegacyContradictoryMappingPackageApproval,
    ),
    hasApprovedDecision: mappingPackageApprovals.some(
      isAffiliateLegacyApprovedMappingPackageApproval,
    ),
    hasMappedEvidence: matching(input.mappings).some((row) => (
      affiliateLegacyRowValue(row, 'isActive') === true
        && toDate(affiliateLegacyRowValue(row, 'validatedAt')) !== null
    )),
    hasActivatedEvidence: affiliateLegacyRowValue(input.source ?? {}, 'autoScrapeEnabled') === true,
  });
};

const affiliateLegacyRunStatus = (
  mode: 'DRY_RUN' | 'APPLY',
  report: AffiliateLegacyReconciliationReport,
): string => mode === 'APPLY'
  ? 'APPLIED'
  : report.isApplySafe
    ? 'READY'
    : 'BLOCKED';

const affiliateLegacyReconciliationReportWithoutSession = (
  value: unknown,
): Record<string, unknown> => {
  const report = {
    ...affiliateLegacyJsonObject(value),
  } as Record<string, unknown>;
  delete report.cutoverSessionId;
  delete report.cutoverSessionHash;
  delete report.postApplyLegacySnapshotHash;
  delete report.evaluatedAt;
  return report;
};

const affiliateLegacyReconciliationSessionFromReport = (
  value: unknown,
): Readonly<{ id: string; hash: string }> | null => {
  const report = affiliateLegacyJsonObject(value);
  const id = stringValue(report.cutoverSessionId);
  const hash = stringValue(report.cutoverSessionHash);
  if (!id && !hash) return null;
  if (!id || !hash || !isAffiliateSha256Hash(hash)) {
    throw new Error('Affiliate Supply reconciliation report has invalid cutover session binding.');
  }
  return { id, hash };
};

const affiliateLegacyRunEvidenceValue = (
  value: Readonly<Record<string, unknown>>,
  key: string,
): unknown => value[key] ?? null;

const affiliateLegacyReconciliationRunEvidence = (
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> => ({
  rolloutCohort: affiliateLegacyRunEvidenceValue(value, 'rolloutCohort'),
  supplyContractVersion: affiliateLegacyRunEvidenceValue(value, 'supplyContractVersion'),
  supplyContractHash: affiliateLegacyRunEvidenceValue(value, 'supplyContractHash'),
  deploymentContractVersion: affiliateLegacyRunEvidenceValue(value, 'deploymentContractVersion'),
  deploymentContractHash: affiliateLegacyRunEvidenceValue(value, 'deploymentContractHash'),
  inputHash: affiliateLegacyRunEvidenceValue(value, 'inputHash'),
  outputHash: affiliateLegacyRunEvidenceValue(value, 'outputHash'),
  reportHash: affiliateLegacyRunEvidenceValue(value, 'reportHash'),
  counts: affiliateLegacyRunEvidenceValue(value, 'counts'),
  failedInvariants: affiliateLegacyRunEvidenceValue(value, 'failedInvariants'),
  resolutionRefs: affiliateLegacyRunEvidenceValue(value, 'resolutionRefs'),
  reportJson: affiliateLegacyReconciliationReportWithoutSession(value.reportJson),
});

const affiliateLegacyReconciliationOptionalFieldMatches = (
  stored: unknown,
  expected: unknown,
): boolean => stored == null
  ? true
  : expected != null && String(stored) === String(expected);

const affiliateLegacyReconciliationRunFieldsMatch = (
  stored: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): boolean => [
  ['rolloutCohort', stored.rolloutCohort, expected.rolloutCohort],
  ['supplyContractVersion', stored.supplyContractVersion, expected.supplyContractVersion],
  ['supplyContractHash', stored.supplyContractHash, expected.supplyContractHash],
  ['inputHash', stored.inputHash, expected.inputHash],
  ['outputHash', stored.outputHash, expected.outputHash],
  ['reportHash', stored.reportHash, expected.reportHash],
].every(([, actual, wanted]) => actual === wanted);

const affiliateLegacyReconciliationRunHashesMatch = (
  stored: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): boolean => [
  ['counts', stored.counts, expected.counts],
  ['failedInvariants', stored.failedInvariants, expected.failedInvariants],
  ['resolutionRefs', stored.resolutionRefs, expected.resolutionRefs],
  ['reportJson', stored.reportJson, expected.reportJson],
].every(([, actual, wanted]) => (
  hashAffiliateAgentValue(actual) === hashAffiliateAgentValue(wanted)
));

const affiliateLegacyReconciliationRunMatches = (
  existing: Readonly<Record<string, unknown>>,
  input: Readonly<{
    report: AffiliateLegacyReconciliationReport;
    rolloutCohort: string;
    contract?: ActiveAffiliateSupplyContractResult | null;
    deploymentContractVersion?: number | null;
    deploymentContractHash?: string | null;
  }>,
): boolean => {
  const report = input.report;
  const expected = {
    rolloutCohort: input.rolloutCohort,
    supplyContractVersion: input.contract?.policy.version ?? report.supplyContractVersion,
    supplyContractHash: input.contract?.policy.hash ?? report.supplyContractHash,
    deploymentContractVersion: input.deploymentContractVersion ?? null,
    deploymentContractHash: input.deploymentContractHash ?? null,
    inputHash: report.inputHash,
    outputHash: report.outputHash,
    reportHash: report.reportHash,
    counts: report.counts,
    failedInvariants: report.blockingFindings.map((finding) => finding.code),
    resolutionRefs: report.resolutions.map((finding) => `${finding.code}:${finding.recordIds.join(',')}`),
    reportJson: report,
  };
  const storedEvidence = affiliateLegacyReconciliationRunEvidence(existing);
  const expectedEvidence = affiliateLegacyReconciliationRunEvidence(expected);
  return affiliateLegacyReconciliationRunFieldsMatch(storedEvidence, expectedEvidence)
    && affiliateLegacyReconciliationRunHashesMatch(storedEvidence, expectedEvidence)
    && affiliateLegacyReconciliationOptionalFieldMatches(
      existing.deploymentContractVersion,
      expected.deploymentContractVersion,
    )
    && affiliateLegacyReconciliationOptionalFieldMatches(
      existing.deploymentContractHash,
      expected.deploymentContractHash,
    );
};

type AffiliateLegacyReconciliationRunPersistenceInput = Readonly<{
  database: AffiliateSupplyDatabase;
  report: AffiliateLegacyReconciliationReport;
  mode: 'DRY_RUN' | 'APPLY';
  rolloutCohort: string;
  operatorId?: string | null;
  contract?: ActiveAffiliateSupplyContractResult | null;
  applyNonce?: string | null;
  deploymentContractVersion?: number | null;
  deploymentContractHash?: string | null;
  cutoverSessionId?: string | null;
  cutoverSessionHash?: string | null;
  postApplyLegacySnapshotHash?: string | null;
  now: Date;
}>;


type AffiliateLegacyReconciliationRunDelegate = {
  findUnique?: (args: unknown) => Promise<unknown>;
  upsert?: (args: unknown) => Promise<unknown>;
};

const affiliateLegacyReconciliationReportForRun = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
): Record<string, unknown> => {
  const report = input.postApplyLegacySnapshotHash
    ? {
      ...input.report,
      postApplyLegacySnapshotHash: input.postApplyLegacySnapshotHash,
    }
    : input.report;
  const sessionId = input.cutoverSessionId?.trim();
  const sessionHash = input.cutoverSessionHash?.trim();
  return input.mode === 'APPLY' && sessionId && sessionHash
    ? {
      ...report,
      cutoverSessionId: sessionId,
      cutoverSessionHash: sessionHash,
    }
    : report;
};

const affiliateLegacyReconciliationRunCommon = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  status: string,
  reportJson: Record<string, unknown>,
): Record<string, unknown> => ({
  mode: input.mode,
  status,
  operatorId: input.operatorId?.trim() || null,
  rolloutCohort: input.rolloutCohort.trim(),
  supplyContractVersion: input.contract?.policy.version ?? null,
  supplyContractHash: input.contract?.policy.hash ?? null,
  deploymentContractVersion: input.deploymentContractVersion ?? null,
  deploymentContractHash: input.deploymentContractHash ?? null,
  inputHash: input.report.inputHash,
  outputHash: input.report.outputHash,
  reportHash: input.report.reportHash,
  counts: prismaJsonValue(input.report.counts),
  failedInvariants: input.report.blockingFindings.map((finding) => finding.code),
  resolutionRefs: input.report.resolutions.map((finding) => (
    `${finding.code}:${finding.recordIds.join(',')}`
  )),
  reportJson: prismaJsonValue(reportJson),
});

const affiliateLegacyReconciliationRunCreate = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  common: Record<string, unknown>,
): Record<string, unknown> => {
  const isApply = input.mode === 'APPLY';
  return {
    id: createId(),
    ...common,
    appliedAt: isApply ? input.now : null,
    appliedBy: isApply ? input.operatorId?.trim() || null : null,
    applyNonceHash: isApply && input.applyNonce?.trim()
      ? hashAffiliateAgentValue(input.applyNonce.trim())
      : null,
  };
};

const affiliateLegacyReconciliationDesiredSessionBinding = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
): Readonly<{ id: string; hash: string }> | null => {
  const sessionId = input.cutoverSessionId?.trim();
  const sessionHash = input.cutoverSessionHash?.trim();
  return input.mode === 'APPLY' && sessionId && sessionHash
    ? { id: sessionId, hash: sessionHash }
    : null;
};

const assertAffiliateLegacyReconciliationSessionBinding = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  stored: Readonly<{ id: string; hash: string }> | null,
  desired: Readonly<{ id: string; hash: string }> | null,
): void => {
  if (
    stored
    && desired
    && (stored.id !== desired.id || stored.hash !== desired.hash)
  ) {
    throw new Error('Affiliate Supply reconciliation run already contains a different cutover session binding.');
  }
  if (input.mode === 'APPLY' && !desired) {
    throw new Error('Affiliate Supply reconciliation apply requires a cutover session binding.');
  }
};

const affiliateLegacyReconciliationRunSessionBinding = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  existingReport: unknown,
): Readonly<{
  stored: Readonly<{ id: string; hash: string }> | null;
  desired: Readonly<{ id: string; hash: string }> | null;
}> => {
  const stored = affiliateLegacyReconciliationSessionFromReport(existingReport);
  const desired = affiliateLegacyReconciliationDesiredSessionBinding(input);
  assertAffiliateLegacyReconciliationSessionBinding(input, stored, desired);
  return { stored, desired };
};

const affiliateLegacyReconciliationRunApplyUpdate = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  reportJson: Record<string, unknown>,
  storedSession: Readonly<{ id: string; hash: string }> | null,
): Record<string, unknown> => {
  if (input.mode !== 'APPLY' || storedSession) return {};
  const applyNonce = input.applyNonce?.trim();
  return {
    mode: 'APPLY',
    appliedAt: input.now,
    appliedBy: input.operatorId?.trim() || null,
    applyNonceHash: applyNonce
      ? hashAffiliateAgentValue(applyNonce)
      : undefined,
    ...(input.deploymentContractVersion != null
      ? { deploymentContractVersion: input.deploymentContractVersion }
      : {}),
    ...(input.deploymentContractHash != null
      ? { deploymentContractHash: input.deploymentContractHash }
      : {}),
    reportJson: prismaJsonValue(reportJson),
  };
};

const affiliateLegacyReconciliationRunUpdate = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  status: string,
  reportJson: Record<string, unknown>,
  storedSession: Readonly<{ id: string; hash: string }> | null,
  existingUpdatedAt: Date | null,
  existingStatus: unknown,
): Record<string, unknown> => ({
  status: input.mode === 'DRY_RUN' && upper(existingStatus) === 'APPLIED'
    ? 'APPLIED'
    : status,
  ...(existingUpdatedAt ? { updatedAt: existingUpdatedAt } : {}),
  ...affiliateLegacyReconciliationRunApplyUpdate(input, reportJson, storedSession),
});

const assertAffiliateLegacyReconciliationRunCapabilities = (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  delegate: AffiliateLegacyReconciliationRunDelegate,
): boolean => {
  if (typeof delegate?.upsert !== 'function') {
    if (input.mode === 'APPLY') {
      throw new Error('Legacy Affiliate Supply reconciliation apply requires durable run persistence capability.');
    }
    return false;
  }
  if (input.mode === 'APPLY' && typeof delegate.findUnique !== 'function') {
    throw new Error('Legacy Affiliate Supply reconciliation apply requires durable run lookup capability.');
  }
  return true;
};

const persistAffiliateLegacyReconciliationExistingRun = async (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
  delegate: AffiliateLegacyReconciliationRunDelegate,
  status: string,
  reportJson: Record<string, unknown>,
  common: Record<string, unknown>,
): Promise<boolean> => {
  if (typeof delegate.findUnique !== 'function' || typeof delegate.upsert !== 'function') {
    return false;
  }
  const existing = affiliateLegacyJsonObject(await delegate.findUnique({
    where: { reportHash: input.report.reportHash },
  }));
  if (Object.keys(existing).length === 0) return false;
  if (!affiliateLegacyReconciliationRunMatches(existing, {
    report: input.report,
    rolloutCohort: input.rolloutCohort.trim(),
    contract: input.contract,
    deploymentContractVersion: input.deploymentContractVersion,
    deploymentContractHash: input.deploymentContractHash,
  })) {
    throw new Error('Affiliate Supply reconciliation run already contains different immutable evidence.');
  }
  const existingMode = upper(existing.mode);
  if (!['DRY_RUN', 'APPLY'].includes(existingMode)) {
    throw new Error('Affiliate Supply reconciliation run has an invalid immutable mode.');
  }
  const binding = affiliateLegacyReconciliationRunSessionBinding(input, existing.reportJson);
  await delegate.upsert({
    where: { reportHash: input.report.reportHash },
    create: affiliateLegacyReconciliationRunCreate(input, common),
    update: affiliateLegacyReconciliationRunUpdate(
      input,
      status,
      reportJson,
      binding.stored,
      toDate(existing.updatedAt),
      existing.status,
    ),
  });
  return true;
};

const persistAffiliateLegacyReconciliationRun = async (
  input: AffiliateLegacyReconciliationRunPersistenceInput,
): Promise<void> => {
  const delegate = input.database.reconciliationRuns as unknown as AffiliateLegacyReconciliationRunDelegate;
  if (!assertAffiliateLegacyReconciliationRunCapabilities(input, delegate)) return;
  const status = affiliateLegacyRunStatus(input.mode, input.report);
  const reportJson = affiliateLegacyReconciliationReportForRun(input);
  if (!affiliateLegacyReportHashesAreIntact(reportJson, input.report.reportHash)) {
    throw new Error('Affiliate reconciliation report hashes or evidence are malformed.');
  }
  const common = affiliateLegacyReconciliationRunCommon(input, status, reportJson);
  if (await persistAffiliateLegacyReconciliationExistingRun(
    input,
    delegate,
    status,
    reportJson,
    common,
  )) {
    return;
  }
  await delegate.upsert?.({
    where: { reportHash: input.report.reportHash },
    create: affiliateLegacyReconciliationRunCreate(input, common),
    update: {},
  });
};
const ROLLBACK_SESSION_SCHEMA_VERSION = 1 as const;
const ROLLBACK_HASH_PATTERN = /^[a-f0-9]{64}$/i;

const rollbackEvidenceSortKey = (value: unknown): string => {
  const object = recordValue(value);
  const timestamp = [
    'occurredAt',
    'createdAt',
    'recordedAt',
    'capturedAt',
    'startedAt',
    'finishedAt',
    'reviewedAt',
    'updatedAt',
  ]
    .map((key) => stringValue(object[key]))
    .find((candidate): candidate is string => candidate !== null) ?? '';
  const identifier = [
    'id',
    'receiptId',
    'transitionId',
    'eventId',
    'writeId',
    'jobId',
    'demandId',
    'supplySourceId',
  ]
    .map((key) => stringValue(object[key]))
    .find((candidate): candidate is string => candidate !== null) ?? '';
  return `${timestamp}\u0000${identifier}\u0000${hashAffiliateAgentValue(value)}`;
};

const normalizeRollbackCollection = (value: unknown): unknown[] => (
  Array.isArray(value)
    ? [...value].sort((left, right) => (
      codeUnitCompare(rollbackEvidenceSortKey(left), rollbackEvidenceSortKey(right))
    ))
    : []
);

const normalizeAffiliateCutoverRollbackEvidence = (
  evidence: AffiliateCutoverRollbackEvidenceInput,
): unknown => {
  const normalized = normalizeAffiliateLifecycleJson(evidence);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return normalized;
  }
  const result = { ...normalized as Record<string, unknown> };
  const collectionKeys = [
    'reviewedProcessInventory',
    'processInventory',
    'legacyServiceUnits',
    'governedReceipts',
    'governedLifecycleTransitions',
    'governedDemandOrWaveEvents',
    'governedAuthoritativeWrites',
  ];
  for (const key of collectionKeys) {
    result[key] = normalizeRollbackCollection(result[key]);
  }
  const manifest = result.reviewedLegacyProcessManifest;
  if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
    const normalizedManifest = { ...manifest as Record<string, unknown> };
    normalizedManifest.processes = normalizeRollbackCollection(normalizedManifest.processes);
    normalizedManifest.systemdUnits = normalizeRollbackCollection(normalizedManifest.systemdUnits);
    result.reviewedLegacyProcessManifest = normalizedManifest;
  }
  return result;
};

export type AffiliateCutoverLegacyServiceUnit = Readonly<{
  id: string;
  isEnabled: string;
  isActive: string;
}>;

export type AffiliateCutoverSystemdUnit = Readonly<{
  processId: string;
  unitId: string;
}>;

export type AffiliateCutoverRollbackSession = Readonly<{
  sessionId: string;
  rolloutCohort: string;
  recordedStartAt: string;
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest;
  reviewedLegacyProcessManifestHash: string;
  reviewedLegacyProcessManifestArtifactId: string;
  processInventory: readonly AffiliateCutoverProcessRecord[];
  legacyServiceUnits: readonly AffiliateCutoverLegacyServiceUnit[];
  preflightReport: AffiliateCutoverPreflightReport;
  preflightReportHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
}>;

export type AffiliateCutoverRollbackSessionInput = Readonly<{
  database: AffiliateSupplyDatabase;
  sessionId?: string;
  rolloutCohort: string;
  clock?: () => Date;
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest;
  preflightInput: AffiliateCutoverPreflightInput;
  preflightReport: AffiliateCutoverPreflightReport;
}>;

type AffiliateCutoverRollbackSessionResolution = Readonly<{
  session: AffiliateCutoverRollbackSession;
  isValid: boolean;
  invalidReasons: readonly string[];
}>;

const emptyRollbackManifest = (): AffiliateLegacyProcessManifest => ({
  schemaVersion: 1,
  artifactId: '',
  processes: [],
  systemdUnits: [],
  processCount: 0,
  manifestHash: '',
  inventoryArtifactId: '',
  inventoryHash: '',
  inventoryCount: 0,
  reviewedAt: '',
  reviewedBy: '',
});

const emptyRollbackPreflight = (): AffiliateCutoverPreflightReport => ({
  schemaVersion: 1,
  evaluatedAt: '',
  isReady: false,
  inputHash: '',
  reportHash: '',
  supplyContractVersion: 0,
  supplyContractHash: '',
  deploymentContractVersion: 0,
  deploymentContractHash: '',
  gatewayVersion: 0,
  reviewedLegacyProcessManifestHash: '',
  reviewedLegacyProcessManifestCount: 0,
  reviewedLegacyProcessManifestArtifactId: '',
  processInventoryArtifactId: '',
  processInventoryHash: '',
  processInventoryCount: 0,
  reviewedSystemdUnits: [],
  legacyServiceUnits: [],
  blockingFindings: [],
  warnings: [],
  resolutions: [],
  counts: {
    mappingProducers: 0,
    supplyReviewers: 0,
    coveragePlanners: 0,
    stoppedLegacyProcesses: 0,
    runningLegacyProcesses: 0,
    liveLegacyClaims: 0,
    unsafeContainers: 0,
  },
  reviewedAgentNetwork: '',
});

const readRollbackDate = (value: unknown): string | null => {
  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const readRollbackHash = (value: unknown): string | null => (
  typeof value === 'string' && ROLLBACK_HASH_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null
);
const readRollbackSystemdUnits = (
  value: unknown,
): AffiliateCutoverSystemdUnit[] | null => {
  if (!Array.isArray(value)) return null;
  const units = value.map((entry) => {
    const unit = recordValue(entry);
    const processId = stringValue(unit.processId);
    const unitId = stringValue(unit.unitId);
    return processId && unitId ? { processId, unitId } : null;
  });
  if (
    units.some((unit) => unit === null)
    || new Set(units.map((unit) => unit?.unitId)).size !== units.length
  ) return null;
  return units
    .filter((unit): unit is AffiliateCutoverSystemdUnit => unit !== null)
    .sort((left, right) => codeUnitCompare(
      `${left.processId}:${left.unitId}`,
      `${right.processId}:${right.unitId}`,
    ));
};

const readRollbackLegacyServiceUnits = (
  value: unknown,
): AffiliateCutoverLegacyServiceUnit[] | null => {
  if (!Array.isArray(value)) return null;
  const units = value.map((entry) => {
    const unit = recordValue(entry);
    const id = stringValue(unit.id);
    const isEnabled = stringValue(unit.isEnabled)?.toUpperCase();
    const isActive = stringValue(unit.isActive)?.toUpperCase();
    return id && isEnabled && isActive
      ? { id, isEnabled, isActive }
      : null;
  });
  if (
    units.some((unit) => unit === null)
    || new Set(units.map((unit) => unit?.id)).size !== units.length
    || units.some((unit) => (
      unit !== null
      && (!['DISABLED', 'MASKED'].includes(unit.isEnabled) || unit.isActive !== 'INACTIVE')
    ))
  ) return null;
  return units
    .filter((unit): unit is AffiliateCutoverLegacyServiceUnit => unit !== null)
    .sort((left, right) => codeUnitCompare(left.id, right.id));
};

const systemdUnitsForManifest = (
  manifest: AffiliateLegacyProcessManifest,
): AffiliateCutoverSystemdUnit[] | null => (
  readRollbackSystemdUnits(
    Reflect.get(manifest as unknown as object, 'systemdUnits'),
  )
);

const manifestServiceUnitsMatch = (
  manifest: AffiliateLegacyProcessManifest,
  serviceUnits: readonly AffiliateCutoverLegacyServiceUnit[] | null,
): boolean => {
  const systemdUnits = systemdUnitsForManifest(manifest);
  if (!systemdUnits || !serviceUnits) return false;
  const expectedIds = systemdUnits.map((unit) => unit.unitId).sort(codeUnitCompare);
  const actualIds = serviceUnits.map((unit) => unit.id).sort(codeUnitCompare);
  return expectedIds.length === actualIds.length
    && expectedIds.every((id, index) => id === actualIds[index]);
};
const legacyServiceUnitIdsForSession = (
  session: AffiliateCutoverRollbackSession,
): string[] | null => {
  const legacyProcessIds = session.processInventory
    .filter((process) => upper(process.kind) === 'LEGACY')
    .map((process) => stringValue(process.id))
    .filter((id): id is string => id !== null);
  const expectedProcessIds = new Set(legacyProcessIds);
  const systemdUnits = systemdUnitsForManifest(session.reviewedLegacyProcessManifest);
  if (
    !systemdUnits
    || expectedProcessIds.size !== legacyProcessIds.length
  ) return null;
  const mappedProcessCounts = new Map<string, number>();
  for (const unit of systemdUnits) {
    if (!expectedProcessIds.has(unit.processId)) return null;
    mappedProcessCounts.set(unit.processId, (mappedProcessCounts.get(unit.processId) ?? 0) + 1);
  }
  if (
    mappedProcessCounts.size !== systemdUnits.length
    || [...mappedProcessCounts.values()].some((count) => count !== 1)
  ) return null;
  return systemdUnits.map((unit) => unit.unitId).sort(codeUnitCompare);
};

const hashRollbackManifest = (
  processes: readonly { id: string; processClass: string }[],
  systemdUnits: readonly AffiliateCutoverSystemdUnit[],
): string => {
  const hashManifest = hashAffiliateLegacyProcessManifest as unknown as (
    processes: readonly { id: string; processClass: string }[],
    systemdUnits?: readonly AffiliateCutoverSystemdUnit[],
  ) => string;
  return hashManifest(processes, systemdUnits);
};


const readRollbackManifestProcesses = (
  value: unknown,
): { id: string; processClass: string }[] | null => {
  if (!Array.isArray(value)) return null;
  const processes = value.map((entry) => {
    const process = recordValue(entry);
    const id = stringValue(process.id);
    const processClass = stringValue(process.processClass);
    return id && processClass ? { id, processClass: processClass.toUpperCase() } : null;
  });
  if (processes.some((process) => process === null)) return null;
  return processes
    .filter((process): process is { id: string; processClass: string } => process !== null)
    .sort((left, right) => codeUnitCompare(`${left.id}:${left.processClass}`, `${right.id}:${right.processClass}`));
};

const readRollbackInteger = (value: unknown): number | null => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
);
const rollbackUpperString = (value: unknown): string | null => {
  const string = stringValue(value);
  return string ? string.toUpperCase() : null;
};

const isRollbackManifestMetadataHeaderValid = (
  object: Readonly<Record<string, unknown>>,
  processCount: number | null,
): boolean => object.schemaVersion === 1 && processCount !== null;

const readRollbackManifestMetadata = (
  object: Record<string, unknown>,
): Readonly<{
  processCount: number;
  artifactId: string;
  manifestHash: string;
  inventoryArtifactId: string;
  inventoryHash: string;
  inventoryCount: number;
  reviewedAt: string;
  reviewedBy: string;
}> | null => {
  const processCount = readRollbackInteger(object.processCount);
  const inventoryCount = readRollbackInteger(object.inventoryCount);
  const artifactId = stringValue(object.artifactId);
  const manifestHash = readRollbackHash(object.manifestHash);
  const inventoryArtifactId = stringValue(object.inventoryArtifactId);
  const inventoryHash = readRollbackHash(object.inventoryHash);
  const reviewedAt = readRollbackDate(object.reviewedAt);
  const reviewedBy = stringValue(object.reviewedBy);
  const requiredFields = [
    processCount,
    artifactId,
    manifestHash,
    inventoryArtifactId,
    inventoryHash,
    inventoryCount,
    reviewedAt,
    reviewedBy,
  ];
  if (
    !isRollbackManifestMetadataHeaderValid(object, processCount)
    || inventoryArtifactId === artifactId
    || requiredFields.some((field) => field === null || field === '')
  ) return null;
  return {
    processCount: processCount as number,
    artifactId: artifactId as string,
    manifestHash: manifestHash as string,
    inventoryArtifactId: inventoryArtifactId as string,
    inventoryHash: inventoryHash as string,
    inventoryCount: inventoryCount as number,
    reviewedAt: reviewedAt as string,
    reviewedBy: reviewedBy as string,
  };
};

const readRollbackManifest = (
  value: unknown,
): AffiliateLegacyProcessManifest | null => {
  const object = recordValue(value);
  const systemdUnits = readRollbackSystemdUnits(object.systemdUnits);
  const processes = readRollbackManifestProcesses(object.processes);
  const metadata = readRollbackManifestMetadata(object);
  if (!systemdUnits || !processes || !metadata) return null;
  if (metadata.processCount !== processes.length) return null;
  if (metadata.manifestHash !== hashRollbackManifest(processes, systemdUnits)) return null;
  return {
    schemaVersion: 1,
    artifactId: metadata.artifactId,
    processes,
    systemdUnits,
    processCount: processes.length,
    manifestHash: metadata.manifestHash,
    inventoryArtifactId: metadata.inventoryArtifactId,
    inventoryHash: metadata.inventoryHash,
    inventoryCount: metadata.inventoryCount,
    reviewedAt: metadata.reviewedAt,
    reviewedBy: metadata.reviewedBy,
  };
};

const isRollbackProcessRecordKindValid = (
  kind: string | null,
  processClass: string | null,
  role: string | null,
  workerId: string | null,
): boolean => {
  if (kind !== 'LEGACY' && kind !== 'GOVERNED') return false;
  if (kind === 'LEGACY' && !processClass) return false;
  if (kind === 'GOVERNED' && (!role || !workerId)) return false;
  return true;
};

const readRollbackProcessRecord = (
  entry: unknown,
): AffiliateCutoverProcessRecord | null => {
  const process = recordValue(entry);
  const id = stringValue(process.id);
  const kind = rollbackUpperString(process.kind);
  const command = stringValue(process.command);
  const status = rollbackUpperString(process.status);
  const role = stringValue(process.role);
  const workerId = stringValue(process.workerId);
  const processClass = stringValue(process.processClass);
  if (!id || !command || !status) return null;
  if (!isRollbackProcessRecordKindValid(kind, processClass, role, workerId)) return null;
  return {
    id,
    kind,
    ...(role ? { role } : {}),
    ...(workerId ? { workerId } : {}),
    ...(processClass ? { processClass: processClass.toUpperCase() } : {}),
    command,
    status,
  } as AffiliateCutoverProcessRecord;
};

const rollbackProcessInventoryRecordKey = (
  process: AffiliateCutoverProcessRecord,
): string => JSON.stringify({
  id: stringValue(process.id) ?? '',
  kind: upper(process.kind),
  role: stringValue(process.role) ? upper(process.role) : null,
  workerId: stringValue(process.workerId),
  processClass: stringValue(process.processClass) ? upper(process.processClass) : null,
  command: stringValue(process.command) ?? '',
  status: upper(process.status),
});

const readRollbackProcessInventory = (
  value: unknown,
): AffiliateCutoverProcessRecord[] | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const records = value.map(readRollbackProcessRecord);
  if (records.some((record) => record === null)) return null;
  return records
    .filter((record): record is AffiliateCutoverProcessRecord => record !== null)
    .sort((left, right) => codeUnitCompare(
      rollbackProcessInventoryRecordKey(left),
      rollbackProcessInventoryRecordKey(right),
    ));
};

const isRollbackPreflightIdentityIntact = (
  object: Record<string, unknown>,
): boolean => {
  if (object.schemaVersion !== 1) return false;
  if (!readRollbackDate(object.evaluatedAt)) return false;
  if (!stringValue(object.inputHash)) return false;
  if (!readRollbackHash(object.reportHash)) return false;
  return true;
};

const isRollbackPreflightContractIntact = (
  object: Record<string, unknown>,
): boolean => {
  if (!readRollbackHash(object.supplyContractHash)) return false;
  if (!Number.isInteger(object.supplyContractVersion)) return false;
  if (!readRollbackHash(object.deploymentContractHash)) return false;
  if (!Number.isInteger(object.deploymentContractVersion)) return false;
  if (!Number.isInteger(object.gatewayVersion)) return false;
  return true;
};

const isRollbackPreflightInventoryIntact = (
  object: Record<string, unknown>,
): boolean => {
  if (!readRollbackHash(object.reviewedLegacyProcessManifestHash)) return false;
  if (!Number.isInteger(object.reviewedLegacyProcessManifestCount)) return false;
  if (!stringValue(object.reviewedLegacyProcessManifestArtifactId)) return false;
  if (!stringValue(object.processInventoryArtifactId)) return false;
  if (!readRollbackHash(object.processInventoryHash)) return false;
  if (typeof object.processInventoryCount !== 'number') return false;
  if (!Number.isInteger(object.processInventoryCount)) return false;
  if (object.processInventoryCount < 0) return false;
  return true;
};

const isRollbackPreflightCollectionsIntact = (
  object: Record<string, unknown>,
): boolean => {
  if (!Array.isArray(object.blockingFindings)) return false;
  if (!Array.isArray(object.warnings)) return false;
  if (!Array.isArray(object.resolutions)) return false;
  if (!recordValue(object.counts)) return false;
  if (!stringValue(object.reviewedAgentNetwork)) return false;
  return true;
};

const readRollbackPreflight = (
  value: unknown,
): AffiliateCutoverPreflightReport | null => {
  const object = recordValue(value);
  const reviewedSystemdUnits = readRollbackSystemdUnits(object.reviewedSystemdUnits);
  const legacyServiceUnits = readRollbackLegacyServiceUnits(object.legacyServiceUnits);
  if (!reviewedSystemdUnits) return null;
  if (!legacyServiceUnits) return null;
  if (!isRollbackPreflightIdentityIntact(object)) return null;
  if (!isRollbackPreflightContractIntact(object)) return null;
  if (!isRollbackPreflightInventoryIntact(object)) return null;
  if (!isRollbackPreflightCollectionsIntact(object)) return null;
  const report = object as unknown as AffiliateCutoverPreflightReport;
  return isAffiliateCutoverPreflightReportIntact(report) ? report : null;
};

const rollbackSessionPreimage = (
  session: AffiliateCutoverRollbackSession,
): Record<string, unknown> => ({
  schemaVersion: ROLLBACK_SESSION_SCHEMA_VERSION,
  kind: 'AFFILIATE_CUTOVER_SESSION',
  sessionId: session.sessionId,
  rolloutCohort: session.rolloutCohort,
  recordedStartAt: session.recordedStartAt,
  reviewedLegacyProcessManifestHash: session.reviewedLegacyProcessManifestHash,
  reviewedLegacyProcessManifestArtifactId: session.reviewedLegacyProcessManifestArtifactId,
  reviewedLegacyProcessManifest: session.reviewedLegacyProcessManifest,
  processInventory: session.processInventory,
  legacyServiceUnits: session.legacyServiceUnits,
  preflightReportHash: session.preflightReportHash,
  preflightReport: session.preflightReport,
  deploymentContractVersion: session.deploymentContractVersion,
  deploymentContractHash: session.deploymentContractHash,
});

const firstRollbackValue = (...values: readonly unknown[]): unknown => (
  values.find((value) => value !== null && value !== undefined)
);

const rollbackStringOrEmpty = (value: unknown): string => stringValue(value) ?? '';
const rollbackHashOrEmpty = (value: unknown): string => readRollbackHash(value) ?? '';
const rollbackDateOrEmpty = (value: unknown): string => readRollbackDate(value) ?? '';

const rollbackOptionalField = (
  value: object | null | undefined,
  key: string,
): unknown => (value == null ? undefined : Reflect.get(value, key));

const rollbackSessionCandidate = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  if (payload.kind === 'AFFILIATE_CUTOVER_SESSION') return payload;
  return recordValue(firstRollbackValue(payload.cutoverSession, payload.session));
};

const rollbackManifestOrEmpty = (
  value: AffiliateLegacyProcessManifest | null,
): AffiliateLegacyProcessManifest => value ?? emptyRollbackManifest();

const rollbackProcessInventoryOrEmpty = (
  value: AffiliateCutoverProcessRecord[] | null,
): readonly AffiliateCutoverProcessRecord[] => value ?? [];

const rollbackServiceUnitsOrEmpty = (
  value: AffiliateCutoverLegacyServiceUnit[] | null,
): readonly AffiliateCutoverLegacyServiceUnit[] => value ?? [];

const rollbackPreflightOrEmpty = (
  value: AffiliateCutoverPreflightReport | null,
): AffiliateCutoverPreflightReport => value ?? emptyRollbackPreflight();

type RollbackSessionPayloadParts = Readonly<{
  candidate: Record<string, unknown>;
  session: AffiliateCutoverRollbackSession;
  reviewedManifest: AffiliateLegacyProcessManifest | null;
  processInventory: AffiliateCutoverProcessRecord[] | null;
  legacyServiceUnits: AffiliateCutoverLegacyServiceUnit[] | null;
  preflightReport: AffiliateCutoverPreflightReport | null;
  reviewedManifestHash: string;
  reviewedManifestArtifactId: string;
  preflightReportHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  sessionHash: string | null;
}>;

const readRollbackSessionPayload = (
  row: Record<string, unknown>,
): RollbackSessionPayloadParts => {
  const payload = recordValue(row.reportJson);
  const candidate = rollbackSessionCandidate(payload);
  const sessionId = rollbackStringOrEmpty(firstRollbackValue(candidate.sessionId, candidate.id, row.id));
  const rolloutCohort = rollbackStringOrEmpty(
    firstRollbackValue(candidate.rolloutCohort, row.rolloutCohort),
  );
  const recordedStartAt = rollbackDateOrEmpty(
    firstRollbackValue(candidate.recordedStartAt, candidate.startedAt, row.createdAt),
  );
  const reviewedManifest = readRollbackManifest(candidate.reviewedLegacyProcessManifest);
  const processInventory = readRollbackProcessInventory(candidate.processInventory);
  const legacyServiceUnits = readRollbackLegacyServiceUnits(candidate.legacyServiceUnits);
  const preflightReport = readRollbackPreflight(
    firstRollbackValue(candidate.preflightReport, candidate.preflight),
  );
  const reviewedManifestHash = rollbackHashOrEmpty(
    firstRollbackValue(
      candidate.reviewedLegacyProcessManifestHash,
      rollbackOptionalField(reviewedManifest, 'manifestHash'),
    ),
  );
  const reviewedManifestArtifactId = rollbackStringOrEmpty(
    firstRollbackValue(
      candidate.reviewedLegacyProcessManifestArtifactId,
      rollbackOptionalField(reviewedManifest, 'artifactId'),
    ),
  );
  const preflightReportHash = rollbackHashOrEmpty(
    firstRollbackValue(
      candidate.preflightReportHash,
      rollbackOptionalField(preflightReport, 'reportHash'),
    ),
  );
  const deploymentContractVersion = Number(
    firstRollbackValue(
      candidate.deploymentContractVersion,
      rollbackOptionalField(preflightReport, 'deploymentContractVersion'),
      row.deploymentContractVersion,
    ),
  );
  const deploymentContractHash = rollbackHashOrEmpty(
    firstRollbackValue(
      candidate.deploymentContractHash,
      rollbackOptionalField(preflightReport, 'deploymentContractHash'),
      row.deploymentContractHash,
    ),
  );
  const session: AffiliateCutoverRollbackSession = {
    sessionId,
    rolloutCohort,
    recordedStartAt,
    reviewedLegacyProcessManifest: rollbackManifestOrEmpty(reviewedManifest),
    reviewedLegacyProcessManifestHash: reviewedManifestHash,
    reviewedLegacyProcessManifestArtifactId: reviewedManifestArtifactId,
    processInventory: rollbackProcessInventoryOrEmpty(processInventory),
    legacyServiceUnits: rollbackServiceUnitsOrEmpty(legacyServiceUnits),
    preflightReport: rollbackPreflightOrEmpty(preflightReport),
    preflightReportHash,
    deploymentContractVersion,
    deploymentContractHash,
  };
  return {
    candidate,
    session,
    reviewedManifest,
    processInventory,
    legacyServiceUnits,
    preflightReport,
    reviewedManifestHash,
    reviewedManifestArtifactId,
    preflightReportHash,
    deploymentContractVersion,
    deploymentContractHash,
    sessionHash: readRollbackHash(candidate.sessionHash),
  };
};

const isRollbackSessionIdIntact = (
  sessionId: string,
  rowId: string | null,
): boolean => {
  if (!sessionId) return false;
  if (rowId !== null && sessionId !== rowId) return false;
  return true;
};

const isRollbackSessionModeAllowed = (mode: string): boolean => (
  !mode || ['CUTOVER_SESSION', 'DRY_RUN', 'APPLY', 'ROLLBACK_DRILL'].includes(mode)
);

const isRollbackManifestServiceEvidenceIntact = (
  payload: RollbackSessionPayloadParts,
): boolean => (
  !payload.reviewedManifest
  || manifestServiceUnitsMatch(payload.reviewedManifest, payload.legacyServiceUnits)
);

const rollbackSessionIdentityReasons = (
  row: Record<string, unknown>,
  payload: RollbackSessionPayloadParts,
): string[] => {
  const reasons: string[] = [];
  if (!isRollbackSessionIdIntact(payload.session.sessionId, stringValue(row.id))) {
    reasons.push('session ID is missing or does not match the durable row');
  }
  if (!isRollbackSessionModeAllowed(upper(row.mode))) {
    reasons.push('durable row is not a cutover reconciliation or rollback record');
  }
  if (!payload.session.rolloutCohort) reasons.push('rollout cohort is missing');
  if (!payload.session.recordedStartAt) reasons.push('recorded cutover start time is missing');
  if (!payload.reviewedManifest || !payload.processInventory) {
    reasons.push('reviewed manifest or complete process inventory is missing');
  }
  if (!payload.legacyServiceUnits) {
    reasons.push('reviewed legacy service-unit evidence is missing or invalid');
  }
  if (!isRollbackManifestServiceEvidenceIntact(payload)) {
    reasons.push('reviewed legacy service-unit evidence does not match manifest systemd units');
  }
  return reasons;
};

const rollbackSessionServiceEvidenceReasons = (
  payload: RollbackSessionPayloadParts,
): string[] => {
  const reasons: string[] = [];
  const preflightLegacyServiceUnits = payload.preflightReport
    ? readRollbackLegacyServiceUnits(
      Reflect.get(payload.preflightReport as unknown as object, 'legacyServiceUnits'),
    )
    : null;
  if (payload.preflightReport) {
    if (!preflightLegacyServiceUnits) {
      reasons.push('preflight legacy service-unit evidence does not match the reviewed session');
    } else if (!payload.legacyServiceUnits) {
      reasons.push('preflight legacy service-unit evidence does not match the reviewed session');
    } else if (
      hashAffiliateAgentValue(preflightLegacyServiceUnits)
      !== hashAffiliateAgentValue(payload.legacyServiceUnits)
    ) {
      reasons.push('preflight legacy service-unit evidence does not match the reviewed session');
    }
  }
  if (!payload.preflightReport) reasons.push('preflight report is missing or invalid');
  return reasons;
};

const isRollbackManifestInventoryBindingIntact = (
  manifest: AffiliateLegacyProcessManifest,
  processInventory: readonly AffiliateCutoverProcessRecord[],
): boolean => {
  if (manifest.inventoryHash !== hashAffiliateCutoverProcessInventory(processInventory)) return false;
  if (manifest.inventoryCount !== processInventory.length) return false;
  return true;
};

const isRollbackPreflightManifestBindingIntact = (
  preflightReport: AffiliateCutoverPreflightReport,
  manifest: AffiliateLegacyProcessManifest,
): boolean => {
  if (preflightReport.reviewedLegacyProcessManifestHash !== manifest.manifestHash) return false;
  if (preflightReport.reviewedLegacyProcessManifestCount !== manifest.processCount) return false;
  if (preflightReport.reviewedLegacyProcessManifestArtifactId !== manifest.artifactId) return false;
  if (preflightReport.processInventoryArtifactId !== manifest.inventoryArtifactId) return false;
  if (preflightReport.processInventoryHash !== manifest.inventoryHash) return false;
  if (preflightReport.processInventoryCount !== manifest.inventoryCount) return false;
  return true;
};

const rollbackSessionManifestEvidenceReasons = (
  payload: RollbackSessionPayloadParts,
): string[] => {
  const reasons: string[] = [];
  if (
    payload.reviewedManifest
    && payload.reviewedManifestHash !== payload.reviewedManifest.manifestHash
  ) {
    reasons.push('reviewed legacy manifest hash does not match the manifest');
  }
  if (
    payload.reviewedManifest
    && payload.processInventory
    && !isRollbackManifestInventoryBindingIntact(payload.reviewedManifest, payload.processInventory)
  ) {
    reasons.push('reviewed legacy manifest is not bound to the complete process inventory');
  }
  if (
    payload.reviewedManifest
    && payload.preflightReport
    && !isRollbackPreflightManifestBindingIntact(payload.preflightReport, payload.reviewedManifest)
  ) {
    reasons.push('preflight report does not match the reviewed legacy manifest');
  }
  return reasons;
};

const isRollbackPreflightDeploymentContractIntact = (
  payload: RollbackSessionPayloadParts,
): boolean => {
  const report = payload.preflightReport;
  if (!report) return true;
  if (report.reportHash !== payload.preflightReportHash) return false;
  if (report.deploymentContractVersion !== payload.deploymentContractVersion) return false;
  if (report.deploymentContractHash !== payload.deploymentContractHash) return false;
  return true;
};

const isRollbackPreflightEvaluationTimeIntact = (
  payload: RollbackSessionPayloadParts,
): boolean => {
  if (!payload.preflightReport) return true;
  if (!payload.session.recordedStartAt) return true;
  return Date.parse(payload.preflightReport.evaluatedAt) <= Date.parse(payload.session.recordedStartAt);
};

const isRollbackDurableCohortIntact = (
  row: Record<string, unknown>,
  payload: RollbackSessionPayloadParts,
): boolean => {
  if (row.rolloutCohort === undefined) return true;
  return stringValue(row.rolloutCohort) === payload.session.rolloutCohort;
};

const isRollbackDurableDeploymentVersionIntact = (
  row: Record<string, unknown>,
  payload: RollbackSessionPayloadParts,
): boolean => {
  if (row.deploymentContractVersion === undefined) return true;
  if (row.deploymentContractVersion === null) return true;
  return Number(row.deploymentContractVersion) === payload.deploymentContractVersion;
};

const isRollbackDurableDeploymentHashIntact = (
  row: Record<string, unknown>,
  payload: RollbackSessionPayloadParts,
): boolean => {
  if (row.deploymentContractHash === undefined) return true;
  if (row.deploymentContractHash === null) return true;
  return readRollbackHash(row.deploymentContractHash) === payload.deploymentContractHash;
};

const rollbackSessionContractEvidenceReasons = (
  row: Record<string, unknown>,
  payload: RollbackSessionPayloadParts,
): string[] => {
  const reasons: string[] = [];
  if (!isRollbackPreflightDeploymentContractIntact(payload)) {
    reasons.push('preflight report does not match the deployment contract');
  }
  if (!isRollbackPreflightEvaluationTimeIntact(payload)) {
    reasons.push('preflight report was evaluated after the recorded cutover start');
  }
  if (!isRollbackDurableCohortIntact(row, payload)) {
    reasons.push('durable row cohort does not match the recorded session cohort');
  }
  if (!isRollbackDurableDeploymentVersionIntact(row, payload)) {
    reasons.push('durable row deployment contract version does not match the session');
  }
  if (!isRollbackDurableDeploymentHashIntact(row, payload)) {
    reasons.push('durable row deployment contract hash does not match the session');
  }
  return reasons;
};

const isRollbackSessionHashIntact = (
  sessionHash: string | null,
  computedSessionHash: string,
): boolean => {
  if (!sessionHash) return false;
  return sessionHash === computedSessionHash;
};

const isRollbackDurableReportHashIntact = (
  row: Record<string, unknown>,
  computedSessionHash: string,
): boolean => {
  const durableReportHash = readRollbackHash(row.reportHash);
  if (!durableReportHash) return false;
  return durableReportHash === computedSessionHash;
};

const rollbackSessionHashReasons = (
  row: Record<string, unknown>,
  payload: RollbackSessionPayloadParts,
): string[] => {
  const reasons: string[] = [];
  const computedSessionHash = hashAffiliateAgentValue(rollbackSessionPreimage(payload.session));
  if (!isRollbackSessionHashIntact(payload.sessionHash, computedSessionHash)) {
    reasons.push('cutover session hash is missing or does not match its immutable evidence');
  }
  if (!isRollbackDurableReportHashIntact(row, computedSessionHash)) {
    reasons.push('durable session report hash is missing or does not match its immutable evidence');
  }
  return reasons;
};

const resolveRollbackSessionPayload = (
  row: Record<string, unknown>,
): AffiliateCutoverRollbackSessionResolution => {
  const payload = readRollbackSessionPayload(row);
  const invalidReasons = [
    ...rollbackSessionIdentityReasons(row, payload),
    ...rollbackSessionServiceEvidenceReasons(payload),
    ...rollbackSessionManifestEvidenceReasons(payload),
    ...rollbackSessionContractEvidenceReasons(row, payload),
    ...rollbackSessionHashReasons(row, payload),
  ];
  return {
    session: payload.session,
    isValid: invalidReasons.length === 0
      && payload.preflightReport?.isReady === true
      && isAffiliateCutoverPreflightApplySafe(payload.preflightReport),
    invalidReasons,
  };
};
const readRollbackRecordedStartAt = (
  input: Omit<AffiliateCutoverRollbackSessionInput, 'database'>,
  trustedRecordedStartAt?: Date | string,
): string | null => {
  const clockValue = input.clock ? input.clock() : new Date();
  return readRollbackDate(firstRollbackValue(trustedRecordedStartAt, clockValue));
};

const readRequiredRollbackSessionEvidence = (
  input: Omit<AffiliateCutoverRollbackSessionInput, 'database'>,
): Readonly<{
  manifest: AffiliateLegacyProcessManifest;
  processInventory: AffiliateCutoverProcessRecord[];
  legacyServiceUnits: AffiliateCutoverLegacyServiceUnit[];
}> => {
  const manifest = readRollbackManifest(input.reviewedLegacyProcessManifest);
  if (!manifest) throw new Error('Affiliate cutover session requires an intact reviewed legacy manifest.');
  const processInventory = readRollbackProcessInventory(input.preflightInput.processInventory);
  if (!processInventory) throw new Error('Affiliate cutover session requires a complete process inventory.');
  const legacyServiceUnits = readRollbackLegacyServiceUnits(
    Reflect.get(input.preflightInput as unknown as object, 'legacyServiceUnits'),
  );
  if (!legacyServiceUnits) {
    throw new Error('Affiliate cutover session requires matching reviewed legacy service-unit evidence.');
  }
  if (!manifestServiceUnitsMatch(manifest, legacyServiceUnits)) {
    throw new Error('Affiliate cutover session requires matching reviewed legacy service-unit evidence.');
  }
  return { manifest, processInventory, legacyServiceUnits };
};

const isRollbackPreflightArtifactSetIntact = (
  derived: AffiliateCutoverPreflightReport,
  reviewed: AffiliateCutoverPreflightReport,
): boolean => {
  if (derived.inputHash !== reviewed.inputHash) return false;
  if (derived.reportHash !== reviewed.reportHash) return false;
  if (derived.processInventoryArtifactId !== reviewed.processInventoryArtifactId) return false;
  return true;
};

const isRollbackPreflightSessionSafe = (
  input: Omit<AffiliateCutoverRollbackSessionInput, 'database'>,
  report: AffiliateCutoverPreflightReport,
  manifest: AffiliateLegacyProcessManifest,
  recordedStartAt: string,
): boolean => {
  if (report.reviewedLegacyProcessManifestHash !== manifest.manifestHash) return false;
  if (report.reviewedLegacyProcessManifestArtifactId !== manifest.artifactId) return false;
  if (!isAffiliateCutoverPreflightFresh(report, new Date(recordedStartAt))) return false;
  if (input.preflightInput.processInventoryArtifactId !== report.processInventoryArtifactId) return false;
  if (report.isReady !== true) return false;
  if (!isAffiliateCutoverPreflightApplySafe(report)) return false;
  return true;
};

const rollbackSessionFromInput = (
  input: Omit<AffiliateCutoverRollbackSessionInput, 'database'> & { sessionId: string },
  trustedRecordedStartAt?: Date | string,
): AffiliateCutoverRollbackSession => {
  const recordedStartAt = readRollbackRecordedStartAt(input, trustedRecordedStartAt);
  if (!recordedStartAt) throw new Error('Affiliate cutover session requires a valid trusted start time.');
  if (!input.rolloutCohort.trim()) throw new Error('Affiliate cutover session requires a rollout cohort.');
  const evidence = readRequiredRollbackSessionEvidence(input);
  const preflightReport = readRollbackPreflight(input.preflightReport);
  if (!preflightReport) throw new Error('Affiliate cutover session requires an intact preflight report.');
  const derivedPreflightReport = buildAffiliateCutoverPreflightReport(input.preflightInput);
  if (!isRollbackPreflightArtifactSetIntact(derivedPreflightReport, preflightReport)) {
    throw new Error('Affiliate cutover session requires the preflight report and inventory to be the same reviewed artifacts.');
  }
  if (!isRollbackPreflightSessionSafe(input, preflightReport, evidence.manifest, recordedStartAt)) {
    throw new Error('Affiliate cutover session requires matching, apply-safe preflight and manifest evidence.');
  }
  return {
    sessionId: input.sessionId,
    rolloutCohort: input.rolloutCohort.trim(),
    recordedStartAt,
    reviewedLegacyProcessManifest: evidence.manifest,
    reviewedLegacyProcessManifestHash: evidence.manifest.manifestHash,
    reviewedLegacyProcessManifestArtifactId: evidence.manifest.artifactId,
    processInventory: evidence.processInventory,
    legacyServiceUnits: evidence.legacyServiceUnits,
    preflightReport,
    preflightReportHash: preflightReport.reportHash,
    deploymentContractVersion: preflightReport.deploymentContractVersion,
    deploymentContractHash: preflightReport.deploymentContractHash,
  };
};

type AffiliateGovernedEvidenceDelegate = {
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown>;
};

const delegateHasAffiliateGovernedRows = async (
  delegate: unknown,
  where: Record<string, unknown>,
): Promise<boolean> => {
  if (!delegate || typeof delegate !== 'object') {
    throw new Error('Affiliate cutover boundary evidence is incomplete: governed evidence query capability is unavailable.');
  }
  const typed = delegate as AffiliateGovernedEvidenceDelegate;
  if (typeof typed.findFirst === 'function') {
    const row = await typed.findFirst({ where });
    if (row === undefined) {
      throw new Error('Affiliate cutover boundary evidence is incomplete: governed evidence query returned no result.');
    }
    if (row !== null && (typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('Affiliate cutover boundary evidence is incomplete: governed evidence query returned an invalid result.');
    }
    return row !== null;
  }
  if (typeof typed.findMany === 'function') {
    const rows = await typed.findMany({ where, take: 1 });
    if (!Array.isArray(rows)) {
      throw new Error('Affiliate cutover boundary evidence is incomplete: governed evidence query returned an invalid result.');
    }
    return rows.length > 0;
  }
  throw new Error('Affiliate cutover boundary evidence is incomplete: governed evidence query capability is unavailable.');
};

const affiliateEvidenceAtOrAfterBoundary = (
  boundary: Date,
  timestampFields: readonly string[],
): Record<string, unknown> => ({
  OR: timestampFields.map((field) => ({
    [field]: { gte: boundary },
  })),
});

const priorAffiliateCutoverBoundary = async (
  database: AffiliateSupplyDatabase,
  proposedBoundary: Date,
): Promise<Date | null> => {
  const delegate = database.reconciliationRuns as unknown as AffiliateGovernedEvidenceDelegate;
  if (!delegate || typeof delegate !== 'object') {
    throw new Error('Affiliate cutover boundary evidence is incomplete: reconciliation session query capability is unavailable.');
  }
  const where = { mode: 'CUTOVER_SESSION' };
  let rows: unknown[];
  if (typeof delegate.findMany === 'function') {
    const result = await delegate.findMany({ where, orderBy: { createdAt: 'asc' } });
    if (!Array.isArray(result)) {
      throw new Error('Affiliate cutover boundary evidence is incomplete: reconciliation session query returned an invalid result.');
    }
    rows = result;
  } else if (typeof delegate.findFirst === 'function') {
    const result = await delegate.findFirst({ where, orderBy: { createdAt: 'asc' } });
    if (result === undefined) {
      throw new Error('Affiliate cutover boundary evidence is incomplete: reconciliation session query returned no result.');
    }
    rows = result === null ? [] : [result];
  } else {
    throw new Error('Affiliate cutover boundary evidence is incomplete: reconciliation session query capability is unavailable.');
  }
  const boundaries = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Affiliate cutover boundary evidence is incomplete: reconciliation session row is invalid.');
    }
    const record = row as Record<string, unknown>;
    const report = recordValue(record.reportJson);
    const value = firstRollbackValue(
      record.recordedStartAt,
      report.recordedStartAt,
      record.createdAt,
    );
    const date = readRollbackDate(value);
    if (!date) {
      throw new Error('Affiliate cutover boundary evidence is incomplete: reconciliation session boundary is missing or invalid.');
    }
    return new Date(date);
  });
  if (boundaries.length === 0) return null;
  return boundaries.reduce(
    (earliest, value) => value < earliest ? value : earliest,
    proposedBoundary,
  );
};

const assertAffiliateNewSessionBoundary = async (
  database: AffiliateSupplyDatabase,
  boundary: Date,
): Promise<void> => {
  const durableBoundary = await priorAffiliateCutoverBoundary(
    database,
    boundary,
  );
  const evidenceBoundary = durableBoundary ?? boundary;
  const evidenceWhere = (timestampFields: readonly string[]): Record<string, unknown> => (
    affiliateEvidenceAtOrAfterBoundary(evidenceBoundary, timestampFields)
  );
  const checks: readonly [unknown, Record<string, unknown>][] = [
    [
      database.reconciliationRuns,
      {
        status: 'APPLIED',
        ...evidenceWhere(['createdAt', 'updatedAt', 'appliedAt']),
      },
    ],
    [
      database.gatewayReceipts,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.gatewayEvents,
      evidenceWhere(['createdAt']),
    ],
    [
      database.transitions,
      evidenceWhere(['createdAt', 'occurredAt']),
    ],
    [
      database.demands,
      {
        ...evidenceWhere(['createdAt', 'updatedAt']),
      },
    ],
    [
      database.waves,
      {
        ...evidenceWhere(['createdAt', 'updatedAt']),
      },
    ],
    [
      database.supplySources,
      {
        ...evidenceWhere(['createdAt', 'updatedAt']),
      },
    ],
    [
      database.targets,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.mappingJobs,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.intakeRuns,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.discoveryRuns,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.coverageJobs,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.gatewayClaims,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.gatewayJobs,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
    [
      database.approvals,
      evidenceWhere(['createdAt', 'updatedAt']),
    ],
  ];
  const hasGovernedWrites = await Promise.all(
    checks.map(([delegate, where]) => delegateHasAffiliateGovernedRows(delegate, where)),
  );
  if (hasGovernedWrites.some(Boolean)) {
    throw new Error('A new Affiliate cutover session cannot reset the rollback boundary after governed writes.');
  }
};

type AffiliateCutoverSessionDelegate = {
  findUnique?: (args: unknown) => Promise<unknown>;
  upsert: (args: unknown) => Promise<unknown>;
};

type AffiliateCutoverSessionLookup = Readonly<{
  hasExistingSession: boolean;
  existingResolution: AffiliateCutoverRollbackSessionResolution | null;
}>;

const loadExistingAffiliateCutoverSession = async (
  delegate: AffiliateCutoverSessionDelegate,
  requestedSessionId: string | undefined,
): Promise<AffiliateCutoverSessionLookup> => {
  if (!requestedSessionId || typeof delegate.findUnique !== 'function') {
    return { hasExistingSession: false, existingResolution: null };
  }
  const existing = affiliateLegacyJsonObject(await delegate.findUnique({
    where: { id: requestedSessionId },
  }));
  const hasExistingSession = existing.id !== undefined;
  if (hasExistingSession && existing.reportJson === undefined) {
    throw new Error('Affiliate cutover session ID already exists without immutable evidence.');
  }
  if (existing.reportJson === undefined) {
    return { hasExistingSession, existingResolution: null };
  }
  const existingResolution = resolveRollbackSessionPayload(existing);
  if (!existingResolution.isValid) {
    throw new Error('Affiliate cutover session ID already contains invalid immutable evidence.');
  }
  return { hasExistingSession, existingResolution };
};

const isAffiliateCutoverSessionEvidenceSame = (
  existingResolution: AffiliateCutoverRollbackSessionResolution,
  sessionHash: string,
): boolean => hashAffiliateAgentValue(
  rollbackSessionPreimage(existingResolution.session),
) === sessionHash;

const persistAffiliateCutoverSessionRecord = async (
  delegate: AffiliateCutoverSessionDelegate,
  session: AffiliateCutoverRollbackSession,
  reportJson: unknown,
  sessionHash: string,
): Promise<void> => {
  await delegate.upsert({
    where: { id: session.sessionId },
    create: {
      id: session.sessionId,
      createdAt: new Date(session.recordedStartAt),
      mode: 'CUTOVER_SESSION',
      status: 'READY',
      operatorId: null,
      rolloutCohort: session.rolloutCohort,
      supplyContractVersion: session.preflightReport.supplyContractVersion,
      supplyContractHash: session.preflightReport.supplyContractHash,
      deploymentContractVersion: session.deploymentContractVersion,
      deploymentContractHash: session.deploymentContractHash,
      inputHash: sessionHash,
      outputHash: sessionHash,
      reportHash: sessionHash,
      counts: prismaJsonValue({
        processInventory: session.processInventory.length,
        reviewedLegacyProcesses: session.reviewedLegacyProcessManifest.processCount,
      }),
      failedInvariants: [],
      resolutionRefs: [],
      reportJson: prismaJsonValue(reportJson),
      appliedAt: null,
      appliedBy: null,
      applyNonceHash: null,
    },
    update: {},
  });
};

const verifyPersistedAffiliateCutoverSession = async (
  delegate: AffiliateCutoverSessionDelegate,
  sessionId: string,
  sessionHash: string,
): Promise<void> => {
  if (typeof delegate.findUnique !== 'function') return;
  const persisted = affiliateLegacyJsonObject(await delegate.findUnique({
    where: { id: sessionId },
  }));
  const persistedResolution = resolveRollbackSessionPayload(persisted);
  if (
    !persistedResolution.isValid
    || !isAffiliateCutoverSessionEvidenceSame(persistedResolution, sessionHash)
  ) {
    throw new Error('Affiliate cutover session ID already contains different immutable evidence.');
  }
};

const persistAffiliateCutoverSessionInTransaction = async (
  input: AffiliateCutoverRollbackSessionInput,
  transactionDatabase: AffiliateSupplyDatabase,
  requestedSessionId: string | undefined,
  sessionId: string,
  proposedStartAt: Date,
): Promise<Readonly<{
  sessionId: string;
  sessionHash: string;
  recordedStartAt: string;
}>> => {
  const delegate = transactionDatabase.reconciliationRuns as unknown as AffiliateCutoverSessionDelegate;
  if (
    requestedSessionId
    && typeof delegate.findUnique !== 'function'
  ) {
    throw new Error('Affiliate cutover session persistence requires durable session lookup capability.');
  }
  const existing = await loadExistingAffiliateCutoverSession(delegate, requestedSessionId);
  if (!existing.hasExistingSession) {
    await assertAffiliateNewSessionBoundary(
      transactionDatabase,
      proposedStartAt,
    );
  }
  const session = rollbackSessionFromInput(
    { ...input, sessionId },
    existing.existingResolution?.session.recordedStartAt ?? proposedStartAt,
  );
  const sessionHash = hashAffiliateAgentValue(rollbackSessionPreimage(session));
  const reportJson = normalizeAffiliateLifecycleJson({
    ...rollbackSessionPreimage(session),
    sessionHash,
  });
  if (existing.existingResolution) {
    if (!isAffiliateCutoverSessionEvidenceSame(existing.existingResolution, sessionHash)) {
      throw new Error('Affiliate cutover session ID already contains different immutable evidence.');
    }
    return {
      sessionId: session.sessionId,
      sessionHash,
      recordedStartAt: session.recordedStartAt,
    };
  }
  await persistAffiliateCutoverSessionRecord(delegate, session, reportJson, sessionHash);
  await verifyPersistedAffiliateCutoverSession(delegate, session.sessionId, sessionHash);
  return {
    sessionId: session.sessionId,
    sessionHash,
    recordedStartAt: session.recordedStartAt,
  };
};

export const persistAffiliateCutoverSession = async (
  input: AffiliateCutoverRollbackSessionInput,
): Promise<Readonly<{
  sessionId: string;
  sessionHash: string;
  recordedStartAt: string;
}>> => {
  const requestedSessionId = input.sessionId?.trim();
  const sessionId = requestedSessionId || createId();
  const proposedStartAt = input.clock?.() ?? new Date();
  return withSupplyTransaction(
    input.database,
    (transactionDatabase) => persistAffiliateCutoverSessionInTransaction(
      input,
      transactionDatabase,
      requestedSessionId,
      sessionId,
      proposedStartAt,
    ),
    { requireTransaction: true },
  );
};

export const loadAffiliateCutoverRollbackSession = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  sessionId: string;
}>): Promise<AffiliateCutoverRollbackSession> => {
  const sessionId = input.sessionId.trim();
  if (!sessionId) throw new Error('Affiliate cutover rollback requires a session ID.');
  const delegate = input.database.reconciliationRuns as unknown as {
    findUnique?: (args: unknown) => Promise<unknown>;
  };
  if (typeof delegate?.findUnique !== 'function') {
    throw new Error('Affiliate cutover session persistence is not available.');
  }
  const row = affiliateLegacyJsonObject(await delegate.findUnique({
    where: { id: sessionId },
  }));
  if (!row.id) {
    throw new Error(`Affiliate cutover rollback session "${sessionId}" was not found.`);
  }
  const resolution = resolveRollbackSessionPayload(row);
  if (!resolution.isValid) {
    throw new Error(
      `Affiliate cutover rollback session "${sessionId}" is incomplete or mismatched: ${resolution.invalidReasons.join('; ') || 'preflight is not apply-safe'}.`,
    );
  }
  return resolution.session;
};

export type AffiliateCutoverRuntimeProcessEvidence = Readonly<{
  artifactId: string;
  capturedAt: string;
  processInventory: readonly AffiliateCutoverProcessRecord[];
  controlPlaneProcesses: readonly Readonly<{
    id: string;
    status: string;
  }>[];
  legacyServiceUnits?: readonly AffiliateCutoverLegacyServiceUnit[];
}>;

const AFFILIATE_CUTOVER_RUNTIME_EVIDENCE_MAX_AGE_MS = 15 * 60 * 1000;

const rollbackProcessIdentity = (
  process: AffiliateCutoverProcessRecord,
): string => JSON.stringify({
  id: stringValue(process.id) ?? '',
  kind: upper(process.kind),
  role: stringValue(process.role) ? upper(process.role) : null,
  workerId: stringValue(process.workerId),
  processClass: stringValue(process.processClass) ? upper(process.processClass) : null,
  command: stringValue(process.command) ?? '',
});

const isRollbackRuntimeArtifactIdIntact = (
  session: AffiliateCutoverRollbackSession,
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
): boolean => {
  const artifactId = runtimeEvidence ? stringValue(runtimeEvidence.artifactId) : null;
  if (!artifactId) return false;
  if (artifactId === session.preflightReport.processInventoryArtifactId) return false;
  if (artifactId === session.reviewedLegacyProcessManifestArtifactId) return false;
  return true;
};

const isRollbackRuntimeEvidenceFresh = (
  session: AffiliateCutoverRollbackSession,
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
  now: Date,
): boolean => {
  const capturedAt = runtimeEvidence ? readRollbackDate(runtimeEvidence.capturedAt) : null;
  if (!capturedAt) return false;
  const capturedTime = Date.parse(capturedAt);
  const ageMs = now.getTime() - capturedTime;
  const sessionStartTime = Date.parse(session.recordedStartAt);
  if (!Number.isFinite(ageMs)) return false;
  if (!Number.isFinite(sessionStartTime)) return false;
  if (capturedTime < sessionStartTime) return false;
  if (ageMs < 0) return false;
  if (ageMs > AFFILIATE_CUTOVER_RUNTIME_EVIDENCE_MAX_AGE_MS) return false;
  return true;
};

const rollbackProcessIdentityCounts = (
  processes: readonly AffiliateCutoverProcessRecord[],
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const process of processes) {
    const identity = rollbackProcessIdentity(process);
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
};

const isRollbackProcessTopologyIntact = (
  session: AffiliateCutoverRollbackSession,
  processInventory: readonly AffiliateCutoverProcessRecord[],
): boolean => {
  if (processInventory.length !== session.processInventory.length) return false;
  const expected = rollbackProcessIdentityCounts(session.processInventory);
  const actual = rollbackProcessIdentityCounts(processInventory);
  if (expected.size !== actual.size) return false;
  for (const [identity, count] of expected.entries()) {
    if (actual.get(identity) !== count) return false;
  }
  return true;
};

const isRollbackLegacyServiceEvidenceIntact = (
  expectedIds: readonly string[] | null,
  legacyServiceUnits: readonly AffiliateCutoverLegacyServiceUnit[] | null,
): boolean => {
  if (!expectedIds || !legacyServiceUnits) return false;
  if (legacyServiceUnits.length !== expectedIds.length) return false;
  for (const id of expectedIds) {
    if (legacyServiceUnits.filter((unit) => unit.id === id).length !== 1) return false;
  }
  return true;
};

const isRollbackProcessStatusEvidenceIntact = (
  processInventory: readonly AffiliateCutoverProcessRecord[],
): boolean => processInventory.every((process) => (
  ['STOPPED', 'RUNNING'].includes(upper(process.status))
));

const isRollbackControlPlaneEvidenceIntact = (
  controlPlaneProcesses: readonly Readonly<{ id: string; status: string }>[],
): boolean => {
  const expectedIds = AFFILIATE_GOVERNED_CONTROL_PLANE_IDS;
  if (!Array.isArray(controlPlaneProcesses)) return false;
  if (controlPlaneProcesses.length !== expectedIds.length) return false;
  for (const id of expectedIds) {
    if (controlPlaneProcesses.filter((process) => process.id === id).length !== 1) return false;
  }
  return controlPlaneProcesses.every((process) => (
    ['STOPPED', 'RUNNING'].includes(upper(process.status))
  ));
};

const runtimeLegacyServiceUnitsForResult = (
  parsed: AffiliateCutoverLegacyServiceUnit[] | null,
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
): readonly AffiliateCutoverLegacyServiceUnit[] | undefined => (
  parsed ?? (runtimeEvidence ? runtimeEvidence.legacyServiceUnits : undefined)
);

const runtimeProcessInventory = (
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
): AffiliateCutoverProcessRecord[] | null => (
  runtimeEvidence ? readRollbackProcessInventory(runtimeEvidence.processInventory) : null
);

const runtimeControlPlaneProcesses = (
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
): readonly Readonly<{ id: string; status: string }>[] => (
  runtimeEvidence?.controlPlaneProcesses ?? []
);

const runtimeLegacyServiceEvidence = (
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
): unknown => (runtimeEvidence ? runtimeEvidence.legacyServiceUnits : undefined);

const validateAffiliateCutoverRuntimeProcessEvidence = (
  session: AffiliateCutoverRollbackSession,
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
  now: Date,
): Readonly<{
  processInventory: readonly AffiliateCutoverProcessRecord[];
  controlPlaneProcesses: readonly Readonly<{
    id: string;
    status: string;
  }>[];
  legacyServiceUnits?: readonly AffiliateCutoverLegacyServiceUnit[];
  invalidReasons: readonly string[];
}> => {
  const invalidReasons: string[] = [];
  if (!isRollbackRuntimeArtifactIdIntact(session, runtimeEvidence)) {
    invalidReasons.push('current process evidence needs a distinct non-empty artifact identity');
  }
  if (!isRollbackRuntimeEvidenceFresh(session, runtimeEvidence, now)) {
    invalidReasons.push('current process evidence is missing or stale');
  }
  const processInventory = runtimeProcessInventory(runtimeEvidence);
  const controlPlaneProcesses = runtimeControlPlaneProcesses(runtimeEvidence);
  if (!processInventory) {
    invalidReasons.push('current process evidence does not contain a complete process inventory');
    return {
      processInventory: session.processInventory,
      controlPlaneProcesses,
      invalidReasons,
      legacyServiceUnits: runtimeLegacyServiceUnitsForResult(null, runtimeEvidence),
    };
  }
  if (!isRollbackProcessTopologyIntact(session, processInventory)) {
    invalidReasons.push('current process evidence does not match the recorded process topology');
  }
  const expectedLegacyServiceIds = legacyServiceUnitIdsForSession(session);
  const legacyServiceUnits = readRollbackLegacyServiceUnits(runtimeLegacyServiceEvidence(runtimeEvidence));
  if (!isRollbackLegacyServiceEvidenceIntact(expectedLegacyServiceIds, legacyServiceUnits)) {
    invalidReasons.push('current process evidence does not prove every reviewed legacy service and timer is disabled and inactive');
  }
  if (!isRollbackProcessStatusEvidenceIntact(processInventory)) {
    invalidReasons.push('current process evidence contains an unobserved process status');
  }
  if (!isRollbackControlPlaneEvidenceIntact(controlPlaneProcesses)) {
    invalidReasons.push('current process evidence does not contain complete gateway, runner, and replenishment controller status');
  }
  return {
    processInventory,
    controlPlaneProcesses,
    legacyServiceUnits: runtimeLegacyServiceUnitsForResult(legacyServiceUnits, runtimeEvidence),
    invalidReasons,
  };
};


export type AffiliateCutoverRollbackEvidenceQuery = Readonly<{
  evidence: AffiliateCutoverRollbackEvidenceInput;
  isComplete: boolean;
  invalidReasons: readonly string[];
}>;

type AffiliateRollbackEvidenceRead = Readonly<{
  rows: readonly unknown[];
  isAvailable: boolean;
  error?: string;
}>;

const rollbackEvidenceDelegate = (
  databaseValue: Record<string, unknown>,
  rawClient: Record<string, unknown> | undefined,
  databaseKey: string,
  clientKey: string,
): unknown => firstRollbackValue(
  databaseValue[databaseKey],
  databaseKey === 'gatewayReceipts' ? databaseValue.receipts : undefined,
  rollbackOptionalField(rawClient, clientKey),
);

const isRollbackEvidenceFindManyDelegate = (
  value: unknown,
): value is { findMany: (args: unknown) => Promise<unknown> } => (
  Boolean(value)
  && typeof value === 'object'
  && typeof (value as { findMany?: unknown }).findMany === 'function'
);

const rollbackEvidenceReadResult = (
  databaseKey: string,
  rows: unknown,
): AffiliateRollbackEvidenceRead => {
  if (Array.isArray(rows)) {
    return { rows, isAvailable: true };
  }
  return {
    rows: [],
    isAvailable: false,
    error: `${databaseKey} evidence query returned a non-array`,
  };
};

const rollbackEvidenceReadError = (
  databaseKey: string,
  error: unknown,
): AffiliateRollbackEvidenceRead => ({
  rows: [],
  isAvailable: false,
  error: `${databaseKey} evidence query failed: ${error instanceof Error ? error.message : String(error)}`,
});

const readAffiliateRollbackEvidenceRows = async (
  databaseValue: Record<string, unknown>,
  rawClient: Record<string, unknown> | undefined,
  databaseKey: string,
  clientKey: string,
  args: Record<string, unknown>,
): Promise<AffiliateRollbackEvidenceRead> => {
  const delegate = rollbackEvidenceDelegate(databaseValue, rawClient, databaseKey, clientKey);
  if (!isRollbackEvidenceFindManyDelegate(delegate)) {
    return { rows: [], isAvailable: false, error: `${databaseKey} evidence delegate is unavailable` };
  }
  try {
    return rollbackEvidenceReadResult(databaseKey, await delegate.findMany(args));
  } catch (error) {
    return rollbackEvidenceReadError(databaseKey, error);
  }
};

export const readAffiliateCutoverRollbackEvidence = async (
  database: AffiliateSupplyDatabase,
  session: AffiliateCutoverRollbackSession,
  runtimeEvidence: AffiliateCutoverRuntimeProcessEvidence | undefined,
  now: Date,
): Promise<AffiliateCutoverRollbackEvidenceQuery> => {
  const runtimeProcessEvidence = validateAffiliateCutoverRuntimeProcessEvidence(
    session,
    runtimeEvidence,
    now,
  );
  const boundary = new Date(session.recordedStartAt);
  const databaseValue = database as unknown as Record<string, unknown>;
  const rawClient = databaseValue.rawClient as Record<string, unknown> | undefined;
  const [
    receipts,
    lifecycleTransitions,
    demands,
    waves,
    supplySources,
    supplyTargets,
    appliedReconciliationRuns,
    mappingJobs,
    approvalJobs,
    intakeRuns,
    discoveryRuns,
    coverageJobs,
    gatewayClaims,
    gatewayJobs,
  ] = await Promise.all([
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'gatewayReceipts', 'affiliateAgentGatewayOperationReceipts', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        jobId: true,
        claimId: true,
        operationKind: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'transitions', 'affiliateSupplyLifecycleTransitions', {
      where: { occurredAt: { gte: boundary } },
      select: { id: true, supplySourceId: true, sequence: true, command: true, actorId: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'demands', 'affiliateReplenishmentDemands', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: { id: true, status: true, generation: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'waves', 'affiliateReplenishmentWaves', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: { id: true, demandId: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'supplySources', 'affiliateSupplySources', {
      where: { updatedAt: { gte: boundary } },
      select: { id: true, rolloutCohort: true, liveSourceId: true, lifecycleGeneration: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'targets', 'affiliateSupplyTargets', {
      where: { updatedAt: { gte: boundary } },
      select: { id: true, supplySourceId: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'reconciliationRuns', 'affiliateSupplyReconciliationRuns', {
      where: {
        status: 'APPLIED',
        OR: [
          { createdAt: { gte: boundary } },
          { updatedAt: { gte: boundary } },
          { appliedAt: { gte: boundary } },
        ],
      },
      select: {
        id: true,
        mode: true,
        status: true,
        reportHash: true,
        appliedAt: true,
        appliedBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'mappingJobs', 'affiliateSourceMappingJobs', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        intakeId: true,
        supplySourceId: true,
        sourceId: true,
        mappingId: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        workerId: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'approvals', 'affiliateApprovalJobs', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        subjectType: true,
        supplySourceId: true,
        subjectKey: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        reviewerId: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'intakeRuns', 'affiliateSourceIntakeRuns', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        intakeId: true,
        supplySourceId: true,
        status: true,
        claimedAt: true,
        workerId: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'discoveryRuns', 'affiliateSourceDiscoveryRuns', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        campaignId: true,
        status: true,
        claimedAt: true,
        workerId: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'coverageJobs', 'affiliateCoverageAgentJobs', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        subjectType: true,
        subjectKey: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        workerId: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'gatewayClaims', 'affiliateAgentGatewayClaims', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        jobId: true,
        supplySourceId: true,
        status: true,
        claimGeneration: true,
        workerId: true,
        leaseExpiresAt: true,
        tokenExpiresAt: true,
        endedAt: true,
        tokenInvalidatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
    readAffiliateRollbackEvidenceRows(databaseValue, rawClient, 'gatewayJobs', 'affiliateAgentGatewayJobs', {
      where: { OR: [{ createdAt: { gte: boundary } }, { updatedAt: { gte: boundary } }] },
      select: {
        id: true,
        supplySourceId: true,
        status: true,
        activeClaimId: true,
        claimGeneration: true,
        finishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    }),
  ]);
  const reads = [
    receipts,
    lifecycleTransitions,
    demands,
    waves,
    supplySources,
    supplyTargets,
    appliedReconciliationRuns,
    mappingJobs,
    approvalJobs,
    intakeRuns,
    discoveryRuns,
    coverageJobs,
    gatewayClaims,
    gatewayJobs,
  ];
  return {
    evidence: {
      reviewedLegacyProcessManifest: session.reviewedLegacyProcessManifest,
      reviewedProcessInventory: session.processInventory,
      processInventory: runtimeProcessEvidence.processInventory,
      controlPlaneProcesses: runtimeProcessEvidence.controlPlaneProcesses,
      legacyServiceUnits: runtimeProcessEvidence.legacyServiceUnits,
      governedReceipts: receipts.rows,
      runtimeProcessEvidence: runtimeEvidence
        ? {
          artifactId: runtimeEvidence.artifactId,
          capturedAt: runtimeEvidence.capturedAt,
        }
        : undefined,
      governedLifecycleTransitions: lifecycleTransitions.rows,
      governedDemandOrWaveEvents: [...demands.rows, ...waves.rows],
      governedAuthoritativeWrites: [
        ...supplySources.rows,
        ...supplyTargets.rows,
        ...appliedReconciliationRuns.rows,
        ...mappingJobs.rows,
        ...approvalJobs.rows,
        ...intakeRuns.rows,
        ...discoveryRuns.rows,
        ...coverageJobs.rows,
        ...gatewayClaims.rows,
        ...gatewayJobs.rows,
      ],
    },
    isComplete: runtimeProcessEvidence.invalidReasons.length === 0
      && reads.every((read) => read.isAvailable),
    invalidReasons: [
      ...runtimeProcessEvidence.invalidReasons,
      ...reads.flatMap((read) => read.error ? [read.error] : []),
    ],
  };
};

const forwardOnlyRollbackDecision = (detail: string): AffiliateCutoverRollbackDecision => ({
  mode: 'FORWARD_ONLY',
  reasonCode: 'FORWARD_ONLY_BOUNDARY_REACHED',
  detail,
  resolution: 'Pause new admission. Repair through governed lifecycle and reconciliation commands.',
});

const rollbackImmutableReport = (value: unknown): unknown => {
  const normalized = normalizeAffiliateLifecycleJson(value);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    return normalized;
  }
  const { evaluatedAt: _evaluatedAt, ...immutable } = normalized as Record<string, unknown>;
  return immutable;
};

const persistAffiliateCutoverRollbackDecisionRecord = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  session: AffiliateCutoverRollbackSession;
  operatorId: string;
  evidence: AffiliateCutoverRollbackEvidenceInput;
  decision: AffiliateCutoverRollbackDecision;
  evidenceComplete: boolean;
  now: Date;
}>): Promise<Readonly<{
  inputHash: string;
  outputHash: string;
  reportHash: string;
  sessionId: string;
}>> => {
  const delegate = input.database.reconciliationRuns as unknown as {
    findUnique?: (args: unknown) => Promise<unknown>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
  if (typeof delegate?.upsert !== 'function') {
    throw new Error('Affiliate cutover rollback persistence is not available.');
  }
  const normalizedEvidence = normalizeAffiliateCutoverRollbackEvidence(input.evidence);
  const evidenceHash = hashAffiliateAgentValue(normalizedEvidence);
  const inputHash = hashAffiliateAgentValue({
    schemaVersion: 1,
    kind: 'AFFILIATE_CUTOVER_ROLLBACK_DRILL',
    sessionId: input.session.sessionId,
    operatorId: input.operatorId.trim(),
    recordedStartAt: input.session.recordedStartAt,
    reviewedLegacyProcessManifestHash: input.session.reviewedLegacyProcessManifestHash,
    preflightReportHash: input.session.preflightReportHash,
    deploymentContractVersion: input.session.deploymentContractVersion,
    deploymentContractHash: input.session.deploymentContractHash,
    evidenceHash,
    evidenceComplete: input.evidenceComplete,
    evidence: normalizedEvidence,
  });
  const outputHash = hashAffiliateAgentValue(input.decision);
  const reportHash = hashAffiliateAgentValue({
    kind: 'AFFILIATE_CUTOVER_ROLLBACK_DRILL',
    sessionId: input.session.sessionId,
    operatorId: input.operatorId.trim(),
    inputHash,
    evidenceHash,
    outputHash,
  });
  const reportJson = normalizeAffiliateLifecycleJson({
    schemaVersion: 1,
    kind: 'AFFILIATE_CUTOVER_ROLLBACK_DRILL',
    evaluatedAt: input.now.toISOString(),
    sessionId: input.session.sessionId,
    rolloutCohort: input.session.rolloutCohort,
    recordedStartAt: input.session.recordedStartAt,
    reviewedLegacyProcessManifestHash: input.session.reviewedLegacyProcessManifestHash,
    reviewedLegacyProcessManifestArtifactId: input.session.reviewedLegacyProcessManifestArtifactId,
    preflightReportHash: input.session.preflightReportHash,
    deploymentContractVersion: input.session.deploymentContractVersion,
    deploymentContractHash: input.session.deploymentContractHash,
    operatorId: input.operatorId,
    inputHash,
    outputHash,
    reportHash,
    evidenceHash,
    evidenceComplete: input.evidenceComplete,
    decision: input.decision,
    session: rollbackSessionPreimage(input.session),
    evidence: normalizedEvidence,
  });
  if (typeof delegate.findUnique === 'function') {
    const existing = affiliateLegacyJsonObject(await delegate.findUnique({
      where: { reportHash },
    }));
    if (existing.reportJson !== undefined) {
      if (
        hashAffiliateAgentValue(rollbackImmutableReport(existing.reportJson))
        !== hashAffiliateAgentValue(rollbackImmutableReport(reportJson))
      ) {
        throw new Error('Affiliate cutover rollback report hash already contains different immutable evidence.');
      }
      return {
        inputHash,
        outputHash,
        reportHash,
        sessionId: input.session.sessionId,
      };
    }
  }
  const counts = {
    processInventory: input.evidence.processInventory.length,
    governedReceipts: input.evidence.governedReceipts.length,
    governedLifecycleTransitions: input.evidence.governedLifecycleTransitions.length,
    governedDemandOrWaveEvents: input.evidence.governedDemandOrWaveEvents.length,
    governedAuthoritativeWrites: input.evidence.governedAuthoritativeWrites.length,
  };
  await delegate.upsert({
    where: { reportHash },
    create: {
      id: createId(),
      mode: 'ROLLBACK_DRILL',
      status: input.decision.mode,
      operatorId: input.operatorId,
      rolloutCohort: input.session.rolloutCohort,
      supplyContractVersion: input.session.preflightReport.supplyContractVersion,
      supplyContractHash: input.session.preflightReport.supplyContractHash,
      deploymentContractVersion: input.session.deploymentContractVersion,
      deploymentContractHash: input.session.deploymentContractHash,
      inputHash,
      outputHash,
      reportHash,
      counts: prismaJsonValue(counts),
      reportJson: prismaJsonValue(reportJson),
      appliedAt: null,
      appliedBy: null,
      applyNonceHash: null,
    },
    update: {},
  });
  return {
    inputHash,
    outputHash,
    reportHash,
    sessionId: input.session.sessionId,
  };
};

const emptyRollbackEvidenceQuery = (
  session: AffiliateCutoverRollbackSession,
  invalidReasons: readonly string[],
): AffiliateCutoverRollbackEvidenceQuery => ({
  evidence: {
    reviewedLegacyProcessManifest: session.reviewedLegacyProcessManifest,
    reviewedProcessInventory: session.processInventory,
    processInventory: session.processInventory,
    governedReceipts: [],
    governedLifecycleTransitions: [],
    governedDemandOrWaveEvents: [],
    governedAuthoritativeWrites: [],
  },
  isComplete: false,
  invalidReasons,
});

const readRollbackDecisionEvidence = async (
  database: AffiliateSupplyDatabase,
  resolution: AffiliateCutoverRollbackSessionResolution,
  runtimeProcessEvidence: AffiliateCutoverRuntimeProcessEvidence,
  now: Date,
): Promise<AffiliateCutoverRollbackEvidenceQuery> => {
  if (!resolution.isValid) {
    return emptyRollbackEvidenceQuery(resolution.session, resolution.invalidReasons);
  }
  return readAffiliateCutoverRollbackEvidence(
    database,
    resolution.session,
    runtimeProcessEvidence,
    now,
  );
};

type RollbackDecisionCallerChecks = Readonly<{
  boundaryMatches: boolean;
  cohortMatches: boolean;
  evidenceMatches: boolean;
}>;

const rollbackDecisionCallerChecks = (
  input: Readonly<{
    since?: Date;
    rolloutCohort?: string;
    evidence?: AffiliateCutoverRollbackEvidenceInput;
  }>,
  session: AffiliateCutoverRollbackSession,
  evidenceQuery: AffiliateCutoverRollbackEvidenceQuery,
): RollbackDecisionCallerChecks => ({
  boundaryMatches: input.since === undefined || input.since.toISOString() === session.recordedStartAt,
  cohortMatches: input.rolloutCohort === undefined
    || input.rolloutCohort.trim() === session.rolloutCohort,
  evidenceMatches: input.evidence === undefined
    || hashAffiliateAgentValue(normalizeAffiliateCutoverRollbackEvidence(input.evidence))
      === hashAffiliateAgentValue(normalizeAffiliateCutoverRollbackEvidence(evidenceQuery.evidence)),
});

const isRollbackDecisionPreconditionsValid = (
  resolution: AffiliateCutoverRollbackSessionResolution,
  evidenceQuery: AffiliateCutoverRollbackEvidenceQuery,
  checks: RollbackDecisionCallerChecks,
): boolean => (
  resolution.isValid
  && evidenceQuery.isComplete
  && checks.boundaryMatches
  && checks.cohortMatches
  && checks.evidenceMatches
);

const emptyRollbackDecisionInput = (): AffiliateCutoverRollbackInput => ({
  isLegacyFleetStopped: false,
  isGovernedFleetStarted: false,
  isGovernedFleetStopped: false,
  hasGovernedReceipt: false,
  hasGovernedLifecycleTransition: false,
  hasGovernedDemandOrWaveEvent: false,
  hasGovernedAuthoritativeWrite: false,
});

const rollbackDecisionInput = (
  isValid: boolean,
  evidence: AffiliateCutoverRollbackEvidenceInput,
): AffiliateCutoverRollbackInput => (
  isValid ? buildAffiliateCutoverRollbackInput(evidence) : emptyRollbackDecisionInput()
);

const rollbackDecisionFailureDetail = (
  resolution: AffiliateCutoverRollbackSessionResolution,
  evidenceQuery: AffiliateCutoverRollbackEvidenceQuery,
  checks: RollbackDecisionCallerChecks,
): string => [
  ...resolution.invalidReasons,
  ...evidenceQuery.invalidReasons,
  ...(!checks.boundaryMatches ? ['caller-supplied boundary does not match the recorded session'] : []),
  ...(!checks.cohortMatches ? ['caller-supplied cohort does not match the recorded session'] : []),
  ...(!checks.evidenceMatches ? ['caller-supplied evidence does not match persisted governed evidence'] : []),
].join('; ') || 'The cutover session evidence is incomplete or mismatched.';

const rollbackDecisionForEvidence = (
  isValid: boolean,
  decisionInput: AffiliateCutoverRollbackInput,
  failureDetail: string,
): AffiliateCutoverRollbackDecision => (
  isValid ? decideAffiliateCutoverRollback(decisionInput) : forwardOnlyRollbackDecision(failureDetail)
);

const assertRollbackDecisionMatches = (
  requested: AffiliateCutoverRollbackDecision | undefined,
  decision: AffiliateCutoverRollbackDecision,
): void => {
  if (!requested) return;
  if (hashAffiliateAgentValue(requested) !== hashAffiliateAgentValue(decision)) {
    throw new Error('The requested rollback decision does not match the durable session evidence.');
  }
};

const persistRollbackDecisionIfNeeded = async (
  input: Readonly<{
    database: AffiliateSupplyDatabase;
    isDryRun?: boolean;
    session: AffiliateCutoverRollbackSession;
    operatorId: string;
    evidence: AffiliateCutoverRollbackEvidenceInput;
    decision: AffiliateCutoverRollbackDecision;
    evidenceComplete: boolean;
    now: Date;
  }>,
): Promise<Readonly<{
  inputHash: string;
  outputHash: string;
  reportHash: string;
  sessionId: string;
}> | null> => {
  if (input.isDryRun) return null;
  return persistAffiliateCutoverRollbackDecisionRecord(input);
};

export const persistAffiliateCutoverRollbackDecision = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  sessionId: string;
  operatorId: string;
  clock?: () => Date;
  isDryRun?: boolean;
  decision?: AffiliateCutoverRollbackDecision;
  evidence?: AffiliateCutoverRollbackEvidenceInput;
  runtimeProcessEvidence: AffiliateCutoverRuntimeProcessEvidence;
  since?: Date;
  rolloutCohort?: string;
}>): Promise<Readonly<{
  sessionId: string;
  rolloutCohort: string;
  recordedStartAt: string;
  input: AffiliateCutoverRollbackInput;
  evidence: AffiliateCutoverRollbackEvidenceInput;
  decision: AffiliateCutoverRollbackDecision;
  record: Readonly<{
    inputHash: string;
    outputHash: string;
    reportHash: string;
    sessionId: string;
  }> | null;
}>> => {
  const now = input.clock?.() ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Affiliate rollback decision requires a valid trusted clock.');
  const operatorId = input.operatorId.trim();
  if (!operatorId) throw new Error('Affiliate rollback decision requires an operator ID.');
  const delegate = input.database.reconciliationRuns as unknown as {
    findUnique?: (args: unknown) => Promise<unknown>;
  };
  if (typeof delegate?.findUnique !== 'function') {
    throw new Error('Affiliate cutover session persistence is not available.');
  }
  const row = affiliateLegacyJsonObject(await delegate.findUnique({
    where: { id: input.sessionId.trim() },
  }));
  if (!row.id) {
    throw new Error(`Affiliate cutover rollback session "${input.sessionId}" was not found.`);
  }
  const rawResolution = resolveRollbackSessionPayload(row);
  const session = rawResolution.session;
  const evidenceQuery = await readRollbackDecisionEvidence(
    input.database,
    rawResolution,
    input.runtimeProcessEvidence,
    now,
  );
  const callerChecks = rollbackDecisionCallerChecks(input, session, evidenceQuery);
  const decisionIsValid = isRollbackDecisionPreconditionsValid(
    rawResolution,
    evidenceQuery,
    callerChecks,
  );
  const inputForDecision = rollbackDecisionInput(decisionIsValid, evidenceQuery.evidence);
  const decision = rollbackDecisionForEvidence(
    decisionIsValid,
    inputForDecision,
    rollbackDecisionFailureDetail(rawResolution, evidenceQuery, callerChecks),
  );
  assertRollbackDecisionMatches(input.decision, decision);
  const record = await persistRollbackDecisionIfNeeded({
    database: input.database,
    isDryRun: input.isDryRun,
    session,
    operatorId,
    evidence: evidenceQuery.evidence,
    decision,
    evidenceComplete: decisionIsValid,
    now,
  });
  return {
    sessionId: session.sessionId,
    rolloutCohort: session.rolloutCohort,
    recordedStartAt: session.recordedStartAt,
    input: inputForDecision,
    evidence: evidenceQuery.evidence,
    decision,
    record,
  };
};
export const decideAffiliateCutoverRollbackForSession = persistAffiliateCutoverRollbackDecision;

type AffiliateLegacyAppliedReconciliationRun = Readonly<{
  report: AffiliateLegacyReconciliationReport;
  operatorId: string | null;
  appliedBy: string | null;
  rolloutCohort: string | null;
  supplyContractVersion: number | null;
  supplyContractHash: string | null;
  deploymentContractVersion: number | null;
  deploymentContractHash: string | null;
  applyNonceHash: string | null;
  cutoverSessionId: string | null;
  cutoverSessionHash: string | null;
}>;

const isAffiliateSha256Hash = (value: unknown): value is string => (
  typeof value === 'string' && ROLLBACK_HASH_PATTERN.test(value)
);

const isAffiliateStringArray = (value: unknown): value is string[] => (
  Array.isArray(value)
  && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
);
const isAffiliateStringArrayAllowEmpty = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')
);

const isAffiliateReconciliationFinding = (value: unknown): boolean => {
  const finding = recordValue(value);
  return typeof finding.code === 'string'
    && (finding.severity === 'BLOCKING' || finding.severity === 'WARNING')
    && typeof finding.detail === 'string'
    && isAffiliateStringArray(finding.recordIds)
    && typeof finding.resolution === 'string';
};

const isAffiliateReconciliationCounts = (value: unknown): boolean => {
  const counts = recordValue(value);
  const countKeys = [
    'sources',
    'roots',
    'rootsToCreate',
    'rootsToReuse',
    'successorsToCreate',
    'lineageRecords',
    'linkedRecords',
    'unresolvedRecords',
    'targets',
    'preservedPublicTargets',
    'lastKnownGoodTargets',
    'rejectedTargets',
    'claims',
    'activeClaims',
    'expiredClaims',
    'terminalClaims',
    'claimsToRevoke',
    'blockingFindings',
    'warningFindings',
  ];
  const recordsByKind = counts.recordsByKind;
  return countKeys.every((key) => (
    typeof counts[key] === 'number'
    && Number.isInteger(counts[key])
    && (counts[key] as number) >= 0
  )) && Boolean(
    recordsByKind
    && typeof recordsByKind === 'object'
    && !Array.isArray(recordsByKind),
  );
};

const isAffiliateReconciliationRootTarget = (value: unknown): boolean => {
  const target = recordValue(value);
  if (typeof target.sourceTargetId !== 'string') return false;
  if (typeof target.candidateId !== 'string' && target.candidateId !== null) return false;
  if (typeof target.targetType !== 'string') return false;
  if (typeof target.targetId !== 'string') return false;
  if (!['PUBLISHED', 'LAST_KNOWN_GOOD', 'REJECTED'].includes(String(target.status))) return false;
  if (!['PRESERVE_PUBLIC_TARGET', 'MARK_LAST_KNOWN_GOOD', 'PRESERVE_REJECTED_TARGET'].includes(String(target.action))) {
    return false;
  }
  return isAffiliateStringArray(target.evidenceRefs);
};

const isAffiliateReconciliationRoot = (value: unknown): boolean => {
  const root = recordValue(value);
  if (!isAffiliateStringArray(root.sourceIds)) return false;
  if (!isAffiliateStringArray(root.recordIds)) return false;
  if (!isAffiliateStringArray(root.evidenceRefs)) return false;
  if (!Array.isArray(root.targetProjections)) return false;
  return root.targetProjections.every(isAffiliateReconciliationRootTarget);
};

const isAffiliateReconciliationClaim = (value: unknown): boolean => {
  const claim = recordValue(value);
  if (typeof claim.id !== 'string') return false;
  if (typeof claim.kind !== 'string') return false;
  if (!['ACTIVE', 'EXPIRED', 'TERMINAL'].includes(String(claim.status))) return false;
  if (!['BLOCK_APPLY', 'REVOKE_EXPIRED', 'NO_ACTION'].includes(String(claim.action))) return false;
  if (typeof claim.sourceId !== 'string' && claim.sourceId !== null) return false;
  if (typeof claim.supplySourceId !== 'string' && claim.supplySourceId !== null) return false;
  return isAffiliateStringArray(claim.evidenceRefs);
};

const isAffiliateReconciliationEvidenceCollections = (
  report: Record<string, unknown>,
): report is Record<string, unknown> & {
  roots: unknown[];
  claimActions: unknown[];
  blockingFindings: unknown[];
  warnings: unknown[];
  resolutions: unknown[];
} => {
  if (!Array.isArray(report.roots)) return false;
  if (!Array.isArray(report.claimActions)) return false;
  if (!Array.isArray(report.blockingFindings)) return false;
  if (!Array.isArray(report.warnings)) return false;
  if (!Array.isArray(report.resolutions)) return false;
  if (!isAffiliateReconciliationCounts(report.counts)) return false;
  if (!report.blockingFindings.every(isAffiliateReconciliationFinding)) return false;
  if (!report.warnings.every(isAffiliateReconciliationFinding)) return false;
  if (!report.resolutions.every(isAffiliateReconciliationFinding)) return false;
  return true;
};

const isAffiliateReconciliationEvidence = (report: Record<string, unknown>): boolean => {
  if (!isAffiliateReconciliationEvidenceCollections(report)) return false;
  if (report.isApplySafe !== (report.blockingFindings.length === 0)) return false;
  if (!report.roots.every(isAffiliateReconciliationRoot)) return false;
  return report.claimActions.every(isAffiliateReconciliationClaim);
};

const affiliateLegacyReportOutputPreimage = (
  report: Record<string, unknown>,
): Record<string, unknown> => ({
  schemaVersion: report.schemaVersion,
  legacySnapshotHash: report.legacySnapshotHash,
  supplyContractVersion: report.supplyContractVersion,
  supplyContractHash: report.supplyContractHash,
  roots: report.roots,
  claimActions: report.claimActions,
  counts: report.counts,
  blockingFindings: report.blockingFindings,
  warnings: report.warnings,
});

const affiliateLegacyReportResolutionSortKey = (value: unknown): string => {
  const finding = recordValue(value);
  return JSON.stringify({
    code: finding.code,
    severity: finding.severity,
    detail: finding.detail,
    recordIds: finding.recordIds,
    resolution: finding.resolution,
  });
};

const isAffiliateInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value)
);

const isAffiliateLegacyPostApplySnapshotHashIntact = (
  value: unknown,
): boolean => value === undefined || isAffiliateSha256Hash(value);

const isAffiliateLegacyReportEvaluationTimestampIntact = (
  value: unknown,
): boolean => typeof value === 'string' && !Number.isNaN(Date.parse(value));

const isAffiliateLegacyReportHashFieldsIntact = (
  report: Record<string, unknown>,
  expectedReportHash: string,
): boolean => {
  if (report.schemaVersion !== 1) return false;
  if (!isAffiliateInteger(report.supplyContractVersion)) return false;
  if (report.reportHash !== expectedReportHash) return false;
  return [
    isAffiliateSha256Hash(report.legacySnapshotHash),
    isAffiliateLegacyPostApplySnapshotHashIntact(report.postApplyLegacySnapshotHash),
    isAffiliateSha256Hash(report.supplyContractHash),
    isAffiliateSha256Hash(report.inputHash),
    isAffiliateSha256Hash(report.outputHash),
    isAffiliateSha256Hash(report.reportHash),
    isAffiliateLegacyReportEvaluationTimestampIntact(report.evaluatedAt),
  ].every(Boolean);
};

const isAffiliateLegacyReportOutputIntact = (
  report: Record<string, unknown>,
  outputPreimage: Record<string, unknown>,
): boolean => {
  if (report.outputHash !== hashAffiliateAgentValue(outputPreimage)) return false;
  const expectedResolutions = [
    ...(report.blockingFindings as unknown[]),
    ...(report.warnings as unknown[]),
  ].sort((left, right) => compareAffiliateLegacySnapshotStrings(
    affiliateLegacyReportResolutionSortKey(left),
    affiliateLegacyReportResolutionSortKey(right),
  ));
  return hashAffiliateAgentValue(report.resolutions)
    === hashAffiliateAgentValue(expectedResolutions);
};

const isAffiliateLegacyReportFinalHashIntact = (
  report: Record<string, unknown>,
  outputPreimage: Record<string, unknown>,
): boolean => hashAffiliateAgentValue({
  ...outputPreimage,
  inputHash: report.inputHash,
  outputHash: report.outputHash,
  resolutions: report.resolutions,
}) === report.reportHash;

const affiliateLegacyReportHashesAreIntact = (
  report: Record<string, unknown>,
  expectedReportHash: string,
): boolean => {
  if (!isAffiliateLegacyReportHashFieldsIntact(report, expectedReportHash)) return false;
  if (!isAffiliateReconciliationEvidence(report)) return false;
  const outputPreimage = affiliateLegacyReportOutputPreimage(report);
  if (!isAffiliateLegacyReportOutputIntact(report, outputPreimage)) return false;
  return isAffiliateLegacyReportFinalHashIntact(report, outputPreimage);
};

const isAffiliateAppliedStatus = (value: unknown): boolean => (
  String(value ?? '').toUpperCase() === 'APPLIED'
);

const isAffiliateAppliedReportSessionBindingIntact = (
  report: Record<string, unknown>,
  reportHash: string,
): boolean => {
  const sessionId = stringValue(report.cutoverSessionId);
  const sessionHash = stringValue(report.cutoverSessionHash);
  if (!affiliateLegacyReportHashesAreIntact(report, reportHash)) return false;
  if (!isAffiliateSha256Hash(sessionHash)) return false;
  if (!sessionId) return false;
  return true;
};

const affiliateAppliedReportFailedInvariantCodes = (
  report: Record<string, unknown>,
): string[] => (
  Array.isArray(report.blockingFindings)
    ? report.blockingFindings
      .map((finding) => stringValue(recordValue(finding).code))
      .filter((code): code is string => Boolean(code))
    : []
);

const affiliateAppliedReportResolutionRefs = (
  report: Record<string, unknown>,
): string[] => (
  Array.isArray(report.resolutions)
    ? report.resolutions.map((finding) => {
      const value = recordValue(finding);
      return `${stringValue(value.code) ?? ''}:${isAffiliateStringArray(value.recordIds)
        ? value.recordIds.join(',')
        : ''}`;
    })
    : []
);

const affiliateAppliedReportRowFieldsMatch = (
  row: Record<string, unknown>,
  report: Record<string, unknown>,
  expectedFailedInvariants: readonly string[],
  expectedResolutionRefs: readonly string[],
): boolean => [
  row.mode === 'APPLY',
  row.inputHash === report.inputHash,
  row.outputHash === report.outputHash,
  row.reportHash === report.reportHash,
  row.supplyContractVersion === report.supplyContractVersion,
  row.supplyContractHash === report.supplyContractHash,
  hashAffiliateAgentValue(row.counts) === hashAffiliateAgentValue(report.counts),
  hashAffiliateAgentValue(row.failedInvariants) === hashAffiliateAgentValue(expectedFailedInvariants),
  hashAffiliateAgentValue(row.resolutionRefs) === hashAffiliateAgentValue(expectedResolutionRefs),
].every(Boolean);

const isAffiliateAppliedReportRowIntact = (
  row: Record<string, unknown>,
  report: Record<string, unknown>,
): boolean => {
  if (
    !isAffiliateStringArrayAllowEmpty(row.failedInvariants)
    || !isAffiliateStringArrayAllowEmpty(row.resolutionRefs)
  ) {
    return false;
  }
  return affiliateAppliedReportRowFieldsMatch(
    row,
    report,
    affiliateAppliedReportFailedInvariantCodes(report),
    affiliateAppliedReportResolutionRefs(report),
  );
};

const readAppliedAffiliateLegacyReconciliationReport = async (
  database: AffiliateSupplyDatabase,
  reportHash: string,
): Promise<AffiliateLegacyAppliedReconciliationRun | null> => {
  const delegate = database.reconciliationRuns as unknown as {
    findUnique?: (args: unknown) => Promise<unknown>;
  };
  if (typeof delegate?.findUnique !== 'function') return null;
  const row = affiliateLegacyJsonObject(await delegate.findUnique({
    where: { reportHash },
  }));
  if (!isAffiliateAppliedStatus(row.status)) return null;
  const report = affiliateLegacyJsonObject(row.reportJson);
  const sessionId = stringValue(report.cutoverSessionId);
  const sessionHash = stringValue(report.cutoverSessionHash);
  if (!isAffiliateAppliedReportSessionBindingIntact(report, reportHash)) {
    throw new Error('The durable applied Affiliate reconciliation report is malformed or tampered.');
  }
  if (!isAffiliateAppliedReportRowIntact(row, report)) {
    throw new Error('The durable applied Affiliate reconciliation report is malformed or tampered.');
  }
  const sanitizedReport = { ...report };
  delete sanitizedReport.cutoverSessionId;
  delete sanitizedReport.cutoverSessionHash;
  return {
    report: sanitizedReport as unknown as AffiliateLegacyReconciliationReport,
    operatorId: stringValue(row.operatorId),
    appliedBy: stringValue(row.appliedBy),
    rolloutCohort: stringValue(row.rolloutCohort),
    supplyContractVersion: typeof row.supplyContractVersion === 'number'
      ? row.supplyContractVersion
      : null,
    supplyContractHash: stringValue(row.supplyContractHash),
    deploymentContractVersion: typeof row.deploymentContractVersion === 'number'
      ? row.deploymentContractVersion
      : null,
    deploymentContractHash: stringValue(row.deploymentContractHash),
    applyNonceHash: stringValue(row.applyNonceHash),
    cutoverSessionId: sessionId,
    cutoverSessionHash: sessionHash,
  };
};

const buildAffiliateLegacySupplyReconciliationResult = (input: Readonly<{
  mode: 'DRY_RUN' | 'APPLY';
  report: AffiliateLegacyReconciliationReport;
  records: readonly AffiliateLegacyLineageRecord[];
}>): AffiliateLegacySupplyReconciliationResult => {
  const rows: AffiliateLegacySupplyReconciliationRow[] = input.report.roots.flatMap((plan) => (
    plan.sourceIds.map((sourceId) => ({
      sourceId,
      identityKey: plan.identityKey ?? '',
      action: plan.action,
      publishedCandidateCount: input.records.filter((record) => (
        record.kind === 'CANDIDATE' && record.sourceId === sourceId
      )).length,
      preservedTargetCount: plan.targetProjections.length,
      unverifiableTargetCount: plan.targetProjections.filter((target) => (
        target.action === 'MARK_LAST_KNOWN_GOOD'
      )).length,
      targetProjections: plan.targetProjections.map((target) => ({ ...target })),
      evidenceRefs: plan.evidenceRefs,
    }))
  ));
  return {
    isDryRun: input.mode === 'DRY_RUN',
    mode: input.mode,
    isApplied: input.mode === 'APPLY',
    report: input.report,
    counts: input.report.counts,
    failedInvariants: input.report.blockingFindings.map((finding) => finding.code),
    resolutions: input.report.resolutions,
    rows,
    preservedTargetCount: input.report.counts.preservedPublicTargets,
    unverifiableTargetCount: input.report.counts.lastKnownGoodTargets,
    claimsToRevoke: input.report.counts.claimsToRevoke,
    inputHash: input.report.inputHash,
    outputHash: input.report.outputHash,
    reportHash: input.report.reportHash,
  };
};

const affiliateLegacyReplayTargetIdentity = (
  target: AffiliateLegacySupplyReconciliationRow['targetProjections'][number],
): Record<string, unknown> => ({
  sourceTargetId: target.sourceTargetId,
  candidateId: target.candidateId,
  targetType: target.targetType,
  targetId: target.targetId,
  sourceProfile: target.sourceProfile,
  marketKey: target.marketKey,
  sportId: target.sportId,
  publishedAt: target.publishedAt,
  lastSuccessfulRefreshAt: target.lastSuccessfulRefreshAt,
  freshnessExpiresAt: target.freshnessExpiresAt,
  rejectedAt: target.rejectedAt,
  rejectionReason: target.rejectionReason,
  evidenceHash: target.evidenceHash,
  metadataHash: hashAffiliateAgentValue(target.metadata ?? null),
  legacyStatus: target.legacyStatus ?? null,
  legacyEvidenceVerifiable: target.legacyEvidenceVerifiable ?? null,
  status: target.status,
  action: target.action,
  evidenceRefs: [...target.evidenceRefs].sort(codeUnitCompare),
});

const affiliateLegacyReplayRootIdentity = (
  root: AffiliateLegacySupplyReconciliationResult['report']['roots'][number],
): Record<string, unknown> => ({
  sourceIds: [...root.sourceIds].sort(codeUnitCompare),
  identityKey: root.identityKey,
  canonicalUrl: root.canonicalUrl,
  origin: root.origin,
  existingRootId: root.existingRootId,
  derivedStage: root.derivedStage,
  action: root.action,
  pathKey: root.pathKey,
  predecessorId: root.predecessorId,
  recordIds: [...root.recordIds]
    .filter((id) => !id.startsWith('canonical-public:') && !id.startsWith('candidate-public:'))
    .sort(codeUnitCompare),
  evidenceRefs: [...root.evidenceRefs].sort(codeUnitCompare),
  targetIdentities: root.targetProjections
    .map(affiliateLegacyReplayTargetIdentity)
    .sort((left, right) => codeUnitCompare(JSON.stringify(left), JSON.stringify(right))),
});

const affiliateLegacyReplayTargetStatusMatches = (
  appliedTarget: Record<string, unknown>,
  currentTarget: Record<string, unknown>,
): boolean => (
  appliedTarget.legacyStatus === currentTarget.legacyStatus
  || (
    appliedTarget.action === 'MARK_LAST_KNOWN_GOOD'
    && typeof appliedTarget.legacyStatus === 'string'
    && currentTarget.legacyStatus === 'LAST_KNOWN_GOOD'
  )
);

const affiliateLegacyReplayTargetIdentityMatches = (
  appliedTarget: Record<string, unknown>,
  currentTarget: Record<string, unknown>,
): boolean => {
  if (!affiliateLegacyReplayTargetStatusMatches(appliedTarget, currentTarget)) return false;
  const { legacyStatus: _appliedStatus, ...appliedStable } = appliedTarget;
  const { legacyStatus: _currentStatus, ...currentStable } = currentTarget;
  return JSON.stringify(appliedStable) === JSON.stringify(currentStable);
};

const affiliateLegacyReplayTargetIdentitiesMatch = (
  appliedTargets: readonly unknown[],
  currentTargets: readonly unknown[],
): boolean => {
  if (appliedTargets.length !== currentTargets.length) return false;
  const currentBySourceTargetId = new Map(
    currentTargets.map((target) => {
      const identity = target as Record<string, unknown>;
      return [String(identity.sourceTargetId), identity];
    }),
  );
  return appliedTargets.every((target) => {
    const appliedIdentity = target as Record<string, unknown>;
    const currentIdentity = currentBySourceTargetId.get(String(appliedIdentity.sourceTargetId));
    if (!currentIdentity) return false;
    return affiliateLegacyReplayTargetIdentityMatches(appliedIdentity, currentIdentity);
  });
};

const affiliateLegacyReplayRootActionMatches = (
  appliedAction: unknown,
  currentAction: unknown,
  currentRootId: unknown,
): boolean => appliedAction === currentAction
  || (
    (appliedAction === 'CREATE_ROOT' || appliedAction === 'CREATE_SUCCESSOR')
    && currentAction === 'REUSE_ROOT'
    && stringValue(currentRootId) !== null
  );

const affiliateLegacyReplayRootIdentityMatches = (
  appliedRoot: Record<string, unknown>,
  currentRoot: Record<string, unknown>,
): boolean => {
  const appliedAction = appliedRoot.action;
  const currentAction = currentRoot.action;
  if (!affiliateLegacyReplayRootActionMatches(
    appliedAction,
    currentAction,
    currentRoot.existingRootId,
  )) return false;
  if (
    appliedAction === currentAction
    && appliedRoot.existingRootId !== currentRoot.existingRootId
  ) return false;
  const {
    action: _appliedAction,
    existingRootId: _appliedRootId,
    targetIdentities: appliedTargets,
    ...appliedStable
  } = appliedRoot;
  const {
    action: _currentAction,
    existingRootId: _currentRootId,
    targetIdentities: currentTargets,
    ...currentStable
  } = currentRoot;
  return Array.isArray(appliedTargets)
    && Array.isArray(currentTargets)
    && JSON.stringify(appliedStable) === JSON.stringify(currentStable)
    && affiliateLegacyReplayTargetIdentitiesMatch(appliedTargets, currentTargets);
};

const affiliateLegacyReplayRootKey = (root: Record<string, unknown>): string => (
  JSON.stringify([root.identityKey, root.sourceIds])
);

const affiliateLegacyReplayRootsMatch = (
  appliedRoots: readonly unknown[],
  currentRoots: readonly unknown[],
): boolean => {
  if (appliedRoots.length !== currentRoots.length) return false;
  const currentByKey = new Map(
    currentRoots.map((root) => {
      const identity = root as Record<string, unknown>;
      return [affiliateLegacyReplayRootKey(identity), identity];
    }),
  );
  return appliedRoots.every((root) => {
    const appliedIdentity = root as Record<string, unknown>;
    const currentIdentity = currentByKey.get(affiliateLegacyReplayRootKey(appliedIdentity));
    if (!currentIdentity) return false;
    return affiliateLegacyReplayRootIdentityMatches(appliedIdentity, currentIdentity);
  });
};

const affiliateLegacyReplayCounts = (
  report: AffiliateLegacySupplyReconciliationResult['report'],
): unknown => ({
  sources: report.counts.sources,
  roots: report.counts.roots,
  unresolvedRecords: report.counts.unresolvedRecords,
  recordsByKind: Object.fromEntries(
    Object.entries(report.counts.recordsByKind)
      .filter(([kind]) => kind !== 'PUBLIC_TARGET'),
  ),
});

const affiliateLegacyReplayClaimDate = (value: unknown): string | null => (
  toDate(value)?.toISOString() ?? null
);

type AffiliateLegacyReplayClaimIdentity = Readonly<{
  kind: AffiliateLegacyClaimAction['kind'];
  id: string;
  sourceId: string | null;
  supplySourceId: string | null;
  status: AffiliateLegacyClaimAction['status'];
  action: AffiliateLegacyClaimAction['action'];
  rawStatus: string | null;
  subjectId: string | null;
  role: string | null;
  workerId: string | null;
  claimGeneration: number | null;
  leaseExpiresAt: string | null;
  tokenExpiresAt: string | null;
  endedAt: string | null;
  tokenInvalidatedAt: string | null;
  gatewayJobStatus: string | null;
  gatewayJobActiveClaimId: string | null;
  gatewayJobClaimGeneration: number | null;
  evidenceRefs: readonly string[];
}>;

const affiliateLegacyReplayClaimString = (value: string | null | undefined): string | null => (
  value?.trim() || null
);

const affiliateLegacyReplayClaimUpperString = (value: string | null | undefined): string | null => (
  value?.trim().toUpperCase() || null
);

const affiliateLegacyReplayClaimInteger = (value: unknown): number | null => (
  typeof value === 'number' && Number.isInteger(value) ? value : null
);

const affiliateLegacyReplayClaimIdentity = (
  claim: AffiliateLegacySupplyReconciliationResult['report']['claimActions'][number],
): AffiliateLegacyReplayClaimIdentity => ({
  kind: claim.kind,
  id: claim.id.trim(),
  sourceId: affiliateLegacyReplayClaimString(claim.sourceId),
  supplySourceId: affiliateLegacyReplayClaimString(claim.supplySourceId),
  status: claim.status,
  action: claim.action,
  rawStatus: affiliateLegacyReplayClaimUpperString(claim.rawStatus),
  subjectId: affiliateLegacyReplayClaimString(claim.subjectId),
  role: affiliateLegacyReplayClaimUpperString(claim.role),
  workerId: affiliateLegacyReplayClaimString(claim.workerId),
  claimGeneration: affiliateLegacyReplayClaimInteger(claim.claimGeneration),
  leaseExpiresAt: affiliateLegacyReplayClaimDate(claim.leaseExpiresAt),
  tokenExpiresAt: affiliateLegacyReplayClaimDate(claim.tokenExpiresAt),
  endedAt: affiliateLegacyReplayClaimDate(claim.endedAt),
  tokenInvalidatedAt: affiliateLegacyReplayClaimDate(claim.tokenInvalidatedAt),
  gatewayJobStatus: affiliateLegacyReplayClaimUpperString(claim.gatewayJobStatus),
  gatewayJobActiveClaimId: affiliateLegacyReplayClaimString(claim.gatewayJobActiveClaimId),
  gatewayJobClaimGeneration: affiliateLegacyReplayClaimInteger(claim.gatewayJobClaimGeneration),
  evidenceRefs: [...claim.evidenceRefs].sort(codeUnitCompare),
});
const affiliateLegacyReplayClaimRawState = (
  claim: AffiliateLegacyReplayClaimIdentity,
): unknown => ({
  rawStatus: claim.rawStatus,
  subjectId: claim.subjectId,
  role: claim.role,
  workerId: claim.workerId,
  claimGeneration: claim.claimGeneration,
  leaseExpiresAt: claim.leaseExpiresAt,
  tokenExpiresAt: claim.tokenExpiresAt,
  endedAt: claim.endedAt,
  tokenInvalidatedAt: claim.tokenInvalidatedAt,
  gatewayJobStatus: claim.gatewayJobStatus,
  gatewayJobActiveClaimId: claim.gatewayJobActiveClaimId,
  gatewayJobClaimGeneration: claim.gatewayJobClaimGeneration,
});

const affiliateLegacyReplayClaimRawStateMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => JSON.stringify(affiliateLegacyReplayClaimRawState(appliedClaim))
  === JSON.stringify(affiliateLegacyReplayClaimRawState(currentClaim));

const affiliateLegacyReplayClaimOwnershipMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => [
  currentClaim.subjectId === appliedClaim.subjectId,
  currentClaim.role === appliedClaim.role,
  currentClaim.claimGeneration === appliedClaim.claimGeneration,
  currentClaim.tokenExpiresAt === appliedClaim.tokenExpiresAt,
].every(Boolean);


const affiliateLegacyReplayQueueResetStateMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => [
  currentClaim.rawStatus === 'QUEUED',
  currentClaim.supplySourceId === appliedClaim.supplySourceId
    || (!appliedClaim.supplySourceId && Boolean(currentClaim.supplySourceId)),
  currentClaim.workerId === null,
  currentClaim.leaseExpiresAt === null,
  currentClaim.endedAt === appliedClaim.endedAt,
  currentClaim.tokenInvalidatedAt === appliedClaim.tokenInvalidatedAt,
  currentClaim.gatewayJobStatus === appliedClaim.gatewayJobStatus,
  currentClaim.gatewayJobActiveClaimId === appliedClaim.gatewayJobActiveClaimId,
  currentClaim.gatewayJobClaimGeneration === appliedClaim.gatewayJobClaimGeneration,
  affiliateLegacyReplayClaimOwnershipMatches(appliedClaim, currentClaim),
].every(Boolean);

const affiliateLegacyReplayGatewayResetStateMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => (
  currentClaim.rawStatus === 'REVOKED'
  && currentClaim.supplySourceId === appliedClaim.supplySourceId
  && currentClaim.leaseExpiresAt === appliedClaim.leaseExpiresAt
  && affiliateLegacyReplayClaimOwnershipMatches(appliedClaim, currentClaim)
  && currentClaim.endedAt !== null
  && currentClaim.tokenInvalidatedAt !== null
  && currentClaim.endedAt === currentClaim.tokenInvalidatedAt
  && currentClaim.gatewayJobStatus === 'QUEUED'
  && currentClaim.gatewayJobActiveClaimId === null
  && currentClaim.gatewayJobClaimGeneration === appliedClaim.gatewayJobClaimGeneration
);



type AffiliateLegacyReconciliationReplaySnapshot = Readonly<{
  counts: unknown;
  roots: readonly unknown[];
  claims: readonly AffiliateLegacyReplayClaimIdentity[];
}>;

const buildAffiliateLegacyReconciliationReplaySnapshot = (
  report: AffiliateLegacySupplyReconciliationResult['report'],
): AffiliateLegacyReconciliationReplaySnapshot => ({
  counts: affiliateLegacyReplayCounts(report),
  roots: report.roots
    .map(affiliateLegacyReplayRootIdentity)
    .sort((left, right) => codeUnitCompare(JSON.stringify(left), JSON.stringify(right))),
  claims: report.claimActions
    .map(affiliateLegacyReplayClaimIdentity)
    .sort((left, right) => codeUnitCompare(JSON.stringify(left), JSON.stringify(right))),
});
const affiliateLegacyReplayClaimMetadataMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => (
  appliedClaim.kind === currentClaim.kind
  && appliedClaim.id === currentClaim.id
  && appliedClaim.sourceId === currentClaim.sourceId
);

const isAffiliateApplyOwnedClaimEvidenceRef = (ref: string): boolean => (
  ref.startsWith('ended-at:')
  || ref.startsWith('token-invalidated:')
);

const affiliateLegacyReplayClaimEvidenceMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
  allowExpiredLeaseRemoval: boolean,
): boolean => {
  const appliedEvidenceRefs = appliedClaim.evidenceRefs;
  const expectedEvidenceRefs = appliedEvidenceRefs
    .filter((ref) => !allowExpiredLeaseRemoval || !ref.startsWith('lease-expires:'));
  const currentEvidenceRefs = [...currentClaim.evidenceRefs];
  const missingExpectedRef = expectedEvidenceRefs.some((ref) => !currentEvidenceRefs.includes(ref));
  if (missingExpectedRef) return false;
  const appliedLeaseRefs = appliedEvidenceRefs.filter((ref) => ref.startsWith('lease-expires:'));
  const expectedEvidenceSet = new Set(expectedEvidenceRefs);
  const currentExtraRefs = currentEvidenceRefs.filter((ref) => !expectedEvidenceSet.has(ref));
  return currentExtraRefs.every((ref) => (
    (allowExpiredLeaseRemoval && appliedLeaseRefs.includes(ref))
    || isAffiliateApplyOwnedClaimEvidenceRef(ref)
    || (
      !appliedClaim.supplySourceId
      && currentClaim.supplySourceId
      && ref === `supply-source:${currentClaim.supplySourceId}`
    )
  ));
};

const affiliateLegacyReplayClaimRoot = (
  report: AffiliateLegacySupplyReconciliationResult['report'],
  sourceId: string,
): AffiliateLegacySupplyReconciliationResult['report']['roots'][number] | undefined => (
  report.roots.find((root) => root.sourceIds.includes(sourceId))
);

const affiliateLegacyReplayClaimRootsMatch = (
  appliedReport: AffiliateLegacySupplyReconciliationResult['report'],
  currentReport: AffiliateLegacySupplyReconciliationResult['report'],
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => {
  const sourceId = appliedClaim.sourceId;
  if (!sourceId) return false;
  const appliedRoot = affiliateLegacyReplayClaimRoot(appliedReport, sourceId);
  const currentRoot = affiliateLegacyReplayClaimRoot(currentReport, sourceId);
  return Boolean(
    appliedRoot
    && currentRoot
    && currentRoot.existingRootId === currentClaim.supplySourceId
  );
};

const affiliateLegacyReplayClaimApplyStateMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => appliedClaim.kind === 'GATEWAY_CLAIM'
  ? affiliateLegacyReplayGatewayResetStateMatches(appliedClaim, currentClaim)
  : affiliateLegacyReplayQueueResetStateMatches(appliedClaim, currentClaim);

const affiliateLegacyReplayClaimTransitionMatches = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => {
  const transition = `${appliedClaim.status}:${appliedClaim.action}`
    + `>${currentClaim.status}:${currentClaim.action}`;
  if (transition === 'EXPIRED:REVOKE_EXPIRED>TERMINAL:NO_ACTION') {
    return affiliateLegacyReplayClaimApplyStateMatches(appliedClaim, currentClaim)
      && affiliateLegacyReplayClaimEvidenceMatches(
        appliedClaim,
        currentClaim,
        appliedClaim.kind !== 'GATEWAY_CLAIM',
      );
  }
  if (transition === 'TERMINAL:NO_ACTION>TERMINAL:NO_ACTION') {
    return affiliateLegacyReplayClaimRawStateMatches(appliedClaim, currentClaim)
      && affiliateLegacyReplayClaimEvidenceMatches(appliedClaim, currentClaim, false);
  }
  return false;
};

const affiliateLegacyReplayGatewayTerminalEvidenceIsOwned = (
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => (
  appliedClaim.kind === 'GATEWAY_CLAIM'
  && affiliateLegacyReplayClaimMetadataMatches(appliedClaim, currentClaim)
  && affiliateLegacyReplayClaimTransitionMatches(appliedClaim, currentClaim)
);

const affiliateLegacyReplayClaimLinkIsOwned = (
  appliedReport: AffiliateLegacySupplyReconciliationResult['report'],
  currentReport: AffiliateLegacySupplyReconciliationResult['report'],
  appliedClaim: AffiliateLegacyReplayClaimIdentity,
  currentClaim: AffiliateLegacyReplayClaimIdentity,
): boolean => {
  if (!currentClaim.supplySourceId) return false;
  if (
    appliedClaim.supplySourceId
    && appliedClaim.supplySourceId !== currentClaim.supplySourceId
  ) return false;
  if (!affiliateLegacyReplayClaimMetadataMatches(appliedClaim, currentClaim)) return false;
  if (!affiliateLegacyReplayClaimRootsMatch(
    appliedReport,
    currentReport,
    appliedClaim,
    currentClaim,
  )) return false;
  return affiliateLegacyReplayClaimTransitionMatches(appliedClaim, currentClaim);
};

const affiliateLegacyReplayClaimsMatch = (
  appliedReport: AffiliateLegacySupplyReconciliationResult['report'],
  currentReport: AffiliateLegacySupplyReconciliationResult['report'],
): boolean => {
  if (appliedReport.claimActions.length !== currentReport.claimActions.length) return false;
  const currentClaims = new Map(
    currentReport.claimActions.map((claim) => {
      const identity = affiliateLegacyReplayClaimIdentity(claim);
      return [`${identity.kind}:${identity.id}`, identity];
    }),
  );
  return appliedReport.claimActions.every((claim) => {
    const appliedIdentity = affiliateLegacyReplayClaimIdentity(claim);
    const currentIdentity = currentClaims.get(`${appliedIdentity.kind}:${appliedIdentity.id}`);
    if (!currentIdentity) return false;
    return (
      JSON.stringify(appliedIdentity) === JSON.stringify(currentIdentity)
      || affiliateLegacyReplayGatewayTerminalEvidenceIsOwned(
        appliedIdentity,

        currentIdentity,
      )
      || affiliateLegacyReplayClaimLinkIsOwned(
        appliedReport,
        currentReport,
        appliedIdentity,
        currentIdentity,
      )
    );
  });
};
const affiliateLegacyReplayPostApplySnapshotMatches = (
  appliedReport: AffiliateLegacySupplyReconciliationResult['report'],
  currentReport: AffiliateLegacySupplyReconciliationResult['report'],
): boolean => stringValue(
  affiliateLegacyRowValue(appliedReport, 'postApplyLegacySnapshotHash'),
) === currentReport.legacySnapshotHash;

const isAffiliateLegacyReconciliationReplaySafe = (
  appliedReport: AffiliateLegacySupplyReconciliationResult['report'],
  currentReport: AffiliateLegacySupplyReconciliationResult['report'],
): boolean => {
  if (!appliedReport.isApplySafe || !currentReport.isApplySafe) return false;
  const appliedSnapshot = buildAffiliateLegacyReconciliationReplaySnapshot(appliedReport);
  const currentSnapshot = buildAffiliateLegacyReconciliationReplaySnapshot(currentReport);
  return (
    affiliateLegacyReplayPostApplySnapshotMatches(appliedReport, currentReport)
    && JSON.stringify(appliedSnapshot.counts) === JSON.stringify(currentSnapshot.counts)
    && affiliateLegacyReplayRootsMatch(appliedSnapshot.roots, currentSnapshot.roots)
    && affiliateLegacyReplayClaimsMatch(appliedReport, currentReport)
  );
};

type AffiliateLegacyLifecyclePersistenceInput = Readonly<{
  database: AffiliateSupplyDatabase;
  report: AffiliateLegacyReconciliationReport;
  planToRoot: ReadonlyMap<string, string>;
  rootsById: ReadonlyMap<string, AffiliateSupplySources>;
  sourceById: ReadonlyMap<string, AffiliateLegacySourceEvidence>;
  publicRecordIdsByRoot: ReadonlyMap<string, readonly string[]>;
  approvalLineageRows: readonly AffiliateLegacyStageEvidenceRow[];
  postLinkSnapshot: AffiliateLegacyDatabaseSnapshot;
  postLinkRootRowById: ReadonlyMap<string, AffiliateLegacySupplySourceRow>;
  assessmentSnapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot> | null;
  contract: AffiliateSupplyContractPolicy;
  operatorId?: string | null;
  now: Date;
}>;

type AffiliateLegacyTransitionRow = Readonly<{
  idempotencyKey?: unknown;
  supplySourceId?: unknown;
  sequence?: unknown;
  command?: unknown;
  contractVersion?: unknown;
  contractHash?: unknown;
  requestJson?: unknown;
  resultHash?: unknown;
}>;

const legacyLifecycleSourceForPlan = (
  plan: AffiliateLegacyReconciliationReport['roots'][number],
  sourceById: ReadonlyMap<string, AffiliateLegacySourceEvidence>,
): AffiliateLegacySourceEvidence => {
  const source = plan.sourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .find((candidate): candidate is AffiliateLegacySourceEvidence => Boolean(candidate));
  if (!source) {
    throw new Error(`Legacy reconciliation root ${plan.identityKey ?? plan.sourceIds[0]} has no source evidence after linking.`);
  }
  return source;
};
const legacyLifecycleObservedStage = (
  plan: AffiliateLegacyReconciliationReport['roots'][number],
  rootId: string,
  sourceById: ReadonlyMap<string, AffiliateLegacySourceEvidence>,
  rootsById: ReadonlyMap<string, AffiliateSupplySources>,
  postLinkSnapshot: AffiliateLegacyDatabaseSnapshot,
  postLinkRootRowById: ReadonlyMap<string, AffiliateLegacySupplySourceRow>,
  approvalLineageRows: readonly AffiliateLegacyStageEvidenceRow[],
): AffiliateSupplyLifecycleStage => {
  const source = legacyLifecycleSourceForPlan(plan, sourceById);
  const sourceRow = postLinkSnapshot.sources.find((row) => (
    row.id === (source.liveSourceId ?? source.id)
  )) ?? (
    source.intakeId
      ? postLinkSnapshot.intakes.find((row) => row.id === source.intakeId) ?? null
      : null
  );
  const intakeIds = new Set(
    postLinkSnapshot.intakes
      .filter((intake) => (
        intake.id === source.intakeId
        || affiliateLegacyRowString(intake, 'affiliateSourceId', 'sourceId') === source.id
      ))
      .map((intake) => intake.id),
  );
  return deriveAffiliateLegacyStageFromEvidence({
    sourceId: source.id,
    rootId,
    intakeIds: Array.from(intakeIds),
    root: postLinkRootRowById.get(rootId) ?? rootsById.get(rootId) ?? null,
    source: sourceRow,
    mappings: postLinkSnapshot.mappings,
    approvals: approvalLineageRows,
    candidates: postLinkSnapshot.candidates,
    targets: postLinkSnapshot.targets,
  });
};

const deriveLegacyLifecycleAssessment = (input: Readonly<{
  rootId: string;
  snapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot> | null;
}>): Readonly<{
  snapshot: AffiliateSupplyEvidenceSnapshot;
  assessment: AffiliateSupplyAssessment;
}> | null => {
  const snapshot = input.snapshots?.get(input.rootId);
  return snapshot
    ? { snapshot, assessment: deriveAffiliateSupplyAssessment(snapshot) }
    : null;
};

const affiliateLegacyTransitionRow = (value: unknown): AffiliateLegacyTransitionRow | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as AffiliateLegacyTransitionRow
    : null
);

const affiliateLegacyTransitionSequence = (row: AffiliateLegacyTransitionRow): number => (
  typeof row.sequence === 'number' ? row.sequence : 0
);

const indexAffiliateLegacyTransition = (
  value: unknown,
  existingByKey: Map<string, AffiliateLegacyTransitionRow>,
  latestByRoot: Map<string, AffiliateLegacyTransitionRow>,
): void => {
  const row = affiliateLegacyTransitionRow(value);
  if (!row) return;
  const key = stringValue(row.idempotencyKey);
  if (key) existingByKey.set(key, row);
  const rootId = stringValue(row.supplySourceId);
  if (!rootId) return;
  const current = latestByRoot.get(rootId);
  if (
    !current
    || affiliateLegacyTransitionSequence(row) > affiliateLegacyTransitionSequence(current)
  ) {
    latestByRoot.set(rootId, row);
  }
};

const preloadLegacyLifecycleTransitions = async (
  database: AffiliateSupplyDatabase,
  rootIds: readonly string[],
): Promise<Readonly<{
  existingByKey: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
  latestByRoot: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
}>> => {
  const delegate = database.transitions as unknown as {
    findMany?: (args: unknown) => Promise<unknown>;
  };
  if (typeof delegate?.findMany !== 'function' || rootIds.length === 0) {
    return { existingByKey: new Map(), latestByRoot: new Map() };
  }
  const rows = await delegate.findMany({
    where: { supplySourceId: { in: rootIds } },
    orderBy: { sequence: 'desc' },
  });
  const existingByKey = new Map<string, AffiliateLegacyTransitionRow>();
  const latestByRoot = new Map<string, AffiliateLegacyTransitionRow>();
  const transitionRows = Array.isArray(rows) ? rows : [];
  for (const value of transitionRows) {
    indexAffiliateLegacyTransition(value, existingByKey, latestByRoot);
  }
  return { existingByKey, latestByRoot };
};

type AffiliateLegacyLifecycleWrite = Readonly<{
  rootId: string;
  expectedGeneration: number;
  fromStage: AffiliateSupplyLifecycleStage | null;
  observedStage: AffiliateSupplyLifecycleStage;
  observedOutcome: AffiliateSupplyLifecycleOutcome | null;
  evidenceRefs: readonly string[];
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  idempotencyKey: string;
  requestHash: string;
  resultHash: string;
  assessment: AffiliateSupplyAssessment | null;
  assessmentSnapshot: AffiliateSupplyEvidenceSnapshot | null;
}>;

const legacyLifecycleFromStage = (
  root: AffiliateSupplySources,
  expectedGeneration: number,
): AffiliateSupplyLifecycleStage | null => {
  if (expectedGeneration === 0) return null;
  if (AFFILIATE_SUPPLY_LIFECYCLE_STAGES.includes(root.derivedStage as AffiliateSupplyLifecycleStage)) {
    return root.derivedStage as AffiliateSupplyLifecycleStage;
  }
  return 'HUMAN_REVIEW_REQUIRED';
};

const legacyLifecycleRequest = (
  input: AffiliateLegacyLifecyclePersistenceInput,
  plan: AffiliateLegacyReconciliationReport['roots'][number],
  rootId: string,
  observedStage: AffiliateSupplyLifecycleStage,
  observedOutcome: AffiliateSupplyLifecycleOutcome | null,
): Record<string, unknown> => ({
  reportHash: input.report.reportHash,
  sourceIds: plan.sourceIds,
  recordIds: plan.recordIds,
  publicRecordIds: (input.publicRecordIdsByRoot.get(rootId) ?? []).slice().sort(codeUnitCompare),
  targetCount: plan.targetProjections.length,
  derivedStage: observedStage,
  derivedOutcome: observedOutcome,
});

const legacyLifecycleResult = (
  input: AffiliateLegacyLifecyclePersistenceInput,
  plan: AffiliateLegacyReconciliationReport['roots'][number],
  observedStage: AffiliateSupplyLifecycleStage,
  observedOutcome: AffiliateSupplyLifecycleOutcome | null,
): Record<string, unknown> => ({
  reportHash: input.report.reportHash,
  action: plan.action,
  observedStage,
  observedOutcome,
});

const buildLegacyLifecycleWrite = (
  input: AffiliateLegacyLifecyclePersistenceInput,
  plan: AffiliateLegacyReconciliationReport['roots'][number],
  rootId: string,
  root: AffiliateSupplySources,
): AffiliateLegacyLifecycleWrite => {
  const expectedGeneration = Number(root.lifecycleGeneration ?? 0);
  const fromStage = legacyLifecycleFromStage(root, expectedGeneration);
  const observedStage = legacyLifecycleObservedStage(
    plan,
    rootId,
    input.sourceById,
    input.rootsById,
    input.postLinkSnapshot,
    input.postLinkRootRowById,
    input.approvalLineageRows,
  );
  if (observedStage !== plan.derivedStage) {
    throw new Error(
      `Legacy reconciliation root ${rootId} derived stage ${observedStage} does not match the reviewed stage ${plan.derivedStage}.`,
    );
  }
  const assessmentData = deriveLegacyLifecycleAssessment({
    rootId,
    snapshots: input.assessmentSnapshots,
  });
  const assessment = assessmentData?.assessment ?? null;
  const observedOutcome = assessment?.outcome ?? null;
  const request = legacyLifecycleRequest(input, plan, rootId, observedStage, observedOutcome);
  const result = legacyLifecycleResult(input, plan, observedStage, observedOutcome);
  const idempotencyKey = `legacy-reconciled:${input.report.reportHash}:${rootId}`;
  const requestHash = affiliateLifecycleRequestHash({
    supplySourceId: rootId,
    command: 'LEGACY_RECONCILED',
    contractVersion: input.contract.version,
    contractHash: input.contract.hash,
    request,
  });
  return {
    rootId,
    expectedGeneration,
    fromStage,
    observedStage,
    observedOutcome,
    evidenceRefs: Array.from(new Set(plan.evidenceRefs)),
    request,
    result,
    idempotencyKey,
    requestHash,
    resultHash: hashAffiliateAgentValue(result),
    assessment,
    assessmentSnapshot: assessmentData?.snapshot ?? null,
  };
};
const legacyLifecycleRefreshAt = (
  snapshot: AffiliateSupplyEvidenceSnapshot | null,
): Date | undefined => (
  snapshot?.latestRun && isSuccessStatus(snapshot.latestRun.status)
    ? toDate(snapshot.latestRun.finishedAt) ?? undefined
    : undefined
);

const legacyLifecycleAssessmentFields = (
  write: AffiliateLegacyLifecycleWrite,
): Record<string, unknown> => {
  const assessment = write.assessment;
  if (!assessment) return {};
  return {
    freshnessStatus: assessment.freshnessStatus,
    targetContribution: assessment.targetContribution,
    repairPriority: assessment.repairPriority,
    isAutomationEnabled: assessment.isAutomationEnabled,
    isExcluded: assessment.stage === 'SOURCE_EXCLUDED',
    automationHoldReason: assessment.automationHoldReason,
    lastSuccessfulRefreshAt: legacyLifecycleRefreshAt(write.assessmentSnapshot),
    invariantViolations: [...assessment.invariantViolations],
  };
};

const legacyLifecycleTransitionData = (
  input: AffiliateLegacyLifecyclePersistenceInput,
  write: AffiliateLegacyLifecycleWrite,
  sequence: number,
  latest: AffiliateLegacyTransitionRow | undefined,
): Record<string, unknown> => ({
  id: createId(),
  supplySourceId: write.rootId,
  sequence,
  generation: write.expectedGeneration + 1,
  command: 'LEGACY_RECONCILED',
  contractVersion: input.contract.version,
  resultHash: write.resultHash,
  requestHash: write.requestHash,
  outcome: write.observedOutcome,
  fromStage: write.fromStage ?? (latest ? write.observedStage : null),
  toStage: write.observedStage,
  commandRef: null,
  idempotencyKey: write.idempotencyKey,
  contractHash: input.contract.hash,
  actorKind: 'SYSTEM',
  actorId: input.operatorId ?? 'affiliate-legacy-reconciliation',
  executingAgentId: null,
  reasonCodes: ['LEGACY_RECONCILED'],
  evidenceRefs: write.evidenceRefs,
  requestJson: prismaJsonValue(normalizeAffiliateLifecycleJson(write.request)),
  resultJson: prismaJsonValue(normalizeAffiliateLifecycleJson(write.result)),
  occurredAt: input.now,
});

const legacyLifecycleSourceData = (
  input: AffiliateLegacyLifecyclePersistenceInput,
  write: AffiliateLegacyLifecycleWrite,
): Record<string, unknown> => ({
  lifecycleGeneration: write.expectedGeneration + 1,
  derivedStage: write.observedStage,
  derivedOutcome: write.observedOutcome,
  lastAssessmentAt: input.now,
  activeSupplyContractVersion: input.contract.version,
  activeSupplyContractHash: input.contract.hash,
  ...legacyLifecycleAssessmentFields(write),
  assessmentJson: prismaJsonValue(normalizeAffiliateLifecycleJson(write.result)),
});


const assertLegacyLifecycleWriteMatchesExisting = (
  input: AffiliateLegacyLifecyclePersistenceInput,
  write: AffiliateLegacyLifecycleWrite,
  existing: AffiliateLegacyTransitionRow,
): void => {
  const storedRequestHash = affiliateLifecycleRequestHash({
    supplySourceId: stringValue(existing.supplySourceId) ?? write.rootId,
    command: (stringValue(existing.command) ?? 'LEGACY_RECONCILED') as AffiliateSupplyLifecycleCommand,
    contractVersion: Number(existing.contractVersion ?? input.contract.version),
    contractHash: stringValue(existing.contractHash) ?? input.contract.hash,
    request: recordValue(existing.requestJson),
  });
  if (storedRequestHash !== write.requestHash || existing.resultHash !== write.resultHash) {
    throw new Error('Affiliate lifecycle idempotency key was reused with a different request or result.');
  }
};

const persistLegacyLifecycleWrite = async (
  input: AffiliateLegacyLifecyclePersistenceInput,
  write: AffiliateLegacyLifecycleWrite,
  preloaded: Readonly<{
    existingByKey: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
    latestByRoot: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
  }>,
): Promise<void> => {
  const transitions = input.database.transitions as unknown as {
    create?: (args: unknown) => Promise<unknown>;
  };
  const supplySources = input.database.supplySources as unknown as {
    update?: (args: unknown) => Promise<unknown>;
  };
  if (typeof transitions.create !== 'function' || typeof supplySources.update !== 'function') {
    throw new Error('Legacy reconciliation lifecycle persistence delegates are unavailable.');
  }
  const existing = preloaded.existingByKey.get(write.idempotencyKey);
  if (existing) {
    assertLegacyLifecycleWriteMatchesExisting(input, write, existing);
    return;
  }
  const latest = preloaded.latestByRoot.get(write.rootId);
  const sequence = (typeof latest?.sequence === 'number' ? latest.sequence : write.expectedGeneration) + 1;
  await transitions.create({ data: legacyLifecycleTransitionData(input, write, sequence, latest) });
  await supplySources.update({
    where: { id: write.rootId },
    data: legacyLifecycleSourceData(input, write),
  });
};
type AffiliateLegacyLifecycleTransitionWriter = {
  createMany?: (args: unknown) => Promise<unknown>;
  create?: (args: unknown) => Promise<unknown>;
};

type AffiliateLegacyLifecycleSourceWriter = {
  update?: (args: unknown) => Promise<unknown>;
};

const buildLegacyLifecycleWrites = (
  input: AffiliateLegacyLifecyclePersistenceInput,
): AffiliateLegacyLifecycleWrite[] => input.report.roots.flatMap((plan) => {
  const rootId = input.planToRoot.get(plan.identityKey ?? plan.sourceIds[0]);
  const root = rootId ? input.rootsById.get(rootId) : undefined;
  return rootId && root
    ? [buildLegacyLifecycleWrite(input, plan, rootId, root)]
    : [];
});

const assertLegacyLifecycleWritesMatchExisting = (
  input: AffiliateLegacyLifecyclePersistenceInput,
  writes: readonly AffiliateLegacyLifecycleWrite[],
  existingByKey: ReadonlyMap<string, AffiliateLegacyTransitionRow>,
): void => {
  for (const write of writes) {
    const existing = existingByKey.get(write.idempotencyKey);
    if (existing) assertLegacyLifecycleWriteMatchesExisting(input, write, existing);
  }
};

const persistLegacyLifecycleBatch = async (
  input: AffiliateLegacyLifecyclePersistenceInput,
  transitions: AffiliateLegacyLifecycleTransitionWriter,
  supplySources: AffiliateLegacyLifecycleSourceWriter,
  writes: readonly AffiliateLegacyLifecycleWrite[],
  preloaded: Readonly<{
    existingByKey: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
    latestByRoot: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
  }>,
): Promise<boolean> => {
  if (typeof transitions.createMany !== 'function') return false;
  const pendingWrites = writes.filter((write) => !preloaded.existingByKey.has(write.idempotencyKey));
  if (pendingWrites.length === 0) return true;
  await transitions.createMany({
    data: pendingWrites.map((write) => {
      const latest = preloaded.latestByRoot.get(write.rootId);
      const sequence = (typeof latest?.sequence === 'number'
        ? latest.sequence
        : write.expectedGeneration) + 1;
      return legacyLifecycleTransitionData(input, write, sequence, latest);
    }),
  });
  await Promise.all(pendingWrites.map((write) => (
    supplySources.update?.({
      where: { id: write.rootId },
      data: legacyLifecycleSourceData(input, write),
    })
  )));
  return true;
};

const persistLegacyLifecycleIndividually = async (
  input: AffiliateLegacyLifecyclePersistenceInput,
  writes: readonly AffiliateLegacyLifecycleWrite[],
  preloaded: Readonly<{
    existingByKey: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
    latestByRoot: ReadonlyMap<string, AffiliateLegacyTransitionRow>;
  }>,
): Promise<void> => {
  for (const write of writes) {
    await persistLegacyLifecycleWrite(input, write, preloaded);
  }
};

const persistLegacyReconciledLifecycles = async (
  input: AffiliateLegacyLifecyclePersistenceInput,
): Promise<void> => {
  const transitions = input.database.transitions as unknown as AffiliateLegacyLifecycleTransitionWriter;
  const supplySources = input.database.supplySources as unknown as AffiliateLegacyLifecycleSourceWriter;
  if (
    (
      typeof transitions.create !== 'function'
      && typeof transitions.createMany !== 'function'
    )
    || typeof supplySources.update !== 'function'
  ) {
    throw new Error('Legacy reconciliation lifecycle persistence delegates are unavailable.');
  }
  const rootIds = Array.from(new Set(input.planToRoot.values()));
  const preloaded = await preloadLegacyLifecycleTransitions(input.database, rootIds);
  const writes = buildLegacyLifecycleWrites(input);
  assertLegacyLifecycleWritesMatchExisting(input, writes, preloaded.existingByKey);
  if (await persistLegacyLifecycleBatch(
    input,
    transitions,
    supplySources,
    writes,
    preloaded,
  )) return;
  await persistLegacyLifecycleIndividually(input, writes, preloaded);
};

export type AffiliateLegacySupplyReconciliationInput = Readonly<{
  db?: AffiliateSupplyDatabase;
  isDryRun?: boolean;
  now?: Date;
  rolloutCohort?: string;
  operatorId?: string | null;
  expectedReportHash?: string | null;
  expectedInputHash?: string | null;
  expectedCounts?: AffiliateLegacyReconciliationReport['counts'] | null;
  expectedCountsHash?: string | null;
  applyNonce?: string | null;
  preflight?: AffiliateCutoverPreflightReport | null;
  cutoverSessionId?: string | null;
  cutoverSessionHash?: string | null;
}>;
type AffiliateLegacySupplyReconciliationInternalInput = AffiliateLegacySupplyReconciliationInput & Readonly<{
  legacySnapshot?: AffiliateLegacyDatabaseSnapshot;
  persistRun?: boolean;
}>;


const collectLegacyAuthoritativeSourceEvidence = (
  sourceRows: readonly AffiliateLegacySourceRow[],
): {
  canonicalSourceRowById: Map<string, AffiliateLegacySourceRow>;
  sourceEvidenceContributions: Map<string, {
    evidence: AffiliateLegacySourceEvidence;
    isAuthoritativeSourceRow: boolean;
  }[]>;
} => {
  type SourceEvidenceContribution = Readonly<{
    evidence: AffiliateLegacySourceEvidence;
    isAuthoritativeSourceRow: boolean;
  }>;
  const sourceEvidenceContributions = new Map<string, SourceEvidenceContribution[]>();
  const addSourceEvidenceContribution = (
    sourceId: string,
    contribution: SourceEvidenceContribution,
  ): void => {
    const contributions = sourceEvidenceContributions.get(sourceId) ?? [];
    contributions.push(contribution);
    sourceEvidenceContributions.set(sourceId, contributions);
  };
  const canonicalSourceRowById = new Map<string, AffiliateLegacySourceRow>();
  for (const source of [...sourceRows].sort((left, right) => codeUnitCompare(
    JSON.stringify(normalizeAffiliateLegacySnapshotValue(left)),
    JSON.stringify(normalizeAffiliateLegacySnapshotValue(right)),
  ))) {
    if (!canonicalSourceRowById.has(source.id)) canonicalSourceRowById.set(source.id, source);
  }
  for (const source of sourceRows) {
    addSourceEvidenceContribution(source.id, {
      isAuthoritativeSourceRow: true,
      evidence: {
        id: source.id,
        requestedUrl: affiliateLegacyRowString(source, 'listUrl', 'baseUrl', 'url'),
        resolvedCanonicalUrl: affiliateLegacyRowString(source, 'canonicalUrl', 'listUrl', 'baseUrl', 'url'),
        isRedirectVerified: affiliateLegacyRowString(source, 'canonicalUrl') !== null,
        operatorDomain: affiliateLegacyRowString(source, 'operatorDomain'),
        targetKind: affiliateLegacyRowString(source, 'targetKind', 'listingKind'),
        existingSupplySourceId: affiliateLegacyRowString(source, 'supplySourceId'),
        liveSourceId: source.id,
        evidenceRefs: [`source:${source.id}`],
      },
    });
  }
  return {
    canonicalSourceRowById,
    sourceEvidenceContributions,
  };
};
type AffiliateLegacySourceEvidenceContribution = Readonly<{
  evidence: AffiliateLegacySourceEvidence;
  isAuthoritativeSourceRow: boolean;
}>;
const legacyIntakeCanonicalUrls = (
  intakeId: string,
  pageRows: readonly AffiliateLegacyIntakePageRow[],
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[],
): string[] => Array.from(new Set([
  ...pageRows
    .filter((page) => affiliateLegacyRowString(page, 'intakeId') === intakeId)
    .map((page) => affiliateLegacyRowString(page, 'canonicalUrl')),
  ...artifactRows
    .filter((artifact) => affiliateLegacyRowString(artifact, 'intakeId') === intakeId)
    .map((artifact) => affiliateLegacyRowString(artifact, 'finalUrl')),
  ].filter((url): url is string => url !== null))).sort(codeUnitCompare);
const legacyIntakeTargetKinds = (
  intake: AffiliateLegacyIntakeRow,
  authoritativeSource: AffiliateLegacySourceRow | undefined,
): string[] => {
  const suggestedClassification = recordValue(
    affiliateLegacyRowValue(intake, 'suggestedClassification'),
  );
  const intakeTargetKinds = Array.from(new Set([
    affiliateLegacyRowString(intake, 'targetKind', 'targetKindHint'),
    affiliateLegacyRowString(
      suggestedClassification,
      'targetKind',
      'targetKindHint',
      'listingKind',
      'kind',
      'classification',
    ),
    ...stringArray(affiliateLegacyRowValue(intake, 'targetKindHints')),
  ].filter((value): value is string => value !== null))).sort(codeUnitCompare);
  return intakeTargetKinds.length > 0
    ? intakeTargetKinds
    : [authoritativeSource
      ? affiliateLegacyRowString(authoritativeSource, 'targetKind', 'listingKind')
      : null].filter((value): value is string => value !== null);
};
const buildLegacyIntakeSourceEvidence = (input: Readonly<{
  intake: AffiliateLegacyIntakeRow;
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
  intakeSourceIds: ReadonlyMap<string, string>;
  canonicalSourceRowById: ReadonlyMap<string, AffiliateLegacySourceRow>;
}>): Readonly<{
  sourceId: string;
  contributions: AffiliateLegacySourceEvidenceContribution[];
}> | null => {
  const requestedUrl = affiliateLegacyRowString(input.intake, 'baseUrl', 'url');
  if (!requestedUrl) return null;
  const liveSourceId = affiliateLegacyRowString(input.intake, 'affiliateSourceId', 'sourceId');
  const sourceId = liveSourceId ?? input.intakeSourceIds.get(input.intake.id) ?? `intake:${input.intake.id}`;
  const authoritativeSource = liveSourceId
    ? input.canonicalSourceRowById.get(liveSourceId)
    : undefined;
  const directCanonicalUrls = legacyIntakeCanonicalUrls(
    input.intake.id,
    input.pageRows,
    input.artifactRows,
  );
  const targetKinds = legacyIntakeTargetKinds(input.intake, authoritativeSource);
  const sourceLevelCanonicalUrl = authoritativeSource
    ? affiliateLegacyRowString(authoritativeSource, 'canonicalUrl', 'listUrl', 'baseUrl', 'url')
      ?? requestedUrl
    : requestedUrl;
  const sourceLevelRedirectVerified = authoritativeSource
    ? affiliateLegacyRowString(authoritativeSource, 'canonicalUrl') !== null
    : false;
  const intakeEvidenceRefs = [
    `intake:${input.intake.id}`,
    ...directCanonicalUrls.map((url) => `intake-canonical:${url}`),
  ];
  return {
    sourceId,
    contributions: targetKinds.map((targetKind) => ({
      isAuthoritativeSourceRow: false,
      evidence: {
        id: sourceId,
        requestedUrl,
        resolvedCanonicalUrl: sourceLevelCanonicalUrl,
        isRedirectVerified: sourceLevelRedirectVerified,
        operatorDomain: authoritativeSource
          ? affiliateLegacyRowString(authoritativeSource, 'operatorDomain')
          : null,
        targetKind,
        existingSupplySourceId: affiliateLegacyRowString(input.intake, 'supplySourceId')
          ?? (authoritativeSource
            ? affiliateLegacyRowString(authoritativeSource, 'supplySourceId')
            : null),
        intakeId: input.intake.id,
        liveSourceId,
        evidenceRefs: intakeEvidenceRefs,
      },
    })),
  };
};
const collectLegacyIntakeSourceEvidence = (input: Readonly<{
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
  intakeSourceIds: ReadonlyMap<string, string>;
  canonicalSourceRowById: ReadonlyMap<string, AffiliateLegacySourceRow>;
  sourceEvidenceContributions: Map<string, AffiliateLegacySourceEvidenceContribution[]>;
}>): void => {
  for (const intake of input.intakeRows) {
    const evidence = buildLegacyIntakeSourceEvidence({ ...input, intake });
    if (!evidence) continue;
    const contributions = input.sourceEvidenceContributions.get(evidence.sourceId) ?? [];
    contributions.push(...evidence.contributions);
    input.sourceEvidenceContributions.set(evidence.sourceId, contributions);
  }
};
const collectLegacySourceEvidenceContributions = (input: Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
}>): {
  intakeSourceIds: Map<string, string>;
  canonicalSourceRowById: Map<string, AffiliateLegacySourceRow>;
  sourceEvidenceContributions: Map<string, {
    evidence: AffiliateLegacySourceEvidence;
    isAuthoritativeSourceRow: boolean;
  }[]>;
} => {
  const intakeSourceIds = new Map<string, string>();
  for (const intake of input.intakeRows) {
    const linkedSourceId = affiliateLegacyRowString(intake, 'affiliateSourceId', 'sourceId');
    intakeSourceIds.set(intake.id, linkedSourceId ?? `intake:${intake.id}`);
  }
  const authoritative = collectLegacyAuthoritativeSourceEvidence(input.sourceRows);
  collectLegacyIntakeSourceEvidence({
    intakeRows: input.intakeRows,
    pageRows: input.pageRows,
    artifactRows: input.artifactRows,
    intakeSourceIds,
    canonicalSourceRowById: authoritative.canonicalSourceRowById,
    sourceEvidenceContributions: authoritative.sourceEvidenceContributions,
  });
  return {
    intakeSourceIds,
    canonicalSourceRowById: authoritative.canonicalSourceRowById,
    sourceEvidenceContributions: authoritative.sourceEvidenceContributions,
  };
};
type AffiliateLegacySourceEvidenceValueSets = Readonly<{
  authoritativeIdentityKeys: string[];
  linkedIdentityKeys: string[];
  identityContributions: readonly AffiliateLegacySourceEvidenceContribution[];
  requestedUrls: string[];
  resolvedCanonicalUrls: string[];
  redirectValues: boolean[];
  operatorDomains: string[];
  targetKinds: string[];
  rootIds: string[];
  intakeIds: string[];
  liveSourceIds: string[];
}>;

const legacySourceIdentityKey = (
  evidence: AffiliateLegacySourceEvidence,
  isAuthoritative: boolean,
): string | null => {
  const requestedUrl = stringValue(evidence.requestedUrl);
  if (!requestedUrl) return null;
  try {
    return normalizeAffiliateSupplyIdentity({
      requestedUrl,
      resolvedCanonicalUrl: isAuthoritative
        ? stringValue(evidence.resolvedCanonicalUrl) ?? requestedUrl
        : requestedUrl,
      isRedirectVerified: isAuthoritative && evidence.isRedirectVerified === true,
      operatorDomain: evidence.operatorDomain,
    }).identityKey;
  } catch {
    return null;
  }
};

const distinctLegacySourceValues = (
  values: readonly (string | null | undefined)[],
): string[] => Array.from(new Set(
  values
    .map((value) => stringValue(value))
    .filter((value): value is string => value !== null),
)).sort(codeUnitCompare);

const legacySourceEvidenceValueSets = (
  contributions: readonly AffiliateLegacySourceEvidenceContribution[],
): AffiliateLegacySourceEvidenceValueSets => {
  const authoritative = contributions.filter((contribution) => contribution.isAuthoritativeSourceRow);
  const identityContributions = authoritative.length > 0 ? authoritative : contributions;
  return {
    authoritativeIdentityKeys: distinctLegacySourceValues(
      authoritative.map(({ evidence }) => legacySourceIdentityKey(evidence, true)),
    ),
    linkedIdentityKeys: distinctLegacySourceValues(
      contributions
        .filter((contribution) => !contribution.isAuthoritativeSourceRow)
        .map(({ evidence }) => legacySourceIdentityKey(evidence, false)),
    ),
    identityContributions,
    requestedUrls: distinctLegacySourceValues(
      identityContributions.map(({ evidence }) => evidence.requestedUrl),
    ),
    resolvedCanonicalUrls: distinctLegacySourceValues(
      identityContributions.map(({ evidence }) => evidence.resolvedCanonicalUrl),
    ),
    redirectValues: Array.from(new Set(
      identityContributions
        .map(({ evidence }) => evidence.isRedirectVerified)
        .filter((value): value is boolean => typeof value === 'boolean'),
    )).sort((left, right) => codeUnitCompare(String(left), String(right))),
    operatorDomains: distinctLegacySourceValues(
      identityContributions.map(({ evidence }) => evidence.operatorDomain),
    ),
    targetKinds: distinctLegacySourceValues(
      identityContributions.map(({ evidence }) => upper(evidence.targetKind)),
    ),
    rootIds: distinctLegacySourceValues(
      contributions.map(({ evidence }) => evidence.existingSupplySourceId),
    ),
    intakeIds: distinctLegacySourceValues(
      contributions.map(({ evidence }) => evidence.intakeId),
    ),
    liveSourceIds: distinctLegacySourceValues(
      authoritative.map(({ evidence }) => evidence.liveSourceId),
    ),
  };
};

const appendLegacySourceEvidenceConflict = (
  sourceEvidenceFindings: AffiliateCutoverFinding[],
  sourceId: string,
  field: string,
  values: readonly string[],
  code = 'SOURCE_EVIDENCE_CONFLICT',
): void => {
  if (values.length <= 1) return;
  sourceEvidenceFindings.push({
    code,
    severity: 'BLOCKING',
    detail: `Legacy source ${sourceId} has conflicting ${field} evidence: ${values.join(', ')}.`,
    recordIds: code === 'SOURCE_IDENTITY_CONFLICT'
      ? [sourceId]
      : Array.from(new Set([sourceId, ...values])).sort(codeUnitCompare),
    resolution: 'Resolve the conflicting legacy source evidence before reconciliation apply.',
  });
};

const buildMergedLegacySourceEvidence = (
  sourceId: string,
  rawContributions: readonly AffiliateLegacySourceEvidenceContribution[],
  sourceEvidenceFindings: AffiliateCutoverFinding[],
): AffiliateLegacySourceEvidence => {
  const contributions = [...rawContributions].sort((left, right) => codeUnitCompare(
    JSON.stringify(normalizeAffiliateLegacySnapshotValue(left.evidence)),
    JSON.stringify(normalizeAffiliateLegacySnapshotValue(right.evidence)),
  ));
  const authoritative = contributions.filter((contribution) => contribution.isAuthoritativeSourceRow);
  const values = legacySourceEvidenceValueSets(contributions);
  appendLegacySourceEvidenceConflict(
    sourceEvidenceFindings,
    sourceId,
    'identity',
    values.authoritativeIdentityKeys,
    'SOURCE_IDENTITY_CONFLICT',
  );
  appendLegacySourceEvidenceConflict(
    sourceEvidenceFindings,
    sourceId,
    'linked intake identity',
    values.linkedIdentityKeys,
    'SOURCE_IDENTITY_CONFLICT',
  );
  appendLegacySourceEvidenceConflict(
    sourceEvidenceFindings,
    sourceId,
    'canonical URL',
    values.resolvedCanonicalUrls,
    'SOURCE_IDENTITY_CONFLICT',
  );
  appendLegacySourceEvidenceConflict(
    sourceEvidenceFindings,
    sourceId,
    'redirect verification',
    values.redirectValues.map(String),
  );
  appendLegacySourceEvidenceConflict(
    sourceEvidenceFindings,
    sourceId,
    'operator domain',
    values.operatorDomains,
  );
  appendLegacySourceEvidenceConflict(
    sourceEvidenceFindings,
    sourceId,
    'target kind',
    values.targetKinds,
  );
  appendLegacySourceEvidenceConflict(
    sourceEvidenceFindings,
    sourceId,
    'Supply Source root',
    values.rootIds,
  );
  const requestedUrl = values.requestedUrls[0] ?? null;
  const resolvedCanonicalUrl = values.resolvedCanonicalUrls[0] ?? requestedUrl;
  return {
    id: sourceId,
    requestedUrl,
    resolvedCanonicalUrl,
    isRedirectVerified: values.redirectValues[values.redirectValues.length - 1] ?? false,
    operatorDomain: values.operatorDomains[0] ?? null,
    targetKind: values.targetKinds[0] ?? null,
    existingSupplySourceId: values.rootIds[0] ?? null,
    intakeId: values.intakeIds[0] ?? null,
    liveSourceId: distinctLegacySourceValues(
      authoritative.map(({ evidence }) => evidence.liveSourceId),
    )[0] ?? distinctLegacySourceValues(
      contributions.map(({ evidence }) => evidence.liveSourceId),
    )[0] ?? null,
    evidenceRefs: Array.from(new Set(
      contributions.flatMap(({ evidence }) => evidence.evidenceRefs ?? []),
    )).sort(codeUnitCompare),
  };
};

const mergeLegacySourceEvidence = (input: Readonly<{
  sourceEvidenceContributions: ReadonlyMap<string, ReadonlyArray<AffiliateLegacySourceEvidenceContribution>>;
}>): {
  sourceEvidence: AffiliateLegacySourceEvidence[];
  sourceEvidenceFindings: AffiliateCutoverFinding[];
} => {
  const sourceEvidenceFindings: AffiliateCutoverFinding[] = [];
  const sourceEvidence = Array.from(input.sourceEvidenceContributions.entries())
    .sort(([left], [right]) => codeUnitCompare(left, right))
    .map(([sourceId, contributions]) => buildMergedLegacySourceEvidence(
      sourceId,
      contributions,
      sourceEvidenceFindings,
    ));
  return {
    sourceEvidence,
    sourceEvidenceFindings,
  };
};
const buildLegacySourceEvidence = (input: Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
}>): {
  intakeSourceIds: Map<string, string>;
  canonicalSourceRowById: Map<string, AffiliateLegacySourceRow>;
  sourceEvidence: AffiliateLegacySourceEvidence[];
  sourceEvidenceFindings: AffiliateCutoverFinding[];
} => {
  const collected = collectLegacySourceEvidenceContributions(input);
  const merged = mergeLegacySourceEvidence({
    sourceEvidenceContributions: collected.sourceEvidenceContributions,
  });
  return {
    ...collected,
    ...merged,
  };
};
type AffiliateLegacyResolvedApprovalLineage = Readonly<{
  sourceId: string | null;
  supplySourceId: string | null;
  intakeId: string | null;
  associations: readonly Readonly<{
    sourceId: string | null;
    supplySourceId: string | null;
    intakeId: string | null;
  }>[];
}>;
type AffiliateLegacyApprovalLineageAssociation = Readonly<{
  sourceId: string | null;
  supplySourceId: string | null;
  intakeId: string | null;
}>;

type AffiliateLegacyApprovalLineageContext = Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
  mappingRows: readonly AffiliateLegacyMappingRow[];
  mappingJobRows: readonly AffiliateLegacyMappingJobRow[];
  mappingById: ReadonlyMap<string, AffiliateLegacyMappingRow>;
  mappingJobById: ReadonlyMap<string, AffiliateLegacyMappingJobRow>;
  candidateById: ReadonlyMap<string, AffiliateLegacyCandidateRow>;
  sourceRootIdById: ReadonlyMap<string, string | null>;
  intakeRootIdById: ReadonlyMap<string, string | null>;
  intakeSourceIds: ReadonlyMap<string, string>;
  policyKeyMatchesValue: (value: string | null, policyKey: string) => boolean;
  rowMatchesPolicyKey: (row: object, policyKey: string, keys: readonly string[]) => boolean;
}>;

type MutableAffiliateLegacyApprovalLineage = {
  sourceIds: Set<string>;
  supplySourceIds: Set<string>;
  intakeIds: Set<string>;
};

const appendLegacyApprovalSourceLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  sourceId: string | null,
): void => {
  if (!sourceId) return;
  lineage.sourceIds.add(sourceId);
  const rootId = context.sourceRootIdById.get(sourceId);
  if (rootId) lineage.supplySourceIds.add(rootId);
};

const appendLegacyApprovalIntakeLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  intakeId: string | null,
): void => {
  if (!intakeId) return;
  lineage.intakeIds.add(intakeId);
  appendLegacyApprovalSourceLineage(
    context,
    lineage,
    context.intakeSourceIds.get(intakeId) ?? null,
  );
  const intake = context.intakeRows.find((candidate) => candidate.id === intakeId);
  const rootId = affiliateLegacyRowString(intake ?? {}, 'supplySourceId');
  if (rootId) lineage.supplySourceIds.add(rootId);
};

const appendLegacyApprovalMappingJobLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  job: AffiliateLegacyMappingJobRow | undefined,
): void => {
  if (!job) return;
  const intakeId = affiliateLegacyRowString(job, 'intakeId');
  appendLegacyApprovalIntakeLineage(context, lineage, intakeId);
  appendLegacyApprovalSourceLineage(
    context,
    lineage,
    affiliateLegacyRowString(job, 'sourceId')
      ?? (intakeId ? context.intakeSourceIds.get(intakeId) ?? null : null),
  );
  const rootId = affiliateLegacyRowString(job, 'supplySourceId')
    ?? (intakeId ? context.intakeRootIdById.get(intakeId) ?? null : null);
  if (rootId) lineage.supplySourceIds.add(rootId);
};

const appendLegacyApprovalMappingPackageLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  subjectKey: string,
): void => {
  appendLegacyApprovalMappingJobLineage(context, lineage, context.mappingJobById.get(subjectKey));
  context.mappingJobRows
    .filter((job) => job.mappingId === subjectKey)
    .forEach((job) => appendLegacyApprovalMappingJobLineage(context, lineage, job));
  const mapping = context.mappingById.get(subjectKey);
  if (!mapping) return;
  appendLegacyApprovalSourceLineage(
    context,
    lineage,
    affiliateLegacyRowString(mapping, 'sourceId'),
  );
  const rootId = affiliateLegacyRowString(mapping, 'supplySourceId');
  if (rootId) lineage.supplySourceIds.add(rootId);
};

const appendLegacyApprovalCandidateLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  subjectKey: string,
): void => {
  const candidate = context.candidateById.get(subjectKey);
  if (!candidate) return;
  appendLegacyApprovalSourceLineage(
    context,
    lineage,
    affiliateLegacyRowString(candidate, 'sourceId'),
  );
  const rootId = affiliateLegacyRowString(candidate, 'supplySourceId');
  if (rootId) lineage.supplySourceIds.add(rootId);
};

const appendLegacyApprovalSourcePolicyLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  subjectKey: string,
): void => {
  appendLegacyApprovalSourceLineage(
    context,
    lineage,
    context.sourceRows.some((source) => source.id === subjectKey) ? subjectKey : null,
  );
};

const appendLegacyApprovalDomainPolicyLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  subjectKey: string,
): void => {
  for (const source of context.sourceRows) {
    const matchesPolicy = context.policyKeyMatchesValue(
      affiliateLegacyRowString(source, 'operatorDomain'),
      subjectKey,
    ) || context.rowMatchesPolicyKey(source, subjectKey, ['canonicalUrl', 'listUrl', 'baseUrl', 'url']);
    if (!matchesPolicy) continue;
    appendLegacyApprovalSourceLineage(context, lineage, source.id);
    context.intakeRows
      .filter((intake) => affiliateLegacyRowString(intake, 'affiliateSourceId', 'sourceId') === source.id)
      .forEach((intake) => appendLegacyApprovalIntakeLineage(context, lineage, intake.id));
  }
  context.intakeRows
    .filter((intake) => context.rowMatchesPolicyKey(intake, subjectKey, ['baseUrl', 'url']))
    .forEach((intake) => appendLegacyApprovalIntakeLineage(context, lineage, intake.id));
  context.pageRows
    .filter((page) => context.rowMatchesPolicyKey(page, subjectKey, ['canonicalUrl', 'url']))
    .forEach((page) => {
      appendLegacyApprovalIntakeLineage(
        context,
        lineage,
        affiliateLegacyRowString(page, 'intakeId'),
      );
      const rootId = affiliateLegacyRowString(page, 'supplySourceId');
      if (rootId) lineage.supplySourceIds.add(rootId);
    });
  context.artifactRows
    .filter((artifact) => context.rowMatchesPolicyKey(artifact, subjectKey, ['sourceUrl', 'finalUrl']))
    .forEach((artifact) => {
      appendLegacyApprovalIntakeLineage(
        context,
        lineage,
        affiliateLegacyRowString(artifact, 'intakeId'),
      );
      const rootId = affiliateLegacyRowString(artifact, 'supplySourceId');
      if (rootId) lineage.supplySourceIds.add(rootId);
    });
};

const appendLegacyApprovalSubjectLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
  approval: AffiliateLegacyApprovalRow,
): void => {
  const subjectKey = affiliateLegacyRowString(approval, 'subjectKey');
  if (!subjectKey) return;
  switch (upper(affiliateLegacyRowString(approval, 'subjectType'))) {
    case 'MAPPING_PACKAGE':
      appendLegacyApprovalMappingPackageLineage(context, lineage, subjectKey);
      break;
    case 'CANDIDATE_REVIEW':
      appendLegacyApprovalCandidateLineage(context, lineage, subjectKey);
      break;
    case 'SOURCE_POLICY':
      appendLegacyApprovalSourcePolicyLineage(context, lineage, subjectKey);
      break;
    case 'DOMAIN_POLICY':
      appendLegacyApprovalDomainPolicyLineage(context, lineage, subjectKey);
      break;
    default:
      break;
  }
};

const buildLegacyApprovalAssociations = (
  context: AffiliateLegacyApprovalLineageContext,
  lineage: MutableAffiliateLegacyApprovalLineage,
): AffiliateLegacyApprovalLineageAssociation[] => {
  const associations = new Map<string, AffiliateLegacyApprovalLineageAssociation>();
  const addAssociation = (association: AffiliateLegacyApprovalLineageAssociation): void => {
    const key = JSON.stringify(association);
    if (!associations.has(key)) associations.set(key, association);
  };
  Array.from(lineage.sourceIds).sort(codeUnitCompare).forEach((sourceId) => addAssociation({
    sourceId,
    supplySourceId: context.sourceRootIdById.get(sourceId) ?? null,
    intakeId: null,
  }));
  Array.from(lineage.intakeIds).sort(codeUnitCompare).forEach((intakeId) => addAssociation({
    sourceId: context.intakeSourceIds.get(intakeId) ?? null,
    supplySourceId: context.intakeRootIdById.get(intakeId) ?? null,
    intakeId,
  }));
  Array.from(lineage.supplySourceIds).sort(codeUnitCompare).forEach((supplySourceId) => addAssociation({
    sourceId: null,
    supplySourceId,
    intakeId: null,
  }));
  return Array.from(associations.values()).sort((left, right) => (
    codeUnitCompare(JSON.stringify(left), JSON.stringify(right))
  ));
};

const selectLegacyApprovalPrimaryAssociation = (
  associations: readonly AffiliateLegacyApprovalLineageAssociation[],
  supplySourceIds: readonly string[],
): AffiliateLegacyApprovalLineageAssociation => {
  if (supplySourceIds.length > 1) {
    return { sourceId: null, supplySourceId: null, intakeId: null };
  }
  return associations.find((association) => (
    association.supplySourceId === (supplySourceIds[0] ?? null)
  )) ?? associations[0] ?? { sourceId: null, supplySourceId: null, intakeId: null };
};

const legacyApprovalAmbiguityFinding = (
  approval: AffiliateLegacyApprovalRow,
  sourceIds: readonly string[],
  supplySourceIds: readonly string[],
  subjectType: string,
): AffiliateCutoverFinding | null => {
  if (
    (sourceIds.length <= 1 && supplySourceIds.length <= 1)
    || subjectType === 'DOMAIN_POLICY'
  ) return null;
  return {
    code: 'APPROVAL_LINEAGE_AMBIGUOUS',
    severity: 'BLOCKING',
    detail: `Approval ${approval.id} resolves to more than one source or Supply Source lineage.`,
    recordIds: [approval.id, ...sourceIds, ...supplySourceIds].sort(codeUnitCompare),
    resolution: 'Resolve the approval subject to one exact source and Supply Source root before apply.',
  };
};

const resolveLegacyApprovalLineage = (
  context: AffiliateLegacyApprovalLineageContext,
  approval: AffiliateLegacyApprovalRow,
): {
  lineage: AffiliateLegacyResolvedApprovalLineage;
  finding: AffiliateCutoverFinding | null;
} => {
  const mutable: MutableAffiliateLegacyApprovalLineage = {
    sourceIds: new Set(),
    supplySourceIds: new Set(),
    intakeIds: new Set(),
  };
  appendLegacyApprovalSourceLineage(
    context,
    mutable,
    affiliateLegacyRowString(approval, 'sourceId', 'affiliateSourceId'),
  );
  const directRootId = affiliateLegacyRowString(approval, 'supplySourceId');
  if (directRootId) mutable.supplySourceIds.add(directRootId);
  appendLegacyApprovalSubjectLineage(context, mutable, approval);
  Array.from(mutable.sourceIds).forEach((sourceId) => {
    const rootId = context.sourceRootIdById.get(sourceId);
    if (rootId) mutable.supplySourceIds.add(rootId);
  });
  Array.from(mutable.intakeIds).forEach((intakeId) => {
    const rootId = context.intakeRootIdById.get(intakeId);
    if (rootId) mutable.supplySourceIds.add(rootId);
  });
  const sourceIds = Array.from(mutable.sourceIds).sort(codeUnitCompare);
  const supplySourceIds = Array.from(mutable.supplySourceIds).sort(codeUnitCompare);
  const intakeIds = Array.from(mutable.intakeIds).sort(codeUnitCompare);
  const associations = buildLegacyApprovalAssociations(context, mutable);
  const primary = selectLegacyApprovalPrimaryAssociation(associations, supplySourceIds);
  return {
    lineage: {
      sourceId: primary.sourceId,
      supplySourceId: primary.supplySourceId,
      intakeId: primary.intakeId,
      associations,
    },
    finding: legacyApprovalAmbiguityFinding(
      approval,
      sourceIds,
      supplySourceIds,
      upper(affiliateLegacyRowString(approval, 'subjectType')),
    ),
  };
};

const buildLegacyApprovalLineage = (input: Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
  mappingRows: readonly AffiliateLegacyMappingRow[];
  mappingJobRows: readonly AffiliateLegacyMappingJobRow[];
  approvalRows: readonly AffiliateLegacyApprovalRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  sourceEvidence: readonly AffiliateLegacySourceEvidence[];
  intakeSourceIds: ReadonlyMap<string, string>;
}>): {
  candidateById: Map<string, AffiliateLegacyCandidateRow>;
  sourceRootIdById: Map<string, string | null>;
  intakeRootIdById: Map<string, string | null>;
  approvalLineageById: Map<string, AffiliateLegacyResolvedApprovalLineage>;
  approvalLineageRows: AffiliateLegacyStageEvidenceRow[];
  approvalLineageFindings: AffiliateCutoverFinding[];
  approvalStateFindings: AffiliateCutoverFinding[];
} => {
  const candidateById = new Map(input.candidateRows.map((candidate) => [candidate.id, candidate]));
  const mappingById = new Map(input.mappingRows.map((mapping) => [mapping.id, mapping]));
  const mappingJobById = new Map(input.mappingJobRows.map((job) => [job.id, job]));
  const sourceRootIdById = new Map(
    input.sourceEvidence.map((source) => [source.id, source.existingSupplySourceId ?? null]),
  );
  const intakeRootIdById = new Map(
    input.intakeRows.map((intake) => [intake.id, affiliateLegacyRowString(intake, 'supplySourceId')]),
  );
  const policyKeyMatchesUrl = (url: string | null, policyKey: string): boolean => {
    if (!url) return false;
    try {
      return affiliateDiscoveryPolicyKeyForUrl(url) === policyKey;
    } catch {
      return false;
    }
  };
  const policyKeyMatchesValue = (value: string | null, policyKey: string): boolean => (
    Boolean(value)
    && (
      value === policyKey
      || value?.toLowerCase() === policyKey.toLowerCase()
      || policyKeyMatchesUrl(value, policyKey)
    )
  );
  const rowMatchesPolicyKey = (
    row: object,
    policyKey: string,
    keys: readonly string[],
  ): boolean => keys.some((key) => (
    policyKeyMatchesValue(affiliateLegacyRowString(row, key), policyKey)
  ));
  const context: AffiliateLegacyApprovalLineageContext = {
    sourceRows: input.sourceRows,
    intakeRows: input.intakeRows,
    pageRows: input.pageRows,
    artifactRows: input.artifactRows,
    mappingRows: input.mappingRows,
    mappingJobRows: input.mappingJobRows,
    mappingById,
    mappingJobById,
    candidateById,
    sourceRootIdById,
    intakeRootIdById,
    intakeSourceIds: input.intakeSourceIds,
    policyKeyMatchesValue,
    rowMatchesPolicyKey,
  };
  const approvalLineageFindings: AffiliateCutoverFinding[] = [];
  const approvalLineageById = new Map<string, AffiliateLegacyResolvedApprovalLineage>();
  for (const approval of input.approvalRows) {
    const resolution = resolveLegacyApprovalLineage(context, approval);
    approvalLineageById.set(approval.id, resolution.lineage);
    if (resolution.finding) approvalLineageFindings.push(resolution.finding);
  }
  const approvalLineageRows: AffiliateLegacyStageEvidenceRow[] = input.approvalRows.map((approval) => {
    const lineage = approvalLineageById.get(approval.id);
    return {
      ...approval,
      subjectType: affiliateLegacyRowString(approval, 'subjectType'),
      sourceId: lineage?.sourceId
        ?? affiliateLegacyRowString(approval, 'sourceId', 'affiliateSourceId'),
      affiliateSourceId: lineage?.sourceId
        ?? affiliateLegacyRowString(approval, 'sourceId', 'affiliateSourceId'),
      supplySourceId: lineage?.supplySourceId
        ?? affiliateLegacyRowString(approval, 'supplySourceId'),
      intakeId: lineage?.intakeId
        ?? affiliateLegacyRowString(approval, 'intakeId'),
    };
  });
  return {
    candidateById,
    sourceRootIdById,
    intakeRootIdById,
    approvalLineageById,
    approvalLineageRows,
    approvalLineageFindings,
    approvalStateFindings: affiliateLegacyContradictoryApprovalFindings(input.approvalRows),
  };
};
const addLegacyPublicEntitySource = (
  publicEntitySourceIds: Map<string, Set<string>>,
  targetType: string,
  targetId: string | null,
  sourceId: string | null,
): void => {
  if (!targetId || !sourceId) return;
  const key = `${targetType}:${targetId}`;
  const sourceIds = publicEntitySourceIds.get(key) ?? new Set<string>();
  sourceIds.add(sourceId);
  publicEntitySourceIds.set(key, sourceIds);
};

const appendLegacyBasicPublicEntitySources = (input: Readonly<{
  publicEntitySourceIds: Map<string, Set<string>>;
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  discoveryResultRows: readonly AffiliateLegacyDiscoveryResultRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  intakeSourceIds: ReadonlyMap<string, string>;
  publishedIdFieldByTargetType: Readonly<Record<string, string>>;
}>): void => {
  const {
    publicEntitySourceIds,
    sourceRows,
    intakeRows,
    discoveryResultRows,
    candidateRows,
    intakeSourceIds,
    publishedIdFieldByTargetType,
  } = input;
  for (const source of sourceRows) {
    addLegacyPublicEntitySource(
      publicEntitySourceIds,
      'ORGANIZATION',
      affiliateLegacyRowString(source, 'organizationId'),
      source.id,
    );
  }
  for (const intake of intakeRows) {
    addLegacyPublicEntitySource(
      publicEntitySourceIds,
      'ORGANIZATION',
      affiliateLegacyRowString(intake, 'organizationId'),
      affiliateLegacyRowString(intake, 'affiliateSourceId', 'sourceId') ?? `intake:${intake.id}`,
    );
  }
  for (const result of discoveryResultRows) {
    const sourceId = affiliateLegacyRowString(result, 'matchingSourceId')
      ?? intakeSourceIds.get(affiliateLegacyRowString(result, 'matchingIntakeId') ?? '')
      ?? null;
    addLegacyPublicEntitySource(
      publicEntitySourceIds,
      'ORGANIZATION',
      affiliateLegacyRowString(result, 'matchingOrganizationId'),
      sourceId,
    );
  }
  for (const candidate of candidateRows) {
    const targetType = affiliateLegacyTargetTypeForListing(candidate.listingKind);
    if (!targetType) continue;
    addLegacyPublicEntitySource(
      publicEntitySourceIds,
      targetType,
      affiliateLegacyRowString(candidate, publishedIdFieldByTargetType[targetType]),
      affiliateLegacyRowString(candidate, 'sourceId'),
    );
  }
};

const appendLegacyFacilityPublicEntitySources = (
  publicEntitySourceIds: Map<string, Set<string>>,
  facilityRows: readonly AffiliateLegacyFacilityRow[],
): void => {
  for (const facility of facilityRows) {
    const organizationId = affiliateLegacyRowString(facility, 'organizationId');
    const organizationSourceIds = organizationId
      ? publicEntitySourceIds.get(`ORGANIZATION:${organizationId}`) ?? new Set<string>()
      : new Set<string>();
    for (const sourceId of organizationSourceIds) {
      addLegacyPublicEntitySource(publicEntitySourceIds, 'FACILITY', facility.id, sourceId);
    }
    addLegacyPublicEntitySource(
      publicEntitySourceIds,
      'FACILITY',
      facility.id,
      affiliateLegacyRowString(facility, 'sourceId'),
    );
  }
};

const appendLegacyOrganizationLinkedPublicEntitySources = (
  publicEntitySourceIds: Map<string, Set<string>>,
  rowsByTargetType: ReadonlyArray<readonly [string, readonly AffiliateLegacyRow[]]>,
): void => {
  for (const [targetType, publicRows] of rowsByTargetType) {
    for (const row of publicRows) {
      const organizationId = affiliateLegacyRowString(row, 'organizationId');
      if (!organizationId) continue;
      const organizationSourceIds = publicEntitySourceIds.get(`ORGANIZATION:${organizationId}`)
        ?? new Set<string>();
      for (const sourceId of organizationSourceIds) {
        addLegacyPublicEntitySource(publicEntitySourceIds, targetType, row.id, sourceId);
      }
    }
  }
};

const buildLegacyPublicEntitySourceIds = (input: Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  discoveryResultRows: readonly AffiliateLegacyDiscoveryResultRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  facilityRows: readonly AffiliateLegacyFacilityRow[];
  eventRows: readonly AffiliateLegacyEventRow[];
  teamRows: readonly AffiliateLegacyTeamRow[];
  intakeSourceIds: ReadonlyMap<string, string>;
  publishedIdFieldByTargetType: Readonly<Record<string, string>>;
}>): Map<string, Set<string>> => {
  const publicEntitySourceIds = new Map<string, Set<string>>();
  appendLegacyBasicPublicEntitySources({
    ...input,
    publicEntitySourceIds,
  });
  appendLegacyFacilityPublicEntitySources(publicEntitySourceIds, input.facilityRows);
  appendLegacyOrganizationLinkedPublicEntitySources(publicEntitySourceIds, [
    ['EVENT', input.eventRows],
    ['TEAM', input.teamRows],
  ]);
  return publicEntitySourceIds;
};
type AffiliateLegacyTargetContext = Readonly<{
  publishedIdFieldByTargetType: Readonly<Record<string, string>>;
  publicTargetKey: (lineageKey: string, targetType: string, targetId: unknown) => string;
  publicEntitySourceIds: Map<string, Set<string>>;
  sourceIdsForPublicEntity: (row: AffiliateLegacyRow, targetType: string) => string[];
  candidateIdByPublicTarget: Map<string, string>;
  targetLineageKey: (sourceId: string | null, supplySourceId: string | null) => string;
}>;
const buildLegacyTargetContext = (input: Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  discoveryResultRows: readonly AffiliateLegacyDiscoveryResultRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  facilityRows: readonly AffiliateLegacyFacilityRow[];
  eventRows: readonly AffiliateLegacyEventRow[];
  teamRows: readonly AffiliateLegacyTeamRow[];
  intakeSourceIds: ReadonlyMap<string, string>;
  candidateById: ReadonlyMap<string, AffiliateLegacyCandidateRow>;
  targetLineageKey: (sourceId: string | null, supplySourceId: string | null) => string;
}>): AffiliateLegacyTargetContext => {
  const {
    sourceRows,
    intakeRows,
    discoveryResultRows,
    candidateRows,
    facilityRows,
    eventRows,
    teamRows,
    intakeSourceIds,
    candidateById,
    targetLineageKey,
  } = input;
  const publishedIdFieldByTargetType: Readonly<Record<string, string>> = {
    EVENT: 'publishedEventId',
    TEAM: 'publishedTeamId',
    FACILITY: 'publishedFacilityId',
    ORGANIZATION: 'publishedOrganizationId',
  };
  const publicEntitySourceIds = buildLegacyPublicEntitySourceIds({
    sourceRows,
    intakeRows,
    discoveryResultRows,
    candidateRows,
    facilityRows,
    eventRows,
    teamRows,
    intakeSourceIds,
    publishedIdFieldByTargetType,
  });
  const publicTargetKey = (lineageKey: string, targetType: string, targetId: unknown): string => (
    `${lineageKey}:${affiliateLegacyTargetTypeForListing(targetType) ?? String(targetType ?? '').trim().toUpperCase()}:${String(targetId ?? '')}`
  );
  const sourceIdsForPublicEntity = (
    row: AffiliateLegacyRow,
    targetType: string,
  ): string[] => {
    const rowSourceId = affiliateLegacyRowString(row, 'sourceId');
    const linkedCandidate = rowSourceId ? candidateById.get(rowSourceId) : undefined;
    const sourceIds = new Set<string>();
    const directSourceId = linkedCandidate
      ? affiliateLegacyRowString(linkedCandidate, 'sourceId')
      : rowSourceId;
    if (directSourceId) sourceIds.add(directSourceId);
    for (const mappedSourceId of publicEntitySourceIds.get(`${targetType}:${row.id}`) ?? []) {
      sourceIds.add(mappedSourceId);
    }
    const sourceIdByLineage = new Map<string, string>();
    for (const sourceId of sourceIds) {
      const lineageKey = targetLineageKey(sourceId, null);
      const existingSourceId = sourceIdByLineage.get(lineageKey);
      if (!existingSourceId || sourceId < existingSourceId) {
        sourceIdByLineage.set(lineageKey, sourceId);
      }
    }
    return Array.from(sourceIdByLineage.values()).sort(codeUnitCompare);
  };
  const candidateIdByPublicTarget = new Map<string, string>();
  for (const candidate of candidateRows) {
    const sourceId = affiliateLegacyRowString(candidate, 'sourceId');
    const targetType = affiliateLegacyTargetTypeForListing(candidate.listingKind);
    const targetId = targetType
      ? affiliateLegacyRowString(candidate, publishedIdFieldByTargetType[targetType])
      : null;
    if (!sourceId || !targetType || !targetId) continue;
    const key = publicTargetKey(targetLineageKey(sourceId, null), targetType, targetId);
    const existingCandidateId = candidateIdByPublicTarget.get(key);
    if (!existingCandidateId || candidate.id < existingCandidateId) {
      candidateIdByPublicTarget.set(key, candidate.id);
    }
  }
  return {
    publishedIdFieldByTargetType,
    publicTargetKey,
    publicEntitySourceIds,
    sourceIdsForPublicEntity,
    candidateIdByPublicTarget,
    targetLineageKey,
  };
};
type AffiliateLegacyCanonicalPublicAssociation = Readonly<{
  kind: Extract<AffiliateLegacyRecordKind, 'ORGANIZATION' | 'EVENT' | 'TEAM' | 'FACILITY'>;
  targetType: string;
  targetId: string;
  row: AffiliateLegacyRow;
  sourceId: string | null;
  supplySourceId: string | null;
  lineageKey: string | null;
  shouldCreateTarget: boolean;
}>;
type AffiliateLegacyTargetPlanInput = Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  discoveryResultRows: readonly AffiliateLegacyDiscoveryResultRow[];
  mappingRows: readonly AffiliateLegacyMappingRow[];
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  intakeRunRows: readonly AffiliateLegacyIntakeRunRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
  scrapeRunRows: readonly AffiliateLegacyScrapeRunRow[];
  mappingJobRows: readonly AffiliateLegacyMappingJobRow[];
  approvalRows: readonly AffiliateLegacyApprovalRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  targetRows: readonly AffiliateLegacySupplyTargetRow[];
  organizationRows: readonly AffiliateLegacyOrganizationRow[];
  eventRows: readonly AffiliateLegacyEventRow[];
  teamRows: readonly AffiliateLegacyTeamRow[];
  facilityRows: readonly AffiliateLegacyFacilityRow[];
  roots: readonly AffiliateLegacyRootEvidence[];
  intakeSourceIds: ReadonlyMap<string, string>;
  intakeRootIdById: ReadonlyMap<string, string | null>;
  candidateById: ReadonlyMap<string, AffiliateLegacyCandidateRow>;
  approvalLineageById: ReadonlyMap<string, AffiliateLegacyResolvedApprovalLineage>;
  targetLineageKey: (sourceId: string | null, supplySourceId: string | null) => string;
}>;
const appendLegacyRecord = (
  records: AffiliateLegacyLineageRecord[],
  kind: AffiliateLegacyRecordKind,
  row: AffiliateLegacyRow,
  sourceId?: string | null,
  supplySourceId?: string | null,
  associationKey?: string | null,
): void => {
  records.push(affiliateLegacyRecord(kind, row, sourceId, supplySourceId, associationKey));
};

type AffiliateLegacyCaptureRecordInput = Pick<
  AffiliateLegacyTargetPlanInput,
  'sourceRows' | 'intakeRows' | 'pageRows' | 'intakeRunRows' | 'artifactRows'
  | 'discoveryResultRows' | 'intakeSourceIds'
> & { records: AffiliateLegacyLineageRecord[] };

const appendLegacyCaptureArtifacts = (input: AffiliateLegacyCaptureRecordInput): void => {
  const {
    records,
    pageRows,
    intakeRunRows,
    artifactRows,
    intakeSourceIds,
  } = input;
  for (const page of pageRows) {
    appendLegacyRecord(
      records,
      'CAPTURE_PAGE',
      page,
      intakeSourceIds.get(affiliateLegacyRowString(page, 'intakeId') ?? ''),
      affiliateLegacyRowString(page, 'supplySourceId'),
    );
  }
  for (const run of intakeRunRows) {
    appendLegacyRecord(
      records,
      'CAPTURE_RUN',
      run,
      intakeSourceIds.get(affiliateLegacyRowString(run, 'intakeId') ?? ''),
      affiliateLegacyRowString(run, 'supplySourceId'),
    );
  }
  for (const artifact of artifactRows) {
    appendLegacyRecord(
      records,
      'CAPTURE_ARTIFACT',
      artifact,
      intakeSourceIds.get(affiliateLegacyRowString(artifact, 'intakeId') ?? ''),
      affiliateLegacyRowString(artifact, 'supplySourceId'),
    );
  }
};

const appendLegacyDiscoveryResultRecords = (input: AffiliateLegacyCaptureRecordInput): void => {
  const {
    records,
    discoveryResultRows,
    intakeSourceIds,
  } = input;
  for (const result of discoveryResultRows) {
    const sourceId = affiliateLegacyRowString(result, 'matchingSourceId')
      ?? intakeSourceIds.get(affiliateLegacyRowString(result, 'matchingIntakeId') ?? '');
    appendLegacyRecord(
      records,
      'DISCOVERY_RESULT',
      result,
      sourceId,
      affiliateLegacyRowString(result, 'supplySourceId'),
    );
  }
};

const appendLegacyCaptureRecords = (input: AffiliateLegacyCaptureRecordInput): void => {
  const {
    records,
    sourceRows,
    intakeRows,
    intakeSourceIds,
  } = input;
  for (const source of sourceRows) appendLegacyRecord(records, 'SOURCE', source, source.id);
  for (const intake of intakeRows) {
    appendLegacyRecord(
      records,
      'INTAKE',
      intake,
      intakeSourceIds.get(intake.id),
      affiliateLegacyRowString(intake, 'supplySourceId'),
    );
  }
  appendLegacyCaptureArtifacts(input);
  appendLegacyDiscoveryResultRecords(input);
};

type AffiliateLegacyMappingRecordInput = Pick<
  AffiliateLegacyTargetPlanInput,
  'mappingRows' | 'scrapeRunRows' | 'mappingJobRows' | 'intakeSourceIds' | 'intakeRootIdById'
> & { records: AffiliateLegacyLineageRecord[] };

const appendLegacyMappingRecords = (input: AffiliateLegacyMappingRecordInput): void => {
  const {
    records,
    mappingRows,
    scrapeRunRows,
    mappingJobRows,
    intakeSourceIds,
    intakeRootIdById,
  } = input;
  for (const mapping of mappingRows) {
    appendLegacyRecord(
      records,
      'MAPPING',
      mapping,
      affiliateLegacyRowString(mapping, 'sourceId'),
      affiliateLegacyRowString(mapping, 'supplySourceId'),
    );
  }
  for (const run of scrapeRunRows) {
    appendLegacyRecord(
      records,
      'SCRAPE_RUN',
      run,
      affiliateLegacyRowString(run, 'sourceId'),
      affiliateLegacyRowString(run, 'supplySourceId'),
    );
  }
  for (const job of mappingJobRows) {
    const intakeId = affiliateLegacyRowString(job, 'intakeId');
    appendLegacyRecord(
      records,
      'MAPPING_JOB',
      job,
      affiliateLegacyRowString(job, 'sourceId')
        ?? (intakeId ? intakeSourceIds.get(intakeId) ?? null : null),
      affiliateLegacyRowString(job, 'supplySourceId')
        ?? (intakeId ? intakeRootIdById.get(intakeId) ?? null : null),
    );
  }
};

type AffiliateLegacyApprovalRecordInput = Pick<
  AffiliateLegacyTargetPlanInput,
  'approvalRows' | 'approvalLineageById'
> & { records: AffiliateLegacyLineageRecord[] };

const appendLegacyApprovalRecord = (
  records: AffiliateLegacyLineageRecord[],
  approval: AffiliateLegacyApprovalRow,
  lineage: AffiliateLegacyResolvedApprovalLineage | undefined,
): void => {
  const associations = lineage?.associations ?? [];
  const rootIds = new Set(
    associations
      .map((association) => association.supplySourceId)
      .filter((rootId): rootId is string => rootId !== null),
  );
  if (rootIds.size <= 1) {
    appendLegacyRecord(
      records,
      'APPROVAL_JOB',
      approval,
      lineage?.sourceId,
      lineage?.supplySourceId,
    );
    return;
  }
  for (const association of associations) {
    appendLegacyRecord(
      records,
      'APPROVAL_JOB',
      approval,
      association.sourceId,
      association.supplySourceId,
      `approval-lineage:${approval.id}:${association.sourceId ?? ''}:${association.supplySourceId ?? ''}:${association.intakeId ?? ''}`,
    );
  }
};

const appendLegacyApprovalRecords = (input: AffiliateLegacyApprovalRecordInput): void => {
  const {
    records,
    approvalRows,
    approvalLineageById,
  } = input;
  for (const approval of approvalRows) {
    appendLegacyApprovalRecord(records, approval, approvalLineageById.get(approval.id));
  }
};

type AffiliateLegacyEntityRecordInput = Pick<
  AffiliateLegacyTargetPlanInput,
  'candidateRows' | 'targetRows'
> & { records: AffiliateLegacyLineageRecord[] };

const appendLegacyEntityRecords = (input: AffiliateLegacyEntityRecordInput): void => {
  const { records, candidateRows, targetRows } = input;
  for (const candidate of candidateRows) {
    appendLegacyRecord(
      records,
      'CANDIDATE',
      candidate,
      affiliateLegacyRowString(candidate, 'sourceId'),
      affiliateLegacyRowString(candidate, 'supplySourceId'),
    );
  }
  for (const target of targetRows) {
    appendLegacyRecord(
      records,
      'PUBLIC_TARGET',
      target,
      affiliateLegacyRowString(target, 'sourceId'),
      affiliateLegacyRowString(target, 'supplySourceId'),
    );
  }
};

type AffiliateLegacyCanonicalRecordInput = Pick<
  AffiliateLegacyTargetPlanInput,
  'organizationRows' | 'eventRows' | 'teamRows' | 'facilityRows'
> & {
  records: AffiliateLegacyLineageRecord[];
  canonicalPublicAssociations: AffiliateLegacyCanonicalPublicAssociation[];
  targetContext: AffiliateLegacyTargetContext;
};

const isLegacyAffiliatePublicEntity = (row: AffiliateLegacyRow): boolean => (
  String(affiliateLegacyRowValue(row, 'originType') ?? '').trim().toUpperCase() === 'AFFILIATE_IMPORTED'
  || String(affiliateLegacyRowValue(row, 'sourceType') ?? '').trim().toUpperCase().includes('AFFILIATE')
  || Boolean(stringValue(affiliateLegacyRowValue(row, 'affiliateUrl')))
);

const appendLegacyCanonicalAssociation = (
  associations: AffiliateLegacyCanonicalPublicAssociation[],
  targetContext: AffiliateLegacyTargetContext,
  kind: AffiliateLegacyCanonicalPublicAssociation['kind'],
  targetType: string,
  row: AffiliateLegacyRow,
): void => {
  const sourceIds = targetContext.sourceIdsForPublicEntity(row, targetType);
  const supplySourceId = affiliateLegacyRowString(row, 'supplySourceId');
  const isAffiliateEntity = isLegacyAffiliatePublicEntity(row);
  if (sourceIds.length === 0 && !supplySourceId && !isAffiliateEntity) return;
  const lineageSources: Array<string | null> = sourceIds.length > 0 ? sourceIds : [null];
  for (const sourceId of lineageSources) {
    associations.push({
      kind,
      targetType,
      targetId: row.id,
      row,
      sourceId,
      supplySourceId,
      lineageKey: targetContext.targetLineageKey(sourceId, supplySourceId) || null,
      shouldCreateTarget: sourceIds.length > 0 || Boolean(supplySourceId),
    });
  }
};

const appendLegacyCanonicalRecords = (input: AffiliateLegacyCanonicalRecordInput): void => {
  const {
    records,
    canonicalPublicAssociations,
    organizationRows,
    eventRows,
    teamRows,
    facilityRows,
    targetContext,
  } = input;
  for (const organization of organizationRows) {
    appendLegacyCanonicalAssociation(
      canonicalPublicAssociations,
      targetContext,
      'ORGANIZATION',
      'ORGANIZATION',
      organization,
    );
  }
  for (const event of eventRows) {
    appendLegacyCanonicalAssociation(canonicalPublicAssociations, targetContext, 'EVENT', 'EVENT', event);
  }
  for (const team of teamRows) {
    appendLegacyCanonicalAssociation(canonicalPublicAssociations, targetContext, 'TEAM', 'TEAM', team);
  }
  for (const facility of facilityRows) {
    appendLegacyCanonicalAssociation(canonicalPublicAssociations, targetContext, 'FACILITY', 'FACILITY', facility);
  }
  for (const association of canonicalPublicAssociations) {
    appendLegacyRecord(
      records,
      association.kind,
      association.row,
      association.sourceId,
      association.supplySourceId,
      association.lineageKey,
    );
  }
};

const buildLegacyLineageRecords = (input: AffiliateLegacyTargetPlanInput, targetContext: AffiliateLegacyTargetContext): {
  records: AffiliateLegacyLineageRecord[];
  canonicalPublicAssociations: AffiliateLegacyCanonicalPublicAssociation[];
} => {
  const records: AffiliateLegacyLineageRecord[] = [];
  const canonicalPublicAssociations: AffiliateLegacyCanonicalPublicAssociation[] = [];
  appendLegacyCaptureRecords({ ...input, records });
  appendLegacyMappingRecords({ ...input, records });
  appendLegacyApprovalRecords({ ...input, records });
  appendLegacyEntityRecords({ ...input, records });
  appendLegacyCanonicalRecords({
    ...input,
    records,
    canonicalPublicAssociations,
    targetContext,
  });
  return { records, canonicalPublicAssociations };
};
const appendLegacyCanonicalTargets = (input: Readonly<{
  targets: AffiliateLegacyTargetEvidence[];
  existingTargetKeys: Set<string>;
  canonicalPublicAssociations: readonly AffiliateLegacyCanonicalPublicAssociation[];
  targetContext: AffiliateLegacyTargetContext;
}>): void => {
  const {
    targets,
    existingTargetKeys,
    canonicalPublicAssociations,
    targetContext,
  } = input;
  const {
    publicTargetKey,
    candidateIdByPublicTarget,
  } = targetContext;
  for (const association of canonicalPublicAssociations) {
    if (!association.shouldCreateTarget) continue;
    const lineageKey = association.lineageKey ?? '';
    const key = publicTargetKey(lineageKey, association.targetType, association.targetId);
    if (existingTargetKeys.has(key)) continue;
    const candidateId = candidateIdByPublicTarget.get(key) ?? null;
    targets.push({
      id: `canonical-public:${lineageKey}:${association.targetType}:${association.targetId}`,
      sourceId: association.sourceId,
      supplySourceId: association.supplySourceId,
      candidateId,
      targetType: association.targetType,
      targetId: association.targetId,
      status: 'OBSERVED',
      evidenceRefs: [
        `canonical:${association.targetType}:${association.targetId}`,
        ...(candidateId ? [`candidate:${candidateId}`] : []),
        ...(association.sourceId ? [`source:${association.sourceId}`] : []),
        `public-target:${association.targetType}:${association.targetId}`,
      ],
      isEvidenceVerifiable: false,
    });
    existingTargetKeys.add(key);
  }
};

const appendLegacyCandidateTargets = (input: Readonly<{
  targets: AffiliateLegacyTargetEvidence[];
  existingTargetKeys: Set<string>;
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  targetContext: AffiliateLegacyTargetContext;
}>): void => {
  const {
    targets,
    existingTargetKeys,
    candidateRows,
    targetContext,
  } = input;
  const {
    publishedIdFieldByTargetType,
    publicTargetKey,
  } = targetContext;
  for (const candidate of candidateRows) {
    const sourceId = affiliateLegacyRowString(candidate, 'sourceId');
    const listingTargetType = affiliateLegacyTargetTypeForListing(candidate.listingKind);
    if (!sourceId || !listingTargetType) continue;
    const targetId = affiliateLegacyRowString(candidate, publishedIdFieldByTargetType[listingTargetType]);
    if (!targetId) continue;
    const key = publicTargetKey(targetContext.targetLineageKey(sourceId, null), listingTargetType, targetId);
    if (existingTargetKeys.has(key)) continue;
    targets.push({
      id: `candidate-public:${candidate.id}:${listingTargetType}:${targetId}`,
      sourceId,
      candidateId: candidate.id,
      targetType: listingTargetType,
      targetId,
      status: 'OBSERVED',
      evidenceRefs: [
        `candidate:${candidate.id}`,
        `public-target:${listingTargetType}:${targetId}`,
      ],
      isEvidenceVerifiable: false,
    });
    existingTargetKeys.add(key);
  }
};

const isLegacyPublicEvent = (
  rows: readonly AffiliateLegacyEventRow[],
  targetId: string,
): boolean => {
  const event = rows.find((row) => row.id === targetId);
  if (!event) return false;
  const state = affiliateLegacyRowValue(event, 'state');
  return affiliateLegacyRowValue(event, 'archivedAt') === null
    && (state === null || upper(state) === 'PUBLISHED');
};

const isLegacyPublicTeam = (
  rows: readonly AffiliateLegacyTeamRow[],
  targetId: string,
): boolean => {
  const team = rows.find((row) => row.id === targetId);
  return Boolean(
    team
    && affiliateLegacyRowValue(team, 'archivedAt') === null
    && upper(affiliateLegacyRowValue(team, 'visibility')) === 'PUBLIC',
  );
};

const isLegacyActiveFacility = (
  rows: readonly AffiliateLegacyFacilityRow[],
  targetId: string,
): boolean => {
  const facility = rows.find((row) => row.id === targetId);
  return Boolean(facility && upper(affiliateLegacyRowValue(facility, 'status')) === 'ACTIVE');
};

const isLegacyPublicOrganization = (
  rows: readonly AffiliateLegacyOrganizationRow[],
  targetId: string,
): boolean => {
  const organization = rows.find((row) => row.id === targetId);
  return Boolean(
    organization
    && upper(affiliateLegacyRowValue(organization, 'status')) === 'LISTED'
    && affiliateLegacyRowValue(organization, 'publicPageEnabled') === true,
  );
};

const isLegacyCanonicalTargetPublic = (input: Readonly<{
  organizationRows: readonly AffiliateLegacyOrganizationRow[];
  eventRows: readonly AffiliateLegacyEventRow[];
  teamRows: readonly AffiliateLegacyTeamRow[];
  facilityRows: readonly AffiliateLegacyFacilityRow[];
}>, targetType: string, targetId: string | null): boolean => {
  if (!targetId) return false;
  const normalizedType = affiliateLegacyTargetTypeForListing(targetType) ?? upper(targetType);
  switch (normalizedType) {
    case 'EVENT':
      return isLegacyPublicEvent(input.eventRows, targetId);
    case 'TEAM':
      return isLegacyPublicTeam(input.teamRows, targetId);
    case 'FACILITY':
      return isLegacyActiveFacility(input.facilityRows, targetId);
    case 'ORGANIZATION':
      return isLegacyPublicOrganization(input.organizationRows, targetId);
    default:
      return false;
  }
};

const legacyTargetMetadata = (metadata: unknown): unknown => (
  metadata === Prisma.JsonNull ? null : metadata ?? null
);

type LegacyTargetEvidencePublicRows = Readonly<{
  organizationRows: readonly AffiliateLegacyOrganizationRow[];
  eventRows: readonly AffiliateLegacyEventRow[];
  teamRows: readonly AffiliateLegacyTeamRow[];
  facilityRows: readonly AffiliateLegacyFacilityRow[];
}>;

const legacyTargetEvidenceDates = (
  target: AffiliateLegacySupplyTargetRow,
) => ({
  publishedAt: snapshotTargetDate(target.publishedAt) ?? null,
  lastSuccessfulRefreshAt: snapshotTargetDate(target.lastSuccessfulRefreshAt) ?? null,
  freshnessExpiresAt: snapshotTargetDate(target.freshnessExpiresAt) ?? null,
  rejectedAt: snapshotTargetDate(target.rejectedAt) ?? null,
});

const legacyTargetEvidenceDetails = (
  target: AffiliateLegacySupplyTargetRow,
) => ({
  sourceProfile: target.sourceProfile ?? null,
  marketKey: target.marketKey ?? null,
  sportId: target.sportId ?? null,
  rejectionReason: target.rejectionReason ?? null,
  metadata: legacyTargetMetadata(target.metadata),
  evidenceHash: target.evidenceHash ?? null,
});

const legacyTargetEvidenceIsVerifiable = (
  target: AffiliateLegacySupplyTargetRow,
  publicRows: LegacyTargetEvidencePublicRows,
): boolean => (
  ['PUBLISHED', 'LAST_KNOWN_GOOD'].includes(String(target.status ?? '').toUpperCase())
  && isLegacyCanonicalTargetPublic(publicRows, target.targetType, target.targetId)
);

const buildLegacyTargetEvidenceRow = (
  target: AffiliateLegacySupplyTargetRow,
  publicRows: LegacyTargetEvidencePublicRows,
): AffiliateLegacyTargetEvidence => ({
  id: target.id,
  sourceId: affiliateLegacyRowString(target, 'sourceId'),
  supplySourceId: affiliateLegacyRowString(target, 'supplySourceId'),
  candidateId: affiliateLegacyRowString(target, 'candidateId'),
  targetType: affiliateLegacyRowString(target, 'targetType') ?? '',
  targetId: affiliateLegacyRowString(target, 'targetId'),
  ...legacyTargetEvidenceDetails(target),
  ...legacyTargetEvidenceDates(target),
  status: affiliateLegacyRowString(target, 'status'),
  evidenceRefs: [
    ...stringArray(target.evidenceRefs),
    `legacy-target:${target.id}`,
  ],
  isEvidenceVerifiable: legacyTargetEvidenceIsVerifiable(target, publicRows),
});

const buildLegacyTargetEvidence = (input: Readonly<{
  targetRows: readonly AffiliateLegacySupplyTargetRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  canonicalPublicAssociations: readonly AffiliateLegacyCanonicalPublicAssociation[];
  targetContext: AffiliateLegacyTargetContext;
  organizationRows: readonly AffiliateLegacyOrganizationRow[];
  eventRows: readonly AffiliateLegacyEventRow[];
  teamRows: readonly AffiliateLegacyTeamRow[];
  facilityRows: readonly AffiliateLegacyFacilityRow[];
}>): AffiliateLegacyTargetEvidence[] => {
  const {
    targetRows,
    candidateRows,
    canonicalPublicAssociations,
    targetContext,
    organizationRows,
    eventRows,
    teamRows,
    facilityRows,
  } = input;
  const publicRows = {
    organizationRows,
    eventRows,
    teamRows,
    facilityRows,
  };
  const targets: AffiliateLegacyTargetEvidence[] = targetRows.map((target) => (
    buildLegacyTargetEvidenceRow(target, publicRows)
  ));
  const existingTargetKeys = new Set(targets.map((target) => (
    targetContext.publicTargetKey(
      targetContext.targetLineageKey(target.sourceId ?? null, target.supplySourceId ?? null),
      target.targetType,
      target.targetId,
    )
  )));
  appendLegacyCanonicalTargets({
    targets,
    existingTargetKeys,
    canonicalPublicAssociations,
    targetContext,
  });
  appendLegacyCandidateTargets({
    targets,
    existingTargetKeys,
    candidateRows,
    targetContext,
  });
  return targets;
};
const buildLegacyTargetPlan = (input: Readonly<{
  sourceRows: readonly AffiliateLegacySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  discoveryResultRows: readonly AffiliateLegacyDiscoveryResultRow[];
  mappingRows: readonly AffiliateLegacyMappingRow[];
  pageRows: readonly AffiliateLegacyIntakePageRow[];
  intakeRunRows: readonly AffiliateLegacyIntakeRunRow[];
  artifactRows: readonly AffiliateLegacyIntakeArtifactRow[];
  scrapeRunRows: readonly AffiliateLegacyScrapeRunRow[];
  mappingJobRows: readonly AffiliateLegacyMappingJobRow[];
  approvalRows: readonly AffiliateLegacyApprovalRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  targetRows: readonly AffiliateLegacySupplyTargetRow[];
  organizationRows: readonly AffiliateLegacyOrganizationRow[];
  eventRows: readonly AffiliateLegacyEventRow[];
  teamRows: readonly AffiliateLegacyTeamRow[];
  facilityRows: readonly AffiliateLegacyFacilityRow[];
  roots: readonly AffiliateLegacyRootEvidence[];
  intakeSourceIds: ReadonlyMap<string, string>;
  intakeRootIdById: ReadonlyMap<string, string | null>;
  candidateById: ReadonlyMap<string, AffiliateLegacyCandidateRow>;
  approvalLineageById: ReadonlyMap<string, AffiliateLegacyResolvedApprovalLineage>;
  targetLineageKey: (sourceId: string | null, supplySourceId: string | null) => string;
}>): {
  records: AffiliateLegacyLineageRecord[];
  targets: AffiliateLegacyTargetEvidence[];
} => {
  const targetContext = buildLegacyTargetContext({
    sourceRows: input.sourceRows,
    intakeRows: input.intakeRows,
    discoveryResultRows: input.discoveryResultRows,
    candidateRows: input.candidateRows,
    facilityRows: input.facilityRows,
    eventRows: input.eventRows,
    teamRows: input.teamRows,
    intakeSourceIds: input.intakeSourceIds,
    candidateById: input.candidateById,
    targetLineageKey: input.targetLineageKey,
  });
  const lineage = buildLegacyLineageRecords(input, targetContext);
  return {
    records: lineage.records,
    targets: buildLegacyTargetEvidence({
      targetRows: input.targetRows,
      candidateRows: input.candidateRows,
      canonicalPublicAssociations: lineage.canonicalPublicAssociations,
      targetContext,
      organizationRows: input.organizationRows,
      eventRows: input.eventRows,
      teamRows: input.teamRows,
      facilityRows: input.facilityRows,
    }),
  };
};
type AffiliateLegacyClaimStageContext = Readonly<{
  now: Date;
  sourceEvidence: readonly AffiliateLegacySourceEvidence[];
  canonicalSourceRowById: ReadonlyMap<string, AffiliateLegacySourceRow>;
  supplySourceRows: readonly AffiliateLegacySupplySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  mappingRows: readonly AffiliateLegacyMappingRow[];
  mappingJobRows: readonly AffiliateLegacyMappingJobRow[];
  intakeRunRows: readonly AffiliateLegacyIntakeRunRow[];
  approvalRows: readonly AffiliateLegacyApprovalRow[];
  discoveryRunRows: readonly AffiliateLegacyDiscoveryRunRow[];
  coverageJobRows: readonly AffiliateLegacyCoverageJobRow[];
  gatewayClaimRows: readonly AffiliateLegacyGatewayClaimRow[];
  gatewayJobRows: readonly AffiliateLegacyGatewayJobRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  targets: readonly AffiliateLegacyTargetEvidence[];
  intakeSourceIds: ReadonlyMap<string, string>;
  intakeRootIdById: ReadonlyMap<string, string | null>;
  approvalLineageById: ReadonlyMap<string, AffiliateLegacyResolvedApprovalLineage>;
  approvalLineageRows: readonly AffiliateLegacyStageEvidenceRow[];
}>;

const appendLegacyClaimEvidence = (
  claims: AffiliateLegacyClaimEvidence[],
  kind: AffiliateLegacyClaimEvidence['kind'],
  row: AffiliateLegacyRow,
  sourceId?: string | null,
  supplySourceId?: string | null,
  subjectId?: string | null,
  gatewayJob?: AffiliateLegacyGatewayJobRow,
): void => {
  claims.push({
    kind,
    id: row.id,
    sourceId: sourceId ?? affiliateLegacyRowString(row, 'sourceId'),
    supplySourceId: supplySourceId ?? affiliateLegacyRowString(row, 'supplySourceId'),
    subjectId: subjectId ?? affiliateLegacyRowString(row, 'jobId', 'subjectId'),
    role: affiliateLegacyRowString(row, 'role', 'reviewerRole'),
    workerId: affiliateLegacyRowString(row, 'workerId', 'reviewerId'),
    claimGeneration: typeof affiliateLegacyRowValue(row, 'claimGeneration') === 'number'
      ? affiliateLegacyRowValue(row, 'claimGeneration') as number
      : null,
    status: affiliateLegacyClaimStatus(row),
    leaseExpiresAt: snapshotTargetDate(
      affiliateLegacyRowValue(row, 'leaseExpiresAt') as Date | null,
    ),
    tokenExpiresAt: snapshotTargetDate(
      affiliateLegacyRowValue(row, 'tokenExpiresAt') as Date | null,
    ),
    endedAt: snapshotTargetDate(
      affiliateLegacyRowValue(row, 'endedAt') as Date | null,
    ),
    tokenInvalidatedAt: snapshotTargetDate(
      affiliateLegacyRowValue(row, 'tokenInvalidatedAt') as Date | null,
    ),
    ...(gatewayJob
      ? {
          gatewayJobStatus: affiliateLegacyRowString(gatewayJob, 'status'),
          gatewayJobActiveClaimId: affiliateLegacyRowString(gatewayJob, 'activeClaimId'),
          gatewayJobClaimGeneration: typeof affiliateLegacyRowValue(gatewayJob, 'claimGeneration') === 'number'
            ? affiliateLegacyRowValue(gatewayJob, 'claimGeneration') as number
            : null,
        }
      : {}),
  });
};

const appendLegacyMappingJobClaims = (
  context: AffiliateLegacyClaimStageContext,
  claims: AffiliateLegacyClaimEvidence[],
): void => {
  for (const job of context.mappingJobRows) {
    const intakeId = affiliateLegacyRowString(job, 'intakeId');
    appendLegacyClaimEvidence(
      claims,
      'MAPPING_JOB',
      job,
      affiliateLegacyRowString(job, 'sourceId')
        ?? (intakeId ? context.intakeSourceIds.get(intakeId) ?? null : null),
      affiliateLegacyRowString(job, 'supplySourceId')
        ?? (intakeId ? context.intakeRootIdById.get(intakeId) ?? null : null),
    );
  }
};

const appendLegacyIntakeRunClaims = (
  context: AffiliateLegacyClaimStageContext,
  claims: AffiliateLegacyClaimEvidence[],
): void => {
  for (const run of context.intakeRunRows) {
    const intakeId = affiliateLegacyRowString(run, 'intakeId');
    appendLegacyClaimEvidence(
      claims,
      'INTAKE_RUN',
      run,
      context.intakeSourceIds.get(intakeId ?? ''),
      affiliateLegacyRowString(run, 'supplySourceId'),
      intakeId,
    );
  }
};

const appendLegacyApprovalClaims = (
  context: AffiliateLegacyClaimStageContext,
  claims: AffiliateLegacyClaimEvidence[],
): void => {
  for (const approval of context.approvalRows) {
    const lineage = context.approvalLineageById.get(approval.id);
    appendLegacyClaimEvidence(
      claims,
      'APPROVAL_JOB',
      approval,
      lineage?.sourceId,
      lineage?.supplySourceId,
      affiliateLegacyRowString(approval, 'subjectKey', 'subjectId'),
    );
  }
};

const appendLegacySimpleClaimRows = (
  claims: AffiliateLegacyClaimEvidence[],
  kind: Extract<AffiliateLegacyClaimEvidence['kind'], 'DISCOVERY_RUN' | 'COVERAGE_JOB'>,
  rows: readonly AffiliateLegacyRow[],
): void => {
  for (const row of rows) {
    appendLegacyClaimEvidence(
      claims,
      kind,
      row,
      affiliateLegacyRowString(row, 'sourceId'),
      affiliateLegacyRowString(row, 'supplySourceId'),
    );
  }
};

const legacyGatewayClaimSourceId = (
  claim: AffiliateLegacyGatewayClaimRow,
  envelope: Record<string, unknown>,
  subject: Record<string, unknown>,
): string | null => affiliateLegacyRowString(claim, 'sourceId')
  ?? affiliateLegacyRowString(envelope, 'sourceId')
  ?? affiliateLegacyRowString(subject, 'sourceId');

const legacyGatewayClaimSupplySourceId = (
  claim: AffiliateLegacyGatewayClaimRow,
  envelope: Record<string, unknown>,
  subject: Record<string, unknown>,
): string | null => affiliateLegacyRowString(claim, 'supplySourceId')
  ?? affiliateLegacyRowString(envelope, 'supplySourceId')
  ?? affiliateLegacyRowString(subject, 'supplySourceId');

const legacyGatewayClaimSubjectId = (
  claim: AffiliateLegacyGatewayClaimRow,
  envelope: Record<string, unknown>,
  subject: Record<string, unknown>,
): string | null => affiliateLegacyRowString(claim, 'jobId', 'subjectId')
  ?? affiliateLegacyRowString(envelope, 'jobId', 'subjectId')
  ?? affiliateLegacyRowString(subject, 'jobId', 'subjectId');

const legacyGatewayClaimSubject = (
  claim: AffiliateLegacyGatewayClaimRow,
): Readonly<{
  envelope: Record<string, unknown>;
  subject: Record<string, unknown>;
  sourceId: string | null;
  supplySourceId: string | null;
  subjectId: string | null;
}> => {
  const envelope = affiliateLegacyJsonObject(claim.claimEnvelopeJson);
  const subject = affiliateLegacyJsonObject(envelope.subject);
  return {
    envelope,
    subject,
    sourceId: legacyGatewayClaimSourceId(claim, envelope, subject),
    supplySourceId: legacyGatewayClaimSupplySourceId(claim, envelope, subject),
    subjectId: legacyGatewayClaimSubjectId(claim, envelope, subject),
  };
};

const LEGACY_GATEWAY_ACTIVE_CLAIM_STATUSES = [
  'ACTIVE',
  'CLAIMED',
  'IN_PROGRESS',
  'INVOKING',
  'LEASED',
  'PROCESSING',
  'RUNNING',
  'STARTING',
];

const isLegacyGatewayExpiryElapsed = (value: unknown, now: Date): boolean => {
  const expiresAt = toDate(value);
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
};

const isLegacyGatewayClaimExpired = (
  claim: AffiliateLegacyGatewayClaimRow,
  now: Date,
): boolean => {
  const claimStatus = upper(affiliateLegacyRowString(claim, 'status'));
  const leaseExpired = isLegacyGatewayExpiryElapsed(
    affiliateLegacyRowValue(claim, 'leaseExpiresAt'),
    now,
  );
  const tokenExpired = isLegacyGatewayExpiryElapsed(
    affiliateLegacyRowValue(claim, 'tokenExpiresAt'),
    now,
  );
  return claimStatus === 'EXPIRED'
    || (
      LEGACY_GATEWAY_ACTIVE_CLAIM_STATUSES.includes(claimStatus)
      && (leaseExpired || tokenExpired)
    );
};

const isLegacyGatewayJobClaimPaired = (
  claim: AffiliateLegacyGatewayClaimRow,
  job: AffiliateLegacyGatewayJobRow | undefined,
): boolean => {
  const claimGeneration = affiliateLegacyRowValue(claim, 'claimGeneration');
  if (!job || typeof claimGeneration !== 'number' || !Number.isInteger(claimGeneration)) return false;
  const claimedPair = upper(job.status) === 'CLAIMED' && job.activeClaimId === claim.id;
  const retryPair = upper(job.status) === 'RETRY_WAIT' && job.activeClaimId === null;
  return job.claimGeneration === claimGeneration && (claimedPair || retryPair);
};

const legacyGatewayClaimGenerationMatches = (
  claim: AffiliateLegacyGatewayClaimRow,
  job: AffiliateLegacyGatewayJobRow | undefined,
): boolean => {
  const claimGeneration = affiliateLegacyRowValue(claim, 'claimGeneration');
  return Boolean(
    job
    && typeof claimGeneration === 'number'
    && Number.isInteger(claimGeneration)
    && job.claimGeneration === claimGeneration,
  );
};

const legacyGatewayClaimOwnsClaimedJob = (
  claim: AffiliateLegacyGatewayClaimRow,
  job: AffiliateLegacyGatewayJobRow | undefined,
): boolean => Boolean(
  job
  && upper(job.status) === 'CLAIMED'
  && job.activeClaimId === claim.id
  && legacyGatewayClaimGenerationMatches(claim, job),
);

const isLegacyGatewayClaimTerminal = (claim: AffiliateLegacyGatewayClaimRow): boolean => {
  const status = upper(affiliateLegacyRowString(claim, 'status'));
  return status !== 'EXPIRED' && !LEGACY_GATEWAY_ACTIVE_CLAIM_STATUSES.includes(status);
};

const appendLegacyGatewayClaimFindings = (
  claim: AffiliateLegacyGatewayClaimRow,
  job: AffiliateLegacyGatewayJobRow | undefined,
  now: Date,
  findings: AffiliateCutoverFinding[],
): void => {
  if (isLegacyGatewayClaimTerminal(claim) && legacyGatewayClaimOwnsClaimedJob(claim, job)) {
    findings.push({
      code: 'TERMINAL_CLAIM_OWNS_CLAIMED_JOB',
      severity: 'BLOCKING',
      detail: `Terminal Gateway claim ${claim.id} still owns claimed job ${job?.id}.`,
      recordIds: [claim.id, job?.id ?? ''].filter(Boolean).sort(codeUnitCompare),
      resolution: 'Clear the terminal claim from the job or restore one consistent active claim before apply.',
    });
    return;
  }
  if (isLegacyGatewayClaimExpired(claim, now) && !isLegacyGatewayJobClaimPaired(claim, job)) {
    const jobId = affiliateLegacyRowString(claim, 'jobId');
    findings.push({
      code: 'GATEWAY_CLAIM_JOB_MISMATCH',
      severity: 'BLOCKING',
      detail: `Expired Gateway claim ${claim.id} is not paired with its job at the same claim generation.`,
      recordIds: [claim.id, ...(jobId ? [jobId] : [])].sort(codeUnitCompare),
      resolution: 'Resolve the Gateway claim and job status, active claim ID, and claim generation before apply.',
    });
  }
};

const appendLegacyClaimedGatewayJobFindings = (
  gatewayClaimRows: readonly AffiliateLegacyGatewayClaimRow[],
  gatewayJobRows: readonly AffiliateLegacyGatewayJobRow[],
  findings: AffiliateCutoverFinding[],
): void => {
  const gatewayClaimById = new Map(gatewayClaimRows.map((claim) => [claim.id, claim]));
  for (const job of gatewayJobRows) {
    if (upper(job.status) !== 'CLAIMED') continue;
    const activeClaimId = affiliateLegacyRowString(job, 'activeClaimId');
    const claim = activeClaimId ? gatewayClaimById.get(activeClaimId) : undefined;
    const hasExistingMismatch = findings.some((finding) => (
      finding.code === 'GATEWAY_CLAIM_JOB_MISMATCH'
      && finding.recordIds.includes(job.id)
    ));
    if (hasExistingMismatch || (claim && isLegacyGatewayJobClaimPaired(claim, job))) continue;
    findings.push({
      code: 'GATEWAY_CLAIM_JOB_MISMATCH',
      severity: 'BLOCKING',
      detail: `Claimed Gateway job ${job.id} does not have an active claim at the same generation.`,
      recordIds: [job.id, ...(activeClaimId ? [activeClaimId] : [])].sort(codeUnitCompare),
      resolution: 'Restore the active Gateway claim, active claim ID, and claim generation before apply.',
    });
  }
};

const appendLegacyGatewayClaims = (
  context: AffiliateLegacyClaimStageContext,
  claims: AffiliateLegacyClaimEvidence[],
): AffiliateCutoverFinding[] => {
  const gatewayJobById = new Map(context.gatewayJobRows.map((job) => [job.id, job]));
  const findings: AffiliateCutoverFinding[] = [];
  for (const claim of context.gatewayClaimRows) {
    const subject = legacyGatewayClaimSubject(claim);
    const job = gatewayJobById.get(affiliateLegacyRowString(claim, 'jobId') ?? '');
    appendLegacyClaimEvidence(
      claims,
      'GATEWAY_CLAIM',
      claim,
      subject.sourceId,
      subject.supplySourceId,
      subject.subjectId,
      job,
    );
    appendLegacyGatewayClaimFindings(claim, job, context.now, findings);
  }
  appendLegacyClaimedGatewayJobFindings(
    context.gatewayClaimRows,
    context.gatewayJobRows,
    findings,
  );
  return findings;
};

const legacyStageSourceRow = (
  source: AffiliateLegacySourceEvidence,
  canonicalSourceRowById: ReadonlyMap<string, AffiliateLegacySourceRow>,
  intakeRows: readonly AffiliateLegacyIntakeRow[],
): AffiliateLegacyRow | null => canonicalSourceRowById.get(source.liveSourceId ?? source.id)
  ?? (source.intakeId
    ? intakeRows.find((row) => row.id === source.intakeId) ?? null
    : null);

const legacyStageIntakeIds = (
  source: AffiliateLegacySourceEvidence,
  intakeRows: readonly AffiliateLegacyIntakeRow[],
): Set<string> => new Set(
  intakeRows
    .filter((intake) => (
      intake.id === source.intakeId
      || affiliateLegacyRowString(intake, 'affiliateSourceId', 'sourceId') === source.id
    ))
    .map((intake) => intake.id),
);

const deriveLegacyStageForSource = (
  context: AffiliateLegacyClaimStageContext,
  rootRowById: ReadonlyMap<string, AffiliateLegacySupplySourceRow>,
  source: AffiliateLegacySourceEvidence,
): AffiliateSupplyLifecycleStage => {
  const sourceRow = legacyStageSourceRow(source, context.canonicalSourceRowById, context.intakeRows);
  const rootId = source.existingSupplySourceId
    ?? affiliateLegacyRowString(sourceRow ?? {}, 'supplySourceId');
  return deriveAffiliateLegacyStageFromEvidence({
    sourceId: source.id,
    rootId,
    intakeIds: Array.from(legacyStageIntakeIds(source, context.intakeRows)),
    root: rootId ? rootRowById.get(rootId) ?? null : null,
    source: sourceRow,
    mappings: context.mappingRows,
    approvals: context.approvalLineageRows,
    candidates: context.candidateRows,
    targets: context.targets,
  });
};

const deriveLegacyStages = (
  context: AffiliateLegacyClaimStageContext,
): Record<string, AffiliateSupplyLifecycleStage> => {
  const derivedStages: Record<string, AffiliateSupplyLifecycleStage> = {};
  const rootRowById = new Map(context.supplySourceRows.map((row) => [row.id, row]));
  for (const source of context.sourceEvidence) {
    if (derivedStages[source.id]) continue;
    derivedStages[source.id] = deriveLegacyStageForSource(context, rootRowById, source);
  }
  return derivedStages;
};

const buildLegacyClaimsAndStages = (input: Readonly<{
  now: Date;
  sourceEvidence: readonly AffiliateLegacySourceEvidence[];
  canonicalSourceRowById: ReadonlyMap<string, AffiliateLegacySourceRow>;
  supplySourceRows: readonly AffiliateLegacySupplySourceRow[];
  intakeRows: readonly AffiliateLegacyIntakeRow[];
  mappingRows: readonly AffiliateLegacyMappingRow[];
  mappingJobRows: readonly AffiliateLegacyMappingJobRow[];
  intakeRunRows: readonly AffiliateLegacyIntakeRunRow[];
  approvalRows: readonly AffiliateLegacyApprovalRow[];
  discoveryRunRows: readonly AffiliateLegacyDiscoveryRunRow[];
  coverageJobRows: readonly AffiliateLegacyCoverageJobRow[];
  gatewayClaimRows: readonly AffiliateLegacyGatewayClaimRow[];
  gatewayJobRows: readonly AffiliateLegacyGatewayJobRow[];
  candidateRows: readonly AffiliateLegacyCandidateRow[];
  targets: readonly AffiliateLegacyTargetEvidence[];
  intakeSourceIds: ReadonlyMap<string, string>;
  intakeRootIdById: ReadonlyMap<string, string | null>;
  approvalLineageById: ReadonlyMap<string, AffiliateLegacyResolvedApprovalLineage>;
  approvalLineageRows: readonly AffiliateLegacyStageEvidenceRow[];
}>): {
  claims: AffiliateLegacyClaimEvidence[];
  gatewayClaimFindings: AffiliateCutoverFinding[];
  derivedStages: Record<string, AffiliateSupplyLifecycleStage>;
} => {
  const context: AffiliateLegacyClaimStageContext = input;
  const claims: AffiliateLegacyClaimEvidence[] = [];
  appendLegacyMappingJobClaims(context, claims);
  appendLegacyIntakeRunClaims(context, claims);
  appendLegacyApprovalClaims(context, claims);
  appendLegacySimpleClaimRows(claims, 'DISCOVERY_RUN', context.discoveryRunRows);
  appendLegacySimpleClaimRows(claims, 'COVERAGE_JOB', context.coverageJobRows);
  const gatewayClaimFindings = appendLegacyGatewayClaims(context, claims);
  return {
    claims,
    gatewayClaimFindings,
    derivedStages: deriveLegacyStages(context),
  };
};
type AffiliateLegacyReconciliationBase = Readonly<{
  database: AffiliateSupplyDatabase;
  now: Date;
  mode: 'DRY_RUN' | 'APPLY';
  legacySnapshot: AffiliateLegacyDatabaseSnapshot;
}>;

type AffiliateLegacyReconciliationEvidence = Readonly<{
  sourceEvidence: AffiliateLegacySourceEvidence[];
  sourceEvidenceFindings: AffiliateCutoverFinding[];
  approvalLineageById: ReadonlyMap<string, AffiliateLegacyResolvedApprovalLineage>;
  approvalLineageRows: AffiliateLegacyStageEvidenceRow[];
  approvalLineageFindings: AffiliateCutoverFinding[];
  approvalStateFindings: AffiliateCutoverFinding[];
  roots: AffiliateLegacyRootEvidence[];
  records: AffiliateLegacyLineageRecord[];
  targets: AffiliateLegacyTargetEvidence[];
  claims: AffiliateLegacyClaimEvidence[];
  gatewayClaimFindings: AffiliateCutoverFinding[];
  derivedStages: Record<string, AffiliateSupplyLifecycleStage>;
  canonicalPublicRecordKinds: ReadonlySet<AffiliateLegacyRecordKind>;
}>;

type AffiliateLegacyReconciliationPolicy = Readonly<{
  cutoverSession: AffiliateCutoverRollbackSession | null;
  cutoverSessionHash: string | null;
  contract: ActiveAffiliateSupplyContractResult;
  rolloutCohort: string;
}>;

type AffiliateLegacyReconciliationPreparation = Readonly<
  AffiliateLegacyReconciliationBase
  & AffiliateLegacyReconciliationEvidence
  & AffiliateLegacyReconciliationPolicy
  & {
    report: AffiliateLegacyReconciliationReport;
    appliedRun: AffiliateLegacyAppliedReconciliationRun | null;
    appliedReport: AffiliateLegacyReconciliationReport | null;
  }
>;

const buildLegacyRootEvidence = (
  supplySourceRows: readonly AffiliateLegacySupplySourceRow[],
): AffiliateLegacyRootEvidence[] => supplySourceRows.map((root) => ({
  id: root.id,
  identityKey: affiliateLegacyRowString(root, 'identityKey') ?? root.id,
  canonicalUrl: affiliateLegacyRowString(root, 'canonicalUrl') ?? '',
  origin: affiliateLegacyRowString(root, 'origin') ?? '',
  pathKey: affiliateLegacyRowString(root, 'pathKey') ?? '',
  predecessorId: affiliateLegacyRowString(root, 'predecessorId'),
  successorId: affiliateLegacyRowString(root, 'successorId'),
  derivedStage: affiliateLegacyRowString(root, 'derivedStage'),
  isAutomationEnabled: affiliateLegacyRowValue(root, 'isAutomationEnabled') === true,
}));

type AffiliateLegacyIdentityContext = Readonly<{
  rootIdentityKeyById: ReadonlyMap<string, string>;
  rootIdsByIdentity: ReadonlyMap<string, readonly string[]>;
  sourceEvidenceById: ReadonlyMap<string, AffiliateLegacySourceEvidence>;
  sourceIdentityKeyById: ReadonlyMap<string, string>;
  targetLineageKey: (sourceId: string | null, supplySourceId: string | null) => string;
}>;

const resolveLegacySourceIdentityKey = (
  source: AffiliateLegacySourceEvidence,
  rootIdentityKeyById: ReadonlyMap<string, string>,
): string => {
  if (source.existingSupplySourceId) {
    return rootIdentityKeyById.get(source.existingSupplySourceId) ?? source.existingSupplySourceId;
  }
  if (!source.requestedUrl) return source.id;
  try {
    return normalizeAffiliateSupplyIdentity({
      requestedUrl: source.requestedUrl,
      resolvedCanonicalUrl: source.resolvedCanonicalUrl ?? source.requestedUrl,
      isRedirectVerified: source.isRedirectVerified === true,
      operatorDomain: source.operatorDomain,
    }).identityKey;
  } catch {
    return source.existingSupplySourceId
      ? rootIdentityKeyById.get(source.existingSupplySourceId) ?? source.existingSupplySourceId
      : source.id;
  }
};

const buildLegacySourceIdentityKeys = (
  sourceEvidence: readonly AffiliateLegacySourceEvidence[],
  rootIdentityKeyById: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> => {
  const sourceIdentityKeysById = new Map<string, Set<string>>();
  for (const source of sourceEvidence) {
    const identityKey = resolveLegacySourceIdentityKey(source, rootIdentityKeyById);
    const identityKeys = sourceIdentityKeysById.get(source.id) ?? new Set<string>();
    identityKeys.add(identityKey);
    sourceIdentityKeysById.set(source.id, identityKeys);
  }
  const sourceIdentityKeyById = new Map<string, string>();
  for (const [sourceId, identityKeys] of sourceIdentityKeysById) {
    if (identityKeys.size === 1) sourceIdentityKeyById.set(sourceId, [...identityKeys][0]);
  }
  return sourceIdentityKeyById;
};

const resolveLegacyTargetLineageKey = (input: Readonly<{
  sourceId: string | null;
  supplySourceId: string | null;
  rootIdentityKeyById: ReadonlyMap<string, string>;
  rootIdsByIdentity: ReadonlyMap<string, readonly string[]>;
  sourceEvidenceById: ReadonlyMap<string, AffiliateLegacySourceEvidence>;
  sourceIdentityKeyById: ReadonlyMap<string, string>;
}>): string => {
  const {
    sourceId,
    supplySourceId,
    rootIdentityKeyById,
    rootIdsByIdentity,
    sourceEvidenceById,
    sourceIdentityKeyById,
  } = input;
  if (supplySourceId) return rootIdentityKeyById.get(supplySourceId) ?? supplySourceId;
  if (!sourceId) return '';
  const source = sourceEvidenceById.get(sourceId);
  if (source?.existingSupplySourceId) {
    return rootIdentityKeyById.get(source.existingSupplySourceId) ?? source.existingSupplySourceId;
  }
  const sourceIdentityKey = sourceIdentityKeyById.get(sourceId);
  return sourceIdentityKey && rootIdsByIdentity.has(sourceIdentityKey)
    ? sourceIdentityKey
    : sourceIdentityKey ?? sourceId;
};

const buildLegacyIdentityContext = (input: Readonly<{
  roots: readonly AffiliateLegacyRootEvidence[];
  sourceEvidence: readonly AffiliateLegacySourceEvidence[];
}>): AffiliateLegacyIdentityContext => {
  const rootIdentityKeyById = new Map(
    input.roots.map((root) => [root.id, root.identityKey || root.pathKey || root.id]),
  );
  const rootIdsByIdentity = new Map<string, string[]>();
  for (const root of input.roots) {
    const identityKey = root.identityKey || root.pathKey || root.id;
    const ids = rootIdsByIdentity.get(identityKey) ?? [];
    ids.push(root.id);
    rootIdsByIdentity.set(identityKey, ids);
  }
  const sourceEvidenceById = new Map(input.sourceEvidence.map((source) => [source.id, source]));
  const sourceIdentityKeyById = buildLegacySourceIdentityKeys(
    input.sourceEvidence,
    rootIdentityKeyById,
  );
  return {
    rootIdentityKeyById,
    rootIdsByIdentity,
    sourceEvidenceById,
    sourceIdentityKeyById,
    targetLineageKey: (sourceId, supplySourceId) => resolveLegacyTargetLineageKey({
      sourceId,
      supplySourceId,
      rootIdentityKeyById,
      rootIdsByIdentity,
      sourceEvidenceById,
      sourceIdentityKeyById,
    }),
  };
};

const readLegacyReconciliationBase = async (
  input: AffiliateLegacySupplyReconciliationInternalInput,
): Promise<AffiliateLegacyReconciliationBase> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const mode: 'DRY_RUN' | 'APPLY' = input.isDryRun === false ? 'APPLY' : 'DRY_RUN';
  const legacySnapshot = input.legacySnapshot
    ?? await readAffiliateLegacyDatabaseSnapshot(database);
  return { database, now, mode, legacySnapshot };
};

const buildLegacyReconciliationEvidenceAtTime = (
  snapshot: AffiliateLegacyDatabaseSnapshot,
  now: Date,
): AffiliateLegacyReconciliationEvidence => {
  const sourceData = buildLegacySourceEvidence({
    sourceRows: snapshot.sources,
    intakeRows: snapshot.intakes,
    pageRows: snapshot.pages,
    artifactRows: snapshot.artifacts,
  });
  const approvalData = buildLegacyApprovalLineage({
    sourceRows: snapshot.sources,
    intakeRows: snapshot.intakes,
    pageRows: snapshot.pages,
    artifactRows: snapshot.artifacts,
    mappingRows: snapshot.mappings,
    mappingJobRows: snapshot.mappingJobs,
    approvalRows: snapshot.approvals,
    candidateRows: snapshot.candidates,
    sourceEvidence: sourceData.sourceEvidence,
    intakeSourceIds: sourceData.intakeSourceIds,
  });
  const roots = buildLegacyRootEvidence(snapshot.supplySources);
  const identity = buildLegacyIdentityContext({
    roots,
    sourceEvidence: sourceData.sourceEvidence,
  });
  const targetPlan = buildLegacyTargetPlan({
    sourceRows: snapshot.sources,
    intakeRows: snapshot.intakes,
    discoveryResultRows: snapshot.discoveryResults,
    mappingRows: snapshot.mappings,
    pageRows: snapshot.pages,
    intakeRunRows: snapshot.intakeRuns,
    artifactRows: snapshot.artifacts,
    scrapeRunRows: snapshot.runs,
    mappingJobRows: snapshot.mappingJobs,
    approvalRows: snapshot.approvals,
    candidateRows: snapshot.candidates,
    targetRows: snapshot.targets,
    organizationRows: snapshot.organizations,
    eventRows: snapshot.events,
    teamRows: snapshot.teams,
    facilityRows: snapshot.facilities,
    roots,
    intakeSourceIds: sourceData.intakeSourceIds,
    intakeRootIdById: approvalData.intakeRootIdById,
    candidateById: approvalData.candidateById,
    approvalLineageById: approvalData.approvalLineageById,
    targetLineageKey: identity.targetLineageKey,
  });
  const claimData = buildLegacyClaimsAndStages({
    now,
    sourceEvidence: sourceData.sourceEvidence,
    canonicalSourceRowById: sourceData.canonicalSourceRowById,
    supplySourceRows: snapshot.supplySources,
    intakeRows: snapshot.intakes,
    mappingRows: snapshot.mappings,
    mappingJobRows: snapshot.mappingJobs,
    intakeRunRows: snapshot.intakeRuns,
    approvalRows: snapshot.approvals,
    discoveryRunRows: snapshot.discoveryRuns,
    coverageJobRows: snapshot.coverageJobs,
    gatewayClaimRows: snapshot.gatewayClaims,
    gatewayJobRows: snapshot.gatewayJobs,
    candidateRows: snapshot.candidates,
    targets: targetPlan.targets,
    intakeSourceIds: sourceData.intakeSourceIds,
    intakeRootIdById: approvalData.intakeRootIdById,
    approvalLineageById: approvalData.approvalLineageById,
    approvalLineageRows: approvalData.approvalLineageRows,
  });
  return {
    sourceEvidence: sourceData.sourceEvidence,
    sourceEvidenceFindings: sourceData.sourceEvidenceFindings,
    approvalLineageById: approvalData.approvalLineageById,
    approvalLineageRows: approvalData.approvalLineageRows,
    approvalLineageFindings: approvalData.approvalLineageFindings,
    approvalStateFindings: approvalData.approvalStateFindings,
    roots,
    records: targetPlan.records,
    targets: targetPlan.targets,
    claims: claimData.claims,
    gatewayClaimFindings: claimData.gatewayClaimFindings,
    derivedStages: claimData.derivedStages,
    canonicalPublicRecordKinds: new Set([
      'PUBLIC_TARGET',
      'ORGANIZATION',
      'EVENT',
      'TEAM',
      'FACILITY',
    ]),
  };
};
const loadLegacyCutoverSessionForApply = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  mode: 'DRY_RUN' | 'APPLY';
  sessionId?: string | null;
  sessionHash?: string | null;
}>): Promise<AffiliateCutoverRollbackSession | null> => {
  if (input.mode !== 'APPLY') return null;
  const sessionId = input.sessionId?.trim();
  const sessionHash = input.sessionHash?.trim();
  if (!sessionId || !sessionHash) {
    throw new Error('Legacy Affiliate Supply reconciliation apply requires a durable cutover session ID and hash.');
  }
  const session = await loadAffiliateCutoverRollbackSession({
    database: input.database,
    sessionId,
  });
  if (sessionHash !== hashAffiliateAgentValue(rollbackSessionPreimage(session))) {
    throw new Error('Legacy Affiliate Supply reconciliation cutover session hash does not match the durable session.');
  }
  return session;
};

const resolveLegacyRolloutCohort = (input: Readonly<{
  requestedRolloutCohort?: string | null;
  cutoverSession: AffiliateCutoverRollbackSession | null;
  contract: ActiveAffiliateSupplyContractResult;
}>): string => input.cutoverSession?.rolloutCohort
  ?? input.requestedRolloutCohort
  ?? input.contract.policy.rolloutCohort;

const assertLegacyRequestedRolloutCohort = (input: Readonly<{
  mode: 'DRY_RUN' | 'APPLY';
  requestedRolloutCohort?: string | null;
  rolloutCohort: string;
}>): void => {
  if (
    input.mode === 'APPLY'
    && input.requestedRolloutCohort?.trim()
    && input.requestedRolloutCohort.trim() !== input.rolloutCohort
  ) {
    throw new Error('Legacy Affiliate Supply reconciliation rollout cohort does not match the durable cutover session.');
  }
};

const resolveLegacyReconciliationPolicy = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  mode: 'DRY_RUN' | 'APPLY';
  rolloutCohort?: string | null;
  requestedRolloutCohort?: string | null;
  cutoverSessionId?: string | null;
  cutoverSessionHash?: string | null;
}>): Promise<AffiliateLegacyReconciliationPolicy> => {
  const cutoverSession = await loadLegacyCutoverSessionForApply({
    database: input.database,
    mode: input.mode,
    sessionId: input.cutoverSessionId,
    sessionHash: input.cutoverSessionHash,
  });
  const cutoverSessionHash = input.cutoverSessionHash?.trim() ?? null;
  const contract = await loadActiveAffiliateSupplyContract({
    rolloutCohort: cutoverSession?.rolloutCohort ?? input.rolloutCohort ?? undefined,
    db: input.database,
  });
  const rolloutCohort = resolveLegacyRolloutCohort({
    requestedRolloutCohort: input.rolloutCohort,
    cutoverSession,
    contract,
  });
  assertLegacyRequestedRolloutCohort({
    mode: input.mode,
    requestedRolloutCohort: input.requestedRolloutCohort,
    rolloutCohort,
  });
  return {
    cutoverSession,
    cutoverSessionHash,
    contract,
    rolloutCohort,
  };
};

const buildLegacyReconciliationReportForPreparation = (input: Readonly<{
  base: AffiliateLegacyReconciliationBase;
  evidence: AffiliateLegacyReconciliationEvidence;
  policy: AffiliateLegacyReconciliationPolicy;
}>): AffiliateLegacyReconciliationReport => {
  const report = buildAffiliateLegacyReconciliationReport({
    now: input.base.now,
    sources: input.evidence.sourceEvidence,
    roots: input.evidence.roots,
    records: input.evidence.records,
    targets: input.evidence.targets,
    claims: input.evidence.claims,
    legacySnapshotHash: hashAffiliateLegacyDatabaseSnapshot(input.base.legacySnapshot),
    supplyContractVersion: input.policy.contract.policy.version,
    supplyContractHash: input.policy.contract.policy.hash,
    derivedStages: input.evidence.derivedStages,
    preflightFindings: [
      ...input.evidence.sourceEvidenceFindings,
      ...input.evidence.approvalLineageFindings,
      ...input.evidence.approvalStateFindings,
      ...input.evidence.gatewayClaimFindings,
    ],
  });
  return report;
};

const buildLegacyReconciliationPreparation = async (
  input: AffiliateLegacySupplyReconciliationInternalInput,
): Promise<AffiliateLegacyReconciliationPreparation> => {
  const base = await readLegacyReconciliationBase(input);
  const evidence = buildLegacyReconciliationEvidenceAtTime(base.legacySnapshot, base.now);
  const policy = await resolveLegacyReconciliationPolicy({
    database: base.database,
    mode: base.mode,
    rolloutCohort: input.rolloutCohort,
    requestedRolloutCohort: input.rolloutCohort,
    cutoverSessionId: input.cutoverSessionId,
    cutoverSessionHash: input.cutoverSessionHash,
  });
  const report = buildLegacyReconciliationReportForPreparation({ base, evidence, policy });
  const appliedRun = base.mode === 'APPLY' && input.expectedReportHash
    ? await readAppliedAffiliateLegacyReconciliationReport(
      base.database,
      input.expectedReportHash,
    )
    : null;
  return {
    ...base,
    ...evidence,
    ...policy,
    report,
    appliedRun,
    appliedReport: appliedRun?.report ?? null,
  };
};


type AffiliateLegacyApplyContext = Readonly<{
  preparation: AffiliateLegacyReconciliationPreparation;
  input: AffiliateLegacySupplyReconciliationInternalInput;
}>;

type AffiliateLegacyTransactionContext = Readonly<{
  preparation: AffiliateLegacyReconciliationPreparation;
  input: AffiliateLegacySupplyReconciliationInternalInput;
  atomicDatabase: AffiliateSupplyDatabase;
}>;
const assertLegacyApplyPersistenceDelegates = (input: Readonly<{
  database: AffiliateSupplyDatabase;
  preparation: AffiliateLegacyReconciliationPreparation;
}>): void => {
  const transitions = input.database.transitions as unknown as AffiliateLegacyLifecycleTransitionWriter | undefined;
  const supplySources = input.database.supplySources as unknown as AffiliateLegacyLifecycleSourceWriter | undefined;
  if (
    (
      typeof transitions?.create !== 'function'
      && typeof transitions?.createMany !== 'function'
    )
    || typeof supplySources?.update !== 'function'
  ) {
    throw new Error('Legacy reconciliation lifecycle persistence delegates are unavailable.');
  }
  const reconciliationRuns = input.database.reconciliationRuns as unknown as AffiliateLegacyReconciliationRunDelegate | undefined;
  if (typeof reconciliationRuns?.upsert !== 'function') {
    throw new Error('Legacy Affiliate Supply reconciliation apply requires durable run persistence capability.');
  }
  if (typeof reconciliationRuns.findUnique !== 'function') {
    throw new Error('Legacy Affiliate Supply reconciliation apply requires durable run lookup capability.');
  }
  assertLegacyRecordLinkDelegates({
    database: input.database,
    records: input.preparation.records,
    canonicalPublicRecordKinds: input.preparation.canonicalPublicRecordKinds,
  });
};


const assertLegacyApplyCredentials = (
  input: AffiliateLegacySupplyReconciliationInternalInput,
): void => {
  if (!input.operatorId?.trim() || !input.applyNonce?.trim()) {
    throw new Error('Legacy Affiliate Supply reconciliation writes require an operator ID and apply nonce.');
  }
};

const assertLegacyReviewedCounts = (
  report: AffiliateLegacyReconciliationReport,
  input: AffiliateLegacySupplyReconciliationInternalInput,
): void => {
  if (!input.expectedCountsHash && !input.expectedCounts) {
    throw new Error('Legacy Affiliate Supply reconciliation apply requires reviewed counts.');
  }
  if (
    input.expectedCountsHash
    && input.expectedCountsHash !== hashAffiliateAgentValue(report.counts)
  ) {
    throw new Error('Legacy Affiliate Supply reconciliation counts do not match the reviewed selection.');
  }
  if (
    input.expectedCounts
    && hashAffiliateAgentValue(input.expectedCounts) !== hashAffiliateAgentValue(report.counts)
  ) {
    throw new Error('Legacy Affiliate Supply reconciliation counts do not match the reviewed selection.');
  }
};

const assertLegacyApplyReview = (
  preparation: AffiliateLegacyReconciliationPreparation,
  input: AffiliateLegacySupplyReconciliationInternalInput,
): void => {
  assertLegacyApplyCredentials(input);
  if (!input.expectedReportHash?.trim()) {
    throw new Error('Legacy Affiliate Supply reconciliation apply requires the reviewed report hash.');
  }
  const reviewedReport = preparation.appliedRun?.report ?? preparation.report;
  if (input.expectedReportHash !== reviewedReport.reportHash) {
    throw new Error('Legacy Affiliate Supply reconciliation report hash does not match the reviewed report.');
  }
  if (!input.expectedInputHash?.trim()) {
    throw new Error('Legacy Affiliate Supply reconciliation apply requires the reviewed input hash.');
  }
  if (input.expectedInputHash !== reviewedReport.inputHash) {
    throw new Error('Legacy Affiliate Supply reconciliation input hash does not match the reviewed selection.');
  }
  assertLegacyReviewedCounts(reviewedReport, input);
};

const isLegacyFreshStoppedPreflight = (
  preflight: AffiliateCutoverPreflightReport | null | undefined,
  now: Date,
): boolean => Boolean(
  preflight
  && isAffiliateCutoverPreflightFresh(preflight, now)
);

const isLegacySafePreflight = (
  preflight: AffiliateCutoverPreflightReport | null | undefined,
): boolean => Boolean(
  preflight
  && isAffiliateCutoverPreflightApplySafe(preflight)
);

const isLegacyApplySessionBound = (
  preparation: AffiliateLegacyReconciliationPreparation,
  preflight: AffiliateCutoverPreflightReport | null | undefined,
): boolean => Boolean(
  preparation.cutoverSession
  && preflight
  && preparation.cutoverSession.preflightReportHash === preflight.reportHash
  && preparation.cutoverSession.preflightReport.inputHash === preflight.inputHash
  && preparation.cutoverSession.deploymentContractVersion === preflight.deploymentContractVersion
  && preparation.cutoverSession.deploymentContractHash === preflight.deploymentContractHash
  && preparation.cutoverSession.rolloutCohort === preparation.rolloutCohort
  && preparation.cutoverSessionHash
);

const assertLegacyApplyPreflight = (
  preparation: AffiliateLegacyReconciliationPreparation,
  input: AffiliateLegacySupplyReconciliationInternalInput,
): void => {
  const preflight = input.preflight;
  if (
    !preflight
    || !isAffiliateCutoverPreflightReportIntact(preflight)
    || !isLegacySafePreflight(preflight)
    || preflight.isReady !== true
    || preflight.supplyContractVersion !== preparation.contract.policy.version
    || !isLegacyApplySessionBound(preparation, preflight)
    || (!preparation.appliedRun && !isLegacyFreshStoppedPreflight(preflight, preparation.now))
  ) {
    throw new Error('Legacy Affiliate Supply reconciliation requires a verified, fresh preflight for the active Supply Contract.');
  }
};

const isLegacyReplayDeploymentMatch = (
  appliedRun: AffiliateLegacyAppliedReconciliationRun,
  preflight: AffiliateCutoverPreflightReport | null | undefined,
): boolean => {
  const versionMatches = appliedRun.deploymentContractVersion === null
    || appliedRun.deploymentContractVersion === preflight?.deploymentContractVersion;
  const hashMatches = appliedRun.deploymentContractHash === null
    || appliedRun.deploymentContractHash === preflight?.deploymentContractHash;
  return versionMatches && hashMatches;
};

const isLegacyReplayMetadataMatch = (
  preparation: AffiliateLegacyReconciliationPreparation,
  input: AffiliateLegacySupplyReconciliationInternalInput,
): boolean => {
  const appliedRun = preparation.appliedRun;
  const operatorId = input.operatorId?.trim();
  const applyNonce = input.applyNonce?.trim();
  if (!appliedRun || !operatorId || !applyNonce) return false;
  return [
    appliedRun.appliedBy === operatorId,
    appliedRun.rolloutCohort === preparation.rolloutCohort,
    appliedRun.supplyContractVersion === preparation.contract.policy.version,
    appliedRun.supplyContractHash === preparation.contract.policy.hash,
    isLegacyReplayDeploymentMatch(appliedRun, input.preflight),
    appliedRun.applyNonceHash === hashAffiliateAgentValue(applyNonce),
    appliedRun.cutoverSessionId === preparation.cutoverSession?.sessionId,
    appliedRun.cutoverSessionHash === preparation.cutoverSessionHash,
  ].every(Boolean);
};

const assertLegacyReplayReview = (
  preparation: AffiliateLegacyReconciliationPreparation,
  input: AffiliateLegacySupplyReconciliationInternalInput,
): void => {
  assertLegacyApplyCredentials(input);
  const replayReport = preparation.appliedRun?.report;
  if (!replayReport) throw new Error('Legacy Affiliate Supply reconciliation replay report is missing.');
  if (!input.expectedInputHash?.trim()) {
    throw new Error('Legacy Affiliate Supply reconciliation replay requires the reviewed input hash.');
  }
  if (input.expectedInputHash !== replayReport.inputHash) {
    throw new Error('Legacy Affiliate Supply reconciliation input hash does not match the reviewed selection.');
  }
  assertLegacyReviewedCounts(replayReport, input);
  if (!isLegacyReplayMetadataMatch(preparation, input)) {
    throw new Error('Legacy Affiliate Supply reconciliation replay metadata does not match the reviewed apply.');
  }
};

const replayLegacyReconciliation = (
  preparation: AffiliateLegacyReconciliationPreparation,
  input: AffiliateLegacySupplyReconciliationInternalInput,
): AffiliateLegacySupplyReconciliationResult => {
  const replayReport = preparation.appliedRun?.report;
  if (!replayReport) {
    throw new Error('Legacy Affiliate Supply reconciliation replay report is missing.');
  }
  assertLegacyReplayReview(preparation, input);
  if (!isAffiliateLegacyReconciliationReplaySafe(replayReport, preparation.report)) {
    throw new Error('Legacy Affiliate Supply reconciliation snapshot changed after the report was applied.');
  }
  const replayReportForResult = {
    ...replayReport,
  } as AffiliateLegacyReconciliationReport & Record<string, unknown>;
  delete replayReportForResult.postApplyLegacySnapshotHash;
  return buildAffiliateLegacySupplyReconciliationResult({
    mode: preparation.mode,
    report: replayReportForResult,
    records: preparation.records,
  });
};

const createAtomicAffiliateSupplyDatabase = (
  transactionDatabase: AffiliateSupplyDatabase,
): AffiliateSupplyDatabase => {
  const atomicDatabase = {
    ...transactionDatabase,
    transaction: undefined,
  } as AffiliateSupplyDatabaseWithTransactionState;
  if (transactionDatabase.rawClient) {
    Object.defineProperty(atomicDatabase, 'rawClient', {
      enumerable: false,
      value: transactionDatabase.rawClient,
    });
  }
  Object.defineProperty(atomicDatabase, affiliateSupplyExistingTransaction, {
    enumerable: false,
    value: true,
  });
  return atomicDatabase;
};

const assertLegacyTransactionSession = async (input: Readonly<{
  atomicDatabase: AffiliateSupplyDatabase;
  preparation: AffiliateLegacyReconciliationPreparation;
  preflight: AffiliateCutoverPreflightReport | null | undefined;
}>): Promise<void> => {
  const transactionSession = await loadAffiliateCutoverRollbackSession({
    database: input.atomicDatabase,
    sessionId: input.preparation.cutoverSession?.sessionId ?? '',
  });
  if (
    !input.preparation.cutoverSession
    || transactionSession.sessionId !== input.preparation.cutoverSession.sessionId
    || hashAffiliateAgentValue(rollbackSessionPreimage(transactionSession))
      !== input.preparation.cutoverSessionHash
    || transactionSession.preflightReportHash !== input.preflight?.reportHash
  ) {
    throw new Error('Legacy Affiliate Supply reconciliation cutover session changed before writes.');
  }
};

const assertLegacyTransactionReportMatches = (input: Readonly<{
  expected: AffiliateLegacyReconciliationReport;
  actual: AffiliateLegacyReconciliationReport;
}>): void => {
  if (
    input.actual.inputHash !== input.expected.inputHash
    || input.actual.outputHash !== input.expected.outputHash
    || input.actual.reportHash !== input.expected.reportHash
    || hashAffiliateAgentValue(input.actual.counts)
      !== hashAffiliateAgentValue(input.expected.counts)
  ) {
    throw new Error('Legacy Affiliate Supply reconciliation snapshot changed after review.');
  }
};

const assertLegacyTransactionContractMatches = (input: Readonly<{
  expected: ActiveAffiliateSupplyContractResult;
  actual: ActiveAffiliateSupplyContractResult;
}>): void => {
  if (
    input.actual.manifest.hash !== input.expected.manifest.hash
    || input.actual.policy.hash !== input.expected.policy.hash
  ) {
    throw new Error('Legacy Affiliate Supply reconciliation active Supply Contract changed before writes.');
  }
};

type AffiliateLegacyRootPersistence = Readonly<{
  sourceToRoot: Map<string, string>;
  planToRoot: Map<string, string>;
  rootsById: Map<string, AffiliateSupplySources>;
}>;

const persistLegacySourceForRoot = async (input: Readonly<{
  sourceId: string;
  sourceById: ReadonlyMap<string, AffiliateLegacySourceEvidence>;
  preloadedSupplySourceIndexes: AffiliateSupplySourceIndexes;
  transaction: AffiliateLegacyTransactionContext;
}>): Promise<{ sourceId: string; root: AffiliateSupplySources } | null> => {
  const source = input.sourceById.get(input.sourceId);
  if (!source) return null;
  const ensured = await ensureAffiliateSupplySource({
    requestedUrl: source.requestedUrl ?? source.resolvedCanonicalUrl ?? '',
    resolvedCanonicalUrl: source.resolvedCanonicalUrl ?? source.requestedUrl ?? '',
    isRedirectVerified: source.isRedirectVerified === true,
    operatorDomain: source.operatorDomain,
    targetKind: source.targetKind,
    rolloutCohort: input.transaction.preparation.rolloutCohort,
    intakeId: source.intakeId,
    liveSourceId: source.liveSourceId,
    priorSupplySourceId: source.predecessorSupplySourceId ?? source.existingSupplySourceId,
    preloadedSupplySourceIndexes: input.preloadedSupplySourceIndexes,
    db: input.transaction.atomicDatabase,
    now: input.transaction.preparation.now,
  });
  return { sourceId: input.sourceId, root: ensured.supplySource };
};

const persistLegacyRootPlan = async (input: Readonly<{
  plan: AffiliateLegacyReconciliationReport['roots'][number];
  sourceById: ReadonlyMap<string, AffiliateLegacySourceEvidence>;
  preloadedSupplySourceIndexes: AffiliateSupplySourceIndexes;
  transaction: AffiliateLegacyTransactionContext;
}>): Promise<{ rootId: string; sourceToRoot: Map<string, string> }> => {
  const { plan, sourceById, preloadedSupplySourceIndexes, transaction } = input;
  const sourceToRoot = new Map<string, string>();
  const firstSource = plan.sourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .find((source): source is AffiliateLegacySourceEvidence => Boolean(source));
  if (!firstSource) {
    throw new Error(`Legacy reconciliation root plan ${plan.identityKey ?? plan.sourceIds[0]} has no source evidence.`);
  }
  let persistedRoot: AffiliateSupplySources | null = null;
  for (const sourceId of plan.sourceIds) {
    const persisted = await persistLegacySourceForRoot({
      sourceId,
      sourceById,
      preloadedSupplySourceIndexes,
      transaction,
    });
    if (!persisted) continue;
    persistedRoot = persisted.root;
    sourceToRoot.set(persisted.sourceId, persisted.root.id);
  }
  if (!persistedRoot) {
    throw new Error(`Legacy reconciliation root plan ${plan.identityKey ?? plan.sourceIds[0]} was not persisted.`);
  }
  return { rootId: persistedRoot.id, sourceToRoot };
};

const readLegacyPersistedRoots = async (input: Readonly<{
  atomicDatabase: AffiliateSupplyDatabase;
  rootIds: readonly string[];
}>): Promise<Map<string, AffiliateSupplySources>> => {
  if (input.rootIds.length === 0) return new Map();
  const persistedRoots = (
    await Promise.all(
      chunksOf(input.rootIds, AFFILIATE_RECONCILIATION_QUERY_BATCH_SIZE).map((ids) => (
        input.atomicDatabase.supplySources.findMany({
          where: { id: { in: ids } },
        })
      )),
    )
  ).flat();
  return new Map(persistedRoots.map((root) => [root.id, root]));
};

const persistLegacyReconciliationRoots = async (
  transaction: AffiliateLegacyTransactionContext,
): Promise<AffiliateLegacyRootPersistence> => {
  const sourceById = new Map(
    transaction.preparation.sourceEvidence.map((source) => [source.id, source]),
  );
  const preloadedSupplySources = await transaction.atomicDatabase.supplySources.findMany({
    where: {},
  });
  const preloadedSupplySourceIndexes = indexAffiliateSupplySources(preloadedSupplySources);
  const sourceToRoot = new Map<string, string>();
  const planToRoot = new Map<string, string>();
  for (const plan of transaction.preparation.report.roots) {
    const persisted = await persistLegacyRootPlan({
      plan,
      sourceById,
      preloadedSupplySourceIndexes,
      transaction,
    });
    persisted.sourceToRoot.forEach((rootId, sourceId) => sourceToRoot.set(sourceId, rootId));
    planToRoot.set(plan.identityKey ?? plan.sourceIds[0], persisted.rootId);
  }
  const rootsById = await readLegacyPersistedRoots({
    atomicDatabase: transaction.atomicDatabase,
    rootIds: Array.from(new Set(planToRoot.values())),
  });
  return { sourceToRoot, planToRoot, rootsById };
};

const buildLegacyRecordDelegates = (
  database: AffiliateSupplyDatabase,
): Partial<Record<AffiliateLegacyRecordKind, unknown>> => ({
  SOURCE: database.sources,
  INTAKE: database.intakes,
  CAPTURE_PAGE: database.pages,
  CAPTURE_RUN: database.intakeRuns,
  CAPTURE_ARTIFACT: database.artifacts,
  DISCOVERY_RESULT: database.discoveryResults,
  MAPPING: database.mappings,
  SCRAPE_RUN: database.runs,
  MAPPING_JOB: database.mappingJobs,
  APPROVAL_JOB: database.approvals,
  CANDIDATE: database.candidates,
});

const assertLegacyRecordLinkDelegates = (input: Readonly<{
  database: AffiliateSupplyDatabase;
  records: readonly AffiliateLegacyLineageRecord[];
  canonicalPublicRecordKinds: ReadonlySet<AffiliateLegacyRecordKind>;
}>): void => {
  const recordDelegates = buildLegacyRecordDelegates(input.database);
  const requiredKinds = new Set(
    input.records
      .filter((record) => !input.canonicalPublicRecordKinds.has(record.kind))
      .map((record) => record.kind),
  );
  for (const kind of requiredKinds) {
    const delegate = recordDelegates[kind] as AffiliateLegacyUpdateManyDelegate | undefined;
    if (typeof delegate?.updateMany !== 'function') {
      throw new Error(`Legacy reconciliation has no persistence delegate for record kind ${kind}.`);
    }
  }
};

const buildLegacyMultiRootApprovalIds = (
  approvalLineageById: ReadonlyMap<string, AffiliateLegacyResolvedApprovalLineage>,
): ReadonlySet<string> => new Set(
  Array.from(approvalLineageById.entries())
    .filter(([, lineage]) => new Set(
      lineage.associations
        .map((association) => association.supplySourceId)
        .filter((rootId): rootId is string => rootId !== null),
    ).size > 1)
    .map(([approvalId]) => approvalId),
);

const isLegacyMultiRootApprovalRecord = (
  record: AffiliateLegacyLineageRecord,
  multiRootApprovalIds: ReadonlySet<string>,
): boolean => record.kind === 'APPROVAL_JOB' && multiRootApprovalIds.has(record.id);

const legacyRecordRootId = (
  record: AffiliateLegacyLineageRecord,
  sourceToRoot: ReadonlyMap<string, string>,
): string | undefined => record.supplySourceId
  ?? (record.sourceId ? sourceToRoot.get(record.sourceId) : undefined);

const appendLegacyPublicRecordId = (
  publicRecordIdsByRoot: Map<string, string[]>,
  rootId: string,
  recordId: string,
): void => {
  const ids = publicRecordIdsByRoot.get(rootId) ?? [];
  ids.push(recordId);
  publicRecordIdsByRoot.set(rootId, ids);
};

const appendLegacyLinkedRecordId = (
  recordDelegates: Partial<Record<AffiliateLegacyRecordKind, unknown>>,
  recordsByRootAndKind: Map<string, string[]>,
  record: AffiliateLegacyLineageRecord,
  rootId: string,
): void => {
  const delegate = recordDelegates[record.kind] as AffiliateLegacyUpdateManyDelegate | undefined;
  if (!delegate) {
    throw new Error(`Legacy reconciliation has no persistence delegate for record kind ${record.kind}.`);
  }
  const key = `${record.kind}:${rootId}`;
  const ids = recordsByRootAndKind.get(key) ?? [];
  ids.push(record.id);
  recordsByRootAndKind.set(key, ids);
};

const collectLegacyRecordIdsByRoot = (input: Readonly<{
  database: AffiliateSupplyDatabase;
  records: readonly AffiliateLegacyLineageRecord[];
  sourceToRoot: ReadonlyMap<string, string>;
  canonicalPublicRecordKinds: ReadonlySet<AffiliateLegacyRecordKind>;
  approvalLineageById: ReadonlyMap<string, AffiliateLegacyResolvedApprovalLineage>;
}>): Readonly<{
  recordsByRootAndKind: ReadonlyMap<string, readonly string[]>;
  publicRecordIdsByRoot: ReadonlyMap<string, readonly string[]>;
}> => {
  const recordDelegates = buildLegacyRecordDelegates(input.database);
  const recordsByRootAndKind = new Map<string, string[]>();
  const multiRootApprovalIds = buildLegacyMultiRootApprovalIds(input.approvalLineageById);
  const publicRecordIdsByRoot = new Map<string, string[]>();
  for (const record of input.records) {
    if (isLegacyMultiRootApprovalRecord(record, multiRootApprovalIds)) continue;
    const rootId = legacyRecordRootId(record, input.sourceToRoot);
    if (!rootId) continue;
    if (input.canonicalPublicRecordKinds.has(record.kind)) {
      appendLegacyPublicRecordId(publicRecordIdsByRoot, rootId, record.id);
      continue;
    }
    appendLegacyLinkedRecordId(recordDelegates, recordsByRootAndKind, record, rootId);
  }
  return { recordsByRootAndKind, publicRecordIdsByRoot };
};

const persistLegacyRecordLinks = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  recordsByRootAndKind: ReadonlyMap<string, readonly string[]>;
}>): Promise<void> => {
  const recordDelegates = buildLegacyRecordDelegates(input.database);
  for (const [key, ids] of input.recordsByRootAndKind) {
    const [kind, rootId] = key.split(':');
    const delegate = recordDelegates[kind as AffiliateLegacyRecordKind] as AffiliateLegacyUpdateManyDelegate | undefined;
    if (typeof delegate?.updateMany !== 'function') {
      throw new Error(`Legacy reconciliation has no persistence delegate for record kind ${kind}.`);
    }
    for (const idChunk of chunksOf(ids, AFFILIATE_RECONCILIATION_QUERY_BATCH_SIZE)) {
      await delegate.updateMany({
        where: { id: { in: idChunk }, supplySourceId: null },
        data: { supplySourceId: rootId },
      });
    }
  }
};

const persistLegacyReconciliationRecords = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  preparation: AffiliateLegacyReconciliationPreparation;
  sourceToRoot: ReadonlyMap<string, string>;
}>): Promise<ReadonlyMap<string, readonly string[]>> => {
  const grouped = collectLegacyRecordIdsByRoot({
    database: input.database,
    records: input.preparation.records,
    sourceToRoot: input.sourceToRoot,
    canonicalPublicRecordKinds: input.preparation.canonicalPublicRecordKinds,
    approvalLineageById: input.preparation.approvalLineageById,
  });
  await persistLegacyRecordLinks({
    database: input.database,
    recordsByRootAndKind: grouped.recordsByRootAndKind,
  });
  return grouped.publicRecordIdsByRoot;
};

const persistLegacyTargetProjection = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  targetById: ReadonlyMap<string, AffiliateLegacySupplyTargetRow>;
  rootId: string;
  target: AffiliateLegacySupplyTargetProjection;
  now: Date;
}>): Promise<void> => {
  if (input.target.action !== 'MARK_LAST_KNOWN_GOOD') return;
  const existing = input.targetById.get(input.target.sourceTargetId);
  await upsertAffiliateSupplyTarget({
    db: input.database,
    id: existing ? undefined : (
      input.target.sourceTargetId.startsWith('candidate-public:')
      || input.target.sourceTargetId.startsWith('canonical-public:')
        ? input.target.sourceTargetId
        : undefined
    ),
    supplySourceId: input.rootId,
    targetType: input.target.targetType,
    targetId: input.target.targetId,
    sourceProfile: input.target.sourceProfile ?? input.target.targetType,
    status: 'LAST_KNOWN_GOOD',
    reviewedProjection: input.target,
  });
};

const persistLegacyRootTargets = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  targetById: ReadonlyMap<string, AffiliateLegacySupplyTargetRow>;
  plan: AffiliateLegacyReconciliationReport['roots'][number];
  rootId: string;
  now: Date;
}>): Promise<void> => {
  for (const target of input.plan.targetProjections) {
    await persistLegacyTargetProjection({
      database: input.database,
      targetById: input.targetById,
      rootId: input.rootId,
      target,
      now: input.now,
    });
  }
};

const persistLegacyReconciliationTargets = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  preparation: AffiliateLegacyReconciliationPreparation;
  planToRoot: ReadonlyMap<string, string>;
}>): Promise<void> => {
  const targetById = new Map(
    input.preparation.legacySnapshot.targets.map((target) => [target.id, target]),
  );
  for (const plan of input.preparation.report.roots) {
    const rootId = input.planToRoot.get(plan.identityKey ?? plan.sourceIds[0]);
    if (!rootId) continue;
    await persistLegacyRootTargets({
      database: input.database,
      targetById,
      plan,
      rootId,
      now: input.preparation.now,
    });
  }
};

const legacyClaimRowsForKind = (
  kind: AffiliateLegacyClaimEvidence['kind'],
  snapshot: AffiliateLegacyDatabaseSnapshot,
): readonly AffiliateLegacyRow[] => {
  switch (kind) {
    case 'MAPPING_JOB':
      return snapshot.mappingJobs;
    case 'APPROVAL_JOB':
      return snapshot.approvals;
    case 'INTAKE_RUN':
      return snapshot.intakeRuns;
    case 'DISCOVERY_RUN':
      return snapshot.discoveryRuns;
    case 'COVERAGE_JOB':
      return snapshot.coverageJobs;
    default:
      return snapshot.gatewayClaims;
  }
};

const collectLegacyClaimRowsToRevoke = (input: Readonly<{
  claims: readonly AffiliateLegacyClaimEvidence[];
  report: AffiliateLegacyReconciliationReport;
  snapshot: AffiliateLegacyDatabaseSnapshot;
}>): ReadonlyMap<string, readonly AffiliateLegacyRow[]> => {
  const claimRowsByKind = new Map<string, AffiliateLegacyRow[]>();
  for (const claim of input.claims) {
    const action = input.report.claimActions.find((candidate) => (
      candidate.id === claim.id && candidate.kind === claim.kind
    ));
    if (!action || action.action !== 'REVOKE_EXPIRED') continue;
    const row = legacyClaimRowsForKind(claim.kind, input.snapshot)
      .find((candidate) => candidate.id === claim.id);
    if (!row) continue;
    const rows = claimRowsByKind.get(claim.kind) ?? [];
    rows.push(row);
    claimRowsByKind.set(claim.kind, rows);
  }
  return claimRowsByKind;
};

const resetLegacyQueue = async (
  delegate: unknown,
  rows: readonly { id: string }[],
  data: Record<string, unknown>,
): Promise<void> => {
  const updateManyDelegate = delegate && typeof delegate === 'object' && 'updateMany' in delegate
    ? delegate as AffiliateLegacyUpdateManyDelegate
    : null;
  const updateMany = updateManyDelegate?.updateMany;
  if (typeof updateMany !== 'function' || rows.length === 0) return;
  for (const chunk of chunksOf(rows, AFFILIATE_RECONCILIATION_QUERY_BATCH_SIZE)) {
    await updateMany.call(delegate, {
      where: { id: { in: chunk.map((row) => row.id) } },
      data,
    });
  }
};

const persistLegacyClaimQueueResets = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  claimRowsByKind: ReadonlyMap<string, readonly AffiliateLegacyRow[]>;
  now: Date;
}>): Promise<void> => {
  await resetLegacyQueue(input.database.mappingJobs, input.claimRowsByKind.get('MAPPING_JOB') ?? [], {
    status: 'QUEUED',
    claimedAt: null,
    leaseExpiresAt: null,
    workerId: null,
  });
  await resetLegacyQueue(input.database.approvals, input.claimRowsByKind.get('APPROVAL_JOB') ?? [], {
    status: 'QUEUED',
    claimedAt: null,
    leaseExpiresAt: null,
    reviewerId: null,
  });
  await resetLegacyQueue(input.database.intakeRuns, input.claimRowsByKind.get('INTAKE_RUN') ?? [], {
    status: 'QUEUED',
    claimedAt: null,
    workerId: null,
  });
  await resetLegacyQueue(input.database.discoveryRuns, input.claimRowsByKind.get('DISCOVERY_RUN') ?? [], {
    status: 'QUEUED',
    claimedAt: null,
    workerId: null,
  });
  await resetLegacyQueue(input.database.coverageJobs, input.claimRowsByKind.get('COVERAGE_JOB') ?? [], {
    status: 'QUEUED',
    claimedAt: null,
    leaseExpiresAt: null,
    workerId: null,
  });
  await resetLegacyQueue(input.database.gatewayClaims, input.claimRowsByKind.get('GATEWAY_CLAIM') ?? [], {
    status: 'REVOKED',
    endedAt: input.now,
    tokenInvalidatedAt: input.now,
  });
};
type AffiliateLegacyUpdateManyDelegate = {
  updateMany?: (args: unknown) => Promise<unknown>;
};

const updateLegacyGatewayJobForClaim = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  claim: AffiliateLegacyRow;
  now: Date;
  updateMany: (args: unknown) => Promise<unknown>;
}>): Promise<void> => {
  const jobId = affiliateLegacyRowString(input.claim, 'jobId');
  const claimGeneration = affiliateLegacyRowValue(input.claim, 'claimGeneration');
  if (!jobId || typeof claimGeneration !== 'number' || !Number.isInteger(claimGeneration)) return;
  const data = {
    status: 'QUEUED',
    activeClaimId: null,
    nextAttemptAt: input.now,
    terminalDisposition: null,
  };
  await input.updateMany.call(input.database.gatewayJobs, {
    where: {
      id: jobId,
      status: 'CLAIMED',
      activeClaimId: input.claim.id,
      claimGeneration,
    },
    data,
  });
  await input.updateMany.call(input.database.gatewayJobs, {
    where: {
      id: jobId,
      status: 'RETRY_WAIT',
      activeClaimId: null,
      claimGeneration,
    },
    data,
  });
};

const persistLegacyGatewayJobResets = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  claimRowsByKind: ReadonlyMap<string, readonly AffiliateLegacyRow[]>;
  now: Date;
}>): Promise<void> => {
  const gatewayJobs = input.database.gatewayJobs;
  const updateMany = gatewayJobs && typeof gatewayJobs === 'object' && 'updateMany' in gatewayJobs
    ? (gatewayJobs as AffiliateLegacyUpdateManyDelegate).updateMany
    : undefined;
  if (typeof updateMany !== 'function') return;
  for (const claim of input.claimRowsByKind.get('GATEWAY_CLAIM') ?? []) {
    await updateLegacyGatewayJobForClaim({
      database: input.database,
      claim,
      now: input.now,
      updateMany,
    });
  }
};

const loadLegacyAssessmentSnapshots = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  rootsById: ReadonlyMap<string, AffiliateSupplySources>;
  contract: ActiveAffiliateSupplyContractResult;
  now: Date;
}>): Promise<ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot> | null> => {
  const delegates = [
    input.database.sources,
    input.database.intakes,
    input.database.mappings,
    input.database.mappingJobs,
    input.database.approvals,
    input.database.runs,
    input.database.candidates,
    input.database.supplySources,
  ];
  const isAvailable = delegates.every((delegate) => (
    typeof delegate?.findMany === 'function'
  ));
  return isAvailable
    ? await loadSnapshots(input.database, Array.from(input.rootsById.values()), input.contract.policy, input.now)
    : null;
};

const persistLegacyReconciliationLifecycleAndRun = async (input: Readonly<{
  transaction: AffiliateLegacyTransactionContext;
  rootPersistence: AffiliateLegacyRootPersistence;
  publicRecordIdsByRoot: ReadonlyMap<string, readonly string[]>;
  assessmentSnapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot> | null;
}>): Promise<void> => {
  const postLinkSnapshot = await readAffiliateLegacyDatabaseSnapshot(input.transaction.atomicDatabase);
  const postLinkRootRowById = new Map(
    postLinkSnapshot.supplySources.map((row) => [row.id, row]),
  );
  await persistLegacyReconciledLifecycles({
    database: input.transaction.atomicDatabase,
    report: input.transaction.preparation.report,
    planToRoot: input.rootPersistence.planToRoot,
    rootsById: input.rootPersistence.rootsById,
    sourceById: new Map(
      input.transaction.preparation.sourceEvidence.map((source) => [source.id, source]),
    ),
    approvalLineageRows: input.transaction.preparation.approvalLineageRows,
    publicRecordIdsByRoot: input.publicRecordIdsByRoot,
    postLinkSnapshot,
    postLinkRootRowById,
    assessmentSnapshots: input.assessmentSnapshots,
    contract: input.transaction.preparation.contract.policy,
    operatorId: input.transaction.input.operatorId,
    now: input.transaction.preparation.now,
  });
  const postApplySnapshot = await readAffiliateLegacyDatabaseSnapshot(
    input.transaction.atomicDatabase,
  );
  await persistAffiliateLegacyReconciliationRun({
    database: input.transaction.atomicDatabase,
    report: input.transaction.preparation.report,
    mode: input.transaction.preparation.mode,
    rolloutCohort: input.transaction.preparation.rolloutCohort,
    operatorId: input.transaction.input.operatorId,
    contract: input.transaction.preparation.contract,
    applyNonce: input.transaction.input.applyNonce,
    deploymentContractVersion: input.transaction.input.preflight?.deploymentContractVersion,
    deploymentContractHash: input.transaction.input.preflight?.deploymentContractHash,
    cutoverSessionId: input.transaction.preparation.cutoverSession?.sessionId,
    cutoverSessionHash: input.transaction.preparation.cutoverSessionHash,
    postApplyLegacySnapshotHash: hashAffiliateLegacyDatabaseSnapshot(postApplySnapshot),
    now: input.transaction.preparation.now,
  });
};

const applyLegacyReconciliationTransaction = async (
  input: AffiliateLegacyTransactionContext,
): Promise<void> => {
  const { preparation, input: reconciliationInput, atomicDatabase } = input;
  assertLegacyApplyPersistenceDelegates({
    database: atomicDatabase,
    preparation,
  });
  await assertLegacyTransactionSession({
    atomicDatabase,
    preparation,
    preflight: reconciliationInput.preflight,
  });
  const transactionSnapshot = await readAffiliateLegacyDatabaseSnapshot(atomicDatabase);
  const transactionReport = await reconcileLegacyAffiliateSupplyInternal({
    ...reconciliationInput,
    db: atomicDatabase,
    isDryRun: true,
    now: preparation.now,
    legacySnapshot: transactionSnapshot,
    persistRun: false,
  });
  assertLegacyTransactionReportMatches({
    expected: preparation.report,
    actual: transactionReport.report,
  });
  const transactionContract = await loadActiveAffiliateSupplyContract({
    db: atomicDatabase,
    rolloutCohort: preparation.contract.manifest.rolloutCohort,
  });
  assertLegacyTransactionContractMatches({
    expected: preparation.contract,
    actual: transactionContract,
  });
  const rootPersistence = await persistLegacyReconciliationRoots(input);
  const publicRecordIdsByRoot = await persistLegacyReconciliationRecords({
    database: atomicDatabase,
    preparation,
    sourceToRoot: rootPersistence.sourceToRoot,
  });
  await persistLegacyReconciliationTargets({
    database: atomicDatabase,
    preparation,
    planToRoot: rootPersistence.planToRoot,
  });
  const claimRowsByKind = collectLegacyClaimRowsToRevoke({
    claims: preparation.claims,
    report: preparation.report,
    snapshot: preparation.legacySnapshot,
  });
  await persistLegacyClaimQueueResets({
    database: atomicDatabase,
    claimRowsByKind,
    now: preparation.now,
  });
  await persistLegacyGatewayJobResets({
    database: atomicDatabase,
    claimRowsByKind,
    now: preparation.now,
  });
  const assessmentSnapshots = await loadLegacyAssessmentSnapshots({
    database: atomicDatabase,
    rootsById: rootPersistence.rootsById,
    contract: preparation.contract,
    now: preparation.now,
  });
  await persistLegacyReconciliationLifecycleAndRun({
    transaction: input,
    rootPersistence,
    publicRecordIdsByRoot,
    assessmentSnapshots,
  });
};

const persistLegacyReconciliationDryRun = async (input: Readonly<{
  preparation: AffiliateLegacyReconciliationPreparation;
  reconciliationInput: AffiliateLegacySupplyReconciliationInternalInput;
}>): Promise<void> => {
  if (input.reconciliationInput.persistRun === false) return;
  await persistAffiliateLegacyReconciliationRun({
    database: input.preparation.database,
    report: input.preparation.report,
    mode: input.preparation.mode,
    rolloutCohort: input.preparation.rolloutCohort,
    operatorId: input.reconciliationInput.operatorId,
    contract: input.preparation.contract,
    deploymentContractVersion: input.reconciliationInput.preflight?.deploymentContractVersion,
    deploymentContractHash: input.reconciliationInput.preflight?.deploymentContractHash,
    now: input.preparation.now,
  });
};

const applyLegacyReconciliation = async (
  input: AffiliateLegacyApplyContext,
): Promise<void> => {
  assertLegacyApplyReview(input.preparation, input.input);
  if (!input.preparation.contract) {
    throw new Error('Legacy Affiliate Supply reconciliation requires an active Supply Contract.');
  }
  assertLegacyApplyPersistenceDelegates({
    database: input.preparation.database,
    preparation: input.preparation,
  });
  await withSupplyTransaction(
    input.preparation.database,
    async (transactionDatabase) => applyLegacyReconciliationTransaction({
      preparation: input.preparation,
      input: input.input,
      atomicDatabase: createAtomicAffiliateSupplyDatabase(transactionDatabase),
    }),
    {
      requireTransaction: true,
      prisma: AFFILIATE_SUPPLY_APPLY_TRANSACTION_OPTIONS,
    },
  );
};

const reconcileLegacyAffiliateSupplyInternal = async (
  input: AffiliateLegacySupplyReconciliationInternalInput = {},
): Promise<AffiliateLegacySupplyReconciliationResult> => {
  const preparation = await buildLegacyReconciliationPreparation(input);
  if (preparation.mode === 'APPLY') {
    assertLegacyApplyPreflight(preparation, input);
    if (!preparation.report.isApplySafe) {
      throw new Error('Legacy Affiliate Supply reconciliation apply requires a report without blocking findings.');
    }
    if (preparation.appliedRun) {
      return replayLegacyReconciliation(preparation, input);
    }
    await applyLegacyReconciliation({
      preparation,
      input,
    });
  } else {
    await persistLegacyReconciliationDryRun({
      preparation,
      reconciliationInput: input,
    });
  }
  return buildAffiliateLegacySupplyReconciliationResult({
    mode: preparation.mode,
    report: preparation.report,
    records: preparation.records,
  });
};
export const reconcileLegacyAffiliateSupply = async (
  input: AffiliateLegacySupplyReconciliationInput = {},
): Promise<AffiliateLegacySupplyReconciliationResult> => (
  reconcileLegacyAffiliateSupplyInternal(input)
);

type AffiliateSupplyReconciliationBatchContext = Readonly<{
  database: AffiliateSupplyDatabase;
  snapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot>;
  assessments: readonly AffiliateSupplyAssessment[];
  contract: AffiliateSupplyContractPolicy;
  now: Date;
  transitionsByIdempotencyKey: ReadonlyMap<string, AffiliateSupplyLifecycleTransitions>;
  latestSequenceBySource: Map<string, number>;
  isTransitionPersistenceAvailable: boolean;
}>;

const isAffiliateSupplyProjectionStageCurrent = (
  root: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment,
): boolean => (
  root.derivedStage === assessment.stage
  && root.derivedOutcome === assessment.outcome
  && root.freshnessStatus === assessment.freshnessStatus
  && root.targetContribution === assessment.targetContribution
  && root.repairPriority === assessment.repairPriority
  && root.isAutomationEnabled === assessment.isAutomationEnabled
  && root.automationHoldReason === assessment.automationHoldReason
  && root.isExcluded === (assessment.stage === 'SOURCE_EXCLUDED')
);

const isAffiliateSupplyProjectionContractCurrent = (
  root: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment,
  contract: AffiliateSupplyContractPolicy,
): boolean => (
  root.activeSupplyContractVersion === contract.version
  && root.activeSupplyContractHash === contract.hash
  && JSON.stringify(Array.from(new Set(root.invariantViolations)).sort(codeUnitCompare))
    === JSON.stringify([...assessment.invariantViolations].sort(codeUnitCompare))
);

const isAffiliateSupplyProjectionCurrent = (
  root: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment,
  contract: AffiliateSupplyContractPolicy,
): boolean => (
  isAffiliateSupplyProjectionStageCurrent(root, assessment)
  && isAffiliateSupplyProjectionContractCurrent(root, assessment, contract)
);

const affiliateSupplyReconciliationRequest = (
  root: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment,
): Record<string, unknown> => ({
  evidenceRefs: [
    `supply-source:${root.id}`,
    ...assessment.evidenceRefs,
  ],
  assessedAt: assessment.assessedAt,
});

const assertAffiliateSupplyTransitionRequest = (
  existingTransition: AffiliateSupplyLifecycleTransitions,
  requestHash: string,
  root: AffiliateSupplySources,
): void => {
  const storedRequestHash = affiliateLifecycleRequestHash({
    supplySourceId: existingTransition.supplySourceId,
    command: existingTransition.command,
    contractVersion: existingTransition.contractVersion,
    contractHash: existingTransition.contractHash,
    request: recordValue(existingTransition.requestJson),
  });
  if (storedRequestHash !== requestHash) {
    throw new Error(
      `Affiliate lifecycle reconciliation idempotency key was reused with a different request for ${root.id}.`,
    );
  }
};

const persistAffiliateSupplyLiveSourceProjection = async (
  database: AffiliateSupplyDatabase,
  root: AffiliateSupplySources,
  assessment: AffiliateSupplyAssessment,
  lifecycleGeneration: number,
  contract: AffiliateSupplyContractPolicy,
): Promise<void> => {
  if (!root.liveSourceId || !database.sources?.update) return;
  await database.sources.update({
    where: { id: root.liveSourceId },
    data: {
      lifecycleGeneration,
      activeSupplyContractVersion: contract.version,
      activeSupplyContractHash: contract.hash,
      ...(assessment.isAutomationEnabled ? {} : { autoScrapeEnabled: false }),
    },
  });
};

const persistAffiliateSupplyProjection = async (
  context: AffiliateSupplyReconciliationBatchContext,
  root: AffiliateSupplySources,
  snapshot: AffiliateSupplyEvidenceSnapshot,
  assessment: AffiliateSupplyAssessment,
  lifecycleGeneration: number,
): Promise<void> => {
  await context.database.supplySources.update({
    where: { id: root.id },
    data: {
      lifecycleGeneration,
      derivedStage: assessment.stage,
      derivedOutcome: assessment.outcome,
      freshnessStatus: assessment.freshnessStatus,
      targetContribution: assessment.targetContribution,
      repairPriority: assessment.repairPriority,
      isAutomationEnabled: assessment.isAutomationEnabled,
      isExcluded: assessment.stage === 'SOURCE_EXCLUDED',
      automationHoldReason: assessment.automationHoldReason,
      lastSuccessfulRefreshAt: snapshot.latestRun && isSuccessStatus(snapshot.latestRun.status)
        ? toDate(snapshot.latestRun.finishedAt)
        : undefined,
      lastAssessmentAt: context.now,
      assessmentJson: prismaJsonValue(assessment),
      invariantViolations: [...assessment.invariantViolations],
      activeSupplyContractVersion: context.contract.version,
      activeSupplyContractHash: context.contract.hash,
    },
  });
  await persistAffiliateSupplyLiveSourceProjection(
    context.database,
    root,
    assessment,
    lifecycleGeneration,
    context.contract,
  );
};

const persistAffiliateSupplyReconciliationRoot = async (
  context: AffiliateSupplyReconciliationBatchContext,
  root: AffiliateSupplySources,
  index: number,
): Promise<AffiliateSupplyAssessment> => {
  const snapshot = context.snapshots.get(root.id);
  if (!snapshot) throw new Error(`Affiliate Supply Source snapshot is missing: ${root.id}.`);
  const assessment = context.assessments[index];
  if (isAffiliateSupplyProjectionCurrent(root, assessment, context.contract)) return assessment;
  const idempotencyKey = `reconcile:${root.id}:${root.lifecycleGeneration}:${context.contract.version}:${context.contract.hash}`;
  const request = affiliateSupplyReconciliationRequest(root, assessment);
  const requestHash = affiliateLifecycleRequestHash({
    supplySourceId: root.id,
    command: 'RECONCILE',
    contractVersion: context.contract.version,
    contractHash: context.contract.hash,
    request,
  });
  const existingTransition = context.transitionsByIdempotencyKey.get(idempotencyKey);
  if (existingTransition) {
    assertAffiliateSupplyTransitionRequest(existingTransition, requestHash, root);
    return existingTransition.resultJson as unknown as AffiliateSupplyAssessment;
  }
  const result: AffiliateSupplyAssessment = {
    ...assessment,
    lifecycleGeneration: root.lifecycleGeneration + 1,
  };
  if (!context.isTransitionPersistenceAvailable) {
    await persistAffiliateSupplyProjection(context, root, snapshot, assessment, root.lifecycleGeneration);
    return assessment;
  }
  const transition = await context.database.transitions.create({
    data: {
      id: createId(),
      supplySourceId: root.id,
      sequence: (context.latestSequenceBySource.get(root.id) ?? root.lifecycleGeneration) + 1,
      generation: result.lifecycleGeneration,
      command: 'RECONCILE',
      contractVersion: context.contract.version,
      resultHash: hashAffiliateAgentValue(result),
      outcome: result.outcome,
      fromStage: root.derivedStage,
      toStage: result.stage,
      commandRef: null,
      idempotencyKey,
      requestHash,
      contractHash: context.contract.hash,
      actorKind: 'SYSTEM',
      actorId: 'affiliate-supply-reconciliation',
      executingAgentId: null,
      reasonCodes: Array.from(new Set(result.reasonCodes)),
      evidenceRefs: Array.from(new Set([
        ...result.evidenceRefs,
        ...request.evidenceRefs as string[],
      ])),
      requestJson: prismaJsonValue(request),
      resultJson: prismaJsonValue(result),
      occurredAt: context.now,
    },
  });
  await persistAffiliateSupplyProjection(
    context,
    root,
    snapshot,
    result,
    result.lifecycleGeneration,
  );
  context.latestSequenceBySource.set(root.id, transition.sequence);
  return result;
};

const persistAffiliateSupplyReconciliationBatch = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  roots: readonly AffiliateSupplySources[];
  snapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot>;
  assessments: readonly AffiliateSupplyAssessment[];
  contract: AffiliateSupplyContractPolicy;
  now: Date;
}>): Promise<AffiliateSupplyAssessment[]> => {
  const rootIds = input.roots.map((root) => root.id);
  const transitionDelegate = input.database.transitions as unknown as {
    findMany?: unknown;
    create?: unknown;
  } | undefined;
  const sourceDelegate = input.database.supplySources as unknown as { update?: unknown } | undefined;
  const isTransitionPersistenceAvailable = (
    typeof transitionDelegate?.findMany === 'function'
    && typeof transitionDelegate.create === 'function'
    && typeof sourceDelegate?.update === 'function'
  );
  const transitionRows: AffiliateSupplyLifecycleTransitions[] = isTransitionPersistenceAvailable
    ? await input.database.transitions.findMany({
        where: { supplySourceId: { in: rootIds } },
        orderBy: { sequence: 'desc' },
      })
    : [];
  const transitionsByIdempotencyKey = new Map(
    transitionRows.map((transition) => [transition.idempotencyKey, transition]),
  );
  const latestSequenceBySource = new Map<string, number>();
  for (const transition of transitionRows) {
    const current = latestSequenceBySource.get(transition.supplySourceId);
    if (current === undefined || transition.sequence > current) {
      latestSequenceBySource.set(transition.supplySourceId, transition.sequence);
    }
  }
  const context: AffiliateSupplyReconciliationBatchContext = {
    database: input.database,
    snapshots: input.snapshots,
    assessments: input.assessments,
    contract: input.contract,
    now: input.now,
    transitionsByIdempotencyKey,
    latestSequenceBySource,
    isTransitionPersistenceAvailable,
  };
  return Promise.all(input.roots.map((root, index) => (
    persistAffiliateSupplyReconciliationRoot(context, root, index)
  )));
};

export const reconcileAffiliateSupplySources = async (input: Readonly<{
  contract?: AffiliateSupplyContractPolicy;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}> = {}): Promise<{ assessed: number; assessments: AffiliateSupplyAssessment[] }> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const contract = input.contract ?? (await loadActiveAffiliateSupplyContract({ db: database, rolloutCohort: input.rolloutCohort })).policy;
  const rolloutCohort = input.rolloutCohort ?? contract.rolloutCohort;
  return withSupplyTransaction(database, async (transactionDatabase) => {
    const roots = await transactionDatabase.supplySources.findMany({
      where: { rolloutCohort },
      orderBy: { id: 'asc' },
    });
    const snapshots = await loadSnapshots(transactionDatabase, roots, contract, now);
    const derivedAssessments = roots.map((root) => {
      const snapshot = snapshots.get(root.id);
      if (!snapshot) throw new Error(`Affiliate Supply Source snapshot is missing: ${root.id}.`);
      return deriveAffiliateSupplyAssessment(snapshot);
    });
    const assessments = await persistAffiliateSupplyReconciliationBatch({
      database: transactionDatabase,
      roots,
      snapshots,
      assessments: derivedAssessments,
      contract,
      now,
    });
    return { assessed: assessments.length, assessments };
  });
};
export type AffiliateReplenishmentWaveExecutionResult = Readonly<{
  status: 'WAITING' | 'SUCCEEDED' | 'FAILED' | 'PAUSED';
  provider?: string | null;
  providerOperationKey?: string | null;
  retryAt?: Date | null;
  searchSaturatedUntil?: Date | null;
  marginalYield?: number | null;
  errorCode?: string | null;
  result?: Record<string, unknown> | null;
  evidenceRefs?: readonly string[];
}>;

export type AffiliateReplenishmentReconciliationResult = Readonly<{
  assessed: number;
  opened: number;
  closed: number;
  demands: readonly AffiliateReplenishmentDemandResultRow[];
  assessments: readonly AffiliateSupplyAssessment[];
  plan: AffiliateReplenishmentPlan;
  wave: AffiliateReplenishmentWaves | null;
  providerResult: AffiliateReplenishmentWaveExecutionResult | null;
  isDryRun: boolean;
}>;

type AffiliateReplenishmentWaveRunner = (input: Readonly<{
  wave: AffiliateReplenishmentWaves;
  demand: AffiliateReplenishmentDemands;
  contract: AffiliateSupplyContractPolicy;
}>) => Promise<AffiliateReplenishmentWaveExecutionResult>;

type AffiliateReplenishmentInput = Readonly<{
  contract?: AffiliateSupplyContractPolicy;
  rolloutCohort?: string;
  isContractSafe?: boolean;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  isDryRun?: boolean;
  runWave?: AffiliateReplenishmentWaveRunner;
}>;

type AffiliateReplenishmentWaveExecutionContext = Readonly<{
  database: AffiliateSupplyDatabase;
  now: Date;
  contract: AffiliateSupplyContractPolicy;
  runWave: AffiliateReplenishmentWaveRunner;
}>;

type AffiliateReplenishmentWaveDemandState = Readonly<{
  demandOpen: boolean;
  generationMatches: boolean;
  activeWaveMatches: boolean;
}>;

const readAffiliateReplenishmentWaveDemandState = (
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
): AffiliateReplenishmentWaveDemandState => ({
  demandOpen: String(demand.status ?? '').toUpperCase() === 'OPEN',
  generationMatches: Number.isFinite(Number(wave.demandGeneration))
    && Number(demand.generation ?? 0) === Number(wave.demandGeneration),
  activeWaveMatches: demand.activeWaveId === wave.id,
});

const replenishmentWaveEvidenceRefs = (
  wave: AffiliateReplenishmentWaves,
  additionalRefs: readonly string[],
): string[] => Array.from(new Set([
  ...(isAffiliateStringArray(wave.evidenceRefs) ? wave.evidenceRefs : []),
  ...additionalRefs,
]));

const buildAffiliateReplenishmentStaleResult = (
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  state: AffiliateReplenishmentWaveDemandState,
): AffiliateReplenishmentWaveExecutionResult => {
  const reason = !state.demandOpen
    ? 'DEMAND_NOT_OPEN'
    : !state.generationMatches
      ? 'STALE_DEMAND_GENERATION'
      : 'WAVE_NOT_ATTACHED';
  const evidenceRefs = replenishmentWaveEvidenceRefs(wave, [
    `demand:${demand.id}`,
    `wave:${wave.id}`,
    `demand-status:${String(demand.status ?? '')}`,
    `demand-generation:${String(demand.generation ?? '')}`,
    `wave-demand-generation:${String(wave.demandGeneration ?? '')}`,
  ]);
  return {
    status: 'PAUSED',
    provider: null,
    providerOperationKey: null,
    retryAt: null,
    marginalYield: null,
    errorCode: reason,
    result: {
      demandId: demand.id,
      demandStatus: demand.status,
      demandGeneration: demand.generation,
      waveDemandGeneration: wave.demandGeneration,
    },
    evidenceRefs,
  };
};

const persistAffiliateReplenishmentStaleResult = async (
  database: AffiliateSupplyDatabase,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  result: AffiliateReplenishmentWaveExecutionResult,
  now: Date,
): Promise<void> => {
  await withSupplyTransaction(database, async (transactionDatabase) => {
    const currentDemand = await transactionDatabase.demands.findUnique({
      where: { id: demand.id },
    });
    const state = currentDemand
      ? readAffiliateReplenishmentWaveDemandState(wave, currentDemand)
      : {
        demandOpen: false,
        generationMatches: false,
        activeWaveMatches: false,
      };
    await transactionDatabase.waves.updateMany({
      where: {
        id: wave.id,
        demandGeneration: Number(wave.demandGeneration),
      },
      data: {
        status: 'PAUSED',
        terminalAt: now,
        retryAt: null,
        marginalYield: null,
        errorCode: result.errorCode,
        resultJson: prismaNullableJsonValue(result.result),
        evidenceRefs: result.evidenceRefs ? [...result.evidenceRefs] : undefined,
      },
    });
    if (
      !currentDemand
      || !state.demandOpen
      || !state.generationMatches
      || !state.activeWaveMatches
    ) return;
    await transactionDatabase.demands.updateMany({
      where: {
        id: demand.id,
        generation: Number(demand.generation),
        activeWaveId: wave.id,
      },
      data: {
        activeWaveId: null,
        generation: Number(demand.generation ?? 0) + 1,
      },
    });
  });
};

const affiliateReplenishmentContractMatches = (
  demand: AffiliateReplenishmentDemands,
  contract: AffiliateSupplyContractPolicy,
): boolean => (
  demand.rolloutCohort === contract.rolloutCohort
  && Number(demand.contractVersion) === contract.version
  && demand.contractHash === contract.hash
);

const buildAffiliateReplenishmentRolloverResult = (
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  contract: AffiliateSupplyContractPolicy,
): AffiliateReplenishmentWaveExecutionResult => ({
  status: 'PAUSED',
  provider: null,
  providerOperationKey: null,
  retryAt: null,
  marginalYield: null,
  errorCode: 'CONTRACT_ROLLOVER',
  result: {
    demandContractVersion: demand.contractVersion,
    demandContractHash: demand.contractHash,
    activeContractVersion: contract.version,
    activeContractHash: contract.hash,
  },
  evidenceRefs: replenishmentWaveEvidenceRefs(wave, [
    `demand:${demand.id}`,
    `contract:${String(demand.contractVersion)}:${String(demand.contractHash)}`,
    `active-contract:${contract.version}:${contract.hash}`,
  ]),
});

const affiliateReplenishmentRolloverIsCurrent = (
  currentDemand: AffiliateReplenishmentDemands | null,
  demand: AffiliateReplenishmentDemands,
  state: AffiliateReplenishmentWaveDemandState,
): boolean => {
  const originalContractMatches = Boolean(
    currentDemand
    && currentDemand.rolloutCohort === demand.rolloutCohort
    && Number(currentDemand.contractVersion) === Number(demand.contractVersion)
    && currentDemand.contractHash === demand.contractHash
  );
  return Boolean(
    currentDemand
    && state.demandOpen
    && state.generationMatches
    && state.activeWaveMatches
    && originalContractMatches
  );
};

const persistAffiliateReplenishmentRolloverUpdates = async (
  transactionDatabase: AffiliateSupplyDatabase,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  currentDemand: AffiliateReplenishmentDemands,
  state: AffiliateReplenishmentWaveDemandState,
  result: AffiliateReplenishmentWaveExecutionResult,
  now: Date,
): Promise<AffiliateReplenishmentWaveExecutionResult> => {
  const waveUpdate = await transactionDatabase.waves.updateMany({
    where: {
      id: wave.id,
      demandGeneration: Number(wave.demandGeneration),
    },
    data: {
      status: 'PAUSED',
      terminalAt: now,
      retryAt: null,
      marginalYield: null,
      errorCode: result.errorCode,
      resultJson: prismaNullableJsonValue(result.result),
      evidenceRefs: result.evidenceRefs ? [...result.evidenceRefs] : undefined,
    },
  });
  if (waveUpdate.count !== 1) {
    return buildAffiliateReplenishmentStaleResult(wave, currentDemand, state);
  }
  const demandUpdate = await transactionDatabase.demands.updateMany({
    where: {
      id: demand.id,
      rolloutCohort: demand.rolloutCohort,
      contractVersion: Number(demand.contractVersion),
      contractHash: demand.contractHash,
      generation: Number(demand.generation),
      activeWaveId: wave.id,
    },
    data: {
      status: 'PAUSED',
      activeWaveId: null,
      nextEligibleAt: null,
      generation: Number(demand.generation ?? 0) + 1,
      reasonCodes: Array.from(new Set([
        ...(Array.isArray(demand.reasonCodes) ? demand.reasonCodes : []),
        'CONTRACT_ROLLOVER',
      ])),
    },
  });
  if (demandUpdate.count === 1) return result;
  const latestDemand = await transactionDatabase.demands.findUnique({
    where: { id: demand.id },
  });
  return buildAffiliateReplenishmentStaleResult(
    wave,
    latestDemand ?? currentDemand,
    state,
  );
};

const persistAffiliateReplenishmentRolloverResult = async (
  database: AffiliateSupplyDatabase,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  result: AffiliateReplenishmentWaveExecutionResult,
  now: Date,
): Promise<AffiliateReplenishmentWaveExecutionResult> => (
  withSupplyTransaction(database, async (transactionDatabase) => {
    const currentDemand = await transactionDatabase.demands.findUnique({
      where: { id: demand.id },
    });
    const state = currentDemand
      ? readAffiliateReplenishmentWaveDemandState(wave, currentDemand)
      : {
        demandOpen: false,
        generationMatches: false,
        activeWaveMatches: false,
      };
    if (
      currentDemand === null
      || !affiliateReplenishmentRolloverIsCurrent(currentDemand, demand, state)
    ) {
      return buildAffiliateReplenishmentStaleResult(
        wave,
        currentDemand ?? demand,
        state,
      );
    }
    return persistAffiliateReplenishmentRolloverUpdates(
      transactionDatabase,
      wave,
      demand,
      currentDemand,
      state,
      result,
      now,
    );
  })
);

const runAffiliateReplenishmentProvider = async (
  context: AffiliateReplenishmentWaveExecutionContext,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
): Promise<AffiliateReplenishmentWaveExecutionResult> => {
  let providerResult: AffiliateReplenishmentWaveExecutionResult;
  try {
    providerResult = await context.runWave({ wave, demand, contract: context.contract });
  } catch (error) {
    providerResult = {
      status: 'FAILED',
      provider: null,
      providerOperationKey: null,
      retryAt: new Date(context.now.getTime() + 15 * 60 * 1000),
      marginalYield: null,
      errorCode: 'PROVIDER_FAILURE',
      result: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (providerResult.status !== 'FAILED') return providerResult;
  return {
    ...providerResult,
    marginalYield: null,
    retryAt: providerResult.retryAt
      ?? new Date(context.now.getTime() + 15 * 60 * 1000),
  };
};

const readAffiliateReplenishmentCampaignInterval = async (
  database: AffiliateSupplyDatabase,
  campaignId: string | null,
): Promise<number> => {
  const campaign = campaignId && database.campaigns?.findUnique
    ? await database.campaigns.findUnique({
        where: { id: campaignId },
        select: { searchIntervalMinutes: true, metadata: true },
      })
    : null;
  const campaignMetadata = recordValue(campaign?.metadata);
  const intervalMinutes = Number(
    campaign?.searchIntervalMinutes
    ?? campaignMetadata.searchIntervalMinutes
    ?? 24 * 60,
  );
  return Number.isFinite(intervalMinutes) && intervalMinutes > 0
    ? intervalMinutes
    : 24 * 60;
};

const calculateAffiliateReplenishmentSaturation = (
  providerResult: AffiliateReplenishmentWaveExecutionResult,
  now: Date,
  campaignIntervalMinutes: number,
  saturationCycles: number,
): Date | null => (
  providerResult.status === 'SUCCEEDED' && providerResult.marginalYield === 0
    ? new Date(now.getTime() + campaignIntervalMinutes * saturationCycles * 60_000)
    : null
);

const readAffiliateReplenishmentSearchSaturation = async (
  context: AffiliateReplenishmentWaveExecutionContext,
  wave: AffiliateReplenishmentWaves,
  providerResult: AffiliateReplenishmentWaveExecutionResult,
): Promise<Date | null> => {
  const saturationFromResult = toDate(
    providerResult.searchSaturatedUntil
    ?? recordValue(providerResult.result).searchSaturatedUntil,
  );
  const campaignIntervalMinutes = await readAffiliateReplenishmentCampaignInterval(
    context.database,
    wave.campaignId,
  );
  const saturationCycles = Math.max(1, Math.trunc(context.contract.searchSaturationMinimumCycles ?? 1));
  const calculatedSaturation = calculateAffiliateReplenishmentSaturation(
    providerResult,
    context.now,
    campaignIntervalMinutes,
    saturationCycles,
  );
  return saturationFromResult && saturationFromResult.getTime() > context.now.getTime()
    ? saturationFromResult
    : calculatedSaturation;
};

const buildAffiliateReplenishmentDemandUpdate = (
  currentDemand: AffiliateReplenishmentDemands,
  providerResult: AffiliateReplenishmentWaveExecutionResult,
  retryAt: Date | null,
  searchSaturatedUntil: Date | null,
): Record<string, unknown> => ({
  activeWaveId: null,
  nextEligibleAt: retryAt,
  generation: currentDemand.generation + 1,
  ...(providerResult.status === 'PAUSED' ? { status: 'PAUSED' } : {}),
  ...(providerResult.status === 'SUCCEEDED' ? { searchSaturatedUntil } : {}),
});

const staleAffiliateReplenishmentWaveOutcome = async (
  context: AffiliateReplenishmentWaveExecutionContext,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  currentDemand: AffiliateReplenishmentDemands,
  state: AffiliateReplenishmentWaveDemandState,
): Promise<AffiliateReplenishmentWaveExecutionResult> => {
  const latestDemand = await context.database.demands.findUnique({
    where: { id: demand.id },
  });
  const latestState = latestDemand
    ? readAffiliateReplenishmentWaveDemandState(wave, latestDemand)
    : state;
  return buildAffiliateReplenishmentStaleResult(
    wave,
    latestDemand ?? currentDemand,
    latestState,
  );
};

const persistAffiliateReplenishmentWaveOutcomeUpdates = async (
  context: AffiliateReplenishmentWaveExecutionContext,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  providerResult: AffiliateReplenishmentWaveExecutionResult,
  searchSaturatedUntil: Date | null,
  currentDemand: AffiliateReplenishmentDemands,
  state: AffiliateReplenishmentWaveDemandState,
  terminal: boolean,
  retryAt: Date | null,
): Promise<AffiliateReplenishmentWaveExecutionResult> => {
  const waveUpdate = await context.database.waves.updateMany({
    where: {
      id: wave.id,
      demandGeneration: Number(wave.demandGeneration),
    },
    data: {
      status: providerResult.status,
      provider: providerResult.provider ?? null,
      providerOperationKey: providerResult.providerOperationKey ?? null,
      retryAt,
      terminalAt: terminal ? context.now : null,
      marginalYield: providerResult.marginalYield ?? null,
      errorCode: providerResult.errorCode ?? null,
      resultJson: prismaNullableJsonValue(providerResult.result),
      evidenceRefs: replenishmentWaveEvidenceRefs(wave, providerResult.evidenceRefs ?? []),
    },
  });
  if (waveUpdate.count !== 1) {
    return buildAffiliateReplenishmentStaleResult(wave, currentDemand, state);
  }
  if (!terminal) return providerResult;
  const demandUpdate = await context.database.demands.updateMany({
    where: {
      id: demand.id,
      rolloutCohort: demand.rolloutCohort,
      contractVersion: Number(demand.contractVersion),
      contractHash: demand.contractHash,
      generation: Number(demand.generation),
      activeWaveId: wave.id,
    },
    data: buildAffiliateReplenishmentDemandUpdate(
      currentDemand,
      providerResult,
      retryAt,
      searchSaturatedUntil,
    ),
  });
  if (demandUpdate.count === 1) return providerResult;
  return staleAffiliateReplenishmentWaveOutcome(
    context,
    wave,
    demand,
    currentDemand,
    state,
  );
};

const persistAffiliateReplenishmentWaveOutcomeTransaction = async (
  context: AffiliateReplenishmentWaveExecutionContext,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  providerResult: AffiliateReplenishmentWaveExecutionResult,
  searchSaturatedUntil: Date | null,
): Promise<AffiliateReplenishmentWaveExecutionResult> => {
  const terminal = providerResult.status !== 'WAITING';
  const retryAt = providerResult.retryAt ?? null;
  const currentDemand = await context.database.demands.findUnique({
    where: { id: demand.id },
  });
  const state = currentDemand
    ? readAffiliateReplenishmentWaveDemandState(wave, currentDemand)
    : {
      demandOpen: false,
      generationMatches: false,
      activeWaveMatches: false,
    };
  if (
    !currentDemand
    || !state.demandOpen
    || !state.generationMatches
    || !state.activeWaveMatches
  ) {
    return buildAffiliateReplenishmentStaleResult(
      wave,
      currentDemand ?? demand,
      state,
    );
  }
  return persistAffiliateReplenishmentWaveOutcomeUpdates(
    context,
    wave,
    demand,
    providerResult,
    searchSaturatedUntil,
    currentDemand,
    state,
    terminal,
    retryAt,
  );
};

const persistAffiliateReplenishmentWaveOutcome = async (
  context: AffiliateReplenishmentWaveExecutionContext,
  wave: AffiliateReplenishmentWaves,
  demand: AffiliateReplenishmentDemands,
  providerResult: AffiliateReplenishmentWaveExecutionResult,
  searchSaturatedUntil: Date | null,
): Promise<AffiliateReplenishmentWaveExecutionResult> => (
  withSupplyTransaction(context.database, async (transactionDatabase) => (
    persistAffiliateReplenishmentWaveOutcomeTransaction(
      { ...context, database: transactionDatabase },
      wave,
      demand,
      providerResult,
      searchSaturatedUntil,
    )
  ))
);


const executeAffiliateReplenishmentWave = async (
  context: AffiliateReplenishmentWaveExecutionContext,
  wave: AffiliateReplenishmentWaves,
): Promise<AffiliateReplenishmentWaveExecutionResult | null> => {
  const demand = await context.database.demands.findUnique({ where: { id: wave.demandId } });
  if (!demand) throw new Error('Affiliate replenishment wave demand not found.');
  const state = readAffiliateReplenishmentWaveDemandState(wave, demand);
  if (!state.demandOpen || !state.generationMatches || !state.activeWaveMatches) {
    const result = buildAffiliateReplenishmentStaleResult(wave, demand, state);
    await persistAffiliateReplenishmentStaleResult(
      context.database,
      wave,
      demand,
      result,
      context.now,
    );
    return result;
  }
  if (!affiliateReplenishmentContractMatches(demand, context.contract)) {
    const result = buildAffiliateReplenishmentRolloverResult(wave, demand, context.contract);
    return persistAffiliateReplenishmentRolloverResult(
      context.database,
      wave,
      demand,
      result,
      context.now,
    );
  }
  let providerResult = await runAffiliateReplenishmentProvider(context, wave, demand);
  const searchSaturatedUntil = await readAffiliateReplenishmentSearchSaturation(
    context,
    wave,
    providerResult,
  );
  providerResult = await persistAffiliateReplenishmentWaveOutcome(
    context,
    wave,
    demand,
    providerResult,
    searchSaturatedUntil,
  );
  return providerResult;
};

type AffiliateReplenishmentTransactionResult = Readonly<{
  assessments: readonly AffiliateSupplyAssessment[];
  demandResult: Awaited<ReturnType<typeof reconcileAffiliateReplenishmentDemands>>;
}>;

const loadAffiliateReplenishmentTransaction = async (
  input: AffiliateReplenishmentInput,
  database: AffiliateSupplyDatabase,
  contract: AffiliateSupplyContractPolicy,
  rolloutCohort: string,
  now: Date,
): Promise<AffiliateReplenishmentTransactionResult> => (
  withSupplyTransaction(database, async (transactionDatabase) => {
    const roots = await transactionDatabase.supplySources.findMany({
      where: { rolloutCohort },
      orderBy: { id: 'asc' },
    });
    const snapshots = await loadSnapshots(transactionDatabase, roots, contract, now);
    const derivedAssessments = roots.map((root) => {
      const snapshot = snapshots.get(root.id);
      if (!snapshot) throw new Error(`Affiliate Supply Source snapshot is missing: ${root.id}.`);
      return deriveAffiliateSupplyAssessment(snapshot);
    });
    const assessments = input.isDryRun
      ? derivedAssessments
      : await persistAffiliateSupplyReconciliationBatch({
        database: transactionDatabase,
        roots,
        snapshots,
        assessments: derivedAssessments,
        contract,
        now,
      });
    const demandResult = await reconcileAffiliateReplenishmentDemands({
      contract,
      rolloutCohort,
      db: transactionDatabase,
      now,
      isDryRun: input.isDryRun === true,
      assessments,
    });
    return { assessments, demandResult };
  })
);

const buildAffiliateReplenishmentResult = (
  assessments: readonly AffiliateSupplyAssessment[],
  demandResult: Awaited<ReturnType<typeof reconcileAffiliateReplenishmentDemands>>,
  plan: AffiliateReplenishmentPlan,
  isDryRun: boolean,
  wave: AffiliateReplenishmentWaves | null,
  providerResult: AffiliateReplenishmentWaveExecutionResult | null,
): AffiliateReplenishmentReconciliationResult => ({
  assessed: assessments.length,
  opened: demandResult.opened,
  closed: demandResult.closed,
  demands: demandResult.demands,
  assessments,
  plan,
  wave,
  providerResult,
  isDryRun,
});

const findAffiliateReplenishmentActiveWave = async (
  database: AffiliateSupplyDatabase,
  rolloutCohort: string,
  isDryRun: boolean,
): Promise<AffiliateReplenishmentWaves | null> => (
  !isDryRun && database.waves?.findFirst
    ? database.waves.findFirst({
        where: {
          status: { in: ['PLANNED', 'ACTIVE', 'WAITING'] },
          ...(rolloutCohort ? { rolloutCohort } : {}),
        },
        orderBy: { createdAt: 'asc' },
      })
    : null
);

type AffiliateReplenishmentResolvedContext = Readonly<{
  database: AffiliateSupplyDatabase;
  now: Date;
  contract: AffiliateSupplyContractPolicy;
  rolloutCohort: string;
}>;

const resolveAffiliateReplenishmentContext = async (
  input: AffiliateReplenishmentInput,
): Promise<AffiliateReplenishmentResolvedContext> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const contract = input.contract
    ?? (await loadActiveAffiliateSupplyContract({
      db: database,
      rolloutCohort: input.rolloutCohort,
    })).policy;
  return {
    database,
    now,
    contract,
    rolloutCohort: input.rolloutCohort ?? contract.rolloutCohort,
  };
};

const executeAffiliateReplenishmentWaveIfConfigured = async (
  runWave: AffiliateReplenishmentWaveRunner | undefined,
  context: AffiliateReplenishmentResolvedContext,
  wave: AffiliateReplenishmentWaves,
): Promise<AffiliateReplenishmentWaveExecutionResult | null> => (
  runWave
    ? executeAffiliateReplenishmentWave({
      database: context.database,
      now: context.now,
      contract: context.contract,
      runWave,
    }, wave)
    : null
);

const buildAffiliateReplenishmentExecutionResult = (
  reconciliation: AffiliateReplenishmentTransactionResult,
  plan: AffiliateReplenishmentPlan,
  isDryRun: boolean,
  wave: AffiliateReplenishmentWaves | null,
  providerResult: AffiliateReplenishmentWaveExecutionResult | null,
): AffiliateReplenishmentReconciliationResult => buildAffiliateReplenishmentResult(
  reconciliation.assessments,
  reconciliation.demandResult,
  plan,
  isDryRun,
  wave,
  providerResult,
);

type AffiliateReplenishmentExecutionState = Readonly<{
  input: AffiliateReplenishmentInput;
  context: AffiliateReplenishmentResolvedContext;
  reconciliation: AffiliateReplenishmentTransactionResult;
  plan: AffiliateReplenishmentPlan;
  isDryRun: boolean;
}>;

const executeAffiliateReplenishmentActiveWave = async (
  state: AffiliateReplenishmentExecutionState,
  activeWave: AffiliateReplenishmentWaves,
): Promise<AffiliateReplenishmentReconciliationResult> => {
  const retryAt = toDate(activeWave.retryAt);
  const isWaiting = String(activeWave.status ?? '').toUpperCase() === 'WAITING';
  if (isWaiting && retryAt && retryAt.getTime() > state.context.now.getTime()) {
    return buildAffiliateReplenishmentExecutionResult(
      state.reconciliation,
      state.plan,
      state.isDryRun,
      activeWave,
      null,
    );
  }
  const providerResult = await executeAffiliateReplenishmentWaveIfConfigured(
    state.input.runWave,
    state.context,
    activeWave,
  );
  return buildAffiliateReplenishmentExecutionResult(
    state.reconciliation,
    state.plan,
    state.isDryRun,
    activeWave,
    providerResult,
  );
};

const executeAffiliateReplenishmentPlannedWave = async (
  state: AffiliateReplenishmentExecutionState,
): Promise<AffiliateReplenishmentReconciliationResult> => {
  const wave = await startAffiliateReplenishmentWave({
    plan: state.plan,
    rolloutCohort: state.context.rolloutCohort,
    contract: state.context.contract,
    db: state.context.database,
    now: state.context.now,
  });
  if (!wave) {
    return buildAffiliateReplenishmentExecutionResult(
      state.reconciliation,
      state.plan,
      state.isDryRun,
      null,
      null,
    );
  }
  const providerResult = await executeAffiliateReplenishmentWaveIfConfigured(
    state.input.runWave,
    state.context,
    wave,
  );
  return buildAffiliateReplenishmentExecutionResult(
    state.reconciliation,
    state.plan,
    state.isDryRun,
    wave,
    providerResult,
  );
};

export const reconcileAffiliateReplenishment = async (
  input: AffiliateReplenishmentInput = {},
): Promise<AffiliateReplenishmentReconciliationResult> => {
  const context = await resolveAffiliateReplenishmentContext(input);
  const reconciliation = await loadAffiliateReplenishmentTransaction(
    input,
    context.database,
    context.contract,
    context.rolloutCohort,
    context.now,
  );
  const plan = await planAffiliateReplenishmentFromDatabase({
    contract: context.contract,
    isContractSafe: input.isContractSafe === true,
    rolloutCohort: context.rolloutCohort,
    db: context.database,
    now: context.now,
    demands: reconciliation.demandResult.demands,
  });
  const state: AffiliateReplenishmentExecutionState = {
    input,
    context,
    reconciliation,
    plan,
    isDryRun: input.isDryRun === true,
  };
  const activeWave = await findAffiliateReplenishmentActiveWave(
    context.database,
    context.rolloutCohort,
    state.isDryRun,
  );
  const contractAdmissionHalted = plan.reasonCodes.includes('UNSAFE_ACTIVE_CONTRACT');
  if (activeWave && !contractAdmissionHalted) {
    return executeAffiliateReplenishmentActiveWave(state, activeWave);
  }
  if (state.isDryRun || plan.action === 'NONE') {
    return buildAffiliateReplenishmentExecutionResult(
      reconciliation,
      plan,
      state.isDryRun,
      null,
      null,
    );
  }
  return executeAffiliateReplenishmentPlannedWave(state);
};