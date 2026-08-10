import { stableAgentArtifactSha256 } from './agentContracts';
import {
  archiveAffiliateMappingResultEnvelope,
  appendAffiliateMappingHistory,
} from './affiliateMappingResultHistory';
import {
  loadAffiliateSportsCatalogSnapshot,
  type AffiliateSportsCatalogSnapshot,
} from './affiliateSportsCatalog';
import { prisma } from '@/lib/prisma';

export const AFFILIATE_SPORT_RECONCILIATION_SCHEMA_VERSION = 1 as const;
export const AFFILIATE_SPORT_RECONCILIATION_STRATEGY_REVISION = 'sport-evidence-v1' as const;
export const AFFILIATE_SPORT_RECONCILIATION_MAX_ROWS = 5_000;

export const AFFILIATE_SPORT_RECONCILIATION_STRUCTURED_REASON_PATHS = [
  'resultSummary.result.humanReviewRequired.reasonCodes',
  'resultSummary.humanReviewRequired.reasonCodes',
  'resultSummary.approvalReview.mappingDisposition.reasonCodes',
  'resultSummary.mappingRepairHistory[*].repairReasons',
] as const;

export const AFFILIATE_SPORT_RECONCILIATION_SOURCE_LABEL_PATHS = [
  'resultSummary.result.humanReviewRequired.sourceSportLabels',
  'resultSummary.humanReviewRequired.sourceSportLabels',
  'resultSummary.approvalReview.mappingDisposition.sourceSportLabels',
  'resultSummary.mappingRepairHistory[*].sourceSportLabels',
  'resultSummary.mappingRepairHistory[*].priorSourceSportLabels',
] as const;

export const AFFILIATE_SPORT_RECONCILIATION_LEGACY_PATTERNS = [
  /^\s*The sport\b[\s\S]+\bis not in the BracketIQ sports catalog\.?\s*$/i,
  /^\s*Unsupported source sports were preserved as evidence only\.?\s*$/i,
] as const;

const ACTIVE_MAPPING_STATUSES = ['QUEUED', 'CLAIMED', 'REVIEW_REQUIRED'] as const;
const ACTIVE_APPROVAL_STATUSES = ['QUEUED', 'CLAIMED'] as const;
const TERMINAL_MAPPING_STATUSES = ['FAILED', 'HUMAN_REVIEW_REQUIRED'] as const;

type JsonRecord = Record<string, unknown>;

