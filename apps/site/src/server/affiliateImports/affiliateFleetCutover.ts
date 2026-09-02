import { AFFILIATE_AGENT_ROLES, hashAffiliateAgentValue } from './agentGatewayContracts';
import {
  AFFILIATE_SUPPLY_LIFECYCLE_STAGES,
  normalizeAffiliateSupplyIdentity,
  type AffiliateSupplyLifecycleStage,
} from './affiliateSupplyLifecycle';

export const AFFILIATE_GOVERNED_SUPERVISOR_COUNTS = Object.freeze({
  MAPPING_PRODUCER: 2,
  SUPPLY_REVIEWER: 2,
  COVERAGE_PLANNER: 1,
} as const);
export const AFFILIATE_GOVERNED_CONTROL_PLANE_IDS = Object.freeze([
  'affiliate-gateway',
  'affiliate-agent-runner',
  'affiliate-replenishment-controller',
] as const);
export const AFFILIATE_GOVERNED_PREFLIGHT_CONTROL_PLANE_IDS = Object.freeze([
  'affiliate-gateway',
  'affiliate-agent-runner',
  'affiliate-agent-downstream-ready',
  'affiliate-replenishment-controller',
] as const);
export const AFFILIATE_GOVERNED_AUXILIARY_CONTAINER_IDS = Object.freeze([
  'affiliate-agent-downstream-ready',
  'affiliate-replenishment-controller',
] as const);



const GOVERNED_ROLES = Object.keys(AFFILIATE_GOVERNED_SUPERVISOR_COUNTS) as Array<keyof typeof AFFILIATE_GOVERNED_SUPERVISOR_COUNTS>;
const ACTIVE_CLAIM_STATUSES = new Set([
  'ACTIVE',
  'CLAIMED',
  'IN_PROGRESS',
  'INVOKING',
  'LEASED',
  'PROCESSING',
  'RUNNING',
  'STARTING',
]);
const EXPIRED_CLAIM_STATUSES = new Set(['EXPIRED']);
const LEGACY_PROCESS_STATUSES = new Set(['ACTIVE', 'ENABLED', 'HEALTHY', 'ONLINE', 'RUNNING', 'STARTED', 'STARTING', 'UP']);
const LEGACY_PROCESS_CLASSES = new Set([
  'APPROVAL',
  'CAPTURE',
  'CONTROLLER',
  'COVERAGE',
  'DISCOVERY',
  'GOAL',
  'INTAKE',
  'MAPPING',
]);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
export const AFFILIATE_CUTOVER_PREFLIGHT_MAX_AGE_MS = 15 * 60 * 1000;

export const isAffiliateCutoverPreflightFresh = (
  report: Pick<AffiliateCutoverPreflightReport, 'evaluatedAt'>,
  now: Date,
): boolean => {
  const evaluatedAt = Date.parse(report.evaluatedAt);
  const ageMs = now.getTime() - evaluatedAt;
  return Number.isFinite(evaluatedAt)
    && ageMs >= 0
    && ageMs <= AFFILIATE_CUTOVER_PREFLIGHT_MAX_AGE_MS;
};


const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
)).sort(canonicalCompare);

const upper = (value: unknown): string => String(value ?? '').trim().toUpperCase();

const stringValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const isoDate = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const dateFrom = (value: unknown): Date | null => {
  const normalized = isoDate(value);
  return normalized ? new Date(normalized) : null;
};

const canonicalCompare = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

const canonicalJsonCompare = (left: unknown, right: unknown): number => (
  canonicalCompare(JSON.stringify(left), JSON.stringify(right))
);

const canonicalHash = (value: unknown): string => hashAffiliateAgentValue(value);

export type AffiliateLegacyRecordKind =
  | 'INTAKE'
  | 'CAPTURE_PAGE'
  | 'CAPTURE_RUN'
  | 'CAPTURE_ARTIFACT'
  | 'DISCOVERY_RESULT'
  | 'SOURCE'
  | 'MAPPING'
  | 'SCRAPE_RUN'
  | 'MAPPING_JOB'
  | 'APPROVAL_JOB'
  | 'CANDIDATE'
  | 'PUBLIC_TARGET'
  | 'ORGANIZATION'
  | 'EVENT'
  | 'TEAM'
  | 'FACILITY';

export type AffiliateLegacySourceEvidence = Readonly<{
  id: string;
  requestedUrl: string | null;
  resolvedCanonicalUrl?: string | null;
  isRedirectVerified?: boolean;
  operatorDomain?: string | null;
  targetKind?: string | null;
  existingSupplySourceId?: string | null;
  predecessorSupplySourceId?: string | null;
  intakeId?: string | null;
  liveSourceId?: string | null;
  evidenceRefs?: readonly string[];
}>;

export type AffiliateLegacyRootEvidence = Readonly<{
  id: string;
  identityKey: string;
  canonicalUrl: string;
  origin: string;
  pathKey: string;
  predecessorId?: string | null;
  successorId?: string | null;
  derivedStage?: string | null;
  isAutomationEnabled?: boolean;
}>;

export type AffiliateLegacyLineageRecord = Readonly<{
  kind: AffiliateLegacyRecordKind;
  id: string;
  sourceId?: string | null;
  supplySourceId?: string | null;
  associationKey?: string | null;
  evidenceRefs?: readonly string[];
}>;

export type AffiliateLegacyTargetEvidence = Readonly<{
  id: string;
  sourceId?: string | null;
  supplySourceId?: string | null;
  candidateId?: string | null;
  targetType: string;
  targetId: string | null;
  status?: string | null;
  marketKey?: string | null;
  sportId?: string | null;
  sourceProfile?: string | null;
  publishedAt?: Date | string | null;
  lastSuccessfulRefreshAt?: Date | string | null;
  freshnessExpiresAt?: Date | string | null;
  rejectedAt?: Date | string | null;
  rejectionReason?: string | null;
  metadata?: unknown;
  evidenceHash?: string | null;
  evidenceRefs?: readonly string[];
  isEvidenceVerifiable?: boolean;
}>;
export type AffiliateLegacyClaimEvidence = Readonly<{
  kind: AffiliateLegacyRecordKind | 'GATEWAY_CLAIM' | 'DISCOVERY_RUN' | 'INTAKE_RUN' | 'COVERAGE_JOB';
  id: string;
  sourceId?: string | null;
  supplySourceId?: string | null;
  subjectId?: string | null;
  role?: string | null;
  workerId?: string | null;
  claimGeneration?: number | null;
  status: string;
  leaseExpiresAt?: Date | string | null;
  tokenExpiresAt?: Date | string | null;
  endedAt?: Date | string | null;
  tokenInvalidatedAt?: Date | string | null;
  gatewayJobStatus?: string | null;
  gatewayJobActiveClaimId?: string | null;
  gatewayJobClaimGeneration?: number | null;
}>;
export type AffiliateLegacyReconciliationInput = Readonly<{
  now: Date;
  sources: readonly AffiliateLegacySourceEvidence[];
  roots: readonly AffiliateLegacyRootEvidence[];
  records: readonly AffiliateLegacyLineageRecord[];
  targets: readonly AffiliateLegacyTargetEvidence[];
  claims: readonly AffiliateLegacyClaimEvidence[];
  /**
   * Hash of the complete legacy database snapshot used to build this report.
   * An empty value is allowed for the pure, database-independent seam.
   */
  legacySnapshotHash?: string | null;
  supplyContractVersion?: number | null;
  supplyContractHash?: string | null;
  derivedStages?: Readonly<Record<string, AffiliateSupplyLifecycleStage>>;
  preflightFindings?: readonly AffiliateCutoverFinding[];
}>;


export type AffiliateCutoverFinding = Readonly<{
  code: string;
  severity: 'BLOCKING' | 'WARNING';
  detail: string;
  recordIds: readonly string[];
  resolution: string;
}>;
const normalizedAffiliateLegacyClaimForHash = (
  claim: AffiliateLegacyClaimEvidence,
): Record<string, unknown> => ({
  kind: upper(claim.kind),
  id: stringValue(claim.id) ?? '',
  sourceId: stringValue(claim.sourceId),
  supplySourceId: stringValue(claim.supplySourceId),
  subjectId: stringValue(claim.subjectId),
  role: stringValue(claim.role) ? upper(claim.role) : null,
  workerId: stringValue(claim.workerId),
  claimGeneration: typeof claim.claimGeneration === 'number' && Number.isInteger(claim.claimGeneration)
    ? claim.claimGeneration
    : null,
  status: upper(claim.status),
  leaseExpiresAt: isoDate(claim.leaseExpiresAt),
  tokenExpiresAt: isoDate(claim.tokenExpiresAt),
  endedAt: isoDate(claim.endedAt),
  tokenInvalidatedAt: isoDate(claim.tokenInvalidatedAt),
});
const normalizedAffiliateLegacyClaimsForHash = (
  claims: readonly AffiliateLegacyClaimEvidence[] = [],
): Array<Record<string, unknown>> => claims
  .map(normalizedAffiliateLegacyClaimForHash)
  .sort(canonicalJsonCompare);


const affiliateLegacyClaimHashKey = (claim: AffiliateLegacyClaimEvidence): string => (
  JSON.stringify(normalizedAffiliateLegacyClaimForHash(claim))
);
export type AffiliateLegacyTargetProjection = Readonly<{
  sourceTargetId: string;
  candidateId: string | null;
  targetType: string;
  targetId: string;
  sourceProfile: string | null;
  marketKey: string | null;
  sportId: string | null;
  publishedAt: Date | string | null;
  lastSuccessfulRefreshAt: Date | string | null;
  freshnessExpiresAt: Date | string | null;
  rejectedAt: Date | string | null;
  rejectionReason: string | null;
  metadata: unknown;
  evidenceHash: string | null;
  legacyStatus?: string | null;
  legacyEvidenceVerifiable?: boolean | null;
  status: 'PUBLISHED' | 'LAST_KNOWN_GOOD' | 'REJECTED';
  action: 'PRESERVE_PUBLIC_TARGET' | 'MARK_LAST_KNOWN_GOOD' | 'PRESERVE_REJECTED_TARGET';
  evidenceRefs: readonly string[];
}>;

export type AffiliateLegacyClaimAction = Readonly<{
  id: string;
  kind: AffiliateLegacyClaimEvidence['kind'];
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINAL';
  action: 'BLOCK_APPLY' | 'REVOKE_EXPIRED' | 'NO_ACTION';
  sourceId: string | null;
  supplySourceId: string | null;
  rawStatus?: string | null;
  subjectId?: string | null;
  role?: string | null;
  workerId?: string | null;
  claimGeneration?: number | null;
  leaseExpiresAt?: Date | string | null;
  tokenExpiresAt?: Date | string | null;
  endedAt?: Date | string | null;
  tokenInvalidatedAt?: Date | string | null;
  gatewayJobStatus?: string | null;
  gatewayJobActiveClaimId?: string | null;
  gatewayJobClaimGeneration?: number | null;
  evidenceRefs: readonly string[];
}>;

export type AffiliateLegacyRootPlan = Readonly<{
  sourceIds: readonly string[];
  existingRootId: string | null;
  identityKey: string | null;
  canonicalUrl: string | null;
  origin: string | null;
  pathKey: string | null;
  derivedStage: AffiliateSupplyLifecycleStage;
  action: 'CREATE_ROOT' | 'REUSE_ROOT' | 'CREATE_SUCCESSOR' | 'REVIEW_REQUIRED';
  predecessorId: string | null;
  recordIds: readonly string[];
  targetProjections: readonly AffiliateLegacyTargetProjection[];
  evidenceRefs: readonly string[];
}>;

export type AffiliateLegacyReconciliationCounts = Readonly<{
  sources: number;
  roots: number;
  rootsToCreate: number;
  rootsToReuse: number;
  successorsToCreate: number;
  lineageRecords: number;
  linkedRecords: number;
  unresolvedRecords: number;
  targets: number;
  preservedPublicTargets: number;
  lastKnownGoodTargets: number;
  rejectedTargets: number;
  claims: number;
  activeClaims: number;
  expiredClaims: number;
  terminalClaims: number;
  claimsToRevoke: number;
  blockingFindings: number;
  warningFindings: number;
  recordsByKind: Readonly<Record<string, number>>;
}>;

export type AffiliateLegacyReconciliationReport = Readonly<{
  schemaVersion: 1;
  evaluatedAt: string;
  isApplySafe: boolean;
  legacySnapshotHash: string;
  supplyContractVersion: number;
  supplyContractHash: string;
  inputHash: string;
  outputHash: string;
  reportHash: string;
  counts: AffiliateLegacyReconciliationCounts;
  roots: readonly AffiliateLegacyRootPlan[];
  claimActions: readonly AffiliateLegacyClaimAction[];
  blockingFindings: readonly AffiliateCutoverFinding[];
  warnings: readonly AffiliateCutoverFinding[];
  resolutions: readonly AffiliateCutoverFinding[];
}>;

const finding = (
  code: string,
  severity: AffiliateCutoverFinding['severity'],
  detail: string,
  recordIds: readonly string[],
  resolution: string,
): AffiliateCutoverFinding => ({
  code,
  severity,
  detail,
  recordIds: sortedUnique(recordIds),
  resolution,
});
const findingSortKey = (item: AffiliateCutoverFinding): string => JSON.stringify({
  code: item.code,
  severity: item.severity,
  detail: item.detail,
  recordIds: sortedUnique(item.recordIds),
  resolution: item.resolution,
});

const sortedFindings = (
  findings: readonly AffiliateCutoverFinding[],
): AffiliateCutoverFinding[] => [...findings].sort((left, right) => (
  canonicalCompare(findingSortKey(left), findingSortKey(right))
));


const normalizedTargetType = (value: unknown): string => {
  const targetType = upper(value);
  if (targetType === 'RENTAL') return 'FACILITY';
  if (targetType === 'CLUB') return 'ORGANIZATION';
  return targetType;
};

const identityFor = (source: AffiliateLegacySourceEvidence): ReturnType<typeof normalizeAffiliateSupplyIdentity> | null => {
  const requestedUrl = stringValue(source.requestedUrl);
  if (!requestedUrl) return null;
  try {
    return normalizeAffiliateSupplyIdentity({
      requestedUrl,
      resolvedCanonicalUrl: stringValue(source.resolvedCanonicalUrl) ?? requestedUrl,
      isRedirectVerified: source.isRedirectVerified === true,
      operatorDomain: source.operatorDomain,
    });
  } catch {
    return null;
  }
};

const claimStatusFor = (
  claim: AffiliateLegacyClaimEvidence,
  now: Date,
): AffiliateLegacyClaimAction['status'] => {
  const status = upper(claim.status);
  if (status === 'REVOKED') return 'TERMINAL';
  if (!ACTIVE_CLAIM_STATUSES.has(status)) {
    return EXPIRED_CLAIM_STATUSES.has(status) ? 'EXPIRED' : 'TERMINAL';
  }
  const leaseExpiresAt = dateFrom(claim.leaseExpiresAt);
  const tokenExpiresAt = dateFrom(claim.tokenExpiresAt);
  if (
    (leaseExpiresAt && leaseExpiresAt.getTime() <= now.getTime())
    || (tokenExpiresAt && tokenExpiresAt.getTime() <= now.getTime())
  ) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
};

const affiliateLegacyLineageRecordKey = (record: AffiliateLegacyLineageRecord): string => (
  `${record.kind}:${record.id}:${record.associationKey ?? ''}:${record.sourceId ?? ''}:${record.supplySourceId ?? ''}`
);
const affiliateLegacySourceKey = (source: AffiliateLegacySourceEvidence): string => (
  JSON.stringify({
    id: source.id,
    requestedUrl: stringValue(source.requestedUrl),
    resolvedCanonicalUrl: stringValue(source.resolvedCanonicalUrl),
    isRedirectVerified: source.isRedirectVerified === true,
    operatorDomain: stringValue(source.operatorDomain),
    targetKind: upper(source.targetKind),
    existingSupplySourceId: stringValue(source.existingSupplySourceId),
    predecessorSupplySourceId: stringValue(source.predecessorSupplySourceId),
    intakeId: stringValue(source.intakeId),
    liveSourceId: stringValue(source.liveSourceId),
    evidenceRefs: sortedUnique(source.evidenceRefs ?? []),
  })
);

const inputPreimageFor = (input: AffiliateLegacyReconciliationInput): unknown => ({
  schemaVersion: 1,
  legacySnapshotHash: stringValue(input.legacySnapshotHash) ?? '',
  supplyContractVersion: typeof input.supplyContractVersion === 'number'
    ? input.supplyContractVersion
    : 0,
  supplyContractHash: stringValue(input.supplyContractHash) ?? '',
  sources: [...input.sources]
    .sort((a, b) => canonicalCompare(affiliateLegacySourceKey(a), affiliateLegacySourceKey(b)))
    .map((source) => ({
      ...source,
      requestedUrl: stringValue(source.requestedUrl),
      resolvedCanonicalUrl: stringValue(source.resolvedCanonicalUrl),
      evidenceRefs: sortedUnique(source.evidenceRefs ?? []),
    })),
  roots: [...input.roots].sort((a, b) => canonicalCompare(a.id, b.id)),
  records: [...input.records].sort((a, b) => canonicalCompare(affiliateLegacyLineageRecordKey(a), affiliateLegacyLineageRecordKey(b))),
  targets: [...input.targets].sort((a, b) => canonicalCompare(a.id, b.id)).map((target) => ({
    ...target,
    status: upper(target.status),
    evidenceRefs: sortedUnique(target.evidenceRefs ?? []),
  })),
  claims: [...input.claims]
    .sort((a, b) => canonicalCompare(`${a.kind}:${a.id}`, `${b.kind}:${b.id}`))
    .map((claim) => ({
      ...claim,
      status: upper(claim.status),
      leaseExpiresAt: isoDate(claim.leaseExpiresAt),
      tokenExpiresAt: isoDate(claim.tokenExpiresAt),
      endedAt: isoDate(claim.endedAt),
      tokenInvalidatedAt: isoDate(claim.tokenInvalidatedAt),
    })),
  derivedStages: Object.fromEntries(
    Object.entries(input.derivedStages ?? {}).sort(([left], [right]) => canonicalCompare(left, right)),
  ),
  preflightFindings: [...(input.preflightFindings ?? [])]
    .map((item) => ({
      ...item,
      recordIds: sortedUnique(item.recordIds),
    }))
    .sort((a, b) => canonicalCompare(findingSortKey(a), findingSortKey(b))),
});
type AffiliateSupplyIdentity = ReturnType<typeof normalizeAffiliateSupplyIdentity>;

type ReconciliationFindings = {
  blockingFindings: AffiliateCutoverFinding[];
  warnings: AffiliateCutoverFinding[];
};

type ReconciliationSourceMaps = {
  sourceIdentity: Map<string, AffiliateSupplyIdentity>;
  sourceRoot: Map<string, AffiliateLegacyRootEvidence | null>;
  sourcePlanAction: Map<string, AffiliateLegacyRootPlan['action']>;
  sourceDerivedStage: Map<string, AffiliateSupplyLifecycleStage>;
  sourceIdsByIdentity: Map<string, string[]>;
};

type ReconciliationRecordMaps = {
  recordIdsBySource: Map<string, string[]>;
  recordRootByKey: Map<string, AffiliateLegacyRootEvidence | null>;
  recordsByKind: Record<string, number>;
};

const sortedReconciliationCollections = (
  input: AffiliateLegacyReconciliationInput,
) => ({
  sources: [...input.sources].sort((a, b) => canonicalCompare(affiliateLegacySourceKey(a), affiliateLegacySourceKey(b))),
  roots: [...input.roots].sort((a, b) => canonicalCompare(a.id, b.id)),
  records: [...input.records].sort((a, b) => canonicalCompare(affiliateLegacyLineageRecordKey(a), affiliateLegacyLineageRecordKey(b))),
  targets: [...input.targets].sort((a, b) => canonicalCompare(a.id, b.id)),
  claims: [...input.claims].sort((a, b) => canonicalCompare(`${a.kind}:${a.id}`, `${b.kind}:${b.id}`)),
});


const initialReconciliationFindings = (
  input: AffiliateLegacyReconciliationInput,
): ReconciliationFindings => {
  const normalized = sortedFindings((input.preflightFindings ?? []).map((item) => finding(
    item.code,
    item.severity,
    item.detail,
    item.recordIds,
    item.resolution,
  )));
  return {
    blockingFindings: normalized.filter((item) => item.severity === 'BLOCKING'),
    warnings: normalized.filter((item) => item.severity === 'WARNING'),
  };
};

const rootMatchesIdentity = (
  root: AffiliateLegacyRootEvidence,
  identity: AffiliateSupplyIdentity,
): boolean => {
  const rootIdentityKey = stringValue(root.identityKey);
  const identityKey = stringValue(identity.identityKey);
  if (rootIdentityKey && identityKey) return rootIdentityKey === identityKey;
  return root.origin === identity.origin && root.pathKey === identity.pathKey;
};

const requestedDerivedStage = (
  input: AffiliateLegacyReconciliationInput,
  sourceId: string,
  identityKey: string | null,
  root: AffiliateLegacyRootEvidence | null,
): AffiliateSupplyLifecycleStage => {
  const requested = input.derivedStages?.[sourceId] ?? (
    identityKey ? input.derivedStages?.[identityKey] : undefined
  );
  if (requested && AFFILIATE_SUPPLY_LIFECYCLE_STAGES.includes(requested)) return requested;
  if (root?.derivedStage && AFFILIATE_SUPPLY_LIFECYCLE_STAGES.includes(
    root.derivedStage as AffiliateSupplyLifecycleStage,
  )) {
    return root.derivedStage as AffiliateSupplyLifecycleStage;
  }
  return 'PRE_MAPPED';
};

const duplicateRootFindings = (
  roots: readonly AffiliateLegacyRootEvidence[],
): AffiliateCutoverFinding[] => {
  const rootIdsByIdentity = new Map<string, string[]>();
  for (const root of roots) {
    const key = root.identityKey || root.pathKey;
    const ids = rootIdsByIdentity.get(key) ?? [];
    ids.push(root.id);
    rootIdsByIdentity.set(key, ids);
  }
  return Array.from(rootIdsByIdentity.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([identityKey, ids]) => finding(
      'DUPLICATE_SUPPLY_ROOT',
      'BLOCKING',
      `Multiple Supply Source roots share identity ${identityKey}.`,
      ids,
      'Choose one exact source identity and link the other root as an explicit predecessor or successor before apply.',
    ));
};

