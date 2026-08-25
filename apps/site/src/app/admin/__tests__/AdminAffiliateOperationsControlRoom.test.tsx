import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import AdminAffiliateOperationsControlRoom from '../AdminAffiliateOperationsControlRoom';
import type { AffiliateOperationsProjection } from '@/types/affiliateOperations';

const pushMock = jest.fn();
const searchParams = new URLSearchParams('tab=affiliateOperations&view=overview');

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
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

    await waitFor(() => expect(screen.getByText('Affiliate Operations Control Room')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Current lifecycle counts')).toBeInTheDocument());
    expect(screen.getAllByRole('tab')).toHaveLength(7);
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

  it('retains historical chart series until the rollup revision changes', async () => {
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
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
    expect(screen.getAllByText('41').length).toBeGreaterThan(0);
    expect(screen.queryByText('99')).not.toBeInTheDocument();
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
      '/api/admin/affiliate-operations?tab=affiliateOperations&view=jobs&page=2&city=Austin&selectedType=job&selected=job_1',
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
