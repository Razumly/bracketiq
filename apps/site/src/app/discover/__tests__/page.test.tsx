import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DiscoverPage from '../page';

const pushMock = jest.fn();
const listOrganizationsMock = jest.fn();
const getEventsPageMock = jest.fn();
const searchOpenRegistrationTeamsMock = jest.fn();
const mockSportsResult: { sports: Array<{ $id: string; name: string }>; loading: boolean; error: null } = {
  sports: [],
  loading: false,
  error: null,
};
let navigationSearchParams = 'tab=organizations';
let mockLocation: { lat: number; lng: number } | null = null;
let mockDebouncedValue: string | null = null;
let intersectionCallbacks: IntersectionObserverCallback[] = [];

jest.mock('next/navigation', () => ({
  usePathname: () => '/discover',
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(navigationSearchParams),
}));

jest.mock('@/app/providers', () => ({
  useApp: () => ({
    user: null,
    loading: false,
    isAuthenticated: false,
    isGuest: true,
  }),
}));

jest.mock('@/app/hooks/useLocation', () => ({
  useLocation: () => ({
    location: mockLocation,
    locationInfo: mockLocation ? { city: 'New York', state: 'NY', formattedAddress: 'New York, NY' } : null,
    requestLocation: jest.fn().mockResolvedValue(undefined),
    setLocationFromInfo: jest.fn(),
  }),
}));

jest.mock('@/app/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => mockDebouncedValue ?? value,
}));

jest.mock('@/app/hooks/useSports', () => ({
  useSports: () => mockSportsResult,
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    listOrganizationsWithFieldsPage: (...args: unknown[]) => listOrganizationsMock(...args),
  },
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventsPage: (...args: unknown[]) => getEventsPageMock(...args),
  },
}));

jest.mock('@/lib/teamService', () => ({
  teamService: {
    searchOpenRegistrationTeamsPage: (...args: unknown[]) => searchOpenRegistrationTeamsMock(...args),
  },
}));

jest.mock('@/components/layout/Navigation', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/location/LocationSearch', () => ({
  __esModule: true,
  default: () => <button type="button">Choose location</button>,
}));

jest.mock('@/components/ui/Loading', () => ({
  __esModule: true,
  default: ({ text }: { text?: string }) => <div>{text ?? 'Loading'}</div>,
}));

jest.mock('@/components/ui/OrganizationCard', () => ({
  __esModule: true,
  default: ({ organization }: { organization: { name: string } }) => (
    <div data-testid="organization-card">{organization.name}</div>
  ),
}));

jest.mock('@/components/ui/TeamCard', () => ({
  __esModule: true,
  default: ({
    team,
    actions,
  }: {
    team: { $id: string; affiliateUrl?: string | null };
    actions?: React.ReactNode;
  }) => (
    <div data-testid={`team-card-${team.$id}`}>
      {actions}
      {team.affiliateUrl?.trim() ? <span>External registration</span> : null}
    </div>
  ),
}));

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../components/EventsTabContent', () => ({
  __esModule: true,
  default: function MockEventsTabContent(props: React.ComponentProps<typeof import('../components/EventsTabContent').default>) {
    const { useEventListFiltering, eventListFilterKey } = jest.requireActual('@/components/events/event-list-filtering');
    const filters = { ...props, hideWeeklyChildren: false };
    const { visibleEvents } = useEventListFiltering({ ...props, filters, filterKey: eventListFilterKey(filters) });
    return <div>
      <select
        aria-label="Event test sort"
        value={props.eventSort}
        onChange={(event) => props.onEventSortChange?.(event.target.value as NonNullable<typeof props.eventSort>)}
      >
        <option value="recommended">Recommended</option>
        <option value="soonest">Soonest</option>
        <option value="nearest">Nearest</option>
        <option value="price-low">Price (Low to High)</option>
      </select>
      <div data-testid="event-loading-state">{props.isLoadingInitial ? 'Loading' : 'Ready'}</div>
      {props.eventsError && (
        <div role="alert">
          {props.eventsError}
          <button onClick={props.onRetry}>Retry events</button>
        </div>
      )}
      {visibleEvents.map((event: { $id: string; name: string }) => <div key={event.$id}>{event.name}</div>)}
      <div ref={props.sentinelRef} />
    </div>;
  },
}));

