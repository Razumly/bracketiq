import { act, renderHook } from '@testing-library/react';

import type { Event } from '@/types';
import {
  filterLoadedEvents,
  eventListFilterKey,
  useEventListFiltering,
  hasEventListFilters,
  type EventListFilterState,
} from './event-list-filtering';

const baseEvent: Event = {
  $id: 'event-1',
  name: 'Open gym',
  description: '',
  start: '2026-09-10T18:00:00.000Z',
  end: '2026-09-10T20:00:00.000Z',
  location: 'Austin, TX',
  coordinates: [-97.7431, 30.2672],
  price: 0,
  imageId: null,
  hostId: null,
  state: 'PUBLISHED',
  maxParticipants: 20,
  teamSizeLimit: 2,
  teamSignup: false,
  singleDivision: false,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: null,
  registrationCutoffHours: null,
  seedColor: 0,
  $createdAt: '2026-08-01T00:00:00.000Z',
  $updatedAt: '2026-08-01T00:00:00.000Z',
  eventType: 'EVENT',
  sport: { $id: 'sport-1', name: 'Basketball' } as Event['sport'],
  sportIds: ['sport-1'],
  divisions: [],
  attendees: 0,
};

const makeEvent = (overrides: Partial<Event>): Event => ({ ...baseEvent, ...overrides });

const filters: EventListFilterState = {
  searchTerm: '',
  selectedEventTypes: ['EVENT', 'TOURNAMENT'],
  eventTypeOptions: ['EVENT', 'TOURNAMENT'],
  selectedSports: [],
  selectedTags: [],
  selectedStartDate: null,
  selectedEndDate: null,
  location: null,
  maxDistance: null,
  hideWeeklyChildren: false,
};

