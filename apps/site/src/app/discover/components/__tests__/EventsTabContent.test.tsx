import { createRef, useState, type ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Event } from '@/types';
import { createSport } from '@/types/defaults';
import { trackEventClicked } from '@/lib/analytics/eventAnalytics';
import { buildEvent } from '../../../../../test/factories';
import EventsTabContent, { type EventSortValue } from '../EventsTabContent';
import type { DivisionDiscoveryFilterValue } from '../DivisionDiscoveryFilters';
import { calculateVisibleFilterCount } from '../DiscoverFilterBar';

jest.mock('@/components/location/LocationSearch', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/analytics/eventAnalytics', () => ({ trackEventClicked: jest.fn() }));
jest.mock('@/components/organization/OrganizationEventCard', () => ({
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

function Harness({
  initialDivisionFilters,
  ...overrides
}: Partial<Props> & { initialDivisionFilters?: DivisionDiscoveryFilterValue }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const [selectedEventTypes, setSelectedEventTypes] = useState(['EVENT']);
  const [maxDistance, setMaxDistance] = useState<number | null>(null);
  const [divisionFilters, setDivisionFilters] = useState<DivisionDiscoveryFilterValue>(
    () => initialDivisionFilters ?? {
      genders: [],
      skillDivisionTypeIds: [],
      ageDivisionTypeIds: [],
      priceMinDollars: null,
      priceMaxDollars: null,
    },
  );
  return (
    <EventsTabContent
      location={null} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
      selectedEventTypes={selectedEventTypes} setSelectedEventTypes={setSelectedEventTypes} eventTypeOptions={['EVENT']}
      selectedSports={selectedSports} setSelectedSports={setSelectedSports}
      selectedTags={selectedTags} setSelectedTags={setSelectedTags}
      maxDistance={maxDistance} setMaxDistance={setMaxDistance}
      selectedStartDate={selectedStartDate} setSelectedStartDate={setSelectedStartDate}
      selectedEndDate={selectedEndDate} setSelectedEndDate={setSelectedEndDate}
      divisionFilters={divisionFilters} setDivisionFilters={setDivisionFilters}
      sports={['Basketball', 'Volleyball']} sportsLoading={false} sportsError={null}
      defaultMaxDistance={50} kmBetween={() => 0} events={events} totalEvents={37}
      isLoadingInitial={false} isLoadingMore={false} hasMoreEvents={false}
      sentinelRef={createRef<HTMLDivElement>()} eventsError={null}
      onEventClick={jest.fn()} onCreateEvent={jest.fn()} {...overrides}
    />
  );
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
  const earlier = buildEvent({ $id: 'earlier', name: 'Earlier event', eventType: 'EVENT', start: '2099-09-10T18:00:00Z' });
  render(<Harness events={[weekly, earlier]} selectedEventTypes={['EVENT', 'WEEKLY_EVENT']} defaultSort="soonest" />);
  expect(cardNames()).toEqual(['Earlier event', 'Weekly season']);
});

it('opens More filters as a dropdown with remaining filter controls', async () => {
  const user = userEvent.setup();
  render(<Harness selectedSports={['Basketball']} />);

  await user.click(screen.getByRole('button', { name: 'More filters (1)' }));

  const filterDialog = screen.getByRole('dialog', { name: 'More filters (1)' });
  expect(within(filterDialog).getByRole('button', { name: /Event tags/ })).toBeInTheDocument();
  await user.click(within(filterDialog).getByRole('button', { name: /Event tags/ }));
  expect(screen.getByRole('dialog', { name: 'Event tags filter' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Filter Events' })).not.toBeInTheDocument();
});

it('opens More sports as a dropdown with remaining sports', async () => {
  const user = userEvent.setup();
  render(<Harness sports={['Basketball', 'Volleyball', 'Rugby', 'Tennis']} />);

  await user.click(screen.getByRole('button', { name: 'More sports' }));

  const sportsDialog = screen.getByRole('dialog', { name: 'More sports' });
  expect(within(sportsDialog).getByRole('button', { name: 'Rugby', exact: true })).toBeInTheDocument();
  expect(within(sportsDialog).getByRole('button', { name: 'Tennis', exact: true })).toBeInTheDocument();
});

it('shows every event filter trigger when the toolbar has room', () => {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 2000 });
  try {
    render(<Harness />);
    ['Dates', 'Price', /^Distance/, 'Event type', 'Event tags', 'Gender', 'Age group', 'Skill level'].forEach((name) => {
      expect(screen.getByRole('button', { name, exact: typeof name === 'string' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'More filters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More sports' })).not.toBeInTheDocument();
  } finally {
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor);
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
    }
  }
});
it('keeps the event type all option mapped to every event type', async () => {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 2000 });
  try {
    const user = userEvent.setup();
    render(<Harness eventTypeOptions={['EVENT', 'TOURNAMENT']} />);

    await user.click(screen.getByRole('button', { name: /^Event type/ }));
    const eventTypeDialog = screen.getByRole('dialog', { name: 'Event type filter' });
    const allOption = within(eventTypeDialog).getByRole('button', { name: /All event types/ });
    expect(allOption).not.toHaveAttribute('aria-pressed', 'true');
    await user.click(within(eventTypeDialog).getByRole('button', { name: 'Event', exact: true }));
    await user.click(within(eventTypeDialog).getByRole('button', { name: 'Tournament', exact: true }));
    expect(screen.getByRole('button', { name: 'Event type: Tournament', exact: true })).toBeInTheDocument();

    await user.click(within(eventTypeDialog).getByRole('button', { name: /All event types/ }));
    expect(screen.getByRole('button', { name: 'Event type', exact: true })).toBeInTheDocument();
    expect(within(eventTypeDialog).getByRole('button', { name: /All event types/ })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor);
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth;
    }
  }
});
it('reserves the More control gap when fitting the first filter', () => {
  expect(calculateVisibleFilterCount([100, 100], 150, 8, 50, 0)).toBe(0);
});


it('opens the shared date filter popover from the desktop filter row', async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole('button', { name: 'Dates', exact: true }));

  expect(screen.getByRole('button', { name: 'Dates', exact: true })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Filter by start date', exact: true })).toBeInTheDocument();
  const dateDialog = screen.getByRole('dialog', { name: 'Dates filter' });
  expect(dateDialog.closest('.discover-filter-row')).toBeNull();
});
it('clears unavailable skill selections when sports change', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      genders: [],
      ages: [],
      sportSkills: [
        {
          sportId: 'basketball',
          sportName: 'Basketball',
          skills: [{ id: 'basketball-beginner', name: 'Beginner' }],
        },
        {
          sportId: 'volleyball',
          sportName: 'Volleyball',
          skills: [{ id: 'volleyball-beginner', name: 'Beginner' }],
        },
      ],
    }),
  });
  const user = userEvent.setup();
  render(<Harness initialDivisionFilters={{
    genders: [],
    skillDivisionTypeIds: ['volleyball-beginner'],
    ageDivisionTypeIds: [],
    priceMinDollars: null,
    priceMaxDollars: null,
  }} />);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Division filters', exact: true })).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Basketball', exact: true }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Division filters', exact: true })).not.toBeInTheDocument());
});