const predecessorRelationshipFinding = (
  root: AffiliateLegacyRootEvidence,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): AffiliateCutoverFinding | null => {
  const predecessorId = stringValue(root.predecessorId);
  const predecessor = predecessorId ? rootById.get(predecessorId) : undefined;
  if (predecessorId && !predecessor) {
    return finding(
      'PREDECESSOR_ROOT_MISSING',
      'BLOCKING',
      `Supply Source root ${root.id} names missing predecessor root ${predecessorId}.`,
      [root.id, predecessorId],
      'Restore the predecessor root or provide a reviewed identity record.',
    );
  }
  if (!predecessor || stringValue(predecessor.successorId) === root.id) return null;
  return finding(
    'SUCCESSOR_PREDECESSOR_MISMATCH',
    'BLOCKING',
    `Supply Source root ${root.id} is not the linked successor of predecessor ${predecessor.id}.`,
    [root.id, predecessor.id, ...(
      stringValue(predecessor.successorId) ? [stringValue(predecessor.successorId) as string] : []
    )],
    'Repair the predecessor and successor links before apply.',
  );
};

const successorRelationshipFinding = (
  root: AffiliateLegacyRootEvidence,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): AffiliateCutoverFinding | null => {
  const successorId = stringValue(root.successorId);
  const successor = successorId ? rootById.get(successorId) : undefined;
  if (successorId && !successor) {
    return finding(
      'SUCCESSOR_LINK_MISSING',
      'BLOCKING',
      `Supply Source root ${root.id} names missing successor root ${successorId}.`,
      [root.id, successorId],
      'Restore the successor root or remove the stale link with an operator decision.',
    );
  }
  if (!successor || stringValue(successor.predecessorId) === root.id) return null;
  return finding(
    'SUCCESSOR_PREDECESSOR_MISMATCH',
    'BLOCKING',
    `Supply Source root ${root.id} does not match successor ${successor.id}'s predecessor link.`,
    [root.id, successor.id, ...(
      stringValue(successor.predecessorId) ? [stringValue(successor.predecessorId) as string] : []
    )],
    'Repair the predecessor and successor links before apply.',
  );
};

const rootRelationshipFindingsFor = (
  root: AffiliateLegacyRootEvidence,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): AffiliateCutoverFinding[] => [
  predecessorRelationshipFinding(root, rootById),
  successorRelationshipFinding(root, rootById),
].filter((item): item is AffiliateCutoverFinding => item !== null);

const rootRelationshipFindings = (
  roots: readonly AffiliateLegacyRootEvidence[],
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): AffiliateCutoverFinding[] => roots.flatMap((root) => (
  rootRelationshipFindingsFor(root, rootById)
));
const sourceIdentityFindings = (
  source: AffiliateLegacySourceEvidence,
  identity: AffiliateSupplyIdentity,
  explicitId: string | null,
  explicitRoot: AffiliateLegacyRootEvidence | undefined,
  matchingRoots: readonly AffiliateLegacyRootEvidence[],
  roots: readonly AffiliateLegacyRootEvidence[],
): AffiliateCutoverFinding[] => {
  const findings: AffiliateCutoverFinding[] = [];
  if (matchingRoots.length > 1) {
    findings.push(finding(
      'DUPLICATE_SUPPLY_ROOT',
      'BLOCKING',
      `Source ${source.id} resolves to more than one Supply Source root.`,
      matchingRoots.map((root) => root.id).concat(source.id),
      'Resolve the exact source identity before apply.',
    ));
  }
  if (explicitId && !explicitRoot) {
    findings.push(finding(
      'SUPPLY_SOURCE_LINK_MISSING',
      'BLOCKING',
      `Source ${source.id} points to missing Supply Source ${explicitId}.`,
      [source.id, explicitId],
      'Restore the referenced root or remove the stale link with an operator decision.',
    ));
  }
  const conflicts = !explicitRoot
    ? roots.filter((root) => (
      root.pathKey === identity.pathKey
      && Boolean(stringValue(root.identityKey))
      && Boolean(stringValue(identity.identityKey))
      && root.identityKey !== identity.identityKey
    ))
    : [];
  if (conflicts.length) {
    findings.push(finding(
      'CANONICAL_AMBIGUITY',
      'BLOCKING',
      `Source ${source.id} shares a public path with a different Supply Source identity.`,
      [source.id, ...conflicts.map((root) => root.id)],
      'Link the reviewed predecessor or successor, or provide exact identity evidence before apply.',
    ));
  }
  return findings;
};

const sourceIdentityResolution = (
  source: AffiliateLegacySourceEvidence,
  roots: readonly AffiliateLegacyRootEvidence[],
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): {
  identity: AffiliateSupplyIdentity | null;
  root: AffiliateLegacyRootEvidence | null;
  explicitRoot: AffiliateLegacyRootEvidence | undefined;
  action: AffiliateLegacyRootPlan['action'];
  findings: AffiliateCutoverFinding[];
} => {
  const identity = identityFor(source);
  if (!identity) {
    return {
      identity: null,
      root: null,
      explicitRoot: undefined,
      action: 'REVIEW_REQUIRED',
      findings: [finding(
        'IDENTITY_UNVERIFIABLE',
        'BLOCKING',
        `Source ${source.id} has no valid evidence-backed public URL.`,
        [source.id],
        'Provide a verified canonical URL or an explicit predecessor/successor identity link.',
      )],
    };
  }
  const explicitId = stringValue(source.existingSupplySourceId);
  const explicitRoot = explicitId ? rootById.get(explicitId) : undefined;
  const matches = roots.filter((root) => rootMatchesIdentity(root, identity));
  const matchingRoots = explicitRoot && !matches.some((root) => root.id === explicitRoot.id)
    ? [...matches, explicitRoot]
    : matches;
  const root = explicitRoot ?? matchingRoots[0] ?? null;
  const conflicts = !explicitRoot
    ? roots.filter((root) => (
      root.pathKey === identity.pathKey
      && Boolean(stringValue(root.identityKey))
      && Boolean(stringValue(identity.identityKey))
      && root.identityKey !== identity.identityKey
    ))
    : [];
  return {
    identity,
    root,
    explicitRoot,
    action: conflicts.length ? 'REVIEW_REQUIRED' : root ? 'REUSE_ROOT' : 'CREATE_ROOT',
    findings: sourceIdentityFindings(
      source,
      identity,
      explicitId,
      explicitRoot,
      matchingRoots,
      roots,
    ),
  };
};

const explicitSourceAction = (
  source: AffiliateLegacySourceEvidence,
  identity: AffiliateSupplyIdentity,
  explicitRoot: AffiliateLegacyRootEvidence | undefined,
  action: AffiliateLegacyRootPlan['action'],
): { action: AffiliateLegacyRootPlan['action']; findings: AffiliateCutoverFinding[] } => {
  if (!explicitRoot || rootMatchesIdentity(explicitRoot, identity)) return { action, findings: [] };
  if (explicitRoot.origin !== identity.origin && source.predecessorSupplySourceId === explicitRoot.id) {
    return { action: 'CREATE_SUCCESSOR', findings: [] };
  }
  if (explicitRoot.origin !== identity.origin) {
    return {
      action: 'REVIEW_REQUIRED',
      findings: [finding(
        'CROSS_ORIGIN_SUPPLY_SOURCE_LINK',
        'BLOCKING',
        `Source ${source.id} points to a Supply Source on a different origin without an explicit predecessor link.`,
        [source.id, explicitRoot.id],
        'Record the existing root as the explicit predecessor and create a reviewed successor.',
      )],
    };
  }
  if (source.isRedirectVerified === true) return { action, findings: [] };
  return {
    action: 'REVIEW_REQUIRED',
    findings: [finding(
      'CANONICAL_AMBIGUITY',
      'BLOCKING',
      `Source ${source.id} changed its canonical path without verified redirect evidence.`,
      [source.id, explicitRoot.id],
      'Verify the same-origin redirect or create a reviewed successor identity.',
    )],
  };
};

const predecessorSourceAction = (
  source: AffiliateLegacySourceEvidence,
  identity: AffiliateSupplyIdentity,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  action: AffiliateLegacyRootPlan['action'],
): { action: AffiliateLegacyRootPlan['action']; findings: AffiliateCutoverFinding[] } => {
  const predecessorId = stringValue(source.predecessorSupplySourceId);
  if (!predecessorId) return { action, findings: [] };
  const predecessor = rootById.get(predecessorId);
  if (!predecessor) {
    return {
      action,
      findings: [finding(
        'PREDECESSOR_ROOT_MISSING',
        'BLOCKING',
        `Source ${source.id} names a missing predecessor root.`,
        [source.id, predecessorId],
        'Restore the predecessor root or provide a reviewed identity record.',
      )],
    };
  }
  if (predecessor.origin !== identity.origin) return { action: 'CREATE_SUCCESSOR', findings: [] };
  if (predecessor.canonicalUrl === identity.canonicalUrl || source.isRedirectVerified === true) {
    return { action, findings: [] };
  }
  return {
    action: 'REVIEW_REQUIRED',
    findings: [finding(
      'CANONICAL_AMBIGUITY',
      'BLOCKING',
      `Source ${source.id} changed its canonical path without verified redirect evidence.`,
      [source.id, predecessor.id],
      'Verify the same-origin redirect or create a reviewed successor identity.',
    )],
  };
};

const validateReusedRoot = (
  source: AffiliateLegacySourceEvidence,
  root: AffiliateLegacyRootEvidence | null,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  action: AffiliateLegacyRootPlan['action'],
): { action: AffiliateLegacyRootPlan['action']; findings: AffiliateCutoverFinding[] } => {
  const successorId = stringValue(root?.successorId);
  if (action !== 'REUSE_ROOT' || !root || !successorId) return { action, findings: [] };
  const successor = rootById.get(successorId);
  if (successor && stringValue(successor.predecessorId) === root.id) return { action, findings: [] };
  return {
    action: 'REVIEW_REQUIRED',
    findings: [finding(
      successor ? 'SUCCESSOR_ALREADY_LINKED' : 'SUCCESSOR_LINK_MISSING',
      'BLOCKING',
      successor
        ? `Source ${source.id} resolves to root ${root.id}, which already has successor ${successorId}.`
        : `Source ${source.id} resolves to root ${root.id}, which names missing successor ${successorId}.`,
      [source.id, root.id, successorId],
      'Resolve the existing successor relationship before apply.',
    )],
  };
};

const isExpectedSuccessor = (
  successor: AffiliateLegacyRootEvidence | undefined,
  identity: AffiliateSupplyIdentity,
  predecessor: AffiliateLegacyRootEvidence | undefined,
): boolean => Boolean(
  successor
  && successor.identityKey === identity.identityKey
  && stringValue(successor.predecessorId) === predecessor?.id
);

const successorConflictFinding = (
  source: AffiliateLegacySourceEvidence,
  predecessorId: string,
  predecessor: AffiliateLegacyRootEvidence | undefined,
  successorId: string,
  successor: AffiliateLegacyRootEvidence | undefined,
): AffiliateCutoverFinding => finding(
  successor ? 'SUCCESSOR_ALREADY_LINKED' : 'SUCCESSOR_LINK_MISSING',
  'BLOCKING',
  successor
    ? `Source ${source.id} names predecessor ${predecessor?.id ?? predecessorId}, which links to a different successor identity.`
    : `Source ${source.id} names predecessor ${predecessor?.id ?? predecessorId}, which links to missing successor ${successorId}.`,
  [source.id, predecessorId, successorId],
  'Resolve the existing successor relationship before apply.',
);

const validateCreatedSuccessor = (
  source: AffiliateLegacySourceEvidence,
  identity: AffiliateSupplyIdentity,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  action: AffiliateLegacyRootPlan['action'],
): { action: AffiliateLegacyRootPlan['action']; findings: AffiliateCutoverFinding[] } => {
  const predecessorId = stringValue(source.predecessorSupplySourceId);
  if (action !== 'CREATE_SUCCESSOR' || !predecessorId) return { action, findings: [] };
  const predecessor = rootById.get(predecessorId);
  const successorId = stringValue(predecessor?.successorId);
  if (!successorId) return { action, findings: [] };
  const successor = rootById.get(successorId);
  if (isExpectedSuccessor(successor, identity, predecessor)) return { action, findings: [] };
  return {
    action: 'REVIEW_REQUIRED',
    findings: [successorConflictFinding(source, predecessorId, predecessor, successorId, successor)],
  };
};

type ReconciliationSourceResolution = {
  identity: AffiliateSupplyIdentity | null;
  root: AffiliateLegacyRootEvidence | null;
  action: AffiliateLegacyRootPlan['action'];
  derivedStage: AffiliateSupplyLifecycleStage;
  findings: AffiliateCutoverFinding[];
};

const sourceResolution = (
  input: AffiliateLegacyReconciliationInput,
  source: AffiliateLegacySourceEvidence,
  roots: readonly AffiliateLegacyRootEvidence[],
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): ReconciliationSourceResolution => {
  const resolved = sourceIdentityResolution(source, roots, rootById);
  if (!resolved.identity) return {
    identity: null,
    root: null,
    action: resolved.action,
    derivedStage: 'PRE_MAPPED',
    findings: resolved.findings,
  };
  const explicit = explicitSourceAction(
    source,
    resolved.identity,
    resolved.explicitRoot,
    resolved.action,
  );
  const predecessor = predecessorSourceAction(
    source,
    resolved.identity,
    rootById,
    explicit.action,
  );
  const reused = validateReusedRoot(source, resolved.root, rootById, predecessor.action);
  const successor = validateCreatedSuccessor(source, resolved.identity, rootById, reused.action);
  return {
    identity: resolved.identity,
    root: resolved.root,
    action: successor.action,
    derivedStage: requestedDerivedStage(input, source.id, resolved.identity.identityKey, resolved.root),
    findings: [
      ...resolved.findings,
      ...explicit.findings,
      ...predecessor.findings,
      ...reused.findings,
      ...successor.findings,
    ],
  };
};
type ReconciliationSourceRow = Readonly<{
  source: AffiliateLegacySourceEvidence;
  identityKey: string | null;
  result: ReturnType<typeof sourceResolution>;
}>;

const uniqueSourceRowsById = (
  rows: readonly ReconciliationSourceRow[],
): ReconciliationSourceRow[] => {
  const unique = new Map<string, ReconciliationSourceRow>();
  for (const row of rows) {
    if (!unique.has(row.source.id)) unique.set(row.source.id, row);
  }
  return Array.from(unique.values());
};

const sourceIdentityKeyCompare = (
  left: string | null,
  right: string | null,
): number => {
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  return canonicalCompare(left, right);
};

const sourceIdentityConflictFindings = (
  conflictIdentityKeysById: ReadonlyMap<string, readonly (string | null)[]>,
): AffiliateCutoverFinding[] => Array.from(conflictIdentityKeysById.entries())
  .sort(([left], [right]) => canonicalCompare(left, right))
  .map(([sourceId, identityKeys]) => finding(
    'SOURCE_IDENTITY_CONFLICT',
    'BLOCKING',
    `Legacy source evidence for ${sourceId} resolves to multiple Supply Source identities: ${
      identityKeys.map((identityKey) => identityKey ?? '<unverifiable>').join(', ')
    }.`,
    [sourceId],
    'Resolve the conflicting source identity before reconciliation apply.',
  ));

const ambiguousSourceIdentityFindings = (
  sourceIdsByIdentity: ReadonlyMap<string, string[]>,
): AffiliateCutoverFinding[] => Array.from(sourceIdsByIdentity.entries())
  .map(([identityKey, ids]) => ({ identityKey, ids: sortedUnique(ids) }))
  .filter(({ ids }) => ids.length > 1)
  .map(({ identityKey, ids }) => finding(
    'AMBIGUOUS_SOURCE_IDENTITY',
    'BLOCKING',
    `Multiple legacy sources resolve to the same Supply Source identity ${identityKey}.`,
    ids,
    'Choose one exact source row and link the other as an explicit predecessor or successor before apply.',
  ));

const reconcileSources = (
  input: AffiliateLegacyReconciliationInput,
  sources: readonly AffiliateLegacySourceEvidence[],
  roots: readonly AffiliateLegacyRootEvidence[],
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  findings: ReconciliationFindings,
): ReconciliationSourceMaps => {
  const sourceRows = sources.map((source) => {
    const result = sourceResolution(input, source, roots, rootById);
    return {
      source,
      identityKey: result.identity?.identityKey ?? null,
      result,
    };
  });
  const identityKeysById = new Map<string, Set<string | null>>();
  for (const row of sourceRows) {
    const identityKeys = identityKeysById.get(row.source.id) ?? new Set<string | null>();
    identityKeys.add(row.identityKey);
    identityKeysById.set(row.source.id, identityKeys);
  }
  const conflictIdentityKeysById = new Map<string, readonly (string | null)[]>();
  for (const [sourceId, identityKeys] of Array.from(identityKeysById.entries())
    .sort(([left], [right]) => canonicalCompare(left, right))) {
    if (identityKeys.size > 1) {
      conflictIdentityKeysById.set(
        sourceId,
        Array.from(identityKeys).sort(sourceIdentityKeyCompare),
      );
    }
  }
  const maps: ReconciliationSourceMaps = {
    sourceIdentity: new Map(),
    sourceRoot: new Map(),
    sourcePlanAction: new Map(),
    sourceDerivedStage: new Map(),
    sourceIdsByIdentity: new Map(),
  };
  for (const { source, result } of uniqueSourceRowsById(sourceRows)) {
    findings.blockingFindings.push(...result.findings);
    if (!result.identity) {
      maps.sourceRoot.set(source.id, null);
      maps.sourcePlanAction.set(source.id, 'REVIEW_REQUIRED');
      continue;
    }
    maps.sourceIdentity.set(source.id, result.identity);
    maps.sourceRoot.set(source.id, result.root ?? {
      id: `planned:${result.identity.identityKey}`,
      identityKey: result.identity.identityKey,
      canonicalUrl: result.identity.canonicalUrl,
      origin: result.identity.origin,
      pathKey: result.identity.pathKey,
    });
    maps.sourcePlanAction.set(source.id, result.action);
    maps.sourceDerivedStage.set(source.id, result.derivedStage);
    const ids = maps.sourceIdsByIdentity.get(result.identity.identityKey) ?? [];
    ids.push(source.id);
    maps.sourceIdsByIdentity.set(result.identity.identityKey, ids);
  }
  findings.blockingFindings.push(...sourceIdentityConflictFindings(conflictIdentityKeysById));
  findings.blockingFindings.push(...ambiguousSourceIdentityFindings(maps.sourceIdsByIdentity));
  return maps;
};

const lineageRecordRoot = (
  record: AffiliateLegacyLineageRecord,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): { bySource: AffiliateLegacyRootEvidence | null; byRoot: AffiliateLegacyRootEvidence | null; root: AffiliateLegacyRootEvidence | null } => {
  const bySource = record.sourceId ? sourceRoot.get(record.sourceId) ?? null : null;
  const byRoot = record.supplySourceId ? rootById.get(record.supplySourceId) ?? null : null;
  return { bySource, byRoot, root: bySource ?? byRoot };
};

const missingLineageRootFinding = (
  record: AffiliateLegacyLineageRecord,
  root: AffiliateLegacyRootEvidence | null,
): AffiliateCutoverFinding | null => record.supplySourceId && !root
  ? finding(
      'MISSING_LINEAGE',
      'BLOCKING',
      `Record ${record.id} points to missing Supply Source ${record.supplySourceId}.`,
      [record.id, record.supplySourceId],
      'Restore the referenced root or remove the stale link with an operator decision.',
    )
  : null;

const missingLineageSourceFinding = (
  record: AffiliateLegacyLineageRecord,
  sourceIdentity: ReadonlyMap<string, AffiliateSupplyIdentity>,
): AffiliateCutoverFinding | null => record.sourceId && !sourceIdentity.has(record.sourceId)
  ? finding(
      'MISSING_LINEAGE',
      'BLOCKING',
      `Record ${record.id} references missing source ${record.sourceId}.`,
      [record.id, record.sourceId],
      'Link the record to a known source or record an explicit predecessor/successor identity.',
    )
  : null;

const conflictingLineageRootFinding = (
  record: AffiliateLegacyLineageRecord,
  roots: ReturnType<typeof lineageRecordRoot>,
): AffiliateCutoverFinding | null => roots.bySource && roots.byRoot && roots.bySource.id !== roots.byRoot.id
  ? finding(
      'LINEAGE_ROOT_MISMATCH',
      'BLOCKING',
      `Record ${record.id} points to two different Supply Source roots.`,
      [record.id, roots.bySource.id, roots.byRoot.id],
      'Resolve the conflicting root link before apply.',
    )
  : null;

const unresolvedLineageFinding = (
  record: AffiliateLegacyLineageRecord,
  root: AffiliateLegacyRootEvidence | null,
): AffiliateCutoverFinding | null => root
  ? null
  : finding(
      'MISSING_LINEAGE',
      'BLOCKING',
      `Record ${record.id} cannot resolve to a Supply Source root.`,
      [record.id],
      'Link the record to a source root or record an explicit predecessor/successor identity.',
    );

const lineageRecordFindings = (
  record: AffiliateLegacyLineageRecord,
  roots: ReturnType<typeof lineageRecordRoot>,
  sourceIdentity: ReadonlyMap<string, AffiliateSupplyIdentity>,
): AffiliateCutoverFinding[] => [
  missingLineageRootFinding(record, roots.byRoot),
  missingLineageSourceFinding(record, sourceIdentity),
  conflictingLineageRootFinding(record, roots),
  unresolvedLineageFinding(record, roots.root),
].filter((item): item is AffiliateCutoverFinding => item !== null);

const recordAssociationKey = (record: AffiliateLegacyLineageRecord): string => (
  stringValue(record.associationKey) ?? `${record.kind}:${record.id}`
);

const multipleRecordRootFindings = (
  rootsByAssociation: ReadonlyMap<string, Set<string>>,
): AffiliateCutoverFinding[] => Array.from(rootsByAssociation.entries())
  .filter(([, rootIds]) => rootIds.size > 1)
  .map(([association, rootIds]) => finding(
    'RECORD_IDENTITY_MULTIPLE_ROOTS',
    'BLOCKING',
    `Legacy record association ${association} resolves to multiple Supply Source roots.`,
    [association, ...rootIds],
    'Keep one persisted record association on one exact Supply Source root or resolve the cross-root association as evidence only.',
  ));

