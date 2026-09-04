import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { normalizeExternalHttpUrl } from "@/lib/externalUrl";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_OPERATIONS_VIEWS,
  type AffiliateOperationsContractSelection,
  type AffiliateOperationsSort,
  type AffiliateOperationsDetailType,
  type AffiliateOperationsFilters,
  type AffiliateOperationsProjection,
  type AffiliateOperationsProjectionInput,
  type AffiliateOperationsView,
  type AlertHistoryRow,
  type AlertsProjection,
  type CandidateRow,
  type CandidatesProjection,
  type CoverageCellRow,
  type CoverageProjection,
  type DemandHistoryRow,
  type CampaignRow,
  type CoverageTargetRow,
  type CutoverProjection,
  type DiscoveryOutcomeRow,
  type CoverageMovementRow,
  type ExceptionRow,
  type FailureParetoRow,
  type IntakeProjection,
  type IntakeRow,
  type JobRow,
  type JobsProjection,
  type LifecycleCountRow,
  type MarginalYieldRow,
  type OverviewProjection,
  type PriorityWorkRow,
  type ProjectionDetail,
  type ProjectionField,
  type ProjectionHistoryRow,
  type ProjectionRelatedRow,
  type ReconciliationClaimEvidence,
  type ReconciliationEvidencePage,
  type ReconciliationEvidencePagination,
  type ReconciliationFindingEvidence,
  type ReconciliationPreflightEvidence,
  type ReconciliationProcessEvidence,
  type ReconciliationRecordEvidence,
  type ReconciliationReportEvidence,
  type ReconciliationRootEvidence,
  type ReconciliationRunRow,
  type ReviewRow,
  type ReviewProjection,
  type SourceRow,
  type SourcesProjection,
  type SupplyTargetDeficitRow,
  type WipSeriesPoint,
  type WorkerHealthRow,
} from "@/types/affiliateOperations";
import {
  isAffiliateSupplyTargetFresh,
  normalizeAffiliateSupplyContractPolicy,
} from "./affiliateSupplyLifecycle";
import { affiliateDiscoveryPolicyKeyForUrl } from "./sourceDiscoveryRules";

const MAX_PAGE_SIZE = 50;
const MAX_PROJECTION_ROWS = 10_000;
const MAX_EXCEPTION_ROWS = 50;
const MAX_ALERT_RECOVERY_SCAN_ROWS = MAX_PROJECTION_ROWS + MAX_EXCEPTION_ROWS;
const TRUNCATION_TOLERATED_COLLECTIONS = new Set([
  "transitions",
  "gatewayEvents",
  "alertDeliveries",
  "reconciliationRuns",
]);
const NEVER_TRUNCATE_COLLECTIONS = new Set(["alertDeliveries"]);
const boundedProjectionRowsFor = <
  T extends Record<string, readonly unknown[]>,
>(
  rawRows: T,
): T => {
  const oversizedCollections = Object.entries(rawRows)
    .filter(
      ([collection, rows]) =>
        rows.length > MAX_PROJECTION_ROWS &&
        !TRUNCATION_TOLERATED_COLLECTIONS.has(collection),
    )
    .map(([collection]) => collection);
  if (oversizedCollections.length > 0) {
    throw new AffiliateOperationsProjectionIncompleteError(
      oversizedCollections,
    );
  }
  return Object.fromEntries(
    Object.entries(rawRows).map(([collection, rows]) => [
      collection,
      rows.length > MAX_PROJECTION_ROWS &&
      !NEVER_TRUNCATE_COLLECTIONS.has(collection)
        ? rows.slice(0, MAX_PROJECTION_ROWS)
        : rows,
    ]),
  ) as T;
};
const GLOBAL_OPERATIONAL_ALERT_SUBJECT_TYPES = [
  "AUTOMATION_SUPERVISOR",
  "ALERT",
] as const;
const GLOBAL_OPERATIONAL_ALERT_CATEGORIES = [
  "ALERT_DELIVERY_FAILURE",
  "AUTOMATION_ORCHESTRATION_FAILURE",
  "STALE_WORK_RECOVERY",
  "SUPERVISOR_HEARTBEAT_LOSS",
] as const;
const WORKER_HEALTH_RECOVERY_CATEGORIES = new Set([
  "SUPERVISOR_HEARTBEAT_LOSS",
]);
const DEFAULT_PAGE_SIZE = 25;
const MAX_RECONCILIATION_EVIDENCE_ITEMS = 100;
const MAX_RECONCILIATION_EVIDENCE_TEXT_LENGTH = 512;
const MAX_PRESERVED_PUBLIC_TARGET_HREF_LENGTH = 2048;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const ROLLUP_MS = 15 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export class AffiliateOperationsProjectionIncompleteError extends Error {
  constructor(collections: readonly string[]) {
    super(
      `Affiliate operations projection exceeds the ${MAX_PROJECTION_ROWS.toLocaleString()}-row safety bound: ${collections.join(", ")}`,
    );
    this.name = "AffiliateOperationsProjectionIncompleteError";
  }
}
const isAffiliateOperationsView = (
  value: string,
): value is AffiliateOperationsView =>
  (AFFILIATE_OPERATIONS_VIEWS as readonly string[]).includes(value);

const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => stringValue(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : [];

const providerValue = (...values: readonly unknown[]): string | null => {
  const providers = values
    .flatMap((value) => {
      if (typeof value === "string") return [value];
      const record = recordValue(value);
      return [
        record.provider,
        record.providerKey,
        record.providerOperationKey,
      ].filter((entry): entry is string => typeof entry === "string");
    })
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(providers)).join(", ") || null;
};

const numberValue = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWorkerHealthy = (
  worker: Readonly<{ status: unknown; leaseExpiresAt: unknown }>,
  now: Date,
): boolean => {
  const leaseExpiresAt = dateValue(worker.leaseExpiresAt);
  return (
    upper(worker.status) === "HEALTHY" &&
    leaseExpiresAt !== null &&
    leaseExpiresAt.getTime() > now.getTime()
  );
};

const isoValue = (value: unknown): string | null =>
  dateValue(value)?.toISOString() ?? null;

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "")
    return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized : "Not recorded";
  }
  return String(value);
};

const upper = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase();
const boundedEvidenceText = (value: unknown): string | null => {
  const text = stringValue(value);
  if (!text) return null;
  return text.length > MAX_RECONCILIATION_EVIDENCE_TEXT_LENGTH
    ? text.slice(0, MAX_RECONCILIATION_EVIDENCE_TEXT_LENGTH)
    : text;
};

const boundedEvidenceList = (value: unknown): string[] =>
  stringList(value).map((entry) =>
    entry.slice(0, MAX_RECONCILIATION_EVIDENCE_TEXT_LENGTH),
  );

const boundedEvidenceCounts = (value: unknown): Readonly<Record<string, number>> =>
  Object.fromEntries(
    Object.entries(recordValue(value))
      .filter(([key]) => /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(key))
      .map(([key, entry]) => [key, numberValue(entry, Number.NaN)] as const)
      .filter(([, entry]) => Number.isFinite(entry))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_RECONCILIATION_EVIDENCE_ITEMS),
  );
const boundedRecordsByKind = (
  ...values: readonly unknown[]
): Readonly<Record<string, number>> =>
  boundedEvidenceCounts(firstDefinedEvidenceValue(...values));
const boundedEvidenceCollection = <T>(
  values: readonly T[],
  includeAllCollections = false,
): T[] =>
  includeAllCollections
    ? [...values]
    : values.slice(0, MAX_RECONCILIATION_EVIDENCE_ITEMS);

const evidenceEntries = (...values: readonly unknown[]): unknown[] =>
  values.flatMap((value) => (Array.isArray(value) ? value : []));

const targetKey = (
  marketKey: string | null,
  sportId: string | null,
  sourceProfile: string,
  rolloutCohort = "DEFAULT",
  contractVersion: number | null = null,
): string =>
  `${rolloutCohort}\u0000${contractVersion ?? ""}\u0000${marketKey ?? ""}\u0000${sportId ?? ""}\u0000${upper(sourceProfile)}`;

const targetLabel = (
  marketKey: string | null,
  sportId: string | null,
  sourceProfile: string,
): string =>
  [marketKey, sportId, upper(sourceProfile)].filter(Boolean).join(" / ") ||
  "Unclassified target";

const ORGANIZATION_TARGET_TYPE_ALIASES = new Set([
  "ORG",
  "ORGS",
  "ORGANIZATION",
  "ORGANIZATIONS",
  "ORGANISATION",
  "ORGANISATIONS",
  "CLUB",
]);
const isOrganizationTargetType = (value: unknown): boolean =>
  ORGANIZATION_TARGET_TYPE_ALIASES.has(upper(value));

const adminLink = (
  view: AffiliateOperationsView,
  detailType?: AffiliateOperationsDetailType,
  id?: string | null,
  extra?: Record<string, string | null | undefined>,
): string => {
  const params = new URLSearchParams({ tab: "affiliateOperations", view });
  if (detailType && id) {
    params.set("selectedType", detailType);
    params.set("selected", id);
  }
  Object.entries(extra ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/admin?${params.toString()}`;
};
const operationalAlertGatewayJobIdForLink = (
  alert: Readonly<{
    subjectType?: string | null;
    subjectId?: string | null;
    payload?: unknown;
  }>,
): string | null => {
  const payload = recordValue(alert.payload);
  const payloadJobId = stringValue(payload.gatewayJobId ?? payload.jobId);
  if (payloadJobId) return payloadJobId;
  if (
    ["GATEWAY_JOB", "AGENT_GATEWAY_JOB", "AGENT_JOB"].includes(
      upper(alert.subjectType),
    )
  ) {
    return stringValue(alert.subjectId);
  }
  return null;
};
const operationalAlertGatewayJobContractForLink = (
  alert: Readonly<{
    rolloutCohort: string | null;
    contractVersion: number | null;
    subjectType?: string | null;
    subjectId?: string | null;
    payload?: unknown;
  }>,
  gatewayJobs: readonly Readonly<{
    id: string;
    subjectJson?: unknown;
  }>[] = [],
): Readonly<{
  rolloutCohort: string | null;
  contractVersion: number | null;
}> => {
  const gatewayJobId = operationalAlertGatewayJobIdForLink(alert);
  const gatewaySubject = recordValue(
    gatewayJobs.find((job) => job.id === gatewayJobId)?.subjectJson,
  );
  const gatewaySubjectVersion = numberValue(
    gatewaySubject.contractVersion ?? gatewaySubject.supplyContractVersion,
    -1,
  );
  return {
    rolloutCohort:
      alert.rolloutCohort ??
      stringValue(gatewaySubject.rolloutCohort ?? gatewaySubject.cohort),
    contractVersion:
      alert.contractVersion ??
      (gatewaySubjectVersion >= 0 ? gatewaySubjectVersion : null),
  };
};
const adminLinkForOperationalAlert = (
  alert: Readonly<{
    id: string;
    rolloutCohort: string | null;
    contractVersion: number | null;
    subjectType?: string | null;
    subjectId?: string | null;
    supplySourceId?: string | null;
    payload?: unknown;
  }>,
  recoveryRows: OperationalAlertRecoveryRows,
  view: AffiliateOperationsView = "alerts",
): string => {
  const contract = operationalAlertLineageContractForLink(
    alert,
    recoveryRows,
  );
  return adminLink(view, "alert", alert.id, {
    rolloutCohort: contract.rolloutCohort,
    contractVersion:
      contract.contractVersion === null
        ? undefined
        : String(contract.contractVersion),
  });
};

const appendProjectionContractToLinks = (
  value: unknown,
  contract: AffiliateOperationsContractSelection,
): void => {
  if (Array.isArray(value)) {
    value.forEach((entry) => appendProjectionContractToLinks(entry, contract));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  Object.entries(record).forEach(([key, entry]) => {
    if (
      key === "href" &&
      typeof entry === "string" &&
      entry.startsWith("/admin?")
    ) {
      const url = new URL(entry, "https://affiliate-operations.invalid");
      const isAlertDetail =
        url.searchParams.get("selectedType") === "alert" &&
        url.searchParams.has("selected");
      if (isAlertDetail && !url.searchParams.has("rolloutCohort")) return;
      if (!url.searchParams.has("rolloutCohort")) {
        url.searchParams.set("rolloutCohort", contract.rolloutCohort);
      }
      if (
        contract.contractVersion !== null &&
        !url.searchParams.has("contractVersion")
      ) {
        url.searchParams.set("contractVersion", String(contract.contractVersion));
      }
      record[key] = `${url.pathname}?${url.searchParams.toString()}`;
      return;
    }
    appendProjectionContractToLinks(entry, contract);
  });
};

const paginate = <T>(rows: readonly T[], page: number, pageSize: number) => {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSize)),
  );
  const start = (safePage - 1) * safePageSize;
  return {
    rows: rows.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total: rows.length,
  };
};
const clampedPageForTotal = (
  page: number,
  pageSize: number,
  total: number,
): number =>
  Math.min(
    Math.max(1, Math.trunc(page)),
    Math.max(1, Math.ceil(Math.max(0, total) / pageSize)),
  );
type ProjectionTimestampedValue = Readonly<{
  id: string;
  at?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  attempt?: unknown;
}>;

const projectionTimestampFor = (
  value: ProjectionTimestampedValue,
): number =>
  dateValue(value.at ?? value.createdAt ?? value.updatedAt)?.getTime() ?? 0;

const compareProjectionTimestamp = (
  left: ProjectionTimestampedValue,
  right: ProjectionTimestampedValue,
): number => projectionTimestampFor(right) - projectionTimestampFor(left);

const compareProjectionTimestampIdAttempt = (
  left: ProjectionTimestampedValue,
  right: ProjectionTimestampedValue,
): number => {
  const timestampComparison = compareProjectionTimestamp(left, right);
  if (timestampComparison) return timestampComparison;
  const idComparison = left.id.localeCompare(right.id);
  if (idComparison) return idComparison;
  return (
    numberValue(right.attempt, -1) - numberValue(left.attempt, -1)
  );
};

const alertDeliveryStatusPriority = (value: unknown): number =>
  ["DELIVERED", "FAILED", "NOT_CONFIGURED"].includes(upper(value)) ? 1 : 0;

const compareAlertDeliveryRecency = (
  left: ProjectionTimestampedValue & Readonly<{ status?: unknown }>,
  right: ProjectionTimestampedValue & Readonly<{ status?: unknown }>,
): number => {
  const timestampComparison = compareProjectionTimestamp(left, right);
  if (timestampComparison) return timestampComparison;
  const attemptComparison =
    numberValue(right.attempt, -1) - numberValue(left.attempt, -1);
  if (attemptComparison) return attemptComparison;
  const statusComparison =
    alertDeliveryStatusPriority(right.status)
    - alertDeliveryStatusPriority(left.status);
  if (statusComparison) return statusComparison;
  return left.id.localeCompare(right.id);
};


const ageMinutes = (startedAt: unknown, now: Date): number => {
  const start = dateValue(startedAt);
  return start
    ? Math.max(0, Math.floor((now.getTime() - start.getTime()) / MINUTE_MS))
    : 0;
};
const isWaitingStatus = (status: string): boolean =>
  [
    "QUEUED",
    "RETRY_WAIT",
    "DEFERRED",
    "REVIEW_REQUIRED",
    "CLAIMED",
    "ACTIVE",
    "STARTED",
    "PENDING",
  ].includes(upper(status));

const ageBandFor = (minutes: number): string => {
  if (minutes < 15) return "<15m";
  if (minutes < 60) return "15–60m";
  if (minutes < 240) return "1–4h";
  if (minutes < 1_440) return "4–24h";
  return ">24h";
};

const containsFilter = (value: unknown, filter: string): boolean =>
  !filter ||
  String(value ?? "")
    .toUpperCase()
    .includes(filter.toUpperCase());

const dateRangeCutoffFor = (range: string, now: Date): number | null => {
  if (!range) return null;
  if (range === "24h") return now.getTime() - DAY_MS;
  if (range === "7d") return now.getTime() - 7 * DAY_MS;
  if (range === "30d") return now.getTime() - 30 * DAY_MS;
  return dateValue(range)?.getTime() ?? null;
};

const matchesDateRange = (value: unknown, cutoff: number | null): boolean => {
  if (cutoff === null) return true;
  const date = dateValue(value);
  return Boolean(date && date.getTime() >= cutoff);
};

const normalizedContractPolicy = (
  contractJson: unknown,
  rolloutCohort = "DEFAULT",
): Record<string, unknown> =>
  normalizeAffiliateSupplyContractPolicy(
    recordValue(contractJson) as never,
    rolloutCohort,
  ) as unknown as Record<string, unknown>;


const parseTargetRules = (
  contractJson: unknown,
  rolloutCohort = "DEFAULT",
): Array<{
  marketKey: string | null;
  sportId: string | null;
  sourceProfile: string;
  minimumFreshPublishedSupply: number;
}> => {
  const payload = normalizedContractPolicy(contractJson, rolloutCohort);
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  return targets.map((target) => {
    const row = recordValue(target);
    return {
      marketKey: stringValue(row.marketKey),
      sportId: stringValue(row.sportId),
      sourceProfile: upper(row.sourceProfile),
      minimumFreshPublishedSupply: Math.max(
        0,
        Math.trunc(numberValue(row.minimumFreshPublishedSupply)),
      ),
    };
  });
};

const isFreshTarget = (
  target: {
    status: string;
    rejectedAt: unknown;
    freshnessExpiresAt: unknown;
    lastSuccessfulRefreshAt: unknown;
    sourceProfile: string;
    metadata: unknown;
  },
  root: { derivedStage: string; isExcluded: boolean } | undefined,
  contractJson: unknown,
  rolloutCohort: string,
  now: Date,
): boolean => {
  if (!root || upper(root.derivedStage) !== "PUBLISHED" || root.isExcluded)
    return false;
  let contract;
  try {
    contract = normalizeAffiliateSupplyContractPolicy(
      recordValue(contractJson) as never,
      rolloutCohort,
    );
  } catch {
    return false;
  }
  return isAffiliateSupplyTargetFresh(
    {
      status: target.status,
      rejectedAt: dateValue(target.rejectedAt),
      freshnessExpiresAt: dateValue(target.freshnessExpiresAt),
      lastSuccessfulRefreshAt: dateValue(target.lastSuccessfulRefreshAt),
      sourceProfile: target.sourceProfile,
      metadata: recordValue(target.metadata),
    },
    contract,
    now,
  );
};

type ProjectionRows = Awaited<ReturnType<typeof loadProjectionRows>>;
type ProjectionAlertDeliveryRecord = Readonly<{
  id: string;
  createdAt: Date;
  alertId: string;
  channel: string;
  status: string;
  attempt: number;
  deliveredAt: Date | null;
  responseCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
}>;
type OperationalAlertRecoveryAlert = Readonly<{
  id: string;
  createdAt: Date;
  eventKey: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  subjectType: string | null;
  subjectId: string | null;
  rolloutCohort: string | null;
  contractVersion: number | null;
  supplySourceId: string | null;
  coverageCellId: string | null;
  demandId: string | null;
  waveId: string | null;
  lifecycleGeneration: number | null;
  claimGeneration: number | null;
  workerId: string | null;
  queue: string | null;
  attempt: number | null;
  previousState: string | null;
  nextState: string | null;
  reasonCodes: unknown;
  evidenceRefs: unknown;
  payload: unknown;
}>;
type OperationalAlertRecoveryRows = Readonly<{
  roots: readonly Readonly<{
    id: string;
    liveSourceId: string | null;
    freshnessStatus: string;
    lastSuccessfulRefreshAt: unknown;
    lifecycleGeneration: number;
    rolloutCohort?: string | null;
    activeSupplyContractVersion?: number | null;
    invariantViolations: unknown;
  }>[];
  scrapeRuns: readonly Readonly<{
    id: string;
    supplySourceId: string | null;
    sourceId: string | null;
    status?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    startedAt?: unknown;
    finishedAt?: unknown;
  }>[];
  gatewayJobs: readonly Readonly<{
    id: string;
    supplySourceId: string | null;
    status: unknown;
    subjectType?: string | null;
    subjectId?: string | null;
    subjectJson?: unknown;
  }>[];
  receipts: readonly Readonly<{
    id?: string | null;
    jobId: string;
    operationKind: unknown;
    status: unknown;
    completedAt: unknown;
    updatedAt: unknown;
    createdAt: unknown;
  }>[];
  gatewayEvents: readonly Readonly<{
    id?: string | null;
    jobId: string | null;
    eventType: unknown;
    createdAt: unknown;
  }>[];
  discoveryRuns?: readonly Readonly<{
    id: string;
    campaignId: string;
  }>[];
  campaigns?: readonly Readonly<{
    id: string;
    metadata: unknown;
  }>[];
  intakes?: readonly Readonly<{
    id: string;
    supplySourceId: string | null;
    affiliateSourceId: string | null;
  }>[];
  intakeRuns?: readonly Readonly<{
    id: string;
    intakeId: string;
    supplySourceId: string | null;
  }>[];
  operationalAlerts: readonly OperationalAlertRecoveryAlert[];
  alertDeliveries: readonly Readonly<{
    id?: string | null;
    alertId: string;
    channel: unknown;
    status: unknown;
  }>[];
  workerHealth: readonly Readonly<{
    workerId: string;
    status: unknown;
    leaseExpiresAt: unknown;
  }>[];
}>;
const isTerminalAlertDelivery = (value: { status?: unknown }): boolean =>
  upper(value.status) !== "IN_FLIGHT";

const compareAlertDeliveryAttempt = (
  left: ProjectionAlertDeliveryRecord,
  right: ProjectionAlertDeliveryRecord,
): number => {
  const terminalComparison =
    Number(isTerminalAlertDelivery(right))
    - Number(isTerminalAlertDelivery(left));
  if (terminalComparison) return terminalComparison;
  return compareAlertDeliveryRecency(left, right);
};

const alertDeliveryAttemptKey = (
  delivery: ProjectionAlertDeliveryRecord,
): string =>
  [
    delivery.alertId,
    upper(delivery.channel),
    numberValue(delivery.attempt, -1),
  ].join("\u0000");

const dedupeAlertDeliveries = (
  deliveries: readonly ProjectionAlertDeliveryRecord[],
): ProjectionAlertDeliveryRecord[] => {
  const byAttempt = new Map<string, ProjectionAlertDeliveryRecord>();
  deliveries.forEach((delivery) => {
    const key = alertDeliveryAttemptKey(delivery);
    const current = byAttempt.get(key);
    if (!current || compareAlertDeliveryAttempt(delivery, current) < 0) {
      byAttempt.set(key, delivery);
    }
  });
  return [...byAttempt.values()].sort(compareAlertDeliveryRecency);
};
const uniqueEvidence = <T>(
  values: readonly T[],
  key: (value: T) => string,
): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const valueKey = key(value);
    if (seen.has(valueKey)) continue;
    seen.add(valueKey);
    result.push(value);
  }
  return result;
};
const stableEvidenceSortKey = (...values: readonly unknown[]): string =>
  values
    .map((value) =>
      Array.isArray(value)
        ? value.map((entry) => String(entry ?? "")).join("\u0000")
        : String(value ?? ""),
    )
    .join("\u0001");

const sortReconciliationEvidence = <T>(
  values: T[],
  key: (value: T) => readonly unknown[],
): T[] =>
  values.sort((left, right) =>
    stableEvidenceSortKey(...key(left)).localeCompare(
      stableEvidenceSortKey(...key(right)),
    ),
  );


const reconciliationFindingEvidenceFor = (
  value: unknown,
): ReconciliationFindingEvidence | null => {
  const finding = recordValue(value);
  const code = boundedEvidenceText(finding.code);
  if (!code) return null;
  return {
    code,
    severity: upper(finding.severity) || "UNKNOWN",
    detail: boundedEvidenceText(finding.detail) ?? "Not recorded",
    recordIds: boundedEvidenceList(finding.recordIds),
    resolution: boundedEvidenceText(finding.resolution) ?? "Not recorded",
  };
};
const reconciliationProcessEvidenceFor = (
  value: unknown,
): ReconciliationProcessEvidence | null => {
  const process = recordValue(value);
  const id = boundedEvidenceText(process.id);
  if (!id) return null;
  const command = boundedEvidenceText(process.command);
  return {
    id,
    kind: upper(process.kind) || "UNKNOWN",
    role: boundedEvidenceText(process.role),
    workerId: boundedEvidenceText(process.workerId),
    processClass: upper(process.processClass) || null,
    command: command?.split(/\s+/u, 1)[0] ?? null,
    status: upper(process.status) || null,
  };
};

const reconciliationTargetProjectionFor = (
  value: unknown,
): ReconciliationRootEvidence["targetProjections"][number] | null => {
  const target = recordValue(value);
  const sourceTargetId = boundedEvidenceText(
    target.sourceTargetId ?? target.id,
  );
  const targetId = boundedEvidenceText(target.targetId);
  if (!sourceTargetId || !targetId) return null;
  return {
    sourceTargetId,
    candidateId: boundedEvidenceText(target.candidateId),
    targetType: upper(target.targetType) || "UNKNOWN",
    targetId,
    status: upper(target.status) || "UNKNOWN",
    action: upper(target.action) || "UNKNOWN",
    evidenceRefs: boundedEvidenceList(target.evidenceRefs),
  };
};

const reconciliationRootSourceIdsFor = (
  root: Record<string, unknown>,
): string[] =>
  boundedEvidenceList([
    ...boundedEvidenceList(root.sourceIds),
    boundedEvidenceText(root.sourceId),
    boundedEvidenceText(root.existingRootId),
  ]);

const reconciliationRootTargetProjectionsFor = (
  root: Record<string, unknown>,
): ReconciliationRootEvidence["targetProjections"] =>
  sortReconciliationEvidence(
    uniqueEvidence(
      evidenceEntries(root.targetProjections ?? root.targets)
        .map(reconciliationTargetProjectionFor)
        .filter(
          (
            target,
          ): target is ReconciliationRootEvidence["targetProjections"][number] =>
            target !== null,
        ),
      (target) => `${target.sourceTargetId}:${target.targetId}`,
    ),
    (target) => [
      target.sourceTargetId,
      target.targetId,
      target.candidateId,
      target.targetType,
      target.status,
      target.action,
      target.evidenceRefs,
    ],
  );

const reconciliationRootHasEvidence = (
  root: Record<string, unknown>,
  sourceIds: readonly string[],
  recordIds: readonly string[],
  targetProjections: readonly ReconciliationRootEvidence["targetProjections"][number][],
): boolean =>
  sourceIds.length > 0
  || recordIds.length > 0
  || targetProjections.length > 0
  || Boolean(boundedEvidenceText(root.existingRootId))
  || Boolean(boundedEvidenceText(root.identityKey));

const reconciliationRootEvidenceFor = (
  value: unknown,
): ReconciliationRootEvidence | null => {
  const root = recordValue(value);
  const sourceIds = reconciliationRootSourceIdsFor(root);
  const recordIds = boundedEvidenceList(root.recordIds);
  const targetProjections = reconciliationRootTargetProjectionsFor(root);
  if (!reconciliationRootHasEvidence(
    root,
    sourceIds,
    recordIds,
    targetProjections,
  )) {
    return null;
  }
  return {
    existingRootId: boundedEvidenceText(root.existingRootId),
    identityKey: boundedEvidenceText(root.identityKey),
    canonicalUrl: boundedEvidenceText(root.canonicalUrl),
    origin: boundedEvidenceText(root.origin),
    pathKey: boundedEvidenceText(root.pathKey),
    derivedStage: upper(root.derivedStage) || null,
    action: upper(root.action) || null,
    sourceIds,
    recordIds,
    evidenceRefs: boundedEvidenceList(root.evidenceRefs),
    targetProjections,
  };
};

const reconciliationClaimEvidenceFor = (
  value: unknown,
): ReconciliationClaimEvidence | null => {
  const claim = recordValue(value);
  const id = boundedEvidenceText(claim.id);
  if (!id) return null;
  return {
    id,
    kind: upper(claim.kind) || "UNKNOWN",
    status: upper(claim.status) || null,
    action: upper(claim.action) || null,
    sourceId: boundedEvidenceText(claim.sourceId),
    supplySourceId: boundedEvidenceText(claim.supplySourceId),
    evidenceRefs: boundedEvidenceList(claim.evidenceRefs),
  };
};

const reconciliationRecordIdFor = (
  kind: string,
  record: Record<string, unknown>,
  index: number,
): string =>
  boundedEvidenceText(record.id) ?? `${upper(kind) || "RECORD"}:${index + 1}`;

const reconciliationRecordSourceIdsFor = (
  record: Record<string, unknown>,
): string[] =>
  boundedEvidenceList([
    ...boundedEvidenceList(record.sourceIds),
    ...boundedEvidenceList(record.supplySourceIds),
    record.sourceId,
    record.supplySourceId,
    record.affiliateSourceId,
  ]);

const reconciliationRecordIdsFor = (
  record: Record<string, unknown>,
): string[] =>
  boundedEvidenceList([
    ...boundedEvidenceList(record.recordIds),
    ...boundedEvidenceList(record.jobIds),
    ...boundedEvidenceList(record.claimIds),
    ...boundedEvidenceList(record.demandIds),
    ...boundedEvidenceList(record.waveIds),
    ...boundedEvidenceList(record.cellIds),
    ...boundedEvidenceList(record.runIds),
    ...boundedEvidenceList(record.mappingIds),
    ...boundedEvidenceList(record.candidateIds),
    record.jobId,
    record.claimId,
    record.demandId,
    record.waveId,
    record.cellId,
    record.runId,
    record.mappingId,
    record.candidateId,
  ]);

const reconciliationRecordEvidenceRefsFor = (
  record: Record<string, unknown>,
): string[] =>
  boundedEvidenceList([
    ...boundedEvidenceList(record.evidenceRefs),
    record.evidenceRef,
  ]);


const reconciliationRecordTimestampFor = (
  record: Record<string, unknown>,
): string | null =>
  isoValue(
    record.updatedAt
    ?? record.occurredAt
    ?? record.completedAt
    ?? record.createdAt,
  );

const reconciliationRecordDetailFor = (
  record: Record<string, unknown>,
): string | null =>
  boundedEvidenceText(
    record.detail
    ?? record.code
    ?? record.operationKind
    ?? record.command,
  );

const reconciliationRecordEvidenceFor = (
  kind: string,
  value: unknown,
  index: number,
): ReconciliationRecordEvidence => {
  const record = recordValue(value);
  const sourceIds = reconciliationRecordSourceIdsFor(record);
  const recordIds = reconciliationRecordIdsFor(record);
  const evidenceRefs = reconciliationRecordEvidenceRefsFor(record);
  return {
    id: reconciliationRecordIdFor(kind, record, index),
    kind: upper(kind) || "RECORD",
    status: upper(record.status) || null,
    at: reconciliationRecordTimestampFor(record),
    detail: reconciliationRecordDetailFor(record),
    refs: boundedEvidenceList([...evidenceRefs, ...sourceIds, ...recordIds]),
    sourceIds,
    recordIds,
    evidenceRefs,
  };
};

const reconciliationRecordEvidenceForCollection = (
  kind: string,
  value: unknown,
): ReconciliationRecordEvidence[] =>
  evidenceEntries(value).map((entry, index) =>
    reconciliationRecordEvidenceFor(kind, entry, index),
  );

type ReconciliationReportEvidenceContext = Readonly<{
  payload: Record<string, unknown>;
  report: Record<string, unknown>;
  session: Record<string, unknown>;
  evidence: Record<string, unknown>;
  decision: Record<string, unknown>;
  preflight: Record<string, unknown>;
}>;

const firstDefinedEvidenceValue = (...values: readonly unknown[]): unknown => {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
};

const booleanEvidenceValue = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const integerEvidenceValue = (...values: readonly unknown[]): number | null => {
  const value = firstDefinedEvidenceValue(...values);
  return typeof value === "number" && Number.isInteger(value) ? value : null;
};

const textEvidenceValue = (...values: readonly unknown[]): string | null =>
  boundedEvidenceText(firstDefinedEvidenceValue(...values));

const reconciliationReportEvidenceContextFor = (
  run: ProjectionRows["reconciliationRuns"][number],
): ReconciliationReportEvidenceContext => {
  const payload = recordValue(
    (run as unknown as { reportJson?: unknown }).reportJson,
  );
  const report = recordValue(firstDefinedEvidenceValue(payload.report, payload));
  const session = recordValue(
    firstDefinedEvidenceValue(payload.session, payload.cutoverSession, payload),
  );
  const evidence = recordValue(payload.evidence);
  const decision = recordValue(payload.decision);
  const nestedPreflight = firstDefinedEvidenceValue(
    session.preflightReport,
    session.preflight,
    payload.preflightReport,
    payload.preflight,
    report.preflightReport,
    report.preflight,
  );
  const hasRootPreflightEvidence = [
    "gatewayVersion",
    "reviewedLegacyProcessManifestHash",
    "reviewedLegacyProcessManifestCount",
    "reviewedLegacyProcessManifestArtifactId",
    "processInventoryArtifactId",
    "processInventoryHash",
    "processInventoryCount",
    "reviewedSystemdUnits",
    "legacyServiceUnits",
    "reviewedAgentNetwork",
  ].some((key) => payload[key] !== undefined);
  const preflight = recordValue(
    nestedPreflight !== null
      ? nestedPreflight
      : hasRootPreflightEvidence
        ? payload
        : null,
  );
  return { payload, report, session, evidence, decision, preflight };
};

const dedupeReconciliationProcessEvidence = (
  values: readonly ReconciliationProcessEvidence[],
): ReconciliationProcessEvidence[] => {
  const byId = new Map<string, ReconciliationProcessEvidence>();
  values.forEach((process) => {
    const existing = byId.get(process.id);
    if (!existing || (process.kind === "LEGACY" && existing.kind !== "LEGACY")) {
      byId.set(process.id, process);
    }
  });
  return [...byId.values()];
};

const reconciliationProcessEvidenceForContext = (
  context: ReconciliationReportEvidenceContext,
): ReconciliationProcessEvidence[] =>
  sortReconciliationEvidence(
    dedupeReconciliationProcessEvidence(
      evidenceEntries(
        recordValue(context.session.reviewedLegacyProcessManifest).processes,
        context.payload.processInventory,
        context.payload.reviewedProcessInventory,
        context.evidence.processInventory,
        context.evidence.reviewedProcessInventory,
        context.session.processInventory,
        context.report.processInventory,
      )
        .map(reconciliationProcessEvidenceFor)
        .filter(
          (process): process is ReconciliationProcessEvidence =>
            process !== null,
        ),
    ),
    (process) => [
      process.kind,
      process.id,
      process.role,
      process.workerId,
      process.processClass,
      process.command,
      process.status,
    ],
  );

const reconciliationRootEvidenceCollectionFor = (
  context: ReconciliationReportEvidenceContext,
): ReconciliationRootEvidence[] =>
  sortReconciliationEvidence(
    uniqueEvidence(
      evidenceEntries(context.report.roots, context.payload.roots)
        .map(reconciliationRootEvidenceFor)
        .filter((root): root is ReconciliationRootEvidence => root !== null),
      (root) => JSON.stringify({
        existingRootId: root.existingRootId,
        identityKey: root.identityKey,
        sourceIds: root.sourceIds,
      }),
    ),
    (root) => [
      root.existingRootId,
      root.identityKey,
      root.canonicalUrl,
      root.origin,
      root.pathKey,
      root.derivedStage,
      root.action,
      root.sourceIds,
      root.recordIds,
      root.evidenceRefs,
      root.targetProjections.map((target) =>
        stableEvidenceSortKey(
          target.sourceTargetId,
          target.targetId,
          target.candidateId,
          target.targetType,
          target.status,
          target.action,
          target.evidenceRefs,
        ),
      ),
    ],
  );

const reconciliationClaimEvidenceCollectionFor = (
  context: ReconciliationReportEvidenceContext,
): ReconciliationClaimEvidence[] =>
  sortReconciliationEvidence(
    uniqueEvidence(
      evidenceEntries(context.report.claimActions, context.payload.claimActions)
        .map(reconciliationClaimEvidenceFor)
        .filter(
          (claim): claim is ReconciliationClaimEvidence => claim !== null,
        ),
      (claim) => `${claim.kind}:${claim.id}`,
    ),
    (claim) => [
      claim.kind,
      claim.id,
      claim.status,
      claim.action,
      claim.sourceId,
      claim.supplySourceId,
      claim.evidenceRefs,
    ],
  );

const reconciliationFindingEvidenceKey = (
  finding: ReconciliationFindingEvidence,
): string => `${finding.code}:${finding.recordIds.join(",")}`;

const reconciliationFindingEvidenceCollectionFor = (
  values: readonly unknown[],
): ReconciliationFindingEvidence[] =>
  sortReconciliationEvidence(
    uniqueEvidence(
      evidenceEntries(...values)
        .map(reconciliationFindingEvidenceFor)
        .filter(
          (finding): finding is ReconciliationFindingEvidence =>
            finding !== null,
        ),
      reconciliationFindingEvidenceKey,
    ),
    (finding) => [
      finding.code,
      finding.severity,
      finding.detail,
      finding.recordIds,
      finding.resolution,
    ],
  );

const reconciliationRecordEvidenceCollectionForContext = (
  context: ReconciliationReportEvidenceContext,
): ReconciliationRecordEvidence[] =>
  sortReconciliationEvidence(
    [
      ...reconciliationRecordEvidenceForCollection(
        "LEGACY_SERVICE_UNIT",
        context.evidence.legacyServiceUnits,
      ),
      ...reconciliationRecordEvidenceForCollection(
        "CONTROL_PLANE_PROCESS",
        context.evidence.controlPlaneProcesses,
      ),
      ...reconciliationRecordEvidenceForCollection(
        "GOVERNED_RECEIPT",
        context.evidence.governedReceipts,
      ),
      ...reconciliationRecordEvidenceForCollection(
        "GOVERNED_LIFECYCLE",
        context.evidence.governedLifecycleTransitions,
      ),
      ...reconciliationRecordEvidenceForCollection(
        "GOVERNED_DEMAND_OR_WAVE",
        context.evidence.governedDemandOrWaveEvents,
      ),
      ...reconciliationRecordEvidenceForCollection(
        "GOVERNED_AUTHORITATIVE_WRITE",
        context.evidence.governedAuthoritativeWrites,
      ),
    ],
    (record) => [
      record.kind,
      record.id,
      record.at,
      record.status,
      record.detail,
      record.refs,
    ],
  );
const reconciliationSystemdUnitEvidenceFor = (
  value: unknown,
): ReconciliationPreflightEvidence["reviewedSystemdUnits"][number] | null => {
  const unit = recordValue(value);
  const processId = boundedEvidenceText(unit.processId);
  const unitId = boundedEvidenceText(unit.unitId);
  return processId && unitId ? { processId, unitId } : null;
};

const reconciliationLegacyServiceUnitEvidenceFor = (
  value: unknown,
): ReconciliationPreflightEvidence["legacyServiceUnits"][number] | null => {
  const unit = recordValue(value);
  const id = boundedEvidenceText(unit.id);
  const isEnabled = boundedEvidenceText(unit.isEnabled);
  const isActive = boundedEvidenceText(unit.isActive);
  return id && isEnabled && isActive ? { id, isEnabled, isActive } : null;
};

const reconciliationPreflightSystemdUnitsFor = (
  preflight: Record<string, unknown>,
  includeAllCollections: boolean,
): ReconciliationPreflightEvidence["reviewedSystemdUnits"] =>
  boundedEvidenceCollection(
    evidenceEntries(preflight.reviewedSystemdUnits)
      .map(reconciliationSystemdUnitEvidenceFor)
      .filter(
        (
          unit,
        ): unit is ReconciliationPreflightEvidence["reviewedSystemdUnits"][number] =>
          unit !== null,
      )
      .sort((left, right) =>
        `${left.processId}:${left.unitId}`.localeCompare(
          `${right.processId}:${right.unitId}`,
        ),
      ),
    includeAllCollections,
  );

const reconciliationPreflightLegacyServiceUnitsFor = (
  preflight: Record<string, unknown>,
  includeAllCollections: boolean,
): ReconciliationPreflightEvidence["legacyServiceUnits"] =>
  boundedEvidenceCollection(
    evidenceEntries(preflight.legacyServiceUnits)
      .map(reconciliationLegacyServiceUnitEvidenceFor)
      .filter(
        (
          unit,
        ): unit is ReconciliationPreflightEvidence["legacyServiceUnits"][number] =>
          unit !== null,
      )
      .sort((left, right) => left.id.localeCompare(right.id)),
    includeAllCollections,
  );

const hasAnyEvidence = (...flags: readonly boolean[]): boolean =>
  flags.some(Boolean);

const reconciliationPreflightEvidenceFor = (
  context: ReconciliationReportEvidenceContext,
  includeAllCollections = false,
): ReconciliationPreflightEvidence | null => {
  const preflight = context.preflight;
  const reviewedSystemdUnits = reconciliationPreflightSystemdUnitsFor(
    preflight,
    includeAllCollections,
  );
  const legacyServiceUnits = reconciliationPreflightLegacyServiceUnitsFor(
    preflight,
    includeAllCollections,
  );
  const evaluatedAt = isoValue(preflight.evaluatedAt);
  const isReady = booleanEvidenceValue(
    firstDefinedEvidenceValue(
      preflight.isReady,
      preflight.ready,
      preflight.readiness,
    ),
  );
  const gatewayVersion = integerEvidenceValue(preflight.gatewayVersion);
  const reviewedLegacyProcessManifestHash = textEvidenceValue(
    preflight.reviewedLegacyProcessManifestHash,
  );
  const reviewedLegacyProcessManifestCount = integerEvidenceValue(
    preflight.reviewedLegacyProcessManifestCount,
  );
  const reviewedLegacyProcessManifestArtifactId = textEvidenceValue(
    preflight.reviewedLegacyProcessManifestArtifactId,
  );
  const processInventoryArtifactId = textEvidenceValue(
    preflight.processInventoryArtifactId,
  );
  const processInventoryHash = textEvidenceValue(preflight.processInventoryHash);
  const processInventoryCount = integerEvidenceValue(
    preflight.processInventoryCount,
  );
  const counts = boundedEvidenceCounts(preflight.counts);
  const recordsByKind = boundedRecordsByKind(
    preflight.recordsByKind,
    recordValue(preflight.counts).recordsByKind,
    context.evidence.recordsByKind,
    recordValue(context.evidence.counts).recordsByKind,
  );
  const reviewedAgentNetwork = textEvidenceValue(
    preflight.reviewedAgentNetwork,
    preflight.agentNetwork,
    preflight.network,
  );
  const hasEvidence = hasAnyEvidence(
    evaluatedAt !== null,
    isReady !== null,
    gatewayVersion !== null,
    reviewedLegacyProcessManifestHash !== null,
    reviewedLegacyProcessManifestCount !== null,
    reviewedLegacyProcessManifestArtifactId !== null,
    processInventoryArtifactId !== null,
    processInventoryHash !== null,
    processInventoryCount !== null,
    reviewedSystemdUnits.length > 0,
    legacyServiceUnits.length > 0,
    Object.keys(counts).length > 0,
    Object.keys(recordsByKind).length > 0,
    reviewedAgentNetwork !== null,
  );
  return hasEvidence
    ? {
        evaluatedAt,
        isReady,
        gatewayVersion,
        reviewedLegacyProcessManifestHash,
        reviewedLegacyProcessManifestCount,
        reviewedLegacyProcessManifestArtifactId,
        processInventoryArtifactId,
        processInventoryHash,
        processInventoryCount,
        reviewedSystemdUnits,
        legacyServiceUnits,
        counts,
        recordsByKind,
        reviewedAgentNetwork,
      }
    : null;
};

const evidencePageFor = (total: number): ReconciliationEvidencePage => ({
  page: 1,
  pageSize: Math.min(total, MAX_RECONCILIATION_EVIDENCE_ITEMS),
  total,
  truncated: total > MAX_RECONCILIATION_EVIDENCE_ITEMS,
});

const reconciliationEvidencePaginationFor = (
  collections: Pick<
    ReconciliationReportEvidence,
    | "processes"
    | "roots"
    | "claimActions"
    | "blockingFindings"
    | "warnings"
    | "resolutions"
    | "recordEvidence"
  >,
): ReconciliationEvidencePagination => {
  const sourceIds = new Set<string>();
  const recordIds = new Set<string>();
  const evidenceRefs = new Set<string>();
  collections.roots.forEach((root) => {
    root.sourceIds.forEach((id) => sourceIds.add(id));
    root.recordIds.forEach((id) => recordIds.add(id));
    root.evidenceRefs.forEach((id) => evidenceRefs.add(id));
    root.targetProjections.forEach((target) => {
      target.evidenceRefs.forEach((id) => evidenceRefs.add(id));
    });
  });
  collections.claimActions.forEach((claim) => {
    [claim.sourceId, claim.supplySourceId]
      .filter((id): id is string => Boolean(id))
      .forEach((id) => sourceIds.add(id));
    claim.evidenceRefs.forEach((id) => evidenceRefs.add(id));
  });
  [...collections.blockingFindings, ...collections.warnings, ...collections.resolutions]
    .forEach((finding) => finding.recordIds.forEach((id) => recordIds.add(id)));
  collections.recordEvidence.forEach((record) => {
    recordIds.add(record.id);
    record.sourceIds.forEach((id) => sourceIds.add(id));
    record.recordIds.forEach((id) => recordIds.add(id));
    record.evidenceRefs.forEach((id) => evidenceRefs.add(id));
  });
  return {
    processes: evidencePageFor(collections.processes.length),
    roots: evidencePageFor(collections.roots.length),
    claimActions: evidencePageFor(collections.claimActions.length),
    blockingFindings: evidencePageFor(collections.blockingFindings.length),
    warnings: evidencePageFor(collections.warnings.length),
    resolutions: evidencePageFor(collections.resolutions.length),
    recordEvidence: evidencePageFor(collections.recordEvidence.length),
    sourceIds: evidencePageFor(sourceIds.size),
    recordIds: evidencePageFor(recordIds.size),
    evidenceRefs: evidencePageFor(evidenceRefs.size),
  };
};

type ReconciliationReportEvidenceCollections = Pick<
  ReconciliationReportEvidence,
  | "processes"
  | "roots"
  | "claimActions"
  | "blockingFindings"
  | "warnings"
  | "resolutions"
  | "recordEvidence"
  | "preflight"
  | "evidencePagination"
>;

const reconciliationReportEvidenceCollectionsFor = (
  context: ReconciliationReportEvidenceContext,
  includeAllCollections = false,
): ReconciliationReportEvidenceCollections => {
  const collections = {
    processes: reconciliationProcessEvidenceForContext(context),
    roots: reconciliationRootEvidenceCollectionFor(context),
    claimActions: reconciliationClaimEvidenceCollectionFor(context),
    blockingFindings: reconciliationFindingEvidenceCollectionFor([
      context.report.blockingFindings,
      context.payload.blockingFindings,
      context.preflight.blockingFindings,
    ]),
    warnings: reconciliationFindingEvidenceCollectionFor([
      context.report.warnings,
      context.payload.warnings,
      context.preflight.warnings,
    ]),
    resolutions: reconciliationFindingEvidenceCollectionFor([
      context.report.resolutions,
      context.payload.resolutions,
      context.preflight.resolutions,
    ]),
    recordEvidence: reconciliationRecordEvidenceCollectionForContext(context),
  };
  const evidencePagination = reconciliationEvidencePaginationFor(collections);
  return {
    processes: boundedEvidenceCollection(
      collections.processes,
      includeAllCollections,
    ),
    roots: boundedEvidenceCollection(collections.roots, includeAllCollections),
    claimActions: boundedEvidenceCollection(
      collections.claimActions,
      includeAllCollections,
    ),
    blockingFindings: boundedEvidenceCollection(
      collections.blockingFindings,
      includeAllCollections,
    ),
    warnings: boundedEvidenceCollection(
      collections.warnings,
      includeAllCollections,
    ),
    resolutions: boundedEvidenceCollection(
      collections.resolutions,
      includeAllCollections,
    ),
    recordEvidence: boundedEvidenceCollection(
      collections.recordEvidence,
      includeAllCollections,
    ),
    preflight: reconciliationPreflightEvidenceFor(
      context,
      includeAllCollections,
    ),
    evidencePagination,
  };
};

type ReconciliationReportEvidenceScalars = Omit<
  ReconciliationReportEvidence,
  keyof ReconciliationReportEvidenceCollections
>;

const reconciliationReportEvidenceScalarsFor = (
  run: ProjectionRows["reconciliationRuns"][number],
  context: ReconciliationReportEvidenceContext,
): ReconciliationReportEvidenceScalars => ({
  kind: textEvidenceValue(
    context.payload.kind,
    context.report.kind,
    run.mode,
  ),
  schemaVersion: integerEvidenceValue(
    context.report.schemaVersion,
    context.payload.schemaVersion,
  ),
  evaluatedAt: isoValue(
    firstDefinedEvidenceValue(
      context.report.evaluatedAt,
      context.payload.evaluatedAt,
    ),
  ),
  sessionId: textEvidenceValue(
    context.payload.sessionId,
    context.payload.cutoverSessionId,
    context.session.sessionId,
  ),
  sessionHash: textEvidenceValue(
    context.payload.sessionHash,
    context.payload.cutoverSessionHash,
    context.session.sessionHash,
  ),
  evidenceHash: boundedEvidenceText(context.payload.evidenceHash),
  isApplySafe: booleanEvidenceValue(context.report.isApplySafe),
  evidenceComplete: booleanEvidenceValue(context.payload.evidenceComplete),
  decisionMode: textEvidenceValue(context.decision.mode),
  decisionReasonCode: textEvidenceValue(context.decision.reasonCode),
  decisionDetail: textEvidenceValue(context.decision.detail),
  decisionResolution: textEvidenceValue(context.decision.resolution),
  legacySnapshotHash: boundedEvidenceText(context.report.legacySnapshotHash),
  supplyContractVersion: integerEvidenceValue(
    context.report.supplyContractVersion,
    context.payload.supplyContractVersion,
    run.supplyContractVersion,
  ),
  supplyContractHash: textEvidenceValue(
    context.report.supplyContractHash,
    context.payload.supplyContractHash,
    run.supplyContractHash,
  ),
  deploymentContractVersion: integerEvidenceValue(
    context.report.deploymentContractVersion,
    context.payload.deploymentContractVersion,
    run.deploymentContractVersion,
  ),
  deploymentContractHash: textEvidenceValue(
    context.report.deploymentContractHash,
    context.payload.deploymentContractHash,
    run.deploymentContractHash,
  ),
  inputHash: textEvidenceValue(
    context.report.inputHash,
    context.payload.inputHash,
    run.inputHash,
  ),
  outputHash: textEvidenceValue(
    context.report.outputHash,
    context.payload.outputHash,
    run.outputHash,
  ),
  reportHash: textEvidenceValue(
    context.report.reportHash,
    context.payload.reportHash,
    run.reportHash,
  ),
  counts: boundedEvidenceCounts(
    firstDefinedEvidenceValue(
      context.report.counts,
      context.payload.counts,
      run.counts,
    ),
  ),
  recordsByKind: boundedRecordsByKind(
    context.report.recordsByKind,
    recordValue(context.report.counts).recordsByKind,
    context.payload.recordsByKind,
    recordValue(context.payload.counts).recordsByKind,
    recordValue(run.counts).recordsByKind,
  ),
});

const reconciliationReportEvidenceFor = (
  run: ProjectionRows["reconciliationRuns"][number],
  includeAllCollections = false,
): ReconciliationReportEvidence => {
  const context = reconciliationReportEvidenceContextFor(run);
  return {
    ...reconciliationReportEvidenceScalarsFor(run, context),
    ...reconciliationReportEvidenceCollectionsFor(
      context,
      includeAllCollections,
    ),
  };
};

type ProjectionDimensionContext = Readonly<{
  rootsById: ReadonlyMap<string, ProjectionRows["roots"][number]>;
  targetsByRoot: ReadonlyMap<
    string,
    readonly ProjectionRows["targets"][number][]
  >;
  intakesById: ReadonlyMap<string, ProjectionRows["intakes"][number]>;
  sourcesById: ReadonlyMap<string, ProjectionRows["sources"][number]>;
  candidatesById: ReadonlyMap<string, ProjectionRows["candidates"][number]>;
  organizationsById: ReadonlyMap<
    string,
    ProjectionRows["organizations"][number]
  >;
  dateRangeCutoff: number | null;
}>;

const projectionDimensionContext = (
  rows: ProjectionRows,
  dateRangeCutoff: number | null = null,
): ProjectionDimensionContext => {
  const targetsByRoot = new Map<string, ProjectionRows["targets"][number][]>();
  rows.targets.forEach((target) => {
    const targets = targetsByRoot.get(target.supplySourceId) ?? [];
    targets.push(target);
    targetsByRoot.set(target.supplySourceId, targets);
  });
  return {
    rootsById: new Map(rows.roots.map((root) => [root.id, root])),
    targetsByRoot,
    intakesById: new Map(rows.intakes.map((intake) => [intake.id, intake])),
    sourcesById: new Map(rows.sources.map((source) => [source.id, source])),
    candidatesById: new Map(
      rows.candidates.map((candidate) => [candidate.id, candidate]),
    ),
    organizationsById: new Map(
      rows.organizations.map((organization) => [organization.id, organization]),
    ),
    dateRangeCutoff,
  };
};

const valueForId = <T>(
  id: string | null | undefined,
  values: ReadonlyMap<string, T>,
): T | undefined => (id ? values.get(id) : undefined);

const targetCityValuesFor = (
  target: ProjectionRows["targets"][number],
  context: ProjectionDimensionContext,
): readonly unknown[] => {
  const metadata = recordValue(target.metadata);
  const candidate = valueForId(target.candidateId, context.candidatesById);
  const root = context.rootsById.get(target.supplySourceId);
  const intake = valueForId(root?.intakeId, context.intakesById);
  const source = valueForId(root?.liveSourceId, context.sourcesById);
  const organization = valueForId(
    source?.organizationId,
    context.organizationsById,
  );
  return [
    metadata.city,
    metadata.cityId,
    metadata.location,
    candidate?.city,
    intake?.region,
    organization?.location,
  ];
};

const targetMatchesCity = (
  target: ProjectionRows["targets"][number],
  context: ProjectionDimensionContext,
  city: string,
): boolean => {
  if (!city) return true;
  return targetCityValuesFor(target, context).some((value) =>
    containsFilter(value, city),
  );
};

const targetMatchesDimensions = (
  target: ProjectionRows["targets"][number],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean =>
  containsFilter(target.marketKey, filters.market) &&
  targetMatchesCity(target, context, filters.city) &&
  containsFilter(target.sportId, filters.sport) &&
  containsFilter(target.sourceProfile, filters.profile);

const targetMatchesFilters = (
  target: ProjectionRows["targets"][number],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean =>
  targetMatchesDimensions(target, filters, context) &&
  containsFilter(target.status, filters.status) &&
  matchesDateRange(
    target.freshnessExpiresAt ??
      target.lastSuccessfulRefreshAt ??
      target.publishedAt,
    context.dateRangeCutoff,
  );

const rootMatchesCity = (
  root: ProjectionRows["roots"][number],
  context: ProjectionDimensionContext,
  city: string,
): boolean => {
  if (!city) return true;
  const intake = root.intakeId
    ? context.intakesById.get(root.intakeId)
    : undefined;
  const source = root.liveSourceId
    ? context.sourcesById.get(root.liveSourceId)
    : undefined;
  const organization = source?.organizationId
    ? context.organizationsById.get(source.organizationId)
    : undefined;
  return (
    [intake?.region, organization?.location].some((value) =>
      containsFilter(value, city),
    ) ||
    (context.targetsByRoot.get(root.id) ?? []).some((target) =>
      targetMatchesCity(target, context, city),
    )
  );
};

const rootHasTargetDimensionFilter = (
  filters: AffiliateOperationsFilters,
): boolean => Boolean(filters.market || filters.sport || filters.profile);

const rootHasMatchingTarget = (
  rootTargets: readonly ProjectionRows["targets"][number][],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean =>
  rootTargets.some((target) => targetMatchesFilters(target, filters, context));

const rootStatusMatchesFilters = (
  root: ProjectionRows["roots"][number],
  rootTargets: readonly ProjectionRows["targets"][number][],
  filters: AffiliateOperationsFilters,
): boolean => {
  if (!filters.status) return true;
  return (
    [root.derivedStage, root.derivedOutcome, root.freshnessStatus].some(
      (value) => containsFilter(value, filters.status),
    ) ||
    rootTargets.some((target) => containsFilter(target.status, filters.status))
  );
};

const rootDateMatchesFilters = (
  root: ProjectionRows["roots"][number],
  rootTargets: readonly ProjectionRows["targets"][number][],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean => {
  if (!filters.range) return true;
  if (matchesDateRange(root.lastSuccessfulRefreshAt, context.dateRangeCutoff))
    return true;
  return rootTargets.some((target) =>
    matchesDateRange(
      target.freshnessExpiresAt ??
        target.lastSuccessfulRefreshAt ??
        target.publishedAt,
      context.dateRangeCutoff,
    ),
  );
};

const rootMatchesFilters = (
  root: ProjectionRows["roots"][number],
  filters: AffiliateOperationsFilters,
  context: ProjectionDimensionContext,
): boolean => {
  const rootTargets = context.targetsByRoot.get(root.id) ?? [];
  if (filters.city && !rootMatchesCity(root, context, filters.city))
    return false;
  if (
    rootHasTargetDimensionFilter(filters) &&
    !rootHasMatchingTarget(rootTargets, filters, context)
  ) {
    return false;
  }
  return (
    rootStatusMatchesFilters(root, rootTargets, filters) &&
    rootDateMatchesFilters(root, rootTargets, filters, context)
  );
};

const rootIdForSource = (
  rows: OperationalAlertRecoveryRows,
  sourceId: string | null | undefined,
): string | null => {
  if (!sourceId) return null;
  if (rows.roots.some((root) => root.id === sourceId)) return sourceId;
  return rows.roots.find((root) => root.liveSourceId === sourceId)?.id ?? null;
};

const rootIdForScrapeRun = (
  rows: OperationalAlertRecoveryRows,
  runId: string | null | undefined,
): string | null => {
  if (!runId) return null;
  const run = rows.scrapeRuns.find((candidate) => candidate.id === runId);
  return rootIdForSource(rows, run?.supplySourceId ?? run?.sourceId);
};

const alertDirectSupplySourceIdFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string | null =>
  stringValue(alert.supplySourceId) ?? stringValue(payload.supplySourceId);

const alertSourceIdFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string | null =>
  stringValue(payload.sourceId) ??
  (["AFFILIATE_SOURCE", "AFFILIATE_SUPPLY_SOURCE"].includes(
    upper(alert.subjectType),
  )
    ? stringValue(alert.subjectId)
    : null);

const alertScrapeRunIdFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string | null =>
  stringValue(payload.scrapeRunId ?? payload.runId) ??
  (["SOURCE_REFRESH", "AFFILIATE_SOURCE_REFRESH"].includes(
    upper(alert.subjectType),
  )
    ? stringValue(alert.subjectId)
    : null);

const alertGatewayJobIdFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string | null =>
  stringValue(payload.gatewayJobId ?? payload.jobId) ??
  (["GATEWAY_JOB", "AGENT_GATEWAY_JOB", "AGENT_JOB"].includes(
    upper(alert.subjectType),
  )
    ? stringValue(alert.subjectId)
    : null);

const alertGatewayRootIdFor = (
  rows: OperationalAlertRecoveryRows,
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string | null => {
  const jobId = alertGatewayJobIdFor(alert, payload);
  const job = jobId
    ? rows.gatewayJobs.find((candidate) => candidate.id === jobId)
    : undefined;
  const subject = recordValue(job?.subjectJson);
  return rootIdForSource(
    rows,
    job?.supplySourceId ??
      stringValue(subject.supplySourceId ?? subject.sourceId),
  );
};

const alertIntakeRootIdFor = (
  rows: OperationalAlertRecoveryRows,
  subjectId: string | null,
): string | null => {
  const run = rows.intakeRuns?.find((candidate) => candidate.id === subjectId);
  const intake = rows.intakes?.find((candidate) => candidate.id === run?.intakeId);
  return rootIdForSource(
    rows,
    run?.supplySourceId ??
      intake?.supplySourceId ??
      intake?.affiliateSourceId,
  );
};

const alertDiscoveryRootIdFor = (
  rows: OperationalAlertRecoveryRows,
  subjectId: string | null,
  payload: Record<string, unknown>,
): string | null => {
  const run = rows.discoveryRuns?.find((candidate) =>
    candidate.id === subjectId,
  );
  const campaign = rows.campaigns?.find(
    (candidate) => candidate.id === run?.campaignId,
  );
  const metadata = recordValue(campaign?.metadata);
  return rootIdForSource(
    rows,
    stringValue(
      metadata.supplySourceId ??
        metadata.sourceId ??
        payload.supplySourceId ??
        payload.sourceId,
    ),
  );
};

const alertTypedRootIdFor = (
  rows: OperationalAlertRecoveryRows,
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string | null => {
  const subjectType = upper(alert.subjectType);
  const subjectId = stringValue(alert.subjectId);
  switch (subjectType) {
    case "AFFILIATE_SUPPLY_SOURCE":
      return rootIdForSource(rows, subjectId);
    case "INTAKE_RUN":
      return alertIntakeRootIdFor(rows, subjectId);
    case "DISCOVERY_RUN":
      return alertDiscoveryRootIdFor(rows, subjectId, payload);
    default:
      return null;
  }
};

const rootIdForAlert = (
  rows: OperationalAlertRecoveryRows,
  alert: OperationalAlertRecoveryAlert,
): string | null => {
  const payload = recordValue(alert.payload);
  return (
    [
      alertTypedRootIdFor(rows, alert, payload),
      rootIdForSource(rows, alertDirectSupplySourceIdFor(alert, payload)),
      rootIdForSource(rows, alertSourceIdFor(alert, payload)),
      rootIdForScrapeRun(rows, alertScrapeRunIdFor(alert, payload)),
      alertGatewayRootIdFor(rows, alert, payload),
    ].find((rootId): rootId is string => Boolean(rootId)) ?? null
  );
};

const operationalAlertLineageContractForLink = (
  alert: Readonly<{
    rolloutCohort: string | null;
    contractVersion: number | null;
    subjectType?: string | null;
    subjectId?: string | null;
    supplySourceId?: string | null;
    payload?: unknown;
  }>,
  rows: OperationalAlertRecoveryRows,
): Readonly<{
  rolloutCohort: string | null;
  contractVersion: number | null;
}> => {
  const gatewayContract = operationalAlertGatewayJobContractForLink(
    alert,
    rows.gatewayJobs,
  );
  const rootId = rootIdForAlert(
    rows,
    alert as OperationalAlertRecoveryAlert,
  );
  const root = rootId
    ? rows.roots.find((candidate) => candidate.id === rootId)
    : undefined;
  return {
    rolloutCohort:
      gatewayContract.rolloutCohort ?? root?.rolloutCohort ?? null,
    contractVersion:
      gatewayContract.contractVersion ??
      root?.activeSupplyContractVersion ??
      null,
  };
};
const targetIdsByTypeFor = (
  targets: readonly Readonly<{
    targetId: unknown;
    targetType: unknown;
  }>[],
): Map<string, Set<string>> => {
  const targetIdsByType = new Map<string, Set<string>>();
  targets.forEach((target) => {
    const targetId = stringValue(target.targetId);
    if (!targetId) return;
    const targetType = upper(target.targetType);
    const ids = targetIdsByType.get(targetType) ?? new Set<string>();
    ids.add(targetId);
    targetIdsByType.set(targetType, ids);
  });
  return targetIdsByType;
};

const targetIdsForType = (
  targetIdsByType: ReadonlyMap<string, ReadonlySet<string>>,
  targetType: string,
): string[] => Array.from(targetIdsByType.get(targetType) ?? []);

const reconciliationRunSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  mode: true,
  status: true,
  operatorId: true,
  rolloutCohort: true,
  supplyContractVersion: true,
  supplyContractHash: true,
  deploymentContractVersion: true,
  deploymentContractHash: true,
  inputHash: true,
  outputHash: true,
  reportHash: true,
  counts: true,
  failedInvariants: true,
  resolutionRefs: true,
  reportJson: true,
  appliedAt: true,
  appliedBy: true,
} as const;

const operationalAlertSelect = {
  id: true,
  createdAt: true,
  eventKey: true,
  category: true,
  severity: true,
  title: true,
  detail: true,
  subjectType: true,
  subjectId: true,
  rolloutCohort: true,
  contractVersion: true,
  supplySourceId: true,
  coverageCellId: true,
  demandId: true,
  waveId: true,
  queue: true,
  lifecycleGeneration: true,
  claimGeneration: true,
  workerId: true,
  attempt: true,
  previousState: true,
  nextState: true,
  reasonCodes: true,
  evidenceRefs: true,
  inputHash: true,
  outputHash: true,
  payload: true,
  retentionClass: true,
  retentionDeadline: true,
} as const;
const operationalAlertRecoverySelect = operationalAlertSelect;
const operationalAlertGatewayJobRecoverySelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  queue: true,
  lane: true,
  role: true,
  subjectType: true,
  subjectId: true,
  subjectJson: true,
  evidenceManifestJson: true,
  supplySourceId: true,
  expectedLifecycleGeneration: true,
  status: true,
  priority: true,
  nextAttemptAt: true,
  claimGeneration: true,
  activeClaimId: true,
  parentClaimId: true,
  invocationFailureCount: true,
  lastInvocationFailedAt: true,
  pipelineBlockedAt: true,
  terminalDisposition: true,
  resultHash: true,
  resultJson: true,
  terminalReceiptId: true,
  finishedAt: true,
  eventSequence: true,
} as const;

type OperationalAlertLineageScope = Readonly<{
  sourceIds: readonly string[];
  gatewayJobIds: readonly string[];
  discoveryRunIds: readonly string[];
  intakeRunIds: readonly string[];
  scrapeRunIds: readonly string[];
}>;

const nonEmptyUniqueIds = (values: readonly string[]): string[] =>
  Array.from(new Set(values.filter((value) => value.length > 0)));

const operationalAlertSubjectLineageWhereFor = (
  scope: OperationalAlertLineageScope,
): Prisma.AffiliateOperationalAlertsWhereInput[] => [
  ...(
    scope.sourceIds.length > 0
      ? [
          {
            AND: [
              {
                subjectType: {
                  in: ["AFFILIATE_SOURCE", "AFFILIATE_SUPPLY_SOURCE"],
                },
              },
              { subjectId: { in: [...scope.sourceIds] } },
            ],
          },
        ]
      : []
  ),
  ...(
    scope.gatewayJobIds.length > 0
      ? [
          {
            AND: [
              {
                subjectType: {
                  in: ["GATEWAY_JOB", "AGENT_GATEWAY_JOB", "AGENT_JOB"],
                },
              },
              { subjectId: { in: [...scope.gatewayJobIds] } },
            ],
          },
        ]
      : []
  ),
  ...(
    scope.discoveryRunIds.length > 0
      ? [
          {
            AND: [
              { subjectType: "DISCOVERY_RUN" },
              { subjectId: { in: [...scope.discoveryRunIds] } },
            ],
          },
        ]
      : []
  ),
  ...(
    scope.intakeRunIds.length > 0
      ? [
          {
            AND: [
              { subjectType: "INTAKE_RUN" },
              { subjectId: { in: [...scope.intakeRunIds] } },
            ],
          },
        ]
      : []
  ),
  ...(
    scope.scrapeRunIds.length > 0
      ? [
          {
            AND: [
              {
                subjectType: {
                  in: ["SOURCE_REFRESH", "AFFILIATE_SOURCE_REFRESH"],
                },
              },
              { subjectId: { in: [...scope.scrapeRunIds] } },
            ],
          },
        ]
      : []
  ),
];
const operationalAlertCoverageSubjectLineageWhereFor = (
  coverageCellIds: readonly string[],
): Prisma.AffiliateOperationalAlertsWhereInput[] =>
  coverageCellIds.length > 0
    ? [
        {
          AND: [
            { subjectType: "AGENT_JOB" },
            { subjectId: { in: [...coverageCellIds] } },
          ],
        },
      ]
    : [];


const operationalAlertLineageWhereFor = (
  scope: OperationalAlertLineageScope,
): Prisma.AffiliateOperationalAlertsWhereInput[] =>
  operationalAlertSubjectLineageWhereFor(scope);

type OperationalAlertWhereOptions = Readonly<{
  includeGlobalInfrastructure?: boolean;
  includeUnbound?: boolean;
}>;
const operationalAlertNormalizedLineageFor = (
  lineage: OperationalAlertLineageScope,
): OperationalAlertLineageScope => ({
  sourceIds: nonEmptyUniqueIds(lineage.sourceIds),
  gatewayJobIds: nonEmptyUniqueIds(lineage.gatewayJobIds),
  discoveryRunIds: nonEmptyUniqueIds(lineage.discoveryRunIds),
  intakeRunIds: nonEmptyUniqueIds(lineage.intakeRunIds),
  scrapeRunIds: nonEmptyUniqueIds(lineage.scrapeRunIds),
});

const operationalAlertDirectLineageWhereFor = (
  rootIds: readonly string[],
  coverageCellIds: readonly string[],
  demandIds: readonly string[],
  waveIds: readonly string[],
): Prisma.AffiliateOperationalAlertsWhereInput[] => [
  ...(rootIds.length > 0
    ? [{ supplySourceId: { in: [...rootIds] } }]
    : []),
  ...(coverageCellIds.length > 0
    ? [{ coverageCellId: { in: [...coverageCellIds] } }]
    : []),
  ...(demandIds.length > 0 ? [{ demandId: { in: [...demandIds] } }] : []),
  ...(waveIds.length > 0 ? [{ waveId: { in: [...waveIds] } }] : []),
];

const operationalAlertGlobalWhereFor =
  (): Prisma.AffiliateOperationalAlertsWhereInput => ({
    AND: [
      { rolloutCohort: null, contractVersion: null },
      {
        OR: [
          {
            subjectType: {
              in: [...GLOBAL_OPERATIONAL_ALERT_SUBJECT_TYPES],
            },
          },
          {
            category: {
              in: [...GLOBAL_OPERATIONAL_ALERT_CATEGORIES],
            },
          },
        ],
      },
    ],
  });

const operationalAlertUnboundWhereFor = (
  lineageWhere: readonly Prisma.AffiliateOperationalAlertsWhereInput[],
  includeUnbound: boolean,
): Prisma.AffiliateOperationalAlertsWhereInput[] =>
  includeUnbound && lineageWhere.length === 0
    ? [
        {
          rolloutCohort: null,
          contractVersion: null,
          supplySourceId: null,
          coverageCellId: null,
          demandId: null,
          waveId: null,
        },
      ]
    : [];

const operationalAlertLineageWithInfrastructureWhereFor = (
  lineageWhere: readonly Prisma.AffiliateOperationalAlertsWhereInput[],
  options: OperationalAlertWhereOptions,
): Prisma.AffiliateOperationalAlertsWhereInput[] => [
  ...lineageWhere,
  ...(options.includeGlobalInfrastructure
    ? [operationalAlertGlobalWhereFor()]
    : []),
  ...operationalAlertUnboundWhereFor(
    lineageWhere,
    options.includeUnbound ?? true,
  ),
];

const operationalAlertContractWhereFor = (
  selection: AffiliateOperationsContractSelection,
): Prisma.AffiliateOperationalAlertsWhereInput => ({
  AND: [
    selection.contractVersion === null
      ? { contractVersion: null }
      : {
          OR: [
            { contractVersion: null },
            { contractVersion: selection.contractVersion },
          ],
        },
    {
      OR: [
        { rolloutCohort: null },
        { rolloutCohort: selection.rolloutCohort },
      ],
    },
  ],
});

const operationalAlertWhereFor = (
  selection: AffiliateOperationsContractSelection,
  rootIds: readonly string[],
  coverageCellIds: readonly string[],
  demandIds: readonly string[],
  waveIds: readonly string[],
  lineage: OperationalAlertLineageScope,
  options: OperationalAlertWhereOptions = {},
): Prisma.AffiliateOperationalAlertsWhereInput => {
  const resolvedOptions: Required<OperationalAlertWhereOptions> = {
    includeGlobalInfrastructure:
      options.includeGlobalInfrastructure ?? true,
    includeUnbound: options.includeUnbound ?? true,
  };
  const normalizedLineage = operationalAlertNormalizedLineageFor(lineage);
  const lineageWhere = [
    ...operationalAlertDirectLineageWhereFor(
      rootIds,
      coverageCellIds,
      demandIds,
      waveIds,
    ),
    ...operationalAlertLineageWhereFor(normalizedLineage),
    ...operationalAlertCoverageSubjectLineageWhereFor(coverageCellIds),
  ];
  const alertLineageWhere =
    operationalAlertLineageWithInfrastructureWhereFor(
      lineageWhere,
      resolvedOptions,
    );
  return {
    AND: [
      {
        OR:
          alertLineageWhere.length > 0
            ? alertLineageWhere
            : [{ id: { in: [] } }],
      },
      operationalAlertContractWhereFor(selection),
    ],
  };
};

const loadProjectionSeedRows = async (
  client: Prisma.TransactionClient,
  selection: AffiliateOperationsContractSelection,
  page: number,
  pageSize: number,
  selectedReconciliationRunId: string | null,
) => {
  const contractVersionFilter =
    selection.contractVersion === null ? undefined : selection.contractVersion;
  const reconciliationPage = Math.max(1, Math.trunc(page));
  const reconciliationPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSize)),
  );
  const reconciliationRunWhere = {
    rolloutCohort: selection.rolloutCohort,
    ...(contractVersionFilter === undefined
      ? {}
      : { supplyContractVersion: contractVersionFilter }),
  };
  const reconciliationRunsDelegate = client.affiliateSupplyReconciliationRuns;
  const hasReconciliationDbCount =
    typeof reconciliationRunsDelegate.count === "function";
  const reconciliationRunTotalPromise = hasReconciliationDbCount
    ? reconciliationRunsDelegate.count({ where: reconciliationRunWhere })
    : reconciliationRunsDelegate
        .findMany({
          where: reconciliationRunWhere,
          select: { id: true },
        })
        .then((runs) => runs.length);
  const reconciliationRunsPromise = (async () => {
    const reconciliationRunTotal = await reconciliationRunTotalPromise;
    const resolvedPage = clampedPageForTotal(
      reconciliationPage,
      reconciliationPageSize,
      reconciliationRunTotal,
    );
    const runs = await reconciliationRunsDelegate.findMany({
      where: reconciliationRunWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (resolvedPage - 1) * reconciliationPageSize,
      take: reconciliationPageSize,
      select: reconciliationRunSelect,
    });
    return { runs, page: resolvedPage };
  })();
  const selectedReconciliationRunPromise = selectedReconciliationRunId
    ? typeof reconciliationRunsDelegate.findFirst === "function"
      ? reconciliationRunsDelegate.findFirst({
          where: {
            ...reconciliationRunWhere,
            id: selectedReconciliationRunId,
          },
          select: reconciliationRunSelect,
        })
      : reconciliationRunsDelegate
          .findMany({
            where: {
              ...reconciliationRunWhere,
              id: selectedReconciliationRunId,
            },
            take: 1,
            select: reconciliationRunSelect,
          })
          .then((runs) =>
            runs.find((run) => run.id === selectedReconciliationRunId) ?? null,
          )
    : Promise.resolve(null);
  const [
    contracts,
    roots,
    coverageCells,
    loadedReconciliationRunsPage,
    reconciliationRunTotal,
    selectedReconciliationRun,
  ] = await Promise.all([
    client.affiliateSupplyContractManifests.findMany({
      where: {
        status: "ACTIVE",
        rolloutCohort: selection.rolloutCohort,
        version: contractVersionFilter,
      },
      orderBy: { activatedAt: "desc" },
      take: 1,
      select: {
        id: true,
        rolloutCohort: true,
        version: true,
        status: true,
        contractHash: true,
        contractJson: true,
        componentHashes: true,
        activatedAt: true,
      },
    }),
    client.affiliateSupplySources.findMany({
      where: {
        rolloutCohort: selection.rolloutCohort,
        activeSupplyContractVersion: contractVersionFilter,
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        canonicalUrl: true,
        origin: true,
        pathKey: true,
        operatorDomain: true,
        targetKind: true,
        rolloutCohort: true,
        intakeId: true,
        liveSourceId: true,
        predecessorId: true,
        successorId: true,
        lifecycleGeneration: true,
        activeSupplyContractVersion: true,
        activeSupplyContractHash: true,
        derivedStage: true,
        derivedOutcome: true,
        freshnessStatus: true,
        targetContribution: true,
        repairPriority: true,
        isAutomationEnabled: true,
        isExcluded: true,
        automationHoldReason: true,
        excludedAt: true,
        lastSuccessfulRefreshAt: true,
        lastAssessmentAt: true,
        invariantViolations: true,
        assessmentJson: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    client.affiliateCoverageCells.findMany({
      where: { cohort: selection.rolloutCohort },
      orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        cityId: true,
        marketKey: true,
        cohort: true,
        cohortPriority: true,
        sportId: true,
        sportName: true,
        profileKey: true,
        coverageStatus: true,
        searchStatus: true,
        populationWeight: true,
        gapSeverity: true,
        profileWeight: true,
        stalenessWeight: true,
        priorityScore: true,
        directPolicyKeyCount: true,
        approvedSourceCount: true,
        strategyFamilyCount: true,
        unresolvedLeadCount: true,
        consecutiveNoYieldCycles: true,
        queryStrategyVersion: true,
        evidenceQuality: true,
        lastAssessedAt: true,
        nextReviewAt: true,
        evidence: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    reconciliationRunsPromise,
    reconciliationRunTotalPromise,
    selectedReconciliationRunPromise,
  ]);
  const loadedReconciliationRuns = loadedReconciliationRunsPage.runs;
  const reconciliationRunPage = loadedReconciliationRunsPage.page;
  const reconciliationRuns =
    loadedReconciliationRuns.length > reconciliationPageSize
      ? loadedReconciliationRuns.slice(
          (reconciliationRunPage - 1) * reconciliationPageSize,
          reconciliationRunPage * reconciliationPageSize,
        )
      : loadedReconciliationRuns;
  return {
    contracts,
    roots,
    coverageCells,
    reconciliationRuns,
    reconciliationRunTotal,
    reconciliationRunPage,
    selectedReconciliationRun,
  };
};
const projectionAlertDeliverySelect = {
  id: true,
  createdAt: true,
  alertId: true,
  channel: true,
  status: true,
  attempt: true,
  deliveredAt: true,
  responseCode: true,
  responseBody: true,
  errorMessage: true,
} as const;

type ProjectionAlertDeliveryAttemptGroup = Readonly<{
  alertId: string;
  channel: string;
  attempt: number;
  status: string;
  _max: Readonly<{ createdAt: Date | null }>;
}>;
type ProjectionAlertDeliveryStats = Readonly<{
  deliveryCount: number;
  deliveredCount: number;
  latestDeliveryStatus: string | null;
}>;

const loadProjectionAlertDeliveryAttemptGroups = async (
  alertDeliveryDelegate: Prisma.TransactionClient["affiliateOperationalAlertDeliveries"],
  alertIds: readonly string[],
): Promise<ProjectionAlertDeliveryAttemptGroup[] | null> => {
  if (
    alertIds.length === 0 ||
    typeof alertDeliveryDelegate.groupBy !== "function"
  ) {
    return null;
  }
  const groups = await alertDeliveryDelegate.groupBy({
    by: ["alertId", "channel", "attempt", "status"],
    where: { alertId: { in: [...alertIds] } },
    _max: { createdAt: true },
  });
  return groups as ProjectionAlertDeliveryAttemptGroup[];
};

const projectionAlertDeliveryAttemptKeyFor = (
  alertId: string,
  channel: string,
  attempt: number,
): string => `${alertId}\u0000${upper(channel)}\u0000${attempt}`;

const projectionAlertDeliveryLatestReplaces = (
  group: ProjectionAlertDeliveryAttemptGroup,
  current: Readonly<{ at: number; terminal: boolean; status: string }> | undefined,
  at: number,
  terminal: boolean,
): boolean =>
  !current ||
  at > current.at ||
  (at === current.at &&
    (Number(terminal) > Number(current.terminal) ||
      (terminal === current.terminal &&
        alertDeliveryStatusPriority(group.status) >
          alertDeliveryStatusPriority(current.status))));

const updateProjectionAlertDeliveryLatestFor = (
  group: ProjectionAlertDeliveryAttemptGroup,
  latestByAlert: Map<
    string,
    Readonly<{ at: number; terminal: boolean; status: string }>
  >,
): void => {
  const at = dateValue(group._max.createdAt)?.getTime() ?? 0;
  const terminal = upper(group.status) !== "IN_FLIGHT";
  const current = latestByAlert.get(group.alertId);
  if (projectionAlertDeliveryLatestReplaces(group, current, at, terminal)) {
    latestByAlert.set(group.alertId, {
      at,
      terminal,
      status: group.status,
    });
  }
};

const addProjectionAlertDeliveryStatsFor = (
  group: ProjectionAlertDeliveryAttemptGroup,
  alertIdSet: ReadonlySet<string>,
  attemptsByAlert: ReadonlyMap<string, Set<string>>,
  deliveredAttemptsByAlert: ReadonlyMap<string, Set<string>>,
  latestByAlert: Map<
    string,
    Readonly<{ at: number; terminal: boolean; status: string }>
  >,
): void => {
  if (!alertIdSet.has(group.alertId)) return;
  const key = projectionAlertDeliveryAttemptKeyFor(
    group.alertId,
    group.channel,
    group.attempt,
  );
  attemptsByAlert.get(group.alertId)?.add(key);
  if (upper(group.status) === "DELIVERED") {
    deliveredAttemptsByAlert.get(group.alertId)?.add(key);
  }
  updateProjectionAlertDeliveryLatestFor(group, latestByAlert);
};


const projectionAlertDeliveryStatsFor = (
  groups: readonly ProjectionAlertDeliveryAttemptGroup[],
  alertIds: readonly string[],
): ReadonlyMap<string, ProjectionAlertDeliveryStats> => {
  const alertIdSet = new Set(alertIds);
  const attemptsByAlert = new Map<string, Set<string>>(
    alertIds.map((alertId): [string, Set<string>] => [
      alertId,
      new Set<string>(),
    ]),
  );
  const deliveredAttemptsByAlert = new Map<string, Set<string>>(
    alertIds.map((alertId): [string, Set<string>] => [
      alertId,
      new Set<string>(),
    ]),
  );
  const latestByAlert = new Map<
    string,
    Readonly<{ at: number; terminal: boolean; status: string }>
  >();
  groups.forEach((group) =>
    addProjectionAlertDeliveryStatsFor(
      group,
      alertIdSet,
      attemptsByAlert,
      deliveredAttemptsByAlert,
      latestByAlert,
    ),
  );
  return new Map(
    alertIds.map((alertId) => [
      alertId,
      {
        deliveryCount: attemptsByAlert.get(alertId)?.size ?? 0,
        deliveredCount: deliveredAttemptsByAlert.get(alertId)?.size ?? 0,
        latestDeliveryStatus: latestByAlert.get(alertId)?.status ?? null,
      },
    ]),
  );
};

const projectionAlertDeliveryAttemptsFor = (
  groups: readonly ProjectionAlertDeliveryAttemptGroup[],
  alertId: string | null,
): Array<Readonly<{
  alertId: string;
  channel: string;
  attempt: number;
  at: number;
}>> => {
  if (!alertId) return [];
  const attempts = new Map<
    string,
    Readonly<{
      alertId: string;
      channel: string;
      attempt: number;
      at: number;
    }>
  >();
  groups
    .filter((group) => group.alertId === alertId)
    .forEach((group) => {
      const key = projectionAlertDeliveryAttemptKeyFor(
        group.alertId,
        group.channel,
        group.attempt,
      );
      const current = attempts.get(key);
      const at = dateValue(group._max.createdAt)?.getTime() ?? 0;
      if (!current || at > current.at) {
        attempts.set(key, {
          alertId: group.alertId,
          channel: group.channel,
          attempt: group.attempt,
          at,
        });
      }
    });
  return [...attempts.values()].sort(
    (left, right) =>
      right.at - left.at ||
      left.channel.localeCompare(right.channel) ||
      right.attempt - left.attempt,
  );
};

const loadProjectionAlertDeliveryFallbackHistory = async (
  alertDeliveryDelegate: Prisma.TransactionClient["affiliateOperationalAlertDeliveries"],
  selectedAlertId: string | null,
  historyPage: number,
  historyPageSize: number,
) => {
  if (!selectedAlertId) return { rows: [], total: 0 };
  const [rows, total] = await Promise.all([
    alertDeliveryDelegate.findMany({
      where: { alertId: selectedAlertId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (historyPage - 1) * historyPageSize,
      take: historyPageSize,
      select: projectionAlertDeliverySelect,
    }),
    typeof alertDeliveryDelegate.count === "function"
      ? alertDeliveryDelegate.count({ where: { alertId: selectedAlertId } })
      : alertDeliveryDelegate
          .findMany({
            where: { alertId: selectedAlertId },
            select: { id: true, alertId: true },
          })
          .then(
            (deliveries) =>
              deliveries.filter(
                (delivery) => delivery.alertId === selectedAlertId,
              ).length,
          ),
  ]);
  return { rows, total };
};

const loadProjectionAlertDeliveryGroupedHistory = async (
  alertDeliveryDelegate: Prisma.TransactionClient["affiliateOperationalAlertDeliveries"],
  groups: readonly ProjectionAlertDeliveryAttemptGroup[],
  selectedAlertId: string | null,
  historyPage: number,
  historyPageSize: number,
) => {
  const attempts = projectionAlertDeliveryAttemptsFor(groups, selectedAlertId);
  const pageAttempts = attempts.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  );
  const rows =
    pageAttempts.length === 0
      ? []
      : await alertDeliveryDelegate.findMany({
          where: {
            OR: pageAttempts.map(({ alertId, channel, attempt }) => ({
              alertId,
              channel,
              attempt,
            })),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: projectionAlertDeliverySelect,
        });
  return { rows, total: attempts.length };
};

const projectionAlertDeliveryFallbackStatsFor = (
  rows: readonly ProjectionAlertDeliveryRecord[],
  alertIds: readonly string[],
): ReadonlyMap<string, ProjectionAlertDeliveryStats> => {
  const rowsByAlert = new Map<
    string,
    Array<ProjectionAlertDeliveryRecord>
  >();
  rows.forEach((row) => {
    const alertRows = rowsByAlert.get(row.alertId) ?? [];
    alertRows.push(row);
    rowsByAlert.set(row.alertId, alertRows);
  });
  return new Map(
    alertIds.map((alertId) => {
      const alertRows = dedupeAlertDeliveries(rowsByAlert.get(alertId) ?? []);
      const attempts = new Set(
        alertRows.map((row) =>
          projectionAlertDeliveryAttemptKeyFor(
            row.alertId,
            row.channel,
            row.attempt,
          ),
        ),
      );
      const deliveredAttempts = new Set(
        alertRows
          .filter((row) => upper(row.status) === "DELIVERED")
          .map((row) =>
            projectionAlertDeliveryAttemptKeyFor(
              row.alertId,
              row.channel,
              row.attempt,
            ),
          ),
      );
      return [
        alertId,
        {
          deliveryCount: attempts.size,
          deliveredCount: deliveredAttempts.size,
          latestDeliveryStatus: alertRows[0]?.status ?? null,
        },
      ];
    }),
  );
};

type ProjectionAlertDeliveryLoad = Readonly<{
  alertDeliveries: ProjectionAlertDeliveryRecord[];
  alertDeliveryHistory: ProjectionAlertDeliveryRecord[];
  alertDeliveryStats: ReadonlyMap<string, ProjectionAlertDeliveryStats>;
  alertDeliveryTotal: number;
  alertDeliveryPage: number;
  alertDeliveryPageSize: number;
}>;

type ProjectionAlertDeliveryRawQueryClient = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}>;

type ProjectionAlertDeliverySqlStatsRow = Readonly<{
  alertId: string;
  deliveryCount: number | bigint;
  deliveredCount: number | bigint;
  latestDeliveryStatus: string | null;
}>;

const projectionAlertDeliveryRawQueryClientFor = (
  client: Prisma.TransactionClient,
): ProjectionAlertDeliveryRawQueryClient | null =>
  typeof client.$queryRaw === "function"
    ? (client as unknown as ProjectionAlertDeliveryRawQueryClient)
    : null;

const projectionAlertDeliverySqlNumberFor = (value: unknown): number =>
  typeof value === "bigint" ? Number(value) : numberValue(value, 0);

const projectionAlertDeliverySqlIdsFor = (
  alertIds: readonly string[],
): Prisma.Sql => Prisma.join(alertIds.map((alertId) => Prisma.sql`${alertId}`));

const loadProjectionAlertDeliverySqlStats = async (
  queryClient: ProjectionAlertDeliveryRawQueryClient,
  alertIds: readonly string[],
): Promise<ReadonlyMap<string, ProjectionAlertDeliveryStats>> => {
  if (alertIds.length === 0) return new Map();
  const rows = await queryClient.$queryRaw<ProjectionAlertDeliverySqlStatsRow[]>(
    Prisma.sql`
      WITH logical_attempts AS (
        SELECT DISTINCT ON (d."alertId", UPPER(d."channel"), d."attempt")
          d."alertId",
          d."channel",
          d."attempt",
          d."status",
          d."createdAt",
          d."id"
        FROM "AffiliateOperationalAlertDeliveries" AS d
        WHERE d."alertId" IN (${projectionAlertDeliverySqlIdsFor(alertIds)})
        ORDER BY
          d."alertId",
          UPPER(d."channel"),
          d."attempt",
          CASE WHEN UPPER(d."status") = 'IN_FLIGHT' THEN 0 ELSE 1 END DESC,
          d."createdAt" DESC,
          d."id" DESC
      )
      SELECT
        "alertId",
        COUNT(*)::int AS "deliveryCount",
        COUNT(*) FILTER (
          WHERE UPPER("status") = 'DELIVERED'
        )::int AS "deliveredCount",
        (
          ARRAY_AGG(
            "status"
            ORDER BY
              "createdAt" DESC,
              "attempt" DESC,
              CASE
                WHEN UPPER("status") IN ('DELIVERED', 'FAILED', 'NOT_CONFIGURED')
                THEN 1
                ELSE 0
              END DESC,
              "id" ASC
          )
        )[1] AS "latestDeliveryStatus"
      FROM logical_attempts
      GROUP BY "alertId"
    `,
  );
  return new Map(
    rows.map(
      (row): [string, ProjectionAlertDeliveryStats] => [
        row.alertId,
        {
          deliveryCount: projectionAlertDeliverySqlNumberFor(row.deliveryCount),
          deliveredCount: projectionAlertDeliverySqlNumberFor(
            row.deliveredCount,
          ),
          latestDeliveryStatus: row.latestDeliveryStatus,
        },
      ],
    ),
  );
};

const loadProjectionAlertDeliverySqlHistoryRows = async (
  queryClient: ProjectionAlertDeliveryRawQueryClient,
  selectedAlertId: string,
  offset: number,
  historyPageSize: number,
): Promise<ProjectionAlertDeliveryRecord[]> =>
  queryClient.$queryRaw<ProjectionAlertDeliveryRecord[]>(
    Prisma.sql`
      WITH logical_attempts AS (
        SELECT DISTINCT ON (d."alertId", UPPER(d."channel"), d."attempt")
          d."id",
          d."createdAt",
          d."alertId",
          d."channel",
          d."status",
          d."attempt",
          d."deliveredAt",
          d."responseCode",
          d."responseBody",
          d."errorMessage"
        FROM "AffiliateOperationalAlertDeliveries" AS d
        WHERE d."alertId" = ${selectedAlertId}
        ORDER BY
          d."alertId",
          UPPER(d."channel"),
          d."attempt",
          CASE WHEN UPPER(d."status") = 'IN_FLIGHT' THEN 0 ELSE 1 END DESC,
          d."createdAt" DESC,
          d."id" DESC
      )
      SELECT
        "id",
        "createdAt",
        "alertId",
        "channel",
        "status",
        "attempt",
        "deliveredAt",
        "responseCode",
        "responseBody",
        "errorMessage"
      FROM logical_attempts
      ORDER BY
        "createdAt" DESC,
        "attempt" DESC,
        CASE
          WHEN UPPER("status") IN ('DELIVERED', 'FAILED', 'NOT_CONFIGURED')
          THEN 1
          ELSE 0
        END DESC,
        "id" ASC
      OFFSET ${offset}
      LIMIT ${historyPageSize}
    `,
  );

const loadProjectionAlertDeliverySqlHistoryTotal = async (
  queryClient: ProjectionAlertDeliveryRawQueryClient,
  selectedAlertId: string,
): Promise<number> => {
  const totalRows = await queryClient.$queryRaw<
    Array<{ total: number | bigint }>
  >(
    Prisma.sql`
      WITH logical_attempts AS (
        SELECT DISTINCT ON (UPPER(d."channel"), d."attempt")
          d."channel",
          d."attempt"
        FROM "AffiliateOperationalAlertDeliveries" AS d
        WHERE d."alertId" = ${selectedAlertId}
        ORDER BY
          UPPER(d."channel"),
          d."attempt",
          CASE WHEN UPPER(d."status") = 'IN_FLIGHT' THEN 0 ELSE 1 END DESC,
          d."createdAt" DESC,
          d."id" DESC
      )
      SELECT COUNT(*)::int AS "total"
      FROM logical_attempts
    `,
  );
  return projectionAlertDeliverySqlNumberFor(totalRows[0]?.total);
};

const loadProjectionAlertDeliverySqlHistory = async (
  queryClient: ProjectionAlertDeliveryRawQueryClient,
  selectedAlertId: string | null,
  historyPage: number,
  historyPageSize: number,
): Promise<
  Readonly<{
    rows: ProjectionAlertDeliveryRecord[];
    total: number;
    page: number;
  }>
> => {
  if (!selectedAlertId) return { rows: [], total: 0, page: 1 };
  const total = await loadProjectionAlertDeliverySqlHistoryTotal(
    queryClient,
    selectedAlertId,
  );
  const totalPages = Math.max(1, Math.ceil(total / historyPageSize));
  const page = Math.min(
    totalPages,
    Math.max(1, Math.trunc(historyPage)),
  );
  const rows = await loadProjectionAlertDeliverySqlHistoryRows(
    queryClient,
    selectedAlertId,
    (page - 1) * historyPageSize,
    historyPageSize,
  );
  return { rows, total, page };
};

const loadProjectionAlertDeliveryRowsViaSql = async (
  queryClient: ProjectionAlertDeliveryRawQueryClient,
  alertDeliveryDelegate: Prisma.TransactionClient["affiliateOperationalAlertDeliveries"],
  pageAlertIds: readonly string[],
  selectedAlertId: string | null,
  historyPage: number,
  historyPageSize: number,
): Promise<ProjectionAlertDeliveryLoad> => {
  const relevantAlertIds = [
    ...new Set([
      ...pageAlertIds,
      ...(selectedAlertId ? [selectedAlertId] : []),
    ]),
  ];
  const latestDeliveryRowsPromise =
    pageAlertIds.length > 0
      ? alertDeliveryDelegate.findMany({
          where: { alertId: { in: [...pageAlertIds] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          distinct: ["alertId"],
          take: pageAlertIds.length,
          select: projectionAlertDeliverySelect,
        })
      : Promise.resolve([]);
  const [latestDeliveryRows, alertDeliveryStats, selectedHistory] =
    await Promise.all([
      latestDeliveryRowsPromise,
      loadProjectionAlertDeliverySqlStats(queryClient, relevantAlertIds),
      loadProjectionAlertDeliverySqlHistory(
        queryClient,
        selectedAlertId,
        historyPage,
        historyPageSize,
      ),
    ]);
  const latestRows = latestDeliveryRows.filter((delivery) =>
    pageAlertIds.includes(delivery.alertId),
  );
  return {
    alertDeliveries: dedupeAlertDeliveries(latestRows),
    alertDeliveryHistory: dedupeAlertDeliveries(
      selectedHistory.rows.filter(
        (delivery) => delivery.alertId === selectedAlertId,
      ),
    ),
    alertDeliveryStats,
    alertDeliveryTotal: selectedHistory.total,
    alertDeliveryPage: selectedHistory.page,
    alertDeliveryPageSize: historyPageSize,
  };
};

const loadProjectionAlertDeliveryRowsViaDelegate = async (
  alertDeliveryDelegate: Prisma.TransactionClient["affiliateOperationalAlertDeliveries"],
  pageAlertIds: readonly string[],
  selectedAlertId: string | null,
  historyPage: number,
  historyPageSize: number,
): Promise<ProjectionAlertDeliveryLoad> => {
  const resolvedHistoryPage = Math.max(1, Math.trunc(historyPage));
  const resolvedHistoryPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(historyPageSize)),
  );
  const relevantAlertIds = [
    ...new Set([
      ...pageAlertIds,
      ...(selectedAlertId ? [selectedAlertId] : []),
    ]),
  ];
  const attemptGroups = await loadProjectionAlertDeliveryAttemptGroups(
    alertDeliveryDelegate,
    relevantAlertIds,
  );
  const latestDeliveryRowsPromise =
    pageAlertIds.length > 0
      ? alertDeliveryDelegate.findMany({
          where: { alertId: { in: [...pageAlertIds] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          distinct: ["alertId"],
          take: pageAlertIds.length,
          select: projectionAlertDeliverySelect,
        })
      : Promise.resolve([]);
  const selectedHistoryPromise =
    attemptGroups === null
      ? loadProjectionAlertDeliveryFallbackHistory(
          alertDeliveryDelegate,
          selectedAlertId,
          resolvedHistoryPage,
          resolvedHistoryPageSize,
        )
      : loadProjectionAlertDeliveryGroupedHistory(
          alertDeliveryDelegate,
          attemptGroups,
          selectedAlertId,
          resolvedHistoryPage,
          resolvedHistoryPageSize,
        );
  const [latestDeliveryRows, selectedHistory] = await Promise.all([
    latestDeliveryRowsPromise,
    selectedHistoryPromise,
  ]);
  const latestRows = latestDeliveryRows.filter((delivery) =>
    pageAlertIds.includes(delivery.alertId),
  );
  return {
    alertDeliveries: dedupeAlertDeliveries(latestRows),
    alertDeliveryHistory: dedupeAlertDeliveries(
      selectedHistory.rows.filter(
        (delivery) => delivery.alertId === selectedAlertId,
      ),
    ),
    alertDeliveryStats:
      attemptGroups === null
        ? projectionAlertDeliveryFallbackStatsFor(latestRows, pageAlertIds)
        : projectionAlertDeliveryStatsFor(attemptGroups, pageAlertIds),
    alertDeliveryTotal: selectedHistory.total,
    alertDeliveryPage: resolvedHistoryPage,
    alertDeliveryPageSize: resolvedHistoryPageSize,
  };
};

const loadProjectionAlertDeliveryRows = async (
  client: Prisma.TransactionClient,
  pageAlertIds: readonly string[],
  selectedAlertId: string | null,
  historyPage: number,
  historyPageSize: number,
): Promise<ProjectionAlertDeliveryLoad> => {
  const queryClient = projectionAlertDeliveryRawQueryClientFor(client);
  const alertDeliveryDelegate = client.affiliateOperationalAlertDeliveries;
  return queryClient
    ? loadProjectionAlertDeliveryRowsViaSql(
        queryClient,
        alertDeliveryDelegate,
        pageAlertIds,
        selectedAlertId,
        historyPage,
        historyPageSize,
      )
    : loadProjectionAlertDeliveryRowsViaDelegate(
        alertDeliveryDelegate,
        pageAlertIds,
        selectedAlertId,
        historyPage,
        historyPageSize,
      );
};

const loadProjectionAlertRows = async (
  client: Prisma.TransactionClient,
  selection: AffiliateOperationsContractSelection,
  scopedRootIds: readonly string[],
  scopedCoverageCellIds: readonly string[],
  scopedDemandIds: readonly string[],
  scopedWaveIds: readonly string[],
  lineage: OperationalAlertLineageScope,
  page: number,
  pageSize: number,
  selectedAlertId: string | null,
  historyPage = 1,
  historyPageSize = DEFAULT_PAGE_SIZE,
) => {
  const operationalAlertWhere = operationalAlertWhereFor(
    selection,
    scopedRootIds,
    scopedCoverageCellIds,
    scopedDemandIds,
    scopedWaveIds,
    lineage,
  );
  const operationalAlertsDelegate = client.affiliateOperationalAlerts;
  const alertPage = Math.max(1, Math.trunc(page));
  const alertPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(pageSize)),
  );
  const hasOperationalAlertDbCount =
    typeof operationalAlertsDelegate.count === "function";
  const operationalAlertTotalPromise = hasOperationalAlertDbCount
    ? operationalAlertsDelegate.count({ where: operationalAlertWhere })
    : operationalAlertsDelegate
        .findMany({
          where: operationalAlertWhere,
          select: { id: true },
        })
        .then((alerts) => alerts.length);
  const operationalAlertPagePromise = (async () => {
    const operationalAlertTotal = await operationalAlertTotalPromise;
    const resolvedPage = clampedPageForTotal(
      alertPage,
      alertPageSize,
      operationalAlertTotal,
    );
    const loaded = await operationalAlertsDelegate.findMany({
      where: operationalAlertWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (resolvedPage - 1) * alertPageSize,
      take: alertPageSize,
      select: operationalAlertSelect,
    });
    return { rows: loaded, page: resolvedPage };
  })();
  const selectedOperationalAlertPromise = selectedAlertId
    ? typeof operationalAlertsDelegate.findFirst === "function"
      ? operationalAlertsDelegate.findFirst({
          where: {
            AND: [operationalAlertWhere, { id: selectedAlertId }],
          },
          select: operationalAlertSelect,
        })
      : operationalAlertsDelegate
          .findMany({
            where: {
              AND: [operationalAlertWhere, { id: selectedAlertId }],
            },
            take: 1,
            select: operationalAlertSelect,
          })
          .then(
            (alerts) =>
              alerts.find((alert) => alert.id === selectedAlertId) ?? null,
          )
    : Promise.resolve(null);
  const [
    loadedOperationalAlertPage,
    operationalAlertTotal,
    selectedOperationalAlert,
  ] = await Promise.all([
    operationalAlertPagePromise,
    operationalAlertTotalPromise,
    selectedOperationalAlertPromise,
  ]);
  const alertPageStart =
    (loadedOperationalAlertPage.page - 1) * alertPageSize;
  const operationalAlertPageRows =
    loadedOperationalAlertPage.rows.length > alertPageSize
      ? loadedOperationalAlertPage.rows.slice(
          alertPageStart,
          alertPageStart + alertPageSize,
        )
      : loadedOperationalAlertPage.rows;
  const exceptionAlertRows: typeof loadedOperationalAlertPage.rows = [];
  const operationalAlertPageIds = operationalAlertPageRows.map(
    (alert) => alert.id,
  );
  const operationalAlertsById = new Map<
    string,
    (typeof operationalAlertPageRows)[number]
  >();
  [
    ...operationalAlertPageRows,
    ...exceptionAlertRows,
    ...(selectedOperationalAlert ? [selectedOperationalAlert] : []),
  ].forEach((alert) => {
    operationalAlertsById.set(alert.id, alert);
  });
  const operationalAlerts = [...operationalAlertsById.values()].sort(
    compareProjectionTimestampIdAttempt,
  );
  const pageAlertIds = operationalAlertPageRows.map((alert) => alert.id);
  const deliveryData = await loadProjectionAlertDeliveryRows(
    client,
    pageAlertIds,
    selectedOperationalAlert?.id ?? null,
    historyPage,
    historyPageSize,
  );
  return {
    operationalAlerts,
    operationalAlertPageIds,
    operationalAlertPage: loadedOperationalAlertPage.page,
    operationalAlertPageSize: alertPageSize,
    operationalAlertTotal,
    ...deliveryData,
  };
};
const projectionContractVersionFilterFor = (
  selection: AffiliateOperationsContractSelection,
): number | undefined =>
  selection.contractVersion === null ? undefined : selection.contractVersion;

const projectionRootScopeIdsFor = (
  roots: readonly Readonly<{
    id: string;
    intakeId: string | null;
    liveSourceId: string | null;
  }>[],
): Readonly<{
  rootIds: string[];
  intakeIds: string[];
  liveSourceIds: string[];
}> => ({
  rootIds: roots.map((root) => root.id),
  intakeIds: roots.flatMap((root) => root.intakeId ? [root.intakeId] : []),
  liveSourceIds: roots.flatMap((root) =>
    root.liveSourceId ? [root.liveSourceId] : [],
  ),
});

const gatewaySubjectContractScopeFor = (
  selection: AffiliateOperationsContractSelection,
) =>
  selection.contractVersion === null
    ? {}
    : {
        AND: [
          {
            OR: [
              {
                subjectJson: {
                  path: ["contractVersion"],
                  equals: selection.contractVersion,
                },
              },
              {
                subjectJson: {
                  path: ["supplyContractVersion"],
                  equals: selection.contractVersion,
                },
              },
            ],
          },
        ],
      };


const loadProjectionRows = async (
  client: Prisma.TransactionClient,
  selection: AffiliateOperationsContractSelection,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  selectedReconciliationRunId: string | null = null,
  selectedAlertId: string | null = null,
  now = new Date(),
  historyPage = 1,
  historyPageSize = DEFAULT_PAGE_SIZE,
) => {
  const {
    contracts,
    roots,
    coverageCells,
    reconciliationRuns,
    reconciliationRunTotal,
    reconciliationRunPage,
    selectedReconciliationRun,
  } = await loadProjectionSeedRows(
    client,
    selection,
    page,
    pageSize,
    selectedReconciliationRunId,
  );
  const contractVersionFilter =
    projectionContractVersionFilterFor(selection);
  const {
    rootIds: scopedRootIds,
    intakeIds: scopedRootIntakeIds,
    liveSourceIds: scopedRootLiveSourceIds,
  } = projectionRootScopeIdsFor(roots);
  const scopedCoverageCellIds = coverageCells.map((cell) => cell.id);
  const gatewaySubjectContractScope =
    gatewaySubjectContractScopeFor(selection);
  const [
    targets,
    demands,
    transitions,
    gatewayJobs,
    coverageAssessments,
    coverageJobs,
    mappingJobs,
    approvals,
    intakes,
    pages,
    intakeRuns,
    artifacts,
    sources,
    mappings,
    scrapeRuns,
    candidates,
    workerHealth,
  ] = await Promise.all([
    client.affiliateSupplyTargets.findMany({
      where: { supplySourceId: { in: scopedRootIds } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        supplySourceId: true,
        candidateId: true,
        targetType: true,
        targetId: true,
        marketKey: true,
        sportId: true,
        sourceProfile: true,
        status: true,
        publishedAt: true,
        lastSuccessfulRefreshAt: true,
        freshnessExpiresAt: true,
        rejectedAt: true,
        rejectionReason: true,
        evidenceRefs: true,
        evidenceHash: true,
        metadata: true,
      },
    }),
    client.affiliateReplenishmentDemands.findMany({
      where: {
        rolloutCohort: selection.rolloutCohort,
        contractVersion: contractVersionFilter,
      },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        targetKey: true,
        marketKey: true,
        sportId: true,
        sourceProfile: true,
        rolloutCohort: true,
        contractVersion: true,
        contractHash: true,
        minimumFreshPublishedSupply: true,
        observedFreshPublishedSupply: true,
        priority: true,
        status: true,
        openedAt: true,
        closedAt: true,
        nextEligibleAt: true,
        searchSaturatedUntil: true,
        activeWaveId: true,
        generation: true,
        reasonCodes: true,
        evidenceJson: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    client.affiliateSupplyLifecycleTransitions.findMany({
      where: {
        supplySourceId: { in: scopedRootIds },
        contractVersion: contractVersionFilter,
      },
      orderBy: { occurredAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        supplySourceId: true,
        sequence: true,
        generation: true,
        fromStage: true,
        toStage: true,
        outcome: true,
        command: true,
        commandRef: true,
        idempotencyKey: true,
        requestHash: true,
        resultHash: true,
        contractVersion: true,
        contractHash: true,
        actorKind: true,
        actorId: true,
        executingAgentId: true,
        reasonCodes: true,
        evidenceRefs: true,
        requestJson: true,
        resultJson: true,
        occurredAt: true,
        retentionClass: true,
      },
    }),
    client.affiliateAgentGatewayJobs.findMany({
      where: {
        OR: [
          { supplySourceId: { in: scopedRootIds } },
          {
            subjectJson: {
              path: ["rolloutCohort"],
              equals: selection.rolloutCohort,
            },
            ...gatewaySubjectContractScope,
          },
          {
            subjectJson: { path: ["cohort"], equals: selection.rolloutCohort },
            ...gatewaySubjectContractScope,
          },
          ...scopedCoverageCellIds.flatMap((cellId) => [
            { subjectJson: { path: ["coverageCellId"], equals: cellId } },
            {
              subjectJson: {
                path: ["coverageCellIds"],
                array_contains: [cellId],
              },
            },
          ]),
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        queue: true,
        lane: true,
        role: true,
        subjectType: true,
        subjectId: true,
        subjectJson: true,
        evidenceManifestJson: true,
        supplySourceId: true,
        expectedLifecycleGeneration: true,
        status: true,
        priority: true,
        nextAttemptAt: true,
        claimGeneration: true,
        activeClaimId: true,
        parentClaimId: true,
        invocationFailureCount: true,
        lastInvocationFailedAt: true,
        pipelineBlockedAt: true,
        terminalDisposition: true,
        resultHash: true,
        resultJson: true,
        terminalReceiptId: true,
        finishedAt: true,
        eventSequence: true,
      },
    }),
    client.affiliateCoverageCellAssessments.findMany({
      where: { cellId: { in: scopedCoverageCellIds } },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        cellId: true,
        cycleKey: true,
        decision: true,
        campaignIds: true,
        strategyKeys: true,
        strategyFamilyKeys: true,
        newQualifiedPolicyKeyCount: true,
        unresolvedLeadCount: true,
        successfulQueryCount: true,
        failedQueryCount: true,
        queryStrategyVersion: true,
        evidence: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    client.affiliateCoverageAgentJobs.findMany({
      where:
        scopedCoverageCellIds.length > 0
          ? {
              OR: scopedCoverageCellIds.flatMap((cellId) => [
                { context: { path: ["coverageCellId"], equals: cellId } },
                {
                  context: {
                    path: ["coverageCellIds"],
                    array_contains: [cellId],
                  },
                },
              ]),
            }
          : { id: { in: [] } },
      orderBy: [
        { cohortPriority: "asc" },
        { priorityScore: "desc" },
        { createdAt: "desc" },
      ],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        subjectType: true,
        subjectKey: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        workerId: true,
        attemptCount: true,
        context: true,
        result: true,
        errorMessage: true,
        finishedAt: true,
        cohortPriority: true,
        priorityScore: true,
        priorityRank: true,
        isBlockingCoverage: true,
      },
    }),
    client.affiliateSourceMappingJobs.findMany({
      where: {
        OR: [
          { supplySourceId: { in: scopedRootIds } },
          { intakeId: { in: scopedRootIntakeIds } },
          { sourceId: { in: scopedRootLiveSourceIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        sourceId: true,
        mappingId: true,
        legacyIdentityMigrationEligible: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        workerId: true,
        attemptCount: true,
        branch: true,
        commit: true,
        resultSummary: true,
        errorMessage: true,
        finishedAt: true,
      },
    }),
    client.affiliateApprovalJobs.findMany({
      where: { supplySourceId: { in: scopedRootIds } },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        subjectType: true,
        supplySourceId: true,
        subjectKey: true,
        status: true,
        claimedAt: true,
        leaseExpiresAt: true,
        reviewerId: true,
        attemptCount: true,
        decision: true,
        errorMessage: true,
        finishedAt: true,
      },
    }),
    client.affiliateSourceIntakes.findMany({
      where: {
        OR: [
          { id: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        sourceKey: true,
        region: true,
        baseUrl: true,
        status: true,
        complianceStatus: true,
        targetKindHints: true,
        notes: true,
        organizationId: true,
        affiliateSourceId: true,
        supplySourceId: true,
        lastRunId: true,
        selectedLogoArtifactId: true,
        complianceTermsUrl: true,
        complianceNotes: true,
      },
    }),
    client.affiliateSourceIntakePages.findMany({
      where: {
        OR: [
          { intakeId: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        url: true,
        canonicalUrl: true,
        role: true,
        targetKindHints: true,
        status: true,
        discoverySource: true,
        robotsStatus: true,
        robotsCheckedAt: true,
        robotsNotes: true,
        metadata: true,
      },
    }),
    client.affiliateSourceIntakeRuns.findMany({
      where: {
        OR: [
          { intakeId: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        requestedPageIds: true,
        provider: true,
        status: true,
        queuedAt: true,
        startedAt: true,
        finishedAt: true,
        claimedAt: true,
        workerId: true,
        attemptCount: true,
        providerJobIds: true,
        discoveredUrlCount: true,
        capturedPageCount: true,
        errorMessage: true,
        summary: true,
      },
    }),
    client.affiliateSourceIntakeArtifacts.findMany({
      where: {
        OR: [
          { intakeId: { in: scopedRootIntakeIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        intakeId: true,
        supplySourceId: true,
        pageId: true,
        runId: true,
        kind: true,
        sourceUrl: true,
        finalUrl: true,
        provider: true,
        httpStatus: true,
        contentHash: true,
        dedupeKey: true,
        fileId: true,
        mimeType: true,
        sizeBytes: true,
        retainUntil: true,
        isPinned: true,
        metadata: true,
      },
    }),
    client.affiliateScrapeSources.findMany({
      where: {
        OR: [
          { id: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        sourceKey: true,
        organizationId: true,
        baseUrl: true,
        listUrl: true,
        targetKind: true,
        status: true,
        activeMappingId: true,
        supplySourceId: true,
        lastScrapeRunId: true,
        lifecycleGeneration: true,
        activeSupplyContractVersion: true,
        activeSupplyContractHash: true,
        lastScrapedAt: true,
        autoScrapeEnabled: true,
        scrapeIntervalMinutes: true,
        notes: true,
        metadata: true,
      },
    }),
    client.affiliateScrapeMappings.findMany({
      where: {
        OR: [
          { sourceId: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: [{ isActive: "desc" }, { version: "desc" }],
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        supplySourceId: true,
        version: true,
        isActive: true,
        mapping: true,
        createdByUserId: true,
        notes: true,
        validatedAt: true,
      },
    }),
    client.affiliateScrapeRuns.findMany({
      where: {
        OR: [
          { sourceId: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        supplySourceId: true,
        mappingId: true,
        requestedByUserId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        fetchedUrl: true,
        finalUrl: true,
        httpStatus: true,
        itemCount: true,
        candidateCount: true,
        errorMessage: true,
        logs: true,
        metadata: true,
      },
    }),
    client.affiliateImportCandidates.findMany({
      where: {
        OR: [
          { sourceId: { in: scopedRootLiveSourceIds } },
          { supplySourceId: { in: scopedRootIds } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        sourceId: true,
        supplySourceId: true,
        runId: true,
        mappingId: true,
        listingKind: true,
        status: true,
        title: true,
        organizerName: true,
        sportName: true,
        city: true,
        venueName: true,
        startsAt: true,
        endsAt: true,
        officialActionUrl: true,
        sourceUrl: true,
        description: true,
        rawPayload: true,
        warnings: true,
        publishedEventId: true,
        publishedTeamId: true,
        publishedFacilityId: true,
        publishedOrganizationId: true,
      },
    }),
    client.affiliateAgentWorkerHealth.findMany({
      orderBy: { heartbeatAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        workerId: true,
        role: true,
        status: true,
        heartbeatAt: true,
        leaseExpiresAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const organizationTargetIds = Array.from(
    new Set(
      targets
        .filter((target) => isOrganizationTargetType(target.targetType))
        .map((target) => stringValue(target.targetId))
        .filter((id): id is string => Boolean(id)),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const waves = await client.affiliateReplenishmentWaves.findMany({
    where: { demandId: { in: demands.map((demand) => demand.id) } },
    orderBy: { createdAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      demandId: true,
      rolloutCohort: true,
      status: true,
      campaignId: true,
      coveragePlanningJobId: true,
      provider: true,
      providerOperationKey: true,
      startedAt: true,
      terminalAt: true,
      retryAt: true,
      marginalYield: true,
      errorCode: true,
      resultJson: true,
      demandGeneration: true,
      evidenceRefs: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const scopedDemandIds = demands.map((demand) => demand.id);
  const scopedWaveIds = waves.map((wave) => wave.id);
  const targetIdsByType = targetIdsByTypeFor(targets);
  const canonicalEventIds = targetIdsForType(targetIdsByType, "EVENT");
  const canonicalTeamIds = targetIdsForType(targetIdsByType, "TEAM");
  const canonicalFacilityIds = targetIdsForType(targetIdsByType, "FACILITY");
  const [canonicalEvents, canonicalTeams, facilities] = await Promise.all([
    client.events.findMany({
      where: { id: { in: canonicalEventIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        archivedAt: true,
        organizationId: true,
        state: true,
      },
    }),
    client.canonicalTeams.findMany({
      where: { id: { in: canonicalTeamIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        archivedAt: true,
        visibility: true,
        organizationId: true,
      },
    }),
    client.facilities.findMany({
      where: { id: { in: canonicalFacilityIds } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        status: true,
        organizationId: true,
      },
    }),
  ]);
  const assessmentCampaignIds = [
    ...new Set(
      coverageAssessments.flatMap((assessment) => assessment.campaignIds),
    ),
  ];
  const campaignMetadataScope =
    scopedCoverageCellIds.length > 0
      ? {
          OR: [
            { id: { in: assessmentCampaignIds } },
            ...scopedCoverageCellIds.map((cellId) => ({
              metadata: { path: ["coverageCellIds"], array_contains: [cellId] },
            })),
            {
              metadata: {
                path: ["rolloutCohort"],
                equals: selection.rolloutCohort,
              },
            },
            { metadata: { path: ["cohort"], equals: selection.rolloutCohort } },
          ],
        }
      : { id: { in: assessmentCampaignIds } };
  const campaigns = await client.affiliateSourceDiscoveryCampaigns.findMany({
    where: campaignMetadataScope,
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      name: true,
      region: true,
      location: true,
      sportIds: true,
      sourceTypeHints: true,
      status: true,
      lastRunAt: true,
      nextRunAt: true,
      maxQueriesPerRun: true,
      maxResultsPerQuery: true,
      queryCursor: true,
      coverageFingerprint: true,
      metadata: true,
    },
  });
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const discoveryRuns = await client.affiliateSourceDiscoveryRuns.findMany({
    where: { campaignId: { in: campaignIds } },
    orderBy: { createdAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      campaignId: true,
      requestedByUserId: true,
      status: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      claimedAt: true,
      workerId: true,
      attemptCount: true,
      generatedQueryCount: true,
      returnedResultCount: true,
      newResultCount: true,
      duplicateCount: true,
      rejectedCount: true,
      createdIntakeCount: true,
      providerJobIds: true,
      errorMessage: true,
      summary: true,
    },
  });
  const discoveryRunIds = discoveryRuns.map((run) => run.id);
  const discoveryQueries =
    await client.affiliateSourceDiscoveryQueryExecutions.findMany({
      where: {
        campaignId: { in: campaignIds },
        runId: { in: discoveryRunIds },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        runId: true,
        campaignId: true,
        queryKey: true,
        cityGeoid: true,
        targetCity: true,
        targetState: true,
        sportId: true,
        sportName: true,
        profileKey: true,
        strategyKey: true,
        strategyFamilyKey: true,
        queryText: true,
        provider: true,
        status: true,
        returnedResultCount: true,
        qualifiedDirectCount: true,
        newQualifiedPolicyKeyCount: true,
        intakeCreatedCount: true,
        duplicateCount: true,
        rejectedCount: true,
        qualifiedPolicyKeys: true,
        newQualifiedPolicyKeys: true,
        errorCode: true,
        metadata: true,
      },
    });
  const discoveryResults =
    await client.affiliateSourceDiscoveryResults.findMany({
      where: { campaignId: { in: campaignIds } },
      orderBy: { lastSeenAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        campaignId: true,
        latestRunId: true,
        originalUrl: true,
        canonicalUrl: true,
        urlKey: true,
        policyKey: true,
        title: true,
        description: true,
        latestQuery: true,
        latestRank: true,
        firstSeenAt: true,
        lastSeenAt: true,
        seenCount: true,
        score: true,
        sourceTypeHints: true,
        sportHints: true,
        status: true,
        reasonCodes: true,
        reasonDetails: true,
        matchingIntakeId: true,
        matchingSourceId: true,
        supplySourceId: true,
        matchingOrganizationId: true,
        metadata: true,
      },
    });
  const scopedPolicyKeys = [
    ...new Set([
      ...intakes.map((intake) => intake.sourceKey),
      ...discoveryQueries.flatMap((query) => [
        ...query.qualifiedPolicyKeys,
        ...query.newQualifiedPolicyKeys,
      ]),
      ...discoveryResults.map((result) => result.policyKey),
    ]),
  ];
  const domainPolicies = await client.affiliateSourceDomainPolicies.findMany({
    where: { policyKey: { in: scopedPolicyKeys } },
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      policyKey: true,
      status: true,
      reviewedByUserId: true,
      reviewedAt: true,
      expiresAt: true,
      termsUrl: true,
      robotsSummary: true,
      restrictionNotes: true,
      evidence: true,
    },
  });
  const gatewayScopeContext: ProjectionJobScopeContext = {
    rows: { roots },
    cohort: selection.rolloutCohort,
    version: selection.contractVersion,
    coverageCellIds: new Set(scopedCoverageCellIds),
    scopedPolicyKeys: new Set(scopedPolicyKeys),
    campaignIds: new Set(campaigns.map((campaign) => campaign.id)),
  };
  const scopedGatewayJobIds = gatewayJobs
    .filter((job) => projectionJobMatchesScope(job, gatewayScopeContext))
    .map((job) => job.id);
  const [gatewayClaims, receipts, gatewayEvents] = await Promise.all([
    client.affiliateAgentGatewayClaims.findMany({
      where: { jobId: { in: scopedGatewayJobIds } },
      orderBy: { claimedAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        jobId: true,
        parentClaimId: true,
        claimGeneration: true,
        lifecycleGeneration: true,
        queue: true,
        lane: true,
        role: true,
        workerId: true,
        invocationId: true,
        claimRequestHash: true,
        workspaceId: true,
        workspaceMode: true,
        status: true,
        claimedAt: true,
        lastHeartbeatAt: true,
        leaseExpiresAt: true,
        hardDeadlineAt: true,
        endedAt: true,
        terminalReceiptId: true,
        safeFailureCode: true,
        safeFailureSummary: true,
        diagnosticRetainUntil: true,
      },
    }),
    client.affiliateAgentGatewayOperationReceipts.findMany({
      where: { jobId: { in: scopedGatewayJobIds } },
      orderBy: { createdAt: "desc" },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        claimId: true,
        jobId: true,
        claimGeneration: true,
        idempotencyKey: true,
        operationKind: true,
        commandName: true,
        requestHash: true,
        status: true,
        responseHash: true,
        safeErrorCode: true,
        externalOperationKey: true,
        startedAt: true,
        completedAt: true,
        reconcileAfter: true,
        retentionClass: true,
        retentionDeadline: true,
      },
    }),
    client.affiliateAgentGatewayEvents.findMany({
      orderBy: { createdAt: "desc" },
      where: { jobId: { in: scopedGatewayJobIds } },
      take: MAX_PROJECTION_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        eventKey: true,
        jobId: true,
        claimId: true,
        receiptId: true,
        sequence: true,
        eventType: true,
        actorKind: true,
        actorId: true,
        role: true,
        requestHash: true,
        inputHash: true,
        outputHash: true,
        reasonCodes: true,
        payload: true,
        retentionClass: true,
        retentionDeadline: true,
      },
    }),
  ]);
  const alertData = await loadProjectionAlertRows(
    client,
    selection,
    scopedRootIds,
    scopedCoverageCellIds,
    scopedDemandIds,
    scopedWaveIds,
    {
      sourceIds: [...scopedRootIds, ...scopedRootLiveSourceIds],
      gatewayJobIds: scopedGatewayJobIds,
      discoveryRunIds,
      intakeRunIds: intakeRuns.map((run) => run.id),
      scrapeRunIds: scrapeRuns.map((run) => run.id),
    },
    page,
    pageSize,
    selectedAlertId,
    historyPage,
    historyPageSize,
  );
  const {
    operationalAlerts,
    operationalAlertPageIds,
    operationalAlertPage,
    operationalAlertPageSize,
    operationalAlertTotal,
    alertDeliveries,
    alertDeliveryHistory,
    alertDeliveryStats,
    alertDeliveryTotal,
    alertDeliveryPage,
    alertDeliveryPageSize,
  } = alertData;
  const scopedOrganizationIds = [
    ...new Set(
      [
        ...intakes.map((intake) => intake.organizationId),
        ...sources.map((source) => source.organizationId),
        ...canonicalEvents.map((event) => event.organizationId),
        ...canonicalTeams.map((team) => team.organizationId),
        ...facilities.map((facility) => facility.organizationId),
        ...organizationTargetIds,
      ].filter((id): id is string => Boolean(id)),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const organizations = await client.organizations.findMany({
    where: { id: { in: scopedOrganizationIds } },
    orderBy: { updatedAt: "desc" },
    take: MAX_PROJECTION_ROWS + 1,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      name: true,
      location: true,
      website: true,
      status: true,
      verificationStatus: true,
      originType: true,
      ownershipStatus: true,
      publicSlug: true,
      publicPageEnabled: true,
      publicWidgetsEnabled: true,
    },
  });
  const rawRows = {
    contracts,
    roots,
    targets,
    demands,
    waves,
    transitions,
    gatewayJobs,
    gatewayClaims,
    receipts,
    gatewayEvents,
    reconciliationRuns,
    coverageCells,
    coverageAssessments,
    coverageJobs,
    discoveryQueries,
    discoveryRuns,
    discoveryResults,
    domainPolicies,
    mappingJobs,
    approvals,
    intakes,
    pages,
    intakeRuns,
    artifacts,
    sources,
    mappings,
    scrapeRuns,
    candidates,
    campaigns,
    operationalAlerts,
    alertDeliveries,
    workerHealth,
    organizations,
    canonicalEvents,
    canonicalTeams,
    facilities,
  };
  const boundedRows = boundedProjectionRowsFor(rawRows);
  const projectionRows = {
    ...boundedRows,
    reconciliationRunTotal,
    reconciliationRunPage,
    selectedReconciliationRun,
    operationalAlertPageIds,
    operationalAlertPage,
    operationalAlertPageSize,
    operationalAlertTotal,
    alertDeliveryHistory,
    alertDeliveryStats,
    alertDeliveryTotal,
    alertDeliveryPage,
    alertDeliveryPageSize,
  };
  return {
    ...projectionRows,
  };
};
type ProjectionGatewayJob = Readonly<{
  id: string;
  supplySourceId: string | null;
  subjectJson: unknown;
}>;

type ProjectionJobScopeContext = Readonly<{
  rows: Readonly<{
    roots: readonly Readonly<{ id: string; liveSourceId: string | null }>[];
  }>;
  cohort: string;
  version: number | null;
  coverageCellIds: ReadonlySet<string>;
  scopedPolicyKeys: ReadonlySet<string>;
  campaignIds: ReadonlySet<string>;
}>;

type ProjectionScopeContext = Omit<ProjectionJobScopeContext, "rows"> &
  Readonly<{
    rows: ProjectionRows;
    rootIds: ReadonlySet<string>;
    demandIds: ReadonlySet<string>;
    eligibleWaveIds: ReadonlySet<string>;
  }>;

const projectionIdIn = (
  id: string | null | undefined,
  ids: ReadonlySet<string>,
): boolean => Boolean(id && ids.has(id));

const projectionRootSourceMatchesScope = (
  context: Pick<ProjectionJobScopeContext, "rows">,
  sourceId: string | null,
): boolean =>
  Boolean(
    sourceId &&
      context.rows.roots.some(
        (root) => root.id === sourceId || root.liveSourceId === sourceId,
      ),
  );

const projectionJobContractMatchesScope = (
  jobCohort: string | null,
  jobVersion: number,
  context: Pick<ProjectionJobScopeContext, "cohort" | "version">,
): boolean =>
  (jobCohort === null || jobCohort === context.cohort) &&
  (context.version === null || jobVersion < 0 || jobVersion === context.version);

const projectionJobMatchesMetadataScope = (
  context: ProjectionJobScopeContext,
  jobCohort: string | null,
  jobVersion: number,
  policyKey: string | null,
  subject: Record<string, unknown>,
): boolean =>
  stringList(subject.coverageCellIds).some((cellId) =>
    context.coverageCellIds.has(cellId),
  ) ||
  stringList(subject.campaignIds).some((campaignId) =>
    context.campaignIds.has(campaignId),
  ) ||
  projectionIdIn(policyKey, context.scopedPolicyKeys) ||
  (jobCohort === context.cohort &&
    (context.version === null || jobVersion === context.version));

const projectionJobMatchesScope = (
  job: ProjectionGatewayJob,
  context: ProjectionJobScopeContext,
): boolean => {
  const subject = recordValue(job.subjectJson);
  const sourceId =
    stringValue(job.supplySourceId) ??
    stringValue(subject.supplySourceId ?? subject.sourceId);
  const jobCohort = stringValue(subject.rolloutCohort ?? subject.cohort);
  const jobVersion = numberValue(
    subject.contractVersion ?? subject.supplyContractVersion,
    -1,
  );
  const policyKey = stringValue(subject.policyKey ?? subject.domainPolicyKey);
  if (sourceId) {
    return (
      projectionRootSourceMatchesScope(context, sourceId) &&
      projectionJobContractMatchesScope(jobCohort, jobVersion, context)
    );
  }
  return projectionJobMatchesMetadataScope(
    context,
    jobCohort,
    jobVersion,
    policyKey,
    subject,
  );
};

const projectionAlertHasLineage = (
  alert: ProjectionRows["operationalAlerts"][number],
  payload: Record<string, unknown>,
  rootId: string | null,
): boolean =>
  [
    alert.supplySourceId,
    alert.coverageCellId,
    alert.demandId,
    alert.waveId,
    rootId,
    payload.coverageCellId,
    payload.demandId,
    payload.waveId,
    payload.supplySourceId,
    payload.sourceId,
    payload.scrapeRunId,
    payload.runId,
    payload.discoveryRunId,
    payload.intakeRunId,
    payload.jobId,
    payload.gatewayJobId,
    upper(alert.subjectType) === "AFFILIATE_SUPPLY_SOURCE" ? alert.subjectId : null,
    upper(alert.subjectType) === "DISCOVERY_RUN" ? alert.subjectId : null,
    upper(alert.subjectType) === "INTAKE_RUN" ? alert.subjectId : null,
    upper(alert.subjectType) === "AGENT_JOB" ? alert.subjectId : null,
  ].some(Boolean);

const projectionAlertMatchesDirectLineage = (
  alert: ProjectionRows["operationalAlerts"][number],
  payload: Record<string, unknown>,
  rootId: string | null,
  context: ProjectionScopeContext,
): boolean =>
  [
    projectionIdIn(rootId, context.rootIds),
    projectionIdIn(alert.coverageCellId, context.coverageCellIds),
    projectionIdIn(alert.demandId, context.demandIds),
    projectionIdIn(alert.waveId, context.eligibleWaveIds),
    projectionIdIn(
      stringValue(payload.coverageCellId),
      context.coverageCellIds,
    ),
    projectionIdIn(stringValue(payload.demandId), context.demandIds),
    projectionIdIn(stringValue(payload.waveId), context.eligibleWaveIds),
  ].some(Boolean);

const projectionAlertMatchesGatewayLineage = (
  alert: ProjectionRows["operationalAlerts"][number],
  payload: Record<string, unknown>,
  context: ProjectionScopeContext,
): boolean => {
  const gatewayJobId = alertGatewayJobIdFor(alert, payload);
  const gatewayJob = context.rows.gatewayJobs.find(
    (candidate) => candidate.id === gatewayJobId,
  );
  const coverageCellSubject =
    upper(alert.subjectType) === "AGENT_JOB" ? alert.subjectId : null;
  return (
    Boolean(gatewayJob && projectionJobMatchesScope(gatewayJob, context)) ||
    projectionIdIn(coverageCellSubject, context.coverageCellIds)
  );
};

const projectionRootMatchesSource = (
  context: ProjectionScopeContext,
  sourceId: string | null | undefined,
): boolean =>
  Boolean(
    sourceId &&
      context.rows.roots.some(
        (root) => root.id === sourceId || root.liveSourceId === sourceId,
      ),
  );
const projectionAlertMatchesDiscoveryLineage = (
  alert: ProjectionRows["operationalAlerts"][number],
  payload: Record<string, unknown>,
  context: ProjectionScopeContext,
): boolean => {
  const runId =
    stringValue(payload.discoveryRunId) ??
    (upper(alert.subjectType) === "DISCOVERY_RUN"
      ? stringValue(alert.subjectId)
      : null);
  const run = context.rows.discoveryRuns.find((candidate) => candidate.id === runId);

  return Boolean(run && context.campaignIds.has(run.campaignId));
};

const projectionAlertMatchesIntakeLineage = (
  alert: ProjectionRows["operationalAlerts"][number],
  payload: Record<string, unknown>,
  context: ProjectionScopeContext,
): boolean => {
  const runId =
    stringValue(payload.intakeRunId) ??
    (upper(alert.subjectType) === "INTAKE_RUN"
      ? stringValue(alert.subjectId)
      : null);
  const run = context.rows.intakeRuns.find((candidate) => candidate.id === runId);
  const intake = run
    ? context.rows.intakes.find((candidate) => candidate.id === run.intakeId)
    : undefined;
  return [
    run?.supplySourceId,
    intake?.supplySourceId,
    intake?.affiliateSourceId,
  ].some((sourceId) => projectionRootMatchesSource(context, sourceId));
};

const projectionAlertMatchesLineage = (
  alert: ProjectionRows["operationalAlerts"][number],
  payload: Record<string, unknown>,
  rootId: string | null,
  context: ProjectionScopeContext,
): boolean =>
  [
    projectionAlertMatchesDirectLineage(alert, payload, rootId, context),
    projectionAlertMatchesGatewayLineage(alert, payload, context),
    projectionAlertMatchesDiscoveryLineage(alert, payload, context),
    projectionAlertMatchesIntakeLineage(alert, payload, context),
  ].some(Boolean);

const projectionAlertIsGlobalInfrastructure = (
  alert: ProjectionRows["operationalAlerts"][number],
): boolean =>
  alert.rolloutCohort === null &&
  alert.contractVersion === null &&
  (GLOBAL_OPERATIONAL_ALERT_SUBJECT_TYPES.some(
    (subjectType) => subjectType === upper(alert.subjectType),
  ) ||
    GLOBAL_OPERATIONAL_ALERT_CATEGORIES.some(
      (category) => category === upper(alert.category),
    ));
const projectionAlertMatchesScope = (
  alert: ProjectionRows["operationalAlerts"][number],
  context: ProjectionScopeContext,
): boolean => {
  const payload = recordValue(alert.payload);
  const rootId = rootIdForAlert(context.rows, alert);
  const hasLineage = projectionAlertHasLineage(alert, payload, rootId);
  if (projectionAlertIsGlobalInfrastructure(alert)) return true;
  if (
    !hasLineage &&
    alert.rolloutCohort === null &&
    alert.contractVersion === null
  ) {
    return true;
  }
  if (
    alert.rolloutCohort !== null &&
    alert.rolloutCohort !== context.cohort
  ) {
    return false;
  }
  if (
    alert.contractVersion !== null &&
    alert.contractVersion !== context.version
  ) {
    return false;
  }
  return projectionAlertMatchesLineage(alert, payload, rootId, context);
};

const scopeProjectionRows = (
  rows: ProjectionRows,
  selection: AffiliateOperationsContractSelection,
): ProjectionRows => {
  const cohort = selection.rolloutCohort.trim() || "DEFAULT";
  const version = selection.contractVersion;
  const roots = rows.roots.filter(
    (root) =>
      root.rolloutCohort === cohort &&
      (version === null || root.activeSupplyContractVersion === version),
  );
  const rootIds = new Set(roots.map((root) => root.id));
  const rootIntakeIds = new Set(
    roots
      .map((root) => root.intakeId)
      .filter((id): id is string => Boolean(id)),
  );
  const rootLiveSourceIds = new Set(
    roots
      .map((root) => root.liveSourceId)
      .filter((id): id is string => Boolean(id)),
  );
  const demands = rows.demands.filter(
    (demand) =>
      demand.rolloutCohort === cohort &&
      (version === null || demand.contractVersion === version),
  );
  const demandIds = new Set(demands.map((demand) => demand.id));
  const coverageCells = rows.coverageCells.filter(
    (cell) => cell.cohort === cohort,
  );
  const coverageCellIds = new Set(coverageCells.map((cell) => cell.id));
  const coverageAssessments = rows.coverageAssessments.filter((assessment) =>
    coverageCellIds.has(assessment.cellId),
  );
  const assessmentCampaignIds = new Set(
    coverageAssessments.flatMap((assessment) => assessment.campaignIds),
  );
  const campaignMatchesScope = (
    campaign: ProjectionRows["campaigns"][number],
  ): boolean => {
    const metadata = recordValue(campaign.metadata);
    const campaignCohort = stringValue(
      metadata.rolloutCohort ?? metadata.cohort,
    );
    const campaignVersion = numberValue(
      metadata.contractVersion ?? metadata.supplyContractVersion,
      -1,
    );
    if (campaignCohort !== null || campaignVersion >= 0) {
      return (
        (campaignCohort === null || campaignCohort === cohort) &&
        (campaignVersion < 0 || version === null || campaignVersion === version)
      );
    }
    return assessmentCampaignIds.has(campaign.id);
  };
  const campaigns = rows.campaigns.filter(campaignMatchesScope);
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const discoveryRuns = rows.discoveryRuns.filter((run) =>
    campaignIds.has(run.campaignId),
  );
  const discoveryRunIds = new Set(discoveryRuns.map((run) => run.id));
  const discoveryQueries = rows.discoveryQueries.filter(
    (query) =>
      campaignIds.has(query.campaignId) && discoveryRunIds.has(query.runId),
  );
  const discoveryResults = rows.discoveryResults.filter((result) =>
    campaignIds.has(result.campaignId),
  );
  const relevantSupplySource = (
    supplySourceId: string | null | undefined,
  ): boolean =>
    projectionIdIn(supplySourceId, rootIds) ||
    projectionIdIn(supplySourceId, rootLiveSourceIds);
  const scopedIntakes = rows.intakes.filter(
    (intake) =>
      rootIntakeIds.has(intake.id) ||
      relevantSupplySource(intake.supplySourceId),
  );
  const intakeIds = new Set(scopedIntakes.map((intake) => intake.id));
  const scopedSources = rows.sources.filter(
    (source) =>
      rootLiveSourceIds.has(source.id) ||
      relevantSupplySource(source.supplySourceId),
  );
  const sourceIds = new Set(scopedSources.map((source) => source.id));
  const pages = rows.pages.filter(
    (page) =>
      intakeIds.has(page.intakeId) || relevantSupplySource(page.supplySourceId),
  );
  const intakeRuns = rows.intakeRuns.filter(
    (run) =>
      intakeIds.has(run.intakeId) || relevantSupplySource(run.supplySourceId),
  );
  const artifacts = rows.artifacts.filter(
    (artifact) =>
      intakeIds.has(artifact.intakeId) ||
      relevantSupplySource(artifact.supplySourceId),
  );
  const coverageJobMatchesScope = (
    job: ProjectionRows["coverageJobs"][number],
  ): boolean => {
    const context = recordValue(job.context);
    const contextCellIds = new Set(stringList(context.coverageCellIds));
    const contextCellId = stringValue(context.coverageCellId);
    if (contextCellId) contextCellIds.add(contextCellId);
    return Array.from(contextCellIds).some((cellId) =>
      coverageCellIds.has(cellId),
    );
  };
  const scopedPolicyKeys = new Set([
    ...scopedIntakes.map((intake) => intake.sourceKey),
    ...discoveryQueries.flatMap((query) => [
      ...query.qualifiedPolicyKeys,
      ...query.newQualifiedPolicyKeys,
    ]),
    ...discoveryResults.map((result) => result.policyKey),
  ]);
  const eligibleWaveIds = new Set(
    rows.waves
      .filter((wave) => demandIds.has(wave.demandId))
      .map((wave) => wave.id),
  );
  const scopeContext: ProjectionScopeContext = {
    rows,
    cohort,
    version,
    rootIds,
    demandIds,
    coverageCellIds,
    eligibleWaveIds,
    campaignIds,
    scopedPolicyKeys,
  };
  const gatewayJobs = rows.gatewayJobs.filter((job) =>
    projectionJobMatchesScope(job, scopeContext),
  );
  const gatewayJobIds = new Set(gatewayJobs.map((job) => job.id));
  const gatewayClaims = rows.gatewayClaims.filter((claim) =>
    gatewayJobIds.has(claim.jobId),
  );
  const operationalAlerts = rows.operationalAlerts.filter((alert) =>
    projectionAlertMatchesScope(alert, scopeContext),
  );
  const alertIds = new Set(operationalAlerts.map((alert) => alert.id));
  const alertDeliveries = rows.alertDeliveries.filter((delivery) =>
    alertIds.has(delivery.alertId),
  );
  const targetIds = new Set(
    rows.targets
      .filter((target) => rootIds.has(target.supplySourceId))
      .map((target) => stringValue(target.targetId))
      .filter((id): id is string => Boolean(id)),
  );
  const organizationIds = new Set(
    [
      ...scopedIntakes.map((intake) => intake.organizationId),
      ...scopedSources.map((source) => source.organizationId),
      ...rows.canonicalEvents
        .filter((event) => targetIds.has(event.id))
        .map((event) => event.organizationId),
      ...rows.canonicalTeams
        .filter((team) => targetIds.has(team.id))
        .map((team) => team.organizationId),
      ...rows.facilities
        .filter((facility) => targetIds.has(facility.id))
        .map((facility) => facility.organizationId),
      ...rows.targets
        .filter(
          (target) =>
            rootIds.has(target.supplySourceId) &&
            isOrganizationTargetType(target.targetType),
        )
        .map((target) => target.targetId),
    ].filter((id): id is string => Boolean(id)),
  );
  const organizations = rows.organizations.filter((organization) =>
    organizationIds.has(organization.id),
  );
  return {
    ...rows,
    roots,
    targets: rows.targets.filter((target) =>
      rootIds.has(target.supplySourceId),
    ),
    demands,
    waves: rows.waves.filter(
      (wave) => demandIds.has(wave.demandId) && wave.rolloutCohort === cohort,
    ),
    transitions: rows.transitions.filter(
      (transition) =>
        rootIds.has(transition.supplySourceId) &&
        (version === null || transition.contractVersion === version),
    ),
    gatewayJobs,
    gatewayClaims,
    receipts: rows.receipts.filter((receipt) =>
      gatewayJobIds.has(receipt.jobId),
    ),
    gatewayEvents: rows.gatewayEvents.filter(
      (event) =>
        (event.jobId ? gatewayJobIds.has(event.jobId) : false) ||
        (event.claimId
          ? gatewayClaims.some((claim) => claim.id === event.claimId)
          : false),
    ),
    reconciliationRuns: rows.reconciliationRuns.filter(
      (run) =>
        run.rolloutCohort === cohort &&
        (version === null || run.supplyContractVersion === version),
    ),
    coverageCells,
    coverageAssessments,
    coverageJobs: rows.coverageJobs.filter(coverageJobMatchesScope),
    discoveryQueries,
    discoveryRuns,
    discoveryResults,
    domainPolicies: rows.domainPolicies.filter((policy) =>
      scopedPolicyKeys.has(policy.policyKey),
    ),
    mappingJobs: rows.mappingJobs.filter(
      (job) =>
        intakeIds.has(job.intakeId) ||
        relevantSupplySource(job.supplySourceId) ||
        (job.sourceId !== null && sourceIds.has(job.sourceId)),
    ),
    approvals: rows.approvals.filter((job) =>
      relevantSupplySource(job.supplySourceId),
    ),
    intakes: scopedIntakes,
    pages,
    intakeRuns,
    artifacts,
    sources: scopedSources,
    mappings: rows.mappings.filter(
      (mapping) =>
        relevantSupplySource(mapping.supplySourceId) ||
        (mapping.sourceId !== null && sourceIds.has(mapping.sourceId)),
    ),
    scrapeRuns: rows.scrapeRuns.filter(
      (run) =>
        relevantSupplySource(run.supplySourceId) || sourceIds.has(run.sourceId),
    ),
    candidates: rows.candidates.filter(
      (candidate) =>
        relevantSupplySource(candidate.supplySourceId) ||
        (candidate.sourceId !== null && sourceIds.has(candidate.sourceId)),
    ),
    campaigns,
    operationalAlerts,
    alertDeliveries,
    organizations,
    canonicalEvents: rows.canonicalEvents.filter((event) =>
      targetIds.has(event.id),
    ),
    canonicalTeams: rows.canonicalTeams.filter((team) =>
      targetIds.has(team.id),
    ),
    facilities: rows.facilities.filter((facility) => targetIds.has(facility.id)),
    workerHealth: rows.workerHealth,
  };
};

const latestProjectionRecord = <T extends { id: string }>(
  records: readonly T[],
  timestamp: (record: T) => unknown,
): { id: string; at: string | null } | null => {
  let latest: { id: string; at: string | null; time: number } | null = null;
  for (const record of records) {
    const at = isoValue(timestamp(record));
    const time = dateValue(at)?.getTime() ?? 0;
    if (
      !latest ||
      time > latest.time ||
      (time === latest.time && record.id > latest.id)
    ) {
      latest = { id: record.id, at, time };
    }
  }
  return latest ? { id: latest.id, at: latest.at } : null;
};

const historyRevisionFor = (
  rows: ProjectionRows,
  contract: AffiliateOperationsContractSelection,
): string => {
  const newestRollups = {
    lifecycle: latestProjectionRecord(
      rows.transitions,
      (record) => record.occurredAt,
    ),
    gateway: latestProjectionRecord(
      rows.gatewayEvents,
      (record) => record.createdAt,
    ),
    capture: latestProjectionRecord(
      rows.intakeRuns,
      (record) => record.finishedAt ?? record.updatedAt ?? record.createdAt,
    ),
    discovery: latestProjectionRecord(
      rows.discoveryRuns,
      (record) => record.finishedAt ?? record.updatedAt ?? record.createdAt,
    ),
    assessment: latestProjectionRecord(
      rows.coverageAssessments,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    mapping: latestProjectionRecord(
      rows.mappingJobs,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    review: latestProjectionRecord(
      rows.approvals,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    demand: latestProjectionRecord(
      rows.demands,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    wave: latestProjectionRecord(
      rows.waves,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    refresh: latestProjectionRecord(
      rows.scrapeRuns,
      (record) => record.finishedAt ?? record.updatedAt ?? record.createdAt,
    ),
    alert: latestProjectionRecord(
      rows.operationalAlerts,
      (record) => record.createdAt,
    ),
    alertDelivery: latestProjectionRecord(
      rows.alertDeliveries,
      (record) => record.createdAt,
    ),
    reconciliation: latestProjectionRecord(
      rows.reconciliationRuns,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    publicEvent: latestProjectionRecord(
      rows.canonicalEvents,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    publicTeam: latestProjectionRecord(
      rows.canonicalTeams,
      (record) => record.updatedAt ?? record.createdAt,
    ),
    publicFacility: latestProjectionRecord(
      rows.facilities,
      (record) => record.updatedAt ?? record.createdAt,
    ),
  };
  return createHash("sha256")
    .update(
      JSON.stringify({
        contract,
        newestRollups,
      }),
    )
    .digest("hex");
};

const targetDeficitRowFor = (
  key: string,
  rule: {
    marketKey: string | null;
    sportId: string | null;
    sourceProfile: string;
    minimumFreshPublishedSupply: number;
  },
  demand: ProjectionRows["demands"][number] | undefined,
  current: number,
  contract: AffiliateOperationsContractSelection,
  version: number,
): SupplyTargetDeficitRow => {
  const target = Math.max(
    rule.minimumFreshPublishedSupply,
    demand?.minimumFreshPublishedSupply ?? 0,
  );
  const deficit = Math.max(0, target - current);
  return {
    id: demand?.id ?? `target:${key}`,
    marketKey: rule.marketKey,
    sportId: rule.sportId,
    sourceProfile: upper(rule.sourceProfile),
    rolloutCohort: contract.rolloutCohort,
    contractVersion: version,
    current,
    target,
    deficit,
    priority: demand?.priority ?? 4,
    status: demand?.status ?? (deficit > 0 ? "OPEN" : "MET"),
    href: adminLink("coverage", undefined, undefined, {
      market: rule.marketKey,
      sport: rule.sportId,
      profile: upper(rule.sourceProfile),
      rolloutCohort: contract.rolloutCohort,
      contractVersion: String(version),
    }),
  };
};

const buildTargetDeficits = (
  rows: ProjectionRows,
  rootsById: ReadonlyMap<string, ProjectionRows["roots"][number]>,
  contractJson: unknown,
  contract: AffiliateOperationsContractSelection,
  now: Date,
  filters: AffiliateOperationsFilters,
): SupplyTargetDeficitRow[] => {
  const dimensionContext = projectionDimensionContext(rows);
  const rules = parseTargetRules(contractJson, contract.rolloutCohort).filter(
    (rule) =>
      containsFilter(rule.marketKey, filters.market) &&
      containsFilter(rule.sportId, filters.sport) &&
      containsFilter(rule.sourceProfile, filters.profile) &&
      (!filters.city ||
        rows.targets.some(
          (target) =>
            target.marketKey === rule.marketKey &&
            target.sportId === rule.sportId &&
            upper(target.sourceProfile) === upper(rule.sourceProfile) &&
            targetMatchesCity(target, dimensionContext, filters.city),
        )),
  );
  const version = contract.contractVersion ?? 0;
  const demandByKey = new Map(
    rows.demands
      .filter(
        (demand) =>
          demand.rolloutCohort === contract.rolloutCohort &&
          (contract.contractVersion === null ||
            demand.contractVersion === contract.contractVersion),
      )
      .map((demand) => [
        targetKey(
          demand.marketKey,
          demand.sportId,
          demand.sourceProfile,
          demand.rolloutCohort,
          demand.contractVersion,
        ),
        demand,
      ]),
  );
  const ruleByKey = new Map(
    rules.map((rule) => [
      targetKey(
        rule.marketKey,
        rule.sportId,
        rule.sourceProfile,
        contract.rolloutCohort,
        version,
      ),
      rule,
    ]),
  );
  rows.demands
    .filter(
      (demand) =>
        demand.rolloutCohort === contract.rolloutCohort &&
        (contract.contractVersion === null ||
          demand.contractVersion === contract.contractVersion),
    )
    .forEach((demand) => {
      const key = targetKey(
        demand.marketKey,
        demand.sportId,
        demand.sourceProfile,
        demand.rolloutCohort,
        demand.contractVersion,
      );
      if (!ruleByKey.has(key)) {
        ruleByKey.set(key, {
          marketKey: demand.marketKey,
          sportId: demand.sportId,
          sourceProfile: upper(demand.sourceProfile),
          minimumFreshPublishedSupply: demand.minimumFreshPublishedSupply,
        });
      }
    });
  const counts = new Map<string, number>();
  rows.targets.forEach((target) => {
    const root = rootsById.get(target.supplySourceId);
    if (
      !root ||
      root.rolloutCohort !== contract.rolloutCohort ||
      (contract.contractVersion !== null &&
        root.activeSupplyContractVersion !== contract.contractVersion) ||
      !isFreshTarget(target, root, contractJson, contract.rolloutCohort, now) ||
      !targetHasVisiblePublicRecord(target, rows)
    )
      return;
    const key = targetKey(
      target.marketKey,
      target.sportId,
      target.sourceProfile,
      root.rolloutCohort,
      root.activeSupplyContractVersion,
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(ruleByKey.entries())
    .map(([key, rule]) =>
      targetDeficitRowFor(
        key,
        rule,
        demandByKey.get(key),
        counts.get(key) ?? 0,
        contract,
        version,
      ),
    )
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        right.deficit - left.deficit ||
        String(left.marketKey ?? "").localeCompare(
          String(right.marketKey ?? ""),
        ) ||
        String(left.sportId ?? "").localeCompare(String(right.sportId ?? "")) ||
        left.sourceProfile.localeCompare(right.sourceProfile),
    );
};
const buildWipSeries = (rows: ProjectionRows, now: Date): WipSeriesPoint[] => {
  const points: WipSeriesPoint[] = [];
  const lanes: WipSeriesPoint["lane"][] = ["MAPPING", "REVIEW"];
  const waitingStates = new Set([
    "QUEUED",
    "RETRY_WAIT",
    "DEFERRED",
    "REVIEW_REQUIRED",
    "PENDING",
  ]);
  const terminalEventTypes = new Set([
    "CLAIM_TERMINAL_RESULT_ACCEPTED",
    "CLAIM_TERMINAL_RESULT_REPLAYED",
  ]);
  const eventsByJob = new Map<
    string,
    ProjectionRows["gatewayEvents"][number][]
  >();
  const claimsByJob = new Map<
    string,
    ProjectionRows["gatewayClaims"][number][]
  >();
  const jobsById = new Map(rows.gatewayJobs.map((job) => [job.id, job]));
  rows.gatewayEvents.forEach((event) => {
    const events = eventsByJob.get(event.jobId) ?? [];
    events.push(event);
    eventsByJob.set(event.jobId, events);
  });
  rows.gatewayClaims.forEach((claim) => {
    const claims = claimsByJob.get(claim.jobId) ?? [];
    claims.push(claim);
    claimsByJob.set(claim.jobId, claims);
  });
  eventsByJob.forEach((events) => {
    events.sort(
      (left, right) =>
        (dateValue(right.createdAt)?.getTime() ?? 0) -
        (dateValue(left.createdAt)?.getTime() ?? 0),
    );
  });
  claimsByJob.forEach((claims) => {
    claims.sort(
      (left, right) =>
        (dateValue(left.claimedAt)?.getTime() ?? 0) -
        (dateValue(right.claimedAt)?.getTime() ?? 0),
    );
  });
  const laneFor = (value: unknown): WipSeriesPoint["lane"] | null => {
    const normalized = upper(value);
    if (normalized.includes("REVIEW")) return "REVIEW";
    if (normalized.includes("MAPPING")) return "MAPPING";
    return null;
  };
  const workerLimitFor = (lane: WipSeriesPoint["lane"]): number | null => {
    const healthyWorkers = rows.workerHealth.filter(
      (worker) => laneFor(worker.role) === lane && isWorkerHealthy(worker, now),
    ).length;
    return healthyWorkers * 2;
  };
  const stateForEvent = (
    event: ProjectionRows["gatewayEvents"][number],
  ): string => {
    const eventType = upper(event.eventType);
    if (
      eventType === "CLAIM_INVOCATION_FAILED" ||
      eventType === "CLAIM_EXPIRED"
    ) {
      return recordValue(event.payload).isPipelineBlocked === true
        ? "PIPELINE_BLOCKED"
        : "RETRY_WAIT";
    }
    if (terminalEventTypes.has(eventType)) return "COMPLETED";
    if (eventType === "CLAIM_CREATED" || eventType.startsWith("CLAIM_"))
      return "CLAIMED";
    if (
      eventType.includes("RESERVED") ||
      eventType.includes("SUCCEEDED") ||
      eventType.includes("REPLAYED")
    ) {
      return "CLAIMED";
    }
    return eventType;
  };
  const stateAt = (
    job: ProjectionRows["gatewayJobs"][number],
    at: Date,
  ): string => {
    const event = (eventsByJob.get(job.id) ?? []).find((candidate) => {
      const recordedAt = dateValue(candidate.createdAt);
      return recordedAt && recordedAt.getTime() <= at.getTime();
    });
    if (event) return stateForEvent(event);
    const firstClaimAt = dateValue(claimsByJob.get(job.id)?.[0]?.claimedAt);
    const createdAt = dateValue(job.createdAt);
    if (
      createdAt &&
      createdAt.getTime() <= at.getTime() &&
      firstClaimAt &&
      at.getTime() < firstClaimAt.getTime()
    ) {
      return "QUEUED";
    }
    return upper(job.status);
  };
  for (let index = 23; index >= 0; index -= 1) {
    const at = new Date(now.getTime() - index * HOUR_MS);
    lanes.forEach((lane) => {
      const waitingJobs = rows.gatewayJobs.filter((job) => {
        if (laneFor(job.lane ?? job.role) !== lane) return false;
        const created = dateValue(job.createdAt);
        const finished = dateValue(job.finishedAt);
        if (
          !created ||
          created.getTime() > at.getTime() ||
          (finished && finished.getTime() <= at.getTime())
        )
          return false;
        return waitingStates.has(stateAt(job, at));
      }).length;
      const activeWorkers = rows.gatewayClaims.filter((claim) => {
        const job = jobsById.get(claim.jobId);
        if (laneFor(claim.lane ?? job?.lane) !== lane) return false;
        const claimed = dateValue(claim.claimedAt);
        const ended = dateValue(claim.endedAt);
        return (
          claimed &&
          claimed.getTime() <= at.getTime() &&
          (!ended || ended.getTime() > at.getTime())
        );
      }).length;
      const replenishmentWaves =
        lane === "MAPPING"
          ? rows.waves.filter((wave) => {
              const started = dateValue(wave.startedAt);
              return (
                started &&
                started.getTime() > at.getTime() - HOUR_MS &&
                started.getTime() <= at.getTime()
              );
            }).length
          : 0;
      points.push({
        at: at.toISOString(),
        lane,
        activeWorkers,
        waitingJobs,
        workerLimit: workerLimitFor(lane),
        replenishmentWaves,
      });
    });
  }
  return points;
};
const buildLifecycleCounts = (rows: ProjectionRows): LifecycleCountRow[] => {
  const counts = new Map<string, number>();
  rows.roots.forEach((root) =>
    counts.set(
      String(root.derivedStage),
      (counts.get(String(root.derivedStage)) ?? 0) + 1,
    ),
  );
  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stage, count]) => ({
      stage,
      count,
      href: adminLink("sources", undefined, undefined, { status: stage }),
    }));
};

const isSuccessfulRefreshStatus = (status: unknown): boolean =>
  ["SUCCEEDED", "SUCCESS", "COMPLETED", "PUBLISHED"].includes(upper(status));

const successfulGatewayJob = (
  job: Readonly<{ status: unknown }> | null | undefined,
): boolean =>
  Boolean(
    job &&
      ["COMPLETED", "SUCCEEDED", "SUCCESS"].includes(upper(job.status)),
  );

const sourceRootFreshAfter = (
  root: ProjectionRows["roots"][number] | null,
  runAt: number,
): boolean =>
  Boolean(
    root &&
      upper(root.freshnessStatus) === "FRESH" &&
      (dateValue(root.lastSuccessfulRefreshAt)?.getTime() ?? 0) > runAt,
  );

const successfulRefreshAfterRun = (
  sourceId: string | null,
  runAt: number,
  recoveryRows: ProjectionRows,
): boolean =>
  recoveryRows.scrapeRuns.some(
    (candidate) =>
      rootIdForSource(
        recoveryRows,
        candidate.supplySourceId ?? candidate.sourceId,
      ) === sourceId &&
      (dateValue(
        candidate.finishedAt ?? candidate.updatedAt ?? candidate.createdAt,
      )?.getTime() ?? 0) > runAt &&
      isSuccessfulRefreshStatus(candidate.status),
  );

const refreshRunRecovered = (
  run: ProjectionRows["scrapeRuns"][number],
  recoveryRows: ProjectionRows,
): boolean => {
  const sourceId = rootIdForSource(
    recoveryRows,
    run.supplySourceId ?? run.sourceId,
  );
  const runAt =
    dateValue(run.finishedAt ?? run.updatedAt ?? run.createdAt)?.getTime() ?? 0;
  const root = sourceId
    ? recoveryRows.roots.find((candidate) => candidate.id === sourceId) ?? null
    : null;
  return (
    sourceRootFreshAfter(root, runAt) ||
    successfulRefreshAfterRun(sourceId, runAt, recoveryRows)
  );
};

const receiptRecovered = (
  receipt: ProjectionRows["receipts"][number],
  recoveryRows: ProjectionRows,
): boolean => {
  const receiptAt =
    dateValue(
      receipt.completedAt ?? receipt.updatedAt ?? receipt.createdAt,
    )?.getTime() ?? 0;
  const recoveredByReceipt = recoveryRows.receipts.some(
    (candidate) =>
      candidate.jobId === receipt.jobId &&
      (dateValue(
        candidate.completedAt ?? candidate.updatedAt ?? candidate.createdAt,
      )?.getTime() ?? 0) > receiptAt &&
      isSuccessfulRefreshStatus(candidate.status),
  );
  const job = recoveryRows.gatewayJobs.find(
    (candidate) => candidate.id === receipt.jobId,
  );
  return recoveredByReceipt || successfulGatewayJob(job);
};

const gatewayEventHasRecovery = (
  event: ProjectionRows["gatewayEvents"][number],
  recoveryRows: ProjectionRows,
): boolean =>
  recoveryRows.gatewayEvents.some((candidate) => {
    const sameOperation = [
      candidate.jobId === event.jobId,
      candidate.claimId === event.claimId,
      candidate.receiptId === event.receiptId,
    ].some(Boolean);
    const later =
      (dateValue(candidate.createdAt)?.getTime() ?? 0) >
      (dateValue(event.createdAt)?.getTime() ?? 0);
    const eventType = upper(candidate.eventType);
    const successfulEvent = [
      eventType.includes("SUCC"),
      eventType.includes("COMPLET"),
      eventType.includes("RECOVER"),
      eventType.includes("REPLAY"),
    ].some(Boolean);
    return (
      candidate.id !== event.id &&
      sameOperation &&
      later &&
      !eventType.includes("FAIL") &&
      !eventType.includes("ERROR") &&
      successfulEvent
    );
  });

const gatewayEventRecovered = (
  event: ProjectionRows["gatewayEvents"][number],
  recoveryRows: ProjectionRows,
): boolean => {
  const job = event.jobId
    ? recoveryRows.gatewayJobs.find(
        (candidate) => candidate.id === event.jobId,
      )
    : null;
  return gatewayEventHasRecovery(event, recoveryRows) || successfulGatewayJob(job);
};

const alertJobIdFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string | null => alertGatewayJobIdFor(alert, payload);

const alertDeliveryFailureRecoveryIdsFor = (
  payload: Record<string, unknown>,
  recoveryRows: OperationalAlertRecoveryRows,
): string[] => {
  const sourceEventKey = stringValue(payload.sourceEventKey);
  const channel = upper(payload.channel);
  const sourceAlert = recoveryRows.operationalAlerts.find(
    (candidate) => candidate.eventKey === sourceEventKey,
  );
  if (!sourceAlert) return [];
  return recoveryRows.alertDeliveries
    .filter(
      (delivery) =>
        delivery.alertId === sourceAlert.id &&
        upper(delivery.channel) === channel &&
        upper(delivery.status) === "DELIVERED",
    )
    .map((delivery) => stringValue(delivery.id))
    .filter((id): id is string => Boolean(id));
};

const alertDeliveryFailureRecovered = (
  payload: Record<string, unknown>,
  recoveryRows: OperationalAlertRecoveryRows,
): boolean =>
  alertDeliveryFailureRecoveryIdsFor(payload, recoveryRows).length > 0;
const invocationRecoveryReceiptRecorded = (
  receipt: Readonly<{ operationKind: unknown; status: unknown }>,
): boolean => {
  const operationKind = upper(receipt.operationKind);
  return (
    ["SUCCEEDED", "SUCCESS", "COMPLETED"].includes(upper(receipt.status)) &&
    !["CLAIM", "HEARTBEAT", "RECORD_FAILURE"].includes(operationKind)
  );
};

const invocationRecoveryEventRecorded = (
  event: Readonly<{ eventType: unknown }>,
): boolean => {
  const eventType = upper(event.eventType);
  return (
    !eventType.includes("FAIL") &&
    !eventType.includes("ERROR") &&
    !eventType.includes("BLOCK") &&
    !eventType.includes("REQUIRED") &&
    !eventType.includes("HEARTBEAT") &&
    [
      eventType.includes("SUCC"),
      eventType.includes("COMPLET"),
      eventType.includes("RECOVER"),
      eventType.includes("REPLAY"),
      eventType.includes("ACCEPT"),
    ].some(Boolean)
  );
};

const invocationRecoveryEvidenceRefsFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
  recoveryRows: OperationalAlertRecoveryRows,
): string[] => {
  const jobId = alertJobIdFor(alert, payload);
  if (!jobId) return [];
  const alertAt = dateValue(alert.createdAt)?.getTime() ?? 0;
  const receiptRefs = recoveryRows.receipts
    .filter(
      (receipt) =>
        receipt.jobId === jobId &&
        invocationRecoveryReceiptRecorded(receipt) &&
        (dateValue(
          receipt.completedAt ?? receipt.updatedAt ?? receipt.createdAt,
        )?.getTime() ?? 0) > alertAt,
    )
    .map((receipt) => stringValue(receipt.id))
    .filter((id): id is string => Boolean(id));
  const eventRefs = recoveryRows.gatewayEvents
    .filter(
      (event) =>
        event.jobId === jobId &&
        invocationRecoveryEventRecorded(event) &&
        (dateValue(event.createdAt)?.getTime() ?? 0) > alertAt,
    )
    .map((event) => stringValue(event.id))
    .filter((id): id is string => Boolean(id));
  return [...receiptRefs, ...eventRefs];
};

const invocationAlertRecovered = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
  recoveryRows: OperationalAlertRecoveryRows,
): boolean =>
  invocationRecoveryEvidenceRefsFor(alert, payload, recoveryRows).length > 0;

const alertRefreshRecoveryEvidenceRefsFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
  source: OperationalAlertRecoveryRows["roots"][number] | undefined,
  recoveryRows: OperationalAlertRecoveryRows,
): string[] => {
  if (
    !source ||
    !upper(alert.category).includes("REFRESH") ||
    upper(source.freshnessStatus) !== "FRESH"
  ) {
    return [];
  }
  const alertAt = dateValue(alert.createdAt)?.getTime() ?? 0;
  const refreshedAt = dateValue(source.lastSuccessfulRefreshAt)?.getTime();
  if (refreshedAt === undefined || refreshedAt <= alertAt) return [];
  const explicitRunId = alertScrapeRunIdFor(alert, payload);
  return recoveryRows.scrapeRuns
    .filter((run) => {
      const associated = explicitRunId
        ? run.id === explicitRunId
        : rootIdForSource(
            recoveryRows,
            run.supplySourceId ?? run.sourceId,
          ) === source.id;
      if (!associated) return false;
      const status = upper(run.status);
      if (
        !["SUCCEEDED", "SUCCESS", "COMPLETED", "PUBLISHED"].includes(status)
      ) {
        return false;
      }
      const runAt = dateValue(
        run.finishedAt ?? run.updatedAt ?? run.createdAt,
      )?.getTime();
      return runAt !== undefined && runAt > alertAt;
    })
    .map((run) => run.id);
};

const alertInvariantRecoveryReasonsFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
): string[] =>
  Array.from(
    new Set([
      ...stringList(alert.reasonCodes),
      ...stringList(payload.reasonCodes),
      ...stringList(payload.invariantViolations),
      ...stringList(payload.invariantReasonCodes),
      ...stringList(payload.reasonCode),
    ]),
  );

const alertInvariantRecovered = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
  source: OperationalAlertRecoveryRows["roots"][number] | undefined,
): boolean => {
  if (upper(alert.category) !== "SUPPLY_SOURCE_INVARIANT" || !source) {
    return false;
  }
  const alertGeneration =
    alert.lifecycleGeneration ??
    numberValue(
      payload.lifecycleGeneration ??
        payload.sourceLifecycleGeneration ??
        payload.generation,
      -1,
    );
  const generationAdvanced =
    alertGeneration < 0 || source.lifecycleGeneration >= alertGeneration;
  const currentReasons = stringList(source.invariantViolations);
  const reportedReasons = alertInvariantRecoveryReasonsFor(alert, payload);
  return (
    generationAdvanced &&
    reportedReasons.length > 0 &&
    reportedReasons.every((reason) => !currentReasons.includes(reason))
  );

};
type OperationalAlertRecovery = Readonly<{
  recovered: boolean;
  detail: string | null;
  evidenceRefs: readonly string[];
}>;

type OperationalAlertRecoverySignals = Readonly<{
  deliveryFailureRecovered: boolean;
  refreshRecovered: boolean;
  invariantRecovered: boolean;
  invocationRecovery: boolean;
  gatewayJobRecovered: boolean;
  workerRecovered: boolean;
  refreshRecoveryEvidenceRefs: readonly string[];
}>;

const operationalAlertExplicitRecoveryFor = (
  payload: Record<string, unknown>,
): Readonly<{ detail: string | null; evidenceRefs: readonly string[] }> => {
  const explicitRecovery = recordValue(payload.operationalAlertRecovered);
  const recorded = [
    payload.operationalAlertRecovered === true,
    payload.recovered === true,
    payload.resolved === true,
    payload.resolvedAt !== null && payload.resolvedAt !== undefined,
    explicitRecovery.recovered === true,
    explicitRecovery.isRecovered === true,
  ].some(Boolean);
  return {
    detail: recorded
      ? boundedEvidenceText(
          explicitRecovery.detail
          ?? explicitRecovery.reason
          ?? explicitRecovery.summary,
        ) ?? "Persisted recovery evidence recorded."
      : null,
    evidenceRefs: stringList(
      explicitRecovery.evidenceRefs
      ?? payload.recoveryEvidenceRefs
      ?? payload.operationalAlertRecoveryEvidenceRefs,
    ),
  };
};

const operationalAlertRecoverySignalsFor = (
  alert: OperationalAlertRecoveryAlert,
  payload: Record<string, unknown>,
  source: OperationalAlertRecoveryRows["roots"][number] | undefined,
  job: OperationalAlertRecoveryRows["gatewayJobs"][number] | undefined,
  worker: OperationalAlertRecoveryRows["workerHealth"][number] | undefined,
  recoveryRows: OperationalAlertRecoveryRows,
  now: Date,
): OperationalAlertRecoverySignals => {
  const category = upper(alert.category);
  const invocationFailure = category === "AGENT_INVOCATION_FAILURE";
  const refreshRecoveryEvidenceRefs = alertRefreshRecoveryEvidenceRefsFor(
    alert,
    payload,
    source,
    recoveryRows,
  );
  return {
    deliveryFailureRecovered:
      category === "ALERT_DELIVERY_FAILURE" &&
      alertDeliveryFailureRecovered(payload, recoveryRows),
    refreshRecovered: refreshRecoveryEvidenceRefs.length > 0,
    invariantRecovered: alertInvariantRecovered(alert, payload, source),
    invocationRecovery:
      invocationFailure && invocationAlertRecovered(alert, payload, recoveryRows),
    gatewayJobRecovered:
      !invocationFailure && successfulGatewayJob(job),
    workerRecovered:
      !invocationFailure &&
      WORKER_HEALTH_RECOVERY_CATEGORIES.has(category) &&
      Boolean(worker && isWorkerHealthy(worker, now)),
    refreshRecoveryEvidenceRefs,
  };
};

const operationalAlertRecoveryDetailsFor = (
  explicitDetail: string | null,
  signals: OperationalAlertRecoverySignals,
): string[] =>
  [
    explicitDetail,
    signals.deliveryFailureRecovered
      ? "A later delivery succeeded on the same channel."
      : null,
    signals.refreshRecovered ? "The related supply source is fresh." : null,
    signals.invariantRecovered
      ? "The recorded source invariant is absent at the current generation."
      : null,
    signals.invocationRecovery
      ? "A later successful gateway receipt or event was recorded for this job."
      : null,
    signals.gatewayJobRecovered
      ? "The related gateway job completed successfully."
      : null,
    signals.workerRecovered ? "The related worker has a current healthy lease." : null,
  ].filter((detail): detail is string => detail !== null);

const operationalAlertRecoveryFor = (
  alert: OperationalAlertRecoveryAlert,
  recoveryRows: OperationalAlertRecoveryRows,
  now: Date,
): OperationalAlertRecovery => {
  const sourceRootId = rootIdForAlert(recoveryRows, alert);
  const source = recoveryRows.roots.find(
    (root) => root.id === sourceRootId,
  );
  const payload = recordValue(alert.payload);
  const explicitRecovery = operationalAlertExplicitRecoveryFor(payload);
  const jobId = alertJobIdFor(alert, payload);
  const job = recoveryRows.gatewayJobs.find(
    (candidate) => candidate.id === jobId,
  );
  const workerId =
    stringValue(alert.workerId) ?? stringValue(payload.workerId);
  const worker = recoveryRows.workerHealth.find(
    (candidate) => candidate.workerId === workerId,
  );
  const signals = operationalAlertRecoverySignalsFor(
    alert,
    payload,
    source,
    job,
    worker,
    recoveryRows,
    now,
  );
  const details = operationalAlertRecoveryDetailsFor(
    explicitRecovery.detail,
    signals,
  );
  const recoveryEvidenceRefs = Array.from(
    new Set([
      ...explicitRecovery.evidenceRefs,
      ...signals.refreshRecoveryEvidenceRefs,
      ...alertDeliveryFailureRecoveryIdsFor(payload, recoveryRows),
      ...invocationRecoveryEvidenceRefsFor(alert, payload, recoveryRows),
    ]),
  );
  return {
    recovered: details.length > 0,
    detail: details.join(" "),
    evidenceRefs: recoveryEvidenceRefs,
  };
};

const operationalAlertRecovered = (
  alert: OperationalAlertRecoveryAlert,
  recoveryRows: OperationalAlertRecoveryRows,
  now: Date,
): boolean => operationalAlertRecoveryFor(alert, recoveryRows, now).recovered;

const exceptionSeverityFor = (
  severity: unknown,
): ExceptionRow["severity"] =>
  upper(severity) === "CRITICAL"
    ? "critical"
    : upper(severity) === "WARNING"
      ? "warning"
      : "info";

const buildExceptions = (
  rows: ProjectionRows,
  now: Date,
  recoveryRows: ProjectionRows = rows,
): ExceptionRow[] => {
  const exceptions: ExceptionRow[] = [];
  rows.roots.forEach((root) => {
    root.invariantViolations.forEach((reason) =>
      exceptions.push({
        id: `source:${root.id}:${reason}`,
        kind: "INVARIANT",
        severity: "critical",
        title: "Supply Source invariant",
        detail: `${root.canonicalUrl}: ${reason}`,
        at: isoValue(root.lastAssessmentAt ?? root.updatedAt),
        href: adminLink("sources", "source", root.id),
      }),
    );
  });
  rows.gatewayJobs
    .filter((job) =>
      ["PIPELINE_BLOCKED", "RECONCILIATION_REQUIRED"].includes(
        upper(job.status),
      ),
    )
    .forEach((job) =>
      exceptions.push({
        id: `job:${job.id}`,
        kind: "GATEWAY",
        severity:
          upper(job.status) === "PIPELINE_BLOCKED" ? "critical" : "warning",
        title: `Gateway job ${String(job.status).toLowerCase().split("_").join(" ")}`,
        detail: `${job.role} / ${job.subjectId}`,
        at: isoValue(job.updatedAt),
        href: adminLink("jobs", "job", job.id),
      }),
    );
  rows.receipts
    .filter((receipt) => ["FAILED", "UNKNOWN"].includes(upper(receipt.status)))
    .forEach((receipt) => {
      if (receiptRecovered(receipt, recoveryRows)) return;
      exceptions.push({
        id: `receipt:${receipt.id}`,
        kind: "OPERATION",
        severity: upper(receipt.status) === "UNKNOWN" ? "critical" : "warning",
        title: `Gateway operation ${String(receipt.status).toLowerCase()}`,
        detail: `${receipt.operationKind}: ${receipt.safeErrorCode ?? "No error code"}`,
        at: isoValue(receipt.completedAt ?? receipt.updatedAt),
        href: adminLink("jobs", "operation", receipt.id),
      });
    });
  rows.workerHealth
    .filter(
      (worker) =>
        upper(worker.status) !== "HEALTHY" ||
        (dateValue(worker.leaseExpiresAt)?.getTime() ?? 0) <= now.getTime(),
    )
    .forEach((worker) =>
      exceptions.push({
        id: `worker:${worker.id}`,
        kind: "WORKER",
        severity: "critical",
        title: "Worker health exception",
        detail: `${worker.workerId} / ${worker.role}: ${worker.status}`,
        at: isoValue(worker.heartbeatAt),
        href: adminLink("jobs", "worker", worker.id),
      }),
    );
  rows.scrapeRuns
    .filter(
      (run) =>
        upper(run.status) === "FAILED" &&
        !refreshRunRecovered(run, recoveryRows),
    )
    .forEach((run) =>
      exceptions.push({
        id: `scrape:${run.id}`,
        kind: "REFRESH",
        severity: "warning",
        title: "Source refresh failed",
        detail: run.errorMessage ?? "No error message recorded",
        at: isoValue(run.finishedAt ?? run.updatedAt),
        href: adminLink("sources", "scrapeRun", run.id),
      }),
    );
  rows.gatewayEvents
    .filter(
      (event) =>
        upper(event.eventType).includes("FAIL") ||
        upper(event.eventType).includes("ERROR") ||
        event.reasonCodes.length > 0,
    )
    .forEach((event) => {
      if (gatewayEventRecovered(event, recoveryRows)) return;
      exceptions.push({
        id: `event:${event.id}`,
        kind: "EVENT",
        severity: event.reasonCodes.length > 0 ? "warning" : "info",
        title: `Gateway event ${event.eventType}`,
        detail: event.reasonCodes.join(", ") || "Recorded operational event",
        at: isoValue(event.createdAt),
        href: adminLink("jobs", "event", event.id),
      });
    });
  rows.operationalAlerts.forEach((alert) => {
    if (operationalAlertRecovered(alert, recoveryRows, now)) return;
    exceptions.push({
      id: `alert:${alert.id}`,
      kind: "ALERT",
      severity: exceptionSeverityFor(alert.severity),
      title: alert.title,
      detail: alert.detail,
      at: isoValue(alert.createdAt),
      href: adminLinkForOperationalAlert(
        alert,
        recoveryRows,
        "overview",
      ),
    });
  });
  return exceptions
    .sort((left, right) => {
      const timeComparison =
        (dateValue(right.at)?.getTime() ?? 0) -
        (dateValue(left.at)?.getTime() ?? 0);
      return timeComparison || left.id.localeCompare(right.id);
    });
};

const buildPriorityWork = (
  rows: ProjectionRows,
  now: Date,
): PriorityWorkRow[] => {
  const work: PriorityWorkRow[] = [];
  rows.demands
    .filter((demand) => ["OPEN", "PAUSED"].includes(upper(demand.status)))
    .forEach((demand) =>
      work.push({
        id: demand.id,
        kind: "REPLENISHMENT_DEMAND",
        priority: demand.priority,
        title: `Restore ${targetLabel(demand.marketKey, demand.sportId, demand.sourceProfile)}`,
        status: demand.status,
        ageMinutes: ageMinutes(demand.openedAt, now),
        href: adminLink("coverage", undefined, undefined, {
          market: demand.marketKey,
          sport: demand.sportId,
          profile: demand.sourceProfile,
        }),
      }),
    );
  rows.mappingJobs
    .filter((job) => !["COMPLETED", "REJECTED"].includes(upper(job.status)))
    .forEach((job) =>
      work.push({
        id: job.id,
        kind: "MAPPING_JOB",
        priority: 1,
        title: `Mapping handoff ${job.supplySourceId ?? job.intakeId}`,
        status: job.status,
        ageMinutes: ageMinutes(job.createdAt, now),
        href: adminLink("jobs", "job", job.id),
      }),
    );
  rows.approvals
    .filter(
      (job) =>
        !["COMPLETED", "APPROVED", "REJECTED"].includes(upper(job.status)),
    )
    .forEach((job) =>
      work.push({
        id: job.id,
        kind: "REVIEW_CASE",
        priority: 2,
        title: `Review ${job.subjectType}`,
        status: job.status,
        ageMinutes: ageMinutes(job.createdAt, now),
        href: adminLink("review", "review", job.id),
      }),
    );
  return work
    .sort(
      (left, right) =>
        left.priority - right.priority || right.ageMinutes - left.ageMinutes,
    )
    .slice(0, 50);
};
type PublicTargetResolution = Readonly<{
  exists: boolean;
  intrinsicallyVisible: boolean;
  name: string | null;
  organizationId: string | null;
  hrefSuffix: string | null;
}>;

const missingPublicTargetResolution = (): PublicTargetResolution => ({
  exists: false,
  intrinsicallyVisible: false,
  name: null,
  organizationId: null,
  hrefSuffix: null,
});

const publicEventTargetResolution = (
  targetId: string,
  rows: ProjectionRows,
): PublicTargetResolution => {
  const event = rows.canonicalEvents.find((candidate) => candidate.id === targetId);
  if (!event) return missingPublicTargetResolution();
  return {
    exists: true,
    intrinsicallyVisible:
      event.archivedAt === null &&
      (event.state === null || upper(event.state) === "PUBLISHED"),
    name: event.name,
    organizationId: event.organizationId,
    hrefSuffix: `events/${encodeURIComponent(event.id)}`,
  };
};

const publicTeamTargetResolution = (
  targetId: string,
  rows: ProjectionRows,
): PublicTargetResolution => {
  const team = rows.canonicalTeams.find((candidate) => candidate.id === targetId);
  if (!team) return missingPublicTargetResolution();
  return {
    exists: true,
    intrinsicallyVisible: upper(team.visibility) === "PUBLIC",
    name: team.name,
    organizationId: team.organizationId,
    hrefSuffix: `teams/${encodeURIComponent(team.id)}`,
  };
};

const publicFacilityTargetResolution = (
  targetId: string,
  rows: ProjectionRows,
): PublicTargetResolution => {
  const facility = rows.facilities.find(
    (candidate) => candidate.id === targetId,
  );
  if (!facility) return missingPublicTargetResolution();
  return {
    exists: true,
    intrinsicallyVisible: upper(facility.status) === "ACTIVE",
    name: facility.name,
    organizationId: facility.organizationId,
    hrefSuffix: "",
  };
};

const publicOrganizationTargetResolution = (
  targetId: string,
  rows: ProjectionRows,
): PublicTargetResolution => {
  const organization = rows.organizations.find(
    (candidate) => candidate.id === targetId,
  );
  if (!organization) return missingPublicTargetResolution();
  return {
    exists: true,
    intrinsicallyVisible: organization.publicPageEnabled,
    name: organization.name,
    organizationId: organization.id,
    hrefSuffix: "",
  };
};

type PublicTargetResolver = (
  targetId: string,
  rows: ProjectionRows,
) => PublicTargetResolution;

const PUBLIC_TARGET_RESOLVERS: Readonly<
  Record<string, PublicTargetResolver>
> = {
  EVENT: publicEventTargetResolution,
  TEAM: publicTeamTargetResolution,
  FACILITY: publicFacilityTargetResolution,
  ORG: publicOrganizationTargetResolution,
  ORGS: publicOrganizationTargetResolution,
  ORGANIZATION: publicOrganizationTargetResolution,
  ORGANIZATIONS: publicOrganizationTargetResolution,
  ORGANISATION: publicOrganizationTargetResolution,
  ORGANISATIONS: publicOrganizationTargetResolution,
  CLUB: publicOrganizationTargetResolution,
};

const publicTargetResolutionFor = (
  targetType: string,
  targetId: string,
  rows: ProjectionRows,
): PublicTargetResolution | null =>
  PUBLIC_TARGET_RESOLVERS[targetType]?.(targetId, rows) ?? null;

const publicTargetStateFor = (
  resolution: PublicTargetResolution,
  organization: ProjectionRows["organizations"][number] | undefined,
  publicSlug: string | null,
): CoverageTargetRow["publicTargetState"] => {
  if (!resolution.exists) return "MISSING";
  const visible = Boolean(
    resolution.intrinsicallyVisible &&
      organization?.publicPageEnabled &&
      publicSlug,
  );
  if (visible) return "VISIBLE";
  return organization ? "HIDDEN" : "ORGANIZATION_MISSING";
};

const publicTargetHrefFor = (
  resolution: PublicTargetResolution,
  publicSlug: string | null,
): string | null =>
  resolution.exists && publicSlug
    ? `/o/${encodeURIComponent(publicSlug)}${resolution.hrefSuffix ? `/${resolution.hrefSuffix}` : ""}`
    : null;

const preservedPublicTargetHrefFor = (value: unknown): string | null => {
  const href = stringValue(value);
  if (!href || href.length > MAX_PRESERVED_PUBLIC_TARGET_HREF_LENGTH) {
    return null;
  }
  if (href.startsWith("/") && !href.startsWith("//")) {
    try {
      const url = new URL(href, "https://bracket-iq.com");
      if (url.origin !== "https://bracket-iq.com") return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return normalizeExternalHttpUrl(href);
};

type PreservedPublicTargetEvidence = Readonly<{
  name: string | null;
  href: string | null;
}>;

const preservedPublicTargetEvidenceFor = (
  target: ProjectionRows["targets"][number],
): PreservedPublicTargetEvidence => {
  const metadata = recordValue(target.metadata);
  const publicTarget = recordValue(
    metadata.publicTarget ?? metadata.publicTargetEvidence,
  );
  return {
    name: stringValue(
      publicTarget.name
      ?? publicTarget.title
      ?? metadata.publicTargetName
      ?? metadata.publicName
      ?? metadata.targetName,
    ),
    href: preservedPublicTargetHrefFor(
      publicTarget.href
      ?? publicTarget.url
      ?? metadata.publicTargetHref
      ?? metadata.publicHref
      ?? metadata.publicUrl,
    ),
  };
};

const isPreservedPublicTarget = (
  target: ProjectionRows["targets"][number],
): boolean => ["PUBLISHED", "LAST_KNOWN_GOOD"].includes(upper(target.status));

type PublicTargetProjection = Pick<
  CoverageTargetRow,
  | "publicTargetExists"
  | "publicTargetState"
  | "publicTargetName"
  | "publicTargetHref"
>;

const missingPublicTargetProjection = (): PublicTargetProjection => ({
  publicTargetExists: false,
  publicTargetState: "MISSING",
  publicTargetName: null,
  publicTargetHref: null,
});

const lastKnownGoodPublicTargetProjection = (
  targetId: string,
  preserved: PreservedPublicTargetEvidence,
): PublicTargetProjection => ({
  publicTargetExists: true,
  publicTargetState: "LAST_KNOWN_GOOD",
  publicTargetName: preserved.name,
  publicTargetHref: preserved.href,
});

const unsupportedPublicTargetProjection = (): PublicTargetProjection => ({
  publicTargetExists: false,
  publicTargetState: "UNSUPPORTED_TARGET_TYPE",
  publicTargetName: null,
  publicTargetHref: null,
});

const publicTargetProjectionForMissingResolution = (
  targetId: string,
  preserveLastKnownGood: boolean,
  preserved: PreservedPublicTargetEvidence,
): PublicTargetProjection =>
  preserveLastKnownGood
    ? lastKnownGoodPublicTargetProjection(targetId, preserved)
    : unsupportedPublicTargetProjection();

const publicTargetProjectionForResolvedResolution = (
  resolution: PublicTargetResolution,
  rows: ProjectionRows,
  preserved: PreservedPublicTargetEvidence,
  preserveLastKnownGood: boolean,
): PublicTargetProjection => {
  const organization = resolution.organizationId
    ? rows.organizations.find(
        (candidate) => candidate.id === resolution.organizationId,
      )
    : undefined;
  const publicSlug = stringValue(organization?.publicSlug);
  const currentState = publicTargetStateFor(
    resolution,
    organization,
    publicSlug,
  );
  const preserve = preserveLastKnownGood && currentState !== "VISIBLE";
  const publicTargetHref =
    preserve
      ? preserved.href
      : currentState === "VISIBLE"
        ? publicTargetHrefFor(resolution, publicSlug)
        : null;
  return {
    publicTargetExists: resolution.exists || preserve,
    publicTargetState: preserve ? "LAST_KNOWN_GOOD" : currentState,
    publicTargetName: resolution.name ?? preserved.name,
    publicTargetHref,
  };
};

const publicTargetProjection = (
  target: ProjectionRows["targets"][number],
  rows: ProjectionRows,
): PublicTargetProjection => {
  const targetType = upper(target.targetType);
  const targetId = stringValue(target.targetId);
  if (!targetId) return missingPublicTargetProjection();
  const preserveLastKnownGood = isPreservedPublicTarget(target);
  const preserved = preservedPublicTargetEvidenceFor(target);
  const resolution = publicTargetResolutionFor(targetType, targetId, rows);
  if (!resolution) {
    return publicTargetProjectionForMissingResolution(
      targetId,
      preserveLastKnownGood,
      preserved,
    );
  }
  return publicTargetProjectionForResolvedResolution(
    resolution,
    rows,
    preserved,
    preserveLastKnownGood,
  );
};
function targetHasVisiblePublicRecord(
  target: ProjectionRows["targets"][number],
  rows: ProjectionRows,
): boolean {
  return publicTargetProjection(target, rows).publicTargetState === "VISIBLE";
}


const buildCoverage = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): CoverageProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const filteredCells = rows.coverageCells.filter(
    (cell) =>
      cell.cohort === input.contract.rolloutCohort &&
      containsFilter(cell.marketKey, input.filters.market) &&
      containsFilter(cell.cityId, input.filters.city) &&
      (containsFilter(cell.sportName, input.filters.sport) ||
        containsFilter(cell.sportId, input.filters.sport)) &&
      containsFilter(cell.profileKey, input.filters.profile) &&
      containsFilter(cell.coverageStatus, input.filters.status) &&
      matchesDateRange(
        cell.nextReviewAt ?? cell.lastAssessedAt,
        dateRangeCutoff,
      ),
  );
  const cellRows: CoverageCellRow[] = filteredCells
    .map((cell) => ({
      id: cell.id,
      city: cell.cityId,
      marketKey: cell.marketKey,
      sport: cell.sportName || cell.sportId,
      profile: cell.profileKey,
      coverageStatus: cell.coverageStatus,
      searchStatus: cell.searchStatus,
      priorityScore: cell.priorityScore,
      approvedSourceCount: cell.approvedSourceCount,
      unresolvedLeadCount: cell.unresolvedLeadCount,
      nextReviewAt: isoValue(cell.nextReviewAt),
      href: adminLink("coverage", "coverageCell", cell.id, {
        market: cell.marketKey,
        sport: cell.sportId,
        profile: cell.profileKey,
        range: input.filters.range || undefined,
      }),
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore);
  const cellPage = paginate(cellRows, input.page, input.pageSize);
  const dimensionContext = projectionDimensionContext(rows, dateRangeCutoff);
  const rootsBySupplySource = dimensionContext.rootsById;
  const filteredCellIds = new Set(filteredCells.map((cell) => cell.id));
  const demandMatchesDimensions = (
    demand: ProjectionRows["demands"][number],
  ): boolean => {
    if (
      !containsFilter(demand.marketKey, input.filters.market) ||
      !containsFilter(demand.sportId, input.filters.sport) ||
      !containsFilter(demand.sourceProfile, input.filters.profile)
    )
      return false;
    if (!input.filters.city) return true;
    return rows.targets.some(
      (target) =>
        target.marketKey === demand.marketKey &&
        target.sportId === demand.sportId &&
        upper(target.sourceProfile) === upper(demand.sourceProfile) &&
        targetMatchesCity(target, dimensionContext, input.filters.city),
    );
  };
  const demandMatchesFilters = (
    demand: ProjectionRows["demands"][number],
  ): boolean =>
    demandMatchesDimensions(demand) &&
    containsFilter(demand.status, input.filters.status) &&
    matchesDateRange(demand.openedAt ?? demand.updatedAt, dateRangeCutoff);
  const marginalYield: MarginalYieldRow[] = rows.coverageAssessments
    .filter((assessment) => filteredCellIds.has(assessment.cellId))
    .slice(0, 100)
    .map((assessment) => ({
      id: assessment.id,
      cycle: assessment.cycleKey,
      at: isoValue(assessment.createdAt),
      qualifiedSources: assessment.newQualifiedPolicyKeyCount,
      failedQueries: assessment.failedQueryCount,
      unresolvedLeads: assessment.unresolvedLeadCount,
      strategyFamilies:
        assessment.strategyFamilyKeys.join(", ") || "Not recorded",
      href: adminLink("coverage", undefined, undefined, {
        range: assessment.cycleKey,
      }),
    }));
  const targetKeysBySupplySource = new Map<string, Set<string>>();
  rows.targets
    .filter((target) =>
      targetMatchesFilters(target, input.filters, dimensionContext),
    )
    .forEach((target) => {
      const root = rootsBySupplySource.get(target.supplySourceId);
      if (
        !root ||
        root.rolloutCohort !== input.contract.rolloutCohort ||
        (input.contract.contractVersion !== null &&
          root.activeSupplyContractVersion !== input.contract.contractVersion)
      )
        return;
      const keys =
        targetKeysBySupplySource.get(target.supplySourceId) ??
        new Set<string>();
      keys.add(
        targetKey(
          target.marketKey,
          target.sportId,
          target.sourceProfile,
          root.rolloutCohort,
          root.activeSupplyContractVersion,
        ),
      );
      targetKeysBySupplySource.set(target.supplySourceId, keys);
    });
  const demandHistory: DemandHistoryRow[] = [];
  const demandById = new Map(rows.demands.map((demand) => [demand.id, demand]));
  for (let index = 23; index >= 0; index -= 1) {
    const at = new Date(now.getTime() - index * HOUR_MS);
    const next = new Date(at.getTime() + HOUR_MS);
    const openDemands = rows.demands.filter((demand) => {
      if (
        demand.rolloutCohort !== input.contract.rolloutCohort ||
        (input.contract.contractVersion !== null &&
          demand.contractVersion !== input.contract.contractVersion) ||
        !demandMatchesFilters(demand)
      )
        return false;
      const openedAt = dateValue(demand.openedAt);
      const closedAt = dateValue(demand.closedAt);
      return (
        openedAt &&
        openedAt.getTime() <= at.getTime() &&
        (!closedAt || closedAt.getTime() > at.getTime())
      );
    });
    const demandKeys = new Set(
      openDemands.map((demand) =>
        targetKey(
          demand.marketKey,
          demand.sportId,
          demand.sourceProfile,
          demand.rolloutCohort,
          demand.contractVersion,
        ),
      ),
    );
    const campaignStarts = rows.waves.filter((wave) => {
      const startedAt = dateValue(wave.startedAt);
      const demand = demandById.get(wave.demandId);
      return Boolean(
        demand &&
          demandKeys.has(
            targetKey(
              demand.marketKey,
              demand.sportId,
              demand.sourceProfile,
              demand.rolloutCohort,
              demand.contractVersion,
            ),
          ) &&
          startedAt &&
          startedAt.getTime() >= at.getTime() &&
          startedAt.getTime() < next.getTime(),
      );
    }).length;
    const mappingJobsProduced = rows.mappingJobs.filter((job) => {
      const createdAt = dateValue(job.createdAt);
      if (
        !createdAt ||
        createdAt.getTime() < at.getTime() ||
        createdAt.getTime() >= next.getTime() ||
        !job.supplySourceId
      )
        return false;
      const sourceKeys =
        targetKeysBySupplySource.get(job.supplySourceId) ?? new Set<string>();
      return Array.from(sourceKeys).some((key) => demandKeys.has(key));
    }).length;
    const targetRestorations = rows.demands.filter((demand) => {
      const closedAt = dateValue(demand.closedAt);
      return (
        demandMatchesFilters(demand) &&
        closedAt &&
        closedAt.getTime() >= at.getTime() &&
        closedAt.getTime() < next.getTime()
      );
    }).length;
    demandHistory.push({
      id: `demand-history:${at.toISOString()}`,
      at: at.toISOString(),
      openDemand: openDemands.length,
      campaignStarts,
      mappingJobsProduced,
      targetRestorations,
      href: adminLink("coverage", undefined, undefined, { range: "24h" }),
    });
  }
  const targetRows = rows.targets
    .filter((target) => {
      const root = rootsBySupplySource.get(target.supplySourceId);
      return Boolean(
        root &&
          root.rolloutCohort === input.contract.rolloutCohort &&
          (input.contract.contractVersion === null ||
            root.activeSupplyContractVersion ===
              input.contract.contractVersion) &&
          targetMatchesFilters(target, input.filters, dimensionContext),
      );
    })
    .map((target) => ({
      id: target.id,
      targetType: target.targetType,
      targetId: target.targetId,
      marketKey: target.marketKey,
      sportId: target.sportId,
      sourceProfile: target.sourceProfile,
      status: target.status,
      supplySourceId: target.supplySourceId,
      candidateId: target.candidateId,
      freshnessExpiresAt: isoValue(target.freshnessExpiresAt),
      ...publicTargetProjection(target, rows),
      href: adminLink("coverage", "target", target.id),
    }));
  const targetPage = paginate(targetRows, input.targetPage, input.pageSize);
  const campaignRows: CampaignRow[] = rows.campaigns
    .filter(
      (campaign) =>
        containsFilter(
          campaign.location ?? campaign.region,
          input.filters.market,
        ) &&
        matchesDateRange(
          campaign.lastRunAt ?? campaign.updatedAt,
          dateRangeCutoff,
        ) &&
        containsFilter(campaign.sportIds.join(" "), input.filters.sport) &&
        containsFilter(
          campaign.sourceTypeHints.join(" "),
          input.filters.profile,
        ) &&
        containsFilter(campaign.status, input.filters.status),
    )
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      region: campaign.region,
      status: campaign.status,
      lastRunAt: isoValue(campaign.lastRunAt),
      nextRunAt: isoValue(campaign.nextRunAt),
      queryLimit: campaign.maxQueriesPerRun,
      resultLimit: campaign.maxResultsPerQuery,
      href: adminLink("coverage", "campaign", campaign.id),
    }));
  const campaignPage = paginate(
    campaignRows,
    input.campaignPage,
    input.pageSize,
  );
  const discoveryRows: DiscoveryOutcomeRow[] = rows.discoveryQueries
    .filter(
      (query) =>
        containsFilter(
          query.targetCity ?? query.cityGeoid ?? query.targetState,
          input.filters.market,
        ) &&
        matchesDateRange(query.createdAt, dateRangeCutoff) &&
        (containsFilter(query.sportName, input.filters.sport) ||
          containsFilter(query.sportId, input.filters.sport)) &&
        containsFilter(query.profileKey, input.filters.profile) &&
        containsFilter(query.status, input.filters.status),
    )
    .map((query) => ({
      id: query.id,
      at: isoValue(query.createdAt),
      campaignId: query.campaignId,
      query: query.queryText,
      provider: query.provider,
      status: query.status,
      returnedResults: query.returnedResultCount,
      qualifiedSources: query.newQualifiedPolicyKeyCount,
      intakesCreated: query.intakeCreatedCount,
      failed: query.status.toUpperCase().includes("FAIL")
        ? 1
        : query.errorCode
          ? 1
          : 0,
      href: adminLink("coverage", "discoveryQuery", query.id),
    }));
  const discoveryPage = paginate(
    discoveryRows,
    input.discoveryPage,
    input.pageSize,
  );
  const saturated = filteredCells.filter((cell) =>
    upper(cell.searchStatus).includes("SATUR"),
  ).length;
  const eligible = filteredCells.filter(
    (cell) =>
      ["READY", "STALE"].includes(upper(cell.searchStatus)) &&
      upper(cell.coverageStatus) !== "COVERED" &&
      (!(cell.nextReviewAt instanceof Date) || cell.nextReviewAt <= now) &&
      cell.unresolvedLeadCount === 0,
  ).length;
  const unresolved = filteredCells.reduce(
    (sum, cell) => sum + cell.unresolvedLeadCount,
    0,
  );
  return {
    cells: cellPage,
    targets: targetPage.rows,
    targetPage: targetPage.page,
    targetPageSize: targetPage.pageSize,
    targetTotal: targetPage.total,
    campaigns: campaignPage.rows,
    campaignPage: campaignPage.page,
    campaignPageSize: campaignPage.pageSize,
    campaignTotal: campaignPage.total,
    discoveryOutcomes: discoveryPage.rows,
    discoveryPage: discoveryPage.page,
    discoveryPageSize: discoveryPage.pageSize,
    discoveryTotal: discoveryPage.total,
    marginalYield,
    demandHistory,
    saturation: {
      saturated,
      eligible,
      unresolved,
    },
  };
};

const refreshClassValue = (...values: readonly unknown[]): string | null => {
  for (const value of values) {
    const metadata = recordValue(value);
    const refreshClass = stringValue(
      metadata.refreshClass ?? metadata.refreshType ?? metadata.refreshMode,
    );
    if (refreshClass) return upper(refreshClass);
  }
  return null;
};

type GatewayJobRowContext = Readonly<{
  claimsById: ReadonlyMap<
    string,
    ProjectionRows["gatewayClaims"][number]
  >;
  claimsByJob: ReadonlyMap<string, ProjectionRows["gatewayClaims"]>;
  receiptsByJob: ReadonlyMap<string, ProjectionRows["receipts"]>;
  eventsByJob: ReadonlyMap<string, ProjectionRows["gatewayEvents"]>;
}>;

const gatewayJobClaimFor = (
  job: ProjectionRows["gatewayJobs"][number],
  context: GatewayJobRowContext,
): ProjectionRows["gatewayClaims"][number] | undefined =>
  valueForId(job.activeClaimId, context.claimsById) ??
  context.claimsByJob.get(job.id)?.[0];

const gatewayJobInvocationFor = (
  claim: ProjectionRows["gatewayClaims"][number] | undefined,
  receipt: ProjectionRows["receipts"][number] | undefined,
): string | null =>
  claim?.invocationId ??
  receipt?.commandName ??
  receipt?.operationKind ??
  null;

const gatewayJobTransitionFor = (
  events: readonly ProjectionRows["gatewayEvents"][number][],
): string | null =>
  events.length > 0
    ? events
        .slice(0, 3)
        .map((event) => String(event.eventType))
        .join(" → ")
    : null;

const gatewayJobFailureFor = (
  job: ProjectionRows["gatewayJobs"][number],
): string | null =>
  job.terminalDisposition ??
  (job.pipelineBlockedAt ? "PIPELINE_BLOCKED" : null);

const gatewayJobRowFor = (
  job: ProjectionRows["gatewayJobs"][number],
  context: GatewayJobRowContext,
  now: Date,
): JobRow => {
  const claim = gatewayJobClaimFor(job, context);
  const receipts = context.receiptsByJob.get(job.id) ?? [];
  const events = context.eventsByJob.get(job.id) ?? [];
  const subject = recordValue(job.subjectJson);
  const receipt = receipts[0];
  return {
    id: job.id,
    kind: "GATEWAY",
    queue: job.queue,
    lane: job.lane,
    role: job.role,
    subjectId: job.subjectId,
    status: String(job.status),
    ageMinutes: ageMinutes(job.createdAt, now),
    retries: job.invocationFailureCount,
    failure: gatewayJobFailureFor(job),
    workerId: claim?.workerId ?? null,
    lineage: job.supplySourceId ?? job.parentClaimId ?? job.subjectId,
    provider: providerValue(subject, job.evidenceManifestJson, receipt),
    refreshClass: refreshClassValue(subject, job.evidenceManifestJson),
    invocation: gatewayJobInvocationFor(claim, receipt),
    transition: gatewayJobTransitionFor(events),
    href: adminLink("jobs", "job", job.id),
  };
};

const buildJobRows = (
  rows: ProjectionRows,
  now: Date,
  filters: AffiliateOperationsFilters,
): JobRow[] => {
  const jobs: JobRow[] = [];
  const claimsById = new Map(
    rows.gatewayClaims.map((claim) => [claim.id, claim]),
  );
  const claimsByJob = new Map<string, ProjectionRows["gatewayClaims"]>();
  const receiptsByJob = new Map<string, ProjectionRows["receipts"]>();
  const eventsByJob = new Map<string, ProjectionRows["gatewayEvents"]>();
  rows.gatewayClaims.forEach((claim) => {
    const claims = claimsByJob.get(claim.jobId) ?? [];
    claims.push(claim);
    claimsByJob.set(claim.jobId, claims);
  });
  rows.receipts.forEach((receipt) => {
    const receipts = receiptsByJob.get(receipt.jobId) ?? [];
    receipts.push(receipt);
    receiptsByJob.set(receipt.jobId, receipts);
  });
  rows.gatewayEvents.forEach((event) => {
    const events = eventsByJob.get(event.jobId) ?? [];
    events.push(event);
    eventsByJob.set(event.jobId, events);
  });
  const discoveryProvidersByRun = new Map<string, string[]>();
  rows.discoveryQueries.forEach((query) => {
    const providers = discoveryProvidersByRun.get(query.runId) ?? [];
    if (query.provider) providers.push(query.provider);
    discoveryProvidersByRun.set(query.runId, providers);
  });
  const captureProvidersByRun = new Map(
    rows.intakeRuns.map((run) => [run.id, run.provider]),
  );
  const refreshProvidersByRun = new Map(
    rows.scrapeRuns.map((run) => [
      run.id,
      providerValue(run.metadata, run.logs),
    ]),
  );
  rows.discoveryRuns.forEach((run) => {
    const providers = discoveryProvidersByRun.get(run.id) ?? [];
    const summaryProvider = providerValue(run.summary);
    if (summaryProvider) providers.push(summaryProvider);
    discoveryProvidersByRun.set(run.id, providers);
  });
  const mappingProvidersByJob = new Map(
    rows.mappingJobs.map((job) => [job.id, providerValue(job.resultSummary)]),
  );
  const reviewProvidersByJob = new Map(
    rows.approvals.map((job) => [job.id, providerValue(job.decision)]),
  );
  const coverageProvidersByJob = new Map(
    rows.coverageJobs.map((job) => [job.id, providerValue(job.result)]),
  );

  const gatewayJobContext: GatewayJobRowContext = {
    claimsById,
    claimsByJob,
    receiptsByJob,
    eventsByJob,
  };
  claimsByJob.forEach((claims) => {
    claims.sort(
      (left, right) =>
        (dateValue(right.claimedAt)?.getTime() ?? 0) -
        (dateValue(left.claimedAt)?.getTime() ?? 0),
    );
  });
  rows.gatewayJobs.forEach((job) =>
    jobs.push(gatewayJobRowFor(job, gatewayJobContext, now)),
  );
  rows.mappingJobs.forEach((job) =>
    jobs.push({
      id: job.id,
      kind: "MAPPING",
      queue: "MAPPING",
      lane: "MAPPING_PRODUCER",
      role: "MAPPING_PRODUCER",
      subjectId: job.supplySourceId ?? job.intakeId,
      status: job.status,
      ageMinutes: ageMinutes(job.createdAt, now),
      retries: job.attemptCount,
      failure: job.errorMessage,
      provider: mappingProvidersByJob.get(job.id) ?? null,
      refreshClass: refreshClassValue(job.resultSummary),
      invocation: null,
      transition: null,
      workerId: job.workerId,
      lineage: job.supplySourceId ?? job.intakeId,
      href: adminLink("jobs", "job", job.id),
    }),
  );
  rows.approvals.forEach((job) =>
    jobs.push({
      id: job.id,
      kind: "REVIEW",
      queue: "REVIEW",
      lane: "SUPPLY_REVIEWER",
      role: "SUPPLY_REVIEWER",
      subjectId: job.supplySourceId ?? job.subjectKey,
      status: job.status,
      ageMinutes: ageMinutes(job.createdAt, now),
      retries: job.attemptCount,
      failure: job.errorMessage,
      provider: reviewProvidersByJob.get(job.id) ?? null,
      refreshClass: refreshClassValue(job.decision),
      invocation: null,
      transition: null,
      workerId: job.reviewerId,
      lineage: job.supplySourceId ?? job.subjectKey,
      href: adminLink("jobs", "job", job.id),
    }),
  );
  rows.coverageJobs.forEach((job) =>
    jobs.push({
      id: job.id,
      kind: "COVERAGE",
      queue: "COVERAGE",
      lane: "COVERAGE_PLANNER",
      role: "COVERAGE_PLANNER",
      subjectId: job.subjectKey,
      status: job.status,
      ageMinutes: ageMinutes(job.createdAt, now),
      retries: job.attemptCount,
      failure: job.errorMessage,
      provider: coverageProvidersByJob.get(job.id) ?? null,
      refreshClass: refreshClassValue(job.context, job.result),
      invocation: null,
      transition: null,
      workerId: job.workerId,
      lineage: job.subjectKey,
      href: adminLink("jobs", "job", job.id),
    }),
  );
  rows.intakeRuns.forEach((run) =>
    jobs.push({
      id: run.id,
      kind: "CAPTURE",
      queue: "SOURCE_INTAKE",
      lane: "SOURCE_INTAKE",
      role: "GATEWAY",
      subjectId: run.supplySourceId ?? run.intakeId,
      status: run.status,
      ageMinutes: ageMinutes(run.queuedAt, now),
      retries: run.attemptCount,
      failure: run.errorMessage,
      provider: run.provider,
      refreshClass: refreshClassValue(run.summary),
      invocation: null,
      transition: null,
      workerId: run.workerId,
      lineage: run.supplySourceId ?? run.intakeId,
      href: adminLink("jobs", "job", run.id),
    }),
  );
  rows.discoveryRuns.forEach((run) =>
    jobs.push({
      id: run.id,
      kind: "DISCOVERY",
      queue: "DISCOVERY",
      lane: "COVERAGE_PLANNER",
      role: "GATEWAY",
      subjectId: run.campaignId,
      status: run.status,
      ageMinutes: ageMinutes(run.queuedAt, now),
      retries: run.attemptCount,
      failure: run.errorMessage,
      provider: providerValue(discoveryProvidersByRun.get(run.id)),
      refreshClass: refreshClassValue(run.summary),
      invocation: null,
      transition: null,
      workerId: run.workerId,
      lineage: run.campaignId,
      href: adminLink("jobs", "job", run.id),
    }),
  );
  rows.scrapeRuns.forEach((run) =>
    jobs.push({
      id: run.id,
      kind: "REFRESH",
      queue: "SOURCE_REFRESH",
      lane: "SOURCE_REFRESH",
      role: "GATEWAY",
      subjectId: run.supplySourceId ?? run.sourceId,
      status: run.status,
      ageMinutes: ageMinutes(run.startedAt ?? run.createdAt, now),
      retries: 0,
      failure: run.errorMessage,
      provider: refreshProvidersByRun.get(run.id) ?? null,
      refreshClass: refreshClassValue(run.metadata) ?? "SOURCE_REFRESH",
      invocation: null,
      transition: null,
      workerId: null,
      lineage: run.supplySourceId ?? run.sourceId,
      href: adminLink("jobs", "job", run.id),
    }),
  );
  return jobs
    .filter((job) => {
      const rangeMinutes =
        filters.range === "24h"
          ? 1_440
          : filters.range === "7d"
            ? 10_080
            : filters.range === "30d"
              ? 43_200
              : null;
      return (
        containsFilter(job.lane, filters.lane) &&
        containsFilter(job.role, filters.role) &&
        containsFilter(job.status, filters.status) &&
        containsFilter(job.failure, filters.reason) &&
        (rangeMinutes === null || job.ageMinutes <= rangeMinutes)
      );
    })
    .sort(
      (left, right) =>
        right.ageMinutes - left.ageMinutes || left.id.localeCompare(right.id),
    );
};

const buildAgeBands = (jobs: readonly JobRow[]): JobsProjection["ageBands"] => {
  const labels = ["<15m", "15–60m", "1–4h", "4–24h", ">24h"];
  return labels.map((band) => ({
    band,
    count: jobs.filter(
      (job) =>
        ageBandFor(job.ageMinutes) === band && isWaitingStatus(job.status),
    ).length,
    description: `Queued or active work aged ${band}; this is a descriptive value, not a health claim.`,
  }));
};
const buildAgeByLane = (
  jobs: readonly JobRow[],
): JobsProjection["ageByLane"] => {
  const lanes = Array.from(new Set(jobs.map((job) => job.lane))).sort();
  const labels = ["<15m", "15–60m", "1–4h", "4–24h", ">24h"];
  return lanes.map((lane) => ({
    lane,
    bands: labels.map((band) => ({
      band,
      count: jobs.filter(
        (job) =>
          job.lane === lane &&
          ageBandFor(job.ageMinutes) === band &&
          isWaitingStatus(job.status),
      ).length,
      description: `Queued or active ${lane} work aged ${band}; this is a descriptive value, not a health claim.`,
    })),
  }));
};

const buildFailurePareto = (jobs: readonly JobRow[]): FailureParetoRow[] => {
  const grouped = new Map<
    string,
    { count: number; reason: string; refreshClass: string }
  >();
  jobs
    .filter((job) => job.failure)
    .forEach((job) => {
      const reason = job.failure ?? "Unknown failure";
      const refreshClass = job.refreshClass ?? job.kind;
      const key = JSON.stringify([refreshClass, reason]);
      const current = grouped.get(key) ?? { count: 0, reason, refreshClass };
      current.count += 1;
      grouped.set(key, current);
    });
  return Array.from(grouped.values())
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.reason.localeCompare(right.reason) ||
        left.refreshClass.localeCompare(right.refreshClass),
    )
    .slice(0, 25);
};

const buildWorkers = (rows: ProjectionRows, now: Date): WorkerHealthRow[] =>
  rows.workerHealth.map((worker) => {
    const leaseExpiresAt = dateValue(worker.leaseExpiresAt);
    const heartbeatAt = dateValue(worker.heartbeatAt);
    const isHealthy =
      upper(worker.status) === "HEALTHY" &&
      Boolean(leaseExpiresAt && leaseExpiresAt.getTime() > now.getTime());
    return {
      id: worker.id,
      workerId: worker.workerId,
      role: worker.role,
      status: worker.status,
      heartbeatAt: heartbeatAt?.toISOString() ?? null,
      leaseExpiresAt: leaseExpiresAt?.toISOString() ?? null,
      isHealthy,
      href: adminLink("jobs", undefined, undefined, { role: worker.role }),
    };
  });

const buildJobs = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): JobsProjection => {
  const allJobs = buildJobRows(rows, now, input.filters);
  const page = paginate(allJobs, input.page, input.pageSize);
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    ageBands: buildAgeBands(allJobs),
    ageByLane: buildAgeByLane(allJobs),
    failures: buildFailurePareto(allJobs),
    workers: buildWorkers(rows, now),
  };
};
const buildIntakes = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): IntakeProjection => {
  const pagesByIntake = new Map<string, number>();
  rows.pages.forEach((page) =>
    pagesByIntake.set(
      page.intakeId,
      (pagesByIntake.get(page.intakeId) ?? 0) + 1,
    ),
  );
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const artifactsByIntake = new Map<string, number>();
  rows.artifacts.forEach((artifact) =>
    artifactsByIntake.set(
      artifact.intakeId,
      (artifactsByIntake.get(artifact.intakeId) ?? 0) + 1,
    ),
  );
  const capturesByIntake = new Map<string, number>();
  rows.intakeRuns.forEach((run) =>
    capturesByIntake.set(
      run.intakeId,
      (capturesByIntake.get(run.intakeId) ?? 0) + run.capturedPageCount,
    ),
  );
  const mappingByIntake = new Map<
    string,
    ProjectionRows["mappingJobs"][number]
  >();
  rows.mappingJobs.forEach((job) => {
    if (!mappingByIntake.has(job.intakeId))
      mappingByIntake.set(job.intakeId, job);
  });
  const latestRunByIntake = new Map<
    string,
    ProjectionRows["intakeRuns"][number]
  >();
  rows.intakeRuns.forEach((run) => {
    if (!latestRunByIntake.has(run.intakeId))
      latestRunByIntake.set(run.intakeId, run);
  });
  const intakeRows: IntakeRow[] = rows.intakes
    .filter(
      (intake) =>
        containsFilter(intake.name, input.filters.city) &&
        containsFilter(intake.sourceKey, input.filters.profile) &&
        matchesDateRange(
          intake.updatedAt ?? intake.createdAt,
          dateRangeCutoff,
        ) &&
        containsFilter(intake.complianceStatus, input.filters.reason),
    )
    .map((intake) => ({
      id: intake.id,
      name: intake.name,
      sourceKey: intake.sourceKey,
      status: intake.status,
      complianceStatus: intake.complianceStatus,
      region: intake.region,
      supplySourceId: intake.supplySourceId,
      pageCount: pagesByIntake.get(intake.id) ?? 0,
      captureCount: capturesByIntake.get(intake.id) ?? 0,
      artifactCount: artifactsByIntake.get(intake.id) ?? 0,
      mappingJobId: mappingByIntake.get(intake.id)?.id ?? null,
      latestRunStatus: latestRunByIntake.get(intake.id)?.status ?? null,
      href: adminLink("intake", "intake", intake.id),
    }));
  const page = paginate(intakeRows, input.page, input.pageSize);
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
};

const buildReviews = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): ReviewProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const reviewRows: ReviewRow[] = rows.approvals.map((job) => {
    const decision = recordValue(job.decision);
    const caseType = upper(decision.decision ?? job.subjectType)
      .split("_")
      .join(" ");
    const evidence = stringList(
      decision.evidenceRefs ?? decision.candidateReviewEvidenceRefs,
    );
    return {
      id: job.id,
      caseType: caseType || "HUMAN REVIEW",
      subjectId: job.supplySourceId ?? job.subjectKey,
      status: job.status,
      reviewerId: job.reviewerId,
      packageHash: stringValue(decision.packageHash),
      evidenceCount: evidence.length,
      reason: stringValue(decision.reasonCode) ?? job.errorMessage,
      createdAt: isoValue(job.createdAt),
      href: adminLink("review", "review", job.id),
      detailType: "review",
      detailId: job.id,
    };
  });
  rows.gatewayJobs
    .filter((job) => upper(job.role) === "SUPPLY_REVIEWER")
    .forEach((job) =>
      reviewRows.push({
        id: job.id,
        caseType: upper(job.subjectType).split("_").join(" ") || "HUMAN REVIEW",
        subjectId: job.supplySourceId ?? job.subjectId,
        status: String(job.status),
        reviewerId:
          rows.gatewayClaims.find((claim) => claim.id === job.activeClaimId)
            ?.workerId ?? null,
        packageHash: stringValue(recordValue(job.subjectJson).packageHash),
        evidenceCount: stringList(
          recordValue(job.evidenceManifestJson).evidenceRefs,
        ).length,
        reason: job.terminalDisposition,
        createdAt: isoValue(job.createdAt),
        href: adminLink("review", "review", job.id),
        detailType: "job",
        detailId: job.id,
      }),
    );
  rows.transitions
    .filter((transition) =>
      [
        "HUMAN_REVIEW_REQUIRED",
        "TARGET_REJECTED",
        "SOURCE_EXCLUDED",
        "REPAIR_REQUIRED",
        "AUTOMATION_HOLD",
      ].includes(upper(transition.outcome)),
    )
    .forEach((transition) =>
      reviewRows.push({
        id: transition.id,
        caseType: upper(String(transition.outcome)).split("_").join(" "),
        subjectId: transition.supplySourceId,
        status: String(transition.toStage),
        reviewerId: transition.actorId,
        packageHash: null,
        evidenceCount: transition.evidenceRefs.length,
        reason: transition.reasonCodes.join(", ") || null,
        createdAt: isoValue(transition.occurredAt),
        href: adminLink("review", "transition", transition.id),
        detailType: "transition",
        detailId: transition.id,
      }),
    );
  const filtered = reviewRows
    .filter(
      (review) =>
        containsFilter(review.caseType, input.filters.role) &&
        containsFilter(review.status, input.filters.status) &&
        matchesDateRange(review.createdAt, dateRangeCutoff) &&
        containsFilter(review.reason, input.filters.reason),
    )
    .sort(
      (left, right) =>
        (dateValue(right.createdAt)?.getTime() ?? 0) -
        (dateValue(left.createdAt)?.getTime() ?? 0),
    );
  const page = paginate(filtered, input.page, input.pageSize);
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
};

type FreshnessRollupContext = Readonly<{
  rows: ProjectionRows;
  rootsById: ReadonlyMap<string, ProjectionRows["roots"][number]>;
  latestRunBySource: ReadonlyMap<string, string>;
  freshnessBySource: Map<string, string>;
  freshnessByKey: Map<string, CoverageMovementRow>;
  refreshClassFor: (
    run: ProjectionRows["scrapeRuns"][number],
    sourceKey: string,
  ) => string;
}>;

type FreshnessRunState = Readonly<{
  sourceKey: string;
  status: string;
  previous: string;
  next: string;
  restored: boolean;
  lost: boolean;
  label: string;
  direction: string;
  reason: string | null;
  refreshClass: string;
  at: string | null;
}>;

const freshnessNextStatusFor = (
  run: ProjectionRows["scrapeRuns"][number],
  status: string,
  previous: string,
  currentRoot: ProjectionRows["roots"][number] | undefined,
  isLatest: boolean,
): string => {
  const metadata = recordValue(run.metadata);
  const explicitNext = upper(stringValue(metadata.nextFreshnessStatus));
  if (explicitNext) return explicitNext;
  if (isSuccessfulRefreshStatus(status)) return "FRESH";
  if (
    isLatest &&
    currentRoot &&
    upper(currentRoot.freshnessStatus) !== "FRESH"
  ) {
    return upper(currentRoot.freshnessStatus);
  }
  return previous;
};

const freshnessLabelFor = (
  status: string,
  restored: boolean,
  lost: boolean,
): string => {
  if (restored) return "Freshness restored";
  if (lost) return "Freshness lost";
  if (status.includes("FAIL")) return "Refresh failed";
  if (isSuccessfulRefreshStatus(status)) return "Refresh succeeded";
  return `Refresh ${status}`;
};

const freshnessSourceKeyFor = (
  run: ProjectionRows["scrapeRuns"][number],
  context: FreshnessRollupContext,
): string =>
  rootIdForSource(context.rows, run.supplySourceId ?? run.sourceId) ??
  run.sourceId;

const freshnessPreviousStatusFor = (
  metadata: Record<string, unknown>,
  sourceKey: string,
  context: FreshnessRollupContext,
): string =>
  upper(stringValue(metadata.previousFreshnessStatus)) ||
  context.freshnessBySource.get(sourceKey) ||
  "UNKNOWN";

const freshnessTransitionFlagsFor = (
  explicitTransition: string | null,
  previous: string,
  next: string,
): Readonly<{ restored: boolean; lost: boolean }> => ({
  restored:
    explicitTransition === "RESTORED" ||
    (previous === "STALE" && next === "FRESH"),
  lost:
    explicitTransition === "LOST" ||
    (previous === "FRESH" && next === "STALE"),
});

const freshnessDirectionFor = (
  restored: boolean,
  lost: boolean,
): string => (restored ? "restored" : lost ? "loss" : "observed");

const freshnessRunStateFor = (
  run: ProjectionRows["scrapeRuns"][number],
  context: FreshnessRollupContext,
): FreshnessRunState => {
  const sourceKey = freshnessSourceKeyFor(run, context);
  const status = upper(run.status);
  const metadata = recordValue(run.metadata);
  const explicitTransition = upper(stringValue(metadata.freshnessTransition));
  const previous = freshnessPreviousStatusFor(metadata, sourceKey, context);
  const currentRoot = context.rootsById.get(sourceKey);
  const isLatest = context.latestRunBySource.get(sourceKey) === run.id;
  const next = freshnessNextStatusFor(
    run,
    status,
    previous,
    currentRoot,
    isLatest,
  );
  const { restored, lost } = freshnessTransitionFlagsFor(
    explicitTransition,
    previous,
    next,
  );
  return {
    sourceKey,
    status,
    previous,
    next,
    restored,
    lost,
    label: freshnessLabelFor(status, restored, lost),
    direction: freshnessDirectionFor(restored, lost),
    reason: run.errorMessage,
    refreshClass: context.refreshClassFor(run, sourceKey),
    at: isoValue(run.finishedAt ?? run.updatedAt),
  };
};

const recordFreshnessRun = (
  run: ProjectionRows["scrapeRuns"][number],
  context: FreshnessRollupContext,
): void => {
  const state = freshnessRunStateFor(run, context);
  context.freshnessBySource.set(state.sourceKey, state.next);
  const rollupBucket = Math.floor(
    (dateValue(state.at)?.getTime() ?? 0) / ROLLUP_MS,
  );
  const groupKey = JSON.stringify([
    rollupBucket,
    state.refreshClass,
    state.label,
    state.direction,
    state.reason ?? "",
  ]);
  const current = context.freshnessByKey.get(groupKey);
  if (current) {
    const currentTime = dateValue(current.at)?.getTime() ?? 0;
    const stateTime = dateValue(state.at)?.getTime() ?? 0;
    context.freshnessByKey.set(groupKey, {
      ...current,
      at: stateTime > currentTime ? state.at : current.at,
      count: current.count + 1,
      href: adminLink("sources", "source", state.sourceKey),
    });
    return;
  }
  context.freshnessByKey.set(groupKey, {
    id: `freshness:${createHash("sha1").update(groupKey).digest("hex").slice(0, 16)}`,
    at: state.at,
    label: state.label,
    direction: state.direction,
    count: 1,
    refreshClass: state.refreshClass,
    reason: state.reason,
    href: adminLink("sources", "source", state.sourceKey),
  });
};

const buildSources = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): SourcesProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const sourceById = new Map(rows.sources.map((source) => [source.id, source]));
  const rootIdForSourceRow = (
    sourceId: string | null | undefined,
  ): string | null =>
    sourceId
      ? (rows.roots.find((root) => root.liveSourceId === sourceId)?.id ?? null)
      : null;
  const sourceByRoot = new Map<string, ProjectionRows["sources"][number]>();
  rows.sources.forEach((source) => {
    const rootId = source.supplySourceId ?? rootIdForSourceRow(source.id);
    if (rootId) sourceByRoot.set(rootId, source);
  });
  const mappingByRoot = new Map<string, ProjectionRows["mappings"][number]>();
  rows.mappings.forEach((mapping) => {
    const rootId =
      mapping.supplySourceId ??
      (mapping.sourceId
        ? (sourceById.get(mapping.sourceId)?.supplySourceId ??
          rootIdForSourceRow(mapping.sourceId))
        : null);
    if (rootId && !mappingByRoot.has(rootId))
      mappingByRoot.set(rootId, mapping);
  });
  const dimensionContext = projectionDimensionContext(rows, dateRangeCutoff);
  const targetCountByRoot = new Map<string, number>();
  rows.targets
    .filter((target) =>
      targetMatchesFilters(target, input.filters, dimensionContext),
    )
    .forEach((target) => {
      targetCountByRoot.set(
        target.supplySourceId,
        (targetCountByRoot.get(target.supplySourceId) ?? 0) + 1,
      );
    });
  const sourceRows: SourceRow[] = rows.roots
    .filter(
      (root) =>
        rootMatchesFilters(root, input.filters, dimensionContext) &&
        containsFilter(
          root.invariantViolations.join(" "),
          input.filters.reason,
        ),
    )
    .map((root) => ({
      id: root.id,
      canonicalUrl: root.canonicalUrl,
      operatorDomain: root.operatorDomain,
      predecessorId: root.predecessorId,
      successorId: root.successorId,
      lifecycleStage: String(root.derivedStage),
      outcome: root.derivedOutcome,
      freshness: root.freshnessStatus,
      isAutomationEnabled: root.isAutomationEnabled,
      isExcluded: root.isExcluded,
      holdReason: root.automationHoldReason,
      lifecycleGeneration: root.lifecycleGeneration,
      targetContribution: root.targetContribution,
      organizationId: sourceByRoot.get(root.id)?.organizationId ?? null,
      intakeId: root.intakeId,
      liveSourceId: root.liveSourceId,
      mappingId:
        mappingByRoot.get(root.id)?.id ??
        sourceByRoot.get(root.id)?.activeMappingId ??
        null,
      targetCount: targetCountByRoot.get(root.id) ?? 0,
      lastSuccessfulRefreshAt: isoValue(root.lastSuccessfulRefreshAt),
      invariantViolations: root.invariantViolations,
      href: adminLink("sources", "source", root.id),
    }));
  const lifecycleOrder = [
    "PRE_MAPPED",
    "MAPPED",
    "APPROVED",
    "ACTIVATED",
    "PUBLISHED",
  ];
  const lifecycleMovement: CoverageMovementRow[] = rows.transitions
    .filter((transition) => {
      const root = dimensionContext.rootsById.get(transition.supplySourceId);
      return Boolean(
        root &&
          rootMatchesFilters(root, input.filters, dimensionContext) &&
          containsFilter(transition.toStage, input.filters.status) &&
          matchesDateRange(transition.occurredAt, dateRangeCutoff),
      );
    })
    .slice(0, 100)
    .map((transition) => {
      const from = transition.fromStage
        ? String(transition.fromStage)
        : "Not recorded";
      const to = String(transition.toStage);
      const fromIndex = lifecycleOrder.indexOf(from);
      const toIndex = lifecycleOrder.indexOf(to);
      return {
        id: transition.id,
        at: isoValue(transition.occurredAt),
        label: `${from} → ${to}`,
        direction:
          fromIndex < 0 || toIndex >= fromIndex ? "forward" : "regressive",
        count: 1,
        refreshClass: String(transition.command),
        reason: transition.reasonCodes.join(", ") || null,
        href: adminLink("sources", "source", transition.supplySourceId),
      };
    });
  const freshnessRuns = rows.scrapeRuns
    .filter((run) => {
      const rootId = rootIdForSource(rows, run.supplySourceId ?? run.sourceId);
      const root = rootId ? dimensionContext.rootsById.get(rootId) : undefined;
      return Boolean(
        root &&
          rootMatchesFilters(root, input.filters, dimensionContext) &&
          containsFilter(run.status, input.filters.status) &&
          matchesDateRange(
            run.finishedAt ?? run.updatedAt ?? run.createdAt,
            dateRangeCutoff,
          ),
      );
    })
    .sort(
      (left, right) =>
        (dateValue(
          left.finishedAt ?? left.updatedAt ?? left.createdAt,
        )?.getTime() ?? 0) -
        (dateValue(
          right.finishedAt ?? right.updatedAt ?? right.createdAt,
        )?.getTime() ?? 0),
    );
  const latestRunBySource = new Map<string, string>();
  freshnessRuns.forEach((run) => {
    const sourceKey =
      rootIdForSource(rows, run.supplySourceId ?? run.sourceId) ?? run.sourceId;
    latestRunBySource.set(sourceKey, run.id);
  });
  const freshnessBySource = new Map<string, string>();
  const freshnessByKey = new Map<string, CoverageMovementRow>();
  const refreshClassFor = (
    run: ProjectionRows["scrapeRuns"][number],
    _sourceKey: string,
  ): string =>
    refreshClassValue(run.metadata) ?? "SOURCE_REFRESH";
  const freshnessContext: FreshnessRollupContext = {
    rows,
    rootsById: dimensionContext.rootsById,
    latestRunBySource,
    freshnessBySource,
    freshnessByKey,
    refreshClassFor,
  };
  freshnessRuns.forEach((run) => recordFreshnessRun(run, freshnessContext));
  const freshnessMovement: CoverageMovementRow[] = Array.from(
    freshnessByKey.values(),
  )
    .sort(
      (left, right) =>
        (dateValue(right.at)?.getTime() ?? 0) -
        (dateValue(left.at)?.getTime() ?? 0),
    )
    .slice(0, 100);
  const page = paginate(sourceRows, input.page, input.pageSize);
  return {
    rows: page.rows,
    lifecycleMovement,
    freshnessMovement,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
};
const publishedTargetIdFor = (
  candidate: ProjectionRows["candidates"][number],
): string | null =>
  candidate.publishedEventId ??
  candidate.publishedTeamId ??
  candidate.publishedFacilityId ??
  candidate.publishedOrganizationId ??
  null;

const buildCandidates = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
): { candidates: CandidatesProjection } => {
  const dateRangeCutoff = dateRangeCutoffFor(input.filters.range, now);
  const targetByCandidate = new Map(
    rows.targets
      .filter((target) => target.candidateId)
      .map((target) => [target.candidateId as string, target]),
  );
  const candidateRows: CandidateRow[] = rows.candidates
    .filter(
      (candidate) =>
        (containsFilter(candidate.city, input.filters.city) ||
          containsFilter(candidate.title, input.filters.city)) &&
        containsFilter(candidate.listingKind, input.filters.profile) &&
        containsFilter(candidate.status, input.filters.status) &&
        containsFilter(candidate.sportName, input.filters.sport) &&
        matchesDateRange(
          candidate.startsAt ?? candidate.createdAt,
          dateRangeCutoff,
        ),
    )
    .map((candidate) => {
      const target = targetByCandidate.get(candidate.id);
      return {
        id: candidate.id,
        title: candidate.title,
        listingKind: candidate.listingKind,
        status: candidate.status,
        sourceId: candidate.sourceId,
        supplySourceId: candidate.supplySourceId,
        runId: candidate.runId,
        targetId: target?.targetId ?? publishedTargetIdFor(candidate),
        targetStatus: target?.status ?? null,
        rejectionReason: target?.rejectionReason ?? null,
        freshnessExpiresAt: isoValue(target?.freshnessExpiresAt),
        city: candidate.city,
        sport: candidate.sportName,
        startsAt: isoValue(candidate.startsAt),
        href: adminLink("candidates", "candidate", candidate.id),
      };
    });
  const page = paginate(candidateRows, input.page, input.pageSize);
  return {
    candidates: {
      rows: page.rows,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
    },
  };
};

const field = (
  label: string,
  value: unknown,
  href?: string | null,
): ProjectionField => ({
  label,
  value: formatValue(value),
  href: href ?? null,
});

// Persisted by scheduledScrapes.storeLightweightState into affiliateScrapeSources.metadata.
const LIGHTWEIGHT_CHECK_METADATA_KEY = "dailyLightweightCheck";

const lightweightCheckHistoryForSource = (
  rows: ProjectionRows,
  sourceId: string,
): ProjectionHistoryRow[] => {
  const liveSourceId = rows.roots.find(
    (root) => root.id === sourceId,
  )?.liveSourceId;
  const liveSource = liveSourceId
    ? rows.sources.find((item) => item.id === liveSourceId)
    : null;
  const state = recordValue(
    recordValue(liveSource?.metadata)[LIGHTWEIGHT_CHECK_METADATA_KEY],
  );
  const checkedAt = isoValue(state.checkedAt);
  const status = stringValue(state.status);
  if (!checkedAt && !status) return [];
  return [
    {
      id: `lightweight:${sourceId}`,
      kind: "LIGHTWEIGHT CHECK",
      at: checkedAt,
      status,
      reason: stringValue(state.errorMessage),
      actor: null,
      href: adminLink("sources", "source", sourceId),
    },
  ];
};

const gatewayEventClaimFor = (
  event: ProjectionRows["gatewayEvents"][number],
  claimsById: ReadonlyMap<
    string,
    ProjectionRows["gatewayClaims"][number]
  >,
): ProjectionRows["gatewayClaims"][number] | undefined =>
  event.claimId ? claimsById.get(event.claimId) : undefined;

const gatewayEventHistoryRowFor = (
  event: ProjectionRows["gatewayEvents"][number],
  claimsById: ReadonlyMap<
    string,
    ProjectionRows["gatewayClaims"][number]
  >,
): ProjectionHistoryRow => {
  const payload = recordValue(event.payload);
  const claim = gatewayEventClaimFor(event, claimsById);
  return {
    id: event.id,
    kind: `GATEWAY ${event.eventType}`,
    at: isoValue(event.createdAt),
    status: stringValue(payload.status) ?? event.eventType,
    reason: event.reasonCodes.join(", ") || stringValue(payload.reason),
    actor: event.actorId,
    lane: event.role,
    claimGeneration: claim?.claimGeneration ?? null,
    recordedAt: isoValue(event.createdAt),
    workerId: claim?.workerId ?? stringValue(payload.workerId),
    executorId: event.actorId,
    previousState: stringValue(payload.previousState ?? payload.fromState),
    nextState: stringValue(payload.nextState ?? payload.toState),
    evidenceRefs: stringList(payload.evidenceRefs),
    inputHash: event.inputHash ?? event.requestHash,
    outputHash: event.outputHash,
    href: adminLink("jobs", "event", event.id),
  };
};

const historyForSource = (
  rows: ProjectionRows,
  sourceId: string,
): ProjectionHistoryRow[] => {
  const claimsById = new Map(
    rows.gatewayClaims.map((claim) => [claim.id, claim]),
  );
  return [
    ...rows.transitions
      .filter((transition) => transition.supplySourceId === sourceId)
      .map((transition) => ({
        id: transition.id,
        kind: `LIFECYCLE ${transition.command}`,
        at: isoValue(transition.occurredAt),
        status: String(transition.toStage),
        reason: transition.reasonCodes.join(", ") || null,
        actor: transition.actorId,
        lifecycleGeneration: transition.generation,
        contractVersion: transition.contractVersion,
        effectiveAt: isoValue(transition.occurredAt),
        recordedAt: isoValue(transition.occurredAt),
        executorId: transition.executingAgentId,
        previousState: transition.fromStage
          ? String(transition.fromStage)
          : null,
        nextState: String(transition.toStage),
        evidenceRefs: transition.evidenceRefs,
        inputHash: transition.requestHash,
        outputHash: transition.resultHash,
        href: adminLink("sources", "source", sourceId),
      })),
    ...rows.gatewayEvents
      .filter((event) => {
        const payload = recordValue(event.payload);
        const payloadSourceId = rootIdForSource(
          rows,
          stringValue(payload.supplySourceId ?? payload.sourceId),
        );
        const subjectSourceId = rootIdForSource(
          rows,
          stringValue(payload.subjectId),
        );
        const gatewayJob = rows.gatewayJobs.find(
          (job) => job.id === event.jobId,
        );
        const jobSourceId = rootIdForSource(rows, gatewayJob?.supplySourceId);
        return (
          payloadSourceId === sourceId ||
          subjectSourceId === sourceId ||
          payload.subjectId === sourceId ||
          jobSourceId === sourceId
        );
      })
      .map((event) => gatewayEventHistoryRowFor(event, claimsById)),
    ...rows.scrapeRuns
      .filter(
        (run) =>
          rootIdForSource(rows, run.supplySourceId ?? run.sourceId) ===
          sourceId,
      )
      .map((run) => ({
        id: run.id,
        kind: "SOURCE REFRESH",
        at: isoValue(run.finishedAt ?? run.createdAt),
        status: run.status,
        reason: run.errorMessage,
        actor: run.requestedByUserId,
        recordedAt: isoValue(run.createdAt),
        effectiveAt: isoValue(run.finishedAt ?? run.createdAt),
        href: adminLink("sources", "scrapeRun", run.id),
      })),
    ...lightweightCheckHistoryForSource(rows, sourceId),
  ].sort(
    (left, right) =>
      (dateValue(right.at)?.getTime() ?? 0) -
      (dateValue(left.at)?.getTime() ?? 0),
  );
};

const relatedForSource = (
  rows: ProjectionRows,
  sourceId: string,
): ProjectionRelatedRow[] => {
  const source = rows.roots.find((root) => root.id === sourceId);
  if (!source) return [];
  const related: ProjectionRelatedRow[] = [];
  if (source.intakeId)
    related.push({
      id: source.intakeId,
      kind: "INTAKE",
      label: source.intakeId,
      status:
        rows.intakes.find((intake) => intake.id === source.intakeId)?.status ??
        null,
      href: adminLink("intake", "intake", source.intakeId),
    });
  if (source.liveSourceId)
    related.push({
      id: source.liveSourceId,
      kind: "SOURCE",
      label: source.liveSourceId,
      status:
        rows.sources.find((item) => item.id === source.liveSourceId)?.status ??
        null,
      href: adminLink("sources", "source", sourceId),
    });
  rows.targets
    .filter((target) => target.supplySourceId === sourceId)
    .forEach((target) =>
      related.push({
        id: target.id,
        kind: "TARGET",
        label: target.targetId,
        status: target.status,
        href: adminLink("candidates", "target", target.id),
      }),
    );
  return related;
};

const sourceDetailExecutionFieldsFor = (
  source: ProjectionRows["roots"][number],
  liveSource: ProjectionRows["sources"][number] | null,
  mapping: ProjectionRows["mappings"][number] | null,
): ProjectionField[] => [
  field("Automation enabled", source.isAutomationEnabled),
  field("Automation hold", source.automationHoldReason),
  field("Live source", source.liveSourceId),
  field(
    "Mapping",
    mapping?.id,
    mapping?.id ? adminLink("sources", "mapping", mapping.id) : null,
  ),
  field(
    "Organization",
    liveSource?.organizationId,
    liveSource?.organizationId
      ? adminLink("sources", "organization", liveSource.organizationId)
      : null,
  ),
];

const sourceDetailLineageFieldsFor = (
  source: ProjectionRows["roots"][number],
): ProjectionField[] => [
  field(
    "Intake",
    source.intakeId,
    source.intakeId
      ? adminLink("intake", "intake", source.intakeId)
      : null,
  ),
  field(
    "Predecessor",
    source.predecessorId,
    source.predecessorId
      ? adminLink("sources", "source", source.predecessorId)
      : null,
  ),
  field(
    "Successor",
    source.successorId,
    source.successorId
      ? adminLink("sources", "source", source.successorId)
      : null,
  ),
];

const sourceDetailSectionsFor = (
  source: ProjectionRows["roots"][number],
  liveSource: ProjectionRows["sources"][number] | null,
  mapping: ProjectionRows["mappings"][number] | null,
): ProjectionDetail["sections"] => [
  {
    title: "Header",
    fields: [
      field("Canonical URL", source.canonicalUrl),
      field("Operator domain", source.operatorDomain),
      field("Lifecycle generation", source.lifecycleGeneration),
      field("Rollout cohort", source.rolloutCohort),
    ],
  },
  {
    title: "Priority and Supply Target impact",
    fields: [
      field("Fresh target contribution", source.targetContribution),
      field("Repair priority", source.repairPriority),
      field("Freshness", source.freshnessStatus),
      field("Outcome", source.derivedOutcome),
    ],
  },
  {
    title: "Execution",
    fields: sourceDetailExecutionFieldsFor(source, liveSource, mapping),
  },
  {
    title: "Lineage",
    fields: sourceDetailLineageFieldsFor(source),
  },
  {
    title: "Evidence and result",
    fields: [
      field("Last successful refresh", source.lastSuccessfulRefreshAt),
      field("Assessment", source.lastAssessmentAt),
      field("Invariant violations", source.invariantViolations.join(", ")),
      field("Mapping validation", mapping?.validatedAt),
    ],
  },
];

const buildSourceDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const source = rows.roots.find((root) => root.id === id);
  if (!source) return null;
  const liveSource =
    rows.sources.find((item) => item.id === source.liveSourceId) ?? null;
  const mapping =
    rows.mappings.find(
      (item) =>
        item.id === liveSource?.activeMappingId || item.supplySourceId === id,
    ) ?? null;
  return {
    id,
    kind: "source",
    title: source.canonicalUrl,
    subtitle: `Supply Source ${id}`,
    status: String(source.derivedStage),
    sections: sourceDetailSectionsFor(source, liveSource, mapping),
    history: historyForSource(rows, id),
    related: relatedForSource(rows, id),
  };
};

type JobRelatedAccumulator = Readonly<{
  rows: ProjectionRows;
  related: ProjectionRelatedRow[];
  seen: Set<string>;
}>;

const addRelatedRow = (
  context: JobRelatedAccumulator,
  kind: string,
  id: string | null | undefined,
  label: string | null | undefined,
  href: string | null,
  status: string | null = null,
): void => {
  if (!id || context.seen.has(`${kind}:${id}`)) return;
  context.seen.add(`${kind}:${id}`);
  context.related.push({ id, kind, label: label || id, status, href });
};

const sourceRootForRelated = (
  rows: ProjectionRows,
  candidateId: string | null | undefined,
): ProjectionRows["roots"][number] | null =>
  candidateId
    ? (rows.roots.find(
        (item) =>
          item.id === candidateId ||
          item.liveSourceId === candidateId ||
          item.intakeId === candidateId,
      ) ?? null)
    : null;

const addSourceRelatedRow = (
  context: JobRelatedAccumulator,
  candidateId: string | null | undefined,
): void => {
  const root = sourceRootForRelated(context.rows, candidateId);
  if (!root) return;
  addRelatedRow(
    context,
    "SOURCE",
    root.id,
    root.canonicalUrl,
    adminLink("sources", "source", root.id),
    String(root.derivedStage),
  );
};

const coverageSubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const cell = rows.coverageCells.find((candidate) => candidate.id === subjectId);
  if (!cell) return null;
  return {
    id: cell.id,
    kind: "COVERAGE CELL",
    label: `${cell.cityId} / ${cell.sportName || cell.sportId}`,
    status: cell.coverageStatus,
    href: adminLink("coverage", "coverageCell", cell.id),
  };
};

const demandSubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const demand = rows.demands.find((candidate) => candidate.id === subjectId);
  if (!demand) return null;
  return {
    id: demand.id,
    kind: "DEMAND",
    label: targetLabel(demand.marketKey, demand.sportId, demand.sourceProfile),
    status: demand.status,
    href: adminLink("coverage", "demand", demand.id),
  };
};

const waveSubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const wave = rows.waves.find((candidate) => candidate.id === subjectId);
  if (!wave) return null;
  return {
    id: wave.id,
    kind: "WAVE",
    label: wave.id,
    status: wave.status,
    href: adminLink("coverage", "wave", wave.id),
  };
};

const campaignSubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const campaign = rows.campaigns.find((candidate) => candidate.id === subjectId);
  if (!campaign) return null;
  return {
    id: campaign.id,
    kind: "CAMPAIGN",
    label: campaign.name,
    status: campaign.status,
    href: adminLink("coverage", "campaign", campaign.id),
  };
};

const discoverySubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const run = rows.discoveryRuns.find((candidate) => candidate.id === subjectId);
  if (!run) return null;
  return {
    id: run.id,
    kind: "DISCOVERY RUN",
    label: run.id,
    status: run.status,
    href: adminLink("coverage", "discoveryRun", run.id),
  };
};

const intakeSubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const intake = rows.intakes.find((candidate) => candidate.id === subjectId);
  if (!intake) return null;
  return {
    id: intake.id,
    kind: "INTAKE",
    label: intake.name,
    status: intake.status,
    href: adminLink("intake", "intake", intake.id),
  };
};

const refreshSubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const run = rows.scrapeRuns.find((candidate) => candidate.id === subjectId);
  if (!run) return null;
  return {
    id: run.id,
    kind: "REFRESH",
    label: run.id,
    status: run.status,
    href: adminLink("sources", "scrapeRun", run.id),
  };
};

const subjectKindFor = (subjectType: string): string => {
  const kinds = [
    ["COVERAGE", "COVERAGE"],
    ["DEMAND", "DEMAND"],
    ["WAVE", "WAVE"],
    ["CAMPAIGN", "CAMPAIGN"],
    ["DISCOVERY", "DISCOVERY"],
    ["INTAKE", "INTAKE"],
    ["SCRAPE", "REFRESH"],
    ["REFRESH", "REFRESH"],
  ] as const;
  for (const [needle, kind] of kinds) {
    if (subjectType.includes(needle)) return kind;
  }
  return "SOURCE";
};

const sourceSubjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectId: string,
): ProjectionRelatedRow | null => {
  const root = sourceRootForRelated(rows, subjectId);
  if (!root) return null;
  return {
    id: root.id,
    kind: "SOURCE",
    label: root.canonicalUrl,
    status: String(root.derivedStage),
    href: adminLink("sources", "source", root.id),
  };
};

const subjectRelatedRowFor = (
  rows: ProjectionRows,
  subjectType: string,
  subjectId: string | null | undefined,
): ProjectionRelatedRow | null => {
  if (!subjectId) return null;
  switch (subjectKindFor(subjectType)) {
    case "COVERAGE":
      return coverageSubjectRelatedRowFor(rows, subjectId);
    case "DEMAND":
      return demandSubjectRelatedRowFor(rows, subjectId);
    case "WAVE":
      return waveSubjectRelatedRowFor(rows, subjectId);
    case "CAMPAIGN":
      return campaignSubjectRelatedRowFor(rows, subjectId);
    case "DISCOVERY":
      return discoverySubjectRelatedRowFor(rows, subjectId);
    case "INTAKE":
      return intakeSubjectRelatedRowFor(rows, subjectId);
    case "REFRESH":
      return refreshSubjectRelatedRowFor(rows, subjectId);
    default:
      return sourceSubjectRelatedRowFor(rows, subjectId);
  }
};

const addSubjectRelatedRow = (
  context: JobRelatedAccumulator,
  subjectType: string,
  subjectId: string | null | undefined,
): void => {
  const related = subjectRelatedRowFor(context.rows, subjectType, subjectId);
  if (!related) return;
  addRelatedRow(
    context,
    related.kind,
    related.id,
    related.label,
    related.href ?? null,
    related.status,
  );
};

const addGatewayJobRelated = (
  context: JobRelatedAccumulator,
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
): void => {
  addSourceRelatedRow(context, gatewayJob?.supplySourceId);
  addSubjectRelatedRow(
    context,
    upper(gatewayJob?.subjectType ?? ""),
    gatewayJob?.subjectId ?? row.subjectId,
  );
  if (!gatewayJob?.parentClaimId) return;
  addRelatedRow(
    context,
    "CLAIM",
    gatewayJob.parentClaimId,
    gatewayJob.parentClaimId,
    adminLink("jobs", "claim", gatewayJob.parentClaimId),
    null,
  );
};

const addMappingJobRelated = (
  context: JobRelatedAccumulator,
  row: JobRow,
): void => {
  const job = context.rows.mappingJobs.find((candidate) => candidate.id === row.id);
  addSourceRelatedRow(context, job?.supplySourceId);
  if (job?.supplySourceId || !job?.intakeId) return;
  const intake = context.rows.intakes.find(
    (candidate) => candidate.id === job.intakeId,
  );
  if (!intake) return;
  addRelatedRow(
    context,
    "INTAKE",
    intake.id,
    intake.name,
    adminLink("intake", "intake", intake.id),
    intake.status,
  );
};

const addReviewJobRelated = (
  context: JobRelatedAccumulator,
  row: JobRow,
): void => {
  const job = context.rows.approvals.find((candidate) => candidate.id === row.id);
  addSourceRelatedRow(context, job?.supplySourceId);
  if (!job) return;
  addRelatedRow(
    context,
    "REVIEW",
    job.id,
    job.subjectType,
    adminLink("review", "review", job.id),
    job.status,
  );
};

const addCoverageJobRelated = (
  context: JobRelatedAccumulator,
  row: JobRow,
): void => {
  addSubjectRelatedRow(context, "COVERAGE", row.subjectId);
  addSubjectRelatedRow(context, "DEMAND", row.subjectId);
  addSubjectRelatedRow(context, "CAMPAIGN", row.subjectId);
};

const addCaptureJobRelated = (
  context: JobRelatedAccumulator,
  row: JobRow,
): void => {
  const run = context.rows.intakeRuns.find((candidate) => candidate.id === row.id);
  addSourceRelatedRow(context, run?.supplySourceId);
  const intake = context.rows.intakes.find(
    (candidate) => candidate.id === run?.intakeId,
  );
  if (!intake) return;
  addRelatedRow(
    context,
    "INTAKE",
    intake.id,
    intake.name,
    adminLink("intake", "intake", intake.id),
    intake.status,
  );
};

const addDiscoveryJobRelated = (
  context: JobRelatedAccumulator,
  row: JobRow,
): void => {
  const run = context.rows.discoveryRuns.find((candidate) => candidate.id === row.id);
  const campaign = context.rows.campaigns.find(
    (candidate) => candidate.id === run?.campaignId,
  );
  if (!campaign) return;
  addRelatedRow(
    context,
    "CAMPAIGN",
    campaign.id,
    campaign.name,
    adminLink("coverage", "campaign", campaign.id),
    campaign.status,
  );
};

const addRefreshJobRelated = (
  context: JobRelatedAccumulator,
  row: JobRow,
): void => {
  const run = context.rows.scrapeRuns.find((candidate) => candidate.id === row.id);
  addSourceRelatedRow(context, run?.supplySourceId);
};

type JobRelatedAdder = (
  context: JobRelatedAccumulator,
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
) => void;

const JOB_RELATED_ADDERS: Readonly<Record<string, JobRelatedAdder>> = {
  GATEWAY: addGatewayJobRelated,
  MAPPING: addMappingJobRelated,
  REVIEW: addReviewJobRelated,
  COVERAGE: addCoverageJobRelated,
  CAPTURE: addCaptureJobRelated,
  DISCOVERY: addDiscoveryJobRelated,
  REFRESH: addRefreshJobRelated,
};

const jobPackageHashFor = (
  rows: ProjectionRows,
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
): string | null => {
  if (row.kind === "GATEWAY") {
    return stringValue(recordValue(gatewayJob?.subjectJson).packageHash);
  }
  if (row.kind !== "REVIEW") return null;
  const review = rows.approvals.find((candidate) => candidate.id === row.id);
  return stringValue(recordValue(review?.decision).packageHash);
};

const jobLineageRelated = (
  rows: ProjectionRows,
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
): ProjectionRelatedRow[] => {
  const context: JobRelatedAccumulator = {
    rows,
    related: [],
    seen: new Set<string>(),
  };
  const addForKind = JOB_RELATED_ADDERS[row.kind];
  if (addForKind) addForKind(context, row, gatewayJob);
  const packageHash = jobPackageHashFor(rows, row, gatewayJob);
  if (packageHash) {
    addRelatedRow(
      context,
      "PACKAGE",
      packageHash,
      packageHash,
      adminLink("review", "package", packageHash),
      null,
    );
  }
  return context.related;
};


const gatewayJobEventClaimFieldsFor = (
  event: ProjectionRows["gatewayEvents"][number],
  claim: ProjectionRows["gatewayClaims"][number] | undefined,
  payload: Record<string, unknown>,
  provider: string | null,
): Pick<
  ProjectionHistoryRow,
  | "provider"
  | "claimGeneration"
  | "queuedAt"
  | "startedAt"
  | "heartbeatAt"
  | "effectiveAt"
  | "recordedAt"
  | "workerId"
  | "executorId"
> => ({
  provider,
  claimGeneration: claim?.claimGeneration ?? null,
  startedAt: isoValue(claim?.claimedAt),
  heartbeatAt: isoValue(claim?.lastHeartbeatAt),
  effectiveAt: isoValue(event.createdAt),
  recordedAt: isoValue(event.createdAt),
  workerId: claim?.workerId ?? stringValue(payload.workerId),
  executorId: event.actorId,
});

const gatewayJobEventStateFieldsFor = (
  event: ProjectionRows["gatewayEvents"][number],
  payload: Record<string, unknown>,
): Pick<
  ProjectionHistoryRow,
  | "status"
  | "reason"
  | "previousState"
  | "nextState"
  | "evidenceRefs"
  | "inputHash"
  | "outputHash"
> => ({
  status: stringValue(payload.status) ?? event.eventType,
  reason: event.reasonCodes.join(", ") || stringValue(payload.reason),
  previousState: stringValue(payload.previousState ?? payload.fromState),
  nextState: stringValue(payload.nextState ?? payload.toState),
  evidenceRefs: stringList(payload.evidenceRefs),
  inputHash: event.inputHash ?? event.requestHash,
  outputHash: event.outputHash,
});

const gatewayJobEventHistoryRowFor = (
  event: ProjectionRows["gatewayEvents"][number],
  claimsById: ReadonlyMap<
    string,
    ProjectionRows["gatewayClaims"][number]
  >,
  provider: string | null,
): ProjectionHistoryRow => {
  const payload = recordValue(event.payload);
  const claim = gatewayEventClaimFor(event, claimsById);
  return {
    id: event.id,
    kind: `EVENT ${event.eventType}`,
    at: isoValue(event.createdAt),
    actor: event.actorId,
    href: adminLink("jobs", "event", event.id),
    ...gatewayJobEventClaimFieldsFor(event, claim, payload, provider),
    ...gatewayJobEventStateFieldsFor(event, payload),
  };
};

const jobHistory = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const gatewayJob = rows.gatewayJobs.find((job) => job.id === id);
  const provider = providerValue(
    gatewayJob?.subjectJson,
    gatewayJob?.evidenceManifestJson,
  );
  const claimsById = new Map(
    rows.gatewayClaims.map((claim) => [claim.id, claim]),
  );
  return [
    ...rows.gatewayClaims
      .filter((claim) => claim.jobId === id)
      .map((claim) => ({
        id: claim.id,
        kind: "CLAIM",
        at: isoValue(claim.claimedAt),
        status: String(claim.status),
        reason: claim.safeFailureCode,
        actor: claim.workerId,
        provider,
        claimGeneration: claim.claimGeneration,
        lifecycleGeneration: claim.lifecycleGeneration,
        queuedAt: isoValue(claim.createdAt),
        startedAt: isoValue(claim.claimedAt),
        heartbeatAt: isoValue(claim.lastHeartbeatAt),
        finishedAt: isoValue(claim.endedAt),
        effectiveAt: isoValue(claim.claimedAt),
        recordedAt: isoValue(claim.createdAt),
        workerId: claim.workerId,
        executorId: claim.workerId,
        attempt: claim.claimGeneration,
        inputHash: claim.claimRequestHash,
        href: adminLink("jobs", "claim", claim.id),
      })),
    ...rows.receipts
      .filter((receipt) => receipt.jobId === id)
      .map((receipt) => ({
        id: receipt.id,
        kind: `RECEIPT ${receipt.operationKind}`,
        at: isoValue(receipt.completedAt ?? receipt.startedAt),
        status: String(receipt.status),
        reason: receipt.safeErrorCode,
        actor: null,
        provider,
        claimGeneration: receipt.claimGeneration,
        queuedAt: isoValue(receipt.createdAt),
        startedAt: isoValue(receipt.startedAt),
        finishedAt: isoValue(receipt.completedAt),
        effectiveAt: isoValue(receipt.completedAt ?? receipt.startedAt),
        recordedAt: isoValue(receipt.createdAt),
        inputHash: receipt.requestHash,
        outputHash: receipt.responseHash,
        href: adminLink("jobs", "operation", receipt.id),
      })),
    ...rows.gatewayEvents
      .filter((event) => event.jobId === id)
      .map((event) =>
        gatewayJobEventHistoryRowFor(event, claimsById, provider),
      ),
  ].sort(
    (left, right) =>
      (dateValue(right.at)?.getTime() ?? 0) -
      (dateValue(left.at)?.getTime() ?? 0),
  );
};

type JobLifecycleHistoryEntry = Readonly<{
  id: string;
  kind: string;
  at: unknown;
  status: unknown;
  reason?: unknown;
  actor?: unknown;
  provider?: string | null;
  href: string;
}>;

const buildJobLifecycleHistory = (
  entries: readonly JobLifecycleHistoryEntry[],
): ProjectionHistoryRow[] =>
  entries
    .filter((entry) => dateValue(entry.at))
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      at: isoValue(entry.at),
      status:
        entry.status === null || entry.status === undefined
          ? null
          : String(entry.status),
      reason:
        entry.reason === null || entry.reason === undefined
          ? null
          : String(entry.reason),
      provider: entry.provider ?? null,
      actor:
        entry.actor === null || entry.actor === undefined
          ? null
          : String(entry.actor),
      href: entry.href,
    }));
type JobHistoryBuilder = (
  rows: ProjectionRows,
  id: string,
) => ProjectionHistoryRow[];

const mappingJobHistoryFor = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const job = rows.mappingJobs.find((candidate) => candidate.id === id);
  if (!job) return [];
  return buildJobLifecycleHistory([
    {
      id: `${id}:created`,
      kind: "MAPPING CREATED",
      at: job.createdAt,
      status: "CREATED",
      href: adminLink("jobs", "job", id),
    },
    {
      id: `${id}:claimed`,
      kind: "MAPPING CLAIMED",
      at: job.claimedAt,
      status: "CLAIMED",
      actor: job.workerId,
      href: adminLink("jobs", "job", id),
    },
    {
      id: `${id}:finished`,
      kind: "MAPPING FINISHED",
      at: job.finishedAt,
      status: job.status,
      reason: job.errorMessage,
      actor: job.workerId,
      href: adminLink("jobs", "job", id),
    },
  ]);
};

const reviewJobHistoryFor = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const job = rows.approvals.find((candidate) => candidate.id === id);
  if (!job) return [];
  return buildJobLifecycleHistory([
    {
      id: `${id}:created`,
      kind: "REVIEW CREATED",
      at: job.createdAt,
      status: "CREATED",
      href: adminLink("jobs", "job", id),
    },
    {
      id: `${id}:claimed`,
      kind: "REVIEW CLAIMED",
      at: job.claimedAt,
      status: "CLAIMED",
      actor: job.reviewerId,
      href: adminLink("jobs", "job", id),
    },
    {
      id: `${id}:finished`,
      kind: "REVIEW FINISHED",
      at: job.finishedAt,
      status: job.status,
      reason: job.errorMessage,
      actor: job.reviewerId,
      href: adminLink("jobs", "job", id),
    },
  ]);
};

const coverageJobHistoryFor = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const job = rows.coverageJobs.find((candidate) => candidate.id === id);
  if (!job) return [];
  return buildJobLifecycleHistory([
    {
      id: `${id}:created`,
      kind: "COVERAGE CREATED",
      at: job.createdAt,
      status: "CREATED",
      href: adminLink("jobs", "job", id),
    },
    {
      id: `${id}:claimed`,
      kind: "COVERAGE CLAIMED",
      at: job.claimedAt,
      status: "CLAIMED",
      actor: job.workerId,
      href: adminLink("jobs", "job", id),
    },
    {
      id: `${id}:finished`,
      kind: "COVERAGE FINISHED",
      at: job.finishedAt,
      status: job.status,
      reason: job.errorMessage,
      actor: job.workerId,
      href: adminLink("jobs", "job", id),
    },
  ]);
};

const captureJobHistoryFor = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const run = rows.intakeRuns.find((candidate) => candidate.id === id);
  if (!run) return [];
  return buildJobLifecycleHistory([
    {
      id: `${id}:queued`,
      kind: "CAPTURE QUEUED",
      at: run.queuedAt,
      status: "QUEUED",
      href: adminLink("intake", "intakeRun", id),
    },
    {
      id: `${id}:started`,
      kind: "CAPTURE STARTED",
      at: run.startedAt,
      status: "STARTED",
      actor: run.workerId,
      href: adminLink("intake", "intakeRun", id),
    },
    {
      id: `${id}:claimed`,
      kind: "CAPTURE CLAIMED",
      at: run.claimedAt,
      status: "CLAIMED",
      actor: run.workerId,
      href: adminLink("intake", "intakeRun", id),
    },
    {
      id: `${id}:finished`,
      kind: "CAPTURE FINISHED",
      at: run.finishedAt,
      status: run.status,
      reason: run.errorMessage,
      actor: run.workerId,
      href: adminLink("intake", "intakeRun", id),
    },
  ]);
};

const discoveryJobHistoryFor = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const run = rows.discoveryRuns.find((candidate) => candidate.id === id);
  if (!run) return [];
  return buildJobLifecycleHistory([
    {
      id: `${id}:queued`,
      kind: "DISCOVERY QUEUED",
      at: run.queuedAt,
      status: "QUEUED",
      href: adminLink("coverage", "discoveryRun", id),
    },
    {
      id: `${id}:started`,
      kind: "DISCOVERY STARTED",
      at: run.startedAt,
      status: "STARTED",
      actor: run.workerId,
      href: adminLink("coverage", "discoveryRun", id),
    },
    {
      id: `${id}:claimed`,
      kind: "DISCOVERY CLAIMED",
      at: run.claimedAt,
      status: "CLAIMED",
      actor: run.workerId,
      href: adminLink("coverage", "discoveryRun", id),
    },
    {
      id: `${id}:finished`,
      kind: "DISCOVERY FINISHED",
      at: run.finishedAt,
      status: run.status,
      reason: run.errorMessage,
      actor: run.workerId,
      href: adminLink("coverage", "discoveryRun", id),
    },
  ]);
};

const refreshJobHistoryFor = (
  rows: ProjectionRows,
  id: string,
): ProjectionHistoryRow[] => {
  const run = rows.scrapeRuns.find((candidate) => candidate.id === id);
  if (!run) return [];
  return buildJobLifecycleHistory([
    {
      id: `${id}:created`,
      kind: "REFRESH CREATED",
      at: run.createdAt,
      status: "CREATED",
      href: adminLink("sources", "scrapeRun", id),
    },
    {
      id: `${id}:started`,
      kind: "REFRESH STARTED",
      at: run.startedAt,
      status: "STARTED",
      href: adminLink("sources", "scrapeRun", id),
    },
    {
      id: `${id}:finished`,
      kind: "REFRESH FINISHED",
      at: run.finishedAt,
      status: run.status,
      reason: run.errorMessage,
      actor: run.requestedByUserId,
      href: adminLink("sources", "scrapeRun", id),
    },
  ]);
};

const JOB_HISTORY_BUILDERS: Readonly<Record<string, JobHistoryBuilder>> = {
  MAPPING: mappingJobHistoryFor,
  REVIEW: reviewJobHistoryFor,
  COVERAGE: coverageJobHistoryFor,
  CAPTURE: captureJobHistoryFor,
  DISCOVERY: discoveryJobHistoryFor,
  REFRESH: refreshJobHistoryFor,
};

const gatewayJobFor = (
  rows: ProjectionRows,
  row: JobRow,
  id: string,
): ProjectionRows["gatewayJobs"][number] | null =>
  row.kind === "GATEWAY"
    ? (rows.gatewayJobs.find((job) => job.id === id) ?? null)
    : null;

const gatewayClaimFor = (
  rows: ProjectionRows,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
): ProjectionRows["gatewayClaims"][number] | null =>
  gatewayJob?.activeClaimId
    ? (rows.gatewayClaims.find(
        (claim) => claim.id === gatewayJob.activeClaimId,
      ) ?? null)
    : null;

const jobHistoryForRow = (
  rows: ProjectionRows,
  row: JobRow,
  id: string,
): ProjectionHistoryRow[] => {
  if (row.kind === "GATEWAY") return jobHistory(rows, id);
  const builder = JOB_HISTORY_BUILDERS[row.kind];
  return builder ? builder(rows, id) : [];
};

type JobExecutionFieldsBuilder = (
  rows: ProjectionRows,
  id: string,
) => ProjectionField[];

const gatewayExecutionFieldsFor = (
  gatewayJob: ProjectionRows["gatewayJobs"][number],
): ProjectionField[] => [
  field("Created", gatewayJob.createdAt),
  field("Updated", gatewayJob.updatedAt),
  field("Finished", gatewayJob.finishedAt),
  field("Expected lifecycle generation", gatewayJob.expectedLifecycleGeneration),
  field("Invocation failures", gatewayJob.invocationFailureCount),
  field("Terminal disposition", gatewayJob.terminalDisposition),
  field(
    "Terminal receipt",
    gatewayJob.terminalReceiptId,
    gatewayJob.terminalReceiptId
      ? adminLink("jobs", "operation", gatewayJob.terminalReceiptId)
      : null,
  ),
];

const mappingExecutionFieldsFor: JobExecutionFieldsBuilder = (rows, id) => {
  const job = rows.mappingJobs.find((candidate) => candidate.id === id);
  return [
    field("Created", job?.createdAt),
    field("Claimed", job?.claimedAt),
    field("Finished", job?.finishedAt),
    field("Attempt", job?.attemptCount),
    field("Branch", job?.branch),
    field("Commit", job?.commit),
  ];
};

const reviewExecutionFieldsFor: JobExecutionFieldsBuilder = (rows, id) => {
  const job = rows.approvals.find((candidate) => candidate.id === id);
  return [
    field("Created", job?.createdAt),
    field("Claimed", job?.claimedAt),
    field("Finished", job?.finishedAt),
    field("Attempt", job?.attemptCount),
    field("Decision", recordValue(job?.decision)),
  ];
};

const coverageExecutionFieldsFor: JobExecutionFieldsBuilder = (rows, id) => {
  const job = rows.coverageJobs.find((candidate) => candidate.id === id);
  return [
    field("Created", job?.createdAt),
    field("Claimed", job?.claimedAt),
    field("Finished", job?.finishedAt),
    field("Attempt", job?.attemptCount),
    field("Priority", job?.priorityScore),
  ];
};

const captureExecutionFieldsFor: JobExecutionFieldsBuilder = (rows, id) => {
  const run = rows.intakeRuns.find((candidate) => candidate.id === id);
  return [
    field("Queued", run?.queuedAt),
    field("Started", run?.startedAt),
    field("Claimed", run?.claimedAt),
    field("Finished", run?.finishedAt),
    field("Attempt", run?.attemptCount),
  ];
};

const discoveryExecutionFieldsFor: JobExecutionFieldsBuilder = (rows, id) => {
  const run = rows.discoveryRuns.find((candidate) => candidate.id === id);
  return [
    field("Queued", run?.queuedAt),
    field("Started", run?.startedAt),
    field("Claimed", run?.claimedAt),
    field("Finished", run?.finishedAt),
    field("Attempt", run?.attemptCount),
  ];
};

const refreshExecutionFieldsFor: JobExecutionFieldsBuilder = (rows, id) => {
  const run = rows.scrapeRuns.find((candidate) => candidate.id === id);
  return [
    field("Created", run?.createdAt),
    field("Started", run?.startedAt),
    field("Finished", run?.finishedAt),
    field("Requested by", run?.requestedByUserId),
  ];
};

const JOB_EXECUTION_FIELDS_BUILDERS: Readonly<
  Record<string, JobExecutionFieldsBuilder>
> = {
  MAPPING: mappingExecutionFieldsFor,
  REVIEW: reviewExecutionFieldsFor,
  COVERAGE: coverageExecutionFieldsFor,
  CAPTURE: captureExecutionFieldsFor,
  DISCOVERY: discoveryExecutionFieldsFor,
  REFRESH: refreshExecutionFieldsFor,
};

const recordedExecutionFor = (
  rows: ProjectionRows,
  row: JobRow,
  id: string,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
): ProjectionField[] => {
  if (gatewayJob) return gatewayExecutionFieldsFor(gatewayJob);
  const builder = JOB_EXECUTION_FIELDS_BUILDERS[row.kind];
  return builder ? builder(rows, id) : [];
};

const gatewayGenerationFieldsFor = (
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number],
  gatewayClaim: ProjectionRows["gatewayClaims"][number] | null,
): ProjectionField[] => [
  field("Subject", row.subjectId),
  field("Lineage", row.lineage),
  field("Claim generation", gatewayJob.claimGeneration),
  field(
    "Active claim",
    gatewayJob.activeClaimId,
    gatewayJob.activeClaimId
      ? adminLink("jobs", "claim", gatewayJob.activeClaimId)
      : null,
  ),
  field(
    "Parent claim",
    gatewayJob.parentClaimId,
    gatewayJob.parentClaimId
      ? adminLink("jobs", "claim", gatewayJob.parentClaimId)
      : null,
  ),
  field("Claim lifecycle generation", gatewayClaim?.lifecycleGeneration),
  field("Claim worker", gatewayClaim?.workerId),
];

const generationFieldsFor = (
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
  gatewayClaim: ProjectionRows["gatewayClaims"][number] | null,
): ProjectionField[] =>
  gatewayJob
    ? gatewayGenerationFieldsFor(row, gatewayJob, gatewayClaim)
    : [field("Subject", row.subjectId), field("Lineage", row.lineage)];

const gatewayEvidenceFieldsFor = (
  gatewayJob: ProjectionRows["gatewayJobs"][number],
): ProjectionField[] => [
  field("Subject payload", gatewayJob.subjectJson),
  field("Evidence manifest", gatewayJob.evidenceManifestJson),
  field("Result hash", gatewayJob.resultHash),
  field("Result", gatewayJob.resultJson),
  field(
    "Terminal receipt",
    gatewayJob.terminalReceiptId,
    gatewayJob.terminalReceiptId
      ? adminLink("jobs", "operation", gatewayJob.terminalReceiptId)
      : null,
  ),
  field("Event sequence", gatewayJob.eventSequence),
];

const jobEvidenceFieldsFor = (
  row: JobRow,
  gatewayJob: ProjectionRows["gatewayJobs"][number] | null,
): ProjectionField[] => [
  field("Failure", row.failure),
  field("Operation history", row.id),
  ...(gatewayJob ? gatewayEvidenceFieldsFor(gatewayJob) : []),
];

const buildJobDetail = (
  rows: ProjectionRows,
  id: string,
  now: Date,
): ProjectionDetail | null => {
  const jobs = buildJobRows(rows, now, {
    market: "",
    city: "",
    sport: "",
    profile: "",
    range: "",
    status: "",
    lane: "",
    role: "",
    reason: "",
  });
  const row = jobs.find((job) => job.id === id);
  if (!row) return null;
  const gatewayJob = gatewayJobFor(rows, row, id);
  const gatewayClaim = gatewayClaimFor(rows, gatewayJob);
  const history = jobHistoryForRow(rows, row, id);
  const historyWithProvider = history.map((entry) => ({
    ...entry,
    provider: entry.provider ?? row.provider,
  }));
  return {
    id,
    kind: "job",
    title: `${row.kind} ${row.id}`,
    subtitle: `${row.queue} / ${row.lane}`,
    status: row.status,
    sections: [
      {
        title: "Header",
        fields: [
          field("Kind", row.kind),
          field("Queue", row.queue),
          field("Lane", row.lane),
          field("Role", row.role),
          field("Provider", row.provider),
        ],
      },
      {
        title: "Execution",
        fields: [
          field("Status", row.status),
          field("Age", `${row.ageMinutes} minutes`),
          field("Retries", row.retries),
          field("Worker", row.workerId),
          field("Invocation", row.invocation),
          field("Transition", row.transition),
          ...recordedExecutionFor(rows, row, id, gatewayJob),
        ],
      },
      {
        title: "Generations",
        fields: generationFieldsFor(row, gatewayJob, gatewayClaim),
      },
      {
        title: "Evidence and result",
        fields: jobEvidenceFieldsFor(row, gatewayJob),
      },
    ],
    history: historyWithProvider,
    related: jobLineageRelated(rows, row, gatewayJob),
  };
};

const policyKeysForIntake = (
  intake: ProjectionRows["intakes"][number],
): Set<string> => {
  const keys = new Set<string>();
  [intake.sourceKey, intake.baseUrl].forEach((value) => {
    const string = stringValue(value);
    if (!string) return;
    keys.add(string);
    try {
      keys.add(affiliateDiscoveryPolicyKeyForUrl(string));
    } catch {
      // The source key may not be a URL. Keep the direct key.
    }
  });
  return keys;
};

const intakeDetailPolicyFieldsFor = (
  intake: ProjectionRows["intakes"][number],
  policy: ProjectionRows["domainPolicies"][number] | undefined,
  policyEvidence: Record<string, unknown>,
  pages: readonly ProjectionRows["pages"][number][],
  runs: readonly ProjectionRows["intakeRuns"][number][],
): ProjectionField[] => [
  field("Compliance", intake.complianceStatus),
  field("Compliance notes", intake.complianceNotes),
  field("Policy key", policy?.policyKey),
  field("Policy status", policy?.status),
  field("Policy terms URL", policy?.termsUrl),
  field("Policy robots summary", policy?.robotsSummary),
  field("Policy restrictions", policy?.restrictionNotes),
  field("Policy reviewer", policy?.reviewedByUserId),
  field("Policy reviewed at", policy?.reviewedAt),
  field("Policy expires at", policy?.expiresAt),
  field("Policy evidence", policyEvidence),
  field("Pages", pages.length),
  field("Capture runs", runs.length),
];

const intakeDetailSectionsFor = (
  intake: ProjectionRows["intakes"][number],
  pages: readonly ProjectionRows["pages"][number][],
  runs: readonly ProjectionRows["intakeRuns"][number][],
  mapping: ProjectionRows["mappingJobs"][number] | undefined,
  policy: ProjectionRows["domainPolicies"][number] | undefined,
  policyEvidence: Record<string, unknown>,
): ProjectionDetail["sections"] => [
  {
    title: "Header",
    fields: [
      field("Name", intake.name),
      field("Source key", intake.sourceKey),
      field("Region", intake.region),
      field("Status", intake.status),
    ],
  },
  {
    title: "Policy and capture",
    fields: intakeDetailPolicyFieldsFor(
      intake,
      policy,
      policyEvidence,
      pages,
      runs,
    ),
  },
  {
    title: "Lineage",
    fields: [
      field(
        "Mapping job",
        mapping?.id,
        mapping?.id ? adminLink("jobs", "job", mapping.id) : null,
      ),
      field("Mapping status", mapping?.status),
      field("Mapping source", mapping?.supplySourceId ?? mapping?.sourceId),
    ],
  },
];

const intakeDetailHistoryFor = (
  runs: readonly ProjectionRows["intakeRuns"][number][],
): ProjectionHistoryRow[] =>
  runs.map((run) => ({
    id: run.id,
    kind: "CAPTURE",
    at: isoValue(run.finishedAt ?? run.createdAt),
    status: run.status,
    reason: run.errorMessage,
    actor: run.workerId,
    href: adminLink("intake", "intakeRun", run.id),
  }));

const intakeDetailRelatedFor = (
  mapping: ProjectionRows["mappingJobs"][number] | undefined,
  pages: readonly ProjectionRows["pages"][number][],
  artifacts: readonly ProjectionRows["artifacts"][number][],
): ProjectionRelatedRow[] => [
  ...(mapping
    ? [
        {
          id: mapping.id,
          kind: "MAPPING",
          label: mapping.id,
          status: mapping.status,
          href: adminLink("jobs", "job", mapping.id),
        },
      ]
    : []),
  ...pages.map((page) => ({
    id: page.id,
    kind: "PAGE",
    label: page.canonicalUrl,
    status: page.status,
    href: adminLink("intake", "page", page.id),
  })),
  ...artifacts.map((artifact) => ({
    id: artifact.id,
    kind: `ARTIFACT ${artifact.kind}`,
    label: artifact.contentHash,
    status: artifact.isPinned ? "PINNED" : "RETAINED",
    href: adminLink("intake", "artifact", artifact.id),
  })),
];

const buildIntakeDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const intake = rows.intakes.find((item) => item.id === id);
  if (!intake) return null;
  const pages = rows.pages.filter((page) => page.intakeId === id);
  const runs = rows.intakeRuns.filter((run) => run.intakeId === id);
  const artifacts = rows.artifacts.filter(
    (artifact) => artifact.intakeId === id,
  );
  const mapping = rows.mappingJobs.find((job) => job.intakeId === id);
  const policy = rows.domainPolicies.find((candidate) =>
    policyKeysForIntake(intake).has(candidate.policyKey),
  );
  const policyEvidence = recordValue(policy?.evidence);
  return {
    id,
    kind: "intake",
    title: intake.name,
    subtitle: `Source Intake ${intake.sourceKey}`,
    status: intake.status,
    sections: intakeDetailSectionsFor(
      intake,
      pages,
      runs,
      mapping,
      policy,
      policyEvidence,
    ),
    history: intakeDetailHistoryFor(runs),
    related: intakeDetailRelatedFor(mapping, pages, artifacts),
  };
};

const reviewExecutionHistoryFor = (
  review: ProjectionRows["approvals"][number],
): ProjectionHistoryRow[] => [
  {
    id: `${review.id}:created`,
    kind: "REVIEW CREATED",
    at: isoValue(review.createdAt),
    status: "QUEUED",
    reason: null,
    actor: null,
    attempt: review.attemptCount,
    href: adminLink("review", "review", review.id),
  },
  ...(review.claimedAt
    ? [
        {
          id: `${review.id}:claimed`,
          kind: "REVIEW CLAIMED",
          at: isoValue(review.claimedAt),
          status: "CLAIMED",
          reason: null,
          actor: review.reviewerId,
          attempt: review.attemptCount,
          href: adminLink("review", "review", review.id),
        },
      ]
    : []),
  ...(review.finishedAt
    ? [
        {
          id: `${review.id}:finished`,
          kind: "REVIEW FINISHED",
          at: isoValue(review.finishedAt),
          status: review.status,
          reason: review.errorMessage,
          actor: review.reviewerId,
          attempt: review.attemptCount,
          href: adminLink("review", "review", review.id),
        },
      ]
    : []),
];

const reviewDetailSectionsFor = (
  review: ProjectionRows["approvals"][number],
  decision: Record<string, unknown>,
): ProjectionDetail["sections"] => [
  {
    title: "Header",
    fields: [
      field("Case type", review.subjectType),
      field("Subject", review.subjectKey),
      field("Status", review.status),
      field("Reviewer", review.reviewerId),
    ],
  },
  {
    title: "Lineage",
    fields: [
      field(
        "Supply Source",
        review.supplySourceId,
        review.supplySourceId
          ? adminLink("sources", "source", review.supplySourceId)
          : null,
      ),
      field("Package hash", decision.packageHash),
      field("Baseline hash", decision.baselineHash),
    ],
  },
  {
    title: "Execution",
    fields: [
      field("Created", review.createdAt),
      field("Claimed", review.claimedAt),
      field("Finished", review.finishedAt),
      field("Attempts", review.attemptCount),
      field("Reviewer", review.reviewerId),
      field("Error", review.errorMessage),
    ],
  },
  {
    title: "Evidence and result",
    fields: [
      field("Decision", decision.decision),
      field(
        "Evidence references",
        stringList(
          decision.evidenceRefs ?? decision.candidateReviewEvidenceRefs,
        ).join(", "),
      ),
      field("Reason", decision.reasonCode ?? review.errorMessage),
    ],
  },
];

const reviewDetailHistoryFor = (
  rows: ProjectionRows,
  review: ProjectionRows["approvals"][number],
): ProjectionHistoryRow[] => [
  ...reviewExecutionHistoryFor(review),
  ...rows.transitions
    .filter((transition) => transition.supplySourceId === review.supplySourceId)
    .map((transition) => ({
      id: transition.id,
      kind: `LIFECYCLE ${transition.command}`,
      at: isoValue(transition.occurredAt),
      status: String(transition.toStage),
      reason: transition.reasonCodes.join(", ") || null,
      actor: transition.actorId,
      href: adminLink("sources", "source", transition.supplySourceId),
    })),
];

const reviewDetailRelatedFor = (
  review: ProjectionRows["approvals"][number],
  decision: Record<string, unknown>,
): ProjectionRelatedRow[] => [
  ...(review.supplySourceId
    ? [
        {
          id: review.supplySourceId,
          kind: "SOURCE",
          label: review.supplySourceId,
          status: null,
          href: adminLink("sources", "source", review.supplySourceId),
        },
      ]
    : []),
  ...(stringValue(decision.packageHash)
    ? [
        {
          id: String(decision.packageHash),
          kind: "PACKAGE",
          label: String(decision.packageHash),
          status: null,
          href: adminLink(
            "review",
            "package",
            String(decision.packageHash),
          ),
        },
      ]
    : []),
];

const buildReviewRecordDetail = (
  review: ProjectionRows["approvals"][number],
  rows: ProjectionRows,
  id: string,
): ProjectionDetail => {
  const decision = recordValue(review.decision);
  return {
    id,
    kind: "review",
    title: `${review.subjectType} review`,
    subtitle: review.subjectKey,
    status: review.status,
    sections: reviewDetailSectionsFor(review, decision),
    history: reviewDetailHistoryFor(rows, review),
    related: reviewDetailRelatedFor(review, decision),
  };
};

const buildReviewTransitionDetail = (
  transition: ProjectionRows["transitions"][number],
  id: string,
): ProjectionDetail => ({
  id,
  kind: "review",
  title: `Review case: ${String(transition.outcome)}`,
  subtitle: `Supply Source ${transition.supplySourceId}`,
  status: String(transition.toStage),
  sections: [
    {
      title: "Header",
      fields: [
        field("Case type", transition.outcome),
        field(
          "Supply Source",
          transition.supplySourceId,
          adminLink("sources", "source", transition.supplySourceId),
        ),
        field("Status", transition.toStage),
      ],
    },
    {
      title: "Priority and Supply Target impact",
      fields: [
        field("Command", transition.command),
        field("Generation", transition.generation),
        field("Sequence", transition.sequence),
      ],
    },
    {
      title: "Evidence and result",
      fields: [
        field("Reason codes", transition.reasonCodes.join(", ")),
        field("Evidence references", transition.evidenceRefs.join(", ")),
        field("Request hash", transition.requestHash),
        field("Result hash", transition.resultHash),
        field("Result", transition.resultJson),
      ],
    },
  ],
  history: [],
  related: [
    {
      id: transition.supplySourceId,
      kind: "SOURCE",
      label: transition.supplySourceId,
      status: String(transition.toStage),
      href: adminLink("sources", "source", transition.supplySourceId),
    },
  ],
});

const buildReviewDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const review = rows.approvals.find((item) => item.id === id);
  if (review) return buildReviewRecordDetail(review, rows, id);
  const job = rows.gatewayJobs.find((item) => item.id === id);
  if (job) return buildJobDetail(rows, id, new Date());
  const transition = rows.transitions.find((item) => item.id === id);
  return transition ? buildReviewTransitionDetail(transition, id) : null;
};

const candidateDetailSectionsFor = (
  candidate: ProjectionRows["candidates"][number],
  target: ProjectionRows["targets"][number] | undefined,
  sourceRootId: string | null,
  supplyRootId: string | null,
): ProjectionDetail["sections"] => [
  {
    title: "Header",
    fields: [
      field("Title", candidate.title),
      field("Listing kind", candidate.listingKind),
      field("Status", candidate.status),
      field("Sport", candidate.sportName),
      field("City", candidate.city),
    ],
  },
  {
    title: "Priority and target impact",
    fields: [
      field(
        "Target ID",
        target?.targetId,
        target ? adminLink("candidates", "target", target.id) : null,
      ),
      field("Target status", target?.status),
      field("Rejection reason", target?.rejectionReason),
      field("Freshness expiry", target?.freshnessExpiresAt),
    ],
  },
  {
    title: "Lineage",
    fields: [
      field(
        "Source",
        candidate.sourceId,
        sourceRootId ? adminLink("sources", "source", sourceRootId) : null,
      ),
      field(
        "Supply Source",
        supplyRootId,
        supplyRootId ? adminLink("sources", "source", supplyRootId) : null,
      ),
      field(
        "Run",
        candidate.runId,
        adminLink("sources", "scrapeRun", candidate.runId),
      ),
      field(
        "Mapping",
        candidate.mappingId,
        candidate.mappingId
          ? adminLink("sources", "mapping", candidate.mappingId)
          : null,
      ),
    ],
  },
  {
    title: "Evidence and result",
    fields: [
      field("Official action URL", candidate.officialActionUrl),
      field("Source URL", candidate.sourceUrl),
      field("Warnings", candidate.warnings.join(", ")),
    ],
  },
];

const candidateDetailHistoryFor = (
  rows: ProjectionRows,
  runId: string,
): ProjectionHistoryRow[] =>
  rows.scrapeRuns
    .filter((run) => run.id === runId)
    .map((run) => ({
      id: run.id,
      kind: "REFRESH",
      at: isoValue(run.finishedAt ?? run.createdAt),
      status: run.status,
      reason: run.errorMessage,
      actor: run.requestedByUserId,
      href: adminLink("sources", "scrapeRun", run.id),
    }));

const candidateDetailRelatedFor = (
  target: ProjectionRows["targets"][number] | undefined,
  supplyRootId: string | null,
): ProjectionRelatedRow[] => [
  ...(supplyRootId
    ? [
        {
          id: supplyRootId,
          kind: "SOURCE",
          label: supplyRootId,
          status: null,
          href: adminLink("sources", "source", supplyRootId),
        },
      ]
    : []),
  ...(target
    ? [
        {
          id: target.id,
          kind: "TARGET",
          label: target.targetId,
          status: target.status,
          href: adminLink("candidates", "target", target.id),
        },
      ]
    : []),
];

const buildCandidateDetail = (
  rows: ProjectionRows,
  id: string,
): ProjectionDetail | null => {
  const candidate = rows.candidates.find((item) => item.id === id);
  if (!candidate) return null;
  const target = rows.targets.find((item) => item.candidateId === id);
  const sourceRootId = rootIdForSource(rows, candidate.sourceId);
  const supplyRootId =
    rootIdForSource(rows, candidate.supplySourceId) ?? sourceRootId;
  return {
    id,
    kind: "candidate",
    title: candidate.title,
    subtitle: `${candidate.listingKind} candidate`,
    status: candidate.status,
    sections: candidateDetailSectionsFor(
      candidate,
      target,
      sourceRootId,
      supplyRootId,
    ),
    history: candidateDetailHistoryFor(rows, candidate.runId),
    related: candidateDetailRelatedFor(target, supplyRootId),
  };
};
const reconciliationRootIdForRelatedSource = (
  roots: readonly ProjectionRows["roots"][number][],
  sourceId: string,
): string | null =>
  roots.find((root) => root.id === sourceId || root.liveSourceId === sourceId)
    ?.id ?? null;

const reconciliationRootRelatedRowsFor = (
  root: ReconciliationRootEvidence,
  roots: readonly ProjectionRows["roots"][number][],
): ProjectionRelatedRow[] => {
  const relatedSource = (sourceId: string): ProjectionRelatedRow => {
    const rootId = reconciliationRootIdForRelatedSource(roots, sourceId);
    return {
      id: sourceId,
      kind: "SOURCE",
      label: sourceId,
      status: root.action,
      href: rootId ? adminLink("sources", "source", rootId) : null,
    };
  };
  const rows: ProjectionRelatedRow[] = [
    ...(root.existingRootId
      ? [relatedSource(root.existingRootId)]
      : []),
    ...root.sourceIds.map(relatedSource),
  ];
  return uniqueEvidence(rows, (row) => `${row.kind}:${row.id}`);
};
const reconciliationTargetProjectionRelatedRowsFor = (
  target: ReconciliationRootEvidence["targetProjections"][number],
  rows: ProjectionRows,
): ProjectionRelatedRow[] => {
  const targetRow = rows.targets.find((item) => item.id === target.sourceTargetId);
  const candidateRow =
    target.candidateId === null
      ? null
      : rows.candidates.find((item) => item.id === target.candidateId);
  const sourceTargetHref = targetRow
    ? adminLink("candidates", "target", targetRow.id)
    : null;
  const candidateHref = candidateRow
    ? adminLink("candidates", "candidate", candidateRow.id)
    : null;
  return [
    {
      id: target.sourceTargetId,
      kind: "TARGET",
      label: target.sourceTargetId,
      status: target.status,
      href: sourceTargetHref,
    },
    ...(target.candidateId
      ? [
          {
            id: target.candidateId,
            kind: "CANDIDATE",
            label: target.candidateId,
            status: target.status,
            href: candidateHref,
          },
        ]
      : []),
    {
      id: target.targetId,
      kind: "CANONICAL_TARGET",
      label: `${target.targetType}:${target.targetId}`,
      status: target.status,
      href: sourceTargetHref,
    },
  ];
};
const reconciliationClaimHrefFor = (
  claim: ReconciliationClaimEvidence,
): string | null => {
  switch (claim.kind) {
    case "GATEWAY_CLAIM":
      return adminLink("jobs", "claim", claim.id);
    case "MAPPING_JOB":
    case "COVERAGE_JOB":
      return adminLink("jobs", "job", claim.id);
    case "INTAKE_RUN":
      return adminLink("intake", "intakeRun", claim.id);
    case "APPROVAL_JOB":
      return adminLink("review", "review", claim.id);
    case "DISCOVERY_RUN":
      return adminLink("coverage", "discoveryRun", claim.id);
    case "MAPPING":
    case "SOURCE":
      return claim.supplySourceId
        ? adminLink("sources", "source", claim.supplySourceId)
        : null;
    default:
      return null;
  }
};

type ProjectionDetailCreator = (
  kind: AffiliateOperationsDetailType,
  title: string,
  subtitle: string,
  status: string | null,
  sections: ProjectionDetail["sections"],
  history: readonly ProjectionHistoryRow[],
  related?: readonly ProjectionRelatedRow[],
) => ProjectionDetail;

const createProjectionDetailFor = (
  id: string,
): ProjectionDetailCreator => (
  kind,
  title,
  subtitle,
  status,
  sections,
  history,
  related = [],
) => ({
  id,
  kind,
  title,
  subtitle,
  status,
  sections,
  history,
  related,
});

const buildScrapeRunAdditionalDetail = (
  rows: ProjectionRows,
  type: AffiliateOperationsDetailType,
  id: string,
): ProjectionDetail | null => {
  const create = createProjectionDetailFor(id);
  if (type === "scrapeRun") {
    const run = rows.scrapeRuns.find((item) => item.id === id);
    if (!run) return null;
    const candidates = rows.candidates.filter(
      (candidate) => candidate.runId === id,
    );
    const supplyRootId = rootIdForSource(
      rows,
      run.supplySourceId ?? run.sourceId,
    );
    return create(
      type,
      `Source refresh ${id}`,
      `Source ${run.sourceId}`,
      run.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Source",
              run.sourceId,
              supplyRootId
                ? adminLink("sources", "source", supplyRootId)
                : null,
            ),
            field(
              "Supply Source",
              supplyRootId,
              supplyRootId
                ? adminLink("sources", "source", supplyRootId)
                : null,
            ),
            field(
              "Mapping",
              run.mappingId,
              run.mappingId
                ? adminLink("sources", "mapping", run.mappingId)
                : null,
            ),
            field("Status", run.status),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Requested by", run.requestedByUserId),
            field("Started", run.startedAt),
            field("Finished", run.finishedAt),
            field("HTTP status", run.httpStatus),
            field("Item count", run.itemCount),
            field("Candidate count", run.candidateCount),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Fetched URL", run.fetchedUrl),
            field("Final URL", run.finalUrl),
            field("Error", run.errorMessage),
            field("Logs", run.logs),
            field("Metadata", run.metadata),
          ],
        },
      ],
      candidates.map((candidate) => ({
        id: candidate.id,
        kind: "CANDIDATE",
        at: isoValue(candidate.updatedAt),
        status: candidate.status,
        reason: candidate.warnings.join(", ") || null,
        actor: null,
        href: adminLink("candidates", "candidate", candidate.id),
      })),
      [
        ...(supplyRootId
          ? [
              {
                id: supplyRootId,
                kind: "SOURCE",
                label: supplyRootId,
                status: null,
                href: adminLink("sources", "source", supplyRootId),
              },
            ]
          : []),
        ...(run.mappingId
          ? [
              {
                id: run.mappingId,
                kind: "MAPPING",
                label: run.mappingId,
                status: null,
                href: adminLink("sources", "mapping", run.mappingId),
              },
            ]
          : []),
      ],
    );
  }
  return null;
};
const buildAdditionalDetail = (
  rows: ProjectionRows,
  type: AffiliateOperationsDetailType,
  id: string,
  recoveryRows: ProjectionRows = rows,
  now: Date = new Date(),
): ProjectionDetail | null => {
  const create = (
    kind: AffiliateOperationsDetailType,
    title: string,
    subtitle: string,
    status: string | null,
    sections: ProjectionDetail["sections"],
    history: readonly ProjectionHistoryRow[],
    related: readonly ProjectionRelatedRow[] = [],
  ): ProjectionDetail => ({
    id,
    kind,
    title,
    subtitle,
    status,
    sections,
    history,
    related,
  });


  const buildIntakeRunAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "intakeRun") {
    const run = rows.intakeRuns.find((item) => item.id === id);
    if (!run) return null;
    const pages = rows.pages.filter((page) =>
      run.requestedPageIds.includes(page.id),
    );
    const artifacts = rows.artifacts.filter(
      (artifact) => artifact.runId === id,
    );
    return create(
      type,
      `Capture run ${id}`,
      `Source Intake ${run.intakeId}`,
      run.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Intake",
              run.intakeId,
              adminLink("intake", "intake", run.intakeId),
            ),
            field(
              "Supply Source",
              run.supplySourceId,
              run.supplySourceId
                ? adminLink("sources", "source", run.supplySourceId)
                : null,
            ),
            field("Provider", run.provider),
            field("Status", run.status),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Queued", run.queuedAt),
            field("Started", run.startedAt),
            field("Claimed", run.claimedAt),
            field("Finished", run.finishedAt),
            field("Worker", run.workerId),
            field("Attempt", run.attemptCount),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Requested pages", run.requestedPageIds),
            field("Discovered URLs", run.discoveredUrlCount),
            field("Captured pages", run.capturedPageCount),
            field("Provider jobs", run.providerJobIds),
            field("Error", run.errorMessage),
            field("Summary", run.summary),
          ],
        },
      ],
      [],
      [
        {
          id: run.intakeId,
          kind: "INTAKE",
          label: run.intakeId,
          status: null,
          href: adminLink("intake", "intake", run.intakeId),
        },
        ...pages.map((page) => ({
          id: page.id,
          kind: "PAGE",
          label: page.canonicalUrl ?? page.url,
          status: page.status,
          href: adminLink("intake", "page", page.id),
        })),
        ...artifacts.map((artifact) => ({
          id: artifact.id,
          kind: "ARTIFACT",
          label: artifact.contentHash,
          status: artifact.isPinned ? "PINNED" : "RETAINED",
          href: adminLink("intake", "artifact", artifact.id),
        })),
      ],
    );
  }
    return null;
  };


  const buildPageAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "page") {
    const page = rows.pages.find((item) => item.id === id);
    if (!page) return null;
    return create(
      type,
      page.canonicalUrl ?? page.url,
      `Captured page ${id}`,
      page.status,
      [
        {
          title: "Header",
          fields: [
            field("URL", page.url),
            field("Canonical URL", page.canonicalUrl),
            field("Role", page.role),
            field("Status", page.status),
            field("Discovery source", page.discoverySource),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Robots status", page.robotsStatus),
            field("Robots checked", page.robotsCheckedAt),
            field("Robots notes", page.robotsNotes),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Target kind hints", page.targetKindHints),
            field("Metadata", page.metadata),
          ],
        },
      ],
      [],
      [
        {
          id: page.intakeId,
          kind: "INTAKE",
          label: page.intakeId,
          status: null,
          href: adminLink("intake", "intake", page.intakeId),
        },
        ...rows.intakeRuns
          .filter((run) => run.requestedPageIds.includes(id))
          .map((run) => ({
            id: run.id,
            kind: "CAPTURE",
            label: run.id,
            status: run.status,
            href: adminLink("intake", "intakeRun", run.id),
          })),
        ...rows.artifacts
          .filter((artifact) => artifact.pageId === id)
          .map((artifact) => ({
            id: artifact.id,
            kind: "ARTIFACT",
            label: artifact.contentHash,
            status: artifact.isPinned ? "PINNED" : "RETAINED",
            href: adminLink("intake", "artifact", artifact.id),
          })),
      ],
    );
  }
    return null;
  };


  const buildArtifactAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "artifact") {
    const artifact = rows.artifacts.find((item) => item.id === id);
    if (!artifact) return null;
    return create(
      type,
      `${artifact.kind} artifact`,
      `Intake artifact ${id}`,
      artifact.isPinned ? "PINNED" : "RETAINED",
      [
        {
          title: "Header",
          fields: [
            field("Kind", artifact.kind),
            field("Provider", artifact.provider),
            field("Source URL", artifact.sourceUrl),
            field("Final URL", artifact.finalUrl),
            field("HTTP status", artifact.httpStatus),
          ],
        },
        {
          title: "Execution",
          fields: [
            field(
              "Intake",
              artifact.intakeId,
              artifact.intakeId
                ? adminLink("intake", "intake", artifact.intakeId)
                : null,
            ),
            field(
              "Page",
              artifact.pageId,
              artifact.pageId
                ? adminLink("intake", "page", artifact.pageId)
                : null,
            ),
            field(
              "Run",
              artifact.runId,
              artifact.runId
                ? adminLink("intake", "intakeRun", artifact.runId)
                : null,
            ),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Content hash", artifact.contentHash),
            field("Dedupe key", artifact.dedupeKey),
            field("File ID", artifact.fileId),
            field("MIME type", artifact.mimeType),
            field("Size bytes", artifact.sizeBytes),
            field("Retain until", artifact.retainUntil),
            field("Metadata", artifact.metadata),
          ],
        },
      ],
      [],
      artifact.supplySourceId
        ? [
            {
              id: artifact.supplySourceId,
              kind: "SOURCE",
              label: artifact.supplySourceId,
              status: null,
              href: adminLink("sources", "source", artifact.supplySourceId),
            },
          ]
        : [],
    );
  }
    return null;
  };


  const buildOrganizationAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "organization") {
    const organization = rows.organizations.find((item) => item.id === id);
    if (!organization) {
      return create(
        type,
        `Organization ${id}`,
        "Organization evidence",
        null,
        [
          { title: "Header", fields: [field("Organization ID", id)] },
          {
            title: "Evidence and result",
            fields: [field("Organization record", "Not recorded")],
          },
        ],
        [],
      );
    }
    const intakes = rows.intakes.filter(
      (intake) => intake.organizationId === id,
    );
    const liveSources = rows.sources.filter(
      (source) => source.organizationId === id,
    );
    const rootIds = new Set(
      liveSources
        .map((source) => source.supplySourceId)
        .filter((sourceId): sourceId is string => Boolean(sourceId)),
    );
    const transitions = rows.transitions.filter((transition) =>
      rootIds.has(transition.supplySourceId),
    );
    return create(
      type,
      organization.name,
      `Organization ${id}`,
      String(organization.status),
      [
        {
          title: "Header",
          fields: [
            field("Name", organization.name),
            field("Location", organization.location),
            field("Website", organization.website),
            field("Status", organization.status),
          ],
        },
        {
          title: "Execution",
          fields: [
            field("Origin", organization.originType),
            field("Ownership", organization.ownershipStatus),
            field("Verification", organization.verificationStatus),
          ],
        },
        {
          title: "Lineage",
          fields: [
            field("Source records", liveSources.length),
            field("Source Intakes", intakes.length),
            field("Lifecycle transitions", transitions.length),
            field("Supply roots", rootIds.size),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Public slug", organization.publicSlug),
            field("Public page enabled", organization.publicPageEnabled),
            field("Public widgets enabled", organization.publicWidgetsEnabled),
            field("Created", organization.createdAt),
            field("Updated", organization.updatedAt),
          ],
        },
      ],
      [
        ...transitions.map((transition) => ({
          id: transition.id,
          kind: `LIFECYCLE ${transition.command}`,
          at: isoValue(transition.occurredAt),
          status: String(transition.toStage),
          reason: transition.reasonCodes.join(", ") || null,
          actor: transition.actorId,
          href: adminLink("sources", "source", transition.supplySourceId),
        })),
        ...intakes.map((intake) => ({
          id: intake.id,
          kind: "INTAKE",
          at: isoValue(intake.updatedAt ?? intake.createdAt),
          status: intake.status,
          reason: intake.complianceStatus,
          actor: null,
          href: adminLink("intake", "intake", intake.id),
        })),
      ],
      [
        ...Array.from(rootIds).map((rootId) => ({
          id: rootId,
          kind: "SOURCE",
          label: rootId,
          status: null,
          href: adminLink("sources", "source", rootId),
        })),
        ...intakes.map((intake) => ({
          id: intake.id,
          kind: "INTAKE",
          label: intake.name,
          status: intake.status,
          href: adminLink("intake", "intake", intake.id),
        })),
      ],
    );
  }
    return null;
  };


  const buildPackageAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "package") {
    const matchingReviews = rows.approvals.filter(
      (approval) => recordValue(approval.decision).packageHash === id,
    );
    const matchingJobs = rows.gatewayJobs.filter(
      (job) => recordValue(job.subjectJson).packageHash === id,
    );
    const evidenceReferences = [
      ...matchingReviews.flatMap((review) =>
        stringList(
          recordValue(review.decision).evidenceRefs ??
            recordValue(review.decision).candidateReviewEvidenceRefs,
        ),
      ),
      ...matchingJobs.flatMap((job) =>
        stringList(recordValue(job.evidenceManifestJson).evidenceRefs),
      ),
    ];
    return create(
      type,
      `Review package ${id}`,
      "Immutable package evidence",
      matchingReviews.length ? matchingReviews[0].status : null,
      [
        {
          title: "Header",
          fields: [
            field("Package hash", id),
            field("Review records", matchingReviews.length),
            field("Review jobs", matchingJobs.length),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field(
              "Package record",
              matchingReviews.length || matchingJobs.length
                ? "Recorded"
                : "Not recorded",
            ),
            field("Evidence references", evidenceReferences),
            field(
              "Approval decision payloads",
              matchingReviews.map((review) => review.decision),
            ),
            field(
              "Gateway evidence manifests",
              matchingJobs.map((job) => job.evidenceManifestJson),
            ),
            field(
              "Gateway results",
              matchingJobs.map((job) => job.resultJson),
            ),
          ],
        },
      ],
      matchingReviews.map((review) => ({
        id: review.id,
        kind: "REVIEW",
        at: isoValue(review.updatedAt),
        status: review.status,
        reason: review.errorMessage,
        actor: review.reviewerId,
        href: adminLink("review", "review", review.id),
      })),
    );
  }
    return null;
  };


  const buildEventAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "event") {
    const event = rows.gatewayEvents.find((item) => item.id === id);
    if (!event) return null;
    return create(
      type,
      `Gateway event ${event.eventType}`,
      `Event ${id}`,
      event.eventType,
      [
        {
          title: "Header",
          fields: [
            field("Event key", event.eventKey),
            field("Event type", event.eventType),
            field("Actor kind", event.actorKind),
            field("Actor", event.actorId),
            field("Role", event.role),
          ],
        },
        {
          title: "Generations",
          fields: [
            field("Sequence", event.sequence),
            field(
              "Claim",
              event.claimId,
              event.claimId ? adminLink("jobs", "claim", event.claimId) : null,
            ),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Reason codes", event.reasonCodes),
            field("Request hash", event.requestHash),
            field("Input hash", event.inputHash),
            field("Output hash", event.outputHash),
            field("Payload", event.payload),
            field("Retention class", event.retentionClass),
            field("Retention deadline", event.retentionDeadline),
          ],
        },
      ],
      [],
      [
        ...(event.jobId
          ? [
              {
                id: event.jobId,
                kind: "JOB",
                label: event.jobId,
                status: null,
                href: adminLink("jobs", "job", event.jobId),
              },
            ]
          : []),
        ...(event.receiptId
          ? [
              {
                id: event.receiptId,
                kind: "OPERATION",
                label: event.receiptId,
                status: null,
                href: adminLink("jobs", "operation", event.receiptId),
              },
            ]
          : []),
      ],
    );
  }
    return null;
  };


  const buildCoverageCellAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "coverageCell") {
    const cell = rows.coverageCells.find((item) => item.id === id);
    if (!cell) return null;
    const assessments = rows.coverageAssessments.filter(
      (item) => item.cellId === id,
    );
    return create(
      type,
      `${cell.cityId} / ${cell.sportName || cell.sportId}`,
      `Coverage Cell ${id}`,
      cell.coverageStatus,
      [
        {
          title: "Header",
          fields: [
            field("City", cell.cityId),
            field("Market", cell.marketKey),
            field("Sport", cell.sportName || cell.sportId),
            field("Profile", cell.profileKey),
            field("Cohort", cell.cohort),
          ],
        },
        {
          title: "Coverage state",
          fields: [
            field("Coverage status", cell.coverageStatus),
            field("Search status", cell.searchStatus),
            field("Gap severity", cell.gapSeverity),
            field("Priority score", cell.priorityScore),
            field("Population weight", cell.populationWeight),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Approved sources", cell.approvedSourceCount),
            field("Direct policy keys", cell.directPolicyKeyCount),
            field("Strategy families", cell.strategyFamilyCount),
            field("Unresolved leads", cell.unresolvedLeadCount),
            field("Next review", cell.nextReviewAt),
            field("Evidence", cell.evidence),
          ],
        },
      ],
      assessments.map((assessment) => ({
        id: assessment.id,
        kind: "ASSESSMENT",
        at: isoValue(assessment.createdAt),
        status: assessment.decision,
        reason: assessment.strategyFamilyKeys.join(", ") || null,
        actor: null,
        href: adminLink("coverage", "coverageCell", id),
        evidenceRefs: assessment.strategyKeys,
      })),
      [],
    );
  }
    return null;
  };


  const buildDemandAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "demand") {
    const demand = rows.demands.find((item) => item.id === id);
    if (!demand) return null;
    const waves = rows.waves.filter((wave) => wave.demandId === id);
    return create(
      type,
      targetLabel(demand.marketKey, demand.sportId, demand.sourceProfile),
      `Replenishment Demand ${id}`,
      demand.status,
      [
        {
          title: "Header",
          fields: [
            field("Target key", demand.targetKey),
            field("Market", demand.marketKey),
            field("Sport", demand.sportId),
            field("Source profile", demand.sourceProfile),
          ],
        },
        {
          title: "Contract and priority",
          fields: [
            field("Rollout cohort", demand.rolloutCohort),
            field("Contract version", demand.contractVersion),
            field(
              "Minimum fresh published supply",
              demand.minimumFreshPublishedSupply,
            ),
            field(
              "Observed fresh published supply",
              demand.observedFreshPublishedSupply,
            ),
            field("Priority", demand.priority),
          ],
        },
        {
          title: "Eligibility and evidence",
          fields: [
            field("Status", demand.status),
            field("Opened", demand.openedAt),
            field("Closed", demand.closedAt),
            field("Next eligible", demand.nextEligibleAt),
            field("Search saturated until", demand.searchSaturatedUntil),
            field("Reason codes", demand.reasonCodes.join(", ")),
            field("Evidence", demand.evidenceJson),
          ],
        },
      ],
      waves.map((wave) => ({
        id: wave.id,
        kind: "REPLENISHMENT WAVE",
        at: isoValue(wave.startedAt ?? wave.createdAt),
        status: wave.status,
        reason: wave.errorCode,
        actor: null,
        href: adminLink("coverage", "wave", wave.id),
        evidenceRefs: wave.evidenceRefs,
      })),
      waves.map((wave) => ({
        id: wave.id,
        kind: "WAVE",
        label: wave.id,
        status: wave.status,
        href: adminLink("coverage", "wave", wave.id),
      })),
    );
  }
    return null;
  };


  const buildWaveAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "wave") {
    const wave = rows.waves.find((item) => item.id === id);
    if (!wave) return null;
    return create(
      type,
      `Replenishment Wave ${id}`,
      `Demand ${wave.demandId}`,
      wave.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Demand",
              wave.demandId,
              adminLink("coverage", "demand", wave.demandId),
            ),
            field("Cohort", wave.rolloutCohort),
            field("Status", wave.status),
            field("Generation", wave.demandGeneration),
          ],
        },
        {
          title: "Execution",
          fields: [
            field(
              "Campaign",
              wave.campaignId,
              adminLink("coverage", "campaign", wave.campaignId),
            ),
            field(
              "Coverage planning job",
              wave.coveragePlanningJobId,
              adminLink("jobs", "job", wave.coveragePlanningJobId),
            ),
            field("Provider", wave.provider),
            field("Provider operation key", wave.providerOperationKey),
            field("Retry at", wave.retryAt),
            field("Terminal at", wave.terminalAt),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Marginal yield", wave.marginalYield),
            field("Error code", wave.errorCode),
            field("Evidence references", wave.evidenceRefs.join(", ")),
            field("Result", wave.resultJson),
          ],
        },
      ],
      rows.gatewayEvents
        .filter((event) => recordValue(event.payload).waveId === id)
        .map((event) => ({
          id: event.id,
          kind: `GATEWAY ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: null,
          reason: event.reasonCodes.join(", ") || null,
          actor: event.actorId,
          href: adminLink("jobs", "job", event.jobId),
          inputHash: event.inputHash,
          outputHash: event.outputHash,
        })),
      [
        {
          id: wave.demandId,
          kind: "DEMAND",
          label: wave.demandId,
          status: null,
          href: adminLink("coverage", "demand", wave.demandId),
        },
        ...(wave.campaignId
          ? [
              {
                id: wave.campaignId,
                kind: "CAMPAIGN",
                label: wave.campaignId,
                status: null,
                href: adminLink("coverage", "campaign", wave.campaignId),
              },
            ]
          : []),
      ],
    );
  }
    return null;
  };


  const buildCampaignAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "campaign") {
    const campaign = rows.campaigns.find((item) => item.id === id);
    if (!campaign) return null;
    const runs = rows.discoveryRuns.filter((run) => run.campaignId === id);
    return create(
      type,
      campaign.name,
      `Discovery Campaign ${id}`,
      campaign.status,
      [
        {
          title: "Header",
          fields: [
            field("Name", campaign.name),
            field("Region", campaign.region),
            field("Location", campaign.location),
            field("Sport IDs", campaign.sportIds),
          ],
        },
        {
          title: "Schedule and limits",
          fields: [
            field("Status", campaign.status),
            field("Last run", campaign.lastRunAt),
            field("Next run", campaign.nextRunAt),
            field("Queries per run", campaign.maxQueriesPerRun),
            field("Results per query", campaign.maxResultsPerQuery),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Source type hints", campaign.sourceTypeHints),
            field("Coverage fingerprint", campaign.coverageFingerprint),
            field("Query cursor", campaign.queryCursor),
            field("Metadata", campaign.metadata),
          ],
        },
      ],
      runs.map((run) => ({
        id: run.id,
        kind: "DISCOVERY RUN",
        at: isoValue(run.finishedAt ?? run.createdAt),
        status: run.status,
        reason: run.errorMessage,
        actor: run.workerId,
        href: adminLink("coverage", "discoveryRun", run.id),
      })),
    );
  }
    return null;
  };


  const buildDiscoveryRunAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "discoveryRun") {
    const run = rows.discoveryRuns.find((item) => item.id === id);
    if (!run) return null;
    const queries = rows.discoveryQueries.filter((query) => query.runId === id);
    return create(
      type,
      `Discovery Run ${id}`,
      `Campaign ${run.campaignId}`,
      run.status,
      [
        {
          title: "Header",
          fields: [
            field(
              "Campaign",
              run.campaignId,
              adminLink("coverage", "campaign", run.campaignId),
            ),
            field("Status", run.status),
            field("Requested by", run.requestedByUserId),
            field("Worker", run.workerId),
          ],
        },
        {
          title: "Timing and retry",
          fields: [
            field("Queued", run.queuedAt),
            field("Started", run.startedAt),
            field("Finished", run.finishedAt),
            field("Claimed", run.claimedAt),
            field("Attempt", run.attemptCount),
          ],
        },
        {
          title: "Evidence and result",
          fields: [
            field("Generated queries", run.generatedQueryCount),
            field("Returned results", run.returnedResultCount),
            field("New results", run.newResultCount),
            field("Duplicates", run.duplicateCount),
            field("Rejected", run.rejectedCount),
            field("Created intakes", run.createdIntakeCount),
            field("Provider job IDs", run.providerJobIds),
            field("Error", run.errorMessage),
            field("Summary", run.summary),
          ],
        },
      ],
      queries.map((query) => ({
        id: query.id,
        kind: "QUERY",
        at: isoValue(query.createdAt),
        status: query.status,
        reason: query.errorCode,
        actor: query.provider,
        href: adminLink("coverage", "discoveryQuery", query.id),
      })),
    );
  }
    return null;
  };

  const buildDiscoveryQueryAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "discoveryQuery") {
    const query = rows.discoveryQueries.find((item) => item.id === id);
    if (!query) return null;
    const results = rows.discoveryResults.filter(
      (result) =>
        result.campaignId === query.campaignId &&
        result.latestRunId === query.runId &&
        result.latestQuery === query.queryText,
    );
    return create(
      type,
      query.queryText,
      `Discovery Query ${id}`,
      query.status,
      [
        {
          title: "Lineage",
          fields: [
            field(
              "Campaign",
              query.campaignId,
              adminLink("coverage", "campaign", query.campaignId),
            ),
            field(
              "Run",
              query.runId,
              adminLink("coverage", "discoveryRun", query.runId),
            ),
            field("Query key", query.queryKey),
          ],
        },
        {
          title: "Target",
          fields: [
            field("City", query.targetCity),
            field("State", query.targetState),
            field("Sport", query.sportName || query.sportId),
            field("Profile", query.profileKey),
            field("Strategy", query.strategyKey),
            field("Strategy family", query.strategyFamilyKey),
          ],
        },
        {
          title: "Provider result",
          fields: [
            field("Provider", query.provider),
            field("Status", query.status),
            field("Returned results", query.returnedResultCount),
            field("Qualified direct sources", query.qualifiedDirectCount),
            field(
              "New qualified policy keys",
              query.newQualifiedPolicyKeyCount,
            ),
            field("Intakes created", query.intakeCreatedCount),
            field("Duplicates", query.duplicateCount),
            field("Rejected", query.rejectedCount),
            field("Error", query.errorCode),
          ],
        },
        {
          title: "Evidence",
          fields: [
            field("Qualified policy keys", query.qualifiedPolicyKeys),
            field("New qualified policy keys", query.newQualifiedPolicyKeys),
            field("Metadata", query.metadata),
            field("Created", query.createdAt),
            field("Updated", query.updatedAt),
          ],
        },
      ],
      [],
      results.map((result) => ({
        id: result.id,
        kind: "RESULT",
        label: result.canonicalUrl,
        status: result.status,
        href: adminLink("coverage", "discoveryResult", result.id),
      })),
    );
  }
    return null;
  };


  const buildDiscoveryResultAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "discoveryResult") {
    const result = rows.discoveryResults.find((item) => item.id === id);
    if (!result) return null;
    const matchingSourceRootId = rootIdForSource(rows, result.matchingSourceId);
    const supplyRootId =
      rootIdForSource(rows, result.supplySourceId) ?? matchingSourceRootId;
    return create(
      type,
      result.title ?? result.canonicalUrl,
      `Discovery Result ${id}`,
      result.status,
      [
        {
          title: "Identity",
          fields: [
            field("Original URL", result.originalUrl),
            field("Canonical URL", result.canonicalUrl),
            field("Policy key", result.policyKey),
            field("Title", result.title),
            field("Description", result.description),
          ],
        },
        {
          title: "Discovery evidence",
          fields: [
            field(
              "Latest run",
              result.latestRunId,
              adminLink("coverage", "discoveryRun", result.latestRunId),
            ),
            field("Latest query", result.latestQuery),
            field("First seen", result.firstSeenAt),
            field("Last seen", result.lastSeenAt),
            field("Seen count", result.seenCount),
            field("Rank", result.latestRank),
            field("Score", result.score),
            field("Reason codes", result.reasonCodes),
            field("Reason details", result.reasonDetails),
          ],
        },
        {
          title: "Lineage and result",
          fields: [
            field(
              "Matching intake",
              result.matchingIntakeId,
              adminLink("intake", "intake", result.matchingIntakeId),
            ),
            field(
              "Matching source",
              result.matchingSourceId,
              matchingSourceRootId
                ? adminLink("sources", "source", matchingSourceRootId)
                : null,
            ),
            field(
              "Supply Source",
              supplyRootId,
              supplyRootId
                ? adminLink("sources", "source", supplyRootId)
                : null,
            ),
            field(
              "Organization",
              result.matchingOrganizationId,
              result.matchingOrganizationId
                ? adminLink(
                    "sources",
                    "organization",
                    result.matchingOrganizationId,
                  )
                : null,
            ),
            field("Status", result.status),
            field("Metadata", result.metadata),
          ],
        },
      ],
      [],
    );
  }
    return null;
  };


  const buildTargetAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "target") {
    const target = rows.targets.find((item) => item.id === id);
    if (!target) return null;
    const publicTarget = publicTargetProjection(target, rows);
    return create(
      type,
      target.targetId ?? target.targetType,
      `Supply Target ${id}`,
      target.status,
      [
        {
          title: "Identity",
          fields: [
            field("Target type", target.targetType),
            field("Target ID", target.targetId),
            field("Market", target.marketKey),
            field("Sport", target.sportId),
            field("Source profile", target.sourceProfile),
          ],
        },
        {
          title: "Publication and freshness",
          fields: [
            field("Status", target.status),
            field("Public target exists", publicTarget.publicTargetExists),
            field("Public target state", publicTarget.publicTargetState),
            field("Public target name", publicTarget.publicTargetName),
            field(
              "Public target link",
              publicTarget.publicTargetHref,
              publicTarget.publicTargetHref,
            ),
            field("Published at", target.publishedAt),
            field("Last successful refresh", target.lastSuccessfulRefreshAt),
            field("Freshness expires", target.freshnessExpiresAt),
            field("Rejected at", target.rejectedAt),
            field("Rejection reason", target.rejectionReason),
          ],
        },
        {
          title: "Lineage and evidence",
          fields: [
            field(
              "Supply Source",
              target.supplySourceId,
              adminLink("sources", "source", target.supplySourceId),
            ),
            field(
              "Candidate",
              target.candidateId,
              adminLink("candidates", "candidate", target.candidateId),
            ),
            field("Evidence references", target.evidenceRefs.join(", ")),
            field("Evidence hash", target.evidenceHash),
            field("Metadata", target.metadata),
          ],
        },
      ],
      rows.transitions
        .filter(
          (transition) => transition.supplySourceId === target.supplySourceId,
        )
        .map((transition) => ({
          id: transition.id,
          kind: `LIFECYCLE ${transition.command}`,
          at: isoValue(transition.occurredAt),
          status: String(transition.toStage),
          reason: transition.reasonCodes.join(", ") || null,
          actor: transition.actorId,
          href: adminLink("sources", "source", target.supplySourceId),
          evidenceRefs: transition.evidenceRefs,
        })),
    );
  }
    return null;
  };


  const buildMappingAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "mapping") {
    const mapping = rows.mappings.find((item) => item.id === id);
    if (!mapping) return null;
    const jobs = rows.mappingJobs.filter((job) => job.mappingId === id);
    return create(
      type,
      `Mapping ${id}`,
      `Source ${mapping.sourceId}`,
      mapping.isActive ? "ACTIVE" : "RETIRED",
      [
        {
          title: "Header",
          fields: [
            field("Source", mapping.sourceId),
            field(
              "Supply Source",
              mapping.supplySourceId,
              adminLink("sources", "source", mapping.supplySourceId),
            ),
            field("Version", mapping.version),
            field("Active", mapping.isActive),
            field("Created by", mapping.createdByUserId),
            field("Validated at", mapping.validatedAt),
          ],
        },
        {
          title: "Mapping and evidence",
          fields: [
            field("Mapping", mapping.mapping),
            field("Notes", mapping.notes),
          ],
        },
      ],
      jobs.map((job) => ({
        id: job.id,
        kind: "MAPPING JOB",
        at: isoValue(job.finishedAt ?? job.createdAt),
        status: job.status,
        reason: job.errorMessage,
        actor: job.workerId,
        href: adminLink("jobs", "job", job.id),
      })),
    );
  }
    return null;
  };


  const buildClaimAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "claim") {
    const claim = rows.gatewayClaims.find((item) => item.id === id);
    if (!claim) return null;
    return create(
      type,
      `Claim ${id}`,
      `Job ${claim.jobId}`,
      String(claim.status),
      [
        {
          title: "Header",
          fields: [
            field("Job", claim.jobId, adminLink("jobs", "job", claim.jobId)),
            field("Queue", claim.queue),
            field("Lane", claim.lane),
            field("Role", claim.role),
            field("Worker", claim.workerId),
            field("Invocation", claim.invocationId),
          ],
        },
        {
          title: "Generations and lease",
          fields: [
            field("Claim generation", claim.claimGeneration),
            field("Lifecycle generation", claim.lifecycleGeneration),
            field("Status", claim.status),
            field("Claimed", claim.claimedAt),
            field("Last heartbeat", claim.lastHeartbeatAt),
            field("Lease expires", claim.leaseExpiresAt),
            field("Hard deadline", claim.hardDeadlineAt),
            field("Ended", claim.endedAt),
          ],
        },
        {
          title: "Safe failure",
          fields: [
            field("Failure code", claim.safeFailureCode),
            field("Failure summary", claim.safeFailureSummary),
            field("Terminal receipt", claim.terminalReceiptId),
          ],
        },
      ],
      rows.gatewayEvents
        .filter((event) => event.claimId === id)
        .map((event) => ({
          id: event.id,
          kind: `EVENT ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: null,
          reason: event.reasonCodes.join(", ") || null,
          actor: event.actorId,
          href: adminLink("jobs", "job", claim.jobId),
          claimGeneration: claim.claimGeneration,
          inputHash: event.inputHash,
          outputHash: event.outputHash,
        })),
    );
  }
    return null;
  };


  const buildWorkerAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "worker") {
    const worker = rows.workerHealth.find((item) => item.id === id);
    if (!worker) return null;
    const claims = rows.gatewayClaims.filter(
      (claim) => claim.workerId === worker.workerId,
    );
    return create(
      type,
      worker.workerId,
      `Worker ${worker.role}`,
      worker.status,
      [
        {
          title: "Health",
          fields: [
            field("Worker ID", worker.workerId),
            field("Role", worker.role),
            field("Status", worker.status),
            field("Heartbeat", worker.heartbeatAt),
            field("Lease expires", worker.leaseExpiresAt),
          ],
        },
        {
          title: "Metadata",
          fields: [
            field("Metadata", worker.metadata),
            field("Created", worker.createdAt),
            field("Updated", worker.updatedAt),
          ],
        },
      ],
      claims.map((claim) => ({
        id: claim.id,
        kind: "CLAIM",
        at: isoValue(claim.claimedAt),
        status: String(claim.status),
        reason: claim.safeFailureCode,
        actor: claim.workerId,
        href: adminLink("jobs", "claim", claim.id),
      })),
    );
  }
    return null;
  };


  const buildOperationAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "operation") {
    const receipt = rows.receipts.find((item) => item.id === id);
    if (!receipt) return null;
    return create(
      type,
      `${receipt.operationKind} operation`,
      `Receipt ${id}`,
      String(receipt.status),
      [
        {
          title: "Header",
          fields: [
            field("Operation kind", receipt.operationKind),
            field("Command", receipt.commandName),
            field(
              "Job",
              receipt.jobId,
              adminLink("jobs", "job", receipt.jobId),
            ),
            field(
              "Claim",
              receipt.claimId,
              adminLink("jobs", "claim", receipt.claimId),
            ),
            field("Claim generation", receipt.claimGeneration),
          ],
        },
        {
          title: "Hashes and external operation",
          fields: [
            field("Idempotency key", receipt.idempotencyKey),
            field("Request hash", receipt.requestHash),
            field("Response hash", receipt.responseHash),
            field("External operation key", receipt.externalOperationKey),
          ],
        },
        {
          title: "Timing and result",
          fields: [
            field("Status", receipt.status),
            field("Started", receipt.startedAt),
            field("Completed", receipt.completedAt),
            field("Reconcile after", receipt.reconcileAfter),
            field("Safe error code", receipt.safeErrorCode),
            field("Retention class", receipt.retentionClass),
            field("Retention deadline", receipt.retentionDeadline),
          ],
        },
      ],
      rows.gatewayEvents
        .filter((event) => event.receiptId === id)
        .map((event) => ({
          id: event.id,
          kind: `EVENT ${event.eventType}`,
          at: isoValue(event.createdAt),
          status: null,
          reason: event.reasonCodes.join(", ") || null,
          actor: event.actorId,
          href: adminLink("jobs", "operation", id),
          inputHash: event.inputHash,
          outputHash: event.outputHash,
        })),
    );
  }
    return null;
  };


  const buildTransitionAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "transition") {
    const transition = rows.transitions.find((item) => item.id === id);
    if (!transition) return null;
    return create(
      type,
      `Lifecycle ${transition.command}`,
      `Supply Source ${transition.supplySourceId}`,
      String(transition.toStage),
      [
        {
          title: "Transition",
          fields: [
            field(
              "Supply Source",
              transition.supplySourceId,
              adminLink("sources", "source", transition.supplySourceId),
            ),
            field("Sequence", transition.sequence),
            field("Generation", transition.generation),
            field("From", transition.fromStage),
            field("To", transition.toStage),
            field("Outcome", transition.outcome),
          ],
        },
        {
          title: "Command and actor",
          fields: [
            field("Command", transition.command),
            field("Command reference", transition.commandRef),
            field("Actor kind", transition.actorKind),
            field("Actor", transition.actorId),
            field("Executing agent", transition.executingAgentId),
            field("Contract version", transition.contractVersion),
          ],
        },
        {
          title: "Evidence and hashes",
          fields: [
            field("Reason codes", transition.reasonCodes.join(", ")),
            field("Evidence references", transition.evidenceRefs.join(", ")),
            field("Request hash", transition.requestHash),
            field("Result hash", transition.resultHash),
            field("Request", transition.requestJson),
            field("Result", transition.resultJson),
          ],
        },
      ],
      [],
      [
        {
          id: transition.supplySourceId,
          kind: "SOURCE",
          label: transition.supplySourceId,
          status: String(transition.toStage),
          href: adminLink("sources", "source", transition.supplySourceId),
        },
      ],
    );
  }
    return null;
  };


  const reconciliationRunFor = () =>
    rows.reconciliationRuns.find((item) => item.id === id)
    ?? (rows.selectedReconciliationRun?.id === id
      ? rows.selectedReconciliationRun
      : undefined);

  const buildReconciliationRunAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "reconciliationRun") {
    const run = reconciliationRunFor();
    if (!run) return null;
    const reportEvidence = reconciliationReportEvidenceFor(run);
    const detailEvidence = reconciliationReportEvidenceFor(run, true);
    const reportHref = adminLink("cutover", "reconciliationRun", run.id);
    const processHistory: ProjectionHistoryRow[] = detailEvidence.processes.map(
      (process) => ({
        id: `${run.id}:process:${process.kind}:${process.id}`,
        kind: `PROCESS ${process.kind}`,
        at: detailEvidence.evaluatedAt,
        status: process.status,
        reason: process.command,
        actor: process.workerId ?? process.role,
        href: reportHref,
        evidenceRefs: [process.id],
      }),
    );
    const findingHistory = (
      findings: readonly ReconciliationFindingEvidence[],
      kind: string,
    ): ProjectionHistoryRow[] =>
      findings.map((finding, index) => ({
        id: `${run.id}:${kind}:${finding.code}:${index}`,
        kind: `${kind} ${finding.code}`,
        at: detailEvidence.evaluatedAt,
        status: finding.severity,
        reason: finding.detail,
        actor: run.operatorId,
        href: reportHref,
        evidenceRefs: finding.recordIds,
      }));
    const recordHistory: ProjectionHistoryRow[] =
      detailEvidence.recordEvidence.map((record) => ({
        id: `${run.id}:record:${record.kind}:${record.id}`,
        kind: record.kind,
        at: record.at ?? detailEvidence.evaluatedAt,
        status: record.status,
        reason: record.detail,
        actor: run.operatorId,
        href: reportHref,
        evidenceRefs: record.refs,
      }));
    const rootHistory: ProjectionHistoryRow[] = detailEvidence.roots.flatMap(
      (root, index) => [
        {
          id: `${run.id}:root:${index}:${root.existingRootId ?? root.identityKey ?? "unknown"}`,
          kind: "ROOT PLAN",
          at: detailEvidence.evaluatedAt,
          status: root.derivedStage,
          reason: root.canonicalUrl ?? root.identityKey,
          actor: run.operatorId,
          href: reportHref,
          evidenceRefs: boundedEvidenceList([
            ...root.sourceIds,
            ...root.recordIds,
            ...root.evidenceRefs,
          ]),
        },
        ...root.targetProjections.map((target) => ({
          id: `${run.id}:target:${target.sourceTargetId}:${target.targetId}`,
          kind: `TARGET ${target.targetType}`,
          at: detailEvidence.evaluatedAt,
          status: target.status,
          reason: target.action,
          actor: run.operatorId,
          href: reportHref,
          evidenceRefs: target.evidenceRefs,
        })),
      ],
    );
    const claimHistory: ProjectionHistoryRow[] =
      detailEvidence.claimActions.map((claim) => ({
        id: `${run.id}:claim:${claim.kind}:${claim.id}`,
        kind: `CLAIM ${claim.kind}`,
        at: detailEvidence.evaluatedAt,
        status: claim.status,
        reason: claim.action,
        actor: run.operatorId,
        href: reportHref,
        evidenceRefs: claim.evidenceRefs,
      }));
    const preflightHistory: ProjectionHistoryRow[] = [
      ...(detailEvidence.preflight?.reviewedSystemdUnits.map((unit) => ({
        id: `${run.id}:systemd:${unit.processId}:${unit.unitId}`,
        kind: "PREFLIGHT SYSTEMD",
        at: detailEvidence.preflight?.evaluatedAt ?? detailEvidence.evaluatedAt,
        status: null,
        reason: unit.unitId,
        actor: unit.processId,
        href: reportHref,
        evidenceRefs: [unit.processId, unit.unitId],
      })) ?? []),
      ...(detailEvidence.preflight?.legacyServiceUnits.map((unit) => ({
        id: `${run.id}:service:${unit.id}`,
        kind: "PREFLIGHT SERVICE",
        at: detailEvidence.preflight?.evaluatedAt ?? detailEvidence.evaluatedAt,
        status: unit.isActive,
        reason: `${unit.isEnabled}/${unit.isActive}`,
        actor: run.operatorId,
        href: reportHref,
        evidenceRefs: [unit.id],
      })) ?? []),
    ];
    const history = [
      {
        id: run.id,
        kind: `${run.mode} REPORT`,
        at: isoValue(run.updatedAt ?? run.createdAt),
        status: run.status,
        reason: null,
        actor: run.operatorId,
        href: reportHref,
        inputHash: run.inputHash,
        outputHash: run.outputHash,
      },
      ...processHistory,
      ...rootHistory,
      ...claimHistory,
      ...findingHistory(detailEvidence.blockingFindings, "BLOCKING"),
      ...findingHistory(detailEvidence.warnings, "WARNING"),
      ...findingHistory(detailEvidence.resolutions, "RESOLUTION"),
      ...recordHistory,
      ...preflightHistory,
    ].sort(compareProjectionTimestampIdAttempt);
    const relatedFor = (): ProjectionRelatedRow[] =>
      uniqueEvidence(
        [
          ...(detailEvidence.sessionId && detailEvidence.sessionId !== run.id
            ? [
                {
                  id: detailEvidence.sessionId,
                  kind: "CUTOVER_SESSION",
                  label: detailEvidence.sessionId,
                  status: null,
                  href: adminLink(
                    "cutover",
                    "reconciliationRun",
                    detailEvidence.sessionId,
                  ),
                },
              ]
            : []),
          ...detailEvidence.roots.flatMap((root) => [
            ...reconciliationRootRelatedRowsFor(root, rows.roots),
            ...root.targetProjections.flatMap((target) =>
              reconciliationTargetProjectionRelatedRowsFor(target, rows),
            ),
          ]),
          ...detailEvidence.claimActions.map((claim) => ({
            id: claim.id,
            kind: "CLAIM",
            label: claim.id,
            status: claim.action ?? claim.status,
            href: reconciliationClaimHrefFor(claim),
          })),
          ...detailEvidence.recordEvidence.map((record) => ({
            id: record.id,
            kind: record.kind,
            label: record.id,
            status: record.status,
            href: reportHref,
          })),
        ],
        (record) => `${record.kind}:${record.id}`,
      );
    const related = relatedFor();
    const reconciliationFindingFields = (): ProjectionField[] => [
      field("Counts", reportEvidence.counts),
      field("Records by kind", reportEvidence.recordsByKind),
      field("Apply safe", reportEvidence.isApplySafe),
      field(
        "Blocking findings count",
        reportEvidence.evidencePagination.blockingFindings.total,
      ),
      field("Blocking findings preview", reportEvidence.blockingFindings.length
        ? reportEvidence.blockingFindings
        : null),
      field(
        "Warnings count",
        reportEvidence.evidencePagination.warnings.total,
      ),
      field("Warnings preview", reportEvidence.warnings.length
        ? reportEvidence.warnings
        : null),
      field(
        "Resolutions count",
        reportEvidence.evidencePagination.resolutions.total,
      ),
      field("Resolutions preview", reportEvidence.resolutions.length
        ? reportEvidence.resolutions
        : null),
    ];
    const preflightSectionFor = (
      preflight: typeof reportEvidence.preflight,
    ): ProjectionDetail["sections"][number] => {
      const preflightEvidence =
        preflight ?? ({} as NonNullable<typeof preflight>);
      return {
        title: "Cutover session preflight",
        fields: [
          field("Preflight evaluated at", preflightEvidence.evaluatedAt),
          field("Preflight ready", preflightEvidence.isReady),
          field("Gateway version", preflightEvidence.gatewayVersion),
          field(
            "Reviewed manifest hash",
            preflightEvidence.reviewedLegacyProcessManifestHash,
          ),
          field(
            "Reviewed manifest count",
            preflightEvidence.reviewedLegacyProcessManifestCount,
          ),
          field(
            "Reviewed manifest artifact",
            preflightEvidence.reviewedLegacyProcessManifestArtifactId,
          ),
          field(
            "Process inventory artifact",
            preflightEvidence.processInventoryArtifactId,
          ),
          field("Process inventory hash", preflightEvidence.processInventoryHash),
          field("Process inventory count", preflightEvidence.processInventoryCount),
          field(
            "Reviewed systemd units",
            preflightEvidence.reviewedSystemdUnits,
          ),
          field(
            "Legacy service units",
            preflightEvidence.legacyServiceUnits,
          ),
          field("Preflight counts", preflightEvidence.counts),
          field("Preflight records by kind", preflightEvidence.recordsByKind),
          field(
            "Reviewed agent network",
            preflightEvidence.reviewedAgentNetwork,
          ),
        ],
      };
    };

    const firstDefinedFor = (left: unknown, right: unknown): unknown =>
      left ?? right;
    const previewFieldFor = (
      label: string,
      values: readonly unknown[],
    ): ProjectionField => field(label, values.length > 0 ? values : null);

    const sectionsFor = (): ProjectionDetail["sections"] => [
        {
          title: "Header",
          fields: [
            field("Mode", run.mode),
            field("Status", run.status),
            field("Operator", run.operatorId),
            field("Rollout cohort", run.rolloutCohort),
            field("Created", run.createdAt),
            field("Updated", run.updatedAt),
            field("Applied at", run.appliedAt),
            field("Applied by", run.appliedBy),
          ],
        },
        {
          title: "Hashes and contracts",
          fields: [
            field("Input hash", firstDefinedFor(reportEvidence.inputHash, run.inputHash)),
            field("Output hash", firstDefinedFor(reportEvidence.outputHash, run.outputHash)),
            field("Report hash", firstDefinedFor(reportEvidence.reportHash, run.reportHash)),
            field("Legacy snapshot hash", reportEvidence.legacySnapshotHash),
            field("Session ID", reportEvidence.sessionId),
            field("Session hash", reportEvidence.sessionHash),
            field("Evidence hash", reportEvidence.evidenceHash),
            field("Supply Contract version", reportEvidence.supplyContractVersion),
            field("Supply Contract hash", reportEvidence.supplyContractHash),
            field("Deployment Contract version", reportEvidence.deploymentContractVersion),
            field("Deployment Contract hash", reportEvidence.deploymentContractHash),
          ],
        },
        {
          title: "Counts and findings",
          fields: reconciliationFindingFields(),
        },
        {
          title: "Stopped-fleet process evidence",
          fields: [
            field("Evaluated at", reportEvidence.evaluatedAt),
            field(
              "Process count",
              reportEvidence.evidencePagination.processes.total,
            ),
            previewFieldFor("Processes preview", reportEvidence.processes),
            field("Evidence complete", reportEvidence.evidenceComplete),
            field("Decision mode", reportEvidence.decisionMode),
            field("Decision reason", reportEvidence.decisionReasonCode),
            field("Decision detail", reportEvidence.decisionDetail),
            field("Decision resolution", reportEvidence.decisionResolution),
          ],
        },
        preflightSectionFor(reportEvidence.preflight),
        {
          title: "Reconciliation evidence",
          fields: [
            field("Evidence pagination", reportEvidence.evidencePagination),
            previewFieldFor("Root plans", reportEvidence.roots),
            previewFieldFor("Claim actions", reportEvidence.claimActions),
          ],
        },
    ];
    return create(
      type,
      `${run.mode} reconciliation`,
      `Reconciliation run ${run.id}`,
      run.status,
      sectionsFor(),
      history,
      related,
    );
  }
    return null;
  };
const alertRecoveryBaseRelatedRowsFor = (
  alert: OperationalAlertRecoveryAlert,
  recoveryRows: OperationalAlertRecoveryRows,
): ProjectionRelatedRow[] => {
  const payload = recordValue(alert.payload);
  const sourceEventKey = stringValue(payload.sourceEventKey);
  const sourceAlert = recoveryRows.operationalAlerts.find(
    (candidate) =>
      candidate.id !== alert.id && candidate.eventKey === sourceEventKey,
  );
  const sourceRows = sourceAlert
    ? [
        {
          id: sourceAlert.id,
          kind: "SOURCE_ALERT" as const,
          label: sourceAlert.eventKey,
          status: sourceAlert.category,
          href: adminLinkForOperationalAlert(sourceAlert, recoveryRows),
        },
      ]
    : [];
  const recoveryJobId = alertJobIdFor(alert, payload);
  const recoveryJob = recoveryRows.gatewayJobs.find(
    (candidate) => candidate.id === recoveryJobId,
  );
  const jobRows = recoveryJob
    ? [
        {
          id: recoveryJob.id,
          kind: "GATEWAY_JOB" as const,
          label: recoveryJob.id,
          status: String(recoveryJob.status),
          href: adminLink("jobs", "job", recoveryJob.id),
        },
      ]
    : [];
  return [...sourceRows, ...jobRows];
};

const alertRecoveryEvidenceRelatedRowFor = (
  evidenceRef: string,
  recoveryRows: OperationalAlertRecoveryRows,
): ProjectionRelatedRow | null => {
  const delivery = recoveryRows.alertDeliveries.find(
    (candidate) => candidate.id === evidenceRef,
  );
  if (delivery) {
    const deliveryAlert = recoveryRows.operationalAlerts.find(
      (candidate) => candidate.id === delivery.alertId,
    );
    return {
      id: evidenceRef,
      kind: "ALERT_DELIVERY",
      label: `${String(delivery.channel)} delivery ${evidenceRef}`,
      status: stringValue(delivery.status),
      href: deliveryAlert
        ? adminLinkForOperationalAlert(deliveryAlert, recoveryRows)
        : adminLink("alerts", "alert", delivery.alertId),
    };
  }
  const receipt = recoveryRows.receipts.find(
    (candidate) => candidate.id === evidenceRef,
  );
  if (receipt) {
    return {
      id: evidenceRef,
      kind: "GATEWAY_RECEIPT",
      label: evidenceRef,
      status: stringValue(receipt.status),
      href: adminLink("jobs", "operation", evidenceRef),
    };
  }
  const scrapeRun = recoveryRows.scrapeRuns.find(
    (candidate) => candidate.id === evidenceRef,
  );
  if (scrapeRun) {
    return {
      id: evidenceRef,
      kind: "SOURCE_REFRESH",
      label: evidenceRef,
      status: stringValue(scrapeRun.status),
      href: adminLink("sources", "scrapeRun", evidenceRef),
    };
  }
  const event = recoveryRows.gatewayEvents.find(
    (candidate) => candidate.id === evidenceRef,
  );
  return event
    ? {
        id: evidenceRef,
        kind: "GATEWAY_EVENT",
        label: evidenceRef,
        status: stringValue(event.eventType),
        href: adminLink("jobs", "event", evidenceRef),
      }
    : null;
};

const alertRecoveryRelatedRowsFor = (
  alert: OperationalAlertRecoveryAlert,
  recovery: OperationalAlertRecovery,
  recoveryRows: OperationalAlertRecoveryRows,
): ProjectionRelatedRow[] =>
  uniqueEvidence(
    [
      ...alertRecoveryBaseRelatedRowsFor(alert, recoveryRows),
      ...recovery.evidenceRefs
        .map((evidenceRef) =>
          alertRecoveryEvidenceRelatedRowFor(
            evidenceRef,
            recoveryRows,
          ),
        )
        .filter((row): row is ProjectionRelatedRow => row !== null),
    ],
    (record) => `${record.kind}:${record.id}`,
  );

  const buildAlertAdditionalDetail = (): ProjectionDetail | null => {
  if (type === "alert") {
    const alert = rows.operationalAlerts.find((item) => item.id === id);
    if (!alert) return null;
    const deliveries = dedupeAlertDeliveries(
      rows.alertDeliveryHistory.filter((delivery) => delivery.alertId === id),
    );
    const recovery = operationalAlertRecoveryFor(alert, recoveryRows, now);
    const recoveryRelated = alertRecoveryRelatedRowsFor(
      alert,
      recovery,
      recoveryRows,
    );
    return create(
      type,
      alert.title,
      `Operational alert ${id}`,
      alert.severity,
      [
        {
          title: "Header",
          fields: [
            field("Category", alert.category),
            field("Event key", alert.eventKey),
            field("Severity", alert.severity),
            field("State", recovery.recovered ? "Recovered" : "Active"),
            field("Created", alert.createdAt),
            field("Subject type", alert.subjectType),
            field("Subject ID", alert.subjectId),
          ],
        },
        {
          title: "Contract and lineage",
          fields: [
            field("Rollout cohort", alert.rolloutCohort),
            field("Contract version", alert.contractVersion),
            field(
              "Supply Source",
              alert.supplySourceId,
              alert.supplySourceId
                ? adminLink("sources", "source", alert.supplySourceId)
                : null,
            ),
            field(
              "Coverage Cell",
              alert.coverageCellId,
              alert.coverageCellId
                ? adminLink("coverage", "coverageCell", alert.coverageCellId)
                : null,
            ),
            field(
              "Demand",
              alert.demandId,
              alert.demandId
                ? adminLink("coverage", "demand", alert.demandId)
                : null,
            ),
            field(
              "Wave",
              alert.waveId,
              alert.waveId ? adminLink("coverage", "wave", alert.waveId) : null,
            ),
          ],
        },
        {
          title: "Recovery",
          fields: [
            field("Recovered", recovery.recovered),
            field("Recovery detail", recovery.detail),
            field("Recovery evidence", recovery.evidenceRefs.join(", ")),
          ],
        },
        {
          title: "Delivery",
          fields:
            deliveries.length === 0
              ? [field("Delivery status", "Not recorded")]
              : deliveries.map((delivery) =>
                  field(
                    `${delivery.channel} attempt ${delivery.attempt}`,
                    `${delivery.status}${delivery.responseCode ? ` (${delivery.responseCode})` : ""}${delivery.errorMessage ? `: ${delivery.errorMessage}` : ""}`,
                  ),
                ),
        },
        {
          title: "Evidence and result",
          fields: [
            field("Detail", alert.detail),
            field("Reason codes", alert.reasonCodes.join(", ")),
            field("Evidence references", alert.evidenceRefs.join(", ")),
            field("Input hash", alert.inputHash),
            field("Output hash", alert.outputHash),
            field("Payload", alert.payload),
            field("Retention class", alert.retentionClass),
            field("Retention deadline", alert.retentionDeadline),
          ],
        },
      ],
      deliveries.map((delivery) => ({
        id: delivery.id,
        kind: "ALERT_DELIVERY",
        at: isoValue(delivery.createdAt),
        status: delivery.status,
        reason: delivery.errorMessage,
        actor: delivery.channel,
        href: adminLink("overview", "alert", id),
      })),
      recoveryRelated,
    );
  }
    return null;
  };

  const additionalDetailBuilders: Partial<
    Record<AffiliateOperationsDetailType, () => ProjectionDetail | null>
  > = {
    scrapeRun: () => buildScrapeRunAdditionalDetail(rows, type, id),
    intakeRun: buildIntakeRunAdditionalDetail,
    page: buildPageAdditionalDetail,
    artifact: buildArtifactAdditionalDetail,
    organization: buildOrganizationAdditionalDetail,
    package: buildPackageAdditionalDetail,
    event: buildEventAdditionalDetail,
    coverageCell: buildCoverageCellAdditionalDetail,
    demand: buildDemandAdditionalDetail,
    wave: buildWaveAdditionalDetail,
    campaign: buildCampaignAdditionalDetail,
    discoveryRun: buildDiscoveryRunAdditionalDetail,
    discoveryQuery: buildDiscoveryQueryAdditionalDetail,
    discoveryResult: buildDiscoveryResultAdditionalDetail,
    target: buildTargetAdditionalDetail,
    mapping: buildMappingAdditionalDetail,
    claim: buildClaimAdditionalDetail,
    worker: buildWorkerAdditionalDetail,
    operation: buildOperationAdditionalDetail,
    transition: buildTransitionAdditionalDetail,
    reconciliationRun: buildReconciliationRunAdditionalDetail,
    alert: buildAlertAdditionalDetail,
  };
  return additionalDetailBuilders[type]?.() ?? null;
};

const normalizeProjectionDetail = (
  detail: ProjectionDetail,
): ProjectionDetail => {
  const requiredSections = [
    { title: "Header", aliases: ["Header"] },
    { title: "Subject", aliases: ["Subject"] },
    {
      title: "Priority and Supply Target impact",
      aliases: [
        "Priority and Supply Target impact",
        "Priority and target impact",
      ],
    },
    { title: "Execution", aliases: ["Execution"] },
    { title: "Generations", aliases: ["Generations", "Generations and lease"] },
    { title: "Lineage", aliases: ["Lineage"] },
    {
      title: "Evidence/result",
      aliases: [
        "Evidence/result",
        "Evidence and result",
        "Evidence and hashes",
        "Evidence and target impact",
      ],
    },
  ] as const;
  const consumed = new Set<string>();
  const sections = requiredSections.map(({ title, aliases }) => {
    const match = detail.sections.find((section) =>
      aliases.includes(section.title as never),
    );
    if (match) consumed.add(match.title);
    return match
      ? { ...match, title }
      : { title, fields: [field("Value", "Not recorded")] };
  });
  return {
    ...detail,
    sections: [
      ...sections,
      ...detail.sections.filter(
        (section) =>
          !consumed.has(section.title) &&
          !requiredSections.some(({ aliases }) =>
            aliases.includes(section.title as never),
          ),
      ),
    ],
  };
};
const projectionHistoryPageSizeFor = (
  input: AffiliateOperationsProjectionInput,
): number =>
  Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.historyPageSize || DEFAULT_PAGE_SIZE)),
  );

const paginateProjectionDetail = (
  detail: ProjectionDetail,
  input: AffiliateOperationsProjectionInput,
): ProjectionDetail => {
  const historyPageSize = projectionHistoryPageSizeFor(input);
  const historyTotal = detail.history.length;
  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyTotal / historyPageSize),
  );
  const historyPage = Math.min(
    historyTotalPages,
    Math.max(1, Math.trunc(input.historyPage || 1)),
  );
  const start = (historyPage - 1) * historyPageSize;
  return {
    ...detail,
    history: detail.history.slice(start, start + historyPageSize),
    historyPage,
    historyPageSize,
    historyTotal,
    historyTotalPages,
  };
};

const paginateProjectionServerHistoryDetail = (
  detail: ProjectionDetail,
  input: AffiliateOperationsProjectionInput,
  serverHistory: Readonly<{ page: number; total: number }>,
): ProjectionDetail => {
  const historyPageSize = projectionHistoryPageSizeFor(input);
  const historyTotal = Math.max(0, serverHistory.total);
  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyTotal / historyPageSize),
  );
  const historyPage = Math.min(
    historyTotalPages,
    Math.max(1, Math.trunc(serverHistory.page)),
  );
  return {
    ...detail,
    historyPage,
    historyPageSize,
    historyTotal,
    historyTotalPages,
  };
};

const paginateSelectedProjectionDetail = (
  detail: ProjectionDetail,
  input: AffiliateOperationsProjectionInput,
  rows: ProjectionRows,
): ProjectionDetail =>
  input.selectedType === "alert"
    ? paginateProjectionServerHistoryDetail(detail, input, {
        page: rows.alertDeliveryPage,
        total: rows.alertDeliveryTotal,
      })
    : paginateProjectionDetail(detail, input);

const buildSelectedDetail = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  now: Date,
  recoveryRows: ProjectionRows = rows,
): ProjectionDetail | null => {
  if (!input.selectedId || !input.selectedType) return null;
  const detail =
    input.selectedType === "source"
      ? buildSourceDetail(rows, input.selectedId)
      : input.selectedType === "intake"
        ? buildIntakeDetail(rows, input.selectedId)
        : input.selectedType === "review"
          ? buildReviewDetail(rows, input.selectedId)
          : input.selectedType === "candidate"
            ? buildCandidateDetail(rows, input.selectedId)
            : input.selectedType === "job"
              ? buildJobDetail(rows, input.selectedId, now)
              : buildAdditionalDetail(
                  rows,
                  input.selectedType,
                  input.selectedId,
                  recoveryRows,
                  now,
                );
  return detail
    ? paginateSelectedProjectionDetail(
        normalizeProjectionDetail(detail),
        input,
        rows,
      )
    : null;
};

const scopeOverviewRows = (
  rows: ProjectionRows,
  filters: AffiliateOperationsFilters,
  now: Date,
): ProjectionRows => {
  const dateRangeCutoff = dateRangeCutoffFor(filters.range, now);
  const hasDimensionFilter = Boolean(
    filters.market || filters.sport || filters.profile || filters.city,
  );
  const dimensionContext = projectionDimensionContext(rows, dateRangeCutoff);
  const targetMatches = (target: ProjectionRows["targets"][number]): boolean =>
    targetMatchesFilters(target, filters, dimensionContext);
  const roots = rows.roots.filter((root) =>
    rootMatchesFilters(root, filters, dimensionContext),
  );
  const rootIds = new Set(roots.map((root) => root.id));
  const targets = rows.targets.filter(
    (target) => rootIds.has(target.supplySourceId) && targetMatches(target),
  );
  const demands = rows.demands.filter(
    (demand) =>
      (!filters.city ||
        targets.some(
          (target) =>
            target.marketKey === demand.marketKey &&
            target.sportId === demand.sportId &&
            upper(target.sourceProfile) === upper(demand.sourceProfile),
        )) &&
      containsFilter(demand.marketKey, filters.market) &&
      containsFilter(demand.sportId, filters.sport) &&
      containsFilter(demand.sourceProfile, filters.profile) &&
      containsFilter(demand.status, filters.status) &&
      matchesDateRange(demand.openedAt ?? demand.updatedAt, dateRangeCutoff),
  );
  const demandIds = new Set(demands.map((demand) => demand.id));
  const coverageCells = rows.coverageCells.filter(
    (cell) =>
      containsFilter(cell.marketKey, filters.market) &&
      containsFilter(cell.cityId, filters.city) &&
      (containsFilter(cell.sportId, filters.sport) ||
        containsFilter(cell.sportName, filters.sport)) &&
      containsFilter(cell.profileKey, filters.profile) &&
      containsFilter(cell.coverageStatus, filters.status) &&
      matchesDateRange(
        cell.lastAssessedAt ?? cell.nextReviewAt ?? cell.updatedAt,
        dateRangeCutoff,
      ),
  );
  const coverageCellIds = new Set(coverageCells.map((cell) => cell.id));
  const waves = rows.waves.filter(
    (wave) =>
      demandIds.has(wave.demandId) &&
      containsFilter(wave.status, filters.status) &&
      matchesDateRange(wave.startedAt ?? wave.createdAt, dateRangeCutoff),
  );
  const waveIds = new Set(waves.map((wave) => wave.id));
  const intakeBelongsToRoot = (
    intake: ProjectionRows["intakes"][number],
  ): boolean =>
    rootIds.has(intake.supplySourceId ?? "") ||
    roots.some((root) => root.intakeId === intake.id);
  const intakeIds = new Set(
    rows.intakes
      .filter(
        (intake) =>
          intakeBelongsToRoot(intake) &&
          containsFilter(intake.status, filters.status) &&
          matchesDateRange(
            intake.updatedAt ?? intake.createdAt,
            dateRangeCutoff,
          ),
      )
      .map((intake) => intake.id),
  );
  const jobHasScopedLineage = (
    job: ProjectionRows["gatewayJobs"][number],
  ): boolean =>
    rootIds.has(job.supplySourceId ?? "") ||
    rootIds.has(job.subjectId ?? "") ||
    demandIds.has(job.subjectId ?? "") ||
    waveIds.has(job.subjectId ?? "") ||
    coverageCellIds.has(job.subjectId ?? "");
  const linkedJob = (job: ProjectionRows["gatewayJobs"][number]): boolean =>
    !hasDimensionFilter || jobHasScopedLineage(job);
  const gatewayJobs = rows.gatewayJobs.filter(
    (job) =>
      linkedJob(job) &&
      containsFilter(job.status, filters.status) &&
      matchesDateRange(job.updatedAt ?? job.createdAt, dateRangeCutoff),
  );
  const gatewayJobIds = new Set(gatewayJobs.map((job) => job.id));
  const gatewayClaims = rows.gatewayClaims.filter(
    (claim) =>
      gatewayJobIds.has(claim.jobId) &&
      containsFilter(claim.status, filters.status) &&
      matchesDateRange(claim.updatedAt ?? claim.claimedAt, dateRangeCutoff),
  );
  const claimIds = new Set(gatewayClaims.map((claim) => claim.id));
  const receipts = rows.receipts.filter(
    (receipt) =>
      gatewayJobIds.has(receipt.jobId) &&
      containsFilter(receipt.status, filters.status) &&
      matchesDateRange(receipt.updatedAt ?? receipt.createdAt, dateRangeCutoff),
  );
  const receiptIds = new Set(receipts.map((receipt) => receipt.id));
  const gatewayEventHasGatewayLineage = (
    event: ProjectionRows["gatewayEvents"][number],
    payload: Record<string, unknown>,
  ): boolean =>
    gatewayJobIds.has(event.jobId ?? "") ||
    claimIds.has(event.claimId ?? "") ||
    receiptIds.has(event.receiptId ?? "") ||
    rootIds.has(
      rootIdForSource(
        rows,
        stringValue(payload.supplySourceId ?? payload.sourceId),
      ) ?? "",
    );
  const gatewayEventHasTargetLineage = (
    payload: Record<string, unknown>,
  ): boolean =>
    rootIds.has(stringValue(payload.subjectId) ?? "") ||
    demandIds.has(stringValue(payload.demandId) ?? "") ||
    waveIds.has(stringValue(payload.waveId) ?? "") ||
    coverageCellIds.has(stringValue(payload.coverageCellId) ?? "");
  const gatewayEventIsLinked = (
    event: ProjectionRows["gatewayEvents"][number],
    payload: Record<string, unknown>,
  ): boolean =>
    !hasDimensionFilter ||
    gatewayEventHasGatewayLineage(event, payload) ||
    gatewayEventHasTargetLineage(payload);
  const gatewayEvents = rows.gatewayEvents.filter((event) => {
    const payload = recordValue(event.payload);
    const linked = gatewayEventIsLinked(event, payload);
    return (
      linked &&
      containsFilter(event.eventType, filters.status) &&
      matchesDateRange(event.createdAt, dateRangeCutoff)
    );
  });
  const transitions = rows.transitions.filter(
    (transition) =>
      rootIds.has(transition.supplySourceId) &&
      containsFilter(transition.toStage, filters.status) &&
      matchesDateRange(transition.occurredAt, dateRangeCutoff),
  );
  const scrapeRuns = rows.scrapeRuns.filter(
    (run) =>
      rootIds.has(
        rootIdForSource(rows, run.supplySourceId ?? run.sourceId) ?? "",
      ) &&
      containsFilter(run.status, filters.status) &&
      matchesDateRange(
        run.finishedAt ?? run.updatedAt ?? run.createdAt,
        dateRangeCutoff,
      ),
  );
  const scrapeRunIds = new Set(scrapeRuns.map((run) => run.id));
  const sourceBelongsToRoot = (
    source: ProjectionRows["sources"][number],
  ): boolean =>
    rootIds.has(source.supplySourceId ?? "") ||
    roots.some((root) => root.liveSourceId === source.id);
  const sources = rows.sources.filter(sourceBelongsToRoot);
  const sourceIds = new Set(sources.map((source) => source.id));
  const mappings = rows.mappings.filter(
    (mapping) =>
      rootIds.has(mapping.supplySourceId ?? "") ||
      (mapping.sourceId !== null && sourceIds.has(mapping.sourceId)),
  );
  const mappingJobs = rows.mappingJobs.filter(
    (job) =>
      (rootIds.has(job.supplySourceId ?? "") || intakeIds.has(job.intakeId)) &&
      containsFilter(job.status, filters.status) &&
      matchesDateRange(job.updatedAt ?? job.createdAt, dateRangeCutoff),
  );
  const intakes = rows.intakes.filter((intake) => intakeIds.has(intake.id));
  const pages = rows.pages.filter((page) => intakeIds.has(page.intakeId));
  const intakeRuns = rows.intakeRuns.filter((run) =>
    intakeIds.has(run.intakeId),
  );
  const intakeRunIds = new Set(intakeRuns.map((run) => run.id));
  const artifacts = rows.artifacts.filter((artifact) =>
    intakeIds.has(artifact.intakeId),
  );
  const approvals = rows.approvals.filter(
    (approval) =>
      rootIds.has(approval.supplySourceId ?? "") &&
      containsFilter(approval.status, filters.status) &&
      matchesDateRange(
        approval.updatedAt ?? approval.createdAt,
        dateRangeCutoff,
      ),
  );
  const candidates = rows.candidates.filter(
    (candidate) =>
      rootIds.has(candidate.supplySourceId ?? "") &&
      containsFilter(candidate.status, filters.status) &&
      matchesDateRange(
        candidate.updatedAt ?? candidate.createdAt,
        dateRangeCutoff,
      ),
  );
  const coverageJobs = rows.coverageJobs.filter(
    (job) =>
      (!hasDimensionFilter || coverageCellIds.has(job.subjectKey)) &&
      containsFilter(job.status, filters.status) &&
      matchesDateRange(job.updatedAt ?? job.createdAt, dateRangeCutoff),
  );
  const coverageAssessments = rows.coverageAssessments.filter(
    (assessment) =>
      coverageCellIds.has(assessment.cellId) &&
      matchesDateRange(
        assessment.updatedAt ?? assessment.createdAt,
        dateRangeCutoff,
      ),
  );
  const discoveryQueryMatchesDimensions = (
    query: ProjectionRows["discoveryQueries"][number],
  ): boolean =>
    containsFilter(
      query.targetCity ?? query.cityGeoid ?? query.targetState,
      filters.market,
    ) &&
    containsFilter(query.targetCity ?? query.cityGeoid, filters.city) &&
    (containsFilter(query.sportId, filters.sport) ||
      containsFilter(query.sportName, filters.sport)) &&
    containsFilter(query.profileKey, filters.profile);
  const discoveryQueries = rows.discoveryQueries.filter(
    (query) =>
      discoveryQueryMatchesDimensions(query) &&
      containsFilter(query.status, filters.status) &&
      matchesDateRange(query.updatedAt ?? query.createdAt, dateRangeCutoff),
  );
  const discoveryQueryIds = new Set(discoveryQueries.map((query) => query.id));
  const discoveryRuns = rows.discoveryRuns.filter(
    (run) =>
      rows.discoveryQueries.some(
        (query) => query.runId === run.id && discoveryQueryIds.has(query.id),
      ) &&
      containsFilter(run.status, filters.status) &&
      matchesDateRange(
        run.finishedAt ?? run.updatedAt ?? run.createdAt,
        dateRangeCutoff,
      ),
  );
  const discoveryRunIds = new Set(discoveryRuns.map((run) => run.id));
  const discoveryResults = rows.discoveryResults.filter(
    (result) =>
      discoveryRunIds.has(result.latestRunId) &&
      containsFilter(result.status, filters.status) &&
      matchesDateRange(
        result.lastSeenAt ?? result.updatedAt ?? result.createdAt,
        dateRangeCutoff,
      ),
  );
  const campaigns = rows.campaigns.filter(
    (campaign) =>
      (waves.some((wave) => wave.campaignId === campaign.id) ||
        discoveryRuns.some((run) => run.campaignId === campaign.id)) &&
      containsFilter(campaign.location ?? campaign.region, filters.market) &&
      containsFilter(campaign.location, filters.city) &&
      containsFilter(campaign.sportIds.join(" "), filters.sport) &&
      containsFilter(campaign.sourceTypeHints.join(" "), filters.profile) &&
      containsFilter(campaign.status, filters.status) &&
      matchesDateRange(
        campaign.updatedAt ?? campaign.createdAt,
        dateRangeCutoff,
      ),
  );
  const alertHasDirectLineage = (
    alert: ProjectionRows["operationalAlerts"][number],
    alertRootId: string | null,
  ): boolean =>
    Boolean(
      alert.supplySourceId ||
        alert.coverageCellId ||
        alert.demandId ||
        alert.waveId ||
        alertRootId,
    );
  const alertHasPayloadTargetLineage = (
    payloadCoverageCellId: string | null,
    payloadDemandId: string | null,
    payloadWaveId: string | null,
  ): boolean =>
    Boolean(payloadCoverageCellId || payloadDemandId || payloadWaveId);
  const alertHasPayloadRecordLineage = (
    payload: Record<string, unknown>,
  ): boolean =>
    Boolean(
      payload.supplySourceId ||
        payload.sourceId ||
        payload.scrapeRunId ||
        payload.runId ||
        payload.jobId ||
        payload.gatewayJobId,
    );
  const alertHasPayloadLineage = (
    payload: Record<string, unknown>,
    payloadCoverageCellId: string | null,
    payloadDemandId: string | null,
    payloadWaveId: string | null,
  ): boolean =>
    alertHasPayloadTargetLineage(
      payloadCoverageCellId,
      payloadDemandId,
      payloadWaveId,
    ) || alertHasPayloadRecordLineage(payload);
  const alertMatchesDirectDomain = (
    alert: ProjectionRows["operationalAlerts"][number],
  ): boolean =>
    demandIds.has(alert.demandId ?? "") ||
    waveIds.has(alert.waveId ?? "") ||
    coverageCellIds.has(alert.coverageCellId ?? "");
  const alertMatchesPayloadDomain = (
    payloadCoverageCellId: string | null,
    payloadDemandId: string | null,
    payloadWaveId: string | null,
  ): boolean =>
    (payloadCoverageCellId !== null &&
      coverageCellIds.has(payloadCoverageCellId)) ||
    (payloadDemandId !== null && demandIds.has(payloadDemandId)) ||
    (payloadWaveId !== null && waveIds.has(payloadWaveId));
  const alertMatchesTypedDomainIds = (
    gatewayJobId: string | null,
    discoveryRunId: string | null,
    intakeRunId: string | null,
    scrapeRunId: string | null,
    sourceId: string | null,
    directSupplySourceId: string | null,
  ): boolean => {
    const pairs: ReadonlyArray<
      readonly [string | null, ReadonlySet<string>]
    > = [
      [gatewayJobId, gatewayJobIds],
      [discoveryRunId, discoveryRunIds],
      [intakeRunId, intakeRunIds],
      [scrapeRunId, scrapeRunIds],
      [sourceId, sourceIds],
      [directSupplySourceId, rootIds],
    ];
    return pairs.some(([id, ids]) => id !== null && ids.has(id));
  };
  const alertMatchesTypedDomain = (
    alert: ProjectionRows["operationalAlerts"][number],
    payload: Record<string, unknown>,
  ): boolean => {
    const subjectType = upper(alert.subjectType);
    const subjectId = stringValue(alert.subjectId);
    const gatewayJobId = alertGatewayJobIdFor(alert, payload);
    const discoveryRunId =
      stringValue(payload.discoveryRunId) ??
      (subjectType === "DISCOVERY_RUN" ? subjectId : null);
    const intakeRunId =
      stringValue(payload.intakeRunId) ??
      (subjectType === "INTAKE_RUN" ? subjectId : null);
    const scrapeRunId = alertScrapeRunIdFor(alert, payload);
    const sourceId = alertSourceIdFor(alert, payload);
    const directSupplySourceId = alertDirectSupplySourceIdFor(alert, payload);
    return (
      alertMatchesTypedDomainIds(
        gatewayJobId,
        discoveryRunId,
        intakeRunId,
        scrapeRunId,
        sourceId,
        directSupplySourceId,
      ) ||
      (subjectType === "AGENT_JOB" &&
        subjectId !== null &&
        coverageCellIds.has(subjectId))
    );
  };
  const alertIsLinked = (
    alert: ProjectionRows["operationalAlerts"][number],
    alertRootId: string | null,
    hasLineage: boolean,
    payload: Record<string, unknown>,
    payloadCoverageCellId: string | null,
    payloadDemandId: string | null,
    payloadWaveId: string | null,
  ): boolean =>
    (!hasDimensionFilter &&
      (!hasLineage || projectionAlertIsGlobalInfrastructure(alert))) ||
    (alertRootId !== null && rootIds.has(alertRootId)) ||
    alertMatchesDirectDomain(alert) ||
    alertMatchesPayloadDomain(
      payloadCoverageCellId,
      payloadDemandId,
      payloadWaveId,
    ) ||
    alertMatchesTypedDomain(alert, payload);
  const operationalAlerts = rows.operationalAlerts.filter((alert) => {
    const payload = recordValue(alert.payload);
    const alertRootId = rootIdForAlert(rows, alert);
    const payloadCoverageCellId = stringValue(payload.coverageCellId);
    const payloadDemandId = stringValue(payload.demandId);
    const payloadWaveId = stringValue(payload.waveId);
    const hasLineage =
      alertHasDirectLineage(alert, alertRootId) ||
      alertHasPayloadLineage(
        payload,
        payloadCoverageCellId,
        payloadDemandId,
        payloadWaveId,
      );
    const linked = alertIsLinked(
      alert,
      alertRootId,
      hasLineage,
      payload,
      payloadCoverageCellId,
      payloadDemandId,
      payloadWaveId,
    );
    return (
      linked &&
      containsFilter(alert.severity, filters.status) &&
      matchesDateRange(alert.createdAt, dateRangeCutoff)
    );
  });
  const alertIds = new Set(operationalAlerts.map((alert) => alert.id));
  const alertDeliveries = rows.alertDeliveries.filter((delivery) =>
    alertIds.has(delivery.alertId),
  );
  const workerHealth = rows.workerHealth.filter(
    (worker) =>
      containsFilter(worker.status, filters.status) &&
      matchesDateRange(worker.heartbeatAt ?? worker.updatedAt, dateRangeCutoff),
  );
  return {
    ...rows,
    roots,
    targets,
    demands,
    waves,
    transitions,
    gatewayJobs,
    gatewayClaims,
    receipts,
    gatewayEvents,
    coverageCells,
    coverageAssessments,
    coverageJobs,
    discoveryQueries,
    discoveryRuns,
    discoveryResults,
    mappingJobs,
    approvals,
    intakes,
    pages,
    intakeRuns,
    artifacts,
    sources,
    mappings,
    scrapeRuns,
    candidates,
    campaigns,
    operationalAlerts,
    alertDeliveries,
    workerHealth,
  };
};
const projectionAlertBatchForScope = (
  alerts: readonly OperationalAlertRecoveryAlert[],
): ProjectionRows["operationalAlerts"] =>
  alerts as unknown as ProjectionRows["operationalAlerts"];

const operationalAlertRecoveryRowsFor = (
  rows: ProjectionRows,
  operationalAlerts: readonly OperationalAlertRecoveryAlert[],
  alertDeliveries: readonly Readonly<{
    id?: string | null;
    alertId: string;
    channel: unknown;
    status: unknown;
  }>[],
  gatewayJobs: readonly OperationalAlertRecoveryRows["gatewayJobs"][number][] =
    rows.gatewayJobs,
): OperationalAlertRecoveryRows => ({
  roots: rows.roots,
  scrapeRuns: rows.scrapeRuns,
  gatewayJobs,
  receipts: rows.receipts,
  gatewayEvents: rows.gatewayEvents,
  discoveryRuns: rows.discoveryRuns,
  campaigns: rows.campaigns,
  intakes: rows.intakes,
  intakeRuns: rows.intakeRuns,
  operationalAlerts,
  alertDeliveries,
  workerHealth: rows.workerHealth,
});

type OperationalAlertRecoveryBatch = Readonly<{
  alerts: readonly OperationalAlertRecoveryAlert[];
  gatewayJobs: readonly ProjectionRows["gatewayJobs"][number][];
  deliveredAttempts: readonly Readonly<{
    id?: string | null;
    alertId: string;
    channel: unknown;
    status: unknown;
  }>[];
}>;

const loadOperationalAlertRecoveryBatch = async (
  operationalAlertsDelegate: Prisma.TransactionClient["affiliateOperationalAlerts"],
  alertDeliveriesDelegate: Prisma.TransactionClient["affiliateOperationalAlertDeliveries"],
  gatewayJobsDelegate: Prisma.TransactionClient["affiliateAgentGatewayJobs"],
  alerts: readonly OperationalAlertRecoveryAlert[],
): Promise<OperationalAlertRecoveryBatch> => {
  const sourceEventKeys = Array.from(
    new Set(
      alerts
        .map((alert) => stringValue(recordValue(alert.payload).sourceEventKey))
        .filter((eventKey): eventKey is string => Boolean(eventKey)),
    ),
  );
  const sourceAlerts =
    sourceEventKeys.length > 0
      ? await operationalAlertsDelegate.findMany({
          where: { eventKey: { in: sourceEventKeys } },
          select: operationalAlertRecoverySelect,
        })
      : [];
  const alertById = new Map<string, OperationalAlertRecoveryAlert>();
  [...alerts, ...(sourceAlerts as OperationalAlertRecoveryAlert[])].forEach(
    (alert) => alertById.set(alert.id, alert),
  );
  const sourceAlertsByEventKey = new Map(
    (sourceAlerts as OperationalAlertRecoveryAlert[]).map((alert) => [
      alert.eventKey,
      alert,
    ]),
  );
  const deliveryRecoveryPairs = alerts.flatMap((alert) => {
    const payload = recordValue(alert.payload);
    const sourceEventKey = stringValue(payload.sourceEventKey);
    const channel = stringValue(payload.channel);
    const sourceAlert = sourceEventKey
      ? sourceAlertsByEventKey.get(sourceEventKey)
      : undefined;
    return sourceAlert && channel
      ? [{ alertId: sourceAlert.id, channel }]
      : [];
  });
  const deliveryRecoveryPairKeys = new Set(
    deliveryRecoveryPairs.map((pair) =>
      `${pair.alertId}\u0000${upper(pair.channel)}`,
    ),
  );
  const deliveryRecoveryWhere =
    deliveryRecoveryPairs.length > 0
      ? {
          OR: deliveryRecoveryPairs.flatMap((pair) =>
            Array.from(
              new Set([
                pair.channel,
                pair.channel.toUpperCase(),
                pair.channel.toLowerCase(),
              ]),
            ).map((channel) => ({
              alertId: pair.alertId,
              channel,
              status: "DELIVERED",
            })),
          ),
        }
      : { id: { in: [] } };
  const gatewayJobIds = Array.from(
    new Set(
      [...alertById.values()]
        .map((alert) =>
          alertGatewayJobIdFor(alert, recordValue(alert.payload)),
        )
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const gatewayJobs =
    gatewayJobIds.length > 0
      ? await gatewayJobsDelegate.findMany({
          where: { id: { in: gatewayJobIds } },
          select: operationalAlertGatewayJobRecoverySelect,
        })
      : [];
  const deliveredAttemptRows =
    deliveryRecoveryPairs.length > 0
      ? await alertDeliveriesDelegate.findMany({
          where: deliveryRecoveryWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          distinct: ["alertId", "channel"],
          take: deliveryRecoveryPairs.length,
          select: { id: true, alertId: true, channel: true, status: true },
        })
      : [];
  const deliveredAttempts = deliveredAttemptRows.filter((delivery) =>
    deliveryRecoveryPairKeys.has(
      `${delivery.alertId}\u0000${upper(delivery.channel)}`,
    ),
  );
  return {
    alerts: [...alertById.values()],
    gatewayJobs: gatewayJobs as ProjectionRows["gatewayJobs"],
    deliveredAttempts,
  };
};
const operationalAlertExplicitRecoveryWhere =
  (): Prisma.AffiliateOperationalAlertsWhereInput => ({
    OR: [
      {
        payload: {
          path: ["operationalAlertRecovered"],
          equals: true,
        },
      },
      {
        payload: {
          path: ["operationalAlertRecovered", "recovered"],
          equals: true,
        },
      },
      {
        payload: {
          path: ["operationalAlertRecovered", "isRecovered"],
          equals: true,
        },
      },
      { payload: { path: ["recovered"], equals: true } },
      { payload: { path: ["resolved"], equals: true } },
      { payload: { path: ["resolvedAt"], not: Prisma.JsonNull } },
    ],
  });


const operationalAlertUnrecoveredWhereFor = (
  where: Prisma.AffiliateOperationalAlertsWhereInput,
): Prisma.AffiliateOperationalAlertsWhereInput => ({
  AND: [
    where,
    {
      NOT: operationalAlertExplicitRecoveryWhere(),
    },
  ],
});

const operationalAlertHasExplicitRecovery = (
  alert: OperationalAlertRecoveryAlert,
): boolean =>
  operationalAlertExplicitRecoveryFor(recordValue(alert.payload)).detail !==
  null;

const operationalAlertRecoveryCandidateRowsFor = (
  alerts: readonly OperationalAlertRecoveryAlert[],
): readonly OperationalAlertRecoveryAlert[] =>
  alerts.filter((alert) => !operationalAlertHasExplicitRecovery(alert));

const alertBatchForQuery = async (
  operationalAlertsDelegate: Pick<
    Prisma.TransactionClient["affiliateOperationalAlerts"],
    "findMany"
  >,
  where: Prisma.AffiliateOperationalAlertsWhereInput,
  offset: number,
  limit = MAX_EXCEPTION_ROWS,
): Promise<readonly OperationalAlertRecoveryAlert[]> => {
  const batchLimit = Math.max(1, Math.trunc(limit));
  const loaded = await operationalAlertsDelegate.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: offset,
    take: batchLimit,
    select: operationalAlertSelect,
  });
  return (loaded as OperationalAlertRecoveryAlert[]).slice(0, batchLimit);
};


type OperationalAlertExceptionRail = Readonly<{
  alerts: readonly OperationalAlertRecoveryAlert[];
  supportingAlerts: readonly OperationalAlertRecoveryAlert[];
  supportingGatewayJobs: readonly ProjectionRows["gatewayJobs"][number][];
  deliveries: readonly ProjectionRows["alertDeliveries"][number][];
  supportingDeliveries: readonly Readonly<{
    id?: string | null;
    alertId: string;
    channel: unknown;
    status: unknown;
  }>[];
  summary: Readonly<{ total: number; recovered: number }>;
}>;

const operationalAlertOverviewWhereFor = (
  where: Prisma.AffiliateOperationalAlertsWhereInput,
  filters: AffiliateOperationsFilters,
  now: Date,
): Prisma.AffiliateOperationalAlertsWhereInput => {
  const dateRangeCutoff = dateRangeCutoffFor(filters.range, now);
  return {
    AND: [
      where,
      ...(filters.status
        ? [
            {
              severity: {
                contains: filters.status,
                mode: "insensitive" as const,
              },
            },
          ]
        : []),
      ...(dateRangeCutoff === null
        ? []
        : [{ createdAt: { gte: new Date(dateRangeCutoff) } }]),
    ],
  };
};

const operationalAlertWhereForOverviewScope = (
  baseRows: ProjectionRows,
  selection: AffiliateOperationsContractSelection,
  filters: AffiliateOperationsFilters,
  now: Date,
): Prisma.AffiliateOperationalAlertsWhereInput => {
  const contractRows = scopeProjectionRows(
    {
      ...baseRows,
      operationalAlerts: [],
      alertDeliveries: [],
    },
    selection,
  );
  const overviewRows = scopeOverviewRows(contractRows, filters, now);
  const hasDimensionFilter = Boolean(
    filters.market || filters.sport || filters.profile || filters.city,
  );
  return operationalAlertWhereFor(
    selection,
    overviewRows.roots.map((root) => root.id),
    overviewRows.coverageCells.map((cell) => cell.id),
    overviewRows.demands.map((demand) => demand.id),
    overviewRows.waves.map((wave) => wave.id),
    {
      sourceIds: [
        ...overviewRows.roots.flatMap((root) =>
          [root.id, root.liveSourceId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
        ...overviewRows.sources.map((source) => source.id),
      ],
      gatewayJobIds: overviewRows.gatewayJobs.map((job) => job.id),
      discoveryRunIds: overviewRows.discoveryRuns.map((run) => run.id),
      intakeRunIds: overviewRows.intakeRuns.map((run) => run.id),
      scrapeRunIds: overviewRows.scrapeRuns.map((run) => run.id),
    },
    {
      includeGlobalInfrastructure: !hasDimensionFilter,
      includeUnbound: !hasDimensionFilter,
    },
  );
};

const loadUnrecoveredOperationalAlertRail = async (
  client: Prisma.TransactionClient,
  baseRows: ProjectionRows,
  selection: AffiliateOperationsContractSelection,
  filters: AffiliateOperationsFilters,
  now: Date,
): Promise<OperationalAlertExceptionRail> => {
  const alerts: OperationalAlertRecoveryAlert[] = [];
  const supportingAlerts = new Map<string, OperationalAlertRecoveryAlert>();
  const supportingGatewayJobs = new Map<
    string,
    ProjectionRows["gatewayJobs"][number]
  >();
  const supportingDeliveries = new Map<
    string,
    Readonly<{
      id?: string | null;
      alertId: string;
      channel: unknown;
      status: unknown;
    }>
  >();
  const operationalAlertsDelegate = client.affiliateOperationalAlerts;
  const scopedWhere = operationalAlertWhereForOverviewScope(
    baseRows,
    selection,
    filters,
    now,
  );
  const filteredWhere = operationalAlertOverviewWhereFor(
    scopedWhere,
    filters,
    now,
  );
  const candidateWhere = operationalAlertUnrecoveredWhereFor(filteredWhere);
  const hasOperationalAlertDbCount =
    typeof operationalAlertsDelegate.count === "function";
  const mergeRecoverySupport = (
    recoveryBatch: OperationalAlertRecoveryBatch,
    retainedCandidates: readonly OperationalAlertRecoveryAlert[],
  ): void => {
    const retainedCandidateIds = new Set(
      retainedCandidates.map((candidate) => candidate.id),
    );
    const retainedSourceEventKeys = new Set(
      retainedCandidates
        .map((candidate) =>
          stringValue(recordValue(candidate.payload).sourceEventKey),
        )
        .filter((eventKey): eventKey is string => Boolean(eventKey)),
    );
    const sourceAlerts = recoveryBatch.alerts.filter(
      (alert) =>
        !retainedCandidateIds.has(alert.id) &&
        retainedSourceEventKeys.has(alert.eventKey),
    );
    sourceAlerts.forEach((alert) =>
      supportingAlerts.set(alert.id, alert),
    );
    const supportedAlertIds = new Set([
      ...retainedCandidateIds,
      ...sourceAlerts.map((alert) => alert.id),
    ]);
    recoveryBatch.gatewayJobs.forEach((job) => {
      const linked = recoveryBatch.alerts.some((alert) =>
        supportedAlertIds.has(alert.id) &&
        alertGatewayJobIdFor(alert, recordValue(alert.payload)) === job.id,
      );
      if (linked) supportingGatewayJobs.set(job.id, job);
    });
    const sourceAlertsByEventKey = new Map(
      sourceAlerts.map((alert) => [alert.eventKey, alert]),
    );
    retainedCandidates.forEach((candidate) => {
      const payload = recordValue(candidate.payload);
      const sourceEventKey = stringValue(payload.sourceEventKey);
      const channel = stringValue(payload.channel);
      const sourceAlert = sourceEventKey
        ? sourceAlertsByEventKey.get(sourceEventKey)
        : undefined;
      if (!sourceAlert || !channel) return;
      const deliveryPairKey =
        `${sourceAlert.id}\u0000${upper(channel)}`;
      recoveryBatch.deliveredAttempts
        .filter((delivery) =>
          `${delivery.alertId}\u0000${upper(delivery.channel)}` ===
          deliveryPairKey,
        )
        .forEach((delivery) =>
          supportingDeliveries.set(deliveryPairKey, delivery),
        );
    });
  };
  const baseCandidateRows = operationalAlertRecoveryCandidateRowsFor(
    baseRows.operationalAlerts,
  );
  const baseRecoveryBatch =
    baseCandidateRows.length > 0
      ? await loadOperationalAlertRecoveryBatch(
          client.affiliateOperationalAlerts,
          client.affiliateOperationalAlertDeliveries,
          client.affiliateAgentGatewayJobs,
          baseCandidateRows,
        )
      : { alerts: [], gatewayJobs: [], deliveredAttempts: [] };
  mergeRecoverySupport(baseRecoveryBatch, baseCandidateRows);
  let total: number;
  let candidateTotal: number;
  let dynamicallyRecovered = 0;
  const processCandidateBatch = async (
    candidateRows: readonly OperationalAlertRecoveryAlert[],
  ): Promise<void> => {
    if (candidateRows.length === 0) return;
    const recoveryBatch = await loadOperationalAlertRecoveryBatch(
      client.affiliateOperationalAlerts,
      client.affiliateOperationalAlertDeliveries,
      client.affiliateAgentGatewayJobs,
      candidateRows,
    );
    const recoveryRows = operationalAlertRecoveryRowsFor(
      baseRows,
      [...baseRecoveryBatch.alerts, ...recoveryBatch.alerts],
      [
        ...baseRecoveryBatch.deliveredAttempts,
        ...recoveryBatch.deliveredAttempts,
      ],
      [
        ...baseRows.gatewayJobs,
        ...baseRecoveryBatch.gatewayJobs,
        ...recoveryBatch.gatewayJobs,
      ],
    );
    const batchRows = scopeProjectionRows(
      {
        ...baseRows,
        operationalAlerts: projectionAlertBatchForScope(candidateRows),
        alertDeliveries: [],
      },
      selection,
    );
    const overviewBatchRows = scopeOverviewRows(batchRows, filters, now);
    const matchingAlerts =
      overviewBatchRows.operationalAlerts as readonly OperationalAlertRecoveryAlert[];
    const recoveredAlerts = matchingAlerts.filter((alert) =>
      operationalAlertRecovered(alert, recoveryRows, now),
    );
    dynamicallyRecovered += recoveredAlerts.length;
    const unrecoveredAlerts = matchingAlerts.filter(
      (alert) => !operationalAlertRecovered(alert, recoveryRows, now),
    );
    const remaining = Math.max(0, MAX_EXCEPTION_ROWS - alerts.length);
    const retainedAlerts = unrecoveredAlerts.slice(0, remaining);
    alerts.push(...retainedAlerts);
    mergeRecoverySupport(
      recoveryBatch,
      [...baseCandidateRows, ...retainedAlerts],
    );
  };
  if (hasOperationalAlertDbCount) {
    [total, candidateTotal] = await Promise.all([
      operationalAlertsDelegate.count({ where: filteredWhere }),
      operationalAlertsDelegate.count({ where: candidateWhere }),
    ]);
    for (
      let offset = 0;
      offset < candidateTotal;
      offset += MAX_EXCEPTION_ROWS
    ) {
      const candidateBatch = await alertBatchForQuery(
        operationalAlertsDelegate,
        candidateWhere,
        offset,
        MAX_EXCEPTION_ROWS,
      );
      await processCandidateBatch(
        operationalAlertRecoveryCandidateRowsFor(candidateBatch),
      );
    }
  } else {
    const loaded = await alertBatchForQuery(
      operationalAlertsDelegate,
      filteredWhere,
      0,
      MAX_ALERT_RECOVERY_SCAN_ROWS,
    );
    const candidateRows = operationalAlertRecoveryCandidateRowsFor(loaded);
    total = loaded.length;
    candidateTotal = candidateRows.length;
    await processCandidateBatch(candidateRows);
  }
  const alertIds = alerts.map((alert) => alert.id);
  const deliveryRows =
    alertIds.length > 0
      ? await client.affiliateOperationalAlertDeliveries.findMany({
          where: { alertId: { in: alertIds } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          distinct: ["alertId"],
          take: alertIds.length,
          select: {
            id: true,
            createdAt: true,
            alertId: true,
            channel: true,
            status: true,
            attempt: true,
            deliveredAt: true,
            responseCode: true,
            responseBody: true,
            errorMessage: true,
          },
        })
      : [];
  const deliveries = deliveryRows.filter((delivery) =>
    alertIds.includes(delivery.alertId),
  );
  return {
    alerts,
    supportingAlerts: [...supportingAlerts.values()],
    supportingGatewayJobs: [...supportingGatewayJobs.values()],
    deliveries,
    supportingDeliveries: [...supportingDeliveries.values()],
    summary: {
      total,
      recovered: Math.max(0, total - candidateTotal) + dynamicallyRecovered,
    },
  };
};

const alertActiveFor = (
  payload: Record<string, unknown>,
  recovery: OperationalAlertRecovery,
): boolean => {
  if (recovery.recovered) return false;
  const explicitActive = payload.active ?? payload.isActive;
  if (typeof explicitActive === "boolean") return explicitActive;
  return payload.resolved === true || Boolean(payload.resolvedAt) ? false : true;
};

const alertSeverityFor = (
  severity: string,
): AlertHistoryRow["severity"] =>
  upper(severity) === "CRITICAL"
    ? "critical"
    : upper(severity) === "WARNING"
      ? "warning"
      : "info";

const alertDeliverySummaryFor = (
  deliveries: readonly ProjectionAlertDeliveryRecord[],
  stats: ProjectionAlertDeliveryStats | undefined,
): Readonly<{
  deliveryCount: number;
  deliveredCount: number;
  latestDeliveryStatus: string | null;
}> => {
  const latestDelivery = deliveries[0] ?? null;
  return {
    deliveryCount: stats?.deliveryCount ?? deliveries.length,
    deliveredCount:
      stats?.deliveredCount ??
      deliveries.filter(
        (delivery) => upper(delivery.status) === "DELIVERED",
      ).length,
    latestDeliveryStatus:
      stats?.latestDeliveryStatus ?? latestDelivery?.status ?? null,
  };
};

const alertHistoryRowFor = (
  alert: OperationalAlertRecoveryAlert,
  rows: ProjectionRows,
  recoveryRows: ProjectionRows,
  now: Date,
): AlertHistoryRow => {
  const payload = recordValue(alert.payload);
  const deliveries = dedupeAlertDeliveries(
    rows.alertDeliveries.filter((delivery) => delivery.alertId === alert.id),
  );
  const deliveryStats = rows.alertDeliveryStats.get(alert.id);
  const deliverySummary = alertDeliverySummaryFor(deliveries, deliveryStats);
  const recovery = operationalAlertRecoveryFor(alert, recoveryRows, now);
  const active = alertActiveFor(payload, recovery);
  const severity = alertSeverityFor(alert.severity);
  return {
    id: alert.id,
    eventKey: alert.eventKey,
    category: alert.category,
    severity,
    title: alert.title,
    detail: alert.detail,
    at: isoValue(alert.createdAt),
    active,
    recovered: recovery.recovered,
    recoveryDetail: recovery.detail,
    recoveryEvidenceRefs: recovery.evidenceRefs,
    ...deliverySummary,
    href: adminLinkForOperationalAlert(alert, recoveryRows),
  };
};

const buildAlerts = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
  recoveryRows: ProjectionRows = rows,
  now: Date = new Date(),
): AlertsProjection => {
  const alertPageIds = new Set(rows.operationalAlertPageIds);
  const alertRows: AlertHistoryRow[] = [...rows.operationalAlerts]
    .filter(
      (alert) =>
        !("operationalAlertPage" in rows) || alertPageIds.has(alert.id),
    )
    .sort(compareProjectionTimestampIdAttempt)
    .map((alert) =>
      alertHistoryRowFor(alert, rows, recoveryRows, now),
    );
  const page =
    rows.operationalAlertPage === undefined
      ? paginate(alertRows, input.page, input.pageSize)
      : {
          rows: alertRows,
          page: rows.operationalAlertPage,
          pageSize: rows.operationalAlertPageSize,
          total: rows.operationalAlertTotal,
        };
  return {
    rows: page.rows,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
  };
};

const buildCutover = (
  rows: ProjectionRows,
  input: AffiliateOperationsProjectionInput,
): CutoverProjection => {
  const runRows: ReconciliationRunRow[] = [...rows.reconciliationRuns]
    .sort(compareProjectionTimestampIdAttempt)
    .map((run) => ({
      id: run.id,
      mode: run.mode,
      status: run.status,
      operatorId: run.operatorId,
      rolloutCohort: run.rolloutCohort,
      supplyContractVersion: run.supplyContractVersion,
      supplyContractHash: run.supplyContractHash,
      deploymentContractVersion: run.deploymentContractVersion,
      deploymentContractHash: run.deploymentContractHash,
      inputHash: run.inputHash,
      outputHash: run.outputHash,
      reportHash: run.reportHash,
      counts: boundedEvidenceCounts(run.counts),
      recordsByKind: boundedRecordsByKind(
        recordValue(run.counts).recordsByKind,
      ),
      failedInvariants: stringList(run.failedInvariants),
      resolutionRefs: stringList(run.resolutionRefs),
      reportEvidence: reconciliationReportEvidenceFor(run),
      createdAt: isoValue(run.createdAt),
      updatedAt: isoValue(run.updatedAt),
      appliedAt: isoValue(run.appliedAt),
      appliedBy: run.appliedBy,
      href: adminLink("cutover", "reconciliationRun", run.id),
    }));
  return {
    rows: runRows,
    page: rows.reconciliationRunPage,
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(input.pageSize || DEFAULT_PAGE_SIZE)),
    ),
    total: rows.reconciliationRunTotal,
  };
};

type ProjectionRowsWithAlertSummary = ProjectionRows & Readonly<{
  operationalAlertFilteredTotal: number;
  operationalAlertFilteredRecoveredTotal: number;
}>;

const buildOverview = (
  rows: ProjectionRowsWithAlertSummary,
  rootsById: ReadonlyMap<string, ProjectionRows["roots"][number]>,
  contractJson: unknown,
  contract: AffiliateOperationsContractSelection,
  now: Date,
  filters: AffiliateOperationsFilters,
  recoveryRows: ProjectionRows,
): OverviewProjection => {
  const dateRangeCutoff = dateRangeCutoffFor(filters.range, now);
  const targetDeficits = buildTargetDeficits(
    rows,
    rootsById,
    contractJson,
    contract,
    now,
    filters,
  ).filter(
    (row) =>
      containsFilter(row.status, filters.status) &&
      (!filters.range ||
        rows.demands.some(
          (demand) =>
            demand.marketKey === row.marketKey &&
            demand.sportId === row.sportId &&
            upper(demand.sourceProfile) === upper(row.sourceProfile) &&
            matchesDateRange(
              demand.openedAt ?? demand.updatedAt,
              dateRangeCutoff,
            ),
        )),
  );
  const activeJobs = rows.gatewayJobs.filter((job) =>
    ["CLAIMED", "RETRY_WAIT", "RECONCILIATION_REQUIRED"].includes(
      upper(job.status),
    ),
  ).length;
  const waitingJobs = rows.gatewayJobs.filter((job) =>
    ["QUEUED", "RETRY_WAIT"].includes(upper(job.status)),
  ).length;
  const activeWorkers = rows.workerHealth.filter((worker) =>
    isWorkerHealthy(worker, now),
  ).length;
  const stoppedWorkers = rows.workerHealth.length - activeWorkers;
  const allExceptions = buildExceptions(rows, now, recoveryRows);
  const alertExceptionCount = allExceptions.filter(
    (exception) => exception.kind === "ALERT",
  ).length;
  const knownRecoveredAlertCount =
    rows.operationalAlertFilteredRecoveredTotal;
  const totalAlertExceptionCount = Math.max(
    alertExceptionCount,
    rows.operationalAlertFilteredTotal - knownRecoveredAlertCount,
  );
  const exceptionTotal =
    allExceptions.length
    - alertExceptionCount
    + totalAlertExceptionCount;
  const exceptions = allExceptions.slice(0, MAX_EXCEPTION_ROWS);
  return {
    targetDeficits,
    wipSeries: buildWipSeries(rows, now),
    lifecycleCounts: buildLifecycleCounts(rows),
    exceptions,
    exceptionTotal,
    priorityWork: buildPriorityWork(rows, now),
    counts: {
      supplySources: rows.roots.length,
      openDemands: rows.demands.filter((demand) =>
        ["OPEN", "PAUSED"].includes(upper(demand.status)),
      ).length,
      activeJobs,
      waitingJobs,
      activeWorkers,
      stoppedWorkers,
      starvationCells: rows.coverageCells.filter(
        (cell) =>
          upper(cell.searchStatus) === "WAITING_FOR_PIPELINE" &&
          cell.unresolvedLeadCount > 0,
      ).length,
      backpressureJobs:
        rows.coverageJobs.filter((job) => job.isBlockingCoverage).length +
        rows.gatewayJobs.filter((job) => Boolean(job.pipelineBlockedAt)).length,
      totalTargetDeficit: targetDeficits.reduce(
        (sum, row) => sum + row.deficit,
        0,
      ),
    },
  };
};
export const loadAffiliateOperationsProjection = async (
  input: AffiliateOperationsProjectionInput,
): Promise<AffiliateOperationsProjection> => {
  const view = isAffiliateOperationsView(input.view) ? input.view : "overview";
  const page = Math.max(1, Math.trunc(input.page || 1));
  const targetPage = Math.max(1, Math.trunc(input.targetPage || 1));
  const campaignPage = Math.max(1, Math.trunc(input.campaignPage || 1));
  const discoveryPage = Math.max(1, Math.trunc(input.discoveryPage || 1));
  const historyPage = Math.max(1, Math.trunc(input.historyPage || 1));
  const historyPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.historyPageSize || DEFAULT_PAGE_SIZE)),
  );
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize || DEFAULT_PAGE_SIZE)),
  );
  const now = new Date();
  return prisma.$transaction(
    async (client) => {
      const requestedCohort = input.contract.rolloutCohort.trim() || "DEFAULT";
      const requestedVersion = input.contract.contractVersion;
      const contract = await client.affiliateSupplyContractManifests.findFirst({
        where: {
          status: "ACTIVE",
          rolloutCohort: requestedCohort,
          version: requestedVersion ?? undefined,
        },
        orderBy: { activatedAt: "desc" },
        select: {
          id: true,
          rolloutCohort: true,
          version: true,
          status: true,
          contractHash: true,
          contractJson: true,
          componentHashes: true,
          activatedAt: true,
        },
      });
      if (!contract) {
        throw new Error(
          `Supply Contract ${requestedCohort} / v${requestedVersion ?? "latest"} is not available.`,
        );
      }
      const contractSelection: AffiliateOperationsContractSelection = {
        rolloutCohort: contract.rolloutCohort,
        contractVersion: contract.version,
      };
      const rows = await loadProjectionRows(
        client,
        contractSelection,
        page,
        pageSize,
        input.selectedType === "reconciliationRun" ? input.selectedId : null,
        input.selectedType === "alert" ? input.selectedId : null,
        now,
        historyPage,
        historyPageSize,
      );
      const exceptionRail = await loadUnrecoveredOperationalAlertRail(
        client,
        rows,
        contractSelection,
        input.filters,
        now,
      );
      const displayAlertsById = new Map(
        rows.operationalAlerts.map((alert) => [alert.id, alert]),
      );
      exceptionRail.alerts.forEach((alert) =>
        displayAlertsById.set(
          alert.id,
          alert as (typeof rows.operationalAlerts)[number],
        ),
      );
      const displayGatewayJobsById = new Map(
        rows.gatewayJobs.map((job) => [job.id, job]),
      );
      exceptionRail.supportingGatewayJobs.forEach((job) =>
        displayGatewayJobsById.set(job.id, job),
      );
      const displayRows = {
        ...rows,
        gatewayJobs: [...displayGatewayJobsById.values()],
        operationalAlerts: [...displayAlertsById.values()],
        alertDeliveries: [
          ...rows.alertDeliveries,
          ...exceptionRail.deliveries,
        ],
      };
      const recoveryAlertsById = new Map(
        displayRows.operationalAlerts.map((alert) => [alert.id, alert]),
      );
      exceptionRail.supportingAlerts.forEach((alert) =>
        recoveryAlertsById.set(
          alert.id,
          alert as (typeof rows.operationalAlerts)[number],
        ),
      );
      const recoveryRows = {
        ...displayRows,
        operationalAlerts: [...recoveryAlertsById.values()],
        alertDeliveries: [
          ...displayRows.alertDeliveries,
          ...exceptionRail.supportingDeliveries,
        ],
      } as ProjectionRows;
      const scopedRows = scopeProjectionRows(displayRows, contractSelection);
      const overviewRows = scopeOverviewRows(scopedRows, input.filters, now);
      const alertSummary = exceptionRail.summary;
      const overviewRowsWithSummary = {
        ...overviewRows,
        operationalAlertFilteredTotal: alertSummary.total,
        operationalAlertFilteredRecoveredTotal: alertSummary.recovered,
      };
      const rootsById = new Map(
        overviewRows.roots.map((root) => [root.id, root]),
      );
      const overview = buildOverview(
        overviewRowsWithSummary,
        rootsById,
        contract?.contractJson,
        contractSelection,
        now,
        input.filters,
        recoveryRows,
      );
      const normalizedInput: AffiliateOperationsProjectionInput = {
        ...input,
        view,
        page,
        pageSize,
        targetPage,
        campaignPage,
        discoveryPage,
        historyPage,
        historyPageSize,
        contract: contractSelection,
      };
      const coverage = buildCoverage(scopedRows, normalizedInput, now);
      const jobs = buildJobs(scopedRows, normalizedInput, now);
      const intake = buildIntakes(scopedRows, normalizedInput, now);
      const review = buildReviews(scopedRows, normalizedInput, now);
      const sources = buildSources(scopedRows, normalizedInput, now);
      const { candidates } = buildCandidates(scopedRows, normalizedInput, now);
      const alerts = buildAlerts(scopedRows, normalizedInput, recoveryRows, now);
      const cutover = buildCutover(scopedRows, normalizedInput);
      const historyRevision = historyRevisionFor(scopedRows, contractSelection);
      const projection: AffiliateOperationsProjection = {
        schemaVersion: 2,
        asOf: now.toISOString(),
        historyRevision,
        stale: false,
        view,
        filters: input.filters,
        contract: contractSelection,
        sort: input.sort,
        overview,
        coverage,
        jobs,
        intake,
        review,
        sources,
        candidates,
        alerts,
        cutover,
        selected: buildSelectedDetail(
          scopedRows,
          normalizedInput,
          now,
          recoveryRows,
        ),
      };
      appendProjectionContractToLinks(projection, contractSelection);
      return projection;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 20_000,
    },
  );
};

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
