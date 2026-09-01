import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import AdminAffiliateOperationsControlRoom from '../AdminAffiliateOperationsControlRoom';
import type {
  AffiliateOperationsProjection,
  AlertHistoryRow,
  CoverageTargetRow,
  ProjectionDetail,
  ReconciliationReportEvidence,
  ReconciliationRunRow,
} from '@/types/affiliateOperations';

const pushMock = jest.fn();
const replaceMock = jest.fn();
const searchParams = new URLSearchParams('tab=affiliateOperations&view=overview');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => '/admin',
  useSearchParams: () => searchParams,
}));

const response = (payload: unknown, ok = true): Response => ({
  ok,
  status: ok ? 200 : 503,
  statusText: ok ? 'OK' : 'Service Unavailable',
  headers: { get: () => 'application/json' } as Headers,
  json: async () => payload,
} as Response);
const emptyEvidencePage = {
  page: 1,
  pageSize: 0,
  total: 0,
  truncated: false,
};
const emptyEvidencePagination = {
  processes: emptyEvidencePage,
  roots: emptyEvidencePage,
  claimActions: emptyEvidencePage,
  blockingFindings: emptyEvidencePage,
  warnings: emptyEvidencePage,
  resolutions: emptyEvidencePage,
  recordEvidence: emptyEvidencePage,
  sourceIds: emptyEvidencePage,
  recordIds: emptyEvidencePage,
  evidenceRefs: emptyEvidencePage,
};

const reportEvidence = (
  overrides: Partial<ReconciliationReportEvidence> = {},
): ReconciliationReportEvidence => ({
  kind: 'RECONCILIATION_REPORT',
  schemaVersion: 1,
  evaluatedAt: '2026-08-24T12:00:00.000Z',
  sessionId: 'session_1',
  sessionHash: 'session_hash',
  evidenceHash: 'evidence_hash',
  isApplySafe: true,
  evidenceComplete: true,
  decisionMode: 'APPLY',
  decisionReasonCode: null,
  decisionDetail: null,
  decisionResolution: null,
  legacySnapshotHash: 'legacy_hash',
  supplyContractVersion: 1,
  supplyContractHash: 'supply_hash',
  deploymentContractVersion: 1,
  deploymentContractHash: 'deployment_hash',
  inputHash: 'input_hash',
  outputHash: 'output_hash',
  counts: { intakes: 1, sources: 1, findings: 0 },
  recordsByKind: {},
  preflight: null,
  evidencePagination: emptyEvidencePagination,
  processes: [],
  roots: [],
  claimActions: [],
  blockingFindings: [],
  warnings: [],
  resolutions: [],
  recordEvidence: [],
  ...overrides,
});
const alertRow = (
  overrides: Partial<AlertHistoryRow> = {},
): AlertHistoryRow => ({
  id: 'alert_1',
  eventKey: 'SOURCE_STALE',
  category: 'SUPPLY',
  severity: 'warning',
  title: 'Source stale',
  detail: 'A source needs a refresh.',
  at: '2026-08-24T12:00:00.000Z',
  active: true,
  recovered: false,
  recoveryDetail: null,
  recoveryEvidenceRefs: [],
  deliveryCount: 2,
  deliveredCount: 1,
  latestDeliveryStatus: 'FAILED',
  href: '/admin?tab=affiliateOperations&view=alerts&selectedType=alert&selected=alert_1',
  ...overrides,
});

const reconciliationRun = (
  overrides: Partial<ReconciliationRunRow> = {},
): ReconciliationRunRow => ({
  id: 'reconciliation_1',
  mode: 'APPLY',
  status: 'APPLIED',
  operatorId: 'operator_1',
  rolloutCohort: 'DEFAULT',
  supplyContractVersion: 1,
  supplyContractHash: 'supply_hash',
  deploymentContractVersion: 1,
  deploymentContractHash: 'deployment_hash',
  inputHash: 'input_hash',
  outputHash: 'output_hash',
  reportHash: 'report_hash',
  counts: { intakes: 1, sources: 1, findings: 0 },
  recordsByKind: {},
  failedInvariants: [],
  resolutionRefs: [],
  reportEvidence: reportEvidence(),
  createdAt: '2026-08-24T12:00:00.000Z',
  updatedAt: '2026-08-24T12:05:00.000Z',
  appliedAt: '2026-08-24T12:05:00.000Z',
  appliedBy: 'operator_1',
  href: '/admin?tab=affiliateOperations&view=cutover&selectedType=reconciliationRun&selected=reconciliation_1',
  ...overrides,
});
const coverageTarget = (
  overrides: Partial<CoverageTargetRow> = {},
): CoverageTargetRow => ({
  id: 'target_1',
  targetType: 'EVENT',
  targetId: 'event_1',
  marketKey: 'US-Austin',
  sportId: 'soccer',
  sourceProfile: 'CLUB',
  status: 'FRESH',
  supplySourceId: 'source_1',
  candidateId: 'candidate_1',
  freshnessExpiresAt: '2026-08-25T12:00:00.000Z',
  publicTargetExists: true,
  publicTargetState: 'VISIBLE',
  publicTargetName: 'River City Open',
  publicTargetHref: 'https://public.example.test/o/river-city/events/event_1',
  href: '/admin?tab=affiliateOperations&view=coverage&selectedType=target&selected=target_1',
  ...overrides,
});

