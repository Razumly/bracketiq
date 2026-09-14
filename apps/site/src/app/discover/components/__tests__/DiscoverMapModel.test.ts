import type { Event, Facility, Organization, Team } from '@/types';
import {
  buildMapMarkerGroups,
  getEventCoordinates,
  getFacilityCoordinates,
  getOrgCoordinates,
  mapCentersAreClose,
  matchesOrganizationSearch,
  matchesRentalSearch,
  matchesTeamSearch,
  normalizeMapRadiusKm,
  resolveEventDateRange,
  type MapCenter,
  type RentalMapListing,
  type TeamMapListing,
} from '../DiscoverMapModel';

const CENTER: MapCenter = { lat: 45.6387, lng: -122.6615 };

const buildEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event-1',
  name: 'Riverside FC Pickup',
  description: 'Open play for local teams.',
  start: '2099-01-01T18:00:00.000Z',
  end: null,
  location: 'River City Sports Club',
  coordinates: [CENTER.lng, CENTER.lat],
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

const organization = {
  $id: 'org-river-city',
  name: 'River City Sports Club',
  location: 'Portland, OR',
  description: 'Community sports programs',
  website: 'https://river-city.example.com',
  coordinates: [CENTER.lng, CENTER.lat],
} as unknown as Organization;

const facility = {
  $id: 'facility-river-city',
  name: 'River City Indoor Court',
  location: 'Portland, OR',
  coordinates: [CENTER.lng, CENTER.lat],
} as unknown as Facility;

const rental: RentalMapListing = {
  kind: 'affiliateFacility',
  organization,
  facility,
  nextOccurrence: new Date('2099-01-01T18:00:00.000Z'),
  coordinates: CENTER,
};

const team = { $id: 'team-river-city', name: 'River City FC', sport: 'Soccer' } as unknown as Team;
const teamListing: TeamMapListing = { team, organization, coordinates: CENTER };

describe('DiscoverMapModel', () => {
  it('groups nearby markers and excludes entries without coordinates', () => {
    const items = [
      { id: 'river', coordinates: CENTER },
      { id: 'near', coordinates: { lat: CENTER.lat + 0.0001, lng: CENTER.lng + 0.0001 } },
      { id: 'far', coordinates: { lat: CENTER.lat, lng: CENTER.lng + 1 } },
      { id: 'missing', coordinates: null },
    ];

    const groups = buildMapMarkerGroups(items, 11, (item) => item.id, (item) => item.coordinates);
    const nearbyGroup = groups.find((group) => group.items.length === 2);
    const farGroup = groups.find((group) => group.items[0]?.id === 'far');

    expect(nearbyGroup).toMatchObject({ id: 'near:river' });
    expect(nearbyGroup?.items.map((item) => item.id)).toEqual(['near', 'river']);
    expect(farGroup?.items.map((item) => item.id)).toEqual(['far']);
    expect(groups).toHaveLength(2);
  });

  it('matches organization, rental, and team searches against user-facing map content', () => {
    expect(matchesOrganizationSearch(organization, 'portland')).toBe(true);
    expect(matchesOrganizationSearch(organization, 'unlisted venue')).toBe(false);
    expect(matchesRentalSearch(rental, 'indoor court')).toBe(true);
    expect(matchesRentalSearch(rental, 'unlisted venue')).toBe(false);
    expect(matchesTeamSearch(teamListing, 'river city fc')).toBe(true);
    expect(matchesTeamSearch(teamListing, 'unlisted team')).toBe(false);
  });

  it('normalizes map radius and compares map centers with the movement threshold', () => {
    expect(normalizeMapRadiusKm(null)).toBe(50);
    expect(normalizeMapRadiusKm(0)).toBe(1);
    expect(normalizeMapRadiusKm(25)).toBe(25);
    expect(mapCentersAreClose(CENTER, { lat: CENTER.lat + 0.000001, lng: CENTER.lng })).toBe(true);
    expect(mapCentersAreClose(CENTER, { lat: CENTER.lat + 0.001, lng: CENTER.lng })).toBe(false);
  });

  it('normalizes event coordinates and preserves the selected date range', () => {
    expect(getEventCoordinates(buildEvent())).toEqual(CENTER);
    expect(getEventCoordinates(buildEvent({ coordinates: null }))).toBeNull();
    expect(getOrgCoordinates(organization)).toEqual(CENTER);
    expect(getFacilityCoordinates(facility)).toEqual(CENTER);

    const range = resolveEventDateRange(new Date(2030, 4, 3, 12), new Date(2030, 4, 4, 9));
    expect(range.dateFrom).toBe(new Date(2030, 4, 3).toISOString());
    expect(range.dateTo).toBe(new Date(2030, 4, 4, 23, 59, 59, 999).toISOString());
  });
});
