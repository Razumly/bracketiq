import { Prisma } from '@/generated/prisma/client';
import type {
  AffiliateScrapeSources,
  AffiliateScrapeMappings,
  AffiliateScrapeRuns,
  AffiliateSourceIntakes,
  AffiliateSourceMappingJobs,
  AffiliateApprovalJobs,
  AffiliateImportCandidates,
  AffiliateSupplySources,
  AffiliateSupplyTargets,
  AffiliateSupplyContractManifests,
  AffiliateSupplyLifecycleTransitions,
  AffiliateReplenishmentDemands,
  AffiliateReplenishmentWaves,
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
  type AffiliateReplenishmentDemandEvidence,
  type AffiliateReplenishmentPlan,
  type AffiliateSupplyAssessment,
  type AffiliateSupplyCommandAuthority,
  type AffiliateSupplyContractManifest,
  type AffiliateSupplyContractPolicy,
  type AffiliateSupplyCandidateEvidence,
  type AffiliateSupplyContractImpactCell,
  type AffiliateSupplyEvidenceSnapshot,
  type AffiliateSupplyIdentity,
  type AffiliateSupplyFreshnessStatus,
  type AffiliateSupplyLifecycleActorKind,
  type AffiliateSupplyLifecycleCommand,
  type AffiliateSupplyLifecycleOutcome,
  type AffiliateSupplyLifecycleStage,
} from './affiliateSupplyLifecycle';
import type {
  AffiliateAgentActiveContractRegistry,
  AffiliateAgentLifecycleAuthority,
} from './agentGatewayAdapters';
import { hashAffiliateAgentValue } from './agentGatewayContracts';
import { affiliateScrapeMappingSchema } from './types';
import {
  emitAffiliateOperationalAlerts,
  type AffiliateOperationalAlertInput,
} from './affiliateOperationalAlerts';
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
type AffiliateSupplyLegacyTargetRow = Pick<
  AffiliateSupplyTargets,
  'id' | 'candidateId' | 'targetType' | 'targetId' | 'status' | 'evidenceRefs'
>;
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
  mappingJobs: AffiliateSupplyDelegate<'affiliateSourceMappingJobs'>;
  approvals: AffiliateSupplyDelegate<'affiliateApprovalJobs'>;
  candidates: AffiliateSupplyDelegate<'affiliateImportCandidates'>;
  gatewayClaims: AffiliateSupplyDelegate<'affiliateAgentGatewayClaims'>;
  gatewayJobs: AffiliateSupplyDelegate<'affiliateAgentGatewayJobs'>;
  coverageJobs: AffiliateSupplyDelegate<'affiliateCoverageAgentJobs'>;
  campaigns: AffiliateSupplyDelegate<'affiliateSourceDiscoveryCampaigns'>;
  workerHealth: AffiliateSupplyDelegate<'affiliateAgentWorkerHealth'>;
  rawClient?: AffiliateSupplyClient;
  transaction?: (
    callback: (transaction: AffiliateSupplyDatabase) => Promise<unknown>,
    options?: unknown,
  ) => Promise<unknown>;
}>;