const reconciliationDetail = (): ProjectionDetail => ({
  id: 'reconciliation_1',
  kind: 'reconciliationRun',
  title: 'APPLY reconciliation',
  subtitle: 'Reconciliation run reconciliation_1',
  status: 'APPLIED',
  sections: [
    {
      title: 'Hashes and contracts',
      fields: [
        { label: 'Session ID', value: 'session_1' },
        { label: 'Evidence hash', value: 'evidence_hash' },
      ],
    },
    {
      title: 'Stopped-fleet process evidence',
      fields: [
        { label: 'Process count', value: '1' },
        { label: 'Processes', value: 'legacy-mapping.service: STOPPED' },
      ],
    },
    {
      title: 'Counts and findings',
      fields: [
        { label: 'Blocking findings', value: 'identity_ambiguous' },
        { label: 'Warnings', value: 'none' },
      ],
    },
  ],
  history: [],
  related: [],
});
const projection = (overrides: Partial<AffiliateOperationsProjection> = {}): AffiliateOperationsProjection => ({
  schemaVersion: 2,
  asOf: '2026-08-24T12:00:00.000Z',
  historyRevision: 'revision_1',
  stale: false,
  view: 'overview',
  filters: {
    market: '', city: '', sport: '', profile: '', range: '', status: '', lane: '', role: '', reason: '',
  },
  contract: { rolloutCohort: 'DEFAULT', contractVersion: 1 },
  sort: { key: '', direction: 'desc' },
  overview: {
    targetDeficits: [],
    wipSeries: [],
    lifecycleCounts: [{ stage: 'PUBLISHED', count: 2, href: '/admin?tab=affiliateOperations&view=sources' }],
    exceptions: [],
    exceptionTotal: 0,
    priorityWork: [],
    counts: {
      supplySources: 2,
      openDemands: 1,
      activeJobs: 1,
      waitingJobs: 0,
      activeWorkers: 1,
      stoppedWorkers: 0,
      starvationCells: 0,
      backpressureJobs: 0,
      totalTargetDeficit: 0,
    },
  },
  coverage: {
    cells: { rows: [], page: 1, pageSize: 25, total: 0 },
    targets: [],
    targetPage: 1,
    targetPageSize: 25,
    targetTotal: 0,
    campaigns: [],
    campaignPage: 1,
    campaignPageSize: 25,
    campaignTotal: 0,
    discoveryOutcomes: [],
    discoveryPage: 1,
    discoveryPageSize: 25,
    discoveryTotal: 0,
    marginalYield: [],
    demandHistory: [],
    saturation: { saturated: 0, eligible: 0, unresolved: 0 },
  },
  jobs: {
    rows: [{ id: 'job_1', kind: 'GATEWAY', queue: 'MAPPING', lane: 'MAPPING_PRODUCER', role: 'MAPPING_PRODUCER', subjectId: 'source_1', status: 'QUEUED', ageMinutes: 4, retries: 0, failure: null, provider: null, invocation: null, transition: null, workerId: null, lineage: 'source_1', href: '/admin?tab=affiliateOperations&view=jobs&selectedType=job&selected=job_1' }],
    page: 1,
    pageSize: 25,
    total: 1,
    ageBands: [{ band: '<15m', count: 1, description: 'Descriptive queue age.' }],
    ageByLane: [],
    failures: [],
    workers: [],
  },
  intake: { rows: [], page: 1, pageSize: 25, total: 0 },
  review: { rows: [], page: 1, pageSize: 25, total: 0 },
  sources: { rows: [], lifecycleMovement: [], freshnessMovement: [], page: 1, pageSize: 25, total: 0 },
  candidates: { rows: [], page: 1, pageSize: 25, total: 0 },
  alerts: { rows: [], page: 1, pageSize: 25, total: 0 },
  cutover: { rows: [], page: 1, pageSize: 25, total: 0 },
  selected: null,
  ...overrides,
});

const renderRoom = () => render(
  <MantineProvider>
    <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
  </MantineProvider>,
);

