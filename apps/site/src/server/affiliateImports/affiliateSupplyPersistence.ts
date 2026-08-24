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
  type AffiliateReplenishmentPlan,
  type AffiliateSupplyAssessment,
  type AffiliateSupplyCommandAuthority,
  type AffiliateSupplyContractManifest,
  type AffiliateSupplyContractPolicy,
  type AffiliateSupplyCandidateEvidence,
  type AffiliateSupplyContractImpactCell,
  type AffiliateSupplyEvidenceSnapshot,
  type AffiliateSupplyIdentity,
  type AffiliateSupplyLifecycleCommand,
  type AffiliateSupplyLifecycleStage,
} from './affiliateSupplyLifecycle';
import type {
  AffiliateAgentActiveContractRegistry,
  AffiliateAgentLifecycleAuthority,
} from './agentGatewayAdapters';
import { hashAffiliateAgentValue } from './agentGatewayContracts';
import { affiliateScrapeMappingSchema } from './types';
export type AffiliateSupplyDatabase = Readonly<{
  supplySources: any;
  contractManifests: any;
  transitions: any;
  targets: any;
  demands: any;
  waves: any;
  sources: any;
  organizations: any;
  events: any;
  teams: any;
  facilities: any;
  mappings: any;
  runs: any;
  intakes: any;
  pages: any;
  intakeRuns: any;
  artifacts: any;
  mappingJobs: any;
  approvals: any;
  candidates: any;
  gatewayClaims: any;
  gatewayJobs: any;
  coverageJobs: any;
  campaigns: any;
  workerHealth: any;
  rawClient?: any;
  transaction?: (callback: (transaction: AffiliateSupplyDatabase) => Promise<unknown>, options?: unknown) => Promise<unknown>;
}>;

const supplyDatabaseForClient = (client: any): AffiliateSupplyDatabase => {
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

  return Object.defineProperties({}, Object.fromEntries(
    Object.entries(modelNames).map(([name, modelName]) => [
      name,
      {
        enumerable: true,
        get: () => client[modelName],
      },
    ]),
  )) as AffiliateSupplyDatabase;
};
export const affiliateSupplyDatabase = (client: any = prisma): AffiliateSupplyDatabase => {
  const database = supplyDatabaseForClient(client);
  Object.defineProperty(database, 'rawClient', {
    enumerable: false,
    value: client,
  });
  Object.defineProperty(database, 'transaction', {
    enumerable: true,
    get: () => typeof client.$transaction === 'function'
      ? (callback: (database: AffiliateSupplyDatabase) => Promise<unknown>, options: unknown) => client.$transaction(
          (transactionClient: any) => callback(affiliateSupplyDatabase(transactionClient)),
          options,
        )
      : undefined,
  });
  return database;
};

export type AffiliateAgentWorkerHeartbeatInput = Readonly<{
  workerId: string;
  role: string;
  status?: string;
  now?: Date;
  leaseDurationMs?: number;
  metadata?: Record<string, unknown> | null;
}>;

export const recordAffiliateAgentWorkerHeartbeat = async (
  input: AffiliateAgentWorkerHeartbeatInput,
  database: AffiliateSupplyDatabase = affiliateSupplyDatabase(),
): Promise<any | null> => {
  if (!database.workerHealth?.upsert) return null;
  const workerId = input.workerId.trim();
  const role = input.role.trim().toUpperCase();
  if (!workerId || !role) throw new Error('Affiliate worker heartbeats require a worker ID and role.');
  const now = input.now ?? new Date();
  const leaseDurationMs = Math.max(15_000, input.leaseDurationMs ?? 90_000);
  const status = input.status?.trim().toUpperCase() || 'HEALTHY';
  return database.workerHealth.upsert({
    where: { workerId_role: { workerId, role } },
    create: {
      id: createId(),
      workerId,
      role,
      status,
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
      metadata: input.metadata ?? null,
    },
    update: {
      status,
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
      metadata: input.metadata ?? undefined,
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
      if (errorCode !== 'P2034' || attempt >= 2) throw error;
      attempt += 1;
    }
  }
};

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

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
  model: any,
  id: string | null | undefined,
  supplySourceId: string,
): Promise<void> => {
  if (!id || !model?.update) return;
  await model.update({ where: { id }, data: { supplySourceId } });
};

