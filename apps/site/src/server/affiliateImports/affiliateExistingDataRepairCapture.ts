import {
  hashAffiliateAgentValue,
  type AffiliateAgentContractBundle,
} from './agentGatewayContracts';
import {
  hasAffiliateExistingDataRepairCorrectionHold,
  pendingMappingForMetadata,
} from './affiliateExistingDataRepairState';
import {
  AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE,
  affiliateExistingRepairAuthoritySnapshot,
  affiliateExistingRepairCaptureSnapshot,
  processNextAffiliateSourceIntakeRun,
  queueAffiliateSourceIntakeRun,
  type AffiliateExistingDataRepairEvidenceOnlyMarker,
  type AffiliateSourceIntakeProcessingDependencies,
} from './sourceIntake';
import { affiliateDiscoveryPolicyKeyForUrl } from './sourceDiscoveryRules';
const ACTIVE_RUN_STATUSES: Readonly<Record<string, true>> = {
  QUEUED: true,
  RUNNING: true,
  CLAIMED: true,
};

export const AFFILIATE_EXISTING_REPAIR_CAPTURE_SCHEMA_VERSION = 1 as const;
export type AffiliateExistingRepairCaptureContractBinding = Readonly<{
  supplyContractVersion: number;
  supplyContractHash: string;
  deploymentContractVersion: number;
  deploymentContractHash: string;
}>;

const contractBindingFor = (
  bundle: AffiliateAgentContractBundle,
): AffiliateExistingRepairCaptureContractBinding => ({
  supplyContractVersion: bundle.supplyContract.version,
  supplyContractHash: bundle.supplyContract.hash,
  deploymentContractVersion: bundle.deploymentContract.version,
  deploymentContractHash: bundle.deploymentContract.hash,
});

const sameContractBinding = (
  left: unknown,
  right: AffiliateExistingRepairCaptureContractBinding,
): boolean => {
  const value = record(left);
  return value.supplyContractVersion === right.supplyContractVersion
    && value.supplyContractHash === right.supplyContractHash
    && value.deploymentContractVersion === right.deploymentContractVersion
    && value.deploymentContractHash === right.deploymentContractHash;
};

export const AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_TARGETS = 20 as const;
export const AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_PAGES_PER_TARGET = 3 as const;
export type AffiliateExistingRepairCaptureTarget = Readonly<{
  intakeId: string;
  pageIds: readonly string[];
}>;

export type PreviewAffiliateExistingRepairCaptureInput = Readonly<{
  prisma: unknown;
  bundle: AffiliateAgentContractBundle;
  targets: readonly AffiliateExistingRepairCaptureTarget[];
  reason: string;
  operatorId: string;
}>;

export type ApplyAffiliateExistingRepairCaptureInput = Readonly<{
  prisma: unknown;
  bundle: AffiliateAgentContractBundle;
  targets: readonly AffiliateExistingRepairCaptureTarget[];
  reason: string;
  operatorId: string;
  expectedReportHash: string;
}>;

export type ProcessAffiliateExistingRepairCaptureInput = Readonly<{
  prisma: unknown;
  bundle: AffiliateAgentContractBundle;
  runId: string;
  operatorId: string;
  dependencies?: Omit<AffiliateSourceIntakeProcessingDependencies, 'db' | 'workerId'>;
}>;

export type AffiliateExistingRepairCaptureRow = Readonly<{
  intakeId: string;
  pageIds: readonly string[];
  eligible: boolean;
  reasonCodes: readonly string[];
  stateFingerprint: string;
  runId: string | null;
}>;

export type AffiliateExistingRepairCaptureCounts = Readonly<{
  total: number;
  eligible: number;
  held: number;
  selected: number;
  alreadyAdmitted: number;
}>;

export type AffiliateExistingRepairCaptureWrite = Readonly<{
  intakeId: string;
  pageIds: readonly string[];
  runId: string;
}>;

export type AffiliateExistingRepairCaptureReport = Readonly<{
  schemaVersion: 1;
  mode: 'PREVIEW' | 'APPLY';
  evaluatedAt: string;
  reason: string;
  operatorId: string;
  contract: AffiliateExistingRepairCaptureContractBinding;
  counts: AffiliateExistingRepairCaptureCounts;
  rows: readonly AffiliateExistingRepairCaptureRow[];
  proposedWrites: readonly AffiliateExistingRepairCaptureWrite[];
  reportHash: string;
  writeCount: number;
  runIds: readonly string[];
  replayed: boolean;
}>;

export type PreviewAffiliateExistingRepairCaptureReport = AffiliateExistingRepairCaptureReport & {
  mode: 'PREVIEW';
};

export type ApplyAffiliateExistingRepairCaptureReport = AffiliateExistingRepairCaptureReport & {
  mode: 'APPLY';
};

export type AffiliateExistingRepairCaptureProcessResult = Readonly<{
  schemaVersion: 1;
  runId: string;
  intakeId: string;
  status: string;
  replayed: boolean;
  summary: unknown;
  result: unknown;
}>;

export class AffiliateExistingDataRepairCaptureError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'AffiliateExistingDataRepairCaptureError';
    this.code = code;
    this.details = details;
  }
}

type Delegate = Record<string, unknown>;
type Database = Record<string, unknown>;
type IntakeRow = Record<string, unknown>;
type PageRow = Record<string, unknown>;
type RunRow = Record<string, unknown>;
type PolicyRow = Record<string, unknown>;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
type CaptureBaseline = Readonly<{
  schemaVersion: 1;
  requestReason: string;
  recordFingerprint: string;
  intakeFingerprint: string;
  pageFingerprints: Readonly<Record<string, string>>;
  contract: AffiliateExistingRepairCaptureContractBinding;
  authoritySnapshot?: Readonly<Record<string, unknown>>;
  authorityFingerprint?: string;
  reviewedRow?: Readonly<Record<string, unknown>>;
}>;

type LoadedTargetState = Readonly<{
  target: AffiliateExistingRepairCaptureTarget;
  intake: IntakeRow | null;
  pages: readonly PageRow[];
  runs: readonly RunRow[];
  policy: PolicyRow | null;
  policies: readonly PolicyRow[];
  source: IntakeRow | null;
  roots: readonly IntakeRow[];
  gatewayJobs: readonly RunRow[];
  gatewayClaims: readonly RunRow[];
  pendingMapping: unknown;
  baseline: CaptureBaseline | null;
  stateFingerprint: string;
  scopeReasonCodes: readonly string[];
}>;

type InternalCaptureRow = AffiliateExistingRepairCaptureRow & Readonly<{
  baseline: CaptureBaseline | null;
  priorMarker: AffiliateExistingDataRepairEvidenceOnlyMarker | null;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const stringList = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    : []
);

const sortedUnique = (values: readonly string[]): string[] => Array.from(new Set(values)).sort();

