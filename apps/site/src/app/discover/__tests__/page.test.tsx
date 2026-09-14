import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import type { Event, Organization, SportCategory } from '@/types';
import DiscoverPage from '../page';
import type DiscoverMapModal from '../components/DiscoverMapModal';
import type EventsTabContent from '../components/EventsTabContent';

const pushMock = jest.fn();
const listOrganizationsMock = jest.fn();
const getEventsPageMock = jest.fn();
const mockLoadedEvents = new Map<string, Event>();
const mockLoadedOrganizations = new Map<string, Organization>();
const mockSportsResult: {
  sports: Array<{ $id: string; name: string }>;
  categories: SportCategory[];
  loading: boolean;
  error: null;
} = {
  sports: [],
  categories: [],
  loading: false,
  error: null,
};
let navigationSearchParams = 'tab=organizations';
let mockLocation: { lat: number; lng: number } | null = null;
let mockMapResultIds: string[] | null = null;
let mockMapRadiusKm = 50;
let mockDebouncedValue: string | null = null;
let intersectionCallbacks: IntersectionObserverCallback[] = [];

const discoverDateLabel = (date: Date): string => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}).format(date);

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
    listOrganizationsWithFieldsPage: async (...args: unknown[]) => {
      const page = await listOrganizationsMock(...args);
      page.organizations.forEach((organization: Organization) => {
        mockLoadedOrganizations.set(organization.$id, organization);
      });
      return page;
    },
  },
}));

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventsPage: async (...args: unknown[]) => {
      const page = await getEventsPageMock(...args);
      page.events.forEach((event: Event) => {
        mockLoadedEvents.set(event.$id, event);
      });
      return page;
    },
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
  default: ({ organization, onClick }: { organization: { name: string }; onClick?: () => void }) => (
    <button type="button" data-testid="organization-card" onClick={onClick}>{organization.name}</button>
  ),
}));

