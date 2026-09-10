import { useState, type ComponentProps } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DiscoverMapModal from '../DiscoverMapModal';
import { resolveOpenFilter } from '../DiscoverFilterBar';
import { EMPTY_DISCOVERY_DIVISION_FILTERS } from '../DiscoverTabFilterBar';
import { eventService } from '@/lib/eventService';
import { organizationService } from '@/lib/organizationService';
import type { Event, Organization, Team, TimeSlot } from '@/types';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';

const VANCOUVER_WA_CENTER = { lat: 45.6387, lng: -122.6615 };

let mockMapCenter = { ...VANCOUVER_WA_CENTER };
let mockMapZoom = 11;

const mockMap = {
  getCenter: jest.fn(() => ({
    lat: () => mockMapCenter.lat,
    lng: () => mockMapCenter.lng,
  })),
  getBounds: jest.fn(() => ({
    getNorthEast: () => ({
      lat: () => mockMapCenter.lat + 0.45,
      lng: () => mockMapCenter.lng,
    }),
    getSouthWest: () => ({
      lat: () => mockMapCenter.lat - 0.45,
      lng: () => mockMapCenter.lng,
    }),
  })),
  getZoom: jest.fn(() => mockMapZoom),
  panTo: jest.fn(),
  setZoom: jest.fn(),
};

jest.mock('@react-google-maps/api', () => {
  const React = require('react');

  return {
    GoogleMap: ({ children, onDragEnd, onIdle, onLoad, onZoomChanged }: any) => {
      const loadedRef = React.useRef(false);

      React.useEffect(() => {
        if (!loadedRef.current) {
          loadedRef.current = true;
          onLoad?.(mockMap);
          onIdle?.();
        }
      }, [onIdle, onLoad]);

      return React.createElement(
        'div',
        { 'data-testid': 'google-map' },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              mockMapCenter = { lat: VANCOUVER_WA_CENTER.lat + 0.05, lng: VANCOUVER_WA_CENTER.lng };
              onDragEnd?.();
              onIdle?.();
            },
          },
          'Simulate map idle',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              mockMapZoom = 12;
              onZoomChanged?.();
              onZoomChanged?.();
            },
          },
          'Simulate map zoom events',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => onIdle?.(),
          },
          'Finish map zoom',
        ),
        children,
      );
    },
    InfoWindowF: ({ children }: any) => React.createElement('div', null, children),
    MarkerF: ({ onClick, title }: any) => React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'map-marker',
        onClick,
        title,
      },
      title ?? 'Map marker',
    ),
    OVERLAY_LAYER: 'overlayLayer',
    OverlayViewF: ({ children }: any) => React.createElement('div', null, children),
    useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
  };
});

jest.mock('@/lib/eventService', () => ({
  eventService: {
    getEventsPaginated: jest.fn(),
  },
}));

jest.mock('@/lib/organizationService', () => ({
  organizationService: {
    listOrganizationsInArea: jest.fn(),
  },
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ unoptimized, ...props }: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt ?? ''} />;
  },
}));

const mockedEventService = eventService as jest.Mocked<typeof eventService>;
const mockedOrganizationService = organizationService as jest.Mocked<typeof organizationService>;

const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => (
  Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111
);

const buildMapEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event-1',
  name: 'Riverside FC Pickup',
  description: 'Open play for local teams.',
  start: '2099-01-01T18:00:00.000Z',
  end: null,
  location: 'River City Sports Club',
  coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
  price: 0,
  imageId: null,
  hostId: null,
  state: 'PUBLISHED',
  maxParticipants: 24,
  teamSizeLimit: 1,
  teamSignup: false,
  singleDivision: true,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: null,
  registrationCutoffHours: null,
  seedColor: 0,
  $createdAt: '2098-12-01T00:00:00.000Z',
  $updatedAt: '2098-12-01T00:00:00.000Z',
  eventType: 'EVENT',
  sport: { $id: 'soccer', name: 'Soccer' } as Event['sport'],
  sportIds: ['soccer'],
  divisions: [],
  ...overrides,
} as Event);

const DEFAULT_EVENT_TAGS = [
  { id: 'tag-tryouts', name: 'Tryouts', slug: 'tryouts' },
  { id: 'tag-clinic', name: 'Clinic', slug: 'clinic' },
];