const sameStringList = (left: unknown, right: unknown): boolean => {
  const normalizedLeft = sortedUnique(stringList(left));
  const normalizedRight = sortedUnique(stringList(right));
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const databaseFor = (client: unknown): Database => {
  if (!client || typeof client !== 'object') {
    throw new AffiliateExistingDataRepairCaptureError(
      'PERSISTENCE_UNAVAILABLE',
      'A Prisma client is required for existing data repair capture.',
    );
  }
  return client as Database;
};

const delegateFor = (database: Database, name: string): Delegate | null => {
  const delegate = database[name];
  return isRecord(delegate) ? delegate : null;
};

const invoke = async <T>(
  delegate: Delegate | null,
  method: string,
  args: Record<string, unknown>,
  required = true,
): Promise<T | null> => {
  const candidate = delegate?.[method];
  if (typeof candidate !== 'function') {
    if (!required) return null;
    throw new AffiliateExistingDataRepairCaptureError(
      'PERSISTENCE_UNAVAILABLE',
      `Prisma delegate does not provide ${method}.`,
      { method },
    );
  }
  const callable = candidate as (...values: readonly unknown[]) => unknown;
  return await callable.call(delegate, args) as T;
};

const transaction = async <T>(client: unknown, callback: (database: Database) => Promise<T>): Promise<T> => {
  const database = databaseFor(client);
  const transactionMethod = database.$transaction;
  if (typeof transactionMethod !== 'function') return callback(database);
  const callable = transactionMethod as (...values: readonly unknown[]) => unknown;
  const result = await callable.call(
    database,
    async (transactionClient: unknown) => callback(databaseFor(transactionClient)),
    { isolationLevel: 'Serializable' },
  );
  return result as T;
};

const normalizeReason = (value: unknown): string => {
  const reason = textValue(value);
  if (!reason) {
    throw new AffiliateExistingDataRepairCaptureError(
      'REASON_REQUIRED',
      'A repair reason is required.',
    );
  }
  if (Buffer.byteLength(reason, 'utf8') > 1_000) {
    throw new AffiliateExistingDataRepairCaptureError(
      'REASON_INVALID',
      'A repair reason must not exceed 1,000 UTF-8 bytes.',
    );
  }
  return reason;
};

const normalizeOperatorId = (value: unknown): string => {
  const operatorId = textValue(value);
  if (!operatorId) {
    throw new AffiliateExistingDataRepairCaptureError(
      'OPERATOR_REQUIRED',
      'An operator ID is required for existing data repair capture.',
    );
  }
  if (Buffer.byteLength(operatorId, 'utf8') > 320) {
    throw new AffiliateExistingDataRepairCaptureError(
      'OPERATOR_INVALID',
      'An operator ID is too long.',
    );
  }
  return operatorId;
};

const normalizeId = (value: unknown, label: string): string => {
  const id = textValue(value);
  if (!id) {
    throw new AffiliateExistingDataRepairCaptureError(
      'TARGET_INVALID',
      `${label} is required.`,
    );
  }
  return id;
};

const normalizeTargets = (
  targets: readonly AffiliateExistingRepairCaptureTarget[] | null | undefined,
): AffiliateExistingRepairCaptureTarget[] => {
  if (!Array.isArray(targets) || !targets.length) {
    throw new AffiliateExistingDataRepairCaptureError(
      'TARGETS_REQUIRED',
      'At least one existing intake target is required.',
    );
  }
  const merged = new Map<string, Set<string>>();
  for (const target of targets) {
    const intakeId = normalizeId(target?.intakeId, 'intakeId');
    const pageIds = sortedUnique(stringList(target?.pageIds));
    if (!pageIds.length) {
      throw new AffiliateExistingDataRepairCaptureError(
        'PAGE_IDS_REQUIRED',
        `At least one existing page is required for intake ${intakeId}.`,
      );
    }
    if (pageIds.length > AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_PAGES_PER_TARGET) {
      throw new AffiliateExistingDataRepairCaptureError(
        'PAGE_LIMIT_EXCEEDED',
        `At most ${AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_PAGES_PER_TARGET} existing pages may be refreshed per intake.`,
        { intakeId },
      );
    }
    const existing = merged.get(intakeId) ?? new Set<string>();
    pageIds.forEach((pageId) => existing.add(pageId));
    if (existing.size > AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_PAGES_PER_TARGET) {
      throw new AffiliateExistingDataRepairCaptureError(
        'PAGE_LIMIT_EXCEEDED',
        `At most ${AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_PAGES_PER_TARGET} existing pages may be refreshed per intake.`,
        { intakeId },
      );
    }
    merged.set(intakeId, existing);
  }
  if (merged.size > AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_TARGETS) {
    throw new AffiliateExistingDataRepairCaptureError(
      'TARGET_LIMIT_EXCEEDED',
      `At most ${AFFILIATE_EXISTING_REPAIR_CAPTURE_MAX_TARGETS} existing intakes may be refreshed per request.`,
    );
  }
  return Array.from(merged.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([intakeId, pageIds]) => ({ intakeId, pageIds: Array.from(pageIds).sort() }));
};

const normalizeHash = (value: unknown): string => {
  const hash = textValue(value)?.toLowerCase() ?? '';
  if (!HASH_PATTERN.test(hash)) {
    throw new AffiliateExistingDataRepairCaptureError(
      'REPORT_HASH_REQUIRED',
      'expectedReportHash must be a SHA-256 hash.',
    );
  }
  return hash;
};

const normalizedTargetObject = (targets: readonly AffiliateExistingRepairCaptureTarget[]) => (
  targets.map((target) => ({ intakeId: target.intakeId, pageIds: [...target.pageIds] }))
);

const markerFromRun = (run: RunRow): AffiliateExistingDataRepairEvidenceOnlyMarker | null => {
  const candidate = record(run.summary).existingDataRepairEvidenceOnly;
  if (!isRecord(candidate)) return null;
  const rawPageIds = candidate.pageIds;
  const pageIds = stringList(rawPageIds);
  if (
    candidate.schemaVersion !== 1
    || candidate.purpose !== AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE
    || !textValue(candidate.requestHash)
    || !textValue(candidate.operatorId)
    || !textValue(candidate.intakeId)
    || !Array.isArray(rawPageIds)
    || pageIds.length !== rawPageIds.length
    || !Object.prototype.hasOwnProperty.call(candidate, 'baseline')
  ) return null;
  return {
    schemaVersion: 1,
    purpose: AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE,
    requestHash: String(candidate.requestHash),
    operatorId: String(candidate.operatorId),
    intakeId: String(candidate.intakeId),
    pageIds,
    baseline: candidate.baseline,
  };
};

const markerBaseline = (marker: AffiliateExistingDataRepairEvidenceOnlyMarker): CaptureBaseline | null => {
  const baseline = record(marker.baseline);
  const pageFingerprintsValue = record(baseline.pageFingerprints);
  const contractValue = record(baseline.contract);
  const recordFingerprint = textValue(baseline.recordFingerprint);
  const intakeFingerprint = textValue(baseline.intakeFingerprint);
  const requestReason = textValue(baseline.requestReason);
  const supplyContractHash = textValue(contractValue.supplyContractHash);
  const deploymentContractHash = textValue(contractValue.deploymentContractHash);
  const supplyContractVersion = contractValue.supplyContractVersion;
  const deploymentContractVersion = contractValue.deploymentContractVersion;
  if (
    !recordFingerprint
    || !intakeFingerprint
    || !requestReason
    || !supplyContractHash
    || !deploymentContractHash
    || typeof supplyContractVersion !== 'number'
    || typeof deploymentContractVersion !== 'number'
  ) return null;
  const pageFingerprints: Record<string, string> = {};
  for (const [pageId, fingerprint] of Object.entries(pageFingerprintsValue)) {
    const value = textValue(fingerprint);
    if (value) pageFingerprints[pageId] = value;
  }
  const authoritySnapshot = isRecord(baseline.authoritySnapshot)
    ? baseline.authoritySnapshot
    : undefined;
  const authorityFingerprint = textValue(baseline.authorityFingerprint) ?? undefined;
  const reviewedRow = isRecord(baseline.reviewedRow) ? baseline.reviewedRow : undefined;
  return {
    schemaVersion: 1,
    requestReason,
    recordFingerprint,
    intakeFingerprint,
    pageFingerprints,
    contract: {
      supplyContractVersion,
      supplyContractHash,
      deploymentContractHash,
      deploymentContractVersion,
    },
    ...(authoritySnapshot ? { authoritySnapshot } : {}),
    ...(authorityFingerprint ? { authorityFingerprint } : {}),
    ...(reviewedRow ? { reviewedRow } : {}),
  };
};

const isoOrNull = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  return textValue(value);
};