const reconcileLineageRecords = (
  records: readonly AffiliateLegacyLineageRecord[],
  sourceIdentity: ReadonlyMap<string, AffiliateSupplyIdentity>,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  findings: ReconciliationFindings,
): ReconciliationRecordMaps => {
  const maps: ReconciliationRecordMaps = {
    recordIdsBySource: new Map(),
    recordRootByKey: new Map(),
    recordsByKind: {},
  };
  const rootsByAssociation = new Map<string, Set<string>>();
  for (const record of records) {
    const recordKey = affiliateLegacyLineageRecordKey(record);
    maps.recordsByKind[record.kind] = (maps.recordsByKind[record.kind] ?? 0) + 1;
    const resolved = lineageRecordRoot(record, sourceRoot, rootById);
    findings.blockingFindings.push(...lineageRecordFindings(record, resolved, sourceIdentity));
    maps.recordRootByKey.set(recordKey, resolved.root);
    if (resolved.root) {
      const association = recordAssociationKey(record);
      const rootIds = rootsByAssociation.get(association) ?? new Set<string>();
      rootIds.add(resolved.root.id);
      rootsByAssociation.set(association, rootIds);
      const sourceId = record.sourceId ?? undefined;
      if (sourceId) {
        const ids = maps.recordIdsBySource.get(sourceId) ?? [];
        ids.push(record.id);
        maps.recordIdsBySource.set(sourceId, ids);
      }
    }
  }
  findings.blockingFindings.push(...multipleRecordRootFindings(rootsByAssociation));
  return maps;
};
const targetRootFor = (
  target: AffiliateLegacyTargetEvidence,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): {
  root: AffiliateLegacyRootEvidence | null;
  finding: AffiliateCutoverFinding | null;
} => {
  const sourceId = stringValue(target.sourceId);
  const supplySourceId = stringValue(target.supplySourceId);
  const sourceLinkedRoot = sourceId ? sourceRoot.get(sourceId) ?? null : null;
  const supplyLinkedRoot = supplySourceId ? rootById.get(supplySourceId) ?? null : null;
  if (sourceLinkedRoot && supplyLinkedRoot && sourceLinkedRoot.id !== supplyLinkedRoot.id) {
    return {
      root: null,
      finding: finding(
        'LINEAGE_ROOT_MISMATCH',
        'BLOCKING',
        `Public target ${target.id} points to two different Supply Source roots.`,
        [target.id, sourceLinkedRoot.id, supplyLinkedRoot.id],
        'Resolve the conflicting sourceId and supplySourceId links before apply.',
      ),
    };
  }
  return {
    root: sourceId ? sourceLinkedRoot : supplyLinkedRoot,
    finding: null,
  };
};

const targetValidationFinding = (
  target: AffiliateLegacyTargetEvidence,
  root: AffiliateLegacyRootEvidence | null,
  targetId: string | null,
  targetType: string,
  status: string,
): AffiliateCutoverFinding | null => {
  if (!root) {
    return finding(
      'MISSING_LINEAGE',
      'BLOCKING',
      `Public target ${target.id} cannot resolve to a Supply Source root.`,
      [target.id],
      'Link the target to its source root before apply.',
    );
  }
  if (!targetId) {
    return finding(
      'PUBLIC_TARGET_ID_MISSING',
      'BLOCKING',
      `Public target ${target.id} has no target ID.`,
      [target.id],
      'Identify the existing public record before apply.',
    );
  }
  if (!['OBSERVED', 'DISCOVERED', 'PUBLISHED', 'LAST_KNOWN_GOOD', 'REJECTED', 'EXPIRED'].includes(status)) {
    return finding(
      'PUBLIC_TARGET_STATUS_INVALID',
      'BLOCKING',
      `Public target ${target.id} has unsupported status ${target.status ?? 'empty'}.`,
      [target.id],
      'Preserve only a known legacy target status: OBSERVED, DISCOVERED, PUBLISHED, LAST_KNOWN_GOOD, REJECTED, or EXPIRED.',
    );
  }
  if (!['EVENT', 'TEAM', 'FACILITY', 'ORGANIZATION'].includes(targetType)) {
    return finding(
      'PUBLIC_TARGET_KIND_INVALID',
      'BLOCKING',
      `Public target ${target.id} has unsupported kind ${target.targetType}.`,
      [target.id],
      'Classify the target as EVENT, RENTAL, TEAM, or CLUB before apply.',
    );
  }
  return null;
};
const projectionStatusFor = (
  status: string,
  isVerifiable: boolean,
): { status: AffiliateLegacyTargetProjection['status']; action: AffiliateLegacyTargetProjection['action'] } => {
  if (status === 'REJECTED') {
    return { status: 'REJECTED', action: 'PRESERVE_REJECTED_TARGET' };
  }
  if (status === 'PUBLISHED' && isVerifiable) {
    return { status: 'PUBLISHED', action: 'PRESERVE_PUBLIC_TARGET' };
  }
  return { status: 'LAST_KNOWN_GOOD', action: 'MARK_LAST_KNOWN_GOOD' };
};


const targetProjectionFor = (
  target: AffiliateLegacyTargetEvidence,
  root: AffiliateLegacyRootEvidence | null,
): { projection: AffiliateLegacyTargetProjection | null; findings: AffiliateCutoverFinding[] } => {
  const targetId = stringValue(target.targetId);
  const targetType = normalizedTargetType(target.targetType);
  const status = upper(target.status);
  const validationFinding = targetValidationFinding(target, root, targetId, targetType, status);
  if (validationFinding) return { projection: null, findings: [validationFinding] };
  const isVerifiable = target.isEvidenceVerifiable === true;
  const projectionStatus = projectionStatusFor(status, isVerifiable);
  return {
    projection: {
      sourceTargetId: target.id,
      candidateId: stringValue(target.candidateId),
      targetType,
      targetId: targetId as string,
      sourceProfile: (stringValue(target.sourceProfile) ?? upper(target.targetType)) || null,
      marketKey: stringValue(target.marketKey),
      sportId: stringValue(target.sportId),
      publishedAt: target.publishedAt ?? null,
      lastSuccessfulRefreshAt: target.lastSuccessfulRefreshAt ?? null,
      freshnessExpiresAt: target.freshnessExpiresAt ?? null,
      rejectedAt: target.rejectedAt ?? null,
      rejectionReason: stringValue(target.rejectionReason),
      metadata: target.metadata ?? null,
      evidenceHash: stringValue(target.evidenceHash),
      legacyStatus: status,
      legacyEvidenceVerifiable: target.isEvidenceVerifiable === true,
      status: projectionStatus.status,
      action: projectionStatus.action,
      evidenceRefs: sortedUnique([
        ...(target.evidenceRefs ?? []),
        `legacy-target:${target.id}`,
        `public-target:${targetType}:${targetId}`,
      ]),
    },
    findings: [],
  };
};
const projectionRank = (status: AffiliateLegacyTargetProjection['status']): number => (
  status === 'REJECTED' ? 3 : status === 'PUBLISHED' ? 2 : 1
);

const isUnverifiableLastKnownGood = (
  projection: AffiliateLegacyTargetProjection,
): boolean => projection.status === 'LAST_KNOWN_GOOD' && projection.action === 'MARK_LAST_KNOWN_GOOD';

const preferredTargetProjection = (
  existing: AffiliateLegacyTargetProjection,
  projection: AffiliateLegacyTargetProjection,
): AffiliateLegacyTargetProjection => {
  const candidates = [existing, projection];
  const unverifiableLastKnownGood = candidates.find(isUnverifiableLastKnownGood);
  const hasPublished = candidates.some((candidate) => candidate.status === 'PUBLISHED');
  if (unverifiableLastKnownGood && hasPublished) return unverifiableLastKnownGood;
  return projectionRank(projection.status) > projectionRank(existing.status)
    || (
      projectionRank(projection.status) === projectionRank(existing.status)
      && canonicalCompare(projection.sourceTargetId, existing.sourceTargetId) < 0
    )
    ? projection
    : existing;
};

const firstTargetProjectionValue = <T>(
  preferred: T | null,
  existing: T | null,
  projection: T | null,
): T | null => preferred ?? existing ?? projection;
const firstTargetProjectionCandidate = (
  existing: AffiliateLegacyTargetProjection,
  projection: AffiliateLegacyTargetProjection,
): string | null => [existing.candidateId, projection.candidateId]
  .filter((candidateId): candidateId is string => candidateId !== null)
  .sort()[0] ?? null;

const mergeTargetProjectionValues = (
  existing: AffiliateLegacyTargetProjection,
  projection: AffiliateLegacyTargetProjection,
  preferred: AffiliateLegacyTargetProjection,
): AffiliateLegacyTargetProjection => ({
  ...preferred,
  candidateId: firstTargetProjectionCandidate(existing, projection),
  sourceProfile: firstTargetProjectionValue(preferred.sourceProfile, existing.sourceProfile, projection.sourceProfile),
  marketKey: firstTargetProjectionValue(preferred.marketKey, existing.marketKey, projection.marketKey),
  sportId: firstTargetProjectionValue(preferred.sportId, existing.sportId, projection.sportId),
  publishedAt: firstTargetProjectionValue(preferred.publishedAt, existing.publishedAt, projection.publishedAt),
  lastSuccessfulRefreshAt: firstTargetProjectionValue(
    preferred.lastSuccessfulRefreshAt,
    existing.lastSuccessfulRefreshAt,
    projection.lastSuccessfulRefreshAt,
  ),
  freshnessExpiresAt: firstTargetProjectionValue(
    preferred.freshnessExpiresAt,
    existing.freshnessExpiresAt,
    projection.freshnessExpiresAt,
  ),
  rejectedAt: firstTargetProjectionValue(preferred.rejectedAt, existing.rejectedAt, projection.rejectedAt),
  rejectionReason: firstTargetProjectionValue(
    preferred.rejectionReason,
    existing.rejectionReason,
    projection.rejectionReason,
  ),
  metadata: firstTargetProjectionValue(preferred.metadata, existing.metadata, projection.metadata),
  evidenceHash: firstTargetProjectionValue(preferred.evidenceHash, existing.evidenceHash, projection.evidenceHash),
  evidenceRefs: sortedUnique([
    ...existing.evidenceRefs,
    ...projection.evidenceRefs,
  ]),
});

const mergeTargetProjection = (
  targetList: AffiliateLegacyTargetProjection[],
  projection: AffiliateLegacyTargetProjection,
): void => {
  const duplicateKey = `${projection.targetType}:${projection.targetId}`;
  const existingIndex = targetList.findIndex((candidate) => (
    `${candidate.targetType}:${candidate.targetId}` === duplicateKey
  ));
  if (existingIndex < 0) {
    targetList.push(projection);
    return;
  }
  const existing = targetList[existingIndex];
  const preferred = preferredTargetProjection(existing, projection);
  targetList[existingIndex] = mergeTargetProjectionValues(
    existing,
    projection,
    preferred,
  );
};

const reconcileTargets = (
  targets: readonly AffiliateLegacyTargetEvidence[],
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  findings: ReconciliationFindings,
): Map<string, AffiliateLegacyTargetProjection[]> => {
  const targetsByLineage = new Map<string, AffiliateLegacyTargetProjection[]>();
  for (const target of targets) {
    const rootResolution = targetRootFor(target, sourceRoot, rootById);
    if (rootResolution.finding) {
      findings.blockingFindings.push(rootResolution.finding);
      continue;
    }
    const root = rootResolution.root;
    const result = targetProjectionFor(target, root);
    findings.blockingFindings.push(...result.findings);
    if (!result.projection || !root) continue;
    const targetList = targetsByLineage.get(`root:${root.id}`) ?? [];
    mergeTargetProjection(targetList, result.projection);
    targetsByLineage.set(`root:${root.id}`, targetList);
  }
  return targetsByLineage;
};

const claimRootFor = (
  claim: AffiliateLegacyClaimEvidence,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): AffiliateLegacyRootEvidence | null => claim.sourceId
  ? sourceRoot.get(claim.sourceId) ?? null
  : claim.supplySourceId
    ? rootById.get(claim.supplySourceId) ?? null
    : null;

const claimActionFindings = (
  claim: AffiliateLegacyClaimEvidence,
  status: AffiliateLegacyClaimAction['status'],
  lease: Date | null,
  token: Date | null,
  tokenInvalidatedAt: Date | null,
  now: Date,
  computedExpired: boolean,
): AffiliateCutoverFinding[] => {
  if (status !== 'ACTIVE') {
    if (computedExpired) return [];
    const hasInvalidatedToken = Boolean(tokenInvalidatedAt);
    const hasLiveLease = Boolean(lease && lease.getTime() > now.getTime());
    const hasLiveToken = Boolean(token && token.getTime() > now.getTime());
    if (!hasInvalidatedToken && (hasLiveLease || hasLiveToken)) {
      return [finding(
        'TERMINAL_CLAIM_WITH_LIVE_EVIDENCE',
        'BLOCKING',
        `Non-active legacy claim ${claim.id} still has a live lease or token.`,
        [claim.id],
        'Revoke the claim and invalidate any remaining lease or token before apply.',
      )];
    }
    return [];
  }
  if (!lease && !token) {
    return [finding(
      'CLAIM_WITHOUT_EXPIRY',
      'BLOCKING',
      `Active legacy claim ${claim.id} has no lease or token expiry.`,
      [claim.id],
      'Revoke the claim manually and record the authority resolution before apply.',
    )];
  }
  return [finding(
    'ACTIVE_LEGACY_CLAIM',
    'BLOCKING',
    `Active legacy claim ${claim.id} still has write authority.`,
    [claim.id],
    'Stop the old fleet and revoke or resolve the live claim before apply.',
  )];
};
const claimAuthorityKey = (
  claim: AffiliateLegacyClaimEvidence,
  root: AffiliateLegacyRootEvidence | null,
): string => {

  const role = upper(stringValue(claim.role) ?? claim.kind);
  const authorityId = stringValue(claim.subjectId)
    ?? stringValue(root?.id)
    ?? stringValue(claim.supplySourceId)
    ?? stringValue(claim.sourceId)
    ?? stringValue(claim.id)
    ?? '';
  return `${role}:${upper(authorityId)}`;
};
type AffiliateLegacyClaimRawState = Pick<
  AffiliateLegacyClaimAction,
  | 'rawStatus'
  | 'subjectId'
  | 'role'
  | 'workerId'
  | 'claimGeneration'
  | 'leaseExpiresAt'
  | 'tokenExpiresAt'
  | 'endedAt'
  | 'tokenInvalidatedAt'
  | 'gatewayJobStatus'
  | 'gatewayJobActiveClaimId'
  | 'gatewayJobClaimGeneration'
>;

const claimGenerationForReplay = (value: unknown): number | null => (
  typeof value === 'number' && Number.isInteger(value) ? value : null
);

const claimRawStateForAction = (
  claim: AffiliateLegacyClaimEvidence,
): AffiliateLegacyClaimRawState => ({
  rawStatus: upper(claim.status),
  subjectId: stringValue(claim.subjectId),
  role: stringValue(claim.role) ? upper(claim.role) : null,
  workerId: stringValue(claim.workerId),
  claimGeneration: claimGenerationForReplay(claim.claimGeneration),
  leaseExpiresAt: isoDate(claim.leaseExpiresAt),
  tokenExpiresAt: isoDate(claim.tokenExpiresAt),
  endedAt: isoDate(claim.endedAt),
  tokenInvalidatedAt: isoDate(claim.tokenInvalidatedAt),
  gatewayJobStatus: stringValue(claim.gatewayJobStatus)
    ? upper(claim.gatewayJobStatus)
    : null,
  gatewayJobActiveClaimId: stringValue(claim.gatewayJobActiveClaimId),
  gatewayJobClaimGeneration: claimGenerationForReplay(claim.gatewayJobClaimGeneration),
});
const claimActionType = (
  status: AffiliateLegacyClaimAction['status'],
): AffiliateLegacyClaimAction['action'] => status === 'ACTIVE'
  ? 'BLOCK_APPLY'
  : status === 'EXPIRED'
    ? 'REVOKE_EXPIRED'
    : 'NO_ACTION';
const claimEvidenceRefs = (
  claim: AffiliateLegacyClaimEvidence,
  lease: Date | null,
  token: Date | null,
  endedAt: Date | null,
  tokenInvalidatedAt: Date | null,
): string[] => sortedUnique([
  `legacy-claim:${claim.kind}:${claim.id}`,
  ...(claim.sourceId ? [`source:${claim.sourceId}`] : []),
  ...(claim.supplySourceId ? [`supply-source:${claim.supplySourceId}`] : []),
  ...(lease ? [`lease-expires:${lease.toISOString()}`] : []),
  ...(token ? [`token-expires:${token.toISOString()}`] : []),
  ...(endedAt ? [`ended-at:${endedAt.toISOString()}`] : []),
  ...(tokenInvalidatedAt ? [`token-invalidated:${tokenInvalidatedAt.toISOString()}`] : []),
]);

const claimActionFor = (
  claim: AffiliateLegacyClaimEvidence,
  now: Date,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): { action: AffiliateLegacyClaimAction; authorityKey: string; findings: AffiliateCutoverFinding[] } => {
  const status = claimStatusFor(claim, now);
  const computedExpired = status === 'EXPIRED'
    && ACTIVE_CLAIM_STATUSES.has(upper(claim.status));
  const root = claimRootFor(claim, sourceRoot, rootById);
  const lease = dateFrom(claim.leaseExpiresAt);
  const token = dateFrom(claim.tokenExpiresAt);
  const endedAt = dateFrom(claim.endedAt);
  const tokenInvalidatedAt = dateFrom(claim.tokenInvalidatedAt);
  return {
    action: {
      id: claim.id,
      kind: claim.kind,
      status,
      action: claimActionType(status),
      sourceId: stringValue(claim.sourceId),
      supplySourceId: stringValue(claim.supplySourceId),
      ...claimRawStateForAction(claim),
      evidenceRefs: claimEvidenceRefs(claim, lease, token, endedAt, tokenInvalidatedAt),
    },
    authorityKey: claimAuthorityKey(claim, root),
    findings: claimActionFindings(
      claim,
      status,
      lease,
      token,
      tokenInvalidatedAt,
      now,
      computedExpired,
    ),
  };
};

const duplicateClaimFindings = (
  liveClaimKeys: ReadonlyMap<string, string[]>,
): AffiliateCutoverFinding[] => Array.from(liveClaimKeys.entries())
  .filter(([, ids]) => ids.length > 1)
  .map(([key, ids]) => finding(
    'DUPLICATE_ACTIVE_CLAIMS',
    'BLOCKING',
    `Multiple active legacy claims share authority key ${key}.`,
    ids,
    'Revoke every duplicate and leave one reviewed authority before apply.',
  ));

const appendClaimAction = (
  claim: AffiliateLegacyClaimEvidence,
  result: ReturnType<typeof claimActionFor>,
  claimActions: AffiliateLegacyClaimAction[],
  liveClaimKeys: Map<string, string[]>,
  findings: ReconciliationFindings,
): void => {
  claimActions.push(result.action);
  findings.blockingFindings.push(...result.findings);
  if (result.action.status !== 'ACTIVE') return;
  const ids = liveClaimKeys.get(result.authorityKey) ?? [];
  ids.push(claim.id);
  liveClaimKeys.set(result.authorityKey, ids);
};

const reconcileClaims = (
  claims: readonly AffiliateLegacyClaimEvidence[],
  now: Date,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  findings: ReconciliationFindings,
): AffiliateLegacyClaimAction[] => {
  const claimActions: AffiliateLegacyClaimAction[] = [];
  const liveClaimKeys = new Map<string, string[]>();
  for (const claim of claims) {
    appendClaimAction(
      claim,
      claimActionFor(claim, now, sourceRoot, rootById),
      claimActions,
      liveClaimKeys,
      findings,
    );
  }
  findings.blockingFindings.push(...duplicateClaimFindings(liveClaimKeys));
  return claimActions;
};
const sortedTargetProjections = (
  projections: readonly AffiliateLegacyTargetProjection[],
): AffiliateLegacyTargetProjection[] => [...projections].sort((left, right) => (
  canonicalCompare(
    `${left.targetType}:${left.targetId}:${left.sourceTargetId}`,
    `${right.targetType}:${right.targetId}:${right.sourceTargetId}`,
  )
));

const mergeRootPlan = (
  existing: AffiliateLegacyRootPlan,
  source: AffiliateLegacySourceEvidence,
  action: AffiliateLegacyRootPlan['action'],
  recordIds: readonly string[],
  targetProjections: readonly AffiliateLegacyTargetProjection[],
  evidenceRefs: readonly string[],
): AffiliateLegacyRootPlan => ({
  ...existing,
  sourceIds: sortedUnique([...existing.sourceIds, source.id]),
  recordIds: sortedUnique([...existing.recordIds, ...recordIds]),
  targetProjections: Array.from(new Map(
    [...existing.targetProjections, ...targetProjections]
      .map((target) => [`${target.targetType}:${target.targetId}`, target] as const),
  ).values()).sort((a, b) => canonicalCompare(a.sourceTargetId, b.sourceTargetId)),
  evidenceRefs: sortedUnique([...existing.evidenceRefs, ...evidenceRefs]),
  action: existing.action === 'REVIEW_REQUIRED' || action === 'REVIEW_REQUIRED'
    ? 'REVIEW_REQUIRED'
    : existing.action,
});

const sourceRootForPlan = (
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  sourceId: string,
): AffiliateLegacyRootEvidence | null => sourceRoot.get(sourceId) ?? null;

const sourceActionForPlan = (
  sourcePlanAction: ReadonlyMap<string, AffiliateLegacyRootPlan['action']>,
  sourceId: string,
): AffiliateLegacyRootPlan['action'] => sourcePlanAction.get(sourceId) ?? 'REVIEW_REQUIRED';

const sourceTargetProjectionsForPlan = (
  root: AffiliateLegacyRootEvidence | null,
  targetsByLineage: ReadonlyMap<string, AffiliateLegacyTargetProjection[]>,
): AffiliateLegacyTargetProjection[] => root
  ? targetsByLineage.get(`root:${root.id}`) ?? []
  : [];

const sourceRecordIdsForPlan = (
  source: AffiliateLegacySourceEvidence,
  recordIdsBySource: ReadonlyMap<string, string[]>,
): string[] => [source.id, ...(recordIdsBySource.get(source.id) ?? [])];