type ModalProps = ComponentProps<typeof DiscoverMapModal>;
const EVENT_TYPES: Event['eventType'][] = ['EVENT', 'TOURNAMENT', 'LEAGUE', 'WEEKLY_EVENT', 'TRYOUT'];
const DEFAULT_ORGANIZATION_FILTERS: ModalProps['organizationFilters'] = {
  selectedTags: [], setSelectedTags: jest.fn(),
  organizationTags: [{ id: 'youth', name: 'Youth programs', slug: 'youth-programs' }],
  organizationTagsLoading: false, organizationTagsError: null,
  divisionFilters: EMPTY_DISCOVERY_DIVISION_FILTERS, setDivisionFilters: jest.fn(),
  maxDistance: null, setMaxDistance: jest.fn(),
};
const DEFAULT_RENTAL_FILTERS: ModalProps['rentalFilters'] = {
  timeRange: [0, 24], setTimeRange: jest.fn(), defaultTimeRange: [0, 24], maxDistance: null, setMaxDistance: jest.fn(),
};
const DEFAULT_TEAM_FILTERS: ModalProps['teamFilters'] = {
  selectedSports: [], setSelectedSports: jest.fn(), selectedDivisionTypeValues: [], setSelectedDivisionTypeValues: jest.fn(),
};