const runSnapshot = (run: RunRow): Record<string, unknown> => ({
  id: textValue(run.id),
  intakeId: textValue(run.intakeId),
  status: textValue(run.status),
  requestedPageIds: sortedUnique(stringList(run.requestedPageIds)),
  requestedByUserId: textValue(run.requestedByUserId),
  provider: textValue(run.provider),
  workerId: textValue(run.workerId),
  claimedAt: isoOrNull(run.claimedAt),
  startedAt: isoOrNull(run.startedAt),
});

const policySnapshot = (policy: PolicyRow | null): Record<string, unknown> => ({
  status: textValue(policy?.status),
  expiresAt: isoOrNull(policy?.expiresAt),
  policyKey: textValue(policy?.policyKey),
});

const loadMany = async <T extends Record<string, unknown>>(
  delegate: Delegate | null,
  where: Record<string, unknown>,
): Promise<T[]> => {
  const rows = await invoke<unknown[]>(delegate, 'findMany', { where });
  if (!Array.isArray(rows) || rows.some((row) => !isRecord(row))) {
    throw new AffiliateExistingDataRepairCaptureError('PERSISTENCE_UNAVAILABLE', 'Capture state queries must return complete record rows.');
  }
  return rows as T[];
};

const loadOne = async <T extends Record<string, unknown>>(
  delegate: Delegate | null,
  where: Record<string, unknown>,
): Promise<T | null> => {
  const row = await invoke<unknown>(delegate, 'findUnique', { where });
  if (row === null) return null;
  if (!isRecord(row)) throw new AffiliateExistingDataRepairCaptureError('PERSISTENCE_UNAVAILABLE', 'Capture record lookup returned invalid state.');
  return row as T;
};

const policyKeysFor = (
  intake: IntakeRow | null,
  pages: readonly PageRow[],
): string[] => Array.from(new Set([
  textValue(intake?.baseUrl),
  ...pages.map((page) => textValue(page.canonicalUrl) ?? textValue(page.url)),
].filter((url): url is string => Boolean(url)).map((url) => {
  try {
    return affiliateDiscoveryPolicyKeyForUrl(url);
  } catch {
    return null;
  }
}).filter((key): key is string => Boolean(key))));

const loadPolicies = async (
  database: Database,
  intake: IntakeRow | null,
  pages: readonly PageRow[] = [],
): Promise<PolicyRow[]> => {
  const policyKeys = policyKeysFor(intake, pages);
  if (!policyKeys.length) return [];
  return loadMany<PolicyRow>(
    delegateFor(database, 'affiliateSourceDomainPolicies'),
    { policyKey: { in: policyKeys } },
  );
};

const recordBaselineFor = (
  reason: string,
  intake: IntakeRow | null,
  pages: readonly PageRow[],
  source: IntakeRow | null,
  roots: readonly IntakeRow[],
  policies: readonly PolicyRow[],
  contract: AffiliateExistingRepairCaptureContractBinding,
): CaptureBaseline | null => {
  if (!intake) return null;
  const { intake: intakeValue, pages: pageValues } = affiliateExistingRepairCaptureSnapshot(intake, pages);
  const pageFingerprints = Object.fromEntries(
    pageValues.map((page) => [String(page.id), hashAffiliateAgentValue(page)]),
  );
  const intakeFingerprint = hashAffiliateAgentValue(intakeValue);
  const authoritySnapshot = affiliateExistingRepairAuthoritySnapshot(
    intake,
    pages,
    source,
    roots,
    policies,
  );
  return {
    schemaVersion: 1,
    requestReason: reason,
    intakeFingerprint,
    pageFingerprints,
    recordFingerprint: hashAffiliateAgentValue({ intake: intakeValue, pages: pageValues }),
    authoritySnapshot,
    authorityFingerprint: hashAffiliateAgentValue(authoritySnapshot),
    contract,
  };
};

