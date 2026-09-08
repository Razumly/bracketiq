'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Event } from '@/types';

export type EventDivisionFilterState = {
  genders?: string[];
  skillDivisionTypeIds?: string[];
  ageDivisionTypeIds?: string[];
  priceMinDollars?: number | null;
  priceMaxDollars?: number | null;
};

export type EventListFilterState<TEventType extends string = string> = {
  searchTerm: string;
  selectedEventTypes: readonly TEventType[];
  eventTypeOptions: readonly TEventType[];
  selectedSports: readonly string[];
  selectedTags?: readonly string[];
  selectedStartDate: Date | null;
  selectedEndDate: Date | null;
  location: { lat: number; lng: number } | null;
  maxDistance: number | null;
  hideWeeklyChildren: boolean;
  divisionFilters?: EventDivisionFilterState;
  getEventDistanceKm?: (event: Event) => number | undefined;
  rentalEventIds?: readonly string[];
};

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const startOfDay = (value: Date): number => new Date(
  value.getFullYear(),
  value.getMonth(),
  value.getDate(),
  0,
  0,
  0,
  0,
).getTime();

const endOfDay = (value: Date): number => new Date(
  value.getFullYear(),
  value.getMonth(),
  value.getDate(),
  23,
  59,
  59,
  999,
).getTime();

function expandsCacheStart(cacheStartDate: string | undefined, requestedDate: Date | null): boolean {
  if (!cacheStartDate || !requestedDate) return false;
  return startOfDay(requestedDate) < new Date(cacheStartDate).getTime();
}

const getDivisionDetails = (event: Event): Array<Record<string, unknown>> => (
  (event.divisionDetails ?? event.divisions ?? [])
    .filter((division) => Boolean(division && typeof division === 'object'))
    .map((division) => division as unknown as Record<string, unknown>)
);

const hasDivisionFilters = (filters: EventDivisionFilterState): boolean => Boolean(
  filters.genders?.length
    || filters.skillDivisionTypeIds?.length
    || filters.ageDivisionTypeIds?.length
    || filters.priceMinDollars !== null && filters.priceMinDollars !== undefined
    || filters.priceMaxDollars !== null && filters.priceMaxDollars !== undefined,
);

const matchesDivisionPrice = (priceCents: number, filters: EventDivisionFilterState): boolean => {
  const aboveMinimum = filters.priceMinDollars === null || filters.priceMinDollars === undefined
    || !Number.isFinite(priceCents) || priceCents >= filters.priceMinDollars * 100;
  const belowMaximum = filters.priceMaxDollars === null || filters.priceMaxDollars === undefined
    || !Number.isFinite(priceCents) || priceCents <= filters.priceMaxDollars * 100;
  return aboveMinimum && belowMaximum;
};

const matchesDivisionDetail = (
  division: Record<string, unknown>,
  filters: EventDivisionFilterState,
  selectedGenders: Set<string>,
  selectedSkillIds: Set<string>,
  selectedAgeIds: Set<string>,
): boolean => {
  const genderMatches = !selectedGenders.size || selectedGenders.has(normalize(division.gender));
  const skillMatches = !selectedSkillIds.size || selectedSkillIds.has(normalize(division.skillDivisionTypeId));
  const ageMatches = !selectedAgeIds.size || selectedAgeIds.has(normalize(division.ageDivisionTypeId));
  return genderMatches && skillMatches && ageMatches && matchesDivisionPrice(Number(division.price), filters);
};

const matchesDivisionFilters = (event: Event, filters?: EventDivisionFilterState): boolean => {
  if (!filters || !hasDivisionFilters(filters)) return true;
  const details = getDivisionDetails(event);
  if (!details.length) return true;
  const selectedGenders = new Set((filters.genders ?? []).map(normalize));
  const selectedSkillIds = new Set((filters.skillDivisionTypeIds ?? []).map(normalize));
  const selectedAgeIds = new Set((filters.ageDivisionTypeIds ?? []).map(normalize));
  return details.some((division) => matchesDivisionDetail(division, filters, selectedGenders, selectedSkillIds, selectedAgeIds));
};

export const matchesEventSearch = (event: Event, searchTerm: string): boolean => {
  const query = normalize(searchTerm);
  if (!query) return true;
  const searchableText = [event.name, event.description, event.location, event.address, event.organizerName]
    .filter(Boolean)
    .map(normalize)
    .join(' ');
  return searchableText.includes(query);
};

const matchesEventType = <TEventType extends string>(event: Event, filters: EventListFilterState<TEventType>): boolean => {
  const eventType = filters.rentalEventIds?.includes(event.$id) ? 'RENTAL' : event.eventType;
  return filters.selectedEventTypes.length === filters.eventTypeOptions.length
    || filters.selectedEventTypes.includes(eventType as TEventType);
};

const matchesSport = (event: Event, selectedSports: readonly string[]): boolean => {
  if (!selectedSports.length) return true;
  const sportKeys = new Set([
    normalize(event.sport?.name),
    normalize(event.sport?.$id),
    ...event.sportIds.map(normalize),
  ]);
  return selectedSports.some((sport) => sportKeys.has(normalize(sport)));
};

const matchesTags = (event: Event, selectedTags?: readonly string[]): boolean => {
  if (!selectedTags?.length) return true;
  const eventTags = new Set(event.tags?.flatMap((tag) => [normalize(tag.name), normalize(tag.slug)]) ?? []);
  return selectedTags.some((tag) => eventTags.has(normalize(tag)));
};