describe('event list filtering', () => {
  it('returns to local filtering after the full unfiltered cache is restored', async () => {
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ filterKey, hasMoreEvents, hasScopedEventCache, events }) => useEventListFiltering({
      events, filters, filterKey, hasMoreEvents, hasScopedEventCache, onFilterChange, debounceMs: 0,
    }), { initialProps: { filterKey: 'all', hasMoreEvents: true, hasScopedEventCache: false, events: [] as Event[] } });
    const page = [] as Event[];
    rerender({ filterKey: 'basketball', hasMoreEvents: true, hasScopedEventCache: false, events: page });
    await act(async () => { await Promise.resolve(); });
    rerender({ filterKey: 'basketball', hasMoreEvents: false, hasScopedEventCache: true, events: page });
    rerender({ filterKey: 'all', hasMoreEvents: false, hasScopedEventCache: true, events: page });
    await act(async () => { await Promise.resolve(); });
    const fullCache = [] as Event[];
    rerender({ filterKey: 'all', hasMoreEvents: false, hasScopedEventCache: false, events: fullCache });
    rerender({ filterKey: 'soccer', hasMoreEvents: false, hasScopedEventCache: false, events: fullCache });
    await act(async () => { await Promise.resolve(); });
    expect(onFilterChange).toHaveBeenCalledTimes(2);
  });

  it('fetches when a date filter expands an otherwise complete cache into the past', async () => {
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ selectedStartDate }: { selectedStartDate: Date | null }) => {
      const activeFilters = { ...filters, selectedStartDate };
      return useEventListFiltering({
        events: [], filters: activeFilters, filterKey: eventListFilterKey(activeFilters),
        hasMoreEvents: false, cacheStartDate: new Date(2026, 8, 4).toISOString(),
        onFilterChange, debounceMs: 0,
      });
    }, { initialProps: { selectedStartDate: null as Date | null } });
    rerender({ selectedStartDate: new Date(2026, 8, 1) });
    await act(async () => { await Promise.resolve(); });
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('refreshes a complete cache when a future date changes recurring occurrences', async () => {
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ selectedStartDate }: { selectedStartDate: Date | null }) => {
      const activeFilters = { ...filters, selectedStartDate };
      return useEventListFiltering({
        events: [], filters: activeFilters, filterKey: eventListFilterKey(activeFilters),
        hasMoreEvents: false, hasScopedEventCache: false,
        cacheStartDate: new Date(2026, 8, 4).toISOString(),
        onFilterChange, debounceMs: 0,
      });
    }, { initialProps: { selectedStartDate: null as Date | null } });
    rerender({ selectedStartDate: new Date(2026, 8, 20) });
    await act(async () => { await Promise.resolve(); });
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('refreshes a complete cache when division filters need authoritative eligibility', async () => {
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ gender }: { gender: string | null }) => {
      const activeFilters = {
        ...filters,
        divisionFilters: gender ? { genders: [gender] } : undefined,
      };
      return useEventListFiltering({
        events: [], filters: activeFilters, filterKey: eventListFilterKey(activeFilters),
        hasMoreEvents: false, hasScopedEventCache: false, onFilterChange, debounceMs: 0,
      });
    }, { initialProps: { gender: null } });
    rerender({ gender: 'F' });
    await act(async () => { await Promise.resolve(); });
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });


  it('keeps rental classification without changing the event type', () => {
    const rental = makeEvent({ $id: 'rental', eventType: 'EVENT' });
    const hosted = makeEvent({ $id: 'hosted', eventType: 'EVENT' });
    const rentalFilters = { ...filters, selectedEventTypes: ['RENTAL'], eventTypeOptions: ['EVENT', 'RENTAL'], rentalEventIds: ['rental'] };
    expect(filterLoadedEvents([rental, hosted], rentalFilters)).toEqual([rental]);
    expect(rental.eventType).toBe('EVENT');
  });

  it('records a constrained query scope and refreshes after the filter UI remounts', async () => {
    expect(hasEventListFilters(filters)).toBe(false);
    const scopedFilters = { ...filters, searchTerm: 'Basketball' };
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ filterKey }) => useEventListFiltering({
      events: [], filters, filterKey, hasMoreEvents: false,
      hasScopedEventCache: hasEventListFilters(scopedFilters), onFilterChange, debounceMs: 0,
    }), { initialProps: { filterKey: 'basketball' } });
    rerender({ filterKey: 'all' });
    await act(async () => { await Promise.resolve(); });
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('reports a failed refresh and releases its loading state', async () => {
    const { rerender, result } = renderHook(({ filterKey }) => useEventListFiltering({
      events: [], filters, filterKey, hasMoreEvents: true,
      onFilterChange: async () => { throw new Error('Events are unavailable'); }, debounceMs: 0,
    }), { initialProps: { filterKey: 'all' } });
    rerender({ filterKey: 'basketball' });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.refreshError).toBe('Events are unavailable');
    expect(result.current.isRefreshing).toBe(false);
  });

  it('matches weekly events by the next displayed occurrence and falls back to the event start', () => {
    const weeklyInsideRange = makeEvent({
      $id: 'weekly-inside', eventType: 'WEEKLY_EVENT', start: '2026-06-01T18:00:00Z',
      nextOccurrence: {
        slotId: 'weekly-slot', occurrenceDate: '2026-09-16',
        start: '2026-09-16T18:00:00Z', end: '2026-09-16T20:00:00Z',
      },
    });
    const weeklyOutsideRange = makeEvent({
      $id: 'weekly-outside', eventType: 'WEEKLY_EVENT', start: '2026-09-12T18:00:00Z',
      nextOccurrence: {
        slotId: 'later-slot', occurrenceDate: '2026-10-01',
        start: '2026-10-01T18:00:00Z', end: '2026-10-01T20:00:00Z',
      },
    });
    const oneTime = makeEvent({ $id: 'one-time', start: '2026-09-12T18:00:00Z' });
    const earlier = makeEvent({ $id: 'earlier', start: '2026-09-01T18:00:00Z' });

    expect(filterLoadedEvents([weeklyInsideRange, weeklyOutsideRange, oneTime, earlier], {
      ...filters, selectedStartDate: new Date(2026, 8, 10), selectedEndDate: new Date(2026, 8, 16),
    })).toEqual([weeklyInsideRange, oneTime]);
  });

  it('filters the loaded cache without waiting for a server request', () => {
    const events = [
      makeEvent({ $id: 'basketball', name: 'Basketball night' }),
      makeEvent({ $id: 'soccer', name: 'Soccer night', sport: { $id: 'sport-2', name: 'Soccer' } as Event['sport'] }),
    ];

    expect(filterLoadedEvents(events, { ...filters, searchTerm: 'basketball' })).toEqual([events[0]]);
    expect(filterLoadedEvents(events, { ...filters, selectedSports: ['Soccer'] })).toEqual([events[1]]);
  });

  it('keeps server-searchable event and organization fields in the local cache', () => {
    const searchableEvent = makeEvent({
      sourceUrl: 'https://example.com/tuesday',
      scheduleText: 'Tuesday evening league',
      priceText: '$25 per player',
      statusText: 'Registration opens soon',
      organization: {
        $id: 'org-1',
        name: 'Harbor Sports',
        location: 'Austin, TX',
        address: '1 Harbor Way',
        description: 'Community sports programs',
      } as Event['organization'],
    });

    ['example.com', 'tuesday', '$25', 'opens soon', 'Harbor Sports'].forEach((searchTerm) => {
      expect(filterLoadedEvents([searchableEvent], { ...filters, searchTerm })).toEqual([searchableEvent]);
    });
  });

  it('matches server end-date boundaries for ordinary events and weekly parents', () => {
    const spanningEvent = makeEvent({
      $id: 'spanning',
      start: '2026-09-12T18:00:00.000Z',
      end: '2026-09-14T20:00:00.000Z',
    });
    const weeklyParent = makeEvent({
      $id: 'weekly-parent',
      eventType: 'WEEKLY_EVENT',
      start: '2026-09-01T18:00:00.000Z',
      end: '2026-09-30T20:00:00.000Z',
      nextOccurrence: {
        slotId: 'weekly-slot',
        occurrenceDate: '2026-09-20',
        start: '2026-09-20T18:00:00.000Z',
        end: '2026-09-20T20:00:00.000Z',
      },
    });

    expect(filterLoadedEvents([spanningEvent, weeklyParent], {
      ...filters,
      selectedEndDate: new Date(2026, 8, 13),
    })).toEqual([weeklyParent]);
  });

  it('matches only active entry divisions for division filters', () => {
    const activeEntry = {
      id: 'active-entry',
      name: 'Women Open',
      kind: 'LEAGUE',
      role: 'ENTRY',
      status: 'ACTIVE',
      gender: 'F',
      price: 1500,
    } as NonNullable<Event['divisionDetails']>[number];
    const inactiveEntry = { ...activeEntry, id: 'inactive-entry', status: 'INACTIVE' } as NonNullable<Event['divisionDetails']>[number];
    const phaseDivision = { ...activeEntry, id: 'phase-division', role: 'PHASE' } as NonNullable<Event['divisionDetails']>[number];
    const divisionFilters = { genders: ['F'] };
    const noDivisions = makeEvent({ $id: 'no-divisions' });
    const eligible = makeEvent({ $id: 'eligible', divisionDetails: [activeEntry] });
    const inactive = makeEvent({ $id: 'inactive', divisionDetails: [inactiveEntry] });
    const phase = makeEvent({ $id: 'phase', divisionDetails: [phaseDivision] });

    expect(filterLoadedEvents([noDivisions, eligible, inactive, phase], {
      ...filters,
      divisionFilters,
    })).toEqual([eligible]);
  });

  it('includes the user location in the refresh key', () => {
    const firstKey = eventListFilterKey({ ...filters, location: { lat: 30.2672, lng: -97.7431 } });
    const secondKey = eventListFilterKey({ ...filters, location: { lat: 31.2672, lng: -97.7431 } });

    expect(firstKey).not.toBe(secondKey);
  });

  it('refreshes in the background when more pages are available', async () => {
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ filterKey, hasMoreEvents }) => useEventListFiltering({
        events: [],
        filters,
        filterKey,
        hasMoreEvents,
        onFilterChange,
        debounceMs: 0,
      }),
      { initialProps: { filterKey: 'all', hasMoreEvents: true } },
    );

    rerender({ filterKey: 'basketball', hasMoreEvents: true });

    await act(async () => {
      await Promise.resolve();
    });
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when the loaded cache is complete', async () => {
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ filterKey, hasMoreEvents }) => useEventListFiltering({
        events: [],
        filters,
        filterKey,
        hasMoreEvents,
        onFilterChange,
        debounceMs: 0,
      }),
      { initialProps: { filterKey: 'all', hasMoreEvents: false } },
    );

    rerender({ filterKey: 'basketball', hasMoreEvents: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('reloads after clearing a server filter even when that filtered page is complete', async () => {
    const onFilterChange = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ filterKey, hasMoreEvents }) => useEventListFiltering({
        events: [], filters, filterKey, hasMoreEvents, onFilterChange, debounceMs: 0,
      }),
      { initialProps: { filterKey: 'all', hasMoreEvents: true } },
    );
    rerender({ filterKey: 'basketball', hasMoreEvents: true });
    await act(async () => { await Promise.resolve(); });
    rerender({ filterKey: 'basketball', hasMoreEvents: false });
    rerender({ filterKey: 'all', hasMoreEvents: false });
    await act(async () => { await Promise.resolve(); });
    expect(onFilterChange).toHaveBeenCalledTimes(2);
  });

  it('does not cancel a pending refresh when the caller renders with a new callback', async () => {
    jest.useFakeTimers();
    const refresh = jest.fn().mockResolvedValue(undefined);
    try {
      const { rerender } = renderHook(({ filterKey }) => useEventListFiltering({
        events: [], filters, filterKey, hasMoreEvents: true, onFilterChange: () => refresh(),
      }), { initialProps: { filterKey: 'all' } });
      rerender({ filterKey: 'basketball' });
      rerender({ filterKey: 'basketball' });
      await act(async () => { jest.advanceTimersByTime(250); });
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
