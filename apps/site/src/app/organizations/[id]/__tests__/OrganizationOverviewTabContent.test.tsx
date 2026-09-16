import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OrganizationOverviewTabContent from '../OrganizationOverviewTabContent';
import type { Event, Organization, Team } from '@/types';

const organization = {
  $id: 'org_1',
  name: 'Austin Hoops',
  description: 'A youth sports organization for basketball and volleyball.',
  website: 'https://austinhoops.com',
  location: 'Austin, TX',
  sports: ['Basketball', 'Volleyball'],
} as Organization;

const event = {
  $id: 'event_1',
  name: 'Fall Tip-Off Classic',
  description: 'A fall basketball tournament.',
  start: '2026-09-19T09:00:00.000Z',
  end: '2026-09-20T17:00:00.000Z',
  location: 'Austin Sports Center',
  coordinates: [0, 0],
  price: 0,
  imageId: null,
  hostId: null,
  state: 'PUBLISHED',
  status: 'published',
  maxParticipants: 128,
  teamSizeLimit: 12,
  teamSignup: true,
  singleDivision: false,
  waitListIds: [],
  freeAgentIds: [],
  cancellationRefundHours: null,
  registrationCutoffHours: null,
  seedColor: 0,
  eventType: 'TOURNAMENT',
  sport: { name: 'Basketball' },
  sportIds: ['basketball'],
  divisions: [],
  attendees: 72,
  $createdAt: '2026-01-01T00:00:00.000Z',
  $updatedAt: '2026-01-01T00:00:00.000Z',
} as Event;

const team = {
  $id: 'team_1',
  name: 'Austin Hoops 14U Girls',
  division: '14U Girls Competitive',
  sport: 'Basketball',
  playerIds: ['player_1', 'player_2'],
  captainId: 'player_1',
  pending: [],
  teamSize: 12,
  currentSize: 11,
  isFull: false,
  avatarUrl: '',
} as Team;

describe('OrganizationOverviewTabContent', () => {
  it('renders the generated overview structure and keeps the main actions connected', async () => {
    const user = userEvent.setup();
    const onEventClick = jest.fn();
    const onViewEvents = jest.fn();
    const onViewTeams = jest.fn();
    const onViewReviews = jest.fn();

    render(
      <OrganizationOverviewTabContent
        organization={organization}
        events={[event]}
        teams={[team]}
        staffCount={18}
        officialCount={24}
        canViewEvents
        canViewTeams
        onViewEvents={onViewEvents}
        onViewTeams={onViewTeams}
        onViewReviews={onViewReviews}
        onEventClick={onEventClick}
        reviewContent={<div>Review summary</div>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'About Austin Hoops' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upcoming events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'At a glance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teams' })).toBeInTheDocument();
    expect(screen.getByText('Fall Tip-Off Classic')).toBeInTheDocument();
    expect(screen.getByText('Austin Hoops 14U Girls')).toBeInTheDocument();
    expect(screen.getAllByText('18')).toHaveLength(2);
    expect(screen.getByText('24')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open Fall Tip-Off Classic' }));
    await user.click(screen.getByRole('button', { name: 'View all events' }));
    await user.click(screen.getByRole('button', { name: 'View all teams' }));
    await user.click(screen.getByRole('button', { name: 'View all reviews' }));

    expect(onEventClick).toHaveBeenCalledWith(event);
    expect(onViewEvents).toHaveBeenCalledTimes(1);
    expect(onViewTeams).toHaveBeenCalledTimes(1);
    expect(onViewReviews).toHaveBeenCalledTimes(1);
  });
});