const loadTargetStates = async (
  client: unknown,
  targets: readonly AffiliateExistingRepairCaptureTarget[],
  reason: string,
  contract: AffiliateExistingRepairCaptureContractBinding,
  options: Readonly<{ excludeRunId?: string }> = {},
): Promise<LoadedTargetState[]> => {
  const database = databaseFor(client);
  const intakeDelegate = delegateFor(database, 'affiliateSourceIntakes');
  const pageDelegate = delegateFor(database, 'affiliateSourceIntakePages');
  const runDelegate = delegateFor(database, 'affiliateSourceIntakeRuns');
  const sourceDelegate = delegateFor(database, 'affiliateScrapeSources');
  const gatewayJobDelegate = delegateFor(database, 'affiliateAgentGatewayJobs');
  const gatewayClaimDelegate = delegateFor(database, 'affiliateAgentGatewayClaims');
  const intakeIds = targets.map((target) => target.intakeId);
  const pageIds = sortedUnique(targets.flatMap((target) => [...target.pageIds]));
  const intakeRows = await loadMany<IntakeRow>(intakeDelegate, { id: { in: intakeIds } });
  const pageRows = await loadMany<PageRow>(pageDelegate, { id: { in: pageIds } });
  const runRows = await loadMany<RunRow>(runDelegate, { intakeId: { in: intakeIds } });
  const sourceIds = sortedUnique(
    intakeRows.map((intake) => textValue(intake.affiliateSourceId))
      .filter((id): id is string => Boolean(id)),
  );
  const sourceKeys = sortedUnique(
    intakeRows
      .filter((intake) => !textValue(intake.affiliateSourceId))
      .map((intake) => textValue(intake.sourceKey))
      .filter((key): key is string => Boolean(key)),
  );
  const sourceWhere = sourceIds.length && sourceKeys.length
    ? { OR: [{ id: { in: sourceIds } }, { sourceKey: { in: sourceKeys } }] }
    : sourceIds.length
      ? { id: { in: sourceIds } }
      : { sourceKey: { in: sourceKeys } };
  const sourceRows = await loadMany<IntakeRow>(
    sourceDelegate,
    sourceWhere,
  );
  const supplySourceIds = sortedUnique([
    ...intakeRows.map((intake) => textValue(intake.supplySourceId)),
    ...pageRows.map((page) => textValue(page.supplySourceId)),
    ...sourceRows.map((source) => textValue(source.supplySourceId)),
  ].filter((id): id is string => Boolean(id)));
  const rootRows = await loadMany<IntakeRow>(
    delegateFor(database, 'affiliateSupplySources'),
    { id: { in: supplySourceIds } },
  );
  const gatewayJobRows = await loadMany<RunRow>(gatewayJobDelegate, {
    supplySourceId: { in: supplySourceIds },
  });
  const gatewayClaimRows = await loadMany<RunRow>(gatewayClaimDelegate, { status: 'ACTIVE' });
  const intakeById = new Map(intakeRows.map((intake) => [String(intake.id), intake]));
  const pageById = new Map(pageRows.map((page) => [String(page.id), page]));
  const rootById = new Map(rootRows.map((root) => [String(root.id), root]));
  const runsByIntakeId = new Map<string, RunRow[]>();
  for (const run of runRows) {
    const intakeId = textValue(run.intakeId);
    if (!intakeId) continue;
    const rows = runsByIntakeId.get(intakeId) ?? [];
    rows.push(run);
    runsByIntakeId.set(intakeId, rows);
  }
  const states: LoadedTargetState[] = [];
  for (const target of targets) {
    const intake = intakeById.get(target.intakeId) ?? null;
    const pages = target.pageIds
      .map((pageId) => pageById.get(pageId))
      .filter((page): page is PageRow => Boolean(page));
    const explicitSourceId = textValue(intake?.affiliateSourceId);
    const sourceKey = textValue(intake?.sourceKey);
    const matchingSources = sourceRows.filter((source) => (
      explicitSourceId
        ? String(source.id) === explicitSourceId
        : Boolean(sourceKey) && String(source.sourceKey) === sourceKey
    ));
    const source = matchingSources.length === 1 ? matchingSources[0] : null;
    const rootIdsForTarget = sortedUnique([
      textValue(intake?.supplySourceId),
      textValue(source?.supplySourceId),
      ...pages.map((page) => textValue(page.supplySourceId)),
    ].filter((id): id is string => Boolean(id)));
    const roots = rootIdsForTarget
      .map((rootId) => rootById.get(rootId))
      .filter((root): root is IntakeRow => Boolean(root));
    const policies = await loadPolicies(database, intake, pages);
    const policyByKey = new Map(
      policies.map((policy) => [String(policy.policyKey), policy]),
    );
    const scopeReasonCodes: string[] = [];
    if (matchingSources.length > 1) scopeReasonCodes.push('SOURCE_IDENTITY_AMBIGUOUS');
    if (explicitSourceId && !source) scopeReasonCodes.push('SOURCE_LINK_MISSING');
    if (rootIdsForTarget.length !== roots.length) scopeReasonCodes.push('SOURCE_ROOT_MISSING');
    if (intake && String(intake.status).toUpperCase() === 'BLOCKED') scopeReasonCodes.push('INTAKE_BLOCKED');
    if (['BLOCKED', 'EXCLUDED', 'POLICY_BLOCKED', 'REPLACED'].includes(String(source?.status).toUpperCase())) {
      scopeReasonCodes.push('SOURCE_EXCLUDED_OR_REPLACED');
    }
    for (const root of roots) {
      if (textValue(root.intakeId) !== target.intakeId) scopeReasonCodes.push('ROOT_INTAKE_OWNERSHIP_CONFLICT');
      if (
        (String(root.id) === textValue(source?.supplySourceId) && textValue(root.liveSourceId) !== textValue(source?.id))
        || (textValue(root.liveSourceId) !== null && textValue(root.liveSourceId) !== textValue(source?.id))
      ) scopeReasonCodes.push('ROOT_SOURCE_OWNERSHIP_CONFLICT');
      if (hasAffiliateExistingDataRepairCorrectionHold(root.metadata)) {
        scopeReasonCodes.push('ACTIVE_EXISTING_DATA_REPAIR_CORRECTION_HOLD');
      }
      if (Object.prototype.hasOwnProperty.call(record(root.metadata), 'pendingMapping')) scopeReasonCodes.push('ACTIVE_PENDING_ROOT_REPAIR');
      if (
        root.isExcluded === true
        || ['BLOCKED', 'EXCLUDED', 'REPLACED', 'SOURCE_EXCLUDED'].includes(String(root.status ?? root.derivedStage).toUpperCase())
        || textValue(root.successorId)
      ) scopeReasonCodes.push('SOURCE_EXCLUDED_OR_REPLACED');
    }
    const expectedPolicyUrls = [
      textValue(intake?.baseUrl),
      ...pages.map((page) => textValue(page.canonicalUrl) ?? textValue(page.url)),
    ].filter((url): url is string => Boolean(url));
    for (const url of expectedPolicyUrls) {
      let policyKey: string | null = null;
      try {
        policyKey = affiliateDiscoveryPolicyKeyForUrl(url);
      } catch {
        scopeReasonCodes.push('POLICY_MISSING');
      }
      const policy = policyKey ? policyByKey.get(policyKey) : null;
      if (!policy) {
        scopeReasonCodes.push('POLICY_MISSING');
        continue;
      }
      if (String(policy.status).toUpperCase() !== 'ALLOWED') scopeReasonCodes.push('POLICY_NOT_ALLOWED');
      if (policy.expiresAt !== null && policy.expiresAt !== undefined) {
        const expiresAt = Date.parse(String(isoOrNull(policy.expiresAt)));
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) scopeReasonCodes.push('POLICY_REVIEW_EXPIRED');
      }
    }
    const rootIdSet = new Set(rootIdsForTarget);
    const matchingGatewayJobs = gatewayJobRows.filter((job) => rootIdSet.has(String(job.supplySourceId)));
    const matchingGatewayJobIds = new Set(matchingGatewayJobs.map((job) => String(job.id)));
    const gatewayClaims = gatewayClaimRows.filter((claim) => (
      matchingGatewayJobIds.has(String(claim.jobId))
      && textValue(claim.status)?.toUpperCase() === 'ACTIVE'
    ));
    const gatewayClaimJobIds = new Set(gatewayClaims.map((claim) => String(claim.jobId)));
    const gatewayJobs = matchingGatewayJobs.filter((job) => (
      textValue(job.activeClaimId) !== null || gatewayClaimJobIds.has(String(job.id))
    ));
    const sourceMetadata = record(source?.metadata);
    const hasPendingMapping = Boolean(
      source && Object.prototype.hasOwnProperty.call(sourceMetadata, 'pendingMapping'),
    );
    const pendingMapping = hasPendingMapping
      ? pendingMappingForMetadata(source?.metadata) ?? sourceMetadata.pendingMapping ?? { malformed: true }
      : null;
    if (hasPendingMapping) scopeReasonCodes.push('ACTIVE_PENDING_MAPPING');
    if (hasAffiliateExistingDataRepairCorrectionHold(sourceMetadata)) {
      scopeReasonCodes.push('ACTIVE_EXISTING_DATA_REPAIR_CORRECTION_HOLD');
    }
    const baseline = recordBaselineFor(reason, intake, pages, source, roots, policies, contract);
    const activeRuns = (runsByIntakeId.get(target.intakeId) ?? [])
      .filter((run) => (
        ACTIVE_RUN_STATUSES[String(run.status).toUpperCase()] === true
        && String(run.id) !== String(options.excludeRunId ?? '')
      ))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const authoritySnapshot = affiliateExistingRepairAuthoritySnapshot(
      intake,
      pages,
      source,
      roots,
      policies,
    );
    const stateFingerprint = hashAffiliateAgentValue({
      contract,
      authoritySnapshot,
      scopeReasonCodes: sortedUnique(scopeReasonCodes),
      activeRuns: activeRuns.map(runSnapshot),
      gatewayJobs: gatewayJobs.map(runSnapshot),
      gatewayClaims: gatewayClaims.map(runSnapshot),
      pendingMapping,
    });
    states.push({
      target,
      intake,
      pages,
      runs: runsByIntakeId.get(target.intakeId) ?? [],
      policy: policies[0] ?? null,
      policies,
      source,
      roots,
      gatewayJobs,
      gatewayClaims,
      pendingMapping,
      baseline,
      stateFingerprint,
      scopeReasonCodes: sortedUnique(scopeReasonCodes),
    });
  }
  return states;
};

