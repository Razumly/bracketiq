import { hashAffiliateAgentValue } from './agentGatewayContracts';
import { normalizeAffiliateSupplyIdentity } from './affiliateSupplyLifecycle';

export const AFFILIATE_GOVERNED_SUPERVISOR_COUNTS = Object.freeze({
  MAPPING_PRODUCER: 2,
  SUPPLY_REVIEWER: 2,
  COVERAGE_PLANNER: 1,
} as const);

const GOVERNED_ROLES = Object.keys(AFFILIATE_GOVERNED_SUPERVISOR_COUNTS) as Array<keyof typeof AFFILIATE_GOVERNED_SUPERVISOR_COUNTS>;
const PUBLIC_TARGET_STATUSES = new Set(['PUBLISHED', 'LAST_KNOWN_GOOD']);
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
const EXPIRED_CLAIM_STATUSES = new Set(['EXPIRED', 'REVOKED']);
const LEGACY_PROCESS_STATUSES = new Set(['RUNNING', 'STARTING', 'HEALTHY']);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(
  values.map((value) => value.trim()).filter(Boolean),
)).sort();

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
  status: string;
  leaseExpiresAt?: Date | string | null;
  tokenExpiresAt?: Date | string | null;
}>;

export type AffiliateLegacyReconciliationInput = Readonly<{
  now: Date;
  sources: readonly AffiliateLegacySourceEvidence[];
  roots: readonly AffiliateLegacyRootEvidence[];
  records: readonly AffiliateLegacyLineageRecord[];
  targets: readonly AffiliateLegacyTargetEvidence[];
  claims: readonly AffiliateLegacyClaimEvidence[];
}>;

export type AffiliateCutoverFinding = Readonly<{
  code: string;
  severity: 'BLOCKING' | 'WARNING';
  detail: string;
  recordIds: readonly string[];
  resolution: string;
}>;

export type AffiliateLegacyTargetProjection = Readonly<{
  sourceTargetId: string;
  candidateId: string | null;
  targetType: string;
  targetId: string;
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
  evidenceRefs: readonly string[];
}>;

export type AffiliateLegacyRootPlan = Readonly<{
  sourceIds: readonly string[];
  existingRootId: string | null;
  identityKey: string | null;
  canonicalUrl: string | null;
  origin: string | null;
  pathKey: string | null;
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

const rootMatchesIdentity = (
  root: AffiliateLegacyRootEvidence,
  identity: ReturnType<typeof normalizeAffiliateSupplyIdentity>,
): boolean => root.identityKey === identity.identityKey || root.pathKey === identity.pathKey;

const claimStatusFor = (
  claim: AffiliateLegacyClaimEvidence,
  now: Date,
): AffiliateLegacyClaimAction['status'] => {
  const status = upper(claim.status);
  if (!ACTIVE_CLAIM_STATUSES.has(status)) {
    return EXPIRED_CLAIM_STATUSES.has(status) ? 'EXPIRED' : 'TERMINAL';
  }
  const leaseExpiresAt = dateFrom(claim.leaseExpiresAt ?? claim.tokenExpiresAt);
  return leaseExpiresAt && leaseExpiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE';
};

const inputPreimageFor = (input: AffiliateLegacyReconciliationInput): unknown => ({
  schemaVersion: 1,
  sources: [...input.sources].sort((a, b) => a.id.localeCompare(b.id)).map((source) => ({
    ...source,
    requestedUrl: stringValue(source.requestedUrl),
    resolvedCanonicalUrl: stringValue(source.resolvedCanonicalUrl),
    evidenceRefs: sortedUnique(source.evidenceRefs ?? []),
  })),
  roots: [...input.roots].sort((a, b) => a.id.localeCompare(b.id)),
  records: [...input.records].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
  targets: [...input.targets].sort((a, b) => a.id.localeCompare(b.id)).map((target) => ({
    ...target,
    status: upper(target.status),
    evidenceRefs: sortedUnique(target.evidenceRefs ?? []),
  })),
  claims: [...input.claims].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)).map((claim) => ({
    ...claim,
    status: upper(claim.status),
    leaseExpiresAt: isoDate(claim.leaseExpiresAt),
    tokenExpiresAt: isoDate(claim.tokenExpiresAt),
  })),
});