type ReconciliationDatabase = {
  mappingJobs: {
    findMany: (args?: unknown) => Promise<Array<Record<string, unknown>>>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  intakes: {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    updateMany?: (args: unknown) => Promise<{ count: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
  approvals: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  transaction?: <T>(callback: (database: ReconciliationDatabase) => Promise<T>) => Promise<T>;
};

type ReconciliationDependencies = {
  database?: ReconciliationDatabase;
  now?: () => Date;
  loadCatalog?: () => Promise<AffiliateSportsCatalogSnapshot>;
};

const databaseFor = (client: Record<string, unknown>): ReconciliationDatabase => ({
  mappingJobs: client.affiliateSourceMappingJobs as ReconciliationDatabase['mappingJobs'],
  intakes: client.affiliateSourceIntakes as ReconciliationDatabase['intakes'],
  approvals: client.affiliateApprovalJobs as ReconciliationDatabase['approvals'],
});

const defaultDatabase = (): ReconciliationDatabase => {
  const root = prisma as unknown as Record<string, unknown>;
  const database = databaseFor(root);
  return {
    ...database,
    transaction: async <T>(callback: (transactionDatabase: ReconciliationDatabase) => Promise<T>) => (
      (prisma as unknown as { $transaction: <R>(fn: (tx: unknown) => Promise<R>) => Promise<R> })
        .$transaction((tx) => callback(databaseFor(tx as Record<string, unknown>)))
    ),
  };
};

const recordValue = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const pathValue = (root: unknown, path: string): unknown => {
  const parts = path.split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (part === '[*]') continue;
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as JsonRecord)[part];
  }
  return current;
};

const reasonArraysAtPath = (summary: unknown, path: string): string[][] => {
  if (path.includes('[*]')) {
    const [prefix, suffix] = path.split('[*].');
    const collection = pathValue(summary, prefix.replace(/\.$/, ''));
    if (!Array.isArray(collection)) return [];
    return collection.flatMap((item) => {
      const value = pathValue(item, suffix);
      return Array.isArray(value) ? [value.filter((entry): entry is string => typeof entry === 'string')] : [];
    });
  }
  const value = pathValue(summary, path);
  return Array.isArray(value)
    ? [value.filter((entry): entry is string => typeof entry === 'string')]
    : [];
};

const labelsAtPath = (summary: unknown, path: string): string[] => {
  const values = path.includes('[*]')
    ? (() => {
        const [prefix, suffix] = path.split('[*].');
        const collection = pathValue(summary, prefix.replace(/\.$/, ''));
        return Array.isArray(collection)
          ? collection.flatMap((item) => {
              const value = pathValue(item, suffix);
              return Array.isArray(value) ? value : [];
            })
          : [];
      })()
    : (() => {
        const value = pathValue(summary, path);
        return Array.isArray(value) ? value : [];
      })();
  return values.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
};

export type AffiliateSportReasonExtraction = {
  structuredReasonArrays: string[][];
  sourceSportLabels: string[];
  legacyMessage: string | null;
};

export const extractAffiliateSportReconciliationEvidence = (
  job: Record<string, unknown>,
): AffiliateSportReasonExtraction => {
  const summary = recordValue(job.resultSummary);
  const structuredReasonArrays = AFFILIATE_SPORT_RECONCILIATION_STRUCTURED_REASON_PATHS.flatMap(
    (path) => reasonArraysAtPath(job, path),
  );
  const sourceSportLabels = Array.from(new Set(
    AFFILIATE_SPORT_RECONCILIATION_SOURCE_LABEL_PATHS.flatMap((path) => labelsAtPath(job, path)),
  )).sort();
  const legacyCandidates = [
    job.errorMessage,
    summary.errorMessage,
    recordValue(summary.result).errorMessage,
    recordValue(recordValue(summary.result).humanReviewRequired).rationale,
    recordValue(recordValue(summary.result).humanReviewRequired).blockingIssues,
    recordValue(summary.humanReviewRequired).rationale,
    recordValue(summary.humanReviewRequired).blockingIssues,
    ...(Array.isArray(summary.mappingRepairHistory)
      ? summary.mappingRepairHistory.flatMap((entry: unknown) => [
          recordValue(entry).priorMappingErrorMessage,
        ])
      : []),
  ].flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string');
  const legacyMessage = legacyCandidates.find((candidate) => (
    AFFILIATE_SPORT_RECONCILIATION_LEGACY_PATTERNS.some((pattern) => pattern.test(candidate))
  )) ?? null;
  return { structuredReasonArrays, sourceSportLabels, legacyMessage };
};

export type AffiliateSportReconciliationEligibility = {
  eligible: boolean;
  reason: string;
  sourceLabels: string[];
  sourceLabelsMissing: boolean;
};

export const evaluateAffiliateSportReconciliationEligibility = (
  job: Record<string, unknown>,
  intake: Record<string, unknown> | null,
  approvals: readonly Record<string, unknown>[],
  activeMappingJobs: readonly Record<string, unknown>[],
): AffiliateSportReconciliationEligibility => {
  if (!TERMINAL_MAPPING_STATUSES.includes(String(job.status) as typeof TERMINAL_MAPPING_STATUSES[number])) {
    return { eligible: false, reason: 'STATUS_NOT_RECONCILIABLE', sourceLabels: [], sourceLabelsMissing: true };
  }
  if (!intake) return { eligible: false, reason: 'INTAKE_MISSING', sourceLabels: [], sourceLabelsMissing: true };
  if (job.sourceId || job.mappingId) {
    return { eligible: false, reason: 'PACKAGE_OR_MAPPING_ID_PRESENT', sourceLabels: [], sourceLabelsMissing: true };
  }
  if (activeMappingJobs.some((candidate) => candidate.id !== job.id && ACTIVE_MAPPING_STATUSES.includes(String(candidate.status) as typeof ACTIVE_MAPPING_STATUSES[number]))) {
    return { eligible: false, reason: 'ACTIVE_MAPPING_JOB_PRESENT', sourceLabels: [], sourceLabelsMissing: true };
  }
  if (approvals.some((approval) => ACTIVE_APPROVAL_STATUSES.includes(String(approval.status) as typeof ACTIVE_APPROVAL_STATUSES[number]))) {
    return { eligible: false, reason: 'ACTIVE_APPROVAL_PRESENT', sourceLabels: [], sourceLabelsMissing: true };
  }
  const evidence = extractAffiliateSportReconciliationEvidence(job);
  const soleStructured = evidence.structuredReasonArrays.length > 0
    && evidence.structuredReasonArrays.every((codes) => (
      codes.length === 1 && codes[0] === 'SPORT_NOT_IN_CATALOG'
    ));
  if (soleStructured) {
    return {
      eligible: true,
      reason: 'STRUCTURED_SOLE_SPORT_NOT_IN_CATALOG',
      sourceLabels: evidence.sourceSportLabels,
      sourceLabelsMissing: evidence.sourceSportLabels.length === 0,
    };
  }
  if (evidence.structuredReasonArrays.length > 0) {
    return { eligible: false, reason: 'MIXED_OR_NON_SPORT_STRUCTURED_REASON', sourceLabels: evidence.sourceSportLabels, sourceLabelsMissing: evidence.sourceSportLabels.length === 0 };
  }
  if (evidence.legacyMessage && evidence.sourceSportLabels.length > 0) {
    return {
      eligible: true,
      reason: 'LEGACY_ANCHORED_SPORT_CATALOG_MESSAGE',
      sourceLabels: evidence.sourceSportLabels,
      sourceLabelsMissing: false,
    };
  }
  return { eligible: false, reason: evidence.legacyMessage ? 'LEGACY_SOURCE_LABELS_MISSING' : 'SPORT_CATALOG_REASON_NOT_EXACT', sourceLabels: evidence.sourceSportLabels, sourceLabelsMissing: evidence.sourceSportLabels.length === 0 };
};

export type AffiliateSportReconciliationApproval = {
  id: string;
  status: string;
  reviewerId: string | null;
  decisionSha256: string | null;
  errorMessage: string | null;
  finishedAt: string | null;
};

const approvalEnvelope = (approval: Record<string, unknown>): AffiliateSportReconciliationApproval => ({
  id: String(approval.id),
  status: String(approval.status),
  reviewerId: typeof approval.reviewerId === 'string' ? approval.reviewerId : null,
  decisionSha256: approval.decision == null ? null : stableAgentArtifactSha256(approval.decision),
  errorMessage: typeof approval.errorMessage === 'string' ? approval.errorMessage : null,
  finishedAt: approval.finishedAt instanceof Date ? approval.finishedAt.toISOString() : typeof approval.finishedAt === 'string' ? approval.finishedAt : null,
});

const approvalSetSha256 = (approvals: readonly AffiliateSportReconciliationApproval[]): string => (
  stableAgentArtifactSha256([...approvals].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
);

export type AffiliateSportReconciliationRow = {
  jobId: string;
  intakeId: string;
  status: string;
  sourceLabels: string[];
  sourceLabelsMissing: boolean;
  selectionReason: string;
  priorResultSummarySha256: string;
  terminalApprovals: AffiliateSportReconciliationApproval[];
  terminalApprovalSetSha256: string;
  outcome?: 'PREVIEW_ELIGIBLE' | 'SKIPPED_CONCURRENT' | 'ALREADY_RECONCILED' | 'ERROR' | 'REQUEUED';
  errorMessage?: string;
};

const historyEntryFor = (row: AffiliateSportReconciliationRow, job: Record<string, unknown>, now: Date) => ({
  strategyRevision: AFFILIATE_SPORT_RECONCILIATION_STRATEGY_REVISION,
  queuedAt: now.toISOString(),
  priorStatus: row.status,
  priorErrorMessage: typeof job.errorMessage === 'string' ? job.errorMessage : null,
  priorBranch: typeof job.branch === 'string' ? job.branch : null,
  priorCommit: typeof job.commit === 'string' ? job.commit : null,
  priorResultSummarySha256: row.priorResultSummarySha256,
  terminalApprovalSetSha256: row.terminalApprovalSetSha256,
  archivedPriorResultSummary: archiveAffiliateMappingResultEnvelope(recordValue(job.resultSummary)),
});

const hasReconciliationMarker = (job: Record<string, unknown>): boolean => {
  const history = recordValue(job.resultSummary).sportReconciliationHistory;
  return Array.isArray(history) && history.some((entry: unknown) => (
    recordValue(entry).strategyRevision === AFFILIATE_SPORT_RECONCILIATION_STRATEGY_REVISION
  ));
};

export type AffiliateSportReconciliationPreview = {
  schemaVersion: 1;
  evaluatedAt: string;
  mode: 'DRY_RUN' | 'APPLY';
  catalogSha256: string;
  selectionSha256: string;
  eligibleCount: number;
  selectedCount: number;
  alreadyReconciledCount: number;
  skippedCounts: Record<string, number>;
  writeCount: number;
  rows: AffiliateSportReconciliationRow[];
};

const selectionHashFor = (catalogSha256: string, rows: readonly AffiliateSportReconciliationRow[]): string => (
  stableAgentArtifactSha256({
    catalogSha256,
    rows: [...rows]
      .sort((left, right) => left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0)
      .map((row) => ({
        jobId: row.jobId,
        intakeId: row.intakeId,
        status: row.status,
        sourceLabels: row.sourceLabels,
        sourceLabelsMissing: row.sourceLabelsMissing,
        selectionReason: row.selectionReason,
        priorResultSummarySha256: row.priorResultSummarySha256,
        terminalApprovals: row.terminalApprovals,
        terminalApprovalSetSha256: row.terminalApprovalSetSha256,
      })),
  })
);

export const calculateAffiliateSportReconciliationSelectionSha256 = selectionHashFor;

export const selectAffiliateSportReconciliationRows = async (
  options: { jobId?: string; limit?: number } = {},
  dependencies: ReconciliationDependencies = {},
): Promise<AffiliateSportReconciliationPreview> => {
  const limit = options.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0 || limit > AFFILIATE_SPORT_RECONCILIATION_MAX_ROWS)) {
    throw new Error(`--limit must be a positive integer no greater than ${AFFILIATE_SPORT_RECONCILIATION_MAX_ROWS}.`);
  }
  const database = dependencies.database ?? defaultDatabase();
  const now = dependencies.now?.() ?? new Date();
  const catalog = await (dependencies.loadCatalog ?? (() => loadAffiliateSportsCatalogSnapshot(prisma)))();
  const allJobs = await database.mappingJobs.findMany({
    where: options.jobId ? { id: options.jobId } : {},
    orderBy: { id: 'asc' },
  });
  const alreadyReconciledCount = allJobs.filter(hasReconciliationMarker).length;
  const terminalJobs = allJobs.filter((job) => TERMINAL_MAPPING_STATUSES.includes(String(job.status) as typeof TERMINAL_MAPPING_STATUSES[number]));
  const eligible: AffiliateSportReconciliationRow[] = [];
  const evaluatedRows: AffiliateSportReconciliationRow[] = [];
  const skippedCounts: Record<string, number> = {};
  for (const job of terminalJobs) {
    const intakeId = typeof job.intakeId === 'string' ? job.intakeId : '';
    const [intake, approvals, activeMappingJobs] = await Promise.all([
      intakeId ? database.intakes.findUnique({ where: { id: intakeId } }) : Promise.resolve(null),
      database.approvals.findMany({ where: { subjectType: 'MAPPING_PACKAGE', subjectKey: job.id } }),
      intakeId ? database.mappingJobs.findMany({ where: { intakeId } }) : Promise.resolve([]),
    ]);
    const eligibility = evaluateAffiliateSportReconciliationEligibility(job, intake, approvals, activeMappingJobs);
    const terminalApprovals = approvals.filter((approval) => !ACTIVE_APPROVAL_STATUSES.includes(String(approval.status) as typeof ACTIVE_APPROVAL_STATUSES[number]))
      .map(approvalEnvelope)
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const row: AffiliateSportReconciliationRow = {
      jobId: String(job.id),
      intakeId,
      status: String(job.status),
      sourceLabels: eligibility.sourceLabels,
      sourceLabelsMissing: eligibility.sourceLabelsMissing,
      selectionReason: eligibility.reason,
      priorResultSummarySha256: stableAgentArtifactSha256(recordValue(job.resultSummary)),
      terminalApprovals,
      terminalApprovalSetSha256: approvalSetSha256(terminalApprovals),
    };
    if (eligibility.eligible && !hasReconciliationMarker(job)) eligible.push(row);
    else if (hasReconciliationMarker(job)) {
      row.outcome = 'ALREADY_RECONCILED';
      skippedCounts.ALREADY_RECONCILED = (skippedCounts.ALREADY_RECONCILED ?? 0) + 1;
    } else {
      skippedCounts[eligibility.reason] = (skippedCounts[eligibility.reason] ?? 0) + 1;
    }
    evaluatedRows.push(row);
  }
  if (eligible.length > AFFILIATE_SPORT_RECONCILIATION_MAX_ROWS && limit === undefined) {
    throw new Error(`Eligible reconciliation cohort exceeds the hard ${AFFILIATE_SPORT_RECONCILIATION_MAX_ROWS}-row ceiling; supply a reviewed positive --limit.`);
  }
  const selected = eligible.slice(0, limit ?? AFFILIATE_SPORT_RECONCILIATION_MAX_ROWS).map((row) => ({ ...row, outcome: 'PREVIEW_ELIGIBLE' as const }));
  const selectedIds = new Set(selected.map((row) => row.jobId));
  const rows = evaluatedRows.map((row) => selectedIds.has(row.jobId) ? selected.find((candidate) => candidate.jobId === row.jobId)! : row);
  return {
    schemaVersion: AFFILIATE_SPORT_RECONCILIATION_SCHEMA_VERSION,
    evaluatedAt: now.toISOString(),
    mode: 'DRY_RUN',
    catalogSha256: catalog.sha256,
    selectionSha256: selectionHashFor(catalog.sha256, selected),
    eligibleCount: eligible.length,
    selectedCount: selected.length,
    alreadyReconciledCount,
    skippedCounts,
    writeCount: 0,
    rows,
  };
};