const markerMatchesTarget = (
  marker: AffiliateExistingDataRepairEvidenceOnlyMarker | null,
  target: AffiliateExistingRepairCaptureTarget,
  operatorId: string,
): boolean => Boolean(
  marker
  && marker.intakeId === target.intakeId
  && marker.operatorId === operatorId
  && sameStringList(marker.pageIds, target.pageIds),
);

type MarkerRunEntry = {
  run: RunRow;
  marker: AffiliateExistingDataRepairEvidenceOnlyMarker;
};

const markerEntriesFor = (
  state: LoadedTargetState,
  target?: AffiliateExistingRepairCaptureTarget,
  operatorId?: string,
  activeOnly = false,
): MarkerRunEntry[] => state.runs
  .map((run) => ({ run, marker: markerFromRun(run) }))
  .filter((entry): entry is MarkerRunEntry => (
    Boolean(entry.marker)
    && (!target || markerMatchesTarget(entry.marker, target, operatorId ?? ''))
    && (!activeOnly || ACTIVE_RUN_STATUSES[String(entry.run.status).toUpperCase()] === true)
  ));

const recoveryFor = (run: RunRow): Record<string, unknown> => record(record(run.summary).recovery);

const canonicalMarkerEntry = (
  entries: readonly MarkerRunEntry[],
): { entry: MarkerRunEntry | null; ambiguous: boolean } => {
  if (!entries.length) return { entry: null, ambiguous: false };
  const byPredecessor = new Map<string, MarkerRunEntry[]>();
  const entryById = new Map(entries.map((entry) => [String(entry.run.id), entry]));
  for (const entry of entries) {
    const predecessorId = textValue(recoveryFor(entry.run).replacesRunId);
    if (!predecessorId) continue;
    const predecessor = entryById.get(predecessorId);
    if (!predecessor) return { entry: null, ambiguous: true };
    const siblings = byPredecessor.get(predecessorId) ?? [];
    siblings.push(entry);
    byPredecessor.set(predecessorId, siblings);
    if (textValue(recoveryFor(predecessor.run).replacementRunId) !== String(entry.run.id)) {
      return { entry: null, ambiguous: true };
    }
  }
  const roots = entries.filter((entry) => !textValue(recoveryFor(entry.run).replacesRunId));
  if (roots.length !== 1) return { entry: null, ambiguous: true };
  const visited = new Set<string>();
  let current: MarkerRunEntry = roots[0];
  while (true) {
    const currentId = String(current.run.id);
    if (visited.has(currentId)) return { entry: null, ambiguous: true };
    visited.add(currentId);
    const successors = byPredecessor.get(currentId) ?? [];
    const replacementId = textValue(recoveryFor(current.run).replacementRunId);
    if (replacementId && (successors.length !== 1 || String(successors[0].run.id) !== replacementId)) {
      return { entry: null, ambiguous: true };
    }
    if (successors.length === 0) break;
    if (successors.length !== 1) return { entry: null, ambiguous: true };
    current = successors[0];
  }
  if (visited.size !== entries.length) return { entry: null, ambiguous: true };
  return { entry: current, ambiguous: false };
};

const priorMarkerFor = (
  state: LoadedTargetState,
  target: AffiliateExistingRepairCaptureTarget,
  operatorId: string,
): MarkerRunEntry | null => {
  const activeEntries = markerEntriesFor(state, target, operatorId, true);
  return activeEntries.length === 1 ? activeEntries[0] : null;
};

const anyPriorMarkerForIntake = (state: LoadedTargetState): RunRow | null => (
  markerEntriesFor(state, undefined, undefined, true)[0]?.run ?? null
);