jest.mock('../components/DiscoverMapModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/DivisionDiscoveryFilters', () => ({
  ...jest.requireActual('../components/DivisionDiscoveryFilters'),
  __esModule: true,
  default: () => <div data-testid="division-discovery-filters">Division filters</div>,
}));

describe('Discover organization loading', () => {
  beforeEach(() => {
    pushMock.mockReset();
    listOrganizationsMock.mockReset();
    intersectionCallbacks = [];
    navigationSearchParams = 'tab=organizations';
    mockLocation = null;
    mockDebouncedValue = null;
    mockSportsResult.sports = [];
    getEventsPageMock.mockReset();
    searchOpenRegistrationTeamsMock.mockReset();
    getEventsPageMock.mockResolvedValue({
      events: [],
      pagination: { limit: 18, offset: 0, nextOffset: 0, hasMore: false, totalCount: 0 },
    });
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    listOrganizationsMock.mockResolvedValue({
      organizations: [{
        $id: 'org_1',
        name: 'Rose City Sports',
        description: 'Community sports club',
        coordinates: [-122.6765, 45.5231],
        sports: [],
        tags: [],
      }],
      pagination: {
        limit: 100,
        offset: 0,
        nextOffset: 1,
        hasMore: false,
      },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    }) as jest.Mock;
    global.IntersectionObserver = class IntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [];
    } as unknown as typeof IntersectionObserver;
  });

  it('uses current event search while the page-level debounce is pending', async () => {
    navigationSearchParams = 'tab=events';
    mockDebouncedValue = '';
    getEventsPageMock.mockResolvedValue({ events: [], pagination: { nextOffset: 18, hasMore: true, totalCount: 100 } });
    render(<DiscoverPage />);
    await waitFor(() => expect(screen.getByTestId('event-loading-state')).toHaveTextContent('Ready'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search by name or keyword' }), { target: { value: 'Basketball' } });
    await waitFor(() => expect(getEventsPageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Basketball' }), 18, 0, 'RECOMMENDED',
    ));
  });

  it('releases the initial loader when a filter refresh supersedes the initial request', async () => {
    navigationSearchParams = 'tab=events';
    let finishInitial!: (value: unknown) => void;
    const initial = new Promise((resolve) => { finishInitial = resolve; });
    const page = { events: [], pagination: { nextOffset: 0, hasMore: false, totalCount: 0 } };
    getEventsPageMock.mockReturnValueOnce(initial).mockResolvedValue(page);
    render(<DiscoverPage />);
    await waitFor(() => expect(getEventsPageMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search by name or keyword' }), { target: { value: 'Basketball' } });
    await waitFor(() => expect(getEventsPageMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('event-loading-state')).toHaveTextContent('Ready'));
    await act(async () => { finishInitial(page); await initial; });
    expect(screen.getByTestId('event-loading-state')).toHaveTextContent('Ready');
  });

  it('ignores a late page from the previous event filter', async () => {
    navigationSearchParams = 'tab=events';
    let finishPage!: (value: unknown) => void;
    const oldPage = new Promise((resolve) => { finishPage = resolve; });
    const event = { $id: 'new', name: 'Basketball night', eventType: 'EVENT', start: '2026-09-10T18:00:00Z', sportIds: [], divisions: [] };
    getEventsPageMock
      .mockResolvedValueOnce({ events: [], pagination: { nextOffset: 18, hasMore: true, totalCount: 100 } })
      .mockReturnValueOnce(oldPage)
      .mockResolvedValue({ events: [event], pagination: { nextOffset: 1, hasMore: false, totalCount: 1 } });
    render(<DiscoverPage />);
    await waitFor(() => expect(screen.getByTestId('event-loading-state')).toHaveTextContent('Ready'));
    act(() => { intersectionCallbacks.forEach((callback) => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)); });
    await waitFor(() => expect(getEventsPageMock).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search by name or keyword' }), { target: { value: 'Basketball' } });
    expect(await screen.findByText('Basketball night')).toBeInTheDocument();
    await act(async () => {
      finishPage({ events: [{ ...event, $id: 'old', name: 'Basketball old query' }], pagination: { nextOffset: 36, hasMore: true, totalCount: 100 } });
      await oldPage;
    });
    expect(screen.queryByText('Basketball old query')).not.toBeInTheDocument();
    expect(screen.getByText('Basketball night')).toBeInTheDocument();
  });

  it('restarts event pagination after a server sort change and ignores a late old-sort page', async () => {
    navigationSearchParams = 'tab=events';
    const { promise: oldPage, resolve: finishOldPage } = Promise.withResolvers<unknown>();
    const event = {
      $id: 'recommended-first', name: 'Recommended first', eventType: 'EVENT',
      start: '2099-09-10T18:00:00Z', sportIds: [], divisions: [],
    };
    getEventsPageMock
      .mockResolvedValueOnce({ events: [event], pagination: { nextOffset: 18, hasMore: true, totalCount: 40 } })
      .mockReturnValueOnce(oldPage)
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'soonest-first', name: 'Soonest first' }],
        pagination: { nextOffset: 12, hasMore: true, totalCount: 40 },
      })
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'soonest-next', name: 'Soonest next' }],
        pagination: { nextOffset: 24, hasMore: false, totalCount: 40 },
      });
    render(<DiscoverPage />);
    expect(await screen.findByText('Recommended first')).toBeInTheDocument();
    act(() => {
      intersectionCallbacks[intersectionCallbacks.length - 1](
        [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
      );
    });
    await waitFor(() => expect(getEventsPageMock).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByRole('combobox', { name: 'Event test sort' }), { target: { value: 'soonest' } });
    expect(await screen.findByText('Soonest first')).toBeInTheDocument();
    expect(screen.queryByText('Recommended first')).not.toBeInTheDocument();
    expect(getEventsPageMock).toHaveBeenLastCalledWith(expect.anything(), 18, 0, 'SOONEST');

    await act(async () => {
      finishOldPage({
        events: [{ ...event, $id: 'recommended-next', name: 'Recommended next' }],
        pagination: { nextOffset: 36, hasMore: true, totalCount: 40 },
      });
      await oldPage;
    });
    expect(screen.queryByText('Recommended next')).not.toBeInTheDocument();

    act(() => {
      intersectionCallbacks[intersectionCallbacks.length - 1](
        [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
      );
    });
    expect(await screen.findByText('Soonest next')).toBeInTheDocument();
    expect(screen.getByText('Soonest first')).toBeInTheDocument();
    expect(getEventsPageMock).toHaveBeenLastCalledWith(expect.anything(), 18, 12, 'SOONEST');
  });

  it('keeps old-sort results separate when the replacement first page fails', async () => {
    navigationSearchParams = 'tab=events';
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const event = {
      $id: 'recommended-first', name: 'Recommended first', eventType: 'EVENT',
      start: '2099-09-10T18:00:00Z', sportIds: [], divisions: [],
    };
    getEventsPageMock
      .mockResolvedValueOnce({ events: [event], pagination: { nextOffset: 18, hasMore: true, totalCount: 40 } })
      .mockRejectedValueOnce(new Error('Events are unavailable'))
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'soonest-next', name: 'Soonest next' }],
        pagination: { nextOffset: 36, hasMore: false, totalCount: 40 },
      });
    try {
      render(<DiscoverPage />);
      expect(await screen.findByText('Recommended first')).toBeInTheDocument();
      fireEvent.change(screen.getByRole('combobox', { name: 'Event test sort' }), { target: { value: 'soonest' } });
      expect(await screen.findByRole('alert')).toBeInTheDocument();

      await act(async () => {
        intersectionCallbacks[intersectionCallbacks.length - 1](
          [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
        );
      });
      expect(screen.getByText('Recommended first')).toBeInTheDocument();
      expect(screen.queryByText('Soonest next')).not.toBeInTheDocument();
      expect(getEventsPageMock).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('retries the failed event page without dropping cards or advancing its offset', async () => {
    navigationSearchParams = 'tab=events';
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const event = {
      $id: 'first-event', name: 'First event', eventType: 'EVENT',
      start: '2099-09-10T18:00:00Z', sportIds: [], divisions: [],
    };
    getEventsPageMock
      .mockResolvedValueOnce({ events: [event], pagination: { nextOffset: 18, hasMore: true, totalCount: 20 } })
      .mockRejectedValueOnce(new Error('Next events are unavailable'))
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'next-event', name: 'Next event' }],
        pagination: { nextOffset: 20, hasMore: false, totalCount: 20 },
      });
    try {
      render(<DiscoverPage />);
      expect(await screen.findByText('First event')).toBeInTheDocument();
      await act(async () => {
        intersectionCallbacks[intersectionCallbacks.length - 1](
          [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
        );
      });
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load more events');
      expect(screen.getByText('First event')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Retry events' }));

      expect(await screen.findByText('Next event')).toBeInTheDocument();
      expect(screen.getByText('First event')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(getEventsPageMock).toHaveBeenLastCalledWith(expect.anything(), 18, 18, 'RECOMMENDED');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('retries an organization request without treating a network failure as empty results', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    listOrganizationsMock
      .mockRejectedValueOnce(new Error('Organizations are unavailable'))
      .mockResolvedValueOnce({
        organizations: [],
        pagination: { limit: 100, offset: 0, nextOffset: 0, hasMore: false },
      });
    try {
      render(<DiscoverPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load organizations');
      expect(screen.queryByText('No organizations found')).not.toBeInTheDocument();
      expect(screen.queryByText(/^0 organizations/)).not.toBeInTheDocument();
      expect(screen.queryByText('No more organizations to load')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Retry organizations' }));

      expect(await screen.findByText('No organizations found')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(listOrganizationsMock).toHaveBeenLastCalledWith(100, 0, expect.anything());
    } finally {
      consoleError.mockRestore();
    }
  });

  it('retries a failed organization page at its existing offset and keeps loaded results', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    listOrganizationsMock
      .mockResolvedValueOnce({
        organizations: [{ $id: 'rose', name: 'Rose City Sports', coordinates: [-122.6765, 45.5231], sports: [], tags: [] }],
        pagination: { limit: 100, offset: 0, nextOffset: 100, hasMore: true },
      })
      .mockRejectedValueOnce(new Error('Next page is unavailable'))
      .mockResolvedValueOnce({
        organizations: [{ $id: 'cascade', name: 'Cascade Athletics', coordinates: [-122.6587, 45.5122], sports: [], tags: [] }],
        pagination: { limit: 100, offset: 100, nextOffset: 101, hasMore: false },
      });
    try {
      render(<DiscoverPage />);
      expect(await screen.findByText('Rose City Sports')).toBeInTheDocument();
      await act(async () => {
        intersectionCallbacks[intersectionCallbacks.length - 1](
          [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
        );
      });
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load organizations');
      expect(screen.getByText('Rose City Sports')).toBeInTheDocument();
      expect(screen.queryByText('No more organizations to load')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Retry organizations' }));

      expect(await screen.findByText('Cascade Athletics')).toBeInTheDocument();
      expect(screen.getByText('Rose City Sports')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(listOrganizationsMock).toHaveBeenLastCalledWith(100, 100, expect.anything());
    } finally {
      consoleError.mockRestore();
    }
  });

  it('loads the first organization page with a title-free search hero', async () => {
    render(<DiscoverPage />);

    const search = screen.getByRole('search', { name: 'Discover search' });
    expect(within(search).getByRole('textbox', { name: 'Search by name or keyword' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Discover' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('organization-card')).toHaveTextContent('Rose City Sports');
    await waitFor(() => {
      expect(screen.queryByText('Loading organizations...')).not.toBeInTheDocument();
    });
    expect(listOrganizationsMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['organizations', 'Tags'],
    ['rentals', 'Time'],
    ['teams', 'Division'],
  ])('shows %s filters in the modal only after Search', async (tab, filterLabel) => {
    const user = userEvent.setup();
    navigationSearchParams = `tab=${tab}`;
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    if (tab === 'rentals') {
      listOrganizationsMock.mockResolvedValue({
        organizations: [],
        pagination: { limit: 100, offset: 0, nextOffset: 0, hasMore: false },
      });
    }
    if (tab === 'teams') {
      searchOpenRegistrationTeamsMock.mockResolvedValue({
        teams: [],
        pagination: { limit: 100, offset: 0, nextOffset: 0, hasMore: false, totalCount: 0 },
      });
    }

    render(<DiscoverPage />);

    expect(screen.queryByRole('button', { name: filterLabel, exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All sports', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create event' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search', exact: true }));

    expect(screen.getByRole('button', { name: /^Edit search:/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('textbox', { name: 'Search by name or keyword' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: filterLabel, exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Filters', exact: true });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole('button', { name: filterLabel, exact: true })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Filters', exact: true })).not.toBeInTheDocument();
  });

  it('restores organization filters from the URL and keeps them shareable', async () => {
    navigationSearchParams = [
      'tab=organizations',
      'q=rose',
      'sport=Soccer',
      'tags=club',
      'genders=C',
      'skillDivisionTypeIds=competitive',
      'ageDivisionTypeIds=u18',
      'priceMin=10',
      'priceMax=75.5',
    ].join('&');
    mockSportsResult.sports = [{ $id: 'soccer', name: 'Soccer' }];
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    await waitFor(() => {
      expect(listOrganizationsMock).toHaveBeenCalledWith(100, 0, expect.objectContaining({
        query: 'rose',
        tagSlugs: ['club'],
        sports: ['Soccer'],
        divisionGenders: ['C'],
        skillDivisionTypeIds: ['competitive'],
        ageDivisionTypeIds: ['u18'],
        divisionPriceMin: 1000,
        divisionPriceMax: 7550,
      }));
      expect(window.location.search).toContain('tab=organizations');
      expect(window.location.search).toContain('sport=Soccer');
      expect(window.location.search).toContain('tags=club');
      expect(window.location.search).toContain('skillDivisionTypeIds=competitive');
      expect(window.location.search).toContain('priceMax=75.5');
    });
  });

  it('sends organization text and area filters to the server before pagination', async () => {
    navigationSearchParams = [
      'tab=organizations',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
      'distanceMiles=50',
    ].join('&');
    mockLocation = { lat: 45.5231, lng: -122.6765 };
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    await waitFor(() => {
      expect(listOrganizationsMock).toHaveBeenCalledWith(100, 0, expect.objectContaining({
        query: 'Salmon Creek',
        area: {
          lat: 45.5231,
          lng: -122.6765,
          radiusKm: expect.closeTo(80.467, 3),
        },
      }));
    });
  });

  it('sends rental text and area filters to the server before pagination', async () => {
    navigationSearchParams = [
      'tab=rentals',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
      'distanceMiles=50',
    ].join('&');
    mockLocation = { lat: 45.5231, lng: -122.6765 };
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    await waitFor(() => {
      expect(listOrganizationsMock).toHaveBeenCalledWith(100, 0, expect.objectContaining({
        includeAffiliateRentals: true,
        query: 'Salmon Creek',
        area: {
          lat: 45.5231,
          lng: -122.6765,
          radiusKm: expect.closeTo(80.467, 3),
        },
      }));
    });
  });

  it('loads the next organization page when the organization sentinel intersects', async () => {
    listOrganizationsMock
      .mockReset()
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_1',
          name: 'Rose City Sports',
          coordinates: [-122.6765, 45.5231],
          sports: [],
          tags: [],
        }],
        pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: true },
      })
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_2',
          name: 'Cascade Athletics',
          coordinates: [-122.6587, 45.5122],
          sports: [],
          tags: [],
        }],
        pagination: { limit: 100, offset: 1, nextOffset: 2, hasMore: false },
      });

    render(<DiscoverPage />);

    expect(await screen.findByText('Rose City Sports')).toBeInTheDocument();
    expect(intersectionCallbacks.length).toBeGreaterThan(0);

    await act(async () => {
      const callback = intersectionCallbacks[intersectionCallbacks.length - 1];
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(await screen.findByText('Cascade Athletics')).toBeInTheDocument();
    expect(listOrganizationsMock).toHaveBeenCalledTimes(2);
    expect(listOrganizationsMock.mock.calls[1]?.slice(0, 2)).toEqual([100, 1]);
  });

  it('does not duplicate external registration on affiliate team cards', async () => {
    navigationSearchParams = 'tab=teams';
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    searchOpenRegistrationTeamsMock.mockResolvedValue({
      teams: [{
        $id: 'team_external',
        name: 'Rose City Futsal Community Team',
        division: 'Mens D2',
        sport: 'Indoor Soccer',
        openRegistration: true,
        affiliateUrl: 'https://example.test/register',
      }],
      pagination: { limit: 18, offset: 0, nextOffset: 1, hasMore: false },
    });

    render(<DiscoverPage />);

    const card = await screen.findByTestId('team-card-team_external');
    expect(card).toHaveTextContent('External registration');
    expect(card.textContent?.match(/External registration/g)).toHaveLength(1);
  });

  it('loads the next rental page when the rental sentinel intersects', async () => {
    navigationSearchParams = 'tab=rentals';
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    listOrganizationsMock
      .mockReset()
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_1',
          name: 'Rose City Sports',
          sports: [],
          tags: [],
          facilities: [{
            $id: 'facility_1',
            name: 'Rose City Field Rentals',
            status: 'ACTIVE',
            affiliateUrl: 'https://example.test/rose-city',
          }],
        }],
        pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: true },
      })
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_2',
          name: 'Salmon Creek Indoor',
          sports: [],
          tags: [],
          facilities: [{
            $id: 'facility_2',
            name: 'Salmon Creek Indoor Field Rentals',
            status: 'ACTIVE',
            affiliateUrl: 'https://example.test/salmon-creek',
          }],
        }],
        pagination: { limit: 100, offset: 1, nextOffset: 2, hasMore: false },
      });

    render(<DiscoverPage />);

    expect(await screen.findByText('Rose City Field Rentals')).toBeInTheDocument();
    expect(intersectionCallbacks.length).toBeGreaterThan(0);

    await act(async () => {
      const callback = intersectionCallbacks[intersectionCallbacks.length - 1];
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(await screen.findByText('Salmon Creek Indoor Field Rentals')).toBeInTheDocument();
    expect(listOrganizationsMock).toHaveBeenCalledTimes(2);
    expect(listOrganizationsMock.mock.calls[1]?.slice(0, 2)).toEqual([100, 1]);
  });

  it('keeps the current area rental response when an older request finishes later', async () => {
    navigationSearchParams = [
      'tab=rentals',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
      'distanceMiles=50',
    ].join('&');
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    let resolveFirstRequest!: (value: unknown) => void;
    listOrganizationsMock
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRequest = resolve;
      }))
      .mockResolvedValueOnce({
        organizations: [{
          $id: 'org_salmon_creek',
          name: 'Salmon Creek Indoor',
          sports: [],
          tags: [],
          facilities: [{
            $id: 'facility_salmon_creek',
            name: 'Salmon Creek Indoor Field Rentals',
            status: 'ACTIVE',
            affiliateUrl: 'https://example.test/salmon-creek',
            coordinates: [-122.6714042, 45.7224249],
          }],
        }],
        pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: false },
      });

    const { rerender } = render(<DiscoverPage />);
    await waitFor(() => expect(listOrganizationsMock).toHaveBeenCalledTimes(1));

    mockLocation = { lat: 45.5231, lng: -122.6765 };
    rerender(<DiscoverPage />);

    expect(await screen.findByText('Salmon Creek Indoor Field Rentals')).toBeInTheDocument();
    expect(listOrganizationsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFirstRequest({
        organizations: [],
        pagination: { limit: 100, offset: 0, nextOffset: 0, hasMore: false },
      });
    });

    expect(screen.getByText('Salmon Creek Indoor Field Rentals')).toBeInTheDocument();
    expect(screen.queryByText('No rentals available')).not.toBeInTheDocument();
  });

  it('defaults a location-based event search to a 50 mile radius', async () => {
    navigationSearchParams = 'sport=Tennis&lat=40.7127753&lng=-74.0059728&location=New+York%2C+NY';
    mockLocation = { lat: 40.7127753, lng: -74.0059728 };
    mockSportsResult.sports = [{ $id: 'Tennis', name: 'Tennis' }];
    getEventsPageMock.mockResolvedValue({
      events: [],
      pagination: { limit: 18, offset: 0, nextOffset: 0, hasMore: false, totalCount: 1 },
    });
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    await waitFor(() => {
      expect(getEventsPageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sports: ['Tennis'],
          userLocation: mockLocation,
          maxDistance: expect.closeTo(80.467, 3),
        }),
        18,
        0,
        'RECOMMENDED',
      );
      expect(window.location.search).toContain('distanceMiles=50');
    });
  });

  it('falls back to all distances when the automatic 50 mile search is empty', async () => {
    navigationSearchParams = 'lat=40.7127753&lng=-74.0059728&location=New+York%2C+NY';
    mockLocation = { lat: 40.7127753, lng: -74.0059728 };
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    await waitFor(() => {
      expect(getEventsPageMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxDistance: expect.closeTo(80.467, 3) }),
        18,
        0,
        'RECOMMENDED',
      );
      expect(getEventsPageMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxDistance: undefined }),
        18,
        0,
        'RECOMMENDED',
      );
      expect(window.location.search).not.toContain('distanceMiles=');
    });
  });
});