export type AffiliateSportReconciliationApplyInput = {
  preview: AffiliateSportReconciliationPreview;
  expectedCount: number;
  expectedSelectionSha256: string;
};

const isConcurrentError = (error: unknown): boolean => (
  error instanceof Error && /SKIPPED_CONCURRENT|P2025|unique|unique constraint/i.test(error.message)
);

export const applyAffiliateSportReconciliation = async (
  input: AffiliateSportReconciliationApplyInput,
  dependencies: ReconciliationDependencies = {},
): Promise<AffiliateSportReconciliationPreview> => {
  if (input.preview.mode !== 'DRY_RUN') throw new Error('Apply requires a DRY_RUN preview.');
  if (input.expectedCount !== input.preview.selectedCount) throw new Error('Expected reconciliation count does not match the reviewed preview.');
  if (input.expectedSelectionSha256 !== input.preview.selectionSha256) throw new Error('Expected reconciliation selection hash does not match the reviewed preview.');
  const selected = input.preview.rows.filter((row) => row.outcome === 'PREVIEW_ELIGIBLE');
  if (selectionHashFor(input.preview.catalogSha256, selected) !== input.preview.selectionSha256) throw new Error('Reviewed reconciliation selection contents do not match selectionSha256.');
  const database = dependencies.database ?? defaultDatabase();
  const now = dependencies.now?.() ?? new Date();
  const catalog = await (dependencies.loadCatalog ?? (() => loadAffiliateSportsCatalogSnapshot(prisma)))();
  if (catalog.sha256 !== input.preview.catalogSha256) throw new Error('Catalog changed since the reviewed reconciliation preview.');
  const rows = input.preview.rows.map((row) => ({ ...row }));
  let writeCount = 0;
  for (const row of selected) {
    const index = rows.findIndex((candidate) => candidate.jobId === row.jobId);
    try {
      const outcome = await (database.transaction ?? (async <T>(callback: (db: ReconciliationDatabase) => Promise<T>) => callback(database)))(async (transactionDatabase) => {
        const job = await transactionDatabase.mappingJobs.findUnique({ where: { id: row.jobId } });
        if (!job || hasReconciliationMarker(job)) return 'ALREADY_RECONCILED' as const;
        const intakeId = typeof job.intakeId === 'string' ? job.intakeId : '';
        if (String(job.status) !== row.status || job.sourceId || job.mappingId || !intakeId) return 'SKIPPED_CONCURRENT' as const;
        const [approvals, activeMappingJobs] = await Promise.all([
          transactionDatabase.approvals.findMany({ where: { subjectType: 'MAPPING_PACKAGE', subjectKey: row.jobId } }),
          transactionDatabase.mappingJobs.findMany({ where: { intakeId } }),
        ]);
        if (approvals.some((approval) => ACTIVE_APPROVAL_STATUSES.includes(String(approval.status) as typeof ACTIVE_APPROVAL_STATUSES[number]))) return 'SKIPPED_CONCURRENT' as const;
        if (activeMappingJobs.some((candidate) => candidate.id !== row.jobId && ACTIVE_MAPPING_STATUSES.includes(String(candidate.status) as typeof ACTIVE_MAPPING_STATUSES[number]))) return 'SKIPPED_CONCURRENT' as const;
        const currentApprovalSet = approvals.filter((approval) => !ACTIVE_APPROVAL_STATUSES.includes(String(approval.status) as typeof ACTIVE_APPROVAL_STATUSES[number])).map(approvalEnvelope).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
        if (approvalSetSha256(currentApprovalSet) !== row.terminalApprovalSetSha256) return 'SKIPPED_CONCURRENT' as const;
        const envelope = recordValue(job.resultSummary);
        const nextEnvelope = appendAffiliateMappingHistory({
          envelope: {
            ...envelope,
            ...(Object.prototype.hasOwnProperty.call(envelope, 'sportReconciliationHistory') ? {} : { sportReconciliationHistory: [] }),
          },
          field: 'sportReconciliationHistory',
          entry: historyEntryFor(row, job, now),
        });
        const update = await transactionDatabase.mappingJobs.updateMany({
          where: { id: row.jobId, status: row.status, sourceId: null, mappingId: null },
          data: {
            status: 'QUEUED',
            legacyIdentityMigrationEligible: false,
            attemptCount: 0,
            claimedAt: null,
            leaseExpiresAt: null,
            workerId: null,
            branch: null,
            commit: null,
            errorMessage: null,
            finishedAt: null,
            resultSummary: nextEnvelope,
          },
        });
        if (update.count !== 1) return 'SKIPPED_CONCURRENT' as const;
        const intakeUpdate = transactionDatabase.intakes.updateMany
          ? await transactionDatabase.intakes.updateMany({ where: { id: intakeId }, data: { status: 'READY_FOR_MAPPING' } })
          : await transactionDatabase.intakes.update({ where: { id: intakeId }, data: { status: 'READY_FOR_MAPPING' } }).then(() => ({ count: 1 }));
        if ('count' in intakeUpdate && intakeUpdate.count !== 1) return 'SKIPPED_CONCURRENT' as const;
        return 'REQUEUED' as const;
      });
      rows[index] = { ...rows[index], outcome };
      if (outcome === 'REQUEUED') writeCount += 1;
    } catch (error) {
      rows[index] = { ...rows[index], outcome: isConcurrentError(error) ? 'SKIPPED_CONCURRENT' : 'ERROR', errorMessage: error instanceof Error ? error.message : String(error) };
    }
  }
  const output: AffiliateSportReconciliationPreview = {
    ...input.preview,
    evaluatedAt: now.toISOString(),
    mode: 'APPLY',
    rows,
    writeCount,
  };
  if (rows.some((row) => row.outcome === 'ERROR')) throw Object.assign(new Error('One or more reconciliation rows failed.'), { reconciliation: output });
  return output;
};
