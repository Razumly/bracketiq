import { hasEventListFilters, matchesEventSearch } from "@/components/events/event-list-filtering";
import { eventService, type EventFilters } from "@/lib/eventService";
import type { Event, Field } from "@/types";

export const ORGANIZATION_EVENTS_LIMIT = 18;
export const ORGANIZATION_EVENTS_DEFAULT_MAX_DISTANCE = 50;
const HOSTED_EVENT_TYPES = [
  "EVENT",
  "TOURNAMENT",
  "LEAGUE",
  "WEEKLY_EVENT",
] as const;
export const ORGANIZATION_EVENT_TYPES = [
  ...HOSTED_EVENT_TYPES,
  "RENTAL",
] as const;
export type OrganizationEventTypeFilter =
  (typeof ORGANIZATION_EVENT_TYPES)[number];
type Coordinates = { lat: number; lng: number };

export type OrganizationEventFilters = {
  searchTerm: string;
  selectedEventTypes: OrganizationEventTypeFilter[];
  selectedSports: string[];
  selectedStartDate: Date | null;
  selectedEndDate: Date | null;
  location: Coordinates | null;
  maxDistance: number | null;
};

export type OrganizationEventQuery = {
  filters: EventFilters;
  includesHosted: boolean;
  includesRentals: boolean;
  hasScopedEventCache: boolean;
};

export function kmBetween(a: Coordinates, b: Coordinates): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const latitude = Math.sin(toRad(b.lat - a.lat) / 2);
  const longitude = Math.sin(toRad(b.lng - a.lng) / 2);
  return (
    6371 *
    2 *
    Math.asin(
      Math.sqrt(
        latitude * latitude +
          Math.cos(toRad(a.lat)) *
            Math.cos(toRad(b.lat)) *
            longitude *
            longitude,
      ),
    )
  );
}

function validDate(value: Date | null): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value
    : null;
}

function dayBoundary(date: Date, end = false): string {
  const result = new Date(date);
  if (end) result.setHours(23, 59, 59, 999);
  else result.setHours(0, 0, 0, 0);
  return result.toISOString();
}

function dateRange(start: Date | null, end: Date | null, now: Date) {
  const today = new Date(dayBoundary(now));
  const validEnd = validDate(end);
  const defaultStart = validEnd && validEnd < today ? validEnd : today;
  return {
    dateFrom: dayBoundary(validDate(start) ?? defaultStart),
    dateTo: validEnd ? dayBoundary(validEnd, true) : undefined,
  };
}

export function buildOrganizationEventQuery(
  organizationId: string,
  controls: OrganizationEventFilters,
  now = new Date(),
): OrganizationEventQuery {
  const hostedTypes = controls.selectedEventTypes.filter(
    (value): value is (typeof HOSTED_EVENT_TYPES)[number] => value !== "RENTAL",
  );
  const filters: EventFilters = {
    organizationId: organizationId.trim() || undefined,
    includeWeeklyChildren: true,
    eventTypes:
      hostedTypes.length === HOSTED_EVENT_TYPES.length
        ? undefined
        : hostedTypes,
    sports: controls.selectedSports.length
      ? controls.selectedSports
      : undefined,
    userLocation: controls.location ?? undefined,
    maxDistance: controls.location
      ? (controls.maxDistance ?? undefined)
      : undefined,
    query: controls.searchTerm.trim() || undefined,
    ...dateRange(controls.selectedStartDate, controls.selectedEndDate, now),
  };
  return {
    filters,
    includesHosted: hostedTypes.length > 0,
    includesRentals: controls.selectedEventTypes.includes("RENTAL"),
    hasScopedEventCache: hasEventListFilters({
      ...controls,
      eventTypeOptions: ORGANIZATION_EVENT_TYPES,
      hideWeeklyChildren: false,
    }),
  };
}

const normalize = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function matchesRentalDistance(event: Event, filters: EventFilters): boolean {
  if (!filters.userLocation || typeof filters.maxDistance !== "number")
    return true;
  if (!Array.isArray(event.coordinates) || event.coordinates.length < 2)
    return true;
  const [lng, lat] = event.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  return kmBetween(filters.userLocation, { lat, lng }) <= filters.maxDistance;
}

function filterRentals(events: Event[], filters: EventFilters): Event[] {
  const query = normalize(filters.query);
  const sports = new Set((filters.sports ?? []).map(normalize).filter(Boolean));
  return events.filter(
    (event) =>
      matchesEventSearch(event, query) &&
      (!sports.size || sports.has(normalize(event.sport?.name))) &&
      matchesRentalDistance(event, filters),
  );
}

function mergeFieldEvents(
  results: PromiseSettledResult<Event[]>[],
  organizationId: string,
): Event[] {
  const events = new Map<string, Event>();
  for (const result of results) {
    if (result.status === "rejected") {
      throw new Error("Failed to load field events for organization rentals");
    }
    for (const event of result.value) {
      const eventId = event.$id?.trim();
      if (eventId && event.organizationId?.trim() !== organizationId)
        events.set(eventId, event);
    }
  }
  return [...events.values()];
}

async function readRentalEvents(
  query: OrganizationEventQuery,
  fields: readonly Pick<Field, "$id">[],
): Promise<Event[]> {
  if (!query.includesRentals) return [];
  const fieldIds = [
    ...new Set(fields.map((field) => field.$id.trim()).filter(Boolean)),
  ];
  const {
    organizationId = "",
    dateFrom = new Date().toISOString(),
    dateTo,
  } = query.filters;
  const results = await Promise.allSettled(
    fieldIds.map((fieldId) =>
      eventService.getEventsForFieldInRange(fieldId, dateFrom, dateTo ?? null),
    ),
  );
  return filterRentals(
    mergeFieldEvents(results, organizationId),
    query.filters,
  );
}

export async function readOrganizationHostedEvents(
  query: OrganizationEventQuery,
  offset: number,
): Promise<Event[]> {
  if (!query.includesHosted) return [];
  return eventService.getEventsPaginated(
    query.filters,
    ORGANIZATION_EVENTS_LIMIT,
    offset,
    "SOONEST",
  );
}

export async function readOrganizationEventCache(
  query: OrganizationEventQuery,
  fields: readonly Pick<Field, "$id">[],
) {
  const [hostedEvents, rentalEvents] = await Promise.all([
    readOrganizationHostedEvents(query, 0),
    readRentalEvents(query, fields),
  ]);
  return {
    events: [...hostedEvents, ...rentalEvents],
    offset: hostedEvents.length,
    rentalEventIds: rentalEvents.map((event) => event.$id),
    hasMoreEvents:
      query.includesHosted && hostedEvents.length === ORGANIZATION_EVENTS_LIMIT,
    hasScopedEventCache: query.hasScopedEventCache,
    cacheStartDate: query.filters.dateFrom,
  };
}

export function visibleOrganizationEvents(
  events: Event[],
  hiddenEventIds: readonly string[],
): Event[] {
  const seen = new Set(hiddenEventIds);
  return events.filter((event) => {
    if (seen.has(event.$id)) return false;
    seen.add(event.$id);
    return true;
  });
}