beforeEach(() => {
  searchParams.set('tab', 'affiliateOperations');
  searchParams.set('view', 'overview');
  ['selectedType', 'selected', 'page', 'targetPage', 'campaignPage', 'discoveryPage', 'historyPage', 'historyPageSize', 'market', 'city', 'sport', 'profile', 'range', 'status', 'lane', 'role', 'reason', 'sort', 'direction', 'anchor', 'rolloutCohort', 'contractVersion'].forEach((key) => searchParams.delete(key));
  pushMock.mockReset();
  replaceMock.mockReset();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AdminAffiliateOperationsControlRoom', () => {
  it('navigates read-only views from one projection fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(projection()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    expect(screen.getAllByRole('tab')).toHaveLength(9);
    await waitFor(() => expect(screen.getByText('Current lifecycle counts')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Jobs' }));

    expect(pushMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=jobs',
      { scroll: false },
    );
    expect(screen.queryByRole('button', { name: /scrape|publish|approve|reject|delete|enqueue/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/affiliate-operations?tab=affiliateOperations&view=overview',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });
  it('clears inherited filters when entering Alerts or Cutover', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(projection()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    searchParams.set('market', 'Austin');
    searchParams.set('city', 'Austin');
    searchParams.set('sport', 'soccer');
    searchParams.set('profile', 'EVENT');
    searchParams.set('range', '24h');
    searchParams.set('status', 'FAILED');
    searchParams.set('lane', 'MAPPING');
    searchParams.set('role', 'PUBLISHER');
    searchParams.set('reason', 'STALE');

    renderRoom();
    await waitFor(() =>
      expect(screen.getByText('Current lifecycle counts')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Alerts' }));
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin?tab=affiliateOperations&view=alerts',
      { scroll: false },
    );
    pushMock.mockReset();
    fireEvent.click(screen.getByRole('tab', { name: 'Cutover' }));
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin?tab=affiliateOperations&view=cutover',
      { scroll: false },
    );
  });
  it('normalizes unsupported filters across every tab transition', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(projection()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    searchParams.set('view', 'coverage');
    searchParams.set('city', 'Portland');
    const rendered = renderRoom();
    await waitFor(() => expect(screen.getByText('Coverage Cells')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin?tab=affiliateOperations&view=overview',
      { scroll: false },
    );

    pushMock.mockReset();
    searchParams.set('view', 'jobs');
    searchParams.set('lane', 'MAPPING');
    searchParams.set('role', 'PUBLISHER');
    searchParams.set('reason', 'STALE');
    rendered.rerender(
      <MantineProvider>
        <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
      </MantineProvider>,
    );
    await waitFor(() => expect(screen.getByText('Unified jobs and invocations')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin?tab=affiliateOperations&view=overview',
      { scroll: false },
    );
  });
  it('normalizes unsupported filters on direct Alerts projection links', async () => {
    const alertHref =
      '/admin?tab=affiliateOperations&view=alerts&selectedType=alert&selected=alert_1';
    searchParams.set('view', 'overview');
    searchParams.set('city', 'Portland');
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      overview: {
        ...projection().overview,
        exceptions: [{
          id: 'alert:alert_1',
          kind: 'ALERT',
          severity: 'warning',
          title: 'Direct alert',
          detail: 'Follow the alert evidence.',
          at: '2026-08-24T12:00:00.000Z',
          href: alertHref,
        }],
        exceptionTotal: 1,
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    fireEvent.click(await screen.findByRole('link', { name: /Direct alert/ }));
    expect(pushMock).toHaveBeenCalledWith(alertHref, { scroll: false });
  });
  it('renders the authoritative exception total and access to remaining alert history', async () => {
    const exceptions = Array.from({ length: 13 }, (_value, index) => ({
      id: `alert:exception_${index + 1}`,
      kind: 'ALERT' as const,
      severity: 'warning' as const,
      title: `Exception ${index + 1}`,
      detail: 'Follow the recorded alert evidence.',
      at: '2026-08-24T12:00:00.000Z',
      href: `/admin?tab=affiliateOperations&view=alerts&selectedType=alert&selected=exception_${index + 1}`,
    }));
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      overview: {
        ...projection().overview,
        exceptions,
        exceptionTotal: 20,
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    expect(
      await screen.findByText(/Showing 13 of 20 recorded exceptions/),
    ).toBeInTheDocument();
    expect(screen.getByText('Exception 13')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View remaining alert history' }),
    ).toHaveAttribute(
      'href',
      '/admin?tab=affiliateOperations&view=alerts',
    );
  });

  it('normalizes hidden filters on restored Alerts links before projection GET', async () => {
    searchParams.set('view', 'alerts');
    searchParams.set('market', 'Austin');
    searchParams.set('selectedType', 'alert');
    searchParams.set('selected', 'alert_1');
    const fetchMock = jest.fn().mockResolvedValue(response(projection()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/affiliate-operations?tab=affiliateOperations&view=alerts&selectedType=alert&selected=alert_1',
        expect.objectContaining({ method: 'GET', credentials: 'include' }),
      ),
    );
    expect(replaceMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=alerts&selectedType=alert&selected=alert_1',
      { scroll: false },
    );
  });
  it('forwards lifecycle and freshness movement links in sortable tables', async () => {
    const lifecycleHref =
      '/admin?tab=affiliateOperations&view=sources&selectedType=transition&selected=transition_1';
    const freshnessHref =
      '/admin?tab=affiliateOperations&view=sources&selectedType=scrapeRun&selected=scrape_1';
    searchParams.set('view', 'sources');
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      view: 'sources',
      sources: {
        rows: [],
        lifecycleMovement: [{
          id: 'movement_1',
          at: '2026-08-24T12:00:00.000Z',
          label: 'MAPPED → PUBLISHED',
          direction: 'forward',
          count: 1,
          refreshClass: 'FULL',
          reason: null,
          href: lifecycleHref,
        }],
        freshnessMovement: [{
          id: 'movement_2',
          at: '2026-08-24T12:00:00.000Z',
          label: 'STALE → FRESH',
          direction: 'forward',
          count: 1,
          refreshClass: 'FULL',
          reason: null,
          href: freshnessHref,
        }],
        page: 1,
        pageSize: 25,
        total: 0,
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() => expect(screen.getByText('Lifecycle movement')).toBeInTheDocument());
    const links = screen.getAllByRole('link');
    expect(links.some((link) => link.getAttribute('href')?.includes('selected=transition_1'))).toBe(true);
    expect(links.some((link) => link.getAttribute('href')?.includes('selected=scrape_1'))).toBe(true);
  });
  it('renders Alerts and Cutover with deep links and no unsupported filters', async () => {
    const alert = alertRow();
    const run = reconciliationRun();
    const alertProjection = projection({
      view: 'alerts',
      alerts: { rows: [alert], page: 1, pageSize: 25, total: 1 },
    });
    const cutoverProjection = projection({
      view: 'cutover',
      cutover: {
        rows: [run],
        page: 1,
        pageSize: 25,
        total: 1,
      },
      selected: reconciliationDetail(),
    });
    const fetchMock = jest.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        response(String(input).includes('view=cutover')
          ? cutoverProjection
          : alertProjection),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    searchParams.set('view', 'alerts');
    const rendered = renderRoom();

    expect(screen.getAllByRole('tab')).toHaveLength(9);
    expect(await screen.findByText('Operational alert history')).toBeInTheDocument();
    expect(screen.queryByLabelText('Range')).not.toBeInTheDocument();
    const alertLink = screen.getByRole('link', { name: alert.title });
    expect(alertLink).toHaveAttribute('href', alert.href);
    pushMock.mockReset();
    alertLink.addEventListener(
      'click',
      (event) => event.preventDefault(),
      { once: true },
    );
    fireEvent.click(alertLink, { metaKey: true });
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(alertLink);
    expect(pushMock).toHaveBeenCalledWith(alert.href, { scroll: false });
    pushMock.mockReset();
    fireEvent.keyDown(
      screen.getByRole('row', { name: `Open alert ${alert.title}` }),
      { key: 'Enter' },
    );
    expect(pushMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=alerts&selectedType=alert&selected=alert_1',
      { scroll: false },
    );

    pushMock.mockReset();
    searchParams.set('view', 'cutover');
    rendered.rerender(
      <MantineProvider>
        <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
      </MantineProvider>,
    );

    expect(await screen.findByText('Cutover and reconciliation history')).toBeInTheDocument();
    expect(screen.getByText('Session: session_1')).toBeInTheDocument();
    expect(screen.getByText('Evidence: evidence_hash')).toBeInTheDocument();
    expect(screen.getByText(/Processes: 0; Findings: 0 blocking/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Range')).not.toBeInTheDocument();
    const runLink = screen.getByRole('link', { name: run.id });
    expect(runLink).toHaveAttribute('href', run.href);
    fireEvent.keyDown(
      screen.getByRole('row', { name: `Open reconciliation run ${run.id}` }),
      { key: 'Enter' },
    );
    expect(pushMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=cutover&selectedType=reconciliationRun&selected=reconciliation_1',
      { scroll: false },
    );
    searchParams.set('selectedType', 'reconciliationRun');
    searchParams.set('selected', run.id);
    rendered.rerender(
      <MantineProvider>
        <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
      </MantineProvider>,
    );
    expect(await screen.findByText('APPLY reconciliation')).toBeInTheDocument();
    expect(screen.getByText('identity_ambiguous')).toBeInTheDocument();
  });
  it('renders numeric contract versions and explicit unbound fallbacks', async () => {
    const numericRun = reconciliationRun();
    const unboundRun = reconciliationRun({
      id: 'reconciliation_unbound',
      supplyContractVersion: null,
      href: '/admin?tab=affiliateOperations&view=cutover&selectedType=reconciliationRun&selected=reconciliation_unbound',
    });
    const fetchMock = jest.fn().mockResolvedValue(
      response(
        projection({
          view: 'cutover',
          cutover: {
            rows: [numericRun, unboundRun],
            page: 1,
            pageSize: 25,
            total: 2,
          },
        }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    searchParams.set('view', 'cutover');

    renderRoom();

    expect(
      await screen.findByText('Cutover and reconciliation history'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', {
        name: `Open reconciliation run ${numericRun.id}`,
      }),
    ).toHaveTextContent('DEFAULT / v1');
    expect(
      screen.getByRole('row', {
        name: `Open reconciliation run ${unboundRun.id}`,
      }),
    ).toHaveTextContent('DEFAULT / Not recorded');
  });
  it('renders durable evidence totals separately from bounded previews', async () => {
    const previewPage = { page: 1, pageSize: 2, total: 42, truncated: true };
    const run = reconciliationRun({
      reportEvidence: reportEvidence({
        evidencePagination: {
          ...emptyEvidencePagination,
          processes: previewPage,
          blockingFindings: { ...previewPage, total: 7 },
          warnings: { ...previewPage, total: 8 },
          resolutions: { ...previewPage, total: 9 },
        },
        processes: [{ id: 'legacy_1', kind: 'LEGACY', status: 'STOPPED' }],
      }),
    });
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      view: 'cutover',
      cutover: {
        rows: [run],
        page: 1,
        pageSize: 25,
        total: 1,
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    searchParams.set('view', 'cutover');

    renderRoom();

    expect(await screen.findByText('Cutover and reconciliation history')).toBeInTheDocument();
    expect(
      screen.getByText('Processes: 42; Findings: 7 blocking / 8 warnings / 9 resolved'),
    ).toBeInTheDocument();
  });

  it('renders projected public-target evidence with explicit fallbacks', async () => {
    searchParams.set('view', 'coverage');
    const target = coverageTarget();
    const missingTarget = coverageTarget({
      id: 'target_2',
      targetId: 'event_missing',
      candidateId: null,
      publicTargetExists: false,
      publicTargetState: 'MISSING',
      publicTargetName: null,
      publicTargetHref: null,
      href: '/admin?tab=affiliateOperations&view=coverage&selectedType=target&selected=target_2',
    });
    const fetchMock = jest.fn().mockResolvedValue(
      response(projection({
        view: 'coverage',
        coverage: {
          ...projection().coverage,
          targets: [target, missingTarget],
          targetTotal: 2,
        },
      })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    expect(await screen.findByText('Supply Targets')).toBeInTheDocument();
    expect(screen.getByText('VISIBLE')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'River City Open' })).toHaveAttribute(
      'href',
      'https://public.example.test/o/river-city/events/event_1',
    );
    expect(screen.getByText('MISSING')).toBeInTheDocument();
    expect(screen.getByText('Public link not recorded')).toBeInTheDocument();
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
  });
  it('sorts campaign date values chronologically while formatting them for display', async () => {
    searchParams.set('view', 'coverage');
    searchParams.set('sort', 'discovery-campaigns:lastRun');
    searchParams.set('direction', 'asc');
    const campaigns = [
      {
        id: 'campaign-old',
        name: 'Older campaign',
        region: 'Austin',
        status: 'ACTIVE',
        lastRunAt: '2025-12-31T12:00:00.000Z',
        nextRunAt: null,
        queryLimit: 10,
        resultLimit: 10,
        href: '/admin?tab=affiliateOperations&view=coverage&selectedType=campaign&selected=campaign-old',
      },
      {
        id: 'campaign-new',
        name: 'Newer campaign',
        region: 'Austin',
        status: 'ACTIVE',
        lastRunAt: '2026-01-01T12:00:00.000Z',
        nextRunAt: null,
        queryLimit: 10,
        resultLimit: 10,
        href: '/admin?tab=affiliateOperations&view=coverage&selectedType=campaign&selected=campaign-new',
      },
    ];
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      view: 'coverage',
      coverage: {
        ...projection().coverage,
        campaigns,
        campaignTotal: campaigns.length,
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    await screen.findByText('Discovery campaigns');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Older campaign',
      'Newer campaign',
    ]);
  });
  it('uses the list page URL key for Alerts and Cutover pagination', async () => {
    const alert = alertRow();
    const run = reconciliationRun();
    const alerts = projection({
      view: 'alerts',
      alerts: { rows: [alert], page: 1, pageSize: 25, total: 26 },
    });
    const cutover = projection({
      view: 'cutover',
      cutover: { rows: [run], page: 1, pageSize: 25, total: 26 },
    });
    const fetchMock = jest.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        response(String(input).includes('view=cutover') ? cutover : alerts),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    searchParams.set('view', 'alerts');
    const rendered = renderRoom();
    await waitFor(() => expect(screen.getByText('26 records. Page size 25.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(pushMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=alerts&page=2',
      { scroll: false },
    );

    pushMock.mockReset();
    searchParams.set('view', 'cutover');
    rendered.rerender(
      <MantineProvider>
        <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
      </MantineProvider>,
    );
    await waitFor(() => expect(screen.getByText('Cutover and reconciliation history')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(pushMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=cutover&page=2',
      { scroll: false },
    );
  });

  it('keeps the last-good projection and shows stale after a failed refresh', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(projection()))
      .mockResolvedValueOnce(response({ error: 'temporary read failure' }, false));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() => expect(screen.getByText('Current lifecycle counts')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(screen.getByText('Stale projection')).toBeInTheDocument());
    expect(screen.getByText('Current lifecycle counts')).toBeInTheDocument();
    expect(screen.getByText(/Last-good data remains visible/)).toBeInTheDocument();
  });

  it('pauses polling while hidden and refreshes when visible again', async () => {
    jest.useFakeTimers();
    const pending: Array<(value: Response) => void> = [];
    const fetchMock = jest.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderRoom();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      pending[0](response(projection()));
      await Promise.resolve();
      await Promise.resolve();
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      jest.advanceTimersByTime(16_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      pending[1](response(projection()));
      await Promise.resolve();
      await Promise.resolve();
    });
  });
  it('skips a polling refresh while a projection request is in flight', async () => {
    jest.useFakeTimers();
    const pending: Array<(value: Response) => void> = [];
    const fetchMock = jest.fn(
      () => new Promise<Response>((resolve) => pending.push(resolve)),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending[0](response(projection()));
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('keeps the newest projection when refresh responses resolve out of order', async () => {
    const pending: Array<(value: Response) => void> = [];
    const fetchMock = jest.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const rendered = renderRoom();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    searchParams.set('anchor', 'source_1');
    await act(async () => {
      rendered.rerender(
        <MantineProvider>
          <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
        </MantineProvider>,
      );
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const newer = projection({
      overview: {
        ...projection().overview,
        counts: { ...projection().overview.counts, supplySources: 9 },
      },
    });
    await act(async () => {
      pending[1](response(newer));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument());

    const older = projection({
      overview: {
        ...projection().overview,
        counts: { ...projection().overview.counts, supplySources: 1 },
      },
    });
    await act(async () => {
      pending[0](response(older));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('refreshes time-dependent chart series when a projection refresh keeps the same history revision', async () => {
    const pending: Array<(value: Response) => void> = [];
    const fetchMock = jest.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const first = projection({
      overview: {
        ...projection().overview,
        wipSeries: [{ at: '2026-08-24T11:00:00.000Z', lane: 'MAPPING', activeWorkers: 1, waitingJobs: 41, workerLimit: 2, replenishmentWaves: 0 }],
      },
    });
    renderRoom();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      pending[0](response(first));
      await Promise.resolve();
      await Promise.resolve();
    });

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const second = projection({
      overview: {
        ...projection().overview,
        counts: { ...projection().overview.counts, supplySources: 7 },
        wipSeries: [{ at: '2026-08-24T12:00:00.000Z', lane: 'MAPPING', activeWorkers: 9, waitingJobs: 99, workerLimit: 18, replenishmentWaves: 0 }],
      },
    });
    await act(async () => {
      pending[1](response(second));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByText('99').length).toBeGreaterThan(0);
    expect(screen.queryByText('41')).not.toBeInTheDocument();
  });

  it('opens a job from keyboard without leaving the read-only projection route', async () => {
    searchParams.set('view', 'jobs');
    const fetchMock = jest.fn().mockResolvedValue(response(projection({ view: 'jobs' })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    const row = await screen.findByRole('row', { name: 'Open job job_1' });
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=jobs&selectedType=job&selected=job_1',
      { scroll: false },
    );
  });
  it('removes a focused row absent from a foreground refresh', async () => {
    searchParams.set('view', 'jobs');
    searchParams.set('selectedType', 'job');
    searchParams.set('selected', 'job_1');
    const firstRow = projection().jobs.rows[0];
    const secondRow = { ...firstRow, id: 'job_2' };
    const first = projection({
      view: 'jobs',
      jobs: { ...projection().jobs, rows: [firstRow, secondRow], total: 2 },
    });
    const second = projection({
      view: 'jobs',
      jobs: { ...projection().jobs, rows: [secondRow], total: 1 },
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() =>
      expect(
        screen.getByRole('row', { name: 'Open job job_1' }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole('button', { name: /refresh/i })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByRole('row', { name: 'Open job job_2' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('row', { name: 'Open job job_1' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the focused row in place and labels newer background results', async () => {
    searchParams.set('view', 'jobs');
    searchParams.set('selectedType', 'job');
    searchParams.set('selected', 'job_1');
    const firstRow = projection().jobs.rows[0];
    const secondRow = { ...firstRow, id: 'job_2' };
    const detail = {
      id: 'job_1',
      kind: 'job' as const,
      title: 'GATEWAY job_1',
      subtitle: 'MAPPING / MAPPING_PRODUCER',
      status: 'QUEUED',
      sections: [],
      history: [],
      related: [],
    };
    const first = projection({
      view: 'jobs',
      jobs: { ...projection().jobs, rows: [firstRow, secondRow], total: 2 },
      selected: detail,
    });
    const second = projection({
      view: 'jobs',
      asOf: '2026-08-24T12:15:00.000Z',
      jobs: { ...projection().jobs, rows: [secondRow, { ...firstRow, status: 'ACTIVE' }], total: 2 },
      selected: { ...detail, status: 'ACTIVE' },
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() => expect(screen.getByRole('row', { name: 'Open job job_1' })).toBeInTheDocument());

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Newer results available')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    const focusedIndex = rows.findIndex((row) => row.getAttribute('aria-label') === 'Open job job_1');
    const nextIndex = rows.findIndex((row) => row.getAttribute('aria-label') === 'Open job job_2');
    expect(focusedIndex).toBeGreaterThanOrEqual(0);
    expect(focusedIndex).toBeLessThan(nextIndex);
  });
  it('keeps the focused alert row in place during a background refresh', async () => {
    searchParams.set('view', 'alerts');
    searchParams.set('selectedType', 'alert');
    searchParams.set('selected', 'alert_1');
    const firstRow = alertRow({ title: 'Alert one' });
    const secondRow = alertRow({
      id: 'alert_2',
      title: 'Alert two',
      href: '/admin?tab=affiliateOperations&view=alerts&selectedType=alert&selected=alert_2',
    });
    const first = projection({
      view: 'alerts',
      alerts: { ...projection().alerts, rows: [firstRow, secondRow], total: 2 },
    });
    const second = projection({
      view: 'alerts',
      asOf: '2026-08-24T12:15:00.000Z',

      alerts: {
        ...projection().alerts,
        rows: [secondRow, { ...firstRow, active: false }],
        total: 2,
      },
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() =>
      expect(screen.getByRole('row', { name: 'Open alert Alert one' })).toBeInTheDocument(),
    );

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Newer results available')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    const focusedIndex = rows.findIndex(
      (row) => row.getAttribute('aria-label') === 'Open alert Alert one',
    );
    const nextIndex = rows.findIndex(
      (row) => row.getAttribute('aria-label') === 'Open alert Alert two',
    );
    expect(focusedIndex).toBeGreaterThanOrEqual(0);
    expect(focusedIndex).toBeLessThan(nextIndex);
  });

  it('retains a selected row at its prior index when a background page displaces it', async () => {
    searchParams.set('view', 'jobs');
    searchParams.set('selectedType', 'job');
    searchParams.set('selected', 'job_1');
    const firstRow = projection().jobs.rows[0];
    const secondRow = { ...firstRow, id: 'job_2' };
    const thirdRow = { ...firstRow, id: 'job_3' };
    const fourthRow = { ...firstRow, id: 'job_4' };
    const fifthRow = { ...firstRow, id: 'job_5' };
    const detail = {
      id: 'job_1',
      kind: 'job' as const,
      title: 'GATEWAY job_1',
      subtitle: 'MAPPING / MAPPING_PRODUCER',
      status: 'QUEUED',
      sections: [],
      history: [],
      related: [],
    };
    const first = projection({
      view: 'jobs',
      jobs: { ...projection().jobs, rows: [firstRow, secondRow, thirdRow], total: 5 },
      selected: detail,
    });
    const second = projection({
      view: 'jobs',
      asOf: '2026-08-24T12:15:00.000Z',
      jobs: { ...projection().jobs, rows: [thirdRow, fourthRow, fifthRow], total: 5 },
      selected: null,
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() =>
      expect(screen.getByRole('row', { name: 'Open job job_1' })).toBeInTheDocument(),
    );

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole('row', { name: 'Open job job_1' })).toBeInTheDocument(),
    );
    const rows = screen.getAllByRole('row');
    const focusedIndex = rows.findIndex(
      (row) => row.getAttribute('aria-label') === 'Open job job_1',
    );
    const displacedNextIndex = rows.findIndex(
      (row) => row.getAttribute('aria-label') === 'Open job job_3',
    );
    expect(focusedIndex).toBeGreaterThanOrEqual(0);
    expect(focusedIndex).toBeLessThan(displacedNextIndex);
  });
  it('keeps the focused reconciliation row in place during a background refresh', async () => {
    searchParams.set('view', 'cutover');
    searchParams.set('selectedType', 'reconciliationRun');
    searchParams.set('selected', 'reconciliation_1');
    const firstRow = reconciliationRun();
    const secondRow = reconciliationRun({
      id: 'reconciliation_2',
      href: '/admin?tab=affiliateOperations&view=cutover&selectedType=reconciliationRun&selected=reconciliation_2',
    });
    const first = projection({
      view: 'cutover',
      cutover: { ...projection().cutover, rows: [firstRow, secondRow], total: 2 },
    });
    const second = projection({
      view: 'cutover',
      asOf: '2026-08-24T12:15:00.000Z',
      cutover: {
        ...projection().cutover,
        rows: [secondRow, { ...firstRow, status: 'ROLLED_BACK' }],
        total: 2,
      },
    });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(second));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();
    await waitFor(() =>
      expect(
        screen.getByRole('row', { name: 'Open reconciliation run reconciliation_1' }),
      ).toBeInTheDocument(),
    );

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Newer results available')).toBeInTheDocument());
    const rows = screen.getAllByRole('row');
    const focusedIndex = rows.findIndex(
      (row) =>
        row.getAttribute('aria-label') ===
        'Open reconciliation run reconciliation_1',
    );
    const nextIndex = rows.findIndex(
      (row) =>
        row.getAttribute('aria-label') ===
        'Open reconciliation run reconciliation_2',
    );
    expect(focusedIndex).toBeGreaterThanOrEqual(0);
    expect(focusedIndex).toBeLessThan(nextIndex);
  });


  it('writes explicit list pagination to the URL', async () => {
    searchParams.set('view', 'jobs');
    const jobs = Array.from({ length: 25 }, (_, index) => ({
      ...projection().jobs.rows[0],
      id: `job_${index + 1}`,
    }));
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      view: 'jobs',
      jobs: {
        ...projection().jobs,
        rows: jobs,
        total: 26,
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    await waitFor(() => expect(screen.getByText('26 records. Page size 25.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/admin?tab=affiliateOperations&view=jobs&page=2',
      { scroll: false },
    );
  });

  it('uses independent URL keys for coverage, target, discovery, and campaign pagers', async () => {
    searchParams.set('view', 'coverage');
    const baseCoverage = projection().coverage;
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      view: 'coverage',
      coverage: {
        ...baseCoverage,
        cells: { ...baseCoverage.cells, total: 50 },
        targetTotal: 50,
        discoveryTotal: 50,
        campaignTotal: 50,
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    await waitFor(() => expect(screen.getByText('Coverage Cells')).toBeInTheDocument());
    const nextButtons = screen.getAllByRole('button', { name: /next page/i });
    expect(nextButtons).toHaveLength(4);
    nextButtons.forEach((button) => fireEvent.click(button));

    expect(pushMock.mock.calls.map(([href]) => href)).toEqual([
      '/admin?tab=affiliateOperations&view=coverage&page=2',
      '/admin?tab=affiliateOperations&view=coverage&targetPage=2',
      '/admin?tab=affiliateOperations&view=coverage&discoveryPage=2',
      '/admin?tab=affiliateOperations&view=coverage&campaignPage=2',
    ]);
  });

  it('opens priority, campaign, and discovery links from stable projection hrefs', async () => {
    const demandHref = '/admin?tab=affiliateOperations&view=coverage&market=US-Austin&selectedType=demand&selected=demand_1';
    searchParams.set('view', 'overview');
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      overview: {
        ...projection().overview,
        priorityWork: [{
          id: 'demand_1',
          kind: 'REPLENISHMENT_DEMAND',
          priority: 1,
          title: 'Demand demand_1',
          status: 'OPEN',
          ageMinutes: 8,
          href: demandHref,
        }],
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    const demandLink = await screen.findByRole('link', { name: 'Demand demand_1' });
    fireEvent.click(demandLink);
    expect(pushMock).toHaveBeenCalledWith(demandHref, { scroll: false });

    pushMock.mockReset();
    searchParams.set('view', 'coverage');
    const campaignHref = '/admin?tab=affiliateOperations&view=coverage&selectedType=campaign&selected=campaign_1';
    const discoveryHref = '/admin?tab=affiliateOperations&view=coverage&selectedType=discoveryQuery&selected=query_1';
    const campaign = {
      id: 'campaign_1',
      name: 'Campaign one',
      region: 'Austin',
      status: 'ACTIVE',
      lastRunAt: null,
      nextRunAt: null,
      queryLimit: 5,
      resultLimit: 10,
      href: campaignHref,
    };
    const discovery = {
      id: 'query_1',
      at: null,
      campaignId: 'campaign_1',
      query: 'Austin clubs',
      provider: 'BRAVE',
      status: 'SUCCEEDED',
      returnedResults: 2,
      qualifiedSources: 1,
      intakesCreated: 1,
      failed: 0,
      href: discoveryHref,
    };
    const coverage = {
      ...projection().coverage,
      campaigns: [campaign],
      campaignTotal: 1,
      discoveryOutcomes: [discovery],
      discoveryTotal: 1,
    };
    fetchMock.mockResolvedValueOnce(response(projection({ view: 'coverage', coverage })));
    renderRoom();

    fireEvent.click(await screen.findByRole('link', { name: 'Campaign one' }));
    expect(pushMock).toHaveBeenCalledWith(campaignHref, { scroll: false });
    pushMock.mockReset();
    fireEvent.click(screen.getByRole('link', { name: 'Austin clubs' }));
    expect(pushMock).toHaveBeenCalledWith(discoveryHref, { scroll: false });
  });

  it('restores page, filters, and selection when URL history returns to a prior view', async () => {
    searchParams.set('view', 'jobs');
    searchParams.set('page', '2');
    searchParams.set('city', 'Austin');
    searchParams.set('selectedType', 'job');
    searchParams.set('selected', 'job_1');
    const detail = {
      id: 'job_1',
      kind: 'job' as const,
      title: 'GATEWAY job_1',
      subtitle: 'MAPPING / MAPPING_PRODUCER',
      status: 'QUEUED',
      sections: [],
      history: [],
      related: [],
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(projection({ view: 'jobs', selected: detail })))
      .mockResolvedValueOnce(response(projection({ view: 'overview' })))
      .mockResolvedValueOnce(response(projection({ view: 'jobs', selected: detail })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const rendered = renderRoom();

    await waitFor(() => expect(screen.getByText('GATEWAY job_1')).toBeInTheDocument());
    searchParams.set('view', 'overview');
    searchParams.delete('page');
    searchParams.delete('city');
    searchParams.delete('selectedType');
    searchParams.delete('selected');
    rendered.rerender(
      <MantineProvider>
        <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
      </MantineProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    searchParams.set('view', 'jobs');
    searchParams.set('page', '2');
    searchParams.set('city', 'Austin');
    searchParams.set('selectedType', 'job');
    searchParams.set('selected', 'job_1');
    rendered.rerender(
      <MantineProvider>
        <AdminAffiliateOperationsControlRoom isActive refreshKey={0} />
      </MantineProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/admin/affiliate-operations?tab=affiliateOperations&view=jobs&page=2&selectedType=job&selected=job_1',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    expect(await screen.findByText('GATEWAY job_1')).toBeInTheDocument();
  });

  it('renders a selected detail from a direct URL without a prior list selection', async () => {
    searchParams.set('view', 'jobs');
    searchParams.set('selectedType', 'job');
    searchParams.set('selected', 'job_1');
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      view: 'jobs',
      selected: {
        id: 'job_1',
        kind: 'job',
        title: 'GATEWAY job_1',
        subtitle: 'MAPPING / MAPPING_PRODUCER',
        status: 'QUEUED',
        sections: [{ title: 'Header', fields: [{ label: 'Queue', value: 'MAPPING' }] }],
        history: [],
        related: [],
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    expect(await screen.findByText('GATEWAY job_1')).toBeInTheDocument();
    expect(screen.getAllByText('History').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/affiliate-operations?tab=affiliateOperations&view=jobs&selectedType=job&selected=job_1',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });
  it('renders detail lineage links and immutable history evidence', async () => {
    searchParams.set('view', 'jobs');
    searchParams.set('selectedType', 'job');
    searchParams.set('selected', 'job_1');
    const fetchMock = jest.fn().mockResolvedValue(response(projection({
      view: 'jobs',
      selected: {
        id: 'job_1',
        kind: 'job',
        title: 'GATEWAY job_1',
        subtitle: 'MAPPING / MAPPING_PRODUCER',
        status: 'SUCCEEDED',
        sections: [{
          title: 'Lineage',
          fields: [{
            label: 'Package',
            value: 'package_1',
            href: '/admin?tab=affiliateOperations&view=review&selectedType=package&selected=package_1',
          }],
        }],
        history: [{
          id: 'transition_1',
          kind: 'TRANSITION PUBLISHED',
          at: '2026-08-24T11:00:00.000Z',
          status: 'PUBLISHED',
          reason: null,
          actor: 'worker_1',
          evidenceRefs: ['artifact_1'],
          inputHash: 'input_hash',
          outputHash: 'output_hash',
          previousState: 'MAPPING',
          nextState: 'PUBLISHED',
          href: '/admin?tab=affiliateOperations&view=sources&selectedType=transition&selected=transition_1',
        }],
        related: [{
          id: 'package_1',
          kind: 'PACKAGE',
          label: 'package_1',
          status: 'APPROVED',
          href: '/admin?tab=affiliateOperations&view=review&selectedType=package&selected=package_1',
        }],
      },
    })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRoom();

    expect(await screen.findByText('GATEWAY job_1')).toBeInTheDocument();
    const packageLinks = screen.getAllByRole('link', { name: 'package_1' });
    expect(packageLinks).toHaveLength(2);
    packageLinks.forEach((link) => expect(link).toHaveAttribute(
      'href',
      '/admin?tab=affiliateOperations&view=review&selectedType=package&selected=package_1',
    ));
    expect(screen.getByRole('link', { name: 'TRANSITION PUBLISHED' })).toHaveAttribute(
      'href',
      '/admin?tab=affiliateOperations&view=sources&selectedType=transition&selected=transition_1',
    );
    expect(screen.getByText('transition_1')).toBeInTheDocument();
    expect(screen.getByText('worker_1')).toBeInTheDocument();
    expect(screen.getByText(/Refs: artifact_1/)).toBeInTheDocument();
    expect(screen.getByText(/Input hash: input_hash/)).toBeInTheDocument();
    expect(screen.getByText(/State: MAPPING → PUBLISHED/)).toBeInTheDocument();
  });
});