const supplyDatabaseForClient = (client: AffiliateSupplyClient): AffiliateSupplyDatabase => {
  const modelNames = {
    supplySources: 'affiliateSupplySources',
    contractManifests: 'affiliateSupplyContractManifests',
    transitions: 'affiliateSupplyLifecycleTransitions',
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
    mappingJobs: 'affiliateSourceMappingJobs',
    approvals: 'affiliateApprovalJobs',
    candidates: 'affiliateImportCandidates',
    gatewayClaims: 'affiliateAgentGatewayClaims',
    gatewayJobs: 'affiliateAgentGatewayJobs',
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

export const recordAffiliateAgentWorkerHeartbeat = async (
  input: AffiliateAgentWorkerHeartbeatInput,
  database: AffiliateSupplyDatabase = affiliateSupplyDatabase(),
): Promise<AffiliateAgentWorkerHealth | null> => {
  if (!database.workerHealth?.upsert) return null;
  const workerId = input.workerId.trim();
  const role = input.role.trim().toUpperCase();
  if (!workerId || !role) throw new Error('Affiliate worker heartbeats require a worker ID and role.');
  const now = input.now ?? new Date();
  const leaseExpiresAt = input.leaseExpiresAt ?? new Date(
    now.getTime() + Math.max(15_000, input.leaseDurationMs ?? 90_000),
  );
  const status = input.status?.trim().toUpperCase() || 'HEALTHY';
  return database.workerHealth.upsert({
    where: { workerId_role: { workerId, role } },
    create: {
      id: createId(),
      workerId,
      role,
      status,
      heartbeatAt: now,
      leaseExpiresAt,
      metadata: prismaNullableJsonValue(input.metadata),
    },
    update: {
      status,
      heartbeatAt: now,
      leaseExpiresAt,
      metadata: input.metadata == null ? undefined : prismaJsonValue(input.metadata),
    },
  });
};


const withSupplyTransaction = async <T>(
  database: AffiliateSupplyDatabase,
  callback: (transactionDatabase: AffiliateSupplyDatabase) => Promise<T>,
): Promise<T> => {
  let attempt = 0;
  while (true) {
    try {
      if (database.transaction) {
        return await database.transaction(callback, { isolationLevel: 'Serializable' }) as T;
      }
      return await callback(database);
    } catch (error) {
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (!['P2002', 'P2034'].includes(errorCode) || attempt >= 2) throw error;
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
  await Promise.all([
    linkSupplySource(
      input.database.intakes,
      input.intakeId,
      created.id,
      input.expectedIntakeSupplySourceId,
    ),
    linkSupplySource(input.database.sources, input.liveSourceId, created.id),
  ]);
  if (
    input.predecessorId
    && input.liveSourceId
    && input.database.sources?.findUnique
    && input.database.sources?.update
  ) {
    const successorSource = await input.database.sources.findUnique({ where: { id: input.liveSourceId } });
    if (successorSource) {
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
    }
  }
  return created;
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

export const ensureAffiliateSupplySource = async (
  input: EnsureAffiliateSupplySourceInput,
): Promise<EnsureAffiliateSupplySourceResult> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  if (!database.supplySources?.findUnique || !database.supplySources?.create) {
    throw new Error('Affiliate Supply Source persistence is not available. Apply the lifecycle migration first.');
  }
  const persisted = await withSupplyTransaction<EnsureAffiliateSupplySourceResult & {
    isRevalidationRequired?: boolean;
    isSuccessorCommandRequired?: boolean;
  }>(
    database,
    async (transactionDatabase) => {
    const prior = input.priorSupplySourceId
      ? await currentSupplySource(transactionDatabase, input.priorSupplySourceId)
      : null;
    const initialIdentity = normalizeAffiliateSupplyIdentity({
      requestedUrl: input.requestedUrl,
      resolvedCanonicalUrl: input.resolvedCanonicalUrl,
      isRedirectVerified: input.isRedirectVerified,
      operatorDomain: input.operatorDomain,
      prior: prior
        ? { canonicalUrl: prior.canonicalUrl, operatorDomain: prior.operatorDomain, identityKey: prior.identityKey }
        : null,
    });
    const existing = await transactionDatabase.supplySources.findUnique({
      where: { identityKey: initialIdentity.identityKey },
    });
    const existingByPath = !existing && transactionDatabase.supplySources.findFirst
      ? await transactionDatabase.supplySources.findFirst({
          where: { pathKey: initialIdentity.pathKey },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    const linkedSuccessor = prior?.successorId
      ? await currentSupplySource(transactionDatabase, prior.successorId)
      : null;
    if (prior?.successorId && (!linkedSuccessor || linkedSuccessor.identityKey !== initialIdentity.identityKey)) {
      const linkedSupplySource = linkedSuccessor ?? prior;
      return {
        supplySource: linkedSupplySource,
        identity: {
          ...initialIdentity,
          rootDecision: 'REVIEW_REQUIRED',
          reasonCodes: [...initialIdentity.reasonCodes, linkedSuccessor ? 'SUCCESSOR_ALREADY_LINKED' : 'SUCCESSOR_LINK_MISSING'],
        },
        isCreated: false,
        isSuccessorCreated: false,
        predecessorId: prior.id,
      };
    }
    const current = prior ?? existing ?? existingByPath;
    const existingSuccessor = prior && existing && existing.id !== prior.id ? existing : linkedSuccessor;
    const identity = current && !prior
      ? normalizeAffiliateSupplyIdentity({
          requestedUrl: input.requestedUrl,
          resolvedCanonicalUrl: input.resolvedCanonicalUrl,
          isRedirectVerified: input.isRedirectVerified,
          operatorDomain: input.operatorDomain,
          prior: { canonicalUrl: current.canonicalUrl, operatorDomain: current.operatorDomain, identityKey: current.identityKey },
        })
      : initialIdentity;
    const predecessorId = identity.rootDecision === 'SUCCESSOR_REQUIRED' ? prior?.id ?? current?.id ?? null : null;
    if (
      existingSuccessor
      && predecessorId
      && existingSuccessor.predecessorId
      && existingSuccessor.predecessorId !== predecessorId
    ) {
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
    }
    if (predecessorId) {
      const predecessorSource = current ?? existingSuccessor ?? prior;
      if (!predecessorSource) {
        throw new Error('Affiliate Supply Source successor command requires a persisted predecessor.');
      }
      return {
        supplySource: predecessorSource,
        identity,
        isCreated: false,
        isSuccessorCreated: false,
        predecessorId,
        isSuccessorCommandRequired: true,
      };
    }
    if (current && identity.rootDecision === 'REVIEW_REQUIRED') {
      return {
        supplySource: current,
        identity,
        isCreated: false,
        isSuccessorCreated: false,
        predecessorId: null,
      };
    }
    if (current && !predecessorId) {
      const hasExistingRevalidationHold = current.canonicalUrl === identity.canonicalUrl
        && current.automationHoldReason === 'CANONICAL_REVALIDATION_REQUIRED'
        && current.isAutomationEnabled !== true;
      const isRevalidationRequired = (
        current.canonicalUrl !== identity.canonicalUrl
        || identity.isRevalidationRequired
      ) && !hasExistingRevalidationHold;
      if (isRevalidationRequired) {
        return {
          supplySource: current,
          identity: { ...identity, identityKey: current.identityKey, rootDecision: 'SAME_ROOT' },
          isCreated: false,
          isSuccessorCreated: false,
          predecessorId: null,
          isRevalidationRequired: true,
        };
      }
      const updated = await transactionDatabase.supplySources.update({
        where: { id: current.id },
        data: {
          canonicalUrl: identity.canonicalUrl,
          origin: identity.origin,
          pathKey: identity.pathKey,
          operatorDomain: input.operatorDomain ?? current.operatorDomain ?? null,
          targetKind: input.targetKind?.trim().toUpperCase() || current.targetKind || 'EVENT',
          rolloutCohort: input.rolloutCohort?.trim() || current.rolloutCohort || 'DEFAULT',
          intakeId: input.intakeId ?? current.intakeId ?? null,
          liveSourceId: input.liveSourceId ?? current.liveSourceId ?? null,
          metadata: prismaNullableJsonValue(input.metadata ?? current.metadata),
          updatedAt: now,
        },
      });
      await Promise.all([
        linkSupplySource(
          transactionDatabase.intakes,
          input.intakeId,
          current.id,
          input.expectedIntakeSupplySourceId,
        ),
        linkSupplySource(transactionDatabase.sources, input.liveSourceId, current.id),
      ]);
      return {
        supplySource: updated,
        identity: { ...identity, identityKey: current.identityKey, rootDecision: 'SAME_ROOT' },
        isCreated: false,
        isSuccessorCreated: false,
        predecessorId: null,
      };
    }

    const created = await createAffiliateSupplySource({
      database: transactionDatabase,
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
    const rootEvidenceRefs = [
      `identity:${identity.identityKey}`,
      `canonical-url:${hashAffiliateAgentValue({
        requestedUrl: input.requestedUrl,
        resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
      })}`,
    ];
    await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: created.id,
      command: 'CREATE_ROOT',
      authority: 'SYSTEM',
      expectedLifecycleGeneration: 0,
      idempotencyKey: `root-creation:${identity.identityKey}`,
      request: {
        requestedUrl: input.requestedUrl,
        resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
        isRedirectVerified: input.isRedirectVerified === true,
        operatorDomain: input.operatorDomain ?? null,
        targetKind: input.targetKind ?? null,
        intakeId: input.intakeId ?? null,
        liveSourceId: input.liveSourceId ?? null,
        identityKey: identity.identityKey,
        evidenceRefs: rootEvidenceRefs,
      },
      actorKind: 'SYSTEM',
      actorId: 'affiliate-supply-identity',
      rolloutCohort: created.rolloutCohort,
      db: transactionDatabase,
      now,
    });
    const assessed = await transactionDatabase.supplySources.findUnique({
      where: { id: created.id },
    });
    return {
      supplySource: assessed ?? created,
      identity,
      isCreated: true,
      isSuccessorCreated: false,
      predecessorId: null,
    };
    },
  );
  if (persisted.isSuccessorCommandRequired) {
    const successorEvidenceRefs = [
      `supply-source:${persisted.supplySource.id}`,
      `identity:${persisted.identity.identityKey}`,
      `canonical-url:${hashAffiliateAgentValue({
        requestedUrl: input.requestedUrl,
        resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
      })}`,
    ];
    await executeAffiliateSupplyLifecycleCommand({
      supplySourceId: String(persisted.supplySource.id),
      command: 'CREATE_SUCCESSOR',
      authority: 'SYSTEM',
      expectedLifecycleGeneration: Number(persisted.supplySource.lifecycleGeneration ?? 0),
      idempotencyKey: `successor-creation:${persisted.supplySource.id}:${hashAffiliateAgentValue({
        requestedUrl: input.requestedUrl,
        resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
      })}`,
      request: {
        requestedUrl: input.requestedUrl,
        resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
        isRedirectVerified: input.isRedirectVerified === true,
        operatorDomain: input.operatorDomain ?? null,
        targetKind: input.targetKind ?? null,
        intakeId: input.intakeId ?? null,
        liveSourceId: input.liveSourceId ?? null,
        ...(input.expectedIntakeSupplySourceId !== undefined
          ? { expectedIntakeSupplySourceId: input.expectedIntakeSupplySourceId }
          : {}),
        evidenceRefs: successorEvidenceRefs,
      },
      actorKind: 'SYSTEM',
      actorId: 'affiliate-supply-identity',
      rolloutCohort: input.rolloutCohort ?? persisted.supplySource.rolloutCohort,
      db: database,
      now,
    });
    const predecessor = await database.supplySources.findUnique({
      where: { id: persisted.supplySource.id },
    });
    const successorId = stringValue(predecessor?.successorId);
    if (!successorId) {
      throw new Error('Affiliate successor creation did not produce a linked successor root.');
    }
    const successor = await database.supplySources.findUnique({ where: { id: successorId } });
    if (!successor) {
      throw new Error('Affiliate successor creation produced a missing successor root.');
    }
    return {
      ...persisted,
      supplySource: successor,
      identity: { ...persisted.identity, identityKey: successor.identityKey, rootDecision: 'SUCCESSOR_REQUIRED' },
      isCreated: false,
      isSuccessorCreated: true,
      predecessorId: persisted.supplySource.id,
    };
  }
  if (!persisted.isRevalidationRequired) return persisted;
  const identityEvidenceRefs = [
    `supply-source:${persisted.supplySource.id}`,
    `identity:${persisted.identity.identityKey}`,
    `canonical-url:${hashAffiliateAgentValue({
      requestedUrl: input.requestedUrl,
      resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
    })}`,
  ];
  await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: String(persisted.supplySource.id),
    command: 'REVALIDATE_IDENTITY',
    authority: 'SYSTEM',
    expectedLifecycleGeneration: Number(persisted.supplySource.lifecycleGeneration ?? 0),
    idempotencyKey: `identity-revalidation:${persisted.supplySource.id}:${hashAffiliateAgentValue({
      requestedUrl: input.requestedUrl,
      resolvedCanonicalUrl: input.resolvedCanonicalUrl ?? input.requestedUrl,
    })}`,
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
      evidenceRefs: identityEvidenceRefs,
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
  return {
    ...persisted,
    supplySource: refreshedSupplySource ?? persisted.supplySource,
  };
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
const buildAffiliateSupplyContractActivationImpact = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  nextPolicy: AffiliateSupplyContractPolicy;
  rolloutCohort: string;
  now?: Date;
}>): Promise<ReturnType<typeof buildAffiliateSupplyContractImpactReport>> => {
  const activeRow = input.database.contractManifests?.findFirst
    ? await input.database.contractManifests.findFirst({
        where: { status: 'ACTIVE', rolloutCohort: input.rolloutCohort },
        orderBy: { version: 'desc' },
      })
    : null;
  const currentManifest = activeRow
    ? (() => {
        const preimage = {
          schemaVersion: 1 as const,
          version: activeRow.version,
          rolloutCohort: activeRow.rolloutCohort,
          supplyContract: activeRow.contractJson,
        };
        if (activeRow.contractHash !== hashAffiliateAgentValue(preimage)) {
          throw new Error('Stored Affiliate Supply Contract hash does not match its immutable content.');
        }
        return affiliateSupplyContractManifestSchema.parse({
          ...preimage,
          status: activeRow.status,
          hash: activeRow.contractHash,
        });
      })()
    : {
        schemaVersion: 1 as const,
        version: 0,
        rolloutCohort: input.rolloutCohort,
        supplyContract: {
          schemaVersion: 1 as const,
          version: 0,
          rolloutCohort: input.rolloutCohort,
          hash: '',
          freshnessWindows: [],
          targets: [],
          requiredMappingEvidenceKinds: [],
          requiredLifecycleEvidenceKinds: [],
        },
        status: 'ACTIVE' as const,
        hash: '',
      } as AffiliateSupplyContractManifest;
  const sources = input.database.supplySources?.findMany
    ? await input.database.supplySources.findMany({
        where: { rolloutCohort: input.rolloutCohort },
      })
    : [];
  const currentPolicy = normalizeAffiliateSupplyContractPolicy(
    currentManifest.supplyContract,
    currentManifest.rolloutCohort,
  );
  const targetRows = typeof input.database.targets?.findMany === 'function' && sources.length > 0
    ? await input.database.targets.findMany({
        where: { supplySourceId: { in: sources.map((source) => source.id) } },
        select: { supplySourceId: true, marketKey: true, sportId: true, sourceProfile: true },
      })
    : [];
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
  const currentAssessments = new Map<string, AffiliateSupplyAssessment>();
  const nextAssessments = new Map<string, AffiliateSupplyAssessment>();
  const hasAssessmentLoaders = Boolean(
    sources.length
    && typeof input.database.sources?.findMany === 'function'
    && typeof input.database.intakes?.findMany === 'function'
    && typeof input.database.mappings?.findMany === 'function'
    && typeof input.database.mappingJobs?.findMany === 'function'
    && typeof input.database.approvals?.findMany === 'function'
    && typeof input.database.runs?.findMany === 'function'
    && typeof input.database.candidates?.findMany === 'function'
    && typeof input.database.targets?.findMany === 'function'
    && typeof input.database.supplySources?.findMany === 'function',
  );
  if (hasAssessmentLoaders) {
    const now = input.now ?? new Date();
    const roots = sources as AffiliateSupplySources[];
    const [currentSnapshots, nextSnapshots] = await Promise.all([
      loadSnapshots(input.database, roots, currentPolicy, now),
      loadSnapshots(input.database, roots, input.nextPolicy, now),
    ]);
    for (const source of sources) {
      const currentSnapshot = currentSnapshots.get(source.id);
      const nextSnapshot = nextSnapshots.get(source.id);
      if (currentSnapshot) {
        currentAssessments.set(source.id, deriveAffiliateSupplyAssessment(currentSnapshot));
      }
      if (nextSnapshot) {
        nextAssessments.set(source.id, deriveAffiliateSupplyAssessment(nextSnapshot));
      }
    }
  }
  return buildAffiliateSupplyContractImpactReport({
    currentManifest,
    sources: sources.map((source) => {
      const currentAssessment = currentAssessments.get(source.id);
      const nextAssessment = nextAssessments.get(source.id);
      const currentFreshnessStatus = currentAssessment?.freshnessStatus
        ?? (['FRESH', 'STALE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(source.freshnessStatus)
          ? source.freshnessStatus as AffiliateSupplyFreshnessStatus
          : 'UNKNOWN');
      return {
        id: source.id,
        stage: currentAssessment?.stage ?? source.derivedStage,
        targetContribution: currentAssessment?.targetContribution ?? source.targetContribution,
        isAutomationEnabled: currentAssessment?.isAutomationEnabled ?? source.isAutomationEnabled,
        repairPriority: currentAssessment?.repairPriority ?? source.repairPriority,
        freshnessStatus: currentFreshnessStatus,
        ...(nextAssessment
          ? {
            nextStage: nextAssessment.stage,
            nextTargetContribution: nextAssessment.targetContribution,
            nextIsAutomationEnabled: nextAssessment.isAutomationEnabled,
            nextRepairPriority: nextAssessment.repairPriority,
          }
          : {}),
        targetCells: currentAssessment
          ? targetCellsForAssessment(currentAssessment)
          : targetCellsBySource.get(source.id) ?? [],
        ...(currentAssessment
          ? { currentFreshTargetCells: freshTargetCellsForAssessment(currentAssessment) }
          : {}),
        ...(nextAssessment
          ? { nextFreshTargetCells: freshTargetCellsForAssessment(nextAssessment) }
          : {}),
      };
    }),
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
  const sourceId = source?.id ?? root.liveSourceId ?? `supply-source:${supplySourceId}`;
  const identityViolations = [
    ...(root.liveSourceId && !source ? ['ROOT_LIVE_SOURCE_MISSING'] : []),
    ...(root.intakeId && !intake ? ['ROOT_INTAKE_MISSING'] : []),
    ...(root.liveSourceId && source && source.supplySourceId !== supplySourceId ? ['SOURCE_SUPPLY_ROOT_MISMATCH'] : []),
    ...(root.intakeId && intake && intake.supplySourceId !== supplySourceId ? ['INTAKE_SUPPLY_ROOT_MISMATCH'] : []),
    ...(root.predecessorId && !predecessor ? ['PREDECESSOR_MISSING'] : []),
    ...(root.predecessorId && predecessor && String(predecessor.successorId ?? '') !== supplySourceId
      ? ['PREDECESSOR_LINK_MISMATCH']
      : []),
    ...(root.successorId && !successor ? ['SUCCESSOR_MISSING'] : []),
    ...(root.successorId && successor && String(successor.predecessorId ?? '') !== supplySourceId
      ? ['SUCCESSOR_LINK_MISMATCH']
      : []),
    ...(mapping?.supplySourceId && mapping.supplySourceId !== supplySourceId ? ['MAPPING_SUPPLY_ROOT_MISMATCH'] : []),
    ...(mapping?.sourceId && source?.id && mapping.sourceId !== source.id ? ['MAPPING_SOURCE_MISMATCH'] : []),
    ...(mappingJob?.supplySourceId && mappingJob.supplySourceId !== supplySourceId ? ['MAPPING_JOB_SUPPLY_ROOT_MISMATCH'] : []),
    ...(latestRun?.supplySourceId && latestRun.supplySourceId !== supplySourceId ? ['RUN_SUPPLY_ROOT_MISMATCH'] : []),
    ...candidates
      .filter((candidate) => candidate.supplySourceId && candidate.supplySourceId !== supplySourceId)
      .map(() => 'CANDIDATE_SUPPLY_ROOT_MISMATCH'),
  ];
  return {
    now,
    contract,
    supplySourceId,
    source: {
      id: sourceId,
      canonicalUrl: root.canonicalUrl,
      targetKind: source?.targetKind ?? root.targetKind,
      status: source?.status ?? (root.isExcluded ? 'EXCLUDED' : 'ACTIVE'),
      autoScrapeEnabled: source?.autoScrapeEnabled === true,
      activeMappingId: source?.activeMappingId ?? mapping?.id ?? null,
      lifecycleGeneration: root.lifecycleGeneration,
      operatorDomain: root.operatorDomain,
      isAutomationOnHold: Boolean(recordValue(sourceMetadata.automationReviewRequired).hold),
      automationHoldReason: stringValue(recordValue(sourceMetadata.automationReviewRequired).reason),
      isExcluded: root.isExcluded,
      metadata: sourceMetadata,
    },
    intake: intake ? { id: intake.id, status: intake.status, complianceStatus: intake.complianceStatus } : null,
    mapping: mapping ? {
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
      validationOutput: Object.keys(recordValue(mappingMetadata.validationOutput)).length
        ? recordValue(mappingMetadata.validationOutput)
        : Object.keys(recordValue(mappingJson.validationOutput)).length
          ? recordValue(mappingJson.validationOutput)
          : mapping.validatedAt ? { isValid: true } : null,
    } : null,
    mappingJob: mappingJob ? {
      id: mappingJob.id,
      status: mappingJob.status,
      sourceId: mappingJob.sourceId,
      mappingId: mappingJob.mappingId,
      resultSummary: recordValue(mappingJob.resultSummary),
      evidenceRefs: stringArray(recordValue(mappingJob.resultSummary).evidenceRefs),
    } : null,
    approval: approval ? {
      id: approval.id,
      status: approval.status,
      decision: typeof (recordValue(approval.decision).decision ?? approval.decision) === 'string'
        ? (recordValue(approval.decision).decision ?? approval.decision) as string
        : null,
      isIndependent: recordValue(approval.decision).isIndependent === true
        || recordValue(approval.decision).independent === true,
      reviewerId: approval.reviewerId,
      reviewedPackageHash: stringValue(recordValue(approval.decision).packageHash),
      evidenceRefs: stringArray(recordValue(approval.decision).evidenceRefs),
    } : null,
    latestRun: latestRun ? {
      id: latestRun.id,
      status: latestRun.status,
      mappingId: latestRun.mappingId,
      startedAt: latestRun.startedAt,
      finishedAt: latestRun.finishedAt,
      finalUrl: latestRun.finalUrl,
      httpStatus: latestRun.httpStatus,
      itemCount: latestRun.itemCount ?? 0,
      candidateCount: latestRun.candidateCount ?? 0,
      isEmptyStateMatched: runLogs.isEmptyStateMatched === true
        || runLogs.emptyStateMatched === true,
      errorCode: stringValue(runLogs.errorCode),
      errorMessage: latestRun.errorMessage,
      evidenceRefs: stringArray(runLogs.evidenceRefs),
      metadata: recordValue(latestRun.metadata),
    } : null,
    baseline: sourceMetadata[AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY] ?? null,
    lifecycleEvidenceKinds,
    identityViolations,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
      listingKind: candidate.listingKind,
      publishedTargetId: candidate.publishedEventId ?? candidate.publishedTeamId ?? candidate.publishedFacilityId ?? candidate.publishedOrganizationId,
      targetType: candidate.listingKind === 'RENTAL'
        ? 'FACILITY'
        : candidate.listingKind === 'CLUB'
          ? 'ORGANIZATION'
          : candidate.listingKind,
      sourceProfile: candidate.listingKind,
      evidenceRefs: stringArray(recordValue(candidate.rawPayload).evidenceRefs),
    })),
    targets: targets.map((target) => ({
      id: target.id,
      targetType: target.targetType,
      targetId: target.targetId,
      sourceProfile: target.sourceProfile,
      status: target.status,
      marketKey: target.marketKey,
      sportId: target.sportId,
      publishedAt: target.publishedAt?.toISOString?.() ?? target.publishedAt,
      lastSuccessfulRefreshAt: target.lastSuccessfulRefreshAt?.toISOString?.() ?? target.lastSuccessfulRefreshAt,
      freshnessExpiresAt: target.freshnessExpiresAt?.toISOString?.() ?? target.freshnessExpiresAt,
      rejectedAt: target.rejectedAt?.toISOString?.() ?? target.rejectedAt,
      evidenceRefs: target.evidenceRefs,
      metadata: recordValue(target.metadata),
    })),
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

const loadSnapshot = async (
  database: AffiliateSupplyDatabase,
  supplySourceId: string,
  contract: AffiliateSupplyContractPolicy,
  now: Date,
  excludeRunId?: string | null,
): Promise<AffiliateSupplyEvidenceSnapshot> => {
  const root = await database.supplySources.findUnique({ where: { id: supplySourceId } });
  if (!root) throw new Error('Affiliate Supply Source not found.');
  const [source, intake, predecessor, successor] = await Promise.all([
    root.liveSourceId ? database.sources.findUnique({ where: { id: root.liveSourceId } }) : database.sources.findFirst({ where: { supplySourceId }, orderBy: { createdAt: 'asc' } }),
    root.intakeId ? database.intakes.findUnique({ where: { id: root.intakeId } }) : database.intakes.findFirst({ where: { supplySourceId }, orderBy: { createdAt: 'asc' } }),
    root.predecessorId
      ? database.supplySources.findUnique({ where: { id: root.predecessorId } })
      : Promise.resolve(null),
    root.successorId
      ? database.supplySources.findUnique({ where: { id: root.successorId } })
      : Promise.resolve(null),
  ]);
  const sourceId = source?.id ?? root.liveSourceId ?? `supply-source:${supplySourceId}`;
  const [mapping, mappingJob, approval, latestRun, candidates, targets] = await Promise.all([
    source?.activeMappingId ? database.mappings.findUnique({ where: { id: source.activeMappingId } }) : database.mappings.findFirst({ where: { supplySourceId }, orderBy: [{ isActive: 'desc' }, { version: 'desc' }] }),
    database.mappingJobs.findFirst({ where: { OR: [{ supplySourceId }, { sourceId }] }, orderBy: { createdAt: 'desc' } }),
    database.approvals.findFirst({
      where: { supplySourceId, subjectType: 'MAPPING_PACKAGE' },
      orderBy: { updatedAt: 'desc' },
    }),
    database.runs.findFirst({
      where: {
        AND: [
          { OR: [{ supplySourceId }, { sourceId }] },
          ...(excludeRunId ? [{ NOT: { id: excludeRunId } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
    database.candidates.findMany({ where: { OR: [{ supplySourceId }, { sourceId }] }, orderBy: { createdAt: 'asc' } }),
    database.targets.findMany({ where: { supplySourceId }, orderBy: { targetId: 'asc' } }),
  ]);
  return buildAffiliateSupplySnapshot({
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
  });
};
const loadSnapshots = async (
  database: AffiliateSupplyDatabase,
  roots: readonly AffiliateSupplySources[],
  contract: AffiliateSupplyContractPolicy,
  now: Date,
): Promise<Map<string, AffiliateSupplyEvidenceSnapshot>> => {
  if (!roots.length) return new Map();
  if (
    !database.sources?.findMany
    || !database.intakes?.findMany
    || !database.mappings?.findMany
    || !database.mappingJobs?.findMany
    || !database.approvals?.findMany
    || !database.runs?.findMany
    || !database.candidates?.findMany
    || !database.supplySources?.findMany
  ) {
    const snapshots = await Promise.all(roots.map((root) => loadSnapshot(database, root.id, contract, now)));
    return new Map(roots.map((root, index) => [String(root.id), snapshots[index]]));
  }
  const supplySourceIds = roots.map((root) => String(root.id));
  const sourceIds = roots
    .map((root) => root.liveSourceId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const intakeIds = roots
    .map((root) => root.intakeId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const predecessorIds = roots
    .map((root) => root.predecessorId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const successorIds = roots
    .map((root) => root.successorId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const [sources, intakes, mappings, mappingJobs, approvals, runs, candidates, targets, linkedRoots] = await Promise.all([
    database.sources.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ id: { in: sourceIds } }] : []),
        ],
      },
    }),
    database.intakes.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(intakeIds.length ? [{ id: { in: intakeIds } }] : []),
        ],
      },
    }),
    database.mappings.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      orderBy: [{ isActive: 'desc' }, { version: 'desc' }],
    }),
    database.mappingJobs.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
    database.approvals.findMany({
      where: { supplySourceId: { in: supplySourceIds }, subjectType: 'MAPPING_PACKAGE' },
      orderBy: { updatedAt: 'desc' },
    }),
    database.runs.findMany({
      where: {
        AND: [
          {
            OR: [
              { supplySourceId: { in: supplySourceIds } },
              ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
    database.candidates.findMany({
      where: {
        OR: [
          { supplySourceId: { in: supplySourceIds } },
          ...(sourceIds.length ? [{ sourceId: { in: sourceIds } }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    }),
    database.targets.findMany({
      where: { supplySourceId: { in: supplySourceIds } },
      orderBy: { targetId: 'asc' },
    }),
    database.supplySources.findMany({
      where: { id: { in: Array.from(new Set([...predecessorIds, ...successorIds])) } },
    }),
  ]);
  const firstFor = <T>(rows: readonly T[], predicate: (row: T) => boolean): T | null => rows.find(predicate) ?? null;
  const valueAt = (row: unknown, field: string): unknown => (
    row && typeof row === 'object' && field in row
      ? (row as Record<string, unknown>)[field]
      : undefined
  );
  const sortDateDesc = (left: unknown, right: unknown, field: string): number => {
    const leftValue = valueAt(left, field);
    const rightValue = valueAt(right, field);
    const leftTime = leftValue instanceof Date
      ? leftValue.getTime()
      : leftValue ? new Date(String(leftValue)).getTime() : Number.NEGATIVE_INFINITY;
    const rightTime = rightValue instanceof Date
      ? rightValue.getTime()
      : rightValue ? new Date(String(rightValue)).getTime() : Number.NEGATIVE_INFINITY;
    return rightTime - leftTime;
  };
  return new Map(roots.map((root) => {
    const rootId = String(root.id);
    const source = root.liveSourceId
      ? firstFor(sources, (row) => row.id === root.liveSourceId)
      : firstFor(sources, (row) => row.supplySourceId === rootId);
    const intake = root.intakeId
      ? firstFor(intakes, (row) => row.id === root.intakeId)
      : firstFor(intakes, (row) => row.supplySourceId === rootId);
    const predecessor = root.predecessorId
      ? firstFor(linkedRoots, (row) => row.id === root.predecessorId)
      : null;
    const successor = root.successorId
      ? firstFor(linkedRoots, (row) => row.id === root.successorId)
      : null;
    const sourceId = source?.id ?? root.liveSourceId ?? `supply-source:${rootId}`;
    const rootMappings = mappings
      .filter((row) => row.supplySourceId === rootId || row.sourceId === sourceId)
      .sort((left, right) => Number(right.isActive) - Number(left.isActive) || Number(right.version ?? 0) - Number(left.version ?? 0));
    const mapping = source?.activeMappingId
      ? firstFor(rootMappings, (row) => row.id === source.activeMappingId)
      : rootMappings[0] ?? null;
    const rootMappingJobs = mappingJobs
      .filter((row) => row.supplySourceId === rootId || row.sourceId === sourceId)
      .sort((left, right) => sortDateDesc(left, right, 'createdAt'));
    const rootApprovals = approvals
      .filter((row) => row.supplySourceId === rootId && row.subjectType === 'MAPPING_PACKAGE')
      .sort((left, right) => sortDateDesc(left, right, 'updatedAt'));
    const rootRuns = runs
      .filter((row) => (
        (row.supplySourceId === rootId || row.sourceId === sourceId)
        && row.id !== undefined
      ))
      .sort((left, right) => sortDateDesc(left, right, 'createdAt'));
    return [
      rootId,
      buildAffiliateSupplySnapshot({
        root,
        source,
        intake,
        predecessor,
        successor,
        mapping,
        mappingJob: rootMappingJobs[0] ?? null,
        approval: rootApprovals[0] ?? null,
        latestRun: rootRuns[0] ?? null,
        candidates: candidates.filter((row) => row.supplySourceId === rootId || row.sourceId === sourceId),
        targets: targets.filter((row) => row.supplySourceId === rootId),

        contract,
        now,
      }),
    ] as const;
  }));
};
const invariantAlertInputsFor = (
  assessment: AffiliateSupplyAssessment,
  contract: AffiliateSupplyContractPolicy,
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
  contract: AffiliateSupplyContractPolicy,
  writer: AffiliateSupplyOperationalAlertWriter | undefined,
): Promise<void> => {
  const inputs = invariantAlertInputsFor(assessment, contract);
  if (inputs.length === 0) return;
  await (writer ?? emitAffiliateOperationalAlerts)(inputs);
};

export const deriveAndPersistAffiliateSupplyAssessment = async (input: Readonly<{
  supplySourceId: string;
  contract?: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  emitOperationalAlerts?: boolean;
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
  if (!database.supplySources?.update) return assessment;
  await database.supplySources.update({
    where: { id: input.supplySourceId },
    data: {
      derivedStage: assessment.stage,
      derivedOutcome: assessment.outcome,
      freshnessStatus: assessment.freshnessStatus,
      targetContribution: assessment.targetContribution,
      repairPriority: assessment.repairPriority,
      isAutomationEnabled: assessment.isAutomationEnabled,
      isExcluded: assessment.stage === 'SOURCE_EXCLUDED',
      automationHoldReason: assessment.automationHoldReason,
      lastSuccessfulRefreshAt: snapshot.latestRun && isSuccessStatus(snapshot.latestRun.status) ? toDate(snapshot.latestRun.finishedAt) : undefined,
      lastAssessmentAt: now,
      assessmentJson: prismaJsonValue(assessment),
      invariantViolations: [...assessment.invariantViolations],
      activeSupplyContractVersion: contractResult.policy.version,
      activeSupplyContractHash: contractResult.policy.hash,
    },
  });
  if (input.emitOperationalAlerts !== false) {
    await emitPersistedInvariantAlerts(
      assessment,
      contractResult.policy,
      input.operationalAlert,
    );
  }
  return assessment;
};

export const reconcileAffiliateSupplySource = deriveAndPersistAffiliateSupplyAssessment;

export const upsertAffiliateSupplyTarget = async (input: Readonly<{
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
  contract?: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
}>): Promise<AffiliateSupplyTargets | null> => {
  const database = input.db ?? affiliateSupplyDatabase();
  if (!database.targets?.upsert) return null;
  const refreshedAt = input.refreshedAt ?? new Date();
  const maximumAgeHours = input.contract?.freshnessWindows.find((window) => window.sourceProfile.toUpperCase() === input.sourceProfile.toUpperCase())?.maximumAgeHours ?? 24;
  const status = input.status ?? 'PUBLISHED';
  return database.targets.upsert({
    where: { supplySourceId_targetType_targetId: { supplySourceId: input.supplySourceId, targetType: input.targetType, targetId: input.targetId } },
    create: {
      id: createId(),
      supplySourceId: input.supplySourceId,
      candidateId: input.candidateId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      marketKey: input.marketKey ?? null,
      sportId: input.sportId ?? null,
      sourceProfile: input.sourceProfile,
      status,
      publishedAt: status === 'PUBLISHED' ? refreshedAt : null,
      lastSuccessfulRefreshAt: status === 'PUBLISHED' ? refreshedAt : null,
      freshnessExpiresAt: status === 'PUBLISHED' ? new Date(refreshedAt.getTime() + maximumAgeHours * 60 * 60 * 1000) : null,
      rejectedAt: status === 'REJECTED' ? refreshedAt : null,
      rejectionReason: input.rejectionReason ?? null,
      evidenceRefs: Array.from(new Set(input.evidenceRefs ?? [])),
      metadata: prismaNullableJsonValue(input.metadata),
    },
    update: {
      candidateId: input.candidateId ?? undefined,
      marketKey: input.marketKey ?? undefined,
      sportId: input.sportId ?? undefined,
      status,
      publishedAt: status === 'PUBLISHED' ? refreshedAt : undefined,
      lastSuccessfulRefreshAt: status === 'PUBLISHED' ? refreshedAt : undefined,
      freshnessExpiresAt: status === 'PUBLISHED' ? new Date(refreshedAt.getTime() + maximumAgeHours * 60 * 60 * 1000) : undefined,
      rejectedAt: status === 'REJECTED' ? refreshedAt : undefined,
      rejectionReason: input.rejectionReason ?? undefined,
      evidenceRefs: Array.from(new Set(input.evidenceRefs ?? [])),
      metadata: input.metadata == null ? undefined : prismaJsonValue(input.metadata),
    },
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
  request: normalizeAffiliateLifecycleJson(input.request),
});
export const recordAffiliateSupplyLifecycleTransition = async (
  input: AffiliateSupplyTransitionInput,
): Promise<{ transition: AffiliateSupplyLifecycleTransitions; isReplayed: boolean }> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const request = normalizeAffiliateLifecycleJson(input.request) as Record<string, unknown>;
  const result = normalizeAffiliateLifecycleJson(input.result) as Record<string, unknown>;
  const requestHash = affiliateLifecycleRequestHash({ ...input, request });
  const resultHash = hashAffiliateAgentValue(result);
  const existing = await database.transitions.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
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
  }
  return withSupplyTransaction(database, async (transactionDatabase) => {
    const source = await transactionDatabase.supplySources.findUnique({ where: { id: input.supplySourceId } });
    if (!source) throw new Error('Affiliate Supply Source not found.');
    if (source.lifecycleGeneration !== input.expectedGeneration) throw new Error('Affiliate Supply Source lifecycle generation is stale.');
    const latest = await transactionDatabase.transitions.findFirst({ where: { supplySourceId: input.supplySourceId }, orderBy: { sequence: 'desc' } });
    const transitionData = {
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
      resultJson: prismaJsonValue(result),
      occurredAt: now,
    };
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
        assessmentJson: prismaJsonValue(result),
      },
    });
    return { transition, isReplayed: false };
  });
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

const applyCommandTarget = async (
  database: AffiliateSupplyDatabase,
  supplySourceId: string,
  target: Record<string, unknown>,
  now: Date,
  defaultEvidenceRefs: readonly string[],
  contract?: AffiliateSupplyContractPolicy,
): Promise<void> => {
  const targetType = stringValue(target.targetType);
  const targetId = stringValue(target.targetId);
  const sourceProfile = stringValue(target.sourceProfile) ?? targetType;
  if (!targetType || !targetId || !sourceProfile) {
    throw new Error('Affiliate lifecycle target writes require target type, target ID, and source profile.');
  }
  const targetRule = contract
    ? targetRuleFor(contract, {
        marketKey: stringValue(target.marketKey),
        sportId: stringValue(target.sportId),
        sourceProfile,
      }) ?? (() => {
        const marketKey = stringValue(target.marketKey);
        const sportId = stringValue(target.sportId);
        if (marketKey || sportId) {
          const candidates = contract.targets.filter((rule) => (
            rule.sourceProfile.toUpperCase() === sourceProfile.toUpperCase()
            && (rule.marketKey == null || rule.marketKey === marketKey)
            && (rule.sportId == null || rule.sportId === sportId)
          ));
          return candidates.length === 1 ? candidates[0] : null;
        }
        const candidates = contract.targets.filter((rule) => (
          rule.sourceProfile.toUpperCase() === sourceProfile.toUpperCase()
        ));
        return candidates.length === 1 ? candidates[0] : null;
      })()
    : null;
  if (contract && !targetRule) {
    throw new Error('Affiliate lifecycle target writes require a matching Supply Contract target cell.');
  }
  await upsertAffiliateSupplyTarget({
    supplySourceId,
    targetType,
    targetId,
    sourceProfile,
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
    db: database,
  });
};

const publishAffiliateDomainTarget = async (
  database: AffiliateSupplyDatabase,
  target: Record<string, unknown>,
): Promise<void> => {
  const targetType = stringValue(target.targetType)?.toUpperCase();
  const targetId = stringValue(target.targetId);
  if (!targetType || !targetId) return;
  if (targetType === 'EVENT' && database.events?.update) {
    await database.events.update({
      where: { id: targetId },
      data: { state: 'PUBLISHED', archivedAt: null },
    });
  } else if (targetType === 'TEAM' && database.teams?.update) {
    await database.teams.update({
      where: { id: targetId },
      data: { visibility: 'PUBLIC', archivedAt: null },
    });
  } else if (targetType === 'FACILITY' && database.facilities?.update) {
    await database.facilities.update({
      where: { id: targetId },
      data: { status: 'ACTIVE' },
    });
  } else if (targetType === 'ORGANIZATION' && database.organizations?.update) {
    await database.organizations.update({
      where: { id: targetId },
      data: {
        status: 'LISTED',
        publicPageEnabled: true,
        publicWidgetsEnabled: true,
      },
    });
  }
};
const rejectAffiliateDomainTarget = async (
  database: AffiliateSupplyDatabase,
  target: Record<string, unknown>,
): Promise<void> => {
  const targetType = stringValue(target.targetType)?.toUpperCase();
  const targetId = stringValue(target.targetId);
  if (!targetType || !targetId) return;
  if (targetType === 'EVENT' && database.events?.update) {
    await database.events.update({
      where: { id: targetId },
      data: { state: 'UNPUBLISHED' },
    });
  } else if (targetType === 'TEAM' && database.teams?.update) {
    await database.teams.update({
      where: { id: targetId },
      data: { visibility: 'ADMIN_ONLY' },
    });
  } else if (targetType === 'FACILITY' && database.facilities?.update) {
    await database.facilities.update({
      where: { id: targetId },
      data: { status: 'DRAFT' },
    });
  } else if (targetType === 'ORGANIZATION' && database.organizations?.update) {
    await database.organizations.update({
      where: { id: targetId },
      data: {
        status: 'UNLISTED',
        publicPageEnabled: false,
        publicWidgetsEnabled: false,
      },
    });
  }
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

export const executeAffiliateSupplyLifecycleCommand = async (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
): Promise<AffiliateSupplyLifecycleCommandResult> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const request: Record<string, unknown> = {
    ...(input.request ?? {}),
    ...(input.supplyContractVersion === undefined
      ? {}
      : { supplyContractVersion: input.supplyContractVersion }),
    ...(input.supplyContractHash === undefined
      ? {}
      : { supplyContractHash: input.supplyContractHash }),
  };
  const now = input.now ?? new Date();
  let alertContract: AffiliateSupplyContractPolicy | null = null;
  const result = await withSupplyTransaction(database, async (transactionDatabase) => {
    const existing = await transactionDatabase.transitions.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
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
      return {
        assessment: existing.resultJson as unknown as AffiliateSupplyAssessment,
        transition: existing,
        isReplayed: true,
      };
    }
    const root = await transactionDatabase.supplySources.findUnique({ where: { id: input.supplySourceId } });
    if (!root) throw new Error('Affiliate Supply Source not found.');
    if (input.command === 'CREATE_ROOT') {
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
    }
    const refreshFailureRunId = input.command === 'RECORD_REFRESH_FAILURE'
      ? stringValue(request.runId)
      : null;
    const refreshFailureRun = refreshFailureRunId && transactionDatabase.runs?.findUnique
      ? await transactionDatabase.runs.findUnique({ where: { id: refreshFailureRunId } })
      : null;
    if (input.command === 'RECORD_REFRESH_FAILURE') {
      if (!refreshFailureRunId || !refreshFailureRun) {
        throw new Error('Affiliate refresh failure requires a durable scrape invocation.');
      }
      const runStatus = String(refreshFailureRun.status ?? '').toUpperCase();
      if (['SUCCEEDED', 'SUCCESS', 'COMPLETED'].includes(runStatus)) {
        throw new Error('Affiliate refresh failure cannot replace a successful scrape invocation.');
      }
      const runMatchesRoot = (
        refreshFailureRun.supplySourceId === input.supplySourceId
        || (root.liveSourceId && refreshFailureRun.sourceId === root.liveSourceId)
      );
      if (!runMatchesRoot) {
        throw new Error('Affiliate refresh failure invocation does not belong to the Supply Source.');
      }
    }
    const contract = await loadActiveAffiliateSupplyContract({
      db: transactionDatabase,
      rolloutCohort: input.rolloutCohort ?? root.rolloutCohort,
    });
    alertContract = contract.policy;
    const requestedContractVersion = typeof request.supplyContractVersion === 'number'
      && Number.isInteger(request.supplyContractVersion)
      ? request.supplyContractVersion
      : null;
    const requestedContractHash = stringValue(request.supplyContractHash);
    const commandContractVersion = input.supplyContractVersion
      ?? requestedContractVersion
      ?? contract.policy.version;
    const commandContractHash = input.supplyContractHash
      ?? requestedContractHash
      ?? contract.policy.hash;
    const snapshotBefore = await loadSnapshot(
      transactionDatabase,
      input.supplySourceId,
      contract.policy,
      now,
      ['RECORD_REFRESH', 'RECORD_EMPTY_REFRESH', 'RECORD_REFRESH_FAILURE'].includes(input.command)
        ? stringValue(request.runId)
        : null,
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
      assessment: assessmentBefore,
    });
    if (!commandDecision.isAccepted) {
      throw new Error(`Affiliate lifecycle command rejected: ${commandDecision.reasonCodes.join(', ')}`);
    }

    const source = root.liveSourceId
      ? await transactionDatabase.sources.findUnique({ where: { id: root.liveSourceId } })
      : await transactionDatabase.sources.findFirst({ where: { supplySourceId: input.supplySourceId }, orderBy: { createdAt: 'asc' } });
    const mappingId = stringValue(request.mappingId);
    const evidenceRefs = [
      ...stringArray(request.evidenceRefs),
      ...(refreshFailureRunId ? [`scrape-run:${refreshFailureRunId}`] : []),
      `supply-source:${input.supplySourceId}`,
    ];
    if (input.command === 'CREATE_SUCCESSOR') {
      const successorRequest = recordValue(request.successor);
      const expectedIntakeSupplySourceId = Object.prototype.hasOwnProperty.call(
        successorRequest,
        'expectedIntakeSupplySourceId',
      )
        ? stringValue(successorRequest.expectedIntakeSupplySourceId)
        : Object.prototype.hasOwnProperty.call(request, 'expectedIntakeSupplySourceId')
          ? stringValue(request.expectedIntakeSupplySourceId)
          : undefined;
      const requestedUrl = stringValue(successorRequest.requestedUrl ?? request.requestedUrl);
      if (!requestedUrl) {
        throw new Error('Affiliate successor creation requires a requested URL.');
      }
      const resolvedCanonicalUrl = stringValue(
        successorRequest.resolvedCanonicalUrl ?? request.resolvedCanonicalUrl,
      ) ?? requestedUrl;
      let operatorDomain = stringValue(successorRequest.operatorDomain ?? request.operatorDomain);
      try {
        operatorDomain ??= new URL(resolvedCanonicalUrl).hostname;
      } catch {
        throw new Error('Affiliate successor creation requires a valid canonical URL.');
      }
      const successorIdentity = normalizeAffiliateSupplyIdentity({
        requestedUrl,
        resolvedCanonicalUrl,
        isRedirectVerified: successorRequest.isRedirectVerified === true || request.isRedirectVerified === true,
        operatorDomain,
      });
      if (root.successorId) {
        const existingSuccessor = await transactionDatabase.supplySources.findUnique({
          where: { id: root.successorId },
        });
        if (!existingSuccessor || existingSuccessor.identityKey !== successorIdentity.identityKey) {
          throw new Error('Affiliate Supply Source already has a different successor.');
        }
      } else {
        const existingSuccessor = await transactionDatabase.supplySources.findUnique({
          where: { identityKey: successorIdentity.identityKey },
        });
        if (existingSuccessor && existingSuccessor.id === root.id) {
          throw new Error('Affiliate successor identity resolves to its predecessor root.');
        }
        if (existingSuccessor?.predecessorId && existingSuccessor.predecessorId !== root.id) {
          throw new Error('Affiliate successor identity is already linked to another predecessor.');
        }
        const successor = existingSuccessor
          ? await transactionDatabase.supplySources.update({
              where: { id: existingSuccessor.id },
              data: {
                predecessorId: root.id,
                intakeId: stringValue(successorRequest.intakeId ?? request.intakeId)
                  ?? existingSuccessor.intakeId
                  ?? null,
                liveSourceId: stringValue(successorRequest.liveSourceId ?? request.liveSourceId)
                  ?? existingSuccessor.liveSourceId
                  ?? null,
                updatedAt: now,
              },
            })
          : await createAffiliateSupplySource({
              database: transactionDatabase,
              identity: successorIdentity,
              targetKind: stringValue(successorRequest.targetKind ?? request.targetKind) ?? root.targetKind,
              operatorDomain,
              rolloutCohort: root.rolloutCohort,
              intakeId: stringValue(successorRequest.intakeId ?? request.intakeId) ?? root.intakeId,
              expectedIntakeSupplySourceId,
              liveSourceId: stringValue(successorRequest.liveSourceId ?? request.liveSourceId),
              predecessorId: root.id,
              metadata: recordValue(successorRequest.metadata ?? request.metadata),
              now,
            });
        if (!root.successorId) {
          await transactionDatabase.supplySources.update({
            where: { id: root.id },
            data: { successorId: successor.id, updatedAt: now },
          });
        }
        await Promise.all([
          linkSupplySource(
            transactionDatabase.intakes,
            stringValue(successorRequest.intakeId ?? request.intakeId) ?? successor.intakeId,
            successor.id,
            expectedIntakeSupplySourceId,
          ),
          linkSupplySource(
            transactionDatabase.sources,
            stringValue(successorRequest.liveSourceId ?? request.liveSourceId),
            successor.id,
          ),
        ]);
      }
    }
    if (input.command === 'REVALIDATE_IDENTITY') {
      const expectedIntakeSupplySourceId = Object.prototype.hasOwnProperty.call(
        request,
        'expectedIntakeSupplySourceId',
      )
        ? stringValue(request.expectedIntakeSupplySourceId)
        : undefined;
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
      if (
        identity.rootDecision !== 'SAME_ROOT'
        || (identity.canonicalUrl === normalizeAffiliateSupplyIdentity({
          requestedUrl: root.canonicalUrl,
          resolvedCanonicalUrl: root.canonicalUrl,
          operatorDomain: root.operatorDomain,
        }).canonicalUrl && !identity.isRevalidationRequired)
      ) {
        throw new Error('Affiliate identity revalidation requires a verified same-root change.');
      }
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
      if (source?.id) {
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
      }
    }
    if (input.command === 'RECORD_MAPPING') {
      if (!mappingId) {
        throw new Error('Affiliate mapping lifecycle command requires a mapping package.');
      }
      const mapping = transactionDatabase.mappings?.findUnique
        ? await transactionDatabase.mappings.findUnique({ where: { id: mappingId } })
        : null;
      if (!mapping) {
        throw new Error('Affiliate mapping lifecycle command requires an existing mapping package.');
      }
      const mappingJson = recordValue(mapping.mapping);
      const mappingMetadata = recordValue(mappingJson.metadata);
      const mappingEvidenceKinds = new Set(stringArray(
        mappingMetadata.evidenceKinds
        ?? mappingJson.evidenceKinds
        ?? recordValue(mappingJson.evidence).evidenceKinds,
      ).map((kind) => kind.toUpperCase()));
      if (!affiliateScrapeMappingSchema.safeParse(mappingJson).success) {
        throw new Error('Affiliate mapping lifecycle command requires a schema-valid declarative package.');
      }
      if (contract.policy.requiredMappingEvidenceKinds.some((kind) => !mappingEvidenceKinds.has(kind.toUpperCase()))) {
        throw new Error('Affiliate mapping lifecycle command is missing required mapping evidence.');
      }
      if (source?.id && mapping.sourceId && mapping.sourceId !== source.id) {
        throw new Error('Affiliate mapping lifecycle command mapping does not belong to the live source.');
      }
      if (mapping.supplySourceId && mapping.supplySourceId !== input.supplySourceId) {
        throw new Error('Affiliate mapping lifecycle command mapping does not belong to the Supply Source.');
      }
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
          where: { id: mappingId },
          data: { isActive: false, validatedAt: null },
        });
      }
    }
    if (input.command === 'APPROVE') {
      if (!source?.id) throw new Error('Affiliate lifecycle approval requires a live source.');
      const baseline = request.baseline && typeof request.baseline === 'object'
        ? request.baseline
        : undefined;
      const approvalMappingId = mappingId ?? source.activeMappingId;
      if (!approvalMappingId) {
        throw new Error('Affiliate lifecycle approval requires a mapping package.');
      }
      const approvalMapping = transactionDatabase.mappings?.findUnique
        ? await transactionDatabase.mappings.findUnique({ where: { id: approvalMappingId } })
        : null;
      const approvalMappingJson = recordValue(approvalMapping?.mapping);
      const approvalMappingMetadata = recordValue(approvalMappingJson.metadata);
      const approvalPackageHash = stringValue(approvalMappingMetadata.packageHash)
        ?? stringValue(approvalMappingJson.packageHash)
        ?? hashAffiliateAgentValue(approvalMappingJson);
      if (
        !approvalMapping
        || (approvalMapping.sourceId && approvalMapping.sourceId !== source.id)
        || (approvalMapping.supplySourceId && approvalMapping.supplySourceId !== input.supplySourceId)
        || stringValue(request.packageHash) !== approvalPackageHash
      ) {
        throw new Error('Affiliate lifecycle approval requires the exact mapping package.');
      }
      const lifecycleEvidenceKinds = stringArray(request.lifecycleEvidenceKinds);
      const decision = {
        decision: 'APPROVE',
        isIndependent: true,
        reviewerId: input.actorId,
        packageHash: stringValue(request.packageHash),
        evidenceRefs,
        lifecycleEvidenceKinds,
      };
      await transactionDatabase.approvals.upsert({
        where: {
          subjectType_subjectKey: {
            subjectType: 'MAPPING_PACKAGE',
            subjectKey: approvalMappingId,
          },
        },
        create: {
          id: createId(),
          subjectType: 'MAPPING_PACKAGE',
          subjectKey: approvalMappingId,
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
          where: { id: approvalMappingId },
          data: { isActive: false, validatedAt: now },
        });
      }
      await transactionDatabase.sources.update({
        where: { id: source.id },
        data: {
          autoScrapeEnabled: false,
          metadata: {
            ...recordValue(source.metadata),
            ...(baseline ? { [AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY]: baseline } : {}),
            automationReviewRequired: null,
          },
        },
      });
      if (source.organizationId && transactionDatabase.organizations?.update) {
        await transactionDatabase.organizations.update({
          where: { id: source.organizationId },
          data: {
            status: 'UNLISTED',
            publicPageEnabled: false,
            publicWidgetsEnabled: false,
          },
        });
      }
    }
    if (input.command === 'ACTIVATE') {
      if (!source?.id) throw new Error('Affiliate lifecycle activation requires a live source.');
      const mapping = snapshotBefore.mapping;
      const baseline = parseAffiliateAutomationBaseline(snapshotBefore.baseline);
      const packageHash = stringValue(request.packageHash);
      const baselineHash = stringValue(request.baselineHash)
        ?? stringValue(request.baselineNormalizedFieldsHash);
      if (
        !mapping
        || !mappingPackageValid(snapshotBefore)
        || !mapping.packageHash
        || packageHash !== mapping.packageHash
      ) {
        throw new Error('Affiliate lifecycle activation requires the exact validated mapping package.');
      }
      if (
        !baseline
        || baselineHash !== baseline.normalizedFieldsHash
        || baseline.mappingId !== mapping.id
        || baseline.mappingVersion !== mapping.version
      ) {
        throw new Error('Affiliate lifecycle activation requires the exact reviewed automation baseline.');
      }
      const candidateReviewId = stringValue(request.candidateReviewId);
      const candidateReview = candidateReviewId && transactionDatabase.approvals?.findUnique
        ? await transactionDatabase.approvals.findUnique({ where: { id: candidateReviewId } })
        : null;
      const reviewDecision = recordValue(candidateReview?.decision);
      const reviewPayload = { ...reviewDecision };
      delete reviewPayload.decisionHash;
      const candidateReviewDecisionHash = stringValue(reviewDecision.decisionHash);
      const candidateReviewMappingId = stringValue(reviewDecision.mappingId);
      const candidateReviewPackageHash = stringValue(reviewDecision.packageHash);
      const candidateReviewBaselineHash = stringValue(reviewDecision.baselineHash);
      if (
        !candidateReview
        || candidateReview.subjectType !== 'CANDIDATE_REVIEW'
        || !String(candidateReview.subjectKey ?? '').startsWith(`${input.supplySourceId}:`)
        || candidateReview.supplySourceId !== input.supplySourceId
        || !['APPROVED', 'COMPLETED'].includes(String(candidateReview.status).toUpperCase())
        || !candidateReview.finishedAt
        || reviewDecision.decision !== 'APPROVE'
        || candidateReviewDecisionHash !== hashAffiliateAgentValue(reviewPayload)
      ) {
        throw new Error('Affiliate lifecycle activation requires a completed independent candidate review.');
      }
      if (
        candidateReviewMappingId !== mapping.id
        || candidateReviewPackageHash !== packageHash
        || candidateReviewBaselineHash !== baseline.normalizedFieldsHash
      ) {
        throw new Error('Affiliate lifecycle activation candidate review is stale.');
      }
      const candidateReviewEvidenceRefs = stringArray(reviewDecision.candidateReviewEvidenceRefs);
      const reviewedCandidateIds = stringArray(reviewDecision.reviewedCandidateIds);
      const reviewedCandidateIdSet = new Set(reviewedCandidateIds);
      const reviewedCandidates = snapshotBefore.candidates.filter((candidate) => (
        reviewedCandidateIdSet.has(candidate.id) && candidate.status.toUpperCase() !== 'REJECTED'
      ));
      if (
        !candidateReviewEvidenceRefs.length
        || !reviewedCandidateIds.length
        || reviewedCandidates.length !== reviewedCandidateIds.length
      ) {
        throw new Error('Affiliate lifecycle activation requires reviewed candidate identities and evidence.');
      }
      const candidateById = new Map(reviewedCandidates.map((candidate) => [candidate.id, candidate]));
      const targetRows = commandTargets(reviewDecision);
      if (!targetRows.length) {
        throw new Error('Affiliate lifecycle activation requires reviewed target rows.');
      }
      const supportedTargetTypes = new Set(['EVENT', 'TEAM', 'FACILITY', 'ORGANIZATION']);
      const resolvedTargetRows: Record<string, unknown>[] = [];
      for (const target of targetRows) {
        const candidateId = stringValue(target.candidateId);
        const candidate = candidateId ? candidateById.get(candidateId) : undefined;
        const targetType = stringValue(target.targetType)?.toUpperCase();
        const requestedTargetId = stringValue(target.targetId);
        const targetStatus = stringValue(target.status)?.toUpperCase() ?? 'PUBLISHED';
        if (!candidate || !candidateId || !targetType || candidate.targetType?.toUpperCase() !== targetType) {
          throw new Error('Affiliate lifecycle activation targets must match reviewed candidate targets.');
        }
        if (!supportedTargetTypes.has(targetType)) {
          throw new Error('Affiliate lifecycle activation requires a supported target type.');
        }
        if (!['PUBLISHED', 'LAST_KNOWN_GOOD', 'REJECTED', 'EXPIRED'].includes(targetStatus)) {
          throw new Error('Affiliate lifecycle activation requires a supported target status.');
        }
        if (candidate.publishedTargetId && requestedTargetId && candidate.publishedTargetId !== requestedTargetId) {
          throw new Error('Affiliate lifecycle activation targets must match reviewed candidate targets.');
        }
        let resolvedTarget: Record<string, unknown> = {
          ...target,
          targetId: requestedTargetId ?? candidate.publishedTargetId,
          status: targetStatus,
        };
        if (!candidate.publishedTargetId) {
          if (targetStatus !== 'PUBLISHED') {
            throw new Error('Affiliate lifecycle activation requires a published reviewed target.');
          }
          if (!input.activationTargetWriter) {
            throw new Error('Affiliate lifecycle activation requires an admitted target writer for quarantined candidates.');
          }
          const createdTarget = await input.activationTargetWriter({
            database: transactionDatabase,
            client: transactionDatabase.rawClient ?? database.rawClient ?? prisma,
            contract: contract.policy,
            request,
            target,
            candidate,
            now,
          });
          if (createdTarget.candidateId !== candidateId || !createdTarget.targetId) {
            throw new Error('Affiliate lifecycle activation target writer returned an invalid target.');
          }
          if (createdTarget.targetType.toUpperCase() !== targetType) {
            throw new Error('Affiliate lifecycle activation target writer returned the wrong target type.');
          }
        resolvedTarget = {
          ...resolvedTarget,
          ...createdTarget,
          status: 'PUBLISHED',
        };
      }
      if (!stringValue(resolvedTarget.targetId)) {
        throw new Error('Affiliate lifecycle activation requires a reviewed target identity.');
      }
      resolvedTargetRows.push(resolvedTarget);
    }
    if (!resolvedTargetRows.some((target) => stringValue(target.status)?.toUpperCase() === 'PUBLISHED')) {
      throw new Error('Affiliate lifecycle activation requires one published reviewed target.');
    }
    const publishedCandidateIds = new Set(
      resolvedTargetRows
        .filter((target) => stringValue(target.status)?.toUpperCase() === 'PUBLISHED')
        .map((target) => stringValue(target.candidateId))
        .filter((candidateId): candidateId is string => Boolean(candidateId)),
    );
    for (const candidateId of publishedCandidateIds) {
      await transactionDatabase.candidates.update({
        where: { id: candidateId },
        data: { status: 'PUBLISHED' },
      });
    }
    for (const target of resolvedTargetRows) {
      await applyCommandTarget(
        transactionDatabase,
        input.supplySourceId,
        {
          ...target,
          evidenceRefs: [...candidateReviewEvidenceRefs, ...stringArray(target.evidenceRefs)],
        },
        now,
        evidenceRefs,
        contract.policy,
      );
      if ((stringValue(target.status)?.toUpperCase() ?? 'PUBLISHED') === 'PUBLISHED') {
        await publishAffiliateDomainTarget(transactionDatabase, target);
      }
    }
    await transactionDatabase.mappings.update({
      where: { id: mapping.id },
      data: { isActive: true, validatedAt: now },
    });
    await transactionDatabase.sources.update({
      where: { id: source.id },
      data: { autoScrapeEnabled: true, status: 'ACTIVE' },
    });
  }
  if (input.command === 'PUBLISH_TARGET') {
    const candidateId = stringValue(request.candidateId);
    const candidate = candidateId
      ? snapshotBefore.candidates.find((row) => row.id === candidateId)
      : null;
    if (!candidateId || !candidate || candidate.status.toUpperCase() === 'REJECTED') {
      throw new Error('Affiliate lifecycle publication requires an eligible candidate.');
    }
    if (!input.targetWriter) {
      throw new Error('Affiliate lifecycle publication requires an admitted target writer.');
    }
    const target = await input.targetWriter({
      database: transactionDatabase,
      client: transactionDatabase.rawClient ?? database.rawClient ?? prisma,
      contract: contract.policy,
      request,
      now,
    });
    if (target.candidateId !== candidateId) {
      throw new Error('Affiliate lifecycle publication target does not match the candidate.');
    }
    await applyCommandTarget(
      transactionDatabase,
      input.supplySourceId,
      {
        ...target,
        status: 'PUBLISHED',
        evidenceRefs: [
          ...(candidate.evidenceRefs ?? []),
          ...stringArray(target.evidenceRefs),
        ],
      },
      now,
      evidenceRefs,
      contract.policy,
    );
  }
    if (['RECORD_REFRESH', 'RECORD_EMPTY_REFRESH', 'RECORD_REFRESH_FAILURE'].includes(input.command)) {
      const runId = stringValue(request.runId);
      const runStatus = input.command === 'RECORD_REFRESH_FAILURE'
        ? 'FAILED'
        : 'SUCCEEDED';
      if (runId && transactionDatabase.runs?.update) {
        const run = await transactionDatabase.runs.findUnique({ where: { id: runId } });
        const itemCount = typeof request.itemCount === 'number'
          ? Math.max(0, Math.trunc(request.itemCount))
          : undefined;
        const httpStatus = typeof request.httpStatus === 'number'
          ? Math.trunc(request.httpStatus)
          : undefined;
        await transactionDatabase.runs.update({
          where: { id: runId },
          data: {
            status: runStatus,
            finishedAt: now,
            finalUrl: stringValue(request.finalUrl),
            httpStatus,
            itemCount,
            candidateCount: typeof request.candidateCount === 'number' ? Math.max(0, Math.trunc(request.candidateCount)) : undefined,
            errorMessage: input.command === 'RECORD_REFRESH_FAILURE' ? stringValue(request.errorMessage) : null,
            logs: {
              ...recordValue(run?.logs),
              ...recordValue(request.runLogs),
              isEmptyStateMatched: request.isEmptyStateMatched === true
                || input.command === 'RECORD_EMPTY_REFRESH',
              evidenceRefs,
            },
          },
        });
      }
      for (const target of commandTargets(request)) {
        await applyCommandTarget(transactionDatabase, input.supplySourceId, target, now, evidenceRefs, contract.policy);
      }
      if (source?.id) {
        const candidateCount = typeof request.candidateCount === 'number' ? Math.trunc(request.candidateCount) : null;
        const emptyRefresh = input.command === 'RECORD_EMPTY_REFRESH';
        const failedRefresh = input.command === 'RECORD_REFRESH_FAILURE';
        const automationReview = recordValue(request.automationReviewRequired);
        const hasRequestedAutomationHold = Object.keys(automationReview).length > 0;
        const shouldHoldAutomation = failedRefresh
          || (candidateCount === 0 && !emptyRefresh)
          || hasRequestedAutomationHold;
        await transactionDatabase.sources.update({
          where: { id: source.id },
          data: {
            ...(runId && !failedRefresh
              ? { lastScrapeRunId: runId, lastScrapedAt: now }
              : {}),
            autoScrapeEnabled: shouldHoldAutomation
              ? false
              : source.autoScrapeEnabled,
            metadata: prismaJsonValue({
              ...recordValue(source.metadata),
              automationReviewRequired: shouldHoldAutomation
                ? (hasRequestedAutomationHold
                  ? automationReview
                  : {
                      hold: true,
                      reason: input.command === 'RECORD_REFRESH_FAILURE'
                        ? stringValue(request.errorMessage)
                        : 'UNEXPLAINED_ZERO_RESULT',
                    })
                : null,
            }),
          },
        });
      }
    }
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
    if (input.command === 'REJECT_TARGET') {
      const target = recordValue(request.target);
      if (!Object.keys(target).length) {
        target.targetType = stringValue(request.targetType) ?? '';
        target.targetId = stringValue(request.targetId) ?? '';
      }
      const targetType = stringValue(target.targetType);
      const targetId = stringValue(target.targetId);
      const existingTarget = targetType && targetId && transactionDatabase.targets?.findFirst
        ? await transactionDatabase.targets.findFirst({
            where: {
              supplySourceId: input.supplySourceId,
              targetType,
              targetId,
            },
          })
        : null;
      if (!existingTarget) {
        throw new Error('Affiliate target rejection requires an existing target identity.');
      }
      target.targetType = target.targetType ?? existingTarget.targetType;
      target.targetId = target.targetId ?? existingTarget.targetId;
      target.sourceProfile = target.sourceProfile ?? existingTarget.sourceProfile;
      target.marketKey = target.marketKey ?? existingTarget.marketKey;
      target.sportId = target.sportId ?? existingTarget.sportId;
      target.status = 'REJECTED';
      target.rejectedAt = now.toISOString();
      await applyCommandTarget(transactionDatabase, input.supplySourceId, target, now, evidenceRefs, contract.policy);
      await rejectAffiliateDomainTarget(transactionDatabase, target);
    }

    let assessment = await deriveAndPersistAffiliateSupplyAssessment({
      supplySourceId: input.supplySourceId,
      contract: contract.policy,
      db: transactionDatabase,
      now,
      emitOperationalAlerts: false,
    });
    if (!assessment.isAutomationEnabled && source?.autoScrapeEnabled === true && source.id) {
      await transactionDatabase.sources.update({
        where: { id: source.id },
        data: { autoScrapeEnabled: false },
      });
      assessment = await deriveAndPersistAffiliateSupplyAssessment({
        supplySourceId: input.supplySourceId,
        contract: contract.policy,
        db: transactionDatabase,
        now,
        emitOperationalAlerts: false,
      });
    }
    const current = await transactionDatabase.supplySources.findUnique({ where: { id: input.supplySourceId } });
    if (!current) {
      throw new Error('Affiliate Supply Source not found after lifecycle command.');
    }
    const result: AffiliateSupplyAssessment = {
      ...assessment,
      lifecycleGeneration: current.lifecycleGeneration + 1,
    };
    const transitionResult = await recordAffiliateSupplyLifecycleTransition({
      supplySourceId: input.supplySourceId,
      command: input.command,
      idempotencyKey: input.idempotencyKey,
      request,
      result,
      expectedGeneration: input.expectedLifecycleGeneration,
      contractVersion: commandContractVersion,
      contractHash: commandContractHash,
      actorKind: input.actorKind,
      actorId: input.actorId,
      executingAgentId: input.executingAgentId,
      fromStage: assessmentBefore.stage,
      toStage: result.stage,
      outcome: result.outcome,
      reasonCodes: result.reasonCodes,
      evidenceRefs: Array.from(new Set([...result.evidenceRefs, ...evidenceRefs])),
      db: transactionDatabase,
      now,
    });
    await transactionDatabase.supplySources.update({
      where: { id: input.supplySourceId },
      data: {
        lifecycleGeneration: result.lifecycleGeneration,
        activeSupplyContractVersion: commandContractVersion,
        activeSupplyContractHash: commandContractHash,
      },
    });
    if (source?.id && transactionDatabase.sources?.update) {
      await transactionDatabase.sources.update({
        where: { id: source.id },
        data: {
          lifecycleGeneration: result.lifecycleGeneration,
          activeSupplyContractVersion: commandContractVersion,
          activeSupplyContractHash: commandContractHash,
        },
      });
    }
    return {
      assessment: result,
      transition: transitionResult.transition,
      isReplayed: transitionResult.isReplayed,
    };
  });
  if (alertContract) {
    await emitPersistedInvariantAlerts(
      result.assessment,
      alertContract,
      input.operationalAlert,
    );
  }
  return result;
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
  fallback?: unknown,
): AffiliateSupplyLifecycleCommand | null => {
  const value = String(
    decision.command
    ?? decision.lifecycleCommand
    ?? decision.commandName
    ?? fallback
    ?? '',
  ).trim().toUpperCase();
  return AFFILIATE_LIFECYCLE_COMMANDS.includes(value as AffiliateSupplyLifecycleCommand)
    ? value as AffiliateSupplyLifecycleCommand
    : null;
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

  const findRecordedDecision = async (
    identity: Readonly<{
      caseId: string;
      decisionHash: string;
      recordedHumanActorId: string;
      commandRef: string;
    }>,
  ): Promise<Readonly<{
    decision: Record<string, unknown>;
    transition?: AffiliateSupplyLifecycleTransitions;
  }> | null> => {
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
    if (approvalJob && approvalJob.supplySourceId !== identity.caseId) return null;
    const transition = database.transitions?.findFirst
      ? await database.transitions.findFirst({
          where: {
            supplySourceId: identity.caseId,
            commandRef: identity.commandRef,
          },
          orderBy: { occurredAt: 'desc' },
        })
      : null;
    const decision = recordValue(approvalJob?.decision);
    const transitionDecision = recordValue(transition?.requestJson);
    const recordedDecision = Object.keys(decision).length ? decision : transitionDecision;
    if (!Object.keys(recordedDecision).length) return null;
    const actorId = stringValue(
      recordedDecision.recordedHumanActorId
      ?? recordedDecision.reviewerId
      ?? approvalJob?.reviewerId
      ?? transition?.actorId,
    );
    if (actorId !== identity.recordedHumanActorId) return null;
    const decisionHash = stringValue(recordedDecision.decisionHash);
    const acceptedHashes = new Set([
      decisionHash,
      hashAffiliateAgentValue(recordedDecision),
      transition?.requestHash,
      transition?.resultHash,
    ].filter((value): value is string => Boolean(value)));
    if (!acceptedHashes.has(identity.decisionHash)) return null;
    return {
      decision: recordedDecision,
      ...(transition ? { transition } : {}),
    };
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
      (await findRecordedDecision(identity)) ? identity : null
    ),
    execute: async (execution) => {
      const recorded = await findRecordedDecision(execution.identity);
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
  const targetRows: AffiliateSupplyContractImpactTargetRow[] = typeof database.targets?.findMany === 'function' && sources.length > 0
    ? await database.targets.findMany({
        where: { supplySourceId: { in: sources.map((source) => source.id) } },
        select: { supplySourceId: true, marketKey: true, sportId: true, sourceProfile: true },
      })
    : [];
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
  const currentPolicy = normalizeAffiliateSupplyContractPolicy(
    active.manifest.supplyContract,
    active.manifest.rolloutCohort,
  );
  const currentAssessments = new Map<string, AffiliateSupplyAssessment>();
  const nextAssessments = new Map<string, AffiliateSupplyAssessment>();
  const hasAssessmentLoaders = Boolean(
    sources.length
    && typeof database.sources?.findMany === 'function'
    && typeof database.intakes?.findMany === 'function'
    && typeof database.mappings?.findMany === 'function'
    && typeof database.mappingJobs?.findMany === 'function'
    && typeof database.approvals?.findMany === 'function'
    && typeof database.runs?.findMany === 'function'
    && typeof database.candidates?.findMany === 'function'
    && typeof database.targets?.findMany === 'function'
    && typeof database.supplySources?.findMany === 'function',
  );
  if (hasAssessmentLoaders) {
    const now = new Date();
    const roots = sources as AffiliateSupplySources[];
    const [currentSnapshots, nextSnapshots] = await Promise.all([
      loadSnapshots(database, roots, currentPolicy, now),
      loadSnapshots(database, roots, input.nextPolicy, now),
    ]);
    for (const source of sources) {
      const currentSnapshot = currentSnapshots.get(source.id);
      const nextSnapshot = nextSnapshots.get(source.id);
      if (currentSnapshot) {
        currentAssessments.set(source.id, deriveAffiliateSupplyAssessment(currentSnapshot));
      }
      if (nextSnapshot) {
        nextAssessments.set(source.id, deriveAffiliateSupplyAssessment(nextSnapshot));
      }
    }
  }
  return buildAffiliateSupplyContractImpactReport({
    currentManifest: active.manifest,
    sources: sources.map((source) => {
      const currentAssessment = currentAssessments.get(source.id);
      const nextAssessment = nextAssessments.get(source.id);
      const currentFreshnessStatus = currentAssessment?.freshnessStatus
        ?? (['FRESH', 'STALE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(source.freshnessStatus)
          ? source.freshnessStatus as AffiliateSupplyFreshnessStatus
          : 'UNKNOWN');
      return {
        id: source.id,
        stage: currentAssessment?.stage ?? source.derivedStage,
        targetContribution: currentAssessment?.targetContribution ?? source.targetContribution,
        isAutomationEnabled: currentAssessment?.isAutomationEnabled ?? source.isAutomationEnabled,
        repairPriority: currentAssessment?.repairPriority ?? source.repairPriority,
        freshnessStatus: currentFreshnessStatus,
        ...(nextAssessment
          ? {
            nextStage: nextAssessment.stage,
            nextTargetContribution: nextAssessment.targetContribution,
            nextIsAutomationEnabled: nextAssessment.isAutomationEnabled,
            nextRepairPriority: nextAssessment.repairPriority,
          }
          : {}),
        targetCells: currentAssessment
          ? targetCellsForAssessment(currentAssessment)
          : targetCellsBySource.get(source.id) ?? [],
        ...(currentAssessment
          ? { currentFreshTargetCells: freshTargetCellsForAssessment(currentAssessment) }
          : {}),
        ...(nextAssessment
          ? { nextFreshTargetCells: freshTargetCellsForAssessment(nextAssessment) }
          : {}),
      };
    }),
    nextPolicy: input.nextPolicy,
  });
};

const targetKeyFor = (target: Readonly<{ marketKey: string; sportId: string; sourceProfile: string }>): string => `${target.marketKey}:${target.sportId}:${target.sourceProfile}`.toLowerCase();

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
  const metadata = recordValue(target.metadata);
  const naturalExpiry = toDate(
    metadata.naturalExpiryAt
    ?? metadata.endsAt
    ?? metadata.startsAt,
  );
  if (naturalExpiry && naturalExpiry.getTime() <= now.getTime()) return false;
  const rejectedAt = toDate(target.rejectedAt);
  if (rejectedAt) return false;
  const expiresAt = toDate(target.freshnessExpiresAt);
  if (expiresAt) return expiresAt.getTime() > now.getTime();
  const refreshedAt = toDate(target.lastSuccessfulRefreshAt);
  if (!refreshedAt) return false;
  const maximumAgeHours = contract.freshnessWindows.find((window) => (
    window.sourceProfile.toUpperCase() === String(target.sourceProfile ?? '').toUpperCase()
  ))?.maximumAgeHours ?? 24;
  return refreshedAt.getTime() + maximumAgeHours * 60 * 60 * 1000 > now.getTime();
};

export const reconcileAffiliateReplenishmentDemands = async (input: Readonly<{
  contract: AffiliateSupplyContractPolicy;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  dryRun?: boolean;
  assessments?: readonly AffiliateSupplyAssessment[];
}>): Promise<{ opened: number; closed: number; demands: AffiliateReplenishmentDemandResultRow[] }> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  if (!database.demands?.upsert) return { opened: 0, closed: 0, demands: [] };
  const rolloutCohort = input.rolloutCohort ?? input.contract.rolloutCohort;
  const sourceRows: AffiliateSupplyDemandSourceRow[] = database.supplySources?.findMany
    ? await database.supplySources.findMany({
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
      })
    : [];
  const sourcesById = new Map<string, AffiliateSupplyDemandSourceRow>(
    sourceRows.map((source) => [String(source.id), source]),
  );
  const targets: AffiliateSupplyDemandTargetRow[] = input.assessments
    ? []
    : await database.targets.findMany({
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
  const observed = new Map<string, number>();
  const priorityByTargetKey = new Map<string, number>();
  const recordPriority = (key: string, priority: unknown): void => {
    const sourcePriority = Number(priority);
    if (!Number.isFinite(sourcePriority)) return;
    const currentPriority = priorityByTargetKey.get(key);
    if (currentPriority === undefined || sourcePriority < currentPriority) {
      priorityByTargetKey.set(key, sourcePriority);
    }
  };
  const recordTargetPriority = (
    target: Readonly<{
      marketKey?: string | null;
      sportId?: string | null;
      sourceProfile?: string | null;
    }>,
    priority: unknown,
  ): void => {
    const matchingTarget = targetRuleFor(input.contract, {
      marketKey: target.marketKey ?? null,
      sportId: target.sportId ?? null,
      sourceProfile: target.sourceProfile ?? '',
    });
    if (!matchingTarget) return;
    recordPriority(targetKeyFor({
      marketKey: matchingTarget.marketKey ?? 'DEFAULT',
      sportId: matchingTarget.sportId ?? 'ALL',
      sourceProfile: matchingTarget.sourceProfile,
    }), priority);
  };
  const observeTarget = (
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
    if (!source || !isFreshTargetForDemand(target, input.contract, now)) return;
    const matchingTarget = targetRuleFor(input.contract, {
      marketKey: target.marketKey ?? null,
      sportId: target.sportId ?? null,
      sourceProfile: target.sourceProfile ?? '',
    });
    if (!matchingTarget) return;
    const key = targetKeyFor({
      marketKey: matchingTarget.marketKey ?? 'DEFAULT',
      sportId: matchingTarget.sportId ?? 'ALL',
      sourceProfile: matchingTarget.sourceProfile,
    });
    observed.set(key, (observed.get(key) ?? 0) + 1);
    recordPriority(key, priority);
  };
  if (input.assessments) {
    for (const assessment of input.assessments) {
      const sourceId = String(assessment.supplySourceId);
      const source = sourcesById.get(sourceId);
      if (!source || source.isExcluded === true || assessment.outcome === 'SOURCE_EXCLUDED') continue;
      if (assessment.targets.length) {
        assessment.targets.forEach((target) => {
          recordTargetPriority(target, assessment.repairPriority);
          if (assessment.stage === 'PUBLISHED') observeTarget(sourceId, target, assessment.repairPriority);
        });
      } else {
        const metadata = recordValue(source.metadata);
        recordTargetPriority({
          sourceProfile: stringValue(source.targetKind ?? metadata.sourceProfile),
          marketKey: stringValue(metadata.marketKey),
          sportId: stringValue(metadata.sportId),
        }, assessment.repairPriority);
      }
    }
  } else {
    for (const source of sourceRows) {
      if (source.isExcluded === true || source.derivedOutcome === 'SOURCE_EXCLUDED') continue;
      const metadata = recordValue(source.metadata);
      const sourceProfile = stringValue(source.targetKind ?? metadata.sourceProfile);
      const targetRule = sourceProfile
        ? targetRuleFor(input.contract, {
            sourceProfile,
            marketKey: stringValue(metadata.marketKey),
            sportId: stringValue(metadata.sportId),
          })
        : null;
      if (targetRule) {
        recordPriority(targetKeyFor({
          marketKey: targetRule.marketKey ?? 'DEFAULT',
          sportId: targetRule.sportId ?? 'ALL',
          sourceProfile: targetRule.sourceProfile,
        }), source.repairPriority);
      }
    }
    targets.forEach((target) => {
      const sourceId = target.supplySourceId ? String(target.supplySourceId) : null;
      const source = sourceId ? sourcesById.get(sourceId) : undefined;
      if (
        !sourceId
        || !source
        || source.isExcluded === true
        || source.derivedOutcome === 'SOURCE_EXCLUDED'
        || String(source.derivedStage ?? '').toUpperCase() !== 'PUBLISHED'
      ) return;
      observeTarget(sourceId, target, source.repairPriority);
    });
  }
  const targetKeys = input.contract.targets.map((target) => targetKeyFor({
    marketKey: target.marketKey ?? 'DEFAULT',
    sportId: target.sportId ?? 'ALL',
    sourceProfile: target.sourceProfile.toUpperCase(),
  }));
  const canBatchLoadExistingDemands = typeof database.demands?.findMany === 'function';
  const existingDemands = canBatchLoadExistingDemands && targetKeys.length
    ? await database.demands.findMany({
        where: {
          rolloutCohort,
          contractVersion: input.contract.version,
          contractHash: input.contract.hash,
          targetKey: { in: targetKeys },
        },
      })
    : [];
  const existingDemandsByTargetKey = new Map(
    existingDemands.map((demand) => [demand.targetKey, demand]),
  );
  const resultRow = (row: unknown): AffiliateReplenishmentDemandResultRow => {
    const value = recordValue(row);
    const statusValue = String(value.status ?? 'OPEN').toUpperCase();
    const status: AffiliateReplenishmentDemandResultRow['status'] = statusValue === 'CLOSED' || statusValue === 'PAUSED'
      ? statusValue
      : 'OPEN';
    return {
      id: String(value.id ?? ''),
      targetKey: String(value.targetKey ?? ''),
      marketKey: String(value.marketKey ?? ''),
      sportId: String(value.sportId ?? ''),
      sourceProfile: String(value.sourceProfile ?? ''),
      rolloutCohort: String(value.rolloutCohort ?? rolloutCohort),
      contractVersion: Number(value.contractVersion ?? input.contract.version),
      contractHash: String(value.contractHash ?? input.contract.hash),
      minimumFreshPublishedSupply: Number(value.minimumFreshPublishedSupply ?? 0),
      observedFreshPublishedSupply: Number(value.observedFreshPublishedSupply ?? 0),
      priority: Number(value.priority ?? AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY),
      status,
      openedAt: toDate(value.openedAt) ?? now,
      closedAt: toDate(value.closedAt),
      nextEligibleAt: toDate(value.nextEligibleAt),
      searchSaturatedUntil: toDate(value.searchSaturatedUntil),
      activeWaveId: stringValue(value.activeWaveId),
      generation: Number(value.generation ?? 0),
      reasonCodes: stringArray(value.reasonCodes),
      evidenceJson: value.evidenceJson ?? null,
    };
  };
  const rows: AffiliateReplenishmentDemandResultRow[] = [];
  let opened = 0;
  let closed = 0;
  for (const target of input.contract.targets) {
    const marketKey = target.marketKey ?? 'DEFAULT';
    const sportId = target.sportId ?? 'ALL';
    const sourceProfile = target.sourceProfile.toUpperCase();
    const targetKey = targetKeyFor({ marketKey, sportId, sourceProfile });
    const count = observed.get(targetKey) ?? 0;
    const demandPriority = priorityByTargetKey.get(targetKey)
      ?? AFFILIATE_REPLENISHMENT_PRIORITY.NEW_DISCOVERY;
    const satisfied = count >= target.minimumFreshPublishedSupply;
    const existing = existingDemandsByTargetKey.get(targetKey)
      ?? (!canBatchLoadExistingDemands && database.demands.findUnique
        ? await database.demands.findUnique({
            where: {
              rolloutCohort_targetKey_contractVersion_contractHash: {
                rolloutCohort,
                targetKey,
                contractVersion: input.contract.version,
                contractHash: input.contract.hash,
              },
            },
          })
        : null);
    const pauseResumeAt = toDate(existing?.nextEligibleAt) ?? toDate(existing?.searchSaturatedUntil);
    const pausedUntilResume = existing?.status === 'PAUSED'
      && (!pauseResumeAt || pauseResumeAt.getTime() > now.getTime());
    const status: 'OPEN' | 'CLOSED' | 'PAUSED' = satisfied
      ? 'CLOSED'
      : pausedUntilResume ? 'PAUSED' : 'OPEN';
    if (existing?.status !== status) {
      if (status === 'OPEN') opened += 1;
      else closed += 1;
    }
    const stateUnchanged = Boolean(
      existing
      && existing.status === status
      && Number(existing.minimumFreshPublishedSupply) === target.minimumFreshPublishedSupply
      && Number(existing.observedFreshPublishedSupply) === count
      && Number(existing.priority) === demandPriority
    );
    const nextOpenedAt = existing?.status === status ? existing.openedAt : now;
    const nextClosedAt = status === 'CLOSED'
      ? stateUnchanged ? existing?.closedAt ?? now : now
      : null;
    const nextReasonCodes = satisfied
      ? ['TARGET_MET']
      : status === 'PAUSED'
        ? stringArray(existing?.reasonCodes)
        : ['TARGET_SHORTFALL'];
    const nextEvidenceJson = stateUnchanged
      ? existing?.evidenceJson ?? { observedAt: now.toISOString(), observedFreshPublishedSupply: count }
      : { observedAt: now.toISOString(), observedFreshPublishedSupply: count };
    const nextGeneration = stateUnchanged
      ? existing?.generation ?? 0
      : (existing?.generation ?? 0) + 1;
    const createData = {
      id: input.dryRun
        ? `dry-run-demand-${hashAffiliateAgentValue({ rolloutCohort, targetKey, contractVersion: input.contract.version, contractHash: input.contract.hash })}`
        : createId(),
      targetKey,
      marketKey,
      sportId,
      sourceProfile,
      rolloutCohort,
      contractVersion: input.contract.version,
      contractHash: input.contract.hash,
      minimumFreshPublishedSupply: target.minimumFreshPublishedSupply,
      observedFreshPublishedSupply: count,
      priority: demandPriority,
      status,
      openedAt: nextOpenedAt,
      closedAt: nextClosedAt,
      activeWaveId: status === 'CLOSED' ? null : existing?.activeWaveId ?? null,
      reasonCodes: nextReasonCodes,
      evidenceJson: prismaNullableJsonValue(nextEvidenceJson),
      generation: nextGeneration,
    };
    const updateData = {
      targetKey,
      marketKey,
      sportId,
      sourceProfile,
      rolloutCohort,
      contractVersion: input.contract.version,
      contractHash: input.contract.hash,
      minimumFreshPublishedSupply: target.minimumFreshPublishedSupply,
      observedFreshPublishedSupply: count,
      priority: demandPriority,
      status,
      openedAt: nextOpenedAt,
      closedAt: nextClosedAt,
      activeWaveId: status === 'CLOSED' ? null : existing?.activeWaveId ?? null,
      reasonCodes: nextReasonCodes,
      evidenceJson: prismaNullableJsonValue(nextEvidenceJson),
      generation: nextGeneration,
    };
    const where = {
      rolloutCohort_targetKey_contractVersion_contractHash: {
        rolloutCohort,
        targetKey,
        contractVersion: input.contract.version,
        contractHash: input.contract.hash,
      },
    };
    if (!input.dryRun && stateUnchanged && existing) {
      rows.push(existing as AffiliateReplenishmentDemandResultRow);
      continue;
    }
    const row = input.dryRun
      ? { ...(existing ?? {}), ...createData, ...updateData, id: existing?.id ?? createData.id }
      : stateUnchanged
        ? existing
        : await database.demands.upsert({ where, create: createData, update: updateData });
    rows.push(resultRow(row));
  }
  return { opened, closed, demands: rows };
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
  const [waitingMapping, activeMapping, waitingReview, activeReviewerClaims, activeProducerClaims, demands, activeWaves, campaigns, healthyWorkers] = await Promise.all([
    database.mappingJobs.count({ where: { status: 'QUEUED' } }),
    database.mappingJobs.count({ where: { status: 'CLAIMED' } }),
    database.approvals.count({ where: { status: { in: ['QUEUED', 'DEFERRED', 'REVIEW_REQUIRED'] } } }),
    database.gatewayClaims.count({ where: { role: 'SUPPLY_REVIEWER', status: 'ACTIVE', leaseExpiresAt: { gt: now } } }),
    database.gatewayClaims.count({ where: { role: 'MAPPING_PRODUCER', status: 'ACTIVE', leaseExpiresAt: { gt: now } } }),
    input.demands ?? database.demands.findMany({
      where: {
        status: 'OPEN',
        ...(demandRolloutCohort ? { rolloutCohort: demandRolloutCohort } : {}),
        ...(contract ? { contractVersion: contract.version, contractHash: contract.hash } : {}),
      },
    }),
    database.waves.findMany({
      where: {
        status: { in: ['PLANNED', 'ACTIVE', 'WAITING'] },
        ...(demandRolloutCohort ? { rolloutCohort: demandRolloutCohort } : {}),
      },
    }),
    database.campaigns.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, nextRunAt: true, metadata: true },
    }),
    database.workerHealth?.findMany
      ? database.workerHealth.findMany({
        where: {
          role: { in: ['MAPPING_PRODUCER', 'SUPPLY_REVIEWER'] },
          heartbeatAt: { lte: now },
          leaseExpiresAt: { gt: now },
        },
        select: { role: true, status: true },
      })
      : Promise.resolve(null),
  ]);
  const workerHealthAvailable = typeof database.workerHealth?.findMany === 'function';
  const workerRows = Array.isArray(healthyWorkers) ? healthyWorkers : [];
  const healthyProducerCount = workerHealthAvailable
    ? workerRows.filter((worker) => (
      worker.role === 'MAPPING_PRODUCER' && worker.status === 'HEALTHY'
    )).length
    : activeProducerClaims;
  const healthyReviewerCount = workerHealthAvailable
    ? workerRows.filter((worker) => (
      worker.role === 'SUPPLY_REVIEWER' && worker.status === 'HEALTHY'
    )).length
    : activeReviewerClaims;
  return planAffiliateReplenishment({
    now,
    isContractSafe: input.isContractSafe === true,
    mapping: { waiting: waitingMapping, active: activeMapping, activeProducerCount: healthyProducerCount },
    review: {
      waiting: waitingReview,
      active: activeReviewerClaims,
      activeReviewerCount: healthyReviewerCount,
      healthyReviewerCount,
    },
    demands: demands.map((demand) => ({
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
    activeWaves: activeWaves.map((wave) => ({
      id: wave.id,
      status: wave.status,
      demandId: wave.demandId,
    })),
    campaigns: (campaigns ?? []).map((campaign) => ({
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

export const startAffiliateReplenishmentWave = async (input: Readonly<{
  plan: AffiliateReplenishmentPlan;
  rolloutCohort: string;
  contract: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>): Promise<AffiliateReplenishmentWaves | null> => {
  const selectedDemandId = input.plan.selectedDemandId;
  if (input.plan.action === 'NONE' || !selectedDemandId) return null;
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const rolloutCohort = input.rolloutCohort ?? input.contract.rolloutCohort;
  if (!database.waves?.create) return null;
  const liveWaveWhere = {
    rolloutCohort,
    status: { in: ['PLANNED', 'ACTIVE', 'WAITING'] },
  } as Prisma.AffiliateReplenishmentWavesWhereInput;
  try {
    return await withSupplyTransaction(database, async (transactionDatabase) => {
      const demand = await transactionDatabase.demands.findUnique({ where: { id: selectedDemandId } });
      if (
        !demand
        || demand.status !== 'OPEN'
        || demand.rolloutCohort !== rolloutCohort
        || demand.contractVersion !== input.contract.version
        || demand.contractHash !== input.contract.hash
      ) return null;
      const existingWave = await transactionDatabase.waves.findFirst({
        where: liveWaveWhere,
        orderBy: { createdAt: 'asc' },
      });
      if (existingWave) return existingWave;
      let coveragePlanningJobId: string | null = null;
      if (input.plan.action === 'REQUEST_COVERAGE_PLANNING_JOB' && transactionDatabase.coverageJobs?.upsert) {
        const job = await transactionDatabase.coverageJobs.upsert({
          where: { subjectType_subjectKey: { subjectType: 'SUPPLY_REPLENISHMENT', subjectKey: demand.id } },
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
              contractVersion: input.contract.version,
              contractHash: input.contract.hash,
            }),
            cohortPriority: 0,
            priorityScore: Number(demand.priority),
            isBlockingCoverage: true,
          },
          update: { status: 'QUEUED', errorMessage: null, finishedAt: null },
        });
        coveragePlanningJobId = job.id;
      }
      const wave = await transactionDatabase.waves.create({
        data: {
          id: createId(),
          demandId: demand.id,
          rolloutCohort,
          status: 'ACTIVE',
          campaignId: input.plan.selectedCampaignId ?? undefined,
          coveragePlanningJobId,
          startedAt: now,
          demandGeneration: Number(demand.generation ?? 0) + 1,
          evidenceRefs: [`demand:${demand.id}`],
        },
      });
      await transactionDatabase.demands.update({
        where: { id: demand.id },
        data: { activeWaveId: wave.id, generation: demand.generation + 1 },
      });
      return wave;
    });
  } catch (error) {
    if (!isReplenishmentWaveCohortUniqueConflict(error)) throw error;
    const concurrentWave = await withSupplyTransaction(database, async (transactionDatabase) => (
      transactionDatabase.waves.findFirst({
        where: liveWaveWhere,
        orderBy: { createdAt: 'asc' },
      })
    ));
    if (concurrentWave) return concurrentWave;
    throw error;
  }
};
export type AffiliateLegacySupplyTargetProjection = Readonly<{
  candidateId: string;
  targetType: string;
  targetId: string;
  status: 'PUBLISHED' | 'LAST_KNOWN_GOOD';
  action: 'PRESERVE_PUBLIC_TARGET' | 'MARK_LAST_KNOWN_GOOD';
  evidenceRefs: readonly string[];
}>;

export type AffiliateLegacySupplyReconciliationRow = Readonly<{
  sourceId: string;
  identityKey: string;
  action: 'CREATE_ROOT' | 'REUSE_ROOT';
  publishedCandidateCount: number;
  preservedTargetCount: number;
  unverifiableTargetCount: number;
  targetProjections: readonly AffiliateLegacySupplyTargetProjection[];
  evidenceRefs: readonly string[];
}>;

export type AffiliateLegacySupplyReconciliationResult = Readonly<{
  dryRun: boolean;
  rows: readonly AffiliateLegacySupplyReconciliationRow[];
  preservedTargetCount: number;
  unverifiableTargetCount: number;
}>;

export const reconcileLegacyAffiliateSupply = async (input: Readonly<{
  db?: AffiliateSupplyDatabase;
  dryRun?: boolean;
}> = {}): Promise<AffiliateLegacySupplyReconciliationResult> => {
  if (input.dryRun === false) {
    throw new Error('Legacy Affiliate Supply reconciliation writes require the authorized cutover workflow.');
  }
  const database = input.db ?? affiliateSupplyDatabase();
  const sources = database.sources?.findMany
    ? await database.sources.findMany({
        where: { supplySourceId: null },
        select: { id: true, listUrl: true, targetKind: true },
        orderBy: { id: 'asc' },
      })
    : [];
  const sourceIds = sources.map((source) => source.id);
  const candidates = typeof database.candidates?.findMany === 'function' && sourceIds.length
    ? await database.candidates.findMany({
        where: {
          sourceId: { in: sourceIds },
          OR: [
            { status: 'PUBLISHED' },
            { publishedEventId: { not: null } },
            { publishedTeamId: { not: null } },
            { publishedFacilityId: { not: null } },
            { publishedOrganizationId: { not: null } },
          ],
        },
        select: {
          id: true,
          sourceId: true,
          listingKind: true,
          status: true,
          publishedEventId: true,
          publishedTeamId: true,
          publishedFacilityId: true,
          publishedOrganizationId: true,
        },
      })
    : [];
  const candidateIds = candidates.map((candidate) => candidate.id);
  const targets = typeof database.targets?.findMany === 'function' && candidateIds.length
    ? await database.targets.findMany({
        where: { candidateId: { in: candidateIds } },
        select: {
          id: true,
          candidateId: true,
          targetType: true,
          targetId: true,
          status: true,
          evidenceRefs: true,
        },
      })
    : [];
  const targetsByCandidateId = new Map<string, AffiliateSupplyLegacyTargetRow[]>();
  for (const target of targets) {
    const candidateTargets = targetsByCandidateId.get(String(target.candidateId)) ?? [];
    candidateTargets.push(target);
    targetsByCandidateId.set(String(target.candidateId), candidateTargets);
  }
  const candidatesBySourceId = new Map<string, AffiliateSupplyLegacyCandidateRow[]>();
  for (const candidate of candidates) {
    const sourceCandidates = candidatesBySourceId.get(String(candidate.sourceId)) ?? [];
    sourceCandidates.push(candidate);
    candidatesBySourceId.set(String(candidate.sourceId), sourceCandidates);
  }
  const publicTargetsForCandidate = (
    candidate: AffiliateSupplyLegacyCandidateRow,
    candidateTargets: readonly AffiliateSupplyLegacyTargetRow[],
  ): Array<{
    targetType: string;
    targetId: string;
  }> => {
    const listingKind = String(candidate.listingKind ?? '').toUpperCase();
    const targetType = listingKind === 'RENTAL'
      ? 'FACILITY'
      : listingKind === 'CLUB'
        ? 'ORGANIZATION'
        : listingKind;
    const identities = new Map<string, { targetType: string; targetId: string }>();
    const addTarget = (rawTargetType: unknown, rawTargetId: unknown): void => {
      const rawType = String(rawTargetType ?? '').toUpperCase();
      const normalizedType = rawType === 'RENTAL'
        ? 'FACILITY'
        : rawType === 'CLUB'
          ? 'ORGANIZATION'
          : rawType;
      const targetId = typeof rawTargetId === 'string' ? rawTargetId.trim() : '';
      if (!normalizedType || !targetId) return;
      identities.set(`${normalizedType}:${targetId}`, { targetType: normalizedType, targetId });
    };
    addTarget(
      targetType,
      targetType === 'EVENT'
        ? candidate.publishedEventId
        : targetType === 'TEAM'
          ? candidate.publishedTeamId
          : targetType === 'FACILITY'
            ? candidate.publishedFacilityId
            : targetType === 'ORGANIZATION'
              ? candidate.publishedOrganizationId
              : null,
    );
    for (const target of candidateTargets) {
      if (!['PUBLISHED', 'LAST_KNOWN_GOOD'].includes(String(target.status ?? '').toUpperCase())) continue;
      addTarget(target.targetType, target.targetId);
    }
    return Array.from(identities.values());
  };
  const rows: AffiliateLegacySupplyReconciliationRow[] = [];
  for (const source of sources) {
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: String(source.listUrl),
      resolvedCanonicalUrl: String(source.listUrl),
      isRedirectVerified: false,
    });
    const existingRoot = database.supplySources?.findFirst
      ? await database.supplySources.findFirst({
          where: { pathKey: identity.pathKey },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    const sourceCandidates = candidatesBySourceId.get(String(source.id)) ?? [];
    const targetProjections: AffiliateLegacySupplyTargetProjection[] = [];
    let unverifiableTargetCount = 0;
    for (const candidate of sourceCandidates) {
      const candidateTargets = targetsByCandidateId.get(String(candidate.id)) ?? [];
      for (const publicTarget of publicTargetsForCandidate(candidate, candidateTargets)) {
        const existingTarget = candidateTargets.find((target) => (
          String(target.targetType).toUpperCase() === publicTarget.targetType
          && String(target.targetId) === publicTarget.targetId
        ));
        const existingStatus = String(existingTarget?.status ?? '').toUpperCase();
        const isVerifiable = ['PUBLISHED', 'LAST_KNOWN_GOOD'].includes(existingStatus);
        if (!isVerifiable) unverifiableTargetCount += 1;
        targetProjections.push({
          candidateId: String(candidate.id),
          targetType: publicTarget.targetType,
          targetId: publicTarget.targetId,
          status: isVerifiable ? existingStatus as 'PUBLISHED' | 'LAST_KNOWN_GOOD' : 'LAST_KNOWN_GOOD',
          action: isVerifiable ? 'PRESERVE_PUBLIC_TARGET' : 'MARK_LAST_KNOWN_GOOD',
          evidenceRefs: Array.from(new Set([
            `source:${source.id}`,
            `candidate:${candidate.id}`,
            `target:${publicTarget.targetType}:${publicTarget.targetId}`,
            ...stringArray(existingTarget?.evidenceRefs),
          ])),
        });
      }
    }
    rows.push({
      sourceId: String(source.id),
      identityKey: existingRoot?.identityKey ?? identity.identityKey,
      action: existingRoot ? 'REUSE_ROOT' : 'CREATE_ROOT',
      publishedCandidateCount: sourceCandidates.length,
      preservedTargetCount: targetProjections.length,
      unverifiableTargetCount,
      targetProjections,
      evidenceRefs: [
        `source:${source.id}`,
        ...sourceCandidates.map((candidate) => `candidate:${candidate.id}`),
        ...targetProjections.flatMap((target) => target.evidenceRefs),
      ],
    });
  }
  return {
    dryRun: true,
    rows,
    preservedTargetCount: rows.reduce((sum, row) => sum + row.preservedTargetCount, 0),
    unverifiableTargetCount: rows.reduce((sum, row) => sum + row.unverifiableTargetCount, 0),
  };
};

const persistAffiliateSupplyReconciliationBatch = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  roots: readonly AffiliateSupplySources[];
  snapshots: ReadonlyMap<string, AffiliateSupplyEvidenceSnapshot>;
  assessments: readonly AffiliateSupplyAssessment[];
  contract: AffiliateSupplyContractPolicy;
  now: Date;
}>): Promise<AffiliateSupplyAssessment[]> => {
  const { database, roots, snapshots, assessments, contract, now } = input;
  const rootIds = roots.map((root) => root.id);
  const transitionDelegate = database.transitions as unknown as {
    findMany?: unknown;
    create?: unknown;
  } | undefined;
  const sourceDelegate = database.supplySources as unknown as { update?: unknown } | undefined;
  const canPersistTransitions = (
    typeof transitionDelegate?.findMany === 'function'
    && typeof transitionDelegate.create === 'function'
    && typeof sourceDelegate?.update === 'function'
  );
  const transitionRows: AffiliateSupplyLifecycleTransitions[] = canPersistTransitions
    ? await database.transitions.findMany({
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
  const persistProjection = async (
    root: AffiliateSupplySources,
    snapshot: AffiliateSupplyEvidenceSnapshot,
    assessment: AffiliateSupplyAssessment,
    lifecycleGeneration: number,
  ): Promise<void> => {
    await database.supplySources.update({
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
        lastAssessmentAt: now,
        assessmentJson: prismaJsonValue(assessment),
        invariantViolations: [...assessment.invariantViolations],
        activeSupplyContractVersion: contract.version,
        activeSupplyContractHash: contract.hash,
      },
    });
    if (root.liveSourceId && database.sources?.update) {
      await database.sources.update({
        where: { id: root.liveSourceId },
        data: {
          lifecycleGeneration,
          activeSupplyContractVersion: contract.version,
          activeSupplyContractHash: contract.hash,
          ...(assessment.isAutomationEnabled ? {} : { autoScrapeEnabled: false }),
        },
      });
    }
  };
  return Promise.all(roots.map(async (root, index) => {
    const snapshot = snapshots.get(root.id);
    if (!snapshot) throw new Error(`Affiliate Supply Source snapshot is missing: ${root.id}.`);
    const assessment = assessments[index];
    const persistedInvariantViolations = Array.from(new Set(root.invariantViolations)).sort();
    const projectionMatches = (
      root.derivedStage === assessment.stage
      && root.derivedOutcome === assessment.outcome
      && root.freshnessStatus === assessment.freshnessStatus
      && root.targetContribution === assessment.targetContribution
      && root.repairPriority === assessment.repairPriority
      && root.isAutomationEnabled === assessment.isAutomationEnabled
      && root.automationHoldReason === assessment.automationHoldReason
      && root.isExcluded === (assessment.stage === 'SOURCE_EXCLUDED')
      && root.activeSupplyContractVersion === contract.version
      && root.activeSupplyContractHash === contract.hash
      && JSON.stringify(persistedInvariantViolations)
        === JSON.stringify([...assessment.invariantViolations].sort())
    );
    if (projectionMatches) return assessment;
    const idempotencyKey = `reconcile:${root.id}:${root.lifecycleGeneration}:${contract.version}:${contract.hash}`;
    const request = {
      evidenceRefs: [
        `supply-source:${root.id}`,
        ...assessment.evidenceRefs,
      ],
      assessedAt: assessment.assessedAt,
    };
    const requestHash = affiliateLifecycleRequestHash({
      supplySourceId: root.id,
      command: 'RECONCILE',
      contractVersion: contract.version,
      contractHash: contract.hash,
      request,
    });
    const existingTransition = transitionsByIdempotencyKey.get(idempotencyKey);
    if (existingTransition) {
      const storedRequestHash = affiliateLifecycleRequestHash({
        supplySourceId: existingTransition.supplySourceId,
        command: existingTransition.command,
        contractVersion: existingTransition.contractVersion,
        contractHash: existingTransition.contractHash,
        request: recordValue(existingTransition.requestJson),
      });
      if (storedRequestHash !== requestHash) {
        throw new Error('Affiliate lifecycle reconciliation idempotency key was reused with a different request.');
      }
      return existingTransition.resultJson as unknown as AffiliateSupplyAssessment;
    }
    const result: AffiliateSupplyAssessment = {
      ...assessment,
      lifecycleGeneration: root.lifecycleGeneration + 1,
    };
    if (!canPersistTransitions) {
      await persistProjection(root, snapshot, assessment, root.lifecycleGeneration);
      return assessment;
    }
    const resultHash = hashAffiliateAgentValue(result);
    const sequence = (latestSequenceBySource.get(root.id) ?? root.lifecycleGeneration) + 1;
    const transition = await database.transitions.create({
      data: {
        id: createId(),
        supplySourceId: root.id,
        sequence,
        generation: result.lifecycleGeneration,
        command: 'RECONCILE',
        contractVersion: contract.version,
        resultHash,
        outcome: result.outcome,
        fromStage: root.derivedStage,
        toStage: result.stage,
        commandRef: null,
        idempotencyKey,
        requestHash,
        contractHash: contract.hash,
        actorKind: 'SYSTEM',
        actorId: 'affiliate-supply-reconciliation',
        executingAgentId: null,
        reasonCodes: Array.from(new Set(result.reasonCodes)),
        evidenceRefs: Array.from(new Set([
          ...result.evidenceRefs,
          ...request.evidenceRefs,
        ])),
        requestJson: prismaJsonValue(request),
        resultJson: prismaJsonValue(result),
        occurredAt: now,
      },
    });
    await persistProjection(root, snapshot, result, result.lifecycleGeneration);
    latestSequenceBySource.set(root.id, transition.sequence);
    return result;
  }));
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
  dryRun: boolean;
}>;

export const reconcileAffiliateReplenishment = async (input: Readonly<{
  contract?: AffiliateSupplyContractPolicy;
  rolloutCohort?: string;
  isContractSafe?: boolean;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  dryRun?: boolean;
  runWave?: (input: Readonly<{
    wave: AffiliateReplenishmentWaves;
    demand: AffiliateReplenishmentDemands;
    contract: AffiliateSupplyContractPolicy;
  }>) => Promise<AffiliateReplenishmentWaveExecutionResult>;
}> = {}): Promise<AffiliateReplenishmentReconciliationResult> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const contract = input.contract
    ?? (await loadActiveAffiliateSupplyContract({ db: database, rolloutCohort: input.rolloutCohort })).policy;
  const rolloutCohort = input.rolloutCohort ?? contract.rolloutCohort;
  const reconciliation = await withSupplyTransaction(database, async (transactionDatabase) => {
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
    const assessments = input.dryRun
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
      dryRun: input.dryRun === true,
      assessments,
    });
    return { assessments, demandResult };
  });
  const { assessments, demandResult } = reconciliation;
  const plan = await planAffiliateReplenishmentFromDatabase({
    contract,
    isContractSafe: input.isContractSafe === true,
    rolloutCohort,
    db: database,
    now,
    demands: demandResult.demands,
  });
  const baseResult = (
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
    dryRun: input.dryRun === true,
  });
  const executeWave = async (
    wave: AffiliateReplenishmentWaves,
  ): Promise<AffiliateReplenishmentWaveExecutionResult | null> => {
    if (!input.runWave) return null;
    const demand = await database.demands.findUnique({ where: { id: wave.demandId } });
    if (!demand) throw new Error('Affiliate replenishment wave demand not found.');
    const demandOpen = String(demand.status ?? '').toUpperCase() === 'OPEN';
    const generationMatches = Number.isFinite(Number(wave.demandGeneration))
      && Number(demand.generation ?? 0) === Number(wave.demandGeneration);
    const activeWaveMatches = demand.activeWaveId === wave.id;
    if (!demandOpen || !generationMatches || !activeWaveMatches) {
      const reason = !demandOpen
        ? 'DEMAND_NOT_OPEN'
        : !generationMatches
          ? 'STALE_DEMAND_GENERATION'
          : 'WAVE_NOT_ATTACHED';
      const evidenceRefs = Array.from(new Set([
        ...(Array.isArray(wave.evidenceRefs) ? wave.evidenceRefs : []),
        `demand:${demand.id}`,
        `wave:${wave.id}`,
        `demand-status:${String(demand.status ?? '')}`,
        `demand-generation:${String(demand.generation ?? '')}`,
        `wave-demand-generation:${String(wave.demandGeneration ?? '')}`,
      ]));
      const staleWaveResult: AffiliateReplenishmentWaveExecutionResult = {
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
      await withSupplyTransaction(database, async (transactionDatabase) => {
        await transactionDatabase.waves.update({
          where: { id: wave.id },
          data: {
            status: 'PAUSED',
            terminalAt: now,
            retryAt: null,
            marginalYield: null,
            errorCode: staleWaveResult.errorCode,
            resultJson: prismaNullableJsonValue(staleWaveResult.result),
            evidenceRefs,
          },
        });
        if (activeWaveMatches) {
          await transactionDatabase.demands.update({
            where: { id: demand.id },
            data: {
              activeWaveId: null,
              generation: Number(demand.generation ?? 0) + 1,
            },
          });
        }
      });
      return staleWaveResult;
    }
    const demandContractMatches = demand.rolloutCohort === contract.rolloutCohort
      && Number(demand.contractVersion) === contract.version
      && demand.contractHash === contract.hash;
    if (!demandContractMatches) {
      const evidenceRefs = Array.from(new Set([
        ...(Array.isArray(wave.evidenceRefs) ? wave.evidenceRefs : []),
        `demand:${demand.id}`,
        `contract:${String(demand.contractVersion)}:${String(demand.contractHash)}`,
        `active-contract:${contract.version}:${contract.hash}`,
      ]));
      const rolloverResult: AffiliateReplenishmentWaveExecutionResult = {
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
        evidenceRefs,
      };
      await withSupplyTransaction(database, async (transactionDatabase) => {
        await transactionDatabase.waves.update({
          where: { id: wave.id },
          data: {
            status: 'PAUSED',
            terminalAt: now,
            retryAt: null,
            marginalYield: null,
            errorCode: rolloverResult.errorCode,
            resultJson: prismaNullableJsonValue(rolloverResult.result),
            evidenceRefs,
          },
        });
        await transactionDatabase.demands.update({
          where: { id: demand.id },
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
      });
      return rolloverResult;
    }
    let providerResult: AffiliateReplenishmentWaveExecutionResult;
    try {
      providerResult = await input.runWave({ wave, demand, contract });
    } catch (error) {
      providerResult = {
        status: 'FAILED',
        provider: null,
        providerOperationKey: null,
        retryAt: new Date(now.getTime() + 15 * 60 * 1000),
        marginalYield: null,
        errorCode: 'PROVIDER_FAILURE',
        result: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    if (providerResult.status === 'FAILED') {
      providerResult = {
        ...providerResult,
        marginalYield: null,
        ...(providerResult.retryAt ? {} : { retryAt: new Date(now.getTime() + 15 * 60 * 1000) }),
      };
    }
    const saturationFromResult = toDate(
      providerResult.searchSaturatedUntil
      ?? recordValue(providerResult.result).searchSaturatedUntil,
    );
    const campaign = wave.campaignId && database.campaigns?.findUnique
      ? await database.campaigns.findUnique({
        where: { id: wave.campaignId },
        select: { searchIntervalMinutes: true, metadata: true },
      })
      : null;
    const campaignMetadata = recordValue(campaign?.metadata);
    const campaignIntervalMinutes = Number(
      campaign?.searchIntervalMinutes
      ?? campaignMetadata.searchIntervalMinutes
      ?? 24 * 60,
    );
    const saturationCycles = Math.max(1, Math.trunc(contract.searchSaturationMinimumCycles ?? 1));
    const calculatedSaturation = providerResult.status === 'SUCCEEDED'
      && providerResult.marginalYield === 0
      ? new Date(now.getTime() + (
        Number.isFinite(campaignIntervalMinutes) && campaignIntervalMinutes > 0
          ? campaignIntervalMinutes
          : 24 * 60
      ) * saturationCycles * 60_000)
      : null;
    const searchSaturatedUntil = saturationFromResult && saturationFromResult.getTime() > now.getTime()
      ? saturationFromResult
      : calculatedSaturation;
    await withSupplyTransaction(database, async (transactionDatabase) => {
      const terminal = providerResult.status !== 'WAITING';
      const retryAt = providerResult.retryAt ?? null;
      await transactionDatabase.waves.update({
        where: { id: wave.id },
        data: {
          status: providerResult.status,
          provider: providerResult.provider ?? null,
          providerOperationKey: providerResult.providerOperationKey ?? null,
          retryAt,
          terminalAt: terminal ? now : null,
          marginalYield: providerResult.marginalYield ?? null,
          errorCode: providerResult.errorCode ?? null,
          resultJson: prismaNullableJsonValue(providerResult.result),
          evidenceRefs: Array.from(new Set([
            ...(wave.evidenceRefs ?? []),
            ...(providerResult.evidenceRefs ?? []),
          ])),
        },
      });
      if (terminal) {
        const currentDemand = await transactionDatabase.demands.findUnique({ where: { id: demand.id } });
        if (currentDemand) {
          const demandUpdate: Record<string, unknown> = {
            activeWaveId: null,
            nextEligibleAt: retryAt,
            generation: currentDemand.generation + 1,
          };
          if (providerResult.status === 'PAUSED') {
            demandUpdate.status = 'PAUSED';
          }
          if (providerResult.status === 'SUCCEEDED') {
            demandUpdate.searchSaturatedUntil = searchSaturatedUntil;
          }
          await transactionDatabase.demands.update({
            where: { id: demand.id },
            data: demandUpdate,
          });
        }
      }
    });
    return providerResult;
  };

  const activeWave = !input.dryRun && database.waves?.findFirst
    ? await database.waves.findFirst({
      where: {
        status: { in: ['PLANNED', 'ACTIVE', 'WAITING'] },
        ...(input.rolloutCohort ?? contract.rolloutCohort
          ? { rolloutCohort: input.rolloutCohort ?? contract.rolloutCohort }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
    : null;
  const contractAdmissionHalted = plan.reasonCodes.includes('UNSAFE_ACTIVE_CONTRACT');
  if (activeWave && !contractAdmissionHalted) {
    const retryAt = toDate(activeWave.retryAt);
    if (
      String(activeWave.status ?? '').toUpperCase() === 'WAITING'
      && retryAt
      && retryAt.getTime() > now.getTime()
    ) {
      return baseResult(activeWave, null);
    }
    const providerResult = await executeWave(activeWave);
    return baseResult(activeWave, providerResult);
  }
  if (input.dryRun || plan.action === 'NONE') {
    return baseResult(null, null);
  }
  const wave = await startAffiliateReplenishmentWave({
    plan,
    rolloutCohort: input.rolloutCohort ?? contract.rolloutCohort,
    contract,
    db: database,
    now,
  });
  if (!wave) return baseResult(null, null);
  const providerResult = await executeWave(wave);
  return baseResult(wave, providerResult);
};