const internalRowFor = (
  state: LoadedTargetState,
  operatorId: string,
): InternalCaptureRow => {
  const reasons: string[] = [...state.scopeReasonCodes];
  const intake = state.intake;
  if (!intake) reasons.push('INTAKE_NOT_FOUND');
  if (intake && textValue(intake.complianceStatus)?.toUpperCase() !== 'ALLOWED') {
    reasons.push('POLICY_NOT_ALLOWED');
  }
  const pagesById = new Map(state.pages.map((page) => [String(page.id), page]));
  for (const pageId of state.target.pageIds) {
    const page = pagesById.get(pageId);
    if (!page) {
      reasons.push('PAGE_NOT_FOUND');
      continue;
    }
    if (String(page.intakeId) !== state.target.intakeId) reasons.push('PAGE_NOT_OWNED');
    if (textValue(page.status)?.toUpperCase() !== 'ACTIVE') reasons.push('PAGE_NOT_ACTIVE');
  }
  const activeRun = state.runs
    .filter((run) => ACTIVE_RUN_STATUSES[String(run.status).toUpperCase()] === true)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
  if (state.gatewayJobs.length > 0 || state.gatewayClaims.length > 0) {
    reasons.push('ACTIVE_GATEWAY_OWNERSHIP');
  }
  const prior = priorMarkerFor(state, state.target, operatorId);
  const otherPrior = anyPriorMarkerForIntake(state);
  if (prior) reasons.push('ALREADY_ADMITTED');
  else if (otherPrior) reasons.push('CAPTURE_INTENT_CONFLICT');
  else if (activeRun) reasons.push('ACTIVE_RUN_CONFLICT');
  const reasonCodes = sortedUnique(reasons);
  return {
    intakeId: state.target.intakeId,
    pageIds: [...state.target.pageIds],
    eligible: reasonCodes.length === 0,
    reasonCodes,
    stateFingerprint: state.stateFingerprint,
    runId: prior?.run.id ? String(prior.run.id) : activeRun?.id ? String(activeRun.id) : null,
    baseline: state.baseline,
    priorMarker: prior?.marker ?? null,
  };
};

const countsFor = (rows: readonly AffiliateExistingRepairCaptureRow[]): AffiliateExistingRepairCaptureCounts => ({
  total: rows.length,
  eligible: rows.filter((row) => row.eligible).length,
  held: rows.filter((row) => !row.eligible && !row.reasonCodes.includes('ALREADY_ADMITTED')).length,
  selected: rows.length,
  alreadyAdmitted: rows.filter((row) => row.reasonCodes.includes('ALREADY_ADMITTED')).length,
});

const reportHashFor = (
  targets: readonly AffiliateExistingRepairCaptureTarget[],
  reason: string,
  operatorId: string,
  contract: AffiliateExistingRepairCaptureContractBinding,
  rows: readonly AffiliateExistingRepairCaptureRow[],
): string => hashAffiliateAgentValue({
  schemaVersion: AFFILIATE_EXISTING_REPAIR_CAPTURE_SCHEMA_VERSION,
  operation: AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE,
  contract,
  targets: normalizedTargetObject(targets),
  reason,
  operatorId,
  rows: rows.map((row) => ({
    intakeId: row.intakeId,
    pageIds: [...row.pageIds],
    eligible: row.eligible,
    reasonCodes: [...row.reasonCodes],
    stateFingerprint: row.stateFingerprint,
  })),
});

const previewReportFromStates = (
  targets: readonly AffiliateExistingRepairCaptureTarget[],
  states: readonly LoadedTargetState[],
  reason: string,
  operatorId: string,
  contract: AffiliateExistingRepairCaptureContractBinding,
): { report: PreviewAffiliateExistingRepairCaptureReport; rows: InternalCaptureRow[] } => {
  const rows = states.map((state) => internalRowFor(state, operatorId));
  const publicRows: AffiliateExistingRepairCaptureRow[] = rows.map((row) => ({
    intakeId: row.intakeId,
    pageIds: row.pageIds,
    eligible: row.eligible,
    reasonCodes: row.reasonCodes,
    stateFingerprint: row.stateFingerprint,
    runId: row.runId,
  }));
  const reportHash = reportHashFor(targets, reason, operatorId, contract, publicRows);
  return {
    report: {
      schemaVersion: 1,
      mode: 'PREVIEW',
      evaluatedAt: new Date().toISOString(),
      reason,
      operatorId,
      contract,
      counts: countsFor(publicRows),
      rows: publicRows,
      proposedWrites: [],
      reportHash,
      writeCount: 0,
      runIds: [],
      replayed: false,
    },
    rows,
  };
};


const markerFor = (
  target: AffiliateExistingRepairCaptureTarget,
  row: InternalCaptureRow,
  reason: string,
  operatorId: string,
  reportHash: string,
): AffiliateExistingDataRepairEvidenceOnlyMarker => {
  if (!row.baseline) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_INTENT_INVALID',
      `Intake ${target.intakeId} has no stable existing record baseline.`,
    );
  }
  const reviewedRow = {
    intakeId: row.intakeId,
    pageIds: [...row.pageIds],
    eligible: row.eligible,
    reasonCodes: [...row.reasonCodes],
    stateFingerprint: row.stateFingerprint,
    runId: null,
  };
  return {
    schemaVersion: 1,
    purpose: AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE,
    requestHash: reportHash,
    operatorId,
    intakeId: target.intakeId,
    pageIds: [...target.pageIds],
    baseline: {
      ...row.baseline,
      requestReason: reason,
      stateFingerprint: row.stateFingerprint,
      reviewedRow,
    },
  };
};

type ReplayRun = {
  run: RunRow;
  row: AffiliateExistingRepairCaptureRow | null;
};

const reviewedRowFromBaseline = (
  baseline: CaptureBaseline | null,
): AffiliateExistingRepairCaptureRow | null => {
  const value = record(baseline?.reviewedRow);
  const intakeId = textValue(value.intakeId);
  const pageIds = stringList(value.pageIds);
  const reasonCodes = stringList(value.reasonCodes);
  const stateFingerprint = textValue(value.stateFingerprint);
  if (
    !intakeId
    || !pageIds.length
    || typeof value.eligible !== 'boolean'
    || !stateFingerprint
  ) return null;
  return {
    intakeId,
    pageIds,
    eligible: value.eligible,
    reasonCodes,
    stateFingerprint,
    runId: null,
  };
};

