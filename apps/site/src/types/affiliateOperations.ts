export const AFFILIATE_OPERATIONS_VIEWS = [
  'overview',
  'coverage',
  'jobs',
  'intake',
  'review',
  'sources',
  'candidates',
  'alerts',
  'cutover',
] as const;
export type AffiliateOperationsView = typeof AFFILIATE_OPERATIONS_VIEWS[number];
export const AFFILIATE_OPERATIONS_DETAIL_TYPES = [
  'job',
  'intake',
  'review',
  'source',
  'candidate',
  'coverageCell',
  'demand',
  'wave',
  'campaign',
  'discoveryRun',
  'discoveryQuery',
  'discoveryResult',
  'target',
  'mapping',
  'claim',
  'worker',
  'operation',
  'transition',
  'alert',
  'reconciliationRun',
  'scrapeRun',
  'intakeRun',
  'page',
  'artifact',
  'organization',
  'package',
  'event',
] as const;

export type AffiliateOperationsDetailType =
  | typeof AFFILIATE_OPERATIONS_DETAIL_TYPES[number];

export type AffiliateOperationsFilters = Readonly<{
  market: string;
  city: string;
  sport: string;
  profile: string;
  range: string;
  status: string;
  lane: string;
  role: string;
  reason: string;
}>;

export type AffiliateOperationsSort = Readonly<{
  key: string;
  direction: 'asc' | 'desc';
}>;

export type AffiliateOperationsContractSelection = Readonly<{
  rolloutCohort: string;
  contractVersion: number | null;
}>;


export type ProjectionLink = Readonly<{
  href: string;
  label: string;
}>;

export type ProjectionField = Readonly<{
  label: string;
  value: string;
  href?: string | null;
}>;

export type ProjectionHistoryRow = Readonly<{
  id: string;
  kind: string;
  at: string | null;
  status: string | null;
  reason: string | null;
  actor: string | null;
  provider?: string | null;
  lane?: string | null;
  lifecycleGeneration?: number | null;
  contractVersion?: number | null;
  claimGeneration?: number | null;
  queuedAt?: string | null;
  startedAt?: string | null;
  heartbeatAt?: string | null;
  finishedAt?: string | null;
  effectiveAt?: string | null;
  recordedAt?: string | null;
  workerId?: string | null;
  executorId?: string | null;
  attempt?: number | null;
  previousState?: string | null;
  nextState?: string | null;
  evidenceRefs?: readonly string[];
  inputHash?: string | null;
  outputHash?: string | null;
  href?: string | null;
}>;

export type ProjectionRelatedRow = Readonly<{
  id: string;
  kind: string;
  label: string;
  status: string | null;
  href?: string | null;
}>;

export type ProjectionDetail = Readonly<{
  id: string;
  kind: AffiliateOperationsDetailType;
  title: string;
  subtitle: string;
  status: string | null;
  sections: readonly Readonly<{
    title: string;
    fields: readonly ProjectionField[];
  }>[];
  history: readonly ProjectionHistoryRow[];
  historyPage?: number;
  historyPageSize?: number;
  historyTotal?: number;
  historyTotalPages?: number;
  related: readonly ProjectionRelatedRow[];
}>;


export type SupplyTargetDeficitRow = Readonly<{
  id: string;
  marketKey: string | null;
  sportId: string | null;
  sourceProfile: string;
  rolloutCohort: string;
  contractVersion: number;
  current: number;
  target: number;
  deficit: number;
  priority: number;
  status: string;
  href: string;
}>;

export type WipSeriesPoint = Readonly<{
  at: string;
  lane: 'MAPPING' | 'REVIEW';
  activeWorkers: number;
  waitingJobs: number;
  workerLimit: number | null;
  replenishmentWaves: number;
}>;

export type LifecycleCountRow = Readonly<{
  stage: string;
  count: number;
  href: string;
}>;

export type ExceptionRow = Readonly<{
  id: string;
  kind: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  at: string | null;
  href: string;
}>;

export type AlertHistoryRow = Readonly<{
  id: string;
  eventKey: string;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  at: string | null;
  active: boolean;
  recovered: boolean;
  recoveryDetail: string | null;
  recoveryEvidenceRefs: readonly string[];
  deliveryCount: number;
  deliveredCount: number;
  latestDeliveryStatus: string | null;
  href: string;
}>;

