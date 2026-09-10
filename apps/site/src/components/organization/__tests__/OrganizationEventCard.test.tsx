import { screen } from '@testing-library/react';

import OrganizationEventCard from '../OrganizationEventCard';
import { type Event } from '@/types';
import { renderWithMantine } from '../../../../test/utils/renderWithMantine';

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => <span data-testid="mock-image" />,
}));

const createEvent = (overrides: Partial<Event> = {}): Event => ({
  $id: 'event_1',
  name: 'Team Play Thursdays',
  description: 'Open gym.',
  start: '2025-06-01T18:00:00.000Z',
  end: '2025-06-01T20:00:00.000Z',
  location: 'Beaverton Hoop YMCA',
  coordinates: [-122.7901, 45.4842],
  price: 1300,
  imageId: null,
  hostId: null,
  state: 'PUBLISHED',
  maxParticipants: 42,
  teamSizeLimit: 0,
  teamSignup: false,
  singleDivision: true,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: null,
  registrationCutoffHours: null,
  seedColor: 0,
  $createdAt: '2025-06-01T00:00:00.000Z',
  $updatedAt: '2025-06-01T00:00:00.000Z',
  eventType: 'EVENT',
  sport: {
    $id: 'sport_volleyball',
    name: 'Indoor Volleyball',
    description: '',
    icon: '',
    defaultDivisions: [],
    defaultRules: [],
    defaultMatchSettings: {},
  },
  sportIds: ['sport_volleyball'],
  divisions: [],
  attendees: 0,
  ...overrides,
} as Event);

describe('OrganizationEventCard schedule display', () => {
  it('uses the next occurrence date, time zone, and status when available', () => {
    renderWithMantine(
      <OrganizationEventCard
        event={createEvent({
          statusText: 'Review-ready Summer 2026 adult basketball league card with source-supported registration details.',
          nextOccurrence: {
            slotId: 'slot-weekly',
            occurrenceDate: '2099-07-16',
            start: '2099-07-16T01:00:00.000Z',
            end: '2099-07-16T03:00:00.000Z',
            timeZone: 'America/Los_Angeles',
          },
        })}
        onClick={jest.fn()}
      />,
    );

    expect(screen.getByText('Jul 15, 2099')).toBeInTheDocument();
    expect(screen.getByText('6:00 PM – 8:00 PM')).toBeInTheDocument();
    expect(screen.getByText(/Review-ready Summer 2026/i)).toBeInTheDocument();
  });
  it('does not invent a clock time for date-only events', () => {
    renderWithMantine(
      <OrganizationEventCard
        event={createEvent({
          dateDisplayMode: 'DATE_ONLY',
          dateDisplayText: 'Jul 16, 2099',
          start: '2099-07-16T01:00:00.000Z',
          end: null,
          timeZone: 'America/Los_Angeles',
          statusText: 'Open',
        })}
        onClick={jest.fn()}
      />,
    );

    expect(screen.getByText('Jul 16, 2099')).toBeInTheDocument();
    expect(screen.queryByText(/\b\d{1,2}:\d{2}\s(?:AM|PM)\b/)).not.toBeInTheDocument();
  });
});