export const buildAffiliateLegacyReconciliationReport = (
  input: AffiliateLegacyReconciliationInput,
): AffiliateLegacyReconciliationReport => {
  const sources = [...input.sources].sort((a, b) => a.id.localeCompare(b.id));
  const roots = [...input.roots].sort((a, b) => a.id.localeCompare(b.id));
  const records = [...input.records].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  const targets = [...input.targets].sort((a, b) => a.id.localeCompare(b.id));
  const claims = [...input.claims].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  const blockingFindings: AffiliateCutoverFinding[] = [];
  const warnings: AffiliateCutoverFinding[] = [];
  const rootById = new Map(roots.map((root) => [root.id, root]));
  const rootIdsByIdentity = new Map<string, string[]>();

  for (const root of roots) {
    const key = root.identityKey || root.pathKey;
    const ids = rootIdsByIdentity.get(key) ?? [];
    ids.push(root.id);
    rootIdsByIdentity.set(key, ids);
  }
  for (const [identityKey, ids] of rootIdsByIdentity) {
    if (ids.length > 1) {
      blockingFindings.push(finding(
        'DUPLICATE_SUPPLY_ROOT',
        'BLOCKING',
        `Multiple Supply Source roots share identity ${identityKey}.`,
        ids,
        'Choose one exact source identity and link the other root as an explicit predecessor or successor before apply.',
      ));
    }
  }

  const sourceIdentity = new Map<string, ReturnType<typeof normalizeAffiliateSupplyIdentity>>();
  const sourceRoot = new Map<string, AffiliateLegacyRootEvidence | null>();
  const sourcePlanAction = new Map<string, AffiliateLegacyRootPlan['action']>();
  const sourceIdsByIdentity = new Map<string, string[]>();

  for (const source of sources) {
    const identity = identityFor(source);
    if (!identity) {
      blockingFindings.push(finding(
        'IDENTITY_UNVERIFIABLE',
        'BLOCKING',
        `Source ${source.id} has no valid evidence-backed public URL.`,
        [source.id],
        'Provide a verified canonical URL or an explicit predecessor/successor identity link.',
      ));
      sourceRoot.set(source.id, null);
      sourcePlanAction.set(source.id, 'REVIEW_REQUIRED');
      continue;
    }
    sourceIdentity.set(source.id, identity);
    const byExplicitId = source.existingSupplySourceId ? rootById.get(source.existingSupplySourceId) : undefined;
    const matches = roots.filter((root) => rootMatchesIdentity(root, identity));
    const matchingRoots = byExplicitId && !matches.some((root) => root.id === byExplicitId.id)
      ? [...matches, byExplicitId]
      : matches;
    if (matchingRoots.length > 1) {
      blockingFindings.push(finding(
        'DUPLICATE_SUPPLY_ROOT',
        'BLOCKING',
        `Source ${source.id} resolves to more than one Supply Source root.`,
        matchingRoots.map((root) => root.id).concat(source.id),
        'Resolve the exact source identity before apply.',
      ));
    }
    if (source.existingSupplySourceId && !byExplicitId) {
      blockingFindings.push(finding(
        'SUPPLY_SOURCE_LINK_MISSING',
        'BLOCKING',
        `Source ${source.id} points to missing Supply Source ${source.existingSupplySourceId}.`,
        [source.id, source.existingSupplySourceId],
        'Restore the referenced root or remove the stale link with an operator decision.',
      ));
    }
    const root = byExplicitId ?? matchingRoots[0] ?? null;
    let action: AffiliateLegacyRootPlan['action'] = root ? 'REUSE_ROOT' : 'CREATE_ROOT';
    if (source.predecessorSupplySourceId) {
      const predecessor = rootById.get(source.predecessorSupplySourceId);
      if (!predecessor) {
        blockingFindings.push(finding(
          'PREDECESSOR_ROOT_MISSING',
          'BLOCKING',
          `Source ${source.id} names a missing predecessor root.`,
          [source.id, source.predecessorSupplySourceId],
          'Restore the predecessor root or provide a reviewed identity record.',
        ));
      } else if (predecessor.origin !== identity.origin) {
        action = 'CREATE_SUCCESSOR';
      } else if (predecessor.canonicalUrl !== identity.canonicalUrl && source.isRedirectVerified !== true) {
        action = 'REVIEW_REQUIRED';
        blockingFindings.push(finding(
          'CANONICAL_AMBIGUITY',
          'BLOCKING',
          `Source ${source.id} changed its canonical path without verified redirect evidence.`,
          [source.id, predecessor.id],
          'Verify the same-origin redirect or create a reviewed successor identity.',
        ));
      }
    }
    if (action === 'CREATE_ROOT' && root) action = 'REUSE_ROOT';
    sourceRoot.set(source.id, root ?? {
      id: `planned:${identity.identityKey}`,
      identityKey: identity.identityKey,
      canonicalUrl: identity.canonicalUrl,
      origin: identity.origin,
      pathKey: identity.pathKey,
    });
    const identityKey = identity.identityKey;
    const ids = sourceIdsByIdentity.get(identityKey) ?? [];
    ids.push(source.id);
    sourceIdsByIdentity.set(identityKey, ids);
    sourcePlanAction.set(source.id, action);
  }
 
  const sourceIdsByRoot = new Map<string, string[]>();
  for (const source of sources) {
    const root = sourceRoot.get(source.id);
    if (!root) continue;
    const ids = sourceIdsByRoot.get(root.id) ?? [];
    ids.push(source.id);
    sourceIdsByRoot.set(root.id, ids);
  }
 
  const recordIdsBySource = new Map<string, string[]>();
  const recordRootById = new Map<string, AffiliateLegacyRootEvidence | null>();
  const recordsByKind: Record<string, number> = {};
  for (const record of records) {
    recordsByKind[record.kind] = (recordsByKind[record.kind] ?? 0) + 1;
    const bySource = record.sourceId ? sourceRoot.get(record.sourceId) ?? null : null;
    const byRoot = record.supplySourceId ? rootById.get(record.supplySourceId) ?? null : null;
    if (record.sourceId && !sourceIdentity.has(record.sourceId)) {
      blockingFindings.push(finding(
        'MISSING_LINEAGE',
        'BLOCKING',
        `Record ${record.id} references missing source ${record.sourceId}.`,
        [record.id, record.sourceId],
        'Link the record to a known source or record an explicit predecessor/successor identity.',
      ));
    }
    if (bySource && byRoot && bySource.id !== byRoot.id) {
      blockingFindings.push(finding(
        'LINEAGE_ROOT_MISMATCH',
        'BLOCKING',
        `Record ${record.id} points to two different Supply Source roots.`,
        [record.id, bySource.id, byRoot.id],
        'Resolve the conflicting root link before apply.',
      ));
    }
    const root = bySource ?? byRoot;
    recordRootById.set(record.id, root);
    if (!root) {
      blockingFindings.push(finding(
        'MISSING_LINEAGE',
        'BLOCKING',
        `Record ${record.id} cannot resolve to a Supply Source root.`,
        [record.id],
        'Link the record to a source root or record an explicit predecessor/successor identity.',
      ));
      continue;
    }
    const sourceId = record.sourceId ?? sourceIdsByRoot.get(root.id)?.[0];
    if (sourceId) {
      const ids = recordIdsBySource.get(sourceId) ?? [];
      ids.push(record.id);
      recordIdsBySource.set(sourceId, ids);
    }
  }

  const targetsBySource = new Map<string, AffiliateLegacyTargetProjection[]>();
  for (const target of targets) {
    const root = target.sourceId
      ? sourceRoot.get(target.sourceId) ?? null
      : target.supplySourceId
        ? rootById.get(target.supplySourceId) ?? null
        : null;
    const targetId = stringValue(target.targetId);
    if (!root) {
      blockingFindings.push(finding(
        'MISSING_LINEAGE',
        'BLOCKING',
        `Public target ${target.id} cannot resolve to a Supply Source root.`,
        [target.id],
        'Link the target to its source root before apply.',
      ));
      continue;
    }
    if (!targetId) {
      blockingFindings.push(finding(
        'PUBLIC_TARGET_ID_MISSING',
        'BLOCKING',
        `Public target ${target.id} has no target ID.`,
        [target.id],
        'Identify the existing public record before apply.',
      ));
      continue;
    }
    const targetType = normalizedTargetType(target.targetType);
    if (!['EVENT', 'TEAM', 'FACILITY', 'ORGANIZATION'].includes(targetType)) {
      blockingFindings.push(finding(
        'PUBLIC_TARGET_KIND_INVALID',
        'BLOCKING',
        `Public target ${target.id} has unsupported kind ${target.targetType}.`,
        [target.id],
        'Classify the target as EVENT, RENTAL, TEAM, or CLUB before apply.',
      ));
      continue;
    }
    const status = upper(target.status);
    const isVerifiable = target.isEvidenceVerifiable === true || PUBLIC_TARGET_STATUSES.has(status);
    const projectionStatus = status === 'REJECTED'
      ? 'REJECTED'
      : isVerifiable
        ? (status === 'LAST_KNOWN_GOOD' ? 'LAST_KNOWN_GOOD' : 'PUBLISHED')
        : 'LAST_KNOWN_GOOD';
    const action = projectionStatus === 'REJECTED'
      ? 'PRESERVE_REJECTED_TARGET'
      : isVerifiable
        ? 'PRESERVE_PUBLIC_TARGET'
        : 'MARK_LAST_KNOWN_GOOD';
    const projection: AffiliateLegacyTargetProjection = {
      sourceTargetId: target.id,
      candidateId: stringValue(target.candidateId),
      targetType,
      targetId,
      status: projectionStatus,
      action,
      evidenceRefs: sortedUnique([
        ...(target.evidenceRefs ?? []),
        `legacy-target:${target.id}`,
        `public-target:${targetType}:${targetId}`,
      ]),
    };
    const sourceKey = target.sourceId ?? sourceIdsByRoot.get(root.id)?.[0] ?? root.id;
    const targetList = targetsBySource.get(sourceKey) ?? [];
    targetList.push(projection);
    targetsBySource.set(sourceKey, targetList);
  }

  const claimActions: AffiliateLegacyClaimAction[] = [];
  const liveClaimKeys = new Map<string, string[]>();
  for (const claim of claims) {
    const status = claimStatusFor(claim, input.now);
    const root = claim.sourceId
      ? sourceRoot.get(claim.sourceId) ?? null
      : claim.supplySourceId
        ? rootById.get(claim.supplySourceId) ?? null
        : null;
    const subject = claim.subjectId ?? root?.id ?? claim.sourceId ?? claim.id;
    const key = `${claim.role ?? claim.kind}:${subject}`;
    if (status === 'ACTIVE') {
      const ids = liveClaimKeys.get(key) ?? [];
      ids.push(claim.id);
      liveClaimKeys.set(key, ids);
    }
    const lease = dateFrom(claim.leaseExpiresAt ?? claim.tokenExpiresAt);
    const action = status === 'ACTIVE'
      ? 'BLOCK_APPLY'
      : status === 'EXPIRED'
        ? 'REVOKE_EXPIRED'
        : 'NO_ACTION';
    const evidenceRefs = sortedUnique([
      `legacy-claim:${claim.kind}:${claim.id}`,
      ...(claim.sourceId ? [`source:${claim.sourceId}`] : []),
      ...(claim.supplySourceId ? [`supply-source:${claim.supplySourceId}`] : []),
      ...(lease ? [`lease-expires:${lease.toISOString()}`] : []),
    ]);
    claimActions.push({
      id: claim.id,
      kind: claim.kind,
      status,
      action,
      sourceId: stringValue(claim.sourceId),
      supplySourceId: stringValue(claim.supplySourceId),
      evidenceRefs,
    });
    if (status === 'ACTIVE' && !lease) {
      blockingFindings.push(finding(
        'CLAIM_WITHOUT_EXPIRY',
        'BLOCKING',
        `Active legacy claim ${claim.id} has no lease or token expiry.`,
        [claim.id],
        'Revoke the claim manually and record the authority resolution before apply.',
      ));
    } else if (status === 'ACTIVE') {
      blockingFindings.push(finding(
        'ACTIVE_LEGACY_CLAIM',
        'BLOCKING',
        `Active legacy claim ${claim.id} still has write authority.`,
        [claim.id],
        'Stop the old fleet and revoke or resolve the live claim before apply.',
      ));
    }
  }
  for (const [key, ids] of liveClaimKeys) {
    if (ids.length > 1) {
      blockingFindings.push(finding(
        'DUPLICATE_ACTIVE_CLAIMS',
        'BLOCKING',
        `Multiple active legacy claims share authority key ${key}.`,
        ids,
        'Revoke every duplicate and leave one reviewed authority before apply.',
      ));
    }
  }

  const plansByIdentity = new Map<string, AffiliateLegacyRootPlan>();
  for (const source of sources) {
    const identity = sourceIdentity.get(source.id);
    const root = sourceRoot.get(source.id) ?? null;
    const identityKey = identity?.identityKey ?? null;
    const planKey = identityKey ?? `source:${source.id}`;
    const existing = plansByIdentity.get(planKey);
    const action = sourcePlanAction.get(source.id) ?? 'REVIEW_REQUIRED';
    const targetProjections = targetsBySource.get(source.id) ?? (root ? targetsBySource.get(root.id) ?? [] : []);
    const recordIds = [
      source.id,
      ...((recordIdsBySource.get(source.id) ?? [])),
    ];
    const evidenceRefs = sortedUnique([
      `legacy-source:${source.id}`,
      ...(source.evidenceRefs ?? []),
      ...targetProjections.flatMap((target) => target.evidenceRefs),
    ]);
    if (existing) {
      plansByIdentity.set(planKey, {
        ...existing,
        sourceIds: sortedUnique([...existing.sourceIds, source.id]),
        recordIds: sortedUnique([...existing.recordIds, ...recordIds]),
        targetProjections: [...existing.targetProjections, ...targetProjections].sort((a, b) => a.sourceTargetId.localeCompare(b.sourceTargetId)),
        evidenceRefs: sortedUnique([...existing.evidenceRefs, ...evidenceRefs]),
        action: existing.action === 'REVIEW_REQUIRED' || action === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : existing.action,
      });
      continue;
    }
    plansByIdentity.set(planKey, {
      sourceIds: [source.id],
      existingRootId: root?.id ?? null,
      identityKey,
      canonicalUrl: identity?.canonicalUrl ?? root?.canonicalUrl ?? null,
      origin: identity?.origin ?? root?.origin ?? null,
      pathKey: identity?.pathKey ?? root?.pathKey ?? null,
      action,
      predecessorId: stringValue(source.predecessorSupplySourceId),
      recordIds: sortedUnique(recordIds),
      targetProjections: targetProjections.sort((a, b) => a.sourceTargetId.localeCompare(b.sourceTargetId)),
      evidenceRefs,
    });
  }

  const rootPlans = Array.from(plansByIdentity.values()).sort((a, b) => (
    `${a.identityKey ?? ''}:${a.sourceIds[0]}`.localeCompare(`${b.identityKey ?? ''}:${b.sourceIds[0]}`)
  ));
  const allFindings = [...blockingFindings, ...warnings];
  const recordsByKindSorted = Object.fromEntries(Object.entries(recordsByKind).sort(([a], [b]) => a.localeCompare(b)));
  const counts: AffiliateLegacyReconciliationCounts = {
    sources: sources.length,
    roots: rootPlans.length,
    rootsToCreate: rootPlans.filter((root) => root.action === 'CREATE_ROOT').length,
    rootsToReuse: rootPlans.filter((root) => root.action === 'REUSE_ROOT').length,
    successorsToCreate: rootPlans.filter((root) => root.action === 'CREATE_SUCCESSOR').length,
    lineageRecords: records.length,
    linkedRecords: records.filter((record) => recordRootById.get(record.id) !== null).length,
    unresolvedRecords: records.filter((record) => recordRootById.get(record.id) === null).length,
    preservedPublicTargets: rootPlans.reduce((sum, root) => sum + root.targetProjections.length, 0),
    lastKnownGoodTargets: rootPlans.reduce((sum, root) => sum + root.targetProjections.filter((target) => target.status === 'LAST_KNOWN_GOOD').length, 0),
    rejectedTargets: rootPlans.reduce((sum, root) => sum + root.targetProjections.filter((target) => target.status === 'REJECTED').length, 0),
    claims: claims.length,
    activeClaims: claimActions.filter((claim) => claim.status === 'ACTIVE').length,
    expiredClaims: claimActions.filter((claim) => claim.status === 'EXPIRED').length,
    terminalClaims: claimActions.filter((claim) => claim.status === 'TERMINAL').length,
    claimsToRevoke: claimActions.filter((claim) => claim.action === 'REVOKE_EXPIRED').length,
    blockingFindings: blockingFindings.length,
    warningFindings: warnings.length,
    recordsByKind: recordsByKindSorted,
  };
  const inputHash = canonicalHash(inputPreimageFor(input));
  const outputPreimage = {
    schemaVersion: 1,
    roots: rootPlans,
    claimActions,
    counts,
    blockingFindings,
    warnings,
  };
  const outputHash = canonicalHash(outputPreimage);
  const resolutions = allFindings.map((item) => ({ ...item })).sort((a, b) => `${a.code}:${a.recordIds.join(',')}`.localeCompare(`${b.code}:${b.recordIds.join(',')}`));
  const reportHash = canonicalHash({ schemaVersion: 1, inputHash, outputHash, counts, roots: rootPlans, claimActions, blockingFindings, warnings, resolutions });
  return {
    schemaVersion: 1,
    evaluatedAt: input.now.toISOString(),
    isApplySafe: blockingFindings.length === 0,
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

export type AffiliateCutoverProcessRecord = Readonly<{
  id: string;
  kind: 'LEGACY' | 'GOVERNED';
  role?: string;
  workerId?: string;
  command: string;
  status: string;
}>;

export type AffiliateAgentContainerInput = Readonly<{
  id: string;
  name?: string;
  user?: string | null;
  readonlyRootFilesystem?: boolean;
  environment?: readonly string[] | Readonly<Record<string, string>>;
  networks?: readonly string[];
  capDrop?: readonly string[];
  securityOptions?: readonly string[];
}>;

export type AffiliateAgentContainerInspection = Readonly<{
  id: string;
  name: string | null;
  isSafe: boolean;
  findings: readonly AffiliateCutoverFinding[];
  inputHash: string;
}>;

export type AffiliateCutoverPreflightInput = Readonly<{
  now: Date;
  expected: AffiliateCutoverContractSnapshot;
  observed: AffiliateCutoverContractSnapshot;
  processInventory: readonly AffiliateCutoverProcessRecord[];
  legacyClaims: readonly AffiliateLegacyClaimEvidence[];
  databasePermissions: Readonly<{
    agentCanConnectProductionDatabase: boolean;
    agentCanWriteProductionDatabase: boolean;
    agentCanReadObjectStorage: boolean;
    agentCanWriteObjectStorage: boolean;
    agentCanCallProviders: boolean;
    gatewayCanWriteProductionDatabase: boolean;
  }>;
  containers: readonly AffiliateAgentContainerInput[];
}>;

export type AffiliateCutoverPreflightReport = Readonly<{
  schemaVersion: 1;
  evaluatedAt: string;
  isReady: boolean;
  inputHash: string;
  reportHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
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
}>;

const environmentEntries = (
  environment: AffiliateAgentContainerInput['environment'],
): string[] => {
  if (Array.isArray(environment)) return [...environment];
  return Object.entries(environment ?? {}).map(([key, value]) => `${key}=${value}`);
};

export const inspectAffiliateAgentContainer = (
  input: AffiliateAgentContainerInput,
): AffiliateAgentContainerInspection => {
  const findings: AffiliateCutoverFinding[] = [];
  const environment = environmentEntries(input.environment);
  const forbiddenEnvironment = /(?:^|=)(?:postgres(?:ql)?|mysql|redis):\/\//i;
  const forbiddenName = /(?:DATABASE_URL|DIRECT_URL|DO_SPACES|AWS_ACCESS|AWS_SECRET|GITHUB_TOKEN|SCRAPINGDOG|FIRECRAWL|SMTP|STRIPE|JWT_SECRET|NEXTAUTH|PRISMA|REPOSITORY_GIT|PRODUCTION_BACKEND)/i;
  const forbidden = environment
    .map((entry) => ({ entry, key: entry.split('=', 1)[0] }))
    .filter(({ key, entry }) => forbiddenName.test(key) || forbiddenEnvironment.test(entry))
    .map(({ key }) => key);
  if (forbidden.length) {
    findings.push(finding(
      'FORBIDDEN_AGENT_CREDENTIAL',
      'BLOCKING',
      `Agent container ${input.id} exposes forbidden production authority: ${sortedUnique(forbidden).join(', ')}.`,
      [input.id, ...forbidden],
      'Remove the secret or route the operation through the internal Agent Gateway.',
    ));
  }
  const networks = (input.networks ?? []).map(upper);
  if (networks.some((network) => network === 'PRODUCTION_BACKEND' || network === 'DATABASE' || network === 'STORAGE')) {
    findings.push(finding(
      'PRODUCTION_NETWORK_ACCESS',
      'BLOCKING',
      `Agent container ${input.id} is attached to a production authority network.`,
      [input.id],
      'Attach the container only to the internal Agent Gateway network.',
    ));
  }
  const user = stringValue(input.user);
  const isRoot = user === '0' || user === '0:0' || user?.startsWith('root:') === true;
  const hasAllCapabilitiesDropped = (input.capDrop ?? []).some((capability) => upper(capability) === 'ALL');
  const hasNoNewPrivileges = (input.securityOptions ?? []).some((option) => upper(option).replace(/[-_]/g, '') === 'NO_NEW_PRIVILEGES');
  if (isRoot || input.readonlyRootFilesystem !== true || !hasAllCapabilitiesDropped || !hasNoNewPrivileges) {
    findings.push(finding(
      'CONTAINER_PRIVILEGE',
      'BLOCKING',
      `Agent container ${input.id} does not prove a non-root, read-only, capability-reduced boundary.`,
      [input.id],
      'Use a non-root user, a read-only root filesystem, cap_drop ALL, and no-new-privileges.',
    ));
  }
  const inputHash = canonicalHash({
    ...input,
    environment: environment.sort(),
    networks: networks.sort(),
    capDrop: [...(input.capDrop ?? [])].sort(),
    securityOptions: [...(input.securityOptions ?? [])].sort(),
  });
  return {
    id: input.id,
    name: stringValue(input.name),
    isSafe: findings.length === 0,
    findings,
    inputHash,
  };
};

const contractMismatchFindings = (
  expected: AffiliateCutoverContractSnapshot,
  observed: AffiliateCutoverContractSnapshot,
): AffiliateCutoverFinding[] => {
  const findings: AffiliateCutoverFinding[] = [];
  if (expected.supplyContractVersion !== observed.supplyContractVersion || expected.supplyContractHash !== observed.supplyContractHash) {
    findings.push(finding(
      'SUPPLY_CONTRACT_MISMATCH',
      'BLOCKING',
      'Observed Supply Contract version or hash differs from the reviewed manifest.',
      [expected.supplyContractHash, observed.supplyContractHash],
      'Activate the exact reviewed Supply Contract or produce a new reviewed report.',
    ));
  }
  if (expected.deploymentContractVersion !== observed.deploymentContractVersion || expected.deploymentContractHash !== observed.deploymentContractHash) {
    findings.push(finding(
      'DEPLOYMENT_CONTRACT_MISMATCH',
      'BLOCKING',
      'Observed deployment contract version or hash differs from the reviewed manifest.',
      [expected.deploymentContractHash, observed.deploymentContractHash],
      'Deploy the exact reviewed gateway and role topology contract.',
    ));
  }
  if (expected.gatewayVersion !== observed.gatewayVersion) {
    findings.push(finding(
      'GATEWAY_VERSION_MISMATCH',
      'BLOCKING',
      'Observed gateway version differs from the reviewed deployment contract.',
      [String(expected.gatewayVersion), String(observed.gatewayVersion)],
      'Run the reviewed gateway binary.',
    ));
  }
  for (const role of sortedUnique(Object.keys(expected.roleContractHashes))) {
    if (expected.roleContractHashes[role] !== observed.roleContractHashes[role]) {
      findings.push(finding(
        'ROLE_CONTRACT_MISMATCH',
        'BLOCKING',
        `Role contract hash differs for ${role}.`,
        [role, expected.roleContractHashes[role] ?? '', observed.roleContractHashes[role] ?? ''],
        'Deploy the reviewed role contract bundle.',
      ));
    }
  }
  for (const role of sortedUnique(Object.keys(expected.promptTemplateHashes))) {
    if (expected.promptTemplateHashes[role] !== observed.promptTemplateHashes[role]) {
      findings.push(finding(
        'PROMPT_TEMPLATE_MISMATCH',
        'BLOCKING',
        `Prompt template hash differs for ${role}.`,
        [role, expected.promptTemplateHashes[role] ?? '', observed.promptTemplateHashes[role] ?? ''],
        'Deploy the reviewed prompt-template bundle.',
      ));
    }
  }
  return findings;
};

export const buildAffiliateCutoverPreflightReport = (
  input: AffiliateCutoverPreflightInput,
): AffiliateCutoverPreflightReport => {
  const blockingFindings: AffiliateCutoverFinding[] = [...contractMismatchFindings(input.expected, input.observed)];
  const warnings: AffiliateCutoverFinding[] = [];
  const processes = [...input.processInventory].sort((a, b) => a.id.localeCompare(b.id));
  const runningLegacy = processes.filter((process) => process.kind === 'LEGACY' && LEGACY_PROCESS_STATUSES.has(upper(process.status)));
  const stoppedLegacy = processes.filter((process) => process.kind === 'LEGACY' && upper(process.status) === 'STOPPED');
  if (runningLegacy.length) {
    blockingFindings.push(finding(
      'LEGACY_PROCESS_RUNNING',
      'BLOCKING',
      'A legacy Goal, queue, or open-weight controller process is still running.',
      runningLegacy.map((process) => process.id),
      'Stop the named legacy process and prove its stopped state before reconciliation apply.',
    ));
  }
  const governed = processes.filter((process) => process.kind === 'GOVERNED');
  const roleCounts = Object.fromEntries(GOVERNED_ROLES.map((role) => [
    role,
    governed.filter((process) => upper(process.role) === role).length,
  ])) as Record<keyof typeof AFFILIATE_GOVERNED_SUPERVISOR_COUNTS, number>;
  const governedWorkerIds = governed
    .map((process) => process.workerId)
    .filter((workerId): workerId is string => Boolean(workerId));
  const duplicateWorkers = governedWorkerIds.filter((workerId, index, values) => (
    values.indexOf(workerId) !== index
  ));
  for (const role of GOVERNED_ROLES) {
    if (roleCounts[role] !== AFFILIATE_GOVERNED_SUPERVISOR_COUNTS[role]) {
      blockingFindings.push(finding(
        'TOPOLOGY_MISMATCH',
        'BLOCKING',
        `Expected ${AFFILIATE_GOVERNED_SUPERVISOR_COUNTS[role]} ${role} supervisors but found ${roleCounts[role]}.`,
        governed.filter((process) => upper(process.role) === role).map((process) => process.id),
        'Provision exactly the reviewed supervisor count for this role.',
      ));
    }
  }
  if (duplicateWorkers.length) {
    blockingFindings.push(finding(
      'DUPLICATE_WORKER_IDENTITY',
      'BLOCKING',
      'Governed supervisors reuse a worker identity.',
      duplicateWorkers,
      'Assign one unique worker identity to each persistent supervisor.',
    ));
  }
  const forbiddenCommands = governed.filter((process) => /goal|codex-goal|codex-loop|pool|controller/i.test(process.command));
  if (forbiddenCommands.length) {
    blockingFindings.push(finding(
      'LEGACY_LAUNCHER_CONFIGURED',
      'BLOCKING',
      'A governed supervisor still points to a legacy Goal, pool, loop, or controller launcher.',
      forbiddenCommands.map((process) => process.id),
      'Use the one-claim governed supervisor command.',
    ));
  }
  const liveClaims = input.legacyClaims.filter((claim) => claimStatusFor(claim, input.now) === 'ACTIVE');
  if (liveClaims.length) {
    blockingFindings.push(finding(
      'LIVE_LEGACY_AUTHORITY',
      'BLOCKING',
      'Legacy claims or leases remain live at cutover.',
      liveClaims.map((claim) => claim.id),
      'Revoke every live legacy lease and rerun preflight.',
    ));
  }
  const permissions = input.databasePermissions;
  if (
    permissions.agentCanConnectProductionDatabase
    || permissions.agentCanWriteProductionDatabase
    || permissions.agentCanReadObjectStorage
    || permissions.agentCanWriteObjectStorage
    || permissions.agentCanCallProviders
    || !permissions.gatewayCanWriteProductionDatabase
  ) {
    blockingFindings.push(finding(
      'DATABASE_PERMISSION_BOUNDARY_FAILED',
      'BLOCKING',
      'Agent or gateway database and provider permissions do not match the governed boundary.',
      ['database-permissions'],
      'Give production write authority only to the gateway and remove direct agent access.',
    ));
  }
  const containerInspections = input.containers.map(inspectAffiliateAgentContainer);
  const unsafeContainers = containerInspections.filter((inspection) => !inspection.isSafe);
  blockingFindings.push(...unsafeContainers.flatMap((inspection) => inspection.findings));
  const resolutions = [...blockingFindings, ...warnings]
    .map((item) => ({ ...item }))
    .sort((a, b) => `${a.code}:${a.recordIds.join(',')}`.localeCompare(`${b.code}:${b.recordIds.join(',')}`));
  const inputHash = canonicalHash({
    expected: input.expected,
    observed: input.observed,
    processInventory: processes,
    legacyClaims: input.legacyClaims,
    databasePermissions: input.databasePermissions,
    containers: input.containers,
  });
  const counts = {
    mappingProducers: roleCounts.MAPPING_PRODUCER,
    supplyReviewers: roleCounts.SUPPLY_REVIEWER,
    coveragePlanners: roleCounts.COVERAGE_PLANNER,
    stoppedLegacyProcesses: stoppedLegacy.length,
    runningLegacyProcesses: runningLegacy.length,
    liveLegacyClaims: liveClaims.length,
    unsafeContainers: unsafeContainers.length,
  } as const;
  const reportHash = canonicalHash({ schemaVersion: 1, inputHash, counts, blockingFindings, warnings, resolutions });
  return {
    schemaVersion: 1,
    evaluatedAt: input.now.toISOString(),
    isReady: blockingFindings.length === 0,
    inputHash,
    reportHash,
    deploymentContractVersion: input.observed.deploymentContractVersion,
    deploymentContractHash: input.observed.deploymentContractHash,
    blockingFindings,
    warnings,
    resolutions,
    counts,
  };
};

export type AffiliateCutoverRollbackInput = Readonly<{
  legacyFleetStopped: boolean;
  governedFleetStarted: boolean;
  hasGovernedReceipt: boolean;
  hasGovernedLifecycleTransition: boolean;
}>;

export type AffiliateCutoverRollbackDecision = Readonly<{
  mode: 'BINARY_ROLLBACK_ALLOWED' | 'FORWARD_ONLY' | 'BLOCKED';
  detail: string;
  resolution: string;
}>;

export const decideAffiliateCutoverRollback = (
  input: AffiliateCutoverRollbackInput,
): AffiliateCutoverRollbackDecision => {
  if (!input.legacyFleetStopped) {
    return {
      mode: 'BLOCKED',
      detail: 'The legacy fleet is not stopped.',
      resolution: 'Stop and inventory every old writer before any rollback decision.',
    };
  }
  if (input.hasGovernedReceipt || input.hasGovernedLifecycleTransition) {
    return {
      mode: 'FORWARD_ONLY',
      detail: 'A governed receipt or lifecycle transition exists.',
      resolution: 'Pause new admission and repair through governed lifecycle and reconciliation commands.',
    };
  }
  return {
    mode: 'BINARY_ROLLBACK_ALLOWED',
    detail: input.governedFleetStarted
      ? 'The governed fleet started but has not written governed state.'
      : 'No governed fleet write exists.',
    resolution: 'Keep both fleets stopped and roll back the governed binaries without rewriting data.',
  };
};

export const isAffiliateCutoverHash = (value: unknown): value is string => (
  typeof value === 'string' && HASH_PATTERN.test(value)
);