export type EnsureAffiliateSupplySourceInput = Readonly<{
  requestedUrl: string;
  resolvedCanonicalUrl?: string | null;
  redirectVerified?: boolean;
  operatorDomain?: string | null;
  targetKind?: string | null;
  rolloutCohort?: string;
  intakeId?: string | null;
  liveSourceId?: string | null;
  priorSupplySourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>;

export type EnsureAffiliateSupplySourceResult = Readonly<{
  supplySource: any;
  identity: AffiliateSupplyIdentity;
  created: boolean;
  successorCreated: boolean;
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
  return withSupplyTransaction(database, async (transactionDatabase) => {
    const prior = input.priorSupplySourceId
      ? await currentSupplySource(transactionDatabase, input.priorSupplySourceId)
      : null;
    const initialIdentity = normalizeAffiliateSupplyIdentity({
      requestedUrl: input.requestedUrl,
      resolvedCanonicalUrl: input.resolvedCanonicalUrl,
      redirectVerified: input.redirectVerified,
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
      return {
        supplySource: linkedSuccessor ?? prior,
        identity: {
          ...initialIdentity,
          rootDecision: 'REVIEW_REQUIRED',
          reasonCodes: [...initialIdentity.reasonCodes, linkedSuccessor ? 'SUCCESSOR_ALREADY_LINKED' : 'SUCCESSOR_LINK_MISSING'],
        },
        created: false,
        successorCreated: false,
        predecessorId: prior.id,
      };
    }
    const current = prior ?? existing ?? existingByPath;
    const existingSuccessor = prior && existing && existing.id !== prior.id ? existing : linkedSuccessor;
    const identity = current && !prior
      ? normalizeAffiliateSupplyIdentity({
          requestedUrl: input.requestedUrl,
          resolvedCanonicalUrl: input.resolvedCanonicalUrl,
          redirectVerified: input.redirectVerified,
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
        created: false,
        successorCreated: false,
        predecessorId,
      };
    }
    if (existingSuccessor && predecessorId) {
      const successor = await transactionDatabase.supplySources.update({
        where: { id: existingSuccessor.id },
        data: {
          predecessorId: existingSuccessor.predecessorId ?? predecessorId,
          intakeId: input.intakeId ?? existingSuccessor.intakeId ?? null,
          liveSourceId: input.liveSourceId ?? existingSuccessor.liveSourceId ?? null,
          updatedAt: now,
        },
      });
      if (prior && !prior.successorId) {
        await transactionDatabase.supplySources.update({
          where: { id: prior.id },
          data: { successorId: successor.id, updatedAt: now },
        });
      }
      await Promise.all([
        linkSupplySource(transactionDatabase.intakes, input.intakeId, successor.id),
        linkSupplySource(transactionDatabase.sources, input.liveSourceId ?? successor.liveSourceId, successor.id),
      ]);
      return {
        supplySource: successor,
        identity: { ...identity, identityKey: successor.identityKey, rootDecision: 'SUCCESSOR_REQUIRED' },
        created: false,
        successorCreated: false,
        predecessorId,
      };
    }
    if (current && identity.rootDecision === 'REVIEW_REQUIRED') {
      return {
        supplySource: current,
        identity,
        created: false,
        successorCreated: false,
        predecessorId: null,
      };
    }
    if (current && !predecessorId) {
      const canonicalChanged = current.canonicalUrl !== identity.canonicalUrl;
      const liveSourceId = input.liveSourceId ?? current.liveSourceId ?? null;
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
          liveSourceId,
          ...(canonicalChanged ? {
            lifecycleGeneration: Number(current.lifecycleGeneration ?? 0) + 1,
            derivedStage: 'PRE_MAPPED',
            derivedOutcome: null,
            freshnessStatus: 'UNKNOWN',
            targetContribution: 0,
            isAutomationEnabled: false,
            automationHoldReason: 'CANONICAL_REVALIDATION_REQUIRED',
            lastAssessmentAt: null,
          } : {}),
          metadata: input.metadata ?? current.metadata ?? null,
          updatedAt: now,
        },
      });
      await Promise.all([
        linkSupplySource(transactionDatabase.intakes, input.intakeId, current.id),
        linkSupplySource(transactionDatabase.sources, liveSourceId, current.id),
      ]);
      if (canonicalChanged && liveSourceId && transactionDatabase.sources?.update) {
        const liveSource = await transactionDatabase.sources.findUnique({ where: { id: liveSourceId } });
        if (liveSource) {
          await transactionDatabase.sources.update({
            where: { id: liveSourceId },
            data: {
              autoScrapeEnabled: false,
              metadata: {
                ...recordValue(liveSource.metadata),
                automationReviewRequired: {
                  hold: true,
                  reason: 'CANONICAL_REVALIDATION_REQUIRED',
                },
              },
            },
          });
        }
      }
      return {
        supplySource: updated,
        identity: { ...identity, identityKey: current.identityKey, rootDecision: 'SAME_ROOT' },
        created: false,
        successorCreated: false,
        predecessorId: null,
      };
    }

    const supplySourceId = createId();
    const createData = {
      id: supplySourceId,
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
      operatorDomain: input.operatorDomain ?? null,
      targetKind: input.targetKind?.trim().toUpperCase() || 'EVENT',
      rolloutCohort: input.rolloutCohort?.trim() || 'DEFAULT',
      intakeId: input.intakeId ?? null,
      liveSourceId: input.liveSourceId ?? null,
      predecessorId,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };
    let created: any;
    try {
      created = await transactionDatabase.supplySources.create({ data: createData });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const concurrent = await transactionDatabase.supplySources.findUnique({ where: { identityKey: identity.identityKey } });
      if (!concurrent) throw error;
      if (
        predecessorId
        && concurrent.predecessorId
        && concurrent.predecessorId !== predecessorId
      ) {
        return {
          supplySource: concurrent,
          identity: {
            ...identity,
            identityKey: concurrent.identityKey,
            rootDecision: 'REVIEW_REQUIRED',
            reasonCodes: [...identity.reasonCodes, 'SUCCESSOR_PREDECESSOR_MISMATCH'],
          },
          created: false,
          successorCreated: false,
          predecessorId,
        };
      }
      const resolved = predecessorId
        ? await transactionDatabase.supplySources.update({
          where: { id: concurrent.id },
          data: {
            predecessorId,
            intakeId: input.intakeId ?? concurrent.intakeId ?? null,
            liveSourceId: input.liveSourceId ?? concurrent.liveSourceId ?? null,
            updatedAt: now,
          },
        })
        : concurrent;
      if (predecessorId && !prior?.successorId) {
        await transactionDatabase.supplySources.update({
          where: { id: predecessorId },
          data: { successorId: resolved.id, updatedAt: now },
        });
      }
      await Promise.all([
        linkSupplySource(transactionDatabase.intakes, input.intakeId, resolved.id),
        linkSupplySource(transactionDatabase.sources, input.liveSourceId ?? resolved.liveSourceId, resolved.id),
      ]);
      return {
        supplySource: resolved,
        identity: {
          ...identity,
          identityKey: resolved.identityKey,
          rootDecision: predecessorId ? 'SUCCESSOR_REQUIRED' : 'SAME_ROOT',
        },
        created: false,
        successorCreated: false,
        predecessorId: predecessorId ?? null,
      };
    }
    if (predecessorId) {
      await transactionDatabase.supplySources.update({ where: { id: predecessorId }, data: { successorId: created.id, updatedAt: now } });
    }
    await Promise.all([
      linkSupplySource(transactionDatabase.intakes, input.intakeId, created.id),
      linkSupplySource(transactionDatabase.sources, input.liveSourceId, created.id),
    ]);
    if (predecessorId && input.liveSourceId && transactionDatabase.sources?.findUnique && transactionDatabase.sources?.update) {
      const successorSource = await transactionDatabase.sources.findUnique({ where: { id: input.liveSourceId } });
      if (successorSource) {
        await transactionDatabase.sources.update({
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
    return { supplySource: created, identity, created: true, successorCreated: Boolean(predecessorId), predecessorId };
  });
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
const parseActiveAffiliateSupplyContractRow = (row: any): ActiveAffiliateSupplyContractResult => {
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
    .filter((row: any) => {
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
        select: {
          id: true,
          derivedStage: true,
          targetContribution: true,
          isAutomationEnabled: true,
          repairPriority: true,
          freshnessStatus: true,
        },
      })
    : [];
  const targetRows = input.database.targets?.findMany && sources.length > 0
    ? await input.database.targets.findMany({
        where: { supplySourceId: { in: sources.map((source: any) => source.id) } },
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
  const nextAssessments = new Map<string, AffiliateSupplyAssessment>();
  if (
    sources.length
    && input.database.sources?.findFirst
    && input.database.intakes?.findFirst
    && input.database.mappings?.findFirst
    && input.database.mappingJobs?.findFirst
    && input.database.approvals?.findFirst
    && input.database.runs?.findFirst
    && input.database.candidates?.findMany
    && input.database.targets?.findMany
  ) {
    for (const source of sources) {
      const snapshot = await loadSnapshot(
        input.database,
        source.id,
        input.nextPolicy,
        input.now ?? new Date(),
      );
      nextAssessments.set(source.id, deriveAffiliateSupplyAssessment(snapshot));
    }
  }
  return buildAffiliateSupplyContractImpactReport({
    currentManifest,
    sources: sources.map((source: any) => ({
      id: source.id,
      stage: source.derivedStage,
      targetContribution: source.targetContribution,
      isAutomationEnabled: source.isAutomationEnabled,
      repairPriority: source.repairPriority,
      freshnessStatus: source.freshnessStatus,
      ...(nextAssessments.get(source.id)
        ? {
          nextStage: nextAssessments.get(source.id)!.stage,
          nextTargetContribution: nextAssessments.get(source.id)!.targetContribution,
          nextIsAutomationEnabled: nextAssessments.get(source.id)!.isAutomationEnabled,
          nextRepairPriority: nextAssessments.get(source.id)!.repairPriority,
        }
        : {}),
      targetCells: targetCellsBySource.get(source.id) ?? [],
    })),
    nextPolicy: input.nextPolicy,
  });
};


export const activateAffiliateSupplyContract = async (input: Readonly<{
  manifest: AffiliateSupplyContractManifest;
  userId: string;
  impactReport?: Record<string, unknown> | null;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>): Promise<any> => {
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
        impactReport: input.impactReport ?? null,
      },
    });
  });
};
type AffiliateSupplySnapshotRows = Readonly<{
  root: any;
  source: any;
  intake: any;
  mapping: any;
  mappingJob: any;
  approval: any;
  latestRun: any;
  candidates: any[];
  targets: any[];
  contract: AffiliateSupplyContractPolicy;
  now: Date;
}>;

const buildAffiliateSupplySnapshot = (input: AffiliateSupplySnapshotRows): AffiliateSupplyEvidenceSnapshot => {
  const {
    root,
    source,
    intake,
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
  const mappingMetadata = recordValue(mapping?.metadata);
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
    ...(root.liveSourceId && source && source.supplySourceId !== supplySourceId ? ['SOURCE_SUPPLY_ROOT_MISMATCH'] : []),
    ...(root.intakeId && intake && intake.supplySourceId !== supplySourceId ? ['INTAKE_SUPPLY_ROOT_MISMATCH'] : []),
    ...(mapping?.supplySourceId && mapping.supplySourceId !== supplySourceId ? ['MAPPING_SUPPLY_ROOT_MISMATCH'] : []),
    ...(mapping?.sourceId && source?.id && mapping.sourceId !== source.id ? ['MAPPING_SOURCE_MISMATCH'] : []),
    ...(mappingJob?.supplySourceId && mappingJob.supplySourceId !== supplySourceId ? ['MAPPING_JOB_SUPPLY_ROOT_MISMATCH'] : []),
    ...(latestRun?.supplySourceId && latestRun.supplySourceId !== supplySourceId ? ['RUN_SUPPLY_ROOT_MISMATCH'] : []),
    ...candidates
      .filter((candidate: any) => candidate.supplySourceId && candidate.supplySourceId !== supplySourceId)
      .map(() => 'CANDIDATE_SUPPLY_ROOT_MISMATCH'),
  ];
  return {
    now,
    contract,
    source: {
      id: sourceId,
      canonicalUrl: root.canonicalUrl,
      targetKind: source?.targetKind ?? root.targetKind,
      status: source?.status ?? (root.isExcluded ? 'EXCLUDED' : 'ACTIVE'),
      autoScrapeEnabled: source?.autoScrapeEnabled === true,
      activeMappingId: source?.activeMappingId ?? mapping?.id ?? null,
      lifecycleGeneration: root.lifecycleGeneration,
      operatorDomain: root.operatorDomain,
      automationHold: Boolean(recordValue(sourceMetadata.automationReviewRequired).hold),
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
      schemaValid: affiliateScrapeMappingSchema.safeParse(mappingJson).success,
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
      decision: recordValue(approval.decision).decision ?? approval.decision,
      independent: recordValue(approval.decision).independent === true,
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
      emptyStateMatched: runLogs.emptyStateMatched === true,
      errorCode: stringValue(runLogs.errorCode),
      errorMessage: latestRun.errorMessage,
      evidenceRefs: stringArray(runLogs.evidenceRefs),
      metadata: recordValue(latestRun.metadata),
    } : null,
    baseline: sourceMetadata[AFFILIATE_AUTOMATION_BASELINE_METADATA_KEY] ?? null,
    lifecycleEvidenceKinds,
    identityViolations,
    candidates: candidates.map((candidate: any) => ({
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
    targets: targets.map((target: any) => ({
      id: target.id,
      targetType: target.targetType,
      targetId: target.targetId,
      sourceProfile: target.sourceProfile,
      status: target.status,
      marketKey: target.marketKey,
      sportId: target.sportId,
      publishedAt: target.publishedAt,
      lastSuccessfulRefreshAt: target.lastSuccessfulRefreshAt,
      freshnessExpiresAt: target.freshnessExpiresAt,
      rejectedAt: target.rejectedAt,
      evidenceRefs: target.evidenceRefs,
      metadata: recordValue(target.metadata),
    })),
  };
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
  const [source, intake] = await Promise.all([
    root.liveSourceId ? database.sources.findUnique({ where: { id: root.liveSourceId } }) : database.sources.findFirst({ where: { supplySourceId }, orderBy: { createdAt: 'asc' } }),
    root.intakeId ? database.intakes.findUnique({ where: { id: root.intakeId } }) : database.intakes.findFirst({ where: { supplySourceId }, orderBy: { createdAt: 'asc' } }),
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
      orderBy: [{ finishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    }),
    database.candidates.findMany({ where: { OR: [{ supplySourceId }, { sourceId }] }, orderBy: { createdAt: 'asc' } }),
    database.targets.findMany({ where: { supplySourceId }, orderBy: { targetId: 'asc' } }),
  ]);
  return buildAffiliateSupplySnapshot({
    root,
    source,
    intake,
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
  roots: any[],
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
    || !database.targets?.findMany
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
  const [sources, intakes, mappings, mappingJobs, approvals, runs, candidates, targets] = await Promise.all([
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
      orderBy: [{ finishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
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
  ]);
  const firstFor = (rows: any[], predicate: (row: any) => boolean): any => rows.find(predicate) ?? null;
  const sortDateDesc = (left: any, right: any, field: string): number => {
    const leftTime = left?.[field] instanceof Date ? left[field].getTime() : (left?.[field] ? new Date(left[field]).getTime() : Number.NEGATIVE_INFINITY);
    const rightTime = right?.[field] instanceof Date ? right[field].getTime() : (right?.[field] ? new Date(right[field]).getTime() : Number.NEGATIVE_INFINITY);
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
    const sourceId = source?.id ?? root.liveSourceId ?? `supply-source:${rootId}`;
    const rootMappings = mappings
      .filter((row: any) => row.supplySourceId === rootId || row.sourceId === sourceId)
      .sort((left: any, right: any) => Number(right.isActive) - Number(left.isActive) || Number(right.version ?? 0) - Number(left.version ?? 0));
    const mapping = source?.activeMappingId
      ? firstFor(rootMappings, (row) => row.id === source.activeMappingId)
      : rootMappings[0] ?? null;
    const rootMappingJobs = mappingJobs
      .filter((row: any) => row.supplySourceId === rootId || row.sourceId === sourceId)
      .sort((left: any, right: any) => sortDateDesc(left, right, 'createdAt'));
    const rootApprovals = approvals
      .filter((row: any) => row.supplySourceId === rootId && row.subjectType === 'MAPPING_PACKAGE')
      .sort((left: any, right: any) => sortDateDesc(left, right, 'updatedAt'));
    const rootRuns = runs
      .filter((row: any) => (
        (row.supplySourceId === rootId || row.sourceId === sourceId)
        && row.id !== undefined
      ))
      .sort((left: any, right: any) => (
        sortDateDesc(left, right, 'finishedAt') || sortDateDesc(left, right, 'createdAt')
      ));
    return [
      rootId,
      buildAffiliateSupplySnapshot({
        root,
        source,
        intake,
        mapping,
        mappingJob: rootMappingJobs[0] ?? null,
        approval: rootApprovals[0] ?? null,
        latestRun: rootRuns[0] ?? null,
        candidates: candidates.filter((row: any) => row.supplySourceId === rootId || row.sourceId === sourceId),
        targets: targets.filter((row: any) => row.supplySourceId === rootId),
        contract,
        now,
      }),
    ] as const;
  }));
};

export const deriveAndPersistAffiliateSupplyAssessment = async (input: Readonly<{
  supplySourceId: string;
  contract?: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
  now?: Date;
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
      assessmentJson: assessment,
      invariantViolations: assessment.invariantViolations,
      activeSupplyContractVersion: contractResult.policy.version,
      activeSupplyContractHash: contractResult.policy.hash,
    },
  });
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
}>): Promise<any> => {
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
      metadata: input.metadata ?? null,
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
      metadata: input.metadata ?? undefined,
    },
  });
};

export type AffiliateSupplyTransitionInput = Readonly<{
  supplySourceId: string;
  command: string;
  idempotencyKey: string;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  expectedGeneration: number;
  contractVersion: number;
  contractHash: string;
  actorKind: string;
  actorId: string;
  executingAgentId?: string | null;
  fromStage?: string | null;
  toStage: string;
  outcome?: string | null;
  reasonCodes?: readonly string[];
  evidenceRefs?: readonly string[];
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>;
export const recordAffiliateSupplyLifecycleTransition = async (
  input: AffiliateSupplyTransitionInput,
): Promise<{ transition: any; replayed: boolean }> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const requestHash = hashAffiliateAgentValue({
    supplySourceId: input.supplySourceId,
    command: input.command,
    expectedGeneration: input.expectedGeneration,
    contractVersion: input.contractVersion,
    contractHash: input.contractHash,
    request: input.request,
  });
  const resultHash = hashAffiliateAgentValue(input.result);
  const existing = await database.transitions.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.requestHash !== requestHash || existing.resultHash !== resultHash) throw new Error('Affiliate lifecycle idempotency key was reused with a different request or result.');
    return { transition: existing, replayed: true };
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
      outcome: input.outcome ?? null,
      fromStage: input.fromStage ?? source.derivedStage,
      toStage: input.toStage,
      commandRef: stringValue(input.request.commandRef),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      contractHash: input.contractHash,
      actorKind: input.actorKind,
      actorId: input.actorId,
      executingAgentId: input.executingAgentId ?? null,
      reasonCodes: Array.from(new Set(input.reasonCodes ?? [])),
      evidenceRefs: Array.from(new Set(input.evidenceRefs ?? [])),
      requestJson: input.request,
      resultJson: input.result,
      occurredAt: now,
    };
    let transition: any;
    try {
      transition = await transactionDatabase.transitions.create({ data: transitionData });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await transactionDatabase.transitions.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay && replay.requestHash === requestHash && replay.resultHash === resultHash) return { transition: replay, replayed: true };
      throw error;
    }
    await transactionDatabase.supplySources.update({
      where: { id: input.supplySourceId },
      data: {
        lifecycleGeneration: source.lifecycleGeneration + 1,
        derivedStage: input.toStage,
        derivedOutcome: input.outcome ?? null,
        lastAssessmentAt: now,
        activeSupplyContractVersion: input.contractVersion,
        activeSupplyContractHash: input.contractHash,
        assessmentJson: input.result,
      },
    });
    return { transition, replayed: false };
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
  actorKind: string;
  actorId: string;
  executingAgentId?: string | null;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  targetWriter?: (input: Readonly<{
    database: AffiliateSupplyDatabase;
    client: any;
    contract: AffiliateSupplyContractPolicy;
    request: Record<string, unknown>;
    now: Date;
  }>) => Promise<AffiliateSupplyLifecycleTargetWrite>;
  activationTargetWriter?: (input: Readonly<{
    database: AffiliateSupplyDatabase;
    client: any;
    contract: AffiliateSupplyContractPolicy;
    request: Record<string, unknown>;
    target: Record<string, unknown>;
    candidate: AffiliateSupplyCandidateEvidence;
    now: Date;
  }>) => Promise<AffiliateSupplyLifecycleTargetWrite>;
}>;