function MapFilterHarness(props: Partial<ModalProps>) {
  const [selectedSports, setSelectedSports] = useState(props.selectedSports ?? []);
  const [selectedTags, setSelectedTags] = useState(props.selectedTags ?? []);
  const [selectedEventTypes, setSelectedEventTypes] = useState(props.selectedEventTypes ?? EVENT_TYPES);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(props.selectedStartDate ?? null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(props.selectedEndDate ?? null);
  const [divisionFilters, setDivisionFilters] = useState(props.divisionFilters ?? EMPTY_DISCOVERY_DIVISION_FILTERS);
  const [maxDistance, setMaxDistance] = useState<number | null>(props.maxDistance ?? null);
  const [organizationTags, setOrganizationTags] = useState(props.organizationFilters?.selectedTags ?? []);
  const [organizationDivision, setOrganizationDivision] = useState(props.organizationFilters?.divisionFilters ?? EMPTY_DISCOVERY_DIVISION_FILTERS);
  const [organizationDistance, setOrganizationDistance] = useState<number | null>(props.organizationFilters?.maxDistance ?? null);
  const [rentalTime, setRentalTime] = useState<[number, number]>(props.rentalFilters?.timeRange ?? [0, 24]);
  const [rentalDistance, setRentalDistance] = useState<number | null>(props.rentalFilters?.maxDistance ?? null);
  const [teamSports, setTeamSports] = useState(props.teamFilters?.selectedSports ?? []);
  const [teamDivisions, setTeamDivisions] = useState(props.teamFilters?.selectedDivisionTypeValues ?? []);
  return <DiscoverMapModal
    opened activeTab="events" onClose={jest.fn()} location={VANCOUVER_WA_CENTER} requestLocation={jest.fn()} kmBetween={kmBetween}
    eventTags={DEFAULT_EVENT_TAGS} eventTagsLoading={false} eventTagsError={null}
    eventTypeOptions={EVENT_TYPES} sports={['Soccer', 'Volleyball', 'Tennis']} sportsLoading={false} sportsError={null}
    defaultMaxDistance={50} onEventClick={jest.fn()} onOrganizationClick={jest.fn()} onTeamClick={jest.fn()}
    {...props}
    selectedSports={selectedSports} setSelectedSports={setSelectedSports}
    selectedTags={selectedTags} setSelectedTags={setSelectedTags}
    selectedEventTypes={selectedEventTypes} setSelectedEventTypes={setSelectedEventTypes}
    selectedStartDate={selectedStartDate} setSelectedStartDate={setSelectedStartDate}
    selectedEndDate={selectedEndDate} setSelectedEndDate={setSelectedEndDate}
    divisionFilters={divisionFilters} setDivisionFilters={setDivisionFilters}
    maxDistance={maxDistance} setMaxDistance={setMaxDistance}
    organizationFilters={{
      ...DEFAULT_ORGANIZATION_FILTERS, ...props.organizationFilters,
      selectedTags: organizationTags, setSelectedTags: setOrganizationTags,
      divisionFilters: organizationDivision, setDivisionFilters: setOrganizationDivision,
      maxDistance: organizationDistance, setMaxDistance: setOrganizationDistance,
    }}
    rentalFilters={{
      ...DEFAULT_RENTAL_FILTERS, ...props.rentalFilters,
      timeRange: rentalTime, setTimeRange: setRentalTime,
      maxDistance: rentalDistance, setMaxDistance: setRentalDistance,
    }}
    teamFilters={{
      selectedSports: teamSports, setSelectedSports: setTeamSports,
      selectedDivisionTypeValues: teamDivisions, setSelectedDivisionTypeValues: setTeamDivisions,
    }}
  />;
}

const renderModal = (location = VANCOUVER_WA_CENTER, options: Partial<ModalProps> = {}) => (
  renderWithMantine(<MapFilterHarness {...options} location={location} />)
);

const buildAffiliateRentalOrganization = (): Organization => ({
  $id: 'org-affiliate-rentals',
  name: 'Affiliate Rentals',
  location: 'Vancouver, WA',
  address: null,
  description: 'External rental inventory',
  logoId: null,
  ownerId: 'owner-1',
  website: 'https://example.com',
  sports: ['Soccer'],
  status: 'UNLISTED',
  coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
  productIds: [],
  fields: [],
  facilities: [
    {
      $id: 'facility-affiliate',
      name: 'Affiliate Indoor Court',
      organizationId: 'org-affiliate-rentals',
      location: 'Vancouver, WA',
      address: '100 Main St, Vancouver, WA',
      coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
      operatingHours: null,
      timeZone: 'America/Los_Angeles',
      status: 'ACTIVE',
      isDefault: false,
      sortOrder: null,
      affiliateUrl: 'https://example.com/book',
    },
  ],
  events: [],
  teams: [],
  officials: [],
  hosts: [],
  products: [],
} as unknown as Organization);

const buildMapOrganization = (
  id: string,
  name: string,
  coordinateOffset: number,
): Organization => ({
  ...buildAffiliateRentalOrganization(),
  $id: id,
  name,
  status: 'LISTED',
  coordinates: [
    VANCOUVER_WA_CENTER.lng + coordinateOffset,
    VANCOUVER_WA_CENTER.lat + coordinateOffset,
  ],
  facilities: [],
});

function CurrentLocationHarness() {
  const [location, setLocation] = useState(VANCOUVER_WA_CENTER);

  return (
    <>
      <button
        type="button"
        onClick={() => setLocation({ ...VANCOUVER_WA_CENTER })}
      >
        Re-emit Vancouver location
      </button>
      <MapFilterHarness location={location} />
    </>
  );
}

const buildMapTeam = (overrides: Partial<Team>): Team => ({
  $id: 'team', name: 'Cascade Crew', division: 'Open', sport: 'Volleyball',
  playerIds: [], captainId: 'captain', pending: [], teamSize: 12, openRegistration: true,
  currentSize: 0, isFull: false, avatarUrl: '', ...overrides,
});

describe('DiscoverMapModal', () => {
  const originalFetchDescriptor = Object.getOwnPropertyDescriptor(global, 'fetch');
  const originalElementRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.closest('[data-slot="slider"]')
        ? new DOMRect(0, 0, 200, 44)
        : originalElementRect.call(this);
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        genders: [{ id: 'F', name: 'Women' }, { id: 'M', name: 'Men' }],
        ages: [{ id: 'adult', name: 'Adult' }],
        sportSkills: [{ sportId: 'volleyball', sportName: 'Volleyball', skills: [{ id: 'intermediate', name: 'Intermediate' }] }],
      }),
    } as Response);
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
    mockMapCenter = { ...VANCOUVER_WA_CENTER };
    mockMapZoom = 11;
    mockedEventService.getEventsPaginated.mockResolvedValue([]);
    mockedOrganizationService.listOrganizationsInArea.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFetchDescriptor) {
      Object.defineProperty(global, 'fetch', originalFetchDescriptor);
    } else {
      Reflect.deleteProperty(global, 'fetch');
    }
  });

  it('loads the Vancouver area on open, then waits for Search this area before refreshing after map movement', async () => {
    renderModal();

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
    });
    expect(mockedOrganizationService.listOrganizationsInArea).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Simulate map idle' }));

    const searchAreaButton = await screen.findByRole('button', { name: 'Search this area' });
    expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);

    fireEvent.click(searchAreaButton);

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(2);
    });
  });

  it('does not repeat the initial Vancouver-area load when the same current location is re-emitted', async () => {
    renderWithMantine(<CurrentLocationHarness />);

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Re-emit Vancouver location', hidden: true }));

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });

    expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
  });

  it('loads all organizations for the selected map area and searches those cached results locally', async () => {
    mockedOrganizationService.listOrganizationsInArea.mockResolvedValue([{
      ...buildAffiliateRentalOrganization(),
      $id: 'org-salmon-creek',
      name: 'Salmon Creek Indoor',
    }]);
    renderModal();

    fireEvent.click(screen.getByRole('tab', { name: 'Organizations' }));

    await waitFor(() => {
      expect(mockedOrganizationService.listOrganizationsInArea).toHaveBeenCalledWith(
        expect.objectContaining({
          area: expect.objectContaining({
            lat: VANCOUVER_WA_CENTER.lat,
            lng: VANCOUVER_WA_CENTER.lng,
          }),
          includeAffiliateRentals: false,
          hydrateRelations: false,
        }),
      );
    });

    fireEvent.change(screen.getAllByLabelText('Map search')[0], {
      target: { value: 'Salmon Creek' },
    });
    expect((await screen.findAllByText('Salmon Creek Indoor')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Simulate map idle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Search this area' }));

    await waitFor(() => {
      expect(mockedOrganizationService.listOrganizationsInArea).toHaveBeenLastCalledWith(
        expect.objectContaining({
          area: expect.objectContaining({
            lat: VANCOUVER_WA_CENTER.lat + 0.05,
            lng: VANCOUVER_WA_CENTER.lng,
          }),
        }),
      );
    });
  });

  it('applies event type and all division constraints to the same division when price changes', async () => {
    const user = userEvent.setup();
    const division = { gender: 'F', skillDivisionTypeId: 'intermediate', ageDivisionTypeId: 'adult', price: 2500 };
    const eligible = buildMapEvent({
      $id: 'eligible', name: 'Cascade League', eventType: 'LEAGUE',
      sport: { $id: 'volleyball', name: 'Volleyball' } as Event['sport'], sportIds: ['volleyball'],
      tags: [DEFAULT_EVENT_TAGS[1]], divisionDetails: [division] as Event['divisionDetails'],
    });
    mockedEventService.getEventsPaginated.mockResolvedValue([
      eligible,
      { ...eligible, $id: 'mixed', name: 'Mixed divisions', divisionDetails: [
        { ...division, price: 6000 }, { ...division, gender: 'M', price: 2000 },
      ] as Event['divisionDetails'] },
      { ...eligible, $id: 'pickup', name: 'Pickup session', eventType: 'EVENT' },
    ]);
    renderModal(VANCOUVER_WA_CENTER, {
      selectedSports: ['Volleyball'], selectedTags: ['Clinic'], selectedEventTypes: ['LEAGUE'],
      selectedStartDate: new Date(2099, 0, 1), selectedEndDate: new Date(2099, 0, 2), maxDistance: 30,
      divisionFilters: { ...EMPTY_DISCOVERY_DIVISION_FILTERS, genders: ['F'], skillDivisionTypeIds: ['intermediate'], ageDivisionTypeIds: ['adult'], priceMinDollars: 10 },
    });
    expect(await screen.findByText('2 events found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Price:/ }));
    fireEvent.change(within(screen.getByRole('dialog', { name: 'Price filter' })).getByRole('textbox', { name: 'Maximum', exact: true }), {
      target: { value: '50' },
    });
    expect(await screen.findByText('1 event found')).toBeInTheDocument();
    const rail = screen.getByRole('complementary', { name: 'Nearby events' });
    expect(within(rail).getByRole('button', { name: 'Select Cascade League' })).toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: 'Select Mixed divisions' })).not.toBeInTheDocument();
    expect(mockedEventService.getEventsPaginated).toHaveBeenLastCalledWith(expect.objectContaining({
      eventTypes: ['LEAGUE'], sports: ['Volleyball'], tags: ['Clinic'], divisionGenders: ['F'],
      skillDivisionTypeIds: ['intermediate'], ageDivisionTypeIds: ['adult'], priceMin: 1000, priceMax: 5000,
      dateFrom: new Date(2099, 0, 1).toISOString(), dateTo: new Date(2099, 0, 2, 23, 59, 59, 999).toISOString(), maxDistance: 30,
    }), 100, 0, 'NEAREST');
  });

  it('loads and displays map events for the selected sport', async () => {
    mockedEventService.getEventsPaginated.mockResolvedValue([
      buildMapEvent({
        $id: 'tennis-event',
        name: 'Ladder Tournament 2026',
        sport: { $id: 'Tennis', name: 'Tennis' } as Event['sport'],
      }),
    ]);

    renderModal(VANCOUVER_WA_CENTER, { selectedSports: ['Tennis'] });

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ sports: ['Tennis'] }),
        100,
        0,
        'NEAREST',
      );
    });
    expect(await screen.findByRole('button', { name: 'Ladder Tournament 2026' })).toBeInTheDocument();
  });

  it('opens and closes the mobile map search and filters independently', async () => {
    renderModal();

    await waitFor(() => {
      expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1);
    });

    const searchShell = document.querySelector('.discover-map-search-shell');
    const filterShell = document.querySelector('.discover-map-filter-shell');
    expect(searchShell).toHaveAttribute('data-mobile-expanded', 'false');
    expect(filterShell).toHaveAttribute('data-mobile-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Show map search' }));

    expect(searchShell).toHaveAttribute('data-mobile-expanded', 'true');
    expect(filterShell).toHaveAttribute('data-mobile-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Hide map search' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Show map filters' }));

    expect(filterShell).toHaveAttribute('data-mobile-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Hide map filters' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Hide map search' }));

    expect(searchShell).toHaveAttribute('data-mobile-expanded', 'false');
    expect(filterShell).toHaveAttribute('data-mobile-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Hide map filters' }));

    expect(filterShell).toHaveAttribute('data-mobile-expanded', 'false');
  });

  it('closes Dates and keeps Price open when switching map filters', async () => {
    const user = userEvent.setup();
    renderModal();
    const datesButton = await screen.findByRole('button', { name: 'Dates', exact: true });
    const priceButton = screen.getByRole('button', { name: 'Price', exact: true });
    await user.click(datesButton);
    expect(datesButton).toHaveAttribute('aria-expanded', 'true');
    await user.click(priceButton);
    expect(datesButton).toHaveAttribute('aria-expanded', 'false');
    expect(priceButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('ignores a delayed Tags close after Sports opens', () => {
    const tagsOpen = resolveOpenFilter(null, 'tags', true);
    const sportsOpen = resolveOpenFilter(tagsOpen, 'sports', true);
    const afterTagsClose = resolveOpenFilter(sportsOpen, 'tags', false);

    expect(afterTagsClose).toBe('sports');
    expect(resolveOpenFilter(afterTagsClose, 'sports', false)).toBeNull();
  });

  it('regroups markers only after a zoom gesture settles', async () => {
    mockedEventService.getEventsPaginated.mockResolvedValue([
      buildMapEvent({
        $id: 'zoom-event-one',
        name: 'Zoom Event One',
        coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
      }),
      buildMapEvent({
        $id: 'zoom-event-two',
        name: 'Zoom Event Two',
        coordinates: [VANCOUVER_WA_CENTER.lng + 0.02, VANCOUVER_WA_CENTER.lat],
      }),
    ]);

    renderModal();

    expect(await screen.findByRole('button', { name: '2 events' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Simulate map zoom events' }));

    expect(screen.getByRole('button', { name: '2 events' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom Event One' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finish map zoom' }));

    expect(await screen.findByRole('button', { name: 'Zoom Event One' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom Event Two' })).toBeInTheDocument();
  });

  it('groups touching event markers into a count marker', async () => {
    mockedEventService.getEventsPaginated.mockResolvedValue([
      buildMapEvent({
        $id: 'riverside-pickup',
        name: 'Riverside FC Pickup',
        coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat],
      }),
      buildMapEvent({
        $id: 'cascade-clinic',
        name: 'Cascade Crew Clinic',
        coordinates: [VANCOUVER_WA_CENTER.lng + 0.0001, VANCOUVER_WA_CENTER.lat + 0.0001],
      }),
      buildMapEvent({
        $id: 'harbor-league',
        name: 'Harbor Strikers League',
        coordinates: [VANCOUVER_WA_CENTER.lng + 0.2, VANCOUVER_WA_CENTER.lat + 0.2],
      }),
    ]);

    renderModal();

    const clusterMarker = await screen.findByRole('button', { name: '2 events' });
    expect(clusterMarker).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riverside FC Pickup' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Harbor Strikers League' })).toBeInTheDocument();

    fireEvent.click(clusterMarker);

    expect(await screen.findByText('Riverside FC Pickup')).toBeInTheDocument();
    expect(screen.getByText('Cascade Crew Clinic')).toBeInTheDocument();
  });

  it('groups touching organization markers into a count marker', async () => {
    mockedOrganizationService.listOrganizationsInArea.mockResolvedValue([
      buildMapOrganization('org-river-city', 'River City Sports Club', 0),
      buildMapOrganization('org-cascade', 'Cascade Athletic Club', 0.0001),
      buildMapOrganization('org-harbor', 'Harbor Sports Center', 0.2),
    ]);

    renderModal();

    fireEvent.click(screen.getByRole('tab', { name: 'Organizations' }));

    const clusterMarker = await screen.findByRole('button', { name: '2 organizations' });
    expect(clusterMarker).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'River City Sports Club' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Harbor Sports Center' })).toBeInTheDocument();

    fireEvent.click(clusterMarker);

    expect(await screen.findByText('River City Sports Club')).toBeInTheDocument();
    expect(screen.getByText('Cascade Athletic Club')).toBeInTheDocument();
  });

  it('groups touching rental markers into a count marker', async () => {
    const rentalOrganization = buildAffiliateRentalOrganization();
    rentalOrganization.facilities = [
      ...(rentalOrganization.facilities ?? []),
      {
        ...(rentalOrganization.facilities?.[0] ?? {}),
        $id: 'facility-affiliate-birthday',
        name: 'Affiliate Birthday Parties',
        affiliateUrl: 'https://example.com/parties',
        coordinates: [VANCOUVER_WA_CENTER.lng + 0.0001, VANCOUVER_WA_CENTER.lat + 0.0001],
      },
    ] as Organization['facilities'];
    mockedOrganizationService.listOrganizationsInArea.mockResolvedValue([rentalOrganization]);

    renderModal();

    fireEvent.click(screen.getByRole('tab', { name: 'Rentals' }));

    const clusterMarker = await screen.findByRole('button', { name: '2 rentals' });
    expect(clusterMarker).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Affiliate Indoor Court' })).not.toBeInTheDocument();

    fireEvent.click(clusterMarker);

    expect(await screen.findByText('Affiliate Indoor Court')).toBeInTheDocument();
    expect(screen.getByText('Affiliate Birthday Parties')).toBeInTheDocument();
  });

  it('shows affiliate rental facilities on the rentals map and opens their affiliate URL', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    mockedOrganizationService.listOrganizationsInArea.mockResolvedValue([
      buildAffiliateRentalOrganization(),
    ]);

    renderModal();

    fireEvent.click(screen.getByRole('tab', { name: 'Rentals' }));

    await waitFor(() => {
      expect(mockedOrganizationService.listOrganizationsInArea).toHaveBeenCalledWith(
        expect.objectContaining({
          area: expect.objectContaining({
            lat: VANCOUVER_WA_CENTER.lat,
            lng: VANCOUVER_WA_CENTER.lng,
            radiusKm: expect.any(Number),
          }),
          includeAffiliateRentals: true,
          hydrateRelations: true,
        }),
      );
    });

    const marker = await screen.findByRole('button', { name: 'Affiliate Indoor Court' });
    fireEvent.click(marker);

    fireEvent.click(await screen.findByRole('button', { name: 'Open booking' }));

    expect(openSpy).toHaveBeenCalledWith('https://example.com/book', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('switches from nearby event rows to a selected detail card and restores the rail on close', async () => {
    const event = buildMapEvent({
      $id: 'cascade-classic',
      name: 'Cascade Volleyball Classic',
      description: 'A weekend tournament for local clubs.',
      eventType: 'TOURNAMENT',
      sport: { $id: 'volleyball', name: 'Volleyball' } as Event['sport'],
      start: '2099-06-12T18:00:00.000Z',
      end: '2099-06-14T18:00:00.000Z',
      timeZone: 'UTC',
      location: 'Cascade Sports Center',
      coordinates: [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat + 0.1],
    });
    mockedEventService.getEventsPaginated.mockResolvedValue([event, buildMapEvent()]);
    const onClose = jest.fn();
    const onEventClick = jest.fn();
    renderModal(VANCOUVER_WA_CENTER, { onClose, onEventClick });

    const rail = await screen.findByRole('complementary', { name: 'Nearby events' });
    const row = within(rail).getByRole('button', { name: 'Select Cascade Volleyball Classic' });
    expect(within(row).getByText('Volleyball')).toBeInTheDocument();
    expect(within(row).getByText('Jun 12, 2099 – Jun 14, 2099')).toBeInTheDocument();
    expect(within(row).getByText('Cascade Sports Center')).toBeInTheDocument();
    expect(within(row).getByText('6.9 mi')).toBeInTheDocument();

    fireEvent.click(row);

    const detail = await screen.findByRole('region', { name: 'Selected event' });
    expect(screen.queryByRole('complementary', { name: 'Nearby events' })).not.toBeInTheDocument();
    expect(within(detail).getByRole('heading', { name: 'Cascade Volleyball Classic' })).toBeInTheDocument();
    expect(within(detail).getByText('Tournament')).toBeInTheDocument();
    expect(within(detail).getByText('Volleyball')).toBeInTheDocument();
    expect(within(detail).getByText('A weekend tournament for local clubs.')).toBeInTheDocument();
    expect(within(detail).getByText('Jun 12, 2099 – Jun 14, 2099')).toBeInTheDocument();
    expect(within(detail).getByText('Cascade Sports Center')).toBeInTheDocument();
    expect(within(detail).getByText('6.9 mi')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'View event' })).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole('button', { name: 'Close selected event' }));

    const restoredRail = await screen.findByRole('complementary', { name: 'Nearby events' });
    expect(within(restoredRail).getByRole('button', { name: 'Select Cascade Volleyball Classic' })).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Selected event' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cascade Volleyball Classic' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View event' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEventClick).toHaveBeenCalledWith(event);
  });
  it('opens Organizations with its filters and reloads the current area when a tag changes', async () => {
    const user = userEvent.setup();
    const youth = buildMapOrganization('youth', 'Cascade Youth Club', 0);
    const adult = buildMapOrganization('adult', 'Harbor Adult Club', 0.01);
    mockedOrganizationService.listOrganizationsInArea.mockImplementation(async (options) => (
      options?.tagSlugs?.includes('youth-programs') ? [youth] : [youth, adult]
    ));
    renderModal(VANCOUVER_WA_CENTER, {
      activeTab: 'organizations', selectedSports: ['Soccer'],
      organizationFilters: {
        ...DEFAULT_ORGANIZATION_FILTERS, maxDistance: 20,
        divisionFilters: {
          genders: ['F'], ageDivisionTypeIds: ['adult'], skillDivisionTypeIds: ['intermediate'],
          priceMinDollars: 10, priceMaxDollars: 40,
        },
      },
    });
    expect(await screen.findByText('2 organizations found')).toBeInTheDocument();
    expect(mockedEventService.getEventsPaginated).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Organizations' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Simulate map idle' }));
    await user.click(screen.getByRole('button', { name: 'Tags', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Youth programs', exact: true }));
    expect(await screen.findByText('1 organization found')).toBeInTheDocument();
    const rail = screen.getByRole('complementary', { name: 'Nearby organizations' });
    expect(within(rail).getByRole('button', { name: 'Select Cascade Youth Club' })).toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: 'Select Harbor Adult Club' })).not.toBeInTheDocument();
    expect(mockedOrganizationService.listOrganizationsInArea).toHaveBeenLastCalledWith(expect.objectContaining({
      tagSlugs: ['youth-programs'], sports: ['Soccer'], divisionGenders: ['F'],
      skillDivisionTypeIds: ['intermediate'], ageDivisionTypeIds: ['adult'],
      divisionPriceMin: 1000, divisionPriceMax: 4000,
      area: { lat: VANCOUVER_WA_CENTER.lat + 0.05, lng: VANCOUVER_WA_CENTER.lng, radiusKm: 20 },
    }));
  });

  it('opens Rentals and combines rental-resource sports with the selected time range', async () => {
    const user = userEvent.setup();
    const organization = buildAffiliateRentalOrganization();
    organization.fields = [
      { $id: 'morning', name: 'Morning Soccer', location: 'Vancouver', lat: VANCOUVER_WA_CENTER.lat, long: VANCOUVER_WA_CENTER.lng, sportIds: ['Soccer'],
        rentalSlots: [{ $id: 'morning-slot', startDate: '2099-01-01', startTimeMinutes: 8 * 60, repeating: false } as TimeSlot] },
      { $id: 'evening', name: 'Evening Soccer', location: 'Vancouver', lat: VANCOUVER_WA_CENTER.lat, long: VANCOUVER_WA_CENTER.lng, sportIds: ['Soccer'],
        rentalSlots: [{ $id: 'evening-slot', startDate: '2099-01-01', startTimeMinutes: 18 * 60, repeating: false } as TimeSlot] },
      { $id: 'volleyball', name: 'Evening Volleyball', location: 'Vancouver', lat: VANCOUVER_WA_CENTER.lat, long: VANCOUVER_WA_CENTER.lng, sportIds: ['Volleyball'],
        rentalSlots: [{ $id: 'volleyball-slot', startDate: '2099-01-01', startTimeMinutes: 18 * 60, repeating: false } as TimeSlot] },
    ];
    mockedOrganizationService.listOrganizationsInArea.mockResolvedValue([organization]);
    renderModal(VANCOUVER_WA_CENTER, {
      activeTab: 'rentals', selectedSports: ['Soccer'], rentalFilters: { ...DEFAULT_RENTAL_FILTERS, maxDistance: 25 },
    });
    expect(await screen.findByText('3 rentals found')).toBeInTheDocument();
    expect(mockedEventService.getEventsPaginated).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Time', exact: true }));
    const [earliestTime] = await within(screen.getByRole('dialog', { name: 'Time filter' })).findAllByRole('slider');
    act(() => earliestTime.focus());
    await user.keyboard('{ArrowRight>12/}');
    expect(await screen.findByText('2 rentals found')).toBeInTheDocument();
    const rail = screen.getByRole('complementary', { name: 'Nearby rentals' });
    expect(within(rail).getByRole('button', { name: 'Select Evening Soccer' })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Select Affiliate Indoor Court' })).toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: 'Select Morning Soccer' })).not.toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: 'Select Evening Volleyball' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'All sports', exact: true }));
    expect(await screen.findByText('3 rentals found')).toBeInTheDocument();
    expect(mockedOrganizationService.listOrganizationsInArea).toHaveBeenLastCalledWith(expect.objectContaining({
      includeAffiliateRentals: true, hydrateRelations: true,
      area: { ...VANCOUVER_WA_CENTER, radiusKm: 25 },
    }));
  });

  it('opens Teams, applies team divisions, and selects a team at its organization location', async () => {
    const user = userEvent.setup();
    const organization = buildMapOrganization('cascade', 'Cascade Sports Club', 0);
    organization.coordinates = [VANCOUVER_WA_CENTER.lng, VANCOUVER_WA_CENTER.lat + 0.1];
    organization.teams = [
      buildMapTeam({ $id: 'u12', name: 'Cascade Juniors', divisionTypeId: 'skill_open_age_12u' }),
      buildMapTeam({ $id: 'open', name: 'Cascade Open' }),
      buildMapTeam({ $id: 'soccer', name: 'Cascade Soccer', sport: 'Soccer', divisionTypeId: 'skill_open_age_u12' }),
      buildMapTeam({ $id: 'closed', name: 'Closed Juniors', divisionTypeId: 'skill_open_age_12u', openRegistration: false }),
    ];
    mockedOrganizationService.listOrganizationsInArea.mockResolvedValue([organization]);
    const onTeamClick = jest.fn();
    renderModal(VANCOUVER_WA_CENTER, {
      activeTab: 'teams', onTeamClick, teamFilters: { ...DEFAULT_TEAM_FILTERS, selectedSports: ['Volleyball'] },
    });
    expect(await screen.findByText('2 teams found')).toBeInTheDocument();
    expect(mockedEventService.getEventsPaginated).not.toHaveBeenCalled();
    expect(mockedOrganizationService.listOrganizationsInArea).toHaveBeenCalledWith(expect.objectContaining({ hydrateRelations: true }));
    await user.click(screen.getByRole('button', { name: 'Division', exact: true }));
    await user.click(screen.getByRole('button', { name: 'U12', exact: true }));
    expect(await screen.findByText('1 team found')).toBeInTheDocument();
    const rail = screen.getByRole('complementary', { name: 'Nearby teams' });
    const row = within(rail).getByRole('button', { name: 'Select Cascade Juniors' });
    expect(within(row).getByText('Organization location: Cascade Sports Club')).toBeInTheDocument();
    expect(within(row).getByText('6.9 mi')).toBeInTheDocument();
    await user.click(row);
    const selection = screen.getByRole('region', { name: 'Selected team' });
    expect(within(selection).getByText(/Organization location: Cascade Sports Club/)).toBeInTheDocument();
    await user.click(within(selection).getByRole('button', { name: 'View team' }));
    expect(onTeamClick).toHaveBeenCalledWith(expect.objectContaining({ $id: 'u12', organizationId: 'cascade' }));
  });

  it('keeps the latest filtered results when an older request finishes last', async () => {
    let finishOldRequest!: (events: Event[]) => void;
    const oldRequest = new Promise<Event[]>((resolve) => { finishOldRequest = resolve; });
    mockedEventService.getEventsPaginated
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValue([buildMapEvent({ $id: 'latest', name: 'Latest Soccer' })]);
    renderModal();
    await waitFor(() => expect(mockedEventService.getEventsPaginated).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Soccer', exact: true }));
    expect(await screen.findByRole('button', { name: 'Select Latest Soccer' })).toBeInTheDocument();
    await act(async () => { finishOldRequest([buildMapEvent({ name: 'Old Soccer' })]); });
    const rail = screen.getByRole('complementary', { name: 'Nearby events' });
    expect(within(rail).getByRole('button', { name: 'Select Latest Soccer' })).toBeInTheDocument();
    expect(within(rail).queryByRole('button', { name: 'Select Old Soccer' })).not.toBeInTheDocument();
  });
});