const rootPlanIdentityValues = (
  identity: AffiliateSupplyIdentity | undefined,
  root: AffiliateLegacyRootEvidence | null,
): { identityKey: string | null; canonicalUrl: string | null; origin: string | null; pathKey: string | null } => {
  if (identity) {
    return {
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
    };
  }
  return {
    identityKey: null,
    canonicalUrl: root?.canonicalUrl ?? null,
    origin: root?.origin ?? null,
    pathKey: root?.pathKey ?? null,
  };
};

const rootPlanKey = (identityKey: string | null, sourceId: string): string => (
  identityKey ? identityKey : `source:${sourceId}`
);

const rootPlanForSource = (
  source: AffiliateLegacySourceEvidence,
  sourceIdentity: ReadonlyMap<string, AffiliateSupplyIdentity>,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  sourcePlanAction: ReadonlyMap<string, AffiliateLegacyRootPlan['action']>,
  sourceDerivedStage: ReadonlyMap<string, AffiliateSupplyLifecycleStage>,
  recordIdsBySource: ReadonlyMap<string, string[]>,
  targetsByLineage: ReadonlyMap<string, AffiliateLegacyTargetProjection[]>,
): { key: string; plan: AffiliateLegacyRootPlan; action: AffiliateLegacyRootPlan['action']; recordIds: string[]; targetProjections: AffiliateLegacyTargetProjection[]; evidenceRefs: string[] } => {
  const identity = sourceIdentity.get(source.id);
  const root = sourceRootForPlan(sourceRoot, source.id);
  const identityValues = rootPlanIdentityValues(identity, root);
  const action = sourceActionForPlan(sourcePlanAction, source.id);
  const targetProjections = sourceTargetProjectionsForPlan(root, targetsByLineage);
  const recordIds = sourceRecordIdsForPlan(source, recordIdsBySource);
  const evidenceRefs = sortedUnique([
    `legacy-source:${source.id}`,
    ...(source.evidenceRefs ?? []),
    ...targetProjections.flatMap((target) => target.evidenceRefs),
  ]);
  return {
    key: rootPlanKey(identityValues.identityKey, source.id),
    action,
    recordIds,
    targetProjections,
    evidenceRefs,
    plan: {
      sourceIds: [source.id],
      existingRootId: root?.id ?? null,
      identityKey: identityValues.identityKey,
      canonicalUrl: identityValues.canonicalUrl,
      origin: identityValues.origin,
      pathKey: identityValues.pathKey,
      derivedStage: sourceDerivedStage.get(source.id) ?? 'PRE_MAPPED',
      action,
      predecessorId: stringValue(source.predecessorSupplySourceId),
      recordIds: sortedUnique(recordIds),
      targetProjections: sortedTargetProjections(targetProjections),
      evidenceRefs,
    },
  };
};

const addRootPlan = (
  plansByIdentity: Map<string, AffiliateLegacyRootPlan>,
  source: AffiliateLegacySourceEvidence,
  result: ReturnType<typeof rootPlanForSource>,
): void => {
  const existing = plansByIdentity.get(result.key);
  plansByIdentity.set(
    result.key,
    existing
      ? mergeRootPlan(
          existing,
          source,
          result.action,
          result.recordIds,
          result.targetProjections,
          result.evidenceRefs,
        )
      : result.plan,
  );
};

const normalizeRootPlans = (
  plansByIdentity: ReadonlyMap<string, AffiliateLegacyRootPlan>,
): AffiliateLegacyRootPlan[] => Array.from(plansByIdentity.values())
  .map((plan) => ({
    ...plan,
    sourceIds: sortedUnique(plan.sourceIds),
    recordIds: sortedUnique(plan.recordIds),
    targetProjections: sortedTargetProjections(plan.targetProjections),
    evidenceRefs: sortedUnique(plan.evidenceRefs),
  }))
  .sort((left, right) => canonicalCompare(
    `${left.identityKey ?? ''}:${left.existingRootId ?? ''}:${left.sourceIds.join(',')}`,
    `${right.identityKey ?? ''}:${right.existingRootId ?? ''}:${right.sourceIds.join(',')}`,
  ));

const buildRootPlans = (
  sources: readonly AffiliateLegacySourceEvidence[],
  sourceIdentity: ReadonlyMap<string, AffiliateSupplyIdentity>,
  sourceRoot: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  sourcePlanAction: ReadonlyMap<string, AffiliateLegacyRootPlan['action']>,
  sourceDerivedStage: ReadonlyMap<string, AffiliateSupplyLifecycleStage>,
  recordIdsBySource: ReadonlyMap<string, string[]>,
  targetsByLineage: ReadonlyMap<string, AffiliateLegacyTargetProjection[]>,
): AffiliateLegacyRootPlan[] => {
  const plansByIdentity = new Map<string, AffiliateLegacyRootPlan>();
  for (const source of sources) {
    addRootPlan(
      plansByIdentity,
      source,
      rootPlanForSource(
        source,
        sourceIdentity,
        sourceRoot,
        sourcePlanAction,
        sourceDerivedStage,
        recordIdsBySource,
        targetsByLineage,
      ),
    );
  }
  return normalizeRootPlans(plansByIdentity);
};

const isReciprocalPredecessor = (
  root: AffiliateLegacyRootEvidence,
  predecessor: AffiliateLegacyRootEvidence | undefined,
): boolean => Boolean(predecessor && stringValue(predecessor.successorId) === root.id);

const isReciprocalSuccessor = (
  root: AffiliateLegacyRootEvidence,
  successor: AffiliateLegacyRootEvidence | undefined,
): boolean => Boolean(successor && stringValue(successor.predecessorId) === root.id);

const appendValidatedChainNeighbors = (
  root: AffiliateLegacyRootEvidence,
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
  pending: (string | null)[],
): void => {
  const predecessor = root.predecessorId ? rootById.get(root.predecessorId) : undefined;
  if (isReciprocalPredecessor(root, predecessor)) pending.push(predecessor?.id ?? null);
  const successor = root.successorId ? rootById.get(root.successorId) : undefined;
  if (isReciprocalSuccessor(root, successor)) pending.push(successor?.id ?? null);
};

const rootsInValidatedChains = (
  plans: readonly AffiliateLegacyRootPlan[],
  rootById: ReadonlyMap<string, AffiliateLegacyRootEvidence>,
): Set<string> => {
  const consumed = new Set<string>();
  const pending = plans.flatMap((plan) => [plan.existingRootId, plan.predecessorId]);
  while (pending.length) {
    const rootId = pending.pop();
    if (!rootId || consumed.has(rootId)) continue;
    const root = rootById.get(rootId);
    if (!root) continue;
    consumed.add(root.id);
    appendValidatedChainNeighbors(root, rootById, pending);
  }
  return consumed;
};

const orphanRootFindings = (
  roots: readonly AffiliateLegacyRootEvidence[],
  consumed: ReadonlySet<string>,
  records: readonly AffiliateLegacyLineageRecord[],
  targets: readonly AffiliateLegacyTargetEvidence[],
): AffiliateCutoverFinding[] => roots
  .filter((root) => !consumed.has(root.id))
  .map((root) => finding(
    'ORPHAN_SUPPLY_ROOT_LINEAGE',
    'BLOCKING',
    `Supply Source root ${root.id} is not linked to a reviewed legacy source plan.`,
    [
      root.id,
      ...records.filter((record) => record.supplySourceId === root.id).map((record) => record.id),
      ...targets.filter((target) => target.supplySourceId === root.id).map((target) => target.id),
    ],
    'Link the root to an exact legacy source identity or resolve every rooted record and target before apply.',
  ));

const reconciliationCounts = (
  sources: readonly AffiliateLegacySourceEvidence[],
  rootPlans: readonly AffiliateLegacyRootPlan[],
  records: readonly AffiliateLegacyLineageRecord[],
  recordRootByKey: ReadonlyMap<string, AffiliateLegacyRootEvidence | null>,
  targets: readonly AffiliateLegacyTargetEvidence[],
  claimActions: readonly AffiliateLegacyClaimAction[],
  blockingFindings: readonly AffiliateCutoverFinding[],
  warnings: readonly AffiliateCutoverFinding[],
  recordsByKind: Readonly<Record<string, number>>,
): AffiliateLegacyReconciliationCounts => ({
  sources: sources.length,
  roots: rootPlans.length,
  rootsToCreate: rootPlans.filter((root) => root.action === 'CREATE_ROOT').length,
  rootsToReuse: rootPlans.filter((root) => root.action === 'REUSE_ROOT').length,
  successorsToCreate: rootPlans.filter((root) => root.action === 'CREATE_SUCCESSOR').length,
  lineageRecords: records.length,
  linkedRecords: records.filter((record) => recordRootByKey.get(affiliateLegacyLineageRecordKey(record)) !== null).length,
  unresolvedRecords: records.filter((record) => recordRootByKey.get(affiliateLegacyLineageRecordKey(record)) === null).length,
  targets: targets.length,
  preservedPublicTargets: rootPlans.reduce((sum, root) => sum + root.targetProjections.filter((target) => target.status !== 'REJECTED').length, 0),
  lastKnownGoodTargets: rootPlans.reduce((sum, root) => sum + root.targetProjections.filter((target) => target.status === 'LAST_KNOWN_GOOD').length, 0),
  rejectedTargets: rootPlans.reduce((sum, root) => sum + root.targetProjections.filter((target) => target.status === 'REJECTED').length, 0),
  claims: claimActions.length,
  activeClaims: claimActions.filter((claim) => claim.status === 'ACTIVE').length,
  expiredClaims: claimActions.filter((claim) => claim.status === 'EXPIRED').length,
  terminalClaims: claimActions.filter((claim) => claim.status === 'TERMINAL').length,
  claimsToRevoke: claimActions.filter((claim) => claim.action === 'REVOKE_EXPIRED').length,
  blockingFindings: blockingFindings.length,
  warningFindings: warnings.length,
  recordsByKind: Object.fromEntries(Object.entries(recordsByKind).sort(([a], [b]) => canonicalCompare(a, b))),
});
export const buildAffiliateLegacyReconciliationReport = (
  input: AffiliateLegacyReconciliationInput,
): AffiliateLegacyReconciliationReport => {
  const collections = sortedReconciliationCollections(input);
  const findings = initialReconciliationFindings(input);
  const rootById = new Map(collections.roots.map((root) => [root.id, root]));
  findings.blockingFindings.push(...duplicateRootFindings(collections.roots));
  findings.blockingFindings.push(...rootRelationshipFindings(collections.roots, rootById));
  const sourceMaps = reconcileSources(input, collections.sources, collections.roots, rootById, findings);
  const recordMaps = reconcileLineageRecords(
    collections.records,
    sourceMaps.sourceIdentity,
    sourceMaps.sourceRoot,
    rootById,
    findings,
  );
  const targetsByLineage = reconcileTargets(
    collections.targets,
    sourceMaps.sourceRoot,
    rootById,
    findings,
  );
  const claimActions = reconcileClaims(
    collections.claims,
    input.now,
    sourceMaps.sourceRoot,
    rootById,
    findings,
  );
  const rootPlans = buildRootPlans(
    collections.sources,
    sourceMaps.sourceIdentity,
    sourceMaps.sourceRoot,
    sourceMaps.sourcePlanAction,
    sourceMaps.sourceDerivedStage,
    recordMaps.recordIdsBySource,
    targetsByLineage,
  );
  const consumedRootIds = rootsInValidatedChains(rootPlans, rootById);
  findings.blockingFindings.push(...orphanRootFindings(
    collections.roots,
    consumedRootIds,
    collections.records,
    collections.targets,
  ));
  const blockingFindings = sortedFindings(findings.blockingFindings);
  const warnings = sortedFindings(findings.warnings);
  const counts = reconciliationCounts(
    collections.sources,
    rootPlans,
    collections.records,
    recordMaps.recordRootByKey,
    collections.targets,
    claimActions,
    blockingFindings,
    warnings,
    recordMaps.recordsByKind,
  );
  const inputHash = canonicalHash(inputPreimageFor(input));
  const outputPreimage = {
    schemaVersion: 1,
    legacySnapshotHash: stringValue(input.legacySnapshotHash) ?? '',
    supplyContractVersion: typeof input.supplyContractVersion === 'number' ? input.supplyContractVersion : 0,
    supplyContractHash: stringValue(input.supplyContractHash) ?? '',
    roots: rootPlans,
    claimActions,
    counts,
    blockingFindings,
    warnings,
  };
  const outputHash = canonicalHash(outputPreimage);
  const resolutions = sortedFindings([...blockingFindings, ...warnings]);
  const reportHash = canonicalHash({
    ...outputPreimage,
    inputHash,
    outputHash,
    resolutions,
  });
  return {
    schemaVersion: 1,
    evaluatedAt: input.now.toISOString(),
    isApplySafe: blockingFindings.length === 0,
    legacySnapshotHash: stringValue(input.legacySnapshotHash) ?? '',
    supplyContractVersion: typeof input.supplyContractVersion === 'number' ? input.supplyContractVersion : 0,
    supplyContractHash: stringValue(input.supplyContractHash) ?? '',
    inputHash,
    outputHash,
    reportHash,
    counts,
    roots: rootPlans,
    claimActions,
    blockingFindings,
    warnings,
    resolutions,
  };
};

export type AffiliateCutoverContractSnapshot = Readonly<{
  supplyContractVersion: number;
  supplyContractHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  gatewayVersion: number;
  roleContractHashes: Readonly<Record<string, string>>;
  promptTemplateHashes: Readonly<Record<string, string>>;
}>;

export type AffiliateLegacyProcessExpectation = Readonly<{
  id: string;
  processClass: string;
}>;

export type AffiliateCutoverSystemdUnit = Readonly<{
  processId: string;
  unitId: string;
}>;

export type AffiliateCutoverLegacyServiceUnit = Readonly<{
  id: string;
  isEnabled: string;
  isActive: string;
}>;

const normalizedLegacyProcessManifest = (
  processes: readonly AffiliateLegacyProcessExpectation[],
): Array<{ id: string; processClass: string }> => processes
  .map((process) => ({
    id: stringValue(process.id) ?? '',
    processClass: upper(process.processClass),
  }))
  .sort((a, b) => canonicalCompare(`${a.id}:${a.processClass}`, `${b.id}:${b.processClass}`));

const normalizedSystemdUnits = (
  systemdUnits: readonly AffiliateCutoverSystemdUnit[],
): AffiliateCutoverSystemdUnit[] => systemdUnits
  .map((unit) => ({
    processId: stringValue(unit.processId) ?? '',
    unitId: stringValue(unit.unitId) ?? '',
  }))
  .sort((a, b) => canonicalCompare(`${a.processId}:${a.unitId}`, `${b.processId}:${b.unitId}`));

export const hashAffiliateLegacyProcessManifest = (
  processes: readonly AffiliateLegacyProcessExpectation[],
  systemdUnits: readonly AffiliateCutoverSystemdUnit[] = [],
): string => canonicalHash({
  schemaVersion: 1,
  processes: normalizedLegacyProcessManifest(processes),
  systemdUnits: normalizedSystemdUnits(systemdUnits),
});
export type AffiliateLegacyProcessManifest = Readonly<{
  schemaVersion: 1;
  artifactId: string;
  processes: readonly AffiliateLegacyProcessExpectation[];
  systemdUnits: readonly AffiliateCutoverSystemdUnit[];
  processCount: number;
  manifestHash: string;
  inventoryArtifactId: string;
  inventoryHash: string;
  inventoryCount: number;
  reviewedAt: string;
  reviewedBy: string;
}>;


export type AffiliateCutoverProcessRecord = Readonly<{
  id: string;
  kind: 'LEGACY' | 'GOVERNED';
  role?: string;
  workerId?: string;
  processClass?: string;
  command: string;
  status: string;
}>;
const normalizedAffiliateCutoverProcess = (
  process: AffiliateCutoverProcessRecord,
): {
  id: string;
  kind: string;
  role: string | null;
  workerId: string | null;
  processClass: string | null;
  command: string;
  status: string;
} => ({
  id: stringValue(process.id) ?? '',
  kind: upper(process.kind),
  role: stringValue(process.role) ? upper(process.role) : null,
  workerId: stringValue(process.workerId),
  processClass: stringValue(process.processClass) ? upper(process.processClass) : null,
  command: stringValue(process.command) ?? '',
  status: upper(process.status),
});

export const hashAffiliateCutoverProcessInventory = (
  processes: readonly AffiliateCutoverProcessRecord[],
): string => canonicalHash({
  schemaVersion: 1,
  processes: [...processes]
    .map(normalizedAffiliateCutoverProcess)
    .sort((left, right) => canonicalJsonCompare(left, right)),
});


const affiliateCutoverProcessHashKey = (
  process: AffiliateCutoverProcessRecord,
): string => JSON.stringify(normalizedAffiliateCutoverProcess(process));




export type AffiliateAgentContainerInput = Readonly<{
  id: string;
  name?: string;
  user?: string | null;
  hasReadonlyRootFilesystem?: boolean;
  privileged?: boolean;
  tmpfs?: Readonly<Record<string, string>>;
  environment?: readonly string[] | Readonly<Record<string, string>>;
  volumes?: readonly string[];
  networks?: readonly string[];
  isNetworkInternal?: boolean;
  capDrop?: readonly string[];
  capAdd?: readonly string[];
  groupAdd?: readonly string[];
  cgroupNamespace?: string | null;
  ipcMode?: string | null;
  cgroupMountWritable?: boolean;
  cgroupRelativePath?: string;
  childUid?: number;
  childGid?: number;
  supervisorUid?: number;
  securityOptions?: readonly string[];
}>;

export type AffiliateAgentContainerInspection = Readonly<{
  id: string;
  name: string | null;
  isSafe: boolean;
  findings: readonly AffiliateCutoverFinding[];
  inputHash: string;
}>;

export type AffiliateCutoverControlPlaneProcess = Readonly<{
  id: string;
  status: string;
}>;

export type AffiliateCutoverPreflightInput = Readonly<{
  now: Date;
  expected: AffiliateCutoverContractSnapshot;
  observed: AffiliateCutoverContractSnapshot;
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest;
  processInventoryArtifactId: string;
  processInventoryHash: string;
  processInventoryCount: number;
  processInventory: readonly AffiliateCutoverProcessRecord[];
  controlPlaneProcesses: readonly AffiliateCutoverControlPlaneProcess[];
  legacyServiceUnits: readonly AffiliateCutoverLegacyServiceUnit[];
  legacyClaims: readonly AffiliateLegacyClaimEvidence[];
  databasePermissions: Readonly<{
    isAgentAllowedToConnectProductionDatabase: boolean;
    isAgentAllowedToWriteProductionDatabase: boolean;
    isAgentAllowedToReadObjectStorage: boolean;
    isAgentAllowedToWriteObjectStorage: boolean;
    isAgentAllowedToCallProviders: boolean;
    isGatewayAllowedToWriteProductionDatabase: boolean;
  }>;
  reviewedAgentNetwork: string;
  runnerContainer: AffiliateAgentContainerInput;
  containers: readonly AffiliateAgentContainerInput[];
  auxiliaryContainers: readonly AffiliateAgentContainerInput[];
}>;


export type AffiliateCutoverPreflightReport = Readonly<{
  schemaVersion: 1;
  evaluatedAt: string;
  isReady: boolean;
  inputHash: string;
  reportHash: string;
  supplyContractVersion: number;
  supplyContractHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
  gatewayVersion: number;
  reviewedLegacyProcessManifestHash: string;
  reviewedLegacyProcessManifestCount: number;
  reviewedLegacyProcessManifestArtifactId: string;
  processInventoryArtifactId: string;
  processInventoryHash: string;
  processInventoryCount: number;
  reviewedSystemdUnits: readonly AffiliateCutoverSystemdUnit[];
  legacyServiceUnits: readonly AffiliateCutoverLegacyServiceUnit[];
  blockingFindings: readonly AffiliateCutoverFinding[];
  warnings: readonly AffiliateCutoverFinding[];
  resolutions: readonly AffiliateCutoverFinding[];
  counts: Readonly<{
    mappingProducers: number;
    supplyReviewers: number;
    coveragePlanners: number;
    stoppedLegacyProcesses: number;
    runningLegacyProcesses: number;
    liveLegacyClaims: number;
    unsafeContainers: number;
  }>;
  reviewedAgentNetwork: string;
}>;
export const isAffiliateCutoverPreflightApplySafe = (
  report: Pick<
    AffiliateCutoverPreflightReport,
    'counts' | 'reviewedLegacyProcessManifestCount'
  >,
): boolean => (
  report.counts.mappingProducers === AFFILIATE_GOVERNED_SUPERVISOR_COUNTS.MAPPING_PRODUCER
  && report.counts.supplyReviewers === AFFILIATE_GOVERNED_SUPERVISOR_COUNTS.SUPPLY_REVIEWER
  && report.counts.coveragePlanners === AFFILIATE_GOVERNED_SUPERVISOR_COUNTS.COVERAGE_PLANNER
  && report.counts.stoppedLegacyProcesses === report.reviewedLegacyProcessManifestCount
  && report.counts.runningLegacyProcesses === 0
  && report.counts.liveLegacyClaims === 0
  && report.counts.unsafeContainers === 0
);


const environmentEntries = (
  environment: AffiliateAgentContainerInput['environment'],
): string[] => {
  if (Array.isArray(environment)) return [...environment];
  return Object.entries(environment ?? {}).map(([key, value]) => `${key}=${value}`);
};

const AFFILIATE_REPLENISHMENT_CONTROLLER_ID = 'affiliate-replenishment-controller';
const AFFILIATE_REPLENISHMENT_TOKEN_KEY = 'AFFILIATE_GATEWAY_REPLENISHMENT_TOKEN';