export type AffiliateSupplyLifecycleCommandResult = Readonly<{
  assessment: AffiliateSupplyAssessment;
  transition: any | null;
  replayed: boolean;
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
): Promise<any> => {
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
        decision: {
          ...decisionPayload,
          decisionHash,
        },
        finishedAt: now,
      },
    });
  });
};

export const executeAffiliateSupplyLifecycleCommand = async (
  input: ExecuteAffiliateSupplyLifecycleCommandInput,
): Promise<AffiliateSupplyLifecycleCommandResult> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const request = input.request ?? {};
  const now = input.now ?? new Date();
  return withSupplyTransaction(database, async (transactionDatabase) => {
    const existing = await transactionDatabase.transitions.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const replayHash = hashAffiliateAgentValue({
        supplySourceId: input.supplySourceId,
        command: input.command,
        expectedGeneration: input.expectedLifecycleGeneration,
        contractVersion: existing.contractVersion,
        contractHash: existing.contractHash,
        request,
      });
      if (existing.requestHash !== replayHash) {
        throw new Error('Affiliate lifecycle idempotency key was reused with a different request.');
      }
      return {
        assessment: existing.resultJson as AffiliateSupplyAssessment,
        transition: existing,
        replayed: true,
      };
    }
    const root = await transactionDatabase.supplySources.findUnique({ where: { id: input.supplySourceId } });
    if (!root) throw new Error('Affiliate Supply Source not found.');
    const contract = await loadActiveAffiliateSupplyContract({
      db: transactionDatabase,
      rolloutCohort: input.rolloutCohort ?? root.rolloutCohort,
    });
    const requestHash = hashAffiliateAgentValue({
      supplySourceId: input.supplySourceId,
      command: input.command,
      expectedGeneration: input.expectedLifecycleGeneration,
      contractVersion: contract.policy.version,
      contractHash: contract.policy.hash,
      request,
    });
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
      commandContractVersion: contract.policy.version,
      commandContractHash: contract.policy.hash,
      evidenceRefs: stringArray(request.evidenceRefs),
      assessment: assessmentBefore,
    });
    if (!commandDecision.accepted) {
      throw new Error(`Affiliate lifecycle command rejected: ${commandDecision.reasonCodes.join(', ')}`);
    }

    const source = root.liveSourceId
      ? await transactionDatabase.sources.findUnique({ where: { id: root.liveSourceId } })
      : await transactionDatabase.sources.findFirst({ where: { supplySourceId: input.supplySourceId }, orderBy: { createdAt: 'asc' } });
    const mappingId = stringValue(request.mappingId);
    const evidenceRefs = [
      ...stringArray(request.evidenceRefs),
      `supply-source:${input.supplySourceId}`,
    ];
    if (input.command === 'CREATE_SUCCESSOR') {
      const successorRequest = recordValue(request.successor);
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
        redirectVerified: successorRequest.redirectVerified === true || request.redirectVerified === true,
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
        const successor = await ensureAffiliateSupplySource({
          requestedUrl,
          resolvedCanonicalUrl,
          redirectVerified: successorRequest.redirectVerified === true
            || request.redirectVerified === true,
          operatorDomain,
          targetKind: stringValue(successorRequest.targetKind ?? request.targetKind) ?? root.targetKind,
          rolloutCohort: root.rolloutCohort,
          intakeId: stringValue(successorRequest.intakeId ?? request.intakeId) ?? root.intakeId,
          liveSourceId: stringValue(successorRequest.liveSourceId ?? request.liveSourceId),
          priorSupplySourceId: root.id,
          db: transactionDatabase,
          now,
        });
        if (!successor.successorCreated || successor.predecessorId !== root.id) {
          throw new Error('Affiliate successor creation did not produce a linked successor root.');
        }
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
      const mappingMetadata = recordValue(mapping.metadata);
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
      const approvalMappingMetadata = recordValue(approvalMapping?.metadata);
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
        independent: true,
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
            client: transactionDatabase.rawClient ?? transactionDatabase,
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
      for (const candidateId of reviewedCandidateIds) {
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
        client: transactionDatabase.rawClient ?? transactionDatabase,
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
              emptyStateMatched: request.emptyStateMatched === true
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
            metadata: {
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
            },
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
        target.sourceProfile = stringValue(request.sourceProfile) ?? target.targetType;
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
    }

    let assessment = await deriveAndPersistAffiliateSupplyAssessment({
      supplySourceId: input.supplySourceId,
      contract: contract.policy,
      db: transactionDatabase,
      now,
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
      });
    }
    const current = await transactionDatabase.supplySources.findUnique({ where: { id: input.supplySourceId } });
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
      contractVersion: contract.policy.version,
      contractHash: contract.policy.hash,
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
    if (source?.id && transactionDatabase.sources?.update) {
      await transactionDatabase.sources.update({
        where: { id: source.id },
        data: {
          lifecycleGeneration: result.lifecycleGeneration,
          activeSupplyContractVersion: contract.policy.version,
          activeSupplyContractHash: contract.policy.hash,
        },
      });
    }
    return {
      assessment: result,
      transition: transitionResult.transition,
      replayed: transitionResult.replayed,
    };
  });
};
const AFFILIATE_LIFECYCLE_COMMANDS: readonly AffiliateSupplyLifecycleCommand[] = [
  'RECORD_MAPPING',
  'APPROVE',
  'ACTIVATE',
  'PUBLISH_TARGET',
  'RECORD_REFRESH',
  'RECORD_EMPTY_REFRESH',
  'RECORD_REFRESH_FAILURE',
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
  ): Promise<Readonly<{ decision: Record<string, unknown>; transition?: any }> | null> => {
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

  const findTransitionByReceipt = async (receiptId: string): Promise<any | null> => (
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
        actorKind: 'HUMAN_DIRECTED_EXECUTOR',
        actorId: execution.identity.recordedHumanActorId,
        executingAgentId: execution.identity.commandRef,
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
    select: { id: true, derivedStage: true, targetContribution: true, isAutomationEnabled: true, repairPriority: true, freshnessStatus: true },
  });
  const targetRows = database.targets?.findMany && sources.length > 0
    ? await database.targets.findMany({
        where: { supplySourceId: { in: sources.map((source: any) => source.id) } },
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
  return buildAffiliateSupplyContractImpactReport({
    currentManifest: active.manifest,
    sources: sources.map((source: any) => ({
      id: source.id,
      stage: source.derivedStage,
      targetContribution: source.targetContribution,
      isAutomationEnabled: source.isAutomationEnabled,
      repairPriority: source.repairPriority,
      freshnessStatus: source.freshnessStatus,
      targetCells: targetCellsBySource.get(source.id) ?? [],
    })),
    nextPolicy: input.nextPolicy,
  });
};

const targetKeyFor = (target: Readonly<{ marketKey: string; sportId: string; sourceProfile: string }>): string => `${target.marketKey}:${target.sportId}:${target.sourceProfile}`.toLowerCase();

const isFreshTargetForDemand = (
  target: Record<string, unknown>,
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
  const rejectedAt = toDate(target.rejectedAt as Date | string | null | undefined);
  if (rejectedAt) return false;
  const expiresAt = toDate(target.freshnessExpiresAt as Date | string | null | undefined);
  if (expiresAt) return expiresAt.getTime() > now.getTime();
  const refreshedAt = toDate(target.lastSuccessfulRefreshAt as Date | string | null | undefined);
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
}>): Promise<{ opened: number; closed: number; demands: any[] }> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  if (!database.demands?.upsert) return { opened: 0, closed: 0, demands: [] };
  const rolloutCohort = input.rolloutCohort ?? input.contract.rolloutCohort;
  const sourceRows = database.supplySources?.findMany
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
  const sourcesById = new Map<string, Record<string, unknown>>(
    sourceRows.map((source: Record<string, unknown>) => [String(source.id), source]),
  );
  const targets = input.assessments
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
      status?: string | null;
      rejectedAt?: Date | string | null;
      freshnessExpiresAt?: Date | string | null;
      lastSuccessfulRefreshAt?: Date | string | null;
    }>,
    priority: unknown,
  ): void => {
    const source = sourcesById.get(sourceId);
    if (!source || !isFreshTargetForDemand(target as Record<string, unknown>, input.contract, now)) return;
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
    targets.forEach((target: Record<string, unknown>) => {
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
  const rows: any[] = [];
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
    const existing = await database.demands.findUnique({
      where: {
        rolloutCohort_targetKey_contractVersion_contractHash: {
          rolloutCohort,
          targetKey,
          contractVersion: input.contract.version,
          contractHash: input.contract.hash,
        },
      },
    });
    const status = satisfied ? 'CLOSED' : 'OPEN';
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
    const nextReasonCodes = satisfied ? ['TARGET_MET'] : ['TARGET_SHORTFALL'];
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
      reasonCodes: nextReasonCodes,
      evidenceJson: nextEvidenceJson,
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
      reasonCodes: nextReasonCodes,
      evidenceJson: nextEvidenceJson,
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
    const row = input.dryRun
      ? { ...(existing ?? {}), ...createData, ...updateData, id: existing?.id ?? createData.id }
      : stateUnchanged
        ? existing
        : await database.demands.upsert({ where, create: createData, update: updateData });
    rows.push(row);
  }
  return { opened, closed, demands: rows };
};

export const planAffiliateReplenishmentFromDatabase = async (input: Readonly<{
  contract?: AffiliateSupplyContractPolicy;
  isContractSafe?: boolean;
  rolloutCohort?: string;
  db?: AffiliateSupplyDatabase;
  now?: Date;
  demands?: readonly any[];
}> = {}): Promise<AffiliateReplenishmentPlan> => {
  const database = input.db ?? affiliateSupplyDatabase();
  const contract = input.contract;
  const demandRolloutCohort = input.rolloutCohort ?? contract?.rolloutCohort;
  const now = input.now ?? new Date();
  const [waitingMapping, activeMapping, waitingReview, activeReviewerClaims, activeProducerClaims, demands, activeWaves, campaigns, healthyWorkers] = await Promise.all([
    database.mappingJobs.count({ where: { status: { in: ['QUEUED', 'REVIEW_REQUIRED'] } } }),
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
  const workerRows = Array.isArray(healthyWorkers) ? healthyWorkers : [];
  const hasCurrentWorkerHealth = workerRows.length > 0;
  const healthyProducerCount = hasCurrentWorkerHealth
    ? workerRows.filter((worker: { role: string; status?: string }) => (
      worker.role === 'MAPPING_PRODUCER' && worker.status === 'HEALTHY'
    )).length
    : activeProducerClaims;
  const healthyReviewerCount = hasCurrentWorkerHealth
    ? workerRows.filter((worker: { role: string; status?: string }) => (
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
    demands: demands.map((demand: any) => ({
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
    activeWaves: activeWaves.map((wave: any) => ({
      id: wave.id,
      status: wave.status,
      demandId: wave.demandId,
    })),
    campaigns: (campaigns ?? []).map((campaign: any) => ({
      id: campaign.id,
      eligible: !campaign.nextRunAt || campaign.nextRunAt <= now,
      priority: Number(recordValue(campaign.metadata).priority ?? 2),
      nextEligibleAt: campaign.nextRunAt,
      marketKey: recordValue(campaign.metadata).marketKey,
      sportId: recordValue(campaign.metadata).sportId,
      sourceProfile: recordValue(campaign.metadata).sourceProfile,
    })),
  });
};

export const startAffiliateReplenishmentWave = async (input: Readonly<{
  plan: AffiliateReplenishmentPlan;
  rolloutCohort: string;
  contract: AffiliateSupplyContractPolicy;
  db?: AffiliateSupplyDatabase;
  now?: Date;
}>): Promise<any | null> => {
  if (input.plan.action === 'NONE' || !input.plan.selectedDemandId) return null;
  const database = input.db ?? affiliateSupplyDatabase();
  const now = input.now ?? new Date();
  const rolloutCohort = input.rolloutCohort ?? input.contract.rolloutCohort;
  if (!database.waves?.create) return null;
  return withSupplyTransaction(database, async (transactionDatabase) => {
    const demand = await transactionDatabase.demands.findUnique({ where: { id: input.plan.selectedDemandId } });
    if (
      !demand
      || demand.status !== 'OPEN'
      || demand.rolloutCohort !== rolloutCohort
      || demand.contractVersion !== input.contract.version
      || demand.contractHash !== input.contract.hash
    ) return null;
    const existingWave = await transactionDatabase.waves.findFirst({
      where: { demandId: demand.id, status: { in: ['PLANNED', 'ACTIVE', 'WAITING'] } },
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
          context: {
            demandId: demand.id,
            marketKey: demand.marketKey,
            sportId: demand.sportId,
            sourceProfile: demand.sourceProfile,
            rolloutCohort,
            contractVersion: input.contract.version,
            contractHash: input.contract.hash,
          },
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
        campaignId: input.plan.selectedCampaignId,
        coveragePlanningJobId,
        startedAt: now,
        demandGeneration: demand.generation,
        evidenceRefs: [`demand:${demand.id}`],
      },
    });
    await transactionDatabase.demands.update({
      where: { id: demand.id },
      data: { activeWaveId: wave.id, generation: demand.generation + 1 },
    });
    return wave;
  });
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
  const sourceIds = sources.map((source: any) => source.id);
  const candidates = database.candidates?.findMany && sourceIds.length
    ? await database.candidates.findMany({
        where: {
          sourceId: { in: sourceIds },
          OR: [
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
  const candidateIds = candidates.map((candidate: any) => candidate.id);
  const targets = database.targets?.findMany && candidateIds.length
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
  const targetsByCandidateId = new Map<string, any[]>();
  for (const target of targets) {
    const candidateTargets = targetsByCandidateId.get(String(target.candidateId)) ?? [];
    candidateTargets.push(target);
    targetsByCandidateId.set(String(target.candidateId), candidateTargets);
  }
  const candidatesBySourceId = new Map<string, any[]>();
  for (const candidate of candidates) {
    const sourceCandidates = candidatesBySourceId.get(String(candidate.sourceId)) ?? [];
    sourceCandidates.push(candidate);
    candidatesBySourceId.set(String(candidate.sourceId), sourceCandidates);
  }
  const publicTargetsForCandidate = (candidate: Record<string, unknown>): Array<{
    targetType: string;
    targetId: string;
  }> => {
    const listingKind = String(candidate.listingKind ?? '').toUpperCase();
    const targetType = listingKind === 'RENTAL'
      ? 'FACILITY'
      : listingKind === 'CLUB'
        ? 'ORGANIZATION'
        : listingKind;
    const targetId = targetType === 'EVENT'
      ? candidate.publishedEventId
      : targetType === 'TEAM'
        ? candidate.publishedTeamId
        : targetType === 'FACILITY'
          ? candidate.publishedFacilityId
          : targetType === 'ORGANIZATION'
            ? candidate.publishedOrganizationId
            : null;
    return typeof targetId === 'string' && targetId.trim()
      ? [{ targetType, targetId: targetId.trim() }]
      : [];
  };
  const rows: AffiliateLegacySupplyReconciliationRow[] = [];
  for (const source of sources) {
    const identity = normalizeAffiliateSupplyIdentity({
      requestedUrl: String(source.listUrl),
      resolvedCanonicalUrl: String(source.listUrl),
      redirectVerified: false,
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
      for (const publicTarget of publicTargetsForCandidate(candidate)) {
        const existingTarget = candidateTargets.find((target: any) => (
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

const persistReconciledAffiliateSupplyAssessment = async (input: Readonly<{
  database: AffiliateSupplyDatabase;
  root: Record<string, any>;
  snapshot: AffiliateSupplyEvidenceSnapshot;
  assessment: AffiliateSupplyAssessment;
  contract: AffiliateSupplyContractPolicy;
  now: Date;
}>): Promise<AffiliateSupplyAssessment> => {
  const { database, root, snapshot, assessment, contract, now } = input;
  const persistedInvariantViolations = Array.from(new Set(
    (Array.isArray(root.invariantViolations) ? root.invariantViolations : [])
      .filter((value): value is string => typeof value === 'string'),
  )).sort();
  const invariantViolationsMatch = JSON.stringify(persistedInvariantViolations)
    === JSON.stringify([...assessment.invariantViolations].sort());
  const projectionMatches = (
    root.derivedStage === assessment.stage
    && root.derivedOutcome === assessment.outcome
    && root.freshnessStatus === assessment.freshnessStatus
    && root.targetContribution === assessment.targetContribution
    && root.repairPriority === assessment.repairPriority
    && root.isAutomationEnabled === assessment.isAutomationEnabled
    && root.automationHoldReason === assessment.automationHoldReason
    && root.isExcluded === (assessment.stage === 'SOURCE_EXCLUDED')
    && invariantViolationsMatch
  );
  if (
    projectionMatches
    || !database.transitions?.create
    || !database.transitions?.findUnique
    || !database.contractManifests?.findFirst
  ) {
    if (!projectionMatches && database.supplySources?.update) {
      await database.supplySources.update({
        where: { id: root.id },
        data: {
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
          assessmentJson: assessment,
          invariantViolations: assessment.invariantViolations,
          activeSupplyContractVersion: contract.version,
          activeSupplyContractHash: contract.hash,
        },
      });
    }
    return assessment;
  }
  const result = await executeAffiliateSupplyLifecycleCommand({
    supplySourceId: root.id,
    command: 'RECONCILE',
    authority: 'SYSTEM',
    expectedLifecycleGeneration: Number(root.lifecycleGeneration ?? 0),
    idempotencyKey: `reconcile:${root.id}:${root.lifecycleGeneration}:${contract.version}:${contract.hash}`,
    request: {
      evidenceRefs: [
        `supply-source:${root.id}`,
        ...assessment.evidenceRefs,
      ],
      assessedAt: assessment.assessedAt,
    },
    actorKind: 'SYSTEM',
    actorId: 'affiliate-supply-reconciliation',
    rolloutCohort: contract.rolloutCohort,
    db: database,
    now,
  });
  return result.assessment;
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
    const assessments = await Promise.all(roots.map(async (root: any) => {
      const snapshot = snapshots.get(String(root.id));
      if (!snapshot) throw new Error(`Affiliate Supply Source snapshot is missing: ${root.id}.`);
      const assessment = deriveAffiliateSupplyAssessment(snapshot);
      return persistReconciledAffiliateSupplyAssessment({
        database: transactionDatabase,
        root,
        snapshot,
        assessment,
        contract,
        now,
      });
    }));
    return { assessed: assessments.length, assessments };
  });
};
export type AffiliateReplenishmentWaveExecutionResult = Readonly<{
  status: 'WAITING' | 'SUCCEEDED' | 'FAILED';
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
  demands: readonly any[];
  assessments: readonly AffiliateSupplyAssessment[];
  plan: AffiliateReplenishmentPlan;
  wave: any | null;
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
    wave: any;
    demand: any;
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
    const derivedAssessments = roots.map((root: any) => (
      deriveAffiliateSupplyAssessment(snapshots.get(String(root.id))!)
    ));
    const assessments = input.dryRun
      ? derivedAssessments
      : await Promise.all(roots.map(async (root: any, index: number) => {
        const snapshot = snapshots.get(String(root.id));
        if (!snapshot) throw new Error(`Affiliate Supply Source snapshot is missing: ${root.id}.`);
        return persistReconciledAffiliateSupplyAssessment({
          database: transactionDatabase,
          root,
          snapshot,
          assessment: derivedAssessments[index],
          contract,
          now,
        });
      }));
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
  const baseResult = (wave: any | null, providerResult: AffiliateReplenishmentWaveExecutionResult | null): AffiliateReplenishmentReconciliationResult => ({
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
    wave: any,
  ): Promise<AffiliateReplenishmentWaveExecutionResult | null> => {
    if (!input.runWave) return null;
    const demand = await database.demands.findUnique({ where: { id: wave.demandId } });
    if (!demand) throw new Error('Affiliate replenishment wave demand not found.');
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
    const campaignMetadata = recordValue(campaign?.metadata ?? wave.metadata);
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
          resultJson: providerResult.result ?? null,
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