const matchesDateRange = (event: Event, startDate: Date | null, endDate: Date | null): boolean => {
  const eventStart = new Date(event.start).getTime();
  const startsAfterMinimum = !startDate || !Number.isFinite(eventStart) || eventStart >= startOfDay(startDate);
  const startsBeforeMaximum = !endDate || !Number.isFinite(eventStart) || eventStart <= endOfDay(endDate);
  return startsAfterMinimum && startsBeforeMaximum;
};

const matchesDistance = (event: Event, filters: EventListFilterState): boolean => {
  if (!filters.location || typeof filters.maxDistance !== 'number' || !filters.getEventDistanceKm) return true;
  const distance = filters.getEventDistanceKm(event);
  return typeof distance !== 'number' || distance <= filters.maxDistance;
};

export const eventMatchesLocalFilters = <TEventType extends string>(
  event: Event,
  filters: EventListFilterState<TEventType>,
): boolean => {
  const isVisibleWeeklyEvent = !filters.hideWeeklyChildren
    || event.eventType !== 'WEEKLY_EVENT'
    || !event.parentEvent?.trim();
  return [
    matchesEventSearch(event, filters.searchTerm),
    matchesEventType(event, filters),
    matchesSport(event, filters.selectedSports),
    matchesTags(event, filters.selectedTags),
    matchesDateRange(event, filters.selectedStartDate, filters.selectedEndDate),
    matchesDistance(event, filters),
    isVisibleWeeklyEvent,
    matchesDivisionFilters(event, filters.divisionFilters),
  ].every(Boolean);
};

export const filterLoadedEvents = <TEventType extends string>(
  events: Event[],
  filters: EventListFilterState<TEventType>,
): Event[] => events.filter((event) => eventMatchesLocalFilters(event, filters));

export function hasEventListFilters(filters: EventListFilterState): boolean {
  const hasBasicFilters = [
    filters.searchTerm.trim(), filters.selectedSports.length, filters.selectedTags?.length,
    filters.selectedStartDate, filters.selectedEndDate,
    filters.selectedEventTypes.length !== filters.eventTypeOptions.length,
  ].some(Boolean);
  return hasBasicFilters || Boolean(filters.location && typeof filters.maxDistance === 'number')
    || hasDivisionFilters(filters.divisionFilters ?? {});
}

export const eventListFilterKey = <TEventType extends string>(filters: EventListFilterState<TEventType>): string => JSON.stringify({
  searchTerm: filters.searchTerm.trim(),
  selectedEventTypes: [...filters.selectedEventTypes].sort(),
  selectedSports: [...filters.selectedSports].sort(),
  selectedTags: [...(filters.selectedTags ?? [])].sort(),
  selectedStartDate: filters.selectedStartDate?.toISOString() ?? null,
  selectedEndDate: filters.selectedEndDate?.toISOString() ?? null,
  location: filters.location
    ? { lat: filters.location.lat, lng: filters.location.lng }
    : null,
  maxDistance: filters.maxDistance,
  hideWeeklyChildren: filters.hideWeeklyChildren,
  divisionFilters: filters.divisionFilters ?? null,
});

export type UseEventListFilteringOptions<TEventType extends string = string> = {
  events: Event[];
  filters: EventListFilterState<TEventType>;
  filterKey: string;
  hasMoreEvents: boolean;
  hasScopedEventCache?: boolean;
  cacheStartDate?: string;
  onFilterChange?: () => Promise<void> | void;
  debounceMs?: number;
};

export function useEventListFiltering<TEventType extends string>({
  events,
  filters,
  filterKey,
  hasMoreEvents,
  hasScopedEventCache,
  cacheStartDate,
  onFilterChange,
  debounceMs = 250,
}: UseEventListFilteringOptions<TEventType>) {
  const previousFilterKey = useRef(filterKey);
  const requestedStartDate = filters.selectedStartDate ?? filters.selectedEndDate;
  const refreshOptions = useRef({ hasMoreEvents, hasScopedEventCache, cacheStartDate, requestedStartDate, onFilterChange });
  const hasServerFilteredCache = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const visibleEvents = useMemo(() => filterLoadedEvents(events, filters), [events, filters]);

  useEffect(() => {
    if (hasScopedEventCache !== undefined) hasServerFilteredCache.current = hasScopedEventCache;
  }, [events, hasScopedEventCache]);

  useEffect(() => {
    refreshOptions.current = { hasMoreEvents, hasScopedEventCache, cacheStartDate, requestedStartDate, onFilterChange };
  }, [hasMoreEvents, hasScopedEventCache, cacheStartDate, requestedStartDate, onFilterChange]);

  useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    setIsRefreshing(false);
    setRefreshError(null);
    const options = refreshOptions.current;
    if (![options.hasMoreEvents, options.hasScopedEventCache, expandsCacheStart(options.cacheStartDate, options.requestedStartDate), hasServerFilteredCache.current].some(Boolean)) return;
    if (!options.onFilterChange) return;

    let cancelled = false;
    const refresh = async () => {
      if (cancelled) return;
      // A complete filtered page is not a complete unfiltered cache.
      hasServerFilteredCache.current = true;
      setIsRefreshing(true);
      try {
        await refreshOptions.current.onFilterChange?.();
      } catch (error) {
        if (!cancelled) setRefreshError(error instanceof Error ? error.message : 'Failed to refresh events. Please try again.');
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    if (debounceMs <= 0) {
      refresh();
      return () => { cancelled = true; };
    }
    const timeoutId = window.setTimeout(refresh, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [debounceMs, filterKey]);

  return { visibleEvents, isRefreshing, refreshError };
}
