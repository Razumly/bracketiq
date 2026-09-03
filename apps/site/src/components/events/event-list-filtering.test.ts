import { act, renderHook } from '@testing-library/react';

import type { Event } from '@/types';
import {
  filterLoadedEvents,
  useEventListFiltering,
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
  it('filters the loaded cache without waiting for a server request', () => {
    const events = [
      makeEvent({ $id: 'basketball', name: 'Basketball night' }),
      makeEvent({ $id: 'soccer', name: 'Soccer night', sport: { $id: 'sport-2', name: 'Soccer' } as Event['sport'] }),
    ];

    expect(filterLoadedEvents(events, { ...filters, searchTerm: 'basketball' })).toEqual([events[0]]);
    expect(filterLoadedEvents(events, { ...filters, selectedSports: ['Soccer'] })).toEqual([events[1]]);
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
});