const exactReplayRuns = (
  states: readonly LoadedTargetState[],
  targets: readonly AffiliateExistingRepairCaptureTarget[],
  operatorId: string,
  reason: string,
  contract: AffiliateExistingRepairCaptureContractBinding,
  expectedReportHash: string,
): ReplayRun[] | null => {
  const hasRecordedRequest = states.some((state) => state.runs.some((run) => (
    textValue(record(record(run.summary).existingDataRepairEvidenceOnly).requestHash)?.toLowerCase() === expectedReportHash
  )));
  if (!hasRecordedRequest) return null;
  const result: ReplayRun[] = [];
  for (const target of targets) {
    const state = states.find((candidate) => candidate.target.intakeId === target.intakeId);
    if (!state) throw new AffiliateExistingDataRepairCaptureError('CAPTURE_INTENT_DRIFT', 'The recorded capture batch is incomplete.');
    const rawMatches = state.runs.filter((run) => (
      textValue(record(record(run.summary).existingDataRepairEvidenceOnly).requestHash)?.toLowerCase() === expectedReportHash
    ));
    const entries = markerEntriesFor(state, target, operatorId)
      .filter((entry) => entry.marker.requestHash.toLowerCase() === expectedReportHash);
    const resolution = canonicalMarkerEntry(entries);
    if (rawMatches.length !== entries.length || resolution.ambiguous) {
      throw new AffiliateExistingDataRepairCaptureError('CAPTURE_INTENT_DRIFT', 'The recorded capture intent has invalid or ambiguous recovery lineage.');
    }
    if (!resolution.entry) throw new AffiliateExistingDataRepairCaptureError('CAPTURE_INTENT_DRIFT', 'The recorded capture batch is missing a target.');
    const baseline = markerBaseline(resolution.entry.marker);
    if (!baseline || baseline.requestReason !== reason || !sameContractBinding(baseline.contract, contract)) {
      throw new AffiliateExistingDataRepairCaptureError('CAPTURE_INTENT_DRIFT', 'The recorded capture request or contract changed.');
    }
    const row = reviewedRowFromBaseline(baseline);
    if (
      !row
      || row.intakeId !== target.intakeId
      || !sameStringList(row.pageIds, target.pageIds)
    ) throw new AffiliateExistingDataRepairCaptureError('CAPTURE_INTENT_DRIFT', 'The recorded reviewed capture row is invalid.');
    result.push({ run: resolution.entry.run, row });
  }
  const reviewedRows = result.map((entry) => entry.row).filter(
    (row): row is AffiliateExistingRepairCaptureRow => row !== null,
  );
  if (
    reviewedRows.length !== result.length
    || reportHashFor(targets, reason, operatorId, contract, reviewedRows) !== expectedReportHash
  ) throw new AffiliateExistingDataRepairCaptureError('CAPTURE_INTENT_DRIFT', 'The recorded capture rows do not match their reviewed hash.');
  return result;
};

const reportForReplay = (
  report: PreviewAffiliateExistingRepairCaptureReport,
  replayRuns: readonly ReplayRun[],
  expectedReportHash: string,
): ApplyAffiliateExistingRepairCaptureReport => {
  const runIds = replayRuns.map(({ run }) => String(run.id));
  const rows = replayRuns.map(({ run, row }, index) => ({
    ...(row ?? report.rows[index]),
    runId: runIds[index] ?? row?.runId ?? report.rows[index]?.runId ?? null,
  }));
  return {
    ...report,
    mode: 'APPLY',
    rows,
    counts: countsFor(rows),
    proposedWrites: [],
    reportHash: expectedReportHash,
    writeCount: 0,
    runIds,
    replayed: true,
  };
};

const currentRecordStateForRun = async (
  database: Database,
  intakeId: string,
  pageIds: readonly string[],
): Promise<{ intake: IntakeRow | null; pages: readonly PageRow[]; recordFingerprint: string | null }> => {
  const intake = await loadOne<IntakeRow>(
    delegateFor(database, 'affiliateSourceIntakes'),
    { id: intakeId },
  );
  const pages = await loadMany<PageRow>(
    delegateFor(database, 'affiliateSourceIntakePages'),
    { id: { in: [...pageIds] } },
  );
  const ownedPages = pages.filter((page) => String(page.intakeId) === intakeId);
  const recordFingerprint = intake
    ? hashAffiliateAgentValue(affiliateExistingRepairCaptureSnapshot(intake, ownedPages))
    : null;
  return { intake, pages, recordFingerprint };
};
export const previewAffiliateExistingRepairCapture = async (
  input: PreviewAffiliateExistingRepairCaptureInput,
): Promise<PreviewAffiliateExistingRepairCaptureReport> => {
  const targets = normalizeTargets(input.targets);
  const reason = normalizeReason(input.reason);
  const operatorId = normalizeOperatorId(input.operatorId);
  const contract = contractBindingFor(input.bundle);
  const states = await loadTargetStates(input.prisma, targets, reason, contract);
  return previewReportFromStates(targets, states, reason, operatorId, contract).report;
};