it('returns focus to Dates when its date controls close with Escape', async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const datesButton = screen.getByRole('button', { name: 'Dates', exact: true });
  await user.click(datesButton);
  const startDateButton = screen.getByRole('button', { name: 'Filter by start date', exact: true });
  await user.click(startDateButton);
  await user.keyboard('{Escape}');

  await waitFor(() => expect(datesButton).toHaveFocus());
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
    createEventHelperText="Create a field for this organization before creating an event." />);
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
  render(<Harness onFilterChange={onFilterChange} onEventClick={onEventClick} />);
  expect(screen.getByText('37 events available.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Basketball', exact: true }));
  expect(cardNames()).toEqual(['Basketball late', 'Basketball middle']);
  expect(screen.getByText('2 events available.').parentElement).toContainElement(
    screen.getByLabelText('Active event filters'),
  );
  await user.type(screen.getByRole('textbox', { name: 'Search events', exact: true }), 'middle');
  expect(cardNames()).toEqual(['Basketball middle']);
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(onFilterChange).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Basketball middle' }));
  expect(onEventClick).toHaveBeenCalledWith(events[2]);
  expect(trackEventClicked).toHaveBeenCalledWith(events[2], 'discover_events');
  await user.click(screen.getByRole('button', { name: 'Search: middle' }));
  expect(cardNames()).toHaveLength(2);
});

it.each(['Soonest', 'Price (Low to High)'])('sorts cached cards by %s without fetching', async (label) => {
  const user = userEvent.setup();
  const onFilterChange = jest.fn();
  render(<Harness onFilterChange={onFilterChange} />);
  await user.click(screen.getByRole('combobox', { name: 'Sort events' }));
  await user.click(screen.getByRole('option', { name: label }));
  expect(cardNames()).toEqual(['Volleyball early', 'Basketball middle', 'Basketball late']);
  expect(onFilterChange).not.toHaveBeenCalled();
});

it('delegates a controlled sort and waits for the caller value', async () => {
  const user = userEvent.setup();
  const onEventSortChange = jest.fn<void, [EventSortValue]>();
  const view = render(<Harness eventSort="recommended" onEventSortChange={onEventSortChange} />);
  await user.click(screen.getByRole('combobox', { name: 'Sort events' }));
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
  render(<Harness hasMoreEvents onFilterChange={onFilterChange} />);
  const input = screen.getByRole('textbox', { name: 'Search events', exact: true });
  await user.type(input, 'Basketball');
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(onFilterChange).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Updating events…')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Search events', exact: true })).toBe(input);
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
  const view = render(<Harness isLoadingInitial events={[]} />);
  const input = screen.getByRole('textbox', { name: 'Search events', exact: true });
  await user.type(input, 'middle');
  expect(cardNames()).toHaveLength(0);
  view.rerender(<Harness isLoadingInitial={false} />);
  await waitFor(() => expect(cardNames()).toEqual(['Basketball middle']));
  expect(screen.getByRole('textbox', { name: 'Search events', exact: true })).toBe(input);
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(cardNames()).toHaveLength(3);
});
