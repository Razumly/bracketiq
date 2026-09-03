import { createRef, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationEventsTabContent from '../OrganizationEventsTabContent';

jest.mock('@/components/ui/EventCard', () => ({
  __esModule: true,
  default: () => <div data-testid="event-card" />,
}));

jest.mock('@/components/ui/ResponsiveCardGrid', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const baseProps = {
  organizationName: 'Austin Hoops',
  location: null,
  searchTerm: '',
  setSearchTerm: jest.fn(),
  selectedEventTypes: ['EVENT', 'TOURNAMENT'],
  setSelectedEventTypes: jest.fn(),
  eventTypeOptions: ['EVENT', 'TOURNAMENT'] as const,
  selectedSports: [],
  setSelectedSports: jest.fn(),
  maxDistance: null,
  setMaxDistance: jest.fn(),
  selectedStartDate: null,
  setSelectedStartDate: jest.fn(),
  selectedEndDate: null,
  setSelectedEndDate: jest.fn(),
  sports: [],
  sportsLoading: false,
  sportsError: null,
  defaultMaxDistance: 50,
  kmBetween: jest.fn(() => 0),
  events: [],
  totalEvents: 0,
  isLoadingInitial: false,
  isLoadingMore: false,
  hasMoreEvents: false,
  sentinelRef: createRef<HTMLDivElement>(),
  eventsError: null,
  onEventClick: jest.fn(),
  onCreateEvent: jest.fn(),
};

describe('OrganizationEventsTabContent', () => {
  it('starts event creation when the organization owner selects New event', async () => {
    const user = userEvent.setup();
    const onCreateEvent = jest.fn();

    render(<OrganizationEventsTabContent {...baseProps} onCreateEvent={onCreateEvent} />);

    await user.click(screen.getByRole('button', { name: 'New event' }));

    expect(onCreateEvent).toHaveBeenCalledTimes(1);
  });

  it('clears the active filters from the mobile filter panel', async () => {
    const user = userEvent.setup();
    const setSearchTerm = jest.fn();

    render(
      <OrganizationEventsTabContent
        {...baseProps}
        searchTerm="basketball"
        setSearchTerm={setSearchTerm}
        selectedEventTypes={['EVENT']}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getAllByRole('button', { name: 'Clear all filters' })[0]);

    expect(setSearchTerm).toHaveBeenCalledWith('');
  });

  it('offers retry for a recoverable event loading error', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    render(<OrganizationEventsTabContent {...baseProps} eventsError="Request failed" onRetry={onRetry} />);

    expect(screen.getByRole('heading', { name: 'Events could not load' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