jest.mock('@/components/ui/TeamCard', () => ({
  __esModule: true,
  default: ({
    team,
    actions,
    onClick,
  }: {
    team: { $id: string; affiliateUrl?: string | null };
    actions?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" data-testid={`team-card-${team.$id}`} onClick={onClick}>
      {actions}
      {team.affiliateUrl?.trim() ? <span>External registration</span> : null}
    </button>
  ),
}));

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../components/EventsTabContent', () => ({
  __esModule: true,
  default: function MockEventsTabContent(props: React.ComponentProps<typeof EventsTabContent>) {
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
  default: function MockDiscoverMap(props: React.ComponentProps<typeof DiscoverMapModal>) {
    const {
      opened,
      embedded,
      activeTab,
      location,
      onVisibleResultsChange,
      searchQuery,
      selectedSports,
      selectedTags,
      selectedEventTypes,
      selectedStartDate,
      selectedEndDate,
      divisionFilters,
      organizationFilters,
      rentalFilters,
      teamFilters,
    } = props;
    const { useEffect } = jest.requireActual<typeof React>('react');
    const filterKey = JSON.stringify([
      activeTab,
      (searchQuery ?? '').trim().toLowerCase(),
      activeTab === 'events'
        ? [selectedSports, selectedTags, selectedEventTypes, selectedStartDate, selectedEndDate, divisionFilters]
        : activeTab === 'organizations'
          ? [selectedSports, organizationFilters?.selectedTags, organizationFilters?.divisionFilters]
          : activeTab === 'rentals'
            ? [rentalFilters?.timeRange]
            : [teamFilters?.selectedSports, teamFilters?.selectedDivisionTypeValues],
    ]);
    useEffect(() => {
      if (!opened) return;
      const organizations = Array.from(mockLoadedOrganizations.values());
      const events = Array.from(mockLoadedEvents.values());
      const ids = mockMapResultIds ?? (activeTab === 'events'
        ? events.map((event) => event.$id)
        : activeTab === 'teams'
          ? organizations.flatMap((organization) => (organization.teams ?? []).map((team) => team.$id))
          : activeTab === 'rentals'
            ? organizations.flatMap((organization) => (
              (organization.facilities ?? []).map((facility) => `${organization.$id}:facility:${facility.$id}`)
            ))
            : organizations.map((organization) => organization.$id));
      onVisibleResultsChange?.({
        target: activeTab,
        filterKey,
        ids,
        organizationIds: activeTab === 'events'
          ? events.flatMap((event) => event.organizationId ? [event.organizationId] : [])
          : activeTab === 'organizations' ? ids : organizations.map((organization) => organization.$id),
        center: location ?? { lat: 45.5231, lng: -122.6765 },
        radiusKm: mockMapRadiusKm,
      });
    }, [
      opened,
      embedded,
      activeTab,
      location,
      onVisibleResultsChange,
      searchQuery,
      selectedSports,
      selectedTags,
      selectedEventTypes,
      selectedStartDate,
      selectedEndDate,
      divisionFilters,
      organizationFilters,
      rentalFilters,
      teamFilters,
      filterKey,
    ]);
    return opened && embedded ? <div data-testid="embedded-discover-map">Map for {activeTab}</div> : null;
  },
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
    mockMapResultIds = null;
    mockMapRadiusKm = 50;
    mockDebouncedValue = null;
    mockSportsResult.sports = [];
    getEventsPageMock.mockReset();
    mockLoadedEvents.clear();
    mockLoadedOrganizations.clear();
    getEventsPageMock.mockResolvedValue({
      events: [],
      pagination: { limit: 100, offset: 0, nextOffset: 0, hasMore: false, totalCount: 0 },
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

  it('defaults event searches to a selected start date for today', () => {
    navigationSearchParams = '';
    window.history.replaceState({}, '', '/discover');
    render(<DiscoverPage />);

    expect(screen.getByRole('button', {
      name: `When: From ${discoverDateLabel(new Date())}`,
    })).toBeInTheDocument();
  });

  it('uses current event search while the page-level debounce is pending', async () => {
    navigationSearchParams = 'tab=events';
    mockDebouncedValue = '';
    getEventsPageMock.mockResolvedValue({ events: [], pagination: { nextOffset: 100, hasMore: true, totalCount: 200 } });
    render(<DiscoverPage />);
    await waitFor(() => expect(screen.getByTestId('event-loading-state')).toHaveTextContent('Ready'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search by name or keyword' }), { target: { value: 'Basketball' } });
    await waitFor(() => expect(getEventsPageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Basketball' }), 100, 0, 'RECOMMENDED',
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
    const event = { $id: 'new', name: 'Basketball night', eventType: 'EVENT', start: '2099-09-10T18:00:00Z', sportIds: [], divisions: [] };
    getEventsPageMock
      .mockResolvedValueOnce({ events: [], pagination: { nextOffset: 100, hasMore: true, totalCount: 200 } })
      .mockReturnValueOnce(oldPage)
      .mockResolvedValue({ events: [event], pagination: { nextOffset: 1, hasMore: false, totalCount: 1 } });
    render(<DiscoverPage />);
    await waitFor(() => expect(screen.getByTestId('event-loading-state')).toHaveTextContent('Ready'));
    act(() => { intersectionCallbacks.forEach((callback) => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)); });
    await waitFor(() => expect(getEventsPageMock).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search by name or keyword' }), { target: { value: 'Basketball' } });
    expect(await screen.findByText('Basketball night')).toBeInTheDocument();
    await act(async () => {
      finishPage({ events: [{ ...event, $id: 'old', name: 'Basketball old query' }], pagination: { nextOffset: 200, hasMore: true, totalCount: 300 } });
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
      .mockResolvedValueOnce({ events: [event], pagination: { nextOffset: 100, hasMore: true, totalCount: 240 } })
      .mockReturnValueOnce(oldPage)
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'soonest-first', name: 'Soonest first' }],
        pagination: { nextOffset: 12, hasMore: true, totalCount: 24 },
      })
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'soonest-next', name: 'Soonest next' }],
        pagination: { nextOffset: 24, hasMore: false, totalCount: 24 },
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
    expect(getEventsPageMock).toHaveBeenLastCalledWith(expect.anything(), 100, 0, 'SOONEST');

    await act(async () => {
      finishOldPage({
        events: [{ ...event, $id: 'recommended-next', name: 'Recommended next' }],
        pagination: { nextOffset: 200, hasMore: true, totalCount: 240 },
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
    expect(getEventsPageMock).toHaveBeenLastCalledWith(expect.anything(), 100, 12, 'SOONEST');
  });

  it('keeps old-sort results separate when the replacement first page fails', async () => {
    navigationSearchParams = 'tab=events';
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const event = {
      $id: 'recommended-first', name: 'Recommended first', eventType: 'EVENT',
      start: '2099-09-10T18:00:00Z', sportIds: [], divisions: [],
    };
    getEventsPageMock
      .mockResolvedValueOnce({ events: [event], pagination: { nextOffset: 100, hasMore: true, totalCount: 240 } })
      .mockRejectedValueOnce(new Error('Events are unavailable'))
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'soonest-next', name: 'Soonest next' }],
        pagination: { nextOffset: 200, hasMore: false, totalCount: 200 },
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
      .mockResolvedValueOnce({ events: [event], pagination: { nextOffset: 100, hasMore: true, totalCount: 102 } })
      .mockRejectedValueOnce(new Error('Next events are unavailable'))
      .mockResolvedValueOnce({
        events: [{ ...event, $id: 'next-event', name: 'Next event' }],
        pagination: { nextOffset: 102, hasMore: false, totalCount: 102 },
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
      expect(getEventsPageMock).toHaveBeenLastCalledWith(expect.anything(), 100, 100, 'RECOMMENDED');
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

  it('loads organizations beside the embedded map and navigates from a result', async () => {
    render(<DiscoverPage />);

    const search = screen.getByRole('search', { name: 'Discover search' });
    expect(within(search).getByRole('textbox', { name: 'Search by name or keyword' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Discover' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Discover map' })).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Discover map' })).getByTestId('embedded-discover-map')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Discover results' })).toBeVisible();
    expect(await screen.findByTestId('organization-card')).toHaveTextContent('Rose City Sports');
    await waitFor(() => {
      expect(screen.queryByText('Loading organizations...')).not.toBeInTheDocument();
    });
    expect(listOrganizationsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Rose City Sports' }));
    expect(pushMock).toHaveBeenCalledWith('/organizations/org_1');
  });

  it('updates the list when the map reports a different visible organization scope', async () => {
    listOrganizationsMock.mockResolvedValue({
      organizations: [
        { $id: 'rose', name: 'Rose City Sports', coordinates: [-122.6765, 45.5231], sports: [], tags: [] },
        { $id: 'cascade', name: 'Cascade Athletics', coordinates: [-122.6587, 45.5122], sports: [], tags: [] },
      ],
      pagination: { limit: 100, offset: 0, nextOffset: 2, hasMore: false },
    });
    mockMapResultIds = ['rose'];

    const { rerender } = render(<DiscoverPage />);
    const results = within(screen.getByRole('region', { name: 'Discover results' }));
    expect(await results.findByRole('button', { name: 'Rose City Sports' })).toBeVisible();
    expect(results.queryByRole('button', { name: 'Cascade Athletics' })).not.toBeInTheDocument();

    mockMapResultIds = ['cascade'];
    rerender(<DiscoverPage />);

    expect(await results.findByRole('button', { name: 'Cascade Athletics' })).toBeVisible();
    expect(results.queryByRole('button', { name: 'Rose City Sports' })).not.toBeInTheDocument();
    expect(screen.getByTestId('embedded-discover-map')).toBeVisible();
  });

  it.each([
    { tab: 'events', group: 'Event filters', labels: ['Price', 'Event type', 'Event tags', 'Gender', 'Age group'] },
    { tab: 'organizations', group: 'Organization filters', labels: ['Tags', 'Division'] },
    { tab: 'rentals', group: 'Rental filters', labels: ['Time'] },
    { tab: 'teams', group: 'Team filters', labels: ['Division'] },
  ])('keeps the map, list, and all $tab filters visible before and after Search', async ({ tab, group, labels }) => {
    const user = userEvent.setup();
    navigationSearchParams = `tab=${tab}`;
    mockSportsResult.sports = [{ $id: 'soccer', name: 'Soccer' }];
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    const search = within(screen.getByRole('search', { name: 'Discover search' }));
    expect(search.getByRole('combobox', { name: 'Sport' })).toBeVisible();
    const filters = screen.getByRole('group', { name: group });
    for (const label of labels) {
      expect(within(filters).getByRole('button', { name: new RegExp(`^${label}(?::|$)`) })).toBeVisible();
    }
    expect(within(filters).queryByRole('combobox', { name: 'Sport' })).not.toBeInTheDocument();
    expect(within(filters).queryByRole('button', { name: /^(All sports|Soccer|More sports)$/ })).not.toBeInTheDocument();
    expect(within(filters).queryByRole('button', { name: /^Distance/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Filters|More filters)/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Discover map' })).toBeVisible();
    expect(screen.getByTestId('embedded-discover-map')).toHaveTextContent(`Map for ${tab}`);
    expect(screen.getByRole('region', { name: 'Discover results' })).toBeVisible();

    await user.click(search.getByRole('button', { name: 'Search' }));

    expect(search.queryByRole('textbox', { name: 'Search by name or keyword' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit search:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Discover map' })).toBeVisible();
    expect(screen.getByTestId('embedded-discover-map')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Discover results' })).toBeVisible();
    for (const label of labels) {
      expect(within(filters).getByRole('button', { name: new RegExp(`^${label}(?::|$)`) })).toBeVisible();
    }
    expect(screen.queryByRole('button', { name: /^(Filters|More filters)/ })).not.toBeInTheDocument();

    await user.click(within(filters).getByRole('button', { name: labels[0] }));
    expect(await screen.findByRole('dialog', { name: `${labels[0]} filter` })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  it('sends organization text and map-area filters to the server before pagination', async () => {
    navigationSearchParams = [
      'tab=organizations',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
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
          radiusKm: 50,
        },
      }));
    });
  });

  it('sends rental text and map-area filters to the server before pagination', async () => {
    navigationSearchParams = [
      'tab=rentals',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
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
          radiusKm: 50,
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

  it('hydrates open teams from organizations without duplicating affiliate registration', async () => {
    navigationSearchParams = 'tab=teams';
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    listOrganizationsMock.mockResolvedValue({
      organizations: [{
        $id: 'org_rose_city',
        name: 'Rose City Sports',
        coordinates: [-122.6765, 45.5231],
        teams: [{
          $id: 'team_external',
          name: 'Rose City Futsal Community Team',
          division: 'Mens D2',
          sport: 'Indoor Soccer',
          openRegistration: true,
          affiliateUrl: 'https://example.test/register',
        }, {
          $id: 'team_local',
          name: 'Rose City Community Team',
          sport: 'Soccer',
          openRegistration: true,
        }, {
          $id: 'team_closed',
          name: 'Rose City Closed Team',
          sport: 'Soccer',
          openRegistration: false,
        }],
      }],
      pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: false },
    });

    render(<DiscoverPage />);

    const card = await screen.findByTestId('team-card-team_external');
    expect(card).toHaveTextContent('External registration');
    expect(card.textContent?.match(/External registration/g)).toHaveLength(1);
    expect(screen.queryByTestId('team-card-team_closed')).not.toBeInTheDocument();
    expect(listOrganizationsMock).toHaveBeenCalledWith(100, 0, expect.objectContaining({
      hydrateRelations: true,
      area: { lat: 45.5231, lng: -122.6765, radiusKm: 50 },
    }));

    fireEvent.click(screen.getByTestId('team-card-team_local'));
    expect(pushMock).toHaveBeenCalledWith('/organizations/org_rose_city?tab=teams');
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

  it('keeps rental cards to the listings visible on the map', async () => {
    navigationSearchParams = 'tab=rentals';
    mockMapResultIds = ['org_1:facility:facility_1'];
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);
    listOrganizationsMock.mockResolvedValue({
      organizations: [{
        $id: 'org_1',
        name: 'Rose City Sports',
        facilities: [{
          $id: 'facility_1',
          name: 'Rose City Court',
          status: 'ACTIVE',
          affiliateUrl: 'https://example.test/court',
        }, {
          $id: 'facility_2',
          name: 'Hidden Court',
          status: 'ACTIVE',
          affiliateUrl: 'https://example.test/hidden',
        }],
      }],
      pagination: { limit: 100, offset: 0, nextOffset: 1, hasMore: false },
    });

    render(<DiscoverPage />);

    expect(await screen.findByText('Rose City Court')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Court')).not.toBeInTheDocument();
  });

  it('keeps the current area rental response when an older request finishes later', async () => {
    navigationSearchParams = [
      'tab=rentals',
      'q=Salmon+Creek',
      'lat=45.5231',
      'lng=-122.6765',
      'location=Portland%2C+OR',
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

  it('restores event sport and location presets without restoring a distance filter', async () => {
    navigationSearchParams = 'sport=Tennis&lat=40.7127753&lng=-74.0059728&location=New+York%2C+NY&distanceMiles=500';
    mockLocation = { lat: 40.7127753, lng: -74.0059728 };
    mockMapRadiusKm = 12;
    mockSportsResult.sports = [{ $id: 'Tennis', name: 'Tennis' }];
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    await waitFor(() => {
      expect(getEventsPageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sports: ['Tennis'],
          userLocation: mockLocation,
          maxDistance: 12,
        }),
        100,
        0,
        'RECOMMENDED',
      );
      expect(new URLSearchParams(window.location.search).has('distanceMiles')).toBe(false);
    });
    expect(new URLSearchParams(window.location.search).get('sport')).toBe('Tennis');
    expect(new URLSearchParams(window.location.search).get('lat')).toBe('40.7127753');
    expect(screen.queryByRole('button', { name: /^Distance/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Filter by distance' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Discover map' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Discover results' })).toBeVisible();
  });

  it('keeps an empty event search scoped to the map instead of widening it automatically', async () => {
    navigationSearchParams = 'lat=40.7127753&lng=-74.0059728&location=New+York%2C+NY';
    mockLocation = { lat: 40.7127753, lng: -74.0059728 };
    window.history.replaceState({}, '', `/discover?${navigationSearchParams}`);

    render(<DiscoverPage />);

    await waitFor(() => expect(screen.getByTestId('event-loading-state')).toHaveTextContent('Ready'));
    expect(getEventsPageMock).toHaveBeenCalledTimes(1);
    expect(getEventsPageMock).toHaveBeenCalledWith(
      expect.objectContaining({ userLocation: mockLocation, maxDistance: 50 }),
      100,
      0,
      'RECOMMENDED',
    );
    expect(new URLSearchParams(window.location.search).has('distanceMiles')).toBe(false);
  });
});