const forbiddenContainerEnvironmentFindings = (
  input: AffiliateAgentContainerInput,
  environment: readonly string[],
  options: Readonly<{
    allowReviewedModelCredential?: boolean;
    allowReviewedRunnerProtocolPrivateKey?: boolean;
    allowReviewedReplenishmentToken?: boolean;
  }>,
): AffiliateCutoverFinding[] => {
  const forbiddenEnvironment = /(?:^|=)(?:postgres(?:ql)?|mysql|redis):\/\//i;
  const forbiddenName = /(?:DATABASE_URL|DIRECT_URL|PGHOST|PGPORT|PGDATABASE|PGUSER|PGPASSWORD|PGSSLMODE|MYSQL_HOST|MYSQL_PORT|MYSQL_DATABASE|MYSQL_USER|MYSQL_PASSWORD|MYSQL_ROOT_PASSWORD|REDIS_URL|DO_SPACES|AFFILIATE_GATEWAY_SPACES_|AWS_ACCESS|AWS_SECRET|GITHUB_TOKEN|SCRAPINGDOG|FIRECRAWL|SMTP|STRIPE|JWT_SECRET|NEXTAUTH|PRISMA|REPOSITORY_GIT|PRODUCTION_BACKEND|MODEL_CREDENTIAL|OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY|AZURE_OPENAI|COHERE_API_KEY|MISTRAL_API_KEY|TOGETHER_API_KEY|GROQ_API_KEY|DEEPSEEK_API_KEY|AFFILIATE_GATEWAY_OPERATOR_TOKEN|AFFILIATE_AGENT_TOKEN_SIGNING_KEY|AFFILIATE_OPERATIONAL_ALERT_WEBHOOK_URL|AFFILIATE_AGENT_DEPLOYMENT_CONTRACT_JSON|AFFILIATE_AGENT_PREFLIGHT_REPORT_JSON|AFFILIATE_MAPPING_PRODUCER_[12]_CREDENTIAL|AFFILIATE_SUPPLY_REVIEWER_[12]_CREDENTIAL|AFFILIATE_COVERAGE_PLANNER_CREDENTIAL|AFFILIATE_HUMAN_DIRECTED_EXECUTOR_CREDENTIAL|AFFILIATE_AGENT_SUPERVISOR_HALT_CREDENTIAL|AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY)/i;
  const allowedModelCredential = options.allowReviewedModelCredential === true
    ? /^AFFILIATE_AGENT_MODEL_CREDENTIAL$/i
    : null;
  const forbidden = environment
    .map((entry) => ({ entry, key: entry.split('=', 1)[0] }))
    .filter(({ key, entry }) => (
      (forbiddenName.test(key)
        && !(allowedModelCredential?.test(key) ?? false)
        && !(
          options.allowReviewedRunnerProtocolPrivateKey === true
          && key.toUpperCase() === 'AFFILIATE_AGENT_RUNNER_PROTOCOL_PRIVATE_KEY'
        ))
      || forbiddenEnvironment.test(entry)
      || (
        upper(key) === AFFILIATE_REPLENISHMENT_TOKEN_KEY
        && options.allowReviewedReplenishmentToken !== true
      )
    ))
    .map(({ key }) => key);
  return forbidden.length
    ? [finding(
        'FORBIDDEN_AGENT_CREDENTIAL',
        'BLOCKING',
        `Agent container ${input.id} exposes forbidden production authority: ${sortedUnique(forbidden).join(', ')}.`,
        [input.id, ...forbidden],
        'Remove the secret or route the operation through the internal Agent Gateway.',
      )]
    : [];
};

const containerNetworkFindings = (
  input: AffiliateAgentContainerInput,
  expectedNetwork: string,
): AffiliateCutoverFinding[] => {
  const networks = (input.networks ?? []).map((network) => stringValue(network) ?? '');
  const normalizedExpectedNetwork = stringValue(expectedNetwork) ?? '';
  const isRestricted = Boolean(
    normalizedExpectedNetwork
    && networks.length === 1
    && networks[0] === normalizedExpectedNetwork
    && input.isNetworkInternal === true
  );
  return isRestricted
    ? []
    : [finding(
        'PRODUCTION_NETWORK_ACCESS',
        'BLOCKING',
        `Agent container ${input.id} is not restricted to the reviewed internal Agent Gateway network.`,
        [input.id, normalizedExpectedNetwork || '(missing-reviewed-network)', ...networks],
        'Attach the container only to the reviewed internal Agent Gateway network.',
      )];
};

const normalizedContainerUser = (
  user: string | null | undefined,
): { principal: string; group: string } => {
  const normalized = stringValue(user) ?? '';
  const [principal = '', group = ''] = normalized.split(':', 2);
  return {
    principal: principal.trim().toLowerCase(),
    group: group.trim().toLowerCase(),
  };
};

const isRootContainerUser = (user: { principal: string; group: string }): boolean => (
  !user.principal
  || user.principal === 'root'
  || (/^\d+$/.test(user.principal) && Number(user.principal) === 0)
  || user.group === 'root'
  || (/^\d+$/.test(user.group) && Number(user.group) === 0)
);

const containerCapabilitiesAreReduced = (
  input: AffiliateAgentContainerInput,
): boolean => {
  const hasAllCapabilitiesDropped = (input.capDrop ?? []).some((capability) => upper(capability) === 'ALL');
  const hasNoAddedCapabilities = (input.capAdd ?? []).length === 0;
  const hasNoSupplementaryGroups = (input.groupAdd ?? []).length === 0;
  return hasAllCapabilitiesDropped && hasNoAddedCapabilities && hasNoSupplementaryGroups;
};

const containerSecurityOptionsAreSafe = (
  input: AffiliateAgentContainerInput,
): boolean => {
  const hasNoNewPrivileges = (input.securityOptions ?? []).some((option) => {
    const [name, value] = upper(option).split(':', 2);
    return name.replace(/[-_]/g, '') === 'NONEWPRIVILEGES' && value === 'TRUE';
  });
  const hasNoWritableCgroupDelegation = !(input.securityOptions ?? []).some((option) => (
    option.trim().toLowerCase() === 'writable-cgroups=true'
  ));
  return hasNoNewPrivileges && hasNoWritableCgroupDelegation;
};

const containerPrivilegeBoundaryIsSafe = (
  input: AffiliateAgentContainerInput,
  user: { principal: string; group: string },
): boolean => {
  const hasContainerEvidence = input.environment !== undefined
    && Array.isArray(input.capAdd)
    && Array.isArray(input.groupAdd);
  return hasContainerEvidence
    && !isRootContainerUser(user)
    && input.privileged === false
    && input.hasReadonlyRootFilesystem === true
    && containerCapabilitiesAreReduced(input)
    && containerSecurityOptionsAreSafe(input);
};

const containerPrivilegeFindings = (
  input: AffiliateAgentContainerInput,
): AffiliateCutoverFinding[] => {
  const user = normalizedContainerUser(input.user);
  if (containerPrivilegeBoundaryIsSafe(input, user)) return [];
  return [finding(
    'CONTAINER_PRIVILEGE',
    'BLOCKING',
    `Agent container ${input.id} does not prove a non-root, read-only, capability-reduced boundary without privileged mode, added capabilities, supplementary groups, or writable cgroup delegation.`,
    [input.id],
    'Use a non-root user, privileged=false, a read-only root filesystem, cap_drop ALL, no cap_add/group_add entries, and no-new-privileges without writable-cgroups delegation.',
  )];
};
const REVIEWED_RUNNER_CHILD_UID = 1002;
const REVIEWED_RUNNER_CHILD_GID = 1001;
const REVIEWED_RUNNER_SUPERVISOR_UID = 1001;
const REVIEWED_RUNNER_CGROUP_RELATIVE_PATH = 'affiliate-agent-runner';
const REVIEWED_RUNNER_CAPABILITIES = [
  'CHOWN',
  'DAC_OVERRIDE',
  'FOWNER',
  'KILL',
  'SETGID',
  'SETUID',
] as const;
const REVIEWED_RUNNER_SECURITY_OPTIONS = [
  'no-new-privileges:true',
  'writable-cgroups=true',
] as const;
const REVIEWED_RUNNER_TMPFS = [
  [
    '/dev/shm',
    ['gid=0', 'mode=755', 'nodev', 'noexec', 'nosuid', 'rw', 'size=64m', 'uid=0'],
  ],
  [
    '/tmp',
    ['gid=0', 'mode=755', 'nodev', 'noexec', 'nosuid', 'rw', 'size=256m', 'uid=0'],
  ],
] as const;

const normalizedTmpfs = (
  tmpfs: AffiliateAgentContainerInput['tmpfs'],
): Array<[string, string[]]> => Object.entries(tmpfs ?? {})
  .map(([path, options]) => [
    path,
    options.split(',')
      .map((option) => option.trim().toLowerCase().replace(/^mode=0+([0-7]+)$/, 'mode=$1'))
      .sort(),
  ] as [string, string[]])
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));

const runnerTmpfsIsReviewed = (
  tmpfs: AffiliateAgentContainerInput['tmpfs'],
): boolean => JSON.stringify(normalizedTmpfs(tmpfs)) === JSON.stringify(REVIEWED_RUNNER_TMPFS);

const sameStringValues = (
  values: readonly string[],
  expected: readonly string[],
): boolean => JSON.stringify(values) === JSON.stringify(expected);

const runnerBoundaryFinding = (
  input: AffiliateAgentContainerInput,
  code: string,
  detail: string,
  resolution: string,
): AffiliateCutoverFinding => finding(
  code,
  'BLOCKING',
  detail,
  [input.id],
  resolution,
);

const runnerIdentityFindings = (
  input: AffiliateAgentContainerInput,
): AffiliateCutoverFinding[] => {
  const user = normalizedContainerUser(input.user);
  if (user.principal === '0' && user.group === '0') return [];
  return [runnerBoundaryFinding(
    input,
    'RUNNER_CONTROL_IDENTITY',
    'The governed runner does not prove the root control identity 0:0.',
    'Run only the runner control process as UID/GID 0:0 and keep the Codex child unprivileged.',
  )];
};

const runnerFilesystemFindings = (
  input: AffiliateAgentContainerInput,
): AffiliateCutoverFinding[] => {
  const findings: AffiliateCutoverFinding[] = [];
  if (
    input.privileged !== false
    || input.hasReadonlyRootFilesystem !== true
    || input.cgroupMountWritable === false
  ) {
    findings.push(runnerBoundaryFinding(
      input,
      'RUNNER_FILESYSTEM_BOUNDARY',
      'The governed runner does not prove a non-privileged read-only root or reports a non-writable private cgroup mount.',
      'Set privileged=false, use a read-only runner root filesystem, and reject any runtime evidence that reports a non-writable cgroup2 mount.',
    ));
  }
  if (!runnerTmpfsIsReviewed(input.tmpfs)) {
    findings.push(runnerBoundaryFinding(
      input,
      'RUNNER_TMPFS_BOUNDARY',
      'The governed runner does not prove root-owned, bounded, non-executable private /tmp and /dev/shm mounts.',
      'Mount only root-owned mode 0755 tmpfs filesystems at /tmp (256m) and /dev/shm (64m), with noexec, nosuid, and nodev options.',
    ));
  }
  if (input.ipcMode?.trim().toLowerCase() !== 'none') {
    findings.push(runnerBoundaryFinding(
      input,
      'RUNNER_IPC_BOUNDARY',
      'The governed runner does not prove an IPC namespace without Docker-injected shared memory.',
      'Set ipc=none and mount only the reviewed bounded root-owned /dev/shm tmpfs.',
    ));
  }
  return findings;
};

const runnerCapabilityFindings = (
  input: AffiliateAgentContainerInput,
): AffiliateCutoverFinding[] => {
  const findings: AffiliateCutoverFinding[] = [];
  const capDrop = sortedUnique((input.capDrop ?? []).map(upper));
  const capAdd = sortedUnique((input.capAdd ?? []).map(upper));
  if (
    !sameStringValues(capDrop, ['ALL'])
    || !sameStringValues(capAdd, [...REVIEWED_RUNNER_CAPABILITIES])
  ) {
    findings.push(runnerBoundaryFinding(
      input,
      'RUNNER_CAPABILITY_BOUNDARY',
      'The governed runner capabilities do not match the reviewed minimal cleanup set.',
      'Drop ALL capabilities and add only CHOWN, DAC_OVERRIDE, FOWNER, KILL, SETGID, and SETUID.',
    ));
  }
  const securityOptions = sortedUnique(
    (input.securityOptions ?? []).map((option) => option.trim().toLowerCase()),
  );
  if (!sameStringValues(securityOptions, [...REVIEWED_RUNNER_SECURITY_OPTIONS])) {
    findings.push(runnerBoundaryFinding(
      input,
      'RUNNER_SECURITY_BOUNDARY',
      'The governed runner does not prove private writable cgroups with no-new-privileges.',
      'Require exactly no-new-privileges:true and writable-cgroups=true.',
    ));
  }
  return findings;
};

const runnerChildIdentityFindings = (
  input: AffiliateAgentContainerInput,
): AffiliateCutoverFinding[] => {
  const groupAdd = sortedUnique((input.groupAdd ?? []).map((group) => group.trim()));
  const hasDistinctRunnerIdentities = input.childUid !== input.supervisorUid;
  if (
    sameStringValues(groupAdd, [String(REVIEWED_RUNNER_CHILD_GID)])
    && input.childUid === REVIEWED_RUNNER_CHILD_UID
    && input.childGid === REVIEWED_RUNNER_CHILD_GID
    && input.supervisorUid === REVIEWED_RUNNER_SUPERVISOR_UID
    && hasDistinctRunnerIdentities
  ) return [];
  return [runnerBoundaryFinding(
    input,
    'RUNNER_CHILD_IDENTITY',
    'The runner child, supervisor workspace, and supplementary group identities are not the reviewed isolated values.',
    'Use child UID/GID 1002:1001, supervisor UID 1001, and supplementary group 1001; child and supervisor UIDs must differ.',
  )];
};

const runnerCgroupFindings = (
  input: AffiliateAgentContainerInput,
): AffiliateCutoverFinding[] => (
  input.cgroupNamespace === 'private'
    && input.cgroupRelativePath === REVIEWED_RUNNER_CGROUP_RELATIVE_PATH
    ? []
    : [runnerBoundaryFinding(
        input,
        'RUNNER_CGROUP_BOUNDARY',
        'The runner does not prove the reviewed private cgroup namespace and relative descendant path.',
        'Use cgroup namespace private and relative path affiliate-agent-runner; reject host paths and cgroup-root fallbacks.',
      )]
);

const runnerNetworkFindings = (
  input: AffiliateAgentContainerInput,
  expectedNetwork: string,
  expectedEgressNetwork = 'affiliate_gateway_egress',
): AffiliateCutoverFinding[] => {
  const networks = (input.networks ?? []).map((network) => stringValue(network) ?? '');
  const normalizedExpectedNetwork = stringValue(expectedNetwork) ?? '';
  const normalizedEgressNetwork = stringValue(expectedEgressNetwork) ?? '';
  const isRestricted = Boolean(
    normalizedExpectedNetwork
    && normalizedEgressNetwork
    && networks.length === 2
    && networks.includes(normalizedExpectedNetwork)
    && networks.includes(normalizedEgressNetwork)
    && input.isNetworkInternal === true
  );
  return isRestricted
    ? []
    : [finding(
        'PRODUCTION_NETWORK_ACCESS',
        'BLOCKING',
        `The runner ${input.id} must use only the internal gateway and reviewed Codex egress networks.`,
        [input.id, normalizedExpectedNetwork || '(missing-reviewed-network)', normalizedEgressNetwork || '(missing-reviewed-egress-network)', ...networks],
        'Attach the runner only to the reviewed internal gateway and Codex egress networks.',
      )];
};

const runnerCodexHandoffFindings = (
  input: AffiliateAgentContainerInput,
  environment: readonly string[],
): AffiliateCutoverFinding[] => {
  const hasAuthSeed = environment.some((entry) => (
    upper(entry.split('=', 1)[0]) === 'AFFILIATE_AGENT_CODEX_AUTH_SEED'
  ));
  const hasModel = environment.some((entry) => (
    upper(entry.split('=', 1)[0]) === 'AFFILIATE_AGENT_CODEX_MODEL'
  ));
  const hasAuthMount = (input.volumes ?? []).some((volume) => {
    const parts = volume.split(':');
    return parts[1] === '/run/secrets/codex-auth.json'
      && parts[parts.length - 1] === 'ro';
  });
  if (hasAuthSeed && hasModel && hasAuthMount) return [];
  return [runnerBoundaryFinding(
    input,
    'RUNNER_CODEX_HANDOFF',
    'The governed runner does not prove the reviewed Codex auth seed, model, and read-only auth mount.',
    'Mount the reviewed auth.json read-only, set the Codex auth seed path, and set the reviewed Codex model.',
  )];
};

const runnerContainmentFindings = (
  input: AffiliateAgentContainerInput,
  environment: readonly string[],
  expectedNetwork: string,
): AffiliateCutoverFinding[] => [
  ...forbiddenContainerEnvironmentFindings(input, environment, {}),
  ...runnerNetworkFindings(input, expectedNetwork),
  ...runnerIdentityFindings(input),
  ...runnerFilesystemFindings(input),
  ...runnerCapabilityFindings(input),
  ...runnerChildIdentityFindings(input),
  ...runnerCgroupFindings(input),
  ...runnerCodexHandoffFindings(input, environment),
];

const auxiliaryIdentityFindings = (
  input: AffiliateAgentContainerInput,
  environment: readonly string[],
): AffiliateCutoverFinding[] => {
  if (stringValue(input.id) !== AFFILIATE_REPLENISHMENT_CONTROLLER_ID) return [];
  const hasReplenishmentToken = environment.some((entry) => (
    upper(entry.split('=', 1)[0]) === AFFILIATE_REPLENISHMENT_TOKEN_KEY
  ));
  return hasReplenishmentToken
    ? []
    : [finding(
        'REPLENISHMENT_TOKEN_MISSING',
        'BLOCKING',
        `The replenishment controller ${input.id} does not expose the dedicated gateway replenishment credential marker.`,
        [input.id, AFFILIATE_REPLENISHMENT_TOKEN_KEY],
        'Provide only the dedicated gateway replenishment credential to the replenishment controller.',
      )];
};

const normalizedContainerInput = (
  input: AffiliateAgentContainerInput,
  environment: readonly string[],
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {
    ...input,
    environment: [...environment].sort(),
    volumes: [...(input.volumes ?? [])].sort(),
    networks: [...(input.networks ?? [])].map((network) => stringValue(network) ?? '').sort(),
    capDrop: sortedUnique((input.capDrop ?? []).map(upper)),
    capAdd: sortedUnique((input.capAdd ?? []).map(upper)),
    groupAdd: sortedUnique((input.groupAdd ?? []).map((group) => group.trim())),
    securityOptions: sortedUnique(
      (input.securityOptions ?? []).map((option) => option.trim().toLowerCase()),
    ),
    tmpfs: normalizedTmpfs(input.tmpfs),
  };
  if (input.cgroupNamespace !== undefined) {
    normalized.cgroupNamespace = input.cgroupNamespace?.trim().toLowerCase();
  }
  if (input.cgroupRelativePath !== undefined) {
    normalized.cgroupRelativePath = input.cgroupRelativePath?.trim();
  }
  return normalized;
};
export const inspectAffiliateAgentContainer = (
  input: AffiliateAgentContainerInput,
  expectedNetwork = 'affiliate_gateway_internal',
  options: Readonly<{
    allowReviewedModelCredential?: boolean;
    allowReviewedRunnerProtocolPrivateKey?: boolean;
  }> = { allowReviewedRunnerProtocolPrivateKey: true },
): AffiliateAgentContainerInspection => {
  const environment = environmentEntries(input.environment);
  const findings = [
    ...forbiddenContainerEnvironmentFindings(input, environment, options),
    ...containerNetworkFindings(input, expectedNetwork),
    ...containerPrivilegeFindings(input),
  ];
  return {
    id: input.id,
    name: stringValue(input.name),
    isSafe: findings.length === 0,
    findings,
    inputHash: canonicalHash(normalizedContainerInput(input, environment)),
  };
};
export const inspectAffiliateAgentRunnerContainer = (
  input: AffiliateAgentContainerInput,
  expectedNetwork = 'affiliate_gateway_internal',
): AffiliateAgentContainerInspection => {
  const environment = environmentEntries(input.environment);
  const findings = runnerContainmentFindings(input, environment, expectedNetwork);
  return {
    id: input.id,
    name: stringValue(input.name),
    isSafe: findings.length === 0,
    findings,
    inputHash: canonicalHash(normalizedContainerInput(input, environment)),
  };
};

export const inspectAffiliateAuxiliaryContainer = (
  input: AffiliateAgentContainerInput,
  expectedNetwork = 'affiliate_gateway_internal',
): AffiliateAgentContainerInspection => {
  const environment = environmentEntries(input.environment);
  const findings = [
    ...forbiddenContainerEnvironmentFindings(input, environment, {
      allowReviewedReplenishmentToken: stringValue(input.id) === AFFILIATE_REPLENISHMENT_CONTROLLER_ID,
    }),
    ...auxiliaryIdentityFindings(input, environment),
    ...containerNetworkFindings(input, expectedNetwork),
    ...containerPrivilegeFindings(input),
  ];
  return {
    id: input.id,
    name: stringValue(input.name),
    isSafe: findings.length === 0,
    findings,
    inputHash: canonicalHash(normalizedContainerInput(input, environment)),
  };
};
const contractHashMismatchFindings = (
  expected: Readonly<Record<string, string>>,
  observed: Readonly<Record<string, string>>,
  roles: readonly string[],
  code: string,
  detail: (role: string) => string,
  resolution: string,
): AffiliateCutoverFinding[] => roles
  .map((role) => expected[role] === observed[role]
    ? null
    : finding(code, 'BLOCKING', detail(role), [
        role,
        expected[role] ?? '',
        observed[role] ?? '',
      ], resolution))
  .filter((item): item is AffiliateCutoverFinding => item !== null);

const contractMismatchFindings = (
  expected: AffiliateCutoverContractSnapshot,
  observed: AffiliateCutoverContractSnapshot,
): AffiliateCutoverFinding[] => [
  expected.supplyContractVersion === observed.supplyContractVersion
    && expected.supplyContractHash === observed.supplyContractHash
    ? null
    : finding(
        'SUPPLY_CONTRACT_MISMATCH',
        'BLOCKING',
        'Observed Supply Contract version or hash differs from the reviewed manifest.',
        [expected.supplyContractHash, observed.supplyContractHash],
        'Activate the exact reviewed Supply Contract or produce a new reviewed report.',
      ),
  expected.deploymentContractVersion === observed.deploymentContractVersion
    && expected.deploymentContractHash === observed.deploymentContractHash
    ? null
    : finding(
        'DEPLOYMENT_CONTRACT_MISMATCH',
        'BLOCKING',
        'Observed deployment contract version or hash differs from the reviewed manifest.',
        [expected.deploymentContractHash, observed.deploymentContractHash],
        'Deploy the exact reviewed gateway and role topology contract.',
      ),
  expected.gatewayVersion === observed.gatewayVersion
    ? null
    : finding(
        'GATEWAY_VERSION_MISMATCH',
        'BLOCKING',
        'Observed gateway version differs from the reviewed deployment contract.',
        [String(expected.gatewayVersion), String(observed.gatewayVersion)],
        'Run the reviewed gateway binary.',
      ),
  ...contractHashMismatchFindings(
    expected.roleContractHashes,
    observed.roleContractHashes,
    sortedUnique(Object.keys(expected.roleContractHashes)),
    'ROLE_CONTRACT_MISMATCH',
    (role) => `Role contract hash differs for ${role}.`,
    'Deploy the reviewed role contract bundle.',
  ),
  ...contractHashMismatchFindings(
    expected.promptTemplateHashes,
    observed.promptTemplateHashes,
    sortedUnique(Object.keys(expected.promptTemplateHashes)),
    'PROMPT_TEMPLATE_MISMATCH',
    (role) => `Prompt template hash differs for ${role}.`,
    'Deploy the reviewed prompt-template bundle.',
  ),
].filter((item): item is AffiliateCutoverFinding => item !== null);
const isSha256Hash = (value: unknown): boolean => typeof value === 'string' && HASH_PATTERN.test(value);