export type AlertsProjection = Readonly<{
  rows: readonly AlertHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type ReconciliationPreflightEvidence = Readonly<{
  evaluatedAt: string | null;
  isReady: boolean | null;
  gatewayVersion: number | null;
  reviewedLegacyProcessManifestHash: string | null;
  reviewedLegacyProcessManifestCount: number | null;
  reviewedLegacyProcessManifestArtifactId: string | null;
  processInventoryArtifactId: string | null;
  processInventoryHash: string | null;
  processInventoryCount: number | null;
  reviewedSystemdUnits: readonly Readonly<{
    processId: string;
    unitId: string;
  }>[];
  legacyServiceUnits: readonly Readonly<{
    id: string;
    isEnabled: string;
    isActive: string;
  }>[];
  counts: Readonly<Record<string, number>>;
  recordsByKind: Readonly<Record<string, number>>;
  reviewedAgentNetwork: string | null;
}>;

export type ReconciliationEvidencePage = Readonly<{
  page: number;
  pageSize: number;
  total: number;
  truncated: boolean;
}>;

export type ReconciliationEvidencePagination = Readonly<{
  processes: ReconciliationEvidencePage;
  roots: ReconciliationEvidencePage;
  claimActions: ReconciliationEvidencePage;
  blockingFindings: ReconciliationEvidencePage;
  warnings: ReconciliationEvidencePage;
  resolutions: ReconciliationEvidencePage;
  recordEvidence: ReconciliationEvidencePage;
  sourceIds: ReconciliationEvidencePage;
  recordIds: ReconciliationEvidencePage;
  evidenceRefs: ReconciliationEvidencePage;
}>;

export type ReconciliationProcessEvidence = Readonly<{
  id: string;
  kind: string;
  role: string | null;
  workerId: string | null;
  processClass: string | null;
  command: string | null;
  status: string | null;
}>;

export type ReconciliationRootEvidence = Readonly<{
  existingRootId: string | null;
  identityKey: string | null;
  canonicalUrl: string | null;
  origin: string | null;
  pathKey: string | null;
  derivedStage: string | null;
  action: string | null;
  sourceIds: readonly string[];
  recordIds: readonly string[];
  evidenceRefs: readonly string[];
  targetProjections: readonly Readonly<{
    sourceTargetId: string;
    candidateId: string | null;
    targetType: string;
    targetId: string;
    status: string;
    action: string;
    evidenceRefs: readonly string[];
  }>[];
}>;

export type ReconciliationClaimEvidence = Readonly<{
  id: string;
  kind: string;
  status: string | null;
  action: string | null;
  sourceId: string | null;
  supplySourceId: string | null;
  evidenceRefs: readonly string[];
}>;

export type ReconciliationFindingEvidence = Readonly<{
  code: string;
  severity: string;
  detail: string;
  recordIds: readonly string[];
  resolution: string;
}>;

export type ReconciliationRecordEvidence = Readonly<{
  id: string;
  kind: string;
  status: string | null;
  at: string | null;
  detail: string | null;
  refs: readonly string[];
  sourceIds: readonly string[];
  recordIds: readonly string[];
  evidenceRefs: readonly string[];
}>;

export type ReconciliationReportEvidence = Readonly<{
  kind: string | null;
  schemaVersion: number | null;
  evaluatedAt: string | null;
  sessionId: string | null;
  sessionHash: string | null;
  evidenceHash: string | null;
  evidenceComplete: boolean | null;
  isApplySafe: boolean | null;
  decisionMode: string | null;
  decisionReasonCode: string | null;
  decisionDetail: string | null;
  decisionResolution: string | null;
  legacySnapshotHash: string | null;
  supplyContractVersion: number | null;
  supplyContractHash: string | null;
  deploymentContractVersion: number | null;
  deploymentContractHash: string | null;
  inputHash: string | null;
  outputHash: string | null;
  reportHash: string | null;
  counts: Readonly<Record<string, number>>;
  recordsByKind: Readonly<Record<string, number>>;
  preflight: ReconciliationPreflightEvidence | null;
  evidencePagination: ReconciliationEvidencePagination;
  processes: readonly ReconciliationProcessEvidence[];
  roots: readonly ReconciliationRootEvidence[];
  claimActions: readonly ReconciliationClaimEvidence[];
  blockingFindings: readonly ReconciliationFindingEvidence[];
  warnings: readonly ReconciliationFindingEvidence[];
  resolutions: readonly ReconciliationFindingEvidence[];
  recordEvidence: readonly ReconciliationRecordEvidence[];
}>;

export type ReconciliationRunRow = Readonly<{
  id: string;
  mode: string;
  status: string;
  operatorId: string | null;
  rolloutCohort: string;
  supplyContractVersion: number | null;
  supplyContractHash: string | null;
  deploymentContractVersion: number | null;
  deploymentContractHash: string | null;
  inputHash: string;
  outputHash: string;
  reportHash: string;
  counts: Readonly<Record<string, number>>;
  recordsByKind: Readonly<Record<string, number>>;
  failedInvariants: readonly string[];
  resolutionRefs: readonly string[];
  reportEvidence: ReconciliationReportEvidence;
  createdAt: string | null;
  updatedAt: string | null;
  appliedAt: string | null;
  appliedBy: string | null;
  href: string;
}>;

export type CutoverProjection = Readonly<{
  rows: readonly ReconciliationRunRow[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type PriorityWorkRow = Readonly<{
  id: string;
  kind: 'REPLENISHMENT_DEMAND' | 'MAPPING_JOB' | 'REVIEW_CASE';
  priority: number;
  title: string;
  status: string;
  ageMinutes: number;
  href: string;
}>;

export type OverviewProjection = Readonly<{
  targetDeficits: readonly SupplyTargetDeficitRow[];
  wipSeries: readonly WipSeriesPoint[];
  lifecycleCounts: readonly LifecycleCountRow[];
  exceptions: readonly ExceptionRow[];
  exceptionTotal: number;
  priorityWork: readonly PriorityWorkRow[];
  counts: Readonly<{
    supplySources: number;
    openDemands: number;
    activeJobs: number;
    waitingJobs: number;
    activeWorkers: number;
    stoppedWorkers: number;
    starvationCells: number;
    backpressureJobs: number;
    totalTargetDeficit: number;
  }>;
}>;

export type CoverageCellRow = Readonly<{
  id: string;
  city: string;
  marketKey: string;
  sport: string;
  profile: string;
  coverageStatus: string;
  searchStatus: string;
  priorityScore: number;
  approvedSourceCount: number;
  unresolvedLeadCount: number;
  nextReviewAt: string | null;
  href: string;
}>;

export type MarginalYieldRow = Readonly<{
  id: string;
  cycle: string;
  at: string | null;
  qualifiedSources: number;
  failedQueries: number;
  unresolvedLeads: number;
  strategyFamilies: string;
  href: string;
}>;

export type DemandHistoryRow = Readonly<{
  id: string;
  at: string | null;
  openDemand: number;
  campaignStarts: number;
  mappingJobsProduced: number;
  targetRestorations: number;
  href: string;
}>;

export type CoverageTargetRow = Readonly<{
  id: string;
  targetType: string;
  targetId: string | null;
  marketKey: string | null;
  sportId: string | null;
  sourceProfile: string;
  status: string;
  supplySourceId: string;
  candidateId: string | null;
  freshnessExpiresAt: string | null;
  publicTargetExists: boolean;
  publicTargetState: string;
  publicTargetName: string | null;
  publicTargetHref: string | null;
  href: string;
}>;

export type CampaignRow = Readonly<{
  id: string;
  name: string;
  region: string;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  queryLimit: number;
  resultLimit: number;
  href: string;
}>;

export type DiscoveryOutcomeRow = Readonly<{
  id: string;
  at: string | null;
  campaignId: string;
  query: string;
  provider: string;
  status: string;
  returnedResults: number;
  qualifiedSources: number;
  intakesCreated: number;
  failed: number;
  href: string;
}>;

export type CoverageMovementRow = Readonly<{
  id: string;
  at: string | null;
  label: string;
  direction: string;
  count: number;
  refreshClass: string;
  reason: string | null;
  href: string;
}>;

export type CoverageProjection = Readonly<{
  cells: Readonly<{
    rows: readonly CoverageCellRow[];
    page: number;
    pageSize: number;
    total: number;
  }>;
  targets: readonly CoverageTargetRow[];
  targetPage: number;
  targetPageSize: number;
  targetTotal: number;
  campaigns: readonly CampaignRow[];
  campaignPage: number;
  campaignPageSize: number;
  campaignTotal: number;
  discoveryOutcomes: readonly DiscoveryOutcomeRow[];
  discoveryPage: number;
  discoveryPageSize: number;
  discoveryTotal: number;
  marginalYield: readonly MarginalYieldRow[];
  demandHistory: readonly DemandHistoryRow[];
  saturation: Readonly<{
    saturated: number;
    eligible: number;
    unresolved: number;
  }>;
}>;

export type JobRow = Readonly<{
  id: string;
  kind: string;
  queue: string;
  lane: string;
  role: string;
  subjectId: string | null;
  status: string;
  ageMinutes: number;
  retries: number;
  failure: string | null;
  provider: string | null;
  refreshClass?: string | null;
  invocation: string | null;
  transition: string | null;
  workerId: string | null;
  lineage: string;
  href: string;
}>;
export type QueueAgeBand = Readonly<{
  band: string;
  count: number;
  description: string;
}>;

export type QueueAgeLane = Readonly<{
  lane: string;
  bands: readonly QueueAgeBand[];
}>;

export type FailureParetoRow = Readonly<{
  reason: string;
  count: number;
  refreshClass: string;
}>;

export type WorkerHealthRow = Readonly<{
  id: string;
  workerId: string;
  role: string;
  status: string;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
  isHealthy: boolean;
  href: string;
}>;
export type JobsProjection = Readonly<{
  rows: readonly JobRow[];
  page: number;
  pageSize: number;
  total: number;
  ageBands: readonly QueueAgeBand[];
  ageByLane: readonly QueueAgeLane[];
  failures: readonly FailureParetoRow[];
  workers: readonly WorkerHealthRow[];
}>;

export type IntakeRow = Readonly<{
  id: string;
  name: string;
  sourceKey: string;
  status: string;
  complianceStatus: string;
  region: string | null;
  supplySourceId: string | null;
  pageCount: number;
  captureCount: number;
  artifactCount: number;
  mappingJobId: string | null;
  latestRunStatus: string | null;
  href: string;
}>;

export type IntakeProjection = Readonly<{
  rows: readonly IntakeRow[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type ReviewRow = Readonly<{
  id: string;
  caseType: string;
  subjectId: string | null;
  status: string;
  reviewerId: string | null;
  packageHash: string | null;
  evidenceCount: number;
  reason: string | null;
  createdAt: string | null;
  href: string;
  detailType?: AffiliateOperationsDetailType;
  detailId?: string;
}>;

export type ReviewProjection = Readonly<{
  rows: readonly ReviewRow[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type SourceRow = Readonly<{
  id: string;
  canonicalUrl: string;
  operatorDomain: string | null;
  predecessorId: string | null;
  successorId: string | null;
  lifecycleStage: string;
  outcome: string | null;
  freshness: string;
  isAutomationEnabled: boolean;
  isExcluded: boolean;
  holdReason: string | null;
  lifecycleGeneration: number;
  targetContribution: number;
  organizationId: string | null;
  intakeId: string | null;
  liveSourceId: string | null;
  mappingId: string | null;
  targetCount: number;
  lastSuccessfulRefreshAt: string | null;
  invariantViolations: readonly string[];
  href: string;
}>;

export type SourceMovementRow = CoverageMovementRow;

export type SourcesProjection = Readonly<{
  rows: readonly SourceRow[];
  lifecycleMovement: readonly SourceMovementRow[];
  freshnessMovement: readonly SourceMovementRow[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type CandidateRow = Readonly<{
  id: string;
  title: string;
  listingKind: string;
  status: string;
  sourceId: string;
  supplySourceId: string | null;
  runId: string;
  targetId: string | null;
  targetStatus: string | null;
  rejectionReason: string | null;
  freshnessExpiresAt: string | null;
  city: string | null;
  sport: string | null;
  startsAt: string | null;
  href: string;
}>;

export type CandidatesProjection = Readonly<{
  rows: readonly CandidateRow[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type AffiliateOperationsProjection = Readonly<{
  schemaVersion: 2;
  asOf: string;
  historyRevision: string;
  stale: false;
  view: AffiliateOperationsView;
  filters: AffiliateOperationsFilters;
  contract: AffiliateOperationsContractSelection;
  sort: AffiliateOperationsSort;
  overview: OverviewProjection;
  coverage: CoverageProjection;
  jobs: JobsProjection;
  intake: IntakeProjection;
  review: ReviewProjection;
  sources: SourcesProjection;
  candidates: CandidatesProjection;
  alerts: AlertsProjection;
  cutover: CutoverProjection;
  selected: ProjectionDetail | null;
}>;

export type AffiliateOperationsProjectionInput = Readonly<{
  view: AffiliateOperationsView;
  page: number;
  pageSize: number;
  targetPage: number;
  campaignPage: number;
  discoveryPage: number;
  historyPage: number;
  historyPageSize: number;
  filters: AffiliateOperationsFilters;
  contract: AffiliateOperationsContractSelection;
  sort: AffiliateOperationsSort;
  scrollAnchor: string | null;
  selectedType: AffiliateOperationsDetailType | null;
  selectedId: string | null;
}>;
