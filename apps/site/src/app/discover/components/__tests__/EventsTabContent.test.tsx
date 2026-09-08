import { createRef, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Event } from '@/types';
import { createSport } from '@/types/defaults';
import { trackEventClicked } from '@/lib/analytics/eventAnalytics';
import { buildEvent } from '../../../../../test/factories';
import EventsTabContent, { type EventSortValue } from '../EventsTabContent';

jest.mock('@/components/location/LocationSearch', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/analytics/eventAnalytics', () => ({ trackEventClicked: jest.fn() }));
jest.mock('@/components/ui/EventCard', () => ({
  __esModule: true,
  default: ({ event, onClick }: { event: Event; onClick: () => void }) => (
    <button data-testid="event-card" onClick={onClick}>{event.name}</button>
  ),
}));

type Props = ComponentProps<typeof EventsTabContent>;
const basketball = createSport({ $id: 'basketball', name: 'Basketball' });
const volleyball = createSport({ $id: 'volleyball', name: 'Volleyball' });
const events = [
  buildEvent({ $id: 'late', name: 'Basketball late', eventType: 'EVENT', sport: basketball, start: '2099-09-12T18:00:00Z', price: 2000 }),
  buildEvent({ $id: 'early', name: 'Volleyball early', eventType: 'EVENT', sport: volleyball, start: '2099-09-10T18:00:00Z', price: 1000 }),
  buildEvent({ $id: 'middle', name: 'Basketball middle', eventType: 'EVENT', sport: basketball, start: '2099-09-11T18:00:00Z', price: 1500 }),
];

function Harness(overrides: Partial<Props>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const [selectedEventTypes, setSelectedEventTypes] = useState(['EVENT']);
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  return (
    <EventsTabContent
      location={null} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
      selectedEventTypes={selectedEventTypes} setSelectedEventTypes={setSelectedEventTypes} eventTypeOptions={['EVENT']}
      selectedSports={selectedSports} setSelectedSports={setSelectedSports}
      selectedTags={selectedTags} setSelectedTags={setSelectedTags}
      maxDistance={maxDistance} setMaxDistance={setMaxDistance}
      selectedStartDate={selectedStartDate} setSelectedStartDate={setSelectedStartDate}
      selectedEndDate={selectedEndDate} setSelectedEndDate={setSelectedEndDate}
      sports={['Basketball', 'Volleyball']} sportsLoading={false} sportsError={null}
      defaultMaxDistance={50} kmBetween={() => 0} events={events} totalEvents={37}
      isLoadingInitial={false} isLoadingMore={false} hasMoreEvents={false}
      sentinelRef={createRef<HTMLDivElement>()} eventsError={null}
      onEventClick={jest.fn()} onCreateEvent={jest.fn()} {...overrides}
    />
  );
}
function wrapper({ children }: PropsWithChildren) {
  return <MantineProvider env="test">{children}</MantineProvider>;
}
function cardNames() {
  return screen.queryAllByTestId('event-card').map((card) => card.textContent);
}

it('sorts Weekly cards by the next occurrence instead of the season start', () => {
  const weekly = buildEvent({
    $id: 'weekly-season', name: 'Weekly season', eventType: 'WEEKLY_EVENT',
    start: '2099-06-01T18:00:00Z',
    nextOccurrence: { slotId: 'weekly-slot', occurrenceDate: '2099-09-16', start: '2099-09-16T18:00:00Z', end: '2099-09-16T20:00:00Z' },
  });
  const earlier = buildEvent({ $id: 'earlier', name: 'Earlier event', start: '2099-09-10T18:00:00Z' });
  render(<Harness events={[weekly, earlier]} selectedEventTypes={['EVENT', 'WEEKLY_EVENT']} defaultSort="soonest" />, { wrapper });
  expect(cardNames()).toEqual(['Earlier event', 'Weekly season']);
});
const originalFetch = globalThis.fetch;
beforeEach(() => {
  jest.resetAllMocks();
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true, json: async () => ({ genders: [], ages: [], sportSkills: [] }),
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('blocks event creation until the caller enables it', async () => {
  const user = userEvent.setup();
  const onCreateEvent = jest.fn();
  const view = render(<Harness createEventDisabled onCreateEvent={onCreateEvent}
    createEventHelperText="Create a field for this organization before creating an event." />, { wrapper });
  await user.click(screen.getByRole('button', { name: 'Create event' }));
  expect(onCreateEvent).not.toHaveBeenCalled();
  expect(screen.getByText('Create a field for this organization before creating an event.')).toBeInTheDocument();
  view.rerender(<Harness createEventDisabled={false} onCreateEvent={onCreateEvent} />);
  await user.click(screen.getByRole('button', { name: 'Create event' }));
  expect(onCreateEvent).toHaveBeenCalledTimes(1);
});

it('filters the complete cache locally, updates counts, removes chips, and opens the selected event', async () => {
  jest.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const onFilterChange = jest.fn();
  const onEventClick = jest.fn();
  render(<Harness onFilterChange={onFilterChange} onEventClick={onEventClick} />, { wrapper });
  expect(screen.getByText('37 events available.')).toBeInTheDocument();
  await user.click(screen.getByLabelText('Basketball'));
  expect(cardNames()).toEqual(['Basketball late', 'Basketball middle']);
  expect(screen.getByText('2 events available.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Basketball' }));
  expect(cardNames()).toHaveLength(3);
  await user.type(screen.getByRole('textbox', { name: 'Search', exact: true }), 'middle');
  expect(cardNames()).toEqual(['Basketball middle']);
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(onFilterChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Basketball middle' }));
  expect(onEventClick).toHaveBeenCalledWith(events[2]);
  expect(trackEventClicked).toHaveBeenCalledWith(events[2], 'discover_events');
  await user.click(screen.getByRole('button', { name: 'Search: middle' }));
  expect(cardNames()).toHaveLength(3);
});

it.each(['Soonest', 'Price (Low to High)'])('sorts cached cards by %s without fetching', async (label) => {
  const user = userEvent.setup();
  const onFilterChange = jest.fn();
  render(<Harness onFilterChange={onFilterChange} />, { wrapper });
  await user.click(screen.getByRole('textbox', { name: 'Sort events' }));
  await user.click(screen.getByRole('option', { name: label }));
  expect(cardNames()).toEqual(['Volleyball early', 'Basketball middle', 'Basketball late']);
  expect(onFilterChange).not.toHaveBeenCalled();
});

it('delegates a controlled sort and waits for the caller value', async () => {
  const user = userEvent.setup();
  const onEventSortChange = jest.fn<void, [EventSortValue]>();
  const view = render(<Harness eventSort="recommended" onEventSortChange={onEventSortChange} />, { wrapper });
  await user.click(screen.getByRole('textbox', { name: 'Sort events' }));
  await user.click(screen.getByRole('option', { name: 'Soonest' }));
  expect(onEventSortChange).toHaveBeenCalledWith('soonest');
  expect(cardNames()[0]).toBe('Basketball late');
  view.rerender(<Harness eventSort="soonest" onEventSortChange={onEventSortChange} />);
  expect(cardNames()[0]).toBe('Volleyball early');
});

it('keeps filters and cached results while a partial-cache refresh fails', async () => {
  jest.useFakeTimers();
  let reject!: (error: Error) => void;
  const onFilterChange = jest.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  render(<Harness hasMoreEvents onFilterChange={onFilterChange} />, { wrapper });
  const input = screen.getByRole('textbox', { name: 'Search', exact: true });
  await user.type(input, 'Basketball');
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(onFilterChange).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Updating events…')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Search', exact: true })).toBe(input);
  expect(input).toHaveFocus();
  expect(cardNames()).toEqual(['Basketball late', 'Basketball middle']);
  await act(async () => { reject(new Error('Events are unavailable')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Events are unavailable');
  expect(input).toHaveValue('Basketball');
  expect(cardNames()).toHaveLength(2);
  expect(screen.queryByText('Updating events…')).not.toBeInTheDocument();
});

it('retains filters during initial loading and applies them when events arrive', async () => {
  const user = userEvent.setup();
  const view = render(<Harness isLoadingInitial events={[]} />, { wrapper });
  const input = screen.getByRole('textbox', { name: 'Search', exact: true });
  await user.type(input, 'middle');
  expect(cardNames()).toHaveLength(0);
  view.rerender(<Harness isLoadingInitial={false} />);
  await waitFor(() => expect(cardNames()).toEqual(['Basketball middle']));
  expect(screen.getByRole('textbox', { name: 'Search', exact: true })).toBe(input);
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(cardNames()).toHaveLength(3);
});