export const applyAffiliateExistingRepairCapture = async (
  input: ApplyAffiliateExistingRepairCaptureInput,
): Promise<ApplyAffiliateExistingRepairCaptureReport> => {
  const targets = normalizeTargets(input.targets);
  const reason = normalizeReason(input.reason);
  const operatorId = normalizeOperatorId(input.operatorId);
  const expectedReportHash = normalizeHash(input.expectedReportHash);
  const contract = contractBindingFor(input.bundle);
  return transaction(input.prisma, async (database) => {
    const states = await loadTargetStates(database, targets, reason, contract);
    const initial = previewReportFromStates(targets, states, reason, operatorId, contract);
    const replay = exactReplayRuns(states, targets, operatorId, reason, contract, expectedReportHash);
    if (replay) return reportForReplay(initial.report, replay, expectedReportHash);
    if (initial.report.reportHash !== expectedReportHash) {
      const activeConflict = initial.report.rows.some((row) => row.reasonCodes.includes('ACTIVE_RUN_CONFLICT'));
      if (activeConflict) {
        throw new AffiliateExistingDataRepairCaptureError(
          'ACTIVE_RUN_CONFLICT',
          'An active intake capture run conflicts with this existing data repair request.',
        );
      }
      throw new AffiliateExistingDataRepairCaptureError(
        'ADMISSION_REPORT_DRIFT',
        'The existing data repair capture report changed after review.',
        { expectedReportHash, actualReportHash: initial.report.reportHash },
      );
    }
    const held = initial.report.rows.find((row) => !row.eligible);
    if (held) {
      throw new AffiliateExistingDataRepairCaptureError(
        held.reasonCodes.includes('ACTIVE_RUN_CONFLICT') ? 'ACTIVE_RUN_CONFLICT' : 'CAPTURE_NOT_ELIGIBLE',
        `Existing data repair capture is held for intake ${held.intakeId}.`,
        { intakeId: held.intakeId, reasonCodes: held.reasonCodes },
      );
    }
    const runIds: string[] = [];
    const writes: AffiliateExistingRepairCaptureWrite[] = [];
    for (const row of initial.rows) {
      const target = targets.find((candidate) => candidate.intakeId === row.intakeId);
      if (!target) throw new AffiliateExistingDataRepairCaptureError('CAPTURE_INTENT_INVALID', 'Target disappeared while applying capture.');
      const marker = markerFor(target, row, reason, operatorId, expectedReportHash);
      const run = await queueAffiliateSourceIntakeRun(
        target.intakeId,
        [...target.pageIds],
        operatorId,
        { db: database, existingDataRepairEvidenceOnly: marker },
      );
      const runId = String(record(run).id ?? '');
      if (!runId) throw new AffiliateExistingDataRepairCaptureError('PERSISTENCE_UNAVAILABLE', 'Capture run creation returned no run ID.');
      runIds.push(runId);
      writes.push({ intakeId: target.intakeId, pageIds: [...target.pageIds], runId });
    }
    return {
      ...initial.report,
      mode: 'APPLY',
      rows: initial.report.rows.map((row, index) => ({ ...row, runId: runIds[index] ?? null })),
      proposedWrites: writes,
      reportHash: expectedReportHash,
      writeCount: runIds.length,
      runIds,
      replayed: false,
    };
  });
};
const validateRunIntent = async (
  database: Database,
  run: RunRow,
  operatorId: string,
  contract: AffiliateExistingRepairCaptureContractBinding,
  options: Readonly<{ checkCurrent?: boolean }> = {},
): Promise<{ marker: AffiliateExistingDataRepairEvidenceOnlyMarker; intakeId: string; pageIds: string[] }> => {
  const marker = markerFromRun(run);
  if (!marker || marker.purpose !== AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_INTENT_INVALID',
      'The requested run is not an admitted existing data repair capture.',
    );
  }
  if (marker.operatorId !== operatorId || textValue(run.requestedByUserId) !== operatorId) {
    throw new AffiliateExistingDataRepairCaptureError(
      'OPERATOR_MISMATCH',
      'The run actor does not match the admitted capture actor.',
    );
  }
  const intakeId = textValue(run.intakeId);
  const pageIds = sortedUnique(stringList(run.requestedPageIds));
  if (!intakeId || marker.intakeId !== intakeId || !sameStringList(marker.pageIds, pageIds)) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_INTENT_DRIFT',
      'The run scope does not match its admitted capture marker.',
    );
  }
  const baseline = markerBaseline(marker);
  if (!baseline) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_INTENT_INVALID',
      'The run does not contain a complete existing record baseline.',
    );
  }
  if (!sameContractBinding(baseline.contract, contract)) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CONTRACT_DRIFT',
      'The active capture contract changed after admission.',
      { intakeId, expected: baseline.contract, actual: contract },
    );
  }
  if (options.checkCurrent === false) return { marker, intakeId, pageIds };
  if (!baseline.authorityFingerprint || !baseline.authoritySnapshot) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_INTENT_INVALID',
      'The run does not contain a complete source, root, and policy authority baseline.',
    );
  }
  const targetState = (await loadTargetStates(
    database,
    [{ intakeId, pageIds }],
    baseline.requestReason,
    contract,
    { excludeRunId: String(run.id) },
  ))[0];
  if (
    !targetState
    || !targetState.intake
    || targetState.scopeReasonCodes.length > 0
    || targetState.baseline?.authorityFingerprint !== baseline.authorityFingerprint
    || targetState.baseline.recordFingerprint !== baseline.recordFingerprint
  ) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_INTENT_DRIFT',
      'The reviewed intake, source, root, policy, or selected page state changed after admission.',
      { intakeId, pageIds },
    );
  }
  const activeOtherRuns = targetState.runs.filter((candidate) => (
    String(candidate.id) !== String(run.id)
    && ACTIVE_RUN_STATUSES[String(candidate.status).toUpperCase()] === true
  ));
  if (
    activeOtherRuns.length > 0
    || targetState.pendingMapping
    || targetState.gatewayJobs.length > 0
    || targetState.gatewayClaims.length > 0
  ) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_OWNERSHIP_CONFLICT',
      'An active intake capture owner, Gateway claim, or staged mapping pointer blocks evidence refresh.',
      {
        intakeId,
        activeRunIds: activeOtherRuns.map((candidate) => String(candidate.id)).sort(),
        gatewayJobIds: targetState.gatewayJobs.map((candidate) => String(candidate.id)).sort(),
        gatewayClaimIds: targetState.gatewayClaims.map((candidate) => String(candidate.id)).sort(),
        hasPendingMapping: Boolean(targetState.pendingMapping),
      },
    );
  }
  return { marker, intakeId, pageIds };
};

const processStatus = (run: RunRow): string => textValue(run.status) ?? 'UNKNOWN';

const durableProcessResult = (
  run: RunRow,
  result: unknown,
  replayed: boolean,
): AffiliateExistingRepairCaptureProcessResult => ({
  schemaVersion: 1,
  runId: String(run.id),
  intakeId: String(run.intakeId),
  status: processStatus(run),
  replayed,
  summary: record(run.summary),
  result,
});

export const processAffiliateExistingRepairCapture = async (
  input: ProcessAffiliateExistingRepairCaptureInput,
): Promise<AffiliateExistingRepairCaptureProcessResult> => {
  const database = databaseFor(input.prisma);
  const runId = normalizeId(input.runId, 'runId');
  const operatorId = normalizeOperatorId(input.operatorId);
  const contract = contractBindingFor(input.bundle);
  const runDelegate = delegateFor(database, 'affiliateSourceIntakeRuns');
  const run = await loadOne<RunRow>(runDelegate, { id: runId });
  if (!run) {
    throw new AffiliateExistingDataRepairCaptureError(
      'CAPTURE_RUN_NOT_FOUND',
      'Affiliate existing data repair capture run not found.',
      { runId },
    );
  }
  const status = processStatus(run);
  const { marker } = await validateRunIntent(database, run, operatorId, contract, { checkCurrent: status === 'QUEUED' });
  if (status !== 'QUEUED') return durableProcessResult(run, null, true);
  const result = await processNextAffiliateSourceIntakeRun(
    {
      runId,
      workerId: `existing-data-repair:${operatorId}`,
      governedProcessIntent: {
        purpose: AFFILIATE_EXISTING_DATA_REPAIR_EVIDENCE_ONLY_PURPOSE,
        operatorId,
        markerSha256: hashAffiliateAgentValue(marker),
        verifyAfterClaim: async ({ database: claimedDatabase, run: claimedRun }) => {
          await validateRunIntent(
            databaseFor(claimedDatabase),
            claimedRun as RunRow,
            operatorId,
            contract,
            { checkCurrent: true },
          );
        },
      },
    },
    {
      ...input.dependencies,
      db: input.prisma,
      workerId: `existing-data-repair:${operatorId}`,
    },
  );
  if (!result) {
    const currentRun = await loadOne<RunRow>(runDelegate, { id: runId });
    if (currentRun) return durableProcessResult(currentRun, null, true);
    throw new AffiliateExistingDataRepairCaptureError('CAPTURE_RUN_NOT_FOUND', 'Capture run disappeared while processing.', { runId });
  }
  const resultRecord = record(result);
  const processedRun = isRecord(resultRecord.run) ? resultRecord.run : { ...run, status: resultRecord.status };
  return durableProcessResult(processedRun, result, false);
};