const contractVersionFindings = (
  label: 'EXPECTED' | 'OBSERVED',
  snapshot: AffiliateCutoverContractSnapshot,
): AffiliateCutoverFinding[] => [
  Number.isInteger(snapshot.supplyContractVersion) && snapshot.supplyContractVersion > 0
    ? null
    : finding(
        'CONTRACT_VERSION_INVALID',
        'BLOCKING',
        `${label} Supply Contract version is not a positive integer.`,
        [label, 'supply-contract-version'],
        'Provide the reviewed positive Supply Contract version.',
      ),
  Number.isInteger(snapshot.deploymentContractVersion) && snapshot.deploymentContractVersion > 0
    ? null
    : finding(
        'CONTRACT_VERSION_INVALID',
        'BLOCKING',
        `${label} deployment contract version is not a positive integer.`,
        [label, 'deployment-contract-version'],
        'Provide the reviewed positive deployment contract version.',
      ),
  Number.isInteger(snapshot.gatewayVersion) && snapshot.gatewayVersion > 0
    ? null
    : finding(
        'GATEWAY_VERSION_INVALID',
        'BLOCKING',
        `${label} gateway version is not a positive integer.`,
        [label, 'gateway-version'],
        'Provide the reviewed positive gateway version.',
      ),
].filter((item): item is AffiliateCutoverFinding => item !== null);

const contractHashIntegrityFindings = (
  label: 'EXPECTED' | 'OBSERVED',
  snapshot: AffiliateCutoverContractSnapshot,
): AffiliateCutoverFinding[] => [
  isSha256Hash(snapshot.supplyContractHash)
    ? null
    : finding(
        'CONTRACT_HASH_INVALID',
        'BLOCKING',
        `${label} Supply Contract hash is not a SHA-256 hash.`,
        [label, 'supply-contract-hash'],
        'Provide the reviewed Supply Contract SHA-256 hash.',
      ),
  isSha256Hash(snapshot.deploymentContractHash)
    ? null
    : finding(
        'CONTRACT_HASH_INVALID',
        'BLOCKING',
        `${label} deployment contract hash is not a SHA-256 hash.`,
        [label, 'deployment-contract-hash'],
        'Provide the reviewed deployment contract SHA-256 hash.',
      ),
].filter((item): item is AffiliateCutoverFinding => item !== null);

const roleContractIntegrityFindings = (
  label: 'EXPECTED' | 'OBSERVED',
  snapshot: AffiliateCutoverContractSnapshot,
): AffiliateCutoverFinding[] => {
  const roleContractHashes = snapshot.roleContractHashes ?? {};
  const promptTemplateHashes = snapshot.promptTemplateHashes ?? {};
  return AFFILIATE_AGENT_ROLES.flatMap((role) => [
    isSha256Hash(roleContractHashes[role])
      ? null
      : finding(
          'ROLE_CONTRACT_HASH_MISSING',
          'BLOCKING',
          `${label} role contract hash is missing or invalid for ${role}.`,
          [label, role],
          'Provide the reviewed role contract hash for every governed role.',
        ),
    isSha256Hash(promptTemplateHashes[role])
      ? null
      : finding(
          'PROMPT_TEMPLATE_HASH_MISSING',
          'BLOCKING',
          `${label} prompt-template hash is missing or invalid for ${role}.`,
          [label, role],
          'Provide the reviewed prompt-template hash for every governed role.',
        ),
  ]).filter((item): item is AffiliateCutoverFinding => item !== null);
};

const contractSnapshotIntegrityFindings = (
  label: 'EXPECTED' | 'OBSERVED',
  snapshot: AffiliateCutoverContractSnapshot,
): AffiliateCutoverFinding[] => [
  ...contractVersionFindings(label, snapshot),
  ...contractHashIntegrityFindings(label, snapshot),
  ...roleContractIntegrityFindings(label, snapshot),
];


type PreflightProcessData = {
  processes: AffiliateCutoverProcessRecord[];
  legacyProcesses: AffiliateCutoverProcessRecord[];
  governed: AffiliateCutoverProcessRecord[];
  reviewedLegacyProcesses: Array<{ id: string; processClass: string }>;
  reviewedSystemdUnits: AffiliateCutoverSystemdUnit[];
  reviewedLegacyProcessManifestHash: string;
  reviewedLegacyProcessManifestArtifactId: string;
  reviewedLegacyProcessManifestCount: number | undefined;
  processInventoryArtifactId: string;
  processInventoryHash: string;
  processInventoryCount: number;
  reviewedInventoryArtifactId: string;
  reviewedInventoryHash: string;
  reviewedInventoryCount: number | undefined;
};

