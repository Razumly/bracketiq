import { createRef } from 'react';
import { screen } from '@testing-library/react';

import EventsTabContent from '../EventsTabContent';
import type { Event } from '@/types';
import { renderWithMantine } from '../../../../../test/utils/renderWithMantine';

jest.mock('@/components/location/LocationSearch', () => ({
  __esModule: true,
  default: () => <div data-testid="location-search" />,
}));
jest.mock('@/components/ui/EventCard', () => ({
  __esModule: true,
  default: ({ event }: { event: { name: string } }) => <div data-testid="event-card">{event.name}</div>,
}));

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/Loading', () => ({
  __esModule: true,
  default: ({ text }: { text?: string }) => <div>{text ?? 'Loading...'}</div>,
}));

describe('EventsTabContent', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn(
      () => new Promise<Response>(() => undefined),
    ) as typeof fetch;
  });

  afterAll(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
  });

  it('disables organization event creation and shows the field warning', () => {
    renderWithMantine(
      <EventsTabContent
        location={null}
        searchTerm=""
        setSearchTerm={jest.fn()}
        selectedEventTypes={['EVENT', 'TOURNAMENT']}
        setSelectedEventTypes={jest.fn()}
        eventTypeOptions={['EVENT', 'TOURNAMENT'] as const}
        selectedSports={[]}
        setSelectedSports={jest.fn()}
        maxDistance={null}
        setMaxDistance={jest.fn()}
        selectedStartDate={null}
        setSelectedStartDate={jest.fn()}
        selectedEndDate={null}
        setSelectedEndDate={jest.fn()}
        sports={[]}
        sportsLoading={false}
        sportsError={null}
        defaultMaxDistance={50}
        kmBetween={jest.fn(() => 0)}
        events={[]}
        totalEvents={null}
        isLoadingInitial={false}
        isLoadingMore={false}
        hasMoreEvents={false}
        sentinelRef={createRef<HTMLDivElement>()}
        eventsError={null}
        onEventClick={jest.fn()}
        onCreateEvent={jest.fn()}
        showCreateEventButton
        createEventDisabled
        createEventHelperText="Create a field for this organization before creating an event."
      />,
    );

    expect(screen.getByRole('button', { name: 'Create event' })).toBeDisabled();
    expect(
      screen.getByText('Create a field for this organization before creating an event.'),
    ).toBeInTheDocument();
  });

  it('shows the server event total as available when distance filtering is inactive', () => {
    renderWithMantine(
      <EventsTabContent
        location={null}
        searchTerm=""
        setSearchTerm={jest.fn()}
        selectedEventTypes={['EVENT', 'TOURNAMENT']}
        setSelectedEventTypes={jest.fn()}
        eventTypeOptions={['EVENT', 'TOURNAMENT'] as const}
        selectedSports={[]}
        setSelectedSports={jest.fn()}
        maxDistance={null}
        setMaxDistance={jest.fn()}
        selectedStartDate={null}
        setSelectedStartDate={jest.fn()}
        selectedEndDate={null}
        setSelectedEndDate={jest.fn()}
        sports={[]}
        sportsLoading={false}
        sportsError={null}
        defaultMaxDistance={50}
        kmBetween={jest.fn(() => 0)}
        events={[]}
        totalEvents={37}
        isLoadingInitial={false}
        isLoadingMore={false}
        hasMoreEvents={false}
        sentinelRef={createRef<HTMLDivElement>()}
        eventsError={null}
        onEventClick={jest.fn()}
        onCreateEvent={jest.fn()}
      />,
    );

    expect(screen.getByText('37 events available.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Sort events' })).toHaveValue('Recommended');
  });

  it('shows the server event total as near you when distance filtering is active', () => {
    renderWithMantine(
      <EventsTabContent
        location={{ lat: 45.5152, lng: -122.6784 }}
        searchTerm=""
        setSearchTerm={jest.fn()}
        selectedEventTypes={['EVENT', 'TOURNAMENT']}
        setSelectedEventTypes={jest.fn()}
        eventTypeOptions={['EVENT', 'TOURNAMENT'] as const}
        selectedSports={[]}
        setSelectedSports={jest.fn()}
        maxDistance={50}
        setMaxDistance={jest.fn()}
        selectedStartDate={null}
        setSelectedStartDate={jest.fn()}
        selectedEndDate={null}
        setSelectedEndDate={jest.fn()}
        sports={[]}
        sportsLoading={false}
        sportsError={null}
        defaultMaxDistance={50}
        kmBetween={jest.fn(() => 0)}
        events={[]}
        totalEvents={12}
        isLoadingInitial={false}
        isLoadingMore={false}
        hasMoreEvents={false}
        sentinelRef={createRef<HTMLDivElement>()}
        eventsError={null}
        onEventClick={jest.fn()}
        onCreateEvent={jest.fn()}
        defaultSort="nearest"
      />,
    );

    expect(screen.getByText('12 events near you.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Sort events' })).toHaveValue('Nearest');
  });
  it('sorts Weekly cards by next occurrence metadata instead of season start', () => {
    const weeklySeason = {
      $id: 'weekly-season',
      name: 'Weekly season',
      start: '2025-06-01T18:00:00.000Z',
      nextOccurrence: {
        slotId: 'slot-weekly',
        occurrenceDate: '2026-07-16',
        start: '2026-07-16T18:00:00.000Z',
        end: '2026-07-16T20:00:00.000Z',
      },
    } as unknown as Event;
    const laterEvent = {
      $id: 'later-event',
      name: 'Later event',
      start: '2026-07-20T18:00:00.000Z',
    } as unknown as Event;

    renderWithMantine(
      <EventsTabContent
        location={null}
        searchTerm=""
        setSearchTerm={jest.fn()}
        selectedEventTypes={['EVENT', 'WEEKLY_EVENT']}
        setSelectedEventTypes={jest.fn()}
        eventTypeOptions={['EVENT', 'WEEKLY_EVENT'] as const}
        selectedSports={[]}
        setSelectedSports={jest.fn()}
        maxDistance={null}
        setMaxDistance={jest.fn()}
        selectedStartDate={null}
        setSelectedStartDate={jest.fn()}
        selectedEndDate={null}
        setSelectedEndDate={jest.fn()}
        sports={[]}
        sportsLoading={false}
        sportsError={null}
        defaultMaxDistance={50}
        kmBetween={jest.fn(() => 0)}
        events={[laterEvent, weeklySeason]}
        totalEvents={2}
        isLoadingInitial={false}
        isLoadingMore={false}
        hasMoreEvents={false}
        sentinelRef={createRef<HTMLDivElement>()}
        eventsError={null}
        onEventClick={jest.fn()}
        onCreateEvent={jest.fn()}
        defaultSort="soonest"
      />,
    );

    expect(screen.getAllByTestId('event-card').map((card) => card.textContent)).toEqual([
      'Weekly season',
      'Later event',
    ]);
  });

});