const strictIsoDate = (value: unknown): Date | null => {
  const normalized = stringValue(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    return null;
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

const manifestProcessesFor = (
  manifest: AffiliateLegacyProcessManifest | null | undefined,
): Array<{ id: string; processClass: string }> => normalizedLegacyProcessManifest(manifest?.processes ?? []);

const manifestStringFor = (
  value: unknown,
): string => stringValue(value) ?? '';

const manifestSystemdUnitsFor = (
  manifest: AffiliateLegacyProcessManifest | null | undefined,
): AffiliateCutoverSystemdUnit[] => normalizedSystemdUnits(manifest?.systemdUnits ?? []);

const preflightProcessData = (
  input: AffiliateCutoverPreflightInput,
): PreflightProcessData => {
  const processes = [...input.processInventory].sort((left, right) => (
    canonicalCompare(affiliateCutoverProcessHashKey(left), affiliateCutoverProcessHashKey(right))
  ));
  const manifest = input.reviewedLegacyProcessManifest;
  const reviewedLegacyProcesses = manifestProcessesFor(manifest);
  return {
    processes,
    legacyProcesses: processes.filter((process) => process.kind === 'LEGACY'),
    governed: processes.filter((process) => process.kind === 'GOVERNED'),
    reviewedLegacyProcesses,
    reviewedSystemdUnits: manifestSystemdUnitsFor(manifest),
    reviewedLegacyProcessManifestHash: manifestStringFor(manifest?.manifestHash),
    reviewedLegacyProcessManifestArtifactId: manifestStringFor(manifest?.artifactId),
    reviewedLegacyProcessManifestCount: manifest?.processCount,
    processInventoryArtifactId: manifestStringFor(input.processInventoryArtifactId),
    processInventoryHash: manifestStringFor(input.processInventoryHash),
    processInventoryCount: input.processInventoryCount,
    reviewedInventoryArtifactId: manifestStringFor(manifest?.inventoryArtifactId),
    reviewedInventoryHash: manifestStringFor(manifest?.inventoryHash),
    reviewedInventoryCount: manifest?.inventoryCount,
  };
};

const reviewedManifestReviewReason = (
  reviewedAt: string | null,
  reviewDate: Date | null,
  reviewedBy: string | null,
  now: Date,
): string | null => {
  if (!reviewedAt) return 'review time is missing';
  if (!reviewDate) return 'review time is not a valid ISO-8601 timestamp';
  if (reviewDate.getTime() > now.getTime()) return 'review time is in the future';
  if (!reviewedBy) return 'reviewer identity is missing';
  return null;
};

const reviewedManifestReviewFinding = (
  input: AffiliateCutoverPreflightInput,
): AffiliateCutoverFinding | null => {
  const manifest = input.reviewedLegacyProcessManifest;
  const reviewedAt = stringValue(manifest?.reviewedAt);
  const reviewedBy = stringValue(manifest?.reviewedBy);
  const reason = reviewedManifestReviewReason(
    reviewedAt,
    strictIsoDate(reviewedAt),
    reviewedBy,
    input.now,
  );
  return reason
    ? finding(
        'LEGACY_PROCESS_MANIFEST_REVIEW_INVALID',
        'BLOCKING',
        `The independently reviewed legacy process manifest has invalid review evidence: ${reason}.`,
        ['legacy-process-manifest'],
        'Record a reviewer identity and a non-future ISO-8601 review time in the separate manifest artifact.',
      )
    : null;
};

const inventoryHashFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => {
  const expectedHash = hashAffiliateCutoverProcessInventory(data.processes);
  return isSha256Hash(data.processInventoryHash) && data.processInventoryHash === expectedHash
    ? []
    : [finding(
        'LEGACY_PROCESS_INVENTORY_HASH_MISMATCH',
        'BLOCKING',
        'The independent process inventory hash is missing or does not match the observed process records.',
        ['process-inventory'],
        'Hash the complete independent process inventory with hashAffiliateCutoverProcessInventory.',
      )];
};

const inventoryCountFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => Number.isInteger(data.processInventoryCount)
  && data.processInventoryCount === data.processes.length
  ? []
  : [finding(
      'LEGACY_PROCESS_INVENTORY_COUNT_MISMATCH',
      'BLOCKING',
      'The independent process inventory count does not match the observed process records.',
      ['process-inventory'],
      'Record the count of every process in the independent inventory artifact.',
    )];

const hasIndependentInventory = (
  data: PreflightProcessData,
): boolean => Boolean(
  data.reviewedInventoryArtifactId
  && data.reviewedInventoryArtifactId === data.processInventoryArtifactId
  && isSha256Hash(data.reviewedInventoryHash)
  && data.reviewedInventoryHash === data.processInventoryHash
  && Number.isInteger(data.reviewedInventoryCount)
  && data.reviewedInventoryCount === data.processInventoryCount,
);

const manifestInventoryBindingFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => hasIndependentInventory(data)
  ? []
  : [finding(
      'LEGACY_PROCESS_MANIFEST_INVENTORY_MISMATCH',
      'BLOCKING',
      'The reviewed legacy process manifest is not bound to the complete independent process inventory artifact.',
      [data.reviewedLegacyProcessManifestArtifactId || 'legacy-process-manifest', data.processInventoryArtifactId || 'process-inventory'],
      'Generate the reviewed manifest from the separate process inventory artifact and preserve its ID, hash, and count.',
    )];

const manifestArtifactIdentityFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => !data.reviewedLegacyProcessManifestArtifactId || !data.processInventoryArtifactId
  ? [finding(
      'LEGACY_PROCESS_ARTIFACT_ID_MISSING',
      'BLOCKING',
      'The reviewed legacy process manifest and observed process inventory need separate non-empty artifact identities.',
      ['legacy-process-manifest', 'process-inventory'],
      'Record one non-empty artifact identity for each independently captured process artifact.',
    )]
  : data.reviewedLegacyProcessManifestArtifactId === data.processInventoryArtifactId
    ? [finding(
        'LEGACY_PROCESS_ARTIFACTS_NOT_INDEPENDENT',
        'BLOCKING',
        'The reviewed legacy process manifest and observed process inventory use the same artifact identity.',
        [data.reviewedLegacyProcessManifestArtifactId],
        'Capture and review the process manifest and process inventory as separate artifacts.',
      )]
    : [];

const inventoryBindingFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => [
  ...inventoryHashFindings(data),
  ...inventoryCountFindings(data),
  ...manifestInventoryBindingFindings(data),
  ...manifestArtifactIdentityFindings(data),
];
const manifestHashFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => {
  const expectedHash = hashAffiliateLegacyProcessManifest(
    data.reviewedLegacyProcesses,
    data.reviewedSystemdUnits,
  );
  return data.reviewedLegacyProcessManifestHash === expectedHash
    && isSha256Hash(data.reviewedLegacyProcessManifestHash)
    ? []
    : [finding(
        'LEGACY_PROCESS_MANIFEST_HASH_MISMATCH',
        'BLOCKING',
        'The independently reviewed legacy process manifest hash is invalid or does not match its process list and systemd unit associations.',
        ['legacy-process-manifest'],
        'Provide the exact hash from the independently reviewed legacy process manifest artifact.',
      )];
};

const manifestCountFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => Number.isInteger(data.reviewedLegacyProcessManifestCount)
  && data.reviewedLegacyProcessManifestCount === data.reviewedLegacyProcesses.length
  ? []
  : [finding(
      'LEGACY_PROCESS_MANIFEST_COUNT_MISMATCH',
      'BLOCKING',
      'The independently reviewed legacy process manifest count does not match its process list.',
      ['legacy-process-manifest'],
      'Provide the reviewed count for every legacy process in the manifest artifact.',
    )];

const manifestMissingFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => data.reviewedLegacyProcesses.length
  ? []
  : [finding(
      'LEGACY_PROCESS_MANIFEST_MISSING',
      'BLOCKING',
      'The preflight input does not contain the independently reviewed legacy process manifest.',
      ['legacy-process-manifest'],
      'Provide every legacy process ID and process class from the independently captured deployment inventory.',
    )];

const manifestEntryShapeFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => {
  const expectedIds = data.reviewedLegacyProcesses.map((process) => process.id);
  const duplicateIds = expectedIds.filter((id, index, values) => !id || values.indexOf(id) !== index);
  const invalidClasses = data.reviewedLegacyProcesses
    .filter((process) => !LEGACY_PROCESS_CLASSES.has(process.processClass))
    .map((process) => process.id || '(empty)');
  return [
    duplicateIds.length
      ? finding(
          'LEGACY_PROCESS_MANIFEST_INVALID',
          'BLOCKING',
          'The independently reviewed legacy process manifest contains an empty or duplicate process ID.',
          duplicateIds,
          'Use one non-empty manifest entry for each legacy process ID.',
        )
      : null,
    invalidClasses.length
      ? finding(
          'LEGACY_PROCESS_CLASS_INVALID',
          'BLOCKING',
          'The independently reviewed legacy process manifest contains an unknown process class.',
          invalidClasses,
          'Use MAPPING, APPROVAL, COVERAGE, INTAKE, DISCOVERY, CAPTURE, GOAL, or CONTROLLER.',
        )
      : null,
  ].filter((item): item is AffiliateCutoverFinding => item !== null);
};
const manifestSystemdUnitFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => {
  const processIds = new Set(data.reviewedLegacyProcesses.map((process) => process.id));
  const unknownProcesses = data.reviewedSystemdUnits
    .filter((unit) => !processIds.has(unit.processId))
    .map((unit) => unit.processId || '(empty)');
  const duplicateProcessIds = data.reviewedSystemdUnits
    .map((unit) => unit.processId)
    .filter((id, index, values) => !id || values.indexOf(id) !== index);
  const duplicateUnitIds = data.reviewedSystemdUnits
    .map((unit) => unit.unitId)
    .filter((id, index, values) => !id || values.indexOf(id) !== index);
  const invalid = sortedUnique([
    ...(data.reviewedSystemdUnits.length === 0 ? ['systemd-units'] : []),
    ...unknownProcesses,
    ...duplicateProcessIds,
    ...duplicateUnitIds,
  ]);
  return invalid.length
    ? [finding(
        'LEGACY_PROCESS_SYSTEMD_MAPPING_INVALID',
        'BLOCKING',
        'The reviewed legacy process manifest must contain at least one systemd unit, and every listed unit must map one unique reviewed process and unit ID.',
        invalid,
        'Record each systemd-managed legacy process with one unique processId and unitId; leave Compose/container-only processes unmapped.',
      )]
    : [];
};

const legacyServiceUnitFindings = (
  reviewedSystemdUnits: readonly AffiliateCutoverSystemdUnit[],
  serviceUnits: readonly AffiliateCutoverLegacyServiceUnit[] = [],
): AffiliateCutoverFinding[] => {
  const expectedIds = reviewedSystemdUnits.map((unit) => unit.unitId);
  const observedIds = serviceUnits.map((unit) => unit.id);
  const missing = expectedIds.filter((id) => !observedIds.includes(id));
  const unexpected = observedIds.filter((id) => !expectedIds.includes(id));
  const duplicates = observedIds.filter((id, index, values) => values.indexOf(id) !== index);
  const invalid = serviceUnits
    .filter((unit) => !['DISABLED', 'MASKED'].includes(upper(unit.isEnabled)) || upper(unit.isActive) !== 'INACTIVE')
    .map((unit) => unit.id);
  const details = sortedUnique([...missing, ...unexpected, ...duplicates, ...invalid]);
  return details.length || expectedIds.length !== observedIds.length
    ? [finding(
        'LEGACY_SERVICE_UNIT_EVIDENCE_INVALID',
        'BLOCKING',
        'Legacy service-unit evidence must contain exactly one disabled or masked and inactive row for every reviewed systemd unit.',
        details.length ? details : expectedIds,
        'Capture exact systemd is-enabled and is-active output for every reviewed legacy unit.',
      )]
    : [];
};

const reviewedManifestShapeFindings = (
  data: PreflightProcessData,
  input: AffiliateCutoverPreflightInput,
): AffiliateCutoverFinding[] => [
  ...manifestHashFindings(data),
  ...manifestCountFindings(data),
  ...(() => {
    const reviewFinding = reviewedManifestReviewFinding(input);
    return reviewFinding ? [reviewFinding] : [];
  })(),
  ...manifestMissingFindings(data),
  ...manifestEntryShapeFindings(data),
  ...manifestSystemdUnitFindings(data),
];

const legacyManifestProcessFinding = (
  expectedProcess: { id: string; processClass: string },
  processes: readonly AffiliateCutoverProcessRecord[],
): AffiliateCutoverFinding[] => {
  const matches = processes.filter((process) => process.id === expectedProcess.id);
  if (matches.length === 0) {
    return [finding(
      'LEGACY_PROCESS_MISSING',
      'BLOCKING',
      `The legacy process manifest entry ${expectedProcess.id} is missing from the process inventory.`,
      [expectedProcess.id],
      'Record the stopped process with the exact reviewed ID and class.',
    )];
  }
  const findings: AffiliateCutoverFinding[] = [];
  if (matches.length > 1) {
    findings.push(finding(
      'LEGACY_PROCESS_DUPLICATE',
      'BLOCKING',
      `The process inventory contains duplicate records for ${expectedProcess.id}.`,
      matches.map((process) => process.id),
      'Record exactly one inventory row for each reviewed legacy process.',
    ));
  }
  const [match] = matches;
  if (match.kind !== 'LEGACY') {
    findings.push(finding(
      'LEGACY_PROCESS_KIND_MISMATCH',
      'BLOCKING',
      `The reviewed legacy process ${expectedProcess.id} is not marked LEGACY.`,
      [expectedProcess.id],
      'Mark every process in the legacy manifest as LEGACY.',
    ));
  }
  if (upper(match.processClass) !== expectedProcess.processClass) {
    findings.push(finding(
      'LEGACY_PROCESS_CLASS_MISMATCH',
      'BLOCKING',
      `The legacy process ${expectedProcess.id} does not match its reviewed process class.`,
      [expectedProcess.id],
      `Record process class ${expectedProcess.processClass}.`,
    ));
  }
  return findings;
};

const legacyProcessFindings = (
  data: PreflightProcessData,
): AffiliateCutoverFinding[] => {
  const expectedIds = data.reviewedLegacyProcesses.map((process) => process.id);
  const unexpected = data.legacyProcesses.filter((process) => !expectedIds.includes(process.id));
  const missingInventory = data.legacyProcesses.length === 0
    ? [finding(
        'LEGACY_PROCESS_INVENTORY_MISSING',
        'BLOCKING',
        'The preflight inventory does not contain a legacy process record.',
        ['legacy-process-inventory'],
        'Record every stopped legacy Goal, queue, and controller process before apply.',
      )]
    : [];
  const stateFindings = data.legacyProcesses.filter((process) => upper(process.status) !== 'STOPPED').length
    ? [finding(
        'LEGACY_PROCESS_STATE_UNVERIFIED',
        'BLOCKING',
        'A legacy process does not have an explicit STOPPED status.',
        data.legacyProcesses.filter((process) => upper(process.status) !== 'STOPPED').map((process) => process.id),
        'Record an explicit STOPPED state for every legacy process before apply.',
      )]
    : [];
  const running = data.legacyProcesses.filter((process) => LEGACY_PROCESS_STATUSES.has(upper(process.status)));
  const runningFinding = running.length
    ? [finding(
        'LEGACY_PROCESS_RUNNING',
        'BLOCKING',
        'A legacy Goal, queue, or open-weight controller process is still running.',
        running.map((process) => process.id),
        'Stop the named legacy process and prove its stopped state before reconciliation apply.',
      )]
    : [];
  const unexpectedFinding = unexpected.length
    ? [finding(
        'LEGACY_PROCESS_UNEXPECTED',
        'BLOCKING',
        'The process inventory contains a legacy process that is not in the reviewed manifest.',
        unexpected.map((process) => process.id),
        'Add the process to the reviewed manifest or remove it from the inventory.',
      )]
    : [];
  return [
    ...data.reviewedLegacyProcesses.flatMap((process) => legacyManifestProcessFinding(process, data.processes)),
    ...unexpectedFinding,
    ...missingInventory,
    ...stateFindings,
    ...runningFinding,
  ];
};
const governedRoleCounts = (
  governed: readonly AffiliateCutoverProcessRecord[],
): Record<keyof typeof AFFILIATE_GOVERNED_SUPERVISOR_COUNTS, number> => Object.fromEntries(
  GOVERNED_ROLES.map((role) => [
    role,
    governed.filter((process) => upper(process.role) === role).length,
  ]),
) as Record<keyof typeof AFFILIATE_GOVERNED_SUPERVISOR_COUNTS, number>;

const governedStateFindings = (
  governed: readonly AffiliateCutoverProcessRecord[],
): AffiliateCutoverFinding[] => {
  const running = governed.filter((process) => LEGACY_PROCESS_STATUSES.has(upper(process.status)));
  const unverified = governed.filter((process) => (
    upper(process.status) !== 'STOPPED'
    && !LEGACY_PROCESS_STATUSES.has(upper(process.status))
  ));
  return [
    running.length
      ? finding(
          'GOVERNED_PROCESS_RUNNING',
          'BLOCKING',
          'A governed writer is not explicitly stopped during reconciliation.',
          running.map((process) => process.id),
          'Keep every governed writer stopped until reconciliation apply completes.',
        )
      : null,
    unverified.length
      ? finding(
          'GOVERNED_PROCESS_STATE_UNVERIFIED',
          'BLOCKING',
          'A governed writer does not have an explicit STOPPED status.',
          unverified.map((process) => process.id),
          'Record an explicit STOPPED state for every governed writer before reconciliation apply.',
        )
      : null,
  ].filter((item): item is AffiliateCutoverFinding => item !== null);
};

const governedIdentityFindings = (
  governed: readonly AffiliateCutoverProcessRecord[],
): AffiliateCutoverFinding[] => {
  const emptyIds = governed.filter((process) => !stringValue(process.id)).map(() => '(empty)');
  const ids = governed.map((process) => stringValue(process.id)).filter((id): id is string => id !== null);
  const duplicateIds = ids.filter((id, index, values) => values.indexOf(id) !== index);
  const workerIds = governed.map((process) => stringValue(process.workerId)).filter((id): id is string => id !== null);
  const duplicateWorkers = workerIds.filter((id, index, values) => values.indexOf(id) !== index);
  const withoutWorkers = governed.filter((process) => !stringValue(process.workerId));
  return [
    emptyIds.length
      ? finding(
          'GOVERNED_PROCESS_ID_MISSING',
          'BLOCKING',
          'A governed supervisor does not have a non-empty process identity.',
          emptyIds,
          'Record one non-empty process identity for every governed supervisor.',
        )
      : null,
    duplicateIds.length
      ? finding(
          'GOVERNED_PROCESS_ID_DUPLICATE',
          'BLOCKING',
          'Governed supervisors reuse a process identity.',
          duplicateIds,
          'Assign one unique process identity to each governed supervisor.',
        )
      : null,
    withoutWorkers.length
      ? finding(
          'GOVERNED_WORKER_ID_MISSING',
          'BLOCKING',
          'A governed supervisor does not have a worker identity.',
          withoutWorkers.map((process) => process.id || '(empty)'),
          'Record one persistent worker identity for every governed supervisor.',
        )
      : null,
    duplicateWorkers.length
      ? finding(
          'DUPLICATE_WORKER_IDENTITY',
          'BLOCKING',
          'Governed supervisors reuse a worker identity.',
          duplicateWorkers,
          'Assign one unique worker identity to each persistent supervisor.',
        )
      : null,
  ].filter((item): item is AffiliateCutoverFinding => item !== null);
};

const governedRoleFindings = (
  governed: readonly AffiliateCutoverProcessRecord[],
  roleCounts: Readonly<Record<keyof typeof AFFILIATE_GOVERNED_SUPERVISOR_COUNTS, number>>,
): AffiliateCutoverFinding[] => [
  ...(() => {
    const unexpected = governed.filter((process) => !GOVERNED_ROLES.includes(upper(process.role) as typeof GOVERNED_ROLES[number]));
    return unexpected.length
      ? [finding(
          'TOPOLOGY_MISMATCH',
          'BLOCKING',
          'The process inventory contains a governed supervisor with an unreviewed role.',
          unexpected.map((process) => process.id),
          'Record exactly the reviewed governed supervisor roles.',
        )]
      : [];
  })(),
  ...GOVERNED_ROLES.flatMap((role) => roleCounts[role] === AFFILIATE_GOVERNED_SUPERVISOR_COUNTS[role]
    ? []
    : [finding(
        'TOPOLOGY_MISMATCH',
        'BLOCKING',
        `Expected ${AFFILIATE_GOVERNED_SUPERVISOR_COUNTS[role]} ${role} supervisors but found ${roleCounts[role]}.`,
        governed.filter((process) => upper(process.role) === role).map((process) => process.id),
        'Provision exactly the reviewed supervisor count for this role.',
      )]),
];

const governedLauncherFindings = (
  governed: readonly AffiliateCutoverProcessRecord[],
): AffiliateCutoverFinding[] => {
  const forbidden = governed.filter((process) => /goal|codex-goal|codex-loop|pool|controller/i.test(process.command));
  return forbidden.length
    ? [finding(
        'LEGACY_LAUNCHER_CONFIGURED',
        'BLOCKING',
        'A governed supervisor still points to a legacy Goal, pool, loop, or controller launcher.',
        forbidden.map((process) => process.id),
        'Use the one-claim governed supervisor command.',
      )]
    : [];
};

const governedProcessFindings = (
  governed: readonly AffiliateCutoverProcessRecord[],
): AffiliateCutoverFinding[] => {
  const roleCounts = governedRoleCounts(governed);
  return [
    ...governedStateFindings(governed),
    ...governedIdentityFindings(governed),
    ...governedRoleFindings(governed, roleCounts),
    ...governedLauncherFindings(governed),
  ];
};
const reviewedNetworkFinding = (
  reviewedAgentNetwork: string,
): AffiliateCutoverFinding[] => reviewedAgentNetwork
  ? []
  : [finding(
      'REVIEWED_AGENT_NETWORK_MISSING',
      'BLOCKING',
      'The reviewed internal Agent Gateway network is missing.',
      ['reviewed-agent-network'],
      'Record the exact resolved internal gateway network name.',
    )];

const runnerAuthorityFinding = (
  runnerContainerId: string | null,
  forbiddenRunnerEnvironment: readonly string[],
): AffiliateCutoverFinding[] => forbiddenRunnerEnvironment.length
  ? [finding(
      'RUNNER_ROLE_AUTHORITY_EXPOSED',
      'BLOCKING',
      `The governed model runner exposes supervisor or gateway authority: ${sortedUnique(forbiddenRunnerEnvironment).join(', ')}.`,
      [runnerContainerId || 'affiliate-agent-runner', ...forbiddenRunnerEnvironment],
      'Remove role, signing, and operator credentials from the model runner container.',
    )]
  : [];

const runnerIdentityFinding = (
  runnerContainerId: string | null,
): AffiliateCutoverFinding[] => runnerContainerId
  ? []
  : [finding(
      'RUNNER_CONTAINER_ID_MISSING',
      'BLOCKING',
      'The governed model runner container does not have a non-empty identity.',
      ['affiliate-agent-runner'],
      'Record one non-empty container identity for the governed model runner.',
    )];

const forbiddenRunnerEnvironmentKeys = (
  runnerContainer: AffiliateAgentContainerInput,
): string[] => environmentEntries(runnerContainer?.environment)
  .map((entry) => entry.split('=', 1)[0])
  .filter((key) => /(?:ROLE_CREDENTIAL|WORKSPACE_SIGNING_KEY|TOKEN_SIGNING_KEY|OPERATOR_TOKEN|SUPERVISOR_HALT_CREDENTIAL|RUNNER_PROTOCOL_PRIVATE_KEY|MAPPING_PRODUCER|SUPPLY_REVIEWER|COVERAGE_PLANNER)/i.test(key));

const preflightPermissionFinding = (
  permissions: AffiliateCutoverPreflightInput['databasePermissions'],
): AffiliateCutoverFinding[] => {
  const isInvalid = permissions.isAgentAllowedToConnectProductionDatabase
    || permissions.isAgentAllowedToWriteProductionDatabase
    || permissions.isAgentAllowedToReadObjectStorage
    || permissions.isAgentAllowedToWriteObjectStorage
    || permissions.isAgentAllowedToCallProviders
    || !permissions.isGatewayAllowedToWriteProductionDatabase;
  return isInvalid
    ? [finding(
        'DATABASE_PERMISSION_BOUNDARY_FAILED',
        'BLOCKING',
        'Agent or gateway database and provider permissions do not match the governed boundary.',
        ['database-permissions'],
        'Give production write authority only to the gateway and remove direct agent access.',
      )]
    : [];
};

const liveLegacyClaimFinding = (
  claims: readonly AffiliateLegacyClaimEvidence[],
  now: Date,
): AffiliateCutoverFinding[] => {
  const liveClaims = claims.filter((claim) => claimStatusFor(claim, now) === 'ACTIVE');
  return liveClaims.length
    ? [finding(
        'LIVE_LEGACY_AUTHORITY',
        'BLOCKING',
        'Legacy claims or leases remain live at cutover.',
        liveClaims.map((claim) => claim.id),
        'Revoke every live legacy lease and rerun preflight.',
      )]
    : [];
};

const containerInventoryFinding = (
  containers: readonly AffiliateAgentContainerInput[],
  governedIds: readonly string[],
): AffiliateCutoverFinding[] => {
  const emptyIds = containers.filter((container) => !stringValue(container.id)).map(() => '(empty)');
  const containerIds = containers.map((container) => stringValue(container.id)).filter((id): id is string => id !== null);
  const duplicateIds = containerIds.filter((id, index, values) => values.indexOf(id) !== index);
  const missingIds = governedIds.filter((id) => !containerIds.includes(id));
  const unexpectedIds = containerIds.filter((id) => !governedIds.includes(id));
  const isMismatch = containerIds.length !== governedIds.length
    || duplicateIds.length > 0
    || missingIds.length > 0
    || unexpectedIds.length > 0;
  return emptyIds.length || isMismatch
    ? [finding(
        emptyIds.length ? 'CONTAINER_IDENTITY_MISSING' : 'CONTAINER_INVENTORY_MISMATCH',
        'BLOCKING',
        emptyIds.length
          ? 'An agent container does not have a non-empty identity.'
          : 'The container inventory does not contain exactly one inspection for each governed supervisor.',
        emptyIds.length
          ? emptyIds
          : sortedUnique([...duplicateIds, ...missingIds, ...unexpectedIds]),
        emptyIds.length
          ? 'Record one non-empty container identity for every governed supervisor.'
          : 'Inspect exactly one agent container whose ID matches every governed supervisor ID.',
      )]
    : [];
};

const exactInventoryFinding = (
  code: string,
  label: string,
  expectedIds: readonly string[],
  observedIds: readonly string[],
  resolution: string,
): AffiliateCutoverFinding[] => {
  const missing = expectedIds.filter((id) => !observedIds.includes(id));
  const duplicate = observedIds.filter((id, index, values) => values.indexOf(id) !== index);
  const unexpected = observedIds.filter((id) => !expectedIds.includes(id));
  const empty = observedIds.filter((id) => !id);
  const details = sortedUnique([...missing, ...duplicate, ...unexpected, ...(empty.length ? ['(empty)'] : [])]);
  return details.length || observedIds.length !== expectedIds.length
    ? [finding(
        code,
        'BLOCKING',
        `${label} must contain exactly one evidence row for every reviewed identity.`,
        details.length ? details : expectedIds,
        resolution,
      )]
    : [];
};

const controlPlaneInventoryFindings = (
  processes: readonly AffiliateCutoverControlPlaneProcess[] | undefined,
): AffiliateCutoverFinding[] => {
  const rows = processes ?? [];
  const findings = exactInventoryFinding(
    'CONTROL_PLANE_INVENTORY_MISMATCH',
    'The control-plane process inventory',
    AFFILIATE_GOVERNED_PREFLIGHT_CONTROL_PLANE_IDS,
    rows.map((process) => stringValue(process?.id) ?? ''),
    'Capture gateway, runner, readiness-helper, and replenishment-controller process IDs exactly once.',
  );
  const missingStatus = rows
    .filter((process) => !stringValue(process?.status))
    .map((process) => stringValue(process?.id) ?? '(empty)');
  const writerRows = rows.filter((process) => (
    process?.id === 'affiliate-gateway'
    || process?.id === 'affiliate-replenishment-controller'
  ));
  const runningWriters = writerRows.filter((process) => (
    LEGACY_PROCESS_STATUSES.has(upper(process.status))
  ));
  const unverifiedWriters = writerRows.filter((process) => (
    stringValue(process.status) !== null
    && upper(process.status) !== 'STOPPED'
    && upper(process.status) !== 'INACTIVE'
    && !LEGACY_PROCESS_STATUSES.has(upper(process.status))
  ));
  return [
    ...findings,
    ...(missingStatus.length
      ? [
          finding(
            'CONTROL_PLANE_EVIDENCE_MISSING',
            'BLOCKING',
            'Every control-plane process row must include a non-empty observed status.',
            sortedUnique(missingStatus),
            'Capture the exact observed status for every gateway, runner, readiness-helper, and replenishment-controller process.',
          ),
        ]
      : []),
    ...(runningWriters.length
      ? [
          finding(
            'CONTROL_PLANE_WRITER_RUNNING',
            'BLOCKING',
            'The gateway and replenishment-controller writer identities must be stopped before cutover.',
            runningWriters.map((process) => process.id),
            'Stop the gateway and replenishment-controller writers and capture their STOPPED or INACTIVE status.',
          ),
        ]
      : []),
    ...(unverifiedWriters.length
      ? [
          finding(
            'CONTROL_PLANE_WRITER_STATE_UNVERIFIED',
            'BLOCKING',
            'The gateway and replenishment-controller writer identities must have an explicit STOPPED or INACTIVE status.',
            unverifiedWriters.map((process) => process.id),
            'Capture an explicit STOPPED or INACTIVE status for the gateway and replenishment-controller writers.',
          ),
        ]
      : []),
  ];
};

const auxiliaryContainerInventoryFindings = (
  containers: readonly AffiliateAgentContainerInput[] | undefined,
): AffiliateCutoverFinding[] => exactInventoryFinding(
  'AUXILIARY_CONTAINER_INVENTORY_MISMATCH',
  'The auxiliary container inventory',
  AFFILIATE_GOVERNED_AUXILIARY_CONTAINER_IDS,
  (containers ?? []).map((container) => stringValue(container?.id) ?? ''),
  'Capture exactly one readiness-helper and one replenishment-controller container.',
);

const reusedRunnerContainerFinding = (
  runnerContainerId: string | null,
  containerIds: readonly string[],
): AffiliateCutoverFinding[] => runnerContainerId && containerIds.includes(runnerContainerId)
  ? [finding(
      'RUNNER_CONTAINER_ID_REUSED',
      'BLOCKING',
      `The governed model runner reuses supervisor container identity ${runnerContainerId}.`,
      [runnerContainerId],
      'Record a distinct container identity for the governed model runner.',
    )]
  : [];

type PreflightInspectionData = {
  supervisor: AffiliateAgentContainerInspection[];
  runner: AffiliateAgentContainerInspection | null;
  auxiliary: AffiliateAgentContainerInspection[];
  unsafe: AffiliateAgentContainerInspection[];
  unsafeCount: number;
};
const isRunnerContainerUnsafe = (
  runner: AffiliateAgentContainerInspection | null,
  runnerContainerId: string | null,
  forbiddenRunnerEnvironment: readonly string[],
): boolean => (
  runner === null
  || !runner.isSafe
  || !runnerContainerId
  || forbiddenRunnerEnvironment.length > 0
);

const preflightInspectionData = (
  input: AffiliateCutoverPreflightInput,
  reviewedAgentNetwork: string,
  runnerContainerId: string | null,
  forbiddenRunnerEnvironment: readonly string[],
): PreflightInspectionData => {
  const supervisor = input.containers.map((container) => (
    inspectAffiliateAgentContainer(container, reviewedAgentNetwork)
  ));
  const runner = input.runnerContainer
    ? inspectAffiliateAgentRunnerContainer(input.runnerContainer, reviewedAgentNetwork)
    : null;
  const auxiliary = (input.auxiliaryContainers ?? []).map((container) => (
    inspectAffiliateAuxiliaryContainer(container, reviewedAgentNetwork)
  ));
  const unsafeSupervisor = supervisor.filter((inspection) => !inspection.isSafe);
  const unsafeAuxiliary = auxiliary.filter((inspection) => !inspection.isSafe);
  const unsafe = [
    ...unsafeSupervisor,
    ...unsafeAuxiliary,
    ...(runner && !runner.isSafe ? [runner] : []),
  ];
  const runnerUnsafe = isRunnerContainerUnsafe(runner, runnerContainerId, forbiddenRunnerEnvironment);
  return {
    supervisor,
    runner,
    auxiliary,
    unsafe,
    unsafeCount: unsafe.length + (runnerUnsafe && runner?.isSafe !== false ? 1 : 0),
  };
};
const normalizedLegacyServiceUnits = (
  units: readonly AffiliateCutoverLegacyServiceUnit[] = [],
): AffiliateCutoverLegacyServiceUnit[] => units
  .map((unit) => ({
    id: stringValue(unit.id) ?? '',
    isEnabled: upper(unit.isEnabled),
    isActive: upper(unit.isActive),
  }))
  .sort((left, right) => canonicalCompare(
    `${left.id}:${left.isEnabled}:${left.isActive}`,
    `${right.id}:${right.isEnabled}:${right.isActive}`,
  ));

const normalizedPreflightManifest = (
  data: PreflightProcessData,
  input: AffiliateCutoverPreflightInput,
): Record<string, unknown> => ({
  schemaVersion: input.reviewedLegacyProcessManifest?.schemaVersion,
  artifactId: data.reviewedLegacyProcessManifestArtifactId,
  processes: data.reviewedLegacyProcesses,
  systemdUnits: data.reviewedSystemdUnits,
  processCount: data.reviewedLegacyProcessManifestCount,
  manifestHash: data.reviewedLegacyProcessManifestHash,
  inventoryArtifactId: data.reviewedInventoryArtifactId,
  inventoryHash: data.reviewedInventoryHash,
  inventoryCount: data.reviewedInventoryCount,
  reviewedAt: stringValue(input.reviewedLegacyProcessManifest?.reviewedAt),
  reviewedBy: stringValue(input.reviewedLegacyProcessManifest?.reviewedBy),
});

const normalizedContainerInspections = (
  inspections: readonly AffiliateAgentContainerInspection[],
): Array<{ id: string; inputHash: string }> => inspections
  .map((inspection) => ({ id: inspection.id, inputHash: inspection.inputHash }))
  .sort((left, right) => canonicalCompare(`${left.id}:${left.inputHash}`, `${right.id}:${right.inputHash}`));

const preflightBaseFindings = (
  input: AffiliateCutoverPreflightInput,
  data: PreflightProcessData,
  reviewedAgentNetwork: string,
  runnerContainerId: string | null,
  forbiddenRunnerEnvironment: readonly string[],
): AffiliateCutoverFinding[] => [
  ...contractSnapshotIntegrityFindings('EXPECTED', input.expected),
  ...contractSnapshotIntegrityFindings('OBSERVED', input.observed),
  ...contractMismatchFindings(input.expected, input.observed),
  ...reviewedNetworkFinding(reviewedAgentNetwork),
  ...runnerIdentityFinding(runnerContainerId),
  ...runnerAuthorityFinding(runnerContainerId, forbiddenRunnerEnvironment),
  ...inventoryBindingFindings(data),
  ...reviewedManifestShapeFindings(data, input),
  ...legacyServiceUnitFindings(data.reviewedSystemdUnits, input.legacyServiceUnits),
  ...legacyProcessFindings(data),
  ...governedProcessFindings(data.governed),
  ...preflightPermissionFinding(input.databasePermissions),
  ...liveLegacyClaimFinding(input.legacyClaims, input.now),
  ...controlPlaneInventoryFindings(input.controlPlaneProcesses),
  ...auxiliaryContainerInventoryFindings(input.auxiliaryContainers),

];
const preflightContainerFindings = (
  input: AffiliateCutoverPreflightInput,
  data: PreflightProcessData,
  inspections: PreflightInspectionData,
): AffiliateCutoverFinding[] => {
  const governedIds = data.governed
    .map((process) => stringValue(process.id))
    .filter((id): id is string => id !== null);
  const containerIds = input.containers
    .map((container) => stringValue(container.id))
    .filter((id): id is string => id !== null);
  return [
    ...containerInventoryFinding(input.containers, governedIds),
    ...reusedRunnerContainerFinding(stringValue(input.runnerContainer?.id), containerIds),
    ...inspections.unsafe.flatMap((inspection) => inspection.findings),
  ];
};

const preflightCounts = (
  data: PreflightProcessData,
  input: AffiliateCutoverPreflightInput,
  inspections: PreflightInspectionData,
): AffiliateCutoverPreflightReport['counts'] => {
  const roleCounts = governedRoleCounts(data.governed);
  return {
    mappingProducers: roleCounts.MAPPING_PRODUCER,
    supplyReviewers: roleCounts.SUPPLY_REVIEWER,
    coveragePlanners: roleCounts.COVERAGE_PLANNER,
    stoppedLegacyProcesses: data.legacyProcesses.filter((process) => upper(process.status) === 'STOPPED').length,
    runningLegacyProcesses: data.legacyProcesses.filter((process) => LEGACY_PROCESS_STATUSES.has(upper(process.status))).length,
    liveLegacyClaims: input.legacyClaims.filter((claim) => claimStatusFor(claim, input.now) === 'ACTIVE').length,
    unsafeContainers: inspections.unsafeCount,
  };
};

const preflightInputHash = (
  input: AffiliateCutoverPreflightInput,
  data: PreflightProcessData,
  reviewedAgentNetwork: string,
  inspections: PreflightInspectionData,
): string => canonicalHash({
  expected: input.expected,
  observed: input.observed,
  reviewedLegacyProcessManifest: normalizedPreflightManifest(data, input),
  processInventoryArtifactId: data.processInventoryArtifactId,
  processInventoryHash: data.processInventoryHash,
  processInventoryCount: data.processInventoryCount,
  processInventory: data.processes,
  legacyServiceUnits: normalizedLegacyServiceUnits(input.legacyServiceUnits),
  databasePermissions: input.databasePermissions,
  reviewedAgentNetwork,
  controlPlaneProcesses: (input.controlPlaneProcesses ?? [])
    .map((process) => ({
      id: stringValue(process?.id) ?? '',
      status: upper(process?.status),
    }))
    .sort((left, right) => canonicalCompare(
      `${left.id}:${left.status}`,
      `${right.id}:${right.status}`,
    )),
  runnerContainer: inspections.runner
    ? { id: inspections.runner.id, inputHash: inspections.runner.inputHash }
    : null,
  containers: normalizedContainerInspections(inspections.supervisor),
  auxiliaryContainers: normalizedContainerInspections(inspections.auxiliary),
});

const preflightReportHash = (
  evaluatedAt: string,
  inputHash: string,
  input: AffiliateCutoverPreflightInput,
  data: PreflightProcessData,
  reviewedAgentNetwork: string,
  counts: AffiliateCutoverPreflightReport['counts'],
  blockingFindings: readonly AffiliateCutoverFinding[],
  warnings: readonly AffiliateCutoverFinding[],
  resolutions: readonly AffiliateCutoverFinding[],
): string => canonicalHash({
  schemaVersion: 1,
  evaluatedAt,
  inputHash,
  supplyContractVersion: input.observed.supplyContractVersion,
  supplyContractHash: input.observed.supplyContractHash,
  deploymentContractVersion: input.observed.deploymentContractVersion,
  deploymentContractHash: input.observed.deploymentContractHash,
  gatewayVersion: input.observed.gatewayVersion,
  reviewedLegacyProcessManifestHash: data.reviewedLegacyProcessManifestHash,
  reviewedLegacyProcessManifestCount: data.reviewedLegacyProcessManifestCount,
  reviewedLegacyProcessManifestArtifactId: data.reviewedLegacyProcessManifestArtifactId,
  processInventoryArtifactId: data.processInventoryArtifactId,
  processInventoryHash: data.processInventoryHash,
  processInventoryCount: data.processInventoryCount,
  reviewedSystemdUnits: data.reviewedSystemdUnits,
  legacyServiceUnits: normalizedLegacyServiceUnits(input.legacyServiceUnits),
  reviewedAgentNetwork,
  counts,
  blockingFindings,
  warnings,
  resolutions,
});
export const buildAffiliateCutoverPreflightReport = (
  input: AffiliateCutoverPreflightInput,
): AffiliateCutoverPreflightReport => {
  const data = preflightProcessData(input);
  const reviewedAgentNetwork = stringValue(input.reviewedAgentNetwork) ?? '';
  const runnerContainerId = stringValue(input.runnerContainer?.id);
  const forbiddenRunnerEnvironment = forbiddenRunnerEnvironmentKeys(input.runnerContainer);
  const inspections = preflightInspectionData(
    input,
    reviewedAgentNetwork,
    runnerContainerId,
    forbiddenRunnerEnvironment,
  );
  const blockingFindings = sortedFindings([
    ...preflightBaseFindings(
      input,
      data,
      reviewedAgentNetwork,
      runnerContainerId,
      forbiddenRunnerEnvironment,
    ),
    ...preflightContainerFindings(input, data, inspections),
  ]);
  const warnings: AffiliateCutoverFinding[] = [];
  const resolutions = sortedFindings([...blockingFindings, ...warnings]);
  const counts = preflightCounts(data, input, inspections);
  const inputHash = preflightInputHash(input, data, reviewedAgentNetwork, inspections);
  const evaluatedAt = input.now.toISOString();
  const reportHash = preflightReportHash(
    evaluatedAt,
    inputHash,
    input,
    data,
    reviewedAgentNetwork,
    counts,
    blockingFindings,
    warnings,
    resolutions,
  );
  return {
    schemaVersion: 1,
    evaluatedAt,
    isReady: blockingFindings.length === 0,
    inputHash,
    reportHash,
    supplyContractVersion: input.observed.supplyContractVersion,
    supplyContractHash: input.observed.supplyContractHash,
    deploymentContractVersion: input.observed.deploymentContractVersion,
    deploymentContractHash: input.observed.deploymentContractHash,
    gatewayVersion: input.observed.gatewayVersion,
    reviewedLegacyProcessManifestHash: data.reviewedLegacyProcessManifestHash,
    reviewedLegacyProcessManifestCount: data.reviewedLegacyProcessManifestCount ?? 0,
    reviewedLegacyProcessManifestArtifactId: data.reviewedLegacyProcessManifestArtifactId,
    processInventoryArtifactId: data.processInventoryArtifactId,
    processInventoryHash: data.processInventoryHash,
    processInventoryCount: data.processInventoryCount,
    reviewedSystemdUnits: data.reviewedSystemdUnits,
    legacyServiceUnits: normalizedLegacyServiceUnits(input.legacyServiceUnits),
    reviewedAgentNetwork,
    blockingFindings,
    warnings,
    resolutions,
    counts,
  };
};
const preflightReportCollectionsIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => report.schemaVersion === 1
  && Array.isArray(report.blockingFindings)
  && Array.isArray(report.warnings)
  && Array.isArray(report.resolutions)
  && Boolean(report.counts);

const preflightReportManifestIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => HASH_PATTERN.test(report.reviewedLegacyProcessManifestHash)
  && Number.isInteger(report.reviewedLegacyProcessManifestCount)
  && typeof report.reviewedLegacyProcessManifestArtifactId === 'string'
  && Boolean(report.reviewedLegacyProcessManifestArtifactId.trim());

const preflightReportInventoryIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => typeof report.processInventoryArtifactId === 'string'
  && Boolean(report.processInventoryArtifactId.trim())
  && HASH_PATTERN.test(report.processInventoryHash)
  && Number.isInteger(report.processInventoryCount)
  && report.processInventoryCount >= 0
  && report.reviewedLegacyProcessManifestArtifactId !== report.processInventoryArtifactId;

const reviewedSystemdUnitsIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => {
  const units = report.reviewedSystemdUnits;
  if (!Array.isArray(units) || units.length === 0) return false;
  const processIds = units.map((unit) => stringValue(unit?.processId));
  const unitIds = units.map((unit) => stringValue(unit?.unitId));
  return processIds.every((id): id is string => id !== null)
    && unitIds.every((id): id is string => id !== null)
    && new Set(processIds).size === processIds.length
    && new Set(unitIds).size === unitIds.length;
};

const legacyServiceUnitsIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => {
  if (!reviewedSystemdUnitsIntact(report) || !Array.isArray(report.legacyServiceUnits)) return false;
  const expectedIds = report.reviewedSystemdUnits.map((unit) => unit.unitId);
  const observedIds = report.legacyServiceUnits.map((unit) => stringValue(unit?.id));
  return expectedIds.length === observedIds.length
    && observedIds.every((id): id is string => id !== null && expectedIds.includes(id))
    && new Set(observedIds).size === observedIds.length
    && report.legacyServiceUnits.every((unit) => (
      ['DISABLED', 'MASKED'].includes(upper(unit?.isEnabled))
      && upper(unit?.isActive) === 'INACTIVE'
    ));
};

const preflightReportTimestampIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => typeof report.reviewedAgentNetwork === 'string'
  && Boolean(report.reviewedAgentNetwork.trim())
  && Number.isFinite(Date.parse(report.evaluatedAt));

const preflightReportShapeIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => preflightReportCollectionsIntact(report)
  && preflightReportManifestIntact(report)
  && preflightReportInventoryIntact(report)
  && reviewedSystemdUnitsIntact(report)
  && legacyServiceUnitsIntact(report)
  && preflightReportTimestampIntact(report);

const preflightReportHashFor = (
  report: AffiliateCutoverPreflightReport,
): string => canonicalHash({
  schemaVersion: report.schemaVersion,
  evaluatedAt: report.evaluatedAt,
  inputHash: report.inputHash,
  supplyContractVersion: report.supplyContractVersion,
  supplyContractHash: report.supplyContractHash,
  deploymentContractVersion: report.deploymentContractVersion,
  deploymentContractHash: report.deploymentContractHash,
  gatewayVersion: report.gatewayVersion,
  reviewedLegacyProcessManifestHash: report.reviewedLegacyProcessManifestHash,
  reviewedLegacyProcessManifestCount: report.reviewedLegacyProcessManifestCount,
  reviewedLegacyProcessManifestArtifactId: report.reviewedLegacyProcessManifestArtifactId,
  processInventoryArtifactId: report.processInventoryArtifactId,
  processInventoryHash: report.processInventoryHash,
  processInventoryCount: report.processInventoryCount,
  reviewedSystemdUnits: normalizedSystemdUnits(report.reviewedSystemdUnits),
  legacyServiceUnits: normalizedLegacyServiceUnits(report.legacyServiceUnits),
  reviewedAgentNetwork: report.reviewedAgentNetwork,
  counts: report.counts,
  blockingFindings: report.blockingFindings,
  warnings: report.warnings,
  resolutions: report.resolutions,
});

export const isAffiliateCutoverPreflightReportIntact = (
  report: AffiliateCutoverPreflightReport,
): boolean => preflightReportShapeIntact(report)
  && report.isReady === (report.blockingFindings.length === 0)
  && report.reportHash === preflightReportHashFor(report);

export type AffiliateCutoverRollbackEvidenceInput = Readonly<{
  reviewedLegacyProcessManifest: AffiliateLegacyProcessManifest;
  /**
   * The process inventory captured and reviewed before the cutover.
   * Runtime evidence may change process status after this capture.
   */
  reviewedProcessInventory?: readonly AffiliateCutoverProcessRecord[];
  processInventory: readonly AffiliateCutoverProcessRecord[];
  runtimeProcessEvidence?: Readonly<{
    artifactId: string;
    capturedAt: string;
  }>;
  controlPlaneProcesses?: readonly Readonly<{
    id: string;
    status: string;
  }>[];
  legacyServiceUnits?: readonly Readonly<{
    id: string;
    isEnabled: string;
    isActive: string;
  }>[];
  governedReceipts: readonly unknown[];
  governedLifecycleTransitions: readonly unknown[];
  governedDemandOrWaveEvents: readonly unknown[];
  governedAuthoritativeWrites: readonly unknown[];
}>;

const hasUniqueStringValues = (values: readonly unknown[]): boolean => {
  const normalized = values
    .map((value) => stringValue(value))
    .filter((value): value is string => value !== null);
  return normalized.length === values.length
    && new Set(normalized).size === normalized.length;
};

const governedProcessShapeIsValid = (process: AffiliateCutoverProcessRecord): boolean => (
  stringValue(process.id) !== null
  && stringValue(process.workerId) !== null
  && stringValue(process.role) !== null
  && stringValue(process.command) !== null
);

const exactGovernedTopologyFor = (
  governedProcesses: readonly AffiliateCutoverProcessRecord[],
): boolean => {
  const roleCounts = new Map<string, number>();
  for (const process of governedProcesses) {
    const role = upper(process.role);
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  }
  const expectedCount = Object.values(AFFILIATE_GOVERNED_SUPERVISOR_COUNTS)
    .reduce((total, count) => total + count, 0);
  return governedProcesses.length === expectedCount
    && GOVERNED_ROLES.every((role) => (
      roleCounts.get(role) === AFFILIATE_GOVERNED_SUPERVISOR_COUNTS[role]
    ))
    && governedProcesses.every(governedProcessShapeIsValid)
    && hasUniqueStringValues(governedProcesses.map((process) => process.id))
    && hasUniqueStringValues(governedProcesses.map((process) => process.workerId));
};

const exactControlPlaneTopologyFor = (
  controlPlaneProcesses: readonly Readonly<{ id: string; status: string }>[],
): boolean => {
  const expectedIds = AFFILIATE_GOVERNED_CONTROL_PLANE_IDS;
  const observedIds = controlPlaneProcesses.map((process) => process.id);
  return controlPlaneProcesses.length === expectedIds.length
    && hasUniqueStringValues(observedIds)
    && expectedIds.every((id) => observedIds.includes(id));
};

const controlPlaneIsStopped = (
  controlPlaneProcesses: readonly Readonly<{ id: string; status: string }>[],
): boolean => exactControlPlaneTopologyFor(controlPlaneProcesses)
  && controlPlaneProcesses.every((process) => upper(process.status) === 'STOPPED');

const controlPlaneHasStartedProcess = (
  controlPlaneProcesses: readonly Readonly<{ id: string; status: string }>[],
): boolean => controlPlaneProcesses.some((process) => !['STOPPED', 'PROVISIONED', 'PENDING', 'CREATED']
  .includes(upper(process.status)));

const reviewedSystemdMappingIsValid = (
  manifest: AffiliateLegacyProcessManifest | null | undefined,
  reviewedLegacyProcesses: readonly { id: string; processClass: string }[],
): boolean => {
  const systemdUnits = manifest?.systemdUnits;
  if (!Array.isArray(systemdUnits) || systemdUnits.length === 0) return false;
  const processIds = systemdUnits.map((unit) => unit.processId);
  const unitIds = systemdUnits.map((unit) => unit.unitId);
  return systemdUnits.every((unit) => (
    stringValue(unit.processId) !== null && stringValue(unit.unitId) !== null
  ))
    && hasUniqueStringValues(processIds)
    && hasUniqueStringValues(unitIds)
    && systemdUnits.every((unit) => reviewedLegacyProcesses.some(
      (process) => process.id === unit.processId,
    ));
};

const reviewedManifestHashIsValidForRollback = (
  manifest: AffiliateLegacyProcessManifest | null | undefined,
  reviewedLegacyProcesses: readonly { id: string; processClass: string }[],
): boolean => {
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || manifest.processCount !== reviewedLegacyProcesses.length
    || !Array.isArray(manifest.systemdUnits)
  ) {
    return false;
  }
  return manifest.manifestHash === hashAffiliateLegacyProcessManifest(
    reviewedLegacyProcesses,
    manifest.systemdUnits,
  ) && reviewedSystemdMappingIsValid(manifest, reviewedLegacyProcesses);
};

const reviewedManifestInventoryIsValidForRollback = (
  manifest: AffiliateLegacyProcessManifest | null | undefined,
  reviewedProcessInventory: readonly AffiliateCutoverProcessRecord[],
): boolean => {
  if (!manifest) return false;
  return stringValue(manifest.inventoryArtifactId) !== null
    && manifest.inventoryArtifactId !== manifest.artifactId
    && manifest.inventoryHash === hashAffiliateCutoverProcessInventory(reviewedProcessInventory)
    && manifest.inventoryCount === reviewedProcessInventory.length;
};

const reviewedManifestReviewIsValidForRollback = (
  manifest: AffiliateLegacyProcessManifest | null | undefined,
): boolean => {
  if (!manifest) return false;
  return stringValue(manifest.reviewedBy) !== null
    && strictIsoDate(manifest.reviewedAt) !== null;
};

const reviewedManifestIsValidForRollback = (
  evidence: AffiliateCutoverRollbackEvidenceInput,
  reviewedLegacyProcesses: readonly { id: string; processClass: string }[],
  reviewedProcessInventory: readonly AffiliateCutoverProcessRecord[],
): boolean => {
  const manifest = evidence.reviewedLegacyProcessManifest;
  const serviceUnits = Array.isArray(evidence.legacyServiceUnits)
    ? evidence.legacyServiceUnits
    : [];
  return reviewedManifestHashIsValidForRollback(manifest, reviewedLegacyProcesses)
    && reviewedManifestInventoryIsValidForRollback(manifest, reviewedProcessInventory)
    && reviewedManifestReviewIsValidForRollback(manifest)
    && legacyServiceUnitFindings(manifest.systemdUnits, serviceUnits).length === 0;
};

const legacyInventoryMatchesReviewed = (
  legacyProcesses: readonly AffiliateCutoverProcessRecord[],
  reviewedLegacyProcesses: readonly { id: string; processClass: string }[],
): boolean => {
  const reviewedKeys = new Set(
    reviewedLegacyProcesses.map((process) => `${process.id}:${process.processClass}`),
  );
  const observedKeys = legacyProcesses.map((process) => (
    `${stringValue(process.id) ?? ''}:${upper(process.processClass)}`
  ));
  return legacyProcesses.length === reviewedLegacyProcesses.length
    && hasUniqueStringValues(observedKeys)
    && observedKeys.every((key) => reviewedKeys.has(key));
};

const governedWriteExists = (evidence: AffiliateCutoverRollbackEvidenceInput): boolean => (
  evidence.governedReceipts.length > 0
  || evidence.governedLifecycleTransitions.length > 0
  || evidence.governedDemandOrWaveEvents.length > 0
  || evidence.governedAuthoritativeWrites.length > 0
);

type ReviewedRollbackEvidence = {
  reviewedLegacyProcesses: Array<{ id: string; processClass: string }>;
  reviewedProcessInventory: readonly AffiliateCutoverProcessRecord[];
  reviewedManifestValid: boolean;
};

const reviewedRollbackEvidenceFor = (
  evidence: AffiliateCutoverRollbackEvidenceInput,
): ReviewedRollbackEvidence => {
  const reviewedLegacyProcesses = normalizedLegacyProcessManifest(
    evidence.reviewedLegacyProcessManifest?.processes ?? [],
  );
  const reviewedProcessInventory = evidence.reviewedProcessInventory ?? evidence.processInventory;
  return {
    reviewedLegacyProcesses,
    reviewedProcessInventory,
    reviewedManifestValid: reviewedManifestIsValidForRollback(
      evidence,
      reviewedLegacyProcesses,
      reviewedProcessInventory,
    ),
  };
};

const legacyFleetStoppedForRollback = (
  legacyProcesses: readonly AffiliateCutoverProcessRecord[],
  reviewedLegacyProcesses: readonly { id: string; processClass: string }[],
  reviewedManifestValid: boolean,
): boolean => reviewedManifestValid
  && legacyInventoryMatchesReviewed(legacyProcesses, reviewedLegacyProcesses)
  && legacyProcesses.length > 0
  && legacyProcesses.every((process) => upper(process.status) === 'STOPPED');

const governedFleetStartedForRollback = (
  governedProcesses: readonly AffiliateCutoverProcessRecord[],
  controlPlaneProcesses: readonly Readonly<{ id: string; status: string }>[],
): boolean => governedProcesses.some(
  (process) => !['STOPPED', 'PROVISIONED', 'PENDING', 'CREATED'].includes(upper(process.status)),
) || controlPlaneHasStartedProcess(controlPlaneProcesses);

const governedFleetStoppedForRollback = (
  governedProcesses: readonly AffiliateCutoverProcessRecord[],
  controlPlaneProcesses: readonly Readonly<{ id: string; status: string }>[],
): boolean => exactGovernedTopologyFor(governedProcesses)
  && governedProcesses.every((process) => upper(process.status) === 'STOPPED')
  && controlPlaneIsStopped(controlPlaneProcesses);

export const buildAffiliateCutoverRollbackInput = (
  evidence: AffiliateCutoverRollbackEvidenceInput,
): AffiliateCutoverRollbackInput => {
  const legacyProcesses = evidence.processInventory.filter((process) => process.kind === 'LEGACY');
  const governedProcesses = evidence.processInventory.filter((process) => process.kind === 'GOVERNED');
  const controlPlaneProcesses = evidence.controlPlaneProcesses ?? [];
  const reviewed = reviewedRollbackEvidenceFor(evidence);
  const hasGovernedWrite = governedWriteExists(evidence);
  return {
    isLegacyFleetStopped: legacyFleetStoppedForRollback(
      legacyProcesses,
      reviewed.reviewedLegacyProcesses,
      reviewed.reviewedManifestValid,
    ),
    isGovernedFleetStarted: governedFleetStartedForRollback(governedProcesses, controlPlaneProcesses),
    isGovernedFleetStopped: governedFleetStoppedForRollback(governedProcesses, controlPlaneProcesses),
    hasGovernedReceipt: evidence.governedReceipts.length > 0,
    hasGovernedLifecycleTransition: evidence.governedLifecycleTransitions.length > 0,
    hasGovernedDemandOrWaveEvent: evidence.governedDemandOrWaveEvents.length > 0,
    hasGovernedAuthoritativeWrite: hasGovernedWrite && evidence.governedAuthoritativeWrites.length > 0,
  };
};


export type AffiliateCutoverRollbackInput = Readonly<{
  isLegacyFleetStopped: boolean;
  isGovernedFleetStarted: boolean;
  isGovernedFleetStopped: boolean;
  hasGovernedReceipt: boolean;
  hasGovernedLifecycleTransition: boolean;
  hasGovernedDemandOrWaveEvent: boolean;
  hasGovernedAuthoritativeWrite: boolean;
}>;

export type AffiliateCutoverRollbackReasonCode =
  | 'LEGACY_FLEET_NOT_STOPPED'
  | 'GOVERNED_FLEET_NOT_STOPPED'
  | 'FORWARD_ONLY_BOUNDARY_REACHED';

export type AffiliateCutoverRollbackDecision = Readonly<{
  mode: 'BINARY_ROLLBACK_ALLOWED' | 'FORWARD_ONLY' | 'BLOCKED';
  reasonCode: AffiliateCutoverRollbackReasonCode | null;
  detail: string;
  resolution: string;
}>;

export const decideAffiliateCutoverRollback = (
  input: AffiliateCutoverRollbackInput,
): AffiliateCutoverRollbackDecision => {
  if (
    input.hasGovernedReceipt
    || input.hasGovernedLifecycleTransition
    || input.hasGovernedDemandOrWaveEvent
    || input.hasGovernedAuthoritativeWrite
  ) {
    return {
      mode: 'FORWARD_ONLY',
      reasonCode: 'FORWARD_ONLY_BOUNDARY_REACHED',
      detail: 'A governed receipt, transition, demand/wave event, or authoritative write exists.',
      resolution: 'Pause new admission. Repair through governed lifecycle and reconciliation commands.',
    };
  }
  if (!input.isLegacyFleetStopped) {
    return {
      mode: 'BLOCKED',
      reasonCode: 'LEGACY_FLEET_NOT_STOPPED',
      detail: 'The legacy fleet is not stopped with the exact reviewed process manifest.',
      resolution: 'Stop every old writer. Inventory every old writer against the reviewed manifest before any rollback decision.',
    };
  }
  if (input.isGovernedFleetStarted && input.isGovernedFleetStopped) {
    return {
      mode: 'BLOCKED',
      reasonCode: 'GOVERNED_FLEET_NOT_STOPPED',
      detail: 'Governed fleet evidence is contradictory: it is both started and stopped.',
      resolution: 'Capture one consistent governed topology and process-status inventory before binary rollback.',
    };
  }
  if (!input.isGovernedFleetStopped) {
    return {
      mode: 'BLOCKED',
      reasonCode: 'GOVERNED_FLEET_NOT_STOPPED',
      detail: 'The governed fleet is not proved stopped with the exact reviewed topology.',
      resolution: 'Stop every governed supervisor and record the exact two/two/one inventory before binary rollback.',
    };
  }
  return {
    mode: 'BINARY_ROLLBACK_ALLOWED',
    reasonCode: null,
    detail: 'No governed fleet write exists and both reviewed fleets are proved stopped.',
    resolution: 'Keep both fleets stopped. Roll back the governed binaries without rewriting data.',
  };
};

export const isAffiliateCutoverHash = (value: unknown): value is string => (
  typeof value === 'string' && HASH_PATTERN.test(value)
